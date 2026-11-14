/**
 * Reminders are short texts for the model, written into a step's own tool
 * results. After a step that called tools, each reminder is shown the tally
 * of the conversation and may give a text; the texts that were given are
 * added, as one text entry, to the last tool result of the step.
 */
import { buildReminderContext, type ReminderContext } from "./context-builder.js";

/** One part of a tool message, as far as a reminder's text needs it. */
interface ToolResultPart {
  readonly type?: string;
  readonly experimental_content?: Array<{ type: string; text: string }>;
}

interface ResponseMessage {
  readonly role: string;
  readonly content?: ToolResultPart[] | unknown;
}

interface Reminder<TTodo> {
  shouldTrigger(context: ReminderContext<TTodo>): boolean;
  generate(context: ReminderContext<TTodo>): string | undefined;
}

/** What stands between two reminders' texts: one empty line. */
const BETWEEN_TEXTS = "\n\n";

/**
 * Asks every reminder in turn, and keeps what the ones that trigger give. A
 * reminder that triggers and gives nothing, or an empty text, adds nothing.
 */
function textsGiven<TTodo>(reminders: readonly Reminder<TTodo>[], context: ReminderContext<TTodo>): string[] {
  const texts: string[] = [];
  for (const reminder of reminders) {
    if (!reminder.shouldTrigger(context)) {
      continue;
    }
    const text = reminder.generate(context);
    if (text && text.length > 0) {
      texts.push(text);
    }
  }
  return texts;
}

/**
 * The part a reminder's text belongs to: the last part of the last tool
 * message, and only when that part is a tool result. An earlier tool message
 * or an earlier part is never used instead.
 */
function lastToolResultOf(responseMessages: ResponseMessage[]): ToolResultPart | undefined {
  const toolMessages = responseMessages.filter((message) => message.role === "tool" && Array.isArray(message.content));
  const message = toolMessages.length > 0 ? toolMessages[toolMessages.length - 1] : undefined;
  if (!message || !Array.isArray(message.content)) {
    return undefined;
  }
  const part: ToolResultPart | undefined = message.content[message.content.length - 1];
  if (!part || part.type !== "tool-result") {
    return undefined;
  }
  return part;
}

export async function applyRemindersToToolResults<TTodo = unknown>(
  responseMessages: ResponseMessage[],
  reminders: readonly Reminder<TTodo>[],
  currentTodos: readonly TTodo[],
  conversationMessages: readonly ResponseMessage[],
): Promise<void> {
  if (reminders.length === 0) {
    return;
  }
  // The tally is of the conversation so far; the step's own results are only handed along.
  const context = buildReminderContext(conversationMessages, currentTodos, responseMessages);
  const texts = textsGiven(reminders, context);
  if (texts.length === 0) {
    return;
  }
  const text = texts.join(BETWEEN_TEXTS);
  // The place is looked for only now: a reminder may have changed the response while it was asked.
  const result = lastToolResultOf(responseMessages);
  if (result !== undefined && Array.isArray(result.experimental_content)) {
    result.experimental_content.push({ type: "text", text });
  }
}
