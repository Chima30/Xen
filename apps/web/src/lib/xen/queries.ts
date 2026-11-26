import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { PAGE_SIZE, SINCE_MS, type DiscoverFilters } from "./filters";

/**
 * Data access layer for the dashboard. Every read goes through the signed-in user's
 * Supabase client, so Row Level Security applies. The service-role client is used only
 * for owner-only system views, after `requireOwner()`.
 */

export const OPP_LIST_COLUMNS =
  "id,title,project_name,category,tier,reward_amount,reward_amount_max,reward_currency,reward_status,capital,deadline_at,discovered_at,announced_at,verification,score,score_breakdown,networks,estimated_minutes,difficulty,is_active,source_url,risk_flags";

export type OppRow = {
  id: string;
  title: string;
  project_name: string | null;
  category: string;
  tier: string;
  reward_amount: number | null;
  reward_amount_max: number | null;
  reward_currency: string | null;
  reward_status: string;
  capital: string;
  deadline_at: string | null;
  discovered_at: string;
  announced_at: string | null;
  verification: string;
  score: number | null;
  score_breakdown: ScoreBreakdown | null;
  networks: string[];
  estimated_minutes: number | null;
  difficulty: string | null;
  is_active: boolean;
  source_url: string;
  risk_flags: string[];
};

export type ScoreBreakdown = {
  priority?: "high" | "investigate" | "low";
  eligibility?: "eligible" | "ineligible" | "unknown" | string;
  capped?: string | null;
  factors?: { key: string; points: number; weight: number; reason: string }[];
};

export type CurrentUser = { id: string; email: string | null; role: "owner" | "member"; displayName: string | null };

/** The signed-in user (once per request). Redirects to /login when signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const db = await createUserClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: p } = await db.from("profiles").select("role, display_name").eq("id", data.user.id).maybeSingle();
  return { id: data.user.id, email: data.user.email ?? null, role: p?.role === "owner" ? "owner" : "member", displayName: p?.display_name ?? null };
});

export async function requireOwner() {
  const user = await getCurrentUser();
  if (user.role !== "owner") throw new Error("Only the workspace owner can do this.");
  return user;
}

const clean = (s: string) => s.replace(/[,()%*\\:"']/g, " ").trim();

export async function listOpportunities(f: DiscoverFilters, groupCategories?: readonly string[]) {
  const user = await getCurrentUser();
  const db = await createUserClient();

  const { data: marks } = await db.from("saved_opportunities").select("opportunity_id, hidden").eq("user_id", user.id);
  const hidden = (marks ?? []).filter((m) => m.hidden).map((m) => m.opportunity_id as string);
  const saved = new Set((marks ?? []).filter((m) => !m.hidden).map((m) => m.opportunity_id as string));

  let q = db.from("opportunities").select(OPP_LIST_COLUMNS, { count: "exact" });
  if (!f.includeInactive) q = q.eq("is_active", true);
  if (groupCategories?.length) q = q.in("category", [...groupCategories]);
  if (f.category) q = q.eq("category", f.category);
  if (f.q) {
    const t = clean(f.q);
    if (t) q = q.or(`title.ilike.%${t}%,project_name.ilike.%${t}%,description.ilike.%${t}%`);
  }
  if (f.project) q = q.ilike("project_name", `%${clean(f.project)}%`);
  if (f.minReward !== null) q = q.gte("reward_amount", f.minReward);
  if (f.currency) q = q.ilike("reward_currency", clean(f.currency));
  if (f.rewardStatus) q = q.eq("reward_status", f.rewardStatus);
  if (f.verification) q = q.eq("verification", f.verification);
  if (f.capital) q = q.eq("capital", f.capital);
  if (f.network) q = q.contains("networks", [f.network]);
  if (f.eligibleOnly) q = q.eq("score_breakdown->>eligibility", "eligible");
  if (f.difficulty) q = q.eq("difficulty", f.difficulty);
  if (f.maxMinutes !== null) q = q.lte("estimated_minutes", f.maxMinutes);
  const now = Date.now();
  if (f.deadline === "has") q = q.not("deadline_at", "is", null);
  if (f.deadline === "7d" || f.deadline === "30d") {
    q = q.gte("deadline_at", new Date(now).toISOString()).lte("deadline_at", new Date(now + SINCE_MS[f.deadline]).toISOString());
  }
  if (f.publishedSince) q = q.gte("announced_at", new Date(now - SINCE_MS[f.publishedSince]).toISOString());
  if (f.discoveredSince) q = q.gte("discovered_at", new Date(now - SINCE_MS[f.discoveredSince]).toISOString());
  if (f.minScore !== null) q = q.gte("score", f.minScore);
  if (hidden.length) q = q.not("id", "in", `(${hidden.join(",")})`);

  switch (f.sort) {
    case "newest": q = q.order("discovered_at", { ascending: false }); break;
    case "deadline": q = q.order("deadline_at", { ascending: true, nullsFirst: false }); break;
    case "reward": q = q.order("reward_amount", { ascending: false, nullsFirst: false }); break;
    default: q = q.order("score", { ascending: false, nullsFirst: false }).order("discovered_at", { ascending: false });
  }
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
  return { rows: (data ?? []) as OppRow[], total: count ?? 0, saved, error: error?.message ?? null };
}

/** Distinct values for filter dropdowns, from active opportunities. */
export async function getFacets() {
  const db = await createUserClient();
  const { data } = await db.from("opportunities").select("category, reward_currency, networks").eq("is_active", true).limit(2000);
  const cats = new Map<string, number>();
  const currencies = new Set<string>();
  const networks = new Set<string>();
  for (const r of data ?? []) {
    cats.set(r.category, (cats.get(r.category) ?? 0) + 1);
    if (r.reward_currency) currencies.add(r.reward_currency);
    for (const n of r.networks ?? []) networks.add(n);
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return { categories: cats, currencies: sort(currencies), networks: sort(networks) };
}

export async function getSavedFilters(path: string) {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data } = await db.from("saved_filters").select("id, name, query, path").eq("user_id", user.id).eq("path", path).order("name");
  return data ?? [];
}

