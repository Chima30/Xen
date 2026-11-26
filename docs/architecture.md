# Architecture

## Components

- **`@xen/core`**: all domain logic, written as fetch-only TypeScript with no Node APIs, so the same code runs on Cloudflare Workers, Vercel (Node) and local scripts.
- **Worker**: the scheduler and Telegram endpoint. It is small on purpose because of the Workers Free limits (10 ms CPU, 50 subrequests).
- **Web app**: the dashboard, auth, and `/api/pipeline/tick`, which is the heavy pipeline runner, triggered by the Worker.
- **Supabase**: Postgres holds the data, a durable job queue, an API usage ledger, the search cache and the logs.

## The eight agents

The eight "agents" are modules that share one Gemini client. They are not separate services.

| Agent | Implementation |
| --- | --- |
| Discovery | `adapters/*`, `keywords.ts` (prefilter + query rotation), `pipeline/run.ts#collectSource` |
| Project Intelligence | `pipeline/run.ts#upsertProject` (profiles from extraction); Phase 5 extends it |
| Verification | `verification.ts`: deterministic, model-independent |
| Opportunity Analysis | `extraction.ts`: Gemini structured output + Zod validation |
| Personal Matching | `scoring.ts`: eligibility + weighted score with explanations |
| Monitoring | `reverify` job, announcement versioning, expiry (`briefings.ts#expireOpportunities`) |
| Testing Assistant | Phase 6 |
| Notification | `providers/telegram.ts`, `briefings.ts`, `pipeline/run.ts#notifyOpportunity` |

## Jobs

`job_queue` rows are leased atomically by `lease_jobs()` using `FOR UPDATE SKIP LOCKED`. Each job has an `idempotency_key`, so retriggering a cron never creates duplicate work. `fail_job()` applies exponential backoff (30 s, 60 s, 120 s, up to 1 h), and a job becomes `dead` after `max_attempts`. Expired leases can be claimed again. Job kinds are `collect`, `analyze`, `notify`, `reverify` and `purge`.

## Dedupe layers

1. Canonical URL (tracking params stripped) is unique on `announcements`.
2. Content hash of the normalized text catches syndicated copies on different URLs.
3. `opportunities.dedupe_key` = sha256(canonical URL + normalized title).
4. Near-duplicates: the same project with title similarity ≥ 0.5 within 60 days updates the existing row instead of inserting.
5. `notifications.dedupe_key` (`opp:<id>:<chat>`) is claimed before sending, so an alert can never be sent twice.
6. Telegram `update_id` is recorded once, so webhook redeliveries are ignored.

## Cost controls

- The keyword prefilter runs before any AI call.
- Content hashes skip re-analysis of unchanged pages.
- Tavily is cached for 24 h, with a daily budget.
- The Gemini daily request budget is enforced, and input is truncated to `BUDGET_GEMINI_MAX_INPUT_CHARS`.
- Each invocation has a `RequestBudget` for provider calls.
- Failing sources back off adaptively (interval × 2^failures, up to 24 h).
- Usage is recorded per provider per day in `api_usage`.
