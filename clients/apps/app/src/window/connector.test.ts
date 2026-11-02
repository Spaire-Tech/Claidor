// The window's connector (mac/Simeon/MacConnector.swift) against a
// stand-in computer and a stand-in browser: the consent, the tab opened
// blank on the click and sent to the page, the asking every 2 seconds, a
// tab the person closed, a newer sign-in, the makers that only take the
// loopback, a refusal, Add Another Account.

import { describe, expect, it } from 'vitest'
import type { JSONValue } from '../core/json'
import { AppStore } from '../core/store'
import { FakeBackend, eventually } from '../core/testing'
import {
  Connector,
  type ConnectorBrowser,
  type HeldTab,
  type SignInTab,
  askTimes,
  closable,
} from './connector'

class StandInTab implements SignInTab {
  closed = false
  url?: string
  /** Closed by the connector, not by the person. */
  closedByApp = false
  go(url: string) {
    this.url = url
  }
  close() {
    if (!this.closed) this.closedByApp = true
    this.closed = true
  }
}

class StandInBrowser implements ConnectorBrowser {
  tabs: StandInTab[] = []
  /** The browser refuses a tab (a blocker), or the click is over (a tab opens only during it). */
  blocked = false
  looks = 0
  /** What the return page would say, by the sign-in's state. */
  hearing = new Map<string, (refused: boolean) => void>()
  /** Called at each look, before it is made: the test's moment to change the world. */
  onLook?: (look: number) => void
  openTab() {
    if (this.blocked) return undefined
    const tab = new StandInTab()
    this.tabs.push(tab)
    return tab
  }
  async wait() {
    this.looks += 1
    this.onLook?.(this.looks)
    await new Promise((done) => setTimeout(done, 0))
  }
  hear(state: string, heard: (refused: boolean) => void) {
    this.hearing.set(state, heard)
    return () => this.hearing.delete(state)
  }
}

const linearServer = (status: string) => ({
  servers: [{ id: '900042', name: 'Linear', pluginId: 'linear', status }],
})

async function world() {
  const backend = new FakeBackend()
  const answers: Record<string, JSONValue> = {
    getCatalog: {
      plugins: [
        {
          id: 'linear',
          displayName: 'Linear',
          description: 'Read and update issues.',
          vendorMcpUrl: 'https://mcp.linear.app/mcp',
        },
      ],
    },
    listServers: { servers: [] },
    installEntry: linearServer('needsAuth'),
    vendorServerIdForPlugin: '900042',
    authenticateServer: {
      status: 'started',
      authorizationUrl: 'https://linear.app/oauth?state=s',
    },
    uninstallPlugin: { removed: true },
  }
  backend.commandAnswers.desktopMcp = (args) =>
    answers[String((args as { action?: string }).action)] ?? {}
  backend.serverAnswers.apps = { available: true }
  const store = new AppStore()
  await store.attach(backend)
  await store.loadAppCards()
  const browser = new StandInBrowser()
  const connector = new Connector(store, browser)
  const sent = (action: string) =>
    backend.commands.filter(
      (one) =>
        one.method === 'desktopMcp' &&
        (one.args as { action: string }).action === action,
    )
  return { backend, answers, store, browser, connector, sent }
}

