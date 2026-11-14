/**
 * The context handed down every call of the engine. It says whether the work
 * was canceled and with what, carries the values and names of the calls
 * above, and makes new contexts from itself: one for a value, for a name,
 * for a cancel, for a time limit. A context is never changed once made.
 */

/** What a value is kept under in a context, and the value read where none was set. */
export interface ContextKey<T> {
  readonly symbol: symbol;
  readonly defaultValue: T;
}

export interface Context {
  /** Aborts when this context is canceled. */
  readonly signal: AbortSignal;
  readonly canceled: boolean;
  /** What it was canceled with. */
  readonly reason: unknown;
  /** Its own name only; `getPath` gives the names of all the contexts it was made from. */
  readonly name: string | undefined;
  get<T>(key: ContextKey<T>): T;
  with<T>(key: ContextKey<T>, value: T): Context;
  withCancel(): [Context, (reason?: unknown) => void];
  withTimeout(ms: number): Context;
  withDeadline(deadline: Date): Context;
  withTimeoutAndCancel(ms: number): [Context, (reason?: unknown) => void];
  withName(name: string): Context;
  withDetached(): Context;
  getParent(): Context | undefined;
  getPath(): string[];
}

export function createKey<T>(name: symbol, defaultValue: T): ContextKey<T> {
  return { symbol: name, defaultValue };
}

/** What a timeout or a deadline cancels with. */
const DEADLINE_EXCEEDED = "context deadline exceeded";

/**
 * A controller for a context that can be canceled on its own. It is aborted
 * with the signal above it and for the same reason: at once when that signal
 * already is, otherwise the day it comes to be. It listens for that once,
 * and goes on listening even after it was aborted by itself.
 */
function controllerUnder(above: AbortSignal): AbortController {
  const controller = new AbortController();
  const follow = (): void => controller.abort(above.reason);
  if (above.aborted) follow();
  else above.addEventListener("abort", follow, { once: true });
  return controller;
}

/** What a new context has of its own. The rest it takes from the one it is made from, or starts without. */
interface Own {
  readonly signal?: AbortSignal;
  readonly values?: ReadonlyMap<symbol, unknown>;
  readonly name?: string;
}

/**
 * The one kind of context there is. Its four fields are what is listed when
 * a context's keys are read or a context is printed, in this order, which is
 * why they keep the names they had.
 */
class ContextImpl implements Context {
  private readonly parent: Context | undefined;
  private readonly values: ReadonlyMap<symbol, unknown>;
  readonly name: string | undefined;
  readonly signal: AbortSignal;

  constructor(parent?: Context, own: Own = {}) {
    this.parent = parent;
    this.values = own.values ?? new Map();
    this.name = own.name;
    // With no signal of its own it shares the one above; the first context of all gets one that never aborts.
    this.signal = own.signal ?? parent?.signal ?? new AbortController().signal;
  }

  get canceled(): boolean {
    return this.signal.aborted;
  }

  get reason(): unknown {
    return this.signal.reason;
  }

  /**
   * The value set here, whatever it is. Otherwise the answer of the context
   * above, where an answer of null or undefined counts as no answer and
   * gives the key's default.
   */
  get<T>(key: ContextKey<T>): T {
    if (this.values.has(key.symbol)) return this.values.get(key.symbol) as T;
    return this.parent?.get(key) ?? key.defaultValue;
  }

  /** The values set one after the other travel together: each new context copies those of the one it is made from. */
  with<T>(key: ContextKey<T>, value: T): Context {
    return new ContextImpl(this, { values: new Map(this.values).set(key.symbol, value) });
  }

  withName(name: string): Context {
    return new ContextImpl(this, { name });
  }

  /** A context no cancel above reaches: its signal is a new one that nothing aborts. */
  withDetached(): Context {
    return new ContextImpl(this, { signal: new AbortController().signal });
  }

  withCancel(): [Context, (reason?: unknown) => void] {
    const controller = controllerUnder(this.signal);
    return [new ContextImpl(this, { signal: controller.signal }), (reason?: unknown) => controller.abort(reason)];
  }

  /**
   * Canceled when `ms` have passed. The timer is cleared as soon as the
   * context is canceled, by the time or from above. One made from a context
   * already canceled is never canceled again, so its timer stays until it
   * rings.
   */
  withTimeout(ms: number): Context {
    const controller = controllerUnder(this.signal);
    const timer = setTimeout(() => controller.abort(new Error(DEADLINE_EXCEEDED)), ms);
    controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    return new ContextImpl(this, { signal: controller.signal });
  }

  /** A timeout of the time left. With none left, or no real date, it is canceled from the start and no timer is asked for. */
  withDeadline(deadline: Date): Context {
    const left = deadline.getTime() - Date.now();
    if (left > 0) return this.withTimeout(left);
    const controller = controllerUnder(this.signal);
    controller.abort(new Error(DEADLINE_EXCEEDED));
    return new ContextImpl(this, { signal: controller.signal });
  }

  /** A cancel, and under it a timeout: the context given back is the timeout's. */
  withTimeoutAndCancel(ms: number): [Context, (reason?: unknown) => void] {
    const [cancelable, cancel] = this.withCancel();
    return [cancelable.withTimeout(ms), cancel];
  }

  getParent(): Context | undefined {
    return this.parent;
  }

  /** The names from the first context down to this one. A context with no name, or an empty one, adds nothing. */
  getPath(): string[] {
    const names: string[] = [];
    for (let context: Context | undefined = this; context !== undefined; context = context.getParent()) {
      if (context.name) names.push(context.name);
    }
    return names.reverse();
  }
}

export function createContext(): Context {
  return new ContextImpl();
}
