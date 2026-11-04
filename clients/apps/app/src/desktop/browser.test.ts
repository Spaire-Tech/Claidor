// The browser in the app, in the page (src/desktop/browser.ts, step 2b of
// docs/app-browser/README.md): which agent is watched, its state and its
// pictures, Take control, and the person's keys as the tab is sent them,
// with a stand-in app (FakeDesktop).

import { afterEach, describe, expect, it } from 'vitest'
import {
  type BrowserShown,
  isSecure,
  keyInput,
  pcBrowser,
  resetPCBrowserForTests,
  showsPCBrowser,
  siteOf,
} from './browser'
import { FakeDesktop } from './testing'

const settle = () => new Promise((done) => setTimeout(done, 0))

function shownFor(
  agentId: string,
  more: Partial<BrowserShown> = {},
): BrowserShown {
  return {
    agentId,
    enabled: true,
    tabs: [
      {
        id: 't1',
        title: 'Shop',
        url: 'https://www.shop.test/cart',
        loading: false,
      },
    ],
    current: 't1',
    canGoBack: true,
    canGoForward: false,
    person: false,
    working: false,
    cursor: 'default',
    ...more,
  }
}

describe('the browser in the page', () => {
  let remove: (() => void) | undefined
  afterEach(() => {
    remove?.()
    remove = undefined
    resetPCBrowserForTests()
  })

  it('is nothing on the web, and nothing in the call’s window', () => {
    expect(pcBrowser()).toBeUndefined()
    remove = new FakeDesktop({ window: 'call' }).install()
    expect(pcBrowser()).toBeUndefined()
  })

  it('watches the latest view’s agent, and the one under it again when it goes', async () => {
    const fake = new FakeDesktop().answer('browserWatch', (agentId) =>
      agentId ? shownFor(agentId) : null,
    )
    remove = fake.install()
    const browser = pcBrowser()!
    expect(pcBrowser()).toBe(browser)
    const pane = browser.want('nora')
    await settle()
    expect(browser.shown('nora')?.tabs).toHaveLength(1)
    const full = browser.want('theo')
    await settle()
    expect(browser.shown('nora')).toBeUndefined()
    expect(browser.shown('theo')?.agentId).toBe('theo')
    full()
    await settle()
    expect(browser.shown('nora')?.agentId).toBe('nora')
    pane()
    await settle()
    expect(
      fake.calls
        .filter((call) => call.name === 'browserWatch')
        .map((call) => call.args[0]),
    ).toEqual(['nora', 'theo', 'nora', null])
  })

  it('a second view of the same agent asks nothing more', async () => {
    const fake = new FakeDesktop().answer('browserWatch', (agentId) =>
      agentId ? shownFor(agentId) : null,
    )
    remove = fake.install()
    const browser = pcBrowser()!
    const one = browser.want('nora')
    const two = browser.want('nora')
    one()
    two()
    await settle()
    expect(fake.calls.map((call) => call.args[0])).toEqual(['nora', null])
  })

  it('follows the watched agent’s state and pictures, never another’s', async () => {
    const fake = new FakeDesktop().answer('browserWatch', (agentId) =>
      agentId ? shownFor(agentId) : null,
    )
    remove = fake.install()
    const browser = pcBrowser()!
    browser.want('nora')
    await settle()
    let redrawn = 0
    browser.subscribe(() => (redrawn += 1))
    fake.emit('browserShown', shownFor('theo', { person: true }))
    expect(redrawn).toBe(0)
    fake.emit('browserShown', shownFor('nora', { working: true }))
    expect(browser.shown('nora')?.working).toBe(true)
    expect(redrawn).toBe(1)
    const seen: string[] = []
    const frame = (agentId: string, tabId: string) => ({
      agentId,
      tabId,
      jpeg: new Uint8Array([255, 216, 255]),
      width: 1280,
      height: 800,
    })
    fake.emit('browserFrame', frame('nora', 't1'))
    fake.emit('browserFrame', frame('theo', 't9'))
    // A view drawn later gets the last picture at once.
    browser.onFrame('nora', (one) => seen.push(one.tabId))
    fake.emit('browserFrame', frame('nora', 't2'))
    expect(seen).toEqual(['t1', 't2'])
  })

  it('takes control and gives it back, the app’s answer shown', async () => {
    const fake = new FakeDesktop()
      .answer('browserWatch', (agentId) => (agentId ? shownFor(agentId) : null))
      .answer('browserControl', (agentId, person) =>
        shownFor(agentId, { person }),
      )
      .answer('browserBar', () => undefined)
      .answer('browserInput', () => undefined)
    remove = fake.install()
    const browser = pcBrowser()!
    browser.want('nora')
    await settle()
    browser.control('nora', true)
    await settle()
    expect(browser.shown('nora')?.person).toBe(true)
    browser.bar('nora', { act: 'back' })
    browser.input('nora', { kind: 'text', text: 'é' })
    browser.control('nora', false)
    await settle()
    expect(browser.shown('nora')?.person).toBe(false)
    expect(
      fake.calls.slice(1).map((call) => [call.name, ...call.args]),
    ).toEqual([
      ['browserControl', 'nora', true],
      ['browserBar', 'nora', { act: 'back' }],
      ['browserInput', 'nora', { kind: 'text', text: 'é' }],
      ['browserControl', 'nora', false],
    ])
  })
})

