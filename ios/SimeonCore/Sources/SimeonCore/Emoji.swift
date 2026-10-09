import Foundation

/**
 * Every emoji the system draws, for "More Emoji" (a reaction that is not in
 * the window's six) and for ":" in the composer: each with its Unicode name
 * ("thumbs up sign") and the short names people type (":tada:", ":+1:").
 * Read from Unicode's own properties, so nothing ships with the app and the
 * list grows with the system's Unicode; in the blocks' order, faces first,
 * as an emoji keyboard starts.
 */
public struct Emoji: Hashable, Sendable {
  public let character: String
  /** Unicode's name, lowercased ("face with tears of joy"). */
  public let name: String
  /** What `:` finds it by besides its name ("joy", "tada"). */
  public let aliases: [String]
}

public enum EmojiCatalog {
  /** The blocks in the order shown: faces, people and gestures, nature, food, places, objects, symbols. */
  static let blocks: [ClosedRange<UInt32>] = [
    0x1F600...0x1F64F, 0x1F910...0x1F9FF, 0x1F466...0x1F4FF, 0x1F300...0x1F465, 0x1F680...0x1F6FF,
    0x1FA70...0x1FAFF, 0x2600...0x27BF, 0x1F500...0x1F5FF, 0x2190...0x21FF, 0x2B00...0x2BFF, 0x1F1E6...0x1F1FF,
  ]

  /** The short names people type after ":" (Slack's and GitHub's), for the emoji whose Unicode name says something else. */
  static let shortNames: [String: [String]] = [
    "👍": ["+1", "thumbsup"], "👎": ["-1", "thumbsdown"], "❤️": ["heart", "love"], "😂": ["joy", "lol"], "🎉": ["tada", "party"],
    "😮": ["open_mouth", "wow"], "🔥": ["fire", "lit"], "👀": ["eyes"], "🙏": ["pray", "thanks"], "😢": ["cry", "sad"],
    "💯": ["100"], "🚀": ["rocket", "ship"], "👏": ["clap"], "✨": ["sparkles"], "🤔": ["thinking"], "👋": ["wave"],
    "👌": ["ok_hand", "ok"], "✅": ["white_check_mark", "check", "done"], "❌": ["x", "no"], "😊": ["blush"], "😍": ["heart_eyes"],
    "🙌": ["raised_hands"], "💪": ["muscle"], "🤝": ["handshake"], "😅": ["sweat_smile"], "😎": ["sunglasses", "cool"],
    "🙂": ["slightly_smiling_face", "smile"], "😄": ["smile", "happy"], "😉": ["wink"], "🤯": ["exploding_head", "mind_blown"],
    "⚠️": ["warning"], "📌": ["pushpin", "pin"], "📎": ["paperclip"], "💡": ["bulb", "idea"], "⏰": ["alarm_clock"], "☕": ["coffee"],
  ]

  /** The whole list, made once. */
  public static let all: [Emoji] = {
    var seen = Set<UInt32>()
    var out: [Emoji] = []
    for block in blocks {
      for value in block {
        guard !seen.contains(value), let scalar = Unicode.Scalar(value), let emoji = make(scalar) else { continue }
        seen.insert(value)
        out.append(emoji)
      }
    }
    return out
  }()

  /** A scalar as an emoji: shown as one by default, or made one with the emoji variation selector (❤ → ❤️). Flags' single letters are left out. */
  static func make(_ scalar: Unicode.Scalar) -> Emoji? {
    let properties = scalar.properties
    guard properties.isEmoji, let name = properties.name, !(0x1F1E6...0x1F1FF).contains(scalar.value) else { return nil }
    let character = properties.isEmojiPresentation ? String(scalar) : String(scalar) + "\u{FE0F}"
    return Emoji(character: character, name: name.lowercased(), aliases: shortNames[character] ?? [])
  }

  /**
   * What matches `query`: a short name that starts with it first (":tad" →
   * 🎉), then names with a word that starts with it, each in the list's
   * order. Empty asks for the start of the list.
   */
  public static func search(_ query: String, limit: Int = 60) -> [Emoji] {
    let words = query.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ": ")).split(separator: " ").map(String.init)
    guard !words.isEmpty else { return Array(all.prefix(limit)) }
    let byAlias = all.filter { emoji in emoji.aliases.contains { alias in alias.hasPrefix(words.joined(separator: "_")) } }
    let byName = all.filter { emoji in
      let nameWords = emoji.name.split(whereSeparator: { $0 == " " || $0 == "-" })
      return words.allSatisfy { word in nameWords.contains { $0.hasPrefix(word) } }
    }
    var out: [Emoji] = []
    var taken = Set<String>()
    for emoji in byAlias + byName where taken.insert(emoji.character).inserted {
      out.append(emoji)
      if out.count == limit { break }
    }
    return out
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

  /** What ":" offers for `query`: the ones picked lately that match it first, then the rest, twelve at most (the window's list). */
  public static func suggestions(_ query: String, recent: [String], limit: Int = 12) -> [Emoji] {
    let found = search(query, limit: 200)
    let picked = recent.compactMap { character in found.first { $0.character == character } }
    var out = picked
    var taken = Set(picked.map(\.character))
    for emoji in found where out.count < limit && taken.insert(emoji.character).inserted { out.append(emoji) }
    return Array(out.prefix(limit))
  }

  /** The emoji picked lately, newest first, after `emoji` is picked: at most 24. */
  public static func remembering(_ emoji: String, in recent: [String]) -> [String] {
    Array(([emoji] + recent.filter { $0 != emoji }).prefix(24))
  }

  /** The draft with its ":query" at the end swapped for the emoji and a space. */
  public static func inserting(_ emoji: String, into draft: String) -> String {
    guard let colon = draft.lastIndex(of: ":") else { return draft + emoji + " " }
    return String(draft[..<colon]) + emoji + " "
  }
}
