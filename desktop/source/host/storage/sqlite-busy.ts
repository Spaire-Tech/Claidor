/**
 * Telling SQLite's failures apart, and trying again when a database is only
 * locked. A failure is known by the result code its error carries
 * (`errcode`) and, because not every error carries one, by SQLite's own
 * words in the message as well.
 */
import { setTimeout as sleepFor } from "node:timers/promises";

// SQLite's primary result codes, by its own numbers.
export const SQLITE_BUSY = 5;
export const SQLITE_LOCKED = 6;
export const SQLITE_IOERR = 10;
export const SQLITE_CORRUPT = 11;
export const SQLITE_CANTOPEN = 14;
export const SQLITE_NOTADB = 26;

/** What SQLite says of a lock: on the file, on a table, on the schema. */
const LOCK_WORDS = ["database is locked", "database table is locked", "database schema is locked"] as const;
/** What SQLite says of a read or a write the disk refused or cut short. */
const DISK_WORDS = ["disk i/o error", "short read"] as const;
/** What SQLite says of a file it could not open. */
const OPEN_WORDS = ["unable to open database"] as const;
/** What SQLite says of a file whose content it cannot make sense of. */
const DAMAGE_WORDS = ["malformed", "is not a database", "database disk image"] as const;

const DEFAULT_TRIES = 5;
const DEFAULT_FIRST_WAIT_MS = 100;

/** The result code on an error, when it carries one that is a number. */
function resultCode(error: Error): number | undefined {
  const { errcode } = error as Error & { errcode?: unknown };
  return typeof errcode === "number" ? errcode : undefined;
}

/**
 * The kind of failure in a result code: its low byte. An extended code says
 * more in the bytes above (266 is a read that failed, 10 with 1 above it).
 */
function primaryCode(error: Error): number | undefined {
  const code = resultCode(error);
  return code === undefined ? undefined : code & 0xff;
}

/** Whether the error's message holds one of the phrases, whatever its letter case. */
function says(error: Error, phrases: readonly string[]): boolean {
  const words = error.message.toLowerCase();
  return phrases.some((phrase) => words.includes(phrase));
}

export function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // The whole code is compared here, not its low byte: an extended code such as 261 is not taken for a lock.
  const code = resultCode(error);
  if (code === SQLITE_BUSY || code === SQLITE_LOCKED) return true;
  return says(error, LOCK_WORDS);
}

export function isSqliteIoError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return primaryCode(error) === SQLITE_IOERR || says(error, DISK_WORDS);
}

export function isSqliteCantOpenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return primaryCode(error) === SQLITE_CANTOPEN || says(error, OPEN_WORDS);
}

export function isSqliteCorruptError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const kind = primaryCode(error);
  // The message is read whatever the code says, so an error whose message is not a text fails here even with a
  // damaged database's code. The three questions above answer by the code alone in that case.
  const worded = says(error, DAMAGE_WORDS);
  return kind === SQLITE_CORRUPT || kind === SQLITE_NOTADB || worded;
}

/** The wait used when the caller brings none: the clock's. */
async function onTheClock(ms: number): Promise<void> {
  await sleepFor(ms);
}

/**
 * Runs `operation`, and runs it again while it fails because the database
 * is locked: five tries unless told, with a wait before each new try that
 * starts at 100 ms and doubles. Any other failure is thrown at once. When
 * every try found the database locked, the last of those failures is thrown.
 */
export async function retrySqliteBusy<T>(
  operation: () => Promise<T> | T,
  options: { attempts?: number; baseDelayMs?: number; delay?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const tries = Math.max(1, options.attempts ?? DEFAULT_TRIES);
  const firstWait = options.baseDelayMs ?? DEFAULT_FIRST_WAIT_MS;
  const wait = options.delay ?? onTheClock;
  let lastLock: unknown;
  for (let made = 0; made < tries; made += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteBusyError(error)) throw error;
      lastLock = error;
    }
    // No wait after the last try: there is nothing left to wait for.
    if (made < tries - 1) await wait(firstWait * 2 ** made);
  }
  throw lastLock;
}
