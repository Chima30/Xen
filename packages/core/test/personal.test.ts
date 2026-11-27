/** Personal management: plan, fit, earnings, reliability and calendar. Pure functions, synthetic rows. */
import { describe, expect, it } from 'vitest';
import {
  buildCalendar, buildDailyPlan, DEFAULT_PROFILE, localDate, paymentOutcome, paymentReliability, personalFit, profileFromRows,
  scoreOpportunity, summarizeEarnings, type PlanOpportunity,
} from '../src';

const TZ = 'Africa/Lagos';
const now = new Date('2026-11-27T09:00:00Z'); // 10:00 in Lagos
const profile = DEFAULT_PROFILE;

const opp = (o: Partial<PlanOpportunity> = {}): PlanOpportunity => ({
  id: 'o1', title: 'Beta test the order book', project_name: 'DemoDEX', score: 80, deadline_at: null, discovered_at: '2026-11-27T06:00:00Z',
  instructions: 'Join the form', source_url: 'https://demodex.test/beta', category: 'dex_testing', capital: 'none', reward_status: 'confirmed',
  verification: 'verified_announcement', reward_amount: 50, reward_currency: 'USDC', estimated_minutes: 45, risk_flags: [], geo_restrictions: [], geo_allowed: [], ...o,
});

describe('profile', () => {
  it('uses saved settings and keeps defaults for missing values', () => {
    const p = profileFromRows({ country_code: 'gh', skills: ['design'] }, { zero_capital_mode: false, max_capital_usd: '25', daily_minutes_available: 60, risk_tolerance: 'medium', score_weights: { urgency: 40, bogus: 3 } });
    expect(p).toMatchObject({ countryCode: 'GH', countryNames: ['ghana', 'ghanaian'], region: 'africa', skills: ['design'], zeroCapitalMode: false, maxCapitalUsd: 25, dailyMinutes: 60, riskTolerance: 'medium' });
    expect(p.scoreWeights?.urgency).toBe(40);
    expect(p.scoreWeights?.reward_certainty).toBe(30);
    expect(profileFromRows(null, null).countryCode).toBe('NG');
  });
  it('scores with the user’s own weights when saved', () => {
    const extracted = { capital: 'none', reward_amount: null, reward_currency: null, estimated_minutes: null, geo_restrictions: [], geo_allowed: [], kyc_required: null, deadline_at: null } as never;
    const base = scoreOpportunity({ extracted, rewardStatus: 'speculative', verification: 'verified_announcement', confidence: 0.9, profile });
    const capitalHeavy = scoreOpportunity({ extracted, rewardStatus: 'speculative', verification: 'verified_announcement', confidence: 0.9, profile: { ...profile, scoreWeights: { reward_certainty: 0, credibility: 0, zero_capital: 100, reward_effort: 0, eligibility: 0, urgency: 0 } } });
    expect(capitalHeavy.score).toBe(100);
    expect(base.score).toBeLessThan(100);
  });
});

describe('fit', () => {
  it('blocks what you cannot take part in', () => {
    expect(personalFit(opp({ geo_restrictions: ['Nigeria'] }), profile).blocked).toMatch(/Not open to you/);
    expect(personalFit(opp({ capital: 'required' }), profile).blocked).toMatch(/Zero Capital/);
    expect(personalFit(opp({ verification: 'suspicious' }), profile).blocked).toBe('Flagged as suspicious');
  });
  it('explains why something suits you, and what to watch', () => {
    const f = personalFit(opp({ required_skills: ['bug reporting', 'solidity'], estimated_minutes: 600 }), profile);
    expect(f.blocked).toBeNull();
    expect(f.reasons).toEqual(expect.arrayContaining(['No capital needed', 'Uses your skills: bug reporting']));
    expect(f.cautions).toEqual(expect.arrayContaining(['Asks for: solidity', 'Takes about 10h, more than your daily time']));
  });
});

describe('daily plan', () => {
  const base = { now, timeZone: TZ, dailyMinutes: 60, profile, tasks: [], applications: [], opportunities: [], watchUpdates: [] };

  it('is empty when there is nothing real to do', () => {
    const p = buildDailyPlan(base);
    expect(p.items).toEqual([]);
    expect(p.later).toEqual([]);
  });

  it('always includes overdue work, then fills the remaining time by priority', () => {
    const p = buildDailyPlan({
      ...base,
      tasks: [
        { id: 't1', title: 'Write report', due_at: '2026-11-25T10:00:00Z', minutes_estimate: 50, priority: 'medium' },
        { id: 't2', title: 'Future task', due_at: '2026-12-20T10:00:00Z', minutes_estimate: 10, priority: 'high' },
      ],
      opportunities: [opp(), opp({ id: 'o2', title: 'Low score', score: 40 }), opp({ id: 'o3', title: 'Blocked', capital: 'required' })],
    });
    expect(p.items.map((i) => i.id)).toEqual(['t1']); // overdue fills 50 of 60 minutes; the 45-minute opportunity waits
    expect(p.items[0]?.why).toBe('Overdue since 2026-11-25');
    expect(p.later.map((i) => i.id)).toEqual(['o1']);
    expect(p.plannedMinutes).toBe(50);
  });

  it('ranks confirmed, zero-capital, closing-soon opportunities first and keeps source details', () => {
    const p = buildDailyPlan({
      ...base, dailyMinutes: 240,
      opportunities: [
        opp({ id: 'spec', reward_status: 'speculative', score: 85 }),
        opp({ id: 'soon', deadline_at: '2026-11-28T12:00:00Z', score: 75 }),
      ],
      applications: [{ id: 'a1', title: 'Testnet quest', status: 'applied', follow_up_at: '2026-11-27T08:00:00Z', deadline_at: null, project_name: 'X' }],
    });
    expect(p.items.map((i) => i.id)).toEqual(['f-a1', 'soon', 'spec']);
    expect(p.items[1]).toMatchObject({ reward: '50 USDC', sourceUrl: 'https://demodex.test/beta', instructions: 'Join the form' });
    expect(p.items[2]?.reward).toBe('50 USDC (speculative)');
  });

  it('counts unknown effort with a default and says so', () => {
    const p = buildDailyPlan({ ...base, opportunities: [opp({ estimated_minutes: null })] });
    expect(p.unknownEffort).toBe(1);
    expect(p.plannedMinutes).toBe(30);
  });
});

