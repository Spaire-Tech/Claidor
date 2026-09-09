import { app } from 'electron';

import { HtmlSharePublicRoute } from '../../shared/htmlShare/constants';
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
 * Claidor's web app and API. Swen lives on these two hosts and nowhere else:
 * the API serves the account protocol under `/desktop`
 * (`server/polar/desktop`), the web app is where people sign in.
 */
const CLAIDOR_API_BASE_URL = 'https://api.claidor.com';
const CLAIDOR_APP_BASE_URL = 'https://app.claidor.com';
const CLAIDOR_DEV_API_BASE_URL = 'http://127.0.0.1:8000';
const CLAIDOR_DEV_APP_BASE_URL = 'http://127.0.0.1:3000';

const getClaidorApiBaseUrl = (): string => (
  isTestModeEnabled() ? CLAIDOR_DEV_API_BASE_URL : CLAIDOR_API_BASE_URL
);

const getClaidorAppBaseUrl = (): string => (
  isTestModeEnabled() ? CLAIDOR_DEV_APP_BASE_URL : CLAIDOR_APP_BASE_URL
);

/**
 * Server API base URL — switches based on testMode.
 * Used for auth exchange/refresh, models, proxy, etc.
 */
export const getServerApiBaseUrl = (): string => {
  // The override is a bare loopback origin; the account protocol always
  // lives under /desktop on whichever Claidor API answers.
  const defaultOrigin = getClaidorApiBaseUrl();
  const origin = resolveDevelopmentServerBaseUrl({
    defaultBaseUrl: defaultOrigin,
    developmentOverride: process.env.SWEN_SERVER_BASE_URL,
    isDev: process.env.NODE_ENV === 'development',
    isPackaged: app.isPackaged,
  });
  if (origin !== defaultOrigin && loggedDevelopmentServerBaseUrl !== origin) {
    console.warn(
      `[Endpoints] routing all Swen server traffic to development origin ${origin}`,
    );
    loggedDevelopmentServerBaseUrl = origin;
  }
  return `${origin}/desktop`;
};

export const getHtmlSharePublicBaseUrl = (): string => {
  return `${getServerApiBaseUrl()}${HtmlSharePublicRoute.Root}`;
};

// Updates, the skill store and the kit store are answered by Claidor's API
// under the same /desktop namespace. Until Claidor publishes releases and
// catalogues they answer « nothing new » and « empty », never an error.
export const getUpdateCheckUrl = (): string => `${getServerApiBaseUrl()}/api/updates/check`;

export const getManualUpdateCheckUrl = (): string => `${getServerApiBaseUrl()}/api/updates/check-manual`;

export const getFallbackDownloadUrl = (): string => `${getClaidorAppBaseUrl()}/desktop`;

export const getSkillStoreUrl = (): string => `${getServerApiBaseUrl()}/api/skill-store`;

// The web app's home for the signed-in person.
export const getPortalTasksUrl = (): string => `${getClaidorAppBaseUrl()}/`;

export const getKitStoreUrl = (): string => `${getServerApiBaseUrl()}/api/kit-store`;

export const getMcpMarketplaceUrl = (): string => `${getServerApiBaseUrl()}/api/mcp-marketplace`;
