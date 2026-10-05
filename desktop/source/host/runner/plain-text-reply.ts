import { clipForHostLog, HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";

/**
 * A user turn that ends on plain assistant text with no SendMessage (5 October
 * 2026). The brief tells the model its plain text is a scratchpad the person
 * never sees, and the OpenAI log of 3–4 October showed the model still
 * answering that way on about half the turns: the text was the reply ("On
 * it…", "Anytime, Bass."). Until now the host discarded it and paid a whole
 * hidden nudge turn to get the same words back through SendMessage. Now the
 * host delivers the text itself as the turn's message, and the nudge never
 * runs. Hidden turns (a routine, a cross-agent note) and subagents keep their
 * silence; so does text that reads as data rather than a reply.
 */
export const PLAIN_TEXT_REPLY_MAX_CHARS = 4_000;

export function plainTextReplyToDeliver(input: {
  readonly text: string;
  readonly sentMessageCount: number;
  readonly reacted: boolean;
  readonly hidden: boolean;
  readonly isSubagentRunner: boolean;
}): string | null {
  if (input.hidden || input.isSubagentRunner || input.sentMessageCount > 0 || input.reacted) return null;
  const text = input.text.trim();
  if (text.length === 0 || text.length > PLAIN_TEXT_REPLY_MAX_CHARS) return null;
  // JSON, XML-ish payloads and tool-call-shaped text are not a reply.
  if (/^[{[<]/.test(text) || /^\w+\(\{/.test(text)) return null;
  return text;
}

export function logPlainTextReplyDelivered(text: string): void {
  logHostLine(`${HOST_LOG_PREFIX} plain-text-reply delivered chars=${text.length} text=${clipForHostLog(text, 120)}`);
}
