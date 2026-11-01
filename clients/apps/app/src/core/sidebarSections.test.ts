// The sidebar's sections against the shipped window's own code
// (SimeonCore's `SidebarSectionsTests`): the expected values were made by
// running the bundle's `dZ.normalize`, the sections store's commands, `Cct`
// and `Ict` in Node on these inputs (fixtures/sidebar-sections.json, copied
// from the core's test).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeAgent } from './models'
import {
  type SidebarSection,
  SidebarSelection,
  assignAgents,
  createSection,
  deletionMessage,
  deletionTitle,
  moveLabel,
  moveSection,
  newSectionId,
  newSectionLabel,
  normalize,
  parseSections,
  removeSection,
  renameSection,
  sectionIdOf,
  shownSections,
  sidebarOrder,
} from './sidebarSections'

interface Fixtures {
  normalize: { in: SidebarSection[]; out: SidebarSection[] }[]
  base: SidebarSection[]
  edits: { op: string; args: unknown[]; out: SidebarSection[] }[]
  removeAll: SidebarSection[]
  shown: {
    pins: string[]
    sections: SidebarSection[]
    collapsed: string[]
    shown: { id: string; un: boolean; col: boolean; agents: string[] }[]
    order: string[]
  }[]
}

const data = JSON.parse(
  readFileSync(
    new URL('./fixtures/sidebar-sections.json', import.meta.url),
    'utf8',
  ),
) as Fixtures

describe('the sidebar’s sections, as the window’s code makes them', () => {
  it('normalises and edits', () => {
    for (const item of data.normalize)
      expect(normalize(item.in)).toEqual(item.out)
    let checked = 0
    for (const item of data.edits) {
      const args = item.args as string[] & string[][]
      let got: SidebarSection[]
      switch (item.op) {
        case 'rename':
          got = renameSection(data.base, args[0]!, args[1]!)
          break
        case 'remove':
          got = removeSection(data.base, args[0]!)
          break
        case 'create':
          got = createSection(data.base, args[0]!, item.args[1] as string[])
          break
        case 'assignAgents':
          got = assignAgents(data.base, item.args[0] as string[], args[1]!)
          break
        default:
          got = moveSection(data.base, args[0]!, args[1]!, args[2] === 'before')
      }
      expect(got, `${item.op} ${JSON.stringify(item.args)}`).toEqual(item.out)
      checked += 1
    }
    expect(checked).toBe(13)
    const empty = ['s1', 's2', 's3'].reduce(removeSection, data.base)
    expect(empty).toEqual(data.removeAll)
    expect(empty).toEqual([])
  })

  it('draws the sections and orders the rows', () => {
    const agents = [1, 2, 3, 4, 5, 6].map((n) =>
      makeAgent({ id: `${n}`, name: `A${n}` }),
    )
    let checked = 0
    for (const item of data.shown) {
      const folded = new Set(item.collapsed)
      const shown = shownSections(agents, item.pins, item.sections, folded)
      expect(shown.map((one) => one.id)).toEqual(
        item.shown.map((one) => one.id),
      )
      expect(shown.map((one) => one.isUnassigned)).toEqual(
        item.shown.map((one) => one.un),
      )
      expect(shown.map((one) => one.isCollapsed)).toEqual(
        item.shown.map((one) => one.col),
      )
      expect(shown.map((one) => one.agents.map((agent) => agent.id))).toEqual(
        item.shown.map((one) => one.agents),
      )
      expect(sidebarOrder(agents, item.pins, item.sections, folded)).toEqual(
        item.order,
      )
      checked += 1
    }
    expect(checked).toBe(5)
  })

  it('reads the host’s sections and finds an agent’s', () => {
    const read = parseSections([
      { id: 's1', name: 'Work', agentIds: ['a', 7, 'b'] },
      { name: 'no id' },
      { id: 's2', agentIds: ['a', 'c'] },
    ])
    expect(read).toEqual([
      { id: 's1', name: 'Work', agentIds: ['a', 'b'] },
      { id: 's2', name: '', agentIds: ['c'] },
      { id: '__agents__', name: 'Unassigned', agentIds: [] },
    ])
    expect(sectionIdOf('c', read)).toBe('s2')
    expect(sectionIdOf('z', read)).toBe('__agents__')
  })
})

describe('several rows at once, and the words', () => {
  it('picks rows with ⌘ and ⇧ as the window does', () => {
    const order = ['p', 'a', 'b', 'c', 'd']
    let selection = SidebarSelection.empty()
    selection = selection.extend('b', order)
    expect([...selection.ids]).toEqual(['b'])
    selection = selection.extend('d', order)
    expect([...selection.ids].sort()).toEqual(['b', 'c', 'd'])
    selection = selection.extend('p', order)
    expect([...selection.ids].sort()).toEqual(['a', 'b', 'p'])
    selection = selection.toggle('a')
    expect([...selection.ids].sort()).toEqual(['b', 'p'])
    expect(selection.targets('b').sort()).toEqual(['b', 'p'])
    expect(selection.targets('c')).toEqual(['c'])
    selection = selection.plain('c')
    expect(selection.isEmpty).toBe(true)
    selection = selection.extend('a', order)
    expect([...selection.ids].sort()).toEqual(['a', 'b', 'c'])
    selection = selection.keep(new Set(['a', 'c']))
    expect([...selection.ids].sort()).toEqual(['a', 'c'])
  })

  it('says what the menus and the confirmation say', () => {
    expect(newSectionLabel(false, 3)).toBe('Move 3 agents to new section')
    expect(newSectionLabel(true, 3)).toBe('New section')
    expect(moveLabel(1)).toBe('Move to')
    expect(newSectionId(36, 1000)).toBe('section-rs-10')
    const group = makeAgent({ id: 'g', name: 'Team', isGroup: true })
    const agent = makeAgent({ id: 'a', name: 'Nora' })
    expect(deletionTitle([agent])).toBe('Delete “Nora”')
    expect(deletionTitle([group, group])).toBe('Delete 2 groups')
    expect(deletionTitle([group, agent])).toBe('Delete 2 agents')
    expect(
      deletionMessage([group, agent]).startsWith(
        'This permanently deletes the agents',
      ),
    ).toBe(true)
  })
})
