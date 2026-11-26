import type { ServerEnv } from '../env';
import { ADAPTERS, AdapterUnavailableError, type AdapterContext } from '../adapters';
import { extractOpportunities } from '../extraction';
import { fetchPublicPage, RequestBudget } from '../http';
import { prefilter, expandQuery } from '../keywords';
import { formatOpportunity, sendMessage, type NotifiableOpportunity } from '../providers/telegram';
import { checkEligibility, scoreOpportunity } from '../scoring';
import { contentHash, extractPublishedDate, extractTitle, htmlToText, sha256Hex, similarity, titleKey } from '../text';
import { DEFAULT_PROFILE, tierOf, type CollectedItem, type ExtractedOpportunity, type UserProfile } from '../types';
import { canonicalizeUrl, isSafePublicUrl, registrableDomain } from '../url';
import { verifyOpportunity } from '../verification';
import { Repo, type Job } from './repo';

/**
 * Pipeline:
 *   collect (adapter) → normalize → keyword prefilter → dedupe (url/hash) → [job: analyze]
 *   analyze: fetch source → Gemini extraction → deterministic verification → eligibility → score → upsert → [job: notify]
 *   notify: dedupe by notification key → quiet hours → Telegram
 * Every stage is an idempotent job; one failing source never stops the others.
 */

export interface PipelineDeps { env: ServerEnv; repo: Repo; budget: RequestBudget; profile?: UserProfile; workerId: string; log?: (msg: string) => void }

const MAX_STORED_CONTENT = 30_000;

export function adapterContext(d: PipelineDeps): AdapterContext {
  const { env, repo } = d;
  const limits: Record<string, number> = { tavily: env.BUDGET_TAVILY_DAILY, gemini: env.BUDGET_GEMINI_DAILY, firecrawl: env.BUDGET_FIRECRAWL_DAILY };
  return {
    budget: d.budget,
    secrets: { tavily: env.TAVILY_API_KEY, github: env.GITHUB_TOKEN },
    cache: { get: (k) => repo.cacheGet(k), set: (k, v) => repo.cacheSet(k, k.split(':')[0]!, v, env.SEARCH_CACHE_HOURS) },
    allow: async (provider, units = 1) => limits[provider] === undefined || (await repo.usageToday(provider)) + units <= limits[provider]!,
    record: (p, ok, units, err) => repo.recordUsage(p, ok, units, err),
  };
}

// ---------------------------------------------------------------------------
// Stage 1: collect from one source
// ---------------------------------------------------------------------------
export interface CollectStats { fetched: number; newItems: number; changed: number; filteredOut: number; queued: number; note?: string }

export async function ingestItems(d: PipelineDeps, items: CollectedItem[], sourceId: string | null): Promise<CollectStats> {
  const stats: CollectStats = { fetched: items.length, newItems: 0, changed: 0, filteredOut: 0, queued: 0 };
  const seen = new Set<string>();
  for (const item of items) {
    if (!isSafePublicUrl(item.url)) continue;
    const canonical = canonicalizeUrl(item.url);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const body = (item.content ?? '').slice(0, MAX_STORED_CONTENT);
    const hash = await contentHash(`${item.title}\n${body || item.snippet}`);
    const pf = prefilter(`${item.title}\n${item.snippet}\n${body.slice(0, 4000)}`);

    const existing = await d.repo.db.from('announcements').select('id, content_hash, analysis_state').eq('canonical_url', canonical).maybeSingle();
    let announcementId: string;
    if (existing.data) {
      announcementId = existing.data.id;
      await d.repo.db.from('announcements').update({ last_seen_at: new Date().toISOString() }).eq('id', announcementId);
      if (existing.data.content_hash === hash) continue; // unchanged → nothing to do
      stats.changed++;
      await d.repo.db.from('announcements').update({ content_hash: hash, analysis_state: pf.pass ? 'pending' : 'filtered_out' }).eq('id', announcementId);
    } else {
      // Same content under a different URL (syndication) → skip
      const dup = await d.repo.db.from('announcements').select('id').eq('content_hash', hash).limit(1);
      if (dup.data?.length) continue;
      const ins = await d.repo.db.from('announcements').insert({
        source_id: sourceId, canonical_url: canonical, title: item.title.slice(0, 500), published_at: item.publishedAt ?? null,
        content_hash: hash, excerpt: item.snippet.slice(0, 1000), analysis_state: pf.pass ? 'pending' : 'filtered_out',
      }).select('id').single();
      if (ins.error) { if (ins.error.code === '23505') continue; throw new Error(`insert announcement: ${ins.error.message}`); }
      announcementId = ins.data.id;
      stats.newItems++;
    }
    if (body) await d.repo.db.from('announcement_versions').upsert({ announcement_id: announcementId, content_hash: hash, content: body }, { onConflict: 'announcement_id,content_hash', ignoreDuplicates: true });
    if (!pf.pass) { stats.filteredOut++; continue; }
    if (await d.repo.enqueue('analyze', { announcementId, url: item.url, title: item.title, publishedAt: item.publishedAt ?? null, hash }, `analyze:${announcementId}:${hash}`, 60 + pf.score)) stats.queued++;
  }
  return stats;
}

