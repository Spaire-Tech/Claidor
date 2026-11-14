/**
 * Makes the carrier of what a hook added to the model's context: one message
 * that names the step the hook ran at and holds the hook's text.
 */
import { HookAdditionalContext } from "../proto/generated/agent/v1/hook_additional_context_pb.js";
import { HookAdditionalContextTooLargeError } from "./errors.js";
import { HOOK_ADDITIONAL_CONTEXT_MAX_CHARS } from "./limits.js";

/** A hook's text without the space around it, or undefined when it gave none or nothing is left of it. */
function withoutSpaceAround(content: string | null | undefined): string | undefined {
  const text = content?.trim();
  if (text === undefined) return undefined;
  return text.length > 0 ? text : undefined;
}

/**
 * The carriers for what one hook added at one step: none when it added
 * nothing, otherwise one, with the text trimmed. The answer is a list so
 * that it can be handed to a collector as it is.
 *
 * A text over the limit is refused, not cut: the error says the step and
 * both lengths, and the caller decides what becomes of the hook's answer.
 */
export function createHookAdditionalContexts({
  hookEventName,
  additionalContext,
}: {
  hookEventName: string;
  additionalContext: string | null | undefined;
}): HookAdditionalContext[] {
  const content = withoutSpaceAround(additionalContext);
  if (content === undefined) return [];
  if (content.length > HOOK_ADDITIONAL_CONTEXT_MAX_CHARS) {
    throw new HookAdditionalContextTooLargeError({
      hookEventName,
      actualLength: content.length,
      maxLength: HOOK_ADDITIONAL_CONTEXT_MAX_CHARS,
    });
  }
  return [new HookAdditionalContext({ hookEventName, content })];
}
