import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import worker, { CRONS } from '../src/index';

// MOCKED: no network. Exercises request authorization paths that return before any DB/Telegram call.
const env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(40), GEMINI_API_KEY: 'g'.repeat(20),
  CRON_SECRET: 's'.repeat(32), TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_WEBHOOK_SECRET: 'w'.repeat(32) };

describe('worker routing & webhook validation', () => {
  it('rejects webhook without secret header', async () => {
    const r = await worker.fetch(new Request('https://w/telegram/webhook', { method: 'POST', body: '{}' }), env as never);
    expect(r.status).toBe(403);
  });
  it('rejects webhook with wrong secret', async () => {
    const r = await worker.fetch(new Request('https://w/telegram/webhook', { method: 'POST', body: '{}', headers: { 'x-telegram-bot-api-secret-token': 'x'.repeat(32) } }), env as never);
    expect(r.status).toBe(403);
  });
  it('rejects malformed update with valid secret', async () => {
    const r = await worker.fetch(new Request('https://w/telegram/webhook', { method: 'POST', body: '{"nope":1}', headers: { 'x-telegram-bot-api-secret-token': 'w'.repeat(32) } }), env as never);
    expect(r.status).toBe(400);
  });
  it('manual run requires CRON_SECRET', async () => {
    const r = await worker.fetch(new Request('https://w/run', { method: 'POST', headers: { authorization: 'Bearer wrong' } }), env as never);
    expect(r.status).toBe(403);
  });
  it('health never exposes secrets', async () => {
    const r = await worker.fetch(new Request('https://w/health'), env as never);
    const body = await r.text();
    expect(r.status).toBe(200);
    for (const v of Object.values(env)) if (v.length > 10) expect(body).not.toContain(v);
  });
  it('misconfigured worker fails safely', async () => {
    const r = await worker.fetch(new Request('https://w/health'), {} as never);
    expect(r.status).toBe(500);
  });
});

describe('cron schedule', () => {
  it('wrangler.toml crons match handler dispatch table and fit the free-plan limit of 5', () => {
    const toml = readFileSync('wrangler.toml', 'utf8'); // vitest runs with cwd = apps/worker
    const crons = [...toml.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);
    expect(crons.sort()).toEqual(Object.values(CRONS).sort());
    expect(crons.length).toBeLessThanOrEqual(5);
  });
  it('briefing times convert WAT→UTC correctly', () => {
    expect(CRONS.MORNING).toBe('0 7 * * *');   // 08:00 WAT
    expect(CRONS.EVENING).toBe('0 17 * * *');  // 18:00 WAT
  });
});
