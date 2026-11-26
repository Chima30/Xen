import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { ListSkeleton } from "@/components/xen/discover-view";
import { EmptyState, PageHeader, Pill } from "@/components/xen/status";
import { relative } from "@/lib/xen/format";
import { getLeads } from "@/lib/xen/intel-queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Hidden Opportunities" };

export default function LeadsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Hidden Opportunities"
        description="Projects that may need testers although no public program was found. These are outreach leads, not paid opportunities"
      />
      <Suspense fallback={<ListSkeleton />}>
        <Leads />
      </Suspense>
    </div>
  );
}

async function Leads() {
  const now = await requestNow();
  const { leads, considered } = await getLeads(now);
  if (!leads.length) {
    return (
      <EmptyState title="No leads yet">
        {considered
          ? `${considered} project(s) have recent signals, but none is a likely lead right now (for example, they already have an open testing opportunity).`
          : "Leads come from evidence-backed project signals such as funding, beta openings, waitlists and testnets. None has been recorded in the last 120 days."}
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {leads.map((l) => (
        <li key={l.projectId} className="rounded-md border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link href={`/projects/${l.projectId}`} className="text-sm font-medium hover:underline">{l.name}</Link>
              <p className="text-xs text-muted-foreground">{l.reasons.join(" · ")}</p>
            </div>
            <Pill tone={l.confidence === "high" ? "info" : "neutral"} title={`Lead score ${l.score}/100`}>{l.confidence} confidence lead</Pill>
          </div>

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-xs text-muted-foreground">Why it may need testers</h3>
              <ul className="mt-1 space-y-2">
                {l.evidence.map((e, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{e.label}</span> <span className="text-muted-foreground">· {e.summary} · {relative(e.observedAt, now)}</span>
                    {e.excerpt && <blockquote className="mt-1 border-l pl-3 text-xs text-foreground/80">“{e.excerpt}”</blockquote>}
                    <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground">source <ExternalLink className="size-3" /></a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <div>
                <h3 className="text-xs text-muted-foreground">Suggested approach</h3>
                <p className="mt-1 text-sm">{l.approach}</p>
              </div>
              <div>
                <h3 className="text-xs text-muted-foreground">Official channels</h3>
                {l.contacts.length ? (
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {l.contacts.map((c) => <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">{c.label} <ExternalLink className="size-3" /></a>)}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No official channel stored yet. Find it on the project&apos;s own site before reaching out.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">XEN never sends outreach for you. Any message is yours to write and send.</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
