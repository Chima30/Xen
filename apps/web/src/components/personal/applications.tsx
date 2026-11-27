"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { APPLICATION_STATUSES, statusLabel } from "@xen/core/personal-constants";
import { Button } from "@/components/ui/button";
import { field, area } from "@/components/lab/lab-utils";
import { cn } from "@/lib/utils";
import { createApplication, updateApplication } from "@/lib/xen/personal-actions";
import type { ApplicationRow } from "@/lib/xen/personal-queries";
import { DEFAULT_TZ } from "@/lib/xen/format";
import { fromLocalDate, toLocalInput } from "./dates";

const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: DEFAULT_TZ }) : null);

export function NewApplication() {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}><Plus /> New application</Button>;
  return (
    <form
      className="w-full space-y-3 rounded-md border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await createApplication({
            title: String(f.get("title")), projectName: String(f.get("projectName")), link: String(f.get("link")),
            status: String(f.get("status")) as never, deadlineAt: fromLocalDate(String(f.get("deadlineAt"))), notes: String(f.get("notes")),
          });
          if (r.ok) { toast.success("Application added"); setOpen(false); } else toast.error(r.error);
        });
      }}
    >
      <div className="flex items-center justify-between"><h2 className="text-sm font-medium">New application</h2><Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setOpen(false)}><X /></Button></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 lg:col-span-2"><span className="text-sm font-medium">What it is</span><input name="title" required minLength={3} className={field} placeholder="e.g. Beta tester for the DemoDEX mobile app" /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Project</span><input name="projectName" className={field} /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Status</span>
          <select name="status" defaultValue="interested" className={field}>{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select>
        </label>
        <label className="space-y-1.5 lg:col-span-2"><span className="text-sm font-medium">Link</span><input name="link" type="url" className={field} placeholder="https://" /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Deadline</span><input name="deadlineAt" type="date" className={field} /></label>
      </div>
      <label className="block space-y-1.5"><span className="text-sm font-medium">Notes</span><textarea name="notes" rows={2} className={area} /></label>
      <Button type="submit" size="sm" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Add</Button>
    </form>
  );
}

export function ApplicationCard({ a, now, compact = false }: { a: ApplicationRow; now: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const save = (patch: Parameters<typeof updateApplication>[1], msg = "Updated") =>
    start(async () => { const r = await updateApplication(a.id, patch); if (r.ok) toast.success(msg); else toast.error(r.error); });
  const deadline = a.deadline_at ?? a.opportunity?.deadline_at ?? null;
  const overdueFollow = a.follow_up_at && Date.parse(a.follow_up_at) <= now;
  const href = a.opportunity_id ? `/opportunities/${a.opportunity_id}` : a.link;
  return (
    <li className={cn("rounded-md border bg-card", compact ? "p-3" : "p-4")}>
      <div className={cn("flex gap-3", compact ? "flex-col" : "flex-col sm:flex-row sm:items-start sm:justify-between")}>
        <div className="min-w-0 space-y-1">
          {href ? (
            <Link href={href} target={a.opportunity_id ? undefined : "_blank"} className={cn("font-medium hover:underline", compact ? "line-clamp-2 text-xs" : "text-sm")}>{a.title}</Link>
          ) : <p className={cn("font-medium", compact ? "line-clamp-2 text-xs" : "text-sm")}>{a.title}</p>}
          <p className="text-2xs text-muted-foreground">
            {[a.project_name, deadline && `due ${dateLabel(deadline)}`, a.follow_up_at && `follow up ${dateLabel(a.follow_up_at)}`].filter(Boolean).join(" · ")}
            {overdueFollow && <span className="ml-1 text-warn">follow-up due</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <select aria-label={`Status of ${a.title}`} className={cn(field, "h-7 w-auto text-xs")} defaultValue={a.status} disabled={pending}
            onChange={(e) => save({ status: e.target.value as never }, `Moved to ${statusLabel(e.target.value)}`)}>
            {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Edit"}</Button>
        </div>
      </div>
      {open && <Editor a={a} pending={pending} save={save} />}
    </li>
  );
}

function Editor({ a, pending, save }: { a: ApplicationRow; pending: boolean; save: (p: Parameters<typeof updateApplication>[1], msg?: string) => void }) {
  const [notes, setNotes] = useState(a.notes ?? "");
  const [submission, setSubmission] = useState(a.submission_url ?? "");
  const [evidence, setEvidence] = useState(a.evidence_urls.join("\n"));
  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-xs font-medium">Deadline</span>
          <input type="date" className={field} defaultValue={a.deadline_at ? toLocalInput(a.deadline_at).slice(0, 10) : ""} onChange={(e) => save({ deadlineAt: fromLocalDate(e.target.value) })} />
        </label>
        <label className="space-y-1"><span className="text-xs font-medium">Follow up on</span>
          <input type="date" className={field} defaultValue={a.follow_up_at ? toLocalInput(a.follow_up_at).slice(0, 10) : ""} onChange={(e) => save({ followUpAt: fromLocalDate(e.target.value, "09:00") })} />
        </label>
      </div>
      <label className="block space-y-1"><span className="text-xs font-medium">Submission link</span>
        <input type="url" className={field} placeholder="Where you submitted the work" value={submission} onChange={(e) => setSubmission(e.target.value)} onBlur={() => submission !== (a.submission_url ?? "") && save({ submissionUrl: submission })} />
      </label>
      <label className="block space-y-1"><span className="text-xs font-medium">Evidence links (one per line)</span>
        <textarea rows={2} className={area} placeholder="Screenshots, accepted reports, confirmation emails you stored online" value={evidence} onChange={(e) => setEvidence(e.target.value)}
          onBlur={() => { const list = evidence.split(/\s+/).map((s) => s.trim()).filter(Boolean); if (list.join("\n") !== a.evidence_urls.join("\n")) save({ evidenceUrls: list }); }} />
      </label>
      <label className="block space-y-1"><span className="text-xs font-medium">Notes</span>
        <textarea rows={3} className={area} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (a.notes ?? "") && save({ notes })} />
      </label>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {pending && <Loader2 className="size-3 animate-spin" />}
        {a.opportunity?.source_url && <a href={a.opportunity.source_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-foreground">Source <ExternalLink className="size-3" /></a>}
        {a.submission_url && <a href={a.submission_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-foreground">Submission <ExternalLink className="size-3" /></a>}
        <Link href={`/tasks?application=${a.id}`} className="hover:text-foreground">Add a task</Link>
        <Link href={`/earnings?application=${a.id}`} className="hover:text-foreground">Record a payment</Link>
      </div>
    </div>
  );
}
