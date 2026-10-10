import Foundation
import SimeonCore

/**
 * The Dock's number (main's `dock-badge.ts`, `dock-badge-manager.ts`): each
 * unread agent not hidden counts its unread messages, at least one; the
 * full number, never "99+"; none at 0. Each agent's newest row counts: the
 * host stamps every row (`snapshotEpoch`, `snapshotSeq`), so an older copy
 * arriving late changes nothing.
 */
public final class DockBadge {
  struct Tracked {
    var hasUnread: Bool
    var unreadCount: Int
    var isHidden: Bool
    var epoch: String
    var seq: Double
  }

  private var agents: [String: Tracked] = [:]
  /** The number last set; nil before the first, so the first is always set. */
  private var projected: Int?

  public init() {}

  public static func total(_ agents: [Agent]) -> Int {
    agents.reduce(0) { $0 + count(hasUnread: $1.hasUnread, unreadCount: $1.unreadCount, isHidden: $1.isHidden) }
  }

  static func count(hasUnread: Bool, unreadCount: Int, isHidden: Bool) -> Int {
    guard hasUnread, !isHidden else { return 0 }
    return max(unreadCount, 1)
  }

  private static func tracked(_ agent: Agent) -> Tracked {
    Tracked(hasUnread: agent.hasUnread, unreadCount: agent.unreadCount, isHidden: agent.isHidden, epoch: agent.stamp.epoch, seq: agent.stamp.seq)
  }

  private static func isStale(_ tracked: Tracked, _ incoming: Agent) -> Bool {
    tracked.epoch == incoming.stamp.epoch && incoming.stamp.seq < tracked.seq
  }

  /** One agent's update. Returns the number to show when it changed. */
  public func update(_ agent: Agent) -> Int? {
    if let tracked = agents[agent.id], Self.isStale(tracked, agent) { return nil }
    agents[agent.id] = Self.tracked(agent)
    return project()
  }

  /**
   * A whole roster, or the one read at a connect. An empty one while agents
   * are known is ignored; an agent missing from it stays only when the host
   * stamped it after the roster (made since).
   */
  public func roster(_ list: [Agent]) -> Int? {
    if list.isEmpty && !agents.isEmpty { return nil }
    var stampEpoch = ""
    var stampSeq: Double = 0
    for agent in list where agent.stamp.seq > stampSeq {
      stampSeq = agent.stamp.seq
      stampEpoch = agent.stamp.epoch
    }
    var next: [String: Tracked] = [:]
    for agent in list {
      if let tracked = agents[agent.id], Self.isStale(tracked, agent) { next[agent.id] = tracked } else { next[agent.id] = Self.tracked(agent) }
    }
    for (id, tracked) in agents where next[id] == nil && tracked.epoch == stampEpoch && tracked.seq > stampSeq {
      next[id] = tracked
    }
    agents = next
    return project()
  }

  /** Another account, or none: 0. */
  public func reset() -> Int? {
    agents = [:]
    return project()
  }

  private func project() -> Int? {
    let total = agents.values.reduce(0) { $0 + Self.count(hasUnread: $1.hasUnread, unreadCount: $1.unreadCount, isHidden: $1.isHidden) }
    guard total != projected else { return nil }
    projected = total
    return total
  }

  /** The Dock's text for a number: none at 0, else the number in full. */
  public static func label(_ total: Int) -> String? { total == 0 ? nil : String(total) }
}
