"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTestResult, updateBugReport, updateFeedbackStatus } from "@/lib/xen/lab-actions";
import { cn } from "@/lib/utils";
import { field } from "./lab-ui";

export function BugStatus({ id, status, submittedUrl }: { id: string; status: string; submittedUrl: string | null }) {
  const [url, setUrl] = useState(submittedUrl ?? "");
  const [pending, start] = useTransition();
  const save = (patch: { status?: string; submittedUrl?: string }) =>
    start(async () => { const r = await updateBugReport(id, patch); if (r.ok) toast.success("Updated"); else toast.error(r.error); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Report status" className={cn(field, "w-auto")} defaultValue={status} disabled={pending} onChange={(e) => save({ status: e.target.value })}>
        <option value="draft">Draft</option>
        <option value="submitted">Submitted</option>
        <option value="accepted">Accepted</option>
        <option value="rejected">Rejected</option>
        <option value="duplicate">Duplicate</option>
      </select>
      <input aria-label="Where you submitted it" className={cn(field, "w-56")} placeholder="Submission link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => url !== (submittedUrl ?? "") && save({ submittedUrl: url })} />
    </div>
  );
}

const RESULTS = [
  { v: "pass", label: "Pass", cls: "data-[on=true]:border-xen-cyan/50 data-[on=true]:bg-xen-cyan/10 data-[on=true]:text-foreground" },
  { v: "fail", label: "Fail", cls: "data-[on=true]:border-destructive/50 data-[on=true]:bg-destructive/10 data-[on=true]:text-destructive" },
  { v: "blocked", label: "Blocked", cls: "data-[on=true]:border-warn/50 data-[on=true]:bg-warn/10 data-[on=true]:text-warn" },
];

/** Records the result a person observed. XEN never runs these tests itself. */
export function CaseResult({ id, result, notes }: { id: string; result: string | null; notes: string | null }) {
  const [r, setR] = useState(result ?? "not_run");
  const [n, setN] = useState(notes ?? "");
  const [pending, start] = useTransition();
  const save = (next: string, note?: string) =>
    start(async () => { const res = await setTestResult(id, next, note); if (!res.ok) toast.error(res.error); });
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Result" className="flex gap-1">
        {RESULTS.map((x) => (
          <button
            key={x.v} type="button" role="radio" aria-checked={r === x.v} data-on={r === x.v} disabled={pending}
            onClick={() => { const next = r === x.v ? "not_run" : x.v; setR(next); save(next); }}
            className={cn("rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground", x.cls)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <input aria-label="Notes" className={field} placeholder="What you observed (optional)" value={n} onChange={(e) => setN(e.target.value)} onBlur={() => n !== (notes ?? "") && save(r, n)} />
    </div>
  );
}

export function FeedbackStatus({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Feedback status" className={cn(field, "w-auto")} defaultValue={status} disabled={pending}
      onChange={(e) => { const v = e.target.value; start(async () => { const r = await updateFeedbackStatus(id, v); if (!r.ok) toast.error(r.error); }); }}
    >
      <option value="draft">Draft</option>
      <option value="submitted">Sent to the team</option>
      <option value="acknowledged">Acknowledged</option>
    </select>
  );
}
