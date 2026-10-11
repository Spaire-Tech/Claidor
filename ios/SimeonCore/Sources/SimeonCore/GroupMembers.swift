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
    if count >= limit { return "Groups can have up to \(limit) members." }
    if candidates == 0 { return "Create more Agents to add them here." }
    return nil
  }

  /** The remove dialog's title (`F2n`). */
  public static func removeTitle(_ name: String) -> String { "Remove \(name) from this conversation?" }
  /** Remove's words while the change is on its way (three full stops, as the window has them). */
  public static let removing = "Removing..."
  public static let removeFailed = "Removing failed. Check your connection and try again."

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
 A flight's details in the agent pane (`__simeonFlightDetails`), worded as
 the shipped window words them: the server's words kept, empty rows left
 out. (The phone's sheet words them its own way, in `Flights.swift`.)
 */
public enum FlightPane {
  public struct Row: Hashable, Sendable {
    public let label: String
    public let value: String
    public let sub: String?
  }

  public struct Section: Hashable, Sendable {
    public let heading: String
    public let rows: [Row]
    /** A layover, after a leg that is not the last. */
    public let note: String?
  }

  /** The open flight's key: the card's row and the offer's place in it (the window keys on the message's words). */
  public static func key(row: String, index: Int) -> String { "\(row):\(index)" }

  /** "SFO → MSP": the offer's ends, else its first and last legs'. */
  public static func name(_ offer: FlightOffer) -> String {
    let from = offer.from.isEmpty ? offer.legs.first?.from ?? "" : offer.from
    let to = offer.to.isEmpty ? offer.legs.last?.to ?? "" : offer.to
    return "\(from) \u{2192} \(to)"
  }

  /** "Thu, Oct 16 · 7h 55m · 1 stop": the date, the time and the stops' first part. */
  public static func title(_ offer: FlightOffer) -> String {
    let stops = offer.stops.components(separatedBy: " · ").first ?? ""
    return [offer.date, offer.duration, stops].filter { !$0.isEmpty }.joined(separator: " · ")
  }

  /** Price, a section per leg, Fare; each only with something in it. */
  public static func sections(_ offer: FlightOffer) -> [Section] {
    func rows(_ list: [(String, String, String?)]) -> [Row] {
      list.filter { !$0.1.isEmpty }.map { Row(label: $0.0, value: $0.1, sub: ($0.2 ?? "").isEmpty ? nil : $0.2) }
    }
    func joined(_ parts: [String]) -> String { parts.filter { !$0.isEmpty }.joined(separator: " · ") }
    var out: [Section] = []
    if !offer.price.isEmpty {
      out.append(Section(heading: "Price", rows: rows([("Total", offer.price, offer.priceNote)]), note: nil))
    }
    for (index, leg) in offer.legs.enumerated() {
      let carrier = !leg.carrier.isEmpty && leg.carrier != offer.airline ? leg.carrier : ""
      let last = index == offer.legs.count - 1
      var note: String?
      if !last && !leg.layover.isEmpty {
        if let range = leg.layover.range(of: " in ") { note = leg.layover.replacingCharacters(in: range, with: " layover in ") } else { note = leg.layover }
      }
      out.append(Section(heading: joined([leg.heading, "\(leg.from) \u{2192} \(leg.to)"]), rows: rows([
        ("Departs", joined([leg.departDay, leg.depart]), nil),
        ("Arrives", joined([leg.arriveDay, leg.arrive]), nil),
        ("Flight", joined([leg.flight, carrier]), nil),
        ("Cabin", leg.cabin, nil),
        ("Time in the air", leg.duration, nil),
      ]), note: note))
    }
    if !offer.refundable.isEmpty || !offer.changeable.isEmpty || !offer.bags.isEmpty {
      out.append(Section(heading: "Fare", rows: rows([("Cancellation", offer.refundable, nil), ("Changes", offer.changeable, nil), ("Bags", offer.bags, nil)]), note: nil))
    }
    return out
  }
}
