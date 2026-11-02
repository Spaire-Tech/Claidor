// The window's menus keep track of their items by what they are (the
// review of step 6f, L2 and L3): the account menu's Weekly usage coming or
// going while the menu is open moves neither the keys the items are drawn
// under nor the submenu that is open.

import { describe, expect, it } from 'vitest'
import { type MenuLine, menuKey, openIndexOf } from './ContextMenu'

const usage: MenuLine = {
  id: 'weekly',
  label: 'Weekly usage',
  badge: '38%',
  submenu: [{ id: 'usage', label: 'Usage & Billing' }],
}
const rest: MenuLine[] = [
  { id: 'settings', label: 'Settings' },
  { id: 'about', label: 'About' },
  'separator',
  { id: 'logOut', label: 'Log out' },
]

const keys = (items: MenuLine[]) =>
  items.map((item, index) =>
    item === 'separator' || 'figure' in item ? '' : menuKey(item, index),
  )

describe('the window’s menus, by what their items are', () => {
  it('draw an item under the same key when an item arrives above it', () => {
    const before = keys(rest)
    const after = keys([usage, ...rest]).slice(1)
    expect(after).toEqual(before)
  })

  it('keep the menus without ids as they were: by place and words', () => {
    expect(menuKey({ label: 'Pin' }, 2)).toBe('2-Pin')
  })

  it('find the open submenu’s item where it is now, and none once it is gone', () => {
    const open = menuKey(usage, 0)
    expect(openIndexOf([usage, ...rest], open)).toBe(0)
    // Weekly usage taken out while its submenu is open: nothing is left lit (Settings is now first).
    expect(openIndexOf(rest, open)).toBe(-1)
    expect(openIndexOf([usage, ...rest], undefined)).toBe(-1)
    // An item without a submenu never counts as open.
    expect(openIndexOf(rest, 'settings')).toBe(-1)
  })
})
