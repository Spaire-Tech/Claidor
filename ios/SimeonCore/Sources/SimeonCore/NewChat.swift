import Foundation

/**
 The new chat's "To:" line, as the shipped window has it (`L4n` and its helpers in
 the main bundle): who can be picked, in what order, what the first row offers, and
 what Enter does. The views only draw it.
 */
public enum NewChat {
  /** At most 6 people on the To: line (`Sge`). */
  public static let maxRecipients = 6
  /** The name of an agent made from "Create new Agent" (`oct`). */
  public static let defaultName = "New Agent"
  /** ⌘1 to ⌘9 pick the first nine rows (`Ymt`). */
  public static let shortcutRows = 9
  /** The host's answer when 50 agents exist (`e5e`), and the alert it shows. */
  public static let limitError = "50 is the maximum"
  public static let limitTitle = "50 is the maximum"
  public static let limitMessage = "Delete a Agent from the sidebar to make room for a new one. Your existing Agents are untouched."

  /** Someone on the To: line: an agent, or one still to be made. */
  public enum Recipient: Hashable, Sendable {
    case agent(id: String, name: String)
    case new(name: String)

    public var name: String {
      switch self {
      case .agent(_, let name), .new(let name): return name
      }
    }

    public var agentId: String? {
      if case .agent(let id, _) = self { return id }
      return nil
    }
  }

  /** A row of the menu under the To: line. */
  public enum Row: Hashable, Sendable {
    case createNew
    case create(name: String)
    case agent(id: String, name: String, isGroup: Bool)

    /** What the row reads (`D4n`). */
    public var label: String {
      switch self {
      case .createNew: return "Create new Agent"
      case .create(let name): return "Create \u{201C}\(name)\u{201D}"
      case .agent(_, let name, _): return name
      }
    }

    /** The recipient a row stands for (`k2e`). */
    public var recipient: Recipient {
      switch self {
      case .createNew: return .new(name: NewChat.defaultName)
      case .create(let name): return .new(name: name)
      case .agent(let id, let name, _): return .agent(id: id, name: name)
      }
    }
  }

  /** An agent the To: line can offer. */
  public struct Candidate: Hashable, Sendable {
    public let id: String
    public let name: String
    public let isGroup: Bool
    public init(id: String, name: String, isGroup: Bool) {
      self.id = id; self.name = name; self.isGroup = isGroup
    }
    public init(_ agent: Agent) {
      self.init(id: agent.id, name: agent.name, isGroup: agent.isGroup)
    }
  }

  /** What Enter on the To: line asks for (`J4n`). */
  public enum Commit: Hashable, Sendable {
    case noop
    case single(Recipient)
    case group([Recipient])
  }

  // MARK: Matching

  /**
   A name as the search compares it (`Wmt`): each character decomposed (NFKD) with
   its marks dropped and lower-cased; anything that is not a letter or a number
   becomes one space between words.
   */
  public static func normalized(_ text: String) -> String {
    var out: [Unicode.Scalar] = []
    var gap = false
    for unit in text.utf16 {
      // The window reads the text one UTF-16 unit at a time, so half of a pair is never a letter.
      guard let scalar = Unicode.Scalar(unit) else { gap = true; continue }
      let decomposed = String(Character(scalar)).decomposedStringWithCompatibilityMapping
      let kept = String(String.UnicodeScalarView(decomposed.unicodeScalars.filter { !isMark($0) })).lowercased()
      for s in kept.unicodeScalars {
        guard isLetterOrNumber(s) else { gap = true; continue }
        if gap && !out.isEmpty { out.append(" ") }
        gap = false
        out.append(s)
      }
    }
    return String(String.UnicodeScalarView(out))
  }

  /** The words of a query (`Wf`). */
  public static func tokens(_ text: String) -> [String] {
    let n = normalized(text)
    return n.isEmpty ? [] : n.components(separatedBy: " ")
  }

  /**
   How well a word matches a name (`MFe`): its letters in order, 1 each, 4 more at
   the start of a word and 3 more right after the last match; no match when the
   letters spread over more than three times the word's length.
   */
  public static func fuzzyScore(_ name: String, _ token: String) -> Double? {
    let needle = Array(token.unicodeScalars)
    if needle.isEmpty { return 0 }
    let original = Array(name.unicodeScalars)
    let lower = Array(name.lowercased().unicodeScalars)
    var score = 0.0, matched = 0, previous = -2, first = -1, last = -1
    var c = 0
    while c < lower.count && matched < needle.count {
      defer { c += 1 }
      guard lower[c] == needle[matched] else { continue }
      if first < 0 { first = c }
      let before: Unicode.Scalar? = c > 0 && c - 1 < original.count ? original[c - 1] : nil
      let atWord = c == 0 || before.map { " -_/.".unicodeScalars.contains($0) } == true
      let here: Unicode.Scalar? = c < original.count ? original[c] : nil
      let camel = before.map { $0 >= "a" && $0 <= "z" } == true && here.map { $0 >= "A" && $0 <= "Z" } == true
      var points = 1.0
      if atWord || camel { points += 4 }
      if previous == c - 1 { points += 3 }
      score += points
      previous = c
      last = c
      matched += 1
    }
    if matched < needle.count || last - first + 1 > needle.count * 3 { return nil }
    return score - Double(first) * 0.1 - Double(lower.count) * 0.02
  }

  /** A name's score against every word of a query plus the whole query (`Pme`). */
  static func score(name: String, tokens: [String], query: String) -> Double? {
    let label = normalized(name)
    var total = 0.0
    for token in tokens {
      guard let best = fuzzyScore(label, token) else { return nil }
      total += best
    }
    return total + (fuzzyScore(label, query) ?? 0)
  }