describe('a chat card’s Connect (MacConnector.connect)', () => {
  it('asks first, opens the tab on the click, and closes it once connected', async () => {
    const { answers, browser, connector, sent } = await world()
    connector.connect('Linear')
    expect(connector.showing).toBe(true)
    expect(connector.asking?.consent.title).toBe('Linear')
    expect(connector.asking?.consent.route).toEqual({
      kind: 'vendor',
      host: 'mcp.linear.app',
    })
    expect(browser.tabs).toHaveLength(0)

    browser.onLook = (look) => {
      if (look === 2) answers.listServers = linearServer('connected')
    }
    connector.confirm()
    // Opened at once, blank, while the computer is asked; the card's spinner.
    expect(browser.tabs).toHaveLength(1)
    expect(browser.tabs[0]!.url).toBeUndefined()
    expect(connector.connecting).toBe('Linear')
    expect(connector.showing).toBe(false)

    await eventually(() => connector.connecting === undefined)
    expect(browser.tabs[0]!.url).toBe('https://linear.app/oauth?state=s')
    expect(browser.tabs[0]!.closedByApp).toBe(true)
    expect(browser.looks).toBe(2)
    expect(sent('uninstallPlugin')).toHaveLength(0)
  })

  it('never takes back an app whose tab the person closed: ten more looks, then it may still finish', async () => {
    const { browser, connector, sent } = await world()
    browser.onLook = (look) => {
      if (look === 1) browser.tabs[0]!.closed = true
    }
    connector.connect('Linear')
    connector.confirm()
    await eventually(() => connector.connecting === undefined)
    expect(browser.looks).toBe(11)
    expect(sent('uninstallPlugin')).toHaveLength(0)
  })

  it('takes back an app whose blank tab was closed before its page came', async () => {
    const { browser, connector, sent } = await world()
    connector.connect('Linear')
    connector.confirm()
    browser.tabs[0]!.closed = true
    await eventually(() => sent('uninstallPlugin').length === 1)
    await eventually(() => connector.connecting === undefined)
    expect(browser.tabs[0]!.url).toBeUndefined()
    expect(browser.looks).toBe(0)
  })

  it('never opens a page that only comes back to the loopback, and takes the app back', async () => {
    const { answers, browser, connector, sent } = await world()
    answers.authenticateServer = {
      status: 'started',
      authorizationUrl:
        'https://mcp.canva.com/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A8787%2Fcallback&state=vendor-canva-1',
    }
    connector.connect('Linear')
    connector.confirm()
    await eventually(() => sent('uninstallPlugin').length === 1)
    await eventually(() => connector.connecting === undefined)
    expect(browser.tabs[0]!.url).toBeUndefined()
    expect(browser.tabs[0]!.closedByApp).toBe(true)
    expect(browser.looks).toBe(0)
  })

  it('closes the tab and says why when there is no page', async () => {
    const { answers, browser, connector, store, sent } = await world()
    answers.authenticateServer = {
      status: 'not-supported',
      message: 'Linear is coming soon in Simeon.',
    }
    connector.connect('Linear')
    connector.confirm()
    await eventually(() => connector.connecting === undefined)
    expect(browser.tabs[0]!.closedByApp).toBe(true)
    expect(store.problem).toBe(
      "Linear didn't connect: Linear is coming soon in Simeon.",
    )
    expect(sent('uninstallPlugin')).toHaveLength(1)

    // Signed in already: the tab closes, the app stays.
    answers.authenticateServer = { status: 'already-authenticated' }
    connector.connect('Linear')
    connector.confirm()
    await eventually(() => browser.tabs[1]?.closed === true)
    await eventually(() => connector.connecting === undefined)
    expect(sent('uninstallPlugin')).toHaveLength(1)
  })

  it('tells the person when the browser refuses the click’s tab, and adds nothing', async () => {
    const { browser, connector, store, sent } = await world()
    browser.blocked = true
    connector.connect('Linear')
    connector.confirm()
    await eventually(() => connector.told !== undefined)
    expect(connector.told).toBe("Linear didn't connect. Try again.")
    // Nothing asked of the computer, nothing added, nothing to take back; never a page opened later, off the click.
    expect(sent('installEntry')).toHaveLength(0)
    expect(sent('authenticateServer')).toHaveLength(0)
    expect(connector.connecting).toBeUndefined()
    expect(browser.tabs).toHaveLength(0)
    expect(store.problem).toBeUndefined()
    connector.dismissTold()
    expect(connector.told).toBeUndefined()
  })

  it('takes the app back when its sign-in is handed a tab that was let go, and says so', async () => {
    const { browser, connector, sent } = await world()
    // A sign-in started after its click's work ended: the tab is gone, and none can be opened off the click.
    let late: HeldTab | undefined
    await connector.holdingTab(async (tab) => {
      late = tab
    })
    expect(browser.tabs[0]!.closedByApp).toBe(true)
    browser.blocked = true
    expect(
      await connector.signIn(
        'https://linear.app/oauth',
        'Linear',
        async () => true,
        {
          tab: late,
        },
      ),
    ).toBe('cancelled')
    expect(sent('uninstallPlugin')).toHaveLength(0)
  })

  it('ends as the Mac’s sheet closed on a refusal when the return page says the maker refused: taken back', async () => {
    const { answers, browser, connector, sent } = await world()
    answers.authenticateServer = {
      status: 'started',
      authorizationUrl:
        'https://linear.app/oauth?redirect_uri=https%3A%2F%2Fapi.simeonlabs.com%2Fdesktop%2Fmcp-oauth%2Fcallback&state=vendor-linear-9',
    }
    browser.onLook = (look) => {
      // Someone else's sign-in, then this one's: refused on the maker's page.
      if (look === 1) browser.hearing.get('vendor-linear-9')?.(false)
      if (look === 2) browser.hearing.get('vendor-linear-9')?.(true)
    }
    connector.connect('Linear')
    connector.confirm()
    await eventually(() => sent('uninstallPlugin').length === 1)
    await eventually(() => connector.connecting === undefined)
    // The look that heard it, then two more.
    expect(browser.looks).toBe(4)
    expect(browser.hearing.size).toBe(0)
    // The tab stays on the return page's words.
    expect(browser.tabs[0]!.closed).toBe(false)
  })

  it('stops asking after five minutes', async () => {
    const { browser, connector, sent } = await world()
    connector.connect('Linear')
    connector.confirm()
    await eventually(() => browser.looks > 0)
    for (let i = 0; i < 40 && connector.connecting !== undefined; i += 1)
      await eventually(() => connector.connecting === undefined)
    expect(connector.connecting).toBeUndefined()
    expect(browser.looks).toBe(askTimes)
    expect(browser.tabs[0]!.closedByApp).toBe(true)
    expect(sent('uninstallPlugin')).toHaveLength(0)
  })

  it('does nothing on Cancel', async () => {
    const { browser, connector } = await world()
    connector.connect('Linear')
    connector.cancel()
    expect(connector.showing).toBe(false)
    expect(browser.tabs).toHaveLength(0)
    expect(connector.connecting).toBeUndefined()
  })

  it('waits while another sign-in is open: its Connect asks nothing and its tab closes', async () => {
    const { browser, connector, sent } = await world()
    void connector.signIn('https://x.example/a', 'Notion', async () => false)
    connector.connect('Linear')
    connector.confirm()
    await eventually(() => browser.tabs[1]?.closed === true)
    expect(browser.tabs[1]!.url).toBeUndefined()
    expect(connector.connecting).toBe('Notion')
    expect(sent('installEntry')).toHaveLength(0)
    expect(sent('authenticateServer')).toHaveLength(0)
  })
})

