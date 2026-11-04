// The browser in the app as the window draws it (BrowserView.tsx, step 2b
// of docs/app-browser/README.md), in the Windows app (a stand-in for it,
// FakeDesktop): the Computer tab with the agent's tabs on this PC, the grey
// line over Simeon's computer once the server's switch is on, nothing new on
// the web; the full view's bar, pills and Take control; the cards that open
// the agent's screen (step 3) and the take-over's banner over the browser.

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeAgent } from '../core/models'
import { AppStore } from '../core/store'
import {
  type BrowserShown,
  pcBrowser,
  resetPCBrowserForTests,
} from '../desktop/browser'
import { FakeDesktop } from '../desktop/testing'
import { handBack, openAgentScreen } from './BrowserView'
import { ComputerLayer, ComputerPreview } from './ComputerView'
import { WindowContext, WindowModel } from './windowModel'

const theo = makeAgent({ id: 'theo', name: 'Theo' })
const settle = () => new Promise((done) => setTimeout(done, 0))

function storeWithTheo(): AppStore {
  const store = new AppStore()
  store.agents = [theo]
  return store
}

function draw(model: WindowModel, node: ReactNode): string {
  return renderToStaticMarkup(
    <WindowContext.Provider value={model}>{node}</WindowContext.Provider>,
  )
}

function theoShown(more: Partial<BrowserShown> = {}): BrowserShown {
  return {
    agentId: 'theo',
    enabled: true,
    tabs: [
      {
        id: 't1',
        title: 'Your cart',
        url: 'https://www.shop.test/cart',
        loading: false,
      },
    ],
    current: 't1',
    canGoBack: true,
    canGoForward: false,
    person: false,
    working: true,
    pointer: { x: 640, y: 400, type: 'click', at: 1 },
    cursor: 'default',
    ...more,
  }
}

/** The Windows app with Theo's browser as `shown`, watched already (a static draw runs no effects). */
async function windowsApp(shown: BrowserShown): Promise<() => void> {
  const remove = new FakeDesktop()
    .answer('browserWatch', (agentId) => (agentId === 'theo' ? shown : null))
    .install()
  pcBrowser()?.want('theo')
  await settle()
  return remove
}

describe('the Computer tab with the browser in the app', () => {
  let remove: (() => void) | undefined
  afterEach(() => {
    remove?.()
    remove = undefined
    resetPCBrowserForTests()
  })

  const preview = (store = storeWithTheo()) =>
    draw(
      new WindowModel('theo'),
      <ComputerPreview store={store} agent={theo} />,
    )

  it('shows the agent’s tab on this PC: the grey line, the picture, its face, Open and the site with its lock', async () => {
    remove = await windowsApp(theoShown())
    const page = preview()
    expect(page).toContain('On this PC')
    expect(page).toContain('aria-label="Theo&#x27;s browser"')
    expect(page).toContain('browser-canvas')
    expect(page).toContain('agent-pointer-layer')
    expect(page).toContain('open-pill')
    expect(page).toContain('browser-lock')
    expect(page).toContain('shop.test')
    expect(page).not.toContain('Booting up the computer')
  })

  it('says "Not Secure" for a page that didn’t come over https, and "New Tab" for a tab with no page', async () => {
    remove = await windowsApp(
      theoShown({
        tabs: [
          { id: 't1', title: 'Old', url: 'http://old.test/', loading: false },
        ],
      }),
    )
    expect(preview()).toContain('Not Secure')
    resetPCBrowserForTests()
    remove()
    remove = await windowsApp(
      theoShown({
        tabs: [{ id: 't1', title: '', url: 'about:blank', loading: false }],
      }),
    )
    expect(preview()).toContain('New Tab')
  })

  it('hides the agent’s face while the person has control', async () => {
    remove = await windowsApp(theoShown({ person: true }))
    expect(preview()).not.toContain('agent-pointer-layer')
  })

  it('shows Simeon’s computer, under the grey line, while the agent has no tab here', async () => {
    remove = await windowsApp(theoShown({ tabs: [], current: undefined }))
    const page = preview()
    expect(page).toContain('On Simeon&#x27;s computer')
    expect(page).toContain('Booting up the computer')
    expect(page).not.toContain('browser-canvas')
  })

  it('shows Simeon’s computer while a helper of the agent’s is at work on its screen', async () => {
    remove = await windowsApp(theoShown())
    const store = storeWithTheo()
    store.apply({
      kind: 'computer',
      status: {
        agentId: 'theo',
        state: 'running',
        vncUrl: 'http://127.0.0.1:6080/vnc.html',
      },
    })
    store.apply({
      kind: 'subagents',
      parentId: 'theo',
      subagents: [
        {
          subagentId: 's1',
          subagentType: 'computerUse',
          status: 'running',
          title: 'Helper 1',
        },
      ],
    })
    const page = preview(store)
    expect(page).toContain('On Simeon&#x27;s computer')
    expect(page).not.toContain('browser-canvas')
  })

  it('changes nothing while the server’s switch is off, nor on the web', async () => {
    remove = await windowsApp(
      theoShown({ enabled: false, tabs: [], current: undefined }),
    )
    expect(preview()).not.toContain('computer-where')
    remove()
    remove = undefined
    resetPCBrowserForTests()
    const web = preview()
    expect(web).not.toContain('computer-where')
    expect(web).toContain('Booting up the computer')
  })
})