export async function collectSource(d: PipelineDeps, source: { id: string; adapter_id: string; name: string; config: Record<string, unknown>; cursor: unknown }): Promise<CollectStats> {
  const adapter = ADAPTERS[source.adapter_id];
  if (!adapter) throw new AdapterUnavailableError(`No adapter implemented for ${source.adapter_id}`);
  const config = { ...source.config };
  if (adapter.id === 'tavily' && config.mode === 'rotate') config.queries = await pickQueries(d, String(config.tier ?? 'tier1'), Number(config.queriesPerRun ?? 1));
  const started = Date.now();
  try {
    const res = await adapter.fetch(config, adapterContext(d), source.cursor);
    const stats = await ingestItems(d, res.items, source.id);
    stats.note = res.note;
    await d.repo.db.from('source_health').insert({ source_id: source.id, adapter_id: source.adapter_id, ok: true, items_fetched: res.items.length, duration_ms: Date.now() - started });
    await d.repo.db.from('sources').update({ last_success_at: new Date().toISOString(), last_error: null, consecutive_failures: 0, cursor: res.cursor ?? source.cursor ?? null }).eq('id', source.id);
    return stats;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await d.repo.db.from('source_health').insert({ source_id: source.id, adapter_id: source.adapter_id, ok: false, duration_ms: Date.now() - started, error: msg.slice(0, 1000) });
    const status = e instanceof AdapterUnavailableError ? 'unconfigured' : undefined;
    const cur = await d.repo.db.from('sources').select('consecutive_failures, scan_interval_minutes').eq('id', source.id).single();
    const fails = (cur.data?.consecutive_failures ?? 0) + 1;
    // Adaptive backoff for failing sources: interval × 2^fails, max 24h.
    const backoffMin = Math.min(1440, (cur.data?.scan_interval_minutes ?? 30) * 2 ** Math.min(fails, 6));
    await d.repo.db.from('sources').update({ last_error: msg.slice(0, 1000), consecutive_failures: fails, next_scan_at: new Date(Date.now() + backoffMin * 60_000).toISOString(), ...(status ? { status } : {}) }).eq('id', source.id);
    throw e;
  }
}

async function pickQueries(d: PipelineDeps, tier: string, n: number): Promise<string[]> {
  const r = await d.repo.db.from('search_queries').select('id, query').eq('tier', tier).eq('enabled', true).order('last_run_at', { ascending: true, nullsFirst: true }).limit(n);
  const rows = r.data ?? [];
  if (rows.length) await d.repo.db.from('search_queries').update({ last_run_at: new Date().toISOString() }).in('id', rows.map((x) => x.id));
  return rows.map((x) => expandQuery(x.query));
}

// ---------------------------------------------------------------------------
// Stage 2: analyze an announcement
// ---------------------------------------------------------------------------
export interface AnalyzeResult { status: 'irrelevant' | 'stored' | 'skipped_budget'; opportunities: Array<{ id: string; isNew: boolean; score: number; notify: boolean }>; tokens: number }

