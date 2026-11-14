/**
 * Carriers written for the model, as they are added to a tool's result: each
 * one a reminder between reminder tags. Nothing here checks a length; a
 * carrier made by this package's factory is already within the limit.
 */
import type { HookAdditionalContext } from "../proto/generated/agent/v1/hook_additional_context_pb.js";
import { sanitizeSystemReminderContent } from "../hooks/sanitize-system-reminder.js";

/** One content between reminder tags, with any reminder tag inside it made harmless first. */
function asReminder(content: string): string {
  return `<system_reminder>\n${sanitizeSystemReminderContent(content)}\n</system_reminder>`;
}

/** What the carriers hold, each trimmed, in their order. A carrier that holds only space is left out. */
export function renderHookAdditionalContextContents(
  hookAdditionalContexts: readonly HookAdditionalContext[],
): string[] {
  const contents = hookAdditionalContexts.map((context) => context.content.trim());
  return contents.filter((content) => content.length > 0);
}

/** The same contents, each written as a reminder. */
export function renderHookAdditionalContextSystemReminders(
  hookAdditionalContexts: readonly HookAdditionalContext[],
): string[] {
  return renderHookAdditionalContextContents(hookAdditionalContexts).map((content) => asReminder(content));
}

/**
 * Adds the carriers' reminders to a tool's result. The result is kept in two
 * forms that must say the same: the texts that are joined into one, and the
 * list of content parts. Every reminder is written before either is touched,
 * then each goes to both, its text first.
 */
export function appendHookContextRemindersToCoreToolResult(
  textParts: string[],
  toolResultContent: Array<{ type: "text"; text: string }>,
  contexts: readonly HookAdditionalContext[],
): void {
  for (const text of renderHookAdditionalContextSystemReminders(contexts)) {
    textParts.push(text);
    toolResultContent.push({ type: "text", text });
  }
}
