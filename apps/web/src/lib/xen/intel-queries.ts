import "server-only";
import { rankSimilar, scoreLead, type Lead, type LeadInput, type SignalType } from "@xen/core";
import { createUserClient } from "@/lib/supabase/server";
import { getCurrentUser, OPP_LIST_COLUMNS, type OppRow } from "./queries";

/**
 * Phase 5 reads: projects, signals, watchlists, similar projects and hidden leads.
 * All through the signed-in user's client, so Row Level Security applies.
 */

export const PROJECT_COLUMNS = "id, slug, name, website, description, category, ecosystems, stage, funding, socials, github_repos, last_monitored_at, created_at";

export type ProjectRow = {
  id: string; slug: string; name: string; website: string | null; description: string | null; category: string | null;
  ecosystems: string[]; stage: string; funding: Record<string, unknown> | null; socials: Record<string, string>;
  github_repos: string[]; last_monitored_at: string | null; created_at: string;
};

export type SignalRow = {
  id: string; project_id: string; signal_type: SignalType; summary: string; source_url: string; observed_at: string;
  evidence_excerpt: string | null; details: Record<string, unknown>;
};

const clean = (s: string) => s.replace(/[,()%*\\:"']/g, " ").trim();

export async function listProjects(f: { q: string; stage: string; withSignals: boolean }) {
  await getCurrentUser();
  const db = await createUserClient();
  let q = db.from("projects").select(PROJECT_COLUMNS).order("last_monitored_at", { ascending: false, nullsFirst: false }).limit(200);
  if (f.q) { const t = clean(f.q); if (t) q = q.or(`name.ilike.%${t}%,category.ilike.%${t}%,description.ilike.%${t}%`); }
  if (f.stage) q = q.eq("stage", f.stage);
  const { data: projects, error } = await q;
  const ids = (projects ?? []).map((p) => p.id);
  const [signals, opps] = ids.length
    ? await Promise.all([
        db.from("project_signals").select("project_id, signal_type, observed_at").in("project_id", ids).order("observed_at", { ascending: false }).limit(2000),
        db.from("opportunities").select("project_id").in("project_id", ids).eq("is_active", true).limit(2000),
      ])
    : [{ data: [] }, { data: [] }];
  const sig = new Map<string, { count: number; latest: string; latestType: string }>();
  for (const s of signals.data ?? []) {
    const cur = sig.get(s.project_id);
    if (cur) cur.count++; else sig.set(s.project_id, { count: 1, latest: s.observed_at, latestType: s.signal_type });
  }
  const oppCount = new Map<string, number>();
  for (const o of opps.data ?? []) if (o.project_id) oppCount.set(o.project_id, (oppCount.get(o.project_id) ?? 0) + 1);
  let rows = ((projects ?? []) as ProjectRow[]).map((p) => ({ ...p, signals: sig.get(p.id) ?? null, opportunities: oppCount.get(p.id) ?? 0 }));
  if (f.withSignals) rows = rows.filter((r) => r.signals);
  return { rows, error: error?.message ?? null };
}

export async function getProject(id: string) {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data: p } = await db.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
  if (!p) return null;
  const project = p as ProjectRow;
  const [signals, opps, changes, watch, candidates, sources] = await Promise.all([
    db.from("project_signals").select("id, project_id, signal_type, summary, source_url, observed_at, evidence_excerpt, details").eq("project_id", id).order("observed_at", { ascending: false }).limit(50),
    db.from("opportunities").select(OPP_LIST_COLUMNS).eq("project_id", id).order("discovered_at", { ascending: false }).limit(20),
    db.from("announcement_changes").select("id, detected_at, added_lines, removed_lines, deadline_changed, reward_changed, dates_before, dates_after, amounts_before, amounts_after, significant, announcement_id").eq("project_id", id).order("detected_at", { ascending: false }).limit(10),
    db.from("watchlists").select("update_types, notes, created_at").eq("user_id", user.id).eq("project_id", id).maybeSingle(),
    project.category
      ? db.from("projects").select("id, name, category, ecosystems, stage, website").not("category", "is", null).neq("id", id).limit(300)
      : Promise.resolve({ data: [] as { id: string; name: string; category: string | null; ecosystems: string[]; stage: string; website: string | null }[] }),
    db.from("project_sources").select("sources(id, adapter_id, name, status, last_success_at, scan_interval_minutes, last_error)").eq("project_id", id),
  ]);
  const similar = rankSimilar({ id, name: project.name, category: project.category, ecosystems: project.ecosystems, stage: project.stage, website: project.website }, candidates.data ?? []);
  type SourceLite = { id: string; adapter_id: string; name: string; status: string; last_success_at: string | null; scan_interval_minutes: number; last_error: string | null };
  const monitored = (sources.data ?? []).map((r) => (r as unknown as { sources: SourceLite | null }).sources).filter((s): s is SourceLite => !!s);
  return {
    user, project,
    signals: (signals.data ?? []) as SignalRow[],
    opportunities: (opps.data ?? []) as OppRow[],
    changes: changes.data ?? [],
    watch: watch.data,
    similar,
    sources: monitored,
  };
}

export async function getWatchlist() {
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data: rows } = await db.from("watchlists").select("project_id, update_types, notes, created_at, last_notified_at").eq("user_id", user.id).order("created_at", { ascending: false });
  const ids = (rows ?? []).map((r) => r.project_id as string);
  if (!ids.length) return { user, items: [], signals: [] as SignalRow[], updates: [] };
  const [projects, signals, notes] = await Promise.all([
    db.from("projects").select(PROJECT_COLUMNS).in("id", ids),
    db.from("project_signals").select("id, project_id, signal_type, summary, source_url, observed_at, evidence_excerpt, details").in("project_id", ids).order("observed_at", { ascending: false }).limit(40),
    db.from("notifications").select("id, status, created_at, payload").eq("user_id", user.id).eq("kind", "watch_update").order("created_at", { ascending: false }).limit(20),
  ]);
  const byId = new Map(((projects.data ?? []) as ProjectRow[]).map((p) => [p.id, p]));
  const items = (rows ?? []).map((r) => ({ ...r, project: byId.get(r.project_id as string) ?? null })).filter((r) => r.project);
  return { user, items, signals: (signals.data ?? []) as SignalRow[], updates: notes.data ?? [] };
}

