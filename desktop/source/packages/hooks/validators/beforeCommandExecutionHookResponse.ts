import { createValidationResult, isObject, isString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/** What a hook may decide before a shell command or an MCP tool runs. */
const PERMISSIONS: readonly unknown[] = ["allow", "deny", "ask"];

/** A message as an answer may hold one: a text, or not there. */
function isMessage(value: unknown): boolean {
  return value === undefined || isString(value);
}

/**
 * The check of a hook's answer before a shell command or an MCP tool runs:
 * a permission that is one of the three words exactly, and a message for
 * the person and one for the agent, each a text. All three may be left out.
 */
export function validateBeforeCommandExecutionHookResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const { permission, user_message: forPerson, agent_message: forAgent } = value;
  const errors: string[] = [];
  if (permission !== undefined && !PERMISSIONS.includes(permission)) {
    errors.push(`Invalid permission value. Expected one of: ${PERMISSIONS.join(", ")}, or undefined`);
  }
  if (!isMessage(forPerson)) errors.push("Invalid user_message value. Expected a string if provided");
  if (!isMessage(forAgent)) errors.push("Invalid agent_message value. Expected a string if provided");
  return createValidationResult(errors.length === 0, errors);
}
