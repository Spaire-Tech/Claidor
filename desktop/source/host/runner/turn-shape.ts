import { isInjectedReminderMessage } from "./send-message-reminder-middleware.js";
import { SAND_CREATE_AGENT_TOOL_NAME } from "../agents/agent-messaging.js";
import { SAND_REACT_TO_MESSAGE_TOOL_NAME } from "./tools/sand-reaction-tool.js";
import { SAND_SEND_MESSAGE_TOOL_NAME } from "./tools/send-message-tool.js";

// What reaches the person. A proposal card is one: ProposeConnector tells
// the agent to end its turn once the card is shown, and the closing nudge
// read that as a silent turn and ran a whole hidden turn more ("Your previous
// turn acknowledged the user and then ran tool calls…"), two paid calls on
// every connector proposal (OpenAI log, 2 October 2026).
export const SAND_PROPOSE_CONNECTOR_TOOL_NAME = "ProposeConnector";
export const DELIVERY_TOOL_NAMES = new Set([
  SAND_SEND_MESSAGE_TOOL_NAME,
  SAND_REACT_TO_MESSAGE_TOOL_NAME,
  SAND_PROPOSE_CONNECTOR_TOOL_NAME,
]);

export interface CorePart {
  readonly type: string;
  readonly text?: string;
  readonly toolName?: string;
  readonly toolCallId?: string;
}

export interface CoreMessage {
  readonly role: string;
  readonly content: string | readonly CorePart[];
  readonly providerOptions?: {
    readonly simeon?: { readonly highLevelToolCallResult?: unknown };
  };
}

export function asCoreMessage(value: unknown): CoreMessage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (!("role" in value) || typeof value.role !== "string") return undefined;
  if (
    !("content" in value)
    || (typeof value.content !== "string" && !Array.isArray(value.content))
  ) return undefined;
  return value as CoreMessage;
}

export function toolCallNames(message: CoreMessage): string[] {
  if (message.role !== "assistant" || typeof message.content === "string") {
    return [];
  }
  return message.content.flatMap((part) =>
    part.type === "tool-call" && part.toolName != null
      ? [part.toolName]
      : []
  );
}

export function hasDeliveryToolCall(names: readonly string[]): boolean {
  return names.some((name) => DELIVERY_TOOL_NAMES.has(name));
}

/** The arguments of the delivery calls in `message` that did not fail (one with no id counts). */
function deliveredArgs(message: CoreMessage, erroredIds: ReadonlySet<string>): unknown[] {
  if (message.role !== "assistant" || typeof message.content === "string") {
    return [];
  }
  return message.content.flatMap((part) =>
    part.type === "tool-call"
    && part.toolName != null
    && DELIVERY_TOOL_NAMES.has(part.toolName)
    && (part.toolCallId == null || !erroredIds.has(part.toolCallId))
      ? [(part as { readonly args?: unknown }).args]
      : []
  );
}

/** A delivery call in `message` that did not fail. */
function deliveredIn(message: CoreMessage, erroredIds: ReadonlySet<string>): boolean {
  return deliveredArgs(message, erroredIds).length > 0;
}

function erroredToolResultIds(
  messages: readonly (CoreMessage | undefined)[],
): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (
      message === undefined
      || message.role !== "tool"
      || typeof message.content === "string"
    ) continue;
    const highLevel = message.providerOptions?.simeon
      ?.highLevelToolCallResult;
    if (
      typeof highLevel !== "object"
      || highLevel === null
      || Array.isArray(highLevel)
      || !("isError" in highLevel)
      || highLevel.isError !== true
    ) continue;
    for (const part of message.content) {
      if (part.type === "tool-result" && part.toolCallId != null) {
        ids.add(part.toolCallId);
      }
    }
  }
  return ids;
}

export function isBlankAssistantMessage(message: CoreMessage): boolean {
  if (message.role !== "assistant") return false;
  if (typeof message.content === "string") {
    return message.content.trim().length === 0;
  }
  return message.content.every(
    (part) => part.type === "text" && (part.text ?? "").trim().length === 0,
  );
}

