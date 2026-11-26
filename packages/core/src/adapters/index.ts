import type { CollectedItem } from '../types';
import { fetchPublicPage, fetchWithRetry, type RequestBudget } from '../http';
import { extractTitle, htmlToText } from '../text';
import { tavilySearch } from '../providers/tavily';
import { assertSafePublicUrl } from '../url';

/**
 * Source adapter contract. Each adapter fetches, paginates (via cursor), and
 * normalizes into CollectedItem. Rate limits/retries are handled by fetchWithRetry;
 * health is recorded by the caller from the returned result or thrown error.
 */
export interface AdapterContext {
  budget: RequestBudget;
  secrets: { tavily?: string; github?: string };
  /** Search cache: returns cached JSON or null; set stores it. */
  cache?: { get(key: string): Promise<unknown | null>; set(key: string, value: unknown): Promise<void> };
  /** Quota gate: returns false when the provider's daily budget is exhausted. */
  allow?(provider: string, units?: number): Promise<boolean>;
  record?(provider: string, ok: boolean, units: number, error?: string): Promise<void>;
}

export interface AdapterResult { items: CollectedItem[]; cursor?: unknown; note?: string }

export interface SourceAdapter {
  id: string;
  requires: string[];
  fetch(config: Record<string, unknown>, ctx: AdapterContext, cursor?: unknown): Promise<AdapterResult>;
}

export class AdapterUnavailableError extends Error {}

// ---------------------------------------------------------------------------
// Tavily search (rotating query library)
// ---------------------------------------------------------------------------
export const tavilyAdapter: SourceAdapter = {
  id: 'tavily',
  requires: ['TAVILY_API_KEY'],
  async fetch(config, ctx) {
    if (!ctx.secrets.tavily) throw new AdapterUnavailableError('TAVILY_API_KEY not configured');
    const queries = (config.queries as string[] | undefined) ?? [];
    const items: CollectedItem[] = [];
    let searched = 0, cached = 0;
    for (const q of queries) {
      const key = `tavily:${q.toLowerCase()}`;
      let resp = (await ctx.cache?.get(key)) as Awaited<ReturnType<typeof tavilySearch>> | null;
      if (resp) cached++;
      else {
        if (ctx.allow && !(await ctx.allow('tavily', 1))) return { items, note: 'tavily daily budget exhausted' };
        try {
          resp = await tavilySearch(ctx.secrets.tavily, q, { maxResults: 8, days: 30, includeRaw: true, budget: ctx.budget });
          await ctx.record?.('tavily', true, 1);
        } catch (e) {
          await ctx.record?.('tavily', false, 1, String(e));
          throw e;
        }
        searched++;
        await ctx.cache?.set(key, resp);
      }
      for (const r of resp.results) {
        items.push({ adapterId: 'tavily', url: r.url, title: r.title, snippet: r.content, publishedAt: r.published_date ?? null, content: r.raw_content ?? undefined });
      }
    }
    return { items, note: `searched=${searched} cached=${cached}` };
  },
};

// ---------------------------------------------------------------------------
// RSS / Atom
// ---------------------------------------------------------------------------
function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  if (!m) return null;
  return m[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
}

export function parseFeed(xml: string): Array<{ title: string; url: string; publishedAt: string | null; content: string }> {
  const out: Array<{ title: string; url: string; publishedAt: string | null; content: string }> = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks) {
    const title = htmlToText(tag(b, 'title') ?? '');
    let url = tag(b, 'link') ?? '';
    if (!url || url.startsWith('<')) url = b.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? '';
    const date = tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date');
    const content = htmlToText(tag(b, 'content:encoded') ?? tag(b, 'content') ?? tag(b, 'description') ?? tag(b, 'summary') ?? '');
    const d = date ? new Date(date) : null;
    if (title && url) out.push({ title, url: url.trim(), publishedAt: d && !Number.isNaN(d.getTime()) ? d.toISOString() : null, content });
  }
  return out;
}

