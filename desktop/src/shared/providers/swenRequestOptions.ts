export const SwenRequestCapability = {
  OptionsV1: 'swen-options-v1',
} as const;

export type SwenRequestCapability =
  typeof SwenRequestCapability[keyof typeof SwenRequestCapability];

export const SWEN_REQUEST_OPTIONS_FIELD = 'swen_options';
export const SWEN_REQUEST_OPTIONS_VERSION = 1;

const SWEN_REQUEST_CAPABILITY_VALUES = new Set<string>(
  Object.values(SwenRequestCapability),
);

export const parseSwenRequestCapabilities = (
  value: unknown,
): SwenRequestCapability[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const result: SwenRequestCapability[] = [];
  const seen = new Set<SwenRequestCapability>();
  for (const candidate of value) {
    if (
      typeof candidate !== 'string'
      || !SWEN_REQUEST_CAPABILITY_VALUES.has(candidate)
    ) {
      continue;
    }
    const capability = candidate as SwenRequestCapability;
    if (!seen.has(capability)) {
      seen.add(capability);
      result.push(capability);
    }
  }
  return result.length > 0 ? result : undefined;
};

export const supportsSwenRequestOptionsV1 = (
  capabilities: readonly SwenRequestCapability[] | undefined,
): boolean => capabilities?.includes(SwenRequestCapability.OptionsV1) === true;
