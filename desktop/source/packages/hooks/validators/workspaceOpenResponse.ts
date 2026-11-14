import { createValidationResult, isObject, isString, type ValidationResult } from "./base.js";
import { validateBaseHookResponse } from "./baseHookResponse.js";

/**
 * The check of a hook's answer when a workspace opens: `pluginPaths`, when
 * it is there, is a list, and each thing in it a text that is not blank.
 * A gap in the list is passed over.
 */
export function validateWorkspaceOpenResponse(value: unknown): ValidationResult {
  if (!isObject(value)) return validateBaseHookResponse(value);
  const paths = value.pluginPaths;
  if (paths === undefined) return createValidationResult(true);
  if (!Array.isArray(paths)) return createValidationResult(false, ["pluginPaths must be an array of strings if provided"]);
  const errors: string[] = [];
  paths.forEach((path: unknown, at) => {
    if (!isString(path)) errors.push(`pluginPaths[${at}] must be a string`);
    else if (path.trim() === "") errors.push(`pluginPaths[${at}] must be a non-empty string`);
  });
  return createValidationResult(errors.length === 0, errors);
}