export async function analyzeAnnouncement(d: PipelineDeps, p: { announcementId: string; url: string; title: string; publishedAt: string | null; hash: string }): Promise<AnalyzeResult> {
  const { env, repo } = d;
  if ((await repo.usageToday('gemini')) >= env.BUDGET_GEMINI_DAILY) return { status: 'skipped_budget', opportunities: [], tokens: 0 };

  // Retrieve full text: stored content first, otherwise fetch the original page.
  const v = await repo.db.from('announcement_versions').select('content').eq('announcement_id', p.announcementId).eq('content_hash', p.hash).maybeSingle();
  let text = v.data?.content ?? '';
  let finalUrl = p.url, title = p.title, publishedAt = p.publishedAt;
  if (text.length < 600) {
    try {
      const page = await fetchPublicPage(p.url, { budget: d.budget });
      finalUrl = page.finalUrl;
      title = extractTitle(page.html) ?? title;
      publishedAt = publishedAt ?? extractPublishedDate(page.html);
      text = htmlToText(page.html).slice(0, MAX_STORED_CONTENT);
    } catch (e) {
      if (!text) throw e;
    }
  }

  let ext;
  try {
    ext = await extractOpportunities({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, budget: d.budget }, { url: finalUrl, title, publishedAt, text }, env.BUDGET_GEMINI_MAX_INPUT_CHARS);
    await repo.recordUsage('gemini', true, 1);
  } catch (e) {
    await repo.recordUsage('gemini', false, 1, String(e));
    throw e;
  }
  await repo.log('analysis', 'extract', `${ext.opportunities.length} opportunities from ${finalUrl}`, { relevant: ext.relevant, reason: ext.reason, rejected: ext.rejected, tokens: ext.tokens });

  if (!ext.relevant) {
    await repo.db.from('announcements').update({ analysis_state: 'filtered_out' }).eq('id', p.announcementId);
    return { status: 'irrelevant', opportunities: [], tokens: ext.tokens };
  }

  const out: AnalyzeResult['opportunities'] = [];
  for (const x of ext.opportunities) {
    const projectId = x.project_name ? await upsertProject(repo, x, ext.projectStage) : null;
    const knownDomain = projectId ? (await repo.db.from('projects').select('website_domain').eq('id', projectId).single()).data?.website_domain : null;
    const ver = verifyOpportunity({ sourceUrl: finalUrl, sourceText: text, extracted: x, knownProjectDomain: knownDomain });
    const sc = scoreOpportunity({ extracted: x, rewardStatus: ver.rewardStatus, verification: ver.status, confidence: ver.confidence, profile: d.profile ?? DEFAULT_PROFILE });
    const stored = await upsertOpportunity(repo, { x, ver, sc, projectId, announcementId: p.announcementId, sourceUrl: finalUrl, publishedAt });
    out.push({ id: stored.id, isNew: stored.isNew, score: sc.score, notify: sc.notifyEligible });
    if (stored.isNew && sc.notifyEligible) await repo.enqueue('notify', { opportunityId: stored.id }, `notify:${stored.id}`, 80);
  }
  await repo.db.from('announcements').update({ analysis_state: 'analyzed' }).eq('id', p.announcementId);
  return { status: 'stored', opportunities: out, tokens: ext.tokens };
}

async function upsertProject(repo: Repo, x: ExtractedOpportunity, stage: string): Promise<string | null> {
  const name = x.project_name!.trim().slice(0, 120);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return null;
  const website = x.project_website ? (x.project_website.startsWith('http') ? x.project_website : `https://${x.project_website}`) : null;
  const existing = await repo.db.from('projects').select('id, website, stage').eq('slug', slug).maybeSingle();
  if (existing.data) {
    const patch: Record<string, unknown> = { last_monitored_at: new Date().toISOString() };
    if (!existing.data.website && website) { patch.website = website; patch.website_domain = registrableDomain(website); }
    if (existing.data.stage === 'unknown' && stage !== 'unknown') patch.stage = stage;
    await repo.db.from('projects').update(patch).eq('id', existing.data.id);
    return existing.data.id;
  }
  const ins = await repo.db.from('projects').insert({ slug, name, website, website_domain: website ? registrableDomain(website) : null, stage, last_monitored_at: new Date().toISOString() }).select('id').single();
  if (ins.error) return (await repo.db.from('projects').select('id').eq('slug', slug).single()).data?.id ?? null;
  return ins.data.id;
}

export async function opportunityDedupeKey(canonicalUrl: string, title: string): Promise<string> {
  return sha256Hex(`${canonicalUrl}|${titleKey(title)}`);
}

