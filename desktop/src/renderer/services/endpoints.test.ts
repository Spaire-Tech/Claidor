import { afterEach, expect, test, vi } from 'vitest';

import { configService } from './config';
import {
  getEnterpriseBillingUrl,
  getEnterpriseMemberProfileUrl,
  getEnterpriseOverviewUrl,
  getEnterpriseRechargeUrl,
  getEnterpriseUsageUrl,
  getFallbackDownloadUrl,
  getPortalCreditsDetailUrl,
  getPortalCreditsResetActivityUrl,
  getPortalInvitationUrl,
  getPortalLoginUrl,
  getPortalPricingUrl,
  getPortalProfileUrl,
  getPortalRechargeUrl,
  PortalPricingKeyfrom,
} from './endpoints';

const mockTestMode = (testMode: boolean) => {
  vi.spyOn(configService, 'getConfig').mockReturnValue({
    app: { testMode },
  } as ReturnType<typeof configService.getConfig>);
};

afterEach(() => {
  vi.restoreAllMocks();
});

test('account urls open the Claidor web app when test mode is disabled', () => {
  mockTestMode(false);

  expect(getPortalLoginUrl()).toBe('https://app.claidor.com/login');
  expect(getFallbackDownloadUrl()).toBe('https://app.claidor.com/desktop');
  expect(getPortalProfileUrl()).toBe('https://app.claidor.com/');
  expect(getPortalCreditsDetailUrl()).toBe('https://app.claidor.com/');
  expect(getPortalRechargeUrl()).toBe('https://app.claidor.com/');
  expect(getPortalInvitationUrl()).toBe('https://app.claidor.com/');
  expect(getPortalCreditsResetActivityUrl()).toBe('https://app.claidor.com/');
  expect(getPortalCreditsResetActivityUrl('credits_final_reward_2026_07')).toBe(
    'https://app.claidor.com/?campaignCode=credits_final_reward_2026_07',
  );
});

test('account urls open the local web app when test mode is enabled', () => {
  mockTestMode(true);

  expect(getPortalLoginUrl()).toBe('http://127.0.0.1:3000/login');
  expect(getPortalProfileUrl()).toBe('http://127.0.0.1:3000/');
  expect(getPortalCreditsDetailUrl()).toBe('http://127.0.0.1:3000/');
  expect(getPortalRechargeUrl()).toBe('http://127.0.0.1:3000/');
  expect(getPortalInvitationUrl()).toBe('http://127.0.0.1:3000/');
  expect(getPortalCreditsResetActivityUrl()).toBe('http://127.0.0.1:3000/');
});

test('pricing url can include html share keyfrom', () => {
  mockTestMode(false);

  expect(getPortalPricingUrl()).toBe('https://app.claidor.com/');
  expect(getPortalPricingUrl(PortalPricingKeyfrom.HtmlShare)).toBe(
    'https://app.claidor.com/?keyfrom=html_share',
  );
});

test('pricing url can carry a publishing attribution trace', () => {
  mockTestMode(false);

  expect(getPortalPricingUrl(
    PortalPricingKeyfrom.SiteDeployment,
    { traceId: 'attempt-123' },
  )).toBe(
    'https://app.claidor.com/?keyfrom=site_deployment&trace_id=attempt-123',
  );
});

test('enterprise console urls all open the Claidor account area', () => {
  mockTestMode(false);

  expect(getEnterpriseMemberProfileUrl(1001)).toBe('https://app.claidor.com/');
  expect(getEnterpriseOverviewUrl(1001)).toBe('https://app.claidor.com/');
  expect(getEnterpriseUsageUrl(1001)).toBe('https://app.claidor.com/');
  expect(getEnterpriseBillingUrl(1001)).toBe('https://app.claidor.com/');
  expect(getEnterpriseRechargeUrl(1001)).toBe('https://app.claidor.com/');
});
