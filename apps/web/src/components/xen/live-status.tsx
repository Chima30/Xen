"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { Bell, Loader2, Radar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createSignals, type CoreSignals } from "@/components/core/particle-sphere";
import { cn } from "@/lib/utils";
import { latestAlerts, runManualScan } from "@/lib/xen/actions";

const XenIntelligenceCore = dynamic(() => import("@/components/core/xen-intelligence-core").then((m) => m.XenIntelligenceCore), { ssr: false });

type Pulse = {
  scanStartedAt: string | null;
  scanFinishedAt: string | null;
  scanError: string | null;
  latestDiscoveryAt: string | null;
  latestVerificationAt: string | null;
  activeSources: number;
  failingSources: number;
};
type LiveState = { pulse: Pulse | null; scanning: boolean; events: { discovery: number; verification: number } };

const LiveContext = createContext<LiveState>({ pulse: null, scanning: false, events: { discovery: 0, verification: 0 } });

/**
 * Polls real system state every 20 s. "Scanning" means a scheduled or manual run has started
 * and not finished. Discovery and verification events fire only when the database shows newer
 * rows than the previous poll — nothing is simulated.
 */
export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LiveState>({ pulse: null, scanning: false, events: { discovery: 0, verification: 0 } });
  const last = useRef<{ d: string | null; v: string | null; first: boolean }>({ d: null, v: null, first: true });

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (!res.ok) return;
        const p = (await res.json()) as Pulse;
        if (stop) return;
        const l = last.current;
        const scanning = !!p.scanStartedAt && !p.scanFinishedAt && Date.now() - new Date(p.scanStartedAt).getTime() < 5 * 60_000;
        setState((s) => ({
          pulse: p,
          scanning,
          events: {
            discovery: !l.first && p.latestDiscoveryAt && p.latestDiscoveryAt !== l.d ? s.events.discovery + 1 : s.events.discovery,
            verification: !l.first && p.latestVerificationAt && p.latestVerificationAt !== l.v ? s.events.verification + 1 : s.events.verification,
          },
        }));
        last.current = { d: p.latestDiscoveryAt, v: p.latestVerificationAt, first: false };
      } catch {
        // Offline or transient: keep the last known state.
      }
    };
    poll();
    const id = setInterval(poll, 20_000);
    document.addEventListener("visibilitychange", poll);
    return () => { stop = true; clearInterval(id); document.removeEventListener("visibilitychange", poll); };
  }, []);

  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** Source monitoring status. Uses text and a shape, not color alone. */
export function SourceStatus() {
  const { pulse, scanning } = useContext(LiveContext);
  if (!pulse) return <span className="hidden h-7 w-40 rounded-md bg-muted/40 lg:block" aria-hidden />;
  const failing = pulse.failingSources > 0;
  return (
    <Link href="/sources" className="hidden items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground lg:flex">
      <span className={cn("relative flex size-2 rounded-full", scanning ? "bg-xen-cyan" : failing ? "bg-warn" : "bg-xen-bio")} aria-hidden>
        {scanning && <span className="absolute inset-0 animate-ping rounded-full bg-xen-cyan/60" />}
      </span>
      {scanning ? "Scanning now" : failing ? `${pulse.failingSources} source${pulse.failingSources > 1 ? "s" : ""} failing` : `${pulse.activeSources} sources healthy`}
      <span className="text-muted-foreground/70">· scan {ago(pulse.scanFinishedAt ?? pulse.scanStartedAt)}</span>
    </Link>
  );
}

/** Owner-only: run one real pipeline tick now. */
export function ScanNowButton() {
  const [pending, start] = useTransition();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Run a discovery scan now"
          disabled={pending}
          onClick={() => start(async () => { const r = await runManualScan(); if (r.ok) toast.success(r.message ?? "Scan finished"); else toast.error(r.error); })}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Radar />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{pending ? "Scanning…" : "Run a discovery scan now"}</TooltipContent>
    </Tooltip>
  );
}

type Alert = Awaited<ReturnType<typeof latestAlerts>>[number];

export function NotificationBell() {
  const [items, setItems] = useState<Alert[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <Popover onOpenChange={(o) => o && start(async () => setItems(await latestAlerts()))}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Notifications"><Bell /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">Telegram alerts</p>
        {pending || items === null ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No alerts yet. Alerts go out for opportunities scoring 65 or more that are not flagged as risky.</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {items.map((a) => (
              <li key={a.id} className="px-3 py-2.5 text-sm">
                {a.opportunity_id ? <Link href={`/opportunities/${a.opportunity_id}`} className="line-clamp-1 hover:underline">{a.title ?? "Opportunity"}</Link> : <span>{a.kind.replaceAll("_", " ")}</span>}
                <p className="text-xs text-muted-foreground">{a.status} · {ago(a.sent_at ?? a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Compact Intelligence Core for the Overview header. Few particles, paused off-screen.
 * It becomes more active while a real scan runs, pulses on a real new discovery, and
 * briefly lights after a real verification. Otherwise it rests.
 */
export function OverviewCore({ className }: { className?: string }) {
  const { scanning, events } = useContext(LiveContext);
  const signals = useRef<CoreSignals>(createSignals());
  useEffect(() => { signals.current.activity = scanning ? 1 : 0; }, [scanning]);
  useEffect(() => { if (events.discovery || events.verification) signals.current.pulseAt = performance.now(); }, [events.discovery, events.verification]);
  useEffect(() => { signals.current.rise = 1; }, []);
  return <XenIntelligenceCore signals={signals} quality="compact" radius={1.25} baseY={0} className={className} />;
}

export function useLive() {
  return useContext(LiveContext);
}
