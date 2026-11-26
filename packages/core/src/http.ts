import { assertSafePublicUrl } from './url';

export class HttpError extends Error {
  constructor(message: string, public status: number, public retryable: boolean, public retryAfterMs?: number) { super(message); }
}

/** Short, readable error detail: API error bodies are kept, HTML error pages are reduced to their title. */
export function errorBodySummary(body: string): string {
  // Any HTML page (some start with inline CSS before the <html> tag) is reduced to its title.
  if (/<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<\/(?:div|style|script)>/i.test(body.slice(0, 20000)) || /^\s*[.:#][\w-]+[^{]*\{[^}]*:/.test(body)) {
    const title = body.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim();
    return title ? `HTML page "${title}"` : 'HTML page';
  }
  return body.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * Tracks outbound requests per invocation. Cloudflare Workers Free allows 50
 * external subrequests per invocation, so the pipeline stops before hitting it.
 */
export class RequestBudget {
  used = 0;
  constructor(public readonly limit: number) {}
  get remaining() { return this.limit - this.used; }
  take(n = 1) {
    if (this.used + n > this.limit) throw new HttpError('Per-invocation request budget exhausted', 0, false);
    this.used += n;
  }
}

export interface FetchOpts extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  budget?: RequestBudget;
  /** Return 3xx responses to the caller instead of treating them as errors (manual redirects). */
  passRedirects?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with timeout, budget accounting and retry on 429/5xx/network errors with exponential backoff. */
export async function fetchWithRetry(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 15_000, retries = 2, budget, passRedirects, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    budget?.take();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.ok || (passRedirects && res.status >= 300 && res.status < 400)) return res;
      const retryAfter = Number(res.headers.get('retry-after'));
      const retryable = res.status === 429 || res.status >= 500;
      const body = await res.text().catch(() => '');
      lastErr = new HttpError(`HTTP ${res.status} from ${new URL(url).host}: ${errorBodySummary(body)}`, res.status, retryable,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined);
      if (!retryable) throw lastErr;
    } catch (e) {
      if (e instanceof HttpError && !e.retryable) throw e;
      lastErr = e instanceof Error && e.name === 'AbortError' ? new HttpError(`Timeout after ${timeoutMs}ms`, 0, true) : e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) {
      const ra = lastErr instanceof HttpError ? lastErr.retryAfterMs : undefined;
      await sleep(Math.min(ra ?? 500 * 2 ** attempt, 8_000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const MAX_PAGE_BYTES = 1_500_000;

/**
 * Fetches an untrusted public page: SSRF-checked, redirects followed manually and
 * re-checked at each hop, response size capped, only text content types accepted.
 */
export async function fetchPublicPage(url: string, opts: { budget?: RequestBudget; timeoutMs?: number } = {}): Promise<{ finalUrl: string; html: string; contentType: string }> {
  let current = assertSafePublicUrl(url).toString();
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetchWithRetry(current, {
      redirect: 'manual', passRedirects: true, retries: 1, timeoutMs: opts.timeoutMs ?? 12_000, budget: opts.budget,
      headers: { 'user-agent': 'XEN-Research/0.1 (+opportunity research bot)', accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new HttpError('Redirect without location', res.status, false);
      current = assertSafePublicUrl(new URL(loc, current).toString()).toString();
      continue;
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/|application\/(xhtml|xml|json|rss|atom)/i.test(ct)) throw new HttpError(`Unsupported content-type ${ct}`, res.status, false);
    const reader = res.body?.getReader();
    if (!reader) return { finalUrl: current, html: await res.text(), contentType: ct };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PAGE_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const all = new Uint8Array(Math.min(size, MAX_PAGE_BYTES));
    let off = 0;
    for (const c of chunks) { all.set(c.subarray(0, all.length - off), off); off += c.byteLength; if (off >= all.length) break; }
    return { finalUrl: current, html: new TextDecoder().decode(all), contentType: ct };
  }
  throw new HttpError('Too many redirects', 0, false);
}
