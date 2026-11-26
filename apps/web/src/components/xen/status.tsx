import { cn } from "@/lib/utils";
import { CAPITAL, REWARD_STATUS, TONE_CLASS, VERIFICATION, type Tone } from "@/lib/xen/labels";

export function Pill({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] leading-4 font-medium whitespace-nowrap", TONE_CLASS[tone], className)}>
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

/** Score as a number with a thin bar; the bar color follows the priority bands (85 / 65). */
export function Score({ value, size = "sm" }: { value: number | null; size?: "sm" | "lg" }) {
  if (value === null) return <span className="font-mono text-muted-foreground">—</span>;
  const tone = value >= 85 ? "bg-ok" : value >= 65 ? "bg-primary" : "bg-muted-foreground/40";
  return (
    <span className={cn("inline-flex flex-col gap-1", size === "lg" ? "w-16" : "w-9")} aria-label={`Score ${value} of 100`}>
      <span className={cn("font-mono tabular-nums leading-none", size === "lg" ? "text-3xl font-semibold" : "text-sm font-medium")}>{value}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </span>
    </span>
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
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
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
