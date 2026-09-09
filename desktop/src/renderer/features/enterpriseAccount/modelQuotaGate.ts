import { ProviderName } from '@shared/providers/constants';

import type { EnterpriseQuotaReason } from '../../../shared/enterpriseAccount/constants';
import type { Model } from '../../store/slices/modelSlice';

type QuotaRelevantModel = Pick<Model, 'isServerModel' | 'providerKey'>;

export function usesSwenServerQuota(
  model: QuotaRelevantModel | null | undefined,
): boolean {
  return model?.isServerModel === true || model?.providerKey === ProviderName.SwenServer;
}

export function resolveBlockingEnterpriseQuotaReason(
  reason: EnterpriseQuotaReason | null,
  model: QuotaRelevantModel | null | undefined,
): EnterpriseQuotaReason | null {
  if (!reason) return null;
  if (!model) return reason;
  return usesSwenServerQuota(model) ? reason : null;
}
