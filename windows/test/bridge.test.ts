// The bridge's rules (src/main/bridge.ts), with Electron's `ipcMain` stood in:
// only the app's own page is heard, and a page held to some calls (the
// call's window) makes only those, and never reads or writes the kept pair.

import { describe, expect, it, vi } from 'vitest'

type Listener = (event: unknown, ...args: unknown[]) => unknown
const ipc = vi.hoisted(() => ({
  handlers: new Map<string, Listener>(),
  listeners: new Map<string, Listener>(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: Listener) => ipc.handlers.set(channel, listener),
    on: (channel: string, listener: Listener) => ipc.listeners.set(channel, listener),
  },
}))

const { handle, limit, startBridge } = await import('../src/main/bridge')
const { KeptValues } = await import('../src/main/kept')

/** A page: its contents and the frame address it calls from. */
function page(url = 'app://simeon/app-next/') {
  const sender = {}
  return { sender, senderFrame: { url } }
}

describe('the bridge', () => {
  const kept = new KeptValues('/nowhere', {
    available: () => false,
    seal: () => Buffer.alloc(0),
    open: () => '',
  })
  kept.write('simeon.web.tokens', '{"accessToken":"fake"}')
  startBridge(kept)
  const heights: number[] = []
  handle('openExternal', () => undefined)
  handle('callWindowHeight', (_from, height) => {
    heights.push(height)
  })
  const call = (event: ReturnType<typeof page>, name: string, ...args: unknown[]) =>
    ipc.handlers.get('simeon:call')!(event, name, args)
  const read = (event: ReturnType<typeof page>) => {
    const sync = { ...event, returnValue: undefined as unknown }
    ipc.listeners.get('simeon:kept-read')!(sync)
    return sync.returnValue
  }
  const write = (event: ReturnType<typeof page>, value: string | null) =>
    ipc.listeners.get('simeon:kept-write')!(event, 'simeon.web.tokens', value)

  it('hears the app’s own page, every call, and hands it the kept values', async () => {
    const main = page()
    await expect(call(main, 'openExternal', 'https://simeonlabs.com')).resolves.toBeUndefined()
    await call(main, 'callWindowHeight', 120)
    expect(heights).toEqual([120])
    expect(read(main)).toEqual({ 'simeon.web.tokens': '{"accessToken":"fake"}' })
  })

  it('refuses any other page', async () => {
    const other = page('https://example.com/')
    await expect(call(other, 'openExternal', 'https://simeonlabs.com')).rejects.toThrow()
    expect(read(other)).toEqual({})
  })

  it('holds a limited page to its own calls, with no kept values to read or write', async () => {
    const banner = page()
    limit(banner.sender as never, ['callWindowHeight'])
    await call(banner, 'callWindowHeight', 90)
    expect(heights.at(-1)).toBe(90)
    await expect(call(banner, 'openExternal', 'https://simeonlabs.com')).rejects.toThrow(
      "openExternal is not this window's.",
    )
    expect(read(banner)).toEqual({})
    write(banner, null)
    expect(read(page())).toEqual({ 'simeon.web.tokens': '{"accessToken":"fake"}' })
  })
})
