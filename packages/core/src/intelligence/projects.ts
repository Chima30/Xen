import type { Repo } from '../pipeline/repo';
import { contentHash, escapeHtml, excerptAppearsIn } from '../text';
import { sendMessage, type InlineKeyboard } from '../providers/telegram';
import type { RequestBudget } from '../http';
import type { ServerEnv } from '../env';
import { amountAppearsAsMoney } from '../verification';
import { registrableDomain } from '../url';
import { diffVersions, summarizeDiff, type VersionDiff } from './diff';
import { SIGNAL_LABELS, updateTypeForSignal, type ExtractedProject, type ExtractedSignal, type SignalType } from './signals';

/** Project Intelligence agent: profiles, verified signals and watcher notifications. */

export function projectSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

const normWebsite = (w: string | null | undefined) => (w ? (w.startsWith('http') ? w : `https://${w}`) : null);

/**
 * Finds a project by slug or by official domain, or creates it. Empty profile fields are
 * filled from new information; existing facts are never overwritten by a later document.
 */
export async function upsertProjectProfile(repo: Repo, p: Partial<ExtractedProject> & { name: string }, stage = 'unknown'): Promise<string | null> {
  const name = p.name.trim().slice(0, 120);
  const slug = projectSlug(name);
  if (!slug) return null;
  const website = normWebsite(p.website);
  const domain = website ? registrableDomain(website) : null;
  const cols = 'id, website, description, category, ecosystems, stage';
  let existing = (await repo.db.from('projects').select(cols).eq('slug', slug).maybeSingle()).data;
  if (!existing && domain) existing = (await repo.db.from('projects').select(cols).eq('website_domain', domain).limit(1).maybeSingle()).data;
  const now = new Date().toISOString();
  if (existing) {
    const patch: Record<string, unknown> = { last_monitored_at: now };
    if (!existing.website && website) { patch.website = website; patch.website_domain = domain; }
    if (!existing.description && p.description) patch.description = p.description;
    if (!existing.category && p.category) patch.category = p.category.slice(0, 80);
    if ((!existing.ecosystems || existing.ecosystems.length === 0) && p.ecosystems?.length) patch.ecosystems = p.ecosystems;
    const st = p.stage && p.stage !== 'unknown' ? p.stage : stage;
    if (existing.stage === 'unknown' && st !== 'unknown') patch.stage = st;
    await repo.db.from('projects').update(patch).eq('id', existing.id);
    return existing.id;
  }
  const ins = await repo.db.from('projects').insert({
    slug, name, website, website_domain: domain, description: p.description ?? null, category: p.category?.slice(0, 80) ?? null,
    ecosystems: p.ecosystems ?? [], stage: p.stage && p.stage !== 'unknown' ? p.stage : stage, last_monitored_at: now,
  }).select('id').single();
  if (ins.error) return (await repo.db.from('projects').select('id').eq('slug', slug).maybeSingle()).data?.id ?? null;
  return ins.data.id;
}

export interface StoredSignal { id: string; projectId: string; signalType: SignalType; isNew: boolean }

/**
 * Stores signals whose evidence appears verbatim in the source text. Anything else is
 * dropped and counted, never stored. Funding is written to the profile only when the
 * excerpt is verified and, if an amount was given, the amount is in the excerpt as money.
 */
