import type { ExtractedOpportunity, RewardStatus, VerificationStatus } from './types';
import { detectInjection, excerptAppearsIn } from './text';
import { registrableDomain } from './url';

/**
 * Deterministic verification. The model proposes; these checks decide.
 * Verification is never a guarantee of safety — it only measures evidence.
 */

/** Hosts where projects legitimately run campaigns or forms (neutral: not official, not suspicious). */
export const KNOWN_PLATFORM_DOMAINS = new Set([
  'galxe.com', 'layer3.xyz', 'superteam.fun', 'immunefi.com', 'cantina.xyz', 'code4rena.com', 'sherlock.xyz', 'dorahacks.io',
  'ethglobal.com', 'questn.com', 'zealy.io', 'typeform.com', 'google.com', 'forms.gle', 'tally.so', 'notion.site', 'notion.so',
  'airtable.com', 'jotform.com', 'hackenproof.com', 'gitcoin.co', 'devpost.com', 'web3.career', 'wellfound.com', 'lu.ma',
  'medium.com', 'mirror.xyz', 'substack.com', 'github.com', 'x.com', 'discord.gg', 'discord.com', 't.me', 'reddit.com',
  'paragraph.xyz', 'gitbook.io', 'hackerone.com', 'bugcrowd.com', 'userinterviews.com', 'respondent.io',
]);

/** Brands frequently impersonated, with their official registrable domains. */
const BRANDS: Record<string, string[]> = {
  uniswap: ['uniswap.org'], polymarket: ['polymarket.com'], hyperliquid: ['hyperliquid.xyz'], dydx: ['dydx.exchange', 'dydx.trade'],
  metamask: ['metamask.io'], binance: ['binance.com'], coinbase: ['coinbase.com'], pancakeswap: ['pancakeswap.finance'],
  opensea: ['opensea.io'], aave: ['aave.com'], kalshi: ['kalshi.com'], phantom: ['phantom.app', 'phantom.com'], jupiter: ['jup.ag'],
  arbitrum: ['arbitrum.io', 'arbitrum.foundation'], optimism: ['optimism.io'], layerzero: ['layerzero.network'], ledger: ['ledger.com'],
};

const SEVERE_PATTERNS: Array<[string, RegExp]> = [
  // [^\n] rather than [^.] so decimal amounts ("0.05 ETH") don't break the match.
  ['requests_seed_phrase', /\b(enter|provide|submit|share|import|verify)\b[^\n]{0,50}\b(seed phrase|recovery phrase|secret phrase|mnemonic|private key)\b/i],
  ['upfront_payment', /\b(send|deposit|pay|transfer)\b[^\n]{0,50}\b(registration|activation|verification|processing|unlock|whitelist|access) fee\b|\b(send|deposit|transfer)\b[^\n]{0,50}\bto (unlock|activate|receive your|claim your)\b/i],
  ['wallet_drain_language', /\b(validate|synchroni[sz]e|rectify|restore) (your )?wallet\b/i],
  ['unlimited_approval', /\b(unlimited|infinite) (token )?approval\b|\bsetApprovalForAll\b/i],
  ['guaranteed_returns', /\bguaranteed (profit|returns|income|payout)\b|\bdouble your (crypto|eth|money)\b/i],
];
const MILD_PATTERNS: Array<[string, RegExp]> = [
  ['urgency_pressure', /\b(only \d+ (spots|slots) left|act now|expires in \d+ (minutes|hours)|last chance)\b/i],
  ['claim_language', /\bclaim (your )?(airdrop|reward|tokens) now\b/i],
];

export interface VerificationInput {
  sourceUrl: string;
  sourceText: string;
  extracted: ExtractedOpportunity;
  /** Official domain known from the project profile, if any. */
  knownProjectDomain?: string | null;
  now?: Date;
}

export interface VerificationCheck { name: string; passed: boolean | null; detail: string }

export interface VerificationResult {
  status: VerificationStatus;
  confidence: number;
  riskFlags: string[];
  rewardStatus: RewardStatus;
  checks: VerificationCheck[];
  /** Evidence excerpts that were confirmed to exist in the source text. */
  confirmedEvidence: Array<{ kind: 'reward' | 'eligibility' | 'deadline' | 'capital'; excerpt: string }>;
}

export function lookalikeBrand(domain: string): string | null {
  const d = domain.toLowerCase();
  for (const [brand, official] of Object.entries(BRANDS)) {
    if (official.includes(d)) return null;
    if (d.includes(brand)) return brand;
  }
  return null;
}

