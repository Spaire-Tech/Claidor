/**
 * The auto-run instructions a permissions file holds: what may run without
 * asking, and what may not. A project's file is read strictly: one mistake
 * anywhere in it and the whole file counts for nothing.
 */
import { parse, type ParseError } from "jsonc-parser";

export interface ParsedPermissionsAutoRunConfig {
  readonly allowInstructions: readonly string[] | undefined;
  readonly blockInstructions: readonly string[] | undefined;
}

export interface ProjectPermissionsFileConfig {
  readonly autoRun: ParsedPermissionsAutoRunConfig | undefined;
}

/** Something with named fields: an object that is neither null nor a list. */
function hasFields(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(entry: unknown): entry is string {
  return typeof entry === "string";
}

/** The texts of a list, in a list of their own; undefined when the field holds no list at all. */
function textsIn(field: unknown): string[] | undefined {
  return Array.isArray(field) ? field.filter(isText) : undefined;
}

/**
 * The instructions of one `autoRun` (or `autoReview`) entry. Both lists are
 * always named in the answer, each undefined when the entry holds no list
 * for it. `allow_instructions` is read before `block_instructions`.
 */
export function parsePermissionsAutoRunConfig(value: unknown): ParsedPermissionsAutoRunConfig | undefined {
  if (!hasFields(value)) return undefined;
  const allowInstructions = textsIn(value.allow_instructions);
  const blockInstructions = textsIn(value.block_instructions);
  return { allowInstructions, blockInstructions };
}

/**
 * A project's permissions file, from its text. Comments and trailing commas
 * are allowed; anything else that is not JSON, or a file that is not one
 * object, gives undefined. `autoReview` is read first, and `autoRun` only
 * when `autoReview` is missing or null.
 */
export function parseProjectPermissionsFileConfig(raw: string): ProjectPermissionsFileConfig | undefined {
  const mistakes: ParseError[] = [];
  const file: unknown = parse(raw, mistakes, { allowTrailingComma: true });
  if (mistakes.length > 0 || !hasFields(file)) return undefined;
  return { autoRun: parsePermissionsAutoRunConfig(file.autoReview ?? file.autoRun) };
}
