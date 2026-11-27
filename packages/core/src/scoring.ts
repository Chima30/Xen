import type { Capital, ExtractedOpportunity, RewardStatus, UserProfile, VerificationStatus } from './types';

/**
 * Opportunity score (0–100) — how worthwhile this is for the user.
 * Distinct from verification confidence (how well-evidenced it is), though
 * credibility feeds in as one weighted factor.
 */

export interface ScoreWeights { reward_certainty: number; credibility: number; zero_capital: number; reward_effort: number; eligibility: number; urgency: number }
export const DEFAULT_WEIGHTS: ScoreWeights = { reward_certainty: 30, credibility: 20, zero_capital: 20, reward_effort: 15, eligibility: 10, urgency: 5 };

export type Eligibility = 'eligible' | 'ineligible' | 'unknown';

export function checkEligibility(x: Pick<ExtractedOpportunity, 'geo_restrictions' | 'geo_allowed' | 'kyc_required'>, p: UserProfile): { status: Eligibility; reason: string } {
  const aliases = [p.countryCode.toLowerCase(), ...p.countryNames, p.region].map((s) => s.toLowerCase());
  const matches = (list: string[]) => list.some((g) => { const v = g.toLowerCase().trim(); return aliases.some((a) => v === a || v.includes(a)); });
  if (x.geo_restrictions.length && matches(x.geo_restrictions)) return { status: 'ineligible', reason: `Excludes ${p.countryCode}` };
  if (x.geo_allowed.length) {
    const global = x.geo_allowed.some((g) => /global|worldwide|all countries|anyone|everyone/i.test(g));
    if (global || matches(x.geo_allowed)) return { status: 'eligible', reason: 'Region explicitly allowed' };
    return { status: 'ineligible', reason: `Only open to: ${x.geo_allowed.slice(0, 4).join(', ')}` };
  }
  if (x.geo_restrictions.length) return { status: 'eligible', reason: `Restrictions listed do not include ${p.countryCode}` };
  return { status: 'unknown', reason: 'No geographic terms stated' };
}

const REWARD_CERTAINTY: Record<RewardStatus, number> = { confirmed: 1, performance_based: 0.65, speculative: 0.2, unverified: 0.1, unpaid: 0 };
const CAPITAL_SCORE: Record<Capital, number> = { none: 1, gas_only: 0.7, unknown: 0.3, required: 0 };

export interface ScoreInput {
  extracted: ExtractedOpportunity;
  rewardStatus: RewardStatus;
  verification: VerificationStatus;
  confidence: number;
  profile: UserProfile;
  weights?: ScoreWeights;
  now?: Date;
}

export interface ScoreFactor { key: keyof ScoreWeights; value: number; weight: number; points: number; reason: string }
export interface ScoreResult { score: number; priority: 'high' | 'investigate' | 'low'; factors: ScoreFactor[]; eligibility: Eligibility; capped: string | null; notifyEligible: boolean }

const STABLE = /^(usdc|usdt|usd|dai|usde|\$)$/i;

export function scoreOpportunity(i: ScoreInput): ScoreResult {
  const w = i.weights ?? i.profile.scoreWeights ?? DEFAULT_WEIGHTS;
  const x = i.extracted;
  const now = i.now ?? new Date();
  const factors: ScoreFactor[] = [];
  const add = (key: keyof ScoreWeights, value: number, reason: string) =>
    factors.push({ key, value, weight: w[key], points: Math.round(value * w[key] * 10) / 10, reason });

  add('reward_certainty', REWARD_CERTAINTY[i.rewardStatus], `Reward is ${i.rewardStatus.replace('_', ' ')}`);

  const cred = i.verification === 'verified_announcement' ? 1 : i.verification === 'partially_verified' ? 0.6 : i.verification === 'unverified' ? 0.25 : 0;
  add('credibility', Math.min(cred, 0.4 + i.confidence * 0.6), `Verification: ${i.verification.replace('_', ' ')} (confidence ${i.confidence.toFixed(2)})`);

  add('zero_capital', CAPITAL_SCORE[x.capital], x.capital === 'unknown' ? 'Capital requirement unknown' : `Capital: ${x.capital.replace('_', ' ')}`);

  // Reward relative to effort: USD/hour on stablecoins when both known; otherwise partial credit.
  let re = 0.3, reReason = 'Reward or effort unknown';
  if (x.reward_amount !== null && x.reward_currency && STABLE.test(x.reward_currency.trim()) && x.estimated_minutes) {
    const perHour = x.reward_amount / (x.estimated_minutes / 60);
    re = Math.max(0, Math.min(1, perHour / 40)); // $40/h ≈ full marks
    reReason = `≈$${perHour.toFixed(0)}/hour`;
  } else if (x.reward_amount !== null) {
    re = 0.5; reReason = `Amount stated (${x.reward_amount} ${x.reward_currency ?? ''}), effort unknown`.trim();
  } else if (i.rewardStatus === 'unpaid') { re = 0; reReason = 'No payment'; }
  add('reward_effort', re, reReason);

  const elig = checkEligibility(x, i.profile);
  add('eligibility', elig.status === 'eligible' ? 1 : elig.status === 'unknown' ? 0.5 : 0, elig.reason);

  let urg = 0.3, urgReason = 'No deadline';
  if (x.deadline_at) {
    const days = (new Date(x.deadline_at).getTime() - now.getTime()) / 86_400_000;
    if (days < 0) { urg = 0; urgReason = 'Deadline passed'; }
    else if (days <= 3) { urg = 1; urgReason = `Closes in ${Math.ceil(days)} day(s)`; }
    else if (days <= 14) { urg = 0.7; urgReason = `Closes in ${Math.ceil(days)} days`; }
    else { urg = 0.4; urgReason = `Closes in ${Math.ceil(days)} days`; }
  }
  add('urgency', urg, urgReason);

  const totalWeight = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  let score = Math.round((factors.reduce((s, f) => s + f.value * f.weight, 0) / totalWeight) * 100);

  // Hard caps: never high priority when unsafe, expired or ineligible.
  let capped: string | null = null;
  if (i.verification === 'suspicious') { score = Math.min(score, 15); capped = 'suspicious'; }
  else if (i.verification === 'expired') { score = Math.min(score, 30); capped = 'expired'; }
  else if (elig.status === 'ineligible') { score = Math.min(score, 40); capped = 'ineligible'; }
  else if (i.profile.zeroCapitalMode && x.capital === 'required') { score = Math.min(score, 50); capped = 'requires_capital'; }

  const priority = score >= 85 ? 'high' : score >= 65 ? 'investigate' : 'low';
  return { score, priority, factors, eligibility: elig.status, capped, notifyEligible: capped === null && score >= 65 };
}
