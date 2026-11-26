import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAPITAL, categoryLabel, REWARD_STATUS } from "@/lib/xen/labels";
import { deadlineTone, formatDate, formatReward, relative } from "@/lib/xen/format";
import type { OppRow } from "@/lib/xen/queries";
import { SaveButton } from "./opportunity-actions";
import { Pill, Score, VerifyMark } from "./status";

const COLS = "@3xl:grid-cols-[2.5rem_minmax(0,1fr)_10rem_7rem_6.5rem_2rem]";

/**
 * Dense, scannable opportunity list. Columns appear when the list itself is wide enough
 * (container query), so it works in a full page and in a narrow dashboard column alike.
 * Color is reserved for what needs attention: confirmed pay, capital required, risk flags.
 */
export function OpportunityTable({ rows, saved, now, showSave = true }: { rows: OppRow[]; saved?: Set<string>; now: number; showSave?: boolean }) {
  return (
    <div className="@container overflow-hidden rounded-md border bg-card">
      <div className={cn("hidden gap-3 border-b px-3 py-2 text-2xs text-muted-foreground @3xl:grid", COLS)}>
        <span>Score</span>
        <span>Opportunity</span>
        <span>Reward</span>
        <span>Deadline</span>
        <span>Found</span>
        <span className="sr-only">Save</span>
      </div>
      <ul className="divide-y">
        {rows.map((o) => {
          const reward = formatReward(o.reward_amount, o.reward_amount_max, o.reward_currency);
          const dTone = deadlineTone(o.deadline_at, now);
          const expired = o.deadline_at && new Date(o.deadline_at).getTime() < now;
          const certainty = REWARD_STATUS[o.reward_status]?.label ?? o.reward_status;
          const deadline = o.deadline_at ? (
            <span className={cn(dTone === "danger" && "text-destructive", dTone === "warn" && "text-warn", expired && "text-muted-foreground line-through")} title={formatDate(o.deadline_at)}>
              {relative(o.deadline_at, now)}
            </span>
          ) : (
            <span className="text-muted-foreground">None stated</span>
          );
          return (
            <li key={o.id} className={cn("relative grid grid-cols-[2.5rem_minmax(0,1fr)_2rem] items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/40 @3xl:items-center", COLS)}>
              <Score value={o.score} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <VerifyMark status={o.verification} />
                  <Link href={`/opportunities/${o.id}`} className="min-w-0 truncate text-sm font-medium after:absolute after:inset-0 hover:underline">
                    {o.title}
                  </Link>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-xs text-muted-foreground">
                  {o.project_name && <span className="text-foreground/80">{o.project_name}</span>}
                  <span>{categoryLabel(o.category)}</span>
                  {o.capital === "required" ? <Pill tone="warn">{CAPITAL.required!.label}</Pill> : <span>{CAPITAL[o.capital]?.label ?? o.capital}</span>}
                  {o.risk_flags.length > 0 && (
                    <Pill tone="warn" title={o.risk_flags.join(", ")}><AlertTriangle className="size-3" />{o.risk_flags.length} risk flag{o.risk_flags.length > 1 ? "s" : ""}</Pill>
                  )}
                  {!o.is_active && <span>Inactive</span>}
                  {/* Narrow summary of the columns that appear when there is room */}
                  <span className="flex flex-wrap items-center gap-x-2 @3xl:hidden">
                    {reward && <span className="font-mono text-foreground">{reward}</span>}
                    <span className={cn(o.reward_status === "confirmed" && "text-ok")}>{certainty}</span>
                    {o.deadline_at && <span>· Due {deadline}</span>}
                  </span>
                </div>
              </div>
              <div className="hidden min-w-0 @3xl:block">
                <p className="truncate font-mono text-sm tabular-nums" title={reward ?? undefined}>{reward ?? <span className="font-sans text-muted-foreground">Not stated</span>}</p>
                <p className={cn("text-xs", o.reward_status === "confirmed" ? "text-ok" : "text-muted-foreground")}>{certainty}</p>
              </div>
              <div className="hidden text-sm @3xl:block">{deadline}</div>
              <div className="hidden text-sm text-muted-foreground @3xl:block" title={formatDate(o.discovered_at)}>{relative(o.discovered_at, now)}</div>
              <div className="relative z-10 justify-self-end">{showSave && <SaveButton id={o.id} saved={saved?.has(o.id) ?? false} />}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
