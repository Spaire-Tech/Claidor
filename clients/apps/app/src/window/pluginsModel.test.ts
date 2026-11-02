// Connectors' model (mac/Simeon/PluginsModel.swift) against a stand-in
// computer (the core's `PluginsBox`) and a stand-in for the window's
// connector (6b's consent and sign-in): opening, Connect with its consent,
// sign-in and take-back, the setup page, skills, Remove and Uninstall, an
// account's sign-in with Reopen and Retry, a tool's switch, Fix with
// agent, the notice and the view's reset.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JSONValue } from '../core/json'
import { pluginEntryFrom, pluginServerFrom } from '../core/plugins'
import { PluginsBox } from '../core/pluginsTesting'
import { AppStore } from '../core/store'
import type { SignInEnd } from './connector'
import { PluginsModel } from './pluginsModel'

/** The window's connector, as a test drives it: each consent waits for `confirm`; a sign-in ends as `end` says, or as the computer says once polled. */
class StandInConnector {
  asked: string[] = []
  private going?: () => Promise<void>
  opened: { url: string; name: string }[] = []
  end: SignInEnd | 'poll' = 'poll'

  ask(name: string, go: () => Promise<void>): void {
    this.asked.push(name)
    this.going = go
  }

  async confirm(): Promise<void> {
    const go = this.going
    this.going = undefined
    await go?.()
  }

  async signIn(
    url: string,
    name: string,
    done: () => Promise<boolean>,
  ): Promise<SignInEnd> {
    this.opened.push({ url, name })
    if (this.end !== 'poll') return this.end
    return (await done()) ? 'connected' : 'unconfirmed'
  }
}

const linear = {
  id: 'linear',
  name: 'linear',
  displayName: 'Linear',
  description: 'Issues.',
  category: 'Productivity',
}

function computer() {
  const box = new PluginsBox()
  box.answers['desktopMcp:getCatalog'] = { plugins: [linear] }
  box.answers['desktopMcp:listServers'] = { servers: [] }
  box.answers['desktopMcp:listEffectivePlugins'] = []
  box.answers.getAgentWorkflows = []
  box.answers.getPluginSyncStatus = { authBlocked: [] }
  box.answers.syncPluginSkills = []
  box.serverAnswers.apps = { available: true, comingSoon: [] }
  return box
}

async function opened(box = computer()) {
  const store = new AppStore()
  await store.attach(box)
  const model = new PluginsModel(store)
  const connector = new StandInConnector()
  model.setConnector(connector)
  // The window tells it its open agent first, as ConnectorsLayer does.
  model.setAgent('theo')
  await model.load('theo')
  return { store, model, connector, box }
}

const needsAuth = (status = 'needsAuth'): JSONValue => ({
  servers: [{ id: '900042', name: 'Linear', pluginId: 'linear', status }],
})

const actions = (box: PluginsBox) =>
  box.commands.map((one) => PluginsBox.keyOf(one.method, one.args))

afterEach(() => {
  vi.useRealTimers()
})

