# Technical decisions

**2026-11-26 — Gemini model default `gemini-3.5-flash-lite`.** It is stable and free on the free tier. Starting 2026-12-01, `gemini-2.5-flash` requests are automatically routed to this model anyway. The model is configurable with `GEMINI_MODEL`.

**2026-11-26 — Tavily is the main search provider; grounding is off.** Google Search grounding is not on the free tier for Gemini 3.x and is billed per query. Tavily's free plan gives 1,000 credits a month, so frequent monitoring uses feeds and public APIs, and search is kept for rotating discovery queries.

**2026-11-26 — The heavy pipeline runs on Vercel, triggered by the Worker.** Workers Free allows 10 ms of CPU and 50 subrequests per invocation, and Supabase calls count toward that limit. The Worker keeps the crons (which are reliable and free) and the Telegram webhook. Ticks are sent to `/api/pipeline/tick` on Vercel. The in-Worker fallback is deliberately small.

**2026-11-26 — Deterministic verification over AI judgement.** The model only extracts. Code checks the evidence, domains, risk language and expiry, so the model alone can never upgrade a reward to "confirmed".

**2026-11-26 — Near-duplicate detection with shingles, not embeddings.** Shingle (Jaccard) similarity costs nothing and is enough at this volume. Embedding-based semantic dedupe can be added later through pgvector if needed.

**2026-11-26 — One monorepo (pnpm workspaces).** Shared types and logic across the Worker, web app and scripts without publishing packages.

**2026-11-26 — Cron slots (UTC).** Five slots, the free-plan maximum: `*/15` tick, `:05` hourly, 07:00 (08:00 WAT briefing), 17:00 (18:00 WAT), and Sunday 18:00. Per-source cadence is controlled by `sources.scan_interval_minutes`, not by extra crons.
