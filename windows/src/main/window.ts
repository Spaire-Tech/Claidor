// The app's window (the Mac's `WindowChrome`, mac/Simeon/WindowChrome.swift):
// 1040 × 760 at first, 512 × 520 at the least, its size and place kept
// between launches. No title bar of its own: the page moves the window from
// the Mac's places (window/desktop.css) and Windows draws its own buttons at
// the top right (`titleBarOverlay`), in the page's colours.

import { readFileSync, writeFileSync } from 'node:fs'
import { BrowserWindow, type Rectangle, nativeTheme, screen } from 'electron'
import type {
  DesktopFacts,
  WindowLook,
} from '../../../clients/apps/app/src/desktop/contract'
import { appStart } from './appProtocol'
import { factsArgument } from './facts'
import { type Grew, grownBounds, shrunkBounds } from './growth'

export const firstSize = { width: 1040, height: 760 }
export const smallestSize = { width: 512, height: 520 }
/** Windows' buttons' height, as tall as the pane's and the computer's top bars. */
export const titleBarHeight = 44

/** The ground under the caption buttons before the page says its own (index.css `--ground`). */
export const firstLook = {
  light: { background: '#fcfcfc', symbols: '#141414' },
  dark: { background: '#070707', symbols: '#fcfcfc' },
}

export interface KeptBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

/** The window's last size and place, if it still fits on a screen this computer has: at least a third of it showing, else a first window. */
export function placed(
  kept: KeptBounds | undefined,
  screens: readonly Rectangle[],
): KeptBounds | undefined {
  if (!kept) return undefined
  const width = Math.max(smallestSize.width, Math.round(kept.width))
  const height = Math.max(smallestSize.height, Math.round(kept.height))
  const shows = screens.some((area) => {
    const w = Math.min(kept.x + width, area.x + area.width) - Math.max(kept.x, area.x)
    const h = Math.min(kept.y + height, area.y + area.height) - Math.max(kept.y, area.y)
    return w > 0 && h > 0 && w * h >= (width * height) / 3
  })
  if (!shows) return undefined
  return { x: Math.round(kept.x), y: Math.round(kept.y), width, height, maximized: kept.maximized }
}

function readKept(file: string): KeptBounds | undefined {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8')) as Partial<KeptBounds>
    const numbers = [value.x, value.y, value.width, value.height]
    if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined
    return {
      x: value.x as number,
      y: value.y as number,
      width: value.width as number,
      height: value.height as number,
      maximized: value.maximized === true,
    }
  } catch {
    return undefined
  }
}

/** A colour Windows may draw its buttons in: `#rgb`, `#rrggbb` or `#rrggbbaa`. */
export function isColour(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
}

/** The look the page asked for, checked; undefined when any part is not a look. */
export function readLook(value: unknown): WindowLook | undefined {
  if (typeof value !== 'object' || value == null) return undefined
  const look = value as Partial<WindowLook>
  if (look.theme !== 'system' && look.theme !== 'light' && look.theme !== 'dark') return undefined
  if (!isColour(look.background) || !isColour(look.symbols)) return undefined
  return { theme: look.theme, background: look.background, symbols: look.symbols }
}

export function makeMainWindow(options: {
  preload: string
  facts: DesktopFacts
  boundsFile: string
}): BrowserWindow {
  const screens = screen.getAllDisplays().map((display) => display.workArea)
  const kept = placed(readKept(options.boundsFile), screens)
  const look = nativeTheme.shouldUseDarkColors ? firstLook.dark : firstLook.light
  const window = new BrowserWindow({
    ...(kept
      ? { x: kept.x, y: kept.y, width: kept.width, height: kept.height }
      : firstSize),
    minWidth: smallestSize.width,
    minHeight: smallestSize.height,
    show: false,
    title: 'Simeon',
    backgroundColor: look.background,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: look.background,
      symbolColor: look.symbols,
      height: titleBarHeight,
    },
    autoHideMenuBar: true,
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      // The agents work on while the window is closed, as on the Mac: nothing slows the page then.
      backgroundThrottling: false,
      additionalArguments: [factsArgument(options.facts)],
    },
  })
  if (kept?.maximized) window.maximize()
  window.once('ready-to-show', () => window.show())

  let timer: ReturnType<typeof setTimeout> | undefined
  const keep = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (window.isDestroyed()) return
      const bounds = window.getNormalBounds()
      const value: KeptBounds = { ...bounds, maximized: window.isMaximized() }
      try {
        writeFileSync(options.boundsFile, JSON.stringify(value))
      } catch {
        // Not kept this time: the next change tries again.
      }
    }, 500)
  }
  for (const event of ['resized', 'moved', 'maximize', 'unmaximize'] as const)
    window.on(event as 'resized', keep)

  void window.loadURL(appStart)
  return window
}

// MARK: Growing for the agent's pane (AgentPane.swift's `growWindowIfNeeded`, `makeRoomForSidebar`, `shrinkWindowIfGrown`)

/**
 * The main window's growing and giving back: `width` is the page's own
 * pixels, so its zoom is applied; never while the window is full screen,
 * maximised or minimised. The page asks it (contract.ts's `growWindow`,
 * `shrinkWindow`).
 */
export function windowGrowth() {
  let grew: (Grew & { window: BrowserWindow }) | undefined
  return {
    grow(window: BrowserWindow, width: number, remember: boolean): void {
      if (window.isFullScreen() || window.isMaximized() || window.isMinimized()) return
      const content = window.getContentBounds().width
      const missing = width * window.webContents.getZoomFactor() - content
      const bounds = window.getBounds()
      const area = screen.getDisplayMatching(bounds).workArea
      const next = grownBounds(bounds, area, missing)
      if (!next) return
      window.setBounds(next)
      if (remember) grew = { by: next.width - bounds.width, widthAfter: next.width, window }
    },
    shrink(window: BrowserWindow): void {
      const kept = grew
      grew = undefined
      if (!kept || kept.window !== window || window.isDestroyed()) return
      if (window.isFullScreen() || window.isMaximized() || window.isMinimized()) return
      const next = shrunkBounds(window.getBounds(), kept)
      if (next) window.setBounds(next)
    },
  }
}

/** The page's look: Windows' buttons in its colours, Windows' own parts (menus, dialogs) in its theme. */
export function applyLook(window: BrowserWindow, look: WindowLook): void {
  nativeTheme.themeSource = look.theme
  window.setBackgroundColor(look.background)
  window.setTitleBarOverlay({
    color: look.background,
    symbolColor: look.symbols,
    height: titleBarHeight,
  })
}
