/**
 * The error for a conversation whose stored data is gone: a blob it needs is
 * not in the store. The person is shown one sentence; the keys of the
 * missing blobs follow it in brackets for whoever reads the log.
 */

/** What the person is shown. */
const SENTENCE = "This conversation's data is missing and can't be restored. Start a new chat to continue.";
/** How many keys the message shows, and how many characters of each. */
const KEYS_SHOWN = 3;
const CHARACTERS_OF_A_KEY = 12;
/** How many errors, one the cause of the next, are looked at before the search gives up. */
const CAUSES_LOOKED_AT = 10;

/**
 * What follows the sentence: " (missing blob 0a1b2c3d4e5f)" for one key,
 * " (4 missing blobs: a, b, c, …)" for several, nothing when no key is known.
 */
function inBrackets(blobIdHexes: readonly string[]): string {
  const count = blobIdHexes.length;
  if (count === 0) return "";
  const shown = blobIdHexes.slice(0, KEYS_SHOWN).map((hex) => hex.slice(0, CHARACTERS_OF_A_KEY));
  if (count === 1) return ` (missing blob ${shown[0]})`;
  const andMore = count > shown.length ? ", …" : "";
  return ` (${count} missing blobs: ${shown.join(", ")}${andMore})`;
}

export class BlobNotFoundError extends Error {
  /** A flag the error has always carried. Nothing in the engine reads it today. */
  readonly isUsageError = true;
  /** What `findBlobNotFoundError` knows the error by when it was made by another copy of this class. */
  readonly isBlobNotFound = true;
  /** The keys of every missing blob, whole, as hex. */
  readonly blobIdHexes: string[];

  constructor(blobIdHexes: readonly string[], options?: { cause?: unknown }) {
    const message = `${SENTENCE}${inBrackets(blobIdHexes)}`;
    const cause = options?.cause;
    super(message, cause === undefined ? undefined : { cause });
    this.name = "BlobNotFoundError";
    this.blobIdHexes = [...blobIdHexes];
  }
}

/** Whether an error says that a blob is missing: by its class, by its flag, or by its name. */
function saysABlobIsMissing(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  if (error instanceof BlobNotFoundError) return true;
  return (error as Error & { isBlobNotFound?: boolean }).isBlobNotFound === true || error.name === "BlobNotFoundError";
}

/**
 * The first error that says a blob is missing, among an error and the causes
 * under it. An object that is no error is passed over, and its cause looked
 * at all the same.
 */
export function findBlobNotFoundError(error: unknown): Error | undefined {
  let current = error;
  for (let lookedAt = 0; lookedAt < CAUSES_LOOKED_AT; lookedAt += 1) {
    if (current === null || current === undefined) return undefined;
    if (saysABlobIsMissing(current)) return current;
    if (typeof current !== "object" || !("cause" in current)) return undefined;
    current = current.cause;
  }
  return undefined;
}
