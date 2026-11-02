// The tray's part from the window (MenuBar.swift's `MenuBarMenu`,
// SimeonMacApp.swift's `CallItem`), written from the Swift.

import { describe, expect, it } from 'vitest'
import { makeAgent } from '../core/models'
import { trayAgentsShown, windowTray } from './useDesktopWindow'

const agents = Array.from({ length: 11 }, (_, index) =>
  makeAgent({
    id: `a${index}`,
    name: `Agent ${index}`,
    isHidden: index === 1,
    hasUnread: index === 2,
    unreadCount: index === 3 ? 2 : 0,
  }),
)

describe('the tray’s agents and call (MenuBarMenu.listed, CallItem)', () => {
  it('lists eight in the sidebar’s order, hidden ones aside, a mark on the unread', () => {
    const tray = windowTray(agents, undefined, false)
    expect(trayAgentsShown).toBe(8)
    expect(tray.agents.map((agent) => agent.id)).toEqual([
      'a0',
      'a2',
      'a3',
      'a4',
      'a5',
      'a6',
      'a7',
      'a8',
    ])
    expect(
      tray.agents.filter((agent) => agent.unread).map((a) => a.id),
    ).toEqual(['a2', 'a3'])
    expect(tray.call).toBeUndefined()
  })

  it('calls the open agent, not a group; a disabled Call Agent otherwise', () => {
    const iris = makeAgent({ id: 'iris', name: 'Iris' })
    const group = makeAgent({ id: 'g', name: 'Team', isGroup: true })
    expect(windowTray([iris], iris, true).call).toEqual({
      title: 'Call Iris',
      enabled: true,
    })
    expect(windowTray([group], group, true).call).toEqual({
      title: 'Call Agent',
      enabled: false,
    })
    expect(windowTray([iris], undefined, true).call).toEqual({
      title: 'Call Agent',
      enabled: false,
    })
  })
})
