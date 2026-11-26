import { Suspense } from "react";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Interim overview (Phase 1). Shows only real database counts.
 * The full dashboard (sidebar, discovery, filters, details) is built in Phase 4.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="font-mono text-sm text-accent">XEN</p>
          <h1 className="text-xl font-semibold">Overview</h1>
        </div>
        <p className="text-sm text-muted">Discover opportunities before the crowd.</p>
      </header>
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>
      <p className="mt-8 text-sm text-muted">
        The full dashboard is in progress. Alerts and commands are available in the Telegram bot.
      </p>
    </main>
  );
}

async function loadStats() {
  const db = await createUserClient();
  const since = new Date(Date.now() - 86400_000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const r = await q;
    return r.error ? null : r.count ?? 0;
  };
  const head = { count: "exact" as const, head: true };
  const [today, high, paid, zero, lastScan] = await Promise.all([
    count(db.from("opportunities").select("id", head).gte("discovered_at", since)),
    count(db.from("opportunities").select("id", head).eq("is_active", true).gte("score", 85)),
    count(db.from("opportunities").select("id", head).eq("is_active", true).eq("reward_status", "confirmed")),
    count(db.from("opportunities").select("id", head).eq("is_active", true).eq("capital", "none")),
    db.from("source_health").select("checked_at, ok, adapter_id").order("checked_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const items = [
    { label: "Discovered (24h)", value: today },
    { label: "High priority", value: high },
    { label: "Confirmed paid", value: paid },
    { label: "Zero capital", value: zero },
  ];
  return { items, lastScan };
}

async function Stats() {
  const { items, lastScan } = await loadStats();
  return (
    <>
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.label} className="bg-surface p-4">
            <dt className="text-xs text-muted">{i.label}</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums">{i.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">
        Last source scan:{" "}
        {lastScan.data
          ? `${new Date(lastScan.data.checked_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })} WAT · ${lastScan.data.adapter_id} · ${lastScan.data.ok ? "ok" : "failed"}`
          : "no scans recorded yet"}
      </p>
    </>
  );
}

function StatsSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-[76px] animate-pulse bg-surface" />
      ))}
    </div>
  );
}
