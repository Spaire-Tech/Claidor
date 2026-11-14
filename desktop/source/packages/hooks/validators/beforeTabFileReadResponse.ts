import { type ValidationResult } from "./base.js";
import { validateBeforeReadFileResponse } from "./beforeReadFileResponse.js";

/**
 * The check of a hook's answer before a tab file read. The answer holds
 * what an answer before any file read holds, and is checked the same way;
 * this is a function of its own, under the step's name.
 */
export function validateBeforeTabFileReadResponse(value: unknown): ValidationResult {
  return validateBeforeReadFileResponse(value);
}
