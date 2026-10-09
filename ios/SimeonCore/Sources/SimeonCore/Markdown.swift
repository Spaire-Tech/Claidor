import Foundation

/**
 * An agent's message as blocks, the way the Mac's window lays it out
 * (react-markdown with GitHub's extensions, bundle `const kPn=`): headings,
 * paragraphs, lists (bullets, numbers, tasks, nested), quotes, fenced code,
 * tables, rules and maths (`$$` on its own lines, or a ```` ```math ````
 * fence). The text inside a block stays Markdown; the app draws its bold,
 * italics, code, links, strikethrough and `$$…$$` maths within a line.
 */
public indirect enum MarkdownBlock: Hashable, Sendable {
  case paragraph(String)
  case heading(level: Int, text: String)
  case list(ordered: Bool, start: Int, items: [MarkdownListItem])
  case quote([MarkdownBlock])
  case code(language: String?, text: String)
  case table(header: [String], alignments: [MarkdownAlignment], rows: [[String]])
  case rule
  /** TeX on its own lines: between `$$` lines, or a ```` ```math ```` fence (remark-math's display maths). */
  case math(String)
}

public struct MarkdownListItem: Hashable, Sendable {
  /** A task list's box: checked, unchecked, or none. */
  public let checked: Bool?
  public let blocks: [MarkdownBlock]
}

public enum MarkdownAlignment: Hashable, Sendable { case leading, center, trailing }

public enum Markdown {
  /** A message's blocks, parsed once: a bubble asks again on every redraw. */
  public static func cachedBlocks(_ text: String) -> [MarkdownBlock] {
    if let hit = cache.withLock({ $0[text] }) { return hit }
    let parsed = blocks(text)
    cache.withLock { store in
      if store.count > 600 { store.removeAll(keepingCapacity: true) }
      store[text] = parsed
    }
    return parsed
  }

  private static let cache = LockedBox<[String: [MarkdownBlock]]>([:])

  public static func blocks(_ text: String) -> [MarkdownBlock] {
    var parser = Parser(lines: text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n"))
    return parser.blocks(until: { _ in false })
  }

  /**
   * A paragraph with maths in it (`$$…$$` within a line, remark-math's
   * inline maths; a single `$` is a dollar), cut into its words and its
   * maths, in order; nil when it has none.
   */
  public static func inlineMath(_ text: String) -> [(math: Bool, text: String)]? {
    guard text.contains("$$") else { return nil }
    var parts: [(math: Bool, text: String)] = []
    var rest = Substring(text)
    while let open = rest.range(of: "$$") {
      let after = rest[open.upperBound...]
      guard let close = after.range(of: "$$") else { break }
      let tex = after[..<close.lowerBound]
      guard !tex.trimmingCharacters(in: .whitespaces).isEmpty else {
        parts.append((false, String(rest[..<close.upperBound])))
        rest = after[close.upperBound...]
        continue
      }
      if open.lowerBound > rest.startIndex { parts.append((false, String(rest[..<open.lowerBound]))) }
      parts.append((true, String(tex)))
      rest = after[close.upperBound...]
    }
    guard parts.contains(where: \.math) else { return nil }
    if !rest.isEmpty { parts.append((false, String(rest))) }
    return parts
  }

  /** Whether a message is exactly one fenced block of `language` (the flights card's rule), and its body. */
  public static func soleFence(_ text: String, language: String) -> String? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.hasPrefix("```\(language)"), trimmed.hasSuffix("```"), trimmed.count > language.count + 6 else { return nil }
    guard let firstBreak = trimmed.firstIndex(of: "\n") else { return nil }
    let header = trimmed[trimmed.index(trimmed.startIndex, offsetBy: 3)..<firstBreak]
    guard header.trimmingCharacters(in: .whitespaces) == language else { return nil }
    let body = trimmed[trimmed.index(after: firstBreak)..<trimmed.index(trimmed.endIndex, offsetBy: -3)]
    if body.contains("```") { return nil }
    return String(body).trimmingCharacters(in: .newlines)
  }

  struct Parser {
    let lines: [String]
    var index = 0

    init(lines: [String]) { self.lines = lines }

