"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FEEDBACK_CATEGORIES } from "@xen/core/lab-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { draftFeedbackAction, saveFeedback } from "@/lib/xen/lab-actions";
import { area, CopyButton, field } from "./lab-ui";

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()).replace(/^Ui$/, "UI").replace(/^Ux$/, "UX");

type Draft = { headline: string; body: string; suggestions: string[] };

export function FeedbackForm() {
  const [category, setCategory] = useState<string>("ux");
  const [project, setProject] = useState("");
  const [obs, setObs] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const compose = (d: Draft) => [d.headline, "", d.body, ...(d.suggestions.length ? ["", "Suggestions:", ...d.suggestions.map((s) => `- ${s}`)] : [])].join("\n");

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await draftFeedbackAction({ category, project, observations: obs });
            if (!r.ok) return void toast.error(r.error);
            setDraft(r.data);
            setText(compose(r.data));
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="text-sm font-medium">Project</span><Input value={project} onChange={(e) => setProject(e.target.value)} /></label>
          <label className="space-y-1.5"><span className="text-sm font-medium">Area</span>
            <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
              {FEEDBACK_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
            </select>
          </label>
        </div>
        <label className="block space-y-1.5"><span className="text-sm font-medium">What you observed <span className="font-normal text-muted-foreground">(required)</span></span>
          <textarea className={area} rows={7} value={obs} onChange={(e) => setObs(e.target.value)} required minLength={15} placeholder="Your own notes, as rough as you like: what you did, what confused you, what felt slow" />
        </label>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft feedback</Button>
      </form>
      <section aria-label="Draft" className="space-y-3">
        {!draft ? (
          <div className="rounded-md border border-dashed p-8 text-sm text-muted-foreground">Your feedback, rewritten clearly in your own voice, appears here. Nothing is added that you did not observe.</div>
        ) : (
          <>
            <textarea className={area} rows={16} value={text} onChange={(e) => setText(e.target.value)} aria-label="Feedback draft" />
            <div className="flex gap-2">
              <CopyButton text={text} />
              <Button size="sm" disabled={busy} onClick={() => start(async () => {
                const [headline, , ...rest] = text.split("\n");
                const r = await saveFeedback({ category, project, observations: obs, draft: { headline: headline ?? draft.headline, body: rest.join("\n"), suggestions: [] } });
                if (r.ok) toast.success("Saved"); else toast.error(r.error);
              })}>Save</Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
