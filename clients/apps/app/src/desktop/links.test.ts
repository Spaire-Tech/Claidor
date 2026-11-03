// `simeon://` links in the Windows app (MacServices.swift's `handle`),
// against a stand-in app, store and window: the links the app held handed
// over, then each new one; mcp-oauth first and never held or dropped; the
// 2 s rule; a plugin's and a pack's link held until the window is signed in
// and past the first run; the Deep Links dialog signed out too.

import { afterEach, describe, expect, it } from 'vitest'
import type { SignInAnswer } from '../core/connecting'
import { AppStore } from '../core/store'
import { FakeBackend, eventually } from '../core/testing'
import { desktop } from './desktop'
import { DesktopLinks, type LinkWindow, repeatWindowMs } from './links'
import { FakeDesktop } from './testing'

let uninstall: (() => void) | undefined
afterEach(() => uninstall?.())

class StandInWindow implements LinkWindow {
  plugins: string[] = []
  packs: string[] = []
  answers: SignInAnswer[] = []
  cameBack: boolean[] = []
  /** Whether the connector's open sign-in has the answer's state. */
  ownsState?: string
  openPlugin(id: string) {
    this.plugins.push(id)
  }
  askPack(id: string) {
    this.packs.push(id)
  }
  connector = {
    answered: async (answer: SignInAnswer) => {
      this.answers.push(answer)
      return answer.state === this.ownsState
    },
    cameBack: (failed: boolean) => {
      this.cameBack.push(failed)
    },
  }
}

function links(store?: AppStore) {
  let now = 1_000_000
  const made = new DesktopLinks(
    () => store,
    () => now,
  )
  return {
    links: made,
    later: (ms: number) => {
      now += ms
    },
  }
}

describe('the links the app held (takeLinks), then each new one (link)', () => {
  it('hears new links before taking the held ones, so none is lost between', async () => {
    const fake = new FakeDesktop().answer('takeLinks', () => [
      'simeon://app/v1/info?topic=deep-links',
    ])
    uninstall = fake.install()
    const host = desktop()!
    const { links: made } = links()
    made.listen(host)
    expect(fake.listening('link')).toBe(1)
    expect(fake.calls.map((call) => call.name)).toEqual(['takeLinks'])
    await eventually(() => made.info !== undefined)
    expect(made.info).toBe('scheme')
    made.closeInfo()
    fake.emit('link', 'simeon://app/v1/pack/add?id=coffee-shop')
    const window = new StandInWindow()
    made.attach(window)
    expect(window.packs).toEqual(['coffee-shop'])
  })

  it('carries on when the app holds none or can’t say', async () => {
    const fake = new FakeDesktop()
    uninstall = fake.install()
    const { links: made } = links()
    made.listen(desktop()!)
    await new Promise((done) => setTimeout(done, 0))
    expect(made.info).toBeUndefined()
  })
})