/** Reconcile the model's reward claim with evidence actually present in the source. */
export function classifyReward(claim: RewardStatus, excerpt: string | null, sourceText: string): { status: RewardStatus; evidenceOk: boolean } {
  const evidenceOk = !!excerpt && excerptAppearsIn(excerpt, sourceText);
  if (claim === 'confirmed' || claim === 'performance_based') {
    // A paid claim without verifiable evidence is downgraded.
    return { status: evidenceOk ? claim : 'unverified', evidenceOk };
  }
  if (claim === 'unpaid') return { status: evidenceOk ? 'unpaid' : 'unverified', evidenceOk };
  // speculative stays speculative; it must never be upgraded
  return { status: claim, evidenceOk };
}

export function verifyOpportunity(input: VerificationInput): VerificationResult {
  const { extracted: x, sourceText, sourceUrl } = input;
  const now = input.now ?? new Date();
  const checks: VerificationCheck[] = [];
  const riskFlags: string[] = [];
  const confirmedEvidence: VerificationResult['confirmedEvidence'] = [];

  const sourceDomain = registrableDomain(sourceUrl);
  const projectDomain = input.knownProjectDomain ?? (x.project_website ? safeDomain(x.project_website) : null);
  const appDomain = x.application_url ? safeDomain(x.application_url) : null;

  // 1. Source officialness
  const sourceIsProject = !!projectDomain && sourceDomain === projectDomain;
  const sourceIsPlatform = KNOWN_PLATFORM_DOMAINS.has(sourceDomain);
  checks.push({ name: 'official_source', passed: sourceIsProject ? true : sourceIsPlatform ? null : false,
    detail: sourceIsProject ? `Source is on the project domain ${projectDomain}` : sourceIsPlatform ? `Source is a known platform (${sourceDomain}); authorship not confirmed` : `Source domain ${sourceDomain} does not match a known project domain` });

  // 2. Application link
  if (appDomain) {
    const ok = appDomain === projectDomain || appDomain === sourceDomain || KNOWN_PLATFORM_DOMAINS.has(appDomain);
    checks.push({ name: 'application_link', passed: ok, detail: ok ? `Application link on ${appDomain}` : `Application link on unrelated domain ${appDomain}` });
    if (!ok) riskFlags.push('unofficial_application_link');
  } else {
    checks.push({ name: 'application_link', passed: null, detail: 'No application link found' });
  }

  // 3. Lookalike / impersonation
  for (const d of [sourceDomain, appDomain, projectDomain].filter((v): v is string => !!v)) {
    const brand = lookalikeBrand(d);
    if (brand) { riskFlags.push('impersonation_suspected'); checks.push({ name: 'impersonation', passed: false, detail: `${d} references "${brand}" but is not its official domain` }); }
  }

  // 4. Scam/phishing language in the source itself
  for (const [flag, re] of SEVERE_PATTERNS) if (re.test(sourceText)) riskFlags.push(flag);
  for (const [flag, re] of MILD_PATTERNS) if (re.test(sourceText)) riskFlags.push(flag);

  // 5. Prompt injection inside content
  if (detectInjection(sourceText).length) riskFlags.push('prompt_injection_attempt');

  // 6. Reward evidence
  const reward = classifyReward(x.reward_status_claim, x.reward_evidence_excerpt, sourceText);
  checks.push({ name: 'reward_evidence', passed: reward.evidenceOk ? true : x.reward_evidence_excerpt ? false : null,
    detail: reward.evidenceOk ? 'Reward excerpt found in source' : x.reward_evidence_excerpt ? 'Model-supplied reward excerpt not found in source (discarded)' : 'No reward excerpt supplied' });
  if (reward.evidenceOk && x.reward_evidence_excerpt) confirmedEvidence.push({ kind: 'reward', excerpt: x.reward_evidence_excerpt });
  if (x.reward_status_claim !== reward.status) riskFlags.push('reward_claim_unsupported');
  if (reward.status === 'unverified' || (x.reward_amount === null && reward.status === 'confirmed')) riskFlags.push('unclear_reward_terms');

  for (const [kind, ex] of [['eligibility', x.eligibility_excerpt], ['deadline', x.deadline_excerpt], ['capital', x.capital_evidence_excerpt]] as const) {
    if (ex && excerptAppearsIn(ex, sourceText)) confirmedEvidence.push({ kind, excerpt: ex });
  }

  // 7. Amount sanity: the stated amount should appear in the text
  // Every stated amount (and the range maximum) must appear in the source as money:
  // next to a currency symbol or code, or a reward word, not just as any number on the page.
  const amounts = [x.reward_amount, x.reward_amount_max].filter((a): a is number => a !== null);
  if (amounts.length) {
    const missing = amounts.filter((a) => !amountAppearsAsMoney(sourceText, a, x.reward_currency));
    const present = missing.length === 0;
    const shown = amounts.join('–');
    checks.push({ name: 'reward_amount_in_source', passed: present,
      detail: present ? `Amount ${shown} appears in the source as a reward` : `Amount ${missing.join(' and ')} not found in the source as a reward` });
    if (!present) riskFlags.push('reward_amount_unsupported');
  }

  // 8. Expiry
  const expired = !!x.deadline_at && new Date(x.deadline_at).getTime() < now.getTime();
  checks.push({ name: 'deadline', passed: x.deadline_at ? !expired : null, detail: x.deadline_at ? (expired ? 'Deadline has passed' : 'Deadline in the future') : 'No deadline stated' });

  // Status
  const severe = riskFlags.some((f) => ['requests_seed_phrase', 'upfront_payment', 'wallet_drain_language', 'impersonation_suspected', 'unlimited_approval', 'guaranteed_returns', 'prompt_injection_attempt'].includes(f));
  const conflicting = riskFlags.includes('reward_amount_unsupported') && reward.evidenceOk;
  let status: VerificationStatus;
  if (severe) status = 'suspicious';
  else if (expired) status = 'expired';
  else if (conflicting) status = 'conflicting';
  else if (sourceIsProject && (reward.evidenceOk || reward.status === 'speculative')) status = 'verified_announcement';
  else if (reward.evidenceOk || sourceIsProject || sourceIsPlatform) status = 'partially_verified';
  else status = 'unverified';

  // Confidence: evidence-weighted, penalized for missing data and risk.
  let c = 0.2;
  if (sourceIsProject) c += 0.3; else if (sourceIsPlatform) c += 0.1;
  if (reward.evidenceOk) c += 0.2;
  if (appDomain && !riskFlags.includes('unofficial_application_link')) c += 0.1;
  c += Math.min(0.15, confirmedEvidence.length * 0.05);
  c -= Math.min(0.2, x.missing_fields.length * 0.03);
  c -= riskFlags.length * 0.05;
  if (severe) c = Math.min(c, 0.15);
  const confidence = Math.max(0, Math.min(1, Math.round(c * 1000) / 1000));

  return { status, confidence, riskFlags: [...new Set(riskFlags)], rewardStatus: reward.status, checks, confirmedEvidence };
}

