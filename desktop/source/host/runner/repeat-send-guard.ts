/**
 * One run, one copy of a text message (26 September 2026).
 *
 * After a Notion sign-in, the resume run (the upstream app's prompt: "Your first
 * action is a SendMessage telling the user it's connected … If there was
 * nothing else to do, just confirm it's ready and ask what they'd like")
 * sent "Notion is connected and ready…" and, on its next step, the same text
 * again: one run, two model calls, two messages (box log, t38s6 and t38s7).
 * Nothing on the send path refused an identical second text. A text
 * identical to the last one this run sent is now not posted again, and the
 * model gets the first message's id back. The run is its ack token; a run
 * without one is bounded to two minutes, so a routine that says the same
 * thing every day still says it.
 */
export const REPEAT_SEND_UNKEYED_WINDOW_MS = 2 * 60_000;

export interface RepeatSendMessage {
  readonly type?: unknown;
  readonly content?: unknown;
  readonly images?: unknown;
  readonly channel?: unknown;
}

function textContent(message: RepeatSendMessage): string | undefined {
  if (message.type !== "text" || typeof message.content !== "string") return undefined;
  if (Array.isArray(message.images) && message.images.length > 0) return undefined;
  if (message.channel != null && message.channel !== "") return undefined;
  const content = message.content.trim();
  return content.length === 0 ? undefined : content;
}

export function createRepeatSendGuard() {
  let last: { readonly runKey: string | undefined; readonly content: string; readonly atMs: number; readonly messageId: string | undefined } | undefined;
  return {
    /** The first copy's id (possibly undefined) when this is a repeat; null when it should be sent. */
    repeatOf(runKey: string | undefined, message: RepeatSendMessage, atMs: number): string | undefined | null {
      const content = textContent(message);
      if (content === undefined || last === undefined || last.content !== content) return null;
      const sameRun = runKey !== undefined
        ? last.runKey === runKey
        : last.runKey === undefined && atMs - last.atMs < REPEAT_SEND_UNKEYED_WINDOW_MS;
      return sameRun ? last.messageId : null;
    },
    noteSent(runKey: string | undefined, message: RepeatSendMessage, atMs: number, messageId: string | undefined): void {
      const content = textContent(message);
      last = content === undefined ? undefined : { runKey, content, atMs, messageId };
    },
  };
}
