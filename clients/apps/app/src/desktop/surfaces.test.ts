// The Windows app's own surfaces from the page's side (MacServices.swift):
// the computer's word on the agents becomes Windows' notifications and the
// taskbar's number; the window's focus goes to the computer as the Mac's
// (`setWindowFocused`, the core's fixture's `windowFocusSync`); what
// connecting sets; the tray's words; the Mac's menu keys.

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import type { CallState } from '../core/call'
import { type Agent, makeAgent } from '../core/models'
import { AppStore } from '../core/store'
import { FakeBackend, ms } from '../core/testing'
import type { AgentNote, TaskbarBadge, TrayMenu } from './contract'
import { desktop } from './desktop'
import { runBeforeQuit } from './quitting'
import {
  DesktopSurfaces,
  type FollowedSession,
  keyLetter,
  zoomStep,
} from './surfaces'
import { FakeDesktop } from './testing'

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../ios/SimeonCore/Tests/SimeonMacCoreTests/Fixtures/notify.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  cases: {
    windowFocusSync: {
      output: { op: string; sent?: { isFocused: boolean }[] }[]
    }[]
  }
}

class Session implements FollowedSession {
  phase = 'signedIn'
  readonly store = new AppStore()
  private readonly listeners = new Set<() => void>()
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  set(phase: string): void {
    this.phase = phase
    for (const listener of [...this.listeners]) listener()
  }
}

const iris = (fields: Partial<Agent>) =>
  makeAgent({ id: 'iris', name: 'Iris', lastMessageId: 'm0', ...fields })

function key(
  fields: Partial<{
    key: string
    code: string
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
    metaKey: boolean
  }>,
): Event {
  return Object.assign(new Event('keydown', { cancelable: true }), {
    key: '',
    code: '',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
    repeat: false,
    ...fields,
  })
}

const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
})

async function started(
  options: {
    focused?: boolean
    face?: (agentId: string) => string | undefined | Promise<string | undefined>
  } = {},
) {
  const fake = new FakeDesktop()
  for (const name of [
    'notify',
    'clearNotifications',
    'setBadge',
    'setTray',
    'closeWindow',
    'quit',
    'toggleFullScreen',
    'zoomWindow',
  ] as const)
    fake.answer(name, () => undefined)
  fake.answer('isWindowFocused', () => options.focused ?? false)
  stops.push(fake.install())
  const session = new Session()
  const backend = new FakeBackend()
  backend.agents = [iris({})]
  const target = new EventTarget()
  const surfaces = new DesktopSurfaces(desktop()!, session, {
    focused: options.focused ?? false,
    target,
    now: () => 10_000,
    picture: (count) =>
      count > 0 ? `data:image/png;base64,${count}` : undefined,
    face: options.face ?? (() => undefined),
  })
  stops.push(surfaces.start())
  await session.store.attach(backend)
  const calls = (name: string) =>
    fake.calls.filter((call) => call.name === name).map((call) => call.args[0])
  return {
    fake,
    session,
    store: session.store,
    backend,
    target,
    calls,
    // The app tells the page as its window comes in front or goes behind.
    focus: (now: boolean) => fake.emit('windowFocus', now),
  }
}

