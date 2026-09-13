import { describe, expect, test } from 'vitest';

import {
  computeArtifactPanelWidthBounds,
  computeEvenSplitArtifactPanelWidth,
} from './artifactPanelLayout';

// The values CoworkSessionDetail feeds in.
const baseInput = {
  contentRowWidth: 0,
  conversationMinWidth: 480,
  resizeHandleWidth: 4,
  minWidthRatio: 1 / 6,
  hardMinWidth: 180,
  hardMaxWidth: 1000,
};

const withRow = (contentRowWidth: number) => ({ ...baseInput, contentRowWidth });

describe('computeArtifactPanelWidthBounds', () => {
  test('leaves the conversation its minimum width', () => {
    expect(computeArtifactPanelWidthBounds(withRow(1200)).maxWidth).toBe(1200 - 480 - 4);
  });

  test('keeps the panel between its hard floor and ceiling', () => {
    expect(computeArtifactPanelWidthBounds(withRow(600)).maxWidth).toBe(180);
    expect(computeArtifactPanelWidthBounds(withRow(3000)).maxWidth).toBe(1000);
  });

  test('never reports a minimum above the maximum', () => {
    for (const rowWidth of [320, 600, 900, 1200, 2400, 3840]) {
      const bounds = computeArtifactPanelWidthBounds(withRow(rowWidth));
      expect(bounds.minWidth).toBeLessThanOrEqual(bounds.maxWidth);
    }
  });
});

describe('computeEvenSplitArtifactPanelWidth', () => {
  test('gives the panel and the conversation the same width', () => {
    const rowWidth = 1400;
    const panelWidth = computeEvenSplitArtifactPanelWidth(withRow(rowWidth));
    const conversationWidth = rowWidth - baseInput.resizeHandleWidth - panelWidth;
    expect(panelWidth).toBe(698);
    expect(conversationWidth).toBe(panelWidth);
  });

  test('rounds an odd remainder within a pixel of even', () => {
    const rowWidth = 1401;
    const panelWidth = computeEvenSplitArtifactPanelWidth(withRow(rowWidth));
    const conversationWidth = rowWidth - baseInput.resizeHandleWidth - panelWidth;
    expect(Math.abs(conversationWidth - panelWidth)).toBeLessThanOrEqual(1);
  });

  test('stops at the width the row can hold', () => {
    // Half of a 3000px row is 1498, past the panel's hard ceiling.
    expect(computeEvenSplitArtifactPanelWidth(withRow(3000))).toBe(1000);
    // Half of a 900px row is 448, more than the conversation can spare.
    expect(computeEvenSplitArtifactPanelWidth(withRow(900))).toBe(900 - 480 - 4);
  });

  test('never returns less than the panel floor on a narrow window', () => {
    expect(computeEvenSplitArtifactPanelWidth(withRow(300))).toBe(180);
    expect(computeEvenSplitArtifactPanelWidth(withRow(0))).toBe(180);
  });

  test('splits the row the sidebar is about to give back, not the one on screen', () => {
    const visibleRowWidth = 1102;
    const sidebarWidth = 298;
    const openedWidth = computeEvenSplitArtifactPanelWidth(
      withRow(visibleRowWidth + sidebarWidth),
    );
    // Once the sidebar has stepped aside, the two columns are level.
    const settledRowWidth = visibleRowWidth + sidebarWidth;
    expect(settledRowWidth - baseInput.resizeHandleWidth - openedWidth).toBe(openedWidth);
    // Splitting the narrower row on screen would have left the panel short.
    expect(openedWidth).toBeGreaterThan(
      computeEvenSplitArtifactPanelWidth(withRow(visibleRowWidth)),
    );
  });
});