/** Hidden Opportunity Finder: projects with recent evidence-backed signals and no open testing opportunity. */
export async function getLeads(now: number): Promise<{ leads: Lead[]; considered: number }> {
  await getCurrentUser();
  const db = await createUserClient();
  const since = new Date(now - 120 * 86400e3).toISOString();
  const { data: sig } = await db.from("project_signals").select("project_id, signal_type, summary, source_url, evidence_excerpt, observed_at").gte("observed_at", since).order("observed_at", { ascending: false }).limit(2000);
  const ids = [...new Set((sig ?? []).map((s) => s.project_id as string))];
  if (!ids.length) return { leads: [], considered: 0 };
  const [projects, opps] = await Promise.all([
    db.from("projects").select("id, name, website, stage, category, description, socials, github_repos").in("id", ids),
    db.from("opportunities").select("project_id, category").in("project_id", ids).eq("is_active", true),
  ]);
  const leads: Lead[] = [];
  for (const p of (projects.data ?? []) as LeadInput["project"][]) {
    const l = scoreLead({
      project: p,
      signals: (sig ?? []).filter((s) => s.project_id === p.id) as LeadInput["signals"],
      openOpportunityCategories: (opps.data ?? []).filter((o) => o.project_id === p.id).map((o) => o.category as string),
    }, now);
    if (l) leads.push(l);
  }
  return { leads: leads.sort((a, b) => b.score - a.score), considered: ids.length };
}
