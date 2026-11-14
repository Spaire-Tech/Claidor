/**
 * One added context written for the model, as it is put into a person's
 * message: between reminder tags, or not at all.
 */
import { sanitizeSystemReminderContent } from "../hooks/sanitize-system-reminder.js";
import { HOOK_ADDITIONAL_CONTEXT_MAX_CHARS } from "./limits.js";

/**
 * The reminder for one hook's added context, or undefined when there is
 * nothing to say: no text, only space, or a text over the limit. The limit
 * is checked a second time here because a carrier may come from anywhere,
 * not only from this package's own factory.
 *
 * `onOversize` is told the two lengths when a text is left out for being too
 * long, and is not called otherwise. The length is that of the trimmed text
 * as the hook wrote it: making the reminder tags inside it harmless comes
 * after, and may make it a little longer.
 */
export function renderHookAdditionalContextSystemReminder(
  content: string | null | undefined,
  onOversize?: ((actualLength: number, maxLength: number) => void) | undefined,
): string | undefined {
  const text = content?.trim();
  if (!text) return undefined;
  if (text.length > HOOK_ADDITIONAL_CONTEXT_MAX_CHARS) {
    onOversize?.(text.length, HOOK_ADDITIONAL_CONTEXT_MAX_CHARS);
    return undefined;
  }
  return `<system_reminder>\n${sanitizeSystemReminderContent(text)}\n</system_reminder>`;
}
