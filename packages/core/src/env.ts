import { z } from 'zod';

/**
 * Server-side environment. Required vars throw on load; optional integrations
 * degrade to "unconfigured" instead of failing the app.
 */
const optional = z.string().trim().min(1).optional().catch(undefined);
const flag = (def: boolean) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : String(v).toLowerCase() === 'true'), z.boolean());
const int = (def: number) =>
  z.preprocess((v) => (v === undefined || v === '' ? def : Number(v)), z.number().int().nonnegative());

export const serverEnvSchema = z.object({
  // Required
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GEMINI_API_KEY: z.string().min(10),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),

  // Defaults
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  DEFAULT_TIMEZONE: z.string().default('Africa/Lagos'),
  APP_URL: z.string().url().optional().catch(undefined),

  // Optional integrations
  TAVILY_API_KEY: optional,
  FIRECRAWL_API_KEY: optional,
  GITHUB_TOKEN: optional,
  TELEGRAM_BOT_TOKEN: optional,
  TELEGRAM_WEBHOOK_SECRET: optional,
  TELEGRAM_CHAT_ID: optional, // owner chat for system alerts
  DISCORD_BOT_TOKEN: optional,
  X_BEARER_TOKEN: optional,

  // Feature flags
  FEATURE_GEMINI_GROUNDING: flag(false),
  FEATURE_FIRECRAWL: flag(false),
  FEATURE_X: flag(false),
  FEATURE_DISCORD: flag(false),
  FEATURE_REDDIT: flag(true),

  // Budgets (per UTC day)
  BUDGET_TAVILY_DAILY: int(30),
  BUDGET_GEMINI_DAILY: int(200),
  BUDGET_FIRECRAWL_DAILY: int(10),
  BUDGET_GEMINI_MAX_INPUT_CHARS: int(24000),
  SEARCH_CACHE_HOURS: int(24),
  PIPELINE_MAX_ITEMS_PER_RUN: int(4),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {}

export function loadServerEnv(source: Record<string, unknown>): ServerEnv {
  // Accept NEXT_PUBLIC_SUPABASE_URL as an alias so one .env serves both apps.
  const merged = { ...source, SUPABASE_URL: source.SUPABASE_URL ?? source.NEXT_PUBLIC_SUPABASE_URL, APP_URL: source.APP_URL ?? source.NEXT_PUBLIC_APP_URL };
  const parsed = serverEnvSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new EnvError(`Invalid server environment — ${issues}`);
  }
  return parsed.data;
}

export type IntegrationState = 'configured' | 'unconfigured' | 'disabled';

/** Honest integration status: "configured" means credentials exist, not that a live call succeeded. */
export function integrationStatus(env: ServerEnv): Record<string, IntegrationState> {
  return {
    gemini: 'configured',
    tavily: env.TAVILY_API_KEY ? 'configured' : 'unconfigured',
    telegram: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? 'configured' : 'unconfigured',
    telegram_webhook: env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET ? 'configured' : 'unconfigured',
    github: env.GITHUB_TOKEN ? 'configured' : 'unconfigured',
    firecrawl: !env.FEATURE_FIRECRAWL ? 'disabled' : env.FIRECRAWL_API_KEY ? 'configured' : 'unconfigured',
    gemini_grounding: env.FEATURE_GEMINI_GROUNDING ? 'configured' : 'disabled',
    x: !env.FEATURE_X ? 'disabled' : env.X_BEARER_TOKEN ? 'configured' : 'unconfigured',
    discord: !env.FEATURE_DISCORD ? 'disabled' : env.DISCORD_BOT_TOKEN ? 'configured' : 'unconfigured',
    reddit: env.FEATURE_REDDIT ? 'configured' : 'disabled',
  };
}
