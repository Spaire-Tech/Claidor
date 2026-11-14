/**
 * What a turn reports while it runs, in the plain form: text and thinking as
 * they come, tool calls as they are written, start and complete, a command's
 * output, summaries, steps, and the end of the turn with what it used. Each
 * is the wire's own message (`InteractionUpdate`); `Updates` builds them.
 */
import type { PartialMessage } from "@bufbuild/protobuf";
import {
  ActiveBranchChange,
  FeedbackRequestUpdate,
  HeartbeatUpdate,
  InteractionUpdate,
  PartialToolCallUpdate,
  PromptSuggestionUpdate,
  ShellOutputDeltaUpdate,
  StepCompletedUpdate,
  StepStartedUpdate,
  SummaryCompletedUpdate,
  SummaryStartedUpdate,
  SummaryUpdate,
  TextDeltaUpdate,
  ThinkingCompletedUpdate,
  ThinkingDeltaUpdate,
  TokenDeltaUpdate,
  ToolCallCompletedUpdate,
  ToolCallDeltaUpdate,
  ToolCallStartedUpdate,
  TurnEndedUpdate,
  UserMessageAppendedUpdate,
  type FeedbackRequestCategory,
  type FeedbackRequestCategoryGroup,
} from "../proto/generated/agent/v1/agent_pb.js";

/** What a turn used, in tokens. */
export interface TurnUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reasoningTokens?: number;
}

/** The words of a request for feedback, where the person's side does not use its own. */
export interface FeedbackRequestCopy {
  readonly title?: string;
  readonly negativeTitle?: string;
  readonly commentPlaceholder?: string;
}

/** An update of one kind. */
function updateWith(content: NonNullable<PartialMessage<InteractionUpdate>["message"]>): InteractionUpdate {
  return new InteractionUpdate({ message: content });
}

/**
 * A turn's usage as the wire counts it, in whole numbers. The counts are
 * converted in this order, so the first that is no whole number is the one
 * that fails. Thinking tokens left out count as none.
 */
function countsOf(usage: TurnUsage): PartialMessage<TurnEndedUpdate> {
  return {
    inputTokens: BigInt(usage.inputTokens),
    outputTokens: BigInt(usage.outputTokens),
    cacheReadTokens: BigInt(usage.cacheReadTokens),
    cacheWriteTokens: BigInt(usage.cacheWriteTokens),
    reasoningTokens: BigInt(usage.reasoningTokens ?? 0),
  };
}

/**
 * The builders. What a caller leaves out stays out of the message, which
 * then holds the wire's own default for it. A message handed in (a tool
 * call, a person's message) is carried as it is.
 */
