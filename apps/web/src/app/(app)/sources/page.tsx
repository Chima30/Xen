import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, Pill, Section } from "@/components/xen/status";
import { cn } from "@/lib/utils";
import { serverEnv } from "@/lib/env";
import { relative } from "@/lib/xen/format";
import { getSourcesPage } from "@/lib/xen/queries";
import { QueryToggle, SourceControls } from "./controls";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Sources and Usage" };

export default function SourcesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Sources and Usage" description="Where XEN looks, how often, how healthy each source is, and how much free-tier quota is left" />
      <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>}>
        <Sources />
      </Suspense>
    </div>
  );
}

const STATUS_TONE = { active: "ok", paused: "neutral", error: "danger", unsupported: "neutral", unconfigured: "warn" } as const;

async function Sources() {
  const now = await requestNow();
  const env = serverEnv();
  const { user, sources, adapters, health, usage, queries } = await getSourcesPage();
  const owner = user.role === "owner";
  const today = new Date().toISOString().slice(0, 10);

  // Daily limits come from server configuration; monthly limits are the providers' published free tiers.
  const providers: { id: string; label: string; daily: number | null; monthly: number | null; unit: string; configured: boolean }[] = [
    { id: "tavily", label: "Tavily search", daily: env.BUDGET_TAVILY_DAILY, monthly: 1000, unit: "credits", configured: !!env.TAVILY_API_KEY },
    { id: "gemini", label: "Gemini", daily: env.BUDGET_GEMINI_DAILY, monthly: null, unit: "requests", configured: !!env.GEMINI_API_KEY },
    { id: "firecrawl", label: "Firecrawl", daily: env.BUDGET_FIRECRAWL_DAILY, monthly: null, unit: "requests", configured: !!env.FIRECRAWL_API_KEY && env.FEATURE_FIRECRAWL },
    { id: "github", label: "GitHub", daily: null, monthly: null, unit: "requests", configured: true },
    { id: "telegram", label: "Telegram", daily: null, monthly: null, unit: "requests", configured: !!env.TELEGRAM_BOT_TOKEN },
  ];
  const usageRows = providers.map((p) => {
    const rows = usage.filter((u) => u.provider === p.id);
    const t = rows.find((u) => u.day === today);
    const month = rows.filter((u) => u.day.slice(0, 7) === today.slice(0, 7));
    const used = p.unit === "credits" ? Number(t?.units ?? 0) : t?.requests ?? 0;
    const monthUsed = month.reduce((s, u) => s + (p.unit === "credits" ? Number(u.units) : u.requests), 0);
    const last = rows.find((u) => u.last_success_at)?.last_success_at ?? null;
    const lastErr = rows.find((u) => u.last_error)?.last_error ?? null;
    return { ...p, used, failures: t?.failures ?? 0, monthUsed, last, lastErr, seen: rows.length > 0 };
  }).filter((p) => p.configured || p.seen);

  const latestBySource = new Map<string, (typeof health)[number]>();
  for (const h of health) if (h.source_id && !latestBySource.has(h.source_id)) latestBySource.set(h.source_id, h);

  return (
    <div className="space-y-4">
      <Section title="API usage" description="Today (UTC) against XEN's daily budgets. A spent budget pauses that integration until tomorrow; paid usage is never turned on.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-2xs text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Provider</th>
                <th className="py-2 pr-3 font-medium">Today</th>
                <th className="py-2 pr-3 font-medium">This month</th>
                <th className="py-2 pr-3 font-medium">Failures today</th>
                <th className="py-2 pr-3 font-medium">Last success</th>
                <th className="py-2 font-medium">Last error</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usageRows.map((p) => {
                const pct = p.daily ? Math.min(100, (p.used / p.daily) * 100) : null;
                return (
                  <tr key={p.id}>
                    <td className="py-3 pr-3 font-medium">{p.label}</td>
                    <td className="py-3 pr-3">
                      <span className="font-mono tabular-nums">{p.used}{p.daily ? ` / ${p.daily}` : ""}</span> <span className="text-xs text-muted-foreground">{p.unit}</span>
                      {pct !== null && (
                        <div className="mt-1 h-1 w-28 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warn" : "bg-primary")} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-3 font-mono tabular-nums">
                      {p.monthUsed}{p.monthly ? <span className="text-muted-foreground"> / {p.monthly} free · {Math.max(0, p.monthly - p.monthUsed)} left</span> : null}
                    </td>
                    <td className={cn("py-3 pr-3 font-mono tabular-nums", p.failures > 0 && "text-destructive")}>{p.failures}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{p.last ? relative(p.last, now) : "Never"}</td>
                    <td className="max-w-64 truncate py-3 text-xs text-muted-foreground" title={p.lastErr ?? undefined}>{p.lastErr ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Monitored sources" description={owner ? "Scan intervals are per source; the scheduler checks every 15 minutes." : "Only the workspace owner can change sources."}>
        <ul className="divide-y">
          {sources.map((s) => {
            const h = latestBySource.get(s.id);
            return (
              <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  {s.status !== "active" ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : !h ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : h.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {s.name} <Pill tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE] ?? "neutral"}>{s.status}</Pill>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.adapter_id} · every {s.scan_interval_minutes >= 60 ? `${s.scan_interval_minutes / 60} h` : `${s.scan_interval_minutes} min`}
                      {s.status === "active" && <> · next {relative(s.next_scan_at, now)}</>}
                      {" · "}last success {s.last_success_at ? relative(s.last_success_at, now) : "never"}
                      {h && <> · last check {h.ok ? `${h.items_fetched} items` : "failed"}{h.duration_ms ? ` in ${(h.duration_ms / 1000).toFixed(1)}s` : ""}</>}
                    </p>
                    {s.last_error && s.consecutive_failures > 0 && <p className="mt-0.5 line-clamp-2 text-xs text-destructive">{s.consecutive_failures} failure{s.consecutive_failures > 1 ? "s" : ""}: {s.last_error}</p>}
                  </div>
                </div>
                {owner && <SourceControls id={s.id} status={s.status} />}
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Search queries" description="Rotated by the Tavily sources, disabled ones are skipped">
          <ul className="max-h-[28rem] divide-y overflow-y-auto">
            {queries.map((q) => (
              <li key={q.query} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{q.query}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.tier.replace("tier", "Tier ")} · {q.last_run_at ? `ran ${relative(q.last_run_at, now)}${q.results_last_run !== null ? ` · ${q.results_last_run} results` : ""}` : "not run yet"}
                  </p>
                </div>
                <QueryToggle query={q.query} enabled={q.enabled} disabled={!owner} />
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Adapters" description="What XEN can and cannot read, and why">
          <ul className="max-h-[28rem] divide-y overflow-y-auto">
            {adapters.map((a) => (
              <li key={a.id} className="py-2">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {a.name}
                  <Pill tone={a.supported ? "ok" : "neutral"}>{a.supported ? "Supported" : "Not supported"}</Pill>
                  {(a.requires_credentials as string[]).length > 0 && <span className="font-mono text-2xs text-muted-foreground">{(a.requires_credentials as string[]).join(", ")}</span>}
                </p>
                {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
