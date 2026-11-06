// The window's model (windowModel.ts), as the Mac's `PaneState` and
// `WindowState` behave: the pane opening and closing with the sidebar's
// fold, its page lingering 240 ms, a page asked for another agent, a
// flight's details, the edge, the actions "/" and ⌘K run.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlightOffer } from '../core/flightCards'
import { FakeDesktop } from '../desktop/testing'
import { WindowModel, paneFits } from './windowModel'

function sidebar(collapsed = false) {
  const state = { collapsed }
  return {
    state,
    layout: {
      isCollapsed: () => state.collapsed,
      setCollapsed: (value: boolean) => {
        state.collapsed = value
      },
    },
  }
}

const offer = { offerId: 'off_1' } as FlightOffer

// The browser's storage, kept in memory (the tests run in Node).
const kept = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => kept.get(key) ?? null,
  setItem: (key: string, value: string) => kept.set(key, String(value)),
  removeItem: (key: string) => kept.delete(key),
  clear: () => kept.clear(),
})

describe('the agent’s pane', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('opens on Profile folding an open sidebar, and closing opens it again', () => {
    const model = new WindowModel('iris')
    const side = sidebar(false)
    model.setLayout(side.layout)
    model.openPane()
    expect(model.paneOpen).toBe(true)
    expect(model.section).toBe('profile')
    expect(side.state.collapsed).toBe(true)
    expect(localStorage.getItem('simeon.pane.open')).toBe('true')
    expect(localStorage.getItem('simeon.pane.tookSidebar')).toBe('true')
    model.closePane()
    expect(model.paneOpen).toBe(false)
    expect(side.state.collapsed).toBe(false)
    expect(localStorage.getItem('simeon.pane.tookSidebar')).toBeNull()
  })

  it('leaves a sidebar folded already as it was', () => {
    const model = new WindowModel('iris')
    const side = sidebar(true)
    model.setLayout(side.layout)
    model.openPane()
    model.closePane()
    expect(side.state.collapsed).toBe(true)
  })

  it('keeps its page 240 ms after closing, then forgets the page and the flight', () => {
    const model = new WindowModel('iris')
    model.openPane('routines')
    model.closePane()
    expect(model.contentAlive).toBe(true)
    expect(model.section).toBe('routines')
    vi.advanceTimersByTime(240)
    expect(model.contentAlive).toBe(false)
    expect(model.section).toBe('profile')
  })

  it('opened again before the page goes keeps it', () => {
    const model = new WindowModel('iris')
    model.openPane('routines')
    model.closePane()
    model.openPane('channels')
    vi.advanceTimersByTime(500)
    expect(model.contentAlive).toBe(true)
    expect(model.section).toBe('channels')
  })

  it('toggles from the head while shown, and from ⌘⇧I while open even if hidden', () => {
    const model = new WindowModel('iris')
    model.toggleSettings()
    expect(model.paneOpen).toBe(true)
    // Open but not drawn (no room): the head opens it on Profile again rather than closing.
    model.setSection('routines')
    model.toggleSettings()
    expect(model.paneOpen).toBe(true)
    expect(model.section).toBe('profile')
    model.setPaneVisible(true)
    model.toggleSettings()
    expect(model.paneOpen).toBe(false)
    model.setPaneVisible(false)
    model.toggleDetails()
    expect(model.paneOpen).toBe(true)
    model.toggleDetails()
    expect(model.paneOpen).toBe(false)
  })

  it('a page asked for another agent opens there once that agent shows; another agent starts on Profile', () => {
    const model = new WindowModel('iris')
    model.openPaneFor('profile', 'theo')
    expect(model.selected).toBe('theo')
    model.agentChanged('theo')
    expect(model.section).toBe('profile')
    model.setSection('routines')
    model.agentChanged('nora')
    expect(model.section).toBe('profile')
    model.openPaneFor('channels', 'iris')
    model.agentChanged('iris')
    expect(model.section).toBe('channels')
  })

  it('a routine’s chip opens Routines on its agent and asks for that routine', () => {
    const model = new WindowModel('iris')
    model.openRoutineFor('r1', 'theo')
    model.agentChanged('theo')
    expect(model.section).toBe('routines')
    expect(model.routineRequest).toBe('r1')
    model.routineRequestDone()
    expect(model.routineRequest).toBeUndefined()
    // Leaving Routines closes a routine's editor.
    model.openRoutine('r1', 'theo')
    model.setSection('profile')
    expect(model.routineEditor).toBeUndefined()
  })

  it('shows a flight on no page; the same row again closes the pane', () => {
    const model = new WindowModel('iris')
    const side = sidebar(false)
    model.setLayout(side.layout)
    model.toggleFlight('f1:0', offer, 'iris')
    expect(model.paneOpen).toBe(true)
    expect(model.flight?.key).toBe('f1:0')
    expect(side.state.collapsed).toBe(true)
    model.toggleFlight('f1:1', offer, 'iris')
    expect(model.flight?.key).toBe('f1:1')
    model.toggleFlight('f1:1', offer, 'iris')
    expect(model.paneOpen).toBe(false)
    expect(side.state.collapsed).toBe(false)
    vi.advanceTimersByTime(240)
    expect(model.flight).toBeUndefined()
  })

  it('a closed pane forgets its flight when opened on a page; Book closes only its own flight', () => {
    const model = new WindowModel('iris')
    model.toggleFlight('f1:0', offer, 'iris')
    model.closeFlight('f1:9')
    expect(model.paneOpen).toBe(true)
    model.closeFlight('f1:0')
    expect(model.paneOpen).toBe(false)
    model.openPane()
    expect(model.flight).toBeUndefined()
  })

  it('drags its width between 280 and 480, closes below 244, and keeps the width', () => {
    const model = new WindowModel('iris')
    model.openPane()
    // A window of 1400 beside the rail (88): 1400 - 424 - 88 = 888 of room, held at 480.
    model.drag(-100, 1400, 88)
    expect(model.dragWidth).toBe(480)
    model.drag(150, 1400, 88)
    expect(model.dragWidth).toBe(330)
    model.endDrag()
    expect(model.paneWidth).toBe(330)
    expect(localStorage.getItem('simeon.pane.width')).toBe('330')
    model.drag(100, 1400, 88)
    expect(model.dragCloses).toBe(true)
    expect(model.dragWidth).toBe(280)
    model.endDrag()
    expect(model.paneOpen).toBe(false)
    expect(model.paneWidth).toBe(330)
  })

  it('reads its width and whether it was open from the browser, within 280 and 480', () => {
    localStorage.setItem('simeon.pane.open', 'true')
    localStorage.setItem('simeon.pane.width', '900')
    const model = new WindowModel('iris')
    expect(model.paneOpen).toBe(true)
    expect(model.contentAlive).toBe(true)
    expect(model.paneWidth).toBe(480)
  })

  it('fits beside the sidebar and the chat’s 424', () => {
    expect(paneFits(992, 88, 480)).toBe(true)
    expect(paneFits(991, 88, 480)).toBe(false)
  })

  it('grows the Windows app’s window for it, and gives it back once it has slid shut', () => {
    const app = new FakeDesktop()
      .answer('growWindow', () => {})
      .answer('shrinkWindow', () => {})
    const putBack = app.install()
    try {
      const model = new WindowModel('iris')
      const side = sidebar(false)
      model.setLayout(side.layout)
      // Not drawn (the window too narrow, or closed): the rail, the chat's 424 and the pane.
      model.openPane()
      expect(app.calls).toEqual([
        { name: 'growWindow', args: [88 + 424 + 480, true] },
      ])
      // Drawn: opening another page asks nothing more.
      model.setPaneVisible(true)
      model.openPane('routines')
      expect(app.calls).toHaveLength(1)
      // ⌘B opening the sidebar beside it: room for the sidebar too, not given back.
      model.makeRoomForSidebar(260)
      expect(app.calls.at(-1)).toEqual({
        name: 'growWindow',
        args: [260 + 424 + 480, false],
      })
      model.closePane()
      expect(app.calls.map((call) => call.name)).not.toContain('shrinkWindow')
      vi.advanceTimersByTime(240)
      expect(app.calls.at(-1)).toEqual({ name: 'shrinkWindow', args: [] })
    } finally {
      putBack()
    }
  })

  it('never grows the window in a browser, nor for a flight', () => {
    const model = new WindowModel('iris')
    model.openPane()
    model.closePane()
    vi.advanceTimersByTime(240)
    const app = new FakeDesktop().answer('growWindow', () => {})
    const putBack = app.install()
    try {
      model.toggleFlight('f1', offer, 'iris')
      expect(app.calls).toEqual([])
    } finally {
      putBack()
    }
  })
})

