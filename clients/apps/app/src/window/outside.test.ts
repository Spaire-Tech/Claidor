// Pages outside the window, the web's way and the Windows app's (step 7d),
// against a stand-in app (FakeDesktop) and a stand-in browser: a page whose
// address comes after the click, Stripe's page as the Mac's sheet
// (MacBillingPage.open: the charge only after a failed payment that came
// back on the app's link), the loopback listened for one sign-in, Windows
// Hello before a guarded act, and the clipboard both ways.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JSONValue } from '../core/json'
import { AppStore } from '../core/store'
import { FakeBackend } from '../core/testing'
import { desktop } from '../desktop/desktop'
import { FakeDesktop } from '../desktop/testing'
import { AppClipboard, appClipboard, copyText } from './clipboard'
import { browserTabs } from './connector'
import { ScreenClipboard } from './liveScreen'
import {
  appBrowser,
  connectorBrowser,
  inApp,
  openBillingWindow,
  openPending,
} from './outside'
import { confirmPresence } from './presence'

let uninstall: (() => void) | undefined
afterEach(() => {
  uninstall?.()
  uninstall = undefined
  vi.unstubAllGlobals()
})

function inTheApp(fake = new FakeDesktop()) {
  fake.answer('openExternal', () => {})
  uninstall = fake.install()
  return fake
}

const opened = (fake: FakeDesktop) =>
  fake.calls
    .filter((call) => call.name === 'openExternal')
    .map((call) => call.args[0])

describe('a page whose address comes after the click (openPending)', () => {
  it('goes to the default browser in the Windows app, once its address comes', () => {
    const fake = inTheApp()
    expect(inApp()).toBe(true)
    const page = openPending()
    expect(page.refused).toBe(false)
    expect(page.closed).toBe(false)
    expect(opened(fake)).toEqual([])
    page.go('https://slack.com/oauth/v2/authorize?x=1', { noReferrer: true })
    expect(opened(fake)).toEqual(['https://slack.com/oauth/v2/authorize?x=1'])
    page.drop()
    expect(fake.calls).toHaveLength(1)
  })

  it('opens a blank tab in the click on the web, emptied and with no handle on the app, then sends it', () => {
    const cleared: string[] = []
    const tab = {
      closed: false,
      opener: {} as unknown,
      sessionStorage: { clear: () => cleared.push('cleared') },
      location: { href: 'about:blank' },
      close() {
        this.closed = true
      },
    }
    const open = vi.fn(() => tab)
    vi.stubGlobal('window', { open })
    expect(inApp()).toBe(false)
    const page = openPending()
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(cleared).toEqual(['cleared'])
    expect(tab.opener).toBeNull()
    expect(page.refused).toBe(false)
    page.go('https://billing.stripe.com/p/x')
    expect(tab.location.href).toBe('https://billing.stripe.com/p/x')
    page.drop()
    expect(page.closed).toBe(true)
  })

  it('says a tab the browser refused, and tries its own tab once the address comes', () => {
    const open = vi.fn(() => null)
    vi.stubGlobal('window', { open })
    const page = openPending()
    expect(page.refused).toBe(true)
    page.go('https://slack.com/x')
    expect(open).toHaveBeenLastCalledWith(
      'https://slack.com/x',
      '_blank',
      'noopener',
    )
  })
})

async function billingWorld(paymentFailed: boolean) {
  const backend = new FakeBackend()
  backend.serverAnswers['billing/portal'] = {
    portalUrl: 'https://billing.stripe.com/p/session/x',
  }
  backend.serverAnswers['billing/settle'] = { paid: true }
  backend.serverAnswers['user/quota'] = { paymentFailed }
  const store = new AppStore()
  await store.attach(backend)
  await store.refreshUsage()
  const paths = () => backend.serverCalls.map((call) => call.path)
  return { backend, store, paths }
}

