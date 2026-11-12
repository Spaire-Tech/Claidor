import { BACKGROUND_COMMAND_HOLD_MS } from "../shared/background-commands.js";

/**
 * What keeps this computer awake (12 November 2026). The server's sleeper
 * reads `/health` every minute and leaves a busy computer running; until
 * now `/health` said only `isBusy`, so a computer that never slept could
 * not say why. `busyReasons` names each kind of work that holds it:
 *
 * - `turn`: an agent's turn is running.
 * - `background-shell`: a command an agent left running in the background
 *   is running (or its result is still awaited after a restart).
 * - `pending-wake`: a cloud agent's result is awaited (a kept wake).
 * - `revival`: a wake turn is delivering a finished task's result.
 * - `coding`: a cloud agent's coding runs on this computer.
 *
 * A background command holds the computer for as long as it runs, quiet or
 * not (12 November 2026, the founder: the agent is woken when it finishes,
 * so the computer must not sleep under it). It cannot hold it for ever: the
 * computer's command runner stops a background command at its limit
 * (`BACKGROUND_COMMAND_LIMIT_MS`, two hours), so a command, or the wake kept
 * for one, that has not been seen at work for that long and ten minutes more
 * (`BACKGROUND_SHELL_QUIET_MS`) stops counting, and the computer sleeps by
 * the usual rule. Earlier on 12 November 2026 a command quiet for thirty
 * minutes stopped counting, so a long quiet one (a cloud service being set
 * up, `az … --wait`) could be put to sleep under, and its wake with it.
 */

export const BACKGROUND_SHELL_QUIET_MS = BACKGROUND_COMMAND_HOLD_MS;

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
