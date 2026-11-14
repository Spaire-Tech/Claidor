import { createValidationResult, isObject, type ValidationResult } from "./base.js";

/**
 * The check every hook's answer goes through first: it must be an object.
 * For the steps whose answer holds nothing the engine reads, this is the
 * whole check.
 */
export function validateBaseHookResponse(value: unknown): ValidationResult {
  if (isObject(value)) return createValidationResult(true);
  return createValidationResult(false, ["Expected an object"]);
}
