import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SIGNAL_LABELS, STAGES, type SignalType } from "@xen/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/xen/discover-view";
import { EmptyState, PageHeader } from "@/components/xen/status";
import { relative } from "@/lib/xen/format";
import { listProjects } from "@/lib/xen/intel-queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  return (
    <div className="space-y-4">
      <PageHeader title="Projects" description="Every project XEN has profiled, with its latest evidence-backed signal" />
      <Suspense fallback={<ListSkeleton />}>
        <Projects searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const field = "h-8 rounded-md border border-input bg-background px-2 text-sm";

async function Projects({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const now = await requestNow();
  const f = { q: one(sp.q).slice(0, 80), stage: (STAGES as readonly string[]).includes(one(sp.stage)) ? one(sp.stage) : "", withSignals: one(sp.signals) === "1" };
  const { rows, error } = await listProjects(f);
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-center gap-2" role="search">
        <Input name="q" defaultValue={f.q} placeholder="Search projects" className="h-8 max-w-64" aria-label="Search projects" />
        <select name="stage" defaultValue={f.stage} className={field} aria-label="Stage">
          <option value="">Any stage</option>
          {STAGES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="signals" value="1" defaultChecked={f.withSignals} className="size-4 accent-primary" /> With signals only</label>
        <Button type="submit" size="sm">Apply</Button>
      </form>
      {error && <p className="text-sm text-destructive">Could not load projects: {error}</p>}
      {rows.length === 0 ? (
        <EmptyState title="No projects match">Projects are profiled automatically from the sources XEN reads, or when you add one to your watchlist.</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {rows.map((p) => (
            <li key={p.id} className="relative grid gap-1 px-3 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_12rem_8rem] sm:items-center sm:gap-3">
              <div className="min-w-0">
                <Link href={`/projects/${p.id}`} className="text-sm font-medium after:absolute after:inset-0 hover:underline">{p.name}</Link>
                <p className="truncate text-xs text-muted-foreground">
                  {[p.category, p.stage !== "unknown" ? p.stage.replaceAll("_", " ") : null, p.ecosystems.join(", ") || null].filter(Boolean).join(" · ") || "No profile details yet"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {p.signals ? <>{SIGNAL_LABELS[p.signals.latestType as SignalType] ?? p.signals.latestType} · {relative(p.signals.latest, now)}{p.signals.count > 1 ? ` · ${p.signals.count} signals` : ""}</> : "No signals yet"}
              </p>
              <p className="text-xs text-muted-foreground sm:text-right">{p.opportunities ? `${p.opportunities} open ${p.opportunities === 1 ? "opportunity" : "opportunities"}` : "—"}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
