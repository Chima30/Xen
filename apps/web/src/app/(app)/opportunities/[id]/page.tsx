import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft, Check, CircleHelp, ExternalLink, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppliedButton, HideButton, SaveButton } from "@/components/xen/opportunity-actions";
import { OpportunityTable } from "@/components/xen/opportunity-table";
import { CapitalPill, Pill, RewardPill, Score, Section, VerifyMark } from "@/components/xen/status";
import { cn } from "@/lib/utils";
import { deadlineTone, formatDate, formatDateTime, formatMinutes, formatReward, relative } from "@/lib/xen/format";
import { categoryLabel, PRIORITY, REWARD_STATUS, riskLabel } from "@/lib/xen/labels";
import { getOpportunity, type ScoreBreakdown } from "@/lib/xen/queries";
import { requestNow } from "@/lib/xen/time";

export const metadata: Metadata = { title: "Opportunity" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function OpportunityPage({ params }: PageProps<"/opportunities/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Discover</Link>
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

const FACTOR_LABELS: Record<string, string> = {
  reward_certainty: "Reward certainty",
  credibility: "Credibility",
  zero_capital: "Zero capital",
  reward_effort: "Reward vs effort",
  eligibility: "Eligibility",
  urgency: "Urgency",
};

const CHECK_LABELS: Record<string, string> = {
  official_source: "Official source",
  application_link: "Application link",
  impersonation: "Impersonation",
  reward_evidence: "Reward evidence",
  reward_amount_in_source: "Reward amount in source",
  deadline: "Deadline",
};

type Check = { name: string; passed: boolean | null; detail: string };

const EVIDENCE_KIND: Record<string, string> = {
  reward: "Supports the reward",
  eligibility: "Supports eligibility",
  deadline: "Supports the deadline",
  official_link: "Official link",
  capital: "Supports the capital requirement",
  general: "General",
};

const hostOf = (url: string) => {
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url; }
};

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const now = await requestNow();
  const data = await getOpportunity(id);
  if (!data) notFound();
  const { o, evidence, verifications, project, saved, hidden, application, related, relatedBy } = data;
  const sb = (o.score_breakdown ?? {}) as ScoreBreakdown;
  const reward = formatReward(o.reward_amount, o.reward_amount_max, o.reward_currency);
  const latest = verifications[0];
  const checks = (latest?.checks ?? []) as Check[];
  const dTone = deadlineTone(o.deadline_at, now);
  const priority = sb.priority ? PRIORITY[sb.priority] : null;
  const isRisky = o.verification === "suspicious" || (o.risk_flags as string[]).length > 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-4 rounded-md border bg-card p-4 md:flex-row md:items-start">
        <Score value={o.score} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {o.project_name && <span className="font-medium text-foreground">{o.project_name}</span>}
            <span>{categoryLabel(o.category)}</span>
            <span>Tier {String(o.tier).replace("tier", "")}</span>
            {priority && <Pill tone={priority.tone}>{priority.label}</Pill>}
            {!o.is_active && <Pill>Inactive</Pill>}
          </div>
          <h1 className="flex items-start gap-2 text-xl font-medium tracking-tight text-balance"><VerifyMark status={o.verification} className="mt-2" />{o.title}</h1>
          <div className="flex flex-wrap gap-2">
            <RewardPill status={o.reward_status} />
            <CapitalPill capital={o.capital} />
            {sb.eligibility && <Pill tone={sb.eligibility === "ineligible" ? "danger" : "neutral"}>{sb.eligibility === "eligible" ? "Eligible" : sb.eligibility === "ineligible" ? "Not eligible" : "Eligibility unclear"}</Pill>}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <SaveButton id={o.id} saved={saved} variant="full" />
            <AppliedButton id={o.id} status={application?.status ?? null} />
            <HideButton id={o.id} hidden={hidden} />
            {o.application_url && !isRisky && (
              <a href={o.application_url} target="_blank" rel="noopener noreferrer nofollow" className={buttonVariants({ size: "sm" })}>Apply <ExternalLink /></a>
            )}
            <a href={o.source_url} target="_blank" rel="noopener noreferrer nofollow" className={buttonVariants({ variant: "outline", size: "sm" })}>Source <ExternalLink /></a>
          </div>
        </div>
      </header>

      {isRisky && (
        <div role="alert" className="flex gap-3 rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <p className="font-medium">Check this carefully before taking part</p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {(o.risk_flags as string[]).map((f) => <li key={f}>{riskLabel(f)}</li>)}
              {o.verification === "suspicious" && <li>Verification marked this as suspicious. Never share seed phrases, private keys or pay upfront fees.</li>}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Summary">
            {o.description ? <p className="text-sm leading-relaxed whitespace-pre-line">{o.description}</p> : <p className="text-sm text-muted-foreground">No description was extracted.</p>}
            {o.instructions && (
              <div className="mt-4">
                <h3 className="text-xs font-medium text-muted-foreground">How to participate</h3>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{o.instructions}</p>
              </div>
            )}
          </Section>

          <Section title="Reward" description={REWARD_STATUS[o.reward_status]?.hint}>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <Item label="Amount">{reward ? <span className="font-mono">{reward}</span> : "Not stated"}</Item>
              <Item label="Certainty"><RewardPill status={o.reward_status} /></Item>
              <Item label="Conditions">{o.reward_conditions ?? "None stated"}</Item>
            </dl>
            {o.reward_status === "speculative" && <p className="mt-3 text-xs text-muted-foreground">A speculative reward, such as a possible airdrop or points, is not guaranteed income.</p>}
          </Section>

          <Section title="Requirements and eligibility">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <Item label="Capital"><CapitalPill capital={o.capital} />{o.capital_notes && <p className="mt-1 text-xs text-muted-foreground">{o.capital_notes}</p>}</Item>
              <Item label="Regions allowed">{(o.geo_allowed as string[]).length ? (o.geo_allowed as string[]).join(", ") : "Not stated"}</Item>
              <Item label="Regions excluded">{(o.geo_restrictions as string[]).length ? (o.geo_restrictions as string[]).join(", ") : "None stated"}</Item>
              <Item label="KYC">{o.kyc_required === null ? "Not stated" : o.kyc_required ? "Required" : "Not required"}</Item>
              <Item label="Skills">{(o.required_skills as string[]).length ? (o.required_skills as string[]).join(", ") : "Not stated"}</Item>
              <Item label="Difficulty">{o.difficulty ? o.difficulty.charAt(0).toUpperCase() + o.difficulty.slice(1) : "Not stated"}</Item>
              <Item label="Estimated effort">{formatMinutes(o.estimated_minutes) ?? "Not stated"}</Item>
              <Item label="Blockchains">{(o.networks as string[]).length ? (o.networks as string[]).join(", ") : "Not stated"}</Item>
            </dl>
            {(o.missing_fields as string[]).length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Not found in the source: {(o.missing_fields as string[]).map((f) => f.replace(/_at$/, "").replaceAll("_", " ")).join(", ")}</p>
            )}
          </Section>

          <Section title="Evidence" description="Quoted from the source and matched word for word">
            {evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quote could be matched in the source text, so nothing here is treated as confirmed.</p>
            ) : (
              <ul className="space-y-3">
                {evidence.map((e, i) => (
                  <li key={i}>
                    {/* A clipped excerpt: what it supports, where it came from, the words themselves */}
                    <figure className="rounded-md border bg-background/60">
                      <figcaption className="flex items-center gap-2 border-b px-3 py-2 text-2xs text-muted-foreground">
                        <VerifyMark status="verified_announcement" className="size-2.5" />
                        <span className="text-foreground">{EVIDENCE_KIND[e.kind] ?? e.kind.replaceAll("_", " ")}</span>
                        <span className="ml-auto truncate font-mono">{hostOf(e.source_url)}</span>
                      </figcaption>
                      <blockquote className="px-3 py-3 text-sm leading-relaxed text-foreground/90">“{e.excerpt}”</blockquote>
                    </figure>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {related.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium">{relatedBy === "project" ? "More from this project" : `More ${categoryLabel(o.category).toLowerCase()} opportunities`}</h2>
              <OpportunityTable rows={related} now={now} showSave={false} />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Section title="Key dates">
            <dl className="space-y-3 text-sm">
              <Item label="Deadline">
                {o.deadline_at ? <span className={cn(dTone === "danger" && "text-destructive", dTone === "warn" && "text-warn")}>{formatDateTime(o.deadline_at)} WAT · {relative(o.deadline_at, now)}</span> : "None stated"}
              </Item>
              {o.registration_opens_at && <Item label="Registration opens">{formatDateTime(o.registration_opens_at)} WAT</Item>}
              <Item label="Announced">{formatDate(o.announced_at)}</Item>
              <Item label="Discovered by XEN">{formatDateTime(o.discovered_at)} WAT</Item>
              <Item label="Last verified">{formatDateTime(o.last_verified_at)}</Item>
            </dl>
          </Section>

          <Section title="Score breakdown" description={sb.capped ? `Capped: ${sb.capped.replaceAll("_", " ")}` : "Weighted for a zero-capital profile in Nigeria"}>
            <ul className="space-y-3">
              {(sb.factors ?? []).map((f) => (
                <li key={f.key} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>{FACTOR_LABELS[f.key] ?? f.key}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{f.points}/{f.weight}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/50" style={{ width: `${f.weight ? (f.points / f.weight) * 100 : 0}%` }} /></div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{f.reason}</p>
                </li>
              ))}
              {!sb.factors?.length && <p className="text-sm text-muted-foreground">No score breakdown recorded.</p>}
            </ul>
          </Section>

          <Section title="Verification" description={latest ? `Confidence ${Math.round(Number(latest.confidence) * 100)}% · ${formatDateTime(latest.verified_at)}` : undefined}>
            {checks.length ? (
              <ul className="space-y-2">
                {checks.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    {c.passed === true ? <Check className="mt-0.5 size-4 shrink-0 text-ok" /> : c.passed === false ? <X className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CircleHelp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                    <span><span className="font-medium">{CHECK_LABELS[c.name] ?? c.name}</span><span className="block text-xs text-muted-foreground">{c.detail}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No verification record.</p>
            )}
            {verifications.length > 1 && (
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer">History ({verifications.length})</summary>
                <ul className="mt-2 space-y-1">
                  {verifications.map((v, i) => <li key={i}>{formatDateTime(v.verified_at)} · {v.status.replaceAll("_", " ")} · {Math.round(Number(v.confidence) * 100)}%</li>)}
                </ul>
              </details>
            )}
          </Section>

          <Section title="Project">
            {project ? (
              <dl className="space-y-3 text-sm">
                <Item label="Name">{project.name}</Item>
                {project.website && <Item label="Website"><a className="text-primary hover:underline" href={project.website} target="_blank" rel="noopener noreferrer nofollow">{project.website.replace(/^https?:\/\//, "")}</a></Item>}
                <Item label="Stage">{String(project.stage).replaceAll("_", " ")}</Item>
                {project.description && <Item label="About">{project.description}</Item>}
                {(project.ecosystems as string[])?.length > 0 && <Item label="Ecosystems">{(project.ecosystems as string[]).join(", ")}</Item>}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No project profile yet. Project intelligence arrives in Phase 5.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-36 w-full" />
      <div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
    </div>
  );
}
