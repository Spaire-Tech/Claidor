import { MATIES_REQUEST_OPTIONS_VERSION } from './requestOptionsProtocol';

export const MatiesThinkingLevel = {
  Off: 'off',
  Minimal: 'minimal',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  XHigh: 'xhigh',
  Max: 'max',
} as const;

export type MatiesThinkingLevel =
  typeof MatiesThinkingLevel[keyof typeof MatiesThinkingLevel];

export const MatiesOpenClawThinkingLevel = {
  Off: 'off',
  Minimal: 'minimal',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  XHigh: 'xhigh',
} as const;

export type MatiesOpenClawThinkingLevel =
  typeof MatiesOpenClawThinkingLevel[keyof typeof MatiesOpenClawThinkingLevel];

export type MatiesThinkingOption = {
  level: MatiesThinkingLevel;
  openclawLevel: MatiesOpenClawThinkingLevel;
};

export type MatiesThinkingProfile = {
  options: MatiesThinkingOption[];
  defaultLevel: MatiesThinkingLevel;
  requestOptionsVersion?: typeof MATIES_REQUEST_OPTIONS_VERSION;
};

export type MatiesThinkingProfileMap = Record<string, MatiesThinkingProfile>;

export type MatiesOpenClawThinkingProfile = {
  levels: Array<{ id: string; label: string }>;
  defaultLevel: string;
  preserveWhenCatalogReasoningFalse: true;
};

const LEVELS = new Set<string>(Object.values(MatiesThinkingLevel));
const OPENCLAW_LEVELS = new Set<string>(Object.values(MatiesOpenClawThinkingLevel));

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const isModelRef = (value: string): boolean => {
  const separatorIndex = value.indexOf('/');
  return separatorIndex > 0
    && separatorIndex < value.length - 1
    && !/\s/.test(value);
};

const parseThinkingProfile = (value: unknown): MatiesThinkingProfile | undefined => {
  if (!isRecord(value) || !Array.isArray(value.options) || value.options.length === 0) {
    return undefined;
  }
  const options: MatiesThinkingOption[] = [];
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
      || (level === MatiesThinkingLevel.Off)
        !== (openclawLevel === MatiesOpenClawThinkingLevel.Off)
    ) {
      return undefined;
    }
    seenLevels.add(level);
    seenOpenClawLevels.add(openclawLevel);
    options.push({
      level: level as MatiesThinkingLevel,
      openclawLevel: openclawLevel as MatiesOpenClawThinkingLevel,
    });
  }
  if (options.length === 1 && options[0]?.level === MatiesThinkingLevel.Off) {
    return undefined;
  }
  if (typeof value.defaultLevel !== 'string' || !seenLevels.has(value.defaultLevel)) {
    return undefined;
  }
  return {
    options,
    defaultLevel: value.defaultLevel as MatiesThinkingLevel,
    ...(value.requestOptionsVersion === MATIES_REQUEST_OPTIONS_VERSION
      ? { requestOptionsVersion: MATIES_REQUEST_OPTIONS_VERSION }
      : {}),
  };
};

export const parseThinkingProfileMap = (value: unknown): MatiesThinkingProfileMap => {
  if (!isRecord(value)) return {};
  const result: MatiesThinkingProfileMap = {};
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
  profile: MatiesThinkingProfile | undefined,
  hasKimiK3RuntimeProfile: boolean,
): MatiesOpenClawThinkingProfile | undefined => {
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
