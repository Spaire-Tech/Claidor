import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { ProviderName } from '@shared/providers/constants';
import type { ModelRuntimeProfile } from '@shared/providers/modelRuntimeProfiles';
import type { ModelThinkingConfig } from '@shared/providers/modelThinking';
import type { SwenRequestCapability } from '@shared/providers/swenRequestOptions';

import { defaultConfig, getProviderDisplayName } from '../../config';
import { resolveOpenClawModelRef } from '../../utils/openclawModelRef';

export interface Model {
  id: string;
  name: string;
  provider?: string; // Provider the model belongs to
  providerKey?: string; // Key of the provider the model belongs to (unique identifier)
  openClawProviderId?: string; // OpenClaw runtime provider id
  runtimeProfile?: ModelRuntimeProfile; // Controlled runtime compatibility profile
  supportsImage?: boolean;
  supportsVideo?: boolean;
  supportsThinking?: boolean;
  thinkingConfig?: ModelThinkingConfig;
  requestCapabilities?: SwenRequestCapability[];
  supportsToolCalling?: boolean;
  agenticReady?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  isServerModel?: boolean; // Whether this is a server-side plan model
  serverApiFormat?: string; // API format of the server model ("openai" | "anthropic")
  explicitContextCache?: boolean; // Whether server-side explicit context caching is supported
  description?: string; // Short description of the model's capabilities
  costMultiplier?: number; // Credit consumption multiplier (1.0 = standard)
  moreModel?: boolean; // Whether to collapse into the "More models" group
  accessible?: boolean; // false = model is visible but the user cannot use it (greyed out)
  restrictionHint?: string; // Restriction hint (e.g. "Available with a subscription plan / booster pack")
}

function isServerModelIdentity(model: Pick<Model, 'providerKey' | 'isServerModel'>): boolean {
  return model.isServerModel === true || model.providerKey === ProviderName.SwenServer;
}

export function getModelIdentityKey(model: Pick<Model, 'id' | 'providerKey' | 'isServerModel'>): string {
  return `${model.providerKey ?? ''}::${model.id}`;
}

export function isSameModelIdentity(
  modelA: Pick<Model, 'id' | 'providerKey' | 'isServerModel'>,
  modelB: Pick<Model, 'id' | 'providerKey' | 'isServerModel'>
): boolean {
  if (modelA.id !== modelB.id) {
    return false;
  }
  if (isServerModelIdentity(modelA) !== isServerModelIdentity(modelB)) {
    return false;
  }
  if (modelA.providerKey && modelB.providerKey) {
    return modelA.providerKey === modelB.providerKey;
  }
  // Backwards compatibility: fall back to id matching when providerKey is missing
  return true;
}

function isModelAccessible(model: Model | undefined): model is Model {
  return !!model && model.accessible !== false;
}

function selectPreferredAccessibleModel(
  allAvailableModels: Model[],
  currentModel: Model,
): Model {
  const matchedModel = allAvailableModels.find(m => isSameModelIdentity(m, currentModel));
  if (isModelAccessible(matchedModel)) {
    return matchedModel;
  }
  return allAvailableModels.find(isModelAccessible) ?? matchedModel ?? allAvailableModels[0] ?? currentModel;
}

// Build the initial list of available models from the providers configuration
function buildInitialModels(): Model[] {
  const models: Model[] = [];
  if (defaultConfig.providers) {
    Object.entries(defaultConfig.providers).forEach(([providerName, config]) => {
      if (config.enabled && config.models) {
        config.models.forEach(model => {
          models.push({
            id: model.id,
            name: model.name,
            provider: getProviderDisplayName(providerName, config),
            providerKey: providerName,
            supportsImage: model.supportsImage ?? false,
          });
        });
      }
    });
  }
  return models.length > 0 ? models : defaultConfig.model.availableModels;
}

// Initial list of available models (updated at runtime)
export let availableModels: Model[] = buildInitialModels();
const defaultModelProvider = defaultConfig.model.defaultModelProvider;

interface ModelState {
  defaultSelectedModel: Model;
  selectedModelByAgent: Record<string, Model>;
  availableModels: Model[];
}

/**
 * Resolve the effective selected model for a given agent.
 *
 * Resolution chain:
 *   1. Per-agent user override from selectedModelByAgent map
 *   2. Agent's configured model string (resolved via resolveOpenClawModelRef)
 *   3. App-level defaultSelectedModel
 */
