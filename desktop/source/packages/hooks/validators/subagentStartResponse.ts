import { createValidationResult, isObject, validateOptionalString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/** What a hook may decide before a subagent starts. */
const PERMISSIONS = ["allow", "deny", "ask"];

/**
 * The check of a hook's answer before a subagent starts: a permission and a
 * message that is a text. Both may be left out.
 *
 * The permission is read as it prints, not as it is: a list that holds one
 * of the three words alone is taken for the word, and a permission that
 * cannot be printed ends the check with the runtime's own error.
 */
export function validateSubagentStartResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const { permission } = value;
  const errors: string[] = [];
  if (permission !== undefined && !PERMISSIONS.includes(String(permission))) {
    errors.push(`Invalid permission value. Expected one of: ${PERMISSIONS.join(", ")}, or undefined`);
  }
  validateOptionalString(value.user_message, "user_message", errors);
  return createValidationResult(errors.length === 0, errors);
}
