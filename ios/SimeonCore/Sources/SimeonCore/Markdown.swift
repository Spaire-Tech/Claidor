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
   * A paragraph with maths in it, cut into its words and its maths, in
   * order (the window's remark-math): `$$…$$` (the closing run of `$` as
   * long as the opening one; a single `$` is a dollar), `\(…\)`, and
   * `\[…\]` within a line; nil when it has none. A space on both sides
   * of the maths is padding and left out.
   */
  public static func inlineMath(_ text: String) -> [(math: Bool, text: String)]? {
    guard text.contains("$$") || text.contains("\\(") || text.contains("\\[") else { return nil }
    let chars = Array(text)
    var parts: [(math: Bool, text: String)] = []
    var plain = ""
    var index = 0
    func flushPlain() { if !plain.isEmpty { parts.append((false, plain)); plain = "" } }
    while index < chars.count {
      let previous: Character? = index > 0 ? chars[index - 1] : nil
      if chars[index] == "$", previous != "$" {
        var run = 0
        while index + run < chars.count, chars[index + run] == "$" { run += 1 }
        if run >= 2, let close = closingDollars(chars, from: index + run, run: run) {
          flushPlain()
          parts.append((true, padded(String(chars[(index + run)..<close]))))
          index = close + run
          continue
        }
        plain += String(chars[index..<(index + run)])
        index += run
        continue
      }
      if chars[index] == "\\", previous != "\\", index + 1 < chars.count, chars[index + 1] == "(" || chars[index + 1] == "[" {
        let closer: Character = chars[index + 1] == "(" ? ")" : "]"
        var probe = index + 2
        var found: Int?
        while probe + 1 < chars.count {
          if chars[probe] == "\\" && chars[probe + 1] == closer { found = probe; break }
          probe += 1
        }
        if let found {
          flushPlain()
          parts.append((true, padded(String(chars[(index + 2)..<found]))))
          index = found + 2
          continue
        }
      }
      plain.append(chars[index])
      index += 1
    }
    flushPlain()
    return parts.contains(where: \.math) ? parts : nil
  }

  /** Where a run of exactly `run` dollars closes maths opened at `from`; runs of another length are part of it. */
  private static func closingDollars(_ chars: [Character], from start: Int, run: Int) -> Int? {
    var index = start
    while index < chars.count {
      if chars[index] == "$" {
        var length = 0
        while index + length < chars.count, chars[index + length] == "$" { length += 1 }
        if length == run { return index }
        index += length
      } else {
        index += 1
      }
    }
    return nil
  }

  /** remark-math's padding: a space or line break on both sides, around something, is left out. */
  private static func padded(_ tex: String) -> String {
    guard tex.count >= 2, let first = tex.first, let last = tex.last, first == " " || first == "\n", last == " " || last == "\n",
          !tex.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return tex }
    return String(tex.dropFirst().dropLast())
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

    /** The number of "$" opening a display block on this line: two or more, and no "$" after them (else it is a line's maths). */
    static func dollarFence(_ line: String) -> Int? {
      let run = line.prefix { $0 == "$" }.count
      guard run >= 2, !line.dropFirst(run).contains("$") else { return nil }
      return run
    }

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
        // Display maths (the window's remark-math): a line opening with two or more "$" and no other "$" after them, up to a
        // line of at least as many "$" alone (or the end); or "\[" opening a line, up to a line "\]" alone, or "\[ … \]" on one.
        if let fence = Self.dollarFence(trimmed) {
          flush(); index += 1
          var body: [String] = []
          while index < lines.count {
            let t = lines[index].trimmingCharacters(in: .whitespaces)
            if t.count >= fence, t.allSatisfy({ $0 == "$" }) { index += 1; break }
            body.append(lines[index]); index += 1
          }
          out.append(.math(body.joined(separator: "\n")))
          continue
        }
        if trimmed.hasPrefix("\\[") {
          let rest = trimmed.dropFirst(2)
          if rest.contains("\\]") {
            if rest.trimmingCharacters(in: .whitespaces).hasSuffix("\\]") {
              flush(); index += 1
              let inner = rest.trimmingCharacters(in: .whitespaces).dropLast(2)
              out.append(.math(inner.trimmingCharacters(in: .whitespaces)))
              continue
            }
          } else {
            flush(); index += 1
            var body: [String] = []
            let head = rest.trimmingCharacters(in: .whitespaces)
            if !head.isEmpty { body.append(head) }
            while index < lines.count {
              if lines[index].trimmingCharacters(in: .whitespaces) == "\\]" { index += 1; break }
              body.append(lines[index]); index += 1
            }
            out.append(.math(body.joined(separator: "\n")))
            continue
          }
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
  public enum Kind: Hashable, Sendable {
    case brand(BrandMention)
    /** An agent: its id (the apps draw its picture beside the name). */
    case agent(id: String)
  }

  public struct Match: Hashable, Sendable {
    /** UTF-16 offsets in the searched text. */
    public let location: Int
    public let length: Int
    public let kind: Kind
  }

  /** An agent a message can name, and its picture for the little circle before its name (the founder, 12 October 2026: a glass pill, the name in the app's blue). */
  public struct AgentName: Sendable, Hashable {
    public let name: String
    public let id: String
    public let picture: AgentPictureSource?
    public init(name: String, id: String, picture: AgentPictureSource? = nil) { self.name = name; self.id = id; self.picture = picture }
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

  /** Whether the word at `location` begins a sentence: nothing but spaces, quotes, brackets and list or emphasis marks since the text's start, a line break, or a full stop, question or exclamation mark, or colon ("1. Link your account" too). */
  static func startsSentence(_ text: NSString, at location: Int) -> Bool {
    let skipped = CharacterSet.whitespaces.union(CharacterSet(charactersIn: "*_\"'\u{201C}\u{2018}([>#-\u{2022}"))
    let ends = CharacterSet(charactersIn: ".!?:\u{2026}")
    var index = location - 1
    while index >= 0 {
      guard let scalar = Unicode.Scalar(text.character(at: index)) else { return false }
      if CharacterSet.newlines.contains(scalar) { return true }
      if !skipped.contains(scalar) { return ends.contains(scalar) }
      index -= 1
    }
    return true
  }

  static func pattern(_ names: [String]) -> NSRegularExpression {
    let escaped = names.sorted { $0.count > $1.count }.map(NSRegularExpression.escapedPattern(for:))
    return try! NSRegularExpression(pattern: "(?<![\\w@/.-])(?:\(escaped.joined(separator: "|")))(?![\\w-])")
  }

  /**
   * Brand names, then agent names in what is left (the Mac runs the brand
   * step first), each read in its sentence (the founder, 19 October 2026:
   * "yes we can Shop here" wore Shop's logo, "the Link is here" Link's, and
   * "my app name is Simeon" the agent Simeon's pill).
   *
   * An app whose name is an everyday word (`ordinaryWord`: Link, Shop,
   * Square, Close…) is marked only where the words around it make it the
   * app (`namesTheApp`); any other app is marked wherever it is written.
   * Agents: every one at least two letters long, but never the person's own
   * name, the speaker's own (`speaker`, an agent's id: its "I'm Simeon" or
   * the product it is named after), nor a name used as a thing's
   * (`namesAThing`: "the Simeon app", "an app called Simeon").
   *
   * `within` keeps only the names wholly inside that part of `text` (a run
   * of a Mac line), read in the whole line as the iPhone reads them.
   */
  public static func find(in text: String, within part: NSRange? = nil, agents: [AgentName], personName: String? = nil, speaker: String? = nil) -> [Match] {
    let ns = text as NSString
    let searched = NSRange(location: 0, length: ns.length)
    let found: [(range: NSRange, brand: BrandMention)] = brandPattern.matches(in: text, range: searched).compactMap { result in
      brandByName[ns.substring(with: result.range)].map { (result.range, $0) }
    }
    var matches: [Match] = []
    for (index, candidate) in found.enumerated() {
      if candidate.brand.ordinaryWord && !namesTheApp(ns, at: index, of: found.map(\.range)) { continue }
      matches.append(Match(location: candidate.range.location, length: candidate.range.length, kind: .brand(candidate.brand)))
    }
    let person = personName?.trimmingCharacters(in: .whitespaces).lowercased()
    let named = agents.filter { $0.name.trimmingCharacters(in: .whitespaces).count >= 2 && $0.name.lowercased() != person && $0.id != speaker }
    if !named.isEmpty {
      var byName: [String: AgentName] = [:]
      for agent in named where byName[agent.name] == nil { byName[agent.name] = agent }
      let agentPattern = agentPattern(Array(byName.keys))
      for result in agentPattern.matches(in: text, range: searched) {
        let overlaps = matches.contains { NSIntersectionRange(NSRange(location: $0.location, length: $0.length), result.range).length > 0 }
        if overlaps || namesAThing(ns, result.range) { continue }
        if let agent = byName[ns.substring(with: result.range)] { matches.append(Match(location: result.range.location, length: result.range.length, kind: .agent(id: agent.id))) }
      }
    }
    if let part { matches.removeAll { $0.location < part.location || $0.location + $0.length > NSMaxRange(part) } }
    return matches.sorted { $0.location < $1.location }
  }

  // MARK: Reading a name in its sentence

  /** Words after an everyday-word app's name that make it the app: "your Link wallet", "the Shop app", "Square payments", "Link's checkout". */
  static let appNouns: Set<String> = [
    "account", "accounts", "api", "app", "apps", "balance", "board", "boards", "card", "cards", "checkout", "connection", "connector", "connectors",
    "crm", "dashboard", "dashboards", "database", "extension", "inbox", "integration", "integrations", "login", "mcp", "order", "orders", "pay",
    "payment", "payments", "plugin", "profile", "project", "projects", "settings", "store", "subscription", "wallet", "wallets", "workspace", "workspaces",
  ]

  /** Words just before an everyday-word app's name that make it the app: "pay with Link", "open Shop", "saved in Box". Not a bare "to": "to Shop", "to Close" are verbs. */
  static let appCues: Set<String> = [
    "connect", "connected", "connecting", "connects", "from", "in", "inside", "into", "on", "onto", "open", "opened", "opening", "opens",
    "reconnect", "reconnected", "through", "use", "used", "uses", "using", "via", "with",
  ]

  /** The words before "to" that make "to" a cue: "signed in to Link", "connected to Square", "switch to Shop". */
  static let appCuesBeforeTo: Set<String> = ["back", "connect", "connected", "connecting", "in", "reconnect", "reconnected", "switch", "switched"]

  /** Words after which an everyday word is a verb, whatever follows: "we can Shop here", "let's Link them", "please Close it". */
  static let verbCues: Set<String> = [
    "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "don't", "i'd", "i'll", "let's", "may", "might", "must", "please",
    "shall", "should", "shouldn't", "to", "we'd", "we'll", "will", "won't", "would", "wouldn't", "you'd", "you'll",
  ]

  /** What joins names in a list ("Gmail, Link and Shop", "Square/Ramp", "Stripe Link"): an everyday word beside an app's name is that app too. */
  static let listJoins: Set<String> = ["", ",", "&", "/", "+", "and", "or", ", and", ", or"]

  /** Words before a name that make it a name being given, not an agent: "an app called Simeon", "my app name is Simeon", "known as Simeon". */
  static let namingWords: Set<String> = ["called", "dubbed", "named", "name's", "titled"]
  static let namingPairs: Set<String> = ["known as", "name is", "name was", "names are"]

  /** Words before a name that make it a thing's: "the Simeon app", "your Simeon account". No one writes "the Theo". */
  static let thingWords: Set<String> = ["a", "an", "its", "my", "our", "the", "their", "your"]

  /** The same for a place, but not before a possessive: "built in Simeon", yet "in Theo's chat" is the agent's. */
  static let placeWords: Set<String> = ["in", "inside", "into", "within"]

  /** What a name stands beside when it is a product or a company's ("the company Simeon", "my app, Simeon"). */
  static let productWords: Set<String> = ["app", "brand", "business", "company", "platform", "product", "startup", "website"]

  /** Words after a name that make it a product or a company's: "Simeon app", "Simeon Labs", "Simeon customer feedback". Never a verb an agent does ("let Theo plan it"). */
  static let productNouns: Set<String> = [
    "account", "accounts", "ai", "android", "app", "apps", "beta", "codebase", "customer", "customers", "dashboard", "desktop", "docs", "domain",
    "feedback", "homepage", "inc", "ios", "iphone", "labs", "landing", "logo", "mac", "marketing", "onboarding", "pricing", "product", "repo",
    "roadmap", "site", "subscription", "subscriptions", "user", "users", "waitlist", "web", "website",
  ]

  /** The same after "'s", less what an agent has of its own (its account, its feedback): "Simeon's website", "Simeon's onboarding". */
  static let productNounsAfterPossessive: Set<String> = [
    "android", "app", "apps", "codebase", "customers", "domain", "homepage", "ios", "iphone", "landing", "logo", "mac", "marketing", "onboarding",
    "pricing", "product", "repo", "roadmap", "site", "subscription", "subscriptions", "users", "waitlist", "website",
  ]

  /**
   * Whether the everyday-word app at `index` of the names found is the app
   * here: a cue before it ("pay with Link"), another app's name beside it
   * ("Gmail, Link and Shop") or an app's word after it ("your Shop
   * account"). Never as a verb ("we can Shop here"), nor as a word in a
   * title ("Payment Link"), nor as a sentence's first word ("Link your
   * account") unless it is in a list of apps.
   */
  static func namesTheApp(_ text: NSString, at index: Int, of found: [NSRange]) -> Bool {
    let range = found[index]
    func joined(_ from: Int, _ to: Int) -> Bool {
      guard from <= to else { return false }
      let between = text.substring(with: NSRange(location: from, length: to - from)).filter { !"*_~".contains($0) }
      return listJoins.contains(between.split(whereSeparator: { $0 == " " || $0 == "\t" }).joined(separator: " ").lowercased())
    }
    let listed = (index > 0 && joined(NSMaxRange(found[index - 1]), range.location)) || (index + 1 < found.count && joined(NSMaxRange(range), found[index + 1].location))
    if startsSentence(text, at: range.location) { return listed }
    let appWordAfter = word(after: NSMaxRange(range), in: text).map { appNouns.contains(key($0.word)) } == true
    guard let before = word(before: range.location, in: text) else { return listed || appWordAfter }
    let cue = key(before.word)
    if cue == "to", let earlier = word(before: before.location, in: text), appCuesBeforeTo.contains(key(earlier.word)) { return true }
    if appCues.contains(cue) { return true }
    if verbCues.contains(cue) { return false }
    // A word in a title: a capital before it that does not start the sentence and is not another app's name.
    if before.word.first?.isUppercase == true, !startsSentence(text, at: before.location), !found.contains(where: { NSLocationInRange(before.location, $0) }) { return false }
    return listed || appWordAfter
  }

  /** Whether the agent's name at `range` is used as a thing's or a name being given: "the Simeon app", "Simeon's website", "in Simeon", "an app called Simeon", "my app, Simeon". */
  static func namesAThing(_ text: NSString, _ range: NSRange) -> Bool {
    let after = word(after: NSMaxRange(range), in: text)
    if let after, (after.possessive ? productNounsAfterPossessive : productNouns).contains(key(after.word)) { return true }
    if let before = word(before: range.location, in: text) {
      let last = key(before.word)
      if thingWords.contains(last) || namingWords.contains(last) || productWords.contains(last) { return true }
      if placeWords.contains(last) && after?.possessive != true { return true }
      if let earlier = word(before: before.location, in: text), namingPairs.contains("\(key(earlier.word)) \(last)") { return true }
    }
    if let apposed = word(before: range.location, in: text, through: ",:"), productWords.contains(key(apposed.word)) { return true }
    return false
  }

  /** A word as the lists above spell it: lower case, a curly apostrophe straight. */
  static func key(_ word: String) -> String {
    word.lowercased().replacingOccurrences(of: "\u{2019}", with: "'")
  }

  /** What may stand between a name and the word beside it: spaces, emphasis and quotation marks ("called **Simeon**", "named \u{201C}Simeon\u{201D}"). */
  private static let wordGap = CharacterSet(charactersIn: " \t*_~\"'\u{201C}\u{201D}\u{2018}\u{2019}")
  private static let apostrophes = CharacterSet(charactersIn: "'\u{2019}")

  private static func scalar(_ text: NSString, _ index: Int) -> Unicode.Scalar? {
    guard index >= 0, index < text.length else { return nil }
    return Unicode.Scalar(text.character(at: index))
  }

  private static func isLetter(_ text: NSString, _ index: Int) -> Bool {
    scalar(text, index).map(CharacterSet.alphanumerics.contains) ?? false
  }

  /** The word before `location` and where it starts ("name's" whole), over spaces and emphasis only, or a comma or colon too (`through`); nil past any other mark. */
  static func word(before location: Int, in text: NSString, through: String = "") -> (word: String, location: Int)? {
    let gap = wordGap.union(CharacterSet(charactersIn: through))
    var index = location - 1
    while let s = scalar(text, index), gap.contains(s) { index -= 1 }
    let end = index + 1
    while index >= 0 {
      if isLetter(text, index) { index -= 1; continue }
      if let s = scalar(text, index), apostrophes.contains(s), index + 1 < end, isLetter(text, index - 1) { index -= 1; continue }
      break
    }
    guard index + 1 < end else { return nil }
    return (text.substring(with: NSRange(location: index + 1, length: end - index - 1)), index + 1)
  }

  /** The word after `end` ("sign-in" whole), past a possessive "'s" if there is one, over spaces and emphasis only. */
  static func word(after end: Int, in text: NSString) -> (word: String, possessive: Bool)? {
    var index = end
    var possessive = false
    if let s = scalar(text, index), apostrophes.contains(s), scalar(text, index + 1) == "s", !isLetter(text, index + 2) {
      possessive = true
      index += 2
    }
    while let s = scalar(text, index), wordGap.contains(s) { index += 1 }
    let start = index
    while index < text.length, isLetter(text, index) || (scalar(text, index) == "-" && isLetter(text, index + 1) && index > start) { index += 1 }
    guard index > start else { return nil }
    return (text.substring(with: NSRange(location: start, length: index - start)), possessive)
  }
}

/** A value behind a lock, for caches read from any thread. */
final class LockedBox<Value>: @unchecked Sendable {
  private let lock = NSLock()
  private var value: Value
  init(_ value: Value) { self.value = value }
  func withLock<T>(_ body: (inout Value) -> T) -> T { lock.lock(); defer { lock.unlock() }; return body(&value) }
}
