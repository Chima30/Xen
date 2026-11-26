"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ALL_CATEGORIES } from "@xen/core";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { getCurrentUser, requireOwner, searchOpportunityTitles } from "./queries";

/**
 * Server Functions for the dashboard. Each one re-checks the session; writes to personal
 * tables use the user's client (RLS), and shared-source changes require the owner role.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });
const uuid = z.string().uuid();

function refreshOpportunity(id: string) {
  revalidatePath(`/opportunities/${id}`);
  revalidatePath("/discover", "layout");
  revalidatePath("/saved");
  revalidatePath("/overview");
}

export async function setSaved(opportunityId: string, saved: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(opportunityId).success) return fail("Invalid opportunity.");
  const user = await getCurrentUser();
  const db = await createUserClient();
  const res = saved
    ? await db.from("saved_opportunities").upsert({ user_id: user.id, opportunity_id: opportunityId, hidden: false }, { onConflict: "user_id,opportunity_id" })
    : await db.from("saved_opportunities").delete().eq("user_id", user.id).eq("opportunity_id", opportunityId);
  if (res.error) return fail(res.error.message);
  refreshOpportunity(opportunityId);
  return { ok: true, message: saved ? "Saved" : "Removed from saved" };
}

export async function setHidden(opportunityId: string, hidden: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(opportunityId).success) return fail("Invalid opportunity.");
  const user = await getCurrentUser();
  const db = await createUserClient();
  const res = hidden
    ? await db.from("saved_opportunities").upsert({ user_id: user.id, opportunity_id: opportunityId, hidden: true }, { onConflict: "user_id,opportunity_id" })
    : await db.from("saved_opportunities").delete().eq("user_id", user.id).eq("opportunity_id", opportunityId).eq("hidden", true);
  if (res.error) return fail(res.error.message);
  refreshOpportunity(opportunityId);
  return { ok: true, message: hidden ? "Hidden from Discover" : "Shown in Discover again" };
}

/** Records that the user applied. Creates (or updates) their application entry. */
export async function markApplied(opportunityId: string): Promise<ActionResult> {
  if (!uuid.safeParse(opportunityId).success) return fail("Invalid opportunity.");
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data: o } = await db.from("opportunities").select("title").eq("id", opportunityId).maybeSingle();
  if (!o) return fail("Opportunity not found.");
  const { data: existing } = await db.from("applications").select("id").eq("user_id", user.id).eq("opportunity_id", opportunityId).maybeSingle();
  const now = new Date().toISOString();
  const res = existing
    ? await db.from("applications").update({ status: "applied", applied_at: now }).eq("id", existing.id)
    : await db.from("applications").insert({ user_id: user.id, opportunity_id: opportunityId, title: o.title, status: "applied", applied_at: now });
  if (res.error) return fail(res.error.message);
  refreshOpportunity(opportunityId);
  return { ok: true, message: "Marked as applied" };
}

const filterSchema = z.object({
  name: z.string().trim().min(1, "Give the filter a name.").max(60),
  path: z.string().regex(/^\/discover(\/[a-z-]+)?$/),
  query: z.string().max(2000),
});

export async function saveFilter(input: z.input<typeof filterSchema>): Promise<ActionResult> {
  const parsed = filterSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid filter.");
  const user = await getCurrentUser();
  const db = await createUserClient();
  // Never store the page number in a saved filter.
  const qs = new URLSearchParams(parsed.data.query);
  qs.delete("page");
  const { error } = await db.from("saved_filters").upsert({ user_id: user.id, name: parsed.data.name, path: parsed.data.path, query: qs.toString() }, { onConflict: "user_id,name" });
  if (error) return fail(error.message);
  revalidatePath(parsed.data.path);
  return { ok: true, message: `Saved filter “${parsed.data.name}”` };
}