    mutating func blocks(until stop: (String) -> Bool) -> [MarkdownBlock] {
      var out: [MarkdownBlock] = []
      var paragraph: [String] = []
      func flush() {
        if !paragraph.isEmpty { out.append(.paragraph(paragraph.joined(separator: "\n"))); paragraph = [] }
      }
      while index < lines.count {
        let line = lines[index]
        if stop(line) { break }
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { flush(); index += 1; continue }
        if let fence = Self.fenceOpening(trimmed) {
          flush(); index += 1
          var body: [String] = []
          while index < lines.count, !lines[index].trimmingCharacters(in: .whitespaces).hasPrefix(fence.marker) { body.append(lines[index]); index += 1 }
          index += 1
          if fence.language?.lowercased() == "math" { out.append(.math(body.joined(separator: "\n"))) }
          else { out.append(.code(language: fence.language, text: body.joined(separator: "\n"))) }
          continue
        }
        // Display maths: "$$" alone on a line, up to the next line ending in "$$".
        if trimmed == "$$" {
          flush(); index += 1
          var body: [String] = []
          while index < lines.count {
            let t = lines[index].trimmingCharacters(in: .whitespaces)
            if t.hasSuffix("$$") { let head = String(t.dropLast(2)); if !head.isEmpty { body.append(head) }; index += 1; break }
            body.append(lines[index]); index += 1
          }
          out.append(.math(body.joined(separator: "\n")))
          continue
        }
        if let heading = Self.heading(trimmed) { flush(); out.append(heading); index += 1; continue }
        if Self.isRule(trimmed) { flush(); out.append(.rule); index += 1; continue }
        if trimmed.hasPrefix(">") {
          flush()
          var quoted: [String] = []
          while index < lines.count {
            let t = lines[index].trimmingCharacters(in: .whitespaces)
            guard t.hasPrefix(">") else { break }
            var rest = t.dropFirst()
            if rest.hasPrefix(" ") { rest = rest.dropFirst() }
            quoted.append(String(rest)); index += 1
          }
          var inner = Parser(lines: quoted)
          out.append(.quote(inner.blocks(until: { _ in false })))
          continue
        }
        if Self.listMarker(line) != nil { flush(); out.append(list()); continue }
        if index + 1 < lines.count, trimmed.contains("|"), let alignments = Self.tableDivider(lines[index + 1]) {
          flush(); out.append(table(alignments: alignments)); continue
        }
        paragraph.append(trimmed)
        index += 1
      }
      flush()
      return out
    }

    struct Marker { let indent: Int; let ordered: Bool; let number: Int; let contentStart: Int }

    static func listMarker(_ line: String) -> Marker? {
      let chars = Array(line)
      var i = 0
      while i < chars.count, chars[i] == " " { i += 1 }
      let indent = i
      guard i < chars.count else { return nil }
      if "-*+".contains(chars[i]), i + 1 < chars.count, chars[i + 1] == " " {
        return Marker(indent: indent, ordered: false, number: 1, contentStart: i + 2)
      }
      var digits = ""
      while i < chars.count, chars[i].isNumber, digits.count < 9 { digits.append(chars[i]); i += 1 }
      if !digits.isEmpty, i + 1 < chars.count, chars[i] == "." || chars[i] == ")", chars[i + 1] == " " {
        return Marker(indent: indent, ordered: true, number: Int(digits) ?? 1, contentStart: i + 2)
      }
      return nil
    }

    mutating func list() -> MarkdownBlock {
      let first = Self.listMarker(lines[index])!
      var items: [MarkdownListItem] = []
      while index < lines.count, let marker = Self.listMarker(lines[index]), marker.indent == first.indent, marker.ordered == first.ordered {
        var text = String(Array(lines[index])[marker.contentStart...])
        var checked: Bool?
        if text.hasPrefix("[ ] ") { checked = false; text = String(text.dropFirst(4)) }
        else if text.hasPrefix("[x] ") || text.hasPrefix("[X] ") { checked = true; text = String(text.dropFirst(4)) }
        index += 1
        var body = [text]
        // Continuation lines and nested lists: anything indented past the marker.
        while index < lines.count {
          let next = lines[index]
          let t = next.trimmingCharacters(in: .whitespaces)
          if t.isEmpty {
            if index + 1 < lines.count, Self.indentation(lines[index + 1]) > first.indent, !lines[index + 1].trimmingCharacters(in: .whitespaces).isEmpty { body.append(""); index += 1; continue }
            break
          }
          if let nested = Self.listMarker(next), nested.indent <= first.indent { _ = nested; break }
          if Self.indentation(next) > first.indent || (Self.listMarker(next) == nil && !Self.startsBlock(t)) {
            body.append(Self.indentation(next) > first.indent ? String(next.dropFirst(min(Self.indentation(next), marker.contentStart))) : t)
            index += 1
          } else { break }
        }
        var inner = Parser(lines: body)
        items.append(MarkdownListItem(checked: checked, blocks: inner.blocks(until: { _ in false })))
      }
      return .list(ordered: first.ordered, start: first.number, items: items)
    }

