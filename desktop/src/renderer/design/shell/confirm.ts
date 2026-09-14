/**
 * Asking twice, in place, instead of opening a dialog.
 *
 * `grok-bot-app-ui.md`: a destructive control says *"Click Again to
 * Confirm"* where it stands rather than throwing a modal over the app.
 *
 * **Why that is better than a dialog.** A modal is a different thing on
 * the screen, so the first click is answered by reading a second sentence
 * and finding a second button. Asking in place keeps the answer where the
 * question was: the control the person already aimed at now says
 * something different, and the second press is the same press.
 *
 * **Why it still counts as a confirmation.** The word changes, so the
 * second press is not the press they planned — they have to read it. A
 * button that quietly does the thing on one click is the failure this
 * prevents; a button that needs a deliberate second press after changing
 * what it says is a decision.
 *
 * Kept pure so the timing and the wording are testable without rendering.
 */

/**
 * How long the armed state lasts.
 *
 * Long enough to press twice without hurrying, short enough that a
 * control left armed and forgotten has disarmed before anybody's hand
 * comes back to it. Four seconds is roughly the span of "wait, no".
 */
export const CONFIRM_WINDOW_MS = 4000;

export const ConfirmState = {
  /** Its ordinary label. One press arms it. */
  Ready: 'ready',
  /** Asking. One press does the thing. */
  Armed: 'armed',
} as const;
export type ConfirmState = typeof ConfirmState[keyof typeof ConfirmState];

/**
 * What a destructive control says right now.
 *
 * The armed wording names the thing rather than saying "Confirm", so
 * somebody who looked away and back knows what they are about to do.
 */
export function confirmLabel(state: ConfirmState, action: string): string {
  return state === ConfirmState.Armed ? `${action} — press again` : action;
}

export interface ConfirmStep {
  next: ConfirmState;
  /** Whether this press is the one that acts. */
  act: boolean;
}

/**
 * One press.
 *
 * A press inside the window acts; a press after it has expired arms
 * again rather than acting, so a control that has been sitting armed
 * since yesterday cannot be triggered by somebody clicking once.
 */
export function pressConfirm(
  state: ConfirmState,
  armedAt: number | undefined,
  now: number,
): ConfirmStep {
  if (state === ConfirmState.Armed && armedAt !== undefined && now - armedAt <= CONFIRM_WINDOW_MS) {
    return { next: ConfirmState.Ready, act: true };
  }
  return { next: ConfirmState.Armed, act: false };
}

/** Whether an armed control has gone cold and should say its own name again. */
export function confirmExpired(armedAt: number | undefined, now: number): boolean {
  return armedAt !== undefined && now - armedAt > CONFIRM_WINDOW_MS;
}
