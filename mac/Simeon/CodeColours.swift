import AppKit
import JavaScriptCore
import SwiftUI

/**
 * A text file's colours in the preview, as the window colours them: the
 * window's own copy of highlight.js (`Rendering/highlight.min.js`,
 * BSD-3-Clause) run in Apple's JavaScriptCore, off the main thread, and its
 * classes drawn in the window's palette (`.sand-code .hljs-*`): keywords
 * violet, strings green, numbers and built-ins orange, titles blue, names
 * and properties gold, symbols and links cyan, deletions red, comments in
 * the text colour at 40% and italic.
 */
actor CodeColours {
  static let shared = CodeColours()

  /** One stretch of the text and how it is drawn. */
  struct Run: Sendable {
    let start: Int
    let length: Int
    let colour: Token?
    let italic: Bool
    let bold: Bool
    let mark: Mark?
  }

  enum Token: Sendable { case keyword, string, number, title, attribute, symbol, deletion, comment }
  enum Mark: Sendable { case added, removed }

  private var context: JSContext?
  private var failed = false

  /** The text's runs in `language`, nil when highlight.js does not know it (the file then shows plain). */
  func runs(_ code: String, language: String) -> [Run]? {
    guard let hljs = engine() else { return nil }
    guard let known = hljs.invokeMethod("getLanguage", withArguments: [language]), !known.isUndefined, !known.isNull else { return nil }
    let options: [String: Any] = ["language": language, "ignoreIllegals": true]
    guard let result = hljs.invokeMethod("highlight", withArguments: [code, options]),
          let html = result.objectForKeyedSubscript("value"), html.isString else { return nil }
    return CodeColours.parse(html.toString())
  }

  private func engine() -> JSValue? {
    if context == nil, !failed {
      guard let url = Bundle.main.url(forResource: "highlight.min", withExtension: "js"),
            let script = try? String(contentsOf: url, encoding: .utf8),
            let made = JSContext() else { failed = true; return nil }
      made.evaluateScript(script)
      context = made
    }
    guard let value = context?.objectForKeyedSubscript("hljs"), !value.isUndefined else { return nil }
    return value
  }

  /** highlight.js's spans read back into runs over the text (its escapes undone, positions in UTF-16 as NSString counts). */
  static func parse(_ html: String) -> [Run] {
    var runs: [Run] = []
    var stack: [[String]] = []
    var offset = 0
    var index = html.startIndex
    var pending = ""
    func flush() {
      guard !pending.isEmpty else { return }
      let length = (pending as NSString).length
      let style = style(stack)
      runs.append(Run(start: offset, length: length, colour: style.colour, italic: style.italic, bold: style.bold, mark: style.mark))
      offset += length
      pending = ""
    }
    while index < html.endIndex {
      let character = html[index]
      if character == "<" {
        guard let close = html[index...].firstIndex(of: ">") else { break }
        let tag = html[html.index(after: index)..<close]
        flush()
        if tag.hasPrefix("/") {
          if !stack.isEmpty { stack.removeLast() }
        } else if let classStart = tag.range(of: "class=\"") {
          let rest = tag[classStart.upperBound...]
          let classes = rest.prefix { $0 != "\"" }
          stack.append(classes.split(separator: " ").map(String.init))
        } else {
          stack.append([])
        }
        index = html.index(after: close)
      } else if character == "&" {
        guard let semi = html[index...].prefix(10).firstIndex(of: ";") else {
          pending.append(character)
          index = html.index(after: index)
          continue
        }
        let entity = String(html[html.index(after: index)..<semi])
        switch entity {
        case "amp": pending.append("&")
        case "lt": pending.append("<")
        case "gt": pending.append(">")
        case "quot": pending.append("\"")
        case "#x27", "#39", "apos": pending.append("'")
        default:
          if entity.hasPrefix("#x"), let code = UInt32(entity.dropFirst(2), radix: 16), let scalar = Unicode.Scalar(code) {
            pending.unicodeScalars.append(scalar)
          } else if entity.hasPrefix("#"), let code = UInt32(entity.dropFirst()), let scalar = Unicode.Scalar(code) {
            pending.unicodeScalars.append(scalar)
          } else {
            pending += "&" + entity + ";"
          }
        }
        index = html.index(after: semi)
      } else {
        pending.append(character)
        index = html.index(after: index)
      }
    }
    flush()
    return runs
  }

  /** A stretch's look from the spans around it, innermost first, as the window's stylesheet decides it. */
  static func style(_ stack: [[String]]) -> (colour: Token?, italic: Bool, bold: Bool, mark: Mark?) {
    var colour: Token?
    for (depth, classes) in stack.enumerated().reversed() {
      let outer = stack[..<depth].flatMap { $0 }
      if classes.contains("hljs-title"), outer.contains("hljs-class") { colour = .number; break }
      if classes.contains("hljs-keyword"), outer.contains("hljs-meta") { colour = .keyword; break }
      // The stylesheet's rules in its order: a later one wins when a span has two.
      var found: Token?
      for name in classes {
        guard let token = token(name) else { continue }
        if let current = found, order(current) > order(token) { continue }
        found = token
      }
      if let found { colour = found; break }
    }
    let all = stack.flatMap { $0 }
    let italic = all.contains("hljs-comment") || all.contains("hljs-quote") || all.contains("hljs-emphasis")
    let bold = all.contains("hljs-strong")
    let mark: Mark? = all.contains("hljs-addition") ? .added : all.contains("hljs-deletion") ? .removed : nil
    return (colour, italic, bold, mark)
  }

  static func token(_ name: String) -> Token? {
    switch name {
    case "hljs-comment", "hljs-quote": return .comment
    case "hljs-keyword", "hljs-selector-tag", "hljs-literal", "hljs-type": return .keyword
    case "hljs-string", "hljs-meta-string", "hljs-regexp", "hljs-addition": return .string
    case "hljs-number", "hljs-built_in": return .number
    case "hljs-title", "hljs-section", "hljs-name": return .title
    case "hljs-attr", "hljs-attribute", "hljs-variable", "hljs-template-variable", "hljs-property": return .attribute
    case "hljs-symbol", "hljs-bullet", "hljs-link", "hljs-selector-id", "hljs-selector-class": return .symbol
    case "hljs-deletion": return .deletion
    default: return nil
    }
  }

  static func order(_ token: Token) -> Int {
    switch token {
    case .comment: return 0
    case .keyword: return 1
    case .string: return 2
    case .number: return 3
    case .title: return 4
    case .attribute: return 5
    case .symbol: return 6
    case .deletion: return 7
    }
  }

  /** The text with its runs drawn in the window's palette. */
  @MainActor
  static func attributed(_ text: String, runs: [Run], look: Look) -> NSAttributedString {
    let out = NSMutableAttributedString(string: text, attributes: CodeBody.attributes(NSColor(look.ink)))
    let length = out.length
    let italic = NSFontManager.shared.convert(CodeBody.font, toHaveTrait: .italicFontMask)
    let bold = NSFont.monospacedSystemFont(ofSize: 12.5, weight: .semibold)
    for run in runs {
      guard run.start + run.length <= length else { break }
      let range = NSRange(location: run.start, length: run.length)
      if let token = run.colour { out.addAttribute(.foregroundColor, value: colour(token, look: look), range: range) }
      if run.italic { out.addAttribute(.font, value: italic, range: range) }
      if run.bold { out.addAttribute(.font, value: bold, range: range) }
      switch run.mark {
      case .added?: out.addAttribute(.backgroundColor, value: NSColor(Color(hex: 0x3fa266).opacity(0.14)), range: range)
      case .removed?: out.addAttribute(.backgroundColor, value: NSColor(Color(hex: 0xfc6b83).opacity(0.12)), range: range)
      case nil: break
      }
    }
    return out
  }

  @MainActor
  static func colour(_ token: Token, look: Look) -> NSColor {
    switch token {
    case .keyword: return NSColor(Color(hex: 0xc678dd))
    case .string: return NSColor(Color(hex: 0x98c379))
    case .number: return NSColor(Color(hex: 0xd19a66))
    case .title: return NSColor(Color(hex: 0x61afef))
    case .attribute: return NSColor(Color(hex: 0xe5c07b))
    case .symbol: return NSColor(Color(hex: 0x56b6c2))
    case .deletion: return NSColor(Color(hex: 0xe06c75))
    case .comment: return NSColor(look.inkTertiary)
    }
  }
}