describe('Windows’ notifications (MacServices.swift’s `take`, `post`)', () => {
  it('tells a finished turn silently and a question with a sound, never what was there at launch', async () => {
    const { backend, calls } = await started()
    expect(calls('notify')).toEqual([])
    backend.push({ kind: 'agentUpserted', agent: iris({ isRunning: true }) })
    backend.push({
      kind: 'agentUpserted',
      agent: iris({ lastMessageId: 'm1', lastMessagePreview: 'Booked it.' }),
    })
    backend.push({
      kind: 'agentUpserted',
      agent: iris({
        lastMessageId: 'm1',
        awaitingUserResponse: true,
        waitingReason: 'Approval needed: wire $40',
      }),
    })
    expect(calls('notify') as AgentNote[]).toEqual([
      { agentId: 'iris', title: 'Iris', body: 'Booked it.', sound: false },
      {
        agentId: 'iris',
        title: 'Iris',
        body: 'Needs you: Approval needed: wire $40',
        sound: true,
      },
    ])
  })

  it('sends the agent’s face with its message, at once when drawn, else once drawn', async () => {
    let resolve: (png: string | undefined) => void = () => {}
    const drawn = new Map<string, string>()
    const asked: string[] = []
    const { backend, calls } = await started({
      face: (agentId) => {
        asked.push(agentId)
        const known = drawn.get(agentId)
        if (known) return known
        return new Promise<string | undefined>((done) => {
          resolve = (png) => {
            if (png) drawn.set(agentId, png)
            done(png)
          }
        })
      },
    })
    backend.push({ kind: 'agentUpserted', agent: iris({ isRunning: true }) })
    backend.push({
      kind: 'agentUpserted',
      agent: iris({ lastMessageId: 'm1', lastMessagePreview: 'Booked it.' }),
    })
    // Not drawn yet: the notification waits for its face.
    expect(calls('notify')).toEqual([])
    resolve('data:image/png;base64,AAAA')
    await ms(0)
    expect(calls('notify') as AgentNote[]).toEqual([
      {
        agentId: 'iris',
        title: 'Iris',
        body: 'Booked it.',
        sound: false,
        picture: 'data:image/png;base64,AAAA',
      },
    ])
    backend.push({
      kind: 'agentUpserted',
      agent: iris({
        lastMessageId: 'm1',
        awaitingUserResponse: true,
        waitingReason: 'Waiting for your input.',
      }),
    })
    // Drawn before: at once, the engine's waiting words as "Needs your input."
    expect((calls('notify') as AgentNote[])[1]).toEqual({
      agentId: 'iris',
      title: 'Iris',
      body: 'Needs your input.',
      sound: true,
      picture: 'data:image/png;base64,AAAA',
    })
    expect(asked).toEqual(['iris', 'iris'])
  })

  it('goes without a face that cannot be drawn', async () => {
    const { backend, calls } = await started({
      face: () => {
        throw new Error('no canvas')
      },
    })
    backend.push({ kind: 'agentUpserted', agent: iris({ isRunning: true }) })
    backend.push({
      kind: 'agentUpserted',
      agent: iris({ lastMessageId: 'm1', lastMessagePreview: 'Done.' }),
    })
    expect(calls('notify') as AgentNote[]).toEqual([
      { agentId: 'iris', title: 'Iris', body: 'Done.', sound: false },
    ])
  })

  it('tells nothing while the window is in front', async () => {
    const { backend, calls } = await started({ focused: true })
    backend.push({ kind: 'agentUpserted', agent: iris({ isRunning: true }) })
    backend.push({
      kind: 'agentUpserted',
      agent: iris({ lastMessageId: 'm1', lastMessagePreview: 'Done.' }),
    })
    expect(calls('notify')).toEqual([])
  })

  it('takes this run’s back and starts over for another account, or none', async () => {
    const { session, store, backend, calls } = await started()
    store.account = { name: 'Sam', email: 'sam@example.com' }
    backend.push({ kind: 'agentUpserted', agent: iris({ isRunning: true }) })
    expect(calls('clearNotifications')).toEqual([])
    // Reload keeps the account (the profile is read once): nothing taken back.
    await store.reloadFromComputer()
    expect(calls('clearNotifications')).toEqual([])
    store.detach()
    session.set('signedOut')
    expect(calls('clearNotifications').length).toBe(1)
    expect((calls('setBadge') as TaskbarBadge[]).at(-1)?.count).toBe(0)
    // What was known is forgotten: a turn's end after it is a first sight, told nothing.
    backend.push({
      kind: 'agentUpserted',
      agent: iris({ lastMessageId: 'm9', lastMessagePreview: 'Late.' }),
    })
    expect(calls('notify')).toEqual([])
  })
})

describe('the taskbar’s number (DockBadge)', () => {
  it('counts the unread, at least one each, hidden ones aside, and draws it', async () => {
    const { backend, calls } = await started()
    expect(calls('setBadge') as TaskbarBadge[]).toEqual([
      { count: 0, description: '' },
    ])
    backend.push({
      kind: 'agentUpserted',
      agent: iris({ hasUnread: true, unreadCount: 3 }),
    })
    backend.push({
      kind: 'agentUpserted',
      agent: makeAgent({ id: 'theo', name: 'Theo', hasUnread: true }),
    })
    backend.push({
      kind: 'agentUpserted',
      agent: makeAgent({
        id: 'nora',
        name: 'Nora',
        hasUnread: true,
        unreadCount: 9,
        isHidden: true,
      }),
    })
    expect((calls('setBadge') as TaskbarBadge[]).slice(1)).toEqual([
      { count: 3, image: 'data:image/png;base64,3', description: '3' },
      { count: 4, image: 'data:image/png;base64,4', description: '4' },
    ])
  })
})