describe('Stripe’s page in a window of the app’s own (MacBillingPage.open)', () => {
  it('asks naming the app, opens it, and charges the plan after a failed payment that came back on the app’s link', async () => {
    const fake = inTheApp()
    fake.answer('openBilling', () => 'back')
    const { backend, store, paths } = await billingWorld(true)
    const before = paths().length
    expect(await openBillingWindow(store, 'payment_method')).toBeUndefined()
    expect(
      fake.calls.find((call) => call.name === 'openBilling')?.args,
    ).toEqual(['https://billing.stripe.com/p/session/x'])
    const after = paths().slice(before)
    expect(after[0]).toBe('billing/portal')
    expect(backend.serverCalls[before]?.body).toEqual({
      flow: 'payment_method',
      back: 'simeon',
    })
    expect(after).toContain('billing/settle')
    expect(after.indexOf('billing/settle')).toBeLessThan(
      after.lastIndexOf('user/quota'),
    )
    store.detach()
  })

  it('charges nothing when the person closed it, or when no payment had failed; reads again either way', async () => {
    const fake = inTheApp()
    let end: 'back' | 'closed' = 'closed'
    fake.answer('openBilling', () => end)
    const failed = await billingWorld(true)
    let before = failed.paths().length
    await openBillingWindow(failed.store, 'payment_method')
    expect(failed.paths().slice(before)).not.toContain('billing/settle')
    expect(failed.paths().slice(before)).toContain('user/quota')
    failed.store.detach()

    end = 'back'
    const fine = await billingWorld(false)
    before = fine.paths().length
    await openBillingWindow(fine.store)
    expect(fine.paths().slice(before)).not.toContain('billing/settle')
    expect(fine.paths().slice(before)).toContain('user/quota')
    fine.store.detach()
  })

  it('does nothing more while one is open, and one at a time', async () => {
    const fake = inTheApp()
    let finish!: (end: 'back') => void
    fake.answer(
      'openBilling',
      () =>
        new Promise((done) => {
          finish = done
        }) as unknown as 'back',
    )
    const { store, paths } = await billingWorld(false)
    const first = openBillingWindow(store)
    await new Promise((done) => setTimeout(done, 0))
    const before = paths().length
    expect(await openBillingWindow(store)).toBeUndefined()
    expect(paths().length).toBe(before)
    finish('back')
    expect(await first).toBeUndefined()
    // The app says one is open already: nothing more.
    fake.answer('openBilling', () => 'busy')
    const busy = paths().length
    await openBillingWindow(store)
    expect(paths().slice(busy)).toEqual(['billing/portal'])
    store.detach()
  })

  it('says why when the page can’t be had or the window can’t open', async () => {
    const fake = inTheApp()
    const { backend, store } = await billingWorld(false)
    backend.serverAnswers['billing/portal'] = { portalUrl: 'http://plain' }
    expect(await openBillingWindow(store)).toBe(
      'Couldn’t open billing. Try again.',
    )
    backend.serverAnswers['billing/portal'] = {
      portalUrl: 'https://billing.stripe.com/p/session/x',
    }
    // No part answers openBilling: the call is refused.
    expect(await openBillingWindow(store)).toBe(
      'Couldn’t open billing. Try again.',
    )
    expect(fake.calls.some((call) => call.name === 'openBilling')).toBe(true)
    store.detach()
  })
})

describe('the Windows app’s way of connecting (appBrowser)', () => {
  it('is the default browser, with the app’s own scheme; the web keeps its tabs', () => {
    expect(connectorBrowser()).toBe(browserTabs)
    const fake = inTheApp()
    const browser = connectorBrowser()
    expect(browser).not.toBe(browserTabs)
    expect(browser.scheme).toBe('simeon')
    const tab = browser.openTab()!
    expect(tab.closed).toBe(false)
    tab.go('https://accounts.google.com/o')
    tab.close()
    expect(tab.closed).toBe(false)
    expect(opened(fake)).toEqual(['https://accounts.google.com/o'])
  })

  it('listens on the loopback for one sign-in, takes its own answer once, and stops', async () => {
    const fake = inTheApp()
    fake.answer('catchLoopback', () => true)
    fake.answer('stopLoopback', () => {})
    const browser = appBrowser(desktop()!)
    const caught: JSONValue[] = []
    const stop = await browser.catchLoopback!('vendor-canva-1', (answer) =>
      caught.push({ ...answer }),
    )
    expect(stop).toBeTypeOf('function')
    expect(
      fake.calls.find((call) => call.name === 'catchLoopback')?.args,
    ).toEqual(['vendor-canva-1'])
    fake.emit('loopbackAnswer', { state: 'other', code: 'x' })
    fake.emit('loopbackAnswer', { state: 'vendor-canva-1', code: 'abc' })
    fake.emit('loopbackAnswer', { state: 'vendor-canva-1', code: 'again' })
    expect(caught).toEqual([
      {
        state: 'vendor-canva-1',
        code: 'abc',
        error: undefined,
        errorDescription: undefined,
      },
    ])
    stop!()
    expect(fake.listening('loopbackAnswer')).toBe(0)
    expect(fake.calls.at(-1)).toEqual({
      name: 'stopLoopback',
      args: ['vendor-canva-1'],
    })
  })

  it('says another app holds the address', async () => {
    const fake = inTheApp()
    fake.answer('catchLoopback', () => false)
    const browser = appBrowser(desktop()!)
    expect(await browser.catchLoopback!('s', () => {})).toBeUndefined()
    expect(fake.listening('loopbackAnswer')).toBe(0)
  })
})

