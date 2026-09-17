/**
 * How the shell divides a window, at whatever size the window is.
 *
 * Ported whole from the founder's `desktop/src/renderer/design/shell/layout.ts`,
 * numbers and reasoning intact. It exists because the shell was once three
 * columns with fixed numbers — 300 of sidebar, 360 of panel — so at the
 * smallest window the app allowed the conversation got 140px and rendered one
 * character per line. In the founder's words: *"it behaves like it still is and
 * never adjusts."* Percentages resize; they do not reconsider.
 *
 * Three rules, meant to be readable in one breath:
 *
 * 1. **The thread has a floor and never yields.** Everything else gives way to
 *    it, because the thread is the product.
 * 2. **The sidebar becomes a rail when a list stops being worth 272px.** Orbs
 *    only: the thing a person recognises before they read.
 * 3. **The panel splits when there is room and covers when there is not.**
 *    Never a third column squeezed to nothing, and never a dead button.
 *
 * Kept pure so the arithmetic can be checked at every width without a browser,
 * which is the only way anyone will ever check widths.
 */

/**
 * The sidebar as a list: an orb, a name, a time and a line of preview.
 *
 * 272 since the evening canvas of 15 September, which brought the whole scale
 * down a step (it was 300). Under about that the preview has no room to be a
 * sentence and the name starts eliding, at which point it is a worse rail than
 * a rail.
 */
export const SIDEBAR_WIDTH = 272;

/**
 * The sidebar as a rail: orbs and nothing else.
 *
 * 73 is a 37px orb with 18px either side — the same orb the list row uses, so
 * switching modes moves it rather than resizing it.
 */
export const RAIL_WIDTH = 73;

/** Below this window width the list becomes a rail. */
export const RAIL_BELOW = 900;

/**
 * The narrowest a conversation may ever be.
 *
 * Everything else in this file exists to protect this number. 460px holds a
 * bubble at a readable measure with the composer under it; below that the
 * wrapping stops being prose.
 */
export const THREAD_MIN = 460;

/** The narrowest a panel is worth opening as a column beside the thread. */
export const PANEL_MIN = 340;

/**
 * The widest, so a 27" display does not hand half the window to a file list.
 * The panel is a companion to the conversation, not a peer.
 */
export const PANEL_MAX = 560;

/** The share of the space beside the sidebar the panel takes when it fits. */
export const PANEL_SHARE = 0.38;

/**
 * The frame, from the 17 September canvas ("Spatial Light"): the app is a
 * rounded window floating on a pale ground with a glass dock beside it.
 */
export const FRAME_PAD_X = 24;
export const FRAME_PAD_Y = 26;
export const FRAME_GAP = 22;
/** 52px buttons inside 11px of padding. */
export const DOCK_WIDTH = 74;
export const WINDOW_MAX_WIDTH = 1420;
export const WINDOW_MAX_HEIGHT = 900;

/** How wide the window is at a given display width. */
export function frameWindowWidth(viewportWidth: number): number {
  return Math.max(
    0,
    Math.min(WINDOW_MAX_WIDTH, viewportWidth - FRAME_PAD_X * 2 - DOCK_WIDTH - FRAME_GAP),
  );
}

/** How tall, at a given display height. */
export function frameWindowHeight(viewportHeight: number): number {
  return Math.max(0, Math.min(WINDOW_MAX_HEIGHT, viewportHeight - FRAME_PAD_Y * 2));
}

export const SidebarMode = {
  /** Orb, name, time, preview. */
  List: "list",
  /** Orbs only. */
  Rail: "rail",
} as const;
export type SidebarMode = (typeof SidebarMode)[keyof typeof SidebarMode];

export const PanelMode = {
  /** Not asked for. */
  None: "none",
  /** A column beside the thread. */
  Split: "split",
  /**
   * Over the thread, taking the whole area.
   *
   * The alternative was refusing to open at all. But a control that does
   * nothing is the fault the whole design review keeps coming back to, and
   * somebody who asks for the computer on a narrow window wants to see the
   * computer — they can see the conversation by closing it again. So the button
   * always works; what changes is whether the two sit side by side.
   */
  Cover: "cover",
} as const;
export type PanelMode = (typeof PanelMode)[keyof typeof PanelMode];

export interface ShellLayout {
  sidebar: SidebarMode;
  sidebarWidth: number;
  panel: PanelMode;
  /** Only meaningful when `panel` is `split`. */
  panelWidth: number;
  /** What the thread actually gets, for assertions and for nothing else. */
  threadWidth: number;
}

const clamp = (low: number, value: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * The layout for one window width.
 *
 * `wanted` is what the person asked for — the computer panel being open.
 * Whether they get it beside the conversation or over it is this function's
 * business, not theirs.
 */
export function shellLayout(width: number, wanted = false): ShellLayout {
  const sidebar = width < RAIL_BELOW ? SidebarMode.Rail : SidebarMode.List;
  const sidebarWidth = sidebar === SidebarMode.Rail ? RAIL_WIDTH : SIDEBAR_WIDTH;
  const rest = Math.max(0, width - sidebarWidth);

  // The thread is paid first. A panel only exists in what is left over, and
  // only if that leftover is enough to be a column rather than a sliver, which
  // is the whole of the fix.
  const panelWidth = clamp(PANEL_MIN, Math.round(rest * PANEL_SHARE), PANEL_MAX);
  const fits = rest - panelWidth >= THREAD_MIN;

  if (!wanted) {
    return { sidebar, sidebarWidth, panel: PanelMode.None, panelWidth: 0, threadWidth: rest };
  }
  if (fits) {
    return {
      sidebar,
      sidebarWidth,
      panel: PanelMode.Split,
      panelWidth,
      threadWidth: rest - panelWidth,
    };
  }
  return { sidebar, sidebarWidth, panel: PanelMode.Cover, panelWidth: rest, threadWidth: rest };
}