describe('the window', () => {
  beforeEach(() => localStorage.clear())

  it('runs the actions it has and says no to the rest', () => {
    const model = new WindowModel('iris')
    expect(model.runAction('org-chart')).toBe(true)
    expect(model.orgChart).toBe(true)
    // An agent chosen closes the chart.
    model.choose('iris')
    expect(model.orgChart).toBe(false)
    expect(model.runAction('info:channels')).toBe(true)
    expect(model.section).toBe('channels')
    expect(model.runAction('info:members')).toBe(true)
    expect(model.section).toBe('computer')
    expect(model.runAction('open-hidden-chats')).toBe(true)
    expect(model.hiddenAgents).toBe(true)
    expect(model.runAction('settings:usage')).toBe(true)
    expect(model.overlay).toMatchObject({ kind: 'settings', page: 'usage' })
    expect(model.runAction('overlay:plugins')).toBe(true)
    expect(model.overlay).toMatchObject({ kind: 'connectors' })
    expect(model.runAction('theme:dark')).toBe(true)
    expect(localStorage.getItem('simeon.theme')).toBe('dark')
    expect(model.runAction('theme:system')).toBe(true)
    expect(localStorage.getItem('simeon.theme')).toBeNull()
    expect(model.runAction('pane:nothing')).toBe(false)
  })

  it('an agent opened from search or the chart asks the sidebar to let its picked rows go, each time anew', () => {
    const model = new WindowModel('iris')
    model.showOrgChart()
    model.openChat('theo')
    expect(model.orgChart).toBe(false)
    expect(model.selected).toBe('theo')
    const first = model.sidebarPlain
    expect(first).toEqual({ agentId: 'theo', count: 1 })
    model.openChat('theo')
    expect(model.sidebarPlain).not.toBe(first)
    expect(model.sidebarPlain?.count).toBe(2)
  })

  it('opens a page of the pane over the chart, closing the chart', () => {
    const model = new WindowModel('iris')
    model.showOrgChart()
    model.openPane('profile')
    expect(model.orgChart).toBe(false)
  })

  it('opens New Agent, closing search', () => {
    const model = new WindowModel('iris')
    model.toggleSearch()
    expect(model.searchOpen).toBe(true)
    model.startNewChat()
    expect(model.searchOpen).toBe(false)
    expect(model.newAgent).toBe(true)
    model.toggleSearch()
    model.toggleSearch()
    expect(model.searchOpen).toBe(false)
  })

  it('tells its watchers each change', () => {
    const model = new WindowModel('iris')
    let changes = 0
    model.subscribe(() => (changes += 1))
    model.choose('theo')
    model.choose('theo')
    model.openSearch()
    expect(changes).toBe(2)
  })
})

