/**
 * The questions an agent's turn puts to the person's side while it runs (may
 * I search the web, may I fetch this page, sign in to this connector) and
 * the answers that come back. A question and its answer are the wire's own
 * messages (`InteractionQuery`, `InteractionResponse`); this file builds
 * the answers and asks three of the questions.
 */
import type { PartialMessage } from "@bufbuild/protobuf";
import {
  InteractionQuery,
  InteractionResponse,
} from "../proto/generated/agent/v1/agent_pb.js";
import type { AskQuestionResult } from "../proto/generated/agent/v1/ask_question_tool_pb.js";
import {
  ConnectScmRequestResponse,
  ConnectScmRequestResponse_Approved,
  ConnectScmRequestResponse_Failed,
  ConnectScmRequestResponse_Rejected,
} from "../proto/generated/agent/v1/connect_scm_tool_pb.js";
import {
  CreatePlanRequestResponse,
  type CreatePlanResult,
} from "../proto/generated/agent/v1/create_plan_tool_pb.js";
import {
  GenerateImageRequestResponse,
  GenerateImageRequestResponse_Approved,
  GenerateImageRequestResponse_Rejected,
} from "../proto/generated/agent/v1/generate_image_tool_pb.js";
import {
  McpAuthRequestQuery,
  McpAuthRequestResponse,
  McpAuthRequestResponse_Approved,
  McpAuthRequestResponse_Rejected,
  type McpAuthArgs,
} from "../proto/generated/agent/v1/mcp_auth_tool_pb.js";
import type { PrManagementResult } from "../proto/generated/agent/v1/pr_management_tool_pb.js";
import type { ReplaceEnvResult } from "../proto/generated/agent/v1/replace_env_tool_pb.js";
import type { SetupVmEnvironmentResult } from "../proto/generated/agent/v1/setup_vm_environment_tool_pb.js";
import {
  SwitchModeRequestResponse,
  SwitchModeRequestResponse_Approved,
  SwitchModeRequestResponse_Rejected,
} from "../proto/generated/agent/v1/switch_mode_tool_pb.js";
import {
  WebFetchRequestQuery,
  WebFetchRequestResponse,
  WebFetchRequestResponse_Approved,
  WebFetchRequestResponse_Rejected,
  type WebFetchArgs,
} from "../proto/generated/agent/v1/web_fetch_tool_pb.js";
import {
  WebSearchRequestQuery,
  WebSearchRequestResponse,
  WebSearchRequestResponse_Approved,
  WebSearchRequestResponse_Rejected,
  type WebSearchArgs,
} from "../proto/generated/agent/v1/web_search_tool_pb.js";

/** Whoever answers a turn's questions. */
export interface InteractionQueryListener<Context = unknown> {
  query(context: Context, query: InteractionQuery): Promise<InteractionResponse>;
}

/**
 * Thrown in place of an answer when the answer will come later. It keeps
 * the question, and names the question's number and kind in its message.
 */
export class DeferredInteractionResponseError extends Error {
  readonly query: InteractionQuery;

