import { z } from 'zod';
import { STAGES } from '../types';

/**
 * Early-project signals (Project Intelligence agent). A signal is something a project
 * publicly said or did that suggests it is building, launching or recruiting. Every stored
 * signal carries a verbatim excerpt that was checked against the source text.
 */
export const SIGNAL_TYPES = [
  'funding', 'testnet_announced', 'beta_launch', 'waitlist', 'mainnet_launch', 'product_launch',
  'github_release', 'partnership', 'tester_recruitment', 'incentive_program', 'roadmap', 'docs_update',
  'deadline_change', 'reward_change', 'announcement_changed',
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const SIGNAL_LABELS: Record<SignalType, string> = {
  funding: 'Funding announced',
  testnet_announced: 'Testnet announced',
  beta_launch: 'Beta or alpha opened',
  waitlist: 'Waitlist opened',
  mainnet_launch: 'Mainnet launch',
  product_launch: 'Product launch',
  github_release: 'Software release',
  partnership: 'Partnership',
  tester_recruitment: 'Recruiting testers',
  incentive_program: 'Incentive program',
  roadmap: 'Roadmap update',
  docs_update: 'Documentation update',
  deadline_change: 'Deadline changed',
  reward_change: 'Reward terms changed',
  announcement_changed: 'Announcement updated',
};

/** Watchlist update types (watchlists.update_types) and which signals feed each one. */
export const UPDATE_TYPES = ['tester_recruitment', 'testnet', 'incentive', 'registration', 'deadline_change', 'funding', 'launch', 'community'] as const;
export type UpdateType = (typeof UPDATE_TYPES)[number];

export const UPDATE_TYPE_LABELS: Record<UpdateType, string> = {
  tester_recruitment: 'Tester recruitment',
  testnet: 'Testnets',
  incentive: 'Incentives and rewards',
  registration: 'Registrations and waitlists',
  deadline_change: 'Deadline changes',
  funding: 'Funding',
  launch: 'Launches and releases',
  community: 'Other announcement changes',
};

const SIGNAL_TO_UPDATE: Record<SignalType, UpdateType> = {
  funding: 'funding',
  testnet_announced: 'testnet',
  beta_launch: 'registration',
  waitlist: 'registration',
  mainnet_launch: 'launch',
  product_launch: 'launch',
  github_release: 'launch',
  partnership: 'community',
  tester_recruitment: 'tester_recruitment',
  incentive_program: 'incentive',
  roadmap: 'community',
  docs_update: 'community',
  deadline_change: 'deadline_change',
  reward_change: 'incentive',
  announcement_changed: 'community',
};
export const updateTypeForSignal = (t: SignalType): UpdateType => SIGNAL_TO_UPDATE[t];

/** Model output for the project the document is about, and the signals it states. */
const nstr = z.string().trim().min(1).nullable().catch(null);
export const ExtractedProjectSchema = z.object({
  name: nstr,
  website: nstr,
  description: z.string().trim().max(600).nullable().catch(null),
  category: nstr,
  ecosystems: z.array(z.string().trim().min(1).max(40)).max(10).catch([]),
  stage: z.enum(STAGES).catch('unknown'),
});
export type ExtractedProject = z.infer<typeof ExtractedProjectSchema>;

export const ExtractedSignalSchema = z.object({
  signal_type: z.enum(SIGNAL_TYPES),
  summary: z.string().trim().min(3).max(300),
  evidence_excerpt: z.string().trim().min(8).max(600),
  funding_amount_usd: z.number().positive().max(1e11).nullable().catch(null),
  funding_round: nstr,
  investors: z.array(z.string().trim().min(1).max(80)).max(12).catch([]),
});
export type ExtractedSignal = z.infer<typeof ExtractedSignalSchema>;
