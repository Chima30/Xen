"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { APPLICATION_STATUSES, EARNING_STATUSES, paymentOutcome, TASK_PRIORITIES } from "@xen/core";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { getCurrentUser, requireOwner } from "./queries";

/**
 * Phase 7 Server Functions. Personal records go through the user's client (RLS: own rows only).
 * The one exception is your own payment record in payment_history, which RLS does not let users
 * write as evidence; it is written server-side, tied to your earning, and only with proof.
 */

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({ ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check the form") : e instanceof Error ? e.message : String(e) });

const uuid = z.string().uuid();
const httpUrl = z.string().trim().url("Enter a full link starting with https://").refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://");
const optUrl = z.union([z.literal(""), httpUrl]).optional().transform((v) => v || null);
/** Accepts an ISO date-time or a YYYY-MM-DD / datetime-local value; empty means none. */
const optDate = z.union([z.literal(""), z.null(), z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date")]).optional()
  .transform((v) => (v ? new Date(v).toISOString() : v === undefined ? undefined : null));
const text = (max: number) => z.string().trim().max(max);

function refresh(...paths: string[]) {
  for (const p of ["/today", "/calendar", "/overview", ...paths]) revalidatePath(p);
}

// ---- Applications -----------------------------------------------------------
const appInput = z.object({
  title: text(200).min(3, "Give it a title"),
  projectName: text(120).optional().transform((v) => v || null),
  link: optUrl,
  status: z.enum(APPLICATION_STATUSES).default("interested"),
  deadlineAt: optDate,
  notes: text(4000).optional().transform((v) => v || null),
});

export async function createApplication(input: z.input<typeof appInput>): Promise<Result<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    const a = appInput.parse(input);
    const db = await createUserClient();
    const { data, error } = await db.from("applications").insert({
      user_id: user.id, title: a.title, project_name: a.projectName, link: a.link, status: a.status, deadline_at: a.deadlineAt ?? null, notes: a.notes,
      applied_at: a.status === "applied" ? new Date().toISOString() : null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    refresh("/applications");
    return ok({ id: data.id });
  } catch (e) { return fail(e); }
}

/** Starts tracking an opportunity you found in XEN (or returns the existing entry). */
export async function trackOpportunity(opportunityId: string): Promise<Result<{ id: string }>> {
  try {
    uuid.parse(opportunityId);
    const user = await getCurrentUser();
    const db = await createUserClient();
    const { data: existing } = await db.from("applications").select("id").eq("user_id", user.id).eq("opportunity_id", opportunityId).maybeSingle();
    if (existing) return ok({ id: existing.id });
    const { data: o } = await db.from("opportunities").select("title, project_name").eq("id", opportunityId).maybeSingle();
    if (!o) throw new Error("Opportunity not found.");
    const { data, error } = await db.from("applications").insert({ user_id: user.id, opportunity_id: opportunityId, title: o.title, project_name: o.project_name, status: "interested" }).select("id").single();
    if (error) throw new Error(error.message);
    refresh("/applications", `/opportunities/${opportunityId}`);
    return ok({ id: data.id });
  } catch (e) { return fail(e); }
}

const appPatch = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  notes: text(4000).optional(),
  submissionUrl: optUrl,
  link: optUrl,
  followUpAt: optDate,
  deadlineAt: optDate,
  evidenceUrls: z.array(httpUrl).max(20).optional(),
});

export async function updateApplication(id: string, patch: z.input<typeof appPatch>): Promise<Result> {
  try {
    uuid.parse(id);
    const user = await getCurrentUser();
    const p = appPatch.parse(patch);
    const db = await createUserClient();
    const row: Record<string, unknown> = {};
    if (p.status) { row.status = p.status; if (p.status === "applied") row.applied_at = new Date().toISOString(); }
    if (p.notes !== undefined) row.notes = p.notes || null;
    if ("submissionUrl" in patch) row.submission_url = p.submissionUrl;
    if ("link" in patch) row.link = p.link;
    if (p.followUpAt !== undefined) row.follow_up_at = p.followUpAt;
    if (p.deadlineAt !== undefined) row.deadline_at = p.deadlineAt;
    if (p.evidenceUrls) row.evidence_urls = p.evidenceUrls;
    const { error } = await db.from("applications").update(row).eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    refresh("/applications", "/earnings");
    return ok(null);
  } catch (e) { return fail(e); }
}

// ---- Tasks ------------------------------------------------------------------
const taskInput = z.object({
  title: text(200).min(2, "Give the task a title"),
  notes: text(2000).optional().transform((v) => v || null),
  dueAt: optDate,
  minutes: z.coerce.number().int().min(1).max(1440).optional().or(z.literal("").transform(() => undefined)),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  applicationId: z.union([z.literal(""), uuid]).optional().transform((v) => v || null),
  remindAt: optDate,
});

export async function createTask(input: z.input<typeof taskInput>): Promise<Result<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    const t = taskInput.parse(input);
    const db = await createUserClient();
    const { data, error } = await db.from("tasks").insert({
      user_id: user.id, title: t.title, notes: t.notes, due_at: t.dueAt ?? null, minutes_estimate: t.minutes ?? null, priority: t.priority, application_id: t.applicationId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    if (t.remindAt) await writeReminder(db, user.id, data.id, t.title, t.remindAt);
    refresh("/tasks");
    return ok({ id: data.id });
  } catch (e) { return fail(e); }
}

const taskPatch = z.object({ done: z.boolean().optional(), title: text(200).min(2).optional(), dueAt: optDate, priority: z.enum(TASK_PRIORITIES).optional(), notes: text(2000).optional() });

export async function updateTask(id: string, patch: z.input<typeof taskPatch>): Promise<Result> {
  try {
    uuid.parse(id);
    const user = await getCurrentUser();
    const p = taskPatch.parse(patch);
    const db = await createUserClient();
    const row: Record<string, unknown> = {};
    if (p.done !== undefined) { row.done = p.done; row.completed_at = p.done ? new Date().toISOString() : null; }
    if (p.title) row.title = p.title;
    if (p.dueAt !== undefined) row.due_at = p.dueAt;
    if (p.priority) row.priority = p.priority;
    if (p.notes !== undefined) row.notes = p.notes || null;
    const { error } = await db.from("tasks").update(row).eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    // A finished task needs no reminder.
    if (p.done) await db.from("reminders").delete().eq("task_id", id).eq("user_id", user.id).is("sent_at", null);
    refresh("/tasks");
    return ok(null);
  } catch (e) { return fail(e); }
}

export async function deleteTask(id: string): Promise<Result> {
  try {
    uuid.parse(id);
    const user = await getCurrentUser();
    const db = await createUserClient();
    const { error } = await db.from("tasks").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    refresh("/tasks");
    return ok(null);
  } catch (e) { return fail(e); }
}

/** Sets (or clears) the Telegram reminder for a task. Delivered by the existing reminder job. */
export async function setTaskReminder(id: string, remindAt: string | null): Promise<Result> {
  try {
    uuid.parse(id);
    const user = await getCurrentUser();
    const at = optDate.parse(remindAt ?? "");
    if (at && Date.parse(at) < Date.now() - 60_000) throw new Error("Pick a time in the future.");
    const db = await createUserClient();
    const { data: t } = await db.from("tasks").select("title").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!t) throw new Error("Task not found.");
    await db.from("reminders").delete().eq("task_id", id).eq("user_id", user.id).is("sent_at", null);
    if (at) await writeReminder(db, user.id, id, t.title, at);
    refresh("/tasks");
    return ok(null);
  } catch (e) { return fail(e); }
}

async function writeReminder(db: Awaited<ReturnType<typeof createUserClient>>, userId: string, taskId: string, title: string, at: string) {
  const { error } = await db.from("reminders").insert({ user_id: userId, task_id: taskId, remind_at: at, message: `Task: ${title}` });
  if (error) throw new Error(error.message);
}

// ---- Daily time ---------------------------------------------------------------
export async function setDailyMinutes(minutes: number): Promise<Result> {
  try {
    const user = await getCurrentUser();
    const m = z.number().int().min(0).max(1440).parse(minutes);
    const db = await createUserClient();
    const { error } = await db.from("user_preferences").update({ daily_minutes_available: m, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    refresh("/settings");
    return ok(null);
  } catch (e) { return fail(e); }
}

// ---- Earnings -----------------------------------------------------------------
const txHash = z.union([z.literal(""), z.string().trim().regex(/^(0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{43,90}|[0-9a-fA-F]{64})$/, "That does not look like a transaction hash")]).optional().transform((v) => v || null);
const earningInput = z.object({
  title: text(200).min(2, "Say what the payment is for"),
  amount: z.coerce.number().positive("Amount must be more than 0").max(1e12),
  currency: text(16).min(1, "Currency is required").transform((v) => v.toUpperCase()),
  amountUsd: z.union([z.literal(""), z.coerce.number().min(0).max(1e10)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  status: z.enum(EARNING_STATUSES),
  applicationId: z.union([z.literal(""), uuid]).optional().transform((v) => v || null),
  projectId: z.union([z.literal(""), uuid]).optional().transform((v) => v || null),
  projectName: text(120).optional().transform((v) => v || null),
  category: text(60).optional().transform((v) => v || null),
  expectedAt: optDate,
  paidAt: optDate,
  txHash,
  evidenceUrl: optUrl,
  minutes: z.union([z.literal(""), z.coerce.number().int().min(0).max(100000)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  notes: text(2000).optional().transform((v) => v || null),
});

export async function saveEarning(id: string | null, input: z.input<typeof earningInput>): Promise<Result<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    const e = earningInput.parse(input);
    if (e.status === "received" && !e.paidAt) e.paidAt = new Date().toISOString();
    const db = await createUserClient();
    // Fill project and category from the linked application when not given.
    if (e.applicationId && (!e.projectId || !e.category || !e.projectName)) {
      const { data: a } = await db.from("applications").select("project_name, opportunities(project_id, project_name, category)").eq("id", e.applicationId).eq("user_id", user.id).maybeSingle();
      const o = (a as unknown as { project_name: string | null; opportunities: { project_id: string | null; project_name: string | null; category: string } | null } | null);
      e.projectId ??= o?.opportunities?.project_id ?? null;
      e.projectName ??= o?.project_name ?? o?.opportunities?.project_name ?? null;
      e.category ??= o?.opportunities?.category ?? null;
    }
    if (e.projectId && !e.projectName) {
      const { data: p } = await db.from("projects").select("name").eq("id", e.projectId).maybeSingle();
      e.projectName = p?.name ?? null;
    }
    const row = {
      user_id: user.id, title: e.title, amount: e.amount, currency: e.currency, amount_usd: e.amountUsd, status: e.status, application_id: e.applicationId,
      project_id: e.projectId, project_name: e.projectName, category: e.category, expected_at: e.expectedAt ?? null, paid_at: e.status === "received" ? e.paidAt ?? null : null,
      tx_hash: e.txHash, evidence_url: e.evidenceUrl, minutes_spent: e.minutes, notes: e.notes,
    };
    const res = id
      ? await db.from("earnings").update(row).eq("id", uuid.parse(id)).eq("user_id", user.id).select("id").single()
      : await db.from("earnings").insert(row).select("id").single();
    if (res.error) throw new Error(res.error.message);
    await syncPaymentRecord(res.data.id, user.id);
    // Receiving payment for tracked work moves the application to Paid.
    if (e.status === "received" && e.applicationId) await db.from("applications").update({ status: "paid" }).eq("id", e.applicationId).eq("user_id", user.id);
    refresh("/earnings", "/applications");
    return ok({ id: res.data.id });
  } catch (err) { return fail(err); }
}

export async function deleteEarning(id: string): Promise<Result> {
  try {
    uuid.parse(id);
    const user = await getCurrentUser();
    const db = await createUserClient();
    const { error } = await db.from("earnings").delete().eq("id", id).eq("user_id", user.id); // its payment record cascades
    if (error) throw new Error(error.message);
    refresh("/earnings");
    return ok(null);
  } catch (e) { return fail(e); }
}

/**
 * Keeps your own payment record in payment_history in step with an earning. A received payment
 * counts only with a transaction hash or evidence link; an unpaid record is your first-hand report.
 */
async function syncPaymentRecord(earningId: string, userId: string) {
  const admin = createAdminClient();
  const { data: e } = await admin.from("earnings").select("id, user_id, project_id, status, paid_at, expected_at, tx_hash, evidence_url, title").eq("id", earningId).eq("user_id", userId).maybeSingle();
  if (!e) return;
  const qualifies = e.project_id && ((e.status === "received" && (e.tx_hash || e.evidence_url)) || e.status === "unpaid");
  if (!qualifies) {
    await admin.from("payment_history").delete().eq("earning_id", earningId);
    return;
  }
  const outcome = e.status === "unpaid" ? "unpaid" : paymentOutcome(e.paid_at, e.expected_at);
  const details = e.status === "unpaid" ? "Your record: completed work not paid" : `Your record: payment received${e.tx_hash ? ` (tx ${e.tx_hash.slice(0, 10)}…)` : ""}`;
  const { error } = await admin.from("payment_history").upsert({
    earning_id: earningId, project_id: e.project_id, reported_by: userId, evidence_type: "verified_user_payment", outcome, details,
    source_url: e.evidence_url, occurred_at: e.paid_at ?? e.expected_at,
  }, { onConflict: "earning_id" });
  if (error) throw new Error(`Payment saved, but its reliability record failed: ${error.message}`);
}

// ---- Payment reliability reports ----------------------------------------------------
const reportInput = z.object({
  projectId: uuid,
  outcome: z.enum(["paid_on_time", "paid_late", "paid", "partial", "unpaid"]),
  kind: z.enum(["community_allegation", "public_evidence", "official_announcement"]),
  sourceUrl: optUrl,
  details: text(1000).min(10, "Describe what happened in a sentence or two"),
  occurredAt: optDate,
});

/**
 * Records payment evidence about a project. Community reports are allowed for anyone and stay
 * labelled as allegations. Public evidence and official announcements need a source link and the owner role.
 */
export async function reportPaymentEvidence(input: z.input<typeof reportInput>): Promise<Result> {
  try {
    const user = await getCurrentUser();
    const r = reportInput.parse(input);
    if (r.kind !== "community_allegation") {
      if (!r.sourceUrl) throw new Error("Public evidence and official announcements need a link to the source.");
      await requireOwner(); // only the owner may add evidence that counts toward the verified record
    }
    const row = { project_id: r.projectId, reported_by: user.id, evidence_type: r.kind, outcome: r.outcome, details: r.details, source_url: r.sourceUrl, occurred_at: r.occurredAt ?? null };
    const db = r.kind === "community_allegation" ? await createUserClient() : createAdminClient();
    const { error } = await db.from("payment_history").insert(row);
    if (error) throw new Error(error.message);
    refresh("/earnings", `/projects/${r.projectId}`);
    return ok(null);
  } catch (e) { return fail(e); }
}
