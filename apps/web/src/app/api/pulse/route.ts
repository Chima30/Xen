import { createUserClient } from "@/lib/supabase/server";

/**
 * Live system state for the dashboard's Intelligence Core and status indicator.
 * Signed-in users only (RLS); returns timestamps from real scans, discoveries and checks.
 */
export async function GET() {
  const db = await createUserClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const [scan, opp, ver, health] = await Promise.all([
    db.from("scan_history").select("started_at, finished_at, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("opportunities").select("discovered_at").order("discovered_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("opportunity_verifications").select("verified_at").order("verified_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("sources").select("status, consecutive_failures").eq("status", "active"),
  ]);
  const failing = (health.data ?? []).filter((s) => s.consecutive_failures > 0).length;
  return Response.json(
    {
      scanStartedAt: scan.data?.started_at ?? null,
      scanFinishedAt: scan.data?.finished_at ?? null,
      scanError: scan.data?.error ?? null,
      latestDiscoveryAt: opp.data?.discovered_at ?? null,
      latestVerificationAt: ver.data?.verified_at ?? null,
      activeSources: health.data?.length ?? 0,
      failingSources: failing,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
