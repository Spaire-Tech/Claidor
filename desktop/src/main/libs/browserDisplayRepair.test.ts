import { describe, expect, test } from 'vitest';

import {
  BrowserDisplayMode,
  normalizeBrowserWebAccessConfig,
} from '../../shared/browserWebAccess/constants';
import { repairBrowserDisplayMode } from './browserDisplayRepair';

describe('repairBrowserDisplayMode', () => {
  test('a stored "external" becomes in-app', () => {
    // This is the founder's machine. The old settings screen wrote it,
    // and no screen in this product offers the choice — so it is a
    // leftover, not a preference.
    const repair = repairBrowserDisplayMode({ displayMode: BrowserDisplayMode.External });
    expect(repair.changed).toBe(true);
    expect(repair.next?.displayMode).toBe(BrowserDisplayMode.InApp);
    expect(repair.reason).toContain('external');
  });

  test('a stored `headless: false` becomes in-app too', () => {
    // It used to resolve to external through an inference that is now
    // gone. Writing it down means the stored config says what the app
    // does rather than leaning on a default two files away.
    const repair = repairBrowserDisplayMode({ headless: false });
    expect(repair.changed).toBe(true);
    expect(repair.next?.displayMode).toBe(BrowserDisplayMode.InApp);
  });

  test('nothing stored is left alone — that is the default\'s job', () => {
    expect(repairBrowserDisplayMode(undefined)).toEqual({ changed: false, next: undefined });
  });

  test('an install already in-app is not rewritten', () => {
    const stored = { displayMode: BrowserDisplayMode.InApp };
    expect(repairBrowserDisplayMode(stored)).toEqual({ changed: false, next: stored });
  });

  test('an explicit in-app with `headless: false` is not rewritten either', () => {
    const stored = { displayMode: BrowserDisplayMode.InApp, headless: false };
    expect(repairBrowserDisplayMode(stored).changed).toBe(false);
  });

  test('nothing else in the stored config is touched', () => {
    const stored = {
      displayMode: BrowserDisplayMode.External,
      browserEnabled: false,
      allowedHostnames: ['example.com'],
      cdpUrl: 'ws://127.0.0.1:9222',
    };
    const { next } = repairBrowserDisplayMode(stored);
    expect(next).toMatchObject({
      browserEnabled: false,
      allowedHostnames: ['example.com'],
      cdpUrl: 'ws://127.0.0.1:9222',
    });
  });

  test('what it writes resolves to in-app, which is the whole point', () => {
    for (const stored of [
      { displayMode: BrowserDisplayMode.External },
      { headless: false },
      { displayMode: BrowserDisplayMode.External, headless: false },
    ]) {
      const { next } = repairBrowserDisplayMode(stored);
      expect(normalizeBrowserWebAccessConfig(next).displayMode).toBe(BrowserDisplayMode.InApp);
    }
  });

  test('running it twice changes nothing the second time', () => {
    const once = repairBrowserDisplayMode({ displayMode: BrowserDisplayMode.External });
    expect(repairBrowserDisplayMode(once.next).changed).toBe(false);
  });
});
