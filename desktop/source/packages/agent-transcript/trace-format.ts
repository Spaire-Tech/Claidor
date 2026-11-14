/**
 * The trace of a cloud agent's conversation: its messages as a flat list of
 * plain lines. Each message gives one line; each tool result of the
 * assistant gives one more, after the assistant's own line.
 */
import { ConversationMessage_MessageType, type ConversationMessage } from "../proto/generated/simeon/v1/chat_pb.js";

/** How much of a history is shown, and how its first message is named. */
export enum HistoryVisibilityMode {
  /** All of it, a first message from the human named as the system's. */
  INTERNAL = "INTERNAL",
  /** All but the first two messages. */
  EXTERNAL = "EXTERNAL",
  /** All of it, every message named after who sent it. */
  NO_PREAMBLE = "NO_PREAMBLE",
}

type ToolResult = ConversationMessage["toolResults"][number];
type Line = Record<string, unknown>;

/** Text read as the JSON it holds; text that is not JSON stays the text it is. */
function readAsJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Who a line is from. Only a message from the human can be the system's, and only where the caller says so. */
function speakerOf(type: ConversationMessage_MessageType, asSystem: boolean): string {
  if (type === ConversationMessage_MessageType.HUMAN) return asSystem ? "system" : "user";
  return type === ConversationMessage_MessageType.AI ? "assistant" : "unknown";
}

/** Puts on a line which call it is about: its id, its tool and its arguments, each only when there is one. The raw arguments come before the others. */
function nameCall(line: Line, result: ToolResult): void {
  if (result.toolCallId) line.tool_call_id = result.toolCallId;
  if (result.toolName) line.tool_name = result.toolName;
  const args = result.rawArgs || result.args;
  if (args) line.tool_args = readAsJson(args);
}

/** Puts on a line when the call started and ended, as numbers, and how long it took when both are known. */
function timeCall(line: Line, result: ToolResult): void {
  const started = result.startedAtMs === undefined ? undefined : Number(result.startedAtMs);
  const completed = result.completedAtMs === undefined ? undefined : Number(result.completedAtMs);
  if (started !== undefined) line.started_at_ms = started;
  if (completed !== undefined) line.completed_at_ms = completed;
  if (started !== undefined && completed !== undefined) line.duration_ms = completed - started;
}

/** What a tool answered: its content if it has any, else the result it carries, under its kind. Nothing when it has neither. */
function answerOf(result: ToolResult): unknown {
  if (result.content) return readAsJson(result.content);
  const carried = result.result?.result;
  if (!carried?.case || carried.value === undefined) return undefined;
  return { resultType: carried.case, value: carried.value };
}

/** A tool result as it is listed on the assistant's line. */
function callOf(result: ToolResult): Line {
  const call: Line = {};
  nameCall(call, result);
  timeCall(call, result);
  return call;
}

/** A tool result as a line of its own. Its arguments are read again, so the two lines share nothing that can be changed. */
function toolLineOf(result: ToolResult): Line {
  const line: Line = { role: "tool" };
  nameCall(line, result);
  const answer = answerOf(result);
  if (answer !== undefined) line.tool_result = answer;
  timeCall(line, result);
  return line;
}

/**
 * The lines of a conversation's trace, in the order of its messages. A line has its message's role, its text and
 * its thinking when there are any, and for the assistant the calls it made; each of those calls follows as a
 * line of the tool's.
 *
 * `message.text`, `message.thinking.text` and `message.toolResults` are read below in the words they were read in
 * before: handed something that is no message, the runtime's own error quotes the code it failed in
 * ("message.toolResults is not iterable"), and with the same words it reads the same.
 */
export function convertConversationMessagesToTrace(messages: readonly ConversationMessage[], visibilityMode: HistoryVisibilityMode): Array<Record<string, unknown>> {
  const lines: Line[] = [];
  const internal = visibilityMode === HistoryVisibilityMode.INTERNAL;
  const first = visibilityMode === HistoryVisibilityMode.EXTERNAL ? 2 : 0;
  for (let at = first; at < messages.length; at++) {
    const message = messages[at] as ConversationMessage;
    const line: Line = { role: speakerOf(message.type, internal && at === 0) };
    // Text and thinking are kept as they were written, when there is more to them than blanks.
    if (message.text && message.text.trim().length > 0) line.text = message.text;
    if (message.thinking?.text && message.thinking.text.trim().length > 0) line.thinking = message.thinking.text;
    // Only the assistant's tool results are kept.
    const fromAssistant = message.type === ConversationMessage_MessageType.AI;
    if (fromAssistant && message.toolResults.length > 0) line.tool_calls = message.toolResults.map((toolResult) => callOf(toolResult));
    lines.push(line);
    if (fromAssistant) for (const toolResult of message.toolResults) lines.push(toolLineOf(toolResult));
  }
  return lines;
}
