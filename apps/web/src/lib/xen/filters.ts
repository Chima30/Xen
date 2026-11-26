/** Discover filter parsing. Shared by the server query and the client filter form. */

export const SORTS = {
  score: "Highest score",
  newest: "Newest discovered",
  deadline: "Deadline soonest",
  reward: "Largest reward",
} as const;
export type Sort = keyof typeof SORTS;

export const PAGE_SIZE = 25;

export interface DiscoverFilters {
  q: string;
  category: string;
  project: string;
  minReward: number | null;
  currency: string;
  rewardStatus: string;
  verification: string;
  capital: string;
  network: string;
  eligibleOnly: boolean;
  difficulty: string;
  maxMinutes: number | null;
  deadline: "" | "has" | "7d" | "30d";
  publishedSince: "" | "7d" | "30d" | "90d";
  discoveredSince: "" | "24h" | "7d" | "30d";
  minScore: number | null;
  includeInactive: boolean;
  sort: Sort;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (p: Params, k: string) => {
  const v = p[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
};
const num = (s: string, min: number, max: number) => {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const pick = <T extends string>(s: string, allowed: readonly T[]): T | "" => ((allowed as readonly string[]).includes(s) ? (s as T) : "");

export function parseFilters(p: Params): DiscoverFilters {
  const sort = one(p, "sort");
  return {
    q: one(p, "q").slice(0, 120),
    category: one(p, "category").slice(0, 60),
    project: one(p, "project").slice(0, 120),
    minReward: num(one(p, "minReward"), 0, 1e12),
    currency: one(p, "currency").slice(0, 20),
    rewardStatus: one(p, "rewardStatus").slice(0, 30),
    verification: one(p, "verification").slice(0, 30),
    capital: one(p, "capital").slice(0, 20),
    network: one(p, "network").slice(0, 60),
    eligibleOnly: one(p, "eligible") === "1",
    difficulty: pick(one(p, "difficulty"), ["easy", "medium", "hard"] as const),
    maxMinutes: num(one(p, "maxMinutes"), 1, 100000),
    deadline: pick(one(p, "deadline"), ["has", "7d", "30d"] as const),
    publishedSince: pick(one(p, "published"), ["7d", "30d", "90d"] as const),
    discoveredSince: pick(one(p, "discovered"), ["24h", "7d", "30d"] as const),
    minScore: num(one(p, "minScore"), 0, 100),
    includeInactive: one(p, "inactive") === "1",
    sort: (sort in SORTS ? sort : "score") as Sort,
    page: Math.max(1, Math.floor(num(one(p, "page"), 1, 10000) ?? 1)),
  };
}

/** Number of non-default filters (for the "Filters (n)" badge). */
export function activeFilterCount(f: DiscoverFilters) {
  return [f.q, f.category, f.project, f.minReward, f.currency, f.rewardStatus, f.verification, f.capital, f.network,
    f.eligibleOnly, f.difficulty, f.maxMinutes, f.deadline, f.publishedSince, f.discoveredSince, f.minScore, f.includeInactive]
    .filter((v) => v !== "" && v !== null && v !== false).length;
}

export const SINCE_MS: Record<string, number> = { "24h": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3, "90d": 90 * 86400e3 };
