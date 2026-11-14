/**
 * Running a subagent for a tool call. The host knows how to start or resume
 * a subagent's session and how to run it; the executor made here turns what
 * the run came to into the tool's answer, and sees to it that one tool call
 * runs its subagent once however often it is asked. The request travels as
 * `subagentArgs` and its answer comes back as `subagentResult`.
 */
import type { PartialMessage } from "@bufbuild/protobuf";
import type { Context } from "../context/core.js";
import type { SubagentBackgroundReason } from "../proto/generated/agent/v1/agent_pb.js";
import { SubagentError, SubagentResult, SubagentSuccess, type SubagentArgs } from "../proto/generated/agent/v1/subagent_exec_pb.js";
import { SimpleControlledExecHandler } from "./controlled.js";
import { ExecutorResource, type Executor, type ExecutorOptions, type RemoteExecManager } from "./remote.js";
import { createResource, type ControlledExecManager } from "./resource-provider.js";
import { createClientDeserializer, createClientSerializer, createServerDeserializer, createServerSerializer } from "./serialization.js";

/** What the model is told when it writes to a subagent that has not finished. */
export const RUNNING_SUBAGENT_FOLLOWUP_ERROR =
  "Sub-agent is currently running. You may send the follow-up message when it has completed.";
export const RUNNING_SUBAGENT_INTERRUPT_RETRY_HINT =
  "If you intended to interrupt this agent, you may retry with `interrupt` set to true";

/** What is said of a run that was aborted and gives no words of its own. */
const ABORTED = "Subagent was aborted by the user";
/** How many tool calls' answers are kept; one more pushes out the oldest. */
const ANSWERS_KEPT = 1_000;

/** What a run came to, as the host tells it. */
interface RunOutcome {
  status: "success" | "error" | "aborted" | "background";
  error?: string | undefined;
  finalMessage?: string | undefined;
  toolCallCount?: number | undefined;
  backgroundReason?: SubagentBackgroundReason | undefined;
  transcriptPath?: string | undefined;
}

/** The host of subagents: it starts or resumes a session, runs it, and may let go of one whose run failed. */
interface SubagentHost {
  createOrResumeSession(ctx: Context, args: SubagentArgs): Promise<string>;
  runSession(
    ctx: Context,
    agentId: string,
    args: SubagentArgs,
    options: { execId?: string | undefined },
  ): Promise<RunOutcome>;
  releaseSession?(agentId: string): void;
}

const succeeded = (fields: PartialMessage<SubagentSuccess>): SubagentResult =>
  new SubagentResult({ result: { case: "success", value: new SubagentSuccess(fields) } });

const failed = (fields: PartialMessage<SubagentError>): SubagentResult =>
  new SubagentResult({ result: { case: "error", value: new SubagentError(fields) } });

/**
 * The tool's answer for a run that came to an end. An error and an abort are
 * error answers; a run sent to the background is a success that also says
 * why it went there and where its transcript is; anything else is a plain
 * success.
 */
function answerFor(agentId: string, outcome: RunOutcome): SubagentResult {
  const status = outcome.status;
  if (status === "error") return failed({ agentId, error: outcome.error! });
  if (status === "aborted") return failed({ agentId, error: outcome.error ?? ABORTED });

  const told: PartialMessage<SubagentSuccess> = {
    agentId,
    finalMessage: outcome.finalMessage!,
    toolCallCount: outcome.toolCallCount ?? 0,
  };
  if (status === "background") {
    told.backgroundReason = outcome.backgroundReason!;
    told.transcriptPath = outcome.transcriptPath!;
  }
  return succeeded(told);
}

/** The agent a failure names, when the failure is an object that carries an `agentId` in text. */
function agentNamedBy(failure: unknown): string | undefined {
  if (typeof failure !== "object" || failure === null) return undefined;
  const { agentId } = failure as { agentId?: unknown };
  return typeof agentId === "string" ? agentId : undefined;
}

/**
 * What tells one tool call's run from another's: the conversation, the call,
 * and the agent resumed or forked from. A request without a call or without
 * a conversation has no such name, and always runs.
 */
function runNameOf(args: SubagentArgs): string | undefined {
  if (!args.toolCallId || !args.parentConversationId) return undefined;
  return [args.parentConversationId, args.toolCallId, args.resumeAgentId ?? "", args.forkAgentId ?? ""].join("\0");
}

export function createSubagentExecutor(
  adapter: SubagentHost,
): Executor<SubagentArgs, SubagentResult> {
  /** The runs going on, and the successes kept, each by its run's name. */
  const running = new Map<string, Promise<SubagentResult>>();
  const kept = new Map<string, SubagentResult>();

  /** Starts or resumes the session and runs it. A failure on the way is an error answer too. */
  async function run(ctx: Context, args: SubagentArgs, options?: ExecutorOptions): Promise<SubagentResult> {
    let agentId: string | undefined;
    try {
      agentId = await adapter.createOrResumeSession(ctx, args);
      return answerFor(agentId, await adapter.runSession(ctx, agentId, args, { execId: options?.execId }));
    } catch (failure) {
      // A session that was started is let go of, where the host knows how.
      if (agentId && adapter.releaseSession) adapter.releaseSession(agentId);
      const told: PartialMessage<SubagentError> = { error: failure instanceof Error ? failure.message : String(failure) };
      // The agent is the session's, else the one the failure names, else the one that was being resumed.
      const agent = agentId ?? agentNamedBy(failure) ?? args.resumeAgentId;
      if (agent) told.agentId = agent;
      return failed(told);
    }
  }

  /** Keeps a success for the next time its tool call asks, at the cost of the oldest one kept when there are too many. */
  function keep(name: string, answer: SubagentResult): void {
    kept.set(name, answer);
    if (kept.size > ANSWERS_KEPT) kept.delete(kept.keys().next().value!);
  }

  return {
    execute(ctx, args, options) {
      const name = runNameOf(args);
      if (name === undefined) return run(ctx, args, options);

      const before = kept.get(name);
      if (before !== undefined) return Promise.resolve(before);
      const underWay = running.get(name);
      if (underWay !== undefined) return underWay;

      const started = run(ctx, args, options)
        .then((answer) => {
          if (answer.result.case === "success") keep(name, answer);
          return answer;
        })
        .finally(() => {
          running.delete(name);
        });
      running.set(name, started);
      return started;
    },
  };
}

/** The names the request and its answer go by in the wire's envelopes. */
const REQUEST = "subagentArgs";
const ANSWER = "subagentResult";

export const subagentExecutorResource = createResource<Executor<SubagentArgs, SubagentResult>, RemoteExecManager, ControlledExecManager>(
  // The asking side: the request is sent over the connection, and the answer under its name is the result.
  (connection) => new ExecutorResource(connection, createServerSerializer(REQUEST), createClientDeserializer(ANSWER)),
  // The working side: the executor is given every request under that name, and its answer goes home.
  (executor, manager) => manager.register(new SimpleControlledExecHandler(executor, createServerDeserializer(REQUEST), createClientSerializer(ANSWER))),
);
