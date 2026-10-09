import Foundation

/**
 * Find in the chat (⌘F, the window's `find-in-chat-controller.ts`): every
 * time what is typed appears, oldest first, so Next goes down the chat and
 * Previous up it, round at either end. It reads what the window reads: a
 * message's words, a question's prompt, an email draft's subject and body,
 * a Slack draft's body, a notice's line. Case and accents do not count
 * ("resume" finds "Résumé").
 */
public enum ChatFind {
  /** One time the words appear: in which row, and which time in it (0 for the first). */
  public struct Match: Hashable, Sendable {
    public let rowId: String
    public let occurrence: Int

    public init(rowId: String, occurrence: Int) { self.rowId = rowId; self.occurrence = occurrence }
  }

  public static func matches(_ query: String, in rows: [ChatRow]) -> [Match] {
    guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
    let needle = fold(query)
    var out: [Match] = []
    for row in rows {
      guard let text = text(of: row) else { continue }
      let haystack = fold(text)
      var from = haystack.startIndex
      var occurrence = 0
      while from < haystack.endIndex, let found = haystack.range(of: needle, range: from..<haystack.endIndex) {
        out.append(Match(rowId: row.id, occurrence: occurrence))
        occurrence += 1
        from = found.upperBound
      }
    }
    return out
  }

  /** The words of a row that find it, as the window's `searchableText`. */
  static func text(of row: ChatRow) -> String? {
    switch row {
    case .bubble(let bubble): return bubble.text
    case .question(_, let card): return card.prompt
    case .draft(_, let card): return card.kind == .email ? card.subject + "\n" + card.body : card.body
    case .notice(_, let text): return text
    default: return nil
    }
  }

  static func fold(_ text: String) -> String {
    text.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
  }

  /** Where find starts: the newest match, since a chat is read from its end. */
  public static func first(_ matches: [Match]) -> Match? { matches.last }

  /** The next match from `current` (`step` +1 down, -1 up), round from the end to the start as Safari's find goes. */
  public static func next(_ matches: [Match], from current: Match?, step: Int) -> Match? {
    guard !matches.isEmpty else { return nil }
    guard let current, let index = matches.firstIndex(of: current) else { return step < 0 ? matches.last : matches.first }
    return matches[(index + step + matches.count) % matches.count]
  }

  /** "3 of 12" for the bar: the place of `current` among the matches, from 1; 0 when none is chosen. */
  public static func ordinal(_ matches: [Match], _ current: Match?) -> Int {
    guard let current, let index = matches.firstIndex(of: current) else { return 0 }
    return index + 1
  }
}
