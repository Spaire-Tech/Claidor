/**
 * When logs are shipped, and how many at a time.
 *
 * Logs leave in batches, one shipment every 15 seconds while the server
 * takes them. When it does not, the wait doubles with each failure in a row,
 * up to a minute, or up to five minutes when the server says it is being
 * asked too often. Every wait is stretched by a random part of up to a
 * quarter, so that many machines do not all come back at the same moment.
 */
import { getConnectRetryAfterMs, isRateLimitConnectError } from "../connect-errors.js";

export const LOG_SHIP_INTERVAL_MS = 15_000;
export const LOG_SHIP_MAX_BATCH_ENTRIES = 128;
export const LOG_SHIP_MAX_BATCH_BYTES = 256 * 1_024;
export const LOG_SHIP_FAILURE_MAX_BACKOFF_MS = 60_000;
export const LOG_SHIP_RATE_LIMIT_MAX_BACKOFF_MS = 5 * 60_000;
export const LOG_SHIP_JITTER_RATIO = 0.25;

/** How a shipment ended: taken by the server, with its receipt when it gave a usable one, or not, with the failure. */
export type LogShipResult =
  | { readonly delivered: true; readonly receipt?: { logsProcessed: number; logsDropped: number } }
  | { readonly delivered: false; readonly error: unknown };

/** The interval doubled once for each failure in a row, and no longer than `longestMs`. */
function doubledWaitMs(streak: number, longestMs: number): number {
  return Math.min(longestMs, LOG_SHIP_INTERVAL_MS * 2 ** Math.max(0, streak));
}

/**
 * The wait before the next shipment, in milliseconds.
 *
 * After a delivery it is the plain interval. After a failure it is the
 * doubled wait. After a rate limit it is the doubled wait with the higher
 * ceiling, or the wait the server asked for when that is longer, however
 * long. The random part is added last and the sum rounded.
 */
export function nextLogShipDelayMs(input: {
  readonly outcome: "shipped" | "failed" | "rate_limited";
  readonly streak: number;
  readonly retryAfterMs?: number;
  readonly random?: () => number;
}): number {
  const random = input.random ?? Math.random;
  let waitMs: number;
  switch (input.outcome) {
    case "shipped":
      waitMs = LOG_SHIP_INTERVAL_MS;
      break;
    case "failed":
      waitMs = doubledWaitMs(input.streak, LOG_SHIP_FAILURE_MAX_BACKOFF_MS);
      break;
    default:
      waitMs = Math.max(input.retryAfterMs ?? 0, doubledWaitMs(input.streak, LOG_SHIP_RATE_LIMIT_MAX_BACKOFF_MS));
  }
  return Math.round(waitMs + random() * waitMs * LOG_SHIP_JITTER_RATIO);
}

/**
 * Keeps the moment of the next shipment, from how the ones before it ended.
 *
 * It counts failures in a row and rate limits in a row apart: a failure of
 * one kind ends the run of the other, and a delivery ends both. While either
 * run is on, the schedule is "backing off" and nothing can hurry it.
 */
export class LogShipSchedule {
  /** No shipment before this moment. Zero until the first one is recorded: due at once. */
  private notBeforeMs = 0;
  private failuresInARow = 0;
  private rateLimitsInARow = 0;

  /**
   * Whether a shipment may go now. `eager` is for a caller with something
   * that should not wait out the interval: it is let through early, but
   * never while backing off.
   */
  isDue(eager: boolean, nowMs = Date.now()): boolean {
    if (nowMs >= this.notBeforeMs) {
      return true;
    }
    return eager && !this.isBackingOff();
  }

  /** Lets the next shipment go as soon as it is asked for. Does nothing while backing off. */
  shipNext(): void {
    if (this.isBackingOff()) {
      return;
    }
    this.notBeforeMs = 0;
  }

  /** Takes note of how a shipment ended and sets the wait before the next one. */
  record(result: LogShipResult, nowMs = Date.now()): void {
    if (result.delivered) {
      this.failuresInARow = 0;
      this.rateLimitsInARow = 0;
      this.notBeforeMs = nowMs + nextLogShipDelayMs({ outcome: "shipped", streak: 0 });
      return;
    }
    if (!isRateLimitConnectError(result.error)) {
      this.rateLimitsInARow = 0;
      this.failuresInARow += 1;
      this.notBeforeMs = nowMs + nextLogShipDelayMs({ outcome: "failed", streak: this.failuresInARow });
      return;
    }
    this.failuresInARow = 0;
    // The server's own wait is read before the rate limit is counted: when it cannot be read, the count stays as it was.
    const retryAfterMs = getConnectRetryAfterMs(result.error, nowMs);
    this.rateLimitsInARow += 1;
    this.notBeforeMs =
      nowMs +
      nextLogShipDelayMs({
        outcome: "rate_limited",
        streak: this.rateLimitsInARow,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
  }

  isBackingOff(): boolean {
    return this.failuresInARow + this.rateLimitsInARow > 0;
  }
}

/** What a waiting log entry must have for a batch to be measured. */
export interface LogShipBufferedEntry {
  readonly message: string;
  readonly metadata: Readonly<Record<string, string>>;
}

/** What an entry counts for against a batch's size: the characters of its message and of every label's name and value. */
function weightOf(entry: LogShipBufferedEntry): number {
  let weight = entry.message.length;
  for (const [name, value] of Object.entries(entry.metadata)) {
    weight += name.length + value.length;
  }
  return weight;
}

/**
 * Splits what waits into the next batch and the rest, in order.
 *
 * The batch ends before the 129th entry, or before the first entry that
 * would carry it past the size limit. The first entry always goes, whatever
 * its size: an entry too large for any batch would otherwise never leave.
 */
export function takeLogShipBatch<T extends LogShipBufferedEntry>(buffer: readonly T[]): { batch: T[]; remaining: T[] } {
  let weight = 0;
  const firstLeftBehind = buffer.findIndex((entry, position) => {
    if (position >= LOG_SHIP_MAX_BATCH_ENTRIES) {
      return true;
    }
    weight += weightOf(entry);
    return position > 0 && weight > LOG_SHIP_MAX_BATCH_BYTES;
  });
  const taken = firstLeftBehind === -1 ? buffer.length : firstLeftBehind;
  return { batch: buffer.slice(0, taken), remaining: buffer.slice(taken) };
}