describe('a sign-in (MacConnector.signIn)', () => {
  it('gives way to a newer one, whose tab replaces its', async () => {
    const { browser, connector } = await world()
    let firstDone = false
    const first = connector.signIn(
      'https://linear.app/oauth?state=1',
      'Linear',
      async () => {
        firstDone = true
        return false
      },
    )
    await eventually(() => firstDone)
    let connected = false
    browser.onLook = () => {
      connected = true
    }
    const second = connector.signIn(
      'https://notion.so/oauth?state=2',
      'Notion',
      async () => connected,
    )
    expect(browser.tabs[0]!.closedByApp).toBe(true)
    expect(connector.connecting).toBe('Notion')
    expect(await first).toBe('replaced')
    expect(await second).toBe('connected')
    expect(browser.tabs[1]!.url).toBe('https://notion.so/oauth?state=2')
    expect(connector.connecting).toBeUndefined()
  })

  it('keeps asking after a look that fails', async () => {
    const { connector } = await world()
    let looks = 0
    const end = await connector.signIn(
      'https://linear.app/oauth',
      'Linear',
      async () => {
        looks += 1
        if (looks === 1) throw new Error('offline')
        return looks === 3
      },
    )
    expect(end).toBe('connected')
  })

  it('hands each click’s tab to its own sign-in, never another click’s', async () => {
    const { browser, connector } = await world()
    const gate = () => {
      let open!: () => void
      const shut = new Promise<void>((done) => (open = done))
      return { open, shut }
    }
    const one = gate()
    const two = gate()
    let firstFinished = false
    // Click 1 (Connectors' Add, installing first), then click 2 (a card's Connect, still asking the computer).
    const first = connector.holdingTab(async (tab) => {
      await one.shut
      await connector.signIn(
        'https://x.example/one',
        'One',
        async () => firstFinished,
        { tab },
      )
    })
    const second = connector.holdingTab(async () => {
      await two.shut
    })
    expect(browser.tabs).toHaveLength(2)
    one.open()
    await eventually(() => browser.tabs[0]!.url !== undefined)
    two.open()
    await second
    // Click 1's page in click 1's tab; click 2's tab, unused, closed when its work ended.
    expect(browser.tabs[0]!.url).toBe('https://x.example/one')
    expect(browser.tabs[0]!.closed).toBe(false)
    expect(browser.tabs[1]!.url).toBeUndefined()
    expect(browser.tabs[1]!.closedByApp).toBe(true)
    firstFinished = true
    await first
    expect(browser.tabs[0]!.closedByApp).toBe(true)
  })

  it('keeps the tab for a sign-in that waits before its page, though its click’s work ends first', async () => {
    const { browser, connector } = await world()
    let spaced!: () => void
    const spacing = new Promise<void>((done) => (spaced = done))
    let ending: Promise<string> | undefined
    // As Connectors' sign-in: started in the work, not waited for, its page after a spacing wait.
    await connector.holdingTab(async (tab) => {
      ending = connector.signIn(
        'https://x.example/late',
        'Late',
        async () => true,
        { tab, after: spacing },
      )
    })
    browser.blocked = true
    expect(browser.tabs[0]!.closed).toBe(false)
    expect(connector.connecting).toBe('Late')
    spaced()
    expect(await ending).toBe('connected')
    expect(browser.tabs[0]!.url).toBe('https://x.example/late')
    expect(browser.tabs).toHaveLength(1)
  })

  it('takes a tab once: a second sign-in handed the same tab gets none', async () => {
    const { browser, connector } = await world()
    await connector.holdingTab(async (tab) => {
      const first = connector.signIn(
        'https://x.example/1',
        'One',
        async () => false,
        {
          tab,
        },
      )
      const second = connector.signIn(
        'https://x.example/2',
        'Two',
        async () => true,
        {
          tab,
        },
      )
      expect(await second).toBe('cancelled')
      expect(await first).toBe('replaced')
    })
    // The first showed its page there; the second, given no tab of its own, opened none, and its start closed the first's.
    expect(browser.tabs).toHaveLength(1)
    expect(browser.tabs[0]!.url).toBe('https://x.example/1')
    expect(browser.tabs[0]!.closedByApp).toBe(true)
  })

  it('opens no tab for a consent whose Connect goes on to no page', async () => {
    const { browser, connector } = await world()
    let went = false
    connector.ask(
      'Linear',
      async () => {
        went = true
      },
      { signIn: false },
    )
    connector.confirm()
    expect(went).toBe(true)
    expect(browser.tabs).toHaveLength(0)
  })
})

