/**
 * 集中管理所有业务 API 端点。
 * 后续新增的业务接口也应在此文件中配置。
 */

import { SERVER_API_BASE_URL } from '../../shared/server/constants';
import { configService } from './config';

export const isTestModeEnabled = () => {
  return configService.getConfig().app?.testMode === true;
};

// The update, skill-store and kit-store calls are all made from the main
// process (`src/main/libs/endpoints.ts`), which now builds them off our own
// server. The copies that used to sit here were never imported by the
// renderer and pointed at NetEase, so they are gone.

/**
 * The browser sign-in page. The main process appends `redirect_uri`, `state`
 * and `source` before opening it. Upstream asked NetEase for this url over a
 * round trip that could fail; ours is a fixed route on our own server, so it
 * is built here and the round trip is gone.
 */
export const getLoginUrl = () => `${SERVER_API_BASE_URL}/login`;

// The portal is NetEase's web front end and we have none of our own yet.
// Every url below is handed to `shell.openExternal`, so nothing is fetched
// unless a person clicks a growth surface — the ad slot, the credits float,
// the upgrade and pricing links — and those screens go with the Messages
// shell. They are left pointing where they point rather than at a page that
// does not exist; when our site exists, this is the one place to change.
const PORTAL_BASE_TEST = 'https://lobsterai.inner.youdao.com/portal#';
const PORTAL_BASE_PROD = 'https://lobsterai.youdao.com/portal#';

const getPortalBase = () => isTestModeEnabled() ? PORTAL_BASE_TEST : PORTAL_BASE_PROD;

export const PortalPricingKeyfrom = {
  HtmlShare: 'html_share',
  SiteDeployment: 'site_deployment',
} as const;

export type PortalPricingKeyfrom =
  (typeof PortalPricingKeyfrom)[keyof typeof PortalPricingKeyfrom];

export interface PortalPricingUrlOptions {
  traceId?: string;
}

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
  return `${getPortalBase()}/pricing${suffix}`;
};
export const getPortalProfileUrl = () => `${getPortalBase()}/profile`;
export const getPortalCreditsDetailUrl = () => `${getPortalBase()}/profile/detail`;
export const getPortalRechargeUrl = () => `${getPortalBase()}/`;
export const getPortalInvitationUrl = () => `${getPortalBase()}/invitation`;
export const getPortalCreditsResetActivityUrl = (campaignCode?: string) => (
  `${getPortalBase()}/profile?activity=credits_reset${campaignCode ? `&campaignCode=${encodeURIComponent(campaignCode)}` : ''}`
);

export const getEnterpriseMemberProfileUrl = (enterpriseId: number) => (
  `${getPortalBase()}/enterprise/profile/${encodeURIComponent(String(enterpriseId))}`
);

const getEnterpriseConsoleBaseUrl = (enterpriseId: number) => (
  `${getPortalBase()}/enterprise/console/${encodeURIComponent(String(enterpriseId))}`
);

export const getEnterpriseOverviewUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/overview`
);

export const getEnterpriseUsageUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/usage`
);

export const getEnterpriseBillingUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/billing`
);

export const getEnterpriseRechargeUrl = (enterpriseId: number) => (
  `${getEnterpriseConsoleBaseUrl(enterpriseId)}/recharge`
);
