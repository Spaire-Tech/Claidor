/**
 * Keeps a text from opening or closing a reminder on its own. Reminders are
 * handed to the model between `<system_reminder>` tags; a text that comes
 * from outside (a hook's added context, say) is put between those tags, and
 * must not be able to close them early or open more.
 */

/** A reminder tag, opening or closing, whatever its capitals. */
const REMINDER_TAG = /<(\/?)system_reminder>/gi;

/**
 * The text with every reminder tag made harmless: an underscore before its
 * end, and its name in small letters. The slash of a closing tag is kept.
 */
export const sanitizeSystemReminderContent = (content: string): string => {
  return content.replace(REMINDER_TAG, (_tag, slash: string) => `<${slash}system_reminder_>`);
};
