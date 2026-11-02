// SimeonCore's AppAccountsTests (Add Another Account, 29 October 2026: an
// app's accounts as Simeon Labs' server keeps them), translated; the
// store's commands against the stand-in computer and server.

import { describe, expect, it, vi } from 'vitest'
import {
  accountDetail,
  accountPath,
  accountTitle,
  appAccountsFrom,
  canAddAnother,
  toolkitOf,
} from './appAccounts'
import type { JSONValue } from './json'
import { AppStore } from './store'
import { FakeBackend, ms } from './testing'

/** A stand-in server whose answer to a path can be held back, read as the request left (a slow `GET` answers with the list as it was). */
class HeldServer extends FakeBackend {
  private held = new Map<string, Promise<void>>()

  hold(path: string): { answer: () => void } {
    let answer!: () => void
    this.held.set(path, new Promise<void>((done) => (answer = done)))
    return { answer }
  }

  override async server(
    path: string,
    method?: string,
    body?: JSONValue,
  ): Promise<JSONValue> {
    const gate = this.held.get(path)
    this.held.delete(path)
    if (!gate) return super.server(path, method, body)
    const answer = this.serverAnswers[path]
    this.serverCalls.push({ path, method, body })
    await gate
    await ms(0)
    if (answer === undefined) throw new Error('No such path.')
    return answer
  }
}

const listed: JSONValue = {
  toolkit: 'gmail',
  max: 5,
  accounts: [
    { id: 'ca_h', name: 'Home', identity: 'jo@gmail.com', label: 'Home' },
    { id: 'ca_w', name: null, identity: 'jo@acme.com', label: 'jo@acme.com' },
    { id: 'ca_p', name: null, identity: null, label: 'Account 3' },
  ],
}

