import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DoneTask, NewTask, TaskRow } from "@/components/personal/tasks";
import { EmptyState, PageHeader, Section } from "@/components/xen/status";
import { getTasks } from "@/lib/xen/personal-queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "My Tasks" };

export default function TasksPage(props: PageProps<"/tasks">) {
  return (
    <div className="space-y-5">
      <PageHeader title="My Tasks" description="Your own to-dos, with optional Telegram reminders" />
      <Suspense fallback={<Skeleton className="h-96" />}><Tasks searchParams={props.searchParams} /></Suspense>
    </div>
  );
}

async function Tasks({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  const sp = await searchParams;
  const preselect = typeof sp.application === "string" ? sp.application : "";
  const [{ open, done, applications }, now] = await Promise.all([getTasks(), requestNow()]);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Section title={`Open (${open.length})`}>
          {open.length === 0 ? <EmptyState title="No open tasks">Add one with the form, or from an application.</EmptyState> : (
            <ul className="divide-y">{open.map((t) => <TaskRow key={t.id} t={t} now={now} />)}</ul>
          )}
        </Section>
        {done.length > 0 && (
          <Section title="Recently completed">
            <ul className="divide-y">{done.map((t) => <DoneTask key={t.id} t={t} />)}</ul>
          </Section>
        )}
      </div>
      <Section title="New task"><NewTask applications={applications} preselect={applications.some((a) => a.id === preselect) ? preselect : ""} /></Section>
    </div>
  );
}
