/**
 * LIVE integration tests — call real APIs with credentials from the repo-root .env.
 * Each block is skipped (not passed) when its credentials are missing.
 * Run: pnpm --filter @xen/core test:live
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServiceClient, extractOpportunities, tavilySearch, tgCall } from '../../src';

config({ path: resolve(__dirname, '../../../../.env') });
const E = process.env;

describe.skipIf(!E.TAVILY_API_KEY)('LIVE Tavily', () => {
  it('returns results for a real query', async () => {
    const r = await tavilySearch(E.TAVILY_API_KEY!, 'web3 beta testers wanted', { maxResults: 3 });
    expect(r.results.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!E.GEMINI_API_KEY)('LIVE Gemini structured output', () => {
  it('returns schema-valid JSON and does not invent rewards for a no-reward text', async () => {
    const r = await extractOpportunities({ apiKey: E.GEMINI_API_KEY!, model: E.GEMINI_MODEL || 'gemini-3.5-flash-lite' },
      { url: 'https://example.org/post', title: 'Community update', text: 'We shipped a new dark mode for our DEX interface this week. Thanks to everyone using the app.' }, 4000);
    expect(r.opportunities.every((o) => o.reward_status_claim !== 'confirmed')).toBe(true);
  });
});

describe.skipIf(!E.TELEGRAM_BOT_TOKEN)('LIVE Telegram', () => {
  it('bot token is valid (getMe)', async () => {
    const me = await tgCall<{ is_bot: boolean }>(E.TELEGRAM_BOT_TOKEN!, 'getMe', {});
    expect(me.is_bot).toBe(true);
  });
});

describe.skipIf(!E.SUPABASE_SERVICE_ROLE_KEY || !(E.SUPABASE_URL || E.NEXT_PUBLIC_SUPABASE_URL))('LIVE Supabase permissions', () => {
  const url = (E.SUPABASE_URL || E.NEXT_PUBLIC_SUPABASE_URL)!;
  it('migrations applied (service role)', async () => {
    const db = createServiceClient(url, E.SUPABASE_SERVICE_ROLE_KEY!);
    const r = await db.from('source_adapters').select('id').limit(1);
    expect(r.error).toBeNull();
  });
  it.skipIf(!E.NEXT_PUBLIC_SUPABASE_ANON_KEY)('anonymous clients cannot read private or shared tables', async () => {
    const anon = createServiceClient(url, E.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    for (const t of ['opportunities', 'applications', 'earnings', 'telegram_accounts', 'job_queue', 'search_cache']) {
      const r = await anon.from(t).select('*').limit(1);
      expect(r.data ?? []).toHaveLength(0);
    }
    const w = await anon.from('opportunities').insert({ title: 'x', category: 'other', tier: 'tier3', source_url: 'https://x', canonical_url: 'https://x', content_hash: 'x', dedupe_key: 'anon-test' });
    expect(w.error).not.toBeNull();
  });
});
