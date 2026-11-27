import "server-only";
import {
  buildCalendar, buildDailyPlan, paymentReliability, profileFromRows, rewardText, summarizeEarnings,
  type PlanApplication, type PlanOpportunity, type PlanWatchUpdate,
} from "@xen/core";
import { createUserClient } from "@/lib/supabase/server";
import { DEFAULT_TZ } from "./format";
import { getCurrentUser } from "./queries";
import { requestNow } from "./time";

/** Reads for Phase 7 personal management. All through the user's client, so RLS limits rows to their own. */

const APP_COLUMNS = "id, title, status, notes, submission_url, link, project_name, applied_at, follow_up_at, deadline_at, evidence_urls, opportunity_id, created_at, updated_at";
const OPP_JOIN = "opportunities(id, title, project_name, project_id, category, reward_amount, reward_amount_max, reward_currency, reward_status, estimated_minutes, instructions, source_url, application_url, deadline_at)";

type OppJoin = {
  id: string; title: string; project_name: string | null; project_id: string | null; category: string; reward_amount: number | null; reward_amount_max: number | null;
  reward_currency: string | null; reward_status: string; estimated_minutes: number | null; instructions: string | null; source_url: string; application_url: string | null; deadline_at: string | null;
};
export type ApplicationRow = {
  id: string; title: string; status: string; notes: string | null; submission_url: string | null; link: string | null; project_name: string | null;
  applied_at: string | null; follow_up_at: string | null; deadline_at: string | null; evidence_urls: string[]; opportunity_id: string | null;
  created_at: string; updated_at: string; opportunity: OppJoin | null;
};

/** Your profile and timezone, merged with saved preferences. */
export async function getMyProfile() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const [p, prefs] = await Promise.all([
    db.from("profiles").select("country_code, skills, timezone").eq("id", user.id).maybeSingle(),
    db.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  return { profile: profileFromRows(p.data, prefs.data), timeZone: p.data?.timezone || DEFAULT_TZ };
}

export async function getApplications(): Promise<ApplicationRow[]> {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data } = await db.from("applications").select(`${APP_COLUMNS}, ${OPP_JOIN}`).eq("user_id", user.id).order("updated_at", { ascending: false }).limit(300);
  return ((data ?? []) as unknown as (Omit<ApplicationRow, "opportunity"> & { opportunities: OppJoin | null })[]).map(({ opportunities, ...a }) => ({
    ...a, project_name: a.project_name ?? opportunities?.project_name ?? null, opportunity: opportunities,
  }));
}

export async function getTasks() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const [open, done, apps, reminders] = await Promise.all([
    db.from("tasks").select("id, title, notes, due_at, done, priority, minutes_estimate, application_id, opportunity_id, created_at").eq("user_id", user.id).eq("done", false).order("due_at", { ascending: true, nullsFirst: false }).limit(200),
    db.from("tasks").select("id, title, due_at, completed_at, priority").eq("user_id", user.id).eq("done", true).order("completed_at", { ascending: false, nullsFirst: false }).limit(20),
    db.from("applications").select("id, title").eq("user_id", user.id).not("status", "in", "(rejected,expired,archived,paid)").order("updated_at", { ascending: false }).limit(100),
    db.from("reminders").select("id, task_id, remind_at, sent_at").eq("user_id", user.id).not("task_id", "is", null).is("sent_at", null),
  ]);
  const remindersByTask = new Map((reminders.data ?? []).map((r) => [r.task_id as string, r.remind_at as string]));
  const appTitle = new Map((apps.data ?? []).map((a) => [a.id, a.title]));
  return {
    open: (open.data ?? []).map((t) => ({ ...t, application_title: t.application_id ? appTitle.get(t.application_id) ?? null : null, remind_at: remindersByTask.get(t.id) ?? null })),
    done: done.data ?? [],
    applications: apps.data ?? [],
  };
}

