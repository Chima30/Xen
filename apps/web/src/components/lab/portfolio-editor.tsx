"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { savePortfolio } from "@/lib/xen/lab-actions";
import type { PortfolioEntry } from "@/lib/xen/lab-queries";
import { area, field } from "./lab-ui";

/** Headline, summary and entries you add yourself. Entries from XEN work are shown separately. */
export function PortfolioEditor({ headline: h0, summary: s0, manual }: { headline: string; summary: string; manual: PortfolioEntry[] }) {
  const [headline, setHeadline] = useState(h0);
  const [summary, setSummary] = useState(s0);
  const [entries, setEntries] = useState<PortfolioEntry[]>(manual);
  const [busy, start] = useTransition();
  const upd = (i: number, k: keyof PortfolioEntry, v: string) => setEntries((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const clean = entries.filter((x) => x.project.trim() && x.title.trim()).map((x) => ({ ...x, link: x.link || "", outcome: x.outcome || undefined, date: x.date || undefined }));
          const r = await savePortfolio({ headline, summary, manualEntries: clean });
          if (r.ok) toast.success("Portfolio saved"); else toast.error(r.error);
        });
      }}
    >
      <label className="block space-y-1.5"><span className="text-sm font-medium">Headline</span><Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={160} placeholder="e.g. Web3 product tester focused on DEXs and prediction markets" /></label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">Summary</span><textarea className={area} rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} placeholder="What you test and how you work. Only what is true." /></label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Other testing work</legend>
        <p className="text-xs text-muted-foreground">Work done outside XEN. Add only what you actually did; links help teams verify it.</p>
        {entries.map((e, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_8rem_1.3fr_2rem]">
            <input aria-label="Project" className={field} placeholder="Project" value={e.project} onChange={(x) => upd(i, "project", x.target.value)} />
            <input aria-label="What you did" className={field} placeholder="What you did" value={e.title} onChange={(x) => upd(i, "title", x.target.value)} />
            <select aria-label="Type" className={field} value={e.kind} onChange={(x) => upd(i, "kind", x.target.value)}>
              <option value="testing">Testing</option><option value="bug_report">Bug report</option><option value="product_feedback">Feedback</option><option value="user_research">User research</option>
            </select>
            <input aria-label="Link" className={field} placeholder="Public link (optional)" value={e.link ?? ""} onChange={(x) => upd(i, "link", x.target.value)} />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove entry" onClick={() => setEntries((xs) => xs.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setEntries((xs) => [...xs, { project: "", title: "", kind: "testing", link: "" }])}><Plus /> Add entry</Button>
      </fieldset>
      <Button type="submit" disabled={busy}>Save portfolio</Button>
    </form>
  );
}