describe('what the Computer tab shows', () => {
  it('the browser while the agent has tabs here and no helper is on the computer’s screen', () => {
    expect(showsPCBrowser(undefined, 0)).toBe(false)
    expect(showsPCBrowser(shownFor('nora', { tabs: [] }), 0)).toBe(false)
    expect(showsPCBrowser(shownFor('nora'), 0)).toBe(true)
    expect(showsPCBrowser(shownFor('nora'), 1)).toBe(false)
  })

  it('the site without "www.", the lock for https only', () => {
    expect(siteOf('https://www.shop.test/cart?x=1')).toBe('shop.test')
    expect(siteOf('http://127.0.0.1:8080/')).toBe('127.0.0.1')
    expect(siteOf('about:blank')).toBe('')
    expect(siteOf('')).toBe('')
    expect(isSecure('https://a.test/')).toBe(true)
    expect(isSecure('http://a.test/')).toBe(false)
  })
})

describe('the person’s keys', () => {
  const press = (
    key: string,
    more: Partial<Parameters<typeof keyInput>[0]> = {},
  ) =>
    keyInput({
      type: 'keydown',
      key,
      code: '',
      keyCode: 0,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...more,
    })

  it('a character types itself, Enter types a return, other keys go as they are', () => {
    expect(press('a', { code: 'KeyA', keyCode: 65 })).toEqual({
      kind: 'key',
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      text: 'a',
      modifiers: 0,
    })
    expect(press('A', { shiftKey: true })).toMatchObject({
      text: 'A',
      modifiers: 8,
    })
    expect(press('Enter', { keyCode: 13 })).toMatchObject({ text: '\r' })
    expect(press('ArrowDown', { keyCode: 40 })).not.toHaveProperty('text')
    expect(
      keyInput({
        type: 'keyup',
        key: 'a',
        code: 'KeyA',
        keyCode: 65,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      }),
    ).toEqual({
      kind: 'key',
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      keyCode: 65,
      modifiers: 0,
    })
  })

  it('Ctrl+C, X, V, A, Z and Y are the tab’s own editing; Ctrl+Shift+Z redoes', () => {
    expect(press('v', { ctrlKey: true })).toEqual({
      kind: 'edit',
      command: 'paste',
    })
    expect(press('C', { ctrlKey: true, shiftKey: false })).toEqual({
      kind: 'edit',
      command: 'copy',
    })
    expect(press('z', { ctrlKey: true, shiftKey: true })).toEqual({
      kind: 'edit',
      command: 'redo',
    })
    expect(
      keyInput({
        type: 'keyup',
        key: 'v',
        code: 'KeyV',
        keyCode: 86,
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      }),
    ).toBeUndefined()
    expect(press('l', { ctrlKey: true })).toMatchObject({
      kind: 'key',
      modifiers: 2,
    })
    expect(press('l', { ctrlKey: true })).not.toHaveProperty('text')
  })

  it('AltGr types its character; a key held by the composition goes nowhere', () => {
    expect(
      press('@', {
        ctrlKey: true,
        altKey: true,
        getModifierState: (name) => name === 'AltGraph',
      }),
    ).toMatchObject({ kind: 'key', text: '@' })
    expect(press('Process')).toBeUndefined()
    expect(press('Dead')).toBeUndefined()
    expect(press('a', { isComposing: true })).toBeUndefined()
  })
})
