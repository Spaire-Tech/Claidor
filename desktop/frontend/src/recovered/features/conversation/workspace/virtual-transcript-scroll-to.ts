/**
 * Pure helpers for scroll-to-entry in a virtual transcript plane (slice 6).
 * No React, no DOM — just offset math to compute the scrollTop that brings
 * a given entry index into the viewport.
 */

/**
 * Compute the scrollTop that centers entry `index` in a viewport of
 * `viewportPx` height, clamped to [0, maxScrollTop].
 *
 * @param offsets     prefix-sum array from buildOffsets (length = rowCount + 1)
 * @param index       entry index to scroll to
 * @param viewportPx  visible height of the scroll container
 * @param leadingInsetPx  padding above the first row (added to offset)
 */
export function computeScrollTopForEntry(
  offsets: readonly number[],
  index: number,
  viewportPx: number,
  leadingInsetPx: number = 0,
): number {
  const rowCount = offsets.length - 1;
  if (rowCount <= 0 || index < 0 || index >= rowCount) return 0;

  const rowTop = offsets[index]! + leadingInsetPx;
  const rowHeight = offsets[index + 1]! - offsets[index]!;
  const rowCenter = rowTop + rowHeight / 2;

  // Place row center in viewport center.
  const idealScrollTop = rowCenter - viewportPx / 2;

  // Total content height = last offset + leadingInsetPx + trailingInsetPx.
  // Max scrollTop is when bottom of content aligns with bottom of viewport.
  const totalHeight = offsets[rowCount]! + leadingInsetPx;
  const maxScrollTop = Math.max(0, totalHeight - viewportPx);

  return Math.max(0, Math.min(idealScrollTop, maxScrollTop));
}

/**
 * Find the index of an entry by id in a list.
 * Returns -1 if not found.
 */
export function findEntryIndex(
  entries: readonly { readonly id: string }[],
  entryId: string,
): number {
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.id === entryId) return i;
  }
  return -1;
}
