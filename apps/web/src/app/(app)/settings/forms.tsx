"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Copy, ExternalLink, Loader2, Send, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { unlinkTelegram, updateNotifications, updatePreferences, updateProfile, type ActionResult } from "@/lib/xen/actions";
import { categoryLabel } from "@/lib/xen/labels";

const select = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function useToast(state: ActionResult | null) {
  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "Saved");
    else toast.error(state.error);
  }, [state]);
}

function SaveRow({ pending, state }: { pending: boolean; state: ActionResult | null }) {
  return (
    <div className="flex items-center gap-3 border-t pt-3">
      <Button type="submit" size="sm" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Save</Button>
      {state && !state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SwitchRow({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={name}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={name} name={name} defaultChecked={defaultChecked} />
    </div>
  );
}

function CategoryChecks({ name, all, selected }: { name: string; all: readonly string[]; selected: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
      {all.map((c) => (
        <label key={c} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} value={c} defaultChecked={selected.includes(c)} className="size-4 accent-primary" />
          {categoryLabel(c)}
        </label>
      ))}
    </div>
  );
}

type Profile = { display_name: string | null; country_code: string | null; timezone: string; skills: string[]; bio: string | null } | null;

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  useToast(state);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="display_name" label="Display name"><Input id="display_name" name="display_name" defaultValue={profile?.display_name ?? ""} maxLength={80} /></Field>
        <Field id="country_code" label="Country" hint="2-letter code, used for eligibility."><Input id="country_code" name="country_code" defaultValue={profile?.country_code ?? "NG"} maxLength={2} required className="uppercase" /></Field>
        <Field id="timezone" label="Time zone"><Input id="timezone" name="timezone" defaultValue={profile?.timezone ?? "Africa/Lagos"} required /></Field>
      </div>
      <Field id="skills" label="Skills" hint="Comma-separated, e.g. product_testing, bug_reporting, design">
        <Input id="skills" name="skills" defaultValue={(profile?.skills ?? []).join(", ")} />
      </Field>
      <Field id="bio" label="Short bio" hint="Optional. Used later for outreach drafts.">
        <Textarea id="bio" name="bio" defaultValue={profile?.bio ?? ""} maxLength={500} rows={3} />
      </Field>
      <SaveRow pending={pending} state={state} />
    </form>
  );
}

type Prefs = { zero_capital_mode: boolean; max_capital_usd: number; daily_minutes_available: number; risk_tolerance: string; min_reward_usd: number | null; preferred_categories: string[] } | null;

export function PreferencesForm({ prefs, categories }: { prefs: Prefs; categories: readonly string[] }) {
  const [state, action, pending] = useActionState(updatePreferences, null);
  useToast(state);
  return (
    <form action={action} className="space-y-4">
      <SwitchRow name="zero_capital_mode" label="Zero Capital Mode" hint="Opportunities that need capital are capped at a score of 50." defaultChecked={prefs?.zero_capital_mode ?? true} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="max_capital_usd" label="Max capital (USD)"><Input id="max_capital_usd" name="max_capital_usd" type="number" min={0} step="any" defaultValue={prefs?.max_capital_usd ?? 0} /></Field>
        <Field id="daily_minutes_available" label="Minutes per day"><Input id="daily_minutes_available" name="daily_minutes_available" type="number" min={0} max={1440} defaultValue={prefs?.daily_minutes_available ?? 120} required /></Field>
        <Field id="risk_tolerance" label="Risk tolerance">
          <select id="risk_tolerance" name="risk_tolerance" defaultValue={prefs?.risk_tolerance ?? "low"} className={select}>
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </Field>
        <Field id="min_reward_usd" label="Min reward (USD)"><Input id="min_reward_usd" name="min_reward_usd" type="number" min={0} step="any" defaultValue={prefs?.min_reward_usd ?? ""} placeholder="None" /></Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Preferred categories</legend>
        <CategoryChecks name="preferred_categories" all={categories} selected={prefs?.preferred_categories ?? []} />
      </fieldset>
      <SaveRow pending={pending} state={state} />
    </form>
  );
}

