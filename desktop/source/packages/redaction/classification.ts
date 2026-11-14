/**
 * The kinds of data the agents handle, the purposes data is asked for, and
 * the rule that says whether a purpose is allowed for a kind of data under a
 * person's privacy mode.
 */
import { PrivacyMode } from "./privacy-mode.js";

/** What a piece of data is, as far as privacy goes. */
export enum DataClassification {
  /** Allowed for any purpose, never hidden. */
  SAFE = "safe",
  /** The person's code and words: everything in a conversation is held as this. */
  CODE = "code",
  /** Allowed for nothing but the always-allowed purpose, hidden under every mode. */
  CREDENTIALS = "credentials",
  /** Where things are: paths, working folders, addresses of repositories, branch names. */
  PATH = "path",
  /** Treated like a path. Nothing in the engine classifies anything as this today. */
  PROVIDER_INFO = "provider_info",
  /** Not classified: treated like credentials. */
  UNSPECIFIED = "unspecified",
}

/**
 * The kinds that can be hidden at all. The list is read each time something
 * asks whether to hide (`shouldRedact`), so a kind taken out of it stops
 * being hidden from then on.
 */
export const SENSITIVE_CLASSIFICATIONS = [
  DataClassification.CODE,
  DataClassification.CREDENTIALS,
  DataClassification.PATH,
  DataClassification.PROVIDER_INFO,
  DataClassification.UNSPECIFIED,
];

/** What data is asked for. */
export enum PrivacyCapability {
  STORAGE_FOR_TRAINING = "storage_for_training",
  STORAGE_FOR_LOGGING = "storage_for_logging",
  STORAGE_FOR_USAGE = "storage_for_usage",
  /** The caller answers for it: allowed whatever the data and the mode. */
  UNSAFE_ALWAYS_ALLOWED = "unsafe_always_allowed",
}

/** The purposes that keep data somewhere: the ones a privacy mode has a say on. */
type StoragePurpose =
  | PrivacyCapability.STORAGE_FOR_TRAINING
  | PrivacyCapability.STORAGE_FOR_LOGGING
  | PrivacyCapability.STORAGE_FOR_USAGE;

const STORAGE_PURPOSES: readonly PrivacyCapability[] = [
  PrivacyCapability.STORAGE_FOR_TRAINING,
  PrivacyCapability.STORAGE_FOR_LOGGING,
  PrivacyCapability.STORAGE_FOR_USAGE,
];

function isStoragePurpose(purpose: PrivacyCapability): purpose is StoragePurpose {
  return STORAGE_PURPOSES.includes(purpose);
}

/**
 * Under "no training", data is kept for use and never for training, and of
 * what is not safe the logs may hold only paths and provider information,
 * never code.
 */
function allowedWithoutTraining(purpose: StoragePurpose, classification: DataClassification): boolean {
  switch (purpose) {
    case PrivacyCapability.STORAGE_FOR_TRAINING:
      return false;
    case PrivacyCapability.STORAGE_FOR_LOGGING:
      return classification === DataClassification.PATH || classification === DataClassification.PROVIDER_INFO;
    case PrivacyCapability.STORAGE_FOR_USAGE:
      return true;
  }
}

/**
 * Whether data of this kind may be used for this purpose under this mode.
 *
 * The kind of data and the always-allowed purpose are looked at first, and
 * settle the answer whatever the rest is: safe data is allowed for anything,
 * credentials and unclassified data for nothing else. Only then are the
 * purpose and the mode checked, in that order, and one nobody knows is an
 * error that names it.
 */
export function allowedPurpose(
  privacyMode: PrivacyMode,
  purpose: PrivacyCapability,
  classification: DataClassification,
): boolean {
  if (classification === DataClassification.SAFE || purpose === PrivacyCapability.UNSAFE_ALWAYS_ALLOWED) {
    return true;
  }
  if (classification === DataClassification.CREDENTIALS || classification === DataClassification.UNSPECIFIED) {
    return false;
  }
  if (!isStoragePurpose(purpose)) {
    throw new Error(`Unknown purpose: ${purpose}`);
  }
  switch (privacyMode) {
    case PrivacyMode.UNSPECIFIED:
    case PrivacyMode.NO_STORAGE:
      return false;
    case PrivacyMode.NO_TRAINING:
      return allowedWithoutTraining(purpose, classification);
    case PrivacyMode.USAGE_DATA_TRAINING_ALLOWED:
    case PrivacyMode.USAGE_CODEBASE_TRAINING_ALLOWED:
      return true;
    default:
      throw new Error(`Unknown privacy mode: ${privacyMode}`);
  }
}
