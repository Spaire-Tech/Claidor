/**
 * The side that does the work. A manager is handed each message from the
 * asking side, finds the handler that takes it, and sends what the handler
 * answers home, one message at a time, followed by a close. A failure goes
 * home as a failure message. While a run lasts a heartbeat goes home every
 * few seconds, and the asking side can abort a run by its number.
 *
 * A handler pairs one kind of request with the executor that carries it out:
 * it takes the request out of its envelope, asks the executor, and puts each
 * answer into an envelope under the request's number.
 */
import type { PartialMessage } from "@bufbuild/protobuf";
import type { Context } from "../context/core.js";
import { appendGitDiagnostics } from "../git-core/diagnostics.js";
import { createCounter, createHistogram } from "../metrics/index.js";
import type { ExecServerControlMessage } from "../proto/generated/agent/v1/agent_service_pb.js";
import {
  ExecClientControlMessage,
  ExecClientHeartbeat,
  ExecClientMessage,
  ExecClientStreamClose,
  ExecClientThrow,
  ExecServerMessage,
} from "../proto/generated/agent/v1/exec_pb.js";
import type { HookAdditionalContext } from "../proto/generated/agent/v1/hook_additional_context_pb.js";
import { createWritableIterable, WriteIterableClosedError } from "../utils/writable-iterable.js";
import type { RegisteredControlledResource } from "./resource-provider.js";

/** The hook name the conflict notices of the agent's store travel under. */
const STORE_CONFLICT_NOTE = "agentStoreConflict";
/** How long after a heartbeat was read the next one is sent. */
const HEARTBEAT_EVERY_MS = 3_000;

/** Each run is timed, and counted as a success or a failure, by the kind of its request. */
const runDuration = createHistogram("agent_exec.controlled.exec.duration_ms", {
  description: "Duration of controlled exec operations in milliseconds",
  labelNames: ["exec_case"],
});
const runsSucceeded = createCounter("agent_exec.controlled.exec.success", {
  description: "Count of successful controlled exec operations",
  labelNames: ["exec_case"],
});
const runsFailed = createCounter("agent_exec.controlled.exec.error", {
  description: "Count of failed controlled exec operations",
  labelNames: ["exec_case"],
});

/** The failure of a run whose working side is gone. */
export class ControlledExecDisposedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlledExecDisposedError";
  }
}

/** The code the asking side is given with a failure, for the two failures it treats in a way of their own. */
function codeOf(failure: unknown): string | undefined {
  if (failure instanceof ControlledExecDisposedError) return "EXEC_BACKEND_UNAVAILABLE";
  if (failure instanceof Error && failure.name === "AgentExecStreamStartTimeoutError") return "AGENT_EXEC_STREAM_START_TIMEOUT";
  return undefined;
}

/** What an executor is told about the run besides the request. */
interface RunOptions {
  execId?: string | undefined;
  /** A list the executor may add notes for the model to. */
  hookContextCollector: HookAdditionalContext[];
  deliverAgentStoreConflictNotices: boolean;
}

export interface ControlledExecutor<Args, Result> {
  execute(ctx: Context, args: Args, options: RunOptions): Promise<Result>;
}

export interface ControlledStreamExecutor<Args, Event> {
  execute(ctx: Context, args: Args, options: RunOptions): AsyncIterable<Event>;
}

/** Something that takes some messages: it answers with a stream for a message it takes, and with nothing for any other. */
export interface ControlledExecHandler {
  handle(ctx: Context, message: ExecServerMessage): AsyncIterable<ExecClientMessage> | undefined;
}

/** A request out of its envelope, with the envelope's number. */
type Unwrapped<Args> = { id: number; args: Args };

/** The run as an executor is told of it: the id the message gives it, a list for notes, and whether the asking side takes notes. */
function runOptions(message: ExecServerMessage, notes: HookAdditionalContext[]): RunOptions {
  return {
    execId: message.execId as string | undefined,
    hookContextCollector: notes,
    deliverAgentStoreConflictNotices: message.acceptHookAdditionalContexts === true,
  };
}

/** The whole ms since `start`, never below zero. */
function msSince(start: number): number {
  return Math.round(Math.max(0, performance.now() - start));
}

/** One request, one answer. */
export class SimpleControlledExecHandler<Args, Result> {
  constructor(
    private readonly executor: ControlledExecutor<Args, Result>,
    private readonly unwrap: (message: ExecServerMessage) => Unwrapped<Args> | undefined,
    private readonly wrap: (id: number, result: Result) => ExecClientMessage,
  ) {}