type Notif = { telegram_enabled: boolean; min_score: number; quiet_start: string | null; quiet_end: string | null; morning_briefing: boolean; evening_summary: boolean; weekly_report: boolean; categories: string[] } | null;

export function NotificationsForm({ notif, categories }: { notif: Notif; categories: readonly string[] }) {
  const [state, action, pending] = useActionState(updateNotifications, null);
  useToast(state);
  const hhmm = (t: string | null | undefined, d: string) => (t ?? d).slice(0, 5);
  return (
    <form action={action} className="space-y-4">
      <SwitchRow name="telegram_enabled" label="Telegram alerts" hint="New-opportunity alerts to your linked Telegram account." defaultChecked={notif?.telegram_enabled ?? true} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="min_score" label="Minimum score" hint="Alerts never go out below 65."><Input id="min_score" name="min_score" type="number" min={0} max={100} defaultValue={notif?.min_score ?? 65} required /></Field>
        <Field id="quiet_start" label="Quiet hours start" hint="Saved for later: alerts currently pause 22:00–07:00 WAT for everyone."><Input id="quiet_start" name="quiet_start" type="time" defaultValue={hhmm(notif?.quiet_start, "22:00")} required /></Field>
        <Field id="quiet_end" label="Quiet hours end"><Input id="quiet_end" name="quiet_end" type="time" defaultValue={hhmm(notif?.quiet_end, "07:00")} required /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SwitchRow name="morning_briefing" label="Morning briefing" hint="08:00 WAT" defaultChecked={notif?.morning_briefing ?? true} />
        <SwitchRow name="evening_summary" label="Evening summary" hint="18:00 WAT" defaultChecked={notif?.evening_summary ?? true} />
        <SwitchRow name="weekly_report" label="Weekly report" hint="Sundays 19:00 WAT" defaultChecked={notif?.weekly_report ?? true} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Alert categories</legend>
        <p className="text-xs text-muted-foreground">Leave all unticked to be alerted for every category.</p>
        <CategoryChecks name="categories" all={categories} selected={notif?.categories ?? []} />
      </fieldset>
      <SaveRow pending={pending} state={state} />
    </form>
  );
}

type LinkInfo = { code: string; command: string; expiresAt: string; bot: string | null };

export function TelegramLink({ linked }: { linked: { username: string | null; linked_at: string } | null }) {
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return void toast.error(body.error ?? "Could not create a link code");
      setInfo(body as LinkInfo);
    });

  if (linked) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Linked{linked.username ? <> to <span className="font-medium">@{linked.username}</span></> : null} since {new Date(linked.linked_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
        </p>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const r = await unlinkTelegram(); if (r.ok) toast.success(r.message ?? "Unlinked"); else toast.error(r.error); })}>
          <Unlink /> Unlink
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Linking lets the bot answer personal commands (/saved, /tasks, /watch) for this account and lets Save and Applied buttons in alerts update your dashboard.
      </p>
      {!info ? (
        <Button size="sm" onClick={create} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Send />} Create link code</Button>
      ) : (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <p className="text-sm">Send this to the bot within 10 minutes:</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded border bg-background px-2 py-1 font-mono text-sm">{info.command}</code>
            <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(info.command).then(() => toast.success("Copied"), () => toast.error("Copy failed"))}><Copy /> Copy</Button>
            {info.bot && (
              <a className={buttonVariants({ size: "sm" })} href={`https://t.me/${info.bot}?start=${encodeURIComponent(info.code)}`} target="_blank" rel="noopener noreferrer">Open in Telegram <ExternalLink /></a>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Expires {new Date(info.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Refresh this page after linking.</p>
        </div>
      )}
    </div>
  );
}