export function turnEndedOnSilentToolCalls(
  rawMessages: readonly unknown[],
  endsTurn: (args: unknown) => boolean,
): boolean {
  const messages = rawMessages.map(asCoreMessage);
  let tailIndex = messages.length - 1;
  while (tailIndex >= 0) {
    const message = messages[tailIndex];
    if (
      message === undefined
      || message.role === "tool"
      || isBlankAssistantMessage(message)
      || isInjectedReminderMessage(message)
    ) {
      tailIndex -= 1;
      continue;
    }
    break;
  }

  const tail = tailIndex >= 0 ? messages[tailIndex] : undefined;
  if (tail === undefined || tail.role !== "assistant") return false;
  // A tail of plain words is as silent as one of tool calls: only SendMessage
  // reaches the person. Iris said she was checking, ran her mail tools and
  // ended with nothing more the person saw, every call answered (28 October
  // 2026); a turn ending in words was not counted as silent, so no nudge
  // ran. So is a tail whose every SendMessage failed.
  const erroredIds = erroredToolResultIds(messages);
  if (deliveredIn(tail, erroredIds)) return false;
  // A card that waits on the person is what they see: a turn ending on a
  // draft or a checkout card is not one that forgot to tell them.
  if (tailShowsWaitingCard(tail, messages, erroredIds)) return false;

  let boundary = -1;
  for (let index = tailIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined || isInjectedReminderMessage(message)) continue;
    if (message.role === "user" || message.role === "system") {
      boundary = index;
      break;
    }
  }

  let opening: CoreMessage | undefined;
  let workedAfter = false;
  for (let index = boundary + 1; index <= tailIndex; index += 1) {
    const message = messages[index];
    if (message === undefined || message.role !== "assistant") continue;
    const names = toolCallNames(message);
    if (names.length === 0) continue;
    if (opening === undefined) {
      if (!hasDeliveryToolCall(names)) return false;
      // The opening message was the answer, by the agent's own word
      // (`final`): there is nothing to ask for again.
      if (deliveredArgs(message, erroredIds).some(endsTurn)) return false;
      opening = message;
      // Tools called beside it run after it.
      workedAfter = names.some((name) => !DELIVERY_TOOL_NAMES.has(name));
    } else if (deliveredIn(message, erroredIds)) {
      return false;
    } else {
      workedAfter = true;
    }
  }
  if (opening === undefined) return false;
  if (toolCallNames(tail).length > 0) return true;
  // Ended in words: they are the result the person never saw only when work
  // came after the opening message, or when it said more was coming
  // (`final: false`). An answer sent first and followed by words was nudged,
  // and the agent sent it again (Iris, 28 October 2026, 8:53).
  return workedAfter || deliveredArgs(opening, erroredIds).every((args) => parsedArgs(args)?.final === false);
}

// Handing the box to the person: the turn waits for them to hand it back.
export const SAND_REQUEST_BOX_HELP_TOOL_NAME = "request_box_help";

/**
 * Cards that wait on the person (28 October 2026), as the upstream app's do
 * (its card rules: a draft "waits on user Send/discard", the checkout "ends
 * turn until they approve/deny", a connect card "waits on user tap"). Each
 * call ends the turn once its answer says the card is in the chat; a refused
 * call (a draft with no recipient, a total the page doesn't show) leaves the
 * model the floor to put it right. These were only on the runner's older
 * path (`sand-agent-runner.ts`), which the app no longer runs.
 */
const WAITING_CARDS: ReadonlyMap<string, RegExp> = new Map([
  ["DraftExternalMessage", /^Draft shown to the user as an editable /],
  ["RequestPurchase", /^The checkout card for .+ is in the chat/s],
  ["AuthenticateMcpServer", /Its connect card is now in the chat\./],
  ["InstallPlugin", /Its connect card is now in the chat\./],
  // The in-chat form (28 October 2026, `formShownNote`); a form the page refused is not shown and waits on nothing.
  ["request_user_form", /^The form ".+" is in the chat/s],
  // The 1Password cards (28 October 2026, `onepassword-tools.ts`); a fill the person already allowed shows no card.
  ["request_credential_fill", /^The 1Password card for ".+" is in the chat/s],
  ["request_1password_connect", /^The 1Password connect card is in the chat/],
]);

/**
 * Cards in front of the person that wait on nothing (30 October 2026): a turn
 * ending on one told them, so it is not nudged to say more; unlike a waiting
 * card it does not end the step, so the agent may go on (Simeon asks
 * "Anything else you'd hand off today?" after a hire).
 */
const SHOWN_CARDS: ReadonlyMap<string, RegExp> = new Map([
  // "Iris just joined your team" (`agent-joined`, shared/agents/agent-joined.ts).
  [SAND_CREATE_AGENT_TOOL_NAME, /The user now sees a card in this chat saying .+ just joined their team/s],
]);

