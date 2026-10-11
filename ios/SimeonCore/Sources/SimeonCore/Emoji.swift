import Foundation

/**
 * The emoji the Mac's window offers, after ":" in the composer and in "More
 * emoji" on a message: its own list (emojibase's data and shortcodes, MIT,
 * copied from the window by `ios/scripts/make-emoji.mjs` into
 * `Resources/emoji.json`), in its groups and order, each emoji and its skin
 * tones, matched as the window matches them (its `lft`).
 */
public struct Emoji: Hashable, Sendable, Identifiable {
  /** Its first shortcode ("tada", "+1"), else its code: what ":" shows (":tada:") and the recents keep. */
  public let id: String
  /** Its name, capitalised ("Party popper"). */
  public let name: String
  public let character: String
  public let shortcodes: [String]
  /** The words search reads: name, id, shortcodes, tags and emoticons, lowercased. */
  let search: String
}

/** One of the window's groups ("Smileys & emotion", "People & body"…). */
public struct EmojiCategory: Hashable, Sendable, Identifiable {
  public let id: String
  public let label: String
  public let emojis: [Emoji]
}

public enum EmojiCatalog {
  /** The window's groups, in its order (the "components" group left out, as the window does). */
  public static let categories: [EmojiCategory] = load()

  /** Every emoji, in the groups' order. */
  public static let all: [Emoji] = categories.flatMap(\.emojis)

  static func load() -> [EmojiCategory] {
    guard let url = Bundle.module.url(forResource: "emoji", withExtension: "json"),
          let data = try? Data(contentsOf: url),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let groups = root["categories"] as? [[String: Any]] else { return [] }
    return groups.compactMap { group in
      guard let id = group["id"] as? String, let label = group["label"] as? String, let rows = group["emojis"] as? [[Any]] else { return nil }
      let emojis = rows.compactMap { row -> Emoji? in
        guard row.count == 5, let id = row[0] as? String, let name = row[1] as? String, let character = row[2] as? String,
              let codes = row[3] as? [String], let search = row[4] as? String else { return nil }
        return Emoji(id: id, name: name, character: character, shortcodes: codes, search: search)
      }
      return EmojiCategory(id: id, label: label, emojis: emojis)
    }
  }

  /**
   * The emoji `query` finds, as the window's `lft`: every one whose words
   * hold it; first those whose id or a shortcode starts with it, or whose
   * name starts with it or has a word that does; each group in the order
   * of `recent` (ids, newest first), then the list's; at most `limit`.
   * Nothing typed gives the list from its start.
   */
  public static func search(_ query: String, limit: Int = 96, recent: [String] = []) -> [Emoji] {
    let wanted = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    var first: [Emoji] = []
    var second: [Emoji] = []
    for emoji in all {
      if wanted.isEmpty { first.append(emoji); continue }
      guard emoji.search.contains(wanted) else { continue }
      let name = emoji.name.lowercased()
      if emoji.id.hasPrefix(wanted) || emoji.shortcodes.contains(where: { $0.hasPrefix(wanted) }) || name.hasPrefix(wanted) || name.contains(" " + wanted) {
        first.append(emoji)
      } else {
        second.append(emoji)
      }
    }
    var rank: [String: Int] = [:]
    for (index, id) in recent.enumerated() where rank[id] == nil { rank[id] = index }
    func ordered(_ list: [Emoji]) -> [Emoji] {
      guard !rank.isEmpty else { return list }
      return list.enumerated().sorted { a, b in
        let ra = rank[a.element.id] ?? .max, rb = rank[b.element.id] ?? .max
        return ra != rb ? ra < rb : a.offset < b.offset
      }.map(\.element)
    }
    return Array((ordered(first) + ordered(second)).prefix(limit))
  }

  /** What ":" offers for `query`: twelve at most, the ones picked lately first (the window's list). */
  public static func suggestions(_ query: String, recent: [String]) -> [Emoji] {
    search(query, limit: 12, recent: recent)
  }

  /** The ids picked lately from ":", newest first, after `id` is picked: at most 50 (the window's `emojiRecents`). */
  public static func remembering(_ id: String, in recent: [String]) -> [String] {
    Array(([id] + recent.filter { $0 != id }).prefix(50))
  }

  /**
   * The ":" being typed at the end of a draft, as the window's composer
   * reads it (`(^|[^\p{L}\p{N}_:/])(:([a-z0-9_+-]{0,50}))$`): a colon at the
   * start or after anything but a letter, a digit, "_", ":" or "/" (so not
   * in "10:30" or "https://"), then two to fifty of a–z, 0–9, "_", "+" or
   * "-", and nothing after.
   */
  public static func query(_ draft: String) -> String? {
    guard let colon = draft.lastIndex(of: ":") else { return nil }
    if colon > draft.startIndex {
      let before = draft[draft.index(before: colon)]
      guard !(before.isLetter || before.isNumber || before == "_" || before == ":" || before == "/") else { return nil }
    }
    let typed = draft[draft.index(after: colon)...]
    guard (2...50).contains(typed.count), typed.allSatisfy({ ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "_" || $0 == "+" || $0 == "-" }) else { return nil }
    return String(typed)
  }

  /** The draft with its ":query" at the end swapped for the emoji and a space. */
  public static func inserting(_ emoji: String, into draft: String) -> String {
    guard let colon = draft.lastIndex(of: ":") else { return draft + emoji + " " }
    return String(draft[..<colon]) + emoji + " "
  }
}
