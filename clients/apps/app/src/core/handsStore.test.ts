// Step 7f's store in the Windows app, against the app's stand-in
// (desktop/testing.ts) and a stand-in computer: MacServices.swift's `track`
// for the hands (signed in, connected, signed out), MacLocalPermission.swift
// (the ceiling read, the computer told only when it changes things, the
// computer's word taken over the default), GeneralSettingsModel's
// `setPermission`, the Allow card's answer (Allow once written before the
// computer hears it), a message sent letting go of the answers, and
// `LocalHandsProvider.run`'s loop (the gateway's address handed over,
// asked again after three failures, nothing on the web).

import { afterEach, describe, expect, it } from 'vitest'
import type {
  HandsPermission,
  HandsPermissionValue,
  HandsStreamEnd,
  HandsTarget,
} from '../desktop/contract'
import { FakeDesktop } from '../desktop/testing'
import { LiveBackend } from './backend'
import { Entry } from './entry'
import type { JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import {
  FakeBackend,
  Routes,
  answer,
  box,
  ensure,
  eventually,
  makeGateway,
  ms,
} from './testing'

/** The main process's copy of the setting, as windows/src/main/hands/permission.ts keeps it. */
function keptSetting(start: Partial<HandsPermission> = {}) {
  const state = {
    account: undefined as string | undefined,
    choice: (start.choice ?? 'ask') as HandsPermissionValue,
    ceiling: (start.ceiling ?? null) as HandsPermissionValue | null,
  }
  const rank = { never: 0, ask: 1, always: 2 }
  const now = (): HandsPermission => ({
    choice: state.choice,
    ceiling: state.ceiling,
    effective:
      state.ceiling && rank[state.choice] > rank[state.ceiling]
        ? state.ceiling
        : state.choice,
  })
  return { state, now }
}

function desktopWith(setting = keptSetting()) {
  const host = new FakeDesktop()
  const streams: HandsTarget[] = []
  let streamAnswer: () => Promise<HandsStreamEnd> = () => new Promise(() => {})
  host
    .answer('handsPermission', (account) => {
      if (account && account !== setting.state.account) {
        if (setting.state.account) {
          setting.state.choice = 'ask'
          setting.state.ceiling = null
        }
        setting.state.account = account
      }
      return setting.now()
    })
    .answer('handsChoose', (choice) => {
      setting.state.choice = choice
      return setting.now()
    })
    .answer('handsCeiling', (ceiling) => {
      setting.state.ceiling = ceiling
      return setting.now()
    })
    .answer('handsSignedOut', () => {
      setting.state = { account: undefined, choice: 'ask', ceiling: null }
    })
    .answer('handsStop', () => {})
    .answer('handsEnd', () => {})
    .answer('handsAllowOnce', () => {})
    .answer('handsForgetOnce', () => {})
    .answer('handsStream', (target) => {
      streams.push(target)
      return streamAnswer() as unknown as HandsStreamEnd
    })
  return {
    host,
    setting,
    streams,
    answerStreams(next: () => Promise<HandsStreamEnd>) {
      streamAnswer = next
    },
  }
}

/** A computer that keeps its settings, as the host does. */
class SettingsBackend extends FakeBackend {
  settings: Record<string, JSONValue> = {}
  constructor() {
    super()
    this.commandAnswers.getHostSettings = () => ({ ...this.settings })
    this.commandAnswers.setHostSettings = (args) => {
      Object.assign(this.settings, args as Record<string, JSONValue>)
      return {}
    }
  }
}

const calls = (host: FakeDesktop, name: string) =>
  host.calls.filter((call) => call.name === name)

let restore: (() => void) | undefined
afterEach(() => {
  restore?.()
  restore = undefined
})

async function signedIn(
  options: {
    setting?: ReturnType<typeof keptSetting>
    team?: JSONValue
    box?: SettingsBackend
  } = {},
) {
  const fake = desktopWith(options.setting)
  restore = fake.host.install()
  const backend = options.box ?? new SettingsBackend()
  backend.agents = [makeAgent({ id: 'a1', name: 'Theo' })]
  if (options.team !== undefined)
    backend.dashboardAnswers.GetTeamAdminSettingsOrEmptyIfNotInTeam =
      options.team
  const store = new AppStore()
  store.account = { name: 'Sam', email: 'Sam@Example.com' }
  await store.attach(backend)
  await eventually(() => store.localCeilingKnown)
  return { ...fake, store, backend }
}

describe('the hands on the web', () => {
  it('are nothing: no ask shown, no call made', async () => {
    const store = new AppStore()
    const backend = new FakeBackend()
    store.account = { name: 'Sam', email: 'sam@example.com' }
    await store.attach(backend)
    store.transcripts.a1 = [pendingAsk('e1')]
    expect(store.localAsk('a1')).toBeUndefined()
    expect(await store.forgetCommandsAllowedOnce()).toBe(false)
  })
})

function pendingAsk(id: string, status = 'pending'): Entry {
  return Entry.from({
    id,
    kind: 'send-message',
    timestampMs: 1,
    message: {
      type: 'local-tool-permission',
      ask: {
        requestId: `q-${id}`,
        action: 'run-command',
        target: 'ls',
        status,
      },
    },
  }) as Entry
}

describe('signed in (MacLocalPermission.signedIn)', () => {
  it('keeps the setting for this account, reads the team’s ceiling, and tells the computer only of a change', async () => {
    const { host, store, backend } = await signedIn({
      setting: keptSetting({ choice: 'always' }),
      team: { localToolControls: { permissionCeiling: 2 } },
    })
    expect(calls(host, 'handsPermission')[0]?.args).toEqual(['sam@example.com'])
    expect(calls(host, 'handsCeiling').at(-1)?.args).toEqual(['ask'])
    expect(store.localCeiling).toBe('ask')
    expect(store.localPermission).toBe('ask')
    await eventually(() => backend.settings.localToolPermission === 'ask')
    expect(backend.settings.localToolPermission).toBe('ask')
  })

  it('keeps the ceiling this PC last had when the team does not answer, and tells nothing when nothing changed', async () => {
    const { host, store, backend } = await signedIn({
      setting: keptSetting({ choice: 'always', ceiling: 'never' }),
    })
    // Not lifted by a read that failed (the Mac's lifts it: proposed for the Mac).
    expect(calls(host, 'handsCeiling')).toEqual([])
    expect(store.localCeiling).toBe('never')
    expect(store.localPermission).toBe('never')
    expect(store.localCeilingKnown).toBe(true)
    await ms(20)
    expect(
      backend.commands.filter(
        (command) =>
          command.method === 'setHostSettings' &&
          'localToolPermission' in (command.args as object),
      ),
    ).toEqual([])
  })

  it('lifts the ceiling only when the team answers with none', async () => {
    const { host, store } = await signedIn({
      setting: keptSetting({ ceiling: 'never' }),
      team: {},
    })
    expect(calls(host, 'handsCeiling').at(-1)?.args).toEqual([null])
    expect(store.localCeiling).toBeUndefined()
  })

  it('tells the computer what holds when the ceiling lowers what it took from it', async () => {
    const adopting = new SettingsBackend()
    adopting.settings.localToolPermission = 'always'
    const { host, store } = await signedIn({
      box: adopting,
      team: { localToolControls: { permissionCeiling: 2 } },
    })
    adopting.push({ kind: 'connection', live: true })
    await eventually(() => calls(host, 'handsChoose').length > 0)
    expect(calls(host, 'handsChoose')[0]?.args).toEqual(['always'])
    // This PC holds "Ask every time" under the team's ceiling: the computer is told, so it sends the asks this PC can answer.
    await eventually(() => adopting.settings.localToolPermission === 'ask')
    expect(adopting.settings.localToolPermission).toBe('ask')
    expect(store.localPermission).toBe('ask')
  })

  it('takes the computer’s always or never over this PC’s default once connected, else tells it this PC’s', async () => {
    const adopting = new SettingsBackend()
    adopting.settings.localToolPermission = 'never'
    const first = await signedIn({ box: adopting })
    adopting.push({ kind: 'connection', live: true })
    await eventually(() => calls(first.host, 'handsChoose').length > 0)
    expect(calls(first.host, 'handsChoose')[0]?.args).toEqual(['never'])
    await eventually(() => first.store.localPermission === 'never')
    restore?.()

    const telling = new SettingsBackend()
    telling.settings.localToolPermission = 'always'
    const second = await signedIn({
      box: telling,
      setting: keptSetting({ choice: 'never' }),
    })
    telling.push({ kind: 'connection', live: true })
    await eventually(() => telling.settings.localToolPermission === 'never')
    expect(calls(second.host, 'handsChoose')).toEqual([])
  })

  it('forgets the setting and stops the hands when signed out', async () => {
    const { host, store } = await signedIn({
      team: { localToolControls: { permissionCeiling: 1 } },
    })
    store.detach()
    await eventually(() => calls(host, 'handsSignedOut').length > 0)
    expect(store.localCeilingKnown).toBe(false)
    expect(store.localCeiling).toBeUndefined()
    expect(store.localPermission).toBe('ask')
  })
})

describe('Settings’ “Execution on Local Computer” (GeneralSettingsModel)', () => {
  it('keeps the choice on this PC, then tells the computer until it says it back', async () => {
    const { host, store, backend } = await signedIn()
    const writing = store.setLocalPermission('never')
    expect(store.localPermissionPending).toBe(true)
    await writing
    expect(calls(host, 'handsChoose').at(-1)?.args).toEqual(['never'])
    expect(backend.settings.localToolPermission).toBe('never')
    expect(store.localPermission).toBe('never')
    expect(store.localPermissionPending).toBe(false)
  })

  it('takes no choice above the team’s ceiling', async () => {
    const { host, store } = await signedIn({
      team: { localToolControls: { permissionCeiling: 2 } },
    })
    await store.setLocalPermission('always')
    expect(calls(host, 'handsChoose')).toEqual([])
  })

  it('reads this account’s setting and the ceiling again as the page opens', async () => {
    const { host, store, backend } = await signedIn()
    backend.dashboardAnswers.GetTeamAdminSettingsOrEmptyIfNotInTeam = {
      localToolControls: { permissionCeiling: 1 },
    }
    await store.loadLocalPermission()
    expect(calls(host, 'handsPermission').at(-1)?.args).toEqual([
      'sam@example.com',
    ])
    expect(store.localCeiling).toBe('never')
    expect(store.localPermission).toBe('never')
  })

  it('forgets the commands allowed once', async () => {
    const { host, store } = await signedIn()
    expect(await store.forgetCommandsAllowedOnce()).toBe(true)
    expect(calls(host, 'handsForgetOnce')).toHaveLength(1)
  })
})

describe('the Allow card (LocalAskDock)', () => {
  it('is the first waiting ask of the chat', async () => {
    const { store } = await signedIn()
    store.transcripts.a1 = [
      pendingAsk('e1', 'allowed'),
      pendingAsk('e2'),
      pendingAsk('e3'),
    ]
    expect(store.localAsk('a1')?.entryId).toBe('e2')
    store.transcripts.a1 = [pendingAsk('e2', 'allowed')]
    expect(store.localAsk('a1')).toBeUndefined()
  })

  it('writes Allow once down before the computer hears it', async () => {
    const { host, store, backend } = await signedIn()
    const order: string[] = []
    host.answer('handsAllowOnce', () => {
      order.push('handsAllowOnce')
    })
    backend.beforeAnswer = (method) => {
      if (method === 'resolveLocalToolPermission') order.push(method)
    }
    const ask = {
      entryId: 'e1',
      requestId: 'q1',
      action: 'run-command',
      target: 'ls',
      status: 'pending',
    }
    expect(await store.answerLocalAsk(ask, 'a1', 'allow-once')).toBe(true)
    expect(order).toEqual(['handsAllowOnce', 'resolveLocalToolPermission'])
    expect(calls(host, 'handsAllowOnce')[0]?.args).toEqual([
      { id: 'q1', action: 'run-command', target: 'ls' },
    ])
    expect(
      backend.commands.find(
        (command) => command.method === 'resolveLocalToolPermission',
      )?.args,
    ).toEqual({
      entryId: 'e1',
      requestId: 'q1',
      resolution: 'allow-once',
      agentId: 'a1',
    })
  })

  it('answers Always allow by the setting first, and once when the ceiling holds it', async () => {
    const { host, store, backend } = await signedIn({
      team: { localToolControls: { permissionCeiling: 2 } },
    })
    const ask = {
      entryId: 'e1',
      requestId: 'q1',
      action: 'run-command',
      target: 'ls',
      status: 'pending',
    }
    expect(await store.answerLocalAsk(ask, 'a1', 'always')).toBe(true)
    expect(calls(host, 'handsChoose')[0]?.args).toEqual(['always'])
    expect(calls(host, 'handsAllowOnce')).toHaveLength(1)
    expect(
      backend.commands.find(
        (command) => command.method === 'resolveLocalToolPermission',
      )?.args,
    ).toMatchObject({ resolution: 'allow-once' })
  })

  it('says when the answer didn’t go through', async () => {
    const { store, backend } = await signedIn()
    backend.refusedCommands.add('resolveLocalToolPermission')
    const ask = {
      entryId: 'e1',
      requestId: 'q1',
      action: 'run-command',
      target: 'ls',
      status: 'pending',
    }
    expect(await store.answerLocalAsk(ask, 'a1', 'deny')).toBe(false)
  })

  it('lets go of the answers allowed once when a message is sent', async () => {
    const { host, store } = await signedIn()
    await store.send('Hello', 'a1')
    await eventually(() => calls(host, 'handsForgetOnce').length > 0)
    expect(calls(host, 'handsForgetOnce')).toHaveLength(1)
  })
})

describe('the call’s own window (7c)', () => {
  it('leaves the hands to the main window', async () => {
    const host = new FakeDesktop({ window: 'call' })
    restore = host.install()
    const store = new AppStore()
    store.account = { name: 'Sam', email: 'sam@example.com' }
    await store.attach(new SettingsBackend())
    store.detach()
    await ms(20)
    expect(host.calls).toEqual([])
  })
})

describe('the hands’ loop (LocalHandsProvider.run)', () => {
  it('hands over the gateway’s address and keys, dials again, and asks for the address again after three failures', async () => {
    const fake = desktopWith()
    restore = fake.host.install()
    const routes = new Routes()
    routes.on(ensure, () => answer(200, box('box1')))
    const gateway = makeGateway(routes)
    const backend = new LiveBackend(gateway)
    const store = new AppStore()
    store.handsPause = () => Promise.resolve()
    let streams = 0
    fake.answerStreams(() => {
      streams += 1
      // Three failures, then a stream that holds.
      return streams <= 3
        ? Promise.resolve({ connected: false, ended: 'failed' })
        : new Promise(() => {})
    })
    store.account = { name: 'Sam', email: 'sam@example.com' }
    void store.attach(backend)
    await eventually(() => fake.streams.length >= 4)
    expect(fake.streams[0]).toEqual({
      baseURL: 'https://box1',
      headers: {
        authorization: 'Bearer g-box1',
        'x-anyrun-network-token': 'n-box1',
      },
    })
    // The address asked for again after the third failure.
    expect(routes.count(ensure)).toBeGreaterThanOrEqual(2)
    store.detach()
    await eventually(() => calls(fake.host, 'handsSignedOut').length > 0)
    expect(calls(fake.host, 'handsSignedOut')).toHaveLength(1)
  })

  it('stops when the hands are stopped, and dials no demo computer', async () => {
    const fake = desktopWith()
    restore = fake.host.install()
    fake.answerStreams(() =>
      Promise.resolve({ connected: true, ended: 'stopped' }),
    )
    const store = new AppStore()
    store.account = { name: 'Sam', email: 'sam@example.com' }
    await store.attach(new SettingsBackend())
    await ms(20)
    expect(fake.streams).toEqual([])
  })
})
