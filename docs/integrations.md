# Integrations and sources

Status words mean exactly this:

- **Implemented**: the code exists and has unit tests with fixtures.
- **Live-verified**: it has been called successfully with real credentials (recorded below with a date).
- **Unsupported**: there is no permitted access path yet.

| Source | Status | Access | Notes |
| --- | --- | --- | --- |
| Tavily Search | **Live-verified 2026-11-26** (milestone: 3 real searches) | API key | Rotating query library, 24h cache, daily budget |
| Gemini (structured output) | **Live-verified 2026-11-26** (`gemini-3.5-flash-lite`, 11 opportunities extracted) | API key | `responseMimeType` + `responseJsonSchema`; output re-validated with Zod |
| Supabase (Postgres, Auth) | **Live-verified 2026-11-26** | Service role + anon key | Migrations 0001–0005 applied; RLS verified (anon blocked); password sign-in on Vercel |
| Cloudflare Worker (crons + webhook) | **Live-verified 2026-11-26** | Wrangler OAuth | Deployed with 5 crons; `/run` tick forwarded to Vercel `/api/pipeline/tick` and completed; wrong secrets rejected (403) |
| Gemini Google Search grounding | Disabled | — | Not on the free tier for Gemini 3.x |
| RSS / Atom (blogs, Medium `/feed/@user`, Mirror, Substack) | Implemented | Public | Cursor = newest published date |
| Reddit public JSON | Implemented, **paused 2026-11-26** | Public | Live runs got HTTP 403: Reddit blocks unauthenticated requests from Vercel/Cloudflare server IPs. Needs a Reddit OAuth (script) app to resume |
| GitHub releases | Implemented | Optional token | 60 req/h unauthenticated |
| DefiLlama protocols | **Live-verified 2026-11-26** (resumed; runs on the Vercel runner) | Public | Several-MB response, so it only runs via PIPELINE_RUNNER_URL. First live run: 40 new protocols fetched in 26 s, 2 queued for analysis. Every 6 h |
| Telegram Bot API | **Live-verified 2026-11-26**: alerts (2 sent, re-send suppressed) and webhook commands (`/status` answered via the Cloudflare Worker) | Bot token | Webhook with secret header, idempotent updates |
| Telegram channels (reading) | Unsupported | — | Bots only see channels where they are an admin |
| Discord | Unsupported (not yet implemented) | Bot token + invite | Requires the bot to be invited with read permission |
| X | Unsupported | Paid API | Optional; feature flag off |
| Superteam Earn, Immunefi, Code4rena, Sherlock, Cantina, DoraHacks, ETHGlobal, Galxe, Layer3, Web3.career, Wellfound | Via Tavily search only | — | No public API verified; adapters will be added only after confirming permitted access |
| RootData, CryptoRank, Product Hunt | Not integrated | Paid / OAuth | Re-evaluate in Phase 5 |

## Adding an adapter

Implement `SourceAdapter` in `packages/core/src/adapters`. It has `id`, `requires`, and `fetch(config, ctx, cursor)`, which returns `{ items, cursor }`. Register it in `ADAPTERS`, add a row to `source_adapters`, and create `sources` rows that point at it. Retries, timeouts, health records and backoff for failing sources are handled by the pipeline.

## XEN Lab (Phase 6)

Uses the same Gemini key and daily budget as the pipeline (`BUDGET_GEMINI_DAILY`); each generate, analyze or draft action is one call. Live-verified 2026-11-27: bug report generation, screenshot analysis (private `evidence` bucket, owner folder only), test plan generation, feedback and outreach drafts. XEN never sends outreach; the user copies and sends each message.

## Personal management (Phase 7)

No external services. Today, Tasks, Applications, Calendar and Earnings read and write the user's own rows (RLS). The daily plan is rule-based (no AI calls) and is empty when nothing qualifies. Task reminders use the existing `reminders` table and Telegram delivery job. Payment reliability labels come only from verified evidence: a user's received payment with a transaction hash or evidence link, or owner-added public evidence and official announcements with a source link; community reports are counted separately. The pipeline now scores against the owner account's saved profile and preferences. Browser-verified 2026-11-27 against the live database; test rows deleted afterwards.
