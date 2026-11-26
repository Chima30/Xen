/**
 * FIXTURES — synthetic test data only. These are NOT real opportunities and
 * must never be inserted into a production database.
 */
import type { ExtractedOpportunity } from '../src/types';

export const FIXTURE_SOURCE_URL = 'https://blog.fixture-perps.example/beta-testers';
export const FIXTURE_SOURCE_TEXT = `FixturePerps is looking for beta testers for our perpetual exchange testnet.
Selected testers will be paid 150 USDC after submitting a feedback report of at least 10 findings.
The program is open globally except for the United States and sanctioned countries.
No deposit is required — testnet funds are provided via our faucet.
Applications close on 2099-01-15. Apply at https://fixture-perps.example/apply`;

export function fixtureExtraction(over: Partial<ExtractedOpportunity> = {}): ExtractedOpportunity {
  return {
    title: 'FixturePerps paid beta testing',
    project_name: 'FixturePerps',
    project_website: 'https://fixture-perps.example',
    category: 'perp_testing',
    description: 'Paid testnet beta for a perpetual exchange.',
    reward_amount: 150,
    reward_amount_max: null,
    reward_currency: 'USDC',
    reward_conditions: 'Submit a feedback report with at least 10 findings',
    reward_status_claim: 'confirmed',
    reward_evidence_excerpt: 'Selected testers will be paid 150 USDC after submitting a feedback report',
    capital: 'none',
    capital_evidence_excerpt: 'No deposit is required — testnet funds are provided via our faucet.',
    estimated_minutes: 180,
    required_skills: ['product_testing'],
    instructions: 'Apply via the form',
    application_url: 'https://fixture-perps.example/apply',
    announced_at: null,
    registration_opens_at: null,
    deadline_at: '2099-01-15T00:00:00.000Z',
    deadline_excerpt: 'Applications close on 2099-01-15.',
    geo_restrictions: ['United States', 'sanctioned countries'],
    geo_allowed: ['global'],
    eligibility_excerpt: 'The program is open globally except for the United States and sanctioned countries.',
    kyc_required: null,
    networks: [],
    difficulty: 'medium',
    missing_fields: [],
    ...over,
  };
}
