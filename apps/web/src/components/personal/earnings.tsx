"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EARNING_STATUSES, EARNING_STATUS_LABEL } from "@xen/core/personal-constants";
import { Button } from "@/components/ui/button";
import { area, field } from "@/components/lab/lab-utils";
import { deleteEarning, reportPaymentEvidence, saveEarning } from "@/lib/xen/personal-actions";
import { fromLocalDate, toLocalInput } from "./dates";

type App = { id: string; title: string; projectName: string | null; projectId: string | null; category: string | null; currency: string | null };
type Project = { id: string; name: string };
export type EarningRecord = {
  id: string; title: string | null; amount: number | string; currency: string; amount_usd: number | string | null; status: string; tx_hash: string | null; evidence_url: string | null;
  minutes_spent: number | null; paid_at: string | null; expected_at: string | null; notes: string | null; category: string | null; project_id: string | null; project_name: string | null; application_id: string | null;
};

export function EarningForm({ applications, projects, preselect = "", record, onDone }: { applications: App[]; projects: Project[]; preselect?: string; record?: EarningRecord; onDone?: () => void }) {
  const [busy, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState(record?.status ?? "pending");
  const [appId, setAppId] = useState(record?.application_id ?? preselect);
  const linked = applications.find((a) => a.id === appId);
  const day = (iso: string | null) => (iso ? toLocalInput(iso).slice(0, 10) : "");
  return (
    <form
      ref={form}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (k: string) => String(f.get(k) ?? "");
        start(async () => {
          const r = await saveEarning(record?.id ?? null, {
            title: g("title"), amount: g("amount") as never, currency: g("currency"), amountUsd: g("amountUsd") as never, status: g("status") as never,
            applicationId: g("applicationId"), projectId: g("projectId"), category: linked?.category ?? record?.category ?? "",
            expectedAt: fromLocalDate(g("expectedAt"), "12:00"), paidAt: fromLocalDate(g("paidAt"), "12:00"),
            txHash: g("txHash"), evidenceUrl: g("evidenceUrl"), minutes: g("minutes") as never, notes: g("notes"),
          });
          if (r.ok) { toast.success(record ? "Payment updated" : "Payment recorded"); if (!record) { form.current?.reset(); setAppId(""); setStatus("pending"); } onDone?.(); }
          else toast.error(r.error);
        });
      }}
    >
      <label className="block space-y-1.5"><span className="text-sm font-medium">For application</span>
        <select name="applicationId" className={field} value={appId} onChange={(e) => setAppId(e.target.value)}>
          <option value="">None</option>
          {applications.map((a) => <option key={a.id} value={a.id}>{a.title.slice(0, 80)}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">What it is for</span>
        <input key={`t-${appId}`} name="title" required minLength={2} className={field} defaultValue={record?.title ?? linked?.title ?? ""} placeholder="e.g. Accepted bug report #12" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5"><span className="text-sm font-medium">Amount</span><input name="amount" type="number" step="any" min="0" required className={field} defaultValue={record ? String(record.amount) : ""} /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Currency</span><input key={`c-${appId}`} name="currency" required maxLength={16} className={`${field} uppercase`} defaultValue={record?.currency ?? linked?.currency ?? "USDC"} /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Value in USD</span><input name="amountUsd" type="number" step="any" min="0" className={field} defaultValue={record?.amount_usd != null ? String(record.amount_usd) : ""} placeholder="For totals" /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Status</span>
          <select name="status" className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
            {EARNING_STATUSES.map((s) => <option key={s} value={s}>{EARNING_STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Expected by</span><input name="expectedAt" type="date" className={field} defaultValue={day(record?.expected_at ?? null)} /></label>
        {status === "received" && <label className="space-y-1.5"><span className="text-sm font-medium">Paid on</span><input name="paidAt" type="date" className={field} defaultValue={day(record?.paid_at ?? null)} /></label>}
        <label className="space-y-1.5"><span className="text-sm font-medium">Time spent (min)</span><input name="minutes" type="number" min={0} className={field} defaultValue={record?.minutes_spent ?? ""} /></label>
      </div>
      {!linked && (
        <label className="block space-y-1.5"><span className="text-sm font-medium">Project</span>
          <select name="projectId" className={field} defaultValue={record?.project_id ?? ""}>
            <option value="">Not listed</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {status === "received" && (
        <div className="space-y-3 rounded-md border border-dashed p-3">
          <p className="text-xs text-muted-foreground">Proof is optional, but a transaction hash or evidence link adds this payment to the project’s verified payment record.</p>
          <label className="block space-y-1.5"><span className="text-sm font-medium">Transaction hash</span><input name="txHash" className={`${field} font-mono`} defaultValue={record?.tx_hash ?? ""} placeholder="0x…" /></label>
          <label className="block space-y-1.5"><span className="text-sm font-medium">Evidence link</span><input name="evidenceUrl" type="url" className={field} defaultValue={record?.evidence_url ?? ""} placeholder="https://" /></label>
        </div>
      )}
      <label className="block space-y-1.5"><span className="text-sm font-medium">Notes</span><textarea name="notes" rows={2} className={area} defaultValue={record?.notes ?? ""} /></label>
      <Button type="submit" size="sm" disabled={busy}>{busy && <Loader2 className="animate-spin" />} {record ? "Save changes" : "Record payment"}</Button>
    </form>
  );
}

export function EarningRowActions({ record, applications, projects }: { record: EarningRecord; applications: App[]; projects: Project[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="inline-flex flex-col items-end gap-2">
      <div className="flex gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Edit payment" aria-expanded={editing} onClick={() => setEditing((v) => !v)}><Pencil /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Delete payment" disabled={pending} onClick={() => {
          if (!confirm("Delete this payment record? This cannot be undone.")) return;
          start(async () => { const r = await deleteEarning(record.id); if (r.ok) toast.success("Deleted"); else toast.error(r.error); });
        }}><Trash2 /></Button>
      </div>
      {editing && <div className="w-80 rounded-md border bg-background p-3 text-left"><EarningForm applications={applications} projects={projects} record={record} onDone={() => setEditing(false)} /></div>}
    </div>
  );
}

export function ReportEvidence({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [kind, setKind] = useState("community_allegation");
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Add payment evidence about a project</Button>;
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (k: string) => String(f.get(k) ?? "");
        start(async () => {
          const r = await reportPaymentEvidence({ projectId: g("projectId"), outcome: g("outcome") as never, kind: g("kind") as never, sourceUrl: g("sourceUrl"), details: g("details"), occurredAt: fromLocalDate(g("occurredAt"), "12:00") });
          if (r.ok) { toast.success("Evidence added"); setOpen(false); } else toast.error(r.error);
        });
      }}
    >
      <label className="space-y-1.5"><span className="text-sm font-medium">Project</span>
        <select name="projectId" required className={field} defaultValue=""><option value="" disabled>Choose a project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </label>
      <label className="space-y-1.5"><span className="text-sm font-medium">Type of evidence</span>
        <select name="kind" className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="community_allegation">Community report (unverified)</option>
          <option value="public_evidence">Public evidence with a link (owner only)</option>
          <option value="official_announcement">Official announcement (owner only)</option>
        </select>
      </label>
      <label className="space-y-1.5"><span className="text-sm font-medium">What happened</span>
        <select name="outcome" className={field} defaultValue="unpaid">
          <option value="paid_on_time">Paid on time</option><option value="paid_late">Paid late</option><option value="paid">Paid</option><option value="partial">Partly paid</option><option value="unpaid">Not paid</option>
        </select>
      </label>
      <label className="space-y-1.5"><span className="text-sm font-medium">When</span><input name="occurredAt" type="date" className={field} /></label>
      <label className="space-y-1.5 md:col-span-2"><span className="text-sm font-medium">Source link{kind === "community_allegation" ? " (optional)" : ""}</span><input name="sourceUrl" type="url" required={kind !== "community_allegation"} className={field} placeholder="https://" /></label>
      <label className="space-y-1.5 md:col-span-2"><span className="text-sm font-medium">Details</span><textarea name="details" required minLength={10} rows={2} className={area} placeholder="What was promised and what happened" /></label>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Add evidence</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
