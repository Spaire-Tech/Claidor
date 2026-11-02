// One Connect against a stand-in computer (the core's Store.swift
// `beginConnect`, `undoConnect`, `signInURL`): PluginCallsTests'
// "Connect adds and signs in and takes back what it left half added", and
// the store's other ways through it.

import { describe, expect, it } from 'vitest'
import { makeApp } from './connectedApps'
import type { JSONValue } from './json'
import { AppStore } from './store'
import { FakeBackend } from './testing'

/** `PluginsBox`: `desktopMcp`'s actions answered from a script, each call kept. */
function computer() {
  const backend = new FakeBackend()
  const answers: Record<string, JSONValue> = {
    getCatalog: { plugins: [{ id: 'linear', displayName: 'Linear' }] },
    listServers: { servers: [] },
    installEntry: {
      servers: [
        {
          id: '900042',
          name: 'Linear',
          pluginId: 'linear',
          status: 'needsAuth',
        },
      ],
    },
    vendorServerIdForPlugin: '900042',
    authenticateServer: {
      status: 'started',
      authorizationUrl: 'https://linear.app/oauth',
    },
    uninstallPlugin: { removed: true, state: { servers: [] } },
  }
  const failing = new Set<string>()
  backend.commandAnswers.desktopMcp = (args) => {
    const action = String((args as { action?: string }).action)
    if (failing.has(action)) throw new Error(`${action} failed`)
    return answers[action] ?? {}
  }
  backend.serverAnswers.apps = { available: true }
  const sent = (action: string) =>
    backend.commands
      .filter(
        (one) =>
          one.method === 'desktopMcp' &&
          (one.args as { action: string }).action === action,
      )
      .map((one) => one.args)
  return { backend, answers, failing, sent }
}

describe('one Connect (PluginCallsTests)', () => {
  it('adds and signs in, and takes back what it left half added', async () => {
    const { backend, answers, sent } = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppCards()

    // Connect: installed, then its sign-in asked for at once.
    const start = await store.beginConnect('Linear')
    expect(start).toEqual({
      url: 'https://linear.app/oauth',
      addedPlugin: 'linear',
    })
    expect(sent('installEntry')).toEqual([
      { action: 'installEntry', args: [{ entryId: 'linear' }] },
    ])
    expect(sent('authenticateServer').at(-1)).toEqual({
      action: 'authenticateServer',
      args: ['900042', 'default', 'connector_card'],
    })

    // Cancelled: taken back.
    await store.undoConnect(start!, 'Linear')
    expect(sent('uninstallPlugin')).toEqual([
      { action: 'uninstallPlugin', args: ['linear'] },
    ])

    // Connected as the tab closed: kept.
    answers.listServers = {
      servers: [
        {
          id: '900042',
          name: 'Linear',
          pluginId: 'linear',
          status: 'connected',
        },
      ],
    }
    await store.undoConnect(start!, 'Linear')
    expect(sent('uninstallPlugin')).toHaveLength(1)

    // A sign-in that doesn't open: what this connect added goes at once, and the line says why.
    answers.listServers = { servers: [] }
    await store.loadApps()
    answers.authenticateServer = {
      status: 'not-supported',
      message: 'Linear is coming soon in Simeon.',
    }
    expect(await store.beginConnect('Linear')).toBeUndefined()
    expect(store.problem).toBe(
      "Linear didn't connect: Linear is coming soon in Simeon.",
    )
    expect(sent('uninstallPlugin')).toHaveLength(2)

    // Signed in already: kept, even before the list says so.
    answers.authenticateServer = { status: 'already-authenticated' }
    expect(await store.beginConnect('Linear')).toBeUndefined()
    expect(sent('uninstallPlugin')).toHaveLength(2)
  })

  it('asks no sign-in for an app connected already, and none twice for one there', async () => {
    const { backend, answers, sent } = computer()
    answers.listServers = {
      servers: [
        {
          id: '900042',
          name: 'Linear',
          pluginId: 'linear',
          status: 'connected',
        },
      ],
    }
    const store = new AppStore()
    await store.attach(backend)
    // Never read yet: read first (the apps and, once, the catalogue).
    expect(await store.beginConnect('Linear')).toBeUndefined()
    expect(sent('listServers').length).toBeGreaterThan(0)
    expect(sent('getCatalog')).toHaveLength(1)
    expect(sent('installEntry')).toEqual([])
    expect(sent('authenticateServer')).toEqual([])

    // There, waiting for its sign-in: no install, nothing to take back.
    answers.listServers = {
      servers: [
        {
          id: '900042',
          name: 'Linear',
          pluginId: 'linear',
          accountKey: 'work',
          status: 'needs-auth',
        },
      ],
    }
    await store.loadApps()
    expect(await store.beginConnect('Linear')).toEqual({
      url: 'https://linear.app/oauth',
      addedPlugin: undefined,
    })
    expect(sent('installEntry')).toEqual([])
    expect(sent('authenticateServer').at(-1)).toEqual({
      action: 'authenticateServer',
      args: ['900042', 'work', 'connector_card'],
    })
  })

  it('says why it couldn’t add, or doesn’t know the app', async () => {
    const { backend, failing, sent } = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppCards()
    failing.add('installEntry')
    expect(await store.beginConnect('Linear')).toBeUndefined()
    expect(store.problem).toBe("Couldn't add Linear: installEntry failed")
    expect(sent('authenticateServer')).toEqual([])

    expect(await store.beginConnect('Acme')).toBeUndefined()
    expect(store.problem).toBe("Acme isn't in Simeon's apps yet.")
  })

  it('finds the server the install made when the maker’s id isn’t given', async () => {
    const { backend, failing, sent } = computer()
    failing.add('vendorServerIdForPlugin')
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppCards()
    expect((await store.beginConnect('Linear'))?.addedPlugin).toBe('linear')
    expect(sent('authenticateServer').at(-1)).toEqual({
      action: 'authenticateServer',
      args: ['900042', 'default', 'connector_card'],
    })
  })

  it('takes back what it added when the computer refuses the sign-in', async () => {
    const { backend, failing, sent } = computer()
    failing.add('authenticateServer')
    const store = new AppStore()
    await store.attach(backend)
    await store.loadAppCards()
    expect(await store.beginConnect('Linear')).toBeUndefined()
    expect(store.problem).toBe(
      "Linear didn't connect: authenticateServer failed",
    )
    expect(sent('uninstallPlugin')).toEqual([
      { action: 'uninstallPlugin', args: ['linear'] },
    ])
  })

  it('signs in to one account (signInURL)', async () => {
    const { backend, answers, failing, sent } = computer()
    const store = new AppStore()
    await store.attach(backend)
    const work = makeApp({
      serverId: '900042',
      name: 'Linear',
      accountKey: 'work',
    })
    expect(await store.signInURL(work)).toBe('https://linear.app/oauth')
    expect(sent('authenticateServer').at(-1)).toEqual({
      action: 'authenticateServer',
      args: ['900042', 'work', 'connector_card'],
    })
    answers.authenticateServer = { status: 'already-authenticated' }
    expect(await store.signInURL(work)).toBeUndefined()
    failing.add('authenticateServer')
    expect(await store.signInURL(work)).toBeUndefined()
    expect(store.problem).toBe(
      "Couldn't sign in to Linear: authenticateServer failed",
    )
  })

  it('does nothing signed out', async () => {
    const store = new AppStore()
    expect(await store.beginConnect('Linear')).toBeUndefined()
    expect(store.problem).toBeUndefined()
  })
})
