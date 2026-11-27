/**
 * Personal management: your profile, how well an opportunity fits you, the daily action plan,
 * earnings maths, payment reliability and the calendar. Everything here is deterministic and
 * works only from records that exist — nothing is generated to fill a plan or a total.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkEligibility, DEFAULT_WEIGHTS, type ScoreWeights } from '../scoring';
import { DEFAULT_PROFILE, type UserProfile } from '../types';

export * from './constants';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Names announcements use for a country, and its region. Unknown codes fall back to the code. */
const COUNTRIES: Record<string, { names: string[]; region: string }> = {
  NG: { names: ['nigeria', 'nigerian'], region: 'africa' },
  GH: { names: ['ghana', 'ghanaian'], region: 'africa' },
  KE: { names: ['kenya', 'kenyan'], region: 'africa' },
  ZA: { names: ['south africa', 'south african'], region: 'africa' },
  EG: { names: ['egypt', 'egyptian'], region: 'africa' },
  US: { names: ['united states', 'usa', 'u.s.', 'american'], region: 'north america' },
  CA: { names: ['canada', 'canadian'], region: 'north america' },
  GB: { names: ['united kingdom', 'uk', 'britain', 'british'], region: 'europe' },
  DE: { names: ['germany', 'german'], region: 'europe' },
  FR: { names: ['france', 'french'], region: 'europe' },
  IN: { names: ['india', 'indian'], region: 'asia' },
  PK: { names: ['pakistan', 'pakistani'], region: 'asia' },
  PH: { names: ['philippines', 'filipino'], region: 'asia' },
  ID: { names: ['indonesia', 'indonesian'], region: 'asia' },
  VN: { names: ['vietnam', 'vietnamese'], region: 'asia' },
  BR: { names: ['brazil', 'brazilian'], region: 'south america' },
};

export interface ProfileRow { country_code?: string | null; skills?: string[] | null; timezone?: string | null }
export interface PreferencesRow {
  preferred_categories?: string[] | null; zero_capital_mode?: boolean | null; max_capital_usd?: number | string | null;
  daily_minutes_available?: number | null; risk_tolerance?: string | null; min_reward_usd?: number | string | null; score_weights?: unknown;
}

/** Your saved profile and preferences as the scoring profile. Missing values keep the defaults. */
export function profileFromRows(p: ProfileRow | null, prefs: PreferencesRow | null): UserProfile {
  const code = (p?.country_code || DEFAULT_PROFILE.countryCode).toUpperCase();
  const c = COUNTRIES[code];
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  const risk = prefs?.risk_tolerance;
  return {
    countryCode: code,
    countryNames: c?.names ?? [],
    region: c?.region ?? '',
    skills: p?.skills?.length ? p.skills : DEFAULT_PROFILE.skills,
    preferredCategories: prefs?.preferred_categories ?? DEFAULT_PROFILE.preferredCategories,
    zeroCapitalMode: prefs?.zero_capital_mode ?? DEFAULT_PROFILE.zeroCapitalMode,
    maxCapitalUsd: num(prefs?.max_capital_usd) ?? DEFAULT_PROFILE.maxCapitalUsd,
    dailyMinutes: prefs?.daily_minutes_available ?? DEFAULT_PROFILE.dailyMinutes,
    riskTolerance: risk === 'medium' || risk === 'high' ? risk : 'low',
    minRewardUsd: num(prefs?.min_reward_usd),
    scoreWeights: parseWeights(prefs?.score_weights),
  };
}

function parseWeights(v: unknown): ScoreWeights | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(DEFAULT_WEIGHTS) as (keyof ScoreWeights)[]) {
    const n = Number((v as Record<string, unknown>)[k]);
    if (Number.isFinite(n) && n >= 0 && n <= 100) out[k] = n;
  }
  return out;
}

/** The owner's profile, used by the pipeline so scores and alerts reflect your own settings. */
export async function loadOwnerProfile(db: SupabaseClient): Promise<UserProfile> {
  const owner = await db.from('profiles').select('id, country_code, skills, timezone').eq('role', 'owner').order('created_at').limit(1).maybeSingle();
  if (!owner.data) return DEFAULT_PROFILE;
  const prefs = await db.from('user_preferences').select('*').eq('user_id', owner.data.id).maybeSingle();
  return profileFromRows(owner.data, prefs.data);
}

// ---------------------------------------------------------------------------
// Fit: how well one opportunity suits you
// ---------------------------------------------------------------------------

