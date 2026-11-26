import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BugReportForm } from "@/components/lab/bug-report-form";
import { CopyButton, LabTabs } from "@/components/lab/lab-ui";
import { BugStatus } from "@/components/lab/saved-controls";
import { PageHeader, Pill, Section } from "@/components/xen/status";
import { formatDate } from "@/lib/xen/format";
import { getBugReports } from "@/lib/xen/lab-queries";
import { getCurrentUser } from "@/lib/xen/queries";

export const metadata: Metadata = { title: "Testing Lab" };

export default function LabPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Testing Lab" description="Turn what you observed into professional reports. XEN structures your notes; it never invents findings." />
      <LabTabs active="/lab" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Lab />
      </Suspense>
    </div>
  );
}

const SEV_TONE = { critical: "danger", high: "warn", medium: "info", low: "neutral" } as const;

async function Lab() {
  const [user, reports] = await Promise.all([getCurrentUser(), getBugReports()]);
  return (
    <div className="space-y-6">
      <Section title="Bug report generator" description="Fill in what you saw. Anything you leave empty stays marked “Not provided”.">
        <BugReportForm userId={user.id} />
      </Section>
      <Section title={`Your reports (${reports.length})`} description="Mark each one as submitted or accepted to build your tester portfolio">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved reports yet.</p>
        ) : (
          <ul className="divide-y">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {r.severity && <Pill tone={SEV_TONE[r.severity as keyof typeof SEV_TONE] ?? "neutral"}>{r.severity}</Pill>}
                    {((r.input as { project?: string } | null)?.project) || "Unnamed project"} · {formatDate(r.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <BugStatus id={r.id} status={r.status} submittedUrl={r.submitted_url} />
                  <CopyButton text={r.report_markdown} label="Copy report" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
