# Security

**Secrets.** The service-role key, the AI and search keys, and the bot token exist only in server code: Worker secrets, Vercel server env, and the `server-only` modules in `apps/web`. The browser only receives `NEXT_PUBLIC_SUPABASE_URL` and the anon key, which RLS restricts. `.env*` files are git-ignored. `/health` endpoints report whether an integration is configured and never return the values.

**Row Level Security** is enabled on every table (a test checks this).
- Private tables such as applications, earnings, tasks and reminders are scoped to their owner with `user_id = auth.uid()`.
- Shared intelligence tables (opportunities, projects) can be read by authenticated users and written only by the service role.
- The job queue, cache, settings and Telegram update tables have no client policies at all.
- Privileged functions have `EXECUTE` revoked from `anon` and `authenticated`.
- Users can only add payment-history entries labeled as `community_allegation`.

**Untrusted content and prompt injection.**
- Fetched content is wrapped in `<untrusted_content>` delimiters. Any attempt inside the content to close that delimiter is stripped.
- The system prompt states that the content is data, not instructions.
- Model output must match a JSON schema and is re-validated with Zod.
- Evidence excerpts must appear verbatim in the source, so a manipulated model can't invent a reward.
- Injection phrases found in the content mark the opportunity as `suspicious`, which caps its score at 15 and blocks alerts.
- The model has no tools and no access to secrets, and it can't trigger actions.

**SSRF.** `assertSafePublicUrl` blocks:
- non-http(s) schemes and embedded credentials
- localhost and `.local`/`.internal` hosts
- private, loopback, link-local and metadata IPs
- numeric hosts and unusual ports

Redirects are followed manually and re-checked at every hop. Response size is capped, and only text content types are accepted.

**Telegram.**
- Every webhook request must carry the secret header, which is compared in constant time.
- The payload size is capped, and each update is processed only once.
- Only private chats are handled. Personal commands require a linked account or the configured owner chat.
- Account linking uses a one-time code that expires after 10 minutes. Only its SHA-256 hash is stored.

**Outbound actions.** XEN never sends outreach messages, signs transactions, trades, or asks for seed phrases or private keys. Outreach drafts (Phase 6) require the user to send them manually.

**Auth callback.** Only same-origin relative `next` redirects are allowed, which prevents open redirects.
