/**
 * What a person lets be done with their data, from the least to the most.
 * The numbers are the ones the server uses for the same modes
 * (`simeon.v1.PrivacyMode`), so they stay as they are.
 */
export const PrivacyMode = {
  /** Not known: handled as strictly as "no storage". */
  UNSPECIFIED: 0,
  /** Nothing of the person's is kept for any purpose. */
  NO_STORAGE: 1,
  /** Kept for use, never for training. */
  NO_TRAINING: 2,
  /** Training is allowed. This part treats this mode and the next alike. */
  USAGE_DATA_TRAINING_ALLOWED: 3,
  USAGE_CODEBASE_TRAINING_ALLOWED: 4,
} as const;

/** One of the numbers above. */
export type PrivacyMode = (typeof PrivacyMode)[keyof typeof PrivacyMode];
