import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import type { Bucket } from "@xen/core";
import { Skeleton } from "@/components/ui/skeleton";
import { EarningForm, EarningRowActions, ReportEvidence } from "@/components/personal/earnings";
import { EmptyState, PageHeader, Pill, Section } from "@/components/xen/status";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/xen/format";
import { categoryLabel } from "@/lib/xen/labels";
import { getEarnings } from "@/lib/xen/personal-queries";

export const metadata: Metadata = { title: "Earnings" };

export default function EarningsPage(props: PageProps<"/earnings">) {
  return (
    <div className="space-y-5">
      <PageHeader title="Earnings" description="Money you actually received, kept apart from what you expect. Speculative rewards are never counted." />
      <Suspense fallback={<Skeleton className="h-[40rem]" />}><Earnings searchParams={props.searchParams} /></Suspense>
    </div>
  );
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const currencies = (b: Bucket) => Object.entries(b.byCurrency).map(([c, a]) => `${a.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${c}`).join(" · ");

function Tile({ label, b, hint, strong }: { label: string; b: Bucket; hint: string; strong?: boolean }) {
  return (
    <div className="bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("xen-numeral mt-2 font-mono text-2xl font-medium", !strong && "text-muted-foreground")}>{b.count ? usd(b.usd) : "—"}</dd>
      <p className="mt-1 truncate text-2xs text-muted-foreground" title={currencies(b)}>
        {b.count ? `${b.count} record${b.count === 1 ? "" : "s"}${b.usdMissing ? ` · ${b.usdMissing} without a USD value` : ""}` : hint}
      </p>
    </div>
  );
}

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral" | "info"> = { received: "ok", pending: "warn", expected: "info", unpaid: "danger", rejected: "neutral" };

async function Earnings({ searchParams }: { searchParams: PageProps<"/earnings">["searchParams"] }) {
  const sp = await searchParams;
  const preselect = typeof sp.application === "string" ? sp.application : "";
  const { records, summary: s, applications, projects, reliability, timeZone } = await getEarnings();
  const maxMonth = Math.max(1, ...s.byMonth.map((m) => m.usd));

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border lg:grid-cols-4">
        <Tile label="Received" b={s.received} hint="Confirmed payments only" strong />
        <Tile label="Payment pending" b={s.pending} hint="Work done, waiting to be paid" />
        <Tile label="Expected" b={s.expected} hint="Potential, not earned yet" />
        <Tile label="Unpaid" b={s.unpaid} hint="Completed work that was not paid" />
      </dl>
      <p className="-mt-3 text-xs text-muted-foreground">
        {s.perHourUsd !== null ? <>Earnings per hour <span className="font-mono text-foreground">{usd(s.perHourUsd)}</span> across {s.hoursCounted} h of paid work with time recorded</> : "Add time spent to received payments to see earnings per hour"}
        {s.overdue > 0 && <> · <span className="text-warn">{s.overdue} pending payment{s.overdue === 1 ? " is" : "s are"} past the expected date</span></>}
        {s.received.count > 0 && <> · Received by currency: {currencies(s.received)}</>}
      </p>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Received by month" description="USD value you entered; payments without one are counted but not summed">
            {s.byMonth.length === 0 ? <p className="text-sm text-muted-foreground">No received payments yet.</p> : (
              <ul className="space-y-2">
                {s.byMonth.map((m) => (
                  <li key={m.month} className="grid grid-cols-[5rem_1fr_6rem] items-center gap-3 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{m.month}</span>
                    <span className="h-2 rounded-full bg-muted"><span className="block h-2 rounded-full bg-primary" style={{ width: `${(m.usd / maxMonth) * 100}%` }} /></span>
                    <span className="text-right font-mono tabular-nums">{usd(m.usd)}{m.usdMissing ? <span className="text-muted-foreground"> +{m.usdMissing}</span> : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            {([["By category", s.byCategory, (k: string) => (k === "uncategorised" ? "Uncategorised" : categoryLabel(k))], ["By project", s.byProject, (k: string) => k]] as const).map(([title, list, fmt]) => (
              <Section key={title} title={title} description="Received only">
                {list.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {list.slice(0, 8).map((r) => (
                      <li key={r.key} className="flex justify-between gap-3"><span className="truncate">{fmt(r.key)}</span><span className="shrink-0 font-mono tabular-nums">{usd(r.usd)} <span className="text-muted-foreground">· {r.count}</span></span></li>
                    ))}
                  </ul>
                )}
              </Section>
            ))}
          </div>

          <Section title={`Records (${records.length})`}>
            {records.length === 0 ? <EmptyState title="No payments recorded">Record a payment when work is accepted or paid. Only received payments count as earnings.</EmptyState> : (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr className="border-b">
                    <th className="px-4 py-2 font-normal">For</th><th className="px-2 py-2 font-normal">Status</th><th className="px-2 py-2 text-right font-normal">Amount</th>
                    <th className="px-2 py-2 font-normal">Date</th><th className="px-2 py-2 font-normal">Proof</th><th className="px-4 py-2" />
                  </tr></thead>
                  <tbody className="divide-y">
                    {records.map((r) => (
                      <tr key={r.id} className="align-top">
                        <td className="px-4 py-2.5"><p className="font-medium">{r.title ?? "Payment"}</p><p className="text-xs text-muted-foreground">{[r.project_name, r.category && categoryLabel(r.category)].filter(Boolean).join(" · ")}</p></td>
                        <td className="px-2 py-2.5"><Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill></td>
                        <td className="px-2 py-2.5 text-right font-mono tabular-nums">{Number(r.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} {r.currency}{r.amount_usd !== null && <p className="text-xs text-muted-foreground">{usd(Number(r.amount_usd))}</p>}</td>
                        <td className="px-2 py-2.5 text-xs text-muted-foreground">{r.status === "received" ? `Paid ${formatDate(r.paid_at, timeZone)}` : r.expected_at ? `Expected ${formatDate(r.expected_at, timeZone)}` : "—"}</td>
                        <td className="px-2 py-2.5 text-xs">
                          {r.tx_hash && <p className="font-mono text-muted-foreground" title={r.tx_hash}>{r.tx_hash.slice(0, 10)}…</p>}
                          {r.evidence_url && <a href={r.evidence_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">Evidence <ExternalLink className="size-3" /></a>}
                          {!r.tx_hash && !r.evidence_url && <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right"><EarningRowActions record={r} applications={applications} projects={projects} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Record a payment"><EarningForm applications={applications} projects={projects} preselect={applications.some((a) => a.id === preselect) ? preselect : ""} /></Section>
        </div>
      </div>

      <Section title="Payment reliability" description="How projects have paid. Labels come only from verified evidence; community reports are shown separately and are not proof.">
        {reliability.summary.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment evidence yet. Your received payments with a transaction hash or evidence link are added here automatically.</p>
        ) : (
          <ul className="divide-y">
            {reliability.summary.map((p) => (
              <li key={p.projectId} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/projects/${p.projectId}`} className="font-medium hover:underline">{p.projectName}</Link>
                  <p className="text-xs text-muted-foreground">{p.lastEvidenceAt && `Latest evidence ${formatDate(p.lastEvidenceAt, timeZone)}`}</p>
                </div>
                <div className="text-right">
                  <Pill tone={p.tone === "good" ? "ok" : p.tone === "bad" ? "danger" : p.tone === "mixed" ? "warn" : "neutral"}>{p.label}</Pill>
                  {p.allegations.total > 0 && <p className="mt-1 text-xs text-muted-foreground">Community reports (unverified): {p.allegations.total}{p.allegations.unpaid ? `, ${p.allegations.unpaid} say unpaid` : ""}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t pt-4"><ReportEvidence projects={projects} /></div>
      </Section>
    </div>
  );
}
