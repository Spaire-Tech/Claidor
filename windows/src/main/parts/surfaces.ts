// Step 7c, notifications, the taskbar, the tray, the menu and the call's window: Windows' notifications and the taskbar's number, the tray icon and its menu, the app's menu and keys, the call's own window (MacServices.swift, MenuBar.swift, SimeonMacApp.swift's commands, CallBannerWindow.swift).
// Its calls are answered here (`handle`, ../bridge.ts) and named in
// clients/apps/app/src/desktop/contract.ts, in its own section.
//
// The page decides what is told and in which words (its core's
// AgentNotifications and DockBadge, src/desktop/surfaces.ts); this side
// shows it with Windows' own parts:
// - a notification per change, the Mac's sound for "needs you", none for
//   "done", none while the window is in front; a click brings the window
//   forward and opens that agent's chat;
// - the taskbar's number as Windows' overlay on Simeon's button, drawn by
//   the page; and, since a hidden window has no taskbar button, the Dock's
//   red dot on the tray's mark while anything is unread;
// - the tray: the Mac's mark in the taskbar's own ink, its menu in the
//   page's words; a click on the mark brings the window forward (Windows'
//   way; the menu is the right click's);
// - the Mac's menu keys, heard by the page (Control-W, Control-R,
//   Control-Q, F11), done here;
// - the call's own window, floating at the top right of the screen the
//   pointer is on, never taking the keys as it shows, drawing the main
//   window's call and sending its buttons back.

import {
  BrowserWindow,
  type MenuItemConstructorOptions,
  Menu,
  type NativeImage,
  Notification,
  Tray,
  type WebContents,
  app,
  nativeImage,
  nativeTheme,
  screen,
} from 'electron'
import type {
  ShownCall,
  TaskbarBadge,
  TrayMenu,
} from '../../../../clients/apps/app/src/desktop/contract'
import { appStart } from '../appProtocol'
import { emit, handle } from '../bridge'
import type { AppContext } from '../context'
import { factsArgument, factsFor } from '../facts'
import { callFrame, callHeight, callHeights, callResized } from '../surfaces/callPlace'
import {
  badgeImagePrefix,
  readAction,
  readBadge,
  readHeight,
  readLevels,
  readNote,
  readShownCall,
  readTray,
} from '../surfaces/checks'
import { markPolygons, menuDot, trayInk, trayMark, trayScales } from '../surfaces/picture'
import { firstTray, trayTemplate } from '../surfaces/trayMenu'

/** The page whose window has the keys, if one of the app's has. */
function focusedContents(): WebContents | undefined {
  return BrowserWindow.getFocusedWindow()?.webContents
}

export function register(context: AppContext): void {
  const isMain = (from: WebContents) => from === context.mainWindow()?.webContents
  const notes = notifications(context)
  const tray = trayIcon(context)
  const taskbar = taskbarNumber(context, tray)
  const call = callWindow(context)

  // MARK: The page's calls

  handle('notify', (from, note) => {
    if (!isMain(from)) return
    const checked = readNote(note)
    if (!checked) throw new Error('A notification was expected.')
    notes.show(checked)
  })
  handle('clearNotifications', (from) => {
    if (isMain(from)) notes.clear()
  })
  // The window in front or behind, as Windows has it (MacServices.swift's `isMainWindowFocused`), told as it changes.
  handle('isWindowFocused', (from) => isMain(from) && from === focusedContents())
  const focusChanged = (window: BrowserWindow, focused: boolean) => {
    if (window === context.mainWindow()) emit(window.webContents, 'windowFocus', focused)
  }
  app.on('browser-window-focus', (_event, window) => focusChanged(window, true))
  app.on('browser-window-blur', (_event, window) => focusChanged(window, false))
  handle('setBadge', (from, badge) => {
    if (!isMain(from)) return
    const checked = readBadge(badge)
    if (!checked) throw new Error('A taskbar number was expected.')
    taskbar.set(checked)
  })
  handle('setTray', (from, menu) => {
    if (!isMain(from)) return
    const checked = readTray(menu)
    if (!checked) throw new Error('A tray menu was expected.')
    tray.set(checked)
  })
  handle('closeWindow', (from) => {
    // File › Close Window: as its ×, which hides it (main.ts).
    if (isMain(from)) context.mainWindow()?.close()
  })
  handle('toggleFullScreen', (from) => {
    const window = context.mainWindow()
    if (window && isMain(from)) window.setFullScreen(!window.isFullScreen())
  })
  handle('quit', (from) => {
    if (isMain(from)) context.quit()
  })
  handle('showCall', (from, shown) => {
    if (!isMain(from)) return
    const checked = readShownCall(shown)
    if (checked === undefined) throw new Error('A call was expected.')
    call.show(checked)
  })
  handle('showCallLevels', (from, levels) => {
    if (!isMain(from)) return
    const checked = readLevels(levels)
    if (!checked) throw new Error('The waveform’s bars were expected.')
    call.levels(checked)
  })
  handle('focusCall', (from) => {
    if (isMain(from)) call.focus()
  })
  handle('callWindowReady', (from) => (call.isIts(from) ? call.shown() : null))
  handle('callWindowHeight', (from, height) => {
    const checked = readHeight(height)
    if (checked === undefined) throw new Error('A height was expected.')
    if (call.isIts(from)) call.resize(checked)
  })
  handle('callWindowPointer', (from, inside) => {
    if (typeof inside !== 'boolean') throw new Error('Inside or not was expected.')
    if (call.isIts(from)) call.pointer(inside)
  })
  handle('callWindowAction', (from, action) => {
    const checked = readAction(action)
    if (!checked) throw new Error('A call button was expected.')
    if (call.isIts(from)) emit(context.mainWindow()?.webContents, 'callAction', checked)
  })
}

