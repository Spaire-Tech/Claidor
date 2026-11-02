// Step 5b's screens as the window draws them before any screen connects
// (mac/Simeon/ComputerPreview.swift, ComputerView.swift, Cards.swift's
// `ComputerHandoffCard`): the pane's Computer tab in each state, the full
// view's bar, banner, words and helpers' strip, the hand-off card's Take
// over and Open computer; the window's ↑← ↓→ between helpers' screens; and
// the keys a paste and the Mac's ⌘ shortcuts send to the computer.

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Entry } from '../core/entry'
import type { JSONValue } from '../core/json'
import { makeAgent } from '../core/models'
import { AppStore } from '../core/store'
import { ComputerLayer, ComputerPreview } from './ComputerView'
import { ctrlStrokes, pasteStrokes } from './liveScreen'
import { requestCardView } from './RequestCards'
import { WindowContext, WindowModel } from './windowModel'

const theo = makeAgent({ id: 'theo', name: 'Theo' })

function storeWith(...statuses: JSONValue[]): AppStore {
  const store = new AppStore()
  store.agents = [theo]
  for (const status of statuses) store.apply({ kind: 'computer', status })
  return store
}

function draw(model: WindowModel, node: ReactNode): string {
  return renderToStaticMarkup(
    <WindowContext.Provider value={model}>{node}</WindowContext.Provider>,
  )
}

const screen = 'http://127.0.0.1:6080/vnc.html'
const helpers = (count: number): JSONValue[] =>
  Array.from({ length: count }, (_, index) => ({
    subagentId: `s${index + 1}`,
    subagentType: 'computerUse',
    status: 'running',
    title: `Helper ${index + 1}`,
  }))

describe('the Computer tab', () => {
  const preview = (store: AppStore, model = new WindowModel('theo')) =>
    draw(model, <ComputerPreview store={store} agent={theo} />)

  it('says the computer boots while its status is unknown, under "Theo’s screen"', () => {
    const page = preview(storeWith())
    expect(page).toContain('Booting up the computer')
    expect(page).toContain('bar-piece')
    expect(page).toContain('Theo&#x27;s screen')
    expect(page).toContain('aria-label="Open computer"')
    expect(page).not.toContain('open-pill')
  })

  it('shows the pull’s percent, then the display’s glyph for a computer that rests', () => {
    const pulling = preview(
      storeWith({ agentId: 'theo', state: 'absent', pull: { percent: 42.6 } }),
    )
    expect(pulling).toContain('Setting up the computer')
    expect(pulling).toContain('43%')
    const resting = preview(storeWith({ agentId: 'theo', state: 'hibernated' }))
    expect(resting).toContain('frame-display')
    expect(resting).not.toContain('placeholder-words')
  })

  it('has a spinner and Open over a running screen, and nothing while the full view shows it', () => {
    const store = storeWith({
      agentId: 'theo',
      state: 'running',
      vncUrl: screen,
    })
    const page = preview(store)
    expect(page).toContain('screen-spinner')
    expect(page).toContain('open-pill')
    expect(page).toContain('agent-pointer-layer')
    const model = new WindowModel('theo')
    model.openComputer('theo')
    const covered = preview(store, model)
    expect(covered).not.toContain('screen-spinner')
    expect(covered).not.toContain('screen-host')
    expect(covered).not.toContain('placeholder-words')
  })

  it('needs the person’s attention while the agent waits on them', () => {
    const page = preview(
      storeWith({
        agentId: 'theo',
        state: 'running',
        vncUrl: screen,
        handoff: { requestId: 'r1', instruction: '' },
      }),
    )
    expect(page).toContain('Needs your attention')
    expect(page).toContain('Theo needs you')
    expect(page).toContain('Skip this step')
    expect(page).toContain('I&#x27;m done, continue')
  })

  it('names the first helper on the frame', () => {
    const store = storeWith({
      agentId: 'theo',
      state: 'running',
      vncUrl: screen,
    })
    store.apply({ kind: 'subagents', parentId: 'theo', subagents: helpers(1) })
    expect(preview(store)).toContain('aria-label="Helper 1"')
  })
})

