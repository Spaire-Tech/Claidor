// Connectors' calls (SimeonCore's `PluginCallsTests`), as the Mac's window
// makes them: what each sends the computer, and how its answer is read.
// Connect's add, sign-in and take-back, and the start link that names the
// app (`Connecting`), are step 6b's.

import { describe, expect, it } from 'vitest'
import { unavailable } from './plainWords'
import {
  PluginCalls,
  privateCopies,
  removalFrom,
  resyncsSkills,
  serversIn,
  setupAgentIn,
  skillSpec,
  toolsCounted,
} from './pluginCalls'
import {
  agentSkillFrom,
  pluginEntryFrom,
  removedNotice,
  setupAgentDescription,
  setupAgentRequest,
} from './plugins'
import { agentFailedNotice, toolsValue } from './pluginsOverlay'
import { PluginsBox } from './pluginsTesting'
import { AppStore } from './store'

describe('Connectors’ calls', () => {
  it('take the answers as the Mac does', async () => {
    const box = new PluginsBox()
    const calls = new PluginCalls(box)
    box.answers['desktopMcp:getCatalog'] = {
      plugins: [{ id: 'linear', displayName: 'Linear' }, { name: 'no id' }],
    }
    expect((await calls.catalog()).map((one) => one.id)).toEqual(['linear'])
    expect(box.sentTo('desktopMcp:getCatalog')).toEqual({
      action: 'getCatalog',
      args: [{ language: 'en' }],
    })
    box.answers['desktopMcp:getCatalog'] = [
      { id: 'gmail' },
      { pluginId: 'notion' },
    ]
    expect((await calls.catalog()).map((one) => one.id)).toEqual([
      'gmail',
      'notion',
    ])

    box.answers['desktopMcp:listEffectivePlugins'] = [
      { pluginId: 'linear', isEnabled: true, installMode: 'team-default' },
    ]
    expect((await calls.effectivePlugins())[0]?.installMode).toBe(
      'team-default',
    )

    // An answer with no list leaves the servers as they were.
    box.answers['desktopMcp:listServers'] = { nothing: true }
    expect(await calls.servers()).toBeUndefined()
    box.answers['desktopMcp:listServers'] = {
      servers: [{ id: 's1', name: 'Linear', transport: 'http' }],
    }
    expect((await calls.servers())?.map((one) => one.id)).toEqual(['s1'])
    expect(serversIn([{ id: 's2' }])?.map((one) => one.id)).toEqual(['s2'])
    expect(serversIn(undefined)).toBeUndefined()

    box.answers['desktopMcp:listServerTools'] = [
      { name: 'search' },
      { name: 'read', isDisabled: true },
    ]
    const tools = await calls.tools('s1')
    expect(tools.map((one) => one.isDisabled)).toEqual([false, true])
    expect(box.sentTo('desktopMcp:listServerTools')).toEqual({
      action: 'listServerTools',
      args: ['s1'],
    })

    box.answers.getAgentWorkflows = [
      { id: 'w1', name: 'Brief', source: 'workflow' },
    ]
    expect((await calls.skills('theo')).map((one) => one.id)).toEqual(['w1'])
    expect(box.sentTo('getAgentWorkflows')).toEqual({ id: 'theo' })

    box.answers.getPluginSyncStatus = {
      authBlocked: [{ pluginName: 'Acme' }, {}],
    }
    expect(await calls.authBlocked()).toEqual(['Acme', ''])

    // Details' Tools from the phone's own tool rows reads as the Mac's from its own.
    expect(toolsCounted(1, 2, 9)).toBe(toolsValue(tools, 9))
    expect(toolsCounted(0, 0, 9)).toBe(toolsValue(undefined, 9))

    box.answers['desktopMcp:resolvePluginLogo'] = {
      src: 'data:image/png;base64,AA==',
    }
    expect(await calls.logo('https://acme.dev/logo.png')).toBe(
      'data:image/png;base64,AA==',
    )
  })

  it('send Add’s values and say when the team set them', async () => {
    const box = new PluginsBox()
    const calls = new PluginCalls(box)
    box.answers['desktopMcp:installEntry'] = {
      servers: [{ id: 'acme', pluginId: 'acme' }],
    }
    const servers = await calls.install('acme', { token: 'abc' }, false)
    expect(servers?.map((one) => one.id)).toEqual(['acme'])
    expect(box.sentTo('desktopMcp:installEntry')).toEqual({
      action: 'installEntry',
      args: [{ entryId: 'acme', values: { token: 'abc' } }],
    })
    await calls.install('acme', {}, true)
    expect(box.sentTo('desktopMcp:installEntry')).toEqual({
      action: 'installEntry',
      args: [{ entryId: 'acme', values: {}, hasTeamConfiguredVariables: true }],
    })

    box.answers['desktopMcp:vendorServerIdForPlugin'] = 'acme-vendor'
    expect(await calls.vendorServerId('acme')).toBe('acme-vendor')
    // A failure is no maker's server.
    box.failing.add('desktopMcp:vendorServerIdForPlugin')
    expect(await calls.vendorServerId('acme')).toBeUndefined()

    box.answers['desktopMcp:authenticateServer'] = {
      status: 'started',
      authorizationUrl: 'https://acme.dev/oauth',
    }
    const started = await calls.signIn('acme-vendor', 'default')
    expect(started).toEqual({
      status: 'started',
      authorizationUrl: 'https://acme.dev/oauth',
    })
    expect(box.sentTo('desktopMcp:authenticateServer')).toEqual({
      action: 'authenticateServer',
      args: ['acme-vendor', 'default'],
    })

    await calls.updateInstall('acme', { token: 'new' })
    expect(box.sentTo('desktopMcp:updatePluginInstall')).toEqual({
      action: 'updatePluginInstall',
      args: [{ pluginId: 'acme', values: { token: 'new' } }],
    })
  })

  it('say what Uninstall and Remove did', async () => {
    const box = new PluginsBox()
    const calls = new PluginCalls(box)
    box.answers['desktopMcp:uninstallPlugin'] = {
      removed: true,
      state: { servers: [] },
    }
    const gone = await calls.uninstallPlugin('linear')
    expect(gone.removed).toBe(true)
    expect(gone.servers).toEqual([])
    expect(resyncsSkills(gone)).toBe(true)
    expect(box.sentTo('desktopMcp:uninstallPlugin')).toEqual({
      action: 'uninstallPlugin',
      args: ['linear'],
    })

    box.answers['desktopMcp:removeServer'] = {
      removed: false,
      reason: 'team-server',
    }
    const kept = await calls.removeServer('s1')
    expect(kept.removed).toBe(false)
    // No state: the servers as they were.
    expect(kept.servers).toBeUndefined()
    // The team keeps it: its skills are synced again.
    expect(resyncsSkills(kept)).toBe(true)
    expect(removedNotice('Linear', kept.removed, kept.reason).text).toBe(
      "Linear is provided by your team and can't be removed here",
    )

    box.answers['desktopMcp:removeServer'] = { removed: false }
    expect(resyncsSkills(await calls.removeServer('s1'))).toBe(false)
    expect(removalFrom(null)).toEqual({
      removed: false,
      reason: undefined,
      servers: undefined,
    })
  })

  it('sync the skills in place of the agent’s private copies', async () => {
    const box = new PluginsBox()
    const calls = new PluginCalls(box)
    box.answers.syncPluginSkills = [
      { pluginId: 'acme' },
      { pluginId: 'acme' },
      { pluginId: 'other' },
    ]
    expect(await calls.syncSkills('acme')).toBe(2)
    expect(await calls.syncSkills()).toBe(0)

    const entry = pluginEntryFrom({
      id: 'acme',
      skills: [
        { name: 'Brief', sourceUrl: 'git://acme/brief' },
        { name: 'Plain' },
      ],
    })!
    const skills = [
      agentSkillFrom({
        id: 'copy',
        name: 'Brief',
        sourceRef: 'git://acme/brief',
      })!,
      agentSkillFrom({ id: 'own', name: 'Mine' })!,
      agentSkillFrom({
        id: 'elsewhere',
        name: 'Other',
        sourceRef: 'git://other/x',
      })!,
    ]
    expect(privateCopies(entry, skills).map((one) => one.id)).toEqual(['copy'])
    expect(privateCopies(pluginEntryFrom({ id: 'bare' })!, skills)).toEqual([])

    // No agent, nothing dropped.
    await calls.dropPrivateCopies(entry, skills, undefined)
    expect(box.sentTo('deleteAgentWorkflow')).toBeUndefined()
    // A failure is let go.
    box.failing.add('deleteAgentWorkflow')
    await calls.dropPrivateCopies(entry, skills, 'theo')
    expect(box.all('deleteAgentWorkflow')).toEqual([
      { id: 'theo', workflowId: 'copy' },
    ])
  })

  it('switch, save and delete a skill', async () => {
    const box = new PluginsBox()
    const calls = new PluginCalls(box)
    const skill = agentSkillFrom({
      id: 'w1',
      name: 'Brief',
      description: 'Use when',
      body: 'Do it',
      trigger: { type: 'manual' },
      sourceRef: 'git://acme/brief',
    })!

    box.answers.setAgentWorkflowEnabled = [
      { id: 'w1', isEnabledForAgent: false },
    ]
    const switched = await calls.setSkillEnabled(skill, false, 'theo')
    expect(switched.map((one) => one.isEnabledForAgent)).toEqual([false])
    expect(box.sentTo('setAgentWorkflowEnabled')).toEqual({
      id: 'theo',
      workflowId: 'w1',
      isEnabled: false,
    })
    // An answer that is no list empties them, as the overlay's does.
    box.answers.setAgentWorkflowEnabled = { ok: true }
    expect(await calls.setSkillEnabled(skill, true, 'theo')).toEqual([])

    expect(
      skillSpec(skill, '  Morning brief ', ' When asked \n', ' Steps \n'),
    ).toEqual({
      name: 'Morning brief',
      description: 'When asked',
      body: ' Steps \n',
      trigger: { type: 'manual' },
      sourceRef: 'git://acme/brief',
    })
    const plain = agentSkillFrom({ id: 'w2', name: 'Plain' })!
    expect(skillSpec(plain, 'Plain', 'D', 'B')).toEqual({
      name: 'Plain',
      description: 'D',
      body: 'B',
    })

    box.answers.updateAgentWorkflow = [{ id: 'w1', name: 'Morning brief' }]
    const saved = await calls.updateSkill(
      skill,
      'Morning brief',
      'Use when',
      'Do it',
      'theo',
    )
    expect(saved?.map((one) => one.name)).toEqual(['Morning brief'])
    const update = box.sentTo('updateAgentWorkflow') as {
      workflowId: string
      spec: { name: string }
    }
    expect(update.workflowId).toBe('w1')
    expect(update.spec.name).toBe('Morning brief')
    // No list: the skills stay as they were.
    box.answers.updateAgentWorkflow = { ok: true }
    expect(
      await calls.updateSkill(skill, 'x', 'y', 'z', 'theo'),
    ).toBeUndefined()

    box.answers.deleteAgentWorkflow = []
    expect(await calls.deleteSkill('w1', 'theo')).toEqual([])
    expect(box.sentTo('deleteAgentWorkflow')).toEqual({
      id: 'theo',
      workflowId: 'w1',
    })
  })

  it('make the Plugin Setup agent for Fix with agent and tell it', async () => {
    const box = new PluginsBox()
    box.answers.createAgent = { agent: { id: 'setup-1' } }
    const store = new AppStore()
    await store.attach(box)
    const made = await store.makePluginSetupAgent()
    expect(made).toEqual({ id: 'setup-1' })
    expect(box.sentTo('createAgent')).toEqual({
      name: 'Plugin Setup',
      description: setupAgentDescription,
      purpose: 'plugin-auth',
      isIntroductionSuppressed: true,
    })
    expect(box.sent.map((one) => one.agentId)).toEqual(['setup-1'])
    expect(box.sent[0]?.text).toBe(setupAgentRequest)
    // The roster was read again, and has it.
    expect(setupAgentIn(store.agents)?.id).toBe('setup-1')
    expect(store.pluginSetupAgent?.id).toBe('setup-1')

    // The message could not be sent: the agent opens all the same, and why is said.
    box.failSends = true
    expect(await store.makePluginSetupAgent()).toEqual({
      id: 'setup-1',
      failure: 'offline',
    })

    box.answers.createAgent = { ok: true }
    const none = await store.makePluginSetupAgent()
    expect(none.id).toBeUndefined()
    // The gateway's own words never show (PlainWords, 13 October 2026).
    expect(none.failure).toBe(unavailable())
    expect(agentFailedNotice(none.failure ?? '').text).toBe(
      `Couldn't start the agent: ${unavailable()}`,
    )

    const signedOut = new AppStore()
    expect((await signedOut.makePluginSetupAgent()).failure).toBe(
      'Sign in to Simeon first.',
    )
  })

  it('say Coming soon for the apps that can’t be added yet', async () => {
    // Before Simeon Labs' server answers: the apps that need its own sign-in with the company.
    const store = new AppStore()
    expect(store.isComingSoon('Xero')).toBe(true)
    expect(store.isComingSoon('docusign')).toBe(true)
    expect(store.isComingSoon('Gmail')).toBe(false)

    const box = new PluginsBox()
    box.answers['desktopMcp:getCatalog'] = {
      plugins: [
        { id: 'xero', displayName: 'Xero' },
        { id: 'acme', displayName: 'Acme', comingSoon: true },
        { id: 'gmail', displayName: 'Gmail' },
      ],
    }
    box.serverAnswers.apps = { available: true, comingSoon: ['gusto', 'Brex'] }
    await store.attach(box)
    await store.loadAppCards()
    expect(store.appsComingSoon).toEqual(new Set(['gusto', 'brex']))
    // Its own sign-in is set up on the server: Add is back.
    expect(store.isComingSoon('Xero')).toBe(false)
    expect(store.isComingSoon('Gusto')).toBe(true)
    // The catalogue's own word holds.
    expect(store.isComingSoon('Acme')).toBe(true)
    expect(store.isComingSoon('Gmail')).toBe(false)
    // Connectors' entries come from the same answer.
    expect(store.catalogEntries.map((one) => one.id)).toEqual([
      'xero',
      'acme',
      'gmail',
    ])

    // An older server names none: the list stays as it is.
    box.serverAnswers.apps = { available: true }
    await store.loadAppsComingSoon()
    expect(store.appsComingSoon).toEqual(new Set(['gusto', 'brex']))
  })
})