  /** The candidates matching a query, best first; ties keep their order (`I4n`). */
  public static func ranked(_ candidates: [Candidate], query: String) -> [Candidate] {
    let words = tokens(query)
    if words.isEmpty { return candidates }
    let whole = words.joined(separator: " ")
    let scored = candidates.enumerated().compactMap { index, candidate -> (Int, Double, Candidate)? in
      score(name: candidate.name, tokens: words, query: whole).map { (index, $0, candidate) }
    }
    return scored.sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0 < $1.0 }.map(\.2)
  }

  /** The menu's rows (`Bie`): no one already picked, no groups once someone is, and a Create row first unless the query names someone exactly. */
  public static func rows(candidates: [Candidate], recipients: [Recipient], query: String) -> [Row] {
    let picked = Set(recipients.compactMap(\.agentId))
    let open = candidates.filter { !picked.contains($0.id) && (recipients.isEmpty || !$0.isGroup) }
    let matches = ranked(open, query: query).map { Row.agent(id: $0.id, name: $0.name, isGroup: $0.isGroup) }
    let q = normalized(query)
    if q.isEmpty { return recipients.isEmpty ? [.createNew] + matches : matches }
    if open.contains(where: { normalized($0.name) == q }) { return matches }
    return [.create(name: query.trimmingCharacters(in: .whitespacesAndNewlines))] + matches
  }

  /** The row lit when the menu opens or the query changes (`M4n`): the first agent once something is typed. */
  public static func defaultHighlight(_ rows: [Row], query: String) -> Int {
    if tokens(query).isEmpty { return 0 }
    return rows.firstIndex { if case .agent = $0 { return true } else { return false } } ?? 0
  }

  /** The empty menu's line. */
  public static func emptyText(query: String) -> String {
    query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Type a name to create a Agent" : "No matching Agents"
  }

  /** The field's placeholder. */
  public static func fieldPlaceholder(recipients: [Recipient]) -> String {
    recipients.isEmpty ? "Search or create Agents" : "Add or create another Agent"
  }

  /** The composer's placeholder while the new chat is open (`$4n`). */
  public static func composerPlaceholder(recipients: [Recipient]) -> String {
    recipients.isEmpty ? "Message Agent" : "Message \(recipients.map(\.name).joined(separator: ", "))"
  }

  /** The draft row in the sidebar while the new chat is open. */
  public static func draftRowLabel(recipients: [Recipient]) -> String {
    recipients.isEmpty ? "Create new" : recipients.map(\.name).joined(separator: ", ")
  }

  /** Whether choosing a row opens its chat at once instead of adding a chip: Create new Agent, Create “x” on an empty line, and a group. */
  public static func commitsAtOnce(_ row: Row, recipientCount: Int) -> Bool {
    switch row {
    case .createNew: return true
    case .create: return recipientCount == 0
    case .agent(_, _, let isGroup): return isGroup
    }
  }

  /** Whether a recipient is already on the line: the same agent, or a new one of the same name (`Kmt`). */
  public static func contains(_ recipients: [Recipient], _ recipient: Recipient) -> Bool {
    recipients.contains { existing in
      switch (existing, recipient) {
      case (.agent(let a, _), .agent(let b, _)): return a == b
      case (.new(let a), .new(let b)): return normalized(a) == normalized(b)
      default: return false
      }
    }
  }

  /** The line after adding a chip, or nil when it is full or already there (`z4n.add`). */
  public static func adding(_ recipient: Recipient, to recipients: [Recipient]) -> [Recipient]? {
    guard recipients.count < maxRecipients, !contains(recipients, recipient) else { return nil }
    return recipients + [recipient]
  }

  /** Enter on the To: line (`J4n`); the lit row counts only while there is room. */
  public static func commit(recipients: [Recipient], query: String, highlighted: Row?) -> Commit {
    let lit = recipients.count >= maxRecipients ? nil : highlighted
    if recipients.isEmpty {
      return lit.map { .single($0.recipient) } ?? .noop
    }
    var all = recipients
    if !tokens(query).isEmpty, let lit, lit != .createNew, !contains(recipients, lit.recipient) {
      all.append(lit.recipient)
    }
    return all.count == 1 ? .single(all[0]) : .group(all)
  }

  // MARK: Making them

  /** A new agent's name: one line, single spaces, at most 72 characters (`Mte`). */
  public static func cleanName(_ name: String) -> String {
    let words = name.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
    return String(decoding: Array(words.utf16.prefix(72)), as: UTF16.self)
  }

  /** A group made on the To: line is named after its people. */
  public static func groupName(_ recipients: [Recipient]) -> String {
    cleanName(recipients.map(\.name).joined(separator: ", "))
  }

  /** A typed name that reads like a request becomes the new agent's first message (`P4n`): it ends in . ? or !, has more than five words, or is 40 characters or more. */
  public static func looksLikeSentence(_ text: String) -> Bool {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.isEmpty { return false }
    if let end = t.last, ".?!".contains(end) { return true }
    return t.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).count > 5 || t.utf16.count >= 40
  }

  static func isMark(_ s: Unicode.Scalar) -> Bool {
    switch s.properties.generalCategory {
    case .nonspacingMark, .spacingMark, .enclosingMark: return true
    default: return false
    }
  }

  static func isLetterOrNumber(_ s: Unicode.Scalar) -> Bool {
    switch s.properties.generalCategory {
    case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
         .decimalNumber, .letterNumber, .otherNumber: return true
    default: return false
    }
  }
}
