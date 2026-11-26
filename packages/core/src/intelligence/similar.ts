/**
 * Competitor discovery: projects that resemble a given one. Ranked only from stored facts
 * (category words, shared ecosystems, stage), so it is labeled "similar", never "competitor
 * confirmed". A web search for alternatives is a separate, budgeted, explicit action.
 */

export interface SimilarCandidate { id: string; name: string; category: string | null; ecosystems: string[]; stage: string; website: string | null }

const STOP = new Set(['protocol', 'platform', 'app', 'the', 'and', 'for', 'on', 'web3', 'crypto', 'decentralized', 'a', 'of']);
const words = (s: string | null) => new Set((s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));

export function rankSimilar(target: SimilarCandidate, candidates: SimilarCandidate[], limit = 8): (SimilarCandidate & { score: number; why: string[] })[] {
  const tw = words(target.category);
  const te = new Set(target.ecosystems.map((e) => e.toLowerCase()));
  const out: (SimilarCandidate & { score: number; why: string[] })[] = [];
  for (const c of candidates) {
    if (c.id === target.id) continue;
    const why: string[] = [];
    let score = 0;
    const shared = [...words(c.category)].filter((w) => tw.has(w));
    if (shared.length) { score += 2 * shared.length; why.push(`Category: ${c.category}`); }
    const eco = c.ecosystems.filter((e) => te.has(e.toLowerCase()));
    if (eco.length) { score += eco.length; why.push(`Shares ${eco.join(', ')}`); }
    if (score > 0 && c.stage === target.stage && target.stage !== 'unknown') { score += 0.5; why.push(`Same stage: ${c.stage.replaceAll('_', ' ')}`); }
    if (shared.length) out.push({ ...c, score, why }); // a category match is required
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** The Tavily query used for "find alternatives to X" (one credit, cached 24 h). */
export function alternativesQuery(name: string, category: string | null): string {
  return `${name} alternatives ${category ?? ''} new projects testnet beta`.replace(/\s+/g, ' ').trim();
}
