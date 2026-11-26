/** Phase 5 (early intelligence) pure logic. Synthetic inputs, clearly labeled; no network. */
import { describe, expect, it } from 'vitest';
import {
  classifyWatchArg, cleanUpdateTypes, diffVersions, parseExtraction, parseWatchInput, rankSimilar, scoreLead, summarizeDiff,
  updateTypeForSignal, UPDATE_TYPES, type SignalType,
} from '../src';
import { fixtureExtraction } from './fixtures';

describe('announcement change detection', () => {
  const before = 'Acme testnet\nRegistration closes on 15 December 2026 for all testers.\nRewards pool: $5,000 USDC for top testers.\nFollow us on X';
  it('detects a deadline extension', () => {
    const after = before.replace('15 December 2026', '22 December 2026');
    const d = diffVersions(before, after);
    expect(d.deadlineChanged).toBe(true);
    expect(d.datesBefore).toEqual(['15 december 2026']);
    expect(d.datesAfter).toEqual(['22 december 2026']);
    expect(d.significant).toBe(true);
    expect(summarizeDiff(d)).toBe('Dates changed: 15 december 2026 → 22 december 2026');
  });
  it('detects new reward terms', () => {
    const d = diffVersions(before, before.replace('$5,000 USDC', '$8,000 USDC'));
    expect(d.rewardChanged).toBe(true);
    expect(d.deadlineChanged).toBe(false);
  });
  it('ignores reordering, whitespace and short boilerplate lines', () => {
    const d = diffVersions(before, `Follow us on X\n${before.split('\n').reverse().join('\n   \n')}\nHome\n2,341 views`);
    expect(d.added).toEqual([]);
    expect(d.significant).toBe(false);
  });
  it('flags notable new text even without dates or amounts', () => {
    const d = diffVersions(before, `${before}\nThe public beta waitlist is now open.`);
    expect(d.significant).toBe(true);
    expect(d.deadlineChanged || d.rewardChanged).toBe(false);
  });
  it('does not treat a plain copy edit as significant', () => {
    expect(diffVersions(before, `${before}\nWe updated our brand colors this week.`).significant).toBe(false);
  });
});

describe('extraction: project and signals', () => {
  const base = { is_relevant: true, project_stage: 'testnet', opportunities: [] as unknown[] };
  it('keeps a valid project and signals; a signals-only document is relevant', () => {
    const r = parseExtraction({
      ...base,
      project: { name: 'Acme', website: 'acme.xyz', description: 'A perp DEX.', category: 'perpetual DEX', ecosystems: ['Solana'], stage: 'testnet' },
      signals: [{ signal_type: 'testnet_announced', summary: 'Acme launched its public testnet.', evidence_excerpt: 'Our public testnet is live today', funding_amount_usd: null }],
    });
    expect(r.relevant).toBe(true);
    expect(r.project?.name).toBe('Acme');
    expect(r.signals).toHaveLength(1);
  });
  it('drops malformed signals and the internal change types; no project means not relevant without opportunities', () => {
    const r = parseExtraction({
      ...base,
      project: { name: null },
      signals: [
        { signal_type: 'deadline_change', summary: 'x x x', evidence_excerpt: 'abcdefghij', funding_amount_usd: null },
        { signal_type: 'made_up', summary: 'x', evidence_excerpt: 'y' },
      ],
    });
    expect(r.signals).toEqual([]);
    expect(r.rejected).toBe(2);
    expect(r.relevant).toBe(false);
  });
  it('still returns opportunities as before', () => {
    const r = parseExtraction({ ...base, opportunities: [fixtureExtraction()] });
    expect(r.opportunities).toHaveLength(1);
    expect(r.signals).toEqual([]);
  });
  it('drops an unsafe project website', () => {
    const r = parseExtraction({ ...base, project: { name: 'Acme', website: 'http://127.0.0.1/admin', ecosystems: [], stage: 'unknown' }, signals: [] });
    expect(r.project?.website).toBeNull();
  });
});