export async function getOpportunity(id: string) {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data: o } = await db.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!o) return null;
  const [evidence, rewardEvidence, verifications, project, mark, application, related] = await Promise.all([
    db.from("opportunity_evidence").select("kind, excerpt, source_url, captured_at").eq("opportunity_id", id).order("captured_at"),
    db.from("reward_evidence").select("classification, excerpt, source_url, is_official_source, captured_at").eq("opportunity_id", id).order("captured_at"),
    db.from("opportunity_verifications").select("status, confidence, checks, risk_flags, verified_at").eq("opportunity_id", id).order("verified_at", { ascending: false }).limit(10),
    o.project_id ? db.from("projects").select("id, name, website, description, category, stage, ecosystems, socials, funding").eq("id", o.project_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("saved_opportunities").select("hidden").eq("user_id", user.id).eq("opportunity_id", id).maybeSingle(),
    db.from("applications").select("id, status").eq("user_id", user.id).eq("opportunity_id", id).maybeSingle(),
    (o.project_id
      ? db.from("opportunities").select(OPP_LIST_COLUMNS).eq("project_id", o.project_id)
      : db.from("opportunities").select(OPP_LIST_COLUMNS).eq("category", o.category))
      .eq("is_active", true).neq("id", id).order("score", { ascending: false, nullsFirst: false }).limit(5),
  ]);
  return {
    o,
    evidence: evidence.data ?? [],
    rewardEvidence: rewardEvidence.data ?? [],
    verifications: verifications.data ?? [],
    project: project.data,
    saved: mark.data ? !mark.data.hidden : false,
    hidden: mark.data?.hidden ?? false,
    application: application.data,
    related: (related.data ?? []) as OppRow[],
    relatedBy: o.project_id ? ("project" as const) : ("category" as const),
  };
}

export async function getSaved() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data: marks } = await db.from("saved_opportunities").select("opportunity_id, hidden, created_at").eq("user_id", user.id).order("created_at", { ascending: false });
  const ids = (marks ?? []).map((m) => m.opportunity_id as string);
  if (!ids.length) return { saved: [] as OppRow[], hidden: [] as OppRow[] };
  const { data } = await db.from("opportunities").select(OPP_LIST_COLUMNS).in("id", ids);
  const byId = new Map(((data ?? []) as OppRow[]).map((r) => [r.id, r]));
  const pickRows = (h: boolean) => (marks ?? []).filter((m) => m.hidden === h).map((m) => byId.get(m.opportunity_id as string)).filter((r): r is OppRow => !!r);
  return { saved: pickRows(false), hidden: pickRows(true) };
}

