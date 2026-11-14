/**
 * Spans on the context. A context carries the span of the work it stands
 * for; work started from it gets a span under that one, named after its own
 * context. The first span of a line of contexts is also kept as its root,
 * with the time it started, so that an event can say how long after the
 * start it came. Spans are OpenTelemetry's: where no tracing is set up they
 * are started and ended all the same, and record nothing.
 */
import {
  SpanKind,
  context,
  trace,
  type AttributeValue,
  type Span,
  type SpanContext,
  type SpanOptions,
  type TimeInput,
  type Tracer,
} from "@opentelemetry/api";
import { createContext, createKey, type Context } from "./core.js";

/** The span of the context. */
const spanKey = createKey<Span | undefined>(Symbol("otel.span"), undefined);
/** The first span above it, and when that one started (in ms, by this machine's clock). */
const rootSpanKey = createKey<Span | undefined>(Symbol("otel.root_span"), undefined);
const rootStartKey = createKey<number | undefined>(Symbol("otel.root_start_ms"), undefined);
/** Set where no span is to be started under the one there is. */
const quietKey = createKey(Symbol("otel.suppress_child_spans"), false);

/**
 * Attributes set on every span started from the context down. The value
 * read where none were added is one object for all contexts: it is never
 * written on here, and must not be written on elsewhere.
 */
export const INHERITABLE_SPAN_ATTRIBUTES_KEY = createKey<Record<string, AttributeValue>>(
  Symbol("otel.inheritable_span_attributes"),
  {},
);

export function getTracer(name = "context-tracer"): Tracer {
  return trace.getTracer(name);
}

/** OpenTelemetry's own context for a span started under `span`: whichever is active, with `span` on it. */
function under(span: Span) {
  return trace.setSpan(context.active(), span);
}

/** Sets on `span` the attributes the context hands down, those its attributes object inherits included. */
function handDown(ctx: Context, span: Span): void {
  const handed = ctx.get(INHERITABLE_SPAN_ATTRIBUTES_KEY);
  for (const key in handed) span.setAttribute(key, handed[key]!);
}

/**
 * A context with a span of its own, named after `ctx` and started under the
 * span `ctx` carries, if any. Where child spans are suppressed under a span,
 * `ctx` itself is given back, though the tracer was asked for all the same.
 * The clock is read for every span started; only a first span keeps the time.
 */
export function withSpan(ctx: Context, options?: SpanOptions): Context {
  const tracer = getTracer();
  const above = ctx.get(spanKey);
  if (ctx.get(quietKey) && above) return ctx;

  const name = ctx.name || "anonymous-context";
  const span = above ? tracer.startSpan(name, options, under(above)) : tracer.startSpan(name, options);
  handDown(ctx, span);
  const startedAt = Date.now();
  const spanned = ctx.with(spanKey, span);
  return above ? spanned : spanned.with(rootSpanKey, span).with(rootStartKey, startedAt);
}

export function getSpan(ctx: Context): Span | undefined {
  return ctx.get(spanKey);
}

export function withSuppressedChildSpans(ctx: Context): Context {
  return ctx.with(quietKey, true);
}

/** Adds one attribute to those handed down, and sets it at once on the span the context has. */
export function withInheritableAttribute(ctx: Context, key: string, value: AttributeValue): Context {
  const handed = ctx.get(INHERITABLE_SPAN_ATTRIBUTES_KEY);
  const span = getSpan(ctx);
  if (span) span.setAttribute(key, value);
  return ctx.with(INHERITABLE_SPAN_ATTRIBUTES_KEY, { ...handed, [key]: value });
}