  handle(ctx: Context, serverMessage: ExecServerMessage): AsyncIterable<ExecClientMessage> | undefined {
    const request = this.unwrap(serverMessage);
    return request === undefined ? undefined : this.answer(ctx, serverMessage, request);
  }

  /**
   * Asks the executor once the stream is read, and gives its answer with the
   * ms it took and every note the executor left.
   */
  private async *answer(ctx: Context, message: ExecServerMessage, request: Unwrapped<Args>): AsyncGenerator<ExecClientMessage> {
    const start = performance.now();
    const notes: HookAdditionalContext[] = [];
    const result = await this.executor.execute(ctx, request.args, runOptions(message, notes));
    const answer = this.wrap(request.id, result);
    answer.localExecutionTimeMs = msSince(start);
    if (notes.length > 0) answer.hookAdditionalContexts = notes;
    yield answer;
  }
}

/** One request, a stream of events. */
export class SimpleControlledStreamExecHandler<Args, Event> {
  constructor(
    private readonly executor: ControlledStreamExecutor<Args, Event>,
    private readonly unwrap: (message: ExecServerMessage) => Unwrapped<Args> | undefined,
    private readonly wrap: (id: number, event: Event) => ExecClientMessage,
  ) {}

  handle(ctx: Context, serverMessage: ExecServerMessage): AsyncIterable<ExecClientMessage> | undefined {
    const request = this.unwrap(serverMessage);
    return request === undefined ? undefined : this.events(ctx, serverMessage, request);
  }

  /**
   * Asks the executor once the stream is read, and gives each of its events
   * with the ms since then. However the stream comes to its end (the
   * executor is done, it fails, the reader leaves), the store's conflict
   * notices among the notes the executor left are given last, in an envelope
   * of their own. Its other notes are not sent.
   */
  private async *events(ctx: Context, message: ExecServerMessage, request: Unwrapped<Args>): AsyncGenerator<ExecClientMessage> {
    const start = performance.now();
    const notes: HookAdditionalContext[] = [];
    try {
      for await (const event of this.executor.execute(ctx, request.args, runOptions(message, notes))) {
        const answer = this.wrap(request.id, event);
        answer.localExecutionTimeMs = msSince(start);
        yield answer;
      }
    } finally {
      const conflicts = notes.filter((note) => note.hookEventName === STORE_CONFLICT_NOTE);
      if (conflicts.length > 0) yield new ExecClientMessage({ id: request.id, hookAdditionalContexts: conflicts });
    }
  }
}

export interface ControlledResourceRegistry {
  entries(): Array<readonly [RegisteredControlledResource, unknown]>;
}

export interface SimpleControlledExecManagerOptions {
  /** Whether git's own words are added to a git failure that is sent home. A function is asked anew for each failure. */
  includeGitStderrInThrows?: boolean | (() => boolean);
}

/** What goes home: a handler's answers, and the manager's own messages about the run. */
type Outgoing = ExecClientMessage | ExecClientControlMessage;

const closeOf = (id: number): ExecClientControlMessage =>
  new ExecClientControlMessage({ message: { case: "streamClose", value: new ExecClientStreamClose({ id }) } });

const heartbeatOf = (id: number): ExecClientControlMessage =>
  new ExecClientControlMessage({ message: { case: "heartbeat", value: new ExecClientHeartbeat({ id }) } });

const failureOf = (told: ExecClientThrow): ExecClientControlMessage =>
  new ExecClientControlMessage({ message: { case: "throw", value: told } });

/** What is sent for a message nobody takes: the failure, then the close, each under the number the message has by then. */
async function* refused(message: ExecServerMessage, words: string): AsyncGenerator<ExecClientControlMessage> {
  yield failureOf(new ExecClientThrow({ id: message.id, error: words }));
  yield closeOf(message.id);
}

export class SimpleControlledExecManager {
  private readonly handlers: ControlledExecHandler[] = [];
  /** The cancel of each run going on, by the run's number. */
  private readonly cancels = new Map<number, (reason?: unknown) => void>();
  private readonly gitWordsWanted: () => boolean;

  constructor(options?: SimpleControlledExecManagerOptions) {
    const told = options?.includeGitStderrInThrows;
    // What was told is kept as it is; only when nothing was told is the answer no.
    this.gitWordsWanted = typeof told === "function" ? told : () => (told !== undefined ? told : false);
  }

