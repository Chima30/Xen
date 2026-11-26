"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  analyzeScreenshots, BugInputSchema, bugReportToMarkdown, draftFeedback, draftOutreach, FEEDBACK_CATEGORIES, generateBugReport,
  generateTestCases, LabBudgetError, OFFER_TYPES, OUTREACH_CHANNELS, PLATFORM_TYPES, Repo, type BugReport, type Feedback,
} from "@xen/core";
import { serverEnv } from "@/lib/env";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./queries";

/**
 * XEN Lab and outreach Server Functions. AI calls share the Gemini daily budget (recorded with
 * the service role); everything the user saves goes through their own client, so RLS applies.
 * Nothing here sends a message anywhere.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = <T,>(e: unknown): Result<T> => ({ ok: false, error: e instanceof LabBudgetError ? e.message : e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check the form") : e instanceof Error ? e.message : String(e) });
const deps = () => ({ env: serverEnv(), repo: new Repo(createAdminClient()) });
const uuid = z.string().uuid();

// ---- Bug reports ------------------------------------------------------------
export async function generateBugReportAction(input: unknown): Promise<Result<{ report: BugReport; markdown: string }>> {
  try {
    await getCurrentUser();
    const { env, repo } = deps();
    const report = await generateBugReport(env, repo, input);
    return { ok: true, data: { report, markdown: bugReportToMarkdown(report) } };
  } catch (e) { return fail(e); }
}

export async function saveBugReport(args: { input: unknown; report: BugReport; markdown: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    const input = BugInputSchema.parse(args.input);
    const db = await createUserClient();
    const { data, error } = await db.from("bug_reports").insert({
      user_id: user.id, title: args.report.title.slice(0, 160), input, report: args.report, report_markdown: args.markdown.slice(0, 20000),
      severity: args.report.severity, attachments: input.screenshots, platform_url: input.platformUrl || null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    revalidatePath("/lab");
    return { ok: true, data: { id: data.id } };
  } catch (e) { return fail(e); }
}

const BUG_STATUSES = ["draft", "submitted", "accepted", "rejected", "duplicate"] as const;
export async function updateBugReport(id: string, patch: { status?: string; submittedUrl?: string }): Promise<Result<null>> {
  try {
    uuid.parse(id);
    const user = await getCurrentUser();
    const status = patch.status ? z.enum(BUG_STATUSES).parse(patch.status) : undefined;
    const submitted = patch.submittedUrl !== undefined ? (patch.submittedUrl.trim() ? z.string().url().parse(patch.submittedUrl.trim()) : null) : undefined;
    const db = await createUserClient();
    const { error } = await db.from("bug_reports").update({ ...(status && { status }), ...(submitted !== undefined && { submitted_url: submitted }) }).eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/lab");
    revalidatePath("/lab/portfolio");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

/** Reads the user's own uploads (owner-folder storage policy) and lists what is visible. */
export async function analyzeScreenshotsAction(paths: string[], context: string) {
  try {
    const user = await getCurrentUser();
    const own = paths.filter((p) => p.startsWith(`${user.id}/`)).slice(0, 4);
    if (!own.length) throw new Error("Upload a screenshot first.");
    const db = await createUserClient();
    const images: { mimeType: string; base64: string }[] = [];
    for (const p of own) {
      const { data, error } = await db.storage.from("evidence").download(p);
      if (error || !data) throw new Error(`Could not read ${p.split("/").pop()}`);
      if (data.size > 6 * 1024 * 1024) throw new Error("Screenshots must be under 6 MB for analysis.");
      images.push({ mimeType: data.type || "image/png", base64: Buffer.from(await data.arrayBuffer()).toString("base64") });
    }
    const { env, repo } = deps();
    return { ok: true as const, data: await analyzeScreenshots(env, repo, images, context.slice(0, 1000)) };
  } catch (e) { return fail<Awaited<ReturnType<typeof analyzeScreenshots>>>(e); }
}