function safeDomain(u: string): string | null {
  try { return registrableDomain(new URL(u.startsWith('http') ? u : `https://${u}`).hostname); } catch { return null; }
}

const MONEY_WORDS = String.raw`\$|€|£|₦|usd|usdc|usdt|dai|eth|btc|sol|ngn|eur|gbp|rewards?|bounty|prizes?|paid|pay|payout|grant|tokens?|points?`;

/**
 * True when `amount` appears in `text` with money context within a few characters:
 * "$1,000", "1000 USDC", "USD 25000", "5k USDT", "reward: 300". Plain numbers such as
 * "1000 users" or a year do not count.
 */
export function amountAppearsAsMoney(text: string, amount: number, currency?: string | null): boolean {
  const flat = text.replace(/(\d),(\d{3})/g, '$1$2').toLowerCase();
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const forms = [String(amount)];
  if (amount >= 1000 && amount % 100 === 0) forms.push(`${amount / 1000}k`);
  if (amount >= 1_000_000 && amount % 100_000 === 0) forms.push(`${amount / 1_000_000}m`);
  // A currency like "AERX points" also matches its parts ("AERX"), as sources often write only the ticker.
  const cur = (currency ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 2).map(esc);
  const words = [MONEY_WORDS, ...cur].join("|");
  for (const f of forms) {
    const num = String.raw`(?<![\d.])` + esc(f) + String.raw`(?!\d|\.\d)`;
    const before = new RegExp(String.raw`(?:${words})[\s:=]{0,3}(?:\$\s?)?` + num);
    const after = new RegExp(num + String.raw`\s{0,2}(?:${words})`);
    if (before.test(flat) || after.test(flat)) return true;
  }
  return false;
}
