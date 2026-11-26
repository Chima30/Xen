/** Display labels and groupings. Pure data: safe for server and client. */

export const CATEGORY_LABELS: Record<string, string> = {
  paid_beta_testing: "Paid beta testing",
  paid_alpha_testing: "Paid alpha testing",
  prediction_market_testing: "Prediction market testing",
  dex_testing: "DEX testing",
  perp_testing: "Perp exchange testing",
  spot_trading_testing: "Spot trading testing",
  paid_feedback: "Paid feedback",
  usability_testing: "Usability testing",
  bug_reporting: "Bug reporting",
  user_research: "User research",
  qa_testing: "QA testing",
  incentivized_testnet: "Incentivized testnet",
  bug_bounty: "Bug bounty",
  trading_competition: "Trading competition",
  community_testing: "Community testing",
  freelance: "Freelance",
  development: "Development",
  design: "Design",
  ambassador: "Ambassador",
  community_management: "Community management",
  writing_bounty: "Writing bounty",
  hackathon: "Hackathon",
  grant: "Grant",
  ecosystem_campaign: "Ecosystem campaign",
  early_project: "Early project",
  upcoming_launch: "Upcoming launch",
  waitlist: "Waitlist",
  other: "Other",
};

export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c.replaceAll("_", " ");

/** Discover sub-pages. Each is a fixed category preset over the same filterable list. */
export const GROUPS = {
  "paid-testing": {
    label: "Paid Testing",
    description: "Paid beta and alpha testing, feedback, usability, QA and user research.",
    categories: ["paid_beta_testing", "paid_alpha_testing", "paid_feedback", "usability_testing", "bug_reporting", "user_research", "qa_testing", "community_testing"],
  },
  "prediction-markets": {
    label: "Prediction Markets",
    description: "Testing programs and early access for prediction markets.",
    categories: ["prediction_market_testing"],
  },
  "trading-platforms": {
    label: "Trading Platforms",
    description: "DEX, perpetual and spot trading tests, and trading competitions.",
    categories: ["dex_testing", "perp_testing", "spot_trading_testing", "trading_competition"],
  },
  "incentivized-testnets": {
    label: "Incentivized Testnets",
    description: "Testnets with announced or expected participation incentives.",
    categories: ["incentivized_testnet"],
  },
  "early-projects": {
    label: "Early Projects",
    description: "Waitlists, upcoming launches and early-stage projects.",
    categories: ["early_project", "upcoming_launch", "waitlist"],
  },
  "bug-bounties": {
    label: "Bug Bounties",
    description: "Security and bug bounty programs.",
    categories: ["bug_bounty"],
  },
  hackathons: {
    label: "Hackathons",
    description: "Hackathons with prizes.",
    categories: ["hackathon"],
  },
  "jobs-gigs": {
    label: "Jobs and Gigs",
    description: "Freelance, development, design, writing, ambassador and community work.",
    categories: ["freelance", "development", "design", "ambassador", "community_management", "writing_bounty"],
  },
  grants: {
    label: "Grants",
    description: "Ecosystem grants and campaigns.",
    categories: ["grant", "ecosystem_campaign"],
  },
} as const satisfies Record<string, { label: string; description: string; categories: readonly string[] }>;
export type GroupSlug = keyof typeof GROUPS;
export const isGroupSlug = (s: string): s is GroupSlug => s in GROUPS;

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

export const REWARD_STATUS: Record<string, { label: string; tone: Tone; hint: string }> = {
  confirmed: { label: "Confirmed paid", tone: "ok", hint: "The source explicitly states a reward." },
  performance_based: { label: "Performance based", tone: "info", hint: "Paid depending on results, e.g. accepted bugs or rankings." },
  speculative: { label: "Speculative", tone: "warn", hint: "Possible future reward. Not guaranteed income." },
  unpaid: { label: "Unpaid", tone: "neutral", hint: "The source states there is no payment." },
  unverified: { label: "Unverified", tone: "neutral", hint: "No reward evidence was found in the source." },
};

export const VERIFICATION: Record<string, { label: string; tone: Tone }> = {
  verified_announcement: { label: "Verified announcement", tone: "ok" },
  partially_verified: { label: "Partially verified", tone: "info" },
  unverified: { label: "Unverified", tone: "neutral" },
  conflicting: { label: "Conflicting", tone: "warn" },
  suspicious: { label: "Suspicious", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

export const CAPITAL: Record<string, { label: string; tone: Tone }> = {
  none: { label: "No capital", tone: "ok" },
  gas_only: { label: "Gas only", tone: "info" },
  required: { label: "Capital required", tone: "warn" },
  unknown: { label: "Capital unknown", tone: "neutral" },
};

export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  high: { label: "High priority", tone: "ok" },
  investigate: { label: "Worth investigating", tone: "info" },
  low: { label: "Low", tone: "neutral" },
};

export const RISK_FLAG_LABELS: Record<string, string> = {
  requests_seed_phrase: "Asks for a seed phrase or private key",
  upfront_payment: "Asks for an upfront fee",
  wallet_drain_language: "Wallet-drain language",
  unlimited_approval: "Asks for unlimited token approval",
  guaranteed_returns: "Promises guaranteed returns",
  impersonation_suspected: "Possible impersonation of a known brand",
  prompt_injection_attempt: "Contains instructions aimed at AI systems",
  urgency_pressure: "Pressure to act immediately",
  unofficial_application_link: "Application link is not on the official domain",
  unclear_reward_terms: "Unclear reward terms",
  reward_amount_unsupported: "Reward amount not found in the source",
  reward_claim_unsupported: "Reward claim not supported by the source",
  expired: "Deadline passed",
};
export const riskLabel = (f: string) => RISK_FLAG_LABELS[f] ?? f.replaceAll("_", " ");

export const TONE_CLASS: Record<Tone, string> = {
  ok: "border-ok/30 bg-ok/10 text-ok",
  warn: "border-warn/30 bg-warn/10 text-warn",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-primary/10 text-primary",
  neutral: "border-border bg-muted text-muted-foreground",
};