describe('the full view', () => {
  const full = (store: AppStore, helper?: string) => {
    const model = new WindowModel('theo')
    model.openComputer('theo', helper)
    return draw(model, <ComputerLayer store={store} />)
  }

  it('draws nothing while no computer is open', () => {
    expect(
      draw(new WindowModel('theo'), <ComputerLayer store={storeWith()} />),
    ).toBe('')
  })

  it('switches to the agent’s screen with the bar and Exit fullscreen, as a modal', () => {
    const page = full(storeWith())
    expect(page).toContain('aria-modal="true"')
    expect(page).toContain('aria-label="Theo&#x27;s screen"')
    expect(page).toContain('title="Exit fullscreen"')
    expect(page).toContain('Switching to Theo&#x27;s screen…')
  })

  it('carries the hand-off’s banner over the screen', () => {
    const page = full(
      storeWith({
        agentId: 'theo',
        state: 'running',
        vncUrl: screen,
        handoff: { requestId: 'r1', instruction: 'Sign in to Gmail' },
      }),
    )
    expect(page).toContain('handoff-banner')
    expect(page).toContain('title="Sign in to Gmail"')
    expect(page).toContain('Skip this step')
    expect(page).toContain('computer-screen')
  })

  it('names the helper shown and strips the others: three and "and 2 more" past four', () => {
    const store = storeWith({
      agentId: 'theo',
      state: 'running',
      vncUrl: screen,
    })
    store.apply({ kind: 'subagents', parentId: 'theo', subagents: helpers(6) })
    const page = full(store, 's2')
    expect(page).toContain('computer-helper-name">Helper 2<')
    expect(page).toContain('Switch to Helper 1')
    expect(page).toContain('Switch to Helper 3')
    expect(page).toContain('Switch to Helper 4')
    expect(page).not.toContain('Switch to Helper 5')
    expect(page).toContain('and 2 more')
    expect(page).toContain('Show 2 more screens')
  })

  it('steps between two or more helpers’ screens, round (↑← ↓→)', () => {
    const store = storeWith({
      agentId: 'theo',
      state: 'running',
      vncUrl: screen,
    })
    store.apply({ kind: 'subagents', parentId: 'theo', subagents: helpers(3) })
    const model = new WindowModel('theo')
    model.openComputer('theo')
    model.stepComputerHelper(-1, store.computerHelpers('theo'))
    expect(model.computer?.helper).toBe('s3')
    model.stepComputerHelper(1, store.computerHelpers('theo'))
    expect(model.computer?.helper).toBe('s1')
    model.stepComputerHelper(1, store.computerHelpers('theo').slice(0, 1))
    expect(model.computer?.helper).toBe('s1')
  })
})

describe('the hand-off card', () => {
  const card = (store: AppStore, resolution?: string) => {
    const entry = Entry.from({
      kind: 'send-message',
      id: 'h1',
      timestampMs: 1,
      boxRequestId: 'r1',
      ...(resolution ? { boxResolution: resolution } : {}),
      message: { type: 'text', content: 'Sign in to the bank' },
    })!
    return draw(
      new WindowModel('theo'),
      requestCardView('computer', {
        entry,
        entryId: entry.id,
        agentId: 'theo',
        store,
        column: 928,
        openAgent: () => {},
      }),
    )
  }

  it('waits with the screen’s picture, I’m done and Take over', () => {
    const page = card(
      storeWith({
        agentId: 'theo',
        state: 'running',
        handoff: {
          requestId: 'r1',
          instruction: 'Sign in to the bank, then press I’m done',
          snapshotDataUrl: 'data:image/webp;base64,AAAA',
        },
      }),
    )
    expect(page).toContain('Sign in to the bank, then press I’m done')
    expect(page).toContain('aria-label="Take over the computer"')
    expect(page).toContain('src="data:image/webp;base64,AAAA"')
    expect(page).toContain('handoff-pill blue">Take over<')
  })

  it('draws no picture that isn’t one', () => {
    const page = card(
      storeWith({
        agentId: 'theo',
        state: 'running',
        handoff: {
          requestId: 'r1',
          instruction: 'x',
          snapshotDataUrl: 'https://example.com/x.png',
        },
      }),
    )
    expect(page).not.toContain('handoff-snapshot')
  })

  it('opens the computer once settled', () => {
    const page = card(storeWith(), 'completed')
    expect(page).toContain('Open computer')
    expect(page).not.toContain('Take over')
  })
})

describe('the keys sent to the computer', () => {
  it('sends ⌘A ⌘C ⌘V ⌘X ⌘Z as Ctrl, ⌘ and ⌥ let go of first', () => {
    const strokes = ctrlStrokes('KeyC', true)
    expect(strokes.slice(0, 6).every(([, , down]) => !down)).toBe(true)
    expect(strokes.slice(6)).toEqual([
      [0xffe3, 'ControlLeft', true],
      [0xffe1, 'ShiftLeft', true],
      [0x63, 'KeyC', true],
      [0x63, 'KeyC', false],
      [0xffe1, 'ShiftLeft', false],
      [0xffe3, 'ControlLeft', false],
    ])
    expect(ctrlStrokes('KeyQ', false)).toEqual([])
  })

  it('pastes with Ctrl+V on a Mac, and with the V alone where Ctrl is already held', () => {
    expect(pasteStrokes(true, false)).toEqual(ctrlStrokes('KeyV', false))
    expect(pasteStrokes(false, true)).toEqual([
      [0x76, 'KeyV', true],
      [0x76, 'KeyV', false],
    ])
  })
})
