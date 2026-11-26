import { z } from 'zod';

export const CATEGORIES = {
  tier1: ['paid_beta_testing', 'paid_alpha_testing', 'prediction_market_testing', 'dex_testing', 'perp_testing',
    'spot_trading_testing', 'paid_feedback', 'usability_testing', 'bug_reporting', 'user_research', 'qa_testing'],
  tier2: ['incentivized_testnet', 'bug_bounty', 'trading_competition', 'community_testing', 'freelance', 'development',
    'design', 'ambassador', 'community_management', 'writing_bounty', 'hackathon', 'grant', 'ecosystem_campaign'],
  tier3: ['early_project', 'upcoming_launch', 'waitlist', 'other'],
} as const;
export const ALL_CATEGORIES = [...CATEGORIES.tier1, ...CATEGORIES.tier2, ...CATEGORIES.tier3] as const;
export type Category = (typeof ALL_CATEGORIES)[number];
export type Tier = 'tier1' | 'tier2' | 'tier3';
export function tierOf(c: Category): Tier {
  if ((CATEGORIES.tier1 as readonly string[]).includes(c)) return 'tier1';
  if ((CATEGORIES.tier2 as readonly string[]).includes(c)) return 'tier2';
  return 'tier3';
}

export const REWARD_STATUSES = ['confirmed', 'performance_based', 'speculative', 'unpaid', 'unverified'] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];
export const CAPITAL = ['none', 'gas_only', 'required', 'unknown'] as const;
export type Capital = (typeof CAPITAL)[number];
export const STAGES = ['research', 'under_development', 'private_alpha', 'public_alpha', 'closed_beta', 'public_beta', 'testnet', 'mainnet', 'established', 'unknown'] as const;
export type VerificationStatus = 'verified_announcement' | 'partially_verified' | 'unverified' | 'conflicting' | 'suspicious' | 'expired';

/** A normalized item collected from any source adapter, before analysis. */
export interface CollectedItem {
  adapterId: string;
  sourceId?: string;
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string | null;
  /** Full text if the adapter already has it (RSS content, Tavily raw content). */
  content?: string;
}

const nullableStr = z.string().trim().min(1).nullable().catch(null);
const isoDate = z.string().nullable().catch(null).transform((v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
});
const strArr = z.array(z.string().trim().min(1)).catch([]);

/** Zod validator for the model's structured output. Lenient on shape, strict on types. */
export const ExtractedOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(200),
  project_name: nullableStr,
  project_website: nullableStr,
  category: z.enum(ALL_CATEGORIES).catch('other'),
  description: z.string().trim().max(1200).catch(''),
  reward_amount: z.number().nonnegative().nullable().catch(null),
  reward_amount_max: z.number().nonnegative().nullable().catch(null),
  reward_currency: nullableStr,
  reward_conditions: nullableStr,
  reward_status_claim: z.enum(REWARD_STATUSES).catch('unverified'),
  reward_evidence_excerpt: nullableStr,
  capital: z.enum(CAPITAL).catch('unknown'),
  capital_evidence_excerpt: nullableStr,
  estimated_minutes: z.number().int().positive().max(100_000).nullable().catch(null),
  required_skills: strArr,
  instructions: nullableStr,
  application_url: nullableStr,
  announced_at: isoDate,
  registration_opens_at: isoDate,
  deadline_at: isoDate,
  deadline_excerpt: nullableStr,
  geo_restrictions: strArr,
  geo_allowed: strArr,
  eligibility_excerpt: nullableStr,
  kyc_required: z.boolean().nullable().catch(null),
  networks: strArr,
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().catch(null),
  missing_fields: strArr,
});
export type ExtractedOpportunity = z.infer<typeof ExtractedOpportunitySchema>;

export const ExtractionResultSchema = z.object({
  is_relevant: z.boolean(),
  irrelevance_reason: z.string().nullable().catch(null),
  project_stage: z.enum(STAGES).catch('unknown'),
  opportunities: z.array(z.unknown()).max(5).catch([]),
});

export interface UserProfile {
  countryCode: string;          // ISO alpha-2, e.g. 'NG'
  countryNames: string[];       // aliases used in announcements
  region: string;               // e.g. 'Africa'
  skills: string[];
  preferredCategories: string[];
  zeroCapitalMode: boolean;
  maxCapitalUsd: number;
  dailyMinutes: number;
  riskTolerance: 'low' | 'medium' | 'high';
  minRewardUsd?: number | null;
}

export const DEFAULT_PROFILE: UserProfile = {
  countryCode: 'NG',
  countryNames: ['nigeria', 'nigerian'],
  region: 'africa',
  skills: ['product_testing', 'bug_reporting', 'software_development', 'digital_art', 'design', 'hackathon'],
  preferredCategories: ['paid_beta_testing', 'prediction_market_testing', 'dex_testing', 'perp_testing', 'paid_feedback', 'bug_reporting', 'hackathon'],
  zeroCapitalMode: true,
  maxCapitalUsd: 0,
  dailyMinutes: 120,
  riskTolerance: 'low',
};