describe('an app’s accounts', () => {
  it('each row says the name given, else who it signs in as, else its place', () => {
    const read = appAccountsFrom(listed)!
    expect(read.accounts.map((one) => one.id)).toEqual(['ca_h', 'ca_w', 'ca_p'])
    expect(read.accounts.map((one, at) => accountTitle(one, at + 1))).toEqual([
      'Home',
      'jo@acme.com',
      'Account 3',
    ])
    // Who it signs in as, under a name the person gave it.
    expect(read.accounts.map(accountDetail)).toEqual([
      'jo@gmail.com',
      undefined,
      undefined,
    ])
    expect(canAddAnother(read)).toBe(true)
    // Full.
    expect(canAddAnother({ accounts: read.accounts, max: 3 })).toBe(false)
    // The first account is Connect's, not Add Another Account's.
    expect(canAddAnother({ accounts: [], max: 5 })).toBe(false)
    expect(appAccountsFrom({ error: { message: 'x' } })).toBeUndefined()
    // No id: not an account; no max: five.
    expect(appAccountsFrom({ accounts: [{ name: 'x' }, { id: 'a' }] })).toEqual(
      { accounts: [{ id: 'a', label: 'a' }], max: 5 },
    )
  })

  it('only an app Simeon’s server serves has its accounts there', () => {
    expect(
      toolkitOf('https://api.simeonlabs.com/desktop/api/apps/mcp/gmail'),
    ).toBe('gmail')
    expect(
      toolkitOf('https://api.simeonlabs.com/desktop/api/apps/mcp/clio_manage/'),
    ).toBe('clio_manage')
    // A maker's own server.
    expect(toolkitOf('https://mcp.notion.com/mcp')).toBeUndefined()
    expect(
      toolkitOf('https://api.simeonlabs.com/desktop/api/apps/mcp/'),
    ).toBeUndefined()
    expect(
      toolkitOf(
        'https://api.simeonlabs.com/desktop/api/apps/mcp/Gmail%2F..%2Fx',
      ),
    ).toBeUndefined()
    expect(toolkitOf(undefined)).toBeUndefined()
    // As Swift reads one: a path alone, an empty part skipped.
    expect(toolkitOf('/desktop/api/apps/mcp/gmail')).toBe('gmail')
    expect(
      toolkitOf('https://api.simeonlabs.com/desktop/api/apps/mcp//slack/x'),
    ).toBe('slack')
    // An id in the address: only letters, digits, "-" and "_" as they are.
    expect(accountPath('ca_h-1')).toBe('ca_h-1')
    expect(accountPath('a/../b c.d')).toBe('a%2F%2E%2E%2Fb%20c%2Ed')
  })

  it('the store reads, adds, renames and removes', async () => {
    const backend = new FakeBackend()
    backend.serverAnswers['apps/gmail/accounts'] = listed
    backend.serverAnswers['apps/gmail/connect'] = {
      toolkit: 'gmail',
      connected: false,
      url: 'https://api.simeonlabs.com/desktop/apps/start?t=x',
    }
    const store = new AppStore()
    await store.attach(backend)

    await store.loadAppAccounts('gmail')
    expect(store.appAccounts.gmail?.accounts.length).toBe(3)
    expect(store.appAccountIds('gmail')).toEqual(['ca_h', 'ca_w', 'ca_p'])
    expect(store.appAccountIds('slack')).toEqual([])

    const url = await store.anotherAccountURL('gmail', 'Gmail')
    expect(url).toBe('https://api.simeonlabs.com/desktop/apps/start?t=x')
    const add = backend.serverCalls.find(
      (one) => one.path === 'apps/gmail/connect',
    )
    expect(add).toEqual({
      path: 'apps/gmail/connect',
      method: 'POST',
      body: { another: true },
    })

    const home = store.appAccounts.gmail!.accounts[0]!
    backend.serverAnswers['apps/gmail/accounts/ca_h'] = {
      toolkit: 'gmail',
      max: 5,
      accounts: [{ id: 'ca_w', identity: 'jo@acme.com', label: 'jo@acme.com' }],
    }
    const sent = () =>
      backend.serverCalls.filter(
        (one) => one.path === 'apps/gmail/accounts/ca_h',
      )
    // The same name again changes nothing.
    await store.renameAppAccount('gmail', home, '  Home  ')
    expect(sent()).toEqual([])
    await store.renameAppAccount('gmail', home, ' Family  photos ')
    expect(sent()).toEqual([
      {
        path: 'apps/gmail/accounts/ca_h',
        method: 'PATCH',
        body: { name: 'Family photos' },
      },
    ])
    // The list the server answers with.
    expect(store.appAccountIds('gmail')).toEqual(['ca_w'])

    await store.removeAppAccount('gmail', home)
    expect(sent().at(-1)).toEqual({
      path: 'apps/gmail/accounts/ca_h',
      method: 'DELETE',
      body: undefined,
    })
    expect(store.problem).toBeUndefined()

    // A refusal is said, in the core's words; then the list is read again, as the server has it.
    delete backend.serverAnswers['apps/gmail/accounts/ca_h']
    await store.removeAppAccount('gmail', home)
    expect(store.problem).toBe("Couldn't remove the account: No such path.")
    await vi.waitFor(() =>
      expect(store.appAccountIds('gmail')).toEqual(['ca_h', 'ca_w', 'ca_p']),
    )

    // Signed out: forgotten.
    store.detach()
    expect(store.appAccounts).toEqual({})
  })

  it('an add that opens no page says why', async () => {
    const backend = new FakeBackend()
    backend.serverAnswers['apps/gmail/connect'] = {
      toolkit: 'gmail',
      connected: true,
    }
    const store = new AppStore()
    await store.attach(backend)
    expect(await store.anotherAccountURL('gmail', 'Gmail')).toBeUndefined()
    expect(store.problem).toBe("Gmail didn't connect. Try again.")
    // Refused by the server: its words, when they are plain.
    delete backend.serverAnswers['apps/gmail/connect']
    expect(await store.anotherAccountURL('gmail', 'Gmail')).toBeUndefined()
    expect(store.problem).toBe("Gmail didn't connect: No such path.")
  })

  it('finds an app’s toolkit by its server, else by its catalogue row', async () => {
    const backend = new FakeBackend()
    backend.commandAnswers.desktopMcp = (args) =>
      (args as { action?: string }).action === 'getCatalog'
        ? [
            {
              id: 'gmail',
              name: 'Gmail',
              displayName: 'Gmail',
              vendorMcpUrl:
                'https://api.simeonlabs.com/desktop/api/apps/mcp/gmail',
            },
            {
              id: 'notion',
              name: 'Notion',
              displayName: 'Notion',
              vendorMcpUrl: 'https://mcp.notion.com/mcp',
            },
          ]
        : {}
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppCards()
    expect(
      store.appsToolkit(
        'https://api.simeonlabs.com/desktop/api/apps/mcp/slack',
        'gmail',
      ),
    ).toBe('slack')
    expect(store.appsToolkit(undefined, 'gmail')).toBe('gmail')
    expect(store.appsToolkit('https://mcp.notion.com/mcp', 'notion')).toBe(
      undefined,
    )
    expect(store.appsToolkit(undefined, undefined)).toBeUndefined()
  })

  it('a read that began before a rename or a Remove never brings the old list back', async () => {
    const backend = new HeldServer()
    const home: JSONValue = {
      id: 'ca_h',
      name: 'Home',
      identity: 'jo@gmail.com',
    }
    const two = {
      toolkit: 'gmail',
      max: 5,
      accounts: [home, { id: 'ca_w', identity: 'jo@acme.com' }],
    }
    backend.serverAnswers['apps/gmail/accounts'] = two
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppAccounts('gmail')
    const work = store.appAccounts.gmail!.accounts[1]!

    // A read goes (6b's poll, the page showing), slow; meanwhile Remove answers at once.
    const read = backend.hold('apps/gmail/accounts')
    const reading = store.loadAppAccounts('gmail')
    backend.serverAnswers['apps/gmail/accounts/ca_w'] = {
      ...two,
      accounts: [home],
    }
    await store.removeAppAccount('gmail', work)
    expect(store.appAccountIds('gmail')).toEqual(['ca_h'])
    read.answer()
    await reading
    expect(store.appAccountIds('gmail')).toEqual(['ca_h'])

    // The same for a rename.
    const renamed = {
      ...two,
      accounts: [{ id: 'ca_h', name: 'Family', identity: 'jo@gmail.com' }],
    }
    backend.serverAnswers['apps/gmail/accounts'] = {
      ...two,
      accounts: [home],
    }
    const poll = backend.hold('apps/gmail/accounts')
    const polling = store.loadAppAccounts('gmail')
    backend.serverAnswers['apps/gmail/accounts/ca_h'] = renamed
    await store.renameAppAccount(
      'gmail',
      store.appAccounts.gmail!.accounts[0]!,
      'Family',
    )
    poll.answer()
    await polling
    expect(store.appAccounts.gmail!.accounts.map((one) => one.name)).toEqual([
      'Family',
    ])

    // A read that begins after the change is kept.
    backend.serverAnswers['apps/gmail/accounts'] = two
    await store.loadAppAccounts('gmail')
    expect(store.appAccountIds('gmail')).toEqual(['ca_h', 'ca_w'])
  })

  it('of two changes, the later one’s answer stands, whichever comes first', async () => {
    const backend = new HeldServer()
    const listed = (...ids: string[]) => ({
      toolkit: 'gmail',
      max: 5,
      accounts: ids.map((id) => ({ id, identity: `${id}@x.com` })),
    })
    backend.serverAnswers['apps/gmail/accounts'] = listed('a', 'b', 'c')
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppAccounts('gmail')
    const [a, b] = store.appAccounts.gmail!.accounts
    // Removing a, slow; then b, answered first.
    backend.serverAnswers['apps/gmail/accounts/a'] = listed('b', 'c')
    const slow = backend.hold('apps/gmail/accounts/a')
    const first = store.removeAppAccount('gmail', a!)
    backend.serverAnswers['apps/gmail/accounts/b'] = listed('a', 'c')
    await store.removeAppAccount('gmail', b!)
    expect(store.appAccountIds('gmail')).toEqual(['a', 'c'])
    slow.answer()
    await first
    expect(store.appAccountIds('gmail')).toEqual(['a', 'c'])
  })

  it('opens only a web page for another account, and nothing once signed out', async () => {
    const backend = new HeldServer()
    backend.serverAnswers['apps/gmail/connect'] = {
      url: 'javascript:alert(1)',
    }
    const store = new AppStore()
    await store.attach(backend)
    expect(await store.anotherAccountURL('gmail', 'Gmail')).toBeUndefined()
    expect(store.problem).toBe("Gmail didn't connect. Try again.")
    // Signed out while it was asked: no page, and nothing said.
    store.problem = undefined
    backend.serverAnswers['apps/gmail/connect'] = {
      url: 'https://api.simeonlabs.com/desktop/apps/start?t=x',
    }
    const held = backend.hold('apps/gmail/connect')
    const asking = store.anotherAccountURL('gmail', 'Gmail')
    store.detach()
    held.answer()
    expect(await asking).toBeUndefined()
    expect(store.problem).toBeUndefined()
  })
})
