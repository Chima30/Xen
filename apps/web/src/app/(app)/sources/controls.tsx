"use client";

import { useTransition } from "react";
import { Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { scanSourceSoon, setQueryEnabled, setSourceStatus, type ActionResult } from "@/lib/xen/actions";

const report = (r: ActionResult) => {
  if (r.ok) toast.success(r.message ?? "Done");
  else toast.error(r.error);
};

export function SourceControls({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const active = status === "active";
  return (
    <div className="flex items-center gap-1">
      {active && (
        <Button variant="ghost" size="xs" disabled={pending} onClick={() => start(async () => report(await scanSourceSoon(id)))}>
          <RefreshCw /> Scan soon
        </Button>
      )}
      {(active || status === "paused" || status === "error") && (
        <Button variant="outline" size="xs" disabled={pending} onClick={() => start(async () => report(await setSourceStatus(id, active ? "paused" : "active")))}>
          {pending ? <Loader2 className="animate-spin" /> : active ? <Pause /> : <Play />}
          {active ? "Pause" : "Resume"}
        </Button>
      )}
    </div>
  );
}

export function QueryToggle({ query, enabled, disabled }: { query: string; enabled: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={enabled}
      disabled={disabled || pending}
      aria-label={`${enabled ? "Disable" : "Enable"} query ${query}`}
      onCheckedChange={(v) => start(async () => report(await setQueryEnabled(query, v)))}
    />
  );
}
