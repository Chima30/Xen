import { SIGNAL_LABELS, type SignalType } from './signals';

/**
 * Hidden Opportunity Finder. Ranks projects that may need testers even though no public
 * recruitment campaign was found. Everything is derived from stored, evidence-backed signals
 * and project facts. The output is a POTENTIAL OUTREACH LEAD, never a paid opportunity.
 */

export interface LeadInput {
  project: {
    id: string; name: string; website: string | null; stage: string; category: string | null;
    description: string | null; socials: Record<string, string> | null; github_repos: string[];
  };
  signals: { signal_type: SignalType; summary: string; source_url: string; evidence_excerpt: string | null; observed_at: string }[];
  /** Active opportunities already stored for this project, by category. */
  openOpportunityCategories: string[];
}

export interface Lead {
  projectId: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
  evidence: { label: string; summary: string; excerpt: string | null; url: string; observedAt: string }[];
  contacts: { label: string; url: string }[];
  approach: string;
}

const TESTING_CATEGORIES = ['paid_beta_testing', 'paid_alpha_testing', 'prediction_market_testing', 'dex_testing', 'perp_testing',
  'spot_trading_testing', 'paid_feedback', 'usability_testing', 'bug_reporting', 'user_research', 'qa_testing', 'community_testing'];

const PRE_LAUNCH_STAGES: Record<string, number> = {
  research: 5, under_development: 15, private_alpha: 25, public_alpha: 25, closed_beta: 25, public_beta: 20, testnet: 25,
  mainnet: 5, established: 0, unknown: 0,
};

const SIGNAL_WEIGHT: Partial<Record<SignalType, number>> = {
  funding: 25, beta_launch: 20, waitlist: 20, testnet_announced: 20, product_launch: 15, github_release: 10,
  tester_recruitment: 10, incentive_program: 5, roadmap: 5, docs_update: 5, partnership: 5,
};

const DAY = 86400e3;

export function scoreLead(i: LeadInput, now = Date.now()): Lead | null {
  // A project with an open testing opportunity is not "hidden": it is already in Discover.
  if (i.openOpportunityCategories.some((c) => TESTING_CATEGORIES.includes(c))) return null;
  if (['established'].includes(i.project.stage)) return null;

  const recent = i.signals.filter((s) => now - new Date(s.observed_at).getTime() <= 120 * DAY);
  const reasons: string[] = [];
  let score = PRE_LAUNCH_STAGES[i.project.stage] ?? 0;
  if (score >= 15) reasons.push(`Stage: ${i.project.stage.replaceAll('_', ' ')}`);

  const seenTypes = new Set<SignalType>();
  for (const s of recent) {
    if (seenTypes.has(s.signal_type)) continue; // count each kind once
    seenTypes.add(s.signal_type);
    const w = SIGNAL_WEIGHT[s.signal_type] ?? 0;
    if (!w) continue;
    const ageDays = (now - new Date(s.observed_at).getTime()) / DAY;
    score += ageDays <= 30 ? w : Math.round(w / 2);
    reasons.push(`${SIGNAL_LABELS[s.signal_type]} (${Math.round(ageDays)} days ago)`);
  }
  if (score < 25 || reasons.length === 0) return null;

  const contacts: { label: string; url: string }[] = [];
  if (i.project.website) contacts.push({ label: 'Website', url: i.project.website });
  for (const [k, v] of Object.entries(i.project.socials ?? {})) if (typeof v === 'string' && /^https?:\/\//.test(v)) contacts.push({ label: k, url: v });
  for (const r of i.project.github_repos ?? []) contacts.push({ label: 'GitHub', url: `https://github.com/${r}` });

  const types = [...seenTypes];
  const approach = suggestApproach(types, i.project.stage);
  score = Math.min(100, score);
  return {
    projectId: i.project.id,
    name: i.project.name,
    confidence: score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low',
    score,
    reasons,
    evidence: recent.slice(0, 6).map((s) => ({ label: SIGNAL_LABELS[s.signal_type], summary: s.summary, excerpt: s.evidence_excerpt, url: s.source_url, observedAt: s.observed_at })),
    contacts,
    approach,
  };
}

/** A plain, honest suggestion based on which signals exist. No invented details. */
export function suggestApproach(types: SignalType[], stage: string): string {
  const has = (t: SignalType) => types.includes(t);
  if (has('beta_launch') || has('waitlist')) {
    return 'Join the beta or waitlist first, use the product, then offer a short written test report with reproducible issues and screenshots. Ask whether they run a paid tester or feedback program.';
  }
  if (has('testnet_announced')) {
    return 'Take part in the testnet, file clear bug reports through their official channel, and ask whether structured QA or usability testing would help before mainnet.';
  }
  if (has('funding')) {
    return 'Recently funded teams often ship fast. Offer a one-off usability review or QA pass of their current product, with one concrete example of an issue you found.';
  }
  if (has('github_release') || has('product_launch')) {
    return 'Test the newest release, then offer focused feedback on what changed. Keep the first message short and include one specific finding.';
  }
  return stage === 'under_development'
    ? 'Follow their official channels and offer early product feedback once a public build is available.'
    : 'Use the product, note concrete issues, and offer testing or feedback through their official contact channel.';
}
