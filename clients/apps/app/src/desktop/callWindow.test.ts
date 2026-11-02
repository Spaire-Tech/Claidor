// The call's own window in the Windows app (CallBannerWindow.swift), the
// page's two sides: the main window's, which sends the call and its bars and
// does the call window's buttons; the call window's, which reads the call
// as the banner reads the store.

import { afterEach, describe, expect, it } from 'vitest'
import { type CallState, ringingCall } from '../core/call'
import { makeAgent } from '../core/models'
import { AppStore } from '../core/store'
import { ms } from '../core/testing'
import { CallMirror, doCallAction, followCallWindow } from './callWindow'
import type { CallAction, ShownCall } from './contract'
import { desktop } from './desktop'
import { FakeDesktop } from './testing'

const stops: (() => void)[] = []
afterEach(() => {
  for (const stop of stops.splice(0)) stop()
})

/** A store whose call is set by the test, and whose buttons are counted. */
class CallStore extends AppStore {
  done: string[] = []
  private turns = 0
  showCall(call: CallState | undefined, levels: number[] = []): void {
    this.call = call
    this.callLevels = levels
    if (this.agents.length === 0)
      this.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
    // Any change tells the screens (the store's own `changed` is private): a step of a turn.
    this.turns += 1
    this.apply({
      kind: 'step',
      agentId: 'iris',
      id: `s${this.turns}`,
      running: true,
      summary: 'Working',
    })
  }
  override mute(muted: boolean): void {
    this.done.push(muted ? 'mute' : 'unmute')
  }
  override hangUp(): void {
    this.done.push('hangUp')
  }
  override dismissCall(): void {
    this.done.push('dismiss')
  }
}

function installed() {
  const fake = new FakeDesktop()
  for (const name of [
    'showCall',
    'showCallLevels',
    'callWindowAction',
  ] as const)
    fake.answer(name, () => undefined)
  fake.answer('callWindowReady', () => null)
  stops.push(fake.install())
  const calls = (name: string) =>
    fake.calls.filter((call) => call.name === name).map((call) => call.args[0])
  return { fake, host: desktop()!, calls }
}

describe('the main window’s side', () => {
  it('sends the call with its agent as it changes, its bars apart, and nothing again for nothing new', async () => {
    const { host, calls } = installed()
    const store = new CallStore()
    stops.push(followCallWindow(host, store, 10))
    expect(calls('showCall')).toEqual([null])
    const call = ringingCall('iris', 'Iris', '#3366ff')
    store.showCall(call)
    store.showCall(call)
    const shown = calls('showCall') as (ShownCall | null)[]
    expect(shown.length).toBe(2)
    expect(shown[1]?.call.agentId).toBe('iris')
    expect(shown[1]?.agent?.name).toBe('Iris')
    store.callLevels = [0.2, 0.4]
    await ms(30)
    store.callLevels = [0.2, 0.4]
    await ms(30)
    // The bars as the call came (none yet), then each change once.
    expect(calls('showCallLevels')).toEqual([[], [0.2, 0.4]])
    store.showCall(undefined)
    expect((calls('showCall') as unknown[]).at(-1)).toBeNull()
  })

  it('does what the call window’s buttons ask', () => {
    const { fake, host } = installed()
    const store = new CallStore()
    stops.push(followCallWindow(host, store, 1_000))
    for (const action of [
      'mute',
      'unmute',
      'hangUp',
      'dismiss',
    ] as CallAction[])
      fake.emit('callAction', action)
    expect(store.done).toEqual(['mute', 'unmute', 'hangUp', 'dismiss'])
  })

  it('ends a call that is on with Control-W, and puts away one that is over', () => {
    const store = new CallStore()
    doCallAction(store, 'close')
    expect(store.done).toEqual([])
    store.call = { ...ringingCall('iris', 'Iris', ''), phase: 'live' }
    doCallAction(store, 'close')
    store.call = { ...ringingCall('iris', 'Iris', ''), phase: 'ended' }
    doCallAction(store, 'close')
    expect(store.done).toEqual(['hangUp', 'dismiss'])
  })
})

describe('the call window’s side (CallMirror)', () => {
  it('reads the call as the banner reads the store, and sends its buttons back', async () => {
    const { fake, host, calls } = installed()
    const mirror = new CallMirror(host)
    let redraws = 0
    mirror.subscribe(() => {
      redraws += 1
    })
    stops.push(mirror.start())
    await ms(1)
    expect(calls('callWindowReady')).toEqual([undefined])
    fake.emit('callShown', {
      call: { ...ringingCall('iris', 'Iris', '') },
      agent: { ...makeAgent({ id: 'iris', name: 'Iris' }) },
    })
    expect(mirror.call?.agentName).toBe('Iris')
    expect(mirror.agent('iris')?.name).toBe('Iris')
    const before = redraws
    fake.emit('callLevels', [0.5])
    expect(mirror.callLevels).toEqual([0.5])
    expect(redraws).toBe(before)
    mirror.mute(true)
    mirror.mute(false)
    mirror.hangUp()
    mirror.dismissCall()
    mirror.close()
    expect(calls('callWindowAction')).toEqual([
      'mute',
      'unmute',
      'hangUp',
      'dismiss',
      'close',
    ])
    fake.emit('callShown', null)
    expect(mirror.call).toBeUndefined()
    expect(mirror.callLevels).toEqual([])
  })
})