export async function recordSignals(repo: Repo, projectId: string, signals: ExtractedSignal[], src: { url: string; text: string; announcementId: string | null }): Promise<{ stored: StoredSignal[]; rejected: number }> {
  const stored: StoredSignal[] = [];
  let rejected = 0;
  for (const s of signals) {
    if (!excerptAppearsIn(s.evidence_excerpt, src.text)) { rejected++; continue; }
    const details: Record<string, unknown> = {};
    if (s.signal_type === 'funding') {
      const amountOk = s.funding_amount_usd === null || amountAppearsAsMoney(s.evidence_excerpt, s.funding_amount_usd, 'usd');
      details.funding_amount_usd = amountOk ? s.funding_amount_usd : null;
      details.funding_round = s.funding_round;
      details.investors = s.investors.filter((i) => s.evidence_excerpt.toLowerCase().includes(i.toLowerCase()));
      if (!amountOk) details.amount_unverified = true;
    }
    const hash = await contentHash(`${s.signal_type}|${s.evidence_excerpt}`);
    const ins = await repo.db.from('project_signals').insert({
      project_id: projectId, signal_type: s.signal_type, summary: s.summary.slice(0, 300), source_url: src.url,
      content_hash: hash, announcement_id: src.announcementId, evidence_excerpt: s.evidence_excerpt.slice(0, 600), details,
    }).select('id').single();
    if (ins.error) {
      if (ins.error.code === '23505') continue; // the same signal was already recorded
      throw new Error(`insert project_signal: ${ins.error.message}`);
    }
    stored.push({ id: ins.data.id, projectId, signalType: s.signal_type, isNew: true });
    if (s.signal_type === 'funding') {
      await repo.db.from('projects').update({
        funding: { ...details, source_url: src.url, excerpt: s.evidence_excerpt.slice(0, 600), verified: true, observed_at: new Date().toISOString() },
      }).eq('id', projectId);
    }
  }
  return { stored, rejected };
}

/**
 * Records what changed between two versions of an announcement. When the change matters and
 * the announcement belongs to a project, it also becomes a project signal so watchers hear about it.
 */
export async function recordAnnouncementChange(repo: Repo, a: { announcementId: string; projectId: string | null; url: string; fromHash: string; toHash: string; before: string; after: string }): Promise<{ diff: VersionDiff; signal: StoredSignal | null }> {
  const diff = diffVersions(a.before, a.after);
  const r = await repo.db.from('announcement_changes').upsert({
    announcement_id: a.announcementId, project_id: a.projectId, from_hash: a.fromHash, to_hash: a.toHash,
    added_lines: diff.added, removed_lines: diff.removed, deadline_changed: diff.deadlineChanged, reward_changed: diff.rewardChanged,
    dates_before: diff.datesBefore, dates_after: diff.datesAfter, amounts_before: diff.amountsBefore, amounts_after: diff.amountsAfter,
    significant: diff.significant,
  }, { onConflict: 'announcement_id,from_hash,to_hash', ignoreDuplicates: true });
  if (r.error) throw new Error(`insert announcement_change: ${r.error.message}`);
  if (!diff.significant || !a.projectId) return { diff, signal: null };

  const type: SignalType = diff.deadlineChanged ? 'deadline_change' : diff.rewardChanged ? 'reward_change' : 'announcement_changed';
  // The excerpt is a line that is in the new version verbatim.
  const excerpt = (diff.added.find((l) => /deadline|reward|testnet|beta|waitlist|launch|airdrop|bounty|registration|funding|raised/i.test(l)) ?? diff.added[0] ?? '').slice(0, 600);
  const hash = await contentHash(`${type}|${a.announcementId}|${a.toHash}`);
  const ins = await repo.db.from('project_signals').insert({
    project_id: a.projectId, signal_type: type, summary: summarizeDiff(diff).slice(0, 300), source_url: a.url, content_hash: hash,
    announcement_id: a.announcementId, evidence_excerpt: excerpt || null,
    details: { dates_before: diff.datesBefore, dates_after: diff.datesAfter, amounts_before: diff.amountsBefore, amounts_after: diff.amountsAfter },
  }).select('id').single();
  if (ins.error) {
    if (ins.error.code === '23505') return { diff, signal: null };
    throw new Error(`insert change signal: ${ins.error.message}`);
  }
  return { diff, signal: { id: ins.data.id, projectId: a.projectId, signalType: type, isNew: true } };
}

/**
 * Sends a watchlist update to every user watching the project who asked for this kind of
 * update. Each (event, user) pair is claimed in `notifications` first, so it is sent once.
 * Users without a linked Telegram account still get the dashboard notification row; the
 * workspace owner also receives it in the configured owner chat.
 */
