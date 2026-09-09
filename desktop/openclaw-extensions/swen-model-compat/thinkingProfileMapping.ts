import { SWEN_REQUEST_OPTIONS_VERSION } from './requestOptionsProtocol';

export const SwenThinkingLevel = {
  Off: 'off',
  Minimal: 'minimal',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  XHigh: 'xhigh',
  Max: 'max',
} as const;

export type SwenThinkingLevel =
  typeof SwenThinkingLevel[keyof typeof SwenThinkingLevel];

export const SwenOpenClawThinkingLevel = {
  Off: 'off',
  Minimal: 'minimal',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  XHigh: 'xhigh',
} as const;

export type SwenOpenClawThinkingLevel =
  typeof SwenOpenClawThinkingLevel[keyof typeof SwenOpenClawThinkingLevel];

export type SwenThinkingOption = {
  level: SwenThinkingLevel;
  openclawLevel: SwenOpenClawThinkingLevel;
};

export type SwenThinkingProfile = {
  options: SwenThinkingOption[];
  defaultLevel: SwenThinkingLevel;
  requestOptionsVersion?: typeof SWEN_REQUEST_OPTIONS_VERSION;
};

export type SwenThinkingProfileMap = Record<string, SwenThinkingProfile>;

export type SwenOpenClawThinkingProfile = {
  levels: Array<{ id: string; label: string }>;
  defaultLevel: string;
  preserveWhenCatalogReasoningFalse: true;
};

const LEVELS = new Set<string>(Object.values(SwenThinkingLevel));
const OPENCLAW_LEVELS = new Set<string>(Object.values(SwenOpenClawThinkingLevel));

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const isModelRef = (value: string): boolean => {
  const separatorIndex = value.indexOf('/');
  return separatorIndex > 0
    && separatorIndex < value.length - 1
    && !/\s/.test(value);
};

const parseThinkingProfile = (value: unknown): SwenThinkingProfile | undefined => {
  if (!isRecord(value) || !Array.isArray(value.options) || value.options.length === 0) {
    return undefined;
  }
  const options: SwenThinkingOption[] = [];
  const seenLevels = new Set<string>();
  const seenOpenClawLevels = new Set<string>();
  for (const rawOption of value.options) {
    if (!isRecord(rawOption)) {
      return undefined;
    }
    const { level, openclawLevel } = rawOption;
    if (
      typeof level !== 'string'
      || !LEVELS.has(level)
      || seenLevels.has(level)
      || typeof openclawLevel !== 'string'
      || !OPENCLAW_LEVELS.has(openclawLevel)
      || seenOpenClawLevels.has(openclawLevel)
      || (level === SwenThinkingLevel.Off)
        !== (openclawLevel === SwenOpenClawThinkingLevel.Off)
    ) {
      return undefined;
    }
    seenLevels.add(level);
    seenOpenClawLevels.add(openclawLevel);
    options.push({
      level: level as SwenThinkingLevel,
      openclawLevel: openclawLevel as SwenOpenClawThinkingLevel,
    });
  }
  if (options.length === 1 && options[0]?.level === SwenThinkingLevel.Off) {
    return undefined;
  }
  if (typeof value.defaultLevel !== 'string' || !seenLevels.has(value.defaultLevel)) {
    return undefined;
  }
  return {
    options,
    defaultLevel: value.defaultLevel as SwenThinkingLevel,
    ...(value.requestOptionsVersion === SWEN_REQUEST_OPTIONS_VERSION
      ? { requestOptionsVersion: SWEN_REQUEST_OPTIONS_VERSION }
      : {}),
  };
};

export const parseThinkingProfileMap = (value: unknown): SwenThinkingProfileMap => {
  if (!isRecord(value)) return {};
  const result: SwenThinkingProfileMap = {};
  for (const [modelRef, rawProfile] of Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right))) {
    const profile = parseThinkingProfile(rawProfile);
    if (isModelRef(modelRef) && profile) {
      result[modelRef] = profile;
    }
  }
  return result;
};

export const resolveOpenClawThinkingProfile = (
  profile: SwenThinkingProfile | undefined,
  hasKimiK3RuntimeProfile: boolean,
): SwenOpenClawThinkingProfile | undefined => {
  if (profile) {
    const defaultOpenClawLevel = profile.options.find(
      option => option.level === profile.defaultLevel,
    )?.openclawLevel;
    if (!defaultOpenClawLevel) return undefined;
    return {
      levels: profile.options.map(option => ({
        id: option.openclawLevel,
        label: option.level,
      })),
      defaultLevel: defaultOpenClawLevel,
      preserveWhenCatalogReasoningFalse: true,
    };
  }
  if (!hasKimiK3RuntimeProfile) return undefined;
  return {
    levels: [{ id: 'max', label: 'max' }],
    defaultLevel: 'max',
    preserveWhenCatalogReasoningFalse: true,
  };
};
