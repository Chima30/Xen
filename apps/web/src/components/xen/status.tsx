import { cn } from "@/lib/utils";
import { CAPITAL, REWARD_STATUS, TONE_CLASS, VERIFICATION, type Tone } from "@/lib/xen/labels";

export function Pill({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-2xs leading-4 font-medium whitespace-nowrap", TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}

export function RewardPill({ status }: { status: string }) {
  const s = REWARD_STATUS[status] ?? { label: status, tone: "neutral" as Tone, hint: "" };
  return <Pill tone={s.tone} title={s.hint}>{s.label}</Pill>;
}

export function VerificationPill({ status }: { status: string }) {
  const s = VERIFICATION[status] ?? { label: status, tone: "neutral" as Tone };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function CapitalPill({ capital }: { capital: string }) {
  const s = CAPITAL[capital] ?? { label: capital, tone: "neutral" as Tone };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

/**
 * Score as an exact reading. In lists it is the number alone: the accent marks only
 * high-priority items (85+), alert-worthy ones (65+) are full ink, the rest are muted.
 * The large version on the detail page adds a scale with the two thresholds marked.
 */
export function Score({ value, size = "sm" }: { value: number | null; size?: "sm" | "lg" }) {
  if (value === null) return <span className="font-mono text-sm text-muted-foreground">—</span>;
  const ink = value >= 85 ? "text-primary" : value >= 65 ? "text-foreground" : "text-muted-foreground";
  if (size === "sm") {
    return <span className={cn("font-mono text-sm font-medium tabular-nums", ink)} aria-label={`Score ${value} of 100`}>{value}</span>;
  }
  return (
    <span className="inline-flex w-20 flex-col gap-2" aria-label={`Score ${value} of 100`}>
      <span className="flex items-baseline gap-1">
        <span className={cn("font-mono text-3xl leading-none font-medium tabular-nums", ink)}>{value}</span>
        <span className="font-mono text-2xs text-muted-foreground">/100</span>
      </span>
      <span className="relative h-1 w-full rounded-full bg-muted" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", value >= 85 ? "bg-primary" : "bg-foreground/60")} style={{ width: `${value}%` }} />
        <span className="absolute -top-0.5 h-2 w-px bg-muted-foreground/60" style={{ left: "65%" }} title="Alert threshold 65" />
        <span className="absolute -top-0.5 h-2 w-px bg-muted-foreground/60" style={{ left: "85%" }} title="High priority 85" />
      </span>
    </span>
  );
}

const MARK: Record<string, { label: string; cls: string }> = {
  verified_announcement: { label: "Verified announcement", cls: "text-ok" },
  partially_verified: { label: "Partially verified", cls: "text-foreground/70" },
  unverified: { label: "Unverified", cls: "text-muted-foreground" },
  conflicting: { label: "Conflicting evidence", cls: "text-warn" },
  suspicious: { label: "Suspicious", cls: "text-destructive" },
  expired: { label: "Expired", cls: "text-muted-foreground" },
};

/**
 * XEN's signature: one small verification mark before an opportunity's title.
 * Filled with a tick = verified, half filled = partial, open = unverified,
 * struck = conflicting, solid with a bar = suspicious, dashed = expired.
 */
export function VerifyMark({ status, className }: { status: string; className?: string }) {
  const m = MARK[status] ?? MARK.unverified!;
  return (
    <svg viewBox="0 0 12 12" className={cn("size-3 shrink-0", m.cls, className)} role="img" aria-label={m.label}>
      <title>{m.label}</title>
      {status === "verified_announcement" && (<><circle cx="6" cy="6" r="5.5" fill="currentColor" /><path d="M3.6 6.2 5.2 7.7 8.4 4.4" fill="none" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></>)}
      {status === "partially_verified" && (<><circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M6 1.25a4.75 4.75 0 0 0 0 9.5z" fill="currentColor" /></>)}
      {status === "conflicting" && (<><circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M2.8 9.2 9.2 2.8" stroke="currentColor" strokeWidth="1.5" /></>)}
      {status === "suspicious" && (<><circle cx="6" cy="6" r="5.5" fill="currentColor" /><path d="M6 3.2v3.4M6 8.6v.1" stroke="var(--background)" strokeWidth="1.5" strokeLinecap="round" /></>)}
      {status === "expired" && <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.7" />}
      {(status === "unverified" || !MARK[status]) && <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, children, actions, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-md border bg-card", className)}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