/** A call whose answer says its card is in front of the person, waiting on them or not. */
export function cardCallShown(toolName: string | undefined, result: unknown): boolean {
  if (cardCallWaits(toolName, result)) return true;
  const shown = toolName === undefined ? undefined : SHOWN_CARDS.get(toolName);
  return shown !== undefined && typeof result === "string" && shown.test(result);
}

/** A card call whose answer says its card is in front of the person. */
export function cardCallWaits(toolName: string | undefined, result: unknown): boolean {
  const shown = toolName === undefined ? undefined : WAITING_CARDS.get(toolName);
  return shown !== undefined && typeof result === "string" && shown.test(result);
}

/** Each answered call's result, by its id. */
function toolResults(messages: readonly (CoreMessage | undefined)[]): Map<string, unknown> {
  const results = new Map<string, unknown>();
  for (const message of messages) {
    if (message === undefined || message.role !== "tool" || typeof message.content === "string") continue;
    for (const part of message.content) {
      if (part.type === "tool-result" && part.toolCallId != null) results.set(part.toolCallId, (part as { readonly result?: unknown }).result);
    }
  }
  return results;
}

/** The tail put a card in front of the person that waits on them (a handoff, a draft, a checkout, a connect card): it is not silent. */
function tailShowsWaitingCard(tail: CoreMessage, messages: readonly (CoreMessage | undefined)[], erroredIds: ReadonlySet<string>): boolean {
  if (typeof tail.content === "string") return false;
  const results = toolResults(messages);
  return tail.content.some((part) =>
    part.type === "tool-call"
    && part.toolCallId != null
    && !erroredIds.has(part.toolCallId)
    && results.has(part.toolCallId)
    && (part.toolName === SAND_REQUEST_BOX_HELP_TOOL_NAME || cardCallShown(part.toolName, results.get(part.toolCallId))));
}
// The subagent launcher under its three names (`getTaskToolName`).
export const TASK_TOOL_NAMES = new Set(["Task", "Subagent", "mcp_task"]);

function parsedArgs(args: unknown): Record<string, unknown> | null {
  let value = args;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return null; } }
  return value != null && typeof value === "object" ? value as Record<string, unknown> : null;
}

/**
 * A call after which the model has nothing to add: a background subagent
 * launch (the loop resumes on its "background task just completed" prompt)
 * or a box handoff (the loop resumes when the box is handed back). On
 * 5 October 2026 each was followed by one more call that answered nothing
 * ("Subagent is running in the background." → no output, three times in
 * one task; "Handed the box to the user" → no output).
 */
export function waitingToolCallEndsTurn(toolName: string | undefined, args: unknown): boolean {
  if (toolName === SAND_REQUEST_BOX_HELP_TOOL_NAME) return true;
  if (toolName !== undefined && TASK_TOOL_NAMES.has(toolName)) return parsedArgs(args)?.run_in_background === true;
  return false;
}

// The model's step ended its turn when every call in it is a SendMessage that
// says so (final, a question, a secret request; `sendMessageEndsTurn`) or a
// waiting call (`waitingToolCallEndsTurn`), and every one was delivered. Then
// the loop stops without asking the model once more: that last call read the
// whole conversation to answer nothing.
export function stepEndsTurn(
  responseMessages: readonly unknown[],
  endsTurn: (args: unknown) => boolean,
): boolean {
  const messages = responseMessages.map(asCoreMessage);
  const results = toolResults(messages);
  const calls: { readonly id: string; readonly args: unknown; readonly waiting: boolean }[] = [];
  for (const message of messages) {
    if (message === undefined || message.role !== "assistant" || typeof message.content === "string") continue;
    for (const part of message.content) {
      if (part.type !== "tool-call") continue;
      if (part.toolCallId == null) return false;
      const args = (part as { readonly args?: unknown }).args;
      if (waitingToolCallEndsTurn(part.toolName, args) || cardCallWaits(part.toolName, results.get(part.toolCallId))) { calls.push({ id: part.toolCallId, args, waiting: true }); continue; }
      if (part.toolName !== SAND_SEND_MESSAGE_TOOL_NAME) return false;
      calls.push({ id: part.toolCallId, args, waiting: false });
    }
  }
  if (calls.length === 0 || !calls.every((call) => call.waiting || endsTurn(call.args))) return false;
  const answered = new Set<string>();
  for (const message of messages) {
    if (message === undefined || message.role !== "tool" || typeof message.content === "string") continue;
    for (const part of message.content) if (part.type === "tool-result" && part.toolCallId != null) answered.add(part.toolCallId);
  }
  const errored = erroredToolResultIds(messages);
  return calls.every((call) => answered.has(call.id) && !errored.has(call.id));
}
