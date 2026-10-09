import Foundation

/**
 * The composer's lists besides "@" and ":" (the window's
 * `rich-text-editor.tsx`): "/" for a skill, "#" for a pull request the chat
 * has linked, and the message's document (`richText`) that carries what was
 * picked to the host.
 */
public enum ComposerMenus {
  /** A skill "/" offers (`getAgentWorkflows`): one the agent can be asked to use now, not a routine that runs on its own. */
  public struct Skill: Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    /** When it runs, for a routine ("Every weekday at 9"). */
    public let subtitle: String?
    public let iconId: String?
    public let iconURL: String?

    public init(id: String, name: String, subtitle: String? = nil, iconId: String? = nil, iconURL: String? = nil) {
      self.id = id; self.name = name; self.subtitle = subtitle; self.iconId = iconId; self.iconURL = iconURL
    }
  }

  /** A pull request "#" offers: one a message in the chat linked (`github.com/…/pull/N`). */
  public struct PullRequest: Hashable, Sendable, Identifiable {
    public let number: Int
    public let url: String
    public var id: Int { number }
  }

  /**
   * The skills in `getAgentWorkflows`' answer that "/" offers: no schedule
   * of their own (`trigger` null), and on for this agent or a routine's own
   * (`isEnabledForAgent`, `source == "automation"`), each once. With
   * `scheduled`, the routines instead (a `trigger`), which "@" offers.
   */
  public static func skills(from answer: JSON, scheduled: Bool = false) -> [Skill] {
    var seen = Set<String>()
    return (answer.array ?? answer["workflows"]?.array ?? []).compactMap { item -> Skill? in
      guard let id = item["id"]?.text?.trimmingCharacters(in: .whitespaces), !id.isEmpty,
            let name = item["name"]?.text?.trimmingCharacters(in: .whitespaces), !name.isEmpty else { return nil }
      // "/" offers the skills with no schedule; "@" offers the routines, the ones with one (`scheduled`).
      let hasTrigger = item["trigger"].map { $0 != .null } ?? false
      if hasTrigger != scheduled { return nil }
      guard item["isEnabledForAgent"]?.bool != false || item["source"]?.string == "automation" else { return nil }
      guard seen.insert(id).inserted else { return nil }
      return Skill(id: id, name: name, subtitle: item["scheduleDescription"]?.text, iconId: item["iconId"]?.text, iconURL: item["iconUrl"]?.text)
    }
  }

  /** The skills whose name (or a word of it) starts with what follows "/", in their order; all for a bare "/". */
  public static func filter(_ skills: [Skill], _ query: String) -> [Skill] {
    let wanted = query.lowercased()
    guard !wanted.isEmpty else { return skills }
    return skills.filter { skill in
      let name = skill.name.lowercased()
      return name.hasPrefix(wanted) || name.split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "_" }).contains { $0.hasPrefix(wanted) } || name.contains(wanted)
    }
  }

  /** What follows a trigger (`/` or `#`) being typed at the end of the draft: at the start or after a space, then no space. */
  public static func query(_ draft: String, after trigger: Character) -> String? {
    guard let at = draft.lastIndex(of: trigger) else { return nil }
    if at > draft.startIndex, !draft[draft.index(before: at)].isWhitespace { return nil }
    let typed = draft[draft.index(after: at)...]
    guard typed.count <= 40, !typed.contains(where: \.isWhitespace), !typed.contains(trigger) else { return nil }
    return String(typed)
  }

  /** The draft with the trigger and what follows it at the end replaced by `text` and a space. */
  public static func replacing(after trigger: Character, in draft: String, with text: String) -> String {
    guard query(draft, after: trigger) != nil, let at = draft.lastIndex(of: trigger) else { return draft + text + " " }
    return String(draft[..<at]) + text + " "
  }

  /** The pull requests the chat's messages linked, newest first, each once (the window's `projectEditorPrReferenceCandidates`). */
  public static func pullRequests(in entries: [Entry]) -> [PullRequest] {
    var seen = Set<Int>()
    var out: [PullRequest] = []
    for entry in entries.reversed() {
      let text: String
      if entry.kind == "message" { text = entry.content ?? "" }
      else if entry.kind == "send-message", entry.message?["type"]?.string == "text" { text = entry.message?["content"]?.string ?? "" }
      else { continue }
      for found in pullRequestLinks(in: text) where seen.insert(found.number).inserted { out.append(found) }
    }
    return out
  }

  /** The pull requests an "#…" being typed matches: its number holds the digits typed. Eight at most. */
  public static func filter(_ pulls: [PullRequest], _ query: String) -> [PullRequest] {
    let wanted = query.trimmingCharacters(in: .whitespaces)
    return Array(pulls.filter { wanted.isEmpty || String($0.number).contains(wanted) }.prefix(8))
  }

  static func pullRequestLinks(in text: String) -> [PullRequest] {
    guard text.contains("/pull/"), let pattern = try? NSRegularExpression(pattern: #"https?://[^\s<>()\[\]]+"#) else { return [] }
    let range = NSRange(text.startIndex..., in: text)
    return pattern.matches(in: text, range: range).compactMap { match -> PullRequest? in
      guard let found = Range(match.range, in: text) else { return nil }
      var raw = String(text[found])
      while let last = raw.last, ".,;:!?".contains(last) { raw.removeLast() }
      guard let url = URL(string: raw), let host = url.host?.lowercased(), host == "github.com" || host == "www.github.com" else { return nil }
      let parts = url.path.split(separator: "/", omittingEmptySubsequences: false)
      // "", owner, repo, "pull", number[, …]
      guard parts.count >= 5, parts[0].isEmpty, !parts[1].isEmpty, !parts[2].isEmpty, parts[3] == "pull", let number = Int(parts[4]), number > 0 else { return nil }
      return PullRequest(number: number, url: raw)
    }
  }

  /**
   * The message as the window's editor writes it (TipTap's JSON,
   * `richText`): a paragraph per line, each picked skill's "@name" a
   * `workflowReference` the host expands into the skill, each picked pull
   * request's "#N" a `prReference`. Nil when nothing was picked: a plain
   * message needs no document.
   */
  public static func richText(_ text: String, skills: [Skill], pullRequests: [PullRequest] = []) -> String? {
    var tokens: [(text: String, node: JSON)] = []
    for skill in skills {
      tokens.append(("@" + skill.name, ["type": "workflowReference", "attrs": ["id": .string(skill.id), "label": .string(skill.name), "iconId": skill.iconId.map(JSON.string) ?? .null, "iconUrl": skill.iconURL.map(JSON.string) ?? .null]]))
    }
    for pull in pullRequests {
      tokens.append(("#\(pull.number)", ["type": "prReference", "attrs": ["prNumber": .number(Double(pull.number)), "title": .null, "url": .string(pull.url)]]))
    }
    // Longest first, so "@Weekly report" is found before "@Weekly".
    tokens.sort { $0.text.count > $1.text.count }
    var used = false
    let paragraphs: [JSON] = text.components(separatedBy: "\n").map { line in
      var content: [JSON] = []
      var plain = ""
      var rest = Substring(line)
      while !rest.isEmpty {
        if let token = tokens.first(where: { rest.hasPrefix($0.text) && endsWord(rest.dropFirst($0.text.count)) }) {
          if !plain.isEmpty { content.append(["type": "text", "text": .string(plain)]); plain = "" }
          content.append(token.node)
          used = true
          rest = rest.dropFirst(token.text.count)
        } else {
          plain.append(rest.removeFirst())
        }
      }
      if !plain.isEmpty { content.append(["type": "text", "text": .string(plain)]) }
      return content.isEmpty ? ["type": "paragraph"] : ["type": "paragraph", "content": .array(content)]
    }
    guard used else { return nil }
    let doc: JSON = ["type": "doc", "content": .array(paragraphs)]
    guard let data = try? doc.data() else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private static func endsWord(_ rest: Substring) -> Bool {
    guard let next = rest.first else { return true }
    return !(next.isLetter || next.isNumber || next == "_")
  }

  /** The id the window gives "@everyone" in a group (`__everyone__`): every member hears the message. */
  public static let everyone = "everyone"
}
