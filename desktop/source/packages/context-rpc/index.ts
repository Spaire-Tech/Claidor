/**
 * A service client that takes the caller's context into every call. Each
 * method takes the context before its own arguments. Around the call a client
 * span is opened and closed; the span's place in its trace travels in the
 * headers; the context's cancel signal can stop the call; and the context
 * itself rides in the call's context values, where a transport or an
 * interceptor finds it.
 */
import type { ServiceType } from "@bufbuild/protobuf";
import {
  createClient,
  createContextKey,
  createContextValues,
  type CallOptions,
  type Client,
  type Transport,
} from "@connectrpc/connect";
import { SpanKind, SpanStatusCode, type Span } from "@opentelemetry/api";
import type { Context } from "../context/core.js";
import { getSpan, withSpan } from "../context/otel.js";

/** The service's client, each method taking the caller's context first. */
export type ContextPropagatingClient<Service extends ServiceType> = {
  [Name in keyof Client<Service>]: Client<Service>[Name] extends (
    ...args: infer Args
  ) => infer Answer
    ? (ctx: Context, ...args: Args) => Answer
    : Client<Service>[Name];
};

export interface ContextPropagationOptions {
  /** Send the span's trace in the headers. Read once, when the client is made; on unless it counts as no. */
  readonly injectTraceHeaders?: boolean;
  /** More headers, made from the call's context. Read once, when the client is made. */
  readonly extractHeaders?: (ctx: Context) => HeadersInit | undefined;
  /** Stop the call when the context is cancelled. Read at every call; only `true` itself turns it on. */
  readonly enableAbortSignal?: boolean;
}

/** Where the call's context is kept among the call's context values. */
const callerContextKey = createContextKey<Context | undefined>(undefined, {
  description: "sand.callerContext",
});

/** What the span is told when a failure is not an Error and so has no message of its own. */
const CALL_FAILED = "RPC call failed";
const STREAM_FAILED = "Stream failed";

/**
 * How one call is closed: its span is told how the call went and is ended,
 * then the listening on the signals stops. A context that holds no span
 * closes its calls without one.
 */
interface CallEnding {
  /** Stops the listening on the signals. Set once they are joined: a call that fails before that has nothing to stop. */
  release: (() => void) | undefined;
  ok(): void;
  /** `unnamed` is the message for something thrown that is not an Error. */
  failed(thrown: unknown, unnamed: string): void;
}

function endingOf(span: Span | undefined): CallEnding {
  const ending: CallEnding = {
    release: undefined,
    ok() {
      span?.setStatus({ code: SpanStatusCode.OK });
      span?.end();
      ending.release?.();
    },
    failed(thrown, unnamed) {
      span?.recordException(thrown instanceof Error ? thrown : new Error(String(thrown)));
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: thrown instanceof Error ? thrown.message : unnamed,
      });
      span?.end();
      ending.release?.();
    },
  };
  return ending;
}

/** An answer that is read item by item, as a server stream's is. */
function isStream(answer: unknown): answer is AsyncIterable<unknown> {
  return typeof answer === "object" && answer !== null && Symbol.asyncIterator in answer;
}

/** An answer that comes later, as a unary call's is. */
function comesLater(answer: unknown): answer is PromiseLike<unknown> {
  return typeof answer === "object"
    && answer !== null
    && "then" in answer
    && typeof answer.then === "function";
}

/**
 * A stream whose reading closes the call. The call stays open for as long as
 * the stream is read: it closes when the stream is done, when it fails, or
 * when the reader stops early or throws. Every reading of the stream closes
 * the call once of its own.
 */
function closingWith<T>(iterable: AsyncIterable<T>, ending: CallEnding): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = iterable[Symbol.asyncIterator]();
      let open = true;
      /** A reading that ends with nothing thrown, or with something that counts as nothing, ended well. */
      const close = (thrown?: unknown): void => {
        if (!open) return;
        open = false;
        if (thrown) {
          ending.failed(thrown, STREAM_FAILED);
        } else {
          ending.ok();
        }
      };
      return {
        async next() {
          try {
            const step = await iterator.next();
            if (step.done) close();
            return step;
          } catch (thrown) {
            close(thrown);
            throw thrown;
          }
        },
        // A stream that cannot be told to stop is simply left; the reader is answered that it is over.
        async return(value?: T) {
          close();
          if (iterator.return) return await iterator.return(value);
          return { done: true, value: undefined };
        },
        // A stream that cannot take the reader's error gives it back to the reader.
        async throw(thrown?: unknown) {
          close(thrown);
          if (iterator.throw) return await iterator.throw(thrown);
          throw thrown;
        },
      };
    },
  };
}

/**
 * The span's place in its trace as the headers that carry it: `traceparent`,
 * the same again as `backend-traceparent`, and `tracestate` when the span has
 * one. A span that cannot say where it is sends none. A failure on the way
 * is not the call's: the headers written before it stay, and the call goes on.
 */
