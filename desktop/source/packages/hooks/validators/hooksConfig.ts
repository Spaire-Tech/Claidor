/**
 * The check of a hooks file: a version, and under `hooks` a list of scripts
 * for each step. A script is a command, or a prompt that may name a model.
 *
 * Everything wrong is collected, not only the first thing: a script's
 * mistakes are joined on one line under its place in its list
 * ("stop[2]: …"), after the file's own mistakes and in the file's order.
 */
import { HookStep } from "../hook-step.js";
import { createValidationResult, isObject, isString, type ValidationResult } from "./base.js";

/** A timeout above this many seconds, one hour, is right but warned about. */
const LONG_TIMEOUT = 3600;

/** What a script of a prompt must hold: a prompt that is not blank and, when it names a model, a name that is not blank. */
function checkPrompt(script: Record<string, unknown>, errors: string[]): void {
  const { prompt, model } = script;
  if (!isString(prompt)) errors.push("Prompt hook must have a 'prompt' property (string)");
  else if (prompt.trim() === "") errors.push("Prompt hook 'prompt' property cannot be empty");
  if (model === undefined) return;
  if (!isString(model)) errors.push("Prompt hook 'model' must be a string if provided");
  else if (model.trim() === "") errors.push("Prompt hook 'model' cannot be an empty string");
}

/** What a script must hold for its kind. With no type it is a command, and a command may be an empty text. */
function checkKind(script: Record<string, unknown>, errors: string[]): void {
  const { type } = script;
  if (type === "prompt") {
    checkPrompt(script, errors);
    return;
  }
  if (type !== "command" && type !== undefined) {
    errors.push(`Invalid hook type: "${type}". Must be "command", "prompt", or omitted (defaults to "command")`);
    return;
  }
  if (!isString(script.command)) errors.push("Hook script command must be a string");
}

/** What the pattern maker said was wrong: its error's message, or the thing thrown as it prints when it has none. */
function saidBy(thrown: unknown): unknown {
  return (thrown as { message?: unknown } | null)?.message ?? String(thrown);
}

/**
 * A matcher is a text the runtime can make a pattern from. An empty one
 * and a lone star stand for everything and are not tried as patterns.
 */
function checkMatcher(matcher: unknown, errors: string[]): void {
  if (matcher === undefined) return;
  if (!isString(matcher)) {
    errors.push("Hook script matcher must be a string if provided");
    return;
  }
  if (matcher === "" || matcher === "*") return;
  try {
    new RegExp(matcher);
  } catch (error) {
    errors.push(`Hook script matcher "${matcher}" is not a valid regex: ${saidBy(error)}`);
  }
}

/** A timeout is a number of seconds above zero. A very long one is only warned about, on the console. */
function checkTimeout(timeout: unknown, errors: string[]): void {
  if (timeout === undefined) return;
  if (typeof timeout !== "number") errors.push("Hook script timeout must be a number (seconds)");
  else if (timeout <= 0) errors.push("Hook script timeout must be a positive number");
  else if (timeout > LONG_TIMEOUT) console.warn(`[hooks] Hook timeout of ${timeout}s is very long (>1 hour)`);
}

/** A loop limit is a whole number above zero, or null for no limit. */
function checkLoopLimit(limit: unknown, errors: string[]): void {
  if (limit === undefined || limit === null) return;
  if (typeof limit !== "number") errors.push("Hook script loop_limit must be a positive integer or null");
  else if (!Number.isInteger(limit)) errors.push("Hook script loop_limit must be an integer");
  else if (limit <= 0) errors.push("Hook script loop_limit must be a positive integer (use null for no limit)");
}

/** Everything wrong with one script, in the order told: its kind, then its matcher, timeout, loop limit and failClosed. */
function mistakesInScript(script: unknown): string[] {
  if (!isObject(script)) {
    return ["Hook script must be an object with either a 'command' property (command hook) or 'type: \"prompt\"' with a 'prompt' property (prompt hook)"];
  }
  const errors: string[] = [];
  checkKind(script, errors);
  checkMatcher(script.matcher, errors);
  checkTimeout(script.timeout, errors);
  checkLoopLimit(script.loop_limit, errors);
  if (script.failClosed !== undefined && typeof script.failClosed !== "boolean") errors.push("Hook script failClosed must be a boolean");
  return errors;
}

/** Everything wrong with what one step holds: one line for each script that has mistakes, or one line when it is not a list. */
function mistakesInStep(step: string, scripts: unknown): string[] {
  if (!Array.isArray(scripts)) return [`${step} must be an array of hook scripts`];
  const errors: string[] = [];
  // Every place of the list is looked at, a gap included: a gap is not a script.
  for (let at = 0; at < scripts.length; at += 1) {
    const mistakes = mistakesInScript(scripts[at]);
    if (mistakes.length > 0) errors.push(`${step}[${at}]: ${mistakes.join(", ")}`);
  }
  return errors;
}

/**
 * The check of a whole hooks file: an object with a version that is a whole
 * number, 1 or more, and with `hooks`, an object that holds a list of
 * scripts under the value of a step. A step that holds nothing is passed
 * over. `stop_hook_loop_limit` is no longer read, and warned about.
 */
export function validateHooksConfig(value: unknown): ValidationResult {
  if (!isObject(value)) return createValidationResult(false, ["Hooks config must be an object"]);
  const { version, hooks } = value;
  const errors: string[] = [];
  if (typeof version !== "number") errors.push("Config version must be a number");
  else if (!Number.isInteger(version) || version < 1) errors.push("Config version must be a positive integer");
  if (!isObject(hooks)) {
    // Without hooks there is nothing more to look at.
    errors.push("Config hooks must be an object");
    return createValidationResult(false, errors);
  }
  if (value.stop_hook_loop_limit !== undefined) {
    console.warn("[hooks] DEPRECATION WARNING: 'stop_hook_loop_limit' is deprecated. Use 'loop_limit' on individual hook scripts instead. The configured value is being ignored.");
  }
  // The steps are read now, at each check, and a hook is known by a step's value.
  const steps: string[] = Object.values(HookStep);
  for (const [step, scripts] of Object.entries(hooks)) {
    if (!steps.includes(step)) {
      errors.push(`Unknown hook type: ${step}. Valid types are: ${steps.join(", ")}`);
      continue;
    }
    if (scripts === undefined) continue;
    // A step's lines are handed on in one call, as they always were. More
    // lines than a call can carry end the check with the runtime's RangeError.
    errors.push(...mistakesInStep(step, scripts));
  }
  return createValidationResult(errors.length === 0, errors);
}
