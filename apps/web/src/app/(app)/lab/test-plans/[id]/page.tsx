import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { testPlanToMarkdown, type TestCase } from "@xen/core";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton, DownloadButton } from "@/components/lab/lab-ui";
import { slugify } from "@/components/lab/lab-utils";
import { CaseResult } from "@/components/lab/saved-controls";
import { PageHeader, Pill } from "@/components/xen/status";
import { getTestPlan } from "@/lib/xen/lab-queries";

export const metadata: Metadata = { title: "Test plan" };
const UUID = /^[0-9a-f-]{36}$/i;

export default function TestPlanPage({ params }: PageProps<"/lab/test-plans/[id]">) {
  return (
    <div className="space-y-5">
      <Link href="/lab/test-plans" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Test plans</Link>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Plan params={params} />
      </Suspense>
    </div>
  );
}

async function Plan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await getTestPlan(id);
  if (!data) notFound();
  const { plan, cases } = data;
  const md = testPlanToMarkdown(plan.title ?? "Test plan", cases.map((c) => ({ ...c, area: c.area as TestCase["area"], priority: (c.priority ?? "medium") as TestCase["priority"], preconditions: c.preconditions ?? "" })));
  const byArea = new Map<string, typeof cases>();
  for (const c of cases) byArea.set(c.area, [...(byArea.get(c.area) ?? []), c]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={plan.title ?? "Test plan"}
        description={`${(plan.platform_type ?? "").replace(/_/g, " ")}${plan.platform_url ? ` · ${plan.platform_url}` : ""} · run each case yourself and record what you saw`}
        actions={<><CopyButton text={md} label="Copy plan" /><DownloadButton text={md} filename={`${slugify(plan.title ?? "test-plan")}.md`} /></>}
      />
      {[...byArea.entries()].map(([area, cs]) => (
        <section key={area} className="space-y-2">
          <h2 className="text-sm font-medium capitalize">{area.replace(/_/g, " ")}</h2>
          <ol className="space-y-3">
            {cs.map((c) => (
              <li key={c.id} className="grid gap-4 rounded-md border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {c.title}
                    <Pill tone={c.priority === "high" ? "warn" : "neutral"}>{c.priority ?? "medium"}</Pill>
                  </p>
                  {c.preconditions && <p className="mt-1 text-xs text-muted-foreground">Preconditions: {c.preconditions}</p>}
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                    {(c.steps as string[]).map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                  <p className="mt-2 text-sm"><span className="text-muted-foreground">Expected: </span>{c.expected}</p>
                </div>
                <CaseResult id={c.id} result={c.result} notes={c.notes} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
