"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_TYPES, TEST_AREAS } from "@xen/core/lab-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTestPlan } from "@/lib/xen/lab-actions";
import { area, field } from "./lab-ui";

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function TestPlanForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("dex");
  const [areas, setAreas] = useState<string[]>(["wallet_connection", "transaction_submission", "error_messages"]);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, start] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createTestPlan({ title, platformType: type, areas, productNotes: notes, platformUrl: url });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Test plan created");
          router.push(`/lab/test-plans/${r.data.id}`);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5"><span className="text-sm font-medium">Title</span><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. DemoDEX beta, week 1" /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Platform type</span>
          <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
            {PLATFORM_TYPES.map((p) => <option key={p} value={p}>{label(p)}</option>)}
          </select>
        </label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Platform URL</span><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Areas to cover</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {TEST_AREAS.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--xen-cyan)]" checked={areas.includes(a)} onChange={(e) => setAreas((xs) => (e.target.checked ? [...xs, a] : xs.filter((x) => x !== a)))} />
              {label(a)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5"><span className="text-sm font-medium">What you know about the product (optional)</span>
        <textarea className={area} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Features, supported wallets, what the project asked testers to focus on" />
      </label>
      <Button type="submit" disabled={busy || !areas.length}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate test plan</Button>
    </form>
  );
}
