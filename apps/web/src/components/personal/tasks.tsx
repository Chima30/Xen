"use client";

import { useRef, useState, useTransition } from "react";
import { BellRing, Loader2, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { TASK_PRIORITIES } from "@xen/core/personal-constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { area, field } from "@/components/lab/lab-utils";
import { cn } from "@/lib/utils";
import { DEFAULT_TZ } from "@/lib/xen/format";
import { createTask, deleteTask, setTaskReminder, updateTask } from "@/lib/xen/personal-actions";
import { fromLocalDate, fromLocalDateTime, toLocalInput } from "./dates";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: DEFAULT_TZ });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: DEFAULT_TZ });

export function NewTask({ applications, preselect }: { applications: { id: string; title: string }[]; preselect: string }) {
  const [busy, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const g = (k: string) => String(f.get(k) ?? "");
        start(async () => {
          const r = await createTask({
            title: g("title"), notes: g("notes"), dueAt: fromLocalDate(g("due")), minutes: g("minutes") as never, priority: g("priority") as never,
            applicationId: g("applicationId"), remindAt: fromLocalDateTime(g("remindAt")),
          });
          if (r.ok) { toast.success("Task added"); form.current?.reset(); } else toast.error(r.error);
        });
      }}
    >
      <label className="block space-y-1.5"><span className="text-sm font-medium">Task</span><input name="title" required minLength={2} maxLength={200} className={field} placeholder="e.g. Record the bug video for DemoDEX" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5"><span className="text-sm font-medium">Due</span><input name="due" type="date" className={field} /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Minutes</span><input name="minutes" type="number" min={1} max={1440} className={field} placeholder="30" /></label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Priority</span>
          <select name="priority" defaultValue="medium" className={field}>{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select>
        </label>
        <label className="space-y-1.5"><span className="text-sm font-medium">Remind me</span><input name="remindAt" type="datetime-local" className={field} /></label>
      </div>
      <label className="block space-y-1.5"><span className="text-sm font-medium">For application</span>
        <select name="applicationId" defaultValue={preselect} className={field}>
          <option value="">None</option>
          {applications.map((a) => <option key={a.id} value={a.id}>{a.title.slice(0, 80)}</option>)}
        </select>
      </label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">Notes</span><textarea name="notes" rows={2} className={area} /></label>
      <p className="text-xs text-muted-foreground">Reminders arrive in Telegram when your account is linked in Settings.</p>
      <Button type="submit" size="sm" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Add task</Button>
    </form>
  );
}

type Task = { id: string; title: string; notes: string | null; due_at: string | null; priority: string; minutes_estimate: number | null; application_title: string | null; remind_at: string | null };

export function TaskRow({ t, now }: { t: Task; now: number }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [remind, setRemind] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => { const r = await fn(); if (r.ok) toast.success(msg); else toast.error(r.error ?? "Failed"); });
  const overdue = t.due_at && Date.parse(t.due_at) < now;
  return (
    <li className="flex items-start gap-3 py-3">
      <Checkbox aria-label={`Complete ${t.title}`} className="mt-0.5" disabled={pending} onCheckedChange={() => run(() => updateTask(t.id, { done: true }), "Done")} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">{t.title}</p>
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {t.due_at && <span className={cn(overdue && "text-destructive")}>{overdue ? "Overdue · " : "Due "}{day(t.due_at)}</span>}
          {t.priority !== "medium" && <span>{t.priority} priority</span>}
          {t.minutes_estimate && <span>{t.minutes_estimate} min</span>}
          {t.application_title && <span>{t.application_title}</span>}
          {t.remind_at && <span className="inline-flex items-center gap-1"><BellRing className="size-3" /> {when(t.remind_at)}</span>}
        </p>
        {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
        {editing && (
          <form className="flex flex-wrap items-center gap-2 pt-1" onSubmit={(e) => { e.preventDefault(); run(() => setTaskReminder(t.id, fromLocalDateTime(remind) || null), remind ? "Reminder set" : "Reminder removed"); setEditing(false); }}>
            <input aria-label="Reminder time" type="datetime-local" className={cn(field, "w-auto")} value={remind} onChange={(e) => setRemind(e.target.value)} />
            <Button size="sm" type="submit" disabled={pending}>{remind ? "Set reminder" : "Remove reminder"}</Button>
          </form>
        )}
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Reminder" aria-expanded={editing} onClick={() => { setRemind(t.remind_at ? toLocalInput(t.remind_at) : ""); setEditing((v) => !v); }}><BellRing /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.title}`} disabled={pending} onClick={() => run(() => deleteTask(t.id), "Task deleted")}><Trash2 /></Button>
      </div>
    </li>
  );
}

export function DoneTask({ t }: { t: { id: string; title: string; completed_at: string | null } }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 truncate text-muted-foreground line-through">{t.title}</span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {t.completed_at && day(t.completed_at)}
        <Button variant="ghost" size="icon-sm" aria-label={`Reopen ${t.title}`} disabled={pending}
          onClick={() => start(async () => { const r = await updateTask(t.id, { done: false }); if (!r.ok) toast.error(r.error); })}><Undo2 /></Button>
      </span>
    </li>
  );
}
