"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { OFFER_TYPES, OUTREACH_CHANNELS } from "@xen/core/lab-constants";
import { Button } from "@/components/ui/button";
import { draftOutreachAction, saveOutreach, updateOutreach } from "@/lib/xen/lab-actions";
import { cn } from "@/lib/utils";
import { area, CopyButton, field } from "./lab-ui";

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()).replace(/^Ux /, "UX ").replace(/^Qa$/, "QA").replace(/^X$/, "X (DM)");

type Project = { id: string; name: string; stage: string | null };

export function OutreachComposer({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [channel, setChannel] = useState<string>("email");
  const [offer, setOffer] = useState<string>("product_testing");
  const [kind, setKind] = useState("first_contact");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<{ subject: string; message: string; projectName: string } | null>(null);
  const [busy, start] = useTransition();

  if (!projects.length) return <p className="text-sm text-muted-foreground">No projects yet. Projects appear as XEN discovers them, or when you watch one.</p>;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await draftOutreachAction({ projectId, channel, offer, kind, notes });
            if (!r.ok) return void toast.error(r.error);
            setDraft(r.data);
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="text-sm font-medium">Project</span>
            <select className={field} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.stage && p.stage !== "unknown" ? ` (${p.stage.replace(/_/g, " ")})` : ""}</option>)}
            </select>
          </label>
          <label className="space-y-1.5"><span className="text-sm font-medium">Channel</span>
            <select className={field} value={channel} onChange={(e) => setChannel(e.target.value)}>
              {OUTREACH_CHANNELS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5"><span className="text-sm font-medium">What you offer</span>
            <select className={field} value={offer} onChange={(e) => setOffer(e.target.value)}>
              {OFFER_TYPES.map((o) => <option key={o} value={o}>{label(o)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5"><span className="text-sm font-medium">Message type</span>
            <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="first_contact">First contact</option>
              <option value="application_response">Reply to an application or call for testers</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Your notes (optional)</span>
          <textarea className={area} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything specific: a feature you tried, why this project, your availability" />
        </label>
        <p className="text-xs text-muted-foreground">Drafts only mention experience from your accepted reports and your portfolio. XEN never sends anything.</p>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft message</Button>
      </form>
      <section aria-label="Draft" className="space-y-3">
        {!draft ? (
          <div className="rounded-md border border-dashed p-8 text-sm text-muted-foreground">Your draft appears here for you to edit.</div>
        ) : (
          <>
            {channel === "email" && <input aria-label="Subject" className={field} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />}
            <textarea aria-label="Message" className={area} rows={12} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
            <div className="flex gap-2">
              <CopyButton text={channel === "email" && draft.subject ? `Subject: ${draft.subject}\n\n${draft.message}` : draft.message} />
              <Button size="sm" disabled={busy} onClick={() => start(async () => {
                const r = await saveOutreach({ projectId, projectName: draft.projectName, channel, offer, kind, subject: draft.subject, draft: draft.message });
                if (r.ok) { toast.success("Saved to your outreach tracker"); setDraft(null); } else toast.error(r.error);
              })}>Save to tracker</Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

type Msg = { id: string; project_name: string | null; channel: string | null; kind: string; offer_type: string; subject: string | null; draft: string; status: string; sent_at: string | null; follow_up_at: string | null; response: string | null; agreed_payment: string | null; created_at: string };

const STATUS: Record<string, string> = { draft: "Draft", approved: "Ready to send", sent_by_user: "Sent by me", replied: "Replied", accepted: "Accepted", declined: "Declined", no_response: "No response" };

export function OutreachRow({ m }: { m: Msg }) {
  const [open, setOpen] = useState(false);
  const [resp, setResp] = useState(m.response ?? "");
  const [pay, setPay] = useState(m.agreed_payment ?? "");
  const [pending, start] = useTransition();
  const save = (patch: Parameters<typeof updateOutreach>[1]) => start(async () => { const r = await updateOutreach(m.id, patch); if (r.ok) toast.success("Updated"); else toast.error(r.error); });
  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-w-0 text-left">
          <p className="truncate text-sm font-medium">{m.project_name ?? "Project"} · {label(m.offer_type)}</p>
          <p className="text-xs text-muted-foreground">{label(m.channel ?? "other")} · {m.kind.replace(/_/g, " ")}{m.sent_at ? ` · sent ${new Date(m.sent_at).toLocaleDateString("en-GB")}` : ""}{m.follow_up_at ? ` · follow up ${new Date(m.follow_up_at).toLocaleDateString("en-GB")}` : ""}</p>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Status" className={cn(field, "w-auto")} defaultValue={m.status} disabled={pending} onChange={(e) => save({ status: e.target.value })}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input aria-label="Follow-up date" type="date" className={cn(field, "w-auto")} defaultValue={m.follow_up_at?.slice(0, 10) ?? ""} onChange={(e) => save({ followUpAt: e.target.value || null })} />
          <CopyButton text={m.subject ? `Subject: ${m.subject}\n\n${m.draft}` : m.draft} />
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <pre className="rounded-md bg-background p-3 text-xs leading-relaxed whitespace-pre-wrap">{m.subject ? `Subject: ${m.subject}\n\n` : ""}{m.draft}</pre>
          <div className="space-y-2">
            <textarea aria-label="Their reply" className={area} rows={4} placeholder="Their reply, pasted here for your records" value={resp} onChange={(e) => setResp(e.target.value)} onBlur={() => resp !== (m.response ?? "") && save({ response: resp })} />
            <input aria-label="Agreed payment" className={field} placeholder="Agreed payment, if any (e.g. 150 USDC)" value={pay} onChange={(e) => setPay(e.target.value)} onBlur={() => pay !== (m.agreed_payment ?? "") && save({ agreedPayment: pay })} />
          </div>
        </div>
      )}
    </li>
  );
}
