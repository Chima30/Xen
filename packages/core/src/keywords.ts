/**
 * Keyword pre-filter. Runs before any AI call so that obviously irrelevant
 * content never costs tokens.
 */

const STRONG = [
  'beta tester', 'beta testers', 'alpha tester', 'testers needed', 'testers wanted', 'looking for testers', 'qa tester',
  'paid beta', 'paid testing', 'paid feedback', 'feedback bounty', 'feedback campaign', 'bug report', 'bug bounty',
  'user research', 'usability test', 'user testing', 'incentivized testnet', 'testnet rewards', 'testnet campaign',
  'early access', 'waitlist', 'trading competition', 'hackathon', 'grant program', 'grants program', 'bounty',
  'help us test', 'test our', 'earn usdc', 'earn usdt', 'paid in usdc', 'rewards for testing', 'ambassador program',
  'prediction market', 'perpetual', 'perp dex', 'testnet is live', 'public beta', 'closed beta', 'alpha access',
];
const MONEY = /(\$\s?\d[\d,]*(\.\d+)?\s?(k|m)?|\d[\d,]*\s?(usdc|usdt|usd|dai|eth|sol|op|arb)\b|prize pool|reward pool|paid|compensat|stipend|honorarium)/i;
const WEB3 = /\b(web3|crypto|defi|dex|blockchain|on-?chain|testnet|mainnet|wallet|token|protocol|l2|rollup|solana|ethereum|base|arbitrum|optimism|sui|aptos|hyperliquid|polymarket|nft|dao)\b/i;
const NEGATIVE = /\b(price prediction|price analysis|technical analysis|shitcoin|pump|100x|giveaway|send \d+ (eth|sol|btc)|double your)\b/i;

export interface PrefilterResult { pass: boolean; score: number; matched: string[] }

export function prefilter(text: string): PrefilterResult {
  const t = text.toLowerCase();
  const matched = STRONG.filter((k) => t.includes(k));
  let score = matched.length * 2;
  if (MONEY.test(text)) score += 2;
  if (WEB3.test(text)) score += 2;
  if (NEGATIVE.test(text)) score -= 4;
  // Need at least one strong opportunity phrase AND web3 context.
  const pass = matched.length > 0 && WEB3.test(text) && score >= 4;
  return { pass, score, matched };
}

export const DEFAULT_QUERY_LIBRARY: Record<'tier1' | 'tier2' | 'tier3', string[]> = {
  tier1: [
    'looking for beta testers crypto', 'paid beta testing web3', 'earn USDC for feedback', 'help us test our platform crypto rewards',
    'prediction market beta testers', 'DEX alpha testing rewards', 'perpetual exchange testnet incentivized', 'paid user research web3',
    'web3 product testing paid', 'bug reporting rewards testnet', 'QA testers wanted crypto', 'web3 feedback bounty',
  ],
  tier2: ['incentivized testnet launched', 'trading competition testnet rewards', 'web3 hackathon prizes', 'ecosystem grants open applications'],
  tier3: ['upcoming prediction markets', 'upcoming perpetual exchanges', 'newly funded DeFi startup seed round', 'trading platform beta launch'],
};

/** Query variants to rotate wording without new API calls for query generation. */
export function expandQuery(q: string, now = new Date()): string {
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const variants = [q, `${q} ${now.getUTCFullYear()}`, `${q} ${month} ${now.getUTCFullYear()}`];
  return variants[now.getUTCDate() % variants.length]!;
}
