/**
 * Width arithmetic for the conversation / artifact panel split.
 *
 * The sums live here rather than inside CoworkSessionDetail so they can be read
 * and tested on their own; the caller owns the constants it feeds in.
 */

export interface ArtifactPanelWidthInput {
  /** Width of the row that holds the conversation, the handle and the panel. */
  contentRowWidth: number;
  /** The conversation is never squeezed below this. */
  conversationMinWidth: number;
  /** The drag handle between the two columns. */
  resizeHandleWidth: number;
  /** Smallest share of the row worth giving the panel. */
  minWidthRatio: number;
  /** Absolute floor and ceiling for the panel, whatever the row measures. */
  hardMinWidth: number;
  hardMaxWidth: number;
}

export interface ArtifactPanelWidthBounds {
  minWidth: number;
  maxWidth: number;
}

/** How wide the panel is allowed to be in a row of this width. */
export const computeArtifactPanelWidthBounds = (
  input: ArtifactPanelWidthInput,
): ArtifactPanelWidthBounds => {
  const availableWidth = input.contentRowWidth
    - input.conversationMinWidth
    - input.resizeHandleWidth;
  const maxWidth = Math.min(
    input.hardMaxWidth,
    Math.max(input.hardMinWidth, availableWidth),
  );
  const proportionalMinWidth = Math.floor(input.contentRowWidth * input.minWidthRatio);
  const minWidth = Math.min(maxWidth, Math.max(input.hardMinWidth, proportionalMinWidth));
  return { minWidth, maxWidth };
};

/**
 * The panel width that gives the conversation and the panel the same share of
 * the row, clamped into what the row can actually hold. A panel opens at this
 * width rather than at whatever it happened to be left at last time.
 */
export const computeEvenSplitArtifactPanelWidth = (
  input: ArtifactPanelWidthInput,
): number => {
  const bounds = computeArtifactPanelWidthBounds(input);
  const sharedWidth = Math.max(0, input.contentRowWidth - input.resizeHandleWidth);
  return Math.max(bounds.minWidth, Math.min(bounds.maxWidth, Math.round(sharedWidth / 2)));
};
