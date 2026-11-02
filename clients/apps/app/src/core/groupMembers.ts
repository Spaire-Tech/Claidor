// A group's members on the agent pane's Computer tab (`z2n`), as the
// shipped window lists them (SimeonCore's GroupMembers.swift): who can be
// added, when Remove and Add Member show, the footer, and the remove
// dialog's words. The change itself is the store's (`setGroupMembers`).
// The flight part of GroupMembers.swift (`FlightPane`) is flightCards.ts'.

import { t } from './l10n'
import type { Agent } from './models'

/** The most a group has (`GROUP_MAX_MEMBERS`, `Sge`). */
export const memberLimit = 6

/** Who Add Member offers: agents that are not groups, not this group and not in it, most recent activity first (the roster's order). */
export function candidates(group: Agent, agents: readonly Agent[]): Agent[] {
  const members = new Set(group.memberIds)
  return agents
    .filter(
      (agent) =>
        !agent.isGroup && agent.id !== group.id && !members.has(agent.id),
    )
    .map((agent, offset) => ({ agent, offset }))
    .sort((a, b) => {
      const x = a.agent.lastActivityAt ?? 0
      const y = b.agent.lastActivityAt ?? 0
      return x !== y ? y - x : a.offset - b.offset
    })
    .map((one) => one.agent)
}

/** Remove can be pressed: more than one member, and no change of the list on its way. */
export function canRemove(count: number, pending: boolean): boolean {
  return count > 1 && !pending
}

/** Add Member shows: fewer than six, and someone to add. */
export function showsAdd(count: number, candidateCount: number): boolean {
  return count < memberLimit && candidateCount > 0
}

/** The words under the list: the limit at six, else when there is no one left to add. */
export function membersFooter(
  count: number,
  candidateCount: number,
): string | undefined {
  if (count >= memberLimit)
    return t`Groups can have up to ${memberLimit} members.`
  if (candidateCount === 0) return t('Create more Agents to add them here.')
  return undefined
}

/** The remove dialog's title (`removeTitle`, `F2n`). */
export function removeTitle(name: string): string {
  return t`Remove ${name} from this conversation?`
}

/** Remove's words while the change is on its way (three full stops, as the window has them). */
export function removingWord(): string {
  return t('Removing...')
}

export function removeFailed(): string {
  return t('Removing failed. Check your connection and try again.')
}

/** At Remove in the dialog: the members after `id` goes, read from the current list; undefined when nothing is to be sent (it is the last one, or already gone). */
export function without(
  id: string,
  current: readonly string[],
): string[] | undefined {
  if (current.length <= 1 || !current.includes(id)) return undefined
  return current.filter((one) => one !== id)
}

/** Add Member's pick: the members with `id` at the end; undefined at the limit. */
export function adding(
  id: string,
  current: readonly string[],
): string[] | undefined {
  if (current.length >= memberLimit || current.includes(id)) return undefined
  return [...current, id]
}
