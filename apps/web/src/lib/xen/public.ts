import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Data for the public landing page. Visitors are signed out and RLS gives anon nothing,
 * so these reads use the service role on the server, select an explicit list of display
 * fields only, exclude anything flagged suspicious, and are cached for a few minutes.
 * Nothing here is invented: an empty database yields empty lists and zero counts.
 */

export type PublicOpportunity = {
  id: string;
  title: string;
  project_name: string | null;
  category: string;
  reward_amount: number | null;
  reward_amount_max: number | null;
  reward_currency: string | null;
  reward_status: string;
  verification: string;
  capital: string;
  discovered_at: string;
  deadline_at: string | null;
  source_url: string;
  score: number | null;
};

export async function getPublicOpportunities(limit = 6): Promise<PublicOpportunity[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  cacheTag("public-opportunities");
  try {
    const { data } = await createAdminClient()
      .from("opportunities")
      .select("id,title,project_name,category,reward_amount,reward_amount_max,reward_currency,reward_status,verification,capital,discovered_at,deadline_at,source_url,score")
      .eq("is_active", true)
      .not("verification", "in", "(suspicious,expired)")
      .order("score", { ascending: false, nullsFirst: false })
      .order("discovered_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as PublicOpportunity[];
  } catch {
    return [];
  }
}

export type PublicStats = {
  opportunities: number;
  projects: number;
  verified: number;
  sources: number;
  confirmedPaid: number;
  zeroCapital: number;
};

export async function getPublicStats(): Promise<PublicStats | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  cacheTag("public-stats");
  try {
    const db = createAdminClient();
    const head = { count: "exact" as const, head: true };
    const [o, p, v, s, c, z] = await Promise.all([
      db.from("opportunities").select("id", head),
      db.from("projects").select("id", head),
      db.from("opportunities").select("id", head).eq("verification", "verified_announcement"),
      db.from("sources").select("id", head).eq("status", "active"),
      db.from("opportunities").select("id", head).eq("is_active", true).eq("reward_status", "confirmed"),
      db.from("opportunities").select("id", head).eq("is_active", true).eq("capital", "none"),
    ]);
    if ([o, p, v, s, c, z].some((r) => r.error)) return null;
    return { opportunities: o.count ?? 0, projects: p.count ?? 0, verified: v.count ?? 0, sources: s.count ?? 0, confirmedPaid: c.count ?? 0, zeroCapital: z.count ?? 0 };
  } catch {
    return null;
  }
}

/** Latest scheduled run, for the live status line. Real data only. */
export async function getPublicPulse(): Promise<{ lastScanAt: string | null; lastDiscoveryAt: string | null }> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 600 });
  try {
    const db = createAdminClient();
    const [scan, opp] = await Promise.all([
      db.from("scan_history").select("started_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("opportunities").select("discovered_at").order("discovered_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    return { lastScanAt: scan.data?.started_at ?? null, lastDiscoveryAt: opp.data?.discovered_at ?? null };
  } catch {
    return { lastScanAt: null, lastDiscoveryAt: null };
  }
}

/** Active opportunities per discovery page, keyed by that page's path. */
export async function getPublicCategoryCounts(): Promise<Record<string, number> | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  try {
    const { GROUPS } = await import("./labels");
    const { data, error } = await createAdminClient().from("opportunities").select("category").eq("is_active", true).limit(5000);
    if (error) return null;
    const out: Record<string, number> = {};
    for (const [slug, g] of Object.entries(GROUPS)) {
      out[`/discover/${slug}`] = (data ?? []).filter((r) => (g.categories as readonly string[]).includes(r.category)).length;
    }
    return out;
  } catch {
    return null;
  }
}

/** The bot's public @username (from Telegram getMe), for links. Null when not configured. */
export async function getBotUsername(): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return null;
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const body = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return body.ok ? body.result?.username ?? null : null;
  } catch {
    return null;
  }
}
