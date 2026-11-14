import { createValidationResult, isObject, validateOptionalString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/**
 * The check of a hook's answer before a prompt is submitted: `continue` a
 * yes or a no, and the message and the added context each a text. All three
 * may be left out.
 */
export function validateBeforePromptSubmitResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const goOn = value.continue;
  const errors: string[] = [];
  if (goOn !== undefined && typeof goOn !== "boolean") errors.push("continue must be a boolean if provided");
  validateOptionalString(value.user_message, "user_message", errors);
  validateOptionalString(value.additional_context, "additional_context", errors);
  return createValidationResult(errors.length === 0, errors);
}
