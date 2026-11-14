/**
 * How much a crash report may hold, given what the person chose about their
 * data.
 */

/** What a person chose about their data, by the numbers the server answers with. */
export enum PrivacyMode {
  UNSPECIFIED = 0,
  NO_STORAGE = 1,
  NO_TRAINING = 2,
  USAGE_DATA_TRAINING_ALLOWED = 3,
  USAGE_CODEBASE_TRAINING_ALLOWED = 4,
}

/**
 * What a crash report may hold: all of it, all of it with private parts
 * scrubbed out, or only the bare facts of a fatal crash.
 */
export type SandSentryPrivacyTier = "full" | "scrubbed" | "fatal-metadata";

/** The modes in which the person lets their data be used. Only under these is a report sent whole. */
const TRAINING_ALLOWED: ReadonlySet<PrivacyMode | undefined> = new Set([
  PrivacyMode.USAGE_DATA_TRAINING_ALLOWED,
  PrivacyMode.USAGE_CODEBASE_TRAINING_ALLOWED,
]);

/**
 * The tier for a mode. Whatever is not one of the three modes named here
 * gets the least: no mode at all, a mode this code does not know, the
 * unspecified one and the one that forbids storing.
 */
export function sandSentryPrivacyTierForMode(mode?: PrivacyMode): SandSentryPrivacyTier {
  if (TRAINING_ALLOWED.has(mode)) {
    return "full";
  }
  if (mode === PrivacyMode.NO_TRAINING) {
    return "scrubbed";
  }
  return "fatal-metadata";
}
