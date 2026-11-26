/**
 * XEN First Milestone — LIVE end-to-end proof.
 *   search (Tavily) → retrieve source → Gemini extraction → reward classification → eligibility →
 *   score → Supabase → Telegram → second run produces no duplicate records or alerts.
 *
 * Uses real APIs and the real database configured in the repo-root .env. Never inserts fixtures.
 * Usage: pnpm milestone [--query "paid beta testing web3"] [--max-analyze 6] [--ignore-quiet-hours]
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  analyzeAnnouncement, createServiceClient, ingestItems, integrationStatus, loadServerEnv, notifyOpportunity, Repo, RequestBudget,
  tavilyAdapter, adapterContext, type PipelineDeps,
} from '../src';

config({ path: resolve(import.meta.dirname, '../../../.env') });

const args = process.argv.slice(2);
const argOf = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const QUERY = argOf('--query') ?? 'looking for beta testers crypto paid USDC';
const MAX_ANALYZE = Number(argOf('--max-analyze') ?? 6);
const IGNORE_QUIET = args.includes('--ignore-quiet-hours');

const ok = (m: string) => console.log(`  ✔ ${m}`);
const fail = (m: string) => console.log(`  ✘ ${m}`);
const step = (n: number, m: string) => console.log(`\n[${n}] ${m}`);

async function counts(repo: Repo) {
  const [o, n] = await Promise.all([
    repo.db.from('opportunities').select('id', { count: 'exact', head: true }),
    repo.db.from('notifications').select('id', { count: 'exact', head: true }),
  ]);
  return { opportunities: o.count ?? 0, notifications: n.count ?? 0 };
}

async function main() {
  console.log('XEN milestone — LIVE run (real APIs, real database)\n');
  const env = loadServerEnv(process.env);
  console.log('Integrations:', integrationStatus(env));
  if (!env.TAVILY_API_KEY) throw new Error('TAVILY_API_KEY is required for the milestone');
  const repo = new Repo(createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY));
  const d: PipelineDeps = { env, repo, budget: new RequestBudget(200), workerId: 'milestone' };

  step(0, 'Database reachable and migrated');
  const adapters = await repo.db.from('source_adapters').select('id');
  if (adapters.error) throw new Error(`Supabase not ready: ${adapters.error.message}. Apply supabase/migrations first.`);
  ok(`${adapters.data.length} source adapters registered`);
  const before = await counts(repo);

  step(1, `Real external search (Tavily): "${QUERY}"`);
  const res = await tavilyAdapter.fetch({ queries: [QUERY] }, adapterContext(d));
  ok(`${res.items.length} results (${res.note})`);
  res.items.slice(0, 8).forEach((i) => console.log(`     - ${i.title.slice(0, 90)}  <${i.url}>`));

  step(2, 'Normalize, prefilter and dedupe into announcements');
  const ing = await ingestItems(d, res.items, null);
  ok(`new=${ing.newItems} changed=${ing.changed} filtered_out=${ing.filteredOut} queued_for_analysis=${ing.queued}`);

  step(3, 'Retrieve sources + Gemini structured extraction + verification + scoring');
  const jobs = await repo.db.from('job_queue').select('id, payload').eq('kind', 'analyze').eq('status', 'pending').order('priority', { ascending: false }).limit(MAX_ANALYZE);
  const stored: string[] = [];
  for (const j of jobs.data ?? []) {
    const p = j.payload as Parameters<typeof analyzeAnnouncement>[1];
    try {
      const r = await analyzeAnnouncement(d, p);
      await repo.complete(j.id);
      console.log(`     ${r.status.padEnd(10)} ${p.url}`);
      for (const o of r.opportunities) stored.push(o.id);
      if (r.status === 'skipped_budget') { fail('Gemini daily budget reached'); break; }
    } catch (e) {
      await repo.fail(j.id, String(e));
      console.log(`     error      ${p.url}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  if (!stored.length) {
    fail('No opportunity extracted from these results. This is a legitimate outcome — XEN does not manufacture results. Try another --query.');
  }

  step(4, 'Stored opportunities (from Supabase)');
  const opps = stored.length ? (await repo.db.from('opportunities').select('*').in('id', stored).order('score', { ascending: false })).data ?? [] : [];
  for (const o of opps) {
    console.log(`\n  ${o.title}  [${o.project_name ?? '?'}]`);
    console.log(`     category=${o.category}  reward=${o.reward_amount ?? '—'} ${o.reward_currency ?? ''}  reward_status=${o.reward_status}`);
    console.log(`     capital=${o.capital}  geo_restrictions=${JSON.stringify(o.geo_restrictions)}  geo_allowed=${JSON.stringify(o.geo_allowed)}  kyc=${o.kyc_required}`);
    console.log(`     deadline=${o.deadline_at ?? '—'}  verification=${o.verification} (${o.verification_confidence})  risk=${JSON.stringify(o.risk_flags)}`);
    console.log(`     score=${o.score} (${o.score_breakdown?.priority}${o.score_breakdown?.capped ? `, capped: ${o.score_breakdown.capped}` : ''})  eligibility=${o.score_breakdown?.eligibility}`);
    for (const f of o.score_breakdown?.factors ?? []) console.log(`        ${String(f.key).padEnd(16)} ${String(f.points).padStart(5)}/${f.weight}  ${f.reason}`);
    console.log(`     source=${o.source_url}`);
  }

  step(5, 'Telegram notification');
  let sent = 0;
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) fail('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured — notification step not verified');
  else {
    // Prefer an alert-eligible opportunity; if none qualifies, say so rather than lowering the bar.
    const eligible = opps.filter((o) => (o.score ?? 0) >= 65 && !o.score_breakdown?.capped && !['suspicious', 'expired'].includes(o.verification));
    if (!eligible.length) fail('No stored opportunity meets the alert threshold (score ≥ 65, not suspicious/expired/ineligible). No alert sent — by design.');
    for (const o of eligible.slice(0, 2)) {
      const r = await notifyOpportunity(d, o.id, { ignoreQuietHours: IGNORE_QUIET });
      if (r.deferredUntil) fail(`Quiet hours in ${env.DEFAULT_TIMEZONE}; rerun with --ignore-quiet-hours to send now`);
      sent += r.sent;
      ok(`${o.title}: sent=${r.sent} suppressed=${r.suppressed}`);
    }
  }

  step(6, 'Second run — must create no duplicate records or alerts');
  const mid = await counts(repo);
  const ing2 = await ingestItems(d, res.items, null);
  const again = await repo.db.from('job_queue').select('id', { count: 'exact', head: true }).eq('kind', 'analyze').eq('status', 'pending');
  let resent = 0;
  for (const id of stored) resent += (await notifyOpportunity(d, id, { ignoreQuietHours: true })).sent;
  // Re-analyzing an already-analyzed announcement must update, not duplicate.
  const firstJob = jobs.data?.[0];
  if (firstJob) await analyzeAnnouncement(d, firstJob.payload as Parameters<typeof analyzeAnnouncement>[1]).catch(() => undefined);
  const after = await counts(repo);
  console.log(`     ingest#2: new=${ing2.newItems} changed=${ing2.changed} queued=${ing2.queued}; pending analyze jobs=${again.count}`);
  console.log(`     opportunities ${mid.opportunities} → ${after.opportunities}; notifications ${mid.notifications} → ${after.notifications}; re-sent alerts=${resent}`);
  const noDup = after.opportunities === mid.opportunities && after.notifications === mid.notifications && resent === 0 && ing2.newItems === 0;
  noDup ? ok('No duplicates created') : fail('Duplicate detected — investigate');

  console.log('\nSummary (LIVE):');
  console.log(`  opportunities stored this run: ${stored.length}; telegram alerts sent: ${sent}; dedupe: ${noDup ? 'PASS' : 'FAIL'}`);
  console.log(`  totals: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  process.exit(noDup ? 0 : 1);
}

main().catch((e) => { console.error('\nMilestone failed:', e instanceof Error ? e.message : e); process.exit(1); });