export async function getDailyPlan(minutesOverride?: number) {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const now = await requestNow();
  const { profile, timeZone } = await getMyProfile();
  const since = new Date(now - 48 * 3600e3).toISOString();
  const [tasks, apps, opps, marks, watch] = await Promise.all([
    db.from("tasks").select("id, title, due_at, minutes_estimate, priority, application_id").eq("user_id", user.id).eq("done", false).limit(200),
    db.from("applications").select(`id, title, status, follow_up_at, deadline_at, project_name, opportunity_id, ${OPP_JOIN}`).eq("user_id", user.id).not("status", "in", "(rejected,expired,archived,paid)").limit(200),
    db.from("opportunities").select("id, title, project_name, score, deadline_at, discovered_at, instructions, source_url, category, capital, capital_notes, required_skills, estimated_minutes, reward_amount, reward_amount_max, reward_currency, reward_status, verification, risk_flags, geo_restrictions, geo_allowed, kyc_required")
      .eq("is_active", true).gte("score", 50).not("verification", "in", "(suspicious,expired)").or(`deadline_at.is.null,deadline_at.gte.${new Date(now).toISOString()}`)
      .order("score", { ascending: false }).limit(60),
    db.from("saved_opportunities").select("opportunity_id").eq("user_id", user.id).eq("hidden", true),
    db.from("watchlists").select("project_id, projects(name)").eq("user_id", user.id),
  ]);
  const watched = new Map(((watch.data ?? []) as unknown as { project_id: string; projects: { name: string } | null }[]).map((w) => [w.project_id, w.projects?.name ?? "Project"]));
  const changes = watched.size
    ? await db.from("announcement_changes").select("id, project_id, detected_at, deadline_changed, reward_changed").in("project_id", [...watched.keys()]).eq("significant", true).gte("detected_at", since).limit(20)
    : { data: [] };
  const appRows = (apps.data ?? []) as unknown as { id: string; title: string; status: string; follow_up_at: string | null; deadline_at: string | null; project_name: string | null; opportunity_id: string | null; opportunities: OppJoin | null }[];
  const tracked = new Set(appRows.map((a) => a.opportunity_id).filter(Boolean));
  const hidden = new Set((marks.data ?? []).map((m) => m.opportunity_id));
  const appTitle = new Map(appRows.map((a) => [a.id, a.title]));

  const applications: PlanApplication[] = appRows.map((a) => ({
    id: a.id, title: a.title, status: a.status, follow_up_at: a.follow_up_at, deadline_at: a.deadline_at, project_name: a.project_name ?? a.opportunities?.project_name ?? null,
    opportunity: a.opportunities ? {
      estimated_minutes: a.opportunities.estimated_minutes, instructions: a.opportunities.instructions, source_url: a.opportunities.source_url, deadline_at: a.opportunities.deadline_at,
      reward: rewardText(a.opportunities.reward_amount, a.opportunities.reward_amount_max, a.opportunities.reward_currency, a.opportunities.reward_status),
    } : null,
  }));
  const watchUpdates: PlanWatchUpdate[] = (changes.data ?? []).map((c) => ({ ...c, project_id: c.project_id as string, project_name: watched.get(c.project_id as string) ?? "Project" }));
  const dailyMinutes = minutesOverride ?? profile.dailyMinutes;
  const plan = buildDailyPlan({
    now: new Date(now), timeZone, dailyMinutes, profile,
    tasks: (tasks.data ?? []).map((t) => ({ ...t, application_title: t.application_id ? appTitle.get(t.application_id) ?? null : null })),
    applications,
    opportunities: ((opps.data ?? []) as PlanOpportunity[]).filter((o) => !tracked.has(o.id) && !hidden.has(o.id)),
    watchUpdates,
  });
  return { plan, timeZone, savedMinutes: profile.dailyMinutes, now };
}

