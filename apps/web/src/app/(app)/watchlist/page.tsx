import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UPDATE_TYPES, UPDATE_TYPE_LABELS } from "@xen/core";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalList } from "@/components/xen/signal-list";
import { EmptyState, PageHeader, Pill, Section } from "@/components/xen/status";
import { AddWatchForm, WatchToggle, WatchTypesEditor } from "@/components/xen/watch-controls";
import { relative } from "@/lib/xen/format";
import { getWatchlist } from "@/lib/xen/intel-queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Watchlist" };

const OPTIONS = UPDATE_TYPES.map((t) => ({ value: t, label: UPDATE_TYPE_LABELS[t] }));

export default function WatchlistPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Watchlist" description="Projects XEN monitors for you, and what changed" />
      <Section title="Watch a project" description="Give at least a name, a website or a GitHub repository">
        <AddWatchForm updateTypes={OPTIONS} />
      </Section>
      <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}>
        <Watchlist />
      </Suspense>
    </div>
  );
}

async function Watchlist() {
  const now = await requestNow();
  const { items, signals, updates } = await getWatchlist();
  if (!items.length) return <EmptyState title="You are not watching any project yet">Add one above, from a project page, or send /watch with a website to the Telegram bot.</EmptyState>;
  const names = new Map(items.map((i) => [i.project!.id, i.project!.name]));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-2 lg:col-span-2">
        <h2 className="text-sm font-medium">Watching {items.length}</h2>
        <ul className="divide-y rounded-md border bg-card">
          {items.map((i) => (
            <li key={i.project_id as string} className="space-y-2 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/projects/${i.project!.id}`} className="text-sm font-medium hover:underline">{i.project!.name}</Link>
                  <p className="text-xs text-muted-foreground">
                    {i.project!.stage !== "unknown" && <>{i.project!.stage.replaceAll("_", " ")} · </>}
                    {i.project!.website ? new URL(i.project!.website).host : "No website yet"}
                    {i.last_notified_at ? ` · last update ${relative(i.last_notified_at as string, now)}` : ""}
                  </p>
                </div>
                <WatchToggle projectId={i.project!.id} watching />
              </div>
              <WatchTypesEditor projectId={i.project!.id} selected={i.update_types as string[]} options={OPTIONS} />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <Section title="Recent signals" description="From the projects you watch">
          {signals.length ? <SignalList signals={signals.slice(0, 12)} now={now} projectNames={names} /> : <p className="text-sm text-muted-foreground">Nothing yet. Sources are checked every 30 to 60 minutes.</p>}
        </Section>
        <Section title="Updates sent" description="Watch alerts, newest first">
          {updates.length ? (
            <ul className="space-y-2 text-sm">
              {updates.map((u) => {
                const p = (u.payload ?? {}) as { project?: string; title?: string; body?: string };
                return (
                  <li key={u.id}>
                    <p><span className="font-medium">{p.project}</span> · {p.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{p.body}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Pill tone={u.status === "sent" ? "ok" : "neutral"}>{u.status === "sent" ? "Sent to Telegram" : "Dashboard only"}</Pill>{relative(u.created_at, now)}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No watch updates yet.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
