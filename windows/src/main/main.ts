// Simeon for Windows (docs/web-app/README.md, step 7): the web app, the Mac
// app translated (clients/apps/app), in a window of its own, with Windows'
// own parts around it. This file is the app's life: one at a time, the page
// served from inside the app, what the page may open and use, the window
// that hides (not closes) on its ×, and the quit that lets the page finish
// first. Each part of step 7 is a file of its own under parts/.

import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  type BrowserWindow,
  Menu,
  app,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron'
import {
  appFile,
  appOrigin,
  appScheme,
  appSchemePrivileges,
  appStart,
  contentType,
} from './appProtocol'
import { emit, fromApp, handle, startBridge, text } from './bridge'
import type { AppContext } from './context'
import { type AppFacts, factsFor } from './facts'
import { KeptValues } from './kept'
import { appLinkScheme, linksIn } from './links'
import * as handsPart from './parts/hands'
import * as outsidePart from './parts/outside'
import * as sessionPart from './parts/session'
import * as surfacesPart from './parts/surfaces'
import * as updatesPart from './parts/updates'
import { allowsPermission, contentSecurityPolicy, opensOutside } from './policy'
import { applyLook, makeMainWindow, readLook } from './window'

/** The app's id: its notifications, its taskbar button and its installer (the Mac's bundle id). */
export const appId = 'com.simeonlabs.simeon'

protocol.registerSchemesAsPrivileged([
  { scheme: appScheme, privileges: appSchemePrivileges },
])

// A check against stand-ins gives the app a data folder of its own.
if (process.env.SIMEON_USER_DATA)
  app.setPath('userData', process.env.SIMEON_USER_DATA)
app.setAppUserModelId(appId)

/** Where the web app's build is: inside the installed app, or the repository's own copy for a developer. */
function webRoot(): string {
  if (process.env.SIMEON_APP_ROOT) return path.resolve(process.env.SIMEON_APP_ROOT)
  if (app.isPackaged) return path.join(process.resourcesPath, 'app-next')
  return path.resolve(app.getAppPath(), '../clients/apps/web/public/app-next')
}

/** The build number the release wrote into the app's package.json (`simeonBuild`); "0" for a developer's. */
function buildNumber(): string {
  try {
    const raw = readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')
    const value = (JSON.parse(raw) as { simeonBuild?: unknown }).simeonBuild
    return typeof value === 'string' && /^\d{1,9}$/.test(value) ? value : '0'
  } catch {
    return '0'
  }
}