describe('Connectors’ model', () => {
  it('opens on the catalogue the store holds, and reads the computer behind it', async () => {
    const box = computer()
    const store = new AppStore()
    await store.attach(box)
    const model = new PluginsModel(store)
    // None held: "Loading connectors…" until it is in.
    let loadedAtFirst: boolean | undefined
    box.before = (key) => {
      if (key === 'desktopMcp:getCatalog') loadedAtFirst ??= model.catalogLoaded
    }
    model.setAgent('theo')
    await model.load('theo')
    expect(loadedAtFirst).toBe(false)
    expect(model.catalogLoaded).toBe(true)
    expect(model.catalog.map((one) => one.id)).toEqual(['linear'])
    expect(actions(box)).toEqual(
      expect.arrayContaining([
        'desktopMcp:getCatalog',
        'desktopMcp:listEffectivePlugins',
        'desktopMcp:listServers',
        'getAgentWorkflows',
        'getPluginSyncStatus',
      ]),
    )
    await vi.waitFor(() => expect(actions(box)).toContain('syncPluginSkills'))
    expect(box.sentTo('getAgentWorkflows')).toEqual({ id: 'theo' })

    // Held now: shown at once, and read again behind it.
    const again = new PluginsModel(store)
    loadedAtFirst = undefined
    again.setAgent(undefined)
    await again.load(undefined)
    expect(loadedAtFirst).toBe(true)
    // No agent open: no private skills.
    expect(again.skills).toEqual([])
  })

  it('connects: the consent, the app added, its sign-in, then Connected', async () => {
    const { model, connector, box } = await opened()
    box.answers['desktopMcp:installEntry'] = needsAuth()
    box.answers['desktopMcp:vendorServerIdForPlugin'] = '900042'
    box.answers['desktopMcp:authenticateServer'] = {
      status: 'started',
      authorizationUrl: 'https://linear.app/oauth',
    }
    const entry = model.catalog[0]!
    model.requestAdd(entry, 'theo')
    expect(connector.asked).toEqual(['Linear'])
    // Nothing is added before the consent.
    expect(box.all('desktopMcp:installEntry')).toEqual([])
    let spinning = false
    box.before = (key) => {
      if (key === 'desktopMcp:authenticateServer')
        spinning = model.adding === 'linear'
      // The person signs in on the page: the computer says connected once polled.
      if (key === 'desktopMcp:listServers' && connector.opened.length > 0)
        box.answers['desktopMcp:listServers'] = needsAuth('connected')
    }
    await connector.confirm()
    expect(spinning).toBe(true)
    expect(box.sentTo('desktopMcp:authenticateServer')).toEqual({
      action: 'authenticateServer',
      args: ['900042', 'default'],
    })
    expect(connector.opened).toEqual([
      { url: 'https://linear.app/oauth', name: 'Linear' },
    ])
    expect(model.notice).toEqual({ isError: false, text: 'Connected Linear' })
    expect(model.adding).toBeUndefined()
    expect(model.isBusy).toBe(false)
    expect(model.serverState(entry)?.status).toBe('connected')
  })

  it('takes back an app whose sign-in was cancelled or never opened, and says why', async () => {
    const { model, connector, box } = await opened()
    box.answers['desktopMcp:installEntry'] = needsAuth()
    box.answers['desktopMcp:vendorServerIdForPlugin'] = '900042'
    box.answers['desktopMcp:authenticateServer'] = {
      status: 'started',
      authorizationUrl: 'https://linear.app/oauth',
    }
    box.answers['desktopMcp:uninstallPlugin'] = {
      removed: true,
      state: { servers: [] },
    }
    box.before = (key) => {
      if (
        key === 'desktopMcp:listServers' &&
        box.all('desktopMcp:installEntry').length > 0
      )
        box.answers['desktopMcp:listServers'] = needsAuth()
    }
    connector.end = 'cancelled'
    const entry = model.catalog[0]!
    model.requestAdd(entry, 'theo')
    await connector.confirm()
    expect(box.all('desktopMcp:uninstallPlugin')).toEqual([
      { action: 'uninstallPlugin', args: ['linear'] },
    ])
    expect(model.notice).toEqual({
      isError: false,
      text: "Linear wasn't connected",
    })

    // Closed on the maker's page before the computer said so: kept.
    connector.end = 'unconfirmed'
    box.answers['desktopMcp:installEntry'] = needsAuth()
    model.requestAdd(entry, 'theo')
    await connector.confirm()
    expect(box.all('desktopMcp:uninstallPlugin').length).toBe(1)
    expect(model.notice?.text).toBe("Finishing Linear's sign-in…")

    // A sign-in that doesn't open: what this connect added goes at once, and the line says why.
    box.before = undefined
    box.answers['desktopMcp:listServers'] = { servers: [] }
    await model.refreshServers()
    box.answers['desktopMcp:installEntry'] = needsAuth()
    box.answers['desktopMcp:authenticateServer'] = {
      status: 'not-supported',
      message: 'Linear is coming soon in Simeon.',
    }
    model.requestAdd(entry, 'theo')
    await connector.confirm()
    expect(box.all('desktopMcp:uninstallPlugin').length).toBe(2)
    expect(model.notice).toEqual({
      isError: true,
      text: "Linear didn't connect: Linear is coming soon in Simeon.",
    })

    // A page that is not a web page is never opened.
    box.answers['desktopMcp:authenticateServer'] = {
      status: 'started',
      authorizationUrl: 'javascript:alert(1)',
    }
    const before = connector.opened.length
    model.requestAdd(entry, 'theo')
    await connector.confirm()
    expect(connector.opened.length).toBe(before)
    expect(model.notice?.isError).toBe(true)
  })

  it('asks for a plugin’s values on its setup page, then adds it with them', async () => {
    const box = computer()
    box.answers['desktopMcp:getCatalog'] = {
      plugins: [
        {
          ...linear,
          id: 'acme',
          displayName: 'Acme',
          fields: [{ key: 'token', label: 'API token', isRequired: true }],
        },
      ],
    }
    const { model, connector } = await opened(box)
    const entry = model.catalog[0]!
    model.requestAdd(entry, 'theo')
    await connector.confirm()
    expect(model.path).toEqual([{ kind: 'setup', id: 'acme' }])
    expect(model.setup).toEqual({ entryId: 'acme', editing: false })
    expect(box.all('desktopMcp:installEntry')).toEqual([])

    box.answers['desktopMcp:installEntry'] = {
      servers: [
        { id: 'acme', name: 'Acme', pluginId: 'acme', status: 'connected' },
      ],
    }
    await model.submitSetup({ token: 'abc' }, 'theo')
    expect(box.sentTo('desktopMcp:installEntry')).toEqual({
      action: 'installEntry',
      args: [{ entryId: 'acme', values: { token: 'abc' } }],
    })
    expect(model.path).toEqual([])
    expect(model.setup).toBeUndefined()
    expect(model.notice?.text).toBe('Connected Acme')

    // Edit Values: replaced, never shown.
    model.editValues(entry)
    expect(model.setup).toEqual({ entryId: 'acme', editing: true })
    await model.submitSetup({ token: 'new' }, 'theo')
    expect(box.sentTo('desktopMcp:updatePluginInstall')).toEqual({
      action: 'updatePluginInstall',
      args: [{ pluginId: 'acme', values: { token: 'new' } }],
    })
    expect(model.notice?.text).toBe("Saved Acme's setup values")
  })

  it('adds a plugin of skills alone for the open agent, with no consent', async () => {
    const box = computer()
    box.answers['desktopMcp:getCatalog'] = {
      plugins: [{ ...linear, id: 'docs', displayName: 'Docs', connectors: [] }],
    }
    const { model, connector } = await opened(box)
    const entry = model.catalog[0]!
    await model.add(entry, undefined)
    expect(model.notice).toEqual({
      isError: true,
      text: 'Open an agent to add skills',
    })
    box.answers.syncPluginSkills = [{ pluginId: 'docs' }, { pluginId: 'docs' }]
    model.requestAdd(entry, 'theo')
    await vi.waitFor(() =>
      expect(model.notice?.text).toBe('Added 2 skills from Docs'),
    )
    expect(connector.asked).toEqual([])
  })

  it('removes and uninstalls, and says what happened', async () => {
    const box = computer()
    box.answers['desktopMcp:listServers'] = {
      servers: [
        { id: 'own', name: 'My server', status: 'connected' },
        {
          id: '900042',
          name: 'Linear',
          pluginId: 'linear',
          status: 'connected',
        },
      ],
    }
    box.answers['desktopMcp:listEffectivePlugins'] = [
      { pluginId: 'linear', isEnabled: true, installMode: 'user' },
    ]
    const { model } = await opened(box)
    model.setTab('yours')
    model.push({ kind: 'installed', id: 'own' })
    box.answers['desktopMcp:removeServer'] = {
      removed: true,
      state: {
        servers: [
          {
            id: '900042',
            name: 'Linear',
            pluginId: 'linear',
            status: 'connected',
          },
        ],
      },
    }
    await model.remove('own', 'theo')
    expect(model.notice).toEqual({ isError: false, text: 'Removed My server' })
    // A server no entry claims has no page left.
    expect(model.path).toEqual([])

    box.answers['desktopMcp:uninstallPlugin'] = {
      removed: false,
      reason: 'team-server',
    }
    await model.uninstall('linear', 'theo')
    expect(model.notice?.text).toBe(
      "Linear is provided by your team and can't be removed here",
    )
    // The team keeps it: its skills are synced again.
    expect(box.all('syncPluginSkills').length).toBeGreaterThanOrEqual(2)

    box.failing.add('desktopMcp:uninstallPlugin')
    await model.uninstall('linear', 'theo')
    expect(model.notice?.isError).toBe(true)
    expect(model.isBusy).toBe(false)
  })

  it('signs an account in: Connect asks first, Reopen goes straight back, Retry after ten minutes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const box = computer()
    box.answers['desktopMcp:listServers'] = needsAuth()
    const { store, model, connector } = await opened(box)
    box.answers['desktopMcp:authenticateServer'] = {
      status: 'started',
      authorizationUrl: 'https://linear.app/oauth',
    }
    connector.end = 'unconfirmed'
    const server = pluginServerFrom({
      id: '900042',
      name: 'Linear',
      pluginId: 'linear',
      status: 'needsAuth',
    })!
    expect(model.signInState(server, 'default')).toBe('none')
    model.requestSignIn(server, 'default')
    expect(connector.asked).toEqual(['Linear'])
    await connector.confirm()
    expect(model.signInState(server, 'default')).toBe('waiting')
    expect(store.signInFlows.get('900042')?.url).toBe(
      'https://linear.app/oauth',
    )
    await vi.waitFor(() => expect(connector.opened.length).toBe(1))

    // Reopen: no consent, the same page again, 0.9 s after the last at the soonest.
    model.requestSignIn(server, 'default')
    expect(connector.asked.length).toBe(1)
    await vi.advanceTimersByTimeAsync(400)
    expect(connector.opened.length).toBe(1)
    await vi.advanceTimersByTimeAsync(600)
    await vi.waitFor(() => expect(connector.opened.length).toBe(2))
    expect(box.all('desktopMcp:authenticateServer').length).toBe(1)

    // Ten minutes: Retry, which asks again.
    await vi.advanceTimersByTimeAsync(600_000)
    expect(model.signInState(server, 'default')).toBe('timedOut')
    model.requestSignIn(server, 'default')
    expect(connector.asked.length).toBe(2)

    // Connected: the sign-in is over.
    box.answers['desktopMcp:listServers'] = needsAuth('connected')
    await model.refreshServers()
    expect(store.signInFlows.size).toBe(0)
    expect(model.signInState(server, 'default')).toBe('none')

    // A page that is not a web address: nothing opens, and it says so (not "Opened the OAuth flow…").
    box.answers['desktopMcp:listServers'] = needsAuth()
    await model.refreshServers()
    box.answers['desktopMcp:authenticateServer'] = {
      status: 'started',
      authorizationUrl: 'javascript:alert(1)',
    }
    const pagesBefore = connector.opened.length
    model.requestSignIn(server, 'default')
    await connector.confirm()
    expect(connector.opened.length).toBe(pagesBefore)
    expect(model.signInState(server, 'default')).toBe('none')
    expect(model.notice).toEqual({
      isError: true,
      text: "Linear didn't connect. Try again.",
    })
  })

  it('keeps only the shown agent’s skills, however the answers cross', async () => {
    const box = computer()
    box.answers.getAgentWorkflows = [
      {
        id: 'w1',
        name: 'Brief',
        description: 'x',
        body: 'y',
        source: 'workflow',
      },
    ]
    const store = new AppStore()
    await store.attach(box)
    const model = new PluginsModel(store)
    // Connectors opens before the roster: no agent yet.
    model.setAgent(undefined)
    let releaseLoad = () => {}
    let releaseSkills = () => {}
    const loadHeld = new Promise<void>((resolve) => (releaseLoad = resolve))
    const skillsHeld = new Promise<void>((resolve) => (releaseSkills = resolve))
    box.before = async (key, args) => {
      if (key === 'desktopMcp:listServers') await loadHeld
      if (key === 'getAgentWorkflows' && (args as { id: string }).id === 'theo')
        await skillsHeld
    }
    const loading = model.load(undefined)
    // The roster arrives: the window shows Theo, whose skills are read.
    model.setAgent('theo')
    const reading = model.loadSkills('theo')
    // The opening's read for no agent comes first; Theo's answer after it.
    releaseLoad()
    await loading
    releaseSkills()
    await reading
    expect(model.skills.map((one) => one.id)).toEqual(['w1'])

    // An Add's skills step for the agent open when it began, after another was opened: not kept.
    box.before = undefined
    box.answers.getAgentWorkflows = []
    model.setAgent('sam')
    await model.loadSkills('theo')
    expect(model.skills.map((one) => one.id)).toEqual(['w1'])
    await model.loadSkills('sam')
    expect(model.skills).toEqual([])
  })

  it('switches a tool at once, and puts it back when the computer refuses', async () => {
    const { store, model, box } = await opened()
    box.answers['desktopMcp:listServerTools'] = [
      { name: 'search' },
      { name: 'read' },
    ]
    await model.loadTools('s1')
    const tool = model.tools.get('s1')![0]!
    let between: boolean | undefined
    box.before = (key) => {
      if (key === 'desktopMcp:toggleMcpToolDisabled')
        between = store.pluginTools.get('s1')![0]!.isDisabled
    }
    box.answers['desktopMcp:toggleMcpToolDisabled'] = [
      { name: 'search', isDisabled: true },
      { name: 'read' },
    ]
    await model.toggle(tool, 's1')
    expect(between).toBe(true)
    expect(model.tools.get('s1')!.map((one) => one.isDisabled)).toEqual([
      true,
      false,
    ])

    box.failing.add('desktopMcp:toggleMcpToolDisabled')
    await model.toggle(model.tools.get('s1')![1]!, 's1')
    expect(model.toolFailures.get('s1')).toBe(
      'desktopMcp:toggleMcpToolDisabled failed',
    )
    // Read again: as the computer has them.
    expect(model.tools.get('s1')!.map((one) => one.isDisabled)).toEqual([
      false,
      false,
    ])
  })

  it('switches, saves and deletes the agent’s skills', async () => {
    const box = computer()
    box.answers.getAgentWorkflows = [
      {
        id: 'w1',
        name: 'Brief',
        description: 'Use when',
        body: 'Do it',
        source: 'workflow',
      },
    ]
    const { model } = await opened(box)
    const skill = model.skills[0]!
    box.answers.setAgentWorkflowEnabled = [
      {
        ...(box.answers.getAgentWorkflows as object[])[0],
        isEnabledForAgent: false,
      },
    ]
    await model.setEnabled(skill, 'theo')
    expect(model.skills[0]?.isEnabledForAgent).toBe(false)

    box.answers.updateAgentWorkflow = [
      { id: 'w1', name: 'Morning brief', source: 'workflow' },
    ]
    expect(
      await model.save(skill, ' Morning brief ', 'Use when', 'Do it', 'theo'),
    ).toBe(true)
    expect(model.notice?.text).toBe('Saved Morning brief')
    expect(model.skills[0]?.name).toBe('Morning brief')

    model.setTab('yours')
    model.push({ kind: 'skill', id: 'w1' })
    box.answers.deleteAgentWorkflow = []
    await model.delete(skill, 'theo')
    expect(model.notice?.text).toBe('Deleted Brief')
    expect(model.path).toEqual([])
    expect(model.skills).toEqual([])
  })

  it('opens the Plugin Setup agent there is, else makes one', async () => {
    const box = computer()
    box.answers.createAgent = { agent: { id: 'setup-1' } }
    const { store, model } = await opened(box)
    expect(await model.fixWithAgent()).toBe('setup-1')
    expect(box.all('createAgent').length).toBe(1)
    expect(store.pluginSetupAgent?.id).toBe('setup-1')
    // There now: opened, not made again.
    expect(await model.fixWithAgent()).toBe('setup-1')
    expect(box.all('createAgent').length).toBe(1)
    expect(model.launchingFix).toBe(false)
  })

  it('keeps a logo the computer read only when it is a picture, and reads each address once', async () => {
    const { model, box } = await opened()
    box.answers['desktopMcp:resolvePluginLogo'] = {
      src: 'data:image/x-icon;base64,AA==',
    }
    await model.loadLogo('https://acme.example/favicon.ico')
    await model.loadLogo('https://acme.example/favicon.ico')
    expect(model.logos.get('https://acme.example/favicon.ico')).toBe(
      'data:image/x-icon;base64,AA==',
    )
    expect(box.all('desktopMcp:resolvePluginLogo').length).toBe(1)
    box.answers['desktopMcp:resolvePluginLogo'] =
      'data:text/html,<script>alert(1)</script>'
    await model.loadLogo('https://acme.example/page')
    expect(model.logos.has('https://acme.example/page')).toBe(false)
  })

  it('says each notice for 3.5 s, a failure for 6 s', async () => {
    vi.useFakeTimers()
    const store = new AppStore()
    const model = new PluginsModel(store)
    model.show({ isError: false, text: 'Removed Gmail' })
    await vi.advanceTimersByTimeAsync(3400)
    expect(model.notice?.text).toBe('Removed Gmail')
    await vi.advanceTimersByTimeAsync(200)
    expect(model.notice).toBeUndefined()
    model.show({ isError: true, text: 'No' })
    await vi.advanceTimersByTimeAsync(5900)
    expect(model.notice?.text).toBe('No')
    await vi.advanceTimersByTimeAsync(200)
    expect(model.notice).toBeUndefined()
  })

  it('follows each opening’s ask, and forgets the view on a fresh one', () => {
    const model = new PluginsModel(new AppStore())
    model.setQuery('lin')
    model.setCategory('category:Productivity')
    model.follow({ kind: 'plugin', id: 'gmail' }, false)
    expect(model.query).toBe('lin')
    expect(model.path).toEqual([{ kind: 'plugin', id: 'gmail' }])
    model.follow({ kind: 'marketplace' }, true)
    expect(model.query).toBe('')
    expect(model.category).toBeUndefined()
    expect(model.path).toEqual([])
    model.follow({ kind: 'server', id: 's1' }, false)
    expect(model.tab).toBe('yours')
    expect(model.path).toEqual([{ kind: 'installed', id: 's1' }])
    model.follow({ kind: 'query', text: 'gmail' }, false)
    expect(model.tab).toBe('marketplace')
    expect(model.query).toBe('gmail')
    expect(model.path).toEqual([])
    model.follow({ kind: 'skill', id: 'w1' }, false)
    expect(model.tab).toBe('yours')
    expect(model.path).toEqual([{ kind: 'skill', id: 'w1' }])
    // ⌘F only on the list.
    const asked = model.searchFocus
    model.focusSearch()
    expect(model.searchFocus).toBe(asked)
    model.back()
    model.focusSearch()
    expect(model.searchFocus).toBe(asked + 1)
    // An entry the list doesn't read yet still finds its page's key.
    expect(pluginEntryFrom({ id: 'x' })?.displayName).toBe('x')
  })
})
