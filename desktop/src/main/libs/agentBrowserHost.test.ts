import { beforeEach, describe, expect, test, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  flushStorageData: vi.fn(),
  flushStore: vi.fn<() => Promise<void>>(),
  fromPartition: vi.fn(),
  setPermissionCheckHandler: vi.fn(),
  setPermissionRequestHandler: vi.fn(),
  setProxy: vi.fn<() => Promise<void>>(),
}));

vi.mock('electron', () => ({
  session: {
    fromPartition: electronMocks.fromPartition,
  },
  WebContentsView: class {},
}));

import { AgentBrowserPartition } from '../../shared/browserWebAccess/constants';
import { AgentBrowserHost, resolveDesktopViewportZoomFactor } from './agentBrowserHost';

const createHost = (): AgentBrowserHost => new AgentBrowserHost({
  getMainWindow: () => null,
  getBrowserConfig: () => undefined,
  useSystemProxy: () => false,
  emitState: vi.fn(),
  credentialService: {} as never,
  credentialApprovalService: {} as never,
  resolveSessionKey: () => undefined,
});

describe('AgentBrowserHost persistent storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMocks.flushStore.mockResolvedValue();
    electronMocks.setProxy.mockResolvedValue();
    electronMocks.fromPartition.mockReturnValue({
      cookies: {
        flushStore: electronMocks.flushStore,
      },
      flushStorageData: electronMocks.flushStorageData,
      setPermissionCheckHandler: electronMocks.setPermissionCheckHandler,
      setPermissionRequestHandler: electronMocks.setPermissionRequestHandler,
      setProxy: electronMocks.setProxy,
    });
  });

  test('uses a persistent Electron partition for in-app pages', () => {
    createHost();

    expect(electronMocks.fromPartition).toHaveBeenCalledWith(
      AgentBrowserPartition.Default,
      { cache: true },
    );
    expect(AgentBrowserPartition.Default).toMatch(/^persist:/);
  });

  test('flushes cookies and DOM storage before shutdown completes', async () => {
    let finishCookieFlush: (() => void) | undefined;
    electronMocks.flushStore.mockReturnValue(new Promise(resolve => {
      finishCookieFlush = resolve;
    }));
    const host = createHost();

    let disposed = false;
    const disposePromise = host.dispose().then(() => {
      disposed = true;
    });
    await new Promise<void>(resolve => { setImmediate(resolve); });

    expect(electronMocks.flushStorageData).toHaveBeenCalledOnce();
    expect(electronMocks.flushStore).toHaveBeenCalledOnce();
    expect(disposed).toBe(false);

    finishCookieFlush?.();
    await disposePromise;

    expect(disposed).toBe(true);
  });
});

describe('AgentBrowserHost desktop viewport zoom', () => {
  test('lays a narrow panel out at the desktop width', () => {
    // A 720px panel shows a 1440px CSS viewport at half scale.
    expect(resolveDesktopViewportZoomFactor(720)).toBe(0.5);
    expect(720 / resolveDesktopViewportZoomFactor(720)).toBe(1440);
    expect(700 / resolveDesktopViewportZoomFactor(700)).toBeCloseTo(1440, 6);
  });

  test('never zooms in past 1 on a panel wider than a desktop', () => {
    expect(resolveDesktopViewportZoomFactor(1440)).toBe(1);
    expect(resolveDesktopViewportZoomFactor(1441)).toBe(1);
    expect(resolveDesktopViewportZoomFactor(4000)).toBe(1);
  });

  test('falls back to 1 for a width that has not been measured yet', () => {
    expect(resolveDesktopViewportZoomFactor(0)).toBe(1);
    expect(resolveDesktopViewportZoomFactor(-10)).toBe(1);
    expect(resolveDesktopViewportZoomFactor(Number.NaN)).toBe(1);
    expect(resolveDesktopViewportZoomFactor(Number.POSITIVE_INFINITY)).toBe(1);
  });

  test('never asks Chromium for a zoom below its smallest step', () => {
    // The placeholder 1px panel the host starts with, and anything near it.
    expect(resolveDesktopViewportZoomFactor(1)).toBe(0.25);
    expect(resolveDesktopViewportZoomFactor(200)).toBe(0.25);
    expect(resolveDesktopViewportZoomFactor(360)).toBe(0.25);
    expect(resolveDesktopViewportZoomFactor(400)).toBeGreaterThan(0.25);
  });
});
