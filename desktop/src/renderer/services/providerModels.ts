import { ProviderAuthType, ProviderName, ProviderRegistry } from '@shared/providers';

import type { AppConfig } from '../config';
import { getProviderDisplayName } from '../config';
import type { Model } from '../store/slices/modelSlice';

/**
 * The models an enabled provider key puts on the list.
 *
 * This was written inline in `App.tsx`, where it ran once per init pass.
 * Settings now changes which providers are enabled while the app is
 * running — somebody pasting their own OpenAI key expects the agent to be
 * on it before the next restart — so the mapping is here, used by both,
 * rather than copied.
 *
 * Server models are not built here. They come from the account and the
 * slice keeps them alongside these (`setAvailableModels` preserves
 * anything marked `isServerModel`).
 */
export function providerModelsFromConfig(
  providers: AppConfig['providers'],
  log?: (label: string) => void,
): Model[] {
  const models: Model[] = [];
  if (!providers) return models;

  for (const [providerName, providerConfig] of Object.entries(providers)) {
    if (!providerConfig?.enabled || !providerConfig.models) continue;
    const openClawProviderId = ProviderRegistry.getOpenClawProviderIdForConfig(
      providerName,
      providerConfig,
    );
    if (
      providerName === ProviderName.Minimax
      && providerConfig.authType === ProviderAuthType.OAuth
    ) {
      log?.('MiniMax OAuth provider resolved to OpenClaw minimax-portal');
    }
    for (const model of providerConfig.models) {
      models.push({
        id: model.id,
        name: model.name,
        provider: getProviderDisplayName(providerName, providerConfig),
        providerKey: providerName,
        openClawProviderId,
        supportsImage: model.supportsImage ?? false,
      });
    }
  }
  return models;
}
