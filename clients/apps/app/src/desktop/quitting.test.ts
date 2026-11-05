import { afterEach, describe, expect, it } from 'vitest'
import { desktop } from './desktop'
import { beforeQuit, listenForQuitting, runBeforeQuit } from './quitting'
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
})
