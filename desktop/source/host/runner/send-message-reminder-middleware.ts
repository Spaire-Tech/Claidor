export const SAND_SEND_MESSAGE_TOOL_NAME = "SendMessage";
// 2 October 2026 (the founder: "how talkative the AI is, its too much … He can talk when he really
// got something to say"): the nudge waits for a long silent stretch, fires once per stretch, and
// asks whether there is anything worth saying instead of demanding an update. At 6 it fired a
// minute into any browsing task and turned every task into a play-by-play.
export const DEFAULT_SEND_MESSAGE_REMINDER_THRESHOLD = 25;
export const DEFAULT_EARLY_RESULT_REMINDER_THRESHOLD = 0;
export const SEND_MESSAGE_REMINDER_MESSAGE = `<system_reminder>
You have been working for a while without a word to the user. If you have something worth telling them (a result they can use, a decision you need, a blocker, or, on a task that is taking many minutes, one short line on where things stand), invoke the SendMessage tool now; plain text never reaches them. If you have nothing worth saying, keep working and say nothing.
</system_reminder>`;
export const EARLY_RESULT_REMINDER_MESSAGE = `<system_reminder>
Remember: the user cannot see tool output or your thinking — only SendMessage reaches them. If you have produced a result or finished what they asked, send it now with SendMessage tool call before continuing or ending the turn. If you are still mid-task, keep working and send the result once you have it.
</system_reminder>`;
export const DISK_PRESSURE_REMINDER_MESSAGE = `<system_reminder>
The box is near disk capacity. Avoid disk-heavy work and do not fill the remaining capacity.
</system_reminder>`;
export interface MessageLike { readonly role: string; readonly content: string | readonly { readonly type?: string; readonly text?: string; readonly toolName?: string }[]; readonly providerOptions?: { readonly cursor?: Readonly<Record<string, unknown>> } }
export function getUserMessageText(message: MessageLike): string | undefined { if (message.role !== "user") return undefined; return typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text).join(""); }
export function isSendMessageReminderMessage(message: MessageLike): boolean { return getUserMessageText(message)?.includes(SEND_MESSAGE_REMINDER_MESSAGE) ?? false; }
export function isInjectedReminderMessage(message: MessageLike): boolean { const cursor = message.providerOptions?.cursor; return cursor?.sandSendMessageReminder === true || cursor?.sandEarlyResultReminder === true || cursor?.sandStartOfTurnAckReminder === true || cursor?.sandDiskPressureReminder === true || isSendMessageReminderMessage(message) || (getUserMessageText(message)?.includes(EARLY_RESULT_REMINDER_MESSAGE) ?? false); }
export function hasSendMessageCall(message: MessageLike): boolean { return message.role === "assistant" && Array.isArray(message.content) && message.content.some((part) => part.type === "tool-call" && part.toolName === SAND_SEND_MESSAGE_TOOL_NAME); }
export function countNonSendMessageToolCalls(message: MessageLike): number { return message.role !== "assistant" || !Array.isArray(message.content) ? 0 : message.content.filter((part) => part.type === "tool-call" && part.toolName !== SAND_SEND_MESSAGE_TOOL_NAME).length; }
export function countToolCallsSinceLastSendMessage(messages: readonly MessageLike[]): number { let count = 0; for (let index = messages.length - 1; index >= 0; index -= 1) { const message = messages[index]; if (message == null || message.role === "user" || message.role === "system" || hasSendMessageCall(message)) break; count += countNonSendMessageToolCalls(message); } return count; }
export function hasSendMessageSinceRealTurnStart(messages: readonly MessageLike[]): boolean { for (let index = messages.length - 1; index >= 0; index -= 1) { const message = messages[index]; if (message == null) continue; if (isInjectedReminderMessage(message)) continue; if (message.role === "user" || message.role === "system") return false; if (hasSendMessageCall(message)) return true; } return false; }
/** Tool calls since the last SendMessage, the last silence nudge, or the turn's start, whichever is latest. */
export function countToolCallsSinceLastSendMessageOrReminder(messages: readonly MessageLike[]): number { let count = 0; for (let index = messages.length - 1; index >= 0; index -= 1) { const message = messages[index]; if (message == null) continue; if (message.providerOptions?.cursor?.sandSendMessageReminder === true || isSendMessageReminderMessage(message)) break; if (isInjectedReminderMessage(message)) continue; if (message.role === "user" || message.role === "system" || hasSendMessageCall(message)) break; count += countNonSendMessageToolCalls(message); } return count; }
export function hasReminderFiredThisSilentStreak(messages: readonly MessageLike[]): boolean { for (let index = messages.length - 1; index >= 0; index -= 1) { const message = messages[index]; if (message == null) continue; if (isInjectedReminderMessage(message)) return true; if (message.role === "user" || message.role === "system" || hasSendMessageCall(message)) return false; } return false; }
export function createSendMessageReminderMessage(): MessageLike { return { role: "user", content: SEND_MESSAGE_REMINDER_MESSAGE, providerOptions: { cursor: { sandSendMessageReminder: true } } }; }
export function createEarlyResultReminderMessage(): MessageLike { return { role: "user", content: EARLY_RESULT_REMINDER_MESSAGE, providerOptions: { cursor: { sandEarlyResultReminder: true } } }; }
export interface PromptExecutor { getMessages(): readonly MessageLike[]; getState(): readonly MessageLike[]; clearMessages(): void; appendMessages(messages: MessageLike | readonly MessageLike[]): void; stream(...args: any[]): unknown }
export class DiskPressureReminderMiddleware {
  constructor(readonly innerExecutor: PromptExecutor, readonly episodeId: string) {}
  getMessages(): readonly MessageLike[] { return this.innerExecutor.getMessages(); }
  getState(): readonly MessageLike[] { return this.innerExecutor.getState(); }
  clearMessages(): void { this.innerExecutor.clearMessages(); }
  appendMessages(messages: MessageLike | readonly MessageLike[]): void { this.innerExecutor.appendMessages(messages); }
  stream(...args: any[]): unknown { if (!this.innerExecutor.getMessages().some((message) => message.providerOptions?.cursor?.sandDiskPressureReminderEpisodeId === this.episodeId)) this.innerExecutor.appendMessages({ role: "user", content: DISK_PRESSURE_REMINDER_MESSAGE, providerOptions: { cursor: { sandDiskPressureReminder: true, sandDiskPressureReminderEpisodeId: this.episodeId } } }); return this.innerExecutor.stream(...args); }
}
export function createDiskPressureReminderMiddleware(episodeId: string) { return (executor: PromptExecutor) => new DiskPressureReminderMiddleware(executor, episodeId); }
export class SendMessageReminderMiddleware {
  constructor(readonly innerExecutor: PromptExecutor, readonly thresholds: { threshold: number; earlyResultThreshold: number }) {}
  getMessages(): readonly MessageLike[] { return this.innerExecutor.getMessages(); }
  getState(): readonly MessageLike[] { return this.innerExecutor.getState(); }
  clearMessages(): void { this.innerExecutor.clearMessages(); }
  appendMessages(messages: MessageLike | readonly MessageLike[]): void { this.innerExecutor.appendMessages(messages); }
  stream(...args: any[]): unknown { const messages = this.innerExecutor.getMessages(), last = messages.at(-1); if (last == null || !isSendMessageReminderMessage(last)) { const count = countToolCallsSinceLastSendMessage(messages); if (count > this.thresholds.threshold && countToolCallsSinceLastSendMessageOrReminder(messages) > this.thresholds.threshold) this.innerExecutor.appendMessages(createSendMessageReminderMessage()); else if (count > this.thresholds.earlyResultThreshold && hasSendMessageSinceRealTurnStart(messages) && !hasReminderFiredThisSilentStreak(messages)) this.innerExecutor.appendMessages(createEarlyResultReminderMessage()); } return this.innerExecutor.stream(...args); }
}
export function createSendMessageReminderMiddleware(options: { threshold?: number; earlyResultThreshold?: number } = {}) { return (executor: PromptExecutor) => new SendMessageReminderMiddleware(executor, { threshold: options.threshold ?? DEFAULT_SEND_MESSAGE_REMINDER_THRESHOLD, earlyResultThreshold: options.earlyResultThreshold ?? 0 }); }
