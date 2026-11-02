// Step 7f's Allow card as the window draws it (mac/Simeon/MacLocalPermission.swift's
// `LocalAskDock`): its buttons greyed while no computer is attached, as the
// Mac's (`!submitting && store.backend != nil`), so an answer that could
// not go is never offered.

import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { Entry } from '../core/entry'
import { AppStore } from '../core/store'
import { FakeBackend } from '../core/testing'
import { FakeDesktop } from '../desktop/testing'
import { LocalAskDock } from './LocalAskDock'
import { WindowContext, WindowModel } from './windowModel'

let restore: (() => void) | undefined
afterEach(() => {
  restore?.()
  restore = undefined
})

function draw(store: AppStore): string {
  return renderToStaticMarkup(
    <WindowContext.Provider value={new WindowModel(undefined)}>
      <LocalAskDock store={store} agentId="a1" />
    </WindowContext.Provider>,
  )
}

const ask = Entry.from({
  id: 'e1',
  kind: 'send-message',
  timestampMs: 1,
  message: {
    type: 'local-tool-permission',
    ask: {
      requestId: 'q1',
      action: 'run-command',
      target: 'ls',
      status: 'pending',
    },
  },
}) as Entry

/** The card's buttons, each with whether it is greyed. */
const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map((match) => ({
    words: (match[2] ?? '').replace(/<[^>]+>/g, '').trim(),
    disabled: / disabled=""/.test(match[1] ?? ''),
  }))

describe('the Allow card (LocalAskDock)', () => {
  it('greys its answers while no computer is attached (N1)', async () => {
    restore = new FakeDesktop().install()
    const store = new AppStore()
    store.transcripts.a1 = [ask]
    const alone = buttons(draw(store))
    expect(alone.find((one) => one.words === 'Allow once')).toEqual({
      words: 'Allow once',
      disabled: true,
    })
    expect(alone.find((one) => one.words === 'Never')?.disabled).toBe(true)
    await store.attach(new FakeBackend())
    store.transcripts.a1 = [ask]
    const attached = buttons(draw(store))
    expect(attached.find((one) => one.words === 'Allow once')?.disabled).toBe(
      false,
    )
    expect(attached.find((one) => one.words === 'Never')?.disabled).toBe(false)
  })
})
