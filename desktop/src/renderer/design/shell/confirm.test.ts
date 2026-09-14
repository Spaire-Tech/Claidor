import { describe, expect, test } from 'vitest';

import {
  CONFIRM_WINDOW_MS,
  confirmExpired,
  confirmLabel,
  ConfirmState,
  pressConfirm,
} from './confirm';

describe('asking twice, in place', () => {
  test('the first press asks rather than acts', () => {
    const step = pressConfirm(ConfirmState.Ready, undefined, 1000);
    expect(step.act).toBe(false);
    expect(step.next).toBe(ConfirmState.Armed);
  });

  test('the second press acts', () => {
    const step = pressConfirm(ConfirmState.Armed, 1000, 1500);
    expect(step.act).toBe(true);
    expect(step.next).toBe(ConfirmState.Ready);
  });

  test('a press after it has gone cold asks again rather than acting', () => {
    // Otherwise a control left armed since yesterday deletes something on
    // a single click from somebody who never saw the question.
    const step = pressConfirm(ConfirmState.Armed, 1000, 1000 + CONFIRM_WINDOW_MS + 1);
    expect(step.act).toBe(false);
    expect(step.next).toBe(ConfirmState.Armed);
  });

  test('the very edge of the window still counts', () => {
    expect(pressConfirm(ConfirmState.Armed, 1000, 1000 + CONFIRM_WINDOW_MS).act).toBe(true);
  });

  test('armed with no timestamp cannot act', () => {
    // A state that says armed without saying when is not a confirmation
    // anybody gave.
    expect(pressConfirm(ConfirmState.Armed, undefined, 5000).act).toBe(false);
  });
});

describe('what the control says', () => {
  test('the armed wording names the thing, rather than saying "confirm"', () => {
    // Somebody who looked away and back should know what they are about
    // to do without reconstructing it.
    expect(confirmLabel(ConfirmState.Ready, 'Delete')).toBe('Delete');
    expect(confirmLabel(ConfirmState.Armed, 'Delete')).toBe('Delete — press again');
  });

  test('the second press is a different word from the first', () => {
    // This is what makes it a confirmation. If the label did not change,
    // the second press would be the press they already planned.
    expect(confirmLabel(ConfirmState.Armed, 'Delete'))
      .not.toBe(confirmLabel(ConfirmState.Ready, 'Delete'));
  });
});

describe('going cold', () => {
  test('an armed control expires', () => {
    expect(confirmExpired(1000, 1000 + CONFIRM_WINDOW_MS + 1)).toBe(true);
    expect(confirmExpired(1000, 1500)).toBe(false);
    expect(confirmExpired(undefined, 9_000_000)).toBe(false);
  });

  test('the window is long enough to press twice and short enough to forget', () => {
    expect(CONFIRM_WINDOW_MS).toBeGreaterThanOrEqual(2000);
    expect(CONFIRM_WINDOW_MS).toBeLessThanOrEqual(10_000);
  });
});
