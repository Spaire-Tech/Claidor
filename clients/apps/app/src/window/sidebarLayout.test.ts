// The sidebar's width as the Mac's `SidebarLayout` keeps it: the rail when
// folded or when the chat would be narrower than 424, the edge dragged
// between 240 and 400, and folding under 210.

import { describe, expect, it } from 'vitest'
import {
  type SidebarSize,
  dragTo,
  railWidth,
  showsRail,
  sidebarWidth,
  toggled,
} from './sidebarLayout'

const open: SidebarSize = { expandedWidth: 320, isCollapsed: false }

describe('the sidebar’s width', () => {
  it('shows the rail when folded, or when the chat would be under 424', () => {
    expect(showsRail(open, 1040)).toBe(false)
    expect(sidebarWidth(open, 1040)).toBe(320)
    // 320 + 424 = 744: one point narrower and the rail shows.
    expect(showsRail(open, 744)).toBe(false)
    expect(showsRail(open, 743)).toBe(true)
    expect(sidebarWidth(open, 743)).toBe(railWidth)
    expect(showsRail(toggled(open), 1040)).toBe(true)
    expect(toggled(toggled(open))).toEqual(open)
  })

  it('drags between 240 and 400, never leaving the chat under 424', () => {
    expect(dragTo(open, 360, 1040)).toEqual({
      expandedWidth: 360,
      isCollapsed: false,
    })
    expect(dragTo(open, 500, 1040).expandedWidth).toBe(400)
    expect(dragTo(open, 230, 1040).expandedWidth).toBe(240)
    // 700 wide leaves 276 for the sidebar.
    expect(dragTo(open, 390, 700).expandedWidth).toBe(276)
  })

  it('folds under 210, and opens from the rail again from 220', () => {
    const folded = dragTo(open, 200, 1040)
    expect(folded).toEqual({ expandedWidth: 320, isCollapsed: true })
    expect(dragTo(folded, 215, 1040)).toBe(folded)
    expect(dragTo(folded, 260, 1040)).toEqual({
      expandedWidth: 260,
      isCollapsed: false,
    })
    // A window with no room for an open sidebar keeps the rail.
    expect(dragTo(folded, 300, 600)).toBe(folded)
  })
})
