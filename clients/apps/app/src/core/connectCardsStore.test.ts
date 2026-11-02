// Step 3c's cards against a stand-in computer (Store.swift's commands for
// them, as PluginCallsTests and CoreTests run them): the apps' cards reading
// the connected apps, the catalogue and the apps coming soon; Slack's and
// GitHub's state and link; a cloud agent's state.

import { describe, expect, it } from 'vitest'
import type { JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend } from './testing'

/** The demo's apps (Demo.swift's `demoApps`): Gmail connected, the catalogue of eight. */
function computer() {
  const backend = new FakeBackend()
  backend.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
  const catalogue = [
    ['gmail', 'Gmail', 'Search, read, draft, and send email.'],
    ['linear', 'Linear', 'Read and update issues.'],
    ['xero', 'Xero', 'Invoices and bills.'],
    ['acme', 'Acme', 'Not yet.'],
  ].map(([id, name, description]) => ({
    id: id!,
    name: name!,
    displayName: name!,
    description: description!,
    ...(id === 'acme' ? { comingSoon: true } : {}),
  }))
  const answers: Record<string, () => JSONValue> = {
    listServers: () => ({
      servers: [
        {
          id: 'demo-gmail',
          name: 'Gmail',
          pluginId: 'gmail',
          accountKey: 'default',
          status: 'connected',
          toolCount: 12,
        },
      ],
    }),
    getCatalog: () => catalogue,
  }
  const failing = new Set<string>()
  backend.commandAnswers.desktopMcp = (args) => {
    const action = String((args as { action?: string }).action)
    if (failing.has(action)) throw new Error(`${action} failed`)
    return answers[action]?.() ?? {}
  }
  backend.serverAnswers.apps = {
    available: true,
    comingSoon: ['gusto', 'Brex'],
  }
  return { backend, failing }
}

const actions = (backend: FakeBackend) =>
  backend.commands
    .filter((one) => one.method === 'desktopMcp')
    .map((one) => (one.args as { action: string }).action)

describe('the apps’ cards', () => {
  it('read the connected apps, and once a sign-in the catalogue and the apps coming soon', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    // Before the server answers: the apps that need Simeon Labs' own sign-in with the company.
    expect(store.isComingSoon('Xero')).toBe(true)
    expect(store.isComingSoon('docusign')).toBe(true)
    expect(store.isComingSoon('Gmail')).toBe(false)
    await Promise.all([store.loadAppCards(), store.loadAppCards()])
    expect(actions(backend).sort()).toEqual(['getCatalog', 'listServers'])
    const catalogRead = backend.commands.find(
      (one) =>
        one.method === 'desktopMcp' &&
        (one.args as { action: string }).action === 'getCatalog',
    )!
    expect(catalogRead.args).toEqual({
      action: 'getCatalog',
      args: [{ language: 'en' }],
    })
    // It may wake the computer, as the Mac's card's read does.
    expect(catalogRead.wakes).toBe(true)
    expect(backend.serverPaths).toEqual(['apps'])
    expect(store.appsComingSoon).toEqual(new Set(['gusto', 'brex']))
    // Its own sign-in is set up on the server: no longer coming soon.
    expect(store.isComingSoon('Xero')).toBe(false)
    expect(store.isComingSoon('Gusto')).toBe(true)
    // The catalogue's own word holds.
    expect(store.isComingSoon('Acme')).toBe(true)
    expect(store.isComingSoon('Gmail')).toBe(false)
    expect(store.isConnected('Gmail')).toBe(true)
    expect(store.isConnected('Linear')).toBe(false)
    expect(store.connectedToolCount('Gmail')).toBe(12)
    expect(store.catalogApp('linear')?.summary).toBe('Read and update issues.')
    // Read again as another card shows: the apps only.
    await store.loadAppCards()
    expect(actions(backend).sort()).toEqual([
      'getCatalog',
      'listServers',
      'listServers',
    ])
    expect(backend.serverPaths).toEqual(['apps'])
  })

  it('keep what they had when the computer or the server doesn’t answer, and ask again next time', async () => {
    const { backend, failing } = computer()
    failing.add('getCatalog')
    backend.serverAnswers.apps = { available: true }
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppCards()
    expect(store.catalog).toEqual([])
    // An older server names none: the list stays as it is.
    expect(store.isComingSoon('Xero')).toBe(true)
    failing.delete('getCatalog')
    backend.serverAnswers.apps = { comingSoon: [] }
    await store.loadAppCards()
    expect(store.catalog.map((app) => app.title)).toEqual([
      'Gmail',
      'Linear',
      'Xero',
      'Acme',
    ])
    expect(store.appsComingSoon).toEqual(new Set())
    expect(store.isComingSoon('Xero')).toBe(false)
  })

  it('forget the catalogue and the server’s list on signing out', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppCards()
    expect(store.catalog).toHaveLength(4)
    store.detach()
    expect(store.catalog).toEqual([])
    expect(store.isComingSoon('Xero')).toBe(true)
    expect(store.isConnected('Gmail')).toBe(false)
    // The next sign-in reads the catalogue again.
    await store.attach(backend)
    await store.loadAppCards()
    expect(actions(backend).filter((one) => one === 'getCatalog')).toHaveLength(
      2,
    )
  })
})