describe('the full view of the browser in the app', () => {
  let remove: (() => void) | undefined
  afterEach(() => {
    remove?.()
    remove = undefined
    resetPCBrowserForTests()
  })

  const full = () => {
    const model = new WindowModel('theo')
    model.openBrowser('theo')
    return draw(model, <ComputerLayer store={storeWithTheo()} />)
  }

  it('has the bar: Back, Forward and Reload (the person’s only once they have control), the site, Take control in blue and Exit', async () => {
    remove = await windowsApp(theoShown())
    const page = full()
    expect(page).toContain('aria-label="Theo&#x27;s browser"')
    expect(page).toMatch(/aria-label="Back" disabled=""/)
    expect(page).toMatch(/aria-label="Forward" disabled=""/)
    expect(page).toMatch(/aria-label="Reload" disabled=""/)
    expect(page).toContain('shop.test')
    expect(page).toContain('class="browser-control">Take control</button>')
    expect(page).toContain('aria-label="Exit fullscreen"')
    expect(page).toContain('agent-pointer-layer')
    expect(page).not.toContain('browser-pills')
    expect(page).not.toContain('screen-host')
  })

  it('while the person has control: Give back, the agent paused, the bar theirs, the page taking the keys', async () => {
    remove = await windowsApp(
      theoShown({
        person: true,
        tabs: [
          {
            id: 't1',
            title: 'Your cart',
            url: 'https://www.shop.test/cart',
            loading: true,
          },
          {
            id: 't2',
            title: 'Sign in',
            url: 'https://accounts.shop.test/',
            loading: false,
          },
        ],
      }),
    )
    const page = full()
    expect(page).toContain('class="browser-control held">Give back</button>')
    expect(page).toContain('Theo is paused while you&#x27;re in control.')
    expect(page).toMatch(/aria-label="Back"(?! disabled)/)
    expect(page).toContain('aria-label="Stop"')
    expect(page).toContain('browser-keys')
    expect(page).not.toContain('agent-pointer-layer')
    expect(page).toContain('role="tablist"')
    expect(page).toContain('Your cart')
    expect(page).toContain('Sign in')
    expect(page).toContain('aria-selected="true"')
  })

  it('opening the browser never starts Simeon’s computer', async () => {
    const fake = new FakeDesktop().answer('browserWatch', () => theoShown())
    remove = fake.install()
    const store = storeWithTheo()
    const model = new WindowModel('theo')
    model.openBrowser('theo')
    draw(model, <ComputerLayer store={store} />)
    expect(store.computer.demanded.has('theo')).toBe(false)
  })
})

