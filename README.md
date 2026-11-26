# XEN

**Web3 Opportunity Intelligence System — Discover opportunities before the crowd.**

## The problem

Paid Web3 work is real but scattered. A DEX quietly recruits beta testers in a blog post. A new prediction market pays USDC for usability feedback, but only on a Discord announcement. A testnet with rewards opens and closes within a week. Finding these means scrolling X, Telegram, Discord, Reddit and project blogs for hours. Most of what you find is noise: price talk, "airdrops" that will never pay, and phishing dressed up as opportunities.

XEN does that searching for you. It collects candidate announcements from sources it is allowed to read. It reads them with Gemini and extracts the facts: reward, conditions, capital required, eligibility and deadline. It then checks those facts against the original text, and anything the model claims that isn't in the source is discarded. Finally it scores each opportunity for you, a builder and tester based in Nigeria who prefers zero-capital work, and sends the worthwhile ones to Telegram.

## How it works

```
Cron (Cloudflare Worker, UTC)
  └─► collect      Tavily search (rotating query library), RSS/Atom, Reddit, GitHub releases, DefiLlama
  └─► normalize    canonical URL, content hash, keyword prefilter (no AI spend on obvious noise)
  └─► dedupe       URL + content hash + near-duplicate title similarity
  └─► analyze      fetch original page (SSRF-guarded) → Gemini structured extraction
  └─► verify       deterministic checks: evidence must appear verbatim in the source,
                   official-domain match, lookalike domains, seed-phrase/upfront-fee language,
                   prompt-injection attempts, expiry
  └─► score        0–100 with an explained breakdown (reward certainty 30, credibility 20,
                   zero capital 20, reward/effort 15, eligibility 10, urgency 5)
  └─► store        Supabase Postgres with RLS
  └─► notify       Telegram, deduplicated per opportunity per chat, quiet hours respected
```

Ground rules the code enforces:

- **Speculative rewards (points, a possible future airdrop) are never shown as confirmed.** A "confirmed" claim from the model with no matching excerpt in the source is downgraded to *unverified*.
- **Verification measures evidence. It is not a safety guarantee.** Every alert says so.
- **If XEN finds nothing, it says so.** It never fills an empty list with invented items.
- Suspicious, expired, ineligible, or capital-requiring (in Zero Capital Mode) opportunities are capped and never trigger alerts.

## Repository layout

| Path | What |
| --- | --- |
| `packages/core` | Shared pipeline: adapters, Gemini/Tavily/Telegram clients, extraction, verification, scoring, job runner, bot logic. Fetch-only TypeScript, so it runs on Workers, Vercel and Node. |
| `apps/worker` | Cloudflare Worker: cron dispatch, Telegram webhook, manual `/run`, `/health`. |
| `apps/web` | Next.js 16 dashboard + `/api/pipeline/tick` runner + Supabase auth. |
| `supabase/migrations` | Schema, RLS policies, job-queue functions, config seed (no fake opportunities). |
| `docs/` | Architecture, setup, sources, security, decisions. |

## Quick start

```bash
pnpm install
cp .env.example .env        # fill in the required keys — see docs/setup.md
pnpm test                   # offline unit + DB/RLS tests (fixtures, clearly labeled)
pnpm milestone -- --ignore-quiet-hours   # LIVE end-to-end proof against real APIs
pnpm dev                    # web dashboard on http://localhost:3000
```

Full setup, including Supabase, Telegram, the Cloudflare Worker and Vercel: [docs/setup.md](docs/setup.md).

## Status

| Phase | State |
| --- | --- |
| 1 Foundation | Done. Monorepo, migrations + RLS, env validation, server clients, adapter interface, auth. |
| 2 Discovery engine | Implemented and unit-tested. **Live verification needs credentials** (`pnpm milestone`). |
| 3 Telegram + automation | Worker, crons, webhook, commands, callbacks, briefings, reminders and account linking are implemented. Not yet deployed. |
| 4–8 | Not started. |

See [docs/integrations.md](docs/integrations.md) for exactly which sources are live, optional or unsupported.
