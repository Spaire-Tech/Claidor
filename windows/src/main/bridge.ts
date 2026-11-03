// The main process's side of the bridge (contract.ts): every call the page
// makes arrives here and goes to the part that answers it; every event goes
// out from here. Only the app's own page is heard (`app://simeon`); anything
// else, a page that somehow got into a window included, is refused.

import {
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
  ipcMain,
} from 'electron'
import type {
  DesktopCalls,
  DesktopEvents,
} from '../../../clients/apps/app/src/desktop/contract'
import { appOrigin } from './appProtocol'
import { type KeptValues, isKeptKey } from './kept'

/** A part's answer to a call: the page that called first, then the call's own arguments (checked by the part: they come from a page). */
export type Handler<K extends keyof DesktopCalls> = (
  from: WebContents,
  ...args: Parameters<DesktopCalls[K]>
) =>
  | Awaited<ReturnType<DesktopCalls[K]>>
  | Promise<Awaited<ReturnType<DesktopCalls[K]>>>

type AnyHandler = (from: WebContents, ...args: unknown[]) => unknown

const handlers = new Map<string, AnyHandler>()

/** Pages that may make only some calls (the call's window, 7c): no kept values read or written, no other call. */
const limited = new WeakMap<WebContents, ReadonlySet<string>>()

/** A page held to `names` from now on (before it loads: its preload reads the kept values at once). */
export function limit(
  contents: WebContents,
  names: readonly (keyof DesktopCalls)[],
): void {
  limited.set(contents, new Set(names))
}

/** Whether a frame's address is the app's own page. (Node gives an `app:` address the origin "null", so the scheme and host are compared, not `origin`.) */
export function fromApp(frameURL: string | undefined): boolean {
  if (!frameURL) return false
  try {
    const url = new URL(frameURL)
    return `${url.protocol}//${url.host}` === appOrigin
  } catch {
    return false
  }
}

function heard(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return fromApp(event.senderFrame?.url)
}

/** Answers a call; each name once. */
export function handle<K extends keyof DesktopCalls>(
  name: K,
  handler: Handler<K>,
): void {
  if (handlers.has(name)) throw new Error(`${name} is answered twice.`)
  handlers.set(name, handler as AnyHandler)
}

/** Sends an event to a page, if it is still there. */
export function emit<K extends keyof DesktopEvents>(
  to: WebContents | undefined,
  name: K,
  payload: DesktopEvents[K],
): void {
  if (to && !to.isDestroyed()) to.send('simeon:event', name, payload)
}

/** Hears the page: its calls, and its kept values read once and written as they change. */
export function startBridge(kept: KeptValues): void {
  ipcMain.handle('simeon:call', async (event, name: unknown, args: unknown) => {
    if (!heard(event)) throw new Error('Only the app’s own page may call.')
    if (typeof name !== 'string' || !Array.isArray(args))
      throw new Error('A call is a name and a list.')
    const allowed = limited.get(event.sender)
    if (allowed && !allowed.has(name))
      throw new Error(`${name} is not this window's.`)
    const handler = handlers.get(name)
    if (!handler) throw new Error(`${name} is not in this build.`)
    return handler(event.sender, ...args)
  })
  ipcMain.on('simeon:kept-read', (event) => {
    event.returnValue =
      heard(event) && !limited.has(event.sender) ? kept.readAll() : {}
  })
  ipcMain.on('simeon:kept-write', (event, key: unknown, value: unknown) => {
    if (!heard(event) || limited.has(event.sender) || !isKeptKey(key)) return
    if (value !== null && typeof value !== 'string') return
    kept.write(key, value)
  })
}

/** A text argument, at most `max` characters; anything else is refused. */
export function text(value: unknown, max = 8_192): string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('A text argument was expected.')
  return value
}