export async function notifyWatchers(
  deps: { env: ServerEnv; repo: Repo; budget?: RequestBudget },
  ev: { kind: 'signal'; signalId: string } | { kind: 'opportunity'; opportunityId: string },
): Promise<{ sent: number; recorded: number; skipped: number }> {
  const { env, repo } = deps;
  let projectId: string | null, updateType: string, title: string, body: string, url: string, key: string;
  if (ev.kind === 'signal') {
    const s = (await repo.db.from('project_signals').select('id, project_id, signal_type, summary, source_url').eq('id', ev.signalId).maybeSingle()).data;
    if (!s) return { sent: 0, recorded: 0, skipped: 0 };
    projectId = s.project_id; updateType = updateTypeForSignal(s.signal_type as SignalType);
    title = SIGNAL_LABELS[s.signal_type as SignalType] ?? s.signal_type; body = s.summary; url = s.source_url; key = `watch:signal:${s.id}`;
  } else {
    const o = (await repo.db.from('opportunities').select('id, project_id, title, category, score, source_url, verification').eq('id', ev.opportunityId).maybeSingle()).data;
    if (!o || !o.project_id || o.verification === 'suspicious') return { sent: 0, recorded: 0, skipped: 0 };
    projectId = o.project_id;
    updateType = ['incentivized_testnet'].includes(o.category) ? 'testnet' : ['bug_bounty', 'trading_competition', 'ecosystem_campaign', 'grant', 'hackathon'].includes(o.category) ? 'incentive' : 'tester_recruitment';
    title = 'New opportunity'; body = `${o.title} (score ${o.score ?? '—'})`; url = o.source_url; key = `watch:opp:${o.id}`;
  }
  if (!projectId) return { sent: 0, recorded: 0, skipped: 0 };
  const project = (await repo.db.from('projects').select('name').eq('id', projectId).maybeSingle()).data;
  const watchers = (await repo.db.from('watchlists').select('user_id, update_types').eq('project_id', projectId)).data ?? [];
  let sent = 0, recorded = 0, skipped = 0;
  for (const w of watchers) {
    if (!(w.update_types as string[]).includes(updateType)) { skipped++; continue; }
    const dedupe = `${key}:${w.user_id}`;
    const claim = await repo.db.from('notifications').insert({
      user_id: w.user_id, kind: 'watch_update', dedupe_key: dedupe, status: 'pending',
      opportunity_id: ev.kind === 'opportunity' ? ev.opportunityId : null,
      payload: { project_id: projectId, project: project?.name, update_type: updateType, title, body, url },
    }).select('id').single();
    if (claim.error) { skipped++; continue; } // already notified
    recorded++;

    const chats = new Set<string>();
    const tg = (await repo.db.from('telegram_accounts').select('chat_id').eq('user_id', w.user_id).not('chat_id', 'is', null).maybeSingle()).data;
    if (tg?.chat_id) chats.add(String(tg.chat_id));
    const role = (await repo.db.from('profiles').select('role').eq('id', w.user_id).maybeSingle()).data?.role;
    if (role === 'owner' && env.TELEGRAM_CHAT_ID) chats.add(env.TELEGRAM_CHAT_ID);
    if (!env.TELEGRAM_BOT_TOKEN || chats.size === 0) {
      await repo.db.from('notifications').update({ status: 'suppressed', error: 'No Telegram chat linked; shown in the dashboard' }).eq('id', claim.data.id);
      continue;
    }
    const html = `<b>${escapeHtml(project?.name ?? 'Watched project')}</b> · ${escapeHtml(title)}\n${escapeHtml(body)}`;
    const kb: InlineKeyboard = [[{ text: 'Source', url }, ...(env.APP_URL ? [{ text: 'Project', url: `${env.APP_URL}/projects/${projectId}` }] : [])]];
    try {
      for (const chat of chats) await sendMessage(env.TELEGRAM_BOT_TOKEN, chat, html, kb, deps.budget);
      await repo.db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString(), chat_id: [...chats].join(',') }).eq('id', claim.data.id);
      await repo.db.from('watchlists').update({ last_notified_at: new Date().toISOString() }).eq('user_id', w.user_id).eq('project_id', projectId);
      sent++;
    } catch (e) {
      // Release the claim so a retry can send it.
      await repo.db.from('notifications').delete().eq('id', claim.data.id);
      throw e;
    }
  }
  return { sent, recorded, skipped };
}
