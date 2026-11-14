/**
 * How the engine waits. Nothing in it sets a timer of its own: it asks a
 * clock, and a few named policies say what the waiting is for (a deadline
 * on a piece of work, another try after a failure, a poll, a debounce, a
 * watchdog on a stream that has gone quiet, a key that expires). The
 * machine's clock is `realClock`; a test hands in one that it moves itself.
 *
 * A policy checks its options when it is made, and reads its times and
 * counts from them again whenever it needs one: options changed afterwards
 * are followed.
 */

/** A deadline passed before the work was done. `code` is what callers and logs tell it by. */
export class DeadlineExceededError extends Error {
  readonly code = "deadline_exceeded";

  constructor(readonly policyName: string) {
    super(`Deadline exceeded for ${policyName}`);
    this.name = "DeadlineExceededError";
  }
}

export interface Clock {
  /** The time of day, in milliseconds. */
  now(): number;
  /** A time that only moves forward, for measuring how long something took. */
  monotonicNow(): number;
  /** Runs `callback` once, `delayMs` from now, unless the timer handed back is disposed first. */
  schedule(delayMs: number, callback: () => void): { dispose(): void };
}

/** A name that says something: empty or all blanks is refused. */
function requireName(name: string): void {
  if (name.trim().length === 0) throw new TypeError("name must not be empty");
}

/** The option called `key` must be a length of time in milliseconds: any finite number from zero up. */
function requireDuration<Key extends string>(options: Readonly<Record<Key, number>>, key: Key): void {
  if (!Number.isFinite(options[key]) || options[key] < 0) throw new RangeError(`${key} must be a finite non-negative number`);
}

/** The option called `key` must be a count that starts at one: a whole number, one or more. */
function requireCount<Key extends string>(options: Readonly<Record<Key, number>>, key: Key): void {
  if (!Number.isInteger(options[key]) || options[key] < 1) throw new RangeError(`${key} must be a positive integer`);
}

export const realClock: Clock = {
  now: () => Date.now(),
  monotonicNow: () => performance.now(),
  schedule(delayMs, callback) {
    requireDuration({ delayMs }, "delayMs");
    let spent = false;
    const timer = setTimeout(() => {
      if (spent) return;
      spent = true;
      callback();
    }, delayMs);
    // A timer of ours never keeps the process alive. Where a timer is a plain number there is nothing to unref.
    timer.unref?.();
    return {
      dispose() {
        if (spent) return;
        spent = true;
        clearTimeout(timer);
      },
    };
  },
};

