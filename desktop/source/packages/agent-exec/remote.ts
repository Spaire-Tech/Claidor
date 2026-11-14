/**
 * The asking side of a tool: a request is wrapped into a message, sent to
 * the side that does the work over a connection, and the answers that come
 * back are read. One kind of request has one result; the other has a stream
 * of events. Both run under a span of their own, whose ids travel on the
 * message so that the work done elsewhere can be tied to it.
 */
import type { Context } from "../context/core.js";
import { createSpan, getSpanContextData } from "../context/otel.js";
import { createCounter } from "../metrics/index.js";
import { ExecClientMessage, ExecServerMessage, SpanContext } from "../proto/generated/agent/v1/exec_pb.js";
import type { HookAdditionalContext } from "../proto/generated/agent/v1/hook_additional_context_pb.js";
import { getFirstItem } from "../utils/async-iterator.js";

/** Counts each note of a hook that reached the caller's list, by the hook it came from. */
const notesDelivered = createCounter("agent_exec.hook_additional_context.delivered", {
  description: "Hook additional_context carriers drained into the caller collector",
  labelNames: ["hook_event_name"],
});

export interface ExecutorOptions {
  /** The id the run is known by, sent with the request. */
  execId?: string | undefined;
  /** Where the notes hooks leave for the model are put as the answers bring them. */
  hookContextCollector?: HookAdditionalContext[];
  deliverAgentStoreConflictNotices?: boolean;
  enableAgentStoreConflictNotices?: boolean;
}

export interface Executor<Args, Result> {
  execute(ctx: Context, args: Args, options?: ExecutorOptions): Promise<Result>;
}

export interface StreamExecutor<Args, Event> {
  execute(ctx: Context, args: Args, options?: ExecutorOptions): AsyncIterable<Event>;
}

/**
 * The connection to the side that does the work. It gives each run a number,
 * asks for the message that carries that number, and hands back the answers
 * to it as they come.
 */
export interface RemoteExecManager {
  createExecInstance(ctx: Context, createMessage: (id: number) => ExecServerMessage): AsyncIterable<ExecClientMessage>;
}

/** A request already in its envelope: the number and what it holds. */
type Wrapped = Pick<ExecServerMessage, "id" | "message">;

/** The context's span as the message carries it, when the context has one that can be told. */
function spanOnTheWire(ctx: Context): SpanContext | undefined {
  const known = getSpanContextData(ctx);
  return known ? new SpanContext(known) : undefined;
}

/** The message that goes out: the wrapped request, with the run's id, the span, and whether notes are taken back. */
function outgoing(wrapped: Wrapped, execId: string | undefined, span: SpanContext | undefined, takesNotes: boolean): ExecServerMessage {
  return new ExecServerMessage({
    id: wrapped.id,
    message: wrapped.message,
    execId: execId!,
    spanContext: span!,
    acceptHookAdditionalContexts: takesNotes,
  });
}

/** A request with one result. */
export class ExecutorResource<Args, Result> implements Executor<Args, Result> {
  constructor(
    private readonly connection: RemoteExecManager,
    private readonly wrap: (id: number, args: Args) => Wrapped,
    private readonly resultIn: (message: ExecClientMessage) => Result | undefined,
  ) {}

  /**
   * Sends the request and answers with the first answer that holds its
   * result. Answers that hold anything else are passed over, but the notes
   * on every answer are kept. What still comes after the result is read out
   * in the background, for its notes.
   */
  async execute(parentCtx: Context, args: Args, options?: ExecutorOptions): Promise<Result> {
    using work = createSpan(parentCtx.withName("ExecutorResource.execute"));
    const ctx = work.ctx;
    if (options?.execId !== undefined) work.span.setAttribute("exec.id", options.execId);
    const span = spanOnTheWire(ctx);

    const answers = this.connection.createExecInstance(ctx, (id) =>
      outgoing(this.wrap(id, args), options?.execId, span, options?.hookContextCollector !== undefined),
    );

    /** Puts an answer's notes on the caller's list, when there is a list, and counts them. */
    const keepNotes = (answer: ExecClientMessage): void => {
      const notes = answer.hookAdditionalContexts;
      if (options?.hookContextCollector !== undefined && notes.length > 0) {
        options.hookContextCollector.push(...notes);
        for (const note of notes) notesDelivered.increment(ctx, 1, { hook_event_name: note.hookEventName });
      }
    };

    let unread = answers;
    let result: Result | undefined;
    for (let read = 0; result === undefined; read += 1) {
      const next = await getFirstItem(unread);
      // The connection ended: before any answer, or before the one with the result.
      if (next === undefined) throw new Error(read === 0 ? "No exec result" : "No result value");
      keepNotes(next.firstItem);
      result = this.resultIn(next.firstItem);
      unread = next.rest;
    }

    void readOut(unread, keepNotes).catch(() => {});
    return result;
  }
}

/**
 * Reads the answers that come after a result, to the end, for their notes.
 * Nobody waits for it. A connection that fails by then is only said on the
 * console: the result was already given.
 */
async function readOut(answers: AsyncIterable<ExecClientMessage>, keepNotes: (answer: ExecClientMessage) => void): Promise<void> {
  try {
    for await (const answer of answers) keepNotes(answer);
  } catch (error) {
    console.info("Ignoring exec stream shutdown during detached drain", { error });
  }
}

/** A request answered by a stream of events. */
export class StreamExecutorResource<Args, Event> implements StreamExecutor<Args, Event> {
  constructor(
    private readonly connection: RemoteExecManager,
    private readonly wrap: (id: number, args: Args) => Wrapped,
    private readonly eventIn: (message: ExecClientMessage) => Event | undefined,
  ) {}

  /**
   * Sends the request when the stream is first read, and hands on every
   * answer that holds an event, in order, until the connection ends. Notes
   * on any answer go to the caller's list; they are not counted here.
   */
  async *execute(parentCtx: Context, args: Args, options?: ExecutorOptions): AsyncIterable<Event> {
    using work = createSpan(parentCtx.withName("StreamExecutorResource.execute"));
    const ctx = work.ctx;
    const span = spanOnTheWire(ctx);

    const answers = this.connection.createExecInstance(ctx, (id) => {
      const wrapped = this.wrap(id, args);
      const takesNotes = options?.hookContextCollector !== undefined || options?.deliverAgentStoreConflictNotices === true;
      return outgoing(wrapped, options?.execId, span, takesNotes);
    });

    for await (const answer of answers) {
      const notes = answer.hookAdditionalContexts;
      if (options?.hookContextCollector !== undefined && notes.length > 0) options.hookContextCollector.push(...notes);
      const event = this.eventIn(answer);
      if (event !== undefined) yield event;
    }
  }
}