// MARK: Notifications

/** How many of this run's notifications are kept to be clicked or taken back; older ones Windows has let go. */
const notificationsKept = 100

/**
 * Windows' notifications (MacServices.swift's `post`, `open(agent:)`): the
 * title and body as the page wrote them; Windows' own sound for "needs
 * you", silent for "done"; none while the window is in front (the Mac's
 * rule, checked again here). A click brings the window forward, made again
 * if it was gone, and opens that agent's chat (`openAgent`, held by the
 * page until its window listens). Kept so a click is heard, and taken back
 * when the account goes (`removeDeliveredNotifications`).
 */
function notifications(context: AppContext) {
  let shown: Notification[] = []
  return {
    show(note: { agentId: string; title: string; body: string; sound: boolean }) {
      if (context.mainWindow()?.isFocused()) return
      const notification = new Notification({
        title: note.title,
        body: note.body,
        silent: !note.sound,
      })
      notification.on('click', () => {
        const window = context.showMainWindow()
        emit(window.webContents, 'openAgent', note.agentId)
      })
      shown.push(notification)
      if (shown.length > notificationsKept) shown = shown.slice(-notificationsKept)
      notification.show()
    },
    clear() {
      for (const notification of shown) notification.close()
      shown = []
    },
  }
}

// MARK: The taskbar's number

/**
 * The taskbar's number (MacServices.swift's `setBadge`, `DockBadge.label`):
 * Windows' overlay on Simeon's button, the page's picture of the number,
 * none at 0; set again each time the window shows (Windows forgets a hidden
 * window's button). Elsewhere (the checks on Linux) the dock's count. The
 * tray's mark takes the Dock's red dot meanwhile.
 */
function taskbarNumber(context: AppContext, tray: ReturnType<typeof trayIcon>) {
  let badge: TaskbarBadge = { count: 0, description: '' }
  let overlay: NativeImage | null = null
  const watched = new WeakSet<BrowserWindow>()
  const apply = () => {
    const window = context.mainWindow()
    if (window) {
      if (!watched.has(window)) {
        watched.add(window)
        window.on('show', apply)
      }
      window.setOverlayIcon(overlay, badge.description)
    }
    if (process.platform !== 'win32') app.setBadgeCount(badge.count)
    tray.unread(badge.count > 0)
  }
  return {
    set(next: TaskbarBadge) {
      badge = next
      overlay = null
      if (next.count > 0 && next.image) {
        const image = nativeImage.createFromBuffer(
          Buffer.from(next.image.slice(badgeImagePrefix.length), 'base64'),
          { scaleFactor: 2 },
        )
        const size = image.getSize()
        if (!image.isEmpty() && size.width <= 64 && size.height <= 64) overlay = image
      }
      apply()
    },
  }
}

// MARK: The tray

/** The tray's mark at every density Windows draws it, in the taskbar's ink, with or without the unread dot. */
function trayPicture(dark: boolean, unread: boolean): NativeImage {
  const polygons = markPolygons()
  const image = nativeImage.createEmpty()
  for (const scale of trayScales) {
    const png = trayMark(Math.round(16 * scale), dark, unread, polygons)
    image.addRepresentation({
      scaleFactor: scale,
      dataURL: `data:image/png;base64,${png.toString('base64')}`,
    })
  }
  return image
}

/** The menu's unread mark (`circle.fill`), in the menu's ink. */
function unreadMark(dark: boolean): NativeImage {
  const image = nativeImage.createEmpty()
  for (const scale of [1, 1.5, 2]) {
    const png = menuDot(Math.round(16 * scale), dark ? trayInk.dark : trayInk.light)
    image.addRepresentation({
      scaleFactor: scale,
      dataURL: `data:image/png;base64,${png.toString('base64')}`,
    })
  }
  return image
}