    mutating func table(alignments: [MarkdownAlignment]) -> MarkdownBlock {
      let header = Self.cells(lines[index])
      index += 2
      var rows: [[String]] = []
      while index < lines.count {
        let t = lines[index].trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, t.contains("|") else { break }
        var row = Self.cells(lines[index])
        if row.count < header.count { row += Array(repeating: "", count: header.count - row.count) }
        rows.append(Array(row.prefix(header.count)))
        index += 1
      }
      let aligned = alignments.count >= header.count ? Array(alignments.prefix(header.count)) : alignments + Array(repeating: .leading, count: header.count - alignments.count)
      return .table(header: header, alignments: aligned, rows: rows)
    }

    static func indentation(_ line: String) -> Int { line.prefix { $0 == " " }.count }

    static func startsBlock(_ trimmed: String) -> Bool {
      fenceOpening(trimmed) != nil || heading(trimmed) != nil || isRule(trimmed) || trimmed.hasPrefix(">")
    }

    static func fenceOpening(_ trimmed: String) -> (marker: String, language: String?)? {
      for marker in ["```", "~~~"] where trimmed.hasPrefix(marker) {
        let language = trimmed.dropFirst(3).trimmingCharacters(in: .whitespaces)
        return (marker, language.isEmpty ? nil : language)
      }
      return nil
    }

    static func heading(_ trimmed: String) -> MarkdownBlock? {
      let hashes = trimmed.prefix { $0 == "#" }.count
      guard (1...6).contains(hashes), trimmed.count > hashes, trimmed[trimmed.index(trimmed.startIndex, offsetBy: hashes)] == " " else { return nil }
      var text = String(trimmed.dropFirst(hashes + 1)).trimmingCharacters(in: .whitespaces)
      while text.hasSuffix("#") { text.removeLast() }
      return .heading(level: hashes, text: text.trimmingCharacters(in: .whitespaces))
    }

    static func isRule(_ trimmed: String) -> Bool {
      let compact = trimmed.replacingOccurrences(of: " ", with: "")
      guard compact.count >= 3, let first = compact.first, "-*_".contains(first) else { return false }
      return compact.allSatisfy { $0 == first }
    }

    static func tableDivider(_ line: String) -> [MarkdownAlignment]? {
      let t = line.trimmingCharacters(in: .whitespaces)
      guard t.contains("-"), t.contains("|") || t.hasPrefix(":") else { return nil }
      let cells = cells(t)
      guard !cells.isEmpty else { return nil }
      var out: [MarkdownAlignment] = []
      for cell in cells {
        let c = cell.trimmingCharacters(in: .whitespaces)
        guard !c.isEmpty, c.allSatisfy({ $0 == "-" || $0 == ":" }), c.contains("-") else { return nil }
        out.append(c.hasPrefix(":") && c.hasSuffix(":") ? .center : c.hasSuffix(":") ? .trailing : .leading)
      }
      return out
    }

    static func cells(_ line: String) -> [String] {
      var t = line.trimmingCharacters(in: .whitespaces)
      if t.hasPrefix("|") { t.removeFirst() }
      if t.hasSuffix("|") && !t.hasSuffix("\\|") { t.removeLast() }
      var cells: [String] = []
      var current = ""
      var escaped = false
      for ch in t {
        if escaped { current.append(ch); escaped = false; continue }
        if ch == "\\" { escaped = true; continue }
        if ch == "|" { cells.append(current.trimmingCharacters(in: .whitespaces)); current = ""; continue }
        current.append(ch)
      }
      cells.append(current.trimmingCharacters(in: .whitespaces))
      return cells
    }
  }
}

/**
 * Names in a message, as the Mac finds them (router-renderer-patch.mjs,
 * `__simeonAppMentions` and `__simeonAgentMentions`): case-sensitive, the
 * longest spelling first, not glued to a word, an @, a slash, a dot or a
 * dash before it, nor a word or a dash after it.
 */