  constructor(query: InteractionQuery) {
    super(`Deferred interaction response requested for query ${query.id} (${query.query.case ?? "unknown"})`);
    this.query = query;
    this.name = "DeferredInteractionResponseError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** What an answer holds besides the question's number: one of the kinds of answer, with its own message. */
type AnswerContent = NonNullable<PartialMessage<InteractionResponse>["result"]>;

/** The answer to the question numbered `queryId`. */
function answerTo(queryId: number, content: AnswerContent): InteractionResponse {
  return new InteractionResponse({ id: queryId, result: content });
}

// Six kinds of answer are a verdict: approved, rejected and, for one of them,
// failed. Each of these wraps a verdict as the content of its kind of answer.

function webSearchVerdict(result: NonNullable<PartialMessage<WebSearchRequestResponse>["result"]>): AnswerContent {
  return { case: "webSearchRequestResponse", value: new WebSearchRequestResponse({ result }) };
}

function webFetchVerdict(result: NonNullable<PartialMessage<WebFetchRequestResponse>["result"]>): AnswerContent {
  return { case: "webFetchRequestResponse", value: new WebFetchRequestResponse({ result }) };
}

function switchModeVerdict(result: NonNullable<PartialMessage<SwitchModeRequestResponse>["result"]>): AnswerContent {
  return { case: "switchModeRequestResponse", value: new SwitchModeRequestResponse({ result }) };
}

function mcpAuthVerdict(result: NonNullable<PartialMessage<McpAuthRequestResponse>["result"]>): AnswerContent {
  return { case: "mcpAuthRequestResponse", value: new McpAuthRequestResponse({ result }) };
}

function connectScmVerdict(result: NonNullable<PartialMessage<ConnectScmRequestResponse>["result"]>): AnswerContent {
  return { case: "connectScmRequestResponse", value: new ConnectScmRequestResponse({ result }) };
}

function generateImageVerdict(result: NonNullable<PartialMessage<GenerateImageRequestResponse>["result"]>): AnswerContent {
  return { case: "generateImageRequestResponse", value: new GenerateImageRequestResponse({ result }) };
}

/**
 * The reasons given when a caller gives none. A web search, a page fetch, a
 * switch of mode and a picture are rejected with an empty reason.
 */
const MCP_AUTH_REJECTED = "Authentication was rejected";
const CONNECT_SCM_SKIPPED = "Connecting GitHub was skipped";
const CONNECT_SCM_FAILED = "Failed to connect GitHub";

/**
 * Ready-made answers, each for the question numbered `queryId`. A reason or
 * description that is missing or null is replaced by the kind's own (above,
 * or empty text); any other value is carried as it is. A result handed in
 * is carried as it is.
 */
export const Responses = {
  webSearchApproved(queryId: number): InteractionResponse {
    return answerTo(queryId, webSearchVerdict({ case: "approved", value: new WebSearchRequestResponse_Approved() }));
  },
  webSearchRejected(queryId: number, reason?: string | null): InteractionResponse {
    return answerTo(
      queryId,
      webSearchVerdict({ case: "rejected", value: new WebSearchRequestResponse_Rejected({ reason: reason ?? "" }) }),
    );
  },
  webFetchApproved(queryId: number): InteractionResponse {
    return answerTo(queryId, webFetchVerdict({ case: "approved", value: new WebFetchRequestResponse_Approved() }));
  },
  webFetchRejected(queryId: number, reason?: string | null): InteractionResponse {
    return answerTo(
      queryId,
      webFetchVerdict({ case: "rejected", value: new WebFetchRequestResponse_Rejected({ reason: reason ?? "" }) }),
    );
  },
  askQuestion(queryId: number, result: AskQuestionResult): InteractionResponse {
    return answerTo(queryId, { case: "askQuestionInteractionResponse", value: { result } });
  },
  switchModeApproved(queryId: number): InteractionResponse {
    return answerTo(queryId, switchModeVerdict({ case: "approved", value: new SwitchModeRequestResponse_Approved() }));
  },
  switchModeRejected(queryId: number, reason?: string | null): InteractionResponse {
    return answerTo(
      queryId,
      switchModeVerdict({ case: "rejected", value: new SwitchModeRequestResponse_Rejected({ reason: reason ?? "" }) }),
    );
  },
  createPlan(queryId: number, result: CreatePlanResult): InteractionResponse {
    return answerTo(queryId, { case: "createPlanRequestResponse", value: new CreatePlanRequestResponse({ result }) });
  },
  setupVmEnvironment(queryId: number, result: SetupVmEnvironmentResult): InteractionResponse {
    return answerTo(queryId, { case: "setupVmEnvironmentResult", value: result });
  },
  replaceEnv(queryId: number, result: ReplaceEnvResult): InteractionResponse {
    return answerTo(queryId, { case: "replaceEnvResult", value: result });
  },
  prManagement(queryId: number, result: PrManagementResult): InteractionResponse {
    return answerTo(queryId, { case: "prManagementResult", value: result });
  },
  mcpAuthApproved(queryId: number): InteractionResponse {
    return answerTo(queryId, mcpAuthVerdict({ case: "approved", value: new McpAuthRequestResponse_Approved() }));
  },
  mcpAuthRejected(queryId: number, reason?: string | null): InteractionResponse {
    return answerTo(
      queryId,
      mcpAuthVerdict({
        case: "rejected",
        value: new McpAuthRequestResponse_Rejected({ reason: reason ?? MCP_AUTH_REJECTED }),
      }),
    );
  },
  connectScmApproved(queryId: number): InteractionResponse {
    return answerTo(queryId, connectScmVerdict({ case: "approved", value: new ConnectScmRequestResponse_Approved() }));
  },
  connectScmRejected(queryId: number, reason?: string | null): InteractionResponse {
    return answerTo(
      queryId,
      connectScmVerdict({
        case: "rejected",
        value: new ConnectScmRequestResponse_Rejected({ reason: reason ?? CONNECT_SCM_SKIPPED }),
      }),
    );
  },
  connectScmFailed(queryId: number, error?: string | null): InteractionResponse {
    return answerTo(
      queryId,
      connectScmVerdict({
        case: "failed",
        value: new ConnectScmRequestResponse_Failed({ error: error ?? CONNECT_SCM_FAILED }),
      }),
    );
  },
  generateImageApproved(queryId: number, description?: string | null): InteractionResponse {
    return answerTo(
      queryId,
      generateImageVerdict({
        case: "approved",
        value: new GenerateImageRequestResponse_Approved({ description: description ?? "" }),
      }),
    );
  },
  generateImageRejected(queryId: number, reason?: string | null): InteractionResponse {
    return answerTo(
      queryId,
      generateImageVerdict({
        case: "rejected",
        value: new GenerateImageRequestResponse_Rejected({ reason: reason ?? "" }),
      }),
    );
  },
};

/** A question of one kind. It is given no number here, so it carries the wire's own default, 0. */
function questionWith(content: NonNullable<PartialMessage<InteractionQuery>["query"]>): InteractionQuery {
  return new InteractionQuery({ query: content });
}

// Each of the three questions below is answered by its own kind of answer.
// An answer of another kind, of no kind, or with nothing in it is an error
// that names the kind the answer says it is.

/** Asks whether the agent may search the web for `args`, and hands back the verdict. */
export async function queryWebSearch<Context>(
  listener: InteractionQueryListener<Context>,
  context: Context,
  args: WebSearchArgs | PartialMessage<WebSearchArgs>,
): Promise<WebSearchRequestResponse> {
  const response = await listener.query(
    context,
    questionWith({ case: "webSearchRequestQuery", value: new WebSearchRequestQuery({ args }) }),
  );
  const result = response.result;
  if (result.case !== "webSearchRequestResponse" || !result.value) {
    throw new Error(`Unexpected response for web search query: ${result.case}`);
  }
  return result.value;
}

/**
 * Asks whether the agent may fetch the page in `args`, and hands back the
 * verdict. `options` says whether approval can be skipped (true or false by
 * itself says only that) and carries a smart-mode approval when there is one.
 */
export async function queryWebFetch<Context>(
  listener: InteractionQueryListener<Context>,
  context: Context,
  args: WebFetchArgs | PartialMessage<WebFetchArgs>,
  options?: boolean | {
    readonly skipApproval?: boolean;
    readonly smartModeApproval?: WebFetchRequestQuery["smartModeApproval"];
  } | null,
): Promise<WebFetchRequestResponse> {
  const asked = typeof options === "boolean" ? { skipApproval: options } : options ?? {};
  const response = await listener.query(
    context,
    questionWith({
      case: "webFetchRequestQuery",
      value: new WebFetchRequestQuery({
        args,
        skipApproval: asked.skipApproval ?? false,
        smartModeApproval: asked.smartModeApproval!,
      }),
    }),
  );
  const result = response.result;
  if (result.case !== "webFetchRequestResponse" || !result.value) {
    throw new Error(`Unexpected response for web fetch query: ${result.case}`);
  }
  return result.value;
}

/** Asks for a sign-in to the connector in `args`, and hands back the verdict. */
export async function queryMcpAuth<Context>(
  listener: InteractionQueryListener<Context>,
  context: Context,
  args: McpAuthArgs | PartialMessage<McpAuthArgs>,
): Promise<McpAuthRequestResponse> {
  const response = await listener.query(
    context,
    questionWith({ case: "mcpAuthRequestQuery", value: new McpAuthRequestQuery({ args }) }),
  );
  const result = response.result;
  if (result.case !== "mcpAuthRequestResponse" || !result.value) {
    throw new Error(`Unexpected response for MCP auth query: ${result.case}`);
  }
  return result.value;
}
