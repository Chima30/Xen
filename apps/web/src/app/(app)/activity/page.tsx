import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader, Pill, Section } from "@/components/xen/status";
import { formatDateTime, relative } from "@/lib/xen/format";
import { getActivity } from "@/lib/xen/queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Agent Activity" };

export default function ActivityPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Agent Activity" description="What the scheduler and agents did, from the real logs." />
      <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>}>
        <Activity />
      </Suspense>
    </div>
  );
}

type ScanStats = { sourcesScanned?: number; jobsRun?: number; jobsFailed?: number; errors?: string[]; requestsUsed?: number };

async function Activity() {
  const now = await requestNow();
  const { logs, scans, jobs, failedJobs } = await getActivity();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Scheduled runs" description="Cron ticks and briefings, newest first">
          {scans.length ? (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {scans.map((s) => {
                const st = (s.stats ?? {}) as ScanStats;
                return (
                  <li key={s.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs">{s.trigger}</span>
                      <span className="text-xs text-muted-foreground" title={formatDateTime(s.started_at)}>{relative(s.started_at, now)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.error ? <span className="text-destructive">{s.error}</span> : (
                        <>
                          {st.jobsRun !== undefined && `${st.jobsRun} jobs run`}
                          {st.jobsFailed ? ` · ${st.jobsFailed} failed` : ""}
                          {st.requestsUsed !== undefined && ` · ${st.requestsUsed} requests`}
                          {s.finished_at && ` · ${((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 1000).toFixed(1)}s`}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No scheduled runs recorded yet.</p>
          )}
        </Section>

        <Section title="Job queue" description={jobs ? "Last 7 days, by kind and status" : "Visible to the workspace owner"}>
          {jobs === null ? (
            <p className="text-sm text-muted-foreground">Only the workspace owner can view the job queue.</p>
          ) : jobs.length ? (
            <>
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] text-muted-foreground"><tr className="border-b"><th className="py-1.5 font-medium">Kind</th><th className="py-1.5 font-medium">Status</th><th className="py-1.5 text-right font-medium">Jobs</th></tr></thead>
                <tbody className="divide-y">
                  {jobs.map((j) => (
                    <tr key={`${j.kind}-${j.status}`}>
                      <td className="py-1.5 font-mono text-xs">{j.kind}</td>
                      <td className="py-1.5"><Pill tone={j.status === "succeeded" ? "ok" : j.status === "dead" || j.status === "failed" ? "danger" : "neutral"}>{j.status}</Pill></td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{j.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {failedJobs.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-medium text-muted-foreground">Recent failures and retries</h3>
                  <ul className="mt-1 space-y-1.5">
                    {failedJobs.map((j, i) => (
                      <li key={i} className="text-xs">
                        <span className="font-mono">{j.kind}</span> · {j.status} · attempt {j.attempts} · {relative(j.created_at, now)}
                        {j.last_error && <p className="line-clamp-2 text-muted-foreground">{j.last_error}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No jobs in the last 7 days.</p>
          )}
        </Section>
      </div>

      <Section title="Agent log" description="Latest 100 entries">
        {logs.length ? (
          <ul className="divide-y">
            {logs.map((l) => (
              <li key={l.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[7.5rem_8rem_minmax(0,1fr)] sm:gap-3">
                <span className="text-xs text-muted-foreground" title={formatDateTime(l.created_at)}>{relative(l.created_at, now)}</span>
                <span className="flex items-center gap-1.5">
                  <Pill tone={l.level === "error" ? "danger" : l.level === "warn" ? "warn" : "neutral"}>{l.level}</Pill>
                  <span className="font-mono text-xs">{l.agent}</span>
                </span>
                <span className="min-w-0 break-words"><span className="text-muted-foreground">{l.action}:</span> {l.message}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No agent activity logged yet" />
        )}
      </Section>
    </div>
  );
}
