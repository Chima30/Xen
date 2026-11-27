import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { UPDATE_TYPES, UPDATE_TYPE_LABELS } from "@xen/core";
import { Skeleton } from "@/components/ui/skeleton";
import { OpportunityTable } from "@/components/xen/opportunity-table";
import { SignalList } from "@/components/xen/signal-list";
import { EmptyState, Pill, Section } from "@/components/xen/status";
import { AlternativesButton, WatchToggle, WatchTypesEditor } from "@/components/xen/watch-controls";
import { formatDateTime, relative } from "@/lib/xen/format";
import { getProject } from "@/lib/xen/intel-queries";
import { getReliability } from "@/lib/xen/personal-queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Project" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTIONS = UPDATE_TYPES.map((t) => ({ value: t, label: UPDATE_TYPE_LABELS[t] }));

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Projects</Link>
      <Suspense fallback={<div className="space-y-4" aria-busy="true"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>}>
        <Project params={params} />
      </Suspense>
    </div>
  );
}

const fmtUsd = (n: unknown) => (typeof n === "number" ? `$${n.toLocaleString("en-US")}` : null);

async function Project({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const now = await requestNow();
  const [d, payments] = await Promise.all([getProject(id), getReliability([id])]);
  if (!d) notFound();
  const { project: p, signals, opportunities, changes, watch, similar, sources, user } = d;
  const funding = p.funding as { funding_amount_usd?: number | null; funding_round?: string | null; investors?: string[]; source_url?: string; excerpt?: string; observed_at?: string; verified?: boolean } | null;
  const links = [
    p.website && { label: "Website", url: p.website },
    ...Object.entries(p.socials ?? {}).map(([k, v]) => ({ label: k === "x" ? "X" : k, url: v })),
    ...p.github_repos.map((r) => ({ label: r, url: `https://github.com/${r}` })),
  ].filter(Boolean) as { label: string; url: string }[];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-md border bg-card p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-xl font-medium tracking-tight">{p.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {p.category && <span>{p.category}</span>}
            {p.stage !== "unknown" && <Pill>{p.stage.replaceAll("_", " ")}</Pill>}
            {p.ecosystems.length > 0 && <span>{p.ecosystems.join(", ")}</span>}
            {p.last_monitored_at && <span>Last seen {relative(p.last_monitored_at, now)}</span>}
          </p>
          {p.description && <p className="max-w-3xl text-sm text-foreground/90">{p.description}</p>}
          {links.length > 0 && (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">{l.label} <ExternalLink className="size-3" /></a>)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <WatchToggle projectId={p.id} watching={!!watch} />
          {user.role === "owner" && <AlternativesButton projectId={p.id} />}
        </div>
      </header>

      {watch && (
        <Section title="Your watch" description="Choose what XEN tells you about">
          <WatchTypesEditor projectId={p.id} selected={watch.update_types as string[]} options={OPTIONS} />
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Signals" description="What the project has said or done, each with the quote it rests on">
            {signals.length ? <SignalList signals={signals} now={now} /> : <p className="text-sm text-muted-foreground">No signals recorded yet. Signals are stored only when their quote is found word for word in the source.</p>}
          </Section>

          <div className="space-y-2">
            <h2 className="text-sm font-medium">Opportunities</h2>
            {opportunities.length ? <OpportunityTable rows={opportunities} now={now} /> : <EmptyState title="No opportunities from this project yet" />}
          </div>

          {changes.length > 0 && (
            <Section title="Page changes" description="Differences between stored versions of this project's pages">
              <ul className="space-y-3">
                {changes.map((c) => (
                  <li key={c.id} className="text-sm">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(c.detected_at)} WAT
                      {c.deadline_changed && <> · <span className="text-warn">dates {(c.dates_before as string[]).join(", ") || "—"} → {(c.dates_after as string[]).join(", ") || "—"}</span></>}
                      {c.reward_changed && <> · <span className="text-warn">amounts {(c.amounts_before as string[]).join(", ") || "—"} → {(c.amounts_after as string[]).join(", ") || "—"}</span></>}
                      {!c.significant && " · minor"}
                    </p>
                    {(c.added_lines as string[]).slice(0, 3).map((l, i) => <p key={`a${i}`} className="truncate text-xs"><span className="text-ok">+</span> {l}</p>)}
                    {(c.removed_lines as string[]).slice(0, 2).map((l, i) => <p key={`r${i}`} className="truncate text-xs text-muted-foreground"><span className="text-destructive">−</span> {l}</p>)}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <Section title="Payment record" description="Verified evidence only sets the label; community reports are listed apart">
            {payments.summary.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment evidence for this project yet.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <Pill tone={payments.summary[0].tone === "good" ? "ok" : payments.summary[0].tone === "bad" ? "danger" : payments.summary[0].tone === "mixed" ? "warn" : "neutral"}>{payments.summary[0].label}</Pill>
                <ul className="space-y-2">
                  {payments.rows.slice(0, 6).map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="text-foreground">{r.evidence_type === "community_allegation" ? "Community report (unverified)" : r.evidence_type === "verified_user_payment" ? "Paid-user record (with proof)" : r.evidence_type === "official_announcement" ? "Official announcement" : "Public evidence"}</span>
                      {" · "}{r.outcome.replaceAll("_", " ")}{r.details ? ` · ${r.details}` : ""}
                      {r.source_url && <> · <a href={r.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline hover:text-foreground">source</a></>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Funding" description="Only when stated in a source and quoted">
            {funding?.verified !== false && funding?.source_url ? (
              <dl className="space-y-2 text-sm">
                {fmtUsd(funding.funding_amount_usd) && <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="font-mono">{fmtUsd(funding.funding_amount_usd)}</dd></div>}
                {funding.funding_round && <div><dt className="text-xs text-muted-foreground">Round</dt><dd>{funding.funding_round}</dd></div>}
                {funding.investors?.length ? <div><dt className="text-xs text-muted-foreground">Investors named in the quote</dt><dd>{funding.investors.join(", ")}</dd></div> : null}
                {funding.excerpt && <blockquote className="border-l pl-3 text-xs text-foreground/80">“{funding.excerpt}”</blockquote>}
                <a href={funding.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Source <ExternalLink className="size-3" /></a>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No verified funding information.</p>
            )}
          </Section>

          <Section title="Monitored sources">
            {sources.length ? (
              <ul className="space-y-2 text-sm">
                {sources.map((s) => (
                  <li key={s.id}>
                    <p>{s.name.replace(/^Watch: /, "")}</p>
                    <p className="text-xs text-muted-foreground">{s.adapter_id} · every {s.scan_interval_minutes} min · {s.status}{s.last_success_at ? ` · checked ${relative(s.last_success_at, now)}` : " · not checked yet"}</p>
                    {s.last_error && <p className="line-clamp-2 text-xs text-destructive">{s.last_error}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None. Watch the project with its website, feed or GitHub repository to monitor it directly.</p>
            )}
          </Section>

          <Section title="Similar projects" description="Same category words or ecosystems. Not confirmed competitors">
            {similar.length ? (
              <ul className="space-y-2 text-sm">
                {similar.map((s) => (
                  <li key={s.id}>
                    <Link href={`/projects/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                    <p className="text-xs text-muted-foreground">{s.why.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{p.category ? "No stored project shares this category yet." : "Unknown category, so nothing to compare."}</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