describe('earnings', () => {
  const row = (o: Record<string, unknown>) => ({ id: 'e', amount: 0, currency: 'USDC', amount_usd: null, status: 'received', minutes_spent: null, paid_at: null, expected_at: null, created_at: '2026-11-01T00:00:00Z', category: null, project_name: null, ...o }) as never;

  it('never counts expected or pending amounts as earned', () => {
    const s = summarizeEarnings([
      row({ amount: 100, amount_usd: 100, status: 'received', minutes_spent: 120, paid_at: '2026-11-10T00:00:00Z', category: 'dex_testing', project_name: 'A' }),
      row({ amount: 500, amount_usd: 500, status: 'expected' }),
      row({ amount: 40, amount_usd: 40, status: 'pending', expected_at: '2026-11-20T00:00:00Z' }),
      row({ amount: 0.1, currency: 'eth', amount_usd: null, status: 'received', paid_at: '2026-10-03T00:00:00Z' }),
      row({ amount: 30, status: 'rejected' }),
    ], now);
    expect(s.received).toMatchObject({ count: 2, usd: 100, usdMissing: 1, byCurrency: { USDC: 100, ETH: 0.1 } });
    expect(s.expected.usd).toBe(500);
    expect(s.pending.usd).toBe(40);
    expect(s.overdue).toBe(1);
    expect(s.perHourUsd).toBe(50);
    expect(s.byMonth.map((m) => m.month)).toEqual(['2026-10', '2026-11']);
    expect(s.byCategory[0]).toEqual({ key: 'dex_testing', usd: 100, count: 1 });
  });
});

describe('payment reliability', () => {
  const ev = (o: Record<string, unknown>) => ({ project_id: 'p1', project_name: 'DemoDEX', evidence_type: 'verified_user_payment', outcome: 'paid_on_time', occurred_at: null, created_at: '2026-11-01T00:00:00Z', source_url: null, details: null, ...o }) as never;

  it('labels from verified evidence only and keeps allegations apart', () => {
    const [r] = paymentReliability([ev({}), ev({ evidence_type: 'official_announcement', outcome: 'paid' }), ev({ evidence_type: 'community_allegation', outcome: 'unpaid' })]);
    expect(r?.label).toBe('Paid in all 2 verified records');
    expect(r?.tone).toBe('good');
    expect(r?.allegations.unpaid).toBe(1);
  });
  it('says so when only allegations exist', () => {
    const [r] = paymentReliability([ev({ evidence_type: 'community_allegation', outcome: 'unpaid' })]);
    expect(r).toMatchObject({ label: 'No verified payment record', tone: 'none' });
  });
  it('marks late payments by the expected date', () => {
    expect(paymentOutcome('2026-11-10T00:00:00Z', '2026-11-09T12:00:00Z')).toBe('paid_on_time');
    expect(paymentOutcome('2026-11-15T00:00:00Z', '2026-11-09T00:00:00Z')).toBe('paid_late');
    expect(paymentOutcome('2026-11-15T00:00:00Z', null)).toBe('paid');
  });
});

describe('calendar', () => {
  it('places events on local days and skips duplicates of tracked applications', () => {
    const ev = buildCalendar({
      timeZone: TZ, from: '2026-11-01', to: '2026-11-30',
      applications: [{ id: 'a', title: 'Hackathon', deadline_at: null, follow_up_at: '2026-11-29T23:30:00Z', opportunity_deadline: '2026-11-28T10:00:00Z' }],
      tasks: [{ id: 't', title: 'Record demo', due_at: '2026-12-02T10:00:00Z', done: false }],
      reminders: [], earnings: [{ id: 'e', title: null, project_name: 'DemoDEX', expected_at: '2026-11-20T10:00:00Z', status: 'pending' }],
      saved: [{ id: 'o', title: 'Hackathon', deadline_at: '2026-11-28T10:00:00Z', registration_opens_at: null }],
    });
    expect(ev.map((e) => [e.date, e.kind])).toEqual([['2026-11-20', 'payment'], ['2026-11-28', 'deadline'], ['2026-11-30', 'follow_up']]);
    expect(localDate('2026-11-29T23:30:00Z', TZ)).toBe('2026-11-30');
  });
});
