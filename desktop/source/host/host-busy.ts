/**
 * What keeps this computer awake (12 November 2026). The server's sleeper
 * reads `/health` every minute and leaves a busy computer running; until
 * now `/health` said only `isBusy`, so a computer that never slept could
 * not say why. `busyReasons` names each kind of work that holds it:
 *
 * - `turn`: an agent's turn is running.
 * - `background-shell`: a background command an agent started is running
 *   (or its result is still awaited after a restart), and it has been
 *   active in the last `BACKGROUND_SHELL_QUIET_MS`.
 * - `pending-wake`: a cloud agent's result is awaited (a kept wake).
 * - `revival`: a wake turn is delivering a finished task's result.
 * - `coding`: a cloud agent's coding runs on this computer.
 *
 * A background command alone no longer holds the computer awake for ever.
 * An agent that leaves a dev server or a `tail -f` running kept `isBusy`
 * true until the command ended, so the computer never slept. Now one that
 * has written no output, and that no turn has looked at, for
 * `BACKGROUND_SHELL_QUIET_MS` stops counting: the computer sleeps by the
 * usual rule, and the command, frozen with the whole computer, goes on
 * where it was when the computer wakes. Thirty minutes is three times the
 * server's quick sleep (`SIMEON_BOX_IDLE_AFTER_RUN`, 10 minutes), so a build
 * or a test suite started at the end of a turn still holds the computer
 * while it plausibly runs, and it is well under the five hours a command
 * watched after a restart is waited for (`SHELL_REWATCH_MAX_WAIT_MS`).
 */

export const BACKGROUND_SHELL_QUIET_MS = 30 * 60 * 1_000;

export type HostBusyReason =
  | "turn"
  | "background-shell"
  | "pending-wake"
  | "revival"
  | "coding";

/** A wake kept for after a restart (`listRecreateCarryPendingWakes`). */
export interface HostBusyPendingWake {
  readonly kind: string;
  readonly markedAtMs: number;
}

export interface HostBusyInputs {
  readonly nowMs: number;
  readonly runningTurns: boolean;
  /** A background command is running or watched (`hasRunningBackgroundShellWork`). */
  readonly backgroundShellRunning: boolean;
  /** The latest a running background command started, was watched again or wrote output; undefined when none says. */
  readonly backgroundShellActiveAtMs?: number | undefined;
  readonly pendingWakes: readonly HostBusyPendingWake[];
  readonly midDrainRevival: boolean;
  readonly coding: boolean;
  /** The last time a turn, a revival or coding was seen running: a turn may have read the command's output. */
  readonly lastWorkAtMs: number;
  readonly quietMs?: number;
}

export interface HostBusy {
  /** Work other than a turn holds the computer (what `busyOnlyAwaitingApproval` needs absent). */
  readonly otherWorkBusy: boolean;
  readonly busyReasons: readonly HostBusyReason[];
  /** A background command runs, or is awaited, but has been quiet past the limit: it no longer holds the computer. */
  readonly quietBackgroundShell: boolean;
}

export function describeHostBusy(input: HostBusyInputs): HostBusy {
  const quietMs = input.quietMs ?? BACKGROUND_SHELL_QUIET_MS;
  const shellWakes = input.pendingWakes.filter(wake => wake.kind === "shell");
  const otherWakes = input.pendingWakes.filter(wake => wake.kind !== "shell");
  const hasShell = input.backgroundShellRunning || shellWakes.length > 0;
  const shellActiveAtMs = Math.max(
    input.lastWorkAtMs,
    input.backgroundShellActiveAtMs ?? Number.NEGATIVE_INFINITY,
    ...shellWakes.map(wake => wake.markedAtMs)
  );
  const shellHolds = hasShell && input.nowMs - shellActiveAtMs < quietMs;
  const reasons: HostBusyReason[] = [];
  if (input.runningTurns) reasons.push("turn");
  if (shellHolds) reasons.push("background-shell");
  if (otherWakes.length > 0) reasons.push("pending-wake");
  if (input.midDrainRevival) reasons.push("revival");
  if (input.coding) reasons.push("coding");
  return {
    otherWorkBusy: shellHolds || otherWakes.length > 0 || input.midDrainRevival || input.coding,
    busyReasons: reasons,
    quietBackgroundShell: hasShell && !shellHolds
  };
}
