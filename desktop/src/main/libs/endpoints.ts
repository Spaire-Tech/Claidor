import { app } from 'electron';

import { HtmlSharePublicRoute } from '../../shared/htmlShare/constants';
import { SERVER_API_BASE_URL } from '../../shared/server/constants';
import type { SqliteStore } from '../sqliteStore';
import { resolveDevelopmentServerBaseUrl } from './developmentServerBaseUrl';

let cachedTestMode: boolean | null = null;
let loggedDevelopmentServerBaseUrl: string | null = null;

/**
 * Read testMode from store and cache it.
 * Call once at startup and again whenever app_config changes.
 */
export function refreshEndpointsTestMode(store: SqliteStore): void {
  const appConfig = store.get<any>('app_config');
  cachedTestMode = appConfig?.app?.testMode === true;
}

/**
 * Whether the app is in test mode.
 * Uses cached value after init; falls back to !app.isPackaged before init.
 */
export const isTestModeEnabled = (): boolean => {
  return cachedTestMode ?? !app.isPackaged;
};

/**
 * The server base, with a development override. There is no separate test
 * host yet, so testMode does not change it. See `shared/server/constants.ts`
 * for what hangs off it.
 */
export const getServerApiBaseUrl = (): string => {
  const defaultBaseUrl = SERVER_API_BASE_URL;
  const serverBaseUrl = resolveDevelopmentServerBaseUrl({
    defaultBaseUrl,
    developmentOverride: process.env.CAISRA_SERVER_BASE_URL,
    isDev: process.env.NODE_ENV === 'development',
    isPackaged: app.isPackaged,
  });
  if (serverBaseUrl !== defaultBaseUrl
      && loggedDevelopmentServerBaseUrl !== serverBaseUrl) {
    console.warn(
      `[Endpoints] routing all server traffic to development origin ${serverBaseUrl}`,
    );
    loggedDevelopmentServerBaseUrl = serverBaseUrl;
  }
  return serverBaseUrl;
};

export const getHtmlSharePublicBaseUrl = (): string => {
  return `${getServerApiBaseUrl()}${HtmlSharePublicRoute.Root}`;
};

export const getUpdateCheckUrl = (): string => (
  `${getServerApiBaseUrl()}/api/updates/check`
);

export const getManualUpdateCheckUrl = (): string => (
  `${getServerApiBaseUrl()}/api/updates/check-manual`
);

// The web pages below are NetEase's and we have none of our own yet. They are
// only ever handed to `shell.openExternal`, so nothing reaches them unless a
// person clicks a growth surface — the ad slot, the credits float, the upgrade
// and pricing links — and those screens go when the Messages shell lands. They
// are left here rather than pointed at a page that does not exist; when the
// site exists, this block is the one place to change.
export const getFallbackDownloadUrl = (): string => (
  isTestModeEnabled()
    ? 'https://lobsterai.inner.youdao.com/#/download-list'
    : 'https://lobsterai.youdao.com/#/download-list'
);

export const getSkillStoreUrl = (): string => (
  `${getServerApiBaseUrl()}/api/skill-store`
);

// Portal 页面
const PORTAL_BASE_TEST = 'https://lobsterai.inner.youdao.com/portal#';
const PORTAL_BASE_PROD = 'https://lobsterai.youdao.com/portal#';

const getPortalBase = (): string => isTestModeEnabled() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;

export const getPortalTasksUrl = (): string => `${getPortalBase()}/profile/detail?tab=tasks`;

export const getKitStoreUrl = (): string => (
  `${getServerApiBaseUrl()}/api/kit-store`
);