describe("step 5's slots", () => {
  it('an agent chosen closes the computer, the open one too (`Fzn`)', () => {
    const model = new WindowModel('iris')
    model.openComputer('iris')
    expect(model.computerShowing).toBe(true)
    model.choose('iris')
    expect(model.computer).toBeUndefined()
    model.openComputer('iris', 'helper-1')
    model.showComputerHelper('helper-2')
    expect(model.computer).toEqual({ agentId: 'iris', helper: 'helper-2' })
    model.openChat('theo')
    expect(model.computer).toBeUndefined()
  })

  it('a cover over the chat goes when another agent opens; signed out, everything goes', () => {
    const model = new WindowModel('iris')
    model.coverChat({ kind: 'call', agentId: 'iris', lineId: 'c1' })
    model.agentChanged('theo')
    expect(model.chatCover).toBeUndefined()
    model.openComputer('theo')
    model.askComputer({ kind: 'recover', fromSidebar: true })
    model.coverChat({ kind: 'exchange', agentId: 'theo', peerId: 'nora' })
    model.leftWindow()
    expect(model.computer).toBeUndefined()
    expect(model.computerAsk).toBeUndefined()
    expect(model.chatCover).toBeUndefined()
  })
})

describe("step 6's overlay slot", () => {
  it('Settings and Connectors take the one slot, each opening afresh', () => {
    const model = new WindowModel('iris')
    model.openComputer('iris')
    model.toggleAvatarEditor('iris')
    model.openSettings('wallet')
    expect(model.overlay).toEqual({
      kind: 'settings',
      page: 'wallet',
      asked: 'wallet',
      opening: 1,
    })
    // It takes the computer's place; what floats over the pane closes.
    expect(model.computer).toBeUndefined()
    expect(model.avatarEditorFor).toBeUndefined()
    expect(model.overlayShowing).toBe(true)
    // Another page from its list; the same ask again (⌘,) changes nothing.
    model.showSettingsPage('credentials')
    model.openSettings('wallet')
    expect(model.overlay).toMatchObject({ page: 'credentials', opening: 1 })
    model.openSettings('general')
    expect(model.overlay).toMatchObject({ page: 'general', opening: 1 })
    // Connectors gives Settings no room: one overlay at a time.
    model.openConnectors({ kind: 'plugin', id: 'link' })
    expect(model.overlay).toEqual({
      kind: 'connectors',
      ask: { kind: 'plugin', id: 'link' },
      asks: 1,
      opening: 2,
    })
    model.openConnectors()
    expect(model.overlay).toMatchObject({ asks: 2, opening: 2 })
    model.closeConnectors()
    expect(model.overlay).toBeUndefined()
    model.openSettings()
    expect(model.overlay).toMatchObject({ page: 'general', opening: 3 })
  })

  it('About and the feedback sheets; signed out, everything goes', () => {
    const model = new WindowModel('iris')
    model.openAbout()
    expect(model.overlayShowing).toBe(true)
    model.closeAbout()
    model.openFeedback('issue')
    expect(model.feedback).toBe('issue')
    model.openConnectors()
    model.openAbout()
    model.leftWindow()
    expect(model.overlay).toBeUndefined()
    expect(model.about).toBe(false)
    expect(model.feedback).toBeUndefined()
  })
})