export async function getOverview() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const head = { count: "exact" as const, head: true };
  const active = () => db.from("opportunities").select("id", head).eq("is_active", true);

  const [today, high, paid, zero, deadlines, apps, earnings, watch, recent, daily, health, logs, alerts] = await Promise.all([
    db.from("opportunities").select("id", head).gte("discovered_at", iso(now - 86400e3)),
    active().gte("score", 85),
    active().eq("reward_status", "confirmed"),
    active().eq("capital", "none"),
    db.from("opportunities").select("id, title, project_name, deadline_at, score").eq("is_active", true).gte("deadline_at", iso(now)).lte("deadline_at", iso(now + 14 * 86400e3)).order("deadline_at").limit(6),
    db.from("applications").select("id", head).eq("user_id", user.id).in("status", ["interested", "applied", "accepted", "in_progress", "submitted", "under_review"]),
    db.from("earnings").select("amount, currency, amount_usd, status").eq("user_id", user.id).in("status", ["expected", "pending", "received"]),
    db.from("watchlists").select("project_id", head).eq("user_id", user.id),
    db.from("opportunities").select(OPP_LIST_COLUMNS).order("discovered_at", { ascending: false }).limit(6),
    db.from("opportunities").select("discovered_at").gte("discovered_at", iso(now - 14 * 86400e3)).limit(5000),
    db.from("source_health").select("adapter_id, ok, items_fetched, error, checked_at").order("checked_at", { ascending: false }).limit(60),
    db.from("agent_logs").select("agent, action, level, message, created_at").order("created_at", { ascending: false }).limit(6),
    loadAlerts(user, 5),
  ]);

  // Discoveries per day (Lagos calendar days) for the last 14 days.
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const perDay = new Map<string, number>();
  for (let i = 13; i >= 0; i--) perDay.set(dayKey(new Date(now - i * 86400e3)), 0);
  for (const r of daily.data ?? []) {
    const k = dayKey(new Date(r.discovered_at));
    if (perDay.has(k)) perDay.set(k, perDay.get(k)! + 1);
  }

  // Latest check per adapter.
  const latest = new Map<string, NonNullable<typeof health.data>[number]>();
  for (const h of health.data ?? []) if (h.adapter_id && !latest.has(h.adapter_id)) latest.set(h.adapter_id, h);

  const sumBy = (status: string[]) => {
    const rows = (earnings.data ?? []).filter((e) => status.includes(e.status));
    const byCur = new Map<string, number>();
    for (const e of rows) byCur.set(e.currency, (byCur.get(e.currency) ?? 0) + Number(e.amount));
    return { count: rows.length, byCurrency: [...byCur.entries()] };
  };

  return {
    counts: {
      today: today.error ? null : today.count ?? 0,
      high: high.error ? null : high.count ?? 0,
      paid: paid.error ? null : paid.count ?? 0,
      zero: zero.error ? null : zero.count ?? 0,
      activeApplications: apps.error ? null : apps.count ?? 0,
      watchlisted: watch.error ? null : watch.count ?? 0,
    },
    pending: sumBy(["expected", "pending"]),
    received: sumBy(["received"]),
    deadlines: deadlines.data ?? [],
    recent: (recent.data ?? []) as OppRow[],
    perDay: [...perDay.entries()].map(([day, count]) => ({ day, count })),
    sourceHealth: [...latest.values()],
    logs: logs.data ?? [],
    alerts,
  };
}

/**
 * Alerts the user has received. Alerts to the configured owner chat are stored without a
 * user_id (the owner chat is not tied to a web account), so the owner also sees those.
 */
export async function getRecentAlerts(limit: number) {
  return loadAlerts(await getCurrentUser(), limit);
}

