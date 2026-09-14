import { PublishingIdentityType } from '@shared/publishing/constants';
import { afterEach, expect, test, vi } from 'vitest';

import { LogReporterAction, LogReporterEntry, reportYdAnalyzer } from './logReporter';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The point of these is the negative: analytics is off at the source, and the
// test that matters is that nothing reaches the network on any path — not
// with a signed-in user, not with usage analytics switched on, not ever.

const stubElectron = () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('window', {
    electron: {
      platform: 'darwin',
      arch: 'arm64',
      appInfo: {
        getVersion: vi.fn(),
        getKeyfromAttribution: vi.fn(),
      },
      api: { fetch: fetchMock },
      log: { fromRenderer: vi.fn() },
    },
  });
  return fetchMock;
};

test('reports nothing and makes no request', async () => {
  const fetchMock = stubElectron();

  await expect(reportYdAnalyzer({
    action: LogReporterAction.PlanModeEnabled,
    entry: LogReporterEntry.PromptToolsMenu,
  })).resolves.toBe(false);

  expect(fetchMock).not.toHaveBeenCalled();
});

test('makes no request for the app-start event either', async () => {
  const fetchMock = stubElectron();

  await expect(reportYdAnalyzer({ action: LogReporterAction.AppStarted })).resolves.toBe(false);

  expect(fetchMock).not.toHaveBeenCalled();
});

test('ignores a touchpoint identity override rather than reporting it', async () => {
  const fetchMock = stubElectron();

  await expect(reportYdAnalyzer({
    action: LogReporterAction.PublishingRecoveryResult,
    log_Usid: 'a-real-user',
  }, {
    touchpointIdentityType: PublishingIdentityType.Subscription,
  })).resolves.toBe(false);

  expect(fetchMock).not.toHaveBeenCalled();
});

test('queues nothing for later', async () => {
  const fetchMock = stubElectron();

  for (let i = 0; i < 5; i += 1) {
    await reportYdAnalyzer({ action: LogReporterAction.PromptSubmit });
  }
  await vi.waitFor(() => expect(fetchMock).not.toHaveBeenCalled());

  expect(fetchMock).not.toHaveBeenCalled();
});
