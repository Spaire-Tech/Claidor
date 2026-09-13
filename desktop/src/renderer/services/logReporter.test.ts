import { afterEach, expect, test, vi } from 'vitest';

import { LogReporterAction } from '../../shared/analytics/constants';
import { reportYdAnalyzer } from './logReporter';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Maties collects no usage analytics. These guard the absence: the reporter
// must stay inert, whatever the caller passes and whatever the config says.
// Upstream's version of this file tested how the beacon URL was built and
// how failures were retried; there is no beacon now, so there is no URL and
// nothing to retry.

test('reports nothing and touches no bridge', async () => {
  const fetch = vi.fn();
  const fromRenderer = vi.fn();
  vi.stubGlobal('window', { electron: { api: { fetch }, log: { fromRenderer } } });

  await expect(reportYdAnalyzer({ action: LogReporterAction.AppStarted })).resolves.toBe(false);

  expect(fetch).not.toHaveBeenCalled();
});

test('stays inert for an event carrying identity and extra parameters', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('window', { electron: { api: { fetch } } });

  await expect(reportYdAnalyzer(
    { action: LogReporterAction.AppStarted, source: 'anywhere', userId: 'someone' },
    { touchpointIdentityType: undefined },
  )).resolves.toBe(false);

  expect(fetch).not.toHaveBeenCalled();
});

test('does not need a window at all', async () => {
  vi.stubGlobal('window', undefined);

  await expect(reportYdAnalyzer({ action: LogReporterAction.AppStarted })).resolves.toBe(false);
});
