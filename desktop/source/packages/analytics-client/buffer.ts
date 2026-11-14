/**
 * The buffer that sends analytics events to the server in batches.
 *
 * An event waits here until a flush takes it: a little while after the first
 * event, at once when enough have gathered, or when the owner asks. A flush
 * first makes sure there is a token, then sends everything that waits in one
 * request. Events that could not be sent stay for the next flush, up to a
 * limit. Nothing here ever throws at the code that tracks an event because
 * the server could not be reached.
 */
import { AnalyticsEvent, TrackEventsRequest } from "../proto/generated/simeon/v1/analytics_pb.js";
import { toEventData, type AnalyticsEventProperties } from "./to-event-data.js";

/** How many waiting events start a flush at once, and how many are kept after a failed send. */
const USUAL_LIMIT = 200;
/** How long after an event the buffer flushes by itself. */
const USUAL_INTERVAL_MS = 3_000;
/** How long a flush the buffer started by itself may take. */
const USUAL_OWN_FLUSH_TIMEOUT_MS = 2_500;
/** What the token check answers when the flush ran out of time first. */
const OUT_OF_TIME = Symbol("out of time");

export interface AnalyticsBufferClient {
  trackEvents(request: TrackEventsRequest, options: { readonly signal: AbortSignal }): Promise<unknown>;
}

export interface AnalyticsBufferTokenProvider {
  getAccessToken(): Promise<string | null | undefined>;
}

export interface AnalyticsBufferOptions {
  readonly client: AnalyticsBufferClient;
  readonly tokenProvider: AnalyticsBufferTokenProvider;
  readonly bufferLimit?: number | undefined;
  readonly flushIntervalMs?: number | undefined;
  readonly normalFlushTimeoutMs?: number | undefined;
  readonly onDebug?: ((tag: string, payload: unknown) => void) | undefined;
}

export class AnalyticsBuffer {
  /** The events not yet taken by the server, oldest first. */
  private waiting: AnalyticsEvent[];
  /** The timer of the flush the buffer will start by itself, when one is set. */
  private intervalTimer: NodeJS.Timeout | null;
  /** The round of sending under way, and how many events it will have sent. Only one runs at a time. */
  private underWay: Promise<number> | null;
  private client: AnalyticsBufferClient;
  private tokenProvider: AnalyticsBufferTokenProvider;
  private limit: number;
  private intervalMs: number;
  private ownFlushTimeoutMs: number;
  private onDebug: (tag: string, payload: unknown) => void;

  constructor(options: AnalyticsBufferOptions) {
    this.waiting = [];
    this.intervalTimer = null;
    this.underWay = null;
    this.client = options.client;
    this.tokenProvider = options.tokenProvider;
    this.limit = options.bufferLimit ?? USUAL_LIMIT;
    this.intervalMs = options.flushIntervalMs ?? USUAL_INTERVAL_MS;
    this.ownFlushTimeoutMs = options.normalFlushTimeoutMs ?? USUAL_OWN_FLUSH_TIMEOUT_MS;
    this.onDebug = options.onDebug ?? (() => {});
  }

  /**
   * Keeps one event. Its time is the number given, or now. With the limit
   * reached a flush starts at once; below it, one is due after the interval.
   */
  track(eventName: string, props: AnalyticsEventProperties | null | undefined, timestamp?: number): void {
    const at = typeof timestamp === "number" ? BigInt(timestamp) : BigInt(Date.now());
    this.waiting.push(new AnalyticsEvent({ eventName, eventData: toEventData(props), timestamp: at }));
    if (this.waiting.length >= this.limit) {
      this.flushUnwatched();
    } else {
      this.flushAfterInterval();
    }
  }

  /**
   * Sends what waits, and resolves when there is nothing more this call can
   * do: the buffer is empty, or a round sent nothing. While another call's
   * round is under way this one waits for it, and then looks again.
   */
  async flush(timeoutMs: number): Promise<void> {
    while (true) {
      if (this.underWay) {
        await this.underWay;
      } else {
        if (this.waiting.length === 0) {
          return;
        }
        const round = this.sendOnce(timeoutMs);
        this.underWay = round;
        let sent: number;
        try {
          sent = await round;
        } finally {
          // A flush started from inside this round may have put its own round here: that one is left alone.
          if (this.underWay === round) {
            this.underWay = null;
          }
        }
        if (sent === 0) {
          return;
        }
      }
      // Events tracked meanwhile get a round of their own.
      if (this.waiting.length === 0) {
        return;
      }
    }
  }

  /**
   * One round: the token check, then one request with every waiting event.
   * Answers how many events the server took; none when there was no token or
   * the request failed. The whole round is given `timeoutMs`: after that the
   * token check is given up, and the request's signal is aborted.
   */
  private async sendOnce(timeoutMs: number): Promise<number> {
    const stop = new AbortController();
    const outOfTime = setTimeout(() => stop.abort(), timeoutMs);
    outOfTime.unref?.();
    try {
      // The listener is told inside this block, so one that throws is told once more, as a failed token check.
      try {
        const token = await this.tokenUnless(stop.signal);
        if (token === OUT_OF_TIME) {
          this.onDebug("analytics.flush.deferred", { reason: "token_check_timed_out", count: this.waiting.length });
          return 0;
        }
        if (!token) {
          this.onDebug("analytics.flush.deferred", { reason: "no_token", count: this.waiting.length });
          return 0;
        }
      } catch (error) {
        this.onDebug("analytics.flush.deferred", { reason: "token_check_failed", error, count: this.waiting.length });
        return 0;
      }

      const batch = this.waiting.slice();
      if (batch.length === 0) {
        // A round started from inside the token check has sent everything already.
        return 0;
      }
      try {
        await this.client.trackEvents(new TrackEventsRequest({ events: batch }), { signal: stop.signal });
        // Only the events of this batch go: others may have been tracked during the request.
        this.waiting.splice(0, batch.length);
        return batch.length;
      } catch (error) {
        this.onDebug("analytics.flush.error", { error });
        this.dropBeyondLimit();
        return 0;
      }
    } finally {
      clearTimeout(outOfTime);
    }
  }

  /** The provider's token, or `OUT_OF_TIME` when `signal` aborts before the provider answers. */
  private tokenUnless(signal: AbortSignal): Promise<string | null | undefined | typeof OUT_OF_TIME> {
    return Promise.race([
      this.tokenProvider.getAccessToken(),
      new Promise<typeof OUT_OF_TIME>((resolve) => {
        signal.addEventListener("abort", () => resolve(OUT_OF_TIME), { once: true });
      }),
    ]);
  }

  /** After a failed send: only the newest events, as many as the limit, are kept. */
  private dropBeyondLimit(): void {
    if (this.waiting.length > this.limit) {
      this.waiting.splice(0, this.waiting.length - this.limit);
    }
  }

  /** A flush nobody waits for. */
  private flushUnwatched(): void {
    void this.flush(this.ownFlushTimeoutMs);
  }

  /** Sets the timer for the buffer's own flush, unless one is already waiting. */
  private flushAfterInterval(): void {
    if (this.intervalTimer) {
      return;
    }
    this.intervalTimer = setTimeout(() => {
      this.intervalTimer = null;
      this.flushUnwatched();
    }, this.intervalMs);
    this.intervalTimer.unref?.();
  }
}
