"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addWatch, cleanUpdateTypes, Repo, RequestBudget, searchAlternatives, type AddWatchResult } from "@xen/core";
import { serverEnv } from "@/lib/env";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { getCurrentUser, requireOwner } from "./queries";

/**
 * Phase 5 Server Functions. Watch creation may create shared project/source rows, so it runs
 * with the service role, but only after the session is checked and the input validated.
 */

export type WatchActionState = { ok: true; message: string; result: AddWatchResult } | { ok: false; error: string } | null;
const uuid = z.string().uuid();

export async function addWatchAction(_: WatchActionState, form: FormData): Promise<WatchActionState> {
  const user = await getCurrentUser();
  const str = (k: string) => String(form.get(k) ?? "").slice(0, 300);
  const r = await addWatch(new Repo(createAdminClient()), user.id, {
    name: str("name"), website: str("website"), x: str("x"), github: str("github"), feed: str("feed"),
    updateTypes: form.getAll("update_types").map(String),
  });
  if (!r.ok) return { ok: false, error: r.error ?? "Could not add the project." };
  await createAdminClient().from("audit_logs").insert({ actor_user_id: user.id, actor: "user", action: "watchlist.added", target: r.projectId });
  revalidatePath("/watchlist");
  revalidatePath(`/projects/${r.projectId}`);
  return { ok: true, message: `Watching ${r.projectName}`, result: r };
}

/** Watch an existing project (from its profile page). */
export async function watchProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Invalid project." };
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { data: p } = await db.from("projects").select("name").eq("id", projectId).maybeSingle();
  if (!p) return { ok: false, error: "Project not found." };
  const r = await addWatch(new Repo(createAdminClient()), user.id, { name: p.name });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/watchlist");
  return { ok: true };
}

export async function updateWatchTypes(projectId: string, types: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Invalid project." };
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { error } = await db.from("watchlists").update({ update_types: cleanUpdateTypes(types) }).eq("user_id", user.id).eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/watchlist");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Stops watching. Shared monitored sources stay, since other users may watch the same project. */
export async function removeWatch(projectId: string): Promise<{ ok: boolean; error?: string }> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Invalid project." };
  const user = await getCurrentUser();
  const db = await createUserClient();
  const { error } = await db.from("watchlists").delete().eq("user_id", user.id).eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/watchlist");
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Owner only: one budgeted Tavily search for alternatives; results go through the normal pipeline. */
export async function searchAlternativesAction(projectId: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (!uuid.safeParse(projectId).success) return { ok: false, error: "Invalid project." };
  try { await requireOwner(); } catch (e) { return { ok: false, error: (e as Error).message }; }
  const env = serverEnv();
  try {
    const r = await searchAlternatives({ env, repo: new Repo(createAdminClient()), budget: new RequestBudget(30), workerId: "web-alternatives" }, projectId);
    revalidatePath(`/projects/${projectId}`);
    if (r.note?.includes("budget")) return { ok: false, error: "Tavily daily budget is used up. Try again tomorrow." };
    return { ok: true, message: `${r.fetched} results, ${r.queued} queued for analysis. New projects appear after the next pipeline runs.` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
