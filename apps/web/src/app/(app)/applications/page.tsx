import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { APPLICATION_STAGES, CLOSED_STATUSES } from "@xen/core/personal-constants";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationCard, NewApplication } from "@/components/personal/applications";
import { EmptyState, PageHeader, Section } from "@/components/xen/status";
import { cn } from "@/lib/utils";
import { getApplications } from "@/lib/xen/personal-queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Applications" };

export default function ApplicationsPage(props: PageProps<"/applications">) {
  return (
    <div className="space-y-5">
      <PageHeader title="Applications" description="Everything you are pursuing, from interest to payment" />
      <Suspense fallback={<Skeleton className="h-96" />}><Board searchParams={props.searchParams} /></Suspense>
    </div>
  );
}

async function Board({ searchParams }: { searchParams: PageProps<"/applications">["searchParams"] }) {
  const view = (await searchParams).view === "list" ? "list" : "board";
  const [apps, now] = await Promise.all([getApplications(), requestNow()]);
  const open = apps.filter((a) => !(CLOSED_STATUSES as string[]).includes(a.status));
  const closed = apps.filter((a) => (CLOSED_STATUSES as string[]).includes(a.status));
  const tab = (v: string, label: string) => (
    <Link href={v === "board" ? "/applications" : "/applications?view=list"} aria-current={view === v ? "page" : undefined}
      className={cn("rounded-md px-2.5 py-1 text-sm", view === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</Link>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="View" className="flex gap-1">{tab("board", "Board")}{tab("list", "List")}</nav>
        <NewApplication />
      </div>
      {apps.length === 0 ? (
        <EmptyState title="No applications yet">
          Use Track or Applied on any opportunity, or add work you found elsewhere with New application.
        </EmptyState>
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="grid min-w-[64rem] grid-cols-6 gap-3">
            {APPLICATION_STAGES.map((s) => {
              const items = open.filter((a) => (s.statuses as string[]).includes(a.status));
              return (
                <section key={s.key} aria-label={s.label} className="min-w-0 space-y-2">
                  <h2 className="flex items-center justify-between px-1 text-xs font-medium text-muted-foreground">{s.label}<span className="font-mono">{items.length}</span></h2>
                  <ul className="space-y-2">{items.map((a) => <ApplicationCard key={a.id} a={a} now={now} compact />)}</ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">{open.map((a) => <ApplicationCard key={a.id} a={a} now={now} />)}</ul>
      )}
      {closed.length > 0 && (
        <Section title={`Closed (${closed.length})`} description="Rejected, expired and archived">
          <ul className="space-y-2">{closed.map((a) => <ApplicationCard key={a.id} a={a} now={now} />)}</ul>
        </Section>
      )}
    </div>
  );
}
