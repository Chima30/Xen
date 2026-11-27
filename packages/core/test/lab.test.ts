/**
 * XEN Lab guarantees, with the Gemini API stubbed (MOCKED model output, clearly synthetic).
 * These check what code enforces regardless of what the model returns.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bugReportToMarkdown, draftFeedback, generateBugReport, generateTestCases, keepOnlyKnownUrls, LabBudgetError, loadServerEnv, portfolioToMarkdown } from '../src';

const env = loadServerEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-000', GEMINI_API_KEY: 'test-gemini-key', CRON_SECRET: '0123456789abcdef0123' });

function repo(usedToday = 0) {
  const calls: unknown[] = [];
  return { calls, usageToday: async () => usedToday, recordUsage: async (...a: unknown[]) => { calls.push(a); } } as never;
}

function stubModel(output: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }), { status: 200 })));
}

afterEach(() => vi.unstubAllGlobals());

describe('lab: bug report', () => {
  it('takes facts from the input, removes invented links and marks missing fields', async () => {
    stubModel({
      title: 'Order button does nothing on mobile',
      summary: 'Tapping Buy does nothing. See https://evil.example/fake-proof for details.',
      steps: ['Invented step the user never wrote'],
      expected: 'An order is placed', actual: 'Nothing happens',
      severity: 'high', severityReason: 'A core flow is blocked', investigation: ['Check the click handler on mobile Safari'],
    });
    const r = await generateBugReport(env, repo(), {
      project: 'DemoDEX', platformUrl: 'https://app.demodex.test', device: 'iPhone 13', browser: '', os: 'iOS 18',
      description: 'The Buy button does nothing when tapped on my phone.', stepsTaken: '', expected: '', actual: 'Nothing happens',
      links: [], screenshots: ['user-1/lab/shot.png'],
    });
    expect(r.summary).not.toContain('evil.example');
    expect(r.summary).toContain('[link removed]');
    expect(r.steps).toEqual([]); // the user gave no steps, so none may appear
    expect(r.expected).toBe(''); // not provided by the user
    expect(r.missing).toEqual(expect.arrayContaining(['steps to reproduce', 'expected result']));
    expect(r.environment.find((e) => e.label === 'Device')?.value).toBe('iPhone 13'); // from input, not the model
    expect(r.environment.find((e) => e.label === 'Browser')?.value).toBe('Not provided');
    expect(r.evidence).toEqual(['Screenshot: shot.png']);
    expect(r.actual).toBe('Nothing happens');
    const r2 = await generateBugReport(env, repo(), { description: 'The amount box goes blank after picking USDC.' });
    expect(r2.actual).toBe('The amount box goes blank after picking USDC.'); // the user's own words, not the model's
    expect(r2.missing).not.toContain('actual result');
    const md = bugReportToMarkdown(r);
    expect(md).toContain('## Steps to reproduce\n_Not provided_');
    expect(md).toContain('**Severity:** high');
  });

  it('refuses to run when the daily Gemini budget is spent', async () => {
    stubModel({});
    await expect(generateBugReport(env, repo(10_000), { description: 'Something broke on the swap page today.' })).rejects.toBeInstanceOf(LabBudgetError);
  });

  it('rejects an empty description before calling the model', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(generateBugReport(env, repo(), { description: 'short' })).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('lab: test cases and feedback', () => {
  it('keeps only cases for the areas the user asked for', async () => {
    stubModel({ cases: [
      { area: 'wallet_connection', title: 'Connect with an injected wallet', preconditions: '', steps: ['Open the app', 'Click Connect'], expected: 'Address shown', priority: 'high' },
      { area: 'order_placement', title: 'Not requested', preconditions: '', steps: ['x'], expected: 'y', priority: 'low' },
    ] });
    const cases = await generateTestCases(env, repo(), { platformType: 'dex', areas: ['wallet_connection'], productNotes: '' });
    expect(cases.map((c) => c.title)).toEqual(['Connect with an injected wallet']); // other areas and cases with nothing to check are dropped
  });

  it('needs real observations before drafting feedback', async () => {
    await expect(draftFeedback(env, repo(), { category: 'ui', project: 'X', observations: 'bad' })).rejects.toThrow(/observed/);
  });
});

describe('lab: helpers', () => {
  it('keeps the user’s own links and removes others', () => {
    expect(keepOnlyKnownUrls('see https://a.test/x and https://b.test/y.', ['https://a.test/x'])).toBe('see https://a.test/x and [link removed].');
  });
  it('exports a portfolio without inventing entries', () => {
    const md = portfolioToMarkdown({ name: 'A Tester', headline: '', summary: 'I test DEXs.', skills: ['bug_reporting'], entries: [] });
    expect(md).toContain('_No entries yet._');
    expect(md).toContain('- bug reporting');
  });
});
