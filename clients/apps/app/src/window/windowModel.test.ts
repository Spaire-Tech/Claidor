// The window's model (windowModel.ts), as the Mac's `PaneState` and
// `WindowState` behave: the pane opening and closing with the sidebar's
// fold, its page lingering 240 ms, a page asked for another agent, a
// flight's details, the edge, the actions "/" and ⌘K run.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlightOffer } from '../core/flightCards'
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
    expect(model.runAction('settings:general')).toBe(false)
    expect(model.runAction('theme:dark')).toBe(false)
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