async function upsertOpportunity(repo: Repo, a: {
  x: ExtractedOpportunity; ver: ReturnType<typeof verifyOpportunity>; sc: ReturnType<typeof scoreOpportunity>;
  projectId: string | null; announcementId: string; sourceUrl: string; publishedAt: string | null;
}): Promise<{ id: string; isNew: boolean }> {
  const { x, ver, sc } = a;
  const canonical = canonicalizeUrl(a.sourceUrl);
  const dedupeKey = await opportunityDedupeKey(canonical, x.title);
  const hash = await contentHash(JSON.stringify([x.title, x.reward_amount, x.reward_currency, x.deadline_at, x.description]));

  // Near-duplicate: same project, similar title, recently discovered (e.g. the same campaign reported by several sites).
  let existingId: string | null = (await repo.db.from('opportunities').select('id').eq('dedupe_key', dedupeKey).maybeSingle()).data?.id ?? null;
  if (!existingId && a.projectId) {
    const recent = await repo.db.from('opportunities').select('id, title, description').eq('project_id', a.projectId).gte('discovered_at', new Date(Date.now() - 60 * 86400_000).toISOString()).limit(25);
    const hit = recent.data?.find((o) => similarity(o.title, x.title) >= 0.5 || similarity(`${o.title} ${o.description ?? ''}`, `${x.title} ${x.description}`) >= 0.6);
    if (hit) existingId = hit.id;
  }

  const row = {
    project_id: a.projectId, announcement_id: a.announcementId, title: x.title, project_name: x.project_name, category: x.category, tier: tierOf(x.category),
    description: x.description || null, reward_amount: x.reward_amount, reward_amount_max: x.reward_amount_max, reward_currency: x.reward_currency,
    reward_conditions: x.reward_conditions, reward_status: ver.rewardStatus, capital: x.capital, capital_notes: x.capital_evidence_excerpt,
    estimated_minutes: x.estimated_minutes, required_skills: x.required_skills, instructions: x.instructions, application_url: x.application_url,
    source_url: a.sourceUrl, canonical_url: canonical, announced_at: x.announced_at ?? a.publishedAt, registration_opens_at: x.registration_opens_at,
    deadline_at: x.deadline_at, geo_restrictions: x.geo_restrictions, geo_allowed: x.geo_allowed, kyc_required: x.kyc_required, networks: x.networks,
    difficulty: x.difficulty, missing_fields: x.missing_fields, verification: ver.status, verification_confidence: ver.confidence,
    risk_flags: ver.riskFlags, score: sc.score, score_breakdown: { factors: sc.factors, capped: sc.capped, eligibility: sc.eligibility, priority: sc.priority },
    content_hash: hash, is_active: ver.status !== 'expired', last_verified_at: new Date().toISOString(),
  };

  let id: string, isNew: boolean;
  if (existingId) {
    const prev = await repo.db.from('opportunities').select('content_hash').eq('id', existingId).single();
    if (prev.data?.content_hash === hash) {
      await repo.db.from('opportunities').update({ last_verified_at: row.last_verified_at }).eq('id', existingId);
      return { id: existingId, isNew: false };
    }
    const u = await repo.db.from('opportunities').update(row).eq('id', existingId);
    if (u.error) throw new Error(`update opportunity: ${u.error.message}`);
    id = existingId; isNew = false;
  } else {
    const ins = await repo.db.from('opportunities').insert({ ...row, dedupe_key: dedupeKey }).select('id').single();
    if (ins.error) {
      if (ins.error.code === '23505') return { id: (await repo.db.from('opportunities').select('id').eq('dedupe_key', dedupeKey).single()).data!.id, isNew: false };
      throw new Error(`insert opportunity: ${ins.error.message}`);
    }
    id = ins.data.id; isNew = true;
  }

  await repo.db.from('opportunity_verifications').insert({ opportunity_id: id, status: ver.status, confidence: ver.confidence, checks: ver.checks, risk_flags: ver.riskFlags });
  await repo.db.from('opportunity_scores').delete().eq('opportunity_id', id).is('user_id', null);
  await repo.db.from('opportunity_scores').insert({ opportunity_id: id, user_id: null, score: sc.score, breakdown: row.score_breakdown });
  if (ver.confirmedEvidence.length) {
    await repo.db.from('opportunity_evidence').delete().eq('opportunity_id', id);
    await repo.db.from('opportunity_evidence').insert(ver.confirmedEvidence.map((e) => ({ opportunity_id: id, kind: e.kind, excerpt: e.excerpt.slice(0, 1000), source_url: a.sourceUrl })));
  }
  const rewardEx = ver.confirmedEvidence.find((e) => e.kind === 'reward');
  await repo.db.from('reward_evidence').insert({ opportunity_id: id, classification: ver.rewardStatus, excerpt: rewardEx?.excerpt ?? null, source_url: a.sourceUrl,
    is_official_source: ver.checks.some((c) => c.name === 'official_source' && c.passed === true) });
  return { id, isNew };
}