// ---- Test plans --------------------------------------------------------------
export async function createTestPlan(args: { title: string; platformType: string; areas: string[]; productNotes: string; platformUrl: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    const platformType = z.enum(PLATFORM_TYPES).parse(args.platformType);
    const { env, repo } = deps();
    const cases = await generateTestCases(env, repo, { platformType, areas: args.areas, productNotes: args.productNotes.slice(0, 3000) });
    if (!cases.length) throw new Error("No test cases were produced. Try fewer areas or add product notes.");
    const db = await createUserClient();
    const { data: s, error } = await db.from("testing_sessions").insert({
      user_id: user.id, title: args.title.trim().slice(0, 120) || `${platformType.replace(/_/g, " ")} test plan`, platform_type: platformType,
      platform_url: args.platformUrl.trim() || null, notes: args.productNotes.slice(0, 3000) || null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const rows = cases.map((c, i) => ({ user_id: user.id, session_id: s.id, platform_type: platformType, area: c.area, title: c.title, steps: c.steps, expected: c.expected, priority: c.priority, preconditions: c.preconditions || null, position: i }));
    const ins = await db.from("test_cases").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
    revalidatePath("/lab");
    return { ok: true, data: { id: s.id } };
  } catch (e) { return fail(e); }
}

export async function setTestResult(caseId: string, result: string, notes?: string): Promise<Result<null>> {
  try {
    uuid.parse(caseId);
    const user = await getCurrentUser();
    const r = z.enum(["pass", "fail", "blocked", "not_run"]).parse(result);
    const db = await createUserClient();
    const { error } = await db.from("test_cases").update({ result: r, ...(notes !== undefined && { notes: notes.slice(0, 1000) }) }).eq("id", caseId).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

// ---- Feedback ------------------------------------------------------------------
export async function draftFeedbackAction(args: { category: string; project: string; observations: string }): Promise<Result<Feedback>> {
  try {
    await getCurrentUser();
    const category = z.enum(FEEDBACK_CATEGORIES).parse(args.category);
    const { env, repo } = deps();
    return { ok: true, data: await draftFeedback(env, repo, { category, project: args.project.slice(0, 120), observations: args.observations.slice(0, 4000) }) };
  } catch (e) { return fail(e); }
}

export async function saveFeedback(args: { category: string; project: string; observations: string; draft: Feedback }): Promise<Result<null>> {
  try {
    const user = await getCurrentUser();
    const category = z.enum(FEEDBACK_CATEGORIES).parse(args.category);
    const db = await createUserClient();
    const { error } = await db.from("feedback_items").insert({
      user_id: user.id, category, project_name: args.project.slice(0, 120) || null, observations: args.observations.slice(0, 4000),
      headline: args.draft.headline, body: args.draft.body, suggestions: args.draft.suggestions,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/lab/feedback");
    revalidatePath("/lab/portfolio");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

// ---- Portfolio -------------------------------------------------------------------
const EntrySchema = z.object({ project: z.string().trim().min(1).max(120), kind: z.string().trim().max(40), title: z.string().trim().min(1).max(200), outcome: z.string().trim().max(80).optional(), link: z.string().trim().url().optional().or(z.literal("")), date: z.string().trim().max(20).optional() });
export async function savePortfolio(args: { headline: string; summary: string; manualEntries: unknown[] }): Promise<Result<null>> {
  try {
    const user = await getCurrentUser();
    const entries = z.array(EntrySchema).max(100).parse(args.manualEntries);
    const db = await createUserClient();
    const { error } = await db.from("tester_portfolios").upsert({ user_id: user.id, headline: args.headline.slice(0, 160), summary: args.summary.slice(0, 2000), entries, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    revalidatePath("/lab/portfolio");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

// ---- Outreach (drafts only; XEN never sends) -------------------------------------------
export async function draftOutreachAction(args: { projectId: string; channel: string; offer: string; kind: string; notes: string }): Promise<Result<{ subject: string; message: string; projectName: string }>> {
  try {
    const user = await getCurrentUser();
    uuid.parse(args.projectId);
    const channel = z.enum(OUTREACH_CHANNELS).parse(args.channel);
    const offer = z.enum(OFFER_TYPES).parse(args.offer);
    const kind = z.enum(["first_contact", "application_response", "follow_up"]).parse(args.kind);
    const db = await createUserClient();
    const [{ data: project }, { data: signals }, { data: profile }, { data: portfolio }, { data: accepted }] = await Promise.all([
      db.from("projects").select("name, description, stage, website").eq("id", args.projectId).maybeSingle(),
      db.from("project_signals").select("summary").eq("project_id", args.projectId).order("observed_at", { ascending: false }).limit(3),
      db.from("profiles").select("display_name, skills, bio").eq("id", user.id).maybeSingle(),
      db.from("tester_portfolios").select("entries").eq("user_id", user.id).maybeSingle(),
      db.from("bug_reports").select("title, status").eq("user_id", user.id).eq("status", "accepted").limit(5),
    ]);
    if (!project) throw new Error("Project not found.");
    // The only experience the model may cite: accepted reports and the user's own portfolio entries.
    const experience = [
      ...(accepted ?? []).map((b) => `Accepted bug report: ${b.title}`),
      ...(((portfolio?.entries as { project: string; title: string }[] | null) ?? []).slice(0, 8).map((e) => `${e.project}: ${e.title}`)),
    ];
    const { env, repo } = deps();
    const draft = await draftOutreach(env, repo, {
      channel, offer, kind,
      project: { name: project.name, description: project.description, stage: project.stage, website: project.website, signals: (signals ?? []).map((s) => s.summary) },
      sender: { name: profile?.display_name, skills: profile?.skills ?? [], bio: profile?.bio, experience },
      notes: args.notes.slice(0, 1500),
    });
    return { ok: true, data: { ...draft, projectName: project.name } };
  } catch (e) { return fail(e); }
}

export async function saveOutreach(args: { projectId: string | null; projectName: string; channel: string; offer: string; kind: string; subject: string; draft: string }): Promise<Result<null>> {
  try {
    const user = await getCurrentUser();
    const db = await createUserClient();
    const { error } = await db.from("outreach_messages").insert({
      user_id: user.id, project_id: args.projectId, project_name: args.projectName.slice(0, 120), channel: z.enum(OUTREACH_CHANNELS).parse(args.channel),
      offer_type: z.enum(OFFER_TYPES).parse(args.offer), kind: args.kind, subject: args.subject.slice(0, 160) || null, draft: args.draft.slice(0, 5000),
    });
    if (error) throw new Error(error.message);
    revalidatePath("/outreach");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

const OUTREACH_STATUSES = ["draft", "approved", "sent_by_user", "replied", "accepted", "declined", "no_response"] as const;
export async function updateOutreach(id: string, patch: { status?: string; followUpAt?: string | null; response?: string; agreedPayment?: string; draft?: string }): Promise<Result<null>> {
  try {
    uuid.parse(id);
    const user = await getCurrentUser();
    const status = patch.status ? z.enum(OUTREACH_STATUSES).parse(patch.status) : undefined;
    const upd: Record<string, unknown> = {};
    if (status) { upd.status = status; if (status === "sent_by_user") upd.sent_at = new Date().toISOString(); }
    if (patch.followUpAt !== undefined) upd.follow_up_at = patch.followUpAt ? new Date(patch.followUpAt).toISOString() : null;
    if (patch.response !== undefined) upd.response = patch.response.slice(0, 3000);
    if (patch.agreedPayment !== undefined) upd.agreed_payment = patch.agreedPayment.slice(0, 120);
    if (patch.draft !== undefined) upd.draft = patch.draft.slice(0, 5000);
    const db = await createUserClient();
    const { error } = await db.from("outreach_messages").update(upd).eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/outreach");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function updateFeedbackStatus(id: string, status: string): Promise<Result<null>> {
  try {
    uuid.parse(id);
    const user = await getCurrentUser();
    const s = z.enum(["draft", "submitted", "acknowledged"]).parse(status);
    const db = await createUserClient();
    const { error } = await db.from("feedback_items").update({ status: s }).eq("id", id).eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/lab/feedback");
    revalidatePath("/lab/portfolio");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}
