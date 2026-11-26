# Integrations and sources

Status words mean exactly this:

- **Implemented**: the code exists and has unit tests with fixtures.
- **Live-verified**: it has been called successfully with real credentials (recorded below with a date).
- **Unsupported**: there is no permitted access path yet.

| Source | Status | Access | Notes |
| --- | --- | --- | --- |
| Tavily Search | Implemented; live verification pending credentials | API key | Rotating query library, 24h cache, daily budget |
| Gemini (structured output) | Implemented; live verification pending | API key | `responseMimeType` + `responseJsonSchema`; output re-validated with Zod |
| Gemini Google Search grounding | Disabled | — | Not on the free tier for Gemini 3.x |
| RSS / Atom (blogs, Medium `/feed/@user`, Mirror, Substack) | Implemented | Public | Cursor = newest published date |
| Reddit public JSON | Implemented | Public | Descriptive User-Agent; low frequency |
| GitHub releases | Implemented | Optional token | 60 req/h unauthenticated |
| DefiLlama protocols | Implemented, **paused by default** | Public | The response is several MB, too heavy for the Workers Free CPU limit; run it from the Vercel runner |
| Telegram Bot API | Implemented; live verification pending | Bot token | Webhook with secret header, idempotent updates |
| Telegram channels (reading) | Unsupported | — | Bots only see channels where they are an admin |
| Discord | Unsupported (not yet implemented) | Bot token + invite | Requires the bot to be invited with read permission |
| X | Unsupported | Paid API | Optional; feature flag off |
| Superteam Earn, Immunefi, Code4rena, Sherlock, Cantina, DoraHacks, ETHGlobal, Galxe, Layer3, Web3.career, Wellfound | Via Tavily search only | — | No public API verified; adapters will be added only after confirming permitted access |
| RootData, CryptoRank, Product Hunt | Not integrated | Paid / OAuth | Re-evaluate in Phase 5 |

## Adding an adapter

Implement `SourceAdapter` in `packages/core/src/adapters`. It has `id`, `requires`, and `fetch(config, ctx, cursor)`, which returns `{ items, cursor }`. Register it in `ADAPTERS`, add a row to `source_adapters`, and create `sources` rows that point at it. Retries, timeouts, health records and backoff for failing sources are handled by the pipeline.