public enum Mentions {
  /** The name being typed after an "@" at the end of the draft ("" just after the "@"), or nil when none is (the Mac's composer opens its list on "@"). */
  public static func query(_ draft: String) -> String? {
    guard let at = draft.lastIndex(of: "@") else { return nil }
    if at > draft.startIndex, !draft[draft.index(before: at)].isWhitespace { return nil }
    let typed = draft[draft.index(after: at)...]
    guard typed.count <= 30, typed.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }) else { return nil }
    return String(typed)
  }

  /** The draft with the "@…" being typed replaced by the chosen name and a space. */
  public static func inserting(_ name: String, into draft: String) -> String {
    guard query(draft) != nil, let at = draft.lastIndex(of: "@") else { return draft + "@\(name) " }
    return String(draft[..<at]) + "@\(name) "
  }

  public enum Kind: Hashable, Sendable {
    case brand(BrandMention)
    /** An agent: its id and palette. */
    case agent(id: String, colour: String)
  }

  public struct Match: Hashable, Sendable {
    /** UTF-16 offsets in the searched text. */
    public let location: Int
    public let length: Int
    public let kind: Kind
  }

  public struct AgentName: Sendable, Hashable {
    public let name: String
    public let id: String
    public let colour: String
    public init(name: String, id: String, colour: String) { self.name = name; self.id = id; self.colour = colour }
  }

  static let brandPattern: NSRegularExpression = pattern(Brands.mentions.map(\.name))
  static let brandByName: [String: BrandMention] = Dictionary(Brands.mentions.map { ($0.name, $0) }, uniquingKeysWith: { first, _ in first })

  /** The names' pattern, built once per set of names: a streaming answer asks for it on every paragraph, every 90 ms. */
  static func agentPattern(_ names: [String]) -> NSRegularExpression {
    let key = names.sorted().joined(separator: "\u{1}")
    if let made = agentPatterns.withLock({ $0[key] }) { return made }
    let made = pattern(names)
    agentPatterns.withLock { store in
      if store.count > 32 { store.removeAll() }
      store[key] = made
    }
    return made
  }

  private static let agentPatterns = LockedBox<[String: NSRegularExpression]>([:])

  static func pattern(_ names: [String]) -> NSRegularExpression {
    let escaped = names.sorted { $0.count > $1.count }.map(NSRegularExpression.escapedPattern(for:))
    return try! NSRegularExpression(pattern: "(?<![\\w@/.-])(?:\(escaped.joined(separator: "|")))(?![\\w-])")
  }

  /** Brand names, then agent names in what is left (the Mac runs the brand step first). Agents: every one at least two letters long, but never the person's own name. */
  public static func find(in text: String, agents: [AgentName], personName: String? = nil) -> [Match] {
    let ns = text as NSString
    let whole = NSRange(location: 0, length: ns.length)
    var matches: [Match] = []
    for result in brandPattern.matches(in: text, range: whole) {
      if let brand = brandByName[ns.substring(with: result.range)] { matches.append(Match(location: result.range.location, length: result.range.length, kind: .brand(brand))) }
    }
    let person = personName?.trimmingCharacters(in: .whitespaces).lowercased()
    let named = agents.filter { $0.name.trimmingCharacters(in: .whitespaces).count >= 2 && $0.name.lowercased() != person }
    if !named.isEmpty {
      var byName: [String: AgentName] = [:]
      for agent in named where byName[agent.name] == nil { byName[agent.name] = agent }
      let agentPattern = agentPattern(Array(byName.keys))
      for result in agentPattern.matches(in: text, range: whole) {
        let overlaps = matches.contains { NSIntersectionRange(NSRange(location: $0.location, length: $0.length), result.range).length > 0 }
        if overlaps { continue }
        if let agent = byName[ns.substring(with: result.range)] { matches.append(Match(location: result.range.location, length: result.range.length, kind: .agent(id: agent.id, colour: agent.colour))) }
      }
    }
    return matches.sorted { $0.location < $1.location }
  }
}

/** A value behind a lock, for caches read from any thread. */
final class LockedBox<Value>: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Value
  init(_ value: Value) { self.value = value }
  func withLock<T>(_ body: (inout Value) -> T) -> T { lock.lock(); defer { lock.unlock() }; return body(&value) }
}
