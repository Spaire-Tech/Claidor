/**
 * What a turn reports while it runs, in the wrapped form: the same updates
 * as `interaction-updates.ts`, built from values that are already wrapped
 * (a redacted string, a wrapped tool call or message). Every level of a
 * wrapped update says the privacy mode it was made under, in
 * `_privacyMode`, before its own fields.
 *
 * A builder that is handed a wrapped value takes the mode from that value;
 * the others are told the mode. Nothing here wraps or unwraps: the values
 * are placed as they come.
 */
import type { PrivacyMode } from "../redaction/privacy-mode.js";
import type { RedactedString } from "../redaction/types.js";

/** One level of a wrapped message: its mode, then its fields. */
interface RedactedCarrier {
  readonly _privacyMode: PrivacyMode;
  readonly [key: string]: unknown;
}

interface RedactedInteractionUpdate {
  readonly _privacyMode: PrivacyMode;
  readonly message: {
    readonly case: string;
    readonly value: RedactedCarrier;
  };
}

/** The state of something added to the context, as callers say it. */
interface ContextInjectionState {
  readonly kind: "queued" | "delivered" | "queued_for_next_turn" | "cancelled" | "rejected";
  readonly step?: unknown;
  readonly deliveryBatchId?: unknown;
  readonly deliveredAtMs?: string | number | bigint;
  readonly reason?: unknown;
}

interface FeedbackCategory {
  readonly id: unknown;
  readonly label: unknown;
}

interface FeedbackCategoryGroup {
  readonly id: unknown;
  readonly prompt: unknown;
  readonly categories: readonly FeedbackCategory[];
}

/** What a turn used, as the wrapped builders take it: each count as a number, as text or as a BigInt. */
interface WrappedTurnUsage {
  readonly inputTokens: string | number | bigint;
  readonly outputTokens: string | number | bigint;
  readonly cacheReadTokens: string | number | bigint;
  readonly cacheWriteTokens: string | number | bigint;
  readonly reasoningTokens?: string | number | bigint | null | undefined;
}

/** One level: the mode first, then the fields in the order given. */
function level(privacyMode: PrivacyMode, fields: Record<string, unknown> = {}): RedactedCarrier {
  return { _privacyMode: privacyMode, ...fields };
}

/** A wrapped update of one kind, holding `fields`. */
function wrappedUpdate(
  privacyMode: PrivacyMode,
  kind: string,
  fields?: Record<string, unknown>,
): RedactedInteractionUpdate {
  return { _privacyMode: privacyMode, message: { case: kind, value: level(privacyMode, fields) } };
}

/**
 * A state as the wrapped update holds it: a level whose `state` is the kind
 * (in the wire's spelling) with a level of its own. Only a delivery and a
 * rejection carry more than the kind. A kind that is none of the five gives
 * nothing.
 */
function wrappedState(privacyMode: PrivacyMode, state: ContextInjectionState): RedactedCarrier {
  const stateOf = (kind: string, fields?: Record<string, unknown>): RedactedCarrier =>
    level(privacyMode, { state: { case: kind, value: level(privacyMode, fields) } });
  switch (state.kind) {
    case "queued":
      return stateOf("queued");
    case "queued_for_next_turn":
      return stateOf("queuedForNextTurn");
    case "cancelled":
      return stateOf("cancelled");
    case "rejected":
      return stateOf("rejected", { reason: state.reason });
    case "delivered":
      return stateOf("delivered", {
        step: state.step,
        deliveryBatchId: state.deliveryBatchId,
        deliveredAtMs: BigInt(state.deliveredAtMs!),
      });
  }
}

/**
 * A turn's usage in whole numbers. The counts are converted in this order,
 * so the first that is no whole number is the one that fails. Thinking
 * tokens that are missing or null count as none.
 */
function countsOf(usage: WrappedTurnUsage): Record<string, unknown> {
  return {
    inputTokens: BigInt(usage.inputTokens),
    outputTokens: BigInt(usage.outputTokens),
    cacheReadTokens: BigInt(usage.cacheReadTokens),
    cacheWriteTokens: BigInt(usage.cacheWriteTokens),
    reasoningTokens: BigInt(usage.reasoningTokens ?? 0),
  };
}

