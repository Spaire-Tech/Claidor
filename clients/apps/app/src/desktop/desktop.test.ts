import { afterEach, describe, expect, it } from 'vitest'
import { desktop, keptStorage } from './desktop'
import { FakeDesktop } from './testing'

describe('desktop()', () => {
  let remove: (() => void) | undefined
  afterEach(() => {
    remove?.()
    remove = undefined
  })

  it('is undefined on the web', () => {
    expect(desktop()).toBeUndefined()
  })

  it('wraps the preload once, with its facts', () => {
    const fake = new FakeDesktop({ version: '0.3.0' })
    remove = fake.install()
    const first = desktop()
    expect(first?.facts.version).toBe('0.3.0')
    expect(desktop()).toBe(first)
  })

  it('calls through, with the arguments as a list', async () => {
    const fake = new FakeDesktop().answer('openExternal', () => undefined)
    remove = fake.install()
    await desktop()?.call('openExternal', 'https://simeonlabs.com')
    expect(fake.calls).toEqual([
      { name: 'openExternal', args: ['https://simeonlabs.com'] },
    ])
  })

  it('rejects a call no part answers', async () => {
    remove = new FakeDesktop().install()
    await expect(desktop()?.call('readyToQuit')).rejects.toThrow()
  })

  it('hears events until told to stop', () => {
    const fake = new FakeDesktop()
    remove = fake.install()
    let heard = 0
    const stop = desktop()?.on('quitting', () => {
      heard += 1
    })
    fake.emit('quitting', null)
    stop?.()
    fake.emit('quitting', null)
    expect(heard).toBe(1)
    expect(fake.listening('quitting')).toBe(0)
  })
})

describe('keptStorage', () => {
  it('reads the copy the page loaded with', () => {
    const fake = new FakeDesktop({}, { 'simeon.web.tokens': '{"a":1}' })
    const storage = keptStorage(fake)
    expect(storage.getItem('simeon.web.tokens')).toBe('{"a":1}')
    expect(storage.getItem('simeon.web.gateway')).toBeNull()
    expect(storage.length).toBe(1)
  })

  it('writes through to the app and reads its own writes at once', () => {
    const fake = new FakeDesktop()
    const storage = keptStorage(fake)
    storage.setItem('simeon.web.gateway', 'g')
    expect(storage.getItem('simeon.web.gateway')).toBe('g')
    storage.removeItem('simeon.web.gateway')
    expect(storage.getItem('simeon.web.gateway')).toBeNull()
    expect(fake.keeps).toEqual([
      { key: 'simeon.web.gateway', value: 'g' },
      { key: 'simeon.web.gateway', value: null },
    ])
  })

  it('refuses any other key', () => {
    const fake = new FakeDesktop()
    const storage = keptStorage(fake)
    expect(() => storage.setItem('simeon.theme', 'dark')).toThrow()
    storage.removeItem('simeon.theme')
    expect(fake.keeps).toEqual([])
  })
})
