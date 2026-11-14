import { createValidationResult, isObject, isString, validateOptionalString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/** Adds what is wrong with `env`: it must be an object, and each value it lists as its own a text. */
function checkEnv(env: unknown, errors: string[]): void {
  if (env === undefined) return;
  if (!isObject(env)) {
    errors.push("env must be an object if provided");
    return;
  }
  for (const [name, setting] of Object.entries(env)) {
    if (!isString(setting)) errors.push(`env value for "${name}" must be a string`);
  }
}

/**
 * The check of a hook's answer when a session starts: `env`, the added
 * context, `continue` (a yes or a no) and the message. All four may be left
 * out. What is wrong is told in that order.
 */
export function validateSessionStartResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const errors: string[] = [];
  checkEnv(value.env, errors);
  validateOptionalString(value.additional_context, "additional_context", errors);
  const goOn = value.continue;
  if (goOn !== undefined && typeof goOn !== "boolean") errors.push("continue must be a boolean if provided");
  validateOptionalString(value.user_message, "user_message", errors);
  return createValidationResult(errors.length === 0, errors);
}
