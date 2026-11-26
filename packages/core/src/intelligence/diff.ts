/**
 * Announcement change detection (Monitoring agent). Compares two stored versions of the
 * same page line by line and pulls out what matters for a participant: dates and money.
 * Pure and deterministic, so it costs nothing and can be tested offline.
 */

export interface VersionDiff {
  added: string[];
  removed: string[];
  datesBefore: string[];
  datesAfter: string[];
  amountsBefore: string[];
  amountsAfter: string[];
  deadlineChanged: boolean;
  rewardChanged: boolean;
  /** True when the change is worth telling a watcher about (not just page noise). */
  significant: boolean;
}

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_RE = new RegExp(
  String.raw`\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+(?:${MONTHS})\.?,?\s+\d{4}|(?:${MONTHS})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})\b`,
  'gi',
);
const MONEY_RE = /(?:[$€£₦]\s?\d[\d,]*(?:\.\d+)?\s?[km]?\b|\b\d[\d,]*(?:\.\d+)?\s?[km]?\s?(?:usd|usdc|usdt|eth|sol|btc|dai|tokens|points)\b)/gi;
const DEADLINE_WORDS = /\b(deadline|ends?|closes?|closing|until|by|last day|extended|expires?|registration|apply before|submissions?)\b/i;
const REWARD_WORDS = /\b(reward|rewards|prize|prizes|bounty|bounties|paid|payout|pay|airdrop|points|incentive|allocation|pool)\b/i;
const NOTABLE_WORDS = /\b(testnet|mainnet|beta|alpha|waitlist|early access|testers?|launch(?:ed|ing)?|airdrop|incentiv\w*|reward|bounty|registration|deadline|funding|raised|seed round|series [a-c])\b/i;

/** Normalized, de-duplicated non-empty lines. Short boilerplate lines are ignored. */
export function meaningfulLines(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 12) continue; // nav labels, counters, timestamps
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.replace(/\s+/g, ' ').trim().toLowerCase()))];
const matchesOf = (re: RegExp, lines: string[]) => uniq(lines.flatMap((l) => l.match(re) ?? []));

export function diffVersions(before: string, after: string, maxLines = 40): VersionDiff {
  const a = meaningfulLines(before);
  const b = meaningfulLines(after);
  const aSet = new Set(a.map((l) => l.toLowerCase()));
  const bSet = new Set(b.map((l) => l.toLowerCase()));
  const added = b.filter((l) => !aSet.has(l.toLowerCase()));
  const removed = a.filter((l) => !bSet.has(l.toLowerCase()));

  // Dates and amounts only count from lines that changed and talk about deadlines / rewards.
  const deadlineAdded = added.filter((l) => DEADLINE_WORDS.test(l));
  const deadlineRemoved = removed.filter((l) => DEADLINE_WORDS.test(l));
  const rewardAdded = added.filter((l) => REWARD_WORDS.test(l));
  const rewardRemoved = removed.filter((l) => REWARD_WORDS.test(l));
  const datesBefore = matchesOf(DATE_RE, deadlineRemoved);
  const datesAfter = matchesOf(DATE_RE, deadlineAdded);
  const amountsBefore = matchesOf(MONEY_RE, rewardRemoved);
  const amountsAfter = matchesOf(MONEY_RE, rewardAdded);
  const setDiff = (x: string[], y: string[]) => x.some((v) => !y.includes(v)) || y.some((v) => !x.includes(v));
  const deadlineChanged = (datesBefore.length > 0 || datesAfter.length > 0) && setDiff(datesBefore, datesAfter);
  const rewardChanged = (amountsBefore.length > 0 || amountsAfter.length > 0) && setDiff(amountsBefore, amountsAfter);
  const significant = deadlineChanged || rewardChanged || added.some((l) => NOTABLE_WORDS.test(l));

  return {
    added: added.slice(0, maxLines).map((l) => l.slice(0, 400)),
    removed: removed.slice(0, maxLines).map((l) => l.slice(0, 400)),
    datesBefore, datesAfter, amountsBefore, amountsAfter, deadlineChanged, rewardChanged, significant,
  };
}

/** One-line human summary of a diff, for signals and alerts. */
export function summarizeDiff(d: VersionDiff): string {
  if (d.deadlineChanged) {
    const from = d.datesBefore.join(', ') || 'not stated';
    const to = d.datesAfter.join(', ') || 'not stated';
    return `Dates changed: ${from} → ${to}`;
  }
  if (d.rewardChanged) {
    const from = d.amountsBefore.join(', ') || 'not stated';
    const to = d.amountsAfter.join(', ') || 'not stated';
    return `Reward terms changed: ${from} → ${to}`;
  }
  const first = d.added.find((l) => NOTABLE_WORDS.test(l)) ?? d.added[0];
  return first ? `New text: “${first.slice(0, 160)}”` : `${d.removed.length} line(s) removed`;
}
