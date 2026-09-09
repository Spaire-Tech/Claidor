import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

test('repair language application refreshes the splash hint without rewriting config', async () => {
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
  vi.stubGlobal('navigator', { language: 'fr-FR' });
  vi.doMock('./config', () => ({
    configService: {
      getConfig: vi.fn(),
      updateConfig: vi.fn(),
    },
  }));
  const { i18nService } = await import('./i18n');

  i18nService.setLanguage('en', { persist: false });

  expect(setItem).toHaveBeenCalledWith('swen-language', 'en');
});

test('a late older initialization cannot replace the newest locale result', async () => {
  let resolveFirstLocale: ((locale: string) => void) | undefined;
  const firstLocale = new Promise<string>((resolve) => { resolveFirstLocale = resolve; });
  const getSystemLocale = vi.fn()
    .mockImplementationOnce(() => firstLocale)
    .mockResolvedValueOnce('fr-FR');
  const updateConfig = vi.fn(async () => undefined);
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
  vi.stubGlobal('navigator', { language: 'fr-FR' });
  vi.stubGlobal('window', {
    electron: { appInfo: { getSystemLocale } },
  });
  vi.doMock('./config', () => ({
    configService: {
      getConfig: vi.fn(() => ({ language: 'zh', language_initialized: false })),
      updateConfig,
    },
  }));
  const { i18nService } = await import('./i18n');

  const olderInitialization = i18nService.initialize();
  await i18nService.initialize();
  resolveFirstLocale?.('en-US');
  await olderInitialization;

  // Swen is English-only: every locale lookup resolves to 'en', and only the
  // newest initialization may persist the result.
  expect(i18nService.getLanguage()).toBe('en');
  expect(updateConfig).toHaveBeenCalledTimes(1);
  expect(updateConfig).toHaveBeenCalledWith({
    language: 'en',
    language_initialized: true,
  });
  expect(setItem).toHaveBeenLastCalledWith('swen-language', 'en');
});

test('repair language wins over a locale lookup that completes late', async () => {
  let resolveLocale: ((locale: string) => void) | undefined;
  const locale = new Promise<string>((resolve) => { resolveLocale = resolve; });
  const updateConfig = vi.fn(async () => undefined);
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem });
  vi.stubGlobal('navigator', { language: 'fr-FR' });
  vi.stubGlobal('window', {
    electron: { appInfo: { getSystemLocale: vi.fn(() => locale) } },
  });
  vi.doMock('./config', () => ({
    configService: {
      getConfig: vi.fn(() => ({ language: 'zh', language_initialized: false })),
      updateConfig,
    },
  }));
  const { i18nService } = await import('./i18n');

  const pendingInitialization = i18nService.initialize();
  i18nService.setLanguage('en', { persist: false });
  resolveLocale?.('en-US');
  await pendingInitialization;

  expect(i18nService.getLanguage()).toBe('en');
  expect(updateConfig).not.toHaveBeenCalled();
  expect(setItem).toHaveBeenLastCalledWith('swen-language', 'en');
});
