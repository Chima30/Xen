/** Text normalization, hashing, similarity and untrusted-content sanitization. */

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/ /g, ' ').replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Lowercased, punctuation-free form used for hashing and evidence matching. */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9$%.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function contentHash(text: string): Promise<string> {
  return sha256Hex(normalizeForMatch(text));
}

export function titleKey(title: string): string {
  return normalizeForMatch(title).split(' ').filter((w) => w.length > 2).slice(0, 12).join(' ');
}

function shingles(s: string, k = 3): Set<string> {
  const words = normalizeForMatch(s).split(' ').filter(Boolean);
  const out = new Set<string>();
  if (words.length < k) { out.add(words.join(' ')); return out; }
  for (let i = 0; i <= words.length - k; i++) out.add(words.slice(i, i + k).join(' '));
  return out;
}

/** Jaccard similarity over word 3-shingles. Cheap near-duplicate detection without embeddings. */
export function similarity(a: string, b: string): number {
  const A = shingles(a), B = shingles(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Strips HTML to readable text. Removes scripts/styles/comments entirely. */
export function htmlToText(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+|#39);/gi, (m, e: string) => {
        if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
        if (e.startsWith('#') && e !== '#39') return String.fromCodePoint(parseInt(e.slice(1), 10));
        return ENTITY[e.toLowerCase()] ?? m;
      }),
  );
}

export function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const t = og ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return t ? htmlToText(t).slice(0, 300) : null;
}

export function extractPublishedDate(html: string): string | null {
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|pubdate|date)["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1];
  if (!m) return null;
  const d = new Date(m);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Phrases that indicate content is trying to instruct the model rather than inform it. */
const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|prior|above) (instructions|prompts)/i,
  /disregard (the |all )?(system|previous) (prompt|instructions)/i,
  /you are now [a-z]/i,
  /system prompt/i,
  /\bassistant:\s/i,
  /<\/?(system|instructions?)>/i,
  /(reveal|print|output) (your|the) (api key|secret|system prompt|instructions)/i,
  /mark (this|it) as (verified|legitimate|confirmed)/i,
  /(set|give) (the )?score (to )?(100|high)/i,
];

export function detectInjection(text: string): string[] {
  return INJECTION_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
}

/**
 * Wraps untrusted content for a model prompt. Strips anything that could close our
 * delimiter and truncates. The prompt tells the model the block is data only.
 */
export function wrapUntrusted(text: string, maxChars: number): string {
  const cleaned = text.replace(/<\/?untrusted_content[^>]*>/gi, '').slice(0, maxChars);
  return `<untrusted_content>\n${cleaned}\n</untrusted_content>`;
}

/** Is `excerpt` actually present in `source`? Used to reject fabricated evidence. */
export function excerptAppearsIn(excerpt: string, source: string): boolean {
  const e = normalizeForMatch(excerpt);
  if (e.length < 8) return false;
  const s = normalizeForMatch(source);
  if (s.includes(e)) return true;
  // Allow light paraphrase: 85% of 4-gram shingles of the excerpt present in the source.
  const words = e.split(' ');
  if (words.length < 6) return false;
  let hit = 0, total = 0;
  for (let i = 0; i <= words.length - 4; i++) { total++; if (s.includes(words.slice(i, i + 4).join(' '))) hit++; }
  return total > 0 && hit / total >= 0.85;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
