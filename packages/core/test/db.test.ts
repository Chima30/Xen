/**
 * Migration + Row Level Security tests on an embedded Postgres (PGlite).
 * Supabase's auth/storage schemas are stubbed minimally. MOCKED environment — not the live database.
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const MIG_DIR = resolve(__dirname, '../../../supabase/migrations');
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
`;

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ''}', false); set role ${user ? 'authenticated' : 'anon'};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIG_DIR).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(resolve(MIG_DIR, f), 'utf8'));
  // Table privileges come from migration 0004 itself, so they are tested too.
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@test'), ('${B}', 'b@test');`);
}, 60_000);

describe('migrations', () => {
  it('apply cleanly and seed configuration (no opportunities)', async () => {
    const r = await db.query<{ n: number }>('select count(*)::int n from source_adapters');
    expect(r.rows[0]!.n).toBeGreaterThan(10);
    const o = await db.query<{ n: number }>('select count(*)::int n from opportunities');
    expect(o.rows[0]!.n).toBe(0);
  });
  it('signup trigger creates profile, preferences and notification preferences', async () => {
    const r = await db.query<{ p: number; up: number; np: number }>(`select (select count(*) from profiles)::int p, (select count(*) from user_preferences)::int up, (select count(*) from notification_preferences)::int np`);
    expect(r.rows[0]).toEqual({ p: 2, up: 2, np: 2 });
  });
  it('RLS is enabled on every public table', async () => {
    const r = await db.query<{ tablename: string }>(`select tablename from pg_tables where schemaname='public' and not rowsecurity`);
    expect(r.rows).toEqual([]);
  });
});

describe('job queue', () => {
  it('lease is exclusive, fail applies backoff, dead after max attempts', async () => {
    await db.exec(`insert into job_queue (kind, idempotency_key, max_attempts) values ('test', 'k1', 2)`);
    const l1 = await db.query<{ id: string }>(`select id from lease_jobs('w1', 5, 60, array['test'])`);
    const l2 = await db.query(`select id from lease_jobs('w2', 5, 60, array['test'])`);
    expect(l1.rows).toHaveLength(1);
    expect(l2.rows).toHaveLength(0); // already leased
    const id = l1.rows[0]!.id;
    await db.query('select fail_job($1, $2)', [id, 'boom']);
    let j = await db.query<{ status: string; future: boolean }>(`select status, run_after > now() future from job_queue where id=$1`, [id]);
    expect(j.rows[0]).toEqual({ status: 'pending', future: true });
    await db.exec(`update job_queue set run_after = now() - interval '1s' where id='${id}'`);
    await db.query(`select id from lease_jobs('w1', 5, 60, array['test'])`);
    await db.query('select fail_job($1, $2)', [id, 'boom again']);
    j = await db.query(`select status from job_queue where id=$1`, [id]);
    expect(j.rows[0]).toMatchObject({ status: 'dead' });
  });
  it('only service_role may call the queue and usage functions', async () => {
    await db.exec('set role service_role');
    try {
      await db.query(`select id from lease_jobs('w', 1, 60, array['none'])`);
      await db.query(`select bump_api_usage('test', true, 1, null)`);
    } finally {
      await db.exec('reset role');
    }
    await expect(as(A, () => db.query(`select id from lease_jobs('w', 1, 60, array['none'])`))).rejects.toThrow(/permission denied/);
  });
  it('idempotency key prevents duplicate jobs', async () => {
    await expect(db.exec(`insert into job_queue (kind, idempotency_key) values ('test', 'k1')`)).rejects.toThrow();
  });
  it('api usage accumulates per provider/day', async () => {
    await db.query(`select bump_api_usage('tavily', true, 1)`);
    await db.query(`select bump_api_usage('tavily', false, 1, 'quota')`);
    const r = await db.query<{ requests: number; failures: number }>(`select requests, failures from api_usage where provider='tavily'`);
    expect(r.rows[0]).toEqual({ requests: 2, failures: 1 });
  });
});

describe('dedupe constraints', () => {
  it('opportunity dedupe_key and announcement canonical_url are unique', async () => {
    const ins = `insert into opportunities (title, category, tier, source_url, canonical_url, content_hash, dedupe_key) values ('t','other','tier3','https://x','https://x','h','dk1')`;
    await db.exec(ins);
    await expect(db.exec(ins)).rejects.toThrow();
    await db.exec(`insert into announcements (canonical_url, content_hash) values ('https://a', 'h')`);
    await expect(db.exec(`insert into announcements (canonical_url, content_hash) values ('https://a', 'h2')`)).rejects.toThrow();
  });
  it('notification dedupe key blocks duplicate alerts', async () => {
    await db.exec(`insert into notifications (kind, dedupe_key) values ('new_opportunity', 'opp:1:chat')`);
    await expect(db.exec(`insert into notifications (kind, dedupe_key) values ('new_opportunity', 'opp:1:chat')`)).rejects.toThrow();
  });
  it('telegram update ids are processed once', async () => {
    await db.exec(`insert into telegram_updates (update_id) values (42)`);
    await expect(db.exec(`insert into telegram_updates (update_id) values (42)`)).rejects.toThrow();
  });
});

describe('row level security', () => {
  beforeAll(async () => {
    await db.exec(`insert into applications (user_id, title) values ('${A}', 'A private'), ('${B}', 'B private');
                   insert into earnings (user_id, amount, currency, status) values ('${A}', 100, 'USDC', 'received');`);
  });
  it('anon has no table access', async () => {
    for (const t of ['opportunities', 'applications', 'earnings', 'projects', 'job_queue', 'telegram_accounts']) {
      await expect(as(null, () => db.query(`select * from ${t}`)), t).rejects.toThrow(/permission denied/);
    }
  });
  it('users can edit their profile but not promote themselves to owner', async () => {
    await as(A, () => db.exec(`update profiles set display_name = 'A' where id = '${A}'`));
    await expect(as(A, () => db.exec(`update profiles set role = 'owner' where id = '${A}'`))).rejects.toThrow(/permission denied/);
    const r = await as(A, () => db.query<{ owner: boolean }>(`select is_owner() as owner`));
    expect(r.rows[0]!.owner).toBe(false);
  });
  it('saved filters are private to their owner', async () => {
    await as(A, () => db.exec(`insert into saved_filters (user_id, name, query) values ('${A}', 'zero capital', 'capital=none')`));
    const b = await as(B, () => db.query(`select * from saved_filters`));
    expect(b.rows).toHaveLength(0);
    await expect(as(B, () => db.exec(`insert into saved_filters (user_id, name, query) values ('${A}', 'x', 'y')`))).rejects.toThrow();
  });
  it('signed-in users can read shared tables (grants from migration 0004)', async () => {
    const r = await as(A, () => db.query<{ n: number }>(`select count(*)::int n from opportunities`));
    expect(r.rows[0]!.n).toBeGreaterThanOrEqual(0);
    const s = await as(A, () => db.query(`select * from source_health limit 1`));
    expect(Array.isArray(s.rows)).toBe(true);
  });
  it('users only see their own private rows', async () => {
    const a = await as(A, () => db.query<{ title: string }>(`select title from applications`));
    expect(a.rows.map((r) => r.title)).toEqual(['A private']);
    const b = await as(B, () => db.query(`select * from earnings`));
    expect(b.rows).toHaveLength(0);
  });
  it('users cannot write rows for another user', async () => {
    await expect(as(A, () => db.exec(`insert into applications (user_id, title) values ('${B}', 'spoof')`))).rejects.toThrow();
    const upd = await as(A, () => db.query(`update applications set title='hacked' where user_id='${B}' returning id`));
    expect(upd.rows).toHaveLength(0);
  });
  it('authenticated users can read shared intelligence but not write it', async () => {
    const r = await as(A, () => db.query(`select * from opportunities`));
    expect(r.rows.length).toBeGreaterThan(0);
    await expect(as(A, () => db.exec(`insert into opportunities (title, category, tier, source_url, canonical_url, content_hash, dedupe_key) values ('x','other','tier3','https://y','https://y','h','dk2')`))).rejects.toThrow();
  });
  it('service-only tables are hidden from authenticated users', async () => {
    for (const t of ['job_queue', 'search_cache', 'system_settings', 'telegram_updates']) {
      const r = await as(A, () => db.query(`select * from ${t}`));
      expect(r.rows, t).toHaveLength(0);
    }
  });
  it('users can only report community allegations, never verified payments', async () => {
    await db.exec(`insert into projects (slug, name) values ('p', 'P') on conflict do nothing`);
    await expect(as(A, () => db.exec(`insert into payment_history (project_id, reported_by, evidence_type, outcome) select id, '${A}', 'verified_user_payment', 'paid_on_time' from projects where slug='p'`))).rejects.toThrow();
    await as(A, () => db.exec(`insert into payment_history (project_id, reported_by, evidence_type, outcome) select id, '${A}', 'community_allegation', 'unpaid' from projects where slug='p'`));
  });
  it('privileged functions are not executable by clients', async () => {
    await expect(as(A, () => db.query(`select * from lease_jobs('x', 1, 1)`))).rejects.toThrow();
    await expect(as(A, () => db.query(`select purge_expired_data()`))).rejects.toThrow();
  });
  it('storage evidence objects are scoped to the owner folder', async () => {
    await expect(as(A, () => db.exec(`insert into storage.objects (bucket_id, name) values ('evidence', '${B}/x.png')`))).rejects.toThrow();
    await as(A, () => db.exec(`insert into storage.objects (bucket_id, name) values ('evidence', '${A}/x.png')`));
  });
});

describe('early intelligence (migration 0007)', () => {
  let projectId = '';
  let annId = '';
  beforeAll(async () => {
    const p = await db.query<{ id: string }>(`insert into projects (slug, name) values ('acme', 'Acme') returning id`);
    projectId = p.rows[0]!.id;
    const a = await db.query<{ id: string }>(`insert into announcements (canonical_url, content_hash, project_id) values ('https://acme.xyz/', 'h1', $1) returning id`, [projectId]);
    annId = a.rows[0]!.id;
  });
  it('registers the page monitor adapter', async () => {
    const r = await db.query(`select id from source_adapters where id = 'page' and supported`);
    expect(r.rows).toHaveLength(1);
  });
  it('stores signals with evidence and dedupes by content hash', async () => {
    const ins = `insert into project_signals (project_id, signal_type, summary, source_url, content_hash, evidence_excerpt, announcement_id, details)
                 values ($1, 'funding', 'Raised a seed round', 'https://acme.xyz/blog', 'sig1', 'Acme raised $3M', $2, '{"funding_amount_usd":3000000}')`;
    await db.query(ins, [projectId, annId]);
    await expect(db.query(ins, [projectId, annId])).rejects.toThrow();
  });
  it('records announcement changes once per version pair', async () => {
    const ins = `insert into announcement_changes (announcement_id, project_id, from_hash, to_hash, deadline_changed, significant) values ($1, $2, 'h1', 'h2', true, true)`;
    await db.query(ins, [annId, projectId]);
    await expect(db.query(ins, [annId, projectId])).rejects.toThrow();
  });
  it('signed-in users can read changes and signals but not write them; anon cannot read', async () => {
    const r = await as(A, () => db.query(`select deadline_changed from announcement_changes`));
    expect(r.rows).toEqual([{ deadline_changed: true }]);
    const s = await as(A, () => db.query(`select evidence_excerpt from project_signals`));
    expect(s.rows).toHaveLength(1);
    await expect(as(A, () => db.exec(`insert into announcement_changes (announcement_id, from_hash, to_hash) values ('${annId}', 'x', 'y')`))).rejects.toThrow();
    await expect(as(A, () => db.exec(`insert into project_signals (project_id, signal_type, summary, source_url, content_hash) values ('${projectId}', 'funding', 'x', 'https://x', 'h')`))).rejects.toThrow();
    await expect(as(null, () => db.query(`select * from announcement_changes`))).rejects.toThrow(/permission denied/);
  });
  it('watchlists stay private and keep per-project update types', async () => {
    await as(A, () => db.exec(`insert into watchlists (user_id, project_id, update_types, notes) values ('${A}', '${projectId}', array['funding','deadline_change'], 'check weekly')`));
    const mine = await as(A, () => db.query<{ update_types: string[] }>(`select update_types from watchlists`));
    expect(mine.rows[0]!.update_types).toEqual(['funding', 'deadline_change']);
    const theirs = await as(B, () => db.query(`select * from watchlists`));
    expect(theirs.rows).toHaveLength(0);
  });
});
