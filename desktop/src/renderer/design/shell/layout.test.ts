import { describe, expect, test } from 'vitest';

import {
  PANEL_MAX,
  PANEL_MIN,
  PanelMode,
  PanelWant,
  RAIL_BELOW,
  shellLayout,
  SidebarMode,
  THREAD_MIN,
  titleBarInset,
} from './layout';

/**
 * Widths, checked as arithmetic.
 *
 * Nobody drags a window to 63 different sizes to see what breaks, which is
 * how the app shipped with a 140px conversation column. Here it is cheap.
 */

/**
 * Every window width the app can be, in 4px steps, up to a 6K display.
 *
 * Starts at `MIN_APP_WINDOW_WIDTH` (`main/windowState.ts`). The two
 * numbers have to agree: the window minimum is only safe because these
 * rules hold at it, so the sweep starts exactly there.
 */
const MIN_WINDOW = 560;
const EVERY_WIDTH: number[] = [];
for (let width = MIN_WINDOW; width <= 6016; width += 4) EVERY_WIDTH.push(width);

describe('the thread is never crushed', () => {
  test('at every width the app allows, with the panel open', () => {
    // The guarantee the whole file exists for. The old layout failed this
    // from 800 to about 1160 — which is most of a laptop.
    const bad = EVERY_WIDTH
      .map(width => ({ width, layout: shellLayout(width, true) }))
      .filter(({ layout }) => layout.panel === PanelMode.Split && layout.threadWidth < THREAD_MIN);
    expect(bad).toEqual([]);
  });

  test('and with it closed', () => {
    const bad = EVERY_WIDTH
      .map(width => ({ width, layout: shellLayout(width, false) }))
      .filter(({ layout }) => layout.threadWidth < THREAD_MIN);
    expect(bad).toEqual([]);
  });

  test('the old fixed layout would have failed this', () => {
    // 300px of sidebar and a panel with a 360px floor, at the smallest
    // window the app opened. This is the number that was on screen.
    expect(800 - 300 - 360).toBe(140);
    expect(shellLayout(800, true).threadWidth).toBeGreaterThanOrEqual(THREAD_MIN);
  });

  test('at the narrowest the window can be dragged', () => {
    // The window minimum is only safe because of these rules, so it is
    // checked against them rather than assumed.
    expect(shellLayout(MIN_WINDOW, true).threadWidth).toBeGreaterThanOrEqual(THREAD_MIN);
    expect(shellLayout(MIN_WINDOW, true).sidebar).toBe(SidebarMode.Rail);
  });
});

describe('the sidebar', () => {
  test('is a list on a laptop', () => {
    expect(shellLayout(1440).sidebar).toBe(SidebarMode.List);
    expect(shellLayout(RAIL_BELOW).sidebar).toBe(SidebarMode.List);
  });

  test('becomes a rail once a list stops being worth its width', () => {
    expect(shellLayout(RAIL_BELOW - 1).sidebar).toBe(SidebarMode.Rail);
    expect(shellLayout(800).sidebar).toBe(SidebarMode.Rail);
  });

  test('gives its width back to the conversation when it collapses', () => {
    const list = shellLayout(RAIL_BELOW);
    const rail = shellLayout(RAIL_BELOW - 1);
    expect(rail.threadWidth).toBeGreaterThan(list.threadWidth);
  });
});

describe('the panel', () => {
  test('is a column beside the thread when there is room', () => {
    const layout = shellLayout(1440, true);
    expect(layout.panel).toBe(PanelMode.Split);
    expect(layout.panelWidth).toBeGreaterThanOrEqual(PANEL_MIN);
    expect(layout.panelWidth).toBeLessThanOrEqual(PANEL_MAX);
  });

  test('covers the thread instead of splitting it when there is not', () => {
    // Never refused. A control that does nothing is the fault this review
    // keeps returning to; the person asked for the browser, so they get
    // the browser and close it to get the conversation back.
    expect(shellLayout(800, true).panel).toBe(PanelMode.Cover);
  });

  test('never hands half a large display to a file list', () => {
    expect(shellLayout(6016, true).panelWidth).toBe(PANEL_MAX);
  });

  test('is absent when nobody asked for it', () => {
    expect(shellLayout(1440, false).panel).toBe(PanelMode.None);
    expect(shellLayout(1440, false).threadWidth).toBe(1440 - 300);
  });

  test('every width is one of the three modes and nothing in between', () => {
    const modes = new Set(EVERY_WIDTH.map(width => shellLayout(width, true).panel));
    expect([...modes].sort()).toEqual([PanelMode.Cover, PanelMode.Split]);
  });
});

describe('the macOS window buttons', () => {
  test('get a strip of their own, and only on macOS', () => {
    // "Messages" was drawn straight through the close/minimise/zoom
    // circles. They are at { x: 12, y: 20 } and nothing in the shell knew.
    expect(titleBarInset('darwin')).toBeGreaterThan(0);
    expect(titleBarInset('win32')).toBe(0);
    expect(titleBarInset('linux')).toBe(0);
    expect(titleBarInset(undefined)).toBe(0);
  });

  test('the strip clears the lowest edge of the buttons', () => {
    // y 20 plus a 12px circle is 32. The header padding above the title
    // adds the rest; this only has to clear the circles themselves.
    expect(titleBarInset('darwin')).toBeGreaterThanOrEqual(32 - 18);
  });
});

describe('the agent panel', () => {
  // From the canvas: `clamp(252px,22%,300px) minmax(0,1fr) clamp(236px,25%,324px)`.
  test('takes some of its room from the sidebar, not all from the thread', () => {
    const without = shellLayout(1200, PanelWant.None);
    const withPanel = shellLayout(1200, PanelWant.Agent);
    expect(withPanel.sidebarWidth).toBeLessThan(without.sidebarWidth);
    expect(withPanel.sidebarWidth).toBe(264); // 22% of 1200
    expect(withPanel.panelWidth).toBe(300); // 25% of 1200
    expect(withPanel.panel).toBe(PanelMode.Split);
  });

  test('is clamped to the canvas\'s numbers at both ends', () => {
    expect(shellLayout(6016, PanelWant.Agent).panelWidth).toBe(324);
    expect(shellLayout(6016, PanelWant.Agent).sidebarWidth).toBe(300);
    expect(shellLayout(960, PanelWant.Agent).panelWidth).toBe(240);
    expect(shellLayout(960, PanelWant.Agent).sidebarWidth).toBe(252);
  });

  test('never crushes the thread either', () => {
    const bad = EVERY_WIDTH
      .map(width => shellLayout(width, PanelWant.Agent))
      .filter(one => one.panel === PanelMode.Split && one.threadWidth < THREAD_MIN);
    expect(bad).toEqual([]);
  });

  test('the old boolean still means the computer panel', () => {
    expect(shellLayout(1440, true)).toEqual(shellLayout(1440, PanelWant.Computer));
    expect(shellLayout(1440, false)).toEqual(shellLayout(1440, PanelWant.None));
  });
});
