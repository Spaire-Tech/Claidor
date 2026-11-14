import { createValidationResult, isObject, isString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/**
 * The check of a hook's answer before a conversation is compacted: the
 * message, when there is one, is a text.
 *
 * An answer with no field of its own that can be listed is right as it is.
 * Nothing is read from it, not even what its prototype holds.
 */
export function validatePreCompactResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  if (Object.keys(value).length === 0) return createValidationResult(true);
  const message = value.user_message;
  if (message === undefined || isString(message)) return createValidationResult(true);
  return createValidationResult(false, ["user_message must be a string"]);
}
