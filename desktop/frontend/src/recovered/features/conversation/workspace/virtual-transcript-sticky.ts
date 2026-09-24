/**
 * Pure sticky-bottom / auto-scroll state helpers for the virtual transcript plane.
 * No React, no DOM — just state transitions for pin tracking and scroll disposition.
 *
 * Golden config from Grok bundle (index-UbX-y3il.js, CAn):
 *   nearBottomThresholdPx:  4   — distance from bottom to consider "pinned"
 *   userInputWindowMs:    250   — debounce window for user scroll gestures
 *   driftTolerancePx:       1   — ignore programmatic drift smaller than this
 *
 * @evidence index-UbX-y3il.js: CAn={ nearBottomThresholdPx:4, userInputWindowMs:250, driftTolerancePx:1 }
 * @evidence index-UbX-y3il.js: lht disposition logic (user scroll vs programmatic)
 */

// --- Golden constants ---

/** @evidence CAn.nearBottomThresholdPx = 4 */
export const NEAR_BOTTOM_THRESHOLD_PX = 4;

/** @evidence CAn.userInputWindowMs = 250 */
export const USER_INPUT_WINDOW_MS = 250;

/** @evidence CAn.driftTolerancePx = 1 */
export const DRIFT_TOLERANCE_PX = 1;

// --- Types ---

export interface StickyState {
  /** Whether the view is pinned to the bottom. */
  readonly isPinned: boolean;
  /**
   * Timestamp (ms) of the last user scroll gesture (wheel/touch/pointer).
   * Used to distinguish user scrolls from programmatic ones within the
   * userInputWindow.
   */
  readonly lastUserGestureMs: number;
}

export interface ScrollMeasurement {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

// --- Pure helpers ---

/** Initial state: pinned to bottom (chat starts at the bottom). */
export function initialStickyState(): StickyState {
  return { isPinned: true, lastUserGestureMs: 0 };
}

/** How far the scroll position is from the absolute bottom. */
export function distanceFromBottom(m: ScrollMeasurement): number {
  return Math.max(0, m.scrollHeight - m.clientHeight - m.scrollTop);
}

/** Whether a scroll measurement is "near bottom" per the threshold. */
export function isNearBottom(
  m: ScrollMeasurement,
  thresholdPx: number = NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  return distanceFromBottom(m) <= thresholdPx;
}

/**
 * Whether a scroll event at `nowMs` is likely a user gesture (wheel/touch)
 * rather than a programmatic scroll, given the last known user gesture time.
 */
export function isWithinUserInputWindow(
  lastUserGestureMs: number,
  nowMs: number,
  windowMs: number = USER_INPUT_WINDOW_MS,
): boolean {
  return nowMs - lastUserGestureMs <= windowMs;
}

/**
 * Core state transition: called on every scroll event.
 *
 * Rules:
 * - If the user gestured (within input window) and scrolled away → unpin.
 * - If scrolled near bottom → re-pin regardless of source.
 * - Programmatic scrolls that drift away by <= driftTolerancePx are ignored
 *   (they come from layout shifts during streaming).
 */
export function onScroll(
  prev: StickyState,
  measurement: ScrollMeasurement,
  nowMs: number,
  config: {
    nearBottomThresholdPx?: number;
    userInputWindowMs?: number;
    driftTolerancePx?: number;
  } = {},
): StickyState {
  const threshold = config.nearBottomThresholdPx ?? NEAR_BOTTOM_THRESHOLD_PX;
  const windowMs = config.userInputWindowMs ?? USER_INPUT_WINDOW_MS;
  const driftTolerance = config.driftTolerancePx ?? DRIFT_TOLERANCE_PX;

  const nearBottom = isNearBottom(measurement, threshold);

  // Near bottom → always pin (re-latch).
  if (nearBottom) {
    return { isPinned: true, lastUserGestureMs: prev.lastUserGestureMs };
  }

  // Away from bottom:
  const userGesture = isWithinUserInputWindow(prev.lastUserGestureMs, nowMs, windowMs);

  if (userGesture) {
    // User scrolled away → unpin.
    return { isPinned: false, lastUserGestureMs: prev.lastUserGestureMs };
  }

  // Programmatic scroll away: tolerate small drift (layout shifts during streaming).
  const dist = distanceFromBottom(measurement);
  if (prev.isPinned && dist <= driftTolerance) {
    return prev; // Stay pinned — drift is within tolerance.
  }

  // Large programmatic scroll away (e.g. scrollToEntry) → unpin.
  if (prev.isPinned && dist > driftTolerance) {
    return { isPinned: false, lastUserGestureMs: prev.lastUserGestureMs };
  }

  // Was already unpinned, still away → no change.
  return prev;
}

/**
 * Record a user input gesture (wheel, touchmove, pointerdown on scrollbar).
 * Called from the DOM event handler before the scroll event fires.
 */
export function onUserGesture(prev: StickyState, nowMs: number): StickyState {
  return { isPinned: prev.isPinned, lastUserGestureMs: nowMs };
}

/**
 * Programmatic scroll-to-bottom: pin and reset gesture timer so the
 * subsequent scroll event is treated as programmatic.
 */
export function onScrollToBottom(prev: StickyState): StickyState {
  return { isPinned: true, lastUserGestureMs: 0 };
}

/**
 * Compute the scrollTop value that places the container at the absolute bottom.
 */
export function scrollTopForBottom(m: Pick<ScrollMeasurement, "scrollHeight" | "clientHeight">): number {
  return Math.max(0, m.scrollHeight - m.clientHeight);
}