// ---------------------------------------------------------------------------
// Stage 3: notify
// ---------------------------------------------------------------------------
export function inQuietHours(now: Date, tz: string, start = '22:00', end = '07:00'): boolean {
  const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(now);
  return start < end ? hm >= start && hm < end : hm >= start || hm < end;
}

export async function notifyOpportunity(d: PipelineDeps, opportunityId: string, opts: { ignoreQuietHours?: boolean } = {}): Promise<{ sent: number; suppressed: number; deferredUntil?: Date }> {
  const { env, repo } = d;
  if (!env.TELEGRAM_BOT_TOKEN) return { sent: 0, suppressed: 1 };
  const o = (await repo.db.from('opportunities').select('*').eq('id', opportunityId).single()).data;
  if (!o) return { sent: 0, suppressed: 1 };
  // Re-check at send time: never alert on suspicious / expired / ineligible.
  if (['suspicious', 'expired'].includes(o.verification) || !o.is_active || (o.score ?? 0) < 65 || o.score_breakdown?.capped) return { sent: 0, suppressed: 1 };

  if (!opts.ignoreQuietHours && inQuietHours(new Date(), env.DEFAULT_TIMEZONE)) {
    const next = new Date(Date.now() + 60 * 60_000);
    return { sent: 0, suppressed: 0, deferredUntil: next };
  }

  const recipients = new Set<string>();
  if (env.TELEGRAM_CHAT_ID) recipients.add(env.TELEGRAM_CHAT_ID);
  const linked = await repo.db.from('telegram_accounts').select('chat_id, user_id').not('chat_id', 'is', null);
  for (const a of linked.data ?? []) {
    const pref = (await repo.db.from('notification_preferences').select('telegram_enabled, min_score, categories').eq('user_id', a.user_id).maybeSingle()).data;
    if (pref && (!pref.telegram_enabled || (o.score ?? 0) < pref.min_score || (pref.categories?.length && !pref.categories.includes(o.category)))) continue;
    recipients.add(String(a.chat_id));
  }

  const elig = checkEligibility({ geo_restrictions: o.geo_restrictions, geo_allowed: o.geo_allowed, kyc_required: o.kyc_required }, d.profile ?? DEFAULT_PROFILE);
  const n: NotifiableOpportunity = { ...o, reward_amount: o.reward_amount === null ? null : Number(o.reward_amount), reward_amount_max: o.reward_amount_max === null ? null : Number(o.reward_amount_max),
    geo_summary: elig.status === 'eligible' ? `Eligible (${elig.reason})` : elig.status === 'unknown' ? 'Not stated — check terms' : `Not eligible: ${elig.reason}` };
  const { html, keyboard } = formatOpportunity(n, env.APP_URL);

  let sent = 0, suppressed = 0;
  for (const chat of recipients) {
    const key = `opp:${opportunityId}:${chat}`;
    // Claim the notification row first; the unique key makes duplicates impossible.
    const claim = await repo.db.from('notifications').insert({ chat_id: chat, opportunity_id: opportunityId, kind: 'new_opportunity', dedupe_key: key, status: 'pending' }).select('id').single();
    if (claim.error) { suppressed++; continue; }
    try {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, chat, html, keyboard, d.budget);
      await repo.db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', claim.data.id);
      sent++;
    } catch (e) {
      // Release the claim so a retry can send it.
      await repo.db.from('notifications').delete().eq('id', claim.data.id);
      throw e;
    }
  }
  return { sent, suppressed };
}

// ---------------------------------------------------------------------------
// Tick: schedule due sources and drain jobs within the request budget
// ---------------------------------------------------------------------------
export interface TickStats { sourcesScanned: number; jobsRun: number; jobsFailed: number; errors: string[]; requestsUsed: number }

