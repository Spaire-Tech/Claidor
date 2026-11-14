/**
 * Filters for what a failure may say about itself in its labels.
 *
 * A label is counted and searched for, so its value has to come from a short
 * known list, or at least have a shape nothing private fits in. Each filter
 * here turns anything else into one fixed word, or into nothing.
 */

/**
 * A filter for one closed list of words. A word of the list passes as it is,
 * any other becomes `fallback`, and no word stays no word. The list is copied
 * when the filter is made, so changing it afterwards changes nothing.
 */
export function brandedEnumOf<const Values extends readonly string[], const Fallback extends string>(
  values: Values,
  fallback: Fallback,
): (value: string | undefined) => Values[number] | Fallback | undefined {
  const listed: ReadonlySet<string> = new Set<string>(values);
  const isListed = (word: string): word is Values[number] => listed.has(word);
  return (value) => {
    if (value === undefined) {
      return undefined;
    }
    return isListed(value) ? value : fallback;
  };
}

/** Tells the type checker that a word is one fixed word. The word comes back as it was given. */
export function brandLiteralEnum<const Value extends string>(value: Value): Value {
  return value;
}

/** What an id looks like: 1 to 128 letters, digits, and . _ : | - */
const ID_SHAPE = /^[A-Za-z0-9._:|-]{1,128}$/;

/** The id when it looks like one, nothing otherwise: an address, a path or a sentence is no id. */
export function brandedId(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return ID_SHAPE.test(value) ? value : undefined;
}

/** The system's own names for a failed call that may go out as a label, in a fixed order. */
export const SAND_ERRNO_TAGS = [
  // A connection refused, cut or timed out.
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  // The network or the host out of reach.
  "ENETRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EHOSTDOWN",
  // A name that could not be looked up.
  "EAI_AGAIN",
  "ENOTFOUND",
  // An address taken, or a permission missing.
  "EADDRINUSE",
  "EACCES",
  "EPERM",
  // Files and disks.
  "ENOENT",
  "ENOSPC",
  "EDQUOT",
  "EROFS",
  "EBUSY",
  "EMFILE",
  "EIO",
] as const;

/** The word any other system name goes out as. */
export const SAND_ERRNO_FALLBACK = "E_OTHER" as const;

/** A system name as it may go out: itself when listed above, the fallback when not, nothing when there is none. */
export const brandedErrno = brandedEnumOf(SAND_ERRNO_TAGS, SAND_ERRNO_FALLBACK);
