/**
 * The short ways to wrap a value with its privacy labels: what kind of data
 * it is, the name of the field it sits in, and the mode or context it was
 * made under.
 */
import { DataClassification } from "./classification.js";
import type { PrivacyContext } from "./privacy-context.js";
import { PrivacyMode } from "./privacy-mode.js";
import { RedactedBytes, RedactedString } from "./types.js";

export function createRedactedString(
  value: string,
  classification: DataClassification,
  fieldName: string,
  modeOrContext: PrivacyMode | PrivacyContext,
): RedactedString {
  return new RedactedString(value, classification, fieldName, modeOrContext);
}

export function createRedactedBytes(
  value: Uint8Array,
  classification: DataClassification,
  fieldName: string,
  modeOrContext: PrivacyMode | PrivacyContext,
): RedactedBytes {
  return new RedactedBytes(value, classification, fieldName, modeOrContext);
}

/**
 * Text that holds nothing of the person's, for the places that expect a
 * redacted string: safe data, under the most open mode, so it is never
 * hidden and any purpose may read it.
 */
export function safeString(value: string): RedactedString {
  return new RedactedString(
    value,
    DataClassification.SAFE,
    "safe",
    PrivacyMode.USAGE_CODEBASE_TRAINING_ALLOWED,
  );
}
