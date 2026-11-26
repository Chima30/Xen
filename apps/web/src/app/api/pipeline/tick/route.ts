import { Repo, RequestBudget, runTick, verifyWebhookSecret } from "@xen/core";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Pipeline runner. Called by the Cloudflare Worker cron (PIPELINE_RUNNER_URL) with
 * `Authorization: Bearer <CRON_SECRET>`. Runs on Node where there is no 50-subrequest cap.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const env = serverEnv();
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!verifyWebhookSecret(token, env.CRON_SECRET)) return new Response("Forbidden", { status: 403 });

  const repo = new Repo(createAdminClient());
  const stats = await runTick(
    { env, repo, budget: new RequestBudget(120), workerId: `vercel-${crypto.randomUUID().slice(0, 8)}` },
    { maxSources: 3, maxJobs: env.PIPELINE_MAX_ITEMS_PER_RUN },
  );
  return Response.json({ ok: true, trigger: req.headers.get("x-xen-trigger") ?? "manual", ...stats });
}