export async function runTick(d: PipelineDeps, opts: { maxSources?: number; maxJobs?: number; kinds?: string[]; minRemainingRequests?: number } = {}): Promise<TickStats> {
  const stats: TickStats = { sourcesScanned: 0, jobsRun: 0, jobsFailed: 0, errors: [], requestsUsed: 0 };
  const { repo } = d;

  // 1. Enqueue due sources as collect jobs (idempotent per scheduled slot).
  const due = await repo.db.from('sources').select('id, scan_interval_minutes, next_scan_at').eq('status', 'active').lte('next_scan_at', new Date().toISOString()).order('priority', { ascending: false }).limit(opts.maxSources ?? 3);
  for (const s of due.data ?? []) {
    await repo.enqueue('collect', { sourceId: s.id }, `collect:${s.id}:${s.next_scan_at}`, 50);
    await repo.db.from('sources').update({ next_scan_at: new Date(Date.now() + s.scan_interval_minutes * 60_000).toISOString() }).eq('id', s.id);
  }

  // 2. Drain jobs while request budget remains (each job needs a few requests).
  const maxJobs = opts.maxJobs ?? d.env.PIPELINE_MAX_ITEMS_PER_RUN;
  const minRemaining = opts.minRemainingRequests ?? 12;
  // Fairness: the first slot of each tick goes to a pending collect job, so a steady stream of
  // higher-priority analyze jobs can never starve source collection.
  let collectFirst = maxJobs > 1 && (!opts.kinds || opts.kinds.includes('collect'));
  while (stats.jobsRun + stats.jobsFailed < maxJobs && d.budget.remaining > minRemaining) {
    let job: Job | undefined;
    if (collectFirst) {
      collectFirst = false;
      [job] = await repo.lease(d.workerId, 1, 120, ['collect']);
    }
    job ??= (await repo.lease(d.workerId, 1, 120, opts.kinds))[0];
    if (!job) break;
    try {
      await runJob(d, job);
      await repo.complete(job.id);
      stats.jobsRun++;
      if (job.kind === 'collect') stats.sourcesScanned++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.jobsFailed++;
      stats.errors.push(`${job.kind}: ${msg}`);
      await repo.fail(job.id, msg);
      await repo.log('orchestrator', job.kind, msg, { jobId: job.id }, 'error');
    }
  }
  stats.requestsUsed = d.budget.used;
  return stats;
}

export async function runJob(d: PipelineDeps, job: Job): Promise<void> {
  switch (job.kind) {
    case 'collect': {
      const s = (await d.repo.db.from('sources').select('id, adapter_id, name, config, cursor').eq('id', String(job.payload.sourceId)).single()).data;
      if (!s) return;
      const st = await collectSource(d, s);
      await d.repo.log('discovery', 'collect', `${s.name}: ${st.fetched} fetched, ${st.newItems} new, ${st.queued} queued`, st);
      return;
    }
    case 'analyze':
      await analyzeAnnouncement(d, job.payload as Parameters<typeof analyzeAnnouncement>[1]);
      return;
    case 'notify': {
      const r = await notifyOpportunity(d, String(job.payload.opportunityId));
      if (r.deferredUntil) await d.repo.enqueue('notify', job.payload, `notify:${job.payload.opportunityId}:${r.deferredUntil.toISOString().slice(0, 13)}`, 80, r.deferredUntil);
      return;
    }
    case 'reverify': {
      // Re-fetch the original source; if content changed, ingest queues a fresh analysis.
      const o = (await d.repo.db.from('opportunities').select('id, source_url, title, announcement_id').eq('id', String(job.payload.opportunityId)).single()).data;
      if (!o) return;
      const page = await fetchPublicPage(o.source_url, { budget: d.budget });
      const st = await ingestItems(d, [{ adapterId: 'reverify', url: o.source_url, title: extractTitle(page.html) ?? o.title, snippet: '', content: htmlToText(page.html) }], null);
      await d.repo.db.from('opportunities').update({ last_verified_at: new Date().toISOString() }).eq('id', o.id);
      await d.repo.log('verification', 'reverify', `${o.title}: ${st.changed ? 'source changed, re-analysis queued' : 'source unchanged'}`, { opportunityId: o.id });
      return;
    }
    case 'purge':
      await d.repo.db.rpc('purge_expired_data');
      return;
    default:
      throw new Error(`Unknown job kind ${job.kind}`);
  }
}