describe('Add Another Account (MacConnector.addAccount)', () => {
  it('opens the tab at once, and closes it once the server lists a new account', async () => {
    const { store, browser, connector } = await world()
    let ids = ['a1']
    const asked: string[] = []
    store.loadAppAccounts = async (toolkit) => {
      asked.push(toolkit)
    }
    store.appAccountIds = () => ids
    store.anotherAccountURL = async (toolkit, name) =>
      `https://api.simeonlabs.com/desktop/apps/start?t=${toolkit}&n=${name}`
    browser.onLook = (look) => {
      if (look === 3) ids = ['a1', 'a2']
    }
    connector.addAccount('gmail', 'Gmail')
    expect(connector.connecting).toBe('Gmail')
    expect(browser.tabs).toHaveLength(1)
    await eventually(() => connector.connecting === undefined)
    expect(browser.tabs[0]!.url).toBe(
      'https://api.simeonlabs.com/desktop/apps/start?t=gmail&n=Gmail',
    )
    expect(browser.tabs[0]!.closedByApp).toBe(true)
    expect(browser.looks).toBe(3)
    expect(asked.every((toolkit) => toolkit === 'gmail')).toBe(true)

    // Waits while another sign-in is open.
    void connector.signIn('https://x.example/a', 'Notion', async () => false)
    connector.addAccount('gmail', 'Gmail')
    expect(connector.connecting).toBe('Notion')
    expect(browser.tabs).toHaveLength(2)
  })

  it('tells the person when the browser refuses its tab', async () => {
    const { store, browser, connector } = await world()
    let asked = false
    store.anotherAccountURL = async () => {
      asked = true
      return 'https://x.example/b'
    }
    browser.blocked = true
    connector.addAccount('gmail', 'Gmail')
    await eventually(() => connector.told !== undefined)
    expect(connector.told).toBe("Gmail didn't connect. Try again.")
    expect(asked).toBe(false)
    expect(connector.connecting).toBeUndefined()
  })

  it('closes the tab when no page can be had', async () => {
    const { store, browser, connector } = await world()
    store.anotherAccountURL = async () => undefined
    connector.addAccount('gmail', 'Gmail')
    await eventually(() => connector.connecting === undefined)
    expect(browser.tabs[0]!.closedByApp).toBe(true)
    expect(browser.tabs[0]!.url).toBeUndefined()
  })
})

describe('the browser’s tab (browserTabs)', () => {
  it('is closed only while the window may close it: blank or on our own pages, never on another site', () => {
    const tab = (closed: boolean, away: boolean) => ({
      closed,
      location: {
        get href(): string {
          if (away) throw new DOMException('Blocked a frame', 'SecurityError')
          return 'about:blank'
        },
      },
    })
    expect(closable(tab(false, false))).toBe(true)
    // On another site: the browser would refuse it (the window is no longer familiar with a tab whose opener it nulled).
    expect(closable(tab(false, true))).toBe(false)
    expect(closable(tab(true, false))).toBe(false)
    expect(closable(tab(true, true))).toBe(false)
  })
})
