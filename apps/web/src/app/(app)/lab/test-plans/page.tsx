import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { LabTabs } from "@/components/lab/lab-ui";
import { TestPlanForm } from "@/components/lab/test-plan-form";
import { PageHeader, Section } from "@/components/xen/status";
import { formatDate } from "@/lib/xen/format";
import { getTestPlans } from "@/lib/xen/lab-queries";

export const metadata: Metadata = { title: "Test plans" };

export default function TestPlansPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Testing Lab" description="Structured manual test plans for the platform you are testing" />
      <LabTabs active="/lab/test-plans" />
      <Section title="New test plan" description="You run these yourself, only within the scope the project allows. Use testnets or the smallest amounts.">
        <TestPlanForm />
      </Section>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Plans />
      </Suspense>
    </div>
  );
}

async function Plans() {
  const plans = await getTestPlans();
  return (
    <Section title={`Your plans (${plans.length})`}>
      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No test plans yet.</p>
      ) : (
        <ul className="divide-y">
          {plans.map((p) => (
            <li key={p.id}>
              <Link href={`/lab/test-plans/${p.id}`} className="flex items-center justify-between gap-4 py-3 hover:underline">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">{(p.platform_type ?? "").replace(/_/g, " ")} · {formatDate(p.started_at)}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {p.run}/{p.total} run{p.failed ? ` · ${p.failed} failed` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
