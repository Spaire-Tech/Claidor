// The Windows app's preload: the page's only way to the app around it,
// given as `window.simeonDesktop` (contract.ts, `DesktopTransport`). It
// carries calls and events and nothing else: no Node, no Electron, no file
// reaches the page. The page wraps it in `desktop()` (src/desktop/desktop.ts).

import { contextBridge, ipcRenderer } from 'electron'
import {
  type DesktopFacts,
  type KeptKey,
  heldEvents,
} from '../../../clients/apps/app/src/desktop/contract'
import { factsFlag } from '../main/facts'

function readFacts(): DesktopFacts {
  const flag = process.argv.find((arg) => arg.startsWith(factsFlag))
  if (!flag) throw new Error('The app gave the page no facts.')
  const bytes = Uint8Array.from(atob(flag.slice(factsFlag.length)), (c) =>
    c.charCodeAt(0),
  )
  return JSON.parse(new TextDecoder().decode(bytes)) as DesktopFacts
}

const facts = readFacts()
// Read once as the page loads; the page's own copy follows its writes.
const kept = ipcRenderer.sendSync('simeon:kept-read') as Partial<
  Record<KeptKey, string>
>

type Listener = (payload: unknown) => void
const listeners = new Map<string, Set<Listener>>()
const held = new Map<string, unknown[]>()
const holds = new Set<string>(heldEvents)

ipcRenderer.on('simeon:event', (_event, name: unknown, payload: unknown) => {
  if (typeof name !== 'string') return
  const set = listeners.get(name)
  if (set && set.size > 0) {
    for (const listener of [...set]) listener(payload)
  } else if (holds.has(name)) {
    held.set(name, [...(held.get(name) ?? []), payload])
  }
})

contextBridge.exposeInMainWorld('simeonDesktop', {
  facts,
  kept,
  keep(key: KeptKey, value: string | null) {
    ipcRenderer.send('simeon:kept-write', key, value)
  },
  call(name: string, args: unknown[]) {
    return ipcRenderer.invoke('simeon:call', name, args)
  },
  on(name: string, listener: Listener) {
    let set = listeners.get(name)
    if (!set) {
      set = new Set()
      listeners.set(name, set)
    }
    set.add(listener)
    const waiting = held.get(name)
    if (waiting) {
      held.delete(name)
      for (const payload of waiting) listener(payload)
    }
    return () => {
      set.delete(listener)
    }
  },
})
