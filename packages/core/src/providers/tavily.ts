import { fetchWithRetry, type RequestBudget } from '../http';

/** Tavily Search API — https://docs.tavily.com (POST /search, Bearer auth). Basic search = 1 credit. */
export interface TavilyResult { url: string; title: string; content: string; raw_content?: string | null; score: number; published_date?: string }
export interface TavilyResponse { query: string; results: TavilyResult[] }

export async function tavilySearch(
  apiKey: string,
  query: string,
  opts: { maxResults?: number; days?: number; includeRaw?: boolean; budget?: RequestBudget; excludeDomains?: string[] } = {},
): Promise<TavilyResponse> {
  const res = await fetchWithRetry('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      topic: 'general',
      max_results: opts.maxResults ?? 8,
      time_range: opts.days && opts.days <= 7 ? 'week' : opts.days && opts.days <= 31 ? 'month' : undefined,
      include_raw_content: opts.includeRaw ? 'text' : false,
      exclude_domains: opts.excludeDomains ?? ['youtube.com', 'tiktok.com', 'facebook.com', 'instagram.com', 'pinterest.com'],
    }),
    timeoutMs: 25_000,
    retries: 1,
    budget: opts.budget,
  });
  const json = (await res.json()) as TavilyResponse;
  return { query: json.query ?? query, results: Array.isArray(json.results) ? json.results : [] };
}