describe('Slack or GitHub for a routine', () => {
  it('knows whether it is linked, and not while the computer doesn’t answer', async () => {
    const { backend } = computer()
    backend.commandAnswers.getListenerIntegrations = () => ({
      integrations: [
        { platform: 'slack', isConnected: false },
        { platform: 'github', isConnected: true },
      ],
    })
    const store = new AppStore()
    expect(await store.listenerConnected('slack')).toBeUndefined()
    await store.attach(backend)
    expect(await store.listenerConnected('slack')).toBe(false)
    expect(await store.listenerConnected('github')).toBe(true)
    backend.refusedCommands.add('getListenerIntegrations')
    expect(await store.listenerConnected('github')).toBeUndefined()
  })

  it('asks for the page that links it, and says when it can’t', async () => {
    const { backend } = computer()
    backend.commandAnswers.getListenerConnectUrl = (args) => ({
      url: `https://api.example.com/sand/${(args as { platform: string }).platform}/install`,
    })
    const store = new AppStore()
    await store.attach(backend)
    expect(await store.listenerConnectURL('slack')).toBe(
      'https://api.example.com/sand/slack/install',
    )
    expect(
      backend.commands.find((one) => one.method === 'getListenerConnectUrl')
        ?.args,
    ).toEqual({ platform: 'slack' })
    backend.commandAnswers.getListenerConnectUrl = () => ({ url: null })
    expect(await store.listenerConnectURL('github')).toBeUndefined()
    expect(store.problem).toBeUndefined()
    backend.refusedCommands.add('getListenerConnectUrl')
    expect(await store.listenerConnectURL('github')).toBeUndefined()
    expect(store.problem).toBe(
      "Couldn't open the link: The computer didn't answer.",
    )
  })
})

describe('a cloud agent', () => {
  it('reads its state, nothing, or that it couldn’t be asked', async () => {
    const { backend } = computer()
    let answer: JSONValue = { status: 'running', name: 'Fix the login' }
    backend.commandAnswers.getCloudAgentInfo = () => answer
    const store = new AppStore()
    expect(await store.cloudAgent('bc-1')).toEqual({ kind: 'failed' })
    await store.attach(backend)
    const read = await store.cloudAgent('bc-1')
    expect(read.kind === 'info' && read.info.name).toBe('Fix the login')
    expect(
      backend.commands.find((one) => one.method === 'getCloudAgentInfo')?.args,
    ).toEqual({ bcId: 'bc-1', includeFiles: false })
    answer = null
    expect(await store.cloudAgent('bc-1')).toEqual({ kind: 'empty' })
    backend.refusedCommands.add('getCloudAgentInfo')
    expect(await store.cloudAgent('bc-1')).toEqual({ kind: 'failed' })
    // Asked quietly: nothing said.
    expect(store.problem).toBeUndefined()
  })
})
