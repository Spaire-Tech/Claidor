import { describe, expect, test } from "vitest";
import {
  frameWindowWidth,
  PANEL_MAX,
  PANEL_MIN,
  PanelMode,
  RAIL_BELOW,
  SIDEBAR_WIDTH,
  SidebarMode,
  shellLayout,
  THREAD_MIN,
} from "./caisra-layout.js";

/**
 * Widths, checked as arithmetic.
 *
 * Nobody drags a window to 63 different sizes to see what breaks, which is how
 * the desktop app once shipped with a 140px conversation column. Here it is
 * cheap.
 */

/** Every window width the app can be, in 4px steps, up to a 6K display. */
const MIN_WINDOW = 560;
const EVERY_WIDTH: number[] = [];
for (let width = MIN_WINDOW; width <= 6016; width += 4) EVERY_WIDTH.push(width);

describe("the thread is never crushed", () => {
  test("at every width the app allows, with the panel open", () => {
    const bad = EVERY_WIDTH.map((width) => ({ width, layout: shellLayout(width, true) })).filter(
      ({ layout }) => layout.panel === PanelMode.Split && layout.threadWidth < THREAD_MIN,
    );
    expect(bad).toEqual([]);
  });

  test("and with it closed", () => {
    const bad = EVERY_WIDTH.map((width) => ({ width, layout: shellLayout(width, false) })).filter(
      ({ layout }) => layout.threadWidth < THREAD_MIN,
    );
    expect(bad).toEqual([]);
  });

  test("the old fixed layout would have failed this", () => {
    // 300px of sidebar and a panel with a 360px floor, at the smallest window
    // the desktop app opened. This is the number that was on screen.
    expect(800 - 300 - 360).toBe(140);
    expect(shellLayout(800, true).threadWidth).toBeGreaterThanOrEqual(THREAD_MIN);
  });
});

describe("the sidebar", () => {
  test("is a list on a laptop", () => {
    expect(shellLayout(1440).sidebar).toBe(SidebarMode.List);
    expect(shellLayout(RAIL_BELOW).sidebar).toBe(SidebarMode.List);
  });

  test("becomes a rail once a list stops being worth its width", () => {
    expect(shellLayout(RAIL_BELOW - 1).sidebar).toBe(SidebarMode.Rail);
    expect(shellLayout(800).sidebar).toBe(SidebarMode.Rail);
  });

  test("gives its width back to the conversation when it collapses", () => {
    expect(shellLayout(RAIL_BELOW - 1).threadWidth).toBeGreaterThan(
      shellLayout(RAIL_BELOW).threadWidth,
    );
  });
});

describe("the panel", () => {
  test("is a column beside the thread when there is room", () => {
    const layout = shellLayout(1440, true);
    expect(layout.panel).toBe(PanelMode.Split);
    expect(layout.panelWidth).toBeGreaterThanOrEqual(PANEL_MIN);
    expect(layout.panelWidth).toBeLessThanOrEqual(PANEL_MAX);
  });

  test("covers the thread instead of splitting it when there is not", () => {
    expect(shellLayout(800, true).panel).toBe(PanelMode.Cover);
  });

  test("never hands half a large display to a file list", () => {
    expect(shellLayout(6016, true).panelWidth).toBe(PANEL_MAX);
  });

  test("is absent when nobody asked for it", () => {
    expect(shellLayout(1440, false).panel).toBe(PanelMode.None);
    expect(shellLayout(1440, false).threadWidth).toBe(1440 - SIDEBAR_WIDTH);
  });
});

describe("the frame", () => {
  test("the window is the display less the padding, the dock and the gap", () => {
    // 1440 - 48 - 74 - 22. The layout is decided on this, not on the display,
    // because the frame around the window is fixed and the window is what
    // gets narrower.
    expect(frameWindowWidth(1440)).toBe(1296);
  });

  test("a large display still stops at the canvas's maximum", () => {
    expect(frameWindowWidth(6016)).toBe(1420);
  });

  test("a laptop at 1280 keeps the list, not the rail", () => {
    // 1280 - 144 = 1136, comfortably over 900. Worth an assertion because the
    // rail threshold is a window width and the temptation is to read it as a
    // display width.
    expect(shellLayout(frameWindowWidth(1280)).sidebar).toBe(SidebarMode.List);
  });
});