export const Updates = {
  textDelta(text: string): InteractionUpdate {
    return updateWith({ case: "textDelta", value: new TextDeltaUpdate({ text }) });
  },
  toolCallStarted(
    callId: string,
    toolCall: ToolCallStartedUpdate["toolCall"],
    modelCallId: string,
  ): InteractionUpdate {
    return updateWith({
      case: "toolCallStarted",
      value: new ToolCallStartedUpdate({ callId, toolCall: toolCall!, modelCallId }),
    });
  },
  toolCallCompleted(
    callId: string,
    toolCall: ToolCallCompletedUpdate["toolCall"],
    modelCallId: string,
  ): InteractionUpdate {
    return updateWith({
      case: "toolCallCompleted",
      value: new ToolCallCompletedUpdate({ callId, toolCall: toolCall!, modelCallId }),
    });
  },
  toolCallDelta(
    callId: string,
    toolCallDelta: ToolCallDeltaUpdate["toolCallDelta"],
    modelCallId: string,
  ): InteractionUpdate {
    return updateWith({
      case: "toolCallDelta",
      value: new ToolCallDeltaUpdate({ callId, toolCallDelta: toolCallDelta!, modelCallId }),
    });
  },
  thinkingDelta(text: string, thinkingStyle: ThinkingDeltaUpdate["thinkingStyle"]): InteractionUpdate {
    return updateWith({
      case: "thinkingDelta",
      value: new ThinkingDeltaUpdate({ text, thinkingStyle: thinkingStyle! }),
    });
  },
  thinkingCompleted(thinkingDurationMs: number): InteractionUpdate {
    return updateWith({ case: "thinkingCompleted", value: new ThinkingCompletedUpdate({ thinkingDurationMs }) });
  },
  userMessageAppended(userMessage: UserMessageAppendedUpdate["userMessage"]): InteractionUpdate {
    return updateWith({
      case: "userMessageAppended",
      value: new UserMessageAppendedUpdate({ userMessage: userMessage! }),
    });
  },
  /** A tool call still being written. The piece of its arguments that just came is not given here. */
  partialToolCall(
    callId: string,
    toolCall: PartialToolCallUpdate["toolCall"],
    modelCallId: string,
  ): InteractionUpdate {
    return updateWith({
      case: "partialToolCall",
      value: new PartialToolCallUpdate({ callId, toolCall: toolCall!, modelCallId }),
    });
  },
  tokenDelta(tokens: number): InteractionUpdate {
    return updateWith({ case: "tokenDelta", value: new TokenDeltaUpdate({ tokens }) });
  },
  summary(summary: string): InteractionUpdate {
    return updateWith({ case: "summary", value: new SummaryUpdate({ summary }) });
  },
  summaryStarted(): InteractionUpdate {
    return updateWith({ case: "summaryStarted", value: new SummaryStartedUpdate() });
  },
  heartbeat(): InteractionUpdate {
    return updateWith({ case: "heartbeat", value: new HeartbeatUpdate() });
  },
  summaryCompleted(hookMessage: SummaryCompletedUpdate["hookMessage"]): InteractionUpdate {
    return updateWith({
      case: "summaryCompleted",
      value: new SummaryCompletedUpdate({ hookMessage: hookMessage! }),
    });
  },
  shellOutputDelta(event: ShellOutputDeltaUpdate["event"]): InteractionUpdate {
    return updateWith({ case: "shellOutputDelta", value: new ShellOutputDeltaUpdate({ event }) });
  },
  /** The end of the turn. With no usage (or anything else that counts as none) it carries no counts at all. */
  turnEnded(usage?: TurnUsage): InteractionUpdate {
    return updateWith({ case: "turnEnded", value: new TurnEndedUpdate(usage ? countsOf(usage) : {}) });
  },
  stepStarted(stepId: number): InteractionUpdate {
    return updateWith({ case: "stepStarted", value: new StepStartedUpdate({ stepId: BigInt(stepId) }) });
  },
  stepCompleted(stepId: number, stepDurationMs: number): InteractionUpdate {
    return updateWith({
      case: "stepCompleted",
      value: new StepCompletedUpdate({ stepId: BigInt(stepId), stepDurationMs: BigInt(stepDurationMs) }),
    });
  },
  promptSuggestion(suggestion: string): InteractionUpdate {
    return updateWith({ case: "promptSuggestion", value: new PromptSuggestionUpdate({ suggestion }) });
  },
  activeBranchChange(path: string, branchName: string): InteractionUpdate {
    return updateWith({ case: "activeBranchChange", value: new ActiveBranchChange({ path, branchName }) });
  },
  /** The categories and the groups are put in lists of the message's own. */
  feedbackRequest(
    requestId: string,
    canonicalModelName: string | undefined,
    categories: readonly FeedbackRequestCategory[],
    categoryGroups: readonly FeedbackRequestCategoryGroup[] = [],
    copy: FeedbackRequestCopy = {},
  ): InteractionUpdate {
    return updateWith({
      case: "feedbackRequest",
      value: new FeedbackRequestUpdate({
        requestId,
        canonicalModelName: canonicalModelName!,
        categories: [...categories],
        categoryGroups: [...categoryGroups],
        title: copy.title!,
        negativeTitle: copy.negativeTitle!,
        commentPlaceholder: copy.commentPlaceholder!,
      }),
    });
  },
};
