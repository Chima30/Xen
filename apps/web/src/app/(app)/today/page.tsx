import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MinutesControl } from "@/components/personal/minutes-control";
import { EmptyState, PageHeader, Pill } from "@/components/xen/status";
import { formatDate, formatMinutes } from "@/lib/xen/format";
import { getDailyPlan } from "@/lib/xen/personal-queries";
import type { PlanItem } from "@xen/core";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage(props: PageProps<"/today">) {
  return (
    <div className="space-y-5">
      <PageHeader title="Today" description="What is worth your time today, from your tasks, applications, watchlist and the best open opportunities" />
      <Suspense fallback={<Skeleton className="h-96" />}><Plan searchParams={props.searchParams} /></Suspense>
    </div>
  );
}

const KIND: Record<PlanItem["kind"], { label: string; tone: "danger" | "warn" | "ok" | "info" | "neutral" }> = {
  task: { label: "Task", tone: "neutral" },
  follow_up: { label: "Follow-up", tone: "warn" },
  submission: { label: "Deadline", tone: "danger" },
  watch_update: { label: "Watchlist", tone: "info" },
  opportunity: { label: "Opportunity", tone: "ok" },
};

async function Plan({ searchParams }: { searchParams: PageProps<"/today">["searchParams"] }) {
  const sp = await searchParams;
  const raw = Number(Array.isArray(sp.minutes) ? sp.minutes[0] : sp.minutes);
  const override = Number.isInteger(raw) && raw >= 0 && raw <= 1440 ? raw : undefined;
  const { plan, timeZone, savedMinutes } = await getDailyPlan(override);
  const budget = plan.budgetMinutes;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MinutesControl minutes={budget} saved={savedMinutes} />
        <p className="text-sm text-muted-foreground">
          Planned <span className="font-mono tabular-nums text-foreground">{formatMinutes(plan.plannedMinutes) ?? "0 min"}</span> of {formatMinutes(budget) ?? "0 min"}
          {plan.unknownEffort > 0 && <> · {plan.unknownEffort} item{plan.unknownEffort === 1 ? "" : "s"} with no stated effort, counted as 30 min</>}
        </p>
      </div>
      {plan.items.length === 0 ? (
        <EmptyState title="Nothing needs you today">
          No tasks are due, no follow-ups are waiting and no open opportunity scores 50 or more for your profile. XEN does not add busywork to fill the day.
        </EmptyState>
      ) : (
        <ol className="space-y-3">{plan.items.map((i, n) => <PlanRow key={i.id} item={i} n={n + 1} timeZone={timeZone} />)}</ol>
      )}
      {plan.later.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">If you have more time</h2>
          <ul className="divide-y rounded-md border">
            {plan.later.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <Link href={i.href} className="min-w-0 truncate hover:underline">{i.title}</Link>
                <span className="text-xs text-muted-foreground">{i.why}{i.minutes ? ` · ${formatMinutes(i.minutes)}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlanRow({ item: i, n, timeZone }: { item: PlanItem; n: number; timeZone: string }) {
  const k = KIND[i.kind];
  return (
    <li className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{String(n).padStart(2, "0")}</span>
            <Pill tone={k.tone}>{k.label}</Pill>
            <span>{i.activity}</span>
            {i.required && <span className="text-foreground">Must do</span>}
          </p>
          <Link href={i.href} className="block text-sm font-medium hover:underline">{i.title}</Link>
          <p className="text-xs text-muted-foreground">{i.why}</p>
        </div>
        <dl className="grid grid-cols-3 gap-4 text-right text-xs">
          <div><dt className="text-muted-foreground">Reward</dt><dd className="mt-0.5 font-mono">{i.reward ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Effort</dt><dd className="mt-0.5 font-mono">{formatMinutes(i.minutes) ?? "Not stated"}</dd></div>
          <div><dt className="text-muted-foreground">Deadline</dt><dd className="mt-0.5 font-mono">{i.deadline ? formatDate(i.deadline, timeZone) : "—"}</dd></div>
        </dl>
      </div>
      {(i.instructions || i.project || i.sourceUrl) && (
        <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {i.project && <p>Project: <span className="text-foreground">{i.project}</span></p>}
          {i.instructions && <p className="line-clamp-3">How to take part: {i.instructions}</p>}
          {i.sourceUrl && (
            <a href={i.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-foreground">
              Original source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
    </li>
  );
}