describe('the window in front (MacServices.swift’s `focusChanged`, `sendFocus`)', () => {
  it('tells the computer as the Electron app did (windowFocusSync)', async () => {
    const shipped = fixture.cases.windowFocusSync[0]!.output
    const { backend, store, focus } = await started()
    const sent = () =>
      backend.commands
        .filter((command) => command.method === 'setWindowFocused')
        .map((command) => command.args)
    // Attached: told once, at once (here, as the computer is reached).
    backend.push({ kind: 'connection', live: true })
    await ms(5)
    expect(sent()).toEqual(shipped[0]!.sent)
    focus(true)
    await ms(5)
    expect(sent().slice(1)).toEqual(shipped[1]!.sent)
    expect(store.isForeground).toBe(true)
    focus(false)
    await ms(5)
    expect(sent().slice(2)).toEqual(shipped[2]!.sent)
    expect(store.isForeground).toBe(false)
    // Never waking a computer that rests (`commandIfAwake`).
    expect(
      backend.commands
        .filter((command) => command.method === 'setWindowFocused')
        .every((command) => !command.wakes),
    ).toBe(true)
  })

  it('reads the open chat as it comes in front', async () => {
    const { backend, store, focus } = await started()
    backend.push({
      kind: 'agents',
      agents: [iris({ hasUnread: true, unreadCount: 2 })],
    })
    store.openChat = 'iris'
    focus(true)
    await ms(5)
    expect(backend.read).toContain('iris')
    expect(store.agent('iris')?.unreadCount).toBe(0)
  })

  it('turns the computer’s own notifications off as it is reached, then says the focus', async () => {
    const { backend } = await started()
    backend.push({ kind: 'connection', live: true })
    await ms(5)
    const told = backend.commands.filter(
      (command) =>
        (command.method === 'setHostSettings' &&
          JSON.stringify(command.args).includes('notifications')) ||
        command.method === 'setWindowFocused',
    )
    expect(told[0]).toEqual({
      method: 'setHostSettings',
      args: { notifications: { isEnabled: false } },
      wakes: true,
    })
    expect(told.at(-1)?.method).toBe('setWindowFocused')
  })
})

describe('the tray’s menu (MenuBar.swift)', () => {
  it('starts signed out in the Mac’s words, then takes the window’s part once', async () => {
    const fake = new FakeDesktop().answer('setTray', () => undefined)
    fake.answer('setBadge', () => undefined)
    stops.push(fake.install())
    const session = new Session()
    const surfaces = new DesktopSurfaces(desktop()!, session, {
      target: new EventTarget(),
    })
    stops.push(surfaces.start())
    const trays = () =>
      fake.calls
        .filter((call) => call.name === 'setTray')
        .map((call) => call.args[0] as TrayMenu)
    expect(trays()).toEqual([
      {
        words: {
          openSimeon: 'Open Simeon',
          newChat: 'New Agent',
          aboutSimeon: 'About Simeon',
          checkForUpdates: 'Check for Updates…',
          quitSimeon: 'Quit Simeon',
        },
        signedIn: false,
        agents: [],
      },
    ])
    const part = {
      agents: [{ id: 'iris', name: 'Iris', unread: true }],
      call: { title: 'Call Iris', enabled: true },
    }
    surfaces.setWindowTray(part)
    surfaces.setWindowTray({ ...part })
    expect(trays().length).toBe(2)
    expect(trays()[1]).toMatchObject({ signedIn: true, ...part })
    surfaces.setWindowTray(undefined)
    expect(trays()[2]).toMatchObject({ signedIn: false, agents: [] })
    expect(trays()[2]?.call).toBeUndefined()
  })
})

