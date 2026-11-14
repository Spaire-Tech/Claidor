/**
 * What listens to an agent's turn: it is sent the turn's updates, it is
 * asked the turn's questions, and it can be given work to do once the turn
 * has ended. Here are its shape, the error for a stream that closed under
 * it, and a listener that asks nobody and answers every question itself.
 */
import {
  AskQuestionRejected,
  AskQuestionResult,
} from "../proto/generated/agent/v1/ask_question_tool_pb.js";
import {
  CreatePlanResult,
  CreatePlanSuccess,
} from "../proto/generated/agent/v1/create_plan_tool_pb.js";
import type {
  InteractionQuery,
  InteractionResponse,
} from "../proto/generated/agent/v1/agent_pb.js";
import {
  PrManagementError,
  PrManagementResult,
} from "../proto/generated/agent/v1/pr_management_tool_pb.js";
import {
  ReplaceEnvFailure,
  ReplaceEnvResult,
} from "../proto/generated/agent/v1/replace_env_tool_pb.js";
import {
  SetupVmEnvironmentResult,
  SetupVmEnvironmentSuccess,
} from "../proto/generated/agent/v1/setup_vm_environment_tool_pb.js";
import { Responses } from "./interaction-queries.js";

export interface InteractionListenerContext {
  readonly canceled?: boolean;
}

export interface InteractionListener<Context = InteractionListenerContext> {
  sendUpdate(context: Context, update: unknown): Promise<void>;
  query(context: Context, query: InteractionQuery): Promise<InteractionResponse | undefined>;
  /** Puts work aside until the turn has ended. */
  enqueuePostTurnEndedWork?(work: () => Promise<unknown>): void;
  /** Runs the work put aside. */
  flushPostTurnEndedWork?(context: Context): Promise<void>;
}

/**
 * The stream a listener writes to has closed. The name and the cause are
 * the error's own fields, the cause also when there is none.
 */
export class InteractionListenerStreamClosedError extends Error {
  override readonly name = "InteractionListenerStreamClosedError";
  override readonly cause: unknown;

  constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super(message);
    this.cause = options.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Has the listener run the work it put aside for after the turn, when it is a listener that can. */
export async function flushPostTurnEndedWork<Context>(
  context: Context,
  listener: Pick<InteractionListener<Context>, "flushPostTurnEndedWork">,
): Promise<void> {
  await listener.flushPostTurnEndedWork?.(context);
}

/** Runs one piece of work put aside. It is cleanup, done as well as it can be: a failure is not passed on. */
async function runQuietly(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch {
    // Nothing waits on this work, so nothing is told.
  }
}

// What the listener that asks nobody says, word for word.
const QUESTIONS_SKIPPED = "Questions skipped by user (CLI fallback)";
const NO_MODE_SWITCH = "Mode switching not supported in CLI";
const NO_ENVIRONMENT_REPLACEMENT = "Environment replacement is not supported in this environment";
const NO_PR_MANAGEMENT = "PR management is only available in cloud agents";
const NO_MCP_AUTH = "MCP authentication is not supported in this environment";
const NO_SCM_CONNECTION = "Connecting GitHub is not supported in this environment";

/** The person's questions, turned down. */
function questionsSkipped(): AskQuestionResult {
  return new AskQuestionResult({
    result: { case: "rejected", value: new AskQuestionRejected({ reason: QUESTIONS_SKIPPED }) },
  });
}

/** A plan, taken as it is. */
function planAccepted(): CreatePlanResult {
  return new CreatePlanResult({ result: { case: "success", value: new CreatePlanSuccess() } });
}

/** A cloud computer's setup, counted as done. */
function environmentSetUp(): SetupVmEnvironmentResult {
  return new SetupVmEnvironmentResult({ result: { case: "success", value: new SetupVmEnvironmentSuccess({}) } });
}

/** An environment's replacement, which cannot be done here. */
function environmentNotReplaced(): ReplaceEnvResult {
  return new ReplaceEnvResult({
    result: {
      case: "failure",
      value: new ReplaceEnvFailure({ errorMessage: NO_ENVIRONMENT_REPLACEMENT, setupLogs: "" }),
    },
  });
}

/** Work on a pull request, which cannot be done here. */
function pullRequestsNotManaged(): PrManagementResult {
  return new PrManagementResult({
    result: { case: "error", value: new PrManagementError({ error: NO_PR_MANAGEMENT }) },
  });
}

/**
 * A listener with nobody behind it. Updates go nowhere. Work put aside is
 * kept and run when asked. Every question is answered at once: a web search,
 * a page fetch and a picture are approved, a plan and a cloud computer's
 * setup pass, and what needs a person or a cloud agent is turned down with
 * the reason.
 */
export class NoopInteractionListener<Context = InteractionListenerContext>
implements InteractionListener<Context> {
  /** The work put aside, in the order it came. The field is the listener's own and is seen from outside. */
  private postTurnEndedWorkQueue: Array<() => Promise<unknown>> = [];

  async sendUpdate(_context: Context, _update: unknown): Promise<void> {}

  enqueuePostTurnEndedWork(work: () => Promise<unknown>): void {
    this.postTurnEndedWorkQueue.push(work);
  }

  /**
   * Runs the work put aside, all of it started in order before any of it is
   * waited for. Work put aside meanwhile is kept for the next flush.
   */
  async flushPostTurnEndedWork(_context: Context): Promise<void> {
    const due = this.postTurnEndedWorkQueue;
    this.postTurnEndedWorkQueue = [];
    await Promise.all(due.map((work) => runQuietly(work)));
  }

  /** The answers are built with `Responses` as it is at that moment. */
  async query(_context: Context, query: InteractionQuery): Promise<InteractionResponse> {
    const asked = query.query;
    switch (asked.case) {
      // Approved without asking.
      case "webSearchRequestQuery":
        return Responses.webSearchApproved(query.id);
      case "webFetchRequestQuery":
        return Responses.webFetchApproved(query.id);
      case "generateImageRequestQuery":
        return Responses.generateImageApproved(query.id, asked.value.args?.description);
      // Counted as done.
      case "createPlanRequestQuery":
        return Responses.createPlan(query.id, planAccepted());
      case "setupVmEnvironmentArgs":
        return Responses.setupVmEnvironment(query.id, environmentSetUp());
      // Turned down, with the reason.
      case "askQuestionInteractionQuery":
        return Responses.askQuestion(query.id, questionsSkipped());
      case "switchModeRequestQuery":
        return Responses.switchModeRejected(query.id, NO_MODE_SWITCH);
      case "replaceEnvArgs":
        return Responses.replaceEnv(query.id, environmentNotReplaced());
      case "prManagementRequestQuery":
        return Responses.prManagement(query.id, pullRequestsNotManaged());
      case "mcpAuthRequestQuery":
        return Responses.mcpAuthRejected(query.id, NO_MCP_AUTH);
      case "connectScmRequestQuery":
        return Responses.connectScmRejected(query.id, NO_SCM_CONNECTION);
      default:
        throw new Error("Unhandled interaction query type");
    }
  }
}
