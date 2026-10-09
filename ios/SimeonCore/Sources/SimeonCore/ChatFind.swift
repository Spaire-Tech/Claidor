import Foundation

/**
 * Find in the chat (⌘F, the window's `find-in-chat.tsx`): the rows whose
 * words hold what is typed, oldest first, so Next goes down the chat and
 * Previous up it. Case and accents do not count ("resume" finds "Résumé").
 * It reads a message's text, a question's prompt and choices, a draft's
 * subject and body, a file's name and a notice's line.
 */
public enum ChatFind {
  public static func matches(_ query: String, in rows: [ChatRow]) -> [String] {
    let needle = fold(query.trimmingCharacters(in: .whitespacesAndNewlines))
    guard !needle.isEmpty else { return [] }
    return rows.compactMap { row in
      text(of: row).map(fold).contains { $0.contains(needle) } ? row.id : nil
    }
  }

  /** The words of a row that find it. */
  static func text(of row: ChatRow) -> [String] {
    switch row {
    case .bubble(let bubble): return [bubble.text]
    case .question(_, let card): return [card.prompt] + card.options.map(\.label)
    case .draft(_, let card): return [card.subject, card.body, card.target]
    case .file(_, let name, _, _): return [name]
    case .notice(_, let text): return [text]
    default: return []
    }
  }

  static func fold(_ text: String) -> String {
    text.folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
  }

  /** The next match from `current` (`step` +1 down, -1 up), round from the end to the start as Safari's find goes. */
  public static func next(_ matches: [String], from current: String?, step: Int) -> String? {
    guard !matches.isEmpty else { return nil }
    guard let current, let index = matches.firstIndex(of: current) else { return step < 0 ? matches.last : matches.first }
    return matches[(index + step + matches.count) % matches.count]
  }
}
