import { ProviderName } from '@shared/providers/constants';
import { describe, expect, test } from 'vitest';

import { EnterpriseQuotaReason } from '../../../shared/enterpriseAccount/constants';
import {
  resolveBlockingEnterpriseQuotaReason,
  usesMatiesServerQuota,
} from './modelQuotaGate';

const quotaReason = EnterpriseQuotaReason.MemberMonthlyQuotaExhausted;

describe('usesMatiesServerQuota', () => {
  test('identifies server models by flag or provider key', () => {
    expect(usesMatiesServerQuota({
      providerKey: ProviderName.OpenAI,
      isServerModel: true,
    })).toBe(true);
    expect(usesMatiesServerQuota({
      providerKey: ProviderName.MatiesServer,
    })).toBe(true);
  });

  test('identifies a user-configured model as independent from server quota', () => {
    expect(usesMatiesServerQuota({
      providerKey: ProviderName.Qwen,
      isServerModel: false,
    })).toBe(false);
  });
});

describe('resolveBlockingEnterpriseQuotaReason', () => {
  test('keeps the quota gate for Maties server models', () => {
    expect(resolveBlockingEnterpriseQuotaReason(quotaReason, {
      providerKey: ProviderName.MatiesServer,
      isServerModel: true,
    })).toBe(quotaReason);
  });

  test('bypasses the quota gate for user-configured models', () => {
    expect(resolveBlockingEnterpriseQuotaReason(quotaReason, {
      providerKey: ProviderName.Qwen,
      isServerModel: false,
    })).toBeNull();
  });

  test('fails closed while model resolution is unavailable', () => {
    expect(resolveBlockingEnterpriseQuotaReason(quotaReason, null)).toBe(quotaReason);
  });

  test('does not gate any model when enterprise quota is available', () => {
    expect(resolveBlockingEnterpriseQuotaReason(null, {
      providerKey: ProviderName.MatiesServer,
      isServerModel: true,
    })).toBeNull();
  });
});
