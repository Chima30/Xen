# Setup

Everything below uses free tiers. Nothing here enables paid usage.

## 1. Supabase (database + auth)

1. Create a project at <https://supabase.com/dashboard>. The free plan gives 500 MB per project, and the project pauses after about a week without activity. XEN's cron jobs count as activity.
2. Apply the migrations, in order. Use either method:
   - **SQL editor:** paste and run each file in `supabase/migrations/` in filename order.
   - **CLI:** `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Go to **Project Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only)
4. Go to **Authentication → URL Configuration**. Set the Site URL to your app URL and add `http://localhost:3000/auth/callback` plus `https://<your-app>/auth/callback` as redirect URLs.

## 2. Gemini

Create a key at <https://aistudio.google.com/apikey> and set `GEMINI_API_KEY`. The default model is `gemini-3.5-flash-lite` (stable and free on the free tier). You can override it with `GEMINI_MODEL`. Google Search grounding is **not** available on the free tier for Gemini 3.x, so `FEATURE_GEMINI_GROUNDING` stays `false`.

## 3. Tavily

Create a key at <https://app.tavily.com> and set `TAVILY_API_KEY`. The free plan gives 1,000 credits a month; a basic search costs 1 credit. `BUDGET_TAVILY_DAILY=30` keeps usage at about 900 a month, and results are cached for 24 hours.

## 4. Telegram bot

1. Message **@BotFather** → `/newbot` → copy the token into `TELEGRAM_BOT_TOKEN`.
2. Generate a webhook secret (letters, digits, `_` and `-` only), e.g. `openssl rand -hex 32` → `TELEGRAM_WEBHOOK_SECRET`.
3. Send any message to your bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id` → `TELEGRAM_CHAT_ID`. This is the owner chat for alerts.
4. After deploying the Worker (step 6), register the webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://xen-worker.<your-subdomain>.workers.dev/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
     -d 'allowed_updates=["message","callback_query"]'
   ```

## 5. Run the live milestone

```bash
pnpm install
cp .env.example .env   # fill required + milestone keys
pnpm milestone -- --ignore-quiet-hours
```

The milestone runs a real Tavily search and fetches the original pages. It extracts opportunities with Gemini, verifies and scores them, stores them in Supabase and sends a Telegram alert. It then runs a second time to confirm that no duplicate records or alerts are created. If no result is good enough to alert on, it says so and sends nothing.

## 6. Cloudflare Worker (cron + webhook)

```bash
cd apps/worker
npx wrangler login
for s in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY GEMINI_API_KEY CRON_SECRET TAVILY_API_KEY \
         TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET TELEGRAM_CHAT_ID; do npx wrangler secret put $s; done
npx wrangler deploy
curl https://xen-worker.<subdomain>.workers.dev/health
```

Limits on the Workers Free plan: **10 ms of CPU and 50 subrequests per invocation, and 5 cron triggers per account** (XEN uses all 5). Database calls count as subrequests too, so a full pipeline tick doesn't fit inside the Worker. **Recommended:** deploy the web app (step 7), then set `PIPELINE_RUNNER_URL` in `wrangler.toml`. The Worker then only schedules work and handles Telegram, while the pipeline runs on Vercel. Without that setting, the Worker runs one small job per tick as a fallback.

## 7. Vercel (web app + pipeline runner)

1. Import the GitHub repo in Vercel and set **Root Directory** = `apps/web`.
2. Add every variable from `.env.example` under Project Settings → Environment Variables.
3. Deploy, then set `PIPELINE_RUNNER_URL=https://<app>.vercel.app/api/pipeline/tick` in `apps/worker/wrangler.toml` and redeploy the Worker.

## Local development

```bash
pnpm dev                                   # web on :3000
pnpm --filter @xen/worker dev              # worker on :8787; trigger cron: curl "localhost:8787/__scheduled?cron=*/15+*+*+*+*"
pnpm test                                  # offline tests
pnpm --filter @xen/core test:live          # LIVE provider tests (skipped per provider when keys are missing)
```