export function selectAgentSelectedModel(
  modelState: ModelState,
  agentId: string,
  agentModelRef: string,
): Model {
  const override = modelState.selectedModelByAgent[agentId];
  const trimmed = agentModelRef.trim();
  if (trimmed) {
    const resolved = resolveOpenClawModelRef(trimmed, modelState.availableModels);
    if (resolved && isModelAccessible(resolved)) {
      if (!isModelAccessible(override)) return resolved;
      return isSameModelIdentity(override, resolved) ? override : resolved;
    }
  }
  if (isModelAccessible(override)) return override;
  if (isModelAccessible(modelState.defaultSelectedModel)) {
    return modelState.defaultSelectedModel;
  }
  return modelState.availableModels.find(isModelAccessible) ?? modelState.defaultSelectedModel;
}

/**
 * Re-match each per-agent selected model against the current available models.
 * Removes entries that no longer match any available model.
 */
function syncSelectedModelByAgent(
  selectedModelByAgent: Record<string, Model>,
  allAvailableModels: Model[],
): void {
  for (const agentId of Object.keys(selectedModelByAgent)) {
    const agentModel = selectedModelByAgent[agentId];
    const matched = allAvailableModels.find(m => isSameModelIdentity(m, agentModel));
    if (isModelAccessible(matched)) {
      selectedModelByAgent[agentId] = matched;
    } else {
      delete selectedModelByAgent[agentId];
    }
  }
}

const initialState: ModelState = {
  // Use the default model from config
  defaultSelectedModel: availableModels.find(
    model => model.id === defaultConfig.model.defaultModel
      && (!defaultModelProvider || model.providerKey === defaultModelProvider)
  ) || availableModels[0],
  selectedModelByAgent: {},
  availableModels: availableModels,
};

const modelSlice = createSlice({
  name: 'model',
  initialState,
  reducers: {
    setSelectedModel: (state, action: PayloadAction<{ agentId: string; model: Model }>) => {
      if (action.payload.model.accessible === false) return;
      state.selectedModelByAgent[action.payload.agentId] = action.payload.model;
    },
    setDefaultSelectedModel: (state, action: PayloadAction<Model>) => {
      if (action.payload.accessible === false) return;
      state.defaultSelectedModel = action.payload;
    },
    clearAgentSelectedModel: (state, action: PayloadAction<string>) => {
      delete state.selectedModelByAgent[action.payload];
    },
    setAvailableModels: (state, action: PayloadAction<Model[]>) => {
      // Keep existing server models and only update user-configured models (mirror of setServerModels)
      const serverModels = state.availableModels.filter(m => m.isServerModel);
      state.availableModels = [...serverModels, ...action.payload];
      // Update the exported availableModels
      availableModels = state.availableModels;
      // Sync defaultSelectedModel
      if (state.availableModels.length > 0) {
        state.defaultSelectedModel = selectPreferredAccessibleModel(
          state.availableModels,
          state.defaultSelectedModel,
        );
      }
      // Sync the per-agent selected models
      syncSelectedModelByAgent(state.selectedModelByAgent, state.availableModels);
    },
    setServerModels: (state, action: PayloadAction<Model[]>) => {
      // Server models go first, user-configured models stay after them
      const userModels = state.availableModels.filter(m => !m.isServerModel);
      state.availableModels = [...action.payload, ...userModels];
      availableModels = state.availableModels;
      // Sync defaultSelectedModel (prefer an accessible model)
      if (state.availableModels.length > 0) {
        state.defaultSelectedModel = selectPreferredAccessibleModel(
          state.availableModels,
          state.defaultSelectedModel,
        );
      }
      // Sync the per-agent selected models
      syncSelectedModelByAgent(state.selectedModelByAgent, state.availableModels);
    },
    clearServerModels: (state) => {
      state.availableModels = state.availableModels.filter(m => !m.isServerModel);
      availableModels = state.availableModels;
      // If defaultSelectedModel is a server model, switch to the first available model
      if (state.defaultSelectedModel.isServerModel && state.availableModels.length > 0) {
        state.defaultSelectedModel = state.availableModels.find(isModelAccessible)
          ?? state.defaultSelectedModel;
      }
      // Sync the per-agent selected models
      syncSelectedModelByAgent(state.selectedModelByAgent, state.availableModels);
    },
  },
});

export const {
  setSelectedModel,
  setDefaultSelectedModel,
  clearAgentSelectedModel,
  setAvailableModels,
  setServerModels,
  clearServerModels,
} = modelSlice.actions;
export default modelSlice.reducer;
