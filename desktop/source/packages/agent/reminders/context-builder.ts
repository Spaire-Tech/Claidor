/**
 * What a reminder is shown before it decides whether to speak: a tally of the
 * tool results in a conversation. How many there were, how many per tool, how
 * many times in a row each tool has failed, and how the last one ended.
 */

/** One result inside a tool message, as far as the tally needs it. */
interface ToolResultPart {
  readonly toolName?: string;
  readonly isError?: boolean;
  readonly result?: unknown;
}

interface ConversationMessage {
  readonly role: string;
  readonly content?: unknown;
}

export interface ReminderContext<TTodo = unknown> {
  readonly toolCallCount: number;
  readonly toolTypeCounters: Map<string, number>;
  readonly consecutiveFailures: Map<string, number>;
  readonly currentToolName: string | undefined;
  readonly currentToolError: Error | undefined;
  readonly currentToolSuccess: boolean | undefined;
  readonly todos: readonly TTodo[];
  readonly conversationMessages: readonly ConversationMessage[];
  readonly responseMessages: readonly ConversationMessage[];
}

/** The name a result is counted under when it carries none. */
const UNNAMED_TOOL = "unknown";

/** How the most recent result ended. */
interface LatestResult {
  readonly tool: string;
  readonly worked: boolean;
  readonly error: Error | undefined;
}

/**
 * The results a message holds: only a message of role "tool" whose content is
 * a list has any. Every other message counts for nothing.
 */
function toolResultsIn(message: ConversationMessage): readonly ToolResultPart[] | undefined {
  if (message.role !== "tool") {
    return undefined;
  }
  if (!Array.isArray(message.content)) {
    return undefined;
  }
  return message.content as ToolResultPart[];
}

/**
 * The error a failed result stands for, with the result as its text. It asks
 * the result once more whether it failed: a result is asked twice, once for
 * the tally and once here.
 */
function failureOf(result: ToolResultPart): Error | undefined {
  return result.isError ? new Error(String(result.result)) : undefined;
}

/**
 * Reads the conversation from its start and tallies every tool result. The
 * three lists given are handed back untouched, so a reminder can read them
 * itself.
 */
export function buildReminderContext<TTodo = unknown>(
  messages: readonly ConversationMessage[],
  todos: readonly TTodo[],
  responseMessages: readonly ConversationMessage[] = [],
): ReminderContext<TTodo> {
  const callsPerTool = new Map<string, number>();
  const failuresInARow = new Map<string, number>();
  let calls = 0;
  let latest: LatestResult | undefined;

  for (const message of messages) {
    const results = toolResultsIn(message);
    if (results === undefined) {
      continue;
    }
    for (const result of results) {
      const tool = result.toolName ?? UNNAMED_TOOL;
      const failed = Boolean(result.isError);
      calls += 1;
      callsPerTool.set(tool, (callsPerTool.get(tool) ?? 0) + 1);
      // A success ends the tool's run of failures; a failure makes it one longer.
      failuresInARow.set(tool, failed ? (failuresInARow.get(tool) ?? 0) + 1 : 0);
      latest = { tool, worked: !failed, error: failureOf(result) };
    }
  }

  return {
    toolCallCount: calls,
    toolTypeCounters: callsPerTool,
    consecutiveFailures: failuresInARow,
    currentToolName: latest?.tool,
    currentToolError: latest?.error,
    currentToolSuccess: latest?.worked,
    todos,
    conversationMessages: messages,
    responseMessages,
  };
}