describe('a link (MacServices.handle)', () => {
  it('shows the Deep Links dialog, signed out too, and says where the link came from', async () => {
    const { links: made, later } = links()
    let changes = 0
    made.subscribe(() => (changes += 1))
    await made.take('simeon://app/v1/info?topic=deep-links')
    expect(made.info).toBe('scheme')
    expect(changes).toBe(1)
    made.closeInfo()
    expect(made.info).toBeUndefined()
    // The https form is the same link written the one way: within 2 s, dropped; after, read (no associated domain sends it today).
    await made.take(
      'https://app.simeonlabs.com/sand/link/v1/info?topic=deep-links',
    )
    expect(made.info).toBeUndefined()
    later(repeatWindowMs)
    await made.take(
      'https://app.simeonlabs.com/sand/link/v1/info?topic=deep-links',
    )
    expect(made.info).toBe('https')
  })

  it('holds a plugin’s and a pack’s link until the window is there, then opens them', async () => {
    const { links: made } = links()
    await made.take('simeon://app/v1/plugin/add?id=42')
    await made.take('simeon://app/v1/pack/add?id=coffee-shop')
    const window = new StandInWindow()
    const detach = made.attach(window)
    expect(window.plugins).toEqual(['42'])
    expect(window.packs).toEqual(['coffee-shop'])
    // Once there, at once.
    await made.take('simeon://app/v1/pack/add?id=law-firms')
    expect(window.packs).toEqual(['coffee-shop', 'law-firms'])
    // Signed out (the window gone): held again, the newest kept.
    detach()
    await made.take('simeon://app/v1/plugin/add?id=7')
    await made.take('simeon://app/v1/plugin/add?id=8')
    const again = new StandInWindow()
    made.attach(again)
    expect(again.plugins).toEqual(['8'])
    expect(window.plugins).toEqual(['42'])
  })

  it('drops the same link again within 2 s, and takes it after', async () => {
    const { links: made, later } = links()
    const window = new StandInWindow()
    made.attach(window)
    await made.take('simeon://app/v1/pack/add?id=coffee-shop')
    await made.take('SIMEON://app/v1/pack/add?id=coffee-shop')
    later(repeatWindowMs - 1)
    await made.take('simeon://app/v1/pack/add?id=coffee-shop')
    expect(window.packs).toEqual(['coffee-shop'])
    later(1)
    await made.take('simeon://app/v1/pack/add?id=coffee-shop')
    expect(window.packs).toEqual(['coffee-shop', 'coffee-shop'])
    // Another link in between is another link.
    await made.take('simeon://app/v1/pack/add?id=law-firms')
    expect(window.packs.at(-1)).toBe('law-firms')
  })

  it('does nothing for `open` but bring the window forward (the app’s), and nothing for what the Mac refuses', async () => {
    const { links: made } = links()
    const window = new StandInWindow()
    made.attach(window)
    for (const raw of [
      'simeon://app/v1/open',
      'simeon://app/v1/plugin/add?id=abc',
      'simeon://app/v1/pack/add?id=Coffee',
      'simeon-ios://app/v1/pack/add?id=coffee-shop',
      'simeon://other/v1/open',
      'https://evil.example/sand/link/v1/info?topic=deep-links',
      '',
    ])
      await made.take(raw)
    expect(window.plugins).toEqual([])
    expect(window.packs).toEqual([])
    expect(made.info).toBeUndefined()
    expect(window.cameBack).toEqual([])
  })
})

describe('a connector’s sign-in coming back to the app', () => {
  it('finishes an answer only for a sign-in this app named, under its name, and drops any other without a word (review S2)', async () => {
    const backend = new FakeBackend()
    backend.serverAnswers['mcp-oauth/return'] = {}
    const store = new AppStore()
    await store.attach(backend)
    const { links: made } = links(store)
    const window = new StandInWindow()
    made.attach(window)
    const finished = () =>
      backend.commands
        .filter((one) => one.method === 'completeMcpOAuth')
        .map((one) => one.args)
    // A page's own link: no sign-in of this app's has that state.
    await made.take('simeon://mcp-oauth?state=made-up&code=c')
    await made.take(
      'simeon://mcp-oauth?state=made-up&error=x&error_description=Your+Simeon+plan+was+cancelled.',
    )
    expect(finished()).toEqual([])
    expect(store.problem).toBeUndefined()
    // One this app named (its window had closed meanwhile): finished once; the same link again is no answer of a sign-in still waiting.
    await store.sendSignInBack('vendor-stripe-1', 'simeon', 'Stripe')
    const link = 'simeon://mcp-oauth?state=vendor-stripe-1&code=c%2F1'
    await made.take(link)
    await made.take(link)
    expect(finished()).toEqual([{ stateId: 'vendor-stripe-1', code: 'c/1' }])
    store.detach()
  })

  it('leaves the open sign-in’s own answer to its connector', async () => {
    const backend = new FakeBackend()
    const store = new AppStore()
    await store.attach(backend)
    const { links: made } = links(store)
    const window = new StandInWindow()
    window.ownsState = 'vendor-stripe-1'
    made.attach(window)
    await made.take('simeon://mcp-oauth?state=vendor-stripe-1&code=c')
    expect(window.answers.map((one) => one.state)).toEqual(['vendor-stripe-1'])
    expect(
      backend.commands.filter((one) => one.method === 'completeMcpOAuth'),
    ).toEqual([])
    store.detach()
  })

  it('does nothing signed out', async () => {
    const { links: made } = links()
    await made.take('simeon://mcp-oauth?state=s&code=c')
    expect(made.info).toBeUndefined()
  })

  it('hands the server’s last page to the open sign-in, failed or not', async () => {
    const { links: made } = links()
    await made.take('simeon://connected')
    const window = new StandInWindow()
    made.attach(window)
    await made.take('simeon://connected')
    await made.take('simeon://connected?status=failed')
    expect(window.cameBack).toEqual([false, true])
  })
})
