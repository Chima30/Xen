import type { Repo } from '../pipeline/repo';
import { isSafePublicUrl, registrableDomain } from '../url';
import { projectSlug, upsertProjectProfile } from './projects';
import { UPDATE_TYPES, type UpdateType } from './signals';

/**
 * Watch (Monitoring agent): users add a project by name, website, X profile, GitHub repo or
 * feed. Supported inputs become monitored sources linked to the project. Inputs XEN cannot
 * read (X, Discord, Telegram channels) are stored on the profile and reported as unsupported.
 */

export const MAX_WATCHES_PER_USER = 25;
export const WATCH_SCAN_MINUTES = { page: 30, rss: 30, github: 60 } as const;
const WATCH_PRIORITY = 95;

export interface WatchInput {
  name?: string | null;
  website?: string | null;
  x?: string | null;
  github?: string | null;
  feed?: string | null;
  updateTypes?: string[];
}

export interface ParsedWatchInput {
  name: string | null;
  website: string | null;
  x: string | null;
  github: string | null;
  feed: string | null;
  errors: string[];
}

const toUrl = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

/** Normalizes and validates what the user typed. Pure, so it is unit-tested. */
export function parseWatchInput(i: WatchInput): ParsedWatchInput {
  const errors: string[] = [];
  const clean = (v?: string | null) => (v ?? '').trim() || null;
  const name = clean(i.name)?.slice(0, 120) ?? null;

  let website = clean(i.website);
  if (website) {
    website = toUrl(website);
    if (!isSafePublicUrl(website)) { errors.push('Website must be a public http(s) address.'); website = null; }
    else website = new URL(website).origin;
  }

  let x = clean(i.x);
  if (x) {
    const handle = x.replace(/^@/, '').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').split(/[/?#]/)[0] ?? '';
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) { errors.push('X profile must be a handle like @project or an x.com link.'); x = null; }
    else x = `https://x.com/${handle}`;
  }

  let github = clean(i.github);
  if (github) {
    const m = github.replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)/);
    if (!m) { errors.push('GitHub must be owner/repo or a github.com repository link.'); github = null; }
    else github = `${m[1]}/${m[2]}`;
  }

  let feed = clean(i.feed);
  if (feed) {
    feed = toUrl(feed);
    if (!isSafePublicUrl(feed)) { errors.push('Feed must be a public http(s) address.'); feed = null; }
  }

  // Prefer the official domain ("acme.xyz" → "acme"), then the GitHub organisation, never the repo name.
  const derivedName = name ?? (website ? registrableDomain(website).split('.')[0]! : github ? github.split('/')[0]! : null);
  if (!derivedName && errors.length === 0) errors.push('Give a project name, a website or a GitHub repository.');
  return { name: derivedName, website, x, github, feed, errors };
}

export function cleanUpdateTypes(types?: string[]): UpdateType[] {
  const valid = (types ?? []).filter((t): t is UpdateType => (UPDATE_TYPES as readonly string[]).includes(t));
  return valid.length ? [...new Set(valid)] : [...UPDATE_TYPES];
}

export interface AddWatchResult {
  ok: boolean;
  error?: string;
  projectId?: string;
  projectName?: string;
  sources: { kind: string; status: 'monitored' | 'stored_only'; detail: string }[];
}

async function ensureSource(repo: Repo, projectId: string, adapterId: string, name: string, config: Record<string, unknown>, minutes: number): Promise<void> {
  const existing = (await repo.db.from('sources').select('id').eq('adapter_id', adapterId).eq('name', name).maybeSingle()).data;
  let sourceId = existing?.id as string | undefined;
  if (!sourceId) {
    const ins = await repo.db.from('sources').insert({ adapter_id: adapterId, name, config, project_id: projectId, priority: WATCH_PRIORITY, scan_interval_minutes: minutes }).select('id').single();
    if (ins.error) throw new Error(`create source: ${ins.error.message}`);
    sourceId = ins.data.id;
  }
  await repo.db.from('project_sources').upsert({ project_id: projectId, source_id: sourceId }, { onConflict: 'project_id,source_id', ignoreDuplicates: true });
}

