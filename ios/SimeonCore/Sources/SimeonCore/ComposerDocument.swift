import Foundation

/**
 * A pick from a composer list, where it sits in the draft: "@Nora" for an
 * agent, "@Weekly report" for a skill or routine, "#12" for a pull request.
 * The window's editor holds these as single pieces (nodes); here they are
 * the draft's own words, kept track of while the draft changes.
 */
public struct ComposerChip: Equatable, Sendable {
  public enum Node: Equatable, Sendable {
    /** An agent, a group or "everyone" (`mention`). */
    case mention(id: String, label: String)
    /** A skill, a routine or a connector (`workflowReference`). */
    case workflow(id: String, label: String, iconId: String?, iconURL: String?)
    /** A pull request (`prReference`). */
    case pullRequest(number: Int, title: String?, url: String?)

    /** Its words in the message ("@Nora", "#12"), as the window writes them in the plain text. */
    public var text: String {
      switch self {
      case .mention(_, let label), .workflow(_, let label, _, _): return "@" + label
      case .pullRequest(let number, _, _): return "#\(number)"
      }
    }
  }

  /** Where its first character is (characters into the draft). */
  public var start: Int
  public let node: Node

  public init(start: Int, node: Node) { self.start = start; self.node = node }

  public var text: String { node.text }
  public var end: Int { start + text.count }
}

/** The draft and its picks as the window's composer sends them: the words (`prompt`) and the editor's document (`richText`). */
public enum ComposerDocument {
  /**
   * The picks still whole once the draft went from `old` to `new`: those
   * before the change stay, those after it move with it, one the change
   * touched is gone (as a node deleted or split).
   */
  public static func carry(_ chips: [ComposerChip], from old: String, to new: String) -> [ComposerChip] {
    guard old != new else { return chips }
    let a = Array(old), b = Array(new)
    var prefix = 0
    while prefix < a.count && prefix < b.count && a[prefix] == b[prefix] { prefix += 1 }
    var suffix = 0
    while suffix < a.count - prefix && suffix < b.count - prefix && a[a.count - 1 - suffix] == b[b.count - 1 - suffix] { suffix += 1 }
    let changedEnd = a.count - suffix
    let delta = b.count - a.count
    return chips.compactMap { chip in
      if chip.end <= prefix { return chip }
      if chip.start >= changedEnd {
        var moved = chip
        moved.start += delta
        return moved
      }
      return nil
    }.filter { chip in
      // Still its own words where it is.
      chip.start >= 0 && chip.end <= b.count && String(b[chip.start..<chip.end]) == chip.text
    }
  }

  /** Where the words after the last pick begin (the window's text before the caret): a list opens only in them. */
  public static func textStart(_ chips: [ComposerChip], in draft: String) -> Int {
    let count = draft.count
    return chips.filter { $0.end <= count }.map(\.end).max() ?? 0
  }

  /** The draft with the trigger and what was typed after it (`from` to the end) swapped for the pick and a space. */
  public static func picking(_ node: ComposerChip.Node, from: Int, in draft: String, chips: [ComposerChip]) -> (draft: String, chips: [ComposerChip]) {
    let chars = Array(draft)
    let head = String(chars[..<min(from, chars.count)])
    let chip = ComposerChip(start: head.count, node: node)
    return (head + chip.text + " ", chips.filter { $0.end <= head.count } + [chip])
  }

  /** The message's words as sent: the draft, trimmed (`prompt`). */
  public static func prompt(_ draft: String) -> String {
    draft.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /**
   * The editor's document for the draft (`JSON.stringify(editor.getJSON())`):
   * one paragraph, a line break a `hardBreak`, each pick its node; nil for
   * an empty draft.
   */
  public static func richText(_ draft: String, chips: [ComposerChip]) -> String? {
    guard !draft.isEmpty else { return nil }
    let chars = Array(draft)
    var content: [JSON] = []
    func addText(_ text: String) {
      let lines = text.components(separatedBy: "\n")
      for (index, line) in lines.enumerated() {
        if index > 0 { content.append(["type": "hardBreak"]) }
        if !line.isEmpty { content.append(["type": "text", "text": .string(line)]) }
      }
    }
    var cursor = 0
    for chip in chips.sorted(by: { $0.start < $1.start }) where chip.start >= cursor && chip.end <= chars.count {
      addText(String(chars[cursor..<chip.start]))
      content.append(node(chip.node))
      cursor = chip.end
    }
    addText(String(chars[cursor...]))
    let paragraph: JSON = content.isEmpty ? ["type": "paragraph"] : ["type": "paragraph", "content": .array(content)]
    let doc: JSON = ["type": "doc", "content": [paragraph]]
    guard let data = try? doc.data() else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func node(_ node: ComposerChip.Node) -> JSON {
    switch node {
    case .mention(let id, let label):
      return ["type": "mention", "attrs": ["id": .string(id), "label": .string(label), "mentionSuggestionChar": "@"]]
    case .workflow(let id, let label, let iconId, let iconURL):
      return ["type": "workflowReference", "attrs": ["id": .string(id), "label": .string(label), "iconId": iconId.map(JSON.string) ?? .null, "iconUrl": iconURL.map(JSON.string) ?? .null]]
    case .pullRequest(let number, let title, let url):
      return ["type": "prReference", "attrs": ["prNumber": .number(Double(number)), "title": title.map(JSON.string) ?? .null, "url": url.map(JSON.string) ?? .null]]
    }
  }

  /** A sent message's document read back into a draft and its picks (a canceled message going back to the composer). */
  public static func draft(from richText: String?) -> (draft: String, chips: [ComposerChip])? {
    guard let doc = Chat.document(richText) else { return nil }
    var draft = ""
    var chips: [ComposerChip] = []
    let blocks = doc["content"] as? [[String: Any]] ?? []
    for (index, block) in blocks.enumerated() {
      if index > 0 { draft += "\n\n" }
      for piece in block["content"] as? [[String: Any]] ?? [] {
        let attrs = piece["attrs"] as? [String: Any] ?? [:]
        var node: ComposerChip.Node?
        switch piece["type"] as? String {
        case "text": draft += piece["text"] as? String ?? ""
        case "hardBreak": draft += "\n"
        case "mention":
          if let id = attrs["id"] as? String { node = .mention(id: id, label: attrs["label"] as? String ?? id) }
        case "workflowReference":
          if let id = attrs["id"] as? String { node = .workflow(id: id, label: attrs["label"] as? String ?? "", iconId: attrs["iconId"] as? String, iconURL: attrs["iconUrl"] as? String) }
        case "prReference":
          if let number = (attrs["prNumber"] as? NSNumber)?.intValue { node = .pullRequest(number: number, title: attrs["title"] as? String, url: attrs["url"] as? String) }
        default: break
        }
        if let node {
          chips.append(ComposerChip(start: draft.count, node: node))
          draft += node.text
        }
      }
    }
    return (draft, chips)
  }
}