describe('watch input', () => {
  it('normalizes website, X handle, GitHub repo and feed', () => {
    const p = parseWatchInput({ website: 'acme.xyz/blog', x: '@acme_labs', github: 'https://github.com/acme/core.git', feed: 'acme.xyz/feed.xml' });
    expect(p.errors).toEqual([]);
    expect(p).toMatchObject({ name: 'acme', website: 'https://acme.xyz', x: 'https://x.com/acme_labs', github: 'acme/core', feed: 'https://acme.xyz/feed.xml' });
  });
  it('rejects private addresses and junk', () => {
    expect(parseWatchInput({ website: 'http://localhost:3000' }).errors[0]).toMatch(/public/);
    expect(parseWatchInput({ github: 'not a repo' }).errors[0]).toMatch(/GitHub/);
    expect(parseWatchInput({}).errors[0]).toMatch(/name, a website/);
  });
  it('classifies a single Telegram argument', () => {
    expect(classifyWatchArg('@acme')).toEqual({ x: '@acme' });
    expect(classifyWatchArg('acme/core')).toEqual({ github: 'acme/core' });
    expect(classifyWatchArg('https://github.com/acme/core')).toEqual({ github: 'https://github.com/acme/core' });
    expect(classifyWatchArg('acme.xyz')).toEqual({ website: 'acme.xyz' });
    expect(classifyWatchArg('Acme Protocol')).toEqual({ name: 'Acme Protocol' });
  });
  it('defaults to all update types and drops unknown ones', () => {
    expect(cleanUpdateTypes(undefined)).toEqual([...UPDATE_TYPES]);
    expect(cleanUpdateTypes(['funding', 'nonsense', 'funding'])).toEqual(['funding']);
    expect(updateTypeForSignal('deadline_change')).toBe('deadline_change');
    expect(updateTypeForSignal('waitlist')).toBe('registration');
  });
});

describe('hidden opportunity finder', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const ago = (d: number) => new Date(now - d * 86400e3).toISOString();
  const project = { id: 'p1', name: 'Acme', website: 'https://acme.xyz', stage: 'closed_beta', category: 'perp DEX', description: null, socials: { x: 'https://x.com/acme' }, github_repos: ['acme/core'] };
  const sig = (signal_type: SignalType, days: number) => ({ signal_type, summary: `${signal_type} happened`, source_url: 'https://acme.xyz/blog', evidence_excerpt: 'quote', observed_at: ago(days) });

  it('ranks a recently funded beta project as a high-confidence lead with evidence and contacts', () => {
    const l = scoreLead({ project, signals: [sig('funding', 10), sig('beta_launch', 5)], openOpportunityCategories: [] }, now)!;
    expect(l.confidence).toBe('high');
    expect(l.evidence).toHaveLength(2);
    expect(l.contacts.map((c) => c.label)).toEqual(['Website', 'x', 'GitHub']);
    expect(l.approach).toMatch(/beta or waitlist/);
  });
  it('is not a lead when a testing opportunity is already open, or with no signals', () => {
    expect(scoreLead({ project, signals: [sig('funding', 10)], openOpportunityCategories: ['paid_beta_testing'] }, now)).toBeNull();
    expect(scoreLead({ project: { ...project, stage: 'unknown' }, signals: [], openOpportunityCategories: [] }, now)).toBeNull();
  });
  it('ignores stale signals', () => {
    expect(scoreLead({ project: { ...project, stage: 'unknown' }, signals: [sig('funding', 400)], openOpportunityCategories: [] }, now)).toBeNull();
  });
});

describe('similar projects', () => {
  const t = { id: 't', name: 'Acme', category: 'perpetual DEX', ecosystems: ['Solana'], stage: 'testnet', website: null };
  it('needs a category match and ranks shared ecosystems higher', () => {
    const r = rankSimilar(t, [
      { id: 'a', name: 'Beta Perps', category: 'Perpetual exchange', ecosystems: ['Solana'], stage: 'testnet', website: null },
      { id: 'b', name: 'Gamma', category: 'perpetual DEX', ecosystems: ['Base'], stage: 'mainnet', website: null },
      { id: 'c', name: 'Delta', category: 'NFT marketplace', ecosystems: ['Solana'], stage: 'testnet', website: null },
      t,
    ]);
    expect(r.map((x) => x.id)).toEqual(['b', 'a']);
    expect(r.find((x) => x.id === 'a')!.why).toContain('Shares Solana');
  });
});