export async function getCalendar(month: string) {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { timeZone } = await getMyProfile();
  const from = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const to = `${month}-${String(last).padStart(2, "0")}`;
  // Fetch a day either side so events near midnight land on the right local day.
  const lo = new Date(Date.parse(`${from}T00:00:00Z`) - 86400e3).toISOString();
  const hi = new Date(Date.parse(`${to}T23:59:59Z`) + 86400e3).toISOString();
  const [apps, tasks, reminders, earnings, saved] = await Promise.all([
    db.from("applications").select("id, title, deadline_at, follow_up_at, status, opportunities(deadline_at)").eq("user_id", user.id).not("status", "in", "(rejected,expired,archived,paid)"),
    db.from("tasks").select("id, title, due_at, done").eq("user_id", user.id).gte("due_at", lo).lte("due_at", hi),
    db.from("reminders").select("id, message, remind_at, sent_at").eq("user_id", user.id).gte("remind_at", lo).lte("remind_at", hi),
    db.from("earnings").select("id, title, project_name, expected_at, status").eq("user_id", user.id).gte("expected_at", lo).lte("expected_at", hi),
    db.from("saved_opportunities").select("opportunities(id, title, deadline_at, registration_opens_at)").eq("user_id", user.id).eq("hidden", false),
  ]);
  return {
    timeZone, from, to,
    events: buildCalendar({
      timeZone, from, to,
      applications: ((apps.data ?? []) as unknown as { id: string; title: string; deadline_at: string | null; follow_up_at: string | null; opportunities: { deadline_at: string | null } | null }[])
        .map((a) => ({ ...a, opportunity_deadline: a.opportunities?.deadline_at ?? null })),
      tasks: tasks.data ?? [],
      reminders: reminders.data ?? [],
      earnings: earnings.data ?? [],
      saved: ((saved.data ?? []) as unknown as { opportunities: { id: string; title: string; deadline_at: string | null; registration_opens_at: string | null } | null }[]).flatMap((s) => (s.opportunities ? [s.opportunities] : [])),
    }),
  };
}

export async function getEarnings() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const now = await requestNow();
  const { timeZone } = await getMyProfile();
  const [rows, apps, projects] = await Promise.all([
    db.from("earnings").select("id, title, amount, currency, amount_usd, status, tx_hash, evidence_url, minutes_spent, paid_at, expected_at, notes, category, project_id, project_name, application_id, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
    db.from("applications").select(`id, title, project_name, ${OPP_JOIN}`).eq("user_id", user.id).not("status", "in", "(rejected,expired,archived)").order("updated_at", { ascending: false }).limit(100),
    db.from("projects").select("id, name").order("name").limit(500),
  ]);
  const records = rows.data ?? [];
  const reliability = await getReliability();
  return {
    records, timeZone,
    summary: summarizeEarnings(records, new Date(now), timeZone),
    applications: ((apps.data ?? []) as unknown as { id: string; title: string; project_name: string | null; opportunities: OppJoin | null }[]).map((a) => ({
      id: a.id, title: a.title, projectName: a.project_name ?? a.opportunities?.project_name ?? null, projectId: a.opportunities?.project_id ?? null, category: a.opportunities?.category ?? null,
      currency: a.opportunities?.reward_currency ?? null,
    })),
    projects: projects.data ?? [],
    reliability,
  };
}

/** Payment history for the given projects, plus any project with records, grouped by project. */
export async function getReliability(projectIds?: string[]) {
  const db = await createUserClient();
  let q = db.from("payment_history").select("project_id, evidence_type, outcome, occurred_at, created_at, source_url, details, projects(name)").order("created_at", { ascending: false }).limit(500);
  if (projectIds) q = projectIds.length ? q.in("project_id", projectIds) : q.limit(0);
  const { data } = await q;
  const rows = ((data ?? []) as unknown as { project_id: string; evidence_type: string; outcome: string; occurred_at: string | null; created_at: string; source_url: string | null; details: string | null; projects: { name: string } | null }[])
    .map(({ projects, ...r }) => ({ ...r, project_name: projects?.name ?? "Project" }));
  return { summary: paymentReliability(rows), rows };
}
