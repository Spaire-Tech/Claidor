/**
 * What the rest of the host knows about the agents' computer without
 * knowing how it is run: the sentences said when it cannot be used yet,
 * the errors its parts throw, and how its windows are numbered.
 */

// What is said when the computer was needed and could not be used.
export const SAND_BOX_NOT_READY_MESSAGE = "The computer is still starting up (downloading its image or booting). Try again in a moment.";
export const SAND_BOX_NOT_RESPONDING_MESSAGE =
  "The computer isn't responding — it may be wedged. Try again in a moment, or recover it from Settings → Updates → Update Simeon's Computer.";
export const SAND_BOX_NO_MONITOR_AVAILABLE_MESSAGE =
  "Every desktop monitor on the shared computer is in use right now, so this agent can't get its own screen. Wait a moment and try again — one frees up when another agent or parallel computer-use subagent finishes.";

/**
 * The computer's daemon could not be reached. `outcome` is the caller's word
 * for how the last attempt ended; "timeout" and "crash" are the two that
 * are answered with "isn't responding" below.
 */
export class SandBoxDaemonUnreachableError extends Error {
  constructor(
    readonly outcome: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SandBoxDaemonUnreachableError";
  }
}

/** Every monitor of the shared computer is taken, so an agent cannot be given a screen of its own. */
export class SandBoxNoMonitorAvailableError extends Error {
  constructor(message = "No private desktop monitor is available on the shared box.") {
    super(message);
    this.name = "SandBoxNoMonitorAvailableError";
  }
}

/** The outcomes of an unreachable daemon that mean it is not responding, where any other means it is still starting. */
const STUCK_OUTCOMES: ReadonlySet<string> = new Set(["timeout", "crash"]);

/** The sentence to say, from the error that kept the computer from being used. */
export function boxNotReadyMessageForError(error: unknown): string {
  if (error instanceof SandBoxNoMonitorAvailableError) return SAND_BOX_NO_MONITOR_AVAILABLE_MESSAGE;
  const stuck = error instanceof SandBoxDaemonUnreachableError && STUCK_OUTCOMES.has(error.outcome);
  return stuck ? SAND_BOX_NOT_RESPONDING_MESSAGE : SAND_BOX_NOT_READY_MESSAGE;
}

/**
 * The screen control put in place when no monitor is free: every use of it
 * fails with the no-monitor error. There is one of it, and it is told from
 * a working one by being this very object.
 */
export const noMonitorComputerUseExecutor = {
  async execute(): Promise<never> {
    throw new SandBoxNoMonitorAvailableError();
  },
};

export function isNoMonitorComputerUseExecutor(executor: unknown): boolean {
  return executor === noMonitorComputerUseExecutor;
}

// Windows on the computer's desktop are numbered from 1. Window 1 is the primary one; the further windows a shared
// computer hands out start at 2.
export const SAND_BOX_PRIMARY_WINDOW_INDEX = 1;
export const SAND_BOX_FIRST_FORK_WINDOW_INDEX = 2;

/** Any number up to the first window's counts as the first window. */
export function isPrimaryWindowIndex(windowIndex: number): boolean {
  return windowIndex <= SAND_BOX_PRIMARY_WINDOW_INDEX;
}

/** Thrown for a computer that has no way to take an environment update. */
export class BoxEnvironmentSyncUnsupportedError extends Error {
  constructor() {
    super("This box does not support environment sync.");
    this.name = "BoxEnvironmentSyncUnsupportedError";
  }
}

/** Thrown for a computer that has no way to load MCP servers. */
export class BoxMcpUnsupportedError extends Error {
  constructor() {
    super("This box does not support running MCP servers.");
    this.name = "BoxMcpUnsupportedError";
  }
}