/** What a span is known by on another machine. */
interface SpanContextData {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

/**
 * The context's span as it can be sent elsewhere, or nothing when there is
 * no span or anything fails on the way. Where child spans are suppressed the
 * flags are 0, which tells the other side not to sample what it does.
 */
export function getSpanContextData(ctx: Context): SpanContextData | undefined {
  try {
    const span = getSpan(ctx);
    if (!span) return undefined;
    const known = span.spanContext();
    return {
      traceId: known.traceId,
      spanId: known.spanId,
      traceFlags: ctx.get(quietKey) ? 0 : known.traceFlags,
      traceState: known.traceState?.toString() as string,
    };
  } catch {
    return undefined;
  }
}

type RemoteSpanContext = Pick<SpanContext, "traceId" | "spanId" | "traceFlags">;

/**
 * The context a span that continues work from elsewhere is put on: the one
 * given or a new one, under `name` when there is one. (The two names inside
 * are the ones the runtime's own error shows when what was given is no
 * context; they stay as they were so that it reads the same.)
 */
function carrying(span: Span, name: string | undefined, existingContext: Context | undefined): Context {
  const parentContext = existingContext ?? createContext();
  const ctx = name ? parentContext.withName(name) : parentContext;
  return ctx.with(spanKey, span);
}

/** A context for work that continues a span started elsewhere: a span of its own is started under that one. */
export function createContextFromSpanContext(
  spanContext: RemoteSpanContext,
  name?: string,
  existingContext?: Context,
): Context {
  const tracer = getTracer();
  const elsewhere = trace.setSpanContext(context.active(), { ...spanContext, isRemote: true });
  const span = tracer.startSpan(name || "child.span", { kind: SpanKind.INTERNAL }, elsewhere);
  return carrying(span, name, existingContext);
}

/** A context that stands for a span started elsewhere and starts none: spans started from it go under that one. */
export function createContextFromRemoteSpanContext(
  spanContext: RemoteSpanContext,
  name?: string,
  existingContext?: Context,
): Context {
  return carrying(trace.wrapSpanContext({ ...spanContext, isRemote: true }), name, existingContext);
}

/**
 * A context and its span, held for as long as the work lasts (`using`). The
 * span is ended each time it is let go, unless it is the span of the work
 * above, which is not this one's to end.
 */
export class DisposableSpan implements Disposable {
  readonly ctx: Context;
  readonly span: Span;
  private readonly shouldEnd: boolean;

  constructor(ctx: Context, span: Span, shouldEnd = true) {
    this.ctx = ctx;
    this.span = span;
    this.shouldEnd = shouldEnd;
  }

  [Symbol.dispose](): void {
    if (this.shouldEnd) this.span.end();
  }
}

export function createSpan(ctx: Context, options?: SpanOptions): DisposableSpan {
  const above = getSpan(ctx);
  // Suppressed under a span, `withSpan` gives back `ctx` and the span above: nothing was started, so nothing is to be ended.
  const nothingStarted = ctx.get(quietKey) && above;
  const spanned = withSpan(ctx, options);
  return new DisposableSpan(spanned, getSpan(spanned)!, !nothingStarted);
}

/**
 * A span for something that is already over, recorded only under a span and
 * not where child spans are suppressed: started with `options` (which say
 * when it began) and ended at once, at `endTime`.
 */
export function recordCompletedSpanIfParented(
  ctx: Context,
  options?: SpanOptions,
  endTime?: TimeInput,
): Span | undefined {
  if (!getSpan(ctx) || ctx.get(quietKey)) return undefined;
  const span = getSpan(withSpan(ctx, options))!;
  span.end(endTime);
  return span;
}

/**
 * Marks a moment of the work: a span of no length under the context's span,
 * and on both it and the root span how many ms after the root span started
 * the moment came (0 where no start was kept). It never throws: whatever
 * fails on the way stops it there.
 */
export function reportEvent(ctx: Context, name: string): void {
  try {
    const tracer = getTracer();
    const above = getSpan(ctx);
    if (!above) return;
    const event = tracer.startSpan(name, undefined, under(above));
    handDown(ctx, event);
    const now = Date.now();
    const rootStart = ctx.get(rootStartKey);
    const sinceStart = typeof rootStart === "number" ? now - rootStart : 0;
    const attribute = `event.${name}`;
    const root = ctx.get(rootSpanKey) ?? above;
    root.setAttribute(attribute, sinceStart);
    event.setAttribute(attribute, sinceStart);
    event.end();
  } catch {}
}