export interface FitOpportunity {
  category: string; capital: string; capital_notes?: string | null; required_skills?: string[] | null; estimated_minutes?: number | null;
  reward_amount?: number | string | null; reward_currency?: string | null; reward_status: string; verification: string;
  risk_flags?: string[] | null; geo_restrictions?: string[] | null; geo_allowed?: string[] | null; kyc_required?: boolean | null;
}
export interface Fit { blocked: string | null; reasons: string[]; cautions: string[] }

const STABLE = /^(usdc|usdt|usd|dai|usde|\$)$/i;
const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '_');

export function personalFit(o: FitOpportunity, p: UserProfile): Fit {
  const reasons: string[] = [];
  const cautions: string[] = [];
  let blocked: string | null = null;

  const elig = checkEligibility({ geo_restrictions: o.geo_restrictions ?? [], geo_allowed: o.geo_allowed ?? [], kyc_required: o.kyc_required ?? null }, p);
  if (elig.status === 'ineligible') blocked = `Not open to you: ${elig.reason}`;
  else if (elig.status === 'eligible') reasons.push(elig.reason);
  else cautions.push('Eligibility by country is not stated');
  if (o.kyc_required) cautions.push('Requires identity verification (KYC)');

  if (o.capital === 'required') {
    if (p.zeroCapitalMode || p.maxCapitalUsd <= 0) blocked ??= 'Needs capital, and Zero Capital Mode is on';
    else cautions.push(`Needs capital${o.capital_notes ? `: ${o.capital_notes}` : ''}`);
  } else if (o.capital === 'none') reasons.push('No capital needed');
  else if (o.capital === 'gas_only') reasons.push('Only gas fees needed');
  else cautions.push('Capital requirement not stated');

  if (o.verification === 'suspicious') blocked ??= 'Flagged as suspicious';
  if (o.verification === 'expired') blocked ??= 'Expired';
  const flags = o.risk_flags ?? [];
  if (flags.length) {
    if (p.riskTolerance === 'low') cautions.push(`Risk flags: ${flags.slice(0, 3).join(', ').replace(/_/g, ' ')}`);
    else cautions.push(`${flags.length} risk flag(s)`);
  }
  if (p.riskTolerance === 'low' && o.verification === 'unverified') cautions.push('Not yet verified from an official source');

  if (p.preferredCategories.includes(o.category)) reasons.push(`In your preferred categories (${o.category.replace(/_/g, ' ')})`);

  const mine = new Set(p.skills.map(norm));
  const needed = (o.required_skills ?? []).map(norm);
  const have = needed.filter((s) => mine.has(s));
  const lacking = needed.filter((s) => !mine.has(s));
  if (have.length) reasons.push(`Uses your skills: ${have.slice(0, 3).join(', ').replace(/_/g, ' ')}`);
  if (lacking.length) cautions.push(`Asks for: ${lacking.slice(0, 3).join(', ').replace(/_/g, ' ')}`);

  if (o.reward_status === 'confirmed') reasons.push('Reward terms confirmed by an official source');
  else if (o.reward_status === 'speculative') cautions.push('Reward is speculative, not confirmed');
  else if (o.reward_status === 'unpaid') cautions.push('No payment offered');

  const amount = o.reward_amount === null || o.reward_amount === undefined ? null : Number(o.reward_amount);
  if (p.minRewardUsd && amount !== null && o.reward_currency && STABLE.test(o.reward_currency.trim()) && amount < p.minRewardUsd) {
    cautions.push(`Reward below your minimum ($${p.minRewardUsd})`);
  }
  if (o.estimated_minutes && o.estimated_minutes > p.dailyMinutes) cautions.push(`Takes about ${Math.round(o.estimated_minutes / 60)}h, more than your daily time`);

  return { blocked, reasons, cautions };
}

// ---------------------------------------------------------------------------
// Dates in the user's time zone
// ---------------------------------------------------------------------------

/** YYYY-MM-DD for an instant in a time zone. */
export function localDate(d: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
}
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------------------------------------------------------------------------
// Daily action plan
// ---------------------------------------------------------------------------