/**
 * Simeon in the tray (MenuBar.swift; SimeonMacApp.swift's `MenuBarExtra`):
 * the Mac's mark, named "Simeon" for a screen reader as the Mac's; a click
 * brings the window forward, the right click opens its menu.
 */
function trayIcon(context: AppContext) {
  let menu: TrayMenu = firstTray
  let unread = false
  const taskbarDark = () =>
    process.platform === 'win32'
      ? nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
      : nativeTheme.shouldUseDarkColors
  const pictures = new Map<string, NativeImage>()
  const picture = () => {
    const key = `${taskbarDark()}-${unread}`
    let found = pictures.get(key)
    if (!found) {
      found = trayPicture(taskbarDark(), unread)
      pictures.set(key, found)
    }
    return found
  }
  const tray = new Tray(picture())
  tray.setToolTip('Simeon')
  tray.on('click', () => context.showMainWindow())
  const forward = () => context.showMainWindow().webContents
  const actions = {
    open: () => context.showMainWindow(),
    newChat: () => emit(forward(), 'newChat', null),
    openAgent: (agentId: string) => emit(forward(), 'openAgent', agentId),
    call: () => emit(context.mainWindow()?.webContents, 'callOpenAgent', null),
    about: () => emit(forward(), 'openAbout', null),
    checkForUpdates: () => emit(forward(), 'checkForUpdates', null),
    quit: () => context.quit(),
  }
  const build = () => {
    const template: MenuItemConstructorOptions[] = trayTemplate(
      menu,
      {
        // The Mac's "only in a released build": the updater is a packaged build's (7e).
        checksForUpdates: app.isPackaged,
        unreadMark: unreadMark(nativeTheme.shouldUseDarkColors),
      },
      actions,
    )
    tray.setContextMenu(Menu.buildFromTemplate(template))
  }
  build()
  nativeTheme.on('updated', () => {
    tray.setImage(picture())
    build()
  })
  context.beforeQuit(() => {
    if (!tray.isDestroyed()) tray.destroy()
  })
  return {
    set(next: TrayMenu) {
      menu = next
      build()
    },
    unread(now: boolean) {
      if (now === unread) return
      unread = now
      if (!tray.isDestroyed()) tray.setImage(picture())
    },
  }
}

// MARK: The call's window

/**
 * The call's own window (CallBannerWindow.swift): frameless and clear, the
 * card drawing its own shadow in the room around it; over every window
 * (`floating`), not in the taskbar nor in Alt-Tab, never moved; shown
 * without taking Simeon forward or the keys (`orderFrontRegardless`); a
 * click makes it the one with the keys, so its transcript can be chosen and
 * copied. Its height follows the card's, its top where it is. On Windows it
 * takes clicks only over the card, so the clear room never stands in the
 * way of what is under it. It opens when the main window's call appears and
 * closes when the call is put away.
 */
function callWindow(context: AppContext) {
  let window: BrowserWindow | undefined
  let shown: ShownCall | null = null
  let height: number = callHeights.first
  const passesClicks = process.platform === 'win32'
  const there = () => (window && !window.isDestroyed() ? window : undefined)
  const open = () => {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    height = callHeights.first
    const made = new BrowserWindow({
      ...callFrame(area, height),
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // Not in Alt-Tab (the Mac's `ignoresCycle`).
      type: 'toolbar',
      title: 'Simeon',
      webPreferences: {
        preload: context.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
        additionalArguments: [factsArgument(factsFor(context.app, 'call'))],
      },
    })
    made.setAlwaysOnTop(true, 'floating')
    if (passesClicks) made.setIgnoreMouseEvents(true, { forward: true })
    made.once('ready-to-show', () => {
      if (made.isDestroyed() || window !== made) return
      made.showInactive()
    })
    made.on('closed', () => {
      if (window === made) window = undefined
    })
    window = made
    void made.loadURL(appStart)
  }
  const close = () => {
    const now = there()
    window = undefined
    if (now) now.destroy()
  }
  context.beforeQuit(close)
  return {
    isIts: (from: WebContents) => from === there()?.webContents,
    shown: () => shown,
    show(next: ShownCall | null) {
      shown = next
      if (!next) return close()
      const now = there()
      if (now) emit(now.webContents, 'callShown', next)
      else open()
    },
    levels(levels: number[]) {
      emit(there()?.webContents, 'callLevels', levels)
    },
    /** Brought forward, without the keys (`focus`). */
    focus() {
      const now = there()
      if (!now) return
      now.showInactive()
      now.moveTop()
    },
    resize(cardHeight: number) {
      const now = there()
      const next = callHeight(cardHeight)
      if (!now || next === height) return
      height = next
      now.setBounds(callResized(now.getBounds(), next))
    },
    pointer(inside: boolean) {
      const now = there()
      if (now && passesClicks) now.setIgnoreMouseEvents(!inside, { forward: true })
    },
  }
}
