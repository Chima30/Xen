import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/lib/xen/labels";
import { deadlineTone, formatDate, formatReward, relative } from "@/lib/xen/format";
import type { OppRow } from "@/lib/xen/queries";
import { SaveButton } from "./opportunity-actions";
import { CapitalPill, Pill, RewardPill, Score, VerificationPill } from "./status";

/**
 * Dense, scannable opportunity list. A table on wide screens and stacked rows on phones,
 * from the same markup. `now` is the request time, so relative dates match the server render.
 */
export function OpportunityTable({ rows, saved, now, showSave = true }: { rows: OppRow[]; saved?: Set<string>; now: number; showSave?: boolean }) {
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="hidden grid-cols-[3rem_minmax(0,1fr)_9rem_8.5rem_7rem_6.5rem_2.25rem] gap-3 border-b bg-muted/40 px-3 py-2 text-[11px] font-medium text-muted-foreground lg:grid">
        <span>Score</span>
        <span>Opportunity</span>
        <span>Reward</span>
        <span>Verification</span>
        <span>Deadline</span>
        <span>Discovered</span>
        <span className="sr-only">Save</span>
      </div>
      <ul className="divide-y">
        {rows.map((o) => {
          const reward = formatReward(o.reward_amount, o.reward_amount_max, o.reward_currency);
          const dTone = deadlineTone(o.deadline_at, now);
          const expired = o.deadline_at && new Date(o.deadline_at).getTime() < now;
          return (
            <li key={o.id} className="group relative grid grid-cols-[3rem_minmax(0,1fr)_2.25rem] items-start gap-3 px-3 py-2.5 hover:bg-muted/30 lg:grid-cols-[3rem_minmax(0,1fr)_9rem_8.5rem_7rem_6.5rem_2.25rem] lg:items-center">
              <Score value={o.score} />
              <div className="min-w-0">
                <Link href={`/opportunities/${o.id}`} className="line-clamp-1 text-sm font-medium after:absolute after:inset-0 hover:underline">
                  {o.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {o.project_name && <span className="font-medium text-foreground/80">{o.project_name}</span>}
                  <span>{categoryLabel(o.category)}</span>
                  <CapitalPill capital={o.capital} />
                  {o.risk_flags.length > 0 && (
                    <Pill tone="warn" title={o.risk_flags.join(", ")}><AlertTriangle className="size-3" />{o.risk_flags.length} risk flag{o.risk_flags.length > 1 ? "s" : ""}</Pill>
                  )}
                  {!o.is_active && <Pill>Inactive</Pill>}
                  {/* Phone-only summary of the columns hidden below lg */}
                  <span className="flex flex-wrap items-center gap-2 lg:hidden">
                    {reward && <span className="font-mono text-foreground">{reward}</span>}
                    <RewardPill status={o.reward_status} />
                    {o.deadline_at && <span className={cn(dTone === "danger" && "text-destructive", dTone === "warn" && "text-warn")}>Due {formatDate(o.deadline_at)}</span>}
                  </span>
                </div>
              </div>
              <div className="hidden min-w-0 flex-col items-start gap-1 lg:flex">
                <span className="block max-w-full truncate font-mono text-sm" title={reward ?? undefined}>{reward ?? <span className="text-muted-foreground">Not stated</span>}</span>
                <RewardPill status={o.reward_status} />
              </div>
              <div className="hidden lg:block"><VerificationPill status={o.verification} /></div>
              <div className="hidden text-sm lg:block">
                {o.deadline_at ? (
                  <span className={cn(dTone === "danger" && "text-destructive", dTone === "warn" && "text-warn", expired && "text-muted-foreground line-through")} title={formatDate(o.deadline_at)}>
                    {relative(o.deadline_at, now)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">None stated</span>
                )}
              </div>
              <div className="hidden text-sm text-muted-foreground lg:block" title={formatDate(o.discovered_at)}>{relative(o.discovered_at, now)}</div>
              <div className="relative z-10 justify-self-end">{showSave && <SaveButton id={o.id} saved={saved?.has(o.id) ?? false} />}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