describe('the cards that open the agent’s screen (step 3)', () => {
  let remove: (() => void) | undefined
  // The openers drop the focus (`document.activeElement`): none here.
  beforeEach(() => {
    vi.stubGlobal('document', { activeElement: null })
    vi.stubGlobal('HTMLElement', class {})
  })
  afterEach(() => {
    remove?.()
    remove = undefined
    resetPCBrowserForTests()
    vi.unstubAllGlobals()
  })

  it('open the agent’s tab on this PC, in Take control when the person must act', async () => {
    const fake = new FakeDesktop()
      .answer('browserState', () => theoShown())
      .answer('browserControl', (_agentId, person) => theoShown({ person }))
    remove = fake.install()
    const store = storeWithTheo()
    const model = new WindowModel('theo')
    await openAgentScreen(model, store, 'theo', { control: true })
    expect(model.computer).toEqual({ agentId: 'theo', browser: true })
    expect(fake.calls.map((call) => [call.name, ...call.args])).toEqual([
      ['browserState', 'theo'],
      ['browserControl', 'theo', true],
    ])
    expect(store.computer.demanded.has('theo')).toBe(false)
    const review = new WindowModel('theo')
    await openAgentScreen(review, store, 'theo', { control: false })
    expect(review.computer).toEqual({ agentId: 'theo', browser: true })
    expect(
      fake.calls.filter((call) => call.name === 'browserControl'),
    ).toHaveLength(1)
  })

  it('open Simeon’s computer when the agent has no tab here, a helper is on the computer’s screen, or on the web', async () => {
    remove = new FakeDesktop()
      .answer('browserState', () => theoShown({ tabs: [], current: undefined }))
      .install()
    let model = new WindowModel('theo')
    await openAgentScreen(model, storeWithTheo(), 'theo', { control: true })
    expect(model.computer).toEqual({ agentId: 'theo', helper: undefined })
    remove()
    resetPCBrowserForTests()
    remove = new FakeDesktop()
      .answer('browserState', () => theoShown())
      .install()
    const store = storeWithTheo()
    store.apply({
      kind: 'computer',
      status: {
        agentId: 'theo',
        state: 'running',
        vncUrl: 'http://127.0.0.1:6080/vnc.html',
      },
    })
    store.apply({
      kind: 'subagents',
      parentId: 'theo',
      subagents: [
        {
          subagentId: 's1',
          subagentType: 'computerUse',
          status: 'running',
          title: 'Helper 1',
        },
      ],
    })
    model = new WindowModel('theo')
    await openAgentScreen(model, store, 'theo', { control: true })
    expect(model.computer?.browser).toBeUndefined()
    remove()
    remove = undefined
    resetPCBrowserForTests()
    // On the web, at once, as before.
    model = new WindowModel('theo')
    void openAgentScreen(model, storeWithTheo(), 'theo', { control: true })
    expect(model.computer).toEqual({ agentId: 'theo', helper: undefined })
  })

  it('the take-over answered gives the browser back before the agent is told', async () => {
    const fake = new FakeDesktop().answer('browserControl', () => theoShown())
    remove = fake.install()
    const store = storeWithTheo()
    const told: unknown[] = []
    store.handBackComputer = async (agentId: string, skip = false) => {
      told.push([agentId, skip, fake.calls.length])
    }
    handBack(store, 'theo', true)
    expect(fake.calls.map((call) => [call.name, ...call.args])).toEqual([
      ['browserControl', 'theo', false],
    ])
    expect(told).toEqual([['theo', true, 1]])
  })

  it('the take-over waits in the Computer tab and over the full view of the browser', async () => {
    remove = await windowsApp(theoShown({ person: true }))
    const store = storeWithTheo()
    store.apply({
      kind: 'computer',
      status: {
        agentId: 'theo',
        state: 'running',
        handoff: { requestId: 'r1', instruction: 'Sign in to the shop' },
      },
    })
    const pane = draw(
      new WindowModel('theo'),
      <ComputerPreview store={store} agent={theo} />,
    )
    expect(pane).toContain('Needs your attention')
    expect(pane).toContain('Sign in to the shop')
    expect(pane).toContain('browser-canvas')
    const model = new WindowModel('theo')
    model.openBrowser('theo')
    const full = draw(model, <ComputerLayer store={store} />)
    expect(full).toContain('handoff-banner')
    expect(full).toContain('I&#x27;m done, continue')
    expect(full).not.toContain('browser-paused')
  })
})
