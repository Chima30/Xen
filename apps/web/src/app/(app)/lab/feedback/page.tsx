import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackForm } from "@/components/lab/feedback-form";
import { CopyButton, LabTabs } from "@/components/lab/lab-ui";
import { FeedbackStatus } from "@/components/lab/saved-controls";
import { PageHeader, Section } from "@/components/xen/status";
import { formatDate } from "@/lib/xen/format";
import { getFeedbackItems } from "@/lib/xen/lab-queries";

export const metadata: Metadata = { title: "Feedback" };

export default function FeedbackPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Testing Lab" description="Clear product feedback from your own observations" />
      <LabTabs active="/lab/feedback" />
      <Section title="Feedback assistant"><FeedbackForm /></Section>
      <Suspense fallback={<Skeleton className="h-32" />}><Saved /></Suspense>
    </div>
  );
}

async function Saved() {
  const items = await getFeedbackItems();
  return (
    <Section title={`Saved feedback (${items.length})`}>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Nothing saved yet.</p> : (
        <ul className="divide-y">
          {items.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{f.headline}</p>
                <p className="text-xs text-muted-foreground">{f.project_name || "Unnamed project"} · {f.category.replace(/_/g, " ")} · {formatDate(f.created_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <FeedbackStatus id={f.id} status={f.status} />
                <CopyButton text={[f.headline, "", f.body].join("\n")} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