describe('the Mac’s menu keys (SimeonCommands)', () => {
  it('hides, quits, goes full screen, and reloads only when signed in', async () => {
    const { target, calls, backend, session } = await started()
    const asked = backend.commands.length
    target.dispatchEvent(key({ key: 'w', ctrlKey: true }))
    target.dispatchEvent(key({ key: 'Q', ctrlKey: true }))
    target.dispatchEvent(key({ key: 'F11' }))
    expect(calls('closeWindow').length).toBe(1)
    expect(calls('quit').length).toBe(1)
    expect(calls('toggleFullScreen').length).toBe(1)
    const lists = () => backend.commands.length - asked
    target.dispatchEvent(key({ key: 'r', ctrlKey: true }))
    await ms(5)
    expect(lists()).toBeGreaterThan(0)
    session.set('signedOut')
    const after = backend.commands.length
    target.dispatchEvent(key({ key: 'r', ctrlKey: true }))
    await ms(5)
    expect(backend.commands.length).toBe(after)
    // Shift, Alt or a key someone already took: none of them.
    target.dispatchEvent(key({ key: 'w', ctrlKey: true, shiftKey: true }))
    target.dispatchEvent(key({ key: 'w', ctrlKey: true, altKey: true }))
    const taken = key({ key: 'w', ctrlKey: true })
    taken.preventDefault()
    target.dispatchEvent(taken)
    expect(calls('closeWindow').length).toBe(1)
  })
})

describe('quitting with a call on (CallBannerWindow.swift’s `follow`)', () => {
  it('hangs up a call that is on, not one that is over', async () => {
    const { store } = await started()
    let hungUp = 0
    store.hangUp = () => {
      hungUp += 1
    }
    store.call = { phase: 'live' } as CallState
    await runBeforeQuit()
    expect(hungUp).toBe(1)
    store.call = { phase: 'ended' } as CallState
    await runBeforeQuit()
    expect(hungUp).toBe(1)
  })
})

describe('the Mac’s zoom keys (WindowChrome.swift’s `WindowZoom.step`)', () => {
  it('reads Control-= and Control-+ in, Control-- out, Control-0 back; not with Alt, not Control-Shift-0', () => {
    const with_ = (key: string, more: Partial<Record<string, boolean>> = {}) =>
      zoomStep({
        key,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        ...more,
      })
    expect(with_('=')).toBe(0.1)
    expect(with_('+', { shiftKey: true })).toBe(0.1)
    expect(with_('-')).toBe(-0.1)
    expect(with_('0')).toBe(0)
    expect(with_('0', { shiftKey: true })).toBeUndefined()
    expect(with_('=', { altKey: true })).toBeUndefined()
    expect(with_('=', { ctrlKey: false })).toBeUndefined()
    expect(with_('a')).toBeUndefined()
  })

  it('asks the app, taking them before anything in the window hears them', async () => {
    const { target, calls } = await started()
    const keys = [
      key({ key: '=', ctrlKey: true }),
      key({ key: '-', ctrlKey: true }),
      key({ key: '0', ctrlKey: true }),
    ]
    for (const event of keys) target.dispatchEvent(event)
    expect(calls('zoomWindow')).toEqual([0.1, -0.1, 0])
    // Taken as they go down to the page (capture), so the field or the computer's screen under them never has them.
    expect(
      keys.every((event) => event.defaultPrevented && event.cancelBubble),
    ).toBe(true)
  })
})

describe('keys on any keyboard layout', () => {
  it('finds Control-W by its place where the layout writes no Latin letter', async () => {
    expect(keyLetter({ key: 'W', code: 'KeyW' })).toBe('w')
    expect(keyLetter({ key: 'ц', code: 'KeyW' })).toBe('w')
    // AZERTY: the letter the layout writes, as Windows' own shortcuts read it.
    expect(keyLetter({ key: 'z', code: 'KeyW' })).toBe('z')
    const { target, calls } = await started()
    target.dispatchEvent(key({ key: 'ц', code: 'KeyW', ctrlKey: true }))
    expect(calls('closeWindow').length).toBe(1)
  })
})

describe('as the app starts', () => {
  it('reads the window as behind until it is in front (MacServices.swift’s `watch`)', async () => {
    const { store } = await started({ focused: false })
    expect(store.isForeground).toBe(false)
  })

  it('cuts a long name to what the app takes, never giving up the notification', async () => {
    const { backend, calls } = await started()
    const long = 'Iris'.repeat(200)
    backend.push({
      kind: 'agentUpserted',
      agent: iris({ name: long, isRunning: true }),
    })
    backend.push({
      kind: 'agentUpserted',
      agent: iris({
        name: long,
        lastMessageId: 'm1',
        lastMessagePreview: 'Hi',
      }),
    })
    const note = (calls('notify') as AgentNote[])[0]
    expect(note?.title.length).toBe(512)
    expect(note?.body).toBe('Hi')
  })
})