export interface PlanTask { id: string; title: string; due_at: string | null; minutes_estimate: number | null; priority: string; application_title?: string | null }
export interface PlanApplication {
  id: string; title: string; status: string; follow_up_at: string | null; deadline_at: string | null; project_name: string | null;
  opportunity?: { estimated_minutes: number | null; instructions: string | null; source_url: string; deadline_at: string | null; reward: string | null } | null;
}
export interface PlanOpportunity extends FitOpportunity {
  id: string; title: string; project_name: string | null; score: number | null; deadline_at: string | null; discovered_at: string;
  instructions: string | null; source_url: string; reward_amount_max?: number | string | null;
}
export interface PlanWatchUpdate { id: string; project_id: string; project_name: string; detected_at: string; deadline_changed: boolean; reward_changed: boolean }

export type PlanKind = 'task' | 'follow_up' | 'submission' | 'watch_update' | 'opportunity';
export interface PlanItem {
  kind: PlanKind; id: string; activity: string; title: string; project: string | null; reward: string | null;
  minutes: number | null; deadline: string | null; instructions: string | null; sourceUrl: string | null; href: string;
  why: string; priority: number; required: boolean;
}
export interface DailyPlan { items: PlanItem[]; later: PlanItem[]; budgetMinutes: number; plannedMinutes: number; unknownEffort: number }

export const PLAN_DEFAULT_MINUTES = 30;
const TESTING = new Set(['paid_beta_testing', 'paid_alpha_testing', 'prediction_market_testing', 'dex_testing', 'perp_testing', 'spot_trading_testing', 'paid_feedback', 'usability_testing', 'qa_testing', 'user_research']);

export function rewardText(amount: unknown, max: unknown, currency: string | null | undefined, status: string): string | null {
  const a = amount === null || amount === undefined ? null : Number(amount);
  const m = max === null || max === undefined ? null : Number(max);
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const money = a !== null ? `${fmt(a)}${m && m > a ? `–${fmt(m)}` : ''}${currency ? ` ${currency}` : ''}` : null;
  if (status === 'unpaid') return 'Unpaid';
  if (!money) return status === 'confirmed' || status === 'performance_based' ? 'Paid (amount not stated)' : null;
  return status === 'confirmed' ? money : `${money} (${status.replace(/_/g, ' ')})`;
}

/**
 * Ranks what is worth doing today and fits it into the time you have. Overdue tasks, due
 * follow-ups and close submissions always appear; opportunities fill the remaining time.
 * An empty result is a valid plan.
 */