describe('the person’s OK (PurchaseApproval.confirm, Windows Hello)', () => {
  it('is the window’s own alert on the web', async () => {
    expect(await confirmPresence('Approve $2.47 at gumroad.com')).toBe('alert')
  })

  it('is Windows Hello in the Windows app, with the Mac’s reason, the alert only where Hello can’t ask, never after a failure', async () => {
    const fake = inTheApp()
    let said: 'confirmed' | 'cancelled' | 'unavailable' = 'confirmed'
    fake.answer('confirmPresence', () => said)
    expect(await confirmPresence('Approve $2.47 at gumroad.com')).toBe(
      'confirmed',
    )
    expect(fake.calls.at(-1)).toEqual({
      name: 'confirmPresence',
      args: ['Approve $2.47 at gumroad.com'],
    })
    said = 'cancelled'
    expect(await confirmPresence('x')).toBe('cancelled')
    said = 'unavailable'
    expect(await confirmPresence('x')).toBe('alert')
    // Once the app was asked, a call that fails never opens the alert (review B2).
    fake.answer('confirmPresence', () => {
      throw new Error('Hello ended')
    })
    expect(await confirmPresence('x')).toBe('cancelled')
  })
})

describe('the clipboard (copyText, the screen’s AppClipboard)', () => {
  it('writes through the app in the Windows app, the browser’s own on the web', async () => {
    const written: string[] = []
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: async (words: string) => void written.push(words),
      },
    })
    await copyText('agent-iris')
    expect(written).toEqual(['agent-iris'])
    const fake = inTheApp()
    fake.answer('writeClipboard', () => {})
    await copyText('person@example.com')
    expect(fake.calls.at(-1)).toEqual({
      name: 'writeClipboard',
      args: ['person@example.com'],
    })
    expect(written).toEqual(['agent-iris'])
  })

  it('has no clipboard of the app’s own on the web', () => {
    expect(appClipboard(new ScreenClipboard())).toBeUndefined()
  })

  it('writes the computer’s copy at once and never sends it back (ComputerView.swift)', async () => {
    const fake = inTheApp()
    let pc = 'from this PC'
    fake.answer('writeClipboard', (words) => {
      pc = words
    })
    fake.answer('readClipboard', () => pc)
    const clipboard = new AppClipboard(desktop()!, new ScreenClipboard())
    const sent: string[] = []
    const screen = { paste: (words: string) => sent.push(words) }
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1_000))
    await clipboard.fromBox('copied on the computer')
    expect(pc).toBe('copied on the computer')
    // A click in the screen: what is on this PC's clipboard is the computer's own copy: nothing goes.
    await clipboard.send(screen)
    expect(sent).toEqual([])
    // Copied here: it goes, once.
    pc = 'copied here'
    await clipboard.send(screen)
    await clipboard.send(screen)
    expect(sent).toEqual(['copied here'])
    // The computer's same words again are not written again.
    await clipboard.fromBox('copied on the computer')
    await clipboard.fromBox('copied here')
    expect(pc).toBe('copied here')
    vi.restoreAllMocks()
  })

  it('reads this PC’s clipboard 0.2 s apart at most, and only for a screen that is up', async () => {
    const fake = inTheApp()
    let reads = 0
    fake.answer('readClipboard', () => {
      reads += 1
      return `words ${reads}`
    })
    const clipboard = new AppClipboard(desktop()!, new ScreenClipboard())
    const sent: string[] = []
    const screen = { paste: (words: string) => sent.push(words) }
    let now = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    await clipboard.send(undefined)
    expect(reads).toBe(0)
    await clipboard.send(screen)
    now += 100
    await clipboard.send(screen)
    expect(reads).toBe(1)
    now += 200
    await clipboard.send(screen)
    expect(sent).toEqual(['words 1', 'words 2'])
    // A paste read the clipboard too: the same words don't go again on the next click.
    clipboard.pasted('pasted words')
    fake.answer('readClipboard', () => 'pasted words')
    now += 300
    await clipboard.send(screen)
    expect(sent).toEqual(['words 1', 'words 2'])
    vi.restoreAllMocks()
  })
})