export const RedactedUpdates = {
  textDelta(text: RedactedString): RedactedInteractionUpdate {
    return wrappedUpdate(text.__privacyMode, "textDelta", { text, isServerNotice: false });
  },
  toolCallStarted(callId: string, toolCall: RedactedCarrier, modelCallId: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(toolCall._privacyMode, "toolCallStarted", { callId, toolCall, modelCallId });
  },
  toolCallCompleted(callId: string, toolCall: RedactedCarrier, modelCallId: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(toolCall._privacyMode, "toolCallCompleted", { callId, toolCall, modelCallId });
  },
  toolCallDelta(callId: string, toolCallDelta: RedactedCarrier, modelCallId: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(toolCallDelta._privacyMode, "toolCallDelta", { callId, toolCallDelta, modelCallId });
  },
  thinkingDelta(text: RedactedString, thinkingStyle: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(text.__privacyMode, "thinkingDelta", { text, thinkingStyle });
  },
  thinkingCompleted(privacyMode: PrivacyMode, thinkingDurationMs: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "thinkingCompleted", { thinkingDurationMs });
  },
  userMessageAppended(userMessage: RedactedCarrier): RedactedInteractionUpdate {
    return wrappedUpdate(userMessage._privacyMode, "userMessageAppended", { userMessage });
  },
  /** A tool call still being written, with the piece of its arguments that just came after the model call's id. */
  partialToolCall(
    callId: string,
    toolCall: RedactedCarrier,
    modelCallId: unknown,
    argsTextDelta: unknown,
  ): RedactedInteractionUpdate {
    return wrappedUpdate(toolCall._privacyMode, "partialToolCall", { callId, toolCall, modelCallId, argsTextDelta });
  },
  tokenDelta(privacyMode: PrivacyMode, tokens: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "tokenDelta", { tokens });
  },
  summary(summary: RedactedString): RedactedInteractionUpdate {
    return wrappedUpdate(summary.__privacyMode, "summary", { summary });
  },
  summaryStarted(privacyMode: PrivacyMode): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "summaryStarted");
  },
  heartbeat(privacyMode: PrivacyMode): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "heartbeat");
  },
  contextInjectionState(
    privacyMode: PrivacyMode,
    injectionId: string,
    state: ContextInjectionState,
  ): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "contextInjectionState", {
      injectionId,
      state: wrappedState(privacyMode, state),
    });
  },
  summaryCompleted(privacyMode: PrivacyMode, hookMessage: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "summaryCompleted", { hookMessage });
  },
  shellOutputDelta(privacyMode: PrivacyMode, event: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "shellOutputDelta", { event });
  },
  /** The end of the turn. With no usage (or anything else that counts as none) it carries no counts at all. */
  turnEnded(privacyMode: PrivacyMode, usage: WrappedTurnUsage | null | undefined): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "turnEnded", usage ? countsOf(usage) : undefined);
  },
  stepStarted(privacyMode: PrivacyMode, stepId: string | number | bigint): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "stepStarted", { stepId: BigInt(stepId) });
  },
  stepCompleted(
    privacyMode: PrivacyMode,
    stepId: string | number | bigint,
    stepDurationMs: string | number | bigint,
  ): RedactedInteractionUpdate {
    return wrappedUpdate(privacyMode, "stepCompleted", {
      stepId: BigInt(stepId),
      stepDurationMs: BigInt(stepDurationMs),
    });
  },
  promptSuggestion(suggestion: RedactedString): RedactedInteractionUpdate {
    return wrappedUpdate(suggestion.__privacyMode, "promptSuggestion", { suggestion });
  },
  activeBranchChange(path: RedactedString, branchName: unknown): RedactedInteractionUpdate {
    return wrappedUpdate(path.__privacyMode, "activeBranchChange", { path, branchName });
  },
  /**
   * A request for feedback. Each category and each group becomes a level of
   * its own, holding its id and its label or prompt and nothing else. The
   * form is never shown at once.
   */
  feedbackRequest(
    requestId: string,
    canonicalModelName: string,
    privacyMode: PrivacyMode,
    categories: readonly FeedbackCategory[],
    categoryGroups: readonly FeedbackCategoryGroup[] = [],
    copy: {
      readonly title?: unknown;
      readonly negativeTitle?: unknown;
      readonly commentPlaceholder?: unknown;
    } = {},
  ): RedactedInteractionUpdate {
    const categoryLevel = (category: FeedbackCategory): RedactedCarrier =>
      level(privacyMode, { id: category.id, label: category.label });
    const groupLevel = (group: FeedbackCategoryGroup): RedactedCarrier =>
      level(privacyMode, {
        id: group.id,
        prompt: group.prompt,
        categories: group.categories.map((category) => categoryLevel(category)),
      });
    return wrappedUpdate(privacyMode, "feedbackRequest", {
      requestId,
      canonicalModelName,
      categories: categories.map((category) => categoryLevel(category)),
      categoryGroups: categoryGroups.map((group) => groupLevel(group)),
      showFormImmediately: false,
      title: copy.title,
      negativeTitle: copy.negativeTitle,
      commentPlaceholder: copy.commentPlaceholder,
    });
  },
};