/**
 * Adds (or updates) a watch. Runs with the service role: it may create shared project and
 * source rows, so callers must have authenticated the user first.
 */
export async function addWatch(repo: Repo, userId: string, input: WatchInput): Promise<AddWatchResult> {
  const p = parseWatchInput(input);
  if (p.errors.length) return { ok: false, error: p.errors.join(' '), sources: [] };

  const count = (await repo.db.from('watchlists').select('project_id', { count: 'exact', head: true }).eq('user_id', userId)).count ?? 0;
  const slug = projectSlug(p.name!);
  const existingProject = (await repo.db.from('projects').select('id, name, socials, github_repos').eq('slug', slug).maybeSingle()).data;
  const alreadyWatching = existingProject
    ? !!(await repo.db.from('watchlists').select('project_id').eq('user_id', userId).eq('project_id', existingProject.id).maybeSingle()).data
    : false;
  if (count >= MAX_WATCHES_PER_USER && !alreadyWatching) return { ok: false, error: `You can watch up to ${MAX_WATCHES_PER_USER} projects.`, sources: [] };

  const projectId = existingProject?.id ?? (await upsertProjectProfile(repo, { name: p.name!, website: p.website }));
  if (!projectId) return { ok: false, error: 'Could not create the project profile.', sources: [] };
  const project = (await repo.db.from('projects').select('id, name, website, socials, github_repos').eq('id', projectId).single()).data!;

  const socials = { ...(project.socials as Record<string, string>) };
  if (p.x) socials.x = p.x;
  const repos = new Set<string>(project.github_repos as string[]);
  if (p.github) repos.add(p.github);
  const patch: Record<string, unknown> = { socials, github_repos: [...repos] };
  if (!project.website && p.website) { patch.website = p.website; patch.website_domain = registrableDomain(p.website); }
  await repo.db.from('projects').update(patch).eq('id', projectId);

  const sources: AddWatchResult['sources'] = [];
  const website = (patch.website as string | undefined) ?? project.website;
  if (website) {
    await ensureSource(repo, projectId, 'page', `Watch: ${project.name} website`, { url: website }, WATCH_SCAN_MINUTES.page);
    sources.push({ kind: 'Website', status: 'monitored', detail: `Checked every ${WATCH_SCAN_MINUTES.page} minutes for changes` });
  }
  if (p.feed) {
    await ensureSource(repo, projectId, 'rss', `Watch: ${project.name} feed`, { url: p.feed }, WATCH_SCAN_MINUTES.rss);
    sources.push({ kind: 'Feed', status: 'monitored', detail: `Checked every ${WATCH_SCAN_MINUTES.rss} minutes` });
  }
  for (const r of repos) {
    await ensureSource(repo, projectId, 'github', `Watch: ${r} releases`, { repo: r }, WATCH_SCAN_MINUTES.github);
  }
  if (p.github) sources.push({ kind: 'GitHub releases', status: 'monitored', detail: `Checked every ${WATCH_SCAN_MINUTES.github} minutes` });
  if (p.x) sources.push({ kind: 'X profile', status: 'stored_only', detail: 'Saved on the profile. Reading X needs a paid API tier, so posts are not monitored.' });

  const updateTypes = cleanUpdateTypes(input.updateTypes);
  const w = await repo.db.from('watchlists').upsert({ user_id: userId, project_id: projectId, update_types: updateTypes }, { onConflict: 'user_id,project_id' });
  if (w.error) return { ok: false, error: w.error.message, sources };
  return { ok: true, projectId, projectName: project.name, sources };
}

/** Interprets one free-text argument (Telegram /watch): an X link or @handle, a GitHub repo, a website, or a name. */
export function classifyWatchArg(arg: string): WatchInput {
  const a = arg.trim();
  if (/^@[A-Za-z0-9_]{1,15}$/.test(a) || /^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(a)) return { x: a };
  if (/^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i.test(a) || /^[\w-]+\/[\w.-]+$/.test(a)) return { github: a };
  if (/^https?:\/\//i.test(a) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(a)) return { website: a };
  return { name: a };
}
