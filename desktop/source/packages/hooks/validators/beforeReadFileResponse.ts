import { createValidationResult, isObject, validateOptionalString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/** What a hook may decide before a file is read. "ask", which other steps take, is refused here. */
const PERMISSIONS: readonly unknown[] = ["allow", "deny"];

/**
 * The check of a hook's answer before a file is read: a permission that is
 * one of the two words exactly, and a message that is a text. Both may be
 * left out.
 */
export function validateBeforeReadFileResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const { permission } = value;
  const errors: string[] = [];
  if (permission !== undefined && !PERMISSIONS.includes(permission)) {
    errors.push(`Invalid permission value. Expected one of: ${PERMISSIONS.join(", ")}, or undefined`);
  }
  validateOptionalString(value.user_message, "user_message", errors);
  return createValidationResult(errors.length === 0, errors);
}
