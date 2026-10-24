import Foundation

/**
 A group's members on the agent pane's Computer tab (`z2n`), as the shipped
 window lists them: who can be added, when Remove and Add Member show, the
 footer, and the remove dialog's words.
 */
public enum GroupMembers {
  /** The most a group has (`GROUP_MAX_MEMBERS`, `Sge`). */
  public static let limit = 6

  /** Who Add Member offers: agents that are not groups, not this group and not in it, most recent activity first (the roster's order). */
  public static func candidates(for group: Agent, in agents: [Agent]) -> [Agent] {
    let members = Set(group.memberIds)
    let offered = agents.filter { !$0.isGroup && $0.id != group.id && !members.contains($0.id) }
    return offered.enumerated().sorted { a, b in
      let x = a.element.lastActivityAt ?? 0, y = b.element.lastActivityAt ?? 0
      return x != y ? x > y : a.offset < b.offset
    }.map(\.element)
  }

  /** Remove can be pressed: more than one member, and no change of the list on its way. */
  public static func canRemove(count: Int, pending: Bool) -> Bool { count > 1 && !pending }

  /** Add Member shows: fewer than six, and someone to add. */
  public static func showsAdd(count: Int, candidates: Int) -> Bool { count < limit && candidates > 0 }

  /** The words under the list: the limit at six, else when there is no one left to add. */
  public static func footer(count: Int, candidates: Int) -> String? {
    if count >= limit { return L10n.text("Groups can have up to \(limit) members.") }
    if candidates == 0 { return L10n.text("Create more Agents to add them here.") }
    return nil
  }

  /** The remove dialog's title (`F2n`). */
  public static func removeTitle(_ name: String) -> String { L10n.text("Remove \(name) from this conversation?") }
  /** Remove's words while the change is on its way (three full stops, as the window has them). */
  public static let removing = L10n.text("Removing...")
  public static let removeFailed = L10n.text("Removing failed. Check your connection and try again.")

  /** At Remove in the dialog: the members after `id` goes, read from the current list; nil when nothing is to be sent (it is the last one, or already gone). */
  public static func without(_ id: String, current: [String]) -> [String]? {
    guard current.count > 1, current.contains(id) else { return nil }
    return current.filter { $0 != id }
  }

  /** Add Member's pick: the members with `id` at the end; nil at the limit. */
  public static func adding(_ id: String, to current: [String]) -> [String]? {
    guard current.count < limit, !current.contains(id) else { return nil }
    return current + [id]
  }
}

/**
 The flight open in the agent pane (`__simeonFlightDetails`). The pane draws
 it as the iPhone's sheet does, from `Flights.swift` (24 October 2026).
 */
public enum FlightPane {
  /** The open flight's key: the card's row and the offer's place in it (the window keys on the message's words). */
  public static func key(row: String, index: Int) -> String { "\(row):\(index)" }
}
