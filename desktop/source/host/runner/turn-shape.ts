import { isInjectedReminderMessage } from "./send-message-reminder-middleware.js";
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

function deliveryToolCallIds(message: CoreMessage): string[] {
  if (message.role !== "assistant" || typeof message.content === "string") {
    return [];
  }
  return message.content.flatMap((part) =>
    part.type === "tool-call"
      && part.toolName != null
      && DELIVERY_TOOL_NAMES.has(part.toolName)
      && part.toolCallId != null
      ? [part.toolCallId]
      : []
  );
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
  const tailNames = toolCallNames(tail);
  if (tailNames.length === 0 || hasDeliveryToolCall(tailNames)) return false;

  let boundary = -1;
  for (let index = tailIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined || isInjectedReminderMessage(message)) continue;
    if (message.role === "user" || message.role === "system") {
      boundary = index;
      break;
    }
  }

  const erroredIds = erroredToolResultIds(messages);
  let ackedFirst = false;
  for (let index = boundary + 1; index <= tailIndex; index += 1) {
    const message = messages[index];
    if (message === undefined || message.role !== "assistant") continue;
    const names = toolCallNames(message);
    if (names.length === 0) continue;
    if (!ackedFirst) {
      if (!hasDeliveryToolCall(names)) return false;
      ackedFirst = true;
    } else if (
      deliveryToolCallIds(message).some((id) => !erroredIds.has(id))
    ) {
      return false;
    }
  }
  return ackedFirst;
}

// The model's step ended its turn when every call in it is a SendMessage that
// says so (final, a question, a secret request; `sendMessageEndsTurn`) and
// every one was delivered. Then the loop stops without asking the model once
// more: that last call read the whole conversation to answer nothing.
export function stepEndsTurn(
  responseMessages: readonly unknown[],
  endsTurn: (args: unknown) => boolean,
): boolean {
  const messages = responseMessages.map(asCoreMessage);
  const calls: { readonly id: string; readonly args: unknown }[] = [];
  for (const message of messages) {
    if (message === undefined || message.role !== "assistant" || typeof message.content === "string") continue;
    for (const part of message.content) {
      if (part.type !== "tool-call") continue;
      if (part.toolName !== SAND_SEND_MESSAGE_TOOL_NAME || part.toolCallId == null) return false;
      calls.push({ id: part.toolCallId, args: (part as { readonly args?: unknown }).args });
    }
  }
  if (calls.length === 0 || !calls.every((call) => endsTurn(call.args))) return false;
  const answered = new Set<string>();
  for (const message of messages) {
    if (message === undefined || message.role !== "tool" || typeof message.content === "string") continue;
    for (const part of message.content) if (part.type === "tool-result" && part.toolCallId != null) answered.add(part.toolCallId);
  }
  const errored = erroredToolResultIds(messages);
  return calls.every((call) => answered.has(call.id) && !errored.has(call.id));
}
