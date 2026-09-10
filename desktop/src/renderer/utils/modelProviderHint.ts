import { ProviderName } from '@shared/providers';

import { ProviderIconId } from '../providers/uiRegistry';
import type { Model } from '../store/slices/modelSlice';
import { matchesOpenClawModelRef } from './openclawModelRef';

/**
 * Which provider mark a model carries (docs/maties/design.md, section 2:
 * « the model's logo shows »). A model on the Maties plan has no provider
 * of its own, so the mark comes from its name; a user's model keeps its
 * provider's mark.
 */
export const MODEL_ICON_PROVIDER_HINTS: Array<{ pattern: RegExp; providerName: ProviderName | ProviderIconId }> = [
  { pattern: /doubao/i, providerName: ProviderIconId.Doubao },
  { pattern: /deepseek/i, providerName: ProviderName.DeepSeek },
  { pattern: /minimax/i, providerName: ProviderName.Minimax },
  { pattern: /kimi|moonshot/i, providerName: ProviderName.Moonshot },
  { pattern: /glm|zhipu/i, providerName: ProviderName.Zhipu },
  { pattern: /qwen|qwq|qvq/i, providerName: ProviderName.Qwen },
  { pattern: /claude|anthropic/i, providerName: ProviderName.Anthropic },
  { pattern: /gemini/i, providerName: ProviderName.Gemini },
  { pattern: /gpt|openai/i, providerName: ProviderName.OpenAI },
  { pattern: /hy3|youdao/i, providerName: ProviderName.Youdaozhiyun },
];

export const resolveModelIconProviderKey = (model: Pick<Model, 'id' | 'name' | 'providerKey'>): string => {
  const providerKey = model.providerKey?.trim();
  if (providerKey && providerKey !== ProviderName.MatiesServer) return providerKey;

  const searchableText = `${model.name} ${model.id}`;
  return MODEL_ICON_PROVIDER_HINTS.find(({ pattern }) => pattern.test(searchableText))?.providerName
    ?? providerKey
    ?? '';
};

/** The provider mark for a bare model reference (« anthropic/claude-sonnet-5 »), with no model record. */
export const resolveProviderKeyForModelRef = (modelRef: string): string => {
  const trimmed = modelRef.trim();
  if (!trimmed) return '';
  return MODEL_ICON_PROVIDER_HINTS.find(({ pattern }) => pattern.test(trimmed))?.providerName ?? '';
};

/**
 * Human name for a model reference as stored on a turn: the model record's
 * name when the app has it, otherwise the reference tidied (« claude-sonnet-5 »
 * becomes « Claude Sonnet 5 »).
 */
export const getModelDisplayName = (modelRef: string, models: Model[]): string => {
  const trimmed = modelRef.trim();
  if (!trimmed) return '';
  const match = models.find((model) => matchesOpenClawModelRef(trimmed, model));
  if (match?.name) return match.name;
  const bare = trimmed.includes('/') ? (trimmed.split('/').pop() || trimmed) : trimmed;
  return bare
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
};