export function buildDailyPlan(input: {
  now: Date; timeZone: string; dailyMinutes: number; profile: UserProfile;
  tasks: PlanTask[]; applications: PlanApplication[]; opportunities: PlanOpportunity[]; watchUpdates: PlanWatchUpdate[];
}): DailyPlan {
  const today = localDate(input.now, input.timeZone);
  const soon = addDays(today, 2);
  const week = addDays(today, 7);
  const candidates: PlanItem[] = [];

  for (const t of input.tasks) {
    const due = t.due_at ? localDate(t.due_at, input.timeZone) : null;
    const boost = t.priority === 'high' ? 8 : t.priority === 'low' ? -8 : 0;
    let priority = 30 + boost, why = 'Open task', required = false;
    if (due && due < today) { priority = 100; why = `Overdue since ${due}`; required = true; }
    else if (due === today) { priority = 92 + boost; why = 'Due today'; required = true; }
    else if (due && due <= soon) { priority = 70 + boost; why = `Due ${due}`; }
    else if (due) continue; // later tasks belong to later days
    candidates.push({
      kind: 'task', id: t.id, activity: 'Do task', title: t.title, project: t.application_title ?? null, reward: null,
      minutes: t.minutes_estimate, deadline: t.due_at, instructions: null, sourceUrl: null, href: '/tasks', why, priority, required,
    });
  }

  for (const a of input.applications) {
    const follow = a.follow_up_at ? localDate(a.follow_up_at, input.timeZone) : null;
    if (follow && follow <= today && ['applied', 'submitted', 'under_review', 'completed', 'payment_pending'].includes(a.status)) {
      candidates.push({
        kind: 'follow_up', id: `f-${a.id}`, activity: a.status === 'payment_pending' || a.status === 'completed' ? 'Follow up on payment' : 'Follow up',
        title: a.title, project: a.project_name, reward: a.opportunity?.reward ?? null, minutes: 10, deadline: a.follow_up_at,
        instructions: null, sourceUrl: a.opportunity?.source_url ?? null, href: '/applications', why: follow < today ? `Follow-up was due ${follow}` : 'Follow-up due today',
        priority: 88, required: true,
      });
    }
    const deadlineRaw = a.deadline_at ?? a.opportunity?.deadline_at ?? null;
    const deadline = deadlineRaw ? localDate(deadlineRaw, input.timeZone) : null;
    if (deadline && deadline >= today && deadline <= week && ['saved', 'interested', 'accepted', 'in_progress'].includes(a.status)) {
      const working = a.status === 'accepted' || a.status === 'in_progress';
      const days = Math.round((Date.parse(`${deadline}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
      candidates.push({
        kind: 'submission', id: `s-${a.id}`, activity: working ? 'Finish and submit' : 'Apply before the deadline', title: a.title, project: a.project_name,
        reward: a.opportunity?.reward ?? null, minutes: a.opportunity?.estimated_minutes ?? null, deadline: deadlineRaw,
        instructions: a.opportunity?.instructions ?? null, sourceUrl: a.opportunity?.source_url ?? null, href: '/applications',
        why: days === 0 ? 'Deadline is today' : `Deadline in ${days} day${days === 1 ? '' : 's'}`, priority: working ? 90 - days * 2 : 80 - days * 3, required: working && days <= 2,
      });
    }
  }

  for (const w of input.watchUpdates) {
    const what = w.deadline_changed ? 'deadline changed' : w.reward_changed ? 'reward terms changed' : 'announcement changed';
    candidates.push({
      kind: 'watch_update', id: `w-${w.id}`, activity: 'Review watchlist update', title: `${w.project_name}: ${what}`, project: w.project_name, reward: null,
      minutes: 10, deadline: null, instructions: null, sourceUrl: null, href: `/projects/${w.project_id}`, why: `Detected ${localDate(w.detected_at, input.timeZone)}`,
      priority: w.deadline_changed || w.reward_changed ? 66 : 50, required: false,
    });
  }

  const recentCutoff = input.now.getTime() - 48 * 3_600_000;
  for (const o of input.opportunities) {
    if (o.deadline_at && Date.parse(o.deadline_at) < input.now.getTime()) continue;
    const fit = personalFit(o, input.profile);
    if (fit.blocked || (o.score ?? 0) < 50) continue;
    let priority = (o.score ?? 0) * 0.55;
    const why: string[] = [];
    if (o.reward_status === 'confirmed') { priority += 14; why.push('confirmed reward'); }
    if (o.capital === 'none') { priority += 10; why.push('no capital'); }
    if (o.deadline_at) {
      const d = localDate(o.deadline_at, input.timeZone);
      if (d <= addDays(today, 3)) { priority += 14; why.push(`closes ${d}`); }
      else if (d <= week) { priority += 7; why.push(`closes ${d}`); }
    }
    if (TESTING.has(o.category) && Date.parse(o.discovered_at) >= recentCutoff) { priority += 9; why.push('new paid testing'); }
    if (input.profile.preferredCategories.includes(o.category)) priority += 4;
    candidates.push({
      kind: 'opportunity', id: o.id, activity: o.reward_status === 'unpaid' ? 'Consider' : 'Apply or start', title: o.title, project: o.project_name,
      reward: rewardText(o.reward_amount, o.reward_amount_max, o.reward_currency, o.reward_status), minutes: o.estimated_minutes ?? null, deadline: o.deadline_at,
      instructions: o.instructions, sourceUrl: o.source_url, href: `/opportunities/${o.id}`,
      why: why.length ? `Score ${o.score}: ${why.join(', ')}` : `Score ${o.score}`, priority: Math.min(priority, 85), required: false,
    });
  }

  candidates.sort((a, b) => Number(b.required) - Number(a.required) || b.priority - a.priority);
  const budget = Math.max(0, input.dailyMinutes);
  const items: PlanItem[] = [];
  const later: PlanItem[] = [];
  let used = 0, unknown = 0;
  for (const c of candidates) {
    const cost = c.minutes ?? PLAN_DEFAULT_MINUTES;
    if (c.required || used + cost <= budget) {
      items.push(c);
      used += cost;
      if (c.minutes === null) unknown++;
    } else if (later.length < 5) later.push(c);
  }
  return { items, later, budgetMinutes: budget, plannedMinutes: used, unknownEffort: unknown };
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export interface EarningRecord {
  id: string; amount: number | string; currency: string; amount_usd: number | string | null; status: string;
  minutes_spent: number | null; paid_at: string | null; expected_at: string | null; created_at: string;
  category: string | null; project_name: string | null;
}
export interface Bucket { count: number; usd: number; usdMissing: number; byCurrency: Record<string, number> }
export interface EarningsSummary {
  received: Bucket; pending: Bucket; expected: Bucket; unpaid: Bucket; rejected: Bucket; overdue: number;
  perHourUsd: number | null; hoursCounted: number;
  byMonth: { month: string; usd: number; usdMissing: number }[];
  byCategory: { key: string; usd: number; count: number }[];
  byProject: { key: string; usd: number; count: number }[];
}

const emptyBucket = (): Bucket => ({ count: 0, usd: 0, usdMissing: 0, byCurrency: {} });

/**
 * Actual earnings are only records marked received. Expected and pending amounts are kept
 * separate as potential income, and are never added to the total.
 */
export function summarizeEarnings(rows: EarningRecord[], now: Date, timeZone = 'Africa/Lagos'): EarningsSummary {
  const s: EarningsSummary = {
    received: emptyBucket(), pending: emptyBucket(), expected: emptyBucket(), unpaid: emptyBucket(), rejected: emptyBucket(),
    overdue: 0, perHourUsd: null, hoursCounted: 0, byMonth: [], byCategory: [], byProject: [],
  };
  const month = new Map<string, { usd: number; usdMissing: number }>();
  const cat = new Map<string, { usd: number; count: number }>();
  const proj = new Map<string, { usd: number; count: number }>();
  let perHourUsd = 0, perHourMinutes = 0;
  for (const r of rows) {
    const key = (['received', 'pending', 'expected', 'unpaid', 'rejected'] as const).find((k) => k === r.status);
    if (!key) continue;
    const b = s[key];
    const amount = Number(r.amount);
    const usd = r.amount_usd === null || r.amount_usd === undefined || r.amount_usd === '' ? null : Number(r.amount_usd);
    b.count++;
    b.byCurrency[r.currency.toUpperCase()] = (b.byCurrency[r.currency.toUpperCase()] ?? 0) + amount;
    if (usd === null) b.usdMissing++; else b.usd += usd;
    if (key === 'pending' && r.expected_at && Date.parse(r.expected_at) < now.getTime()) s.overdue++;
    if (key !== 'received') continue;
    const m = localDate(r.paid_at ?? r.created_at, timeZone).slice(0, 7);
    const mm = month.get(m) ?? { usd: 0, usdMissing: 0 };
    if (usd === null) mm.usdMissing++; else mm.usd += usd;
    month.set(m, mm);
    for (const [map, k] of [[cat, r.category || 'uncategorised'], [proj, r.project_name || 'Unnamed project']] as const) {
      const v = map.get(k) ?? { usd: 0, count: 0 };
      v.count++; v.usd += usd ?? 0;
      map.set(k, v);
    }
    if (usd !== null && r.minutes_spent && r.minutes_spent > 0) { perHourUsd += usd; perHourMinutes += r.minutes_spent; }
  }
  if (perHourMinutes > 0) { s.perHourUsd = Math.round((perHourUsd / (perHourMinutes / 60)) * 100) / 100; s.hoursCounted = Math.round((perHourMinutes / 60) * 10) / 10; }
  s.byMonth = [...month].map(([m, v]) => ({ month: m, ...v })).sort((a, b) => a.month.localeCompare(b.month));
  const ranked = (m: Map<string, { usd: number; count: number }>) => [...m].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.usd - a.usd || b.count - a.count);
  s.byCategory = ranked(cat);
  s.byProject = ranked(proj);
  return s;
}

// ---------------------------------------------------------------------------
// Payment reliability
// ---------------------------------------------------------------------------

export interface PaymentEvidence {
  project_id: string; project_name: string; evidence_type: string; outcome: string;
  occurred_at: string | null; created_at: string; source_url: string | null; details: string | null;
}
export interface Tally { paid_on_time: number; paid_late: number; paid: number; partial: number; unpaid: number; total: number }
export interface Reliability {
  projectId: string; projectName: string; verified: Tally; allegations: Tally; label: string;
  tone: 'good' | 'mixed' | 'bad' | 'none'; lastEvidenceAt: string | null;
}

const VERIFIED = new Set(['verified_user_payment', 'official_announcement', 'public_evidence']);
const emptyTally = (): Tally => ({ paid_on_time: 0, paid_late: 0, paid: 0, partial: 0, unpaid: 0, total: 0 });

/** The label comes only from verified evidence; community allegations are counted separately. */
export function paymentReliability(rows: PaymentEvidence[]): Reliability[] {
  const by = new Map<string, Reliability>();
  for (const r of rows) {
    const x = by.get(r.project_id) ?? { projectId: r.project_id, projectName: r.project_name, verified: emptyTally(), allegations: emptyTally(), label: '', tone: 'none' as const, lastEvidenceAt: null };
    const t = VERIFIED.has(r.evidence_type) ? x.verified : x.allegations;
    if (r.outcome in t) t[r.outcome as keyof Omit<Tally, 'total'>]++;
    t.total++;
    const at = r.occurred_at ?? r.created_at;
    if (!x.lastEvidenceAt || at > x.lastEvidenceAt) x.lastEvidenceAt = at;
    by.set(r.project_id, x);
  }
  for (const x of by.values()) {
    const v = x.verified;
    const paid = v.paid_on_time + v.paid + v.paid_late;
    if (v.total === 0) { x.label = 'No verified payment record'; x.tone = 'none'; }
    else if (v.unpaid === 0 && v.partial === 0 && v.paid_late === 0) { x.label = `Paid in all ${v.total} verified record${v.total === 1 ? '' : 's'}`; x.tone = 'good'; }
    else if (paid === 0) { x.label = `No verified payment in ${v.total} record${v.total === 1 ? '' : 's'}`; x.tone = 'bad'; }
    else { x.label = `Mixed: ${paid} of ${v.total} verified records paid${v.paid_late ? `, ${v.paid_late} late` : ''}`; x.tone = 'mixed'; }
  }
  return [...by.values()].sort((a, b) => b.verified.total - a.verified.total || a.projectName.localeCompare(b.projectName));
}

/** Outcome for your own received payment: on time or late when an expected date was set. */
export function paymentOutcome(paidAt: string | null, expectedAt: string | null): 'paid_on_time' | 'paid_late' | 'paid' {
  if (!paidAt || !expectedAt) return 'paid';
  return Date.parse(paidAt) <= Date.parse(expectedAt) + 86_400_000 ? 'paid_on_time' : 'paid_late';
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export type CalendarKind = 'deadline' | 'follow_up' | 'task' | 'reminder' | 'payment' | 'opens';
export interface CalendarEvent { date: string; at: string; kind: CalendarKind; title: string; href: string; done?: boolean }

export function buildCalendar(src: {
  timeZone: string; from: string; to: string;
  applications: { id: string; title: string; deadline_at: string | null; follow_up_at: string | null; opportunity_deadline?: string | null }[];
  tasks: { id: string; title: string; due_at: string | null; done: boolean }[];
  reminders: { id: string; message: string; remind_at: string; sent_at: string | null }[];
  earnings: { id: string; title: string | null; project_name: string | null; expected_at: string | null; status: string }[];
  saved: { id: string; title: string; deadline_at: string | null; registration_opens_at: string | null }[];
}): CalendarEvent[] {
  const ev: CalendarEvent[] = [];
  const push = (at: string | null | undefined, kind: CalendarKind, title: string, href: string, done?: boolean) => {
    if (!at) return;
    const date = localDate(at, src.timeZone);
    if (date < src.from || date > src.to) return;
    ev.push({ date, at, kind, title, href, ...(done !== undefined && { done }) });
  };
  const seen = new Set<string>();
  for (const a of src.applications) {
    push(a.deadline_at ?? a.opportunity_deadline, 'deadline', a.title, '/applications');
    push(a.follow_up_at, 'follow_up', `Follow up: ${a.title}`, '/applications');
    seen.add(a.title);
  }
  for (const s of src.saved) {
    if (seen.has(s.title)) continue; // tracked as an application already
    push(s.deadline_at, 'deadline', s.title, `/opportunities/${s.id}`);
    push(s.registration_opens_at, 'opens', `Opens: ${s.title}`, `/opportunities/${s.id}`);
  }
  for (const t of src.tasks) push(t.due_at, 'task', t.title, '/tasks', t.done);
  for (const r of src.reminders) push(r.remind_at, 'reminder', r.message, '/tasks', r.sent_at !== null);
  for (const e of src.earnings) if (e.status === 'pending' || e.status === 'expected') push(e.expected_at, 'payment', `Payment expected: ${e.title || e.project_name || 'payment'}`, '/earnings');
  return ev.sort((a, b) => a.at.localeCompare(b.at));
}
