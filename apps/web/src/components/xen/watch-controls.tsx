"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addWatchAction, removeWatch, searchAlternativesAction, updateWatchTypes, watchProject } from "@/lib/xen/intel-actions";

type Option = { value: string; label: string };

export function AddWatchForm({ updateTypes }: { updateTypes: Option[] }) {
  const [state, action, pending] = useActionState(addWatchAction, null);
  useEffect(() => {
    if (state?.ok) toast.success(state.message);
    else if (state && !state.ok) toast.error(state.error);
  }, [state]);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field id="name" label="Project name"><Input id="name" name="name" placeholder="Optional if a link is given" maxLength={120} /></Field>
        <Field id="website" label="Official website"><Input id="website" name="website" placeholder="acme.xyz" /></Field>
        <Field id="github" label="GitHub repository"><Input id="github" name="github" placeholder="owner/repo" /></Field>
        <Field id="feed" label="Announcement feed"><Input id="feed" name="feed" placeholder="RSS or Atom URL" /></Field>
        <Field id="x" label="X profile"><Input id="x" name="x" placeholder="@project" /></Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Tell me about</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {updateTypes.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="update_types" value={t.value} defaultChecked className="size-4 accent-primary" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <Button type="submit" size="sm" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Plus />} Watch project</Button>
        <p className="text-xs text-muted-foreground">Websites and feeds are checked every 30 minutes, GitHub releases hourly. X posts are not read: that needs a paid API.</p>
      </div>
      {state?.ok && state.result.sources.length > 0 && (
        <ul className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
          {state.result.sources.map((s) => (
            <li key={s.kind}><span className="font-medium">{s.kind}</span> <span className="text-muted-foreground">· {s.status === "monitored" ? "monitored" : "saved only"} · {s.detail}</span></li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function WatchTypesEditor({ projectId, selected, options }: { projectId: string; selected: string[]; options: Option[] }) {
  const [value, setValue] = useState(selected);
  const [pending, start] = useTransition();
  const toggle = (t: string) => {
    const next = value.includes(t) ? value.filter((v) => v !== t) : [...value, t];
    if (next.length === 0) return void toast.error("Keep at least one update type, or stop watching.");
    setValue(next);
    start(async () => {
      const r = await updateWatchTypes(projectId, next);
      if (!r.ok) { toast.error(r.error ?? "Could not save"); setValue(value); }
    });
  };
  return (
    <div className="flex flex-wrap gap-2" aria-busy={pending}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={on}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${on ? "border-primary/40 bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function WatchToggle({ projectId, watching }: { projectId: string; watching: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={watching ? "secondary" : "outline"}
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = watching ? await removeWatch(projectId) : await watchProject(projectId);
          if (r.ok) toast.success(watching ? "Stopped watching" : "Watching this project");
          else toast.error(r.error ?? "Could not update the watchlist");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : watching ? <EyeOff /> : <Eye />}
      {watching ? "Stop watching" : "Watch"}
    </Button>
  );
}

export function AlternativesButton({ projectId }: { projectId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await searchAlternativesAction(projectId);
          if (r.ok) toast.success(r.message ?? "Search done");
          else toast.error(r.error ?? "Search failed");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Search />} Search the web for alternatives
    </Button>
  );
}