function traceHeadersOf(callCtx: Context): Headers {
  const headers = new Headers();
  try {
    const place = getSpan(callCtx)?.spanContext?.();
    if (!place?.traceId || !place.spanId) return headers;
    const flags = place.traceFlags ?? 0;
    const parent = `00-${place.traceId}-${place.spanId}-${flags.toString(16).padStart(2, "0")}`;
    headers.set("traceparent", parent);
    headers.set("backend-traceparent", parent);
    if (place.traceState) {
      // Not every trace state can write itself out; one that cannot is turned to text as it is.
      const state = place.traceState as typeof place.traceState & { serialize?: () => string };
      headers.set("tracestate", typeof state.serialize === "function" ? state.serialize() : String(state));
    }
  } catch {}
  return headers;
}

/**
 * Several sets of headers as one, a later set's header taking the place of
 * an earlier one's of the same name. A set that is not a `Headers` is read
 * as an object of names and values, a list of pairs included.
 */
function layered(...sources: (HeadersInit | undefined)[]): Headers {
  const all = new Headers();
  for (const source of sources) {
    if (!source) continue;
    if (source instanceof Headers) {
      source.forEach((value, name) => all.set(name, value));
      continue;
    }
    for (const [name, value] of Object.entries(source)) {
      all.set(name, value as string);
    }
  }
  return all;
}

/** The signal a call goes out with, and how to stop listening to the signals it was made from. */
interface CallSignal {
  readonly signal: AbortSignal | undefined;
  readonly release?: () => void;
}

/**
 * One signal for a call that must stop for the context and for the caller.
 * When the caller gave no signal, or the context's own, the context's signal
 * is enough. Otherwise a third signal follows both and takes the reason of
 * whichever fires first, the context's when both had fired already.
 */
function joinSignals(ctxSignal: AbortSignal, providedSignal: AbortSignal | undefined): CallSignal {
  if (providedSignal === undefined || providedSignal === ctxSignal) return { signal: ctxSignal };
  const both = new AbortController();
  const stopForContext = (): void => both.abort(ctxSignal.reason);
  const stopForCaller = (): void => both.abort(providedSignal.reason);
  ctxSignal.addEventListener("abort", stopForContext, { once: true });
  providedSignal.addEventListener("abort", stopForCaller, { once: true });
  if (ctxSignal.aborted) {
    stopForContext();
  } else if (providedSignal.aborted) {
    stopForCaller();
  }
  return {
    signal: both.signal,
    release() {
      ctxSignal.removeEventListener("abort", stopForContext);
      providedSignal.removeEventListener("abort", stopForCaller);
    },
  };
}

/** The client with every function it holds, its methods and what any object inherits, taking the context first. */
function carrying<Service extends ServiceType>(
  client: Client<Service>,
  options: ContextPropagationOptions,
): ContextPropagatingClient<Service> {
  const { injectTraceHeaders = true, extractHeaders } = options;

  /** What the context adds to a call's headers: the trace, then the caller's own function's headers over it. */
  const headersOf = (callCtx: Context): Headers | undefined => {
    const trace = injectTraceHeaders ? traceHeadersOf(callCtx) : undefined;
    const own = extractHeaders ? extractHeaders(callCtx) : undefined;
    return own ? layered(trace, own) : trace;
  };

  return new Proxy(client, {
    get(bare, name) {
      const original: unknown = Reflect.get(bare, name);
      if (typeof original !== "function") return original;
      const method = String(name);
      return (ctx: Context, input: unknown, callOptions: CallOptions = {}) => {
        const callCtx = withSpan(ctx.withName(`rpc.${method}`), {
          kind: SpanKind.CLIENT,
          attributes: { "rpc.method": method, "rpc.system": "connect" },
        });
        const ending = endingOf(getSpan(callCtx));
        try {
          // The context's headers go over the caller's, and are made before the caller's options are looked at.
          const added = headersOf(callCtx);
          const headers = layered(callOptions.headers, added);
          const joined: CallSignal = options.enableAbortSignal === true
            ? joinSignals(callCtx.signal, callOptions.signal)
            : { signal: callOptions.signal };
          ending.release = joined.release;
          const contextValues = (callOptions.contextValues ?? createContextValues())
            .set(callerContextKey, callCtx);
          const result: unknown = (original as (
            input: unknown,
            options: CallOptions,
          ) => unknown).call(bare, input, {
            ...callOptions,
            headers,
            signal: joined.signal!,
            contextValues,
          });
          if (isStream(result)) return closingWith(result, ending);
          if (!comesLater(result)) {
            ending.ok();
            return result;
          }
          // A failure while the good answer is closed is told to the span like a failure of the call.
          return (result as Promise<unknown>)
            .then((message) => {
              if (isStream(message)) return closingWith(message, ending);
              ending.ok();
              return message;
            })
            .catch((thrown: unknown) => {
              ending.failed(thrown, CALL_FAILED);
              throw thrown;
            });
        } catch (thrown) {
          ending.failed(thrown, CALL_FAILED);
          throw thrown;
        }
      };
    },
  }) as ContextPropagatingClient<Service>;
}

export function createContextPropagatingClient<Service extends ServiceType>(
  service: Service,
  transport: Transport,
  options: ContextPropagationOptions = {},
): ContextPropagatingClient<Service> {
  return carrying(createClient(service, transport), options);
}