async function loadAlerts(user: CurrentUser, limit: number) {
  const db = await createUserClient();
  const own = await db.from("notifications").select("id, kind, status, created_at, sent_at, opportunity_id, payload").eq("user_id", user.id).order("created_at", { ascending: false }).limit(limit);
  let rows = own.data ?? [];
  if (user.role === "owner") {
    const sys = await createAdminClient().from("notifications").select("id, kind, status, created_at, sent_at, opportunity_id, payload").is("user_id", null).order("created_at", { ascending: false }).limit(limit);
    rows = [...rows, ...(sys.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }
  const ids = [...new Set(rows.map((r) => r.opportunity_id).filter(Boolean))] as string[];
  const titles = new Map<string, string>();
  if (ids.length) {
    const { data } = await db.from("opportunities").select("id, title").in("id", ids);
    for (const o of data ?? []) titles.set(o.id, o.title);
  }
  return rows.map((r) => ({ ...r, title: r.opportunity_id ? titles.get(r.opportunity_id) ?? null : null }));
}

export async function getSettings() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const [profile, prefs, notif, tg] = await Promise.all([
    db.from("profiles").select("display_name, country_code, timezone, skills, bio").eq("id", user.id).maybeSingle(),
    db.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("telegram_accounts").select("username, linked_at, chat_id").eq("user_id", user.id).maybeSingle(),
  ]);
  return { user, profile: profile.data, prefs: prefs.data, notif: notif.data, telegram: tg.data?.linked_at ? tg.data : null };
}

export async function getSourcesPage() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const [sources, adapters, health, usage, queries] = await Promise.all([
    db.from("sources").select("id, adapter_id, name, config, priority, scan_interval_minutes, status, next_scan_at, last_success_at, last_error, consecutive_failures").order("priority", { ascending: false }),
    db.from("source_adapters").select("id, name, kind, requires_credentials, supported, notes").order("id"),
    db.from("source_health").select("source_id, adapter_id, ok, items_fetched, duration_ms, error, checked_at").order("checked_at", { ascending: false }).limit(200),
    db.from("api_usage").select("provider, day, requests, failures, units, last_success_at, last_error").gte("day", new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10)).order("day", { ascending: false }),
    db.from("search_queries").select("query, tier, enabled, last_run_at, results_last_run, useful_hits").order("tier").order("query"),
  ]);
  return { user, sources: sources.data ?? [], adapters: adapters.data ?? [], health: health.data ?? [], usage: usage.data ?? [], queries: queries.data ?? [] };
}

export async function getActivity() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const [logs, scans] = await Promise.all([
    db.from("agent_logs").select("id, agent, action, level, message, context, created_at").order("created_at", { ascending: false }).limit(100),
    db.from("scan_history").select("id, trigger, started_at, finished_at, stats, error").order("started_at", { ascending: false }).limit(30),
  ]);
  let jobs: { status: string; kind: string; n: number }[] | null = null;
  let failedJobs: { kind: string; attempts: number; last_error: string | null; created_at: string; status: string }[] = [];
  if (user.role === "owner") {
    const admin = createAdminClient();
    const { data } = await admin.from("job_queue").select("kind, status").gte("created_at", new Date(Date.now() - 7 * 86400e3).toISOString()).limit(5000);
    const m = new Map<string, number>();
    for (const j of data ?? []) m.set(`${j.kind}|${j.status}`, (m.get(`${j.kind}|${j.status}`) ?? 0) + 1);
    jobs = [...m.entries()].map(([k, n]) => ({ kind: k.split("|")[0]!, status: k.split("|")[1]!, n })).sort((a, b) => a.kind.localeCompare(b.kind));
    const f = await admin.from("job_queue").select("kind, attempts, last_error, created_at, status").in("status", ["failed", "dead"]).order("created_at", { ascending: false }).limit(10);
    const p = await admin.from("job_queue").select("kind, attempts, last_error, created_at, status").eq("status", "pending").gt("attempts", 0).order("created_at", { ascending: false }).limit(10);
    failedJobs = [...(f.data ?? []), ...(p.data ?? [])];
  }
  return { user, logs: logs.data ?? [], scans: scans.data ?? [], jobs, failedJobs };
}

export async function searchOpportunityTitles(term: string) {
  await getCurrentUser();
  const t = clean(term).slice(0, 80);
  if (t.length < 2) return [];
  const db = await createUserClient();
  const { data } = await db.from("opportunities").select("id, title, project_name, category, score")
    .or(`title.ilike.%${t}%,project_name.ilike.%${t}%`).eq("is_active", true).order("score", { ascending: false, nullsFirst: false }).limit(8);
  return data ?? [];
}
