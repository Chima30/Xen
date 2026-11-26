import "server-only";
import { createUserClient } from "@/lib/supabase/server";
import { getCurrentUser } from "./queries";

/** Reads for XEN Lab and outreach. All through the user's client (RLS: own rows only). */

export async function getBugReports(limit = 50) {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data } = await db.from("bug_reports").select("id, title, severity, status, platform_url, submitted_url, report_markdown, created_at, input").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function getTestPlans() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data: plans } = await db.from("testing_sessions").select("id, title, platform_type, platform_url, started_at").eq("user_id", user.id).order("started_at", { ascending: false }).limit(50);
  const ids = (plans ?? []).map((p) => p.id);
  const { data: cases } = ids.length ? await db.from("test_cases").select("session_id, result").in("session_id", ids) : { data: [] };
  return (plans ?? []).map((p) => {
    const cs = (cases ?? []).filter((c) => c.session_id === p.id);
    return { ...p, total: cs.length, run: cs.filter((c) => c.result && c.result !== "not_run").length, failed: cs.filter((c) => c.result === "fail").length };
  });
}

export async function getTestPlan(id: string) {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data: plan } = await db.from("testing_sessions").select("id, title, platform_type, platform_url, notes, started_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!plan) return null;
  const { data: cases } = await db.from("test_cases").select("id, area, title, preconditions, steps, expected, priority, result, notes, position").eq("session_id", id).order("position");
  return { plan, cases: cases ?? [] };
}

export async function getFeedbackItems() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data } = await db.from("feedback_items").select("id, project_name, category, headline, body, suggestions, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export type PortfolioEntry = { project: string; kind: string; title: string; outcome?: string | null; link?: string | null; date?: string | null };

export async function getPortfolio() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const [p, profile, bugs, fb] = await Promise.all([
    db.from("tester_portfolios").select("headline, summary, entries").eq("user_id", user.id).maybeSingle(),
    db.from("profiles").select("display_name, skills, bio").eq("id", user.id).maybeSingle(),
    db.from("bug_reports").select("title, status, submitted_url, created_at, input").eq("user_id", user.id).in("status", ["submitted", "accepted"]).order("created_at", { ascending: false }),
    db.from("feedback_items").select("project_name, headline, status, created_at").eq("user_id", user.id).in("status", ["submitted", "acknowledged"]),
  ]);
  // Entries derived from real work recorded in XEN, plus the user's own manual entries.
  const derived: PortfolioEntry[] = [
    ...(bugs.data ?? []).map((b) => ({
      project: ((b.input as { project?: string } | null)?.project || "Unnamed project"), kind: "bug_report", title: b.title,
      outcome: b.status, link: b.submitted_url, date: b.created_at.slice(0, 10),
    })),
    ...(fb.data ?? []).map((f) => ({ project: f.project_name || "Unnamed project", kind: "product_feedback", title: f.headline || "Feedback", outcome: f.status, link: null, date: f.created_at.slice(0, 10) })),
  ];
  return {
    user,
    headline: p.data?.headline ?? "",
    summary: p.data?.summary ?? profile.data?.bio ?? "",
    manual: ((p.data?.entries as PortfolioEntry[] | null) ?? []),
    derived,
    name: profile.data?.display_name || user.email || "Tester",
    skills: (profile.data?.skills as string[] | null) ?? [],
  };
}

export async function getOutreach() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const [msgs, projects] = await Promise.all([
    db.from("outreach_messages").select("id, project_id, project_name, channel, kind, offer_type, subject, draft, status, sent_at, follow_up_at, response, agreed_payment, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    db.from("projects").select("id, name, stage").order("name").limit(500),
  ]);
  return { messages: msgs.data ?? [], projects: projects.data ?? [] };
}
