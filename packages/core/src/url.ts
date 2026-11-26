/**
 * URL utilities: canonicalization for dedupe and SSRF protection for any URL
 * that XEN fetches on behalf of a user or from untrusted content.
 */

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|s$|t$|igshid$|si$|_hs|mkt_tok$)/i;

export function canonicalizeUrl(input: string): string {
  const u = new URL(input.trim());
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^mobile\./, '');
  if (u.hostname === 'twitter.com') u.hostname = 'x.com';
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) u.port = '';
  u.protocol = 'https:';
  const kept = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAMS.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = '';
  for (const [k, v] of kept) u.searchParams.append(k, v);
  let path = u.pathname.replace(/\/+$/, '');
  if (path === '') path = '/';
  u.pathname = path;
  return u.toString();
}

/** Very small public-suffix approximation: good enough for matching official domains. */
const MULTI_PART_TLDS = new Set(['co.uk', 'com.ng', 'com.au', 'co.jp', 'com.br', 'co.in', 'org.uk', 'gov.ng', 'com.sg']);
export function registrableDomain(hostOrUrl: string): string {
  let host = hostOrUrl;
  try { host = new URL(hostOrUrl).hostname; } catch { /* already a host */ }
  host = host.toLowerCase().replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

export class UnsafeUrlError extends Error {}

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  return ((o[0]! << 24) >>> 0) + (o[1]! << 16) + (o[2]! << 8) + o[3]!;
}

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return PRIVATE_V4.some(([base, bits]) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  });
}

/**
 * Rejects URLs that could reach internal infrastructure. Hostname-level check only —
 * runtime fetch on Workers/Vercel cannot reach private networks anyway, but we
 * refuse obvious attempts (IP literals, localhost, metadata hosts, odd schemes/ports).
 */
export function assertSafePublicUrl(input: string): URL {
  let u: URL;
  try { u = new URL(input); } catch { throw new UnsafeUrlError('Invalid URL'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UnsafeUrlError(`Blocked scheme ${u.protocol}`);
  if (u.username || u.password) throw new UnsafeUrlError('Credentials in URL are not allowed');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new UnsafeUrlError(`Blocked port ${u.port}`);
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) throw new UnsafeUrlError('Single-label hosts are not allowed');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa'))
    throw new UnsafeUrlError('Local hostnames are not allowed');
  if (host === 'metadata.google.internal' || host === '169.254.169.254') throw new UnsafeUrlError('Metadata endpoints are not allowed');
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) throw new UnsafeUrlError('Numeric hosts are not allowed');
  if (ipv4ToInt(host) !== null && isPrivateIPv4(host)) throw new UnsafeUrlError('Private IPv4 addresses are not allowed');
  if (host.includes(':')) {
    // IPv6 literal: block loopback, link-local, ULA, mapped v4
    if (host === '::1' || host === '::' || /^(fe8|fe9|fea|feb|fc|fd)/i.test(host) || host.startsWith('::ffff:'))
      throw new UnsafeUrlError('Private IPv6 addresses are not allowed');
  }
  return u;
}

export function isSafePublicUrl(input: string): boolean {
  try { assertSafePublicUrl(input); return true; } catch { return false; }
}