/** Gives work a limited time: past it, the work's signal aborts and a `DeadlineExceededError` comes out. */
export interface DeadlinePolicy {
  readonly name: string;
  run<T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/** One timer for each key: when it runs out `onExpire` is called, and arming the key again starts it over. */
export interface ExpiryPolicy {
  readonly name: string;
  arm(key: string, onExpire: () => void): { dispose(): void };
}

/** Calls `tick` again and again, each time one interval after the tick before has finished. */
export interface PollingPolicy {
  readonly name: string;
  start(tick: () => Promise<void>, signal?: AbortSignal): { dispose(): void };
}

/** Tries work again after a failure, waiting longer before each new try. */
export interface RetryPolicy {
  readonly name: string;
  /** The wait before the try that follows try number `attempt`. */
  schedule(attempt: number, signal?: AbortSignal): { readonly elapsed: Promise<void>; dispose(): void };
  runWithRetry<T>(work: (attempt: number, signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/** Calls `onIdle` when nothing has kicked it for the idle time. */
export interface IdleWatchdogPolicy {
  readonly name: string;
  arm(onIdle: () => void): { kick(): void; dispose(): void };
}

/** Turns a burst of calls into one, made when the calls have stopped for the delay. */
export interface DebouncePolicy {
  readonly name: string;
  wrap<Args extends unknown[]>(fn: (...args: Args) => void): ((...args: Args) => void) & { dispose(): void };
}

/**
 * One timer at most. Starting it again drops the one that waits, then asks
 * how long to wait this time; when it runs it is forgotten first, so what
 * it calls may start it again.
 */
function restartableTimer(clock: Clock, delayMs: () => number) {
  let waiting: { dispose(): void } | undefined;
  return {
    restart(callback: () => void): void {
      waiting?.dispose();
      waiting = clock.schedule(delayMs(), () => {
        waiting = undefined;
        callback();
      });
    },
    drop(): void {
      waiting?.dispose();
      waiting = undefined;
    },
  };
}

export function createDebouncePolicy(clock: Clock, options: { name: string; delayMs: number }): DebouncePolicy {
  requireName(options.name);
  requireDuration(options, "delayMs");
  return {
    name: options.name,
    wrap<Args extends unknown[]>(fn: (...args: Args) => void) {
      const timer = restartableTimer(clock, () => options.delayMs);
      let disposed = false;
      const debounced = (...args: Args): void => {
        if (disposed) return;
        timer.restart(() => fn(...args));
      };
      const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        timer.drop();
      };
      return Object.assign(debounced, { dispose });
    },
  };
}

export function createRealDebouncePolicy(options: { name: string; delayMs: number }): DebouncePolicy {
  return createDebouncePolicy(realClock, options);
}

/** Why a signal aborted. One that kept no reason is given the runtime's own words for an abort. */
function whyAborted(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("This operation was aborted", "AbortError");
}

/**
 * Has `onAbort` called the first time the signal aborts, and hands back the
 * way to stop listening. With no signal there is nothing to listen to.
 */
function listenForAbort(signal: AbortSignal | undefined, onAbort: (aborted: AbortSignal) => void): () => void {
  if (signal == null) return () => {};
  const listener = () => onAbort(signal);
  signal.addEventListener("abort", listener, { once: true });
  return () => signal.removeEventListener("abort", listener);
}

/** What a wait is broken with when it is dropped by hand. */
function droppedWaitError(): Error {
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

/**
 * A wait on the clock as a promise: kept when the time has passed, broken
 * when the wait is dropped or its signal aborts, whichever comes first.
 */
function waitOn(clock: Clock, delayMs: number, signal?: AbortSignal) {
  const { promise: elapsed, resolve, reject } = Promise.withResolvers<void>();
  // A wait cut short with nobody listening is nobody's error.
  void elapsed.catch(() => {});
  let over = false;
  let stopListening = () => {};
  // The timer is set before the signal is looked at: a signal that has aborted already finds a timer to drop.
  const timer = clock.schedule(delayMs, () => {
    if (over) return;
    over = true;
    stopListening();
    resolve();
  });
  const cutShort = (reason: unknown): void => {
    if (over) return;
    over = true;
    timer.dispose();
    stopListening();
    reject(reason);
  };
  if (signal?.aborted) {
    cutShort(whyAborted(signal));
  } else {
    stopListening = listenForAbort(signal, (aborted) => cutShort(whyAborted(aborted)));
  }
  return { elapsed, dispose: () => cutShort(droppedWaitError()) };
}

export function createRetryPolicy(clock: Clock, options: {
  name: string;
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}): RetryPolicy {
  requireName(options.name);
  requireCount(options, "maxAttempts");
  requireDuration(options, "initialDelayMs");
  requireDuration(options, "maxDelayMs");
  if (options.maxDelayMs < options.initialDelayMs) throw new RangeError("maxDelayMs must be at least initialDelayMs");
  // The growth and the judge are the two options taken once, here.
  const backoffFactor = options.backoffFactor ?? 2;
  if (!Number.isFinite(backoffFactor) || backoffFactor < 1) throw new RangeError("backoffFactor must be a finite number at least 1");
  const shouldRetry = options.shouldRetry ?? (() => true);

  const policy: RetryPolicy = {
    name: options.name,
    schedule(attempt, signal) {
      requireCount({ attempt }, "attempt");
      // The factor, once for each try already made. Past what a number can hold it stops at the largest one, so that a first wait of zero stays zero.
      const growth = Math.min(backoffFactor ** (attempt - 1), Number.MAX_VALUE);
      return waitOn(clock, Math.min(options.maxDelayMs, options.initialDelayMs * growth), signal);
    },
    async runWithRetry<T>(work: (attempt: number, signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
      // Work always gets a signal: the caller's, or one that never aborts.
      const workSignal = signal ?? new AbortController().signal;
      const givenUp = Promise.withResolvers<never>();
      const stopListening = listenForAbort(signal, (aborted) => givenUp.reject(whyAborted(aborted)));
      try {
        let attempt = 0;
        while (true) {
          attempt += 1;
          if (signal?.aborted) throw whyAborted(signal);
          try {
            return await Promise.race([work(attempt, workSignal), givenUp.promise]);
          } catch (error) {
            // A caller who has given up is told so, whatever the work failed with.
            if (signal?.aborted) throw whyAborted(signal);
            if (attempt >= options.maxAttempts || !shouldRetry(error, attempt)) throw error;
            // The wait is asked of the policy itself, so a `schedule` put on it later is the one used.
            const wait = policy.schedule(attempt, signal);
            try {
              await wait.elapsed;
            } finally {
              wait.dispose();
            }
          }
        }
      } finally {
        stopListening();
      }
    },
  };
  return policy;
}

export function createRealRetryPolicy(options: Parameters<typeof createRetryPolicy>[1]): RetryPolicy {
  return createRetryPolicy(realClock, options);
}

export function createIdleWatchdogPolicy(clock: Clock, options: { name: string; idleMs: number }): IdleWatchdogPolicy {
  requireName(options.name);
  requireDuration(options, "idleMs");
  return {
    name: options.name,
    arm(onIdle) {
      const timer = restartableTimer(clock, () => options.idleMs);
      let disposed = false;
      timer.restart(onIdle);
      return {
        kick() {
          if (!disposed) timer.restart(onIdle);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          timer.drop();
        },
      };
    },
  };
}

export function createRealIdleWatchdogPolicy(options: { name: string; idleMs: number }): IdleWatchdogPolicy {
  return createIdleWatchdogPolicy(realClock, options);
}

export function createPollingPolicy(clock: Clock, options: { name: string; intervalMs: number }): PollingPolicy {
  requireName(options.name);
  requireDuration(options, "intervalMs");
  if (options.intervalMs === 0) throw new RangeError("intervalMs must be greater than 0");
  return {
    name: options.name,
    start(tick, signal) {
      let stopped = false;
      let nextRound: { dispose(): void } | undefined;
      let stopListening = () => {};
      const dispose = (): void => {
        if (stopped) return;
        stopped = true;
        nextRound?.dispose();
        nextRound = undefined;
        stopListening();
      };
      /** One tick, then the timer for the next. A tick that fails, at once or later, ends the polling without a word. */
      const round = (): void => {
        nextRound = undefined;
        if (stopped) return;
        let ticking: Promise<void>;
        try {
          ticking = tick();
        } catch {
          dispose();
          return;
        }
        void ticking.then(
          () => {
            if (!stopped) nextRound = clock.schedule(options.intervalMs, round);
          },
          () => dispose(),
        );
      };
      const polling = { dispose };
      if (signal?.aborted) {
        dispose();
        return polling;
      }
      stopListening = listenForAbort(signal, dispose);
      round();
      return polling;
    },
  };
}

export function createRealPollingPolicy(options: { name: string; intervalMs: number }): PollingPolicy {
  return createPollingPolicy(realClock, options);
}

export function createExpiryPolicy(clock: Clock, options: { name: string; ttlMs: number }): ExpiryPolicy {
  requireName(options.name);
  requireDuration(options, "ttlMs");
  /** The timer that runs for each key. */
  const timerByKey = new Map<string, { dispose(): void }>();
  return {
    name: options.name,
    arm(key, onExpire) {
      timerByKey.get(key)?.dispose();
      const timer = clock.schedule(options.ttlMs, () => {
        timerByKey.delete(key);
        onExpire();
      });
      timerByKey.set(key, timer);
      return {
        /** Does nothing once the key has been armed again or has expired: the timer is no longer this one's. */
        dispose() {
          if (timerByKey.get(key) !== timer) return;
          timerByKey.delete(key);
          timer.dispose();
        },
      };
    },
  };
}

export function createRealExpiryPolicy(options: { name: string; ttlMs: number }): ExpiryPolicy {
  return createExpiryPolicy(realClock, options);
}

export function createDeadlinePolicy(clock: Clock, options: { name: string; timeoutMs: number }): DeadlinePolicy {
  if (options.name.length === 0) throw new RangeError("name must be non-empty");
  requireDuration(options, "timeoutMs");
  return {
    name: options.name,
    async run<T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (signal?.aborted) throw whyAborted(signal);
      // The work's own signal aborts when the time is up or when the caller gives up, with the same error as comes out.
      const controller = new AbortController();
      const timedOut = Promise.withResolvers<never>();
      const givenUp = Promise.withResolvers<never>();
      const stopListening = listenForAbort(signal, (aborted) => {
        const reason = whyAborted(aborted);
        givenUp.reject(reason);
        controller.abort(reason);
      });
      const timer = clock.schedule(options.timeoutMs, () => {
        const error = new DeadlineExceededError(options.name);
        timedOut.reject(error);
        controller.abort(error);
      });
      try {
        return await Promise.race([work(controller.signal), timedOut.promise, givenUp.promise]);
      } finally {
        timer.dispose();
        stopListening();
      }
    },
  };
}
