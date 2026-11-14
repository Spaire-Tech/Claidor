/**
 * What the checks of a hook's answer, and of a hooks file, are built from:
 * the shape of a verdict, and the tests of kind the checks share.
 */

/** A check's verdict: whether the thing was right and, when it was not, each thing wrong with it, in the order found. */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/** A text itself. A String object is not one. */
export const isString = (value: unknown): value is string => typeof value === "string";

/**
 * Anything with fields that is not a list: a plain object, and also a date,
 * a map or an object made by a class. A list is known by `Array.isArray`, so
 * one that comes from another realm, or through a proxy, is still a list.
 */
export const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/** A verdict. The list is the very one given, not a copy; with none given, a new empty one. */
export const createValidationResult = (isValid: boolean, errors: string[] = []): ValidationResult => ({ isValid, errors });

/** Adds one sentence to the list when a field holds anything but a text or nothing at all. */
export function validateOptionalString(value: unknown, fieldName: string, errors: string[]): void {
  if (value === undefined || isString(value)) return;
  errors.push(`${fieldName} must be a string if provided`);
}
