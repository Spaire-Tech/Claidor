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
    return exchangeRows(said: said.map { entry in
      Said(id: entry.id, sender: entry.toAgent != nil ? agent : (entry.fromAgent ?? Party(id: peerId, name: "")), text: entry.content ?? "", date: entry.date)
    })
  }

  /**
   * A cloud agent's conversation on the same page (13 November 2026): what
   * `agent` asked it on the agent's side, what it said along the way and
   * its answers on the cloud agent's, oldest first, stamped as the chat
   * would be. A line the server gave no time takes none.
   */
  public static func cloudAgentRows(_ lines: [CloudAgentLine], agent: Party, cloudAgent: Party) -> [ExchangeRow] {
    exchangeRows(said: lines.map { line in
      Said(id: line.id, sender: line.role == .prompt ? agent : cloudAgent, text: line.text, date: line.date)
    })
  }

  /** One thing said on an exchange page: who said it, and when if known. */
  struct Said {
    let id: String
    let sender: Party
    let text: String
    let date: Date?
  }

  static func exchangeRows(said: [Said]) -> [ExchangeRow] {
    var rows: [ExchangeRow] = []
    var lastShown: Date?
    var previousSender: String?
    for line in said {
      let sender = line.sender
      var stamped = false
      if let date = line.date, lastShown == nil || abs(date.timeIntervalSince(lastShown!)) >= stampGap || !Calendar.current.isDate(date, inSameDayAs: lastShown!) {
        rows.append(.stamp(id: "stamp-\(line.id)", date: date))
        lastShown = date
        stamped = true
      } else if let date = line.date {
        lastShown = date
      }
      let first = stamped || previousSender != sender.id
      // The run before ends where this one starts.
      if first, let index = rows.lastIndex(where: { if case .message = $0 { return true }; return false }),
         case .message(let id, let before, let text, let wasFirst, _) = rows[index] {
        rows[index] = .message(id: id, sender: before, text: text, first: wasFirst, last: true)
      }
      rows.append(.message(id: line.id, sender: sender, text: line.text, first: first, last: false))
      previousSender = sender.id
    }
    if let index = rows.lastIndex(where: { if case .message = $0 { return true }; return false }),
       case .message(let id, let sender, let text, let first, _) = rows[index] {
      rows[index] = .message(id: id, sender: sender, text: text, first: first, last: true)
    }
    return rows
  }
}