export async function deleteFilter(id: string, path: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("Invalid filter.");
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { error } = await db.from("saved_filters").delete().eq("id", id).eq("user_id", user.id);
  if (error) return fail(error.message);
  revalidatePath(path);
  return { ok: true, message: "Filter deleted" };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const list = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const profileSchema = z.object({
  display_name: z.string().trim().max(80).nullable(),
  country_code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter country code, e.g. NG."),
  timezone: z.string().trim().min(1).max(60).refine((tz) => {
    try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
  }, "Unknown time zone."),
  skills: z.array(z.string().max(40)).max(30),
  bio: z.string().trim().max(500).nullable(),
});

export async function updateProfile(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({
    display_name: String(form.get("display_name") ?? "").trim() || null,
    country_code: form.get("country_code"),
    timezone: form.get("timezone"),
    skills: list(form.get("skills")),
    bio: String(form.get("bio") ?? "").trim() || null,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { error } = await db.from("profiles").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true, message: "Profile saved" };
}

const categoryEnum = z.enum(ALL_CATEGORIES);
const prefsSchema = z.object({
  zero_capital_mode: z.boolean(),
  max_capital_usd: z.coerce.number().min(0).max(1e9),
  daily_minutes_available: z.coerce.number().int().min(0).max(1440),
  risk_tolerance: z.enum(["low", "medium", "high"]),
  min_reward_usd: z.coerce.number().min(0).max(1e9).nullable(),
  preferred_categories: z.array(categoryEnum),
});

export async function updatePreferences(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const minReward = String(form.get("min_reward_usd") ?? "").trim();
  const parsed = prefsSchema.safeParse({
    zero_capital_mode: form.get("zero_capital_mode") === "on",
    max_capital_usd: form.get("max_capital_usd") || 0,
    daily_minutes_available: form.get("daily_minutes_available"),
    risk_tolerance: form.get("risk_tolerance"),
    min_reward_usd: minReward === "" ? null : minReward,
    preferred_categories: form.getAll("preferred_categories").map(String),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { error } = await db.from("user_preferences").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true, message: "Preferences saved" };
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour).");
const notifSchema = z.object({
  telegram_enabled: z.boolean(),
  min_score: z.coerce.number().int().min(0).max(100),
  quiet_start: time,
  quiet_end: time,
  morning_briefing: z.boolean(),
  evening_summary: z.boolean(),
  weekly_report: z.boolean(),
  categories: z.array(categoryEnum),
});

export async function updateNotifications(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = notifSchema.safeParse({
    telegram_enabled: form.get("telegram_enabled") === "on",
    min_score: form.get("min_score"),
    quiet_start: form.get("quiet_start"),
    quiet_end: form.get("quiet_end"),
    morning_briefing: form.get("morning_briefing") === "on",
    evening_summary: form.get("evening_summary") === "on",
    weekly_report: form.get("weekly_report") === "on",
    categories: form.getAll("categories").map(String),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { error } = await db.from("notification_preferences").update(parsed.data).eq("user_id", user.id);
  if (error) return fail(error.message);
  revalidatePath("/settings");
  return { ok: true, message: "Notification settings saved" };
}

export async function unlinkTelegram(): Promise<ActionResult> {
  const user = await getCurrentUser();
  const admin = createAdminClient();
  const { error } = await admin.from("telegram_accounts").delete().eq("user_id", user.id);
  if (error) return fail(error.message);
  await admin.from("audit_logs").insert({ actor_user_id: user.id, actor: "user", action: "telegram.unlinked" });
  revalidatePath("/settings");
  return { ok: true, message: "Telegram unlinked" };
}

// ---------------------------------------------------------------------------
// Sources (owner only)
// ---------------------------------------------------------------------------
export async function setSourceStatus(sourceId: string, status: "active" | "paused"): Promise<ActionResult> {
  if (!uuid.safeParse(sourceId).success || !["active", "paused"].includes(status)) return fail("Invalid request.");
  let user;
  try { user = await requireOwner(); } catch (e) { return fail((e as Error).message); }
  const admin = createAdminClient();
  const patch = status === "active" ? { status, consecutive_failures: 0, next_scan_at: new Date().toISOString() } : { status };
  const { error } = await admin.from("sources").update(patch).eq("id", sourceId);
  if (error) return fail(error.message);
  await admin.from("audit_logs").insert({ actor_user_id: user.id, actor: "user", action: `source.${status}`, target: sourceId });
  revalidatePath("/sources");
  return { ok: true, message: status === "active" ? "Source resumed. It will scan on the next tick." : "Source paused" };
}

/** Makes a source due now. It is collected on the next 15-minute tick, within budgets. */
export async function scanSourceSoon(sourceId: string): Promise<ActionResult> {
  if (!uuid.safeParse(sourceId).success) return fail("Invalid source.");
  let user;
  try { user = await requireOwner(); } catch (e) { return fail((e as Error).message); }
  const admin = createAdminClient();
  const { error } = await admin.from("sources").update({ next_scan_at: new Date().toISOString() }).eq("id", sourceId).eq("status", "active");
  if (error) return fail(error.message);
  await admin.from("audit_logs").insert({ actor_user_id: user.id, actor: "user", action: "source.scan_requested", target: sourceId });
  revalidatePath("/sources");
  return { ok: true, message: "Queued for the next tick (within 15 minutes)" };
}

export async function setQueryEnabled(query: string, enabled: boolean): Promise<ActionResult> {
  if (!query || query.length > 300) return fail("Invalid query.");
  let user;
  try { user = await requireOwner(); } catch (e) { return fail((e as Error).message); }
  const admin = createAdminClient();
  const { error } = await admin.from("search_queries").update({ enabled }).eq("query", query);
  if (error) return fail(error.message);
  await admin.from("audit_logs").insert({ actor_user_id: user.id, actor: "user", action: enabled ? "query.enabled" : "query.disabled", target: query });
  revalidatePath("/sources");
  return { ok: true, message: enabled ? "Query enabled" : "Query disabled" };
}

// ---------------------------------------------------------------------------
// Command palette search
// ---------------------------------------------------------------------------
export async function paletteSearch(term: string) {
  return searchOpportunityTitles(term);
}

// ---------------------------------------------------------------------------
// Manual discovery (owner only): one real pipeline tick, recorded like a scheduled run
// ---------------------------------------------------------------------------
export async function runManualScan(): Promise<ActionResult> {
  let user;
  try { user = await requireOwner(); } catch (e) { return fail((e as Error).message); }
  const { Repo, RequestBudget, runTick } = await import("@xen/core");
  const { serverEnv } = await import("@/lib/env");
  const admin = createAdminClient();
  const repo = new Repo(admin);
  const scan = await admin.from("scan_history").insert({ trigger: "manual (dashboard)" }).select("id").single();
  let error: string | null = null;
  let stats: Awaited<ReturnType<typeof runTick>> | null = null;
  try {
    stats = await runTick(
      { env: serverEnv(), repo, budget: new RequestBudget(80), workerId: `manual-${crypto.randomUUID().slice(0, 8)}` },
      { maxSources: 2, maxJobs: 3 },
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  if (scan.data) await admin.from("scan_history").update({ finished_at: new Date().toISOString(), stats: stats ?? {}, error }).eq("id", scan.data.id);
  await admin.from("audit_logs").insert({ actor_user_id: user.id, actor: "user", action: "pipeline.manual_scan", metadata: { error, jobsRun: stats?.jobsRun ?? 0 } });
  revalidatePath("/overview");
  revalidatePath("/activity");
  if (error) return fail(`Scan failed: ${error}`);
  return { ok: true, message: `Scan finished: ${stats!.jobsRun} jobs run, ${stats!.jobsFailed} failed` };
}

/** Latest alerts for the header bell. */
export async function latestAlerts() {
  const { getRecentAlerts } = await import("./queries");
  return getRecentAlerts(6);
}
