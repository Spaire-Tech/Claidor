// The pane's members list (SimeonCore's PaneMembersFlightTests.swift), against
// the window's rules. The flight part of that file is flightCards.test.ts'.

import { describe, expect, it } from 'vitest'
import {
  adding,
  canRemove,
  candidates,
  membersFooter,
  removeTitle,
  showsAdd,
  without,
} from './groupMembers'
import { agentFrom, makeAgent, showsMembers } from './models'

describe('a group’s members', () => {
  it('who can be added, and the list’s rules', () => {
    const group = makeAgent({
      id: 'g',
      name: 'Launch',
      isGroup: true,
      memberIds: ['a'],
    })
    const agents = [
      makeAgent({ id: 'a', name: 'Simeon', lastActivityAt: 5 }),
      makeAgent({ id: 'b', name: 'Iris', lastActivityAt: 1 }),
      makeAgent({ id: 'c', name: 'Scout', lastActivityAt: 9 }),
      makeAgent({ id: 'h', name: 'Crew', isGroup: true }),
      group,
    ]
    expect(candidates(group, agents).map((agent) => agent.id)).toEqual([
      'c',
      'b',
    ])
    expect(canRemove(1, false)).toBe(false)
    expect(canRemove(3, true)).toBe(false)
    expect(canRemove(2, false)).toBe(true)
    expect(membersFooter(6, 3)).toBe('Groups can have up to 6 members.')
    expect(membersFooter(2, 0)).toBe('Create more Agents to add them here.')
    expect(membersFooter(2, 1)).toBeUndefined()
    expect(showsAdd(6, 2)).toBe(false)
    expect(showsAdd(5, 1)).toBe(true)
    expect(without('a', ['a', 'b'])).toEqual(['b'])
    expect(without('a', ['a'])).toBeUndefined()
    expect(without('z', ['a', 'b'])).toBeUndefined()
    expect(adding('c', ['a'])).toEqual(['a', 'c'])
    expect(adding('c', ['1', '2', '3', '4', '5', '6'])).toBeUndefined()
    expect(adding('a', ['a'])).toBeUndefined()
    expect(removeTitle('Iris')).toBe('Remove Iris from this conversation?')
  })

  it('equal activity keeps the roster’s order', () => {
    const group = makeAgent({ id: 'g', name: 'G', isGroup: true })
    const agents = [
      makeAgent({ id: 'x', name: 'X' }),
      makeAgent({ id: 'y', name: 'Y', lastActivityAt: 0 }),
      makeAgent({ id: 'z', name: 'Z' }),
    ]
    expect(candidates(group, agents).map((agent) => agent.id)).toEqual([
      'x',
      'y',
      'z',
    ])
  })

  it('a shared room shows no members', () => {
    expect(
      showsMembers(agentFrom({ id: 'g', name: 'Launch', isGroup: true })!),
    ).toBe(true)
    expect(
      showsMembers(
        agentFrom({
          id: 'g',
          name: 'Launch',
          isGroup: true,
          sharedRoomId: 'room-1',
        })!,
      ),
    ).toBe(false)
    expect(
      showsMembers(
        agentFrom({
          id: 'g',
          name: 'Launch',
          isGroup: true,
          remoteRoom: { owner: 'x' },
        })!,
      ),
    ).toBe(false)
    expect(showsMembers(agentFrom({ id: 'a', name: 'Theo' })!)).toBe(false)
  })
})
