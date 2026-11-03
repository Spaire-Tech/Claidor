// The Windows app around the page, when there is one (windows/, step 7 of
// docs/web-app/README.md). On the web `desktop()` is undefined and every
// caller keeps the web's own way; in the Windows app it is the bridge the
// app's preload gives the page (`window.simeonDesktop`, contract.ts).

import type {
  DesktopCalls,
  DesktopEvents,
  DesktopFacts,
  DesktopTransport,
  KeptKey,
} from './contract'
import { keptKeys } from './contract'

export type { DesktopCalls, DesktopEvents, DesktopFacts } from './contract'

type Args<K extends keyof DesktopCalls> = Parameters<DesktopCalls[K]>
type Answer<K extends keyof DesktopCalls> = Awaited<ReturnType<DesktopCalls[K]>>

export interface Desktop {
  readonly facts: DesktopFacts
  /** Asks the app; answered by its main process (a call no part answers rejects). */
  call<K extends keyof DesktopCalls>(
    name: K,
    ...args: Args<K>
  ): Promise<Answer<K>>
  /** Hears the app; the returned function stops listening. */
  on<K extends keyof DesktopEvents>(
    name: K,
    listener: (payload: DesktopEvents[K]) => void,
  ): () => void
  /** The kept values as a `Storage`, for the web's own readers of the pair and the computer's address (`sessionVault`, `sessionSavedGateway`). */
  readonly kept: Storage
}

let made: Desktop | undefined
let madeFrom: DesktopTransport | undefined

/** The Windows app around this page, or undefined on the web. */
export function desktop(): Desktop | undefined {
  const transport = (globalThis as { simeonDesktop?: DesktopTransport })
    .simeonDesktop
  if (transport == null) return undefined
  if (made && madeFrom === transport) return made
  madeFrom = transport
  made = wrap(transport)
  return made
}

function isKept(key: string): key is KeptKey {
  return (keptKeys as readonly string[]).includes(key)
}

/** A `Storage` over the kept values: read at once from the copy the page loaded with, written through to the app. Other keys are refused, so nothing else lands in it by mistake. */
export function keptStorage(transport: DesktopTransport): Storage {
  const values = new Map<string, string>()
  for (const key of keptKeys) {
    const value = transport.kept[key]
    if (typeof value === 'string') values.set(key, value)
  }
  return {
    get length() {
      return values.size
    },
    clear() {
      for (const key of [...values.keys()]) {
        values.delete(key)
        if (isKept(key)) transport.keep(key, null)
      }
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      if (!isKept(key)) return
      values.delete(key)
      transport.keep(key, null)
    },
    setItem(key: string, value: string) {
      if (!isKept(key)) throw new Error(`${key} is not kept by the app.`)
      values.set(key, String(value))
      transport.keep(key, String(value))
    },
  }
}

function wrap(transport: DesktopTransport): Desktop {
  return {
    facts: transport.facts,
    call: (name, ...args) =>
      transport.call(name, args) as Promise<Answer<typeof name>>,
    on: (name, listener) =>
      transport.on(name, (payload) =>
        listener(payload as DesktopEvents[typeof name]),
      ),
    kept: keptStorage(transport),
  }
}

/** Forgets the wrapped bridge (the tests give a new one each time). */
export function resetDesktopForTests(): void {
  made = undefined
  madeFrom = undefined
}