function start(): void {
  const appFacts: AppFacts = {
    version: app.getVersion(),
    build: buildNumber(),
    osVersion: os.release(),
    platform: process.platform,
    systemLanguages: app.getPreferredSystemLanguages(),
    argv: process.argv,
    env: process.env,
  }
  const facts = factsFor(appFacts, 'main')
  const dataFolder = app.getPath('userData')
  const preload = path.join(__dirname, 'preload.cjs')
  const root = webRoot()
  const policy = contentSecurityPolicy(facts.apiBase)

  // The page, from inside the app; nothing outside its build.
  protocol.handle(appScheme, async (request) => {
    const file = appFile(root, request.url)
    if (file) {
      try {
        const body = await readFile(file)
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': contentType(file),
            'content-security-policy': policy,
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-cache',
          },
        })
      } catch {
        // Not there: as any address the build doesn't have.
      }
    }
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  })

  // The browser's permissions: the microphone, the clipboard, full screen; only for the app's page.
  const pages = session.defaultSession
  pages.setPermissionRequestHandler((_contents, permission, done, details) => {
    const media = 'mediaTypes' in details ? { mediaTypes: details.mediaTypes } : undefined
    done(allowsPermission(permission, fromApp(details.requestingUrl), media))
  })
  pages.setPermissionCheckHandler((_contents, permission, origin, details) => {
    const media =
      'mediaType' in details && details.mediaType
        ? { mediaTypes: [details.mediaType] }
        : undefined
    return allowsPermission(permission, origin === appOrigin, media)
  })

  // A check on Linux (a data folder of its own, no keyring): Electron's own key, so the kept values outlive a relaunch there too. Windows always seals with its own protection.
  if (process.platform === 'linux' && process.env.SIMEON_USER_DATA)
    safeStorage.setUsePlainTextEncryption(true)
  startBridge(
    new KeptValues(path.join(dataFolder, 'kept'), {
      available: () => safeStorage.isEncryptionAvailable(),
      seal: (value) => safeStorage.encryptString(value),
      open: (sealed) => safeStorage.decryptString(sealed),
    }),
  )

  // The window: made once, hidden by its × (the agents work on, as on the Mac), shown again by the app's own ways back.
  let mainWindow: BrowserWindow | undefined
  let quitting = false
  const makeWindow = (): BrowserWindow => {
    const window = makeMainWindow({
      preload,
      facts,
      boundsFile: path.join(dataFolder, 'window.json'),
    })
    window.on('close', (event) => {
      if (quitting) return
      event.preventDefault()
      window.hide()
    })
    window.on('closed', () => {
      if (mainWindow === window) mainWindow = undefined
    })
    mainWindow = window
    return window
  }
  const showMainWindow = (): BrowserWindow => {
    const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : makeWindow()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    return window
  }

  // Links: at launch and from a second launch; read by 7d.
  const linkListeners: ((url: string) => void)[] = []
  const pendingLinks: string[] = linksIn(process.argv)
  const passLink = (url: string) => {
    if (linkListeners.length === 0) pendingLinks.push(url)
    for (const listener of linkListeners) listener(url)
  }
  app.on('second-instance', (_event, argv) => {
    for (const url of linksIn(argv)) passLink(url)
    showMainWindow()
  })

  // Quitting: the page first (a call hung up, the chats kept), a second at most; then the main process's own.
  const quitTasks: (() => void | Promise<void>)[] = []
  let pageReady: (() => void) | undefined
  handle('readyToQuit', () => {
    pageReady?.()
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void (async () => {
      const window = mainWindow
      if (window && !window.isDestroyed()) {
        await new Promise<void>((done) => {
          pageReady = done
          setTimeout(done, 1_000)
          emit(window.webContents, 'quitting', null)
        })
      }
      for (const task of quitTasks) {
        await Promise.race([
          Promise.resolve()
            .then(task)
            .catch(() => {}),
          new Promise((done) => setTimeout(done, 1_000)),
        ])
      }
      app.quit()
    })()
  })
  // Quitting is the app's own act (the tray, the menu): the window going does not end it.
  app.on('window-all-closed', () => {})

  handle('openExternal', (_from, url) => {
    const address = text(url, 4_096)
    if (opensOutside(address)) void shell.openExternal(address)
  })
  handle('setWindowLook', (from, look) => {
    const asked = readLook(look)
    if (asked && mainWindow && from === mainWindow.webContents)
      applyLook(mainWindow, asked)
  })

  const context: AppContext = {
    facts,
    app: appFacts,
    dataFolder,
    preload,
    mainWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined),
    showMainWindow,
    quit: () => app.quit(),
    onLink(listener) {
      linkListeners.push(listener)
      for (const url of pendingLinks.splice(0)) listener(url)
    },
    beforeQuit(task) {
      quitTasks.push(task)
    },
  }
  for (const part of [sessionPart, surfacesPart, outsidePart, updatesPart, handsPart])
    part.register(context)

  makeWindow()
}

// What any page of the app may open: nothing but the app's own page in its windows; addresses go to the default browser.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.on('will-navigate', (event, url) => {
    if (url.startsWith(appStart)) return
    event.preventDefault()
    if (opensOutside(url)) void shell.openExternal(url)
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (opensOutside(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
})

if (!app.requestSingleInstanceLock()) {
  // Another launch: it hands its command line (a link) to the first and goes.
  app.quit()
} else {
  if (process.platform === 'win32') {
    // `simeon://` opens this app (the installer registers it too).
    if (process.defaultApp && process.argv[1])
      app.setAsDefaultProtocolClient(appLinkScheme, process.execPath, [
        path.resolve(process.argv[1]),
      ])
    else app.setAsDefaultProtocolClient(appLinkScheme)
  }
  // Windows' own menu bar is not drawn; the app's keys and menus are 7c's.
  Menu.setApplicationMenu(null)
  void app.whenReady().then(start)
}
