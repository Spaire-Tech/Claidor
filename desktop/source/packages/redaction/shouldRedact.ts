/**
 * What is hidden under a privacy mode, and what stands in its place when it
 * is shown: the field's name in square brackets.
 */
import { DataClassification, SENSITIVE_CLASSIFICATIONS } from "./classification.js";
import { resolveEnforceRedaction } from "./privacy-context.js";
import { PrivacyMode } from "./privacy-mode.js";

/** The modes under which the person lets their data be trained on. */
function allowsTraining(privacyMode: PrivacyMode): boolean {
  return (
    privacyMode === PrivacyMode.USAGE_DATA_TRAINING_ALLOWED ||
    privacyMode === PrivacyMode.USAGE_CODEBASE_TRAINING_ALLOWED
  );
}

/**
 * Whether data of this kind is to be hidden under this mode. Credentials and
 * unclassified data always are, safe data never is. Any other kind is hidden
 * when it is on the sensitive list and the mode does not allow training; a
 * mode nobody knows allows nothing.
 */
export function shouldRedact(
  privacyMode: PrivacyMode,
  classification: DataClassification,
): boolean {
  switch (classification) {
    case DataClassification.CREDENTIALS:
    case DataClassification.UNSPECIFIED:
      return true;
    case DataClassification.SAFE:
      return false;
    default:
      return SENSITIVE_CLASSIFICATIONS.includes(classification) && !allowsTraining(privacyMode);
  }
}

/** What is shown in place of a hidden field. */
export function formatRedacted(fieldName: string): string {
  return `[redacted:${fieldName}]`;
}

/**
 * What a field shows when it is written out without being unwrapped: its
 * real value, unless redaction is enforced and the field is one to hide.
 */
export function getRedactionAwareDisplayValue(options: {
  readonly privacyMode: PrivacyMode;
  readonly classification: DataClassification;
  readonly fieldName: string;
  readonly unredactedValue: string;
  readonly enforceRedaction?: boolean | undefined;
}): string {
  const { privacyMode, classification, fieldName, unredactedValue, enforceRedaction } = options;
  const hidden =
    resolveEnforceRedaction({ privacyMode, enforceRedaction }, classification) &&
    shouldRedact(privacyMode, classification);
  return hidden ? formatRedacted(fieldName) : unredactedValue;
}
