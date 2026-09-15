import { describe, expect, test } from 'vitest';

import { domQuietScript, settlePage,type SettleSenses } from './agentBrowserSettle';

/** A fake page whose loading flag and DOM stillness are scripted by time. */
function fakeSenses(script: {
  loadingFrom?: number;
  loadingUntil?: number;
  quietResult?: boolean | 'navigates-once';
}): SettleSenses & { clock: () => number; quietCalls: number } {
  let clock = 0;
  let quietCalls = 0;
  const loading = (): boolean => (
    script.loadingFrom !== undefined
    && clock >= script.loadingFrom
    && clock < (script.loadingUntil ?? Number.POSITIVE_INFINITY)
  );
  return {
    isLoading: loading,
    domQuiet: async (quietMs) => {
      quietCalls += 1;
      clock += quietMs;
      if (script.quietResult === 'navigates-once' && quietCalls === 1) {
        // A navigation began under the observer; the page is torn down.
        script.loadingFrom = clock;
        script.loadingUntil = clock + 200;
        throw new Error('Execution context was destroyed.');
      }
      return script.quietResult !== false;
    },
    sleep: async ms => { clock += ms; },
    now: () => clock,
    clock: () => clock,
    quietCalls,
  };
}

describe('settlePage', () => {
  test('a click that only redraws: no navigation, waits for the DOM to go quiet', async () => {
    const senses = fakeSenses({ quietResult: true });
    const report = await settlePage(senses, { startWindowMs: 100, pollMs: 25, quietMs: 500 });
    expect(report).toMatchObject({ navigated: false, loaded: true, quiet: true });
    // The start window was spent (100ms) and then the quiet window (500ms).
    expect(report.waitedMs).toBe(600);
  });

  test('a click that navigates: waits for the load to finish first', async () => {
    const senses = fakeSenses({ loadingFrom: 50, loadingUntil: 1_000, quietResult: true });
    const report = await settlePage(senses, { startWindowMs: 400, pollMs: 25, quietMs: 500 });
    expect(report).toMatchObject({ navigated: true, loaded: true, quiet: true });
    expect(report.waitedMs).toBeGreaterThanOrEqual(1_500);
  });

  test('a load that never finishes comes back with loaded=false, not never', async () => {
    const senses = fakeSenses({ loadingFrom: 0, quietResult: true });
    const report = await settlePage(senses, { startWindowMs: 100, loadTimeoutMs: 800, pollMs: 25, quietMs: 100 });
    expect(report.navigated).toBe(true);
    expect(report.loaded).toBe(false);
    expect(report.waitedMs).toBeLessThan(2_000);
  });

  test('a page that keeps changing comes back with quiet=false', async () => {
    const senses = fakeSenses({ quietResult: false });
    const report = await settlePage(senses, { startWindowMs: 50, pollMs: 25 });
    expect(report).toMatchObject({ navigated: false, loaded: true, quiet: false });
  });

  test('a navigation that begins during the quiet wait is waited for, once', async () => {
    const senses = fakeSenses({ quietResult: 'navigates-once' });
    const report = await settlePage(senses, { startWindowMs: 50, pollMs: 25, quietMs: 100 });
    expect(report).toMatchObject({ navigated: true, loaded: true, quiet: true });
  });
});

describe('domQuietScript', () => {
  test('is a promise that observes the document and has both timers', () => {
    const script = domQuietScript(500, 4_000);
    expect(script.startsWith('new Promise(')).toBe(true);
    expect(script).toContain('MutationObserver');
    expect(script).toContain('document.documentElement');
    expect(script).toContain('done(true), 500');
    expect(script).toContain('done(false), 4000');
  });

  test('never lets the ceiling fall below the quiet window', () => {
    expect(domQuietScript(800, 100)).toContain('done(false), 800');
  });
});
