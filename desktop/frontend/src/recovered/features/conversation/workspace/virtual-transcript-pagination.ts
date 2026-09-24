/**
 * Pure helpers for pagination anchor math in the virtual transcript plane (slice 7).
 * No React, no DOM — just the scroll-position arithmetic that keeps the
 * user's view stable when older entries are prepended.
 */

/**
 * After prepending `addedHeightPx` worth of content above the viewport,
 * compute the new scrollTop that keeps the same visual rows in view.
 *
 * This is the plane-aware equivalent of the pagination controller's
 * `viewport.scrollTop = anchor.scrollTop + (viewport.scrollHeight - anchor.scrollHeight)`.
 * In the virtual plane, the growth is exactly the sum of the prepended
 * entries' heights (which is the change in `totalSizePx`).
 */
export function computeAnchoredScrollTop(
  anchorScrollTop: number,
  oldTotalSizePx: number,
  newTotalSizePx: number,
): number {
  const growth = newTotalSizePx - oldTotalSizePx;
  if (growth <= 0) return anchorScrollTop;
  return anchorScrollTop + growth;
}
