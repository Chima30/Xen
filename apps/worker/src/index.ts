import {
  createServiceClient, expireOpportunities, handleUpdate, integrationStatus, loadServerEnv, Repo, RequestBudget, runTick,
  sendBriefing, sendDueReminders, verifyWebhookSecret, type ServerEnv, type TgUpdate,
} from '@xen/core';

/**
 * XEN Cloudflare Worker
 *  - scheduled(): cron dispatcher (UTC schedules; see wrangler.toml)
 *  - POST /telegram/webhook: Telegram updates (secret header verified)
 *  - POST /run: manual tick (Bearer CRON_SECRET)
 *  - GET  /health: integration status (no secrets)
 *
 * Workers Free: 10 ms CPU and 50 subrequests per invocation. Heavy pipeline ticks are
 * delegated to the web app (PIPELINE_RUNNER_URL) when configured; otherwise a tiny
 * in-Worker tick runs one job per invocation.
 */

export interface Env extends Record<string, unknown> { PIPELINE_RUNNER_URL?: string }

// Cron expressions → task. Africa/Lagos is UTC+1 year-round (no DST).
export const CRONS = {
  TICK: '*/15 * * * *',
  HOURLY: '5 * * * *',
  MORNING: '0 7 * * *',   // 08:00 WAT
  EVENING: '0 17 * * *',  // 18:00 WAT
  WEEKLY: '0 18 * * SUN', // 19:00 WAT Sunday
} as const;

function deps(env: Env) {
  const cfg = loadServerEnv(env);
  const repo = new Repo(createServiceClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY));
  return { cfg, repo };
}

async function tick(env: Env, cfg: ServerEnv, repo: Repo, trigger: string) {
  if (env.PIPELINE_RUNNER_URL) {
    const res = await fetch(env.PIPELINE_RUNNER_URL, { method: 'POST', headers: { authorization: `Bearer ${cfg.CRON_SECRET}`, 'x-xen-trigger': trigger } });
    if (!res.ok) throw new Error(`Pipeline runner returned ${res.status}`);
    return res.json();
  }
  // In-Worker fallback: conservative so DB calls + provider calls stay under 50 subrequests.
  return runTick({ env: cfg, repo, budget: new RequestBudget(12), workerId: `cf-${crypto.randomUUID().slice(0, 8)}` }, { maxSources: 1, maxJobs: 1, minRemainingRequests: 4 });
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const { cfg, repo } = deps(env);
    const run = async () => {
      const started = new Date();
      const scan = await repo.db.from('scan_history').insert({ trigger: event.cron }).select('id').single();
      let stats: unknown, error: string | null = null;
      try {
        switch (event.cron) {
          case CRONS.TICK: stats = await tick(env, cfg, repo, event.cron); break;
          case CRONS.HOURLY:
            stats = { reminders: await sendDueReminders(cfg, repo), expired: await expireOpportunities(repo) };
            if (started.getUTCHours() === 3) await repo.enqueue('purge', {}, `purge:${started.toISOString().slice(0, 10)}`, 10);
            break;
          case CRONS.MORNING: stats = { sent: await sendBriefing(cfg, repo, 'morning') }; break;
          case CRONS.EVENING: stats = { sent: await sendBriefing(cfg, repo, 'evening') }; break;
          case CRONS.WEEKLY: stats = { sent: await sendBriefing(cfg, repo, 'weekly') }; break;
          default: error = `Unknown cron ${event.cron}`;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      if (scan.data) await repo.db.from('scan_history').update({ finished_at: new Date().toISOString(), stats: stats ?? {}, error }).eq('id', scan.data.id);
      if (error) await repo.log('orchestrator', 'cron', `${event.cron}: ${error}`, undefined, 'error');
    };
    ctx.waitUntil(run());
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    let cfg: ServerEnv, repo: Repo;
    try { ({ cfg, repo } = deps(env)); } catch (e) {
      return Response.json({ ok: false, error: 'Worker misconfigured', detail: (e as Error).message.replace(/=.*?(;|$)/g, '$1') }, { status: 500 });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, service: 'xen-worker', integrations: integrationStatus(cfg), note: 'configured means credentials exist; it does not mean a live call succeeded' });
    }

    if (req.method === 'POST' && url.pathname === '/telegram/webhook') {
      if (!verifyWebhookSecret(req.headers.get('x-telegram-bot-api-secret-token'), cfg.TELEGRAM_WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });
      const len = Number(req.headers.get('content-length') ?? 0);
      if (len > 100_000) return new Response('Payload too large', { status: 413 });
      let update: TgUpdate;
      try { update = (await req.json()) as TgUpdate; } catch { return new Response('Bad request', { status: 400 }); }
      if (typeof update?.update_id !== 'number') return new Response('Bad request', { status: 400 });
      try {
        await handleUpdate(cfg, repo, update);
      } catch (e) {
        // Return 200 anyway: the update is recorded, and Telegram retries would only duplicate work.
        await repo.log('notification', 'telegram_update', (e as Error).message, { update_id: update.update_id }, 'error');
      }
      return new Response('ok');
    }

    if (req.method === 'POST' && url.pathname === '/run') {
      if (!verifyWebhookSecret(req.headers.get('authorization')?.replace(/^Bearer /, '') ?? null, cfg.CRON_SECRET)) return new Response('Forbidden', { status: 403 });
      return Response.json(await tick(env, cfg, repo, 'manual'));
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
