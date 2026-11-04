import { afterEach, describe, expect, it } from 'vitest'
import { desktop } from './desktop'
import {
  type QuitAsk,
  type QuitChoice,
  beforeQuit,
  listenForQuitting,
  runBeforeQuit,
} from './quitting'
import { FakeDesktop } from './testing'

describe('before quitting', () => {
  const undo: (() => void)[] = []
  afterEach(() => {
    for (const step of undo.splice(0)) step()
  })

  it('runs every task, a failing one included', async () => {
    const done: string[] = []
    undo.push(beforeQuit(() => void done.push('chats')))
    undo.push(
      beforeQuit(() => {
        throw new Error('no')
      }),
    )
    undo.push(beforeQuit(async () => void done.push('call')))
    await runBeforeQuit(50)
    expect(done.sort()).toEqual(['call', 'chats'])
  })

  it('stops waiting when the budget is spent', async () => {
    undo.push(beforeQuit(() => new Promise<void>(() => {})))
    const started = Date.now()
    await runBeforeQuit(30)
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('answers the app once done', async () => {
    const fake = new FakeDesktop().answer('readyToQuit', () => undefined)
    undo.push(fake.install())
    const host = desktop()
    if (!host) throw new Error('no desktop')
    undo.push(listenForQuitting(host))
    fake.emit('quitting', null)
    await new Promise((done) => setTimeout(done, 20))
    expect(fake.calls.map((call) => call.name)).toEqual(['readyToQuit'])
  })

  // Decision 3 of docs/app-browser/README.md: an agent at work in the app's browser, asked first.
  const asking = (choice: QuitChoice, working = ['theo']) => {
    const seen: string[] = []
    const ask: QuitAsk = {
      working: (browsing) => ({
        ids: browsing.filter((id) => working.includes(id)),
        names: browsing
          .filter((id) => working.includes(id))
          .map((id) => id.toUpperCase()),
      }),
      choose: async (names) => {
        seen.push(`asked ${names.join(',')}`)
        return choice
      },
      stop: async (ids) => void seen.push(`stopped ${ids.join(',')}`),
    }
    return { ask, seen }
  }
  const quitWith = async (ask: QuitAsk, browsing: string[] | null) => {
    const fake = new FakeDesktop()
      .answer('readyToQuit', () => undefined)
      .answer('holdQuit', () => undefined)
      .answer('cancelQuit', () => undefined)
    undo.push(fake.install())
    const host = desktop()
    if (!host) throw new Error('no desktop')
    undo.push(listenForQuitting(host, ask))
    fake.emit('quitting', browsing === null ? null : { browsing })
    await new Promise((done) => setTimeout(done, 20))
    return fake.calls.map((call) => call.name)
  }

  it('asks while an agent works in the browser: Cancel keeps the app open', async () => {
    const { ask, seen } = asking('cancel')
    expect(await quitWith(ask, ['theo', 'iris'])).toEqual([
      'holdQuit',
      'cancelQuit',
    ])
    expect(seen).toEqual(['asked THEO'])
  })

  it('Stop stops its task, then quits', async () => {
    const { ask, seen } = asking('stop')
    expect(await quitWith(ask, ['theo'])).toEqual(['holdQuit', 'readyToQuit'])
    expect(seen).toEqual(['asked THEO', 'stopped theo'])
  })

  it('Move quits, the task left to move to the computer', async () => {
    const { ask, seen } = asking('move')
    expect(await quitWith(ask, ['theo'])).toEqual(['holdQuit', 'readyToQuit'])
    expect(seen).toEqual(['asked THEO'])
  })

  it('asks nothing when no agent with tabs here is at work, or none has tabs', async () => {
    const idle = asking('cancel', [])
    expect(await quitWith(idle.ask, ['iris'])).toEqual(['readyToQuit'])
    const none = asking('cancel')
    expect(await quitWith(none.ask, null)).toEqual(['readyToQuit'])
    expect([...idle.seen, ...none.seen]).toEqual([])
  })
})
