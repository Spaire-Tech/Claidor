/**
 * Pure geometry helpers for the virtual transcript plane.
 * No React, no DOM — just offsets, prefix sums, and mounted-range math.
 *
 * Golden constants from Grok bundle (index-UbX-y3il.js):
 *   Leading inset:    24 px (SMn=24)
 *   Trailing inset:   12 px (xMn=12)
 *   Overscan rows:     6   (IAn=6)
 *   Default msg height: 60 px (uIn=60) — includes 22 px row margin
 *   Event height:      32 px (cIn=32)
 *   Attachment group: 192 px (tAn=192)
 *   Time separator:    32 px (stable)
 *   Unread divider:    40 px (stable)
 */

// --- Height estimation by entry kind ---

/** @evidence index-UbX-y3il.js: uIn=60 (message/body fallback) */
const DEFAULT_MESSAGE_HEIGHT_PX = 60;

/** @evidence index-UbX-y3il.js: cIn=32 (event row) */
const EVENT_HEIGHT_PX = 32;

/** @evidence index-UbX-y3il.js: tAn=192 (attachment group) */
const ATTACHMENT_GROUP_HEIGHT_PX = 192;

const TIME_SEPARATOR_HEIGHT_PX = 32;
const UNREAD_DIVIDER_HEIGHT_PX = 40;
const TOOL_CALL_HEIGHT_PX = 40;
const THINKING_HEIGHT_PX = 40;
const NOTICE_HEIGHT_PX = 48;

/** @evidence index-UbX-y3il.js: SMn=24 */
export const LEADING_INSET_PX = 24;

/** @evidence index-UbX-y3il.js: xMn=12 */
export const TRAILING_INSET_PX = 12;

/** @evidence index-UbX-y3il.js: IAn=6 */
export const OVERSCAN_ROWS = 6;

export type TranscriptEntryKind =
  | "message"
  | "tool-call"
  | "thinking"
  | "notice"
  | "timeline-event"
  | "time-separator"
  | "unread-divider"
  | "computer-handoff"
  | "local-tool-permission"
  | "permission-request"
  | "send-message";

/**
 * Estimate row height for an entry. Until slice 4 (measure/invalidate),
 * these are static guesses from the Grok bundle constants.
 */
export function estimateEntryHeightPx(kind: TranscriptEntryKind, hasAttachments?: boolean): number {
  switch (kind) {
    case "time-separator":
      return TIME_SEPARATOR_HEIGHT_PX;
    case "unread-divider":
      return UNREAD_DIVIDER_HEIGHT_PX;
    case "timeline-event":
      return EVENT_HEIGHT_PX;
    case "tool-call":
      return TOOL_CALL_HEIGHT_PX;
    case "thinking":
      return THINKING_HEIGHT_PX;
    case "notice":
      return NOTICE_HEIGHT_PX;
    case "local-tool-permission":
      return 0; // renders null
    case "permission-request":
      return EVENT_HEIGHT_PX;
    case "computer-handoff":
      return DEFAULT_MESSAGE_HEIGHT_PX;
    case "send-message":
      return DEFAULT_MESSAGE_HEIGHT_PX;
    case "message":
      return hasAttachments ? ATTACHMENT_GROUP_HEIGHT_PX : DEFAULT_MESSAGE_HEIGHT_PX;
    default:
      return DEFAULT_MESSAGE_HEIGHT_PX;
  }
}

// --- Prefix-sum offsets ---

/**
 * Build an array of cumulative offsets (px) for N entries.
 * offsets[i] = top of row i; offsets[N] = totalSizePx (one past the last row).
 * Length is always heights.length + 1.
 */
export function buildOffsets(heights: readonly number[]): number[] {
  const offsets = new Array<number>(heights.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < heights.length; i++) {
    offsets[i + 1] = offsets[i]! + heights[i]!;
  }
  return offsets;
}

/** Total size of the plane in px (last offset). */
export function totalSizePx(offsets: readonly number[]): number {
  return offsets.length > 0 ? offsets[offsets.length - 1]! : 0;
}

// --- Mounted range (visible window + overscan) ---

export interface MountedRange {
  firstIndex: number;
  lastIndex: number;
}

/**
 * Compute which rows to mount given scroll position and viewport size.
 * Uses binary search on prefix-sum offsets for variable-height rows.
 *
 * @param offsets   prefix-sum array from buildOffsets (length = rowCount + 1)
 * @param scrollTopPx   current scrollTop of the container
 * @param viewportPx    visible height of the scroll container
 * @param overscanRows  extra rows to mount above/below the visible window
 * @param leadingInsetPx  padding above the first row
 */
export function computeMountedRange({
  offsets,
  scrollTopPx,
  viewportPx,
  overscanRows = OVERSCAN_ROWS,
  leadingInsetPx = LEADING_INSET_PX,
}: {
  offsets: readonly number[];
  scrollTopPx: number;
  viewportPx: number;
  overscanRows?: number;
  leadingInsetPx?: number;
}): MountedRange {
  const rowCount = offsets.length - 1;
  if (rowCount <= 0) return { firstIndex: 0, lastIndex: 0 };

  // The visible band in plane coordinates (subtract leading inset from scrollTop)
  const visibleTop = Math.max(0, scrollTopPx - leadingInsetPx);
  const visibleBottom = visibleTop + viewportPx;

  // Binary search: first row whose bottom edge > visibleTop
  let lo = 0;
  let hi = rowCount;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid + 1]! <= visibleTop) lo = mid + 1;
    else hi = mid;
  }
  const firstVisible = lo;

  // Binary search: first row whose top edge >= visibleBottom
  lo = firstVisible;
  hi = rowCount;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (offsets[mid]! < visibleBottom) lo = mid + 1;
    else hi = mid;
  }
  const lastVisible = lo; // exclusive

  // Apply overscan and clamp
  const firstIndex = Math.max(0, firstVisible - overscanRows);
  const lastIndex = Math.min(rowCount, lastVisible + overscanRows);

  return { firstIndex, lastIndex };
}
