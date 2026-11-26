import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Service-role database access. Server-side only — never import into client components. */
export function createServiceClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Job { id: string; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number; checkpoint: unknown }

export class Repo {
  constructor(public db: SupabaseClient) {}

  private must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  }

  // ---- jobs ---------------------------------------------------------------
  async enqueue(kind: string, payload: object, idempotencyKey: string, priority = 50, runAfter?: Date): Promise<boolean> {
    const r = await this.db.from('job_queue').upsert(
      { kind, payload, idempotency_key: idempotencyKey, priority, run_after: (runAfter ?? new Date()).toISOString() },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    ).select('id');
    this.must(r, 'enqueue');
    return (r.data?.length ?? 0) > 0;
  }
  async lease(worker: string, limit: number, leaseSeconds: number, kinds?: string[]): Promise<Job[]> {
    return this.must(await this.db.rpc('lease_jobs', { p_worker: worker, p_limit: limit, p_lease_seconds: leaseSeconds, p_kinds: kinds ?? null }), 'lease_jobs') as Job[];
  }
  async complete(id: string) {
    this.must(await this.db.from('job_queue').update({ status: 'succeeded', finished_at: new Date().toISOString(), leased_until: null }).eq('id', id), 'complete job');
  }
  async fail(id: string, error: string) {
    this.must(await this.db.rpc('fail_job', { p_id: id, p_error: error }), 'fail_job');
  }

  // ---- usage / budgets ----------------------------------------------------
  async usageToday(provider: string): Promise<number> {
    const day = new Date().toISOString().slice(0, 10);
    const r = await this.db.from('api_usage').select('units').eq('provider', provider).eq('day', day).maybeSingle();
    return Number(this.must(r, 'usageToday')?.units ?? 0);
  }
  async recordUsage(provider: string, ok: boolean, units: number, error?: string) {
    await this.db.rpc('bump_api_usage', { p_provider: provider, p_ok: ok, p_units: units, p_error: error ?? null });
  }

  // ---- cache ----------------------------------------------------------------
  async cacheGet(key: string): Promise<unknown | null> {
    const r = await this.db.from('search_cache').select('response, expires_at').eq('cache_key', key).maybeSingle();
    const row = this.must(r, 'cacheGet');
    return row && new Date(row.expires_at) > new Date() ? row.response : null;
  }
  async cacheSet(key: string, provider: string, value: unknown, hours: number) {
    await this.db.from('search_cache').upsert({ cache_key: key, provider, response: value, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + hours * 3600_000).toISOString() });
  }

  // ---- logs -----------------------------------------------------------------
  async log(agent: string, action: string, message: string, context?: object, level: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    await this.db.from('agent_logs').insert({ agent, action, level, message: message.slice(0, 2000), context: context ?? null });
  }
}
