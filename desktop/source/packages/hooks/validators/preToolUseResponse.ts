import { createValidationResult, isObject, isString, validateOptionalString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/** What a hook may decide before a tool is used. */
const PERMISSIONS: readonly unknown[] = ["allow", "deny", "ask"];

/** A message as an answer may hold one: a text, or not there. */
function isMessage(value: unknown): boolean {
  return value === undefined || isString(value);
}

/**
 * The check of a hook's answer before a tool is used: a permission that is
 * one of the three words exactly, a message for the person and one for the
 * agent, an updated input that is an object, and added context. All five
 * may be left out. What is wrong is told in that order.
 */
export function validatePreToolUseResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const { permission, user_message: forPerson, agent_message: forAgent, updated_input: newInput } = value;
  const errors: string[] = [];
  if (permission !== undefined && !PERMISSIONS.includes(permission)) {
    errors.push(`Invalid permission value. Expected one of: ${PERMISSIONS.join(", ")}, or undefined`);
  }
  if (!isMessage(forPerson)) errors.push("Invalid user_message value. Expected a string if provided");
  if (!isMessage(forAgent)) errors.push("Invalid agent_message value. Expected a string if provided");
  if (newInput !== undefined && !isObject(newInput)) errors.push("Invalid updated_input value. Expected a plain object if provided");
  validateOptionalString(value.additional_context, "additional_context", errors);
  return createValidationResult(errors.length === 0, errors);
}
