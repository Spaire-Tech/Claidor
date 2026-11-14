import { createValidationResult, isObject, validateOptionalString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/**
 * The check of a hook's answer after a tool fails, and after a tool is
 * used: the added context, when there is one, is a text.
 */
export function validatePostToolUseFailureResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const errors: string[] = [];
  validateOptionalString(value.additional_context, "additional_context", errors);
  return createValidationResult(errors.length === 0, errors);
}