  register(handler: ControlledExecHandler): void {
    this.handlers.push(handler);
  }

  /** The asking side's word about a run. An abort cancels the context of the run with that number, if it is still going. */
  handleControlMessage(serverMessage: ExecServerControlMessage): void {
    if (serverMessage.message.case !== "abort") return;
    const aborted = serverMessage.message.value as { id: number };
    this.cancels.get(aborted.id)?.();
  }

  /**
   * Hands a message to the first handler that takes it, under a context of
   * the run's own that an abort cancels, and answers with what goes home.
   * The run is known by its number before any handler is asked.
   */
  handle(ctx: Context, serverMessage: ExecServerMessage): AsyncIterable<ExecClientMessage | ExecClientControlMessage> {
    const [runCtx, cancel] = ctx.withCancel();
    this.cancels.set(serverMessage.id, cancel);
    const held = serverMessage.message.case;
    const kind = held !== undefined ? held : "unknown";

    for (const handler of this.handlers) {
      const answers = handler.handle(runCtx, serverMessage);
      if (answers !== undefined) return this.sendHome(runCtx, serverMessage, kind, answers);
    }

    // Nobody takes it. The number is forgotten, and the failure is counted against the caller's own context.
    this.cancels.delete(serverMessage.id);
    const words = `No handler found for server message of type ${serverMessage.message.case}`;
    console.error(words, { messageCase: serverMessage.message.case });
    runsFailed.increment(ctx, 1, { exec_case: kind });
    return refused(serverMessage, words);
  }

  /**
   * Starts sending a handler's answers home and gives back the stream they
   * go to. Each message is written only when the one before was read. The
   * heartbeat's timer is set first, and set again each time a heartbeat was
   * read. The manager's own messages carry the number the message has when
   * they are made.
   */
  private sendHome(runCtx: Context, serverMessage: ExecServerMessage, kind: string, answers: AsyncIterable<ExecClientMessage>): AsyncIterable<Outgoing> {
    const home = createWritableIterable<Outgoing>();
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    const beatLater = (): void => {
      heartbeat = setTimeout(() => {
        home.write(heartbeatOf(serverMessage.id)).then(beatLater).catch(() => {});
      }, HEARTBEAT_EVERY_MS);
    };
    beatLater();
    const start = performance.now();

    const run = async (): Promise<void> => {
      try {
        for await (const answer of answers) await home.write(answer);
        await home.write(closeOf(serverMessage.id));
        runsSucceeded.increment(runCtx, 1, { exec_case: kind });
      } catch (failure) {
        // The reader is gone: there is nobody to tell.
        if (failure instanceof WriteIterableClosedError) return;
        runsFailed.increment(runCtx, 1, { exec_case: kind });
        await home.write(failureOf(this.told(serverMessage, failure)));
      } finally {
        runDuration.histogram(runCtx, performance.now() - start, { exec_case: kind });
        clearTimeout(heartbeat);
        home.close();
        this.cancels.delete(serverMessage.id);
      }
    };
    void run();
    return home;
  }

  /**
   * A failure as the asking side is told of it: an error's own words (with
   * git's codes, and git's words when wanted), its trace when it has one,
   * and its code when it has one. Anything thrown that is not an error is an
   * unknown error.
   */
  private told(serverMessage: ExecServerMessage, failure: unknown): ExecClientThrow {
    const stackTrace = failure instanceof Error ? failure.stack : undefined;
    const errorCode = codeOf(failure);
    const told: PartialMessage<ExecClientThrow> = {
      id: serverMessage.id,
      error: failure instanceof Error
        ? appendGitDiagnostics(failure.message, failure, { includeStderr: this.gitWordsWanted() })
        : "Unknown error",
    };
    if (stackTrace !== undefined) told.stackTrace = stackTrace;
    if (errorCode !== undefined) told.errorCode = errorCode;
    return new ExecClientThrow(told);
  }

  /** A manager with every implementation of a registry registered, each by its own resource, in the registry's order. */
  static fromResources(resources: ControlledResourceRegistry, options?: SimpleControlledExecManagerOptions): SimpleControlledExecManager {
    const manager = new SimpleControlledExecManager(options);
    for (const [resource, implementation] of resources.entries()) {
      resource.registerControlledImplementation(implementation, manager);
    }
    return manager;
  }
}
