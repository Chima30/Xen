/** Formatting helpers. Dates are shown in the user's zone (default Africa/Lagos). */

export const DEFAULT_TZ = "Africa/Lagos";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatReward(amount: number | string | null, max: number | string | null, currency: string | null): string | null {
  const a = amount === null ? null : Number(amount);
  const b = max === null ? null : Number(max);
  const cur = currency ? ` ${currency}` : "";
  const fmt = (n: number) => (n >= 100000 ? compact.format(n) : nf.format(n));
  if (a !== null && b !== null && b > a) return `${fmt(a)}–${fmt(b)}${cur}`;
  if (a !== null) return `${fmt(a)}${cur}`;
  if (b !== null) return `up to ${fmt(b)}${cur}`;
  return currency ? currency : null;
}

export function formatDate(iso: string | null | undefined, tz = DEFAULT_TZ) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz });
}

export function formatDateTime(iso: string | null | undefined, tz = DEFAULT_TZ) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz });
}

/** "in 3 days", "2 hours ago". `now` is passed in so server output is deterministic per request. */
export function relative(iso: string | null | undefined, now: number) {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86400e3], ["hour", 3600e3], ["minute", 60e3]];
  for (const [unit, ms] of units) if (abs >= ms || unit === "minute") return rtf.format(Math.round(diff / ms), unit);
  return "now";
}

export function formatMinutes(min: number | null) {
  if (min === null || min === undefined) return null;
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return h < 24 ? `${nf.format(h)} h` : `${nf.format(h / 24)} days`;
}

export function deadlineTone(iso: string | null, now: number): "danger" | "warn" | "neutral" {
  if (!iso) return "neutral";
  const days = (new Date(iso).getTime() - now) / 86400e3;
  return days < 0 ? "neutral" : days <= 3 ? "danger" : days <= 7 ? "warn" : "neutral";
}
