import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscoveryChart } from "@/components/xen/discovery-chart";
import { OpportunityTable } from "@/components/xen/opportunity-table";
import { EmptyState, PageHeader, Pill, Section } from "@/components/xen/status";
import { cn } from "@/lib/utils";
import { formatDate, relative } from "@/lib/xen/format";
import { getOverview } from "@/lib/xen/queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Overview" description="What XEN has found, what needs your attention, and how the system is running." />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  const now = await requestNow();
  const d = await getOverview();
  const money = (rows: [string, number][]) =>
    rows.length ? rows.map(([cur, amt]) => `${amt.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${cur}`).join(" · ") : null;

  const tiles: { label: string; value: number | null; href?: string; hint?: string }[] = [
    { label: "Discovered (24h)", value: d.counts.today, href: "/discover?discovered=24h&sort=newest" },
    { label: "High priority", value: d.counts.high, href: "/discover?minScore=85", hint: "Score 85+" },
    { label: "Confirmed paid", value: d.counts.paid, href: "/discover?rewardStatus=confirmed" },
    { label: "Zero capital", value: d.counts.zero, href: "/discover?capital=none" },
    { label: "Active applications", value: d.counts.activeApplications },
    { label: "Watchlisted projects", value: d.counts.watchlisted },
  ];

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => {
          const body = (
            <>
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className="mt-1 font-mono text-2xl font-medium tabular-nums">{t.value ?? <span title="Could not load">—</span>}</dd>
              {t.hint && <p className="text-[11px] text-muted-foreground">{t.hint}</p>}
            </>
          );
          return (
            <div key={t.label} className="bg-card">
              {t.href ? <Link href={t.href} className="block h-full p-3.5 transition-colors hover:bg-muted/40">{body}</Link> : <div className="p-3.5">{body}</div>}
            </div>
          );
        })}
      </dl>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Discovery activity" description="Opportunities stored per day, Lagos time" className="lg:col-span-2">
          <DiscoveryChart data={d.perDay} />
        </Section>
        <Section title="Earnings" description="Potential and received are kept separate">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Pending payments ({d.pending.count})</dt>
              <dd className="mt-0.5 font-mono">{money(d.pending.byCurrency) ?? "None recorded"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Received ({d.received.count})</dt>
              <dd className="mt-0.5 font-mono">{money(d.received.byCurrency) ?? "None recorded"}</dd>
            </div>
            <p className="text-xs text-muted-foreground">Speculative rewards and unaccepted applications are never counted as earnings. Earnings tracking arrives in Phase 7.</p>
          </dl>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Recently discovered</h2>
            <Link href="/discover?sort=newest" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">All <ArrowRight className="size-3" /></Link>
          </div>
          {d.recent.length ? <OpportunityTable rows={d.recent} now={now} showSave={false} /> : <EmptyState title="Nothing discovered yet">XEN checks its sources every 15 minutes.</EmptyState>}
        </div>
        <Section title="Upcoming deadlines" description="Next 14 days">
          {d.deadlines.length ? (
            <ul className="space-y-2.5">
              {d.deadlines.map((o) => (
                <li key={o.id} className="text-sm">
                  <Link href={`/opportunities/${o.id}`} className="line-clamp-1 font-medium hover:underline">{o.title}</Link>
                  <p className="text-xs text-muted-foreground">{o.project_name ? `${o.project_name} · ` : ""}{formatDate(o.deadline_at)} · {relative(o.deadline_at, now)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No active opportunity has a deadline in the next 14 days.</p>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Latest alerts" description="Telegram notifications">
          {d.alerts.length ? (
            <ul className="space-y-2.5">
              {d.alerts.map((a) => (
                <li key={a.id} className="text-sm">
                  {a.opportunity_id ? <Link href={`/opportunities/${a.opportunity_id}`} className="line-clamp-1 font-medium hover:underline">{a.title ?? "Opportunity"}</Link> : <span className="font-medium">{a.kind.replaceAll("_", " ")}</span>}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Pill tone={a.status === "sent" ? "ok" : a.status === "failed" ? "danger" : "neutral"}>{a.status}</Pill>
                    {relative(a.sent_at ?? a.created_at, now)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No alerts sent yet. Alerts go out for opportunities scoring 65 or more that are not flagged as risky.</p>
          )}
        </Section>
        <Section title="Source health" description="Most recent check per adapter" actions={<Link href="/sources" className="text-xs text-muted-foreground hover:text-foreground">Manage</Link>}>
          {d.sourceHealth.length ? (
            <ul className="space-y-2">
              {d.sourceHealth.map((h) => (
                <li key={h.adapter_id} className="flex items-start gap-2 text-sm">
                  {h.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
                  <div className="min-w-0">
                    <p className="font-medium">{h.adapter_id}</p>
                    <p className="truncate text-xs text-muted-foreground">{h.ok ? `${h.items_fetched} items` : h.error ?? "Failed"} · {relative(h.checked_at, now)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No source checks recorded yet.</p>
          )}
        </Section>
        <Section title="Agent activity" actions={<Link href="/activity" className="text-xs text-muted-foreground hover:text-foreground">All</Link>}>
          {d.logs.length ? (
            <ul className="space-y-2">
              {d.logs.map((l, i) => (
                <li key={i} className="text-sm">
                  <p className="line-clamp-2"><span className={cn("font-medium", l.level === "error" && "text-destructive", l.level === "warn" && "text-warn")}>{l.agent}</span> <span className="text-muted-foreground">{l.message}</span></p>
                  <p className="text-xs text-muted-foreground">{relative(l.created_at, now)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No agent activity logged yet.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-[86px] w-full" />
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-56 lg:col-span-2" /><Skeleton className="h-56" /></div>
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>
    </div>
  );
}
