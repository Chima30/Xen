"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setDailyMinutes } from "@/lib/xen/personal-actions";

const PRESETS = [30, 60, 120, 240];

/** How much time you have today. Changes the plan right away; "Save as default" stores it. */
export function MinutesControl({ minutes, saved }: { minutes: number; saved: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(minutes));
  const [pending, start] = useTransition();
  const apply = (m: number) => { setValue(String(m)); router.push(`/today?minutes=${m}`, { scroll: false }); };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Time today</span>
      <div role="group" aria-label="Time presets" className="flex gap-1">
        {PRESETS.map((m) => (
          <Button key={m} size="sm" variant={minutes === m ? "secondary" : "outline"} aria-pressed={minutes === m} onClick={() => apply(m)}>
            {m < 60 ? `${m}m` : `${m / 60}h`}
          </Button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); const m = Number(value); if (Number.isInteger(m) && m >= 0 && m <= 1440) apply(m); }} className="flex items-center gap-1">
        <input aria-label="Minutes available today" type="number" min={0} max={1440} value={value} onChange={(e) => setValue(e.target.value)}
          className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
        <span className="text-xs text-muted-foreground">min</span>
      </form>
      {minutes !== saved && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
          const r = await setDailyMinutes(minutes);
          if (r.ok) { toast.success("Saved as your daily time"); router.push("/today"); } else toast.error(r.error);
        })}>Save as default</Button>
      )}
    </div>
  );
}
