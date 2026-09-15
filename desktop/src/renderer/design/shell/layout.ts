import { useEffect, useState } from 'react';

/**
 * How the shell divides a window, at whatever size the window is.
 *
 * **Why this file exists.** The shell was three columns with fixed
 * numbers: 300px of sidebar, then the thread, then a panel declared as
 * `minmax(360px, 44%)`. Both floors are hard, so at a window width of 800
 * — the smallest the app allows — the arithmetic is 300 + 360 + *what is
 * left*, and what is left is 140px. The thread rendered one character per
 * line. That is not a thread that has been squeezed; it is a column that
 * was never told it had a right to exist.
 *
 * The founder's words: "it behaves like it still is and never adjusts."
 * Correct, and the reason is that nothing in the old layout was a
 * decision. Percentages resize. They do not *reconsider*.
 *
 * So there are three rules here, and they are meant to be readable in one
 * breath:
 *
 *  1. **The thread has a floor and never yields.** Everything else gives
 *     way to it, because the thread is the product.
 *  2. **The sidebar becomes a rail when a list stops being worth 300px.**
 *     Orbs only — the thing a person recognises before they read.
 *  3. **The panel splits when there is room and covers when there is
 *     not.** Never a third column squeezed to nothing, and never a dead
 *     button.
 *
 * Kept pure so the arithmetic can be checked at every width without a
 * browser, which is the only way anyone will ever check widths.
 */

/**
 * The sidebar as a list: an orb, a name, a time and a line of preview.
 *
 * Under about 300px the preview has no room to be a sentence and the name
 * starts eliding, at which point it is a worse rail than a rail.
 */
export const SIDEBAR_WIDTH = 300;

/**
 * The sidebar as a rail: orbs and nothing else.
 *
 * 76 is a 40px orb with 18px either side — the same orb the list row
 * uses, so switching modes moves it rather than resizing it.
 */
export const RAIL_WIDTH = 76;

/** Below this window width the list becomes a rail. */
export const RAIL_BELOW = 900;

/**
 * The narrowest a conversation may ever be.
 *
 * Everything else in this file exists to protect this number. 460px holds
 * a bubble at a readable measure with the composer under it; below that
 * the wrapping stops being prose.
 */
export const THREAD_MIN = 460;

/** The narrowest a panel is worth opening as a column beside the thread. */
export const PANEL_MIN = 340;

/**
 * The widest, so a 27" display does not hand half the window to a file
 * list. The panel is a companion to the conversation, not a peer.
 */
export const PANEL_MAX = 560;

/** The share of the space beside the sidebar the panel takes when it fits. */
export const PANEL_SHARE = 0.38;

/**
 * The strip macOS draws its close/minimise/zoom buttons over.
 *
 * `main.ts` opens the window `hiddenInset` with the lights at
 * `{ x: 12, y: 20 }`; three 12px circles with 8px between them end at
 * x≈64, y≈32. Nothing in this shell knew that, so "Messages" was drawn
 * straight through them — the first thing the founder pointed at.
 *
 * Reserved as height rather than width because that is what Messages
 * itself does: the lights get their own strip and the header starts under
 * them, which keeps the title where the design puts it instead of
 * shunting it sideways at one window size and not another.
 */
export const TITLE_BAR_INSET = 28;

export const SidebarMode = {
  /** Orb, name, time, preview. */
  List: 'list',
  /** Orbs only. */
  Rail: 'rail',
} as const;
export type SidebarMode = typeof SidebarMode[keyof typeof SidebarMode];

export const PanelMode = {
  /** Not asked for. */
  None: 'none',
  /** A column beside the thread. */
  Split: 'split',
  /**
   * Over the thread, taking the whole area.
   *
   * The alternative was refusing to open at all, which is what the founder
   * saw other apps do. But a control that does nothing is the fault this
   * whole review keeps coming back to, and a person who asks for the
   * browser on a narrow window wants to see the browser — they can see the
   * conversation by closing it again. So the button always works; what
   * changes is whether the two things sit side by side.
   */
  Cover: 'cover',
} as const;
export type PanelMode = typeof PanelMode[keyof typeof PanelMode];

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
 * `panelWanted` is what the person asked for — the Browser, Files or
 * screen tab being on. Whether they get it beside the conversation or
 * over it is this function's business, not theirs.
 */
export function shellLayout(width: number, panelWanted = false): ShellLayout {
  const sidebar = width < RAIL_BELOW ? SidebarMode.Rail : SidebarMode.List;
  const sidebarWidth = sidebar === SidebarMode.Rail ? RAIL_WIDTH : SIDEBAR_WIDTH;
  const rest = Math.max(0, width - sidebarWidth);

  // The thread is paid first. A panel only exists in what is left over,
  // and only if that leftover is enough to be a column rather than a
  // sliver — which is the whole of the fix.
  const panelWidth = clamp(PANEL_MIN, Math.round(rest * PANEL_SHARE), PANEL_MAX);
  const fits = rest - panelWidth >= THREAD_MIN;

  if (!panelWanted) {
    return { sidebar, sidebarWidth, panel: PanelMode.None, panelWidth: 0, threadWidth: rest };
  }
  if (fits) {
    return {
      sidebar, sidebarWidth, panel: PanelMode.Split, panelWidth,
      threadWidth: rest - panelWidth,
    };
  }
  return { sidebar, sidebarWidth, panel: PanelMode.Cover, panelWidth: rest, threadWidth: rest };
}

/**
 * The window's width, kept current.
 *
 * The old layout never re-read it, which is why leaving full screen
 * changed nothing on screen. This is the piece that makes the shell
 * reconsider rather than merely stretch.
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(
    () => (typeof window === 'undefined' ? 1440 : window.innerWidth),
  );
  useEffect(() => {
    const read = (): void => setWidth(window.innerWidth);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return width;
}

/** Whether this build is drawing into a macOS window with hidden chrome. */
export function isMacChrome(platform: string | undefined): boolean {
  return platform === 'darwin';
}

/**
 * The space above the sidebar's first row.
 *
 * Zero everywhere but macOS, where the window's own buttons are drawn
 * over the top-left corner of our canvas and nothing else moves them.
 */
export function titleBarInset(platform: string | undefined): number {
  return isMacChrome(platform) ? TITLE_BAR_INSET : 0;
}
