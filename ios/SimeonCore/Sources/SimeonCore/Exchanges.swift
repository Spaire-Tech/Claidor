import Foundation

/**
 * One line of the page two agents' messages open on (the founder, 9 October
 * 2026, with a screenshot as the reference: "when an agent message many at
 * the same time, its not all in one chat. its each by each"): a time stamp,
 * or a message with who sent it, and whether it starts or ends that
 * sender's run (the name goes over the first, the avatar beside the last).
 */
public enum ExchangeRow: Hashable, Sendable, Identifiable {
  case stamp(id: String, date: Date)
  case message(id: String, sender: Party, text: String, first: Bool, last: Bool)

  public var id: String {
    switch self {
    case .stamp(let id, _), .message(let id, _, _, _, _): return id
    }
  }
}

extension Chat {
  /** An exchange line's agents in the order its menu lists them: by name. */
  public static func menuOrder(_ peers: [Party]) -> [Party] {
    peers.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  /**
   * Everything `agent` and the peer said to each other in the agent's chat,
   * oldest first: what the agent sent the peer (`toAgent`) and what the
   * peer sent back (`fromAgent`), whichever line of the chat folded it. A
   * call's lines (written before calls were one line) are not messages
   * between them. A stamp goes where the chat would put one: the first
   * message, then after a quarter of an hour or on a new day.
   */
  public static func exchangeRows(_ entries: [Entry], agent: Party, peerId: String) -> [ExchangeRow] {
    let said = entries.filter { entry in
      entry.kind == "message" && entry.teammate?.id == peerId && entry.teammate?.earlierCall == nil
    }
    var rows: [ExchangeRow] = []
    var lastShown: Date?
    var previousSender: String?
    for entry in said {
      let sender = entry.toAgent != nil ? agent : (entry.fromAgent ?? Party(id: peerId, name: ""))
      var stamped = false
      if let date = entry.date, lastShown == nil || abs(date.timeIntervalSince(lastShown!)) >= stampGap || !Calendar.current.isDate(date, inSameDayAs: lastShown!) {
        rows.append(.stamp(id: "stamp-\(entry.id)", date: date))
        lastShown = date
        stamped = true
      } else if let date = entry.date {
        lastShown = date
      }
      let first = stamped || previousSender != sender.id
      // The run before ends where this one starts.
      if first, let index = rows.lastIndex(where: { if case .message = $0 { return true }; return false }),
         case .message(let id, let before, let text, let wasFirst, _) = rows[index] {
        rows[index] = .message(id: id, sender: before, text: text, first: wasFirst, last: true)
      }
      rows.append(.message(id: entry.id, sender: sender, text: entry.content ?? "", first: first, last: false))
      previousSender = sender.id
    }
    if let index = rows.lastIndex(where: { if case .message = $0 { return true }; return false }),
       case .message(let id, let sender, let text, let first, _) = rows[index] {
      rows[index] = .message(id: id, sender: sender, text: text, first: first, last: true)
    }
    return rows
  }
}
