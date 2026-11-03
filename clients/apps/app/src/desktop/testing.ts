// A stand-in for the Windows app's preload, for the tests: the facts it
// hands the page, the kept values, the calls made (answered by handlers the
// test gives) and events sent to the page on demand.

import type {
  DesktopCalls,
  DesktopEvents,
  DesktopFacts,
  DesktopTransport,
  KeptKey,
} from './contract'
import { resetDesktopForTests } from './desktop'

export const testFacts: DesktopFacts = {
  platform: 'win32',
  version: '0.1.0',
  build: '7',
  track: 'stable',
  osVersion: '10.0.26100',
  apiBase: 'https://api.simeonlabs.com',
  systemLanguages: ['en-GB'],
  env: {},
  window: 'main',
}

type Handler = (...args: never[]) => unknown

export class FakeDesktop implements DesktopTransport {
  readonly facts: DesktopFacts
  readonly kept: Partial<Record<KeptKey, string>>
  /** Every call made, in order. */
  readonly calls: { name: string; args: unknown[] }[] = []
  /** Every value kept, in order. */
  readonly keeps: { key: KeptKey; value: string | null }[] = []
  private readonly handlers = new Map<string, Handler>()
  private readonly listeners = new Map<
    string,
    Set<(payload: unknown) => void>
  >()

  constructor(
    facts: Partial<DesktopFacts> = {},
    kept: Partial<Record<KeptKey, string>> = {},
  ) {
    this.facts = { ...testFacts, ...facts }
    this.kept = { ...kept }
  }

  /** Answers a call the way the main process would. */
  answer<K extends keyof DesktopCalls>(
    name: K,
    handler: DesktopCalls[K],
  ): this {
    this.handlers.set(name, handler as Handler)
    return this
  }

  keep(key: KeptKey, value: string | null): void {
    this.keeps.push({ key, value })
  }

  async call(name: string, args: unknown[]): Promise<unknown> {
    this.calls.push({ name, args })
    const handler = this.handlers.get(name)
    if (!handler) throw new Error(`No part answers ${name}.`)
    return (handler as (...a: unknown[]) => unknown)(...args)
  }

  on(name: string, listener: (payload: unknown) => void): () => void {
    let set = this.listeners.get(name)
    if (!set) {
      set = new Set()
      this.listeners.set(name, set)
    }
    set.add(listener)
    return () => set.delete(listener)
  }

  /** Sends an event to the page, as the main process would. */
  emit<K extends keyof DesktopEvents>(
    name: K,
    payload: DesktopEvents[K],
  ): void {
    for (const listener of [...(this.listeners.get(name) ?? [])])
      listener(payload)
  }

  /** How many listen to an event now. */
  listening(name: keyof DesktopEvents): number {
    return this.listeners.get(name)?.size ?? 0
  }

  /** Puts this stand-in where the page looks (`window.simeonDesktop`); the returned function takes it away. */
  install(): () => void {
    const global = globalThis as { simeonDesktop?: DesktopTransport }
    const before = global.simeonDesktop
    global.simeonDesktop = this
    resetDesktopForTests()
    return () => {
      global.simeonDesktop = before
      resetDesktopForTests()
    }
  }
}
