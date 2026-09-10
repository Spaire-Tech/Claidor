export const MatiesRequestCapability = {
  OptionsV1: 'maties-options-v1',
} as const;

export type MatiesRequestCapability =
  typeof MatiesRequestCapability[keyof typeof MatiesRequestCapability];

export const MATIES_REQUEST_OPTIONS_FIELD = 'maties_options';
export const MATIES_REQUEST_OPTIONS_VERSION = 1;

const MATIES_REQUEST_CAPABILITY_VALUES = new Set<string>(
  Object.values(MatiesRequestCapability),
);

export const parseMatiesRequestCapabilities = (
  value: unknown,
): MatiesRequestCapability[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const result: MatiesRequestCapability[] = [];
  const seen = new Set<MatiesRequestCapability>();
  for (const candidate of value) {
    if (
      typeof candidate !== 'string'
      || !MATIES_REQUEST_CAPABILITY_VALUES.has(candidate)
    ) {
      continue;
    }
    const capability = candidate as MatiesRequestCapability;
    if (!seen.has(capability)) {
      seen.add(capability);
      result.push(capability);
    }
  }
  return result.length > 0 ? result : undefined;
};

export const supportsMatiesRequestOptionsV1 = (
  capabilities: readonly MatiesRequestCapability[] | undefined,
): boolean => capabilities?.includes(MatiesRequestCapability.OptionsV1) === true;
