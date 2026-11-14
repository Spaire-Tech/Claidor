/**
 * What is said when a hook stops an action. A hook can refuse the action (a
 * denial), or the hook itself can fail to run, and then the action is
 * blocked all the same: a hook that cannot be asked counts as a refusal
 * (fail-closed).
 */

/** Where the person can look at their hooks. Both messages end with it. */
export const HOOK_SETTINGS_HINT = "To view or modify configured hooks, see the hooks in your settings.";

/**
 * Words for the agent, at the end of a denial. The tools tell a hook's
 * denial from a person's own refusal by finding this sentence in an error's
 * message (`packages/agent/tools/core.ts`), so it stays word for word.
 */
export const HOOK_DENIAL_AGENT_NOTE = "Agent note: Do not suggest workarounds to the blocked tool.";

/** Why a hook that failed blocks the action. */
const FAIL_CLOSED_EXPLANATION =
  "This is a safety measure (fail-closed) - when hooks cannot be evaluated, the action is blocked to prevent potentially unsafe operations.";

/** Texts one after the other, a blank line between them. */
function paragraphs(...texts: string[]): string {
  return texts.join("\n\n");
}

/** How a sentence ends: with what was said, after a colon, or with a full stop when nothing was. */
function ending(said: string | null | undefined): string {
  return said ? `: ${said}` : ".";
}

/** What a thrown thing says: an error's own message, anything else as it prints. */
function saidBy(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * A hook refused the action. The fields are an error's own, set in this
 * order, which is the order they are listed and written out in.
 */
export class HookDeniedError extends Error {
  readonly failureType = "permission_denied";
  override readonly name = "HookDeniedError";
  readonly reason: string;

  constructor(reason: string) {
    super(`Hook denied: ${reason}`);
    this.reason = reason;
  }
}

/**
 * A hook could not be run, and the action is blocked because of it. What
 * went wrong is kept in `cause` as a field like the others: listed and
 * written out with them, and there even when nothing was given.
 */
export class FailClosedError extends Error {
  readonly failureType = "error";
  override readonly name = "FailClosedError";
  readonly reason: string;
  override readonly cause: unknown;

  constructor(reason: string, cause: unknown) {
    super(`Hook failed (fail-closed): ${reason}`);
    this.reason = reason;
    this.cause = cause;
  }
}

/**
 * Runs a hook's work, and turns anything it throws, now or later, into a
 * `FailClosedError` that names the action and carries what was thrown.
 *
 * The parameter keeps the name `fn`: when it is given something that cannot
 * be called, the runtime's own words ("fn is not a function") end up in the
 * message.
 */
export async function withFailClosed<T>(fn: () => T | Promise<T>, actionDescription: string | null | undefined): Promise<T> {
  try {
    // Waited for here, so that work that fails later is caught below too.
    return await fn();
  } catch (error) {
    throw new FailClosedError(createHookFailClosedMessage(actionDescription, saidBy(error)), error);
  }
}

/** The message with the note to the agent after it, unless it holds the note already. */
export function appendAgentDenialNote(message: string): string {
  return message.includes(HOOK_DENIAL_AGENT_NOTE) ? message : paragraphs(message, HOOK_DENIAL_AGENT_NOTE);
}

/** What the person and the agent are told when a hook refuses: what was blocked, what the hook said, where the hooks are, and the note to the agent. */
export function createHookDenialMessage(actionDescription: string, userMessage: string | null | undefined): string {
  const blocked = `${actionDescription} was blocked by a hook${ending(userMessage)}`;
  return appendAgentDenialNote(paragraphs(blocked, HOOK_SETTINGS_HINT));
}

/**
 * What is told when a hook failed to run: what was blocked ("Action" when
 * it is not named), the error, why a failure blocks, and where the hooks
 * are. It carries no note to the agent.
 */
export function createHookFailClosedMessage(actionDescription: string | null | undefined, errorMessage: string | null | undefined): string {
  // The error is written out before the action is, as it always was.
  const failure = ending(errorMessage);
  const blocked = `${actionDescription ?? "Action"} was blocked because a configured hook failed to execute${failure}`;
  return paragraphs(blocked, FAIL_CLOSED_EXPLANATION, HOOK_SETTINGS_HINT);
}