export const rssAdapter: SourceAdapter = {
  id: 'rss',
  requires: [],
  async fetch(config, ctx, cursor) {
    const url = assertSafePublicUrl(String(config.url)).toString();
    const res = await fetchWithRetry(url, { budget: ctx.budget, headers: { 'user-agent': 'XEN-Research/0.1', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
    const entries = parseFeed(await res.text());
    const since = typeof cursor === 'string' ? new Date(cursor).getTime() : 0;
    const fresh = entries.filter((e) => !e.publishedAt || new Date(e.publishedAt).getTime() > since);
    const newest = entries.map((e) => e.publishedAt).filter(Boolean).sort().at(-1);
    return {
      items: fresh.map((e) => ({ adapterId: 'rss', url: e.url, title: e.title, snippet: e.content.slice(0, 500), publishedAt: e.publishedAt, content: e.content })),
      cursor: newest ?? cursor,
    };
  },
};

// ---------------------------------------------------------------------------
// Reddit public listing JSON
// ---------------------------------------------------------------------------
export const redditAdapter: SourceAdapter = {
  id: 'reddit',
  requires: [],
  async fetch(config, ctx, cursor) {
    const sub = String(config.subreddit).replace(/[^A-Za-z0-9_]/g, '');
    const res = await fetchWithRetry(`https://www.reddit.com/r/${sub}/new.json?limit=50&raw_json=1`, {
      budget: ctx.budget, retries: 1, headers: { 'user-agent': 'web:xen-research:v0.1 (opportunity research)' },
    });
    const json = (await res.json()) as { data?: { children?: Array<{ data: { id: string; title: string; selftext: string; url: string; permalink: string; created_utc: number } }> } };
    const posts = json.data?.children?.map((c) => c.data) ?? [];
    const since = typeof cursor === 'number' ? cursor : 0;
    const fresh = posts.filter((p) => p.created_utc > since);
    return {
      items: fresh.map((p) => ({
        adapterId: 'reddit', url: `https://www.reddit.com${p.permalink}`, title: p.title,
        snippet: p.selftext.slice(0, 500), publishedAt: new Date(p.created_utc * 1000).toISOString(),
        content: `${p.title}\n\n${p.selftext}\n\nLinked: ${p.url}`,
      })),
      cursor: posts.reduce((m, p) => Math.max(m, p.created_utc), since),
    };
  },
};

// ---------------------------------------------------------------------------
// GitHub releases for a watched repo
// ---------------------------------------------------------------------------
export const githubAdapter: SourceAdapter = {
  id: 'github',
  requires: [],
  async fetch(config, ctx, cursor) {
    const repo = String(config.repo);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`Invalid repo ${repo}`);
    const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'xen-research', 'x-github-api-version': '2022-11-28' };
    if (ctx.secrets.github) headers.authorization = `Bearer ${ctx.secrets.github}`;
    const res = await fetchWithRetry(`https://api.github.com/repos/${repo}/releases?per_page=10`, { budget: ctx.budget, headers });
    await ctx.record?.('github', true, 1);
    const rels = (await res.json()) as Array<{ html_url: string; name: string | null; tag_name: string; body: string | null; published_at: string }>;
    const since = typeof cursor === 'string' ? cursor : '';
    const fresh = rels.filter((r) => r.published_at > since);
    return {
      items: fresh.map((r) => ({ adapterId: 'github', url: r.html_url, title: `${repo} ${r.name ?? r.tag_name}`, snippet: (r.body ?? '').slice(0, 500), publishedAt: r.published_at, content: r.body ?? '' })),
      cursor: rels[0]?.published_at ?? since,
    };
  },
};

// ---------------------------------------------------------------------------
// DefiLlama: newly listed protocols (early-project signal, not opportunities)
// ---------------------------------------------------------------------------
export const defillamaAdapter: SourceAdapter = {
  id: 'defillama',
  requires: [],
  async fetch(config, ctx) {
    const res = await fetchWithRetry('https://api.llama.fi/protocols', { budget: ctx.budget, timeoutMs: 20_000 });
    const list = (await res.json()) as Array<{ name: string; url?: string; description?: string; category?: string; chains?: string[]; listedAt?: number; slug?: string }>;
    const days = Number(config.lookbackDays ?? 14);
    const cutoff = Date.now() / 1000 - days * 86400;
    const fresh = list.filter((p) => (p.listedAt ?? 0) > cutoff).slice(0, 40);
    return {
      items: fresh.map((p) => ({
        adapterId: 'defillama', url: `https://defillama.com/protocol/${p.slug ?? encodeURIComponent(p.name)}`, title: p.name,
        snippet: `${p.category ?? ''} on ${(p.chains ?? []).join(', ')}. ${p.description ?? ''}`.trim(),
        publishedAt: p.listedAt ? new Date(p.listedAt * 1000).toISOString() : null,
        content: JSON.stringify({ name: p.name, website: p.url, category: p.category, chains: p.chains, description: p.description }),
      })),
      note: 'early_project_signals',
    };
  },
};

// ---------------------------------------------------------------------------
// One official page (watched project): the whole page text is one item, so a content
// change shows up as a changed announcement and is diffed against the previous snapshot.
// ---------------------------------------------------------------------------
export const pageAdapter: SourceAdapter = {
  id: 'page',
  requires: [],
  async fetch(config, ctx) {
    const url = assertSafePublicUrl(String(config.url)).toString();
    const page = await fetchPublicPage(url, { budget: ctx.budget });
    const text = htmlToText(page.html).slice(0, 30_000);
    const title = extractTitle(page.html) ?? new URL(page.finalUrl).host;
    return { items: [{ adapterId: 'page', url: page.finalUrl, title, snippet: text.slice(0, 500), publishedAt: null, content: text }] };
  },
};

export const ADAPTERS: Record<string, SourceAdapter> = {
  tavily: tavilyAdapter, rss: rssAdapter, reddit: redditAdapter, github: githubAdapter, defillama: defillamaAdapter, page: pageAdapter,
};
