import Foundation

/**
 * Find in the chat (⌘F), as the window's find does it (`f_n`, `d_n`,
 * `h_n`): every time what is typed appears in the lines on screen, oldest
 * first, matched without regard to capitals. It reads a message's words
 * (not agents talking to each other), a card's text, a question's prompt,
 * an email draft's subject and body, a Slack draft's body, and a notice.
 * It starts at the newest match; Next goes down and Previous up, round at
 * either end. The bar counts "3/12".
 */
public enum ChatFind {
  /** One time the words appear: in which line (its row has the line's id), and which time in it (0 for the first). */
  public struct Match: Hashable, Sendable {
    public let rowId: String
    public let occurrence: Int

    public init(rowId: String, occurrence: Int) { self.rowId = rowId; self.occurrence = occurrence }
  }

  public static func matches(_ query: String, in entries: [Entry]) -> [Match] {
    guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
    let needle = query.lowercased()
    var out: [Match] = []
    for entry in entries {
      let haystack = text(of: entry).lowercased()
      guard haystack.count >= needle.count else { continue }
      var from = haystack.startIndex
      var occurrence = 0
      while from < haystack.endIndex, let found = haystack.range(of: needle, options: .literal, range: from..<haystack.endIndex) {
        out.append(Match(rowId: entry.id, occurrence: occurrence))
        occurrence += 1
        from = found.upperBound
      }
    }
    return out
  }

  /** The words of a line that find reads (the window's `d_n`). */
  static func text(of entry: Entry) -> String {
    switch entry.kind {
    case "message":
      return entry.teammate == nil ? entry.content ?? "" : ""
    case "send-message":
      guard let message = entry.message else { return "" }
      switch message["type"]?.string {
      case "text": return message["content"]?.string ?? ""
      case "widget": return message["widget"]?["prompt"]?.string ?? ""
      case "email-draft": return (message["draft"]?["subject"]?.string ?? "") + "\n" + (message["draft"]?["body"]?.string ?? "")
      case "slack-draft": return message["draft"]?["body"]?.string ?? ""
      default: return ""
      }
    case "notice":
      return entry["text"]?.string ?? ""
    default:
      return ""
    }
  }

  /** Where find stands when the words change: the newest match (the window's `h_n` with nothing chosen). */
  public static func first(_ matches: [Match]) -> Match? { matches.last }

  /** The next match from `current` (`step` +1 down, -1 up), round at either end (the window's `p_n`). */
  public static func next(_ matches: [Match], from current: Match?, step: Int) -> Match? {
    guard !matches.isEmpty else { return nil }
    let index = current.flatMap { matches.firstIndex(of: $0) } ?? matches.count - 1
    return matches[((index + step) % matches.count + matches.count) % matches.count]
  }

  /** The bar's "3/12": the place of `current` among the matches, from 1; 0 when there is none. */
  public static func ordinal(_ matches: [Match], _ current: Match?) -> Int {
    guard let current, let index = matches.firstIndex(of: current) else { return 0 }
    return index + 1
  }
}
