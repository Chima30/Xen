import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OutreachComposer, OutreachRow } from "@/components/lab/outreach-workspace";
import { PageHeader, Section } from "@/components/xen/status";
import { getOutreach } from "@/lib/xen/lab-queries";

export const metadata: Metadata = { title: "Outreach" };

export default function OutreachPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Outreach" description="Draft and track offers to projects. You review, copy and send every message yourself; XEN never contacts anyone." />
      <Suspense fallback={<Skeleton className="h-96" />}><Outreach /></Suspense>
    </div>
  );
}

async function Outreach() {
  const { messages, projects } = await getOutreach();
  const counts = {
    sent: messages.filter((m) => ["sent_by_user", "replied", "accepted", "declined", "no_response"].includes(m.status)).length,
    replied: messages.filter((m) => ["replied", "accepted", "declined"].includes(m.status)).length,
    accepted: messages.filter((m) => m.status === "accepted").length,
  };
  return (
    <div className="space-y-6">
      <Section title="New message"><OutreachComposer projects={projects} /></Section>
      <Section
        title={`Tracker (${messages.length})`}
        description={`${counts.sent} sent · ${counts.replied} replied · ${counts.accepted} accepted`}
      >
        {messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet.</p> : (
          <ul className="divide-y">{messages.map((m) => <OutreachRow key={m.id} m={m} />)}</ul>
        )}
      </Section>
    </div>
  );
}
