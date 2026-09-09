/**
 * Web addresses the renderer opens in the browser.
 *
 * Swen lives on Claidor's two hosts and nowhere else: the API
 * (api.claidor.com, account protocol under /desktop) and the web app
 * (app.claidor.com, where people sign in and manage their account). The
 * main process holds the API addresses (src/main/libs/endpoints.ts); this
 * file only holds the pages the app opens for the person.
 */

import { configService } from './config';

export const isTestModeEnabled = () => {
  return configService.getConfig().app?.testMode === true;
};

const CLAIDOR_APP_BASE_URL = 'https://app.claidor.com';
const CLAIDOR_DEV_APP_BASE_URL = 'http://127.0.0.1:3000';

const getPortalBase = () => (isTestModeEnabled() ? CLAIDOR_DEV_APP_BASE_URL : CLAIDOR_APP_BASE_URL);

/** Where a person can download Swen. */
export const getFallbackDownloadUrl = () => `${getPortalBase()}/desktop`;

export const PortalPricingKeyfrom = {
  HtmlShare: 'html_share',
  SiteDeployment: 'site_deployment',
} as const;

export type PortalPricingKeyfrom =
  (typeof PortalPricingKeyfrom)[keyof typeof PortalPricingKeyfrom];

export interface PortalPricingUrlOptions {
  traceId?: string;
}

// Claidor's web app has one account area today. Every account link below
// opens it; the query parameters are kept so the web app can route later.
export const getPortalLoginUrl = () => `${getPortalBase()}/login`;
export const getPortalPricingUrl = (
  keyfrom?: PortalPricingKeyfrom,
  options: PortalPricingUrlOptions = {},
) => {
  const query = new URLSearchParams();
  if (keyfrom) query.set('keyfrom', keyfrom);
  if (options.traceId) query.set('trace_id', options.traceId);
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : '';
  return `${getPortalBase()}/${suffix}`;
};
export const getPortalProfileUrl = () => `${getPortalBase()}/`;
export const getPortalCreditsDetailUrl = () => `${getPortalBase()}/`;
export const getPortalRechargeUrl = () => `${getPortalBase()}/`;
export const getPortalInvitationUrl = () => `${getPortalBase()}/`;
export const getPortalCreditsResetActivityUrl = (campaignCode?: string) => (
  `${getPortalBase()}/${campaignCode ? `?campaignCode=${encodeURIComponent(campaignCode)}` : ''}`
);

export const getEnterpriseMemberProfileUrl = (_enterpriseId: number) => `${getPortalBase()}/`;

export const getEnterpriseOverviewUrl = (_enterpriseId: number) => `${getPortalBase()}/`;

export const getEnterpriseUsageUrl = (_enterpriseId: number) => `${getPortalBase()}/`;

export const getEnterpriseBillingUrl = (_enterpriseId: number) => `${getPortalBase()}/`;

export const getEnterpriseRechargeUrl = (_enterpriseId: number) => `${getPortalBase()}/`;
