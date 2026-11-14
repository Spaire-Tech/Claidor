import { createValidationResult, isObject, validateOptionalString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/**
 * The check of a hook's answer when the agent stops, and when a subagent
 * does: the follow-up message, when there is one, is a text.
 */
export function validateStopResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const errors: string[] = [];
  validateOptionalString(value.followup_message, "followup_message", errors);
  return createValidationResult(errors.length === 0, errors);
}
