// The taskbar's number in the Windows app (SimeonMacCore's DockBadge.swift,
// the Mac's Dock number, from the Electron app's `dock-badge.ts` and its
// manager): each unread agent not hidden counts its unread messages, at
// least one; the full number, never "99+"; none at 0. Each agent's newest
// row counts: the host stamps every row (`snapshotEpoch`, `snapshotSeq`), so
// an older copy arriving late changes nothing.

import type { Agent } from './models'

interface Tracked {
  hasUnread: boolean
  unreadCount: number
  isHidden: boolean
  epoch: string
  seq: number
}

function count(row: {
  hasUnread: boolean
  unreadCount: number
  isHidden: boolean
}): number {
  if (!row.hasUnread || row.isHidden) return 0
  return Math.max(row.unreadCount, 1)
}

function tracked(agent: Agent): Tracked {
  return {
    hasUnread: agent.hasUnread,
    unreadCount: agent.unreadCount,
    isHidden: agent.isHidden,
    epoch: agent.stamp.epoch,
    seq: agent.stamp.seq,
  }
}

function isStale(kept: Tracked, incoming: Agent): boolean {
  return kept.epoch === incoming.stamp.epoch && incoming.stamp.seq < kept.seq
}

export class DockBadge {
  private agents = new Map<string, Tracked>()
  /** The number last set; undefined before the first, so the first is always set. */
  private projected?: number

  /** The number for a list (`computeDockBadgeTotal`). */
  static total(agents: readonly Agent[]): number {
    return agents.reduce((sum, agent) => sum + count(agent), 0)
  }

  /** The badge's text for a number: none at 0, else the number in full. */
  static label(total: number): string | undefined {
    return total === 0 ? undefined : String(total)
  }

  /** One agent's update. Returns the number to show when it changed. */
  update(agent: Agent): number | undefined {
    const kept = this.agents.get(agent.id)
    if (kept && isStale(kept, agent)) return undefined
    this.agents.set(agent.id, tracked(agent))
    return this.project()
  }

  /**
   * A whole roster, or the one read at a connect. An empty one while agents
   * are known is ignored; an agent missing from it stays only when the host
   * stamped it after the roster (made since).
   */
  roster(list: readonly Agent[]): number | undefined {
    if (list.length === 0 && this.agents.size > 0) return undefined
    let stampEpoch = ''
    let stampSeq = 0
    for (const agent of list) {
      if (agent.stamp.seq > stampSeq) {
        stampSeq = agent.stamp.seq
        stampEpoch = agent.stamp.epoch
      }
    }
    const next = new Map<string, Tracked>()
    for (const agent of list) {
      const kept = this.agents.get(agent.id)
      next.set(agent.id, kept && isStale(kept, agent) ? kept : tracked(agent))
    }
    for (const [id, kept] of this.agents) {
      if (!next.has(id) && kept.epoch === stampEpoch && kept.seq > stampSeq)
        next.set(id, kept)
    }
    this.agents = next
    return this.project()
  }

  /** Another account, or none: 0. */
  reset(): number | undefined {
    this.agents = new Map()
    return this.project()
  }

  private project(): number | undefined {
    let total = 0
    for (const row of this.agents.values()) total += count(row)
    if (total === this.projected) return undefined
    this.projected = total
    return total
  }
}
