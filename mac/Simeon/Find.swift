import AppKit
import SwiftUI
import SimeonCore

// MARK: The marks

/**
 * What find lights in a row's words (`sand-find-match`, `sand-find-current`):
 * every time the words appear, under the warning yellow at 30%; the current
 * match on the yellow itself, its words `#1f1f1f`. The window lights the
 * words on screen in the row's order and finds the current match by its
 * count there (`w_n`), so `current` is that count less the times the words
 * appear before the words being drawn.
 */
struct FindMarks: Equatable {
  /** What is found, in small letters (`toLowerCase`, not trimmed). */
  let needle: String
  /** Which time in these words is the current match; none when it is not in this row. */
  var current: Int?

  /** Where the needle appears in `text` (UTF-16, as the window counts), left to right, none overlapping. */
  func ranges(in text: String) -> [NSRange] {
    guard !needle.isEmpty else { return [] }
    let original = text as NSString
    let lower = text.lowercased() as NSString
    // A letter whose small form is longer would move every place after it: then search the words as they are.
    let haystack = lower.length == original.length ? lower : original
    let options: NSString.CompareOptions = lower.length == original.length ? [.literal] : [.literal, .caseInsensitive]
    var out: [NSRange] = []
    var from = 0
    while from < haystack.length {
      let found = haystack.range(of: needle, options: options, range: NSRange(location: from, length: haystack.length - from))
      if found.location == NSNotFound || found.length == 0 { break }
      out.append(found)
      from = found.location + found.length
    }
    return out
  }

  /** The same marks for the words after `text`. */
  func skipping(_ text: String) -> FindMarks {
    guard let current else { return self }
    var copy = self
    copy.current = current - ranges(in: text).count
    return copy
  }
}

extension EnvironmentValues {
  /** Find's marks for the row being drawn: set while find has words, on every row. */
  @Entry var findMarks: FindMarks? = nil
}

/** The marks laid over one run of words: the ranges found in it and which of them is current. */
struct FindLine {
  enum Mark { case match, current }

  let ranges: [NSRange]
  let current: Int?

  init?(_ marks: FindMarks?, text: String) {
    guard let marks else { return nil }
    let found = marks.ranges(in: text)
    guard !found.isEmpty else { return nil }
    ranges = found
    current = marks.current
  }

  /** `words`, which start at `offset` in the run, cut where the marks begin and end. */
  func cut(_ words: String, at offset: Int) -> [(text: String, mark: Mark?)] {
    let ns = words as NSString
    let end = offset + ns.length
    var out: [(text: String, mark: Mark?)] = []
    var cursor = offset
    for (index, range) in ranges.enumerated() {
      let low = max(range.location, cursor)
      let high = min(range.location + range.length, end)
      guard low < high else { continue }
      if low > cursor { out.append((ns.substring(with: NSRange(location: cursor - offset, length: low - cursor)), nil)) }
      out.append((ns.substring(with: NSRange(location: low - offset, length: high - low)), index == current ? .current : .match))
      cursor = high
    }
    if cursor < end { out.append((ns.substring(from: cursor - offset), nil)) }
    return out
  }

  /** A piece's paint: the yellow at 30% under a match, the yellow under the current one. */
  static func paint(_ mark: Mark, look: Look) -> Color {
    mark == .current ? look.warn : look.warn.opacity(0.3)
  }

  /** Plain words (the person's message, a notice) with find's marks; the words' colour comes from around them. */
  @MainActor
  static func marked(_ words: String, marks: FindMarks?, look: Look) -> Text {
    guard let line = FindLine(marks, text: words) else { return Text(verbatim: words) }
    return MessageLine.joined(line.cut(words, at: 0).map { part in
      guard let mark = part.mark else { return Text(verbatim: part.text) }
      var painted = AttributedString(part.text)
      painted.backgroundColor = paint(mark, look: look)
      return mark == .current ? Text(painted).foregroundColor(look.onWarn) : Text(painted)
    })
  }
}

/**
 * The words a message's block shows, in order, as find counts them on
 * screen: what the Markdown leaves of a paragraph, a heading, a list's
 * items, a quote, a code block and a table's cells. Numbers and bullets,
 * maths and diagrams are not words in the window either.
 */
enum FindText {
  static func of(_ block: MarkdownBlock) -> String {
    switch block {
    case .paragraph(let text):
      return Markdown.inlineMath(text) != nil ? "" : MessageLine.shown(text)
    case .heading(_, let text):
      return MessageLine.shown(text)
    case .list(_, _, let items):
      return items.map { $0.blocks.map(of).joined() }.joined()
    case .quote(let blocks):
      return blocks.map(of).joined()
    case .code(let language, let text):
      return language?.lowercased() == "mermaid" ? "" : text
    case .table(let header, _, let rows):
      return cells(header: header, rows: rows).map(MessageLine.shown).joined()
    case .rule, .math:
      return ""
    }
  }

  /** A table's cells as the window lays them out: the heading row, then each row as wide as the heading. */
  static func cells(header: [String], rows: [[String]]) -> [String] {
    var out = header
    for row in rows {
      for column in 0..<header.count { out.append(column < row.count ? row[column] : "") }
    }
    return out
  }
}

// MARK: The bar

/** What find has on screen: what it looks for, and the match it stands on. */
struct FindOnScreen {
  let needle: String
  let current: ChatFind.Match?

  /** The marks for one row: the current match's count when it is in the row. */
  func marks(for rowId: String) -> FindMarks {
    FindMarks(needle: needle, current: current?.rowId == rowId ? current?.occurrence : nil)
  }
}

/**
 * Find in the chat (`sand-chat-find-bar`), 8 under the chat's head and 16
 * from its right: 34 high, padded 0 6, 10 round on the raised ground with a
 * hairline at 10% and, on light, a soft shadow; 2 apart, the glass (12, at
 * 40%, 4 in), the field (148, 13 on 18, padded 0 6, "Find in chat"), the
 * count once words are typed ("2/5": 12 on 16, tabular, at 40%, red when
 * nothing matches, right aligned in 40 with 4 after), a line (1 × 20 at
 * 10%, 2 each side), then Previous match, Next match and Close find (24,
 * 6 round, the glyphs 14 at 60%; at 30% and off while nothing matches).
 * Enter goes to the next match, Shift-Enter back, Escape closes; the
 * field takes the keys with its words chosen each time ⌘F is pressed.
 */
struct FindBar: View {
  let matches: [ChatFind.Match]
  let look: Look
  @Environment(ChatControl.self) private var control

  var body: some View {
    @Bindable var control = control
    let typed = !control.findQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let ordinal = control.findIndex(matches).map { $0 + 1 } ?? 0
    HStack(spacing: 2) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 10, weight: .medium))
        .foregroundStyle(look.inkTertiary)
        .frame(width: 16, height: 16)
        .padding(.leading, 4)
        .accessibilityHidden(true)
      FindField(text: $control.findQuery, focus: control.findFocus, look: look,
                next: { control.stepFind(1, in: matches) },
                previous: { control.stepFind(-1, in: matches) },
                close: { control.closeFind() })
        .frame(width: 136, height: 18)
        .padding(.horizontal, 6)
      if typed {
        Text(verbatim: "\(ordinal)/\(matches.count)")
          .font(.system(size: 12))
          .monospacedDigit()
          .foregroundStyle(matches.isEmpty ? look.danger : look.inkTertiary)
          .lineLimit(1)
          .frame(minWidth: 36, alignment: .trailing)
          .padding(.trailing, 4)
          .accessibilityLabel(matches.isEmpty ? "No matches" : "Match \(ordinal) of \(matches.count)")
      }
      Rectangle()
        .fill(look.ink.opacity(0.1))
        .frame(width: 1, height: 20)
        .padding(.horizontal, 2)
      FindButton(symbol: "chevron.up", label: "Previous match", enabled: !matches.isEmpty, look: look) {
        control.stepFind(-1, in: matches)
      }
      FindButton(symbol: "chevron.down", label: "Next match", enabled: !matches.isEmpty, look: look) {
        control.stepFind(1, in: matches)
      }
      FindButton(symbol: "xmark", label: "Close find", enabled: true, look: look) {
        control.closeFind()
      }
    }
    .padding(.horizontal, 6)
    .frame(height: 34)
    .background(look.elevated, in: RoundedRectangle(cornerRadius: 10))
    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(look.ink.opacity(0.1), lineWidth: 0.5) }
    // `0 10 20 -3` and `0 4 6 -4` at 10% black on light; none on dark.
    .shadow(color: .black.opacity(look.dark ? 0 : 0.1), radius: 8, x: 0, y: 10)
    .shadow(color: .black.opacity(look.dark ? 0 : 0.1), radius: 2, x: 0, y: 4)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Find in chat")
  }
}

/** One of find's buttons (`sand-kit-icon-button`, small): 24 square, 6 round, grey under the pointer. */
private struct FindButton: View {
  let symbol: String
  let label: String
  let enabled: Bool
  let look: Look
  let action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: symbol == "xmark" ? 11 : 12, weight: .medium))
        .foregroundStyle(enabled ? look.inkSecondary : look.ink.opacity(0.3))
        .frame(width: 24, height: 24)
        .background(hovered && enabled ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
        .contentShape(RoundedRectangle(cornerRadius: 6))
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .onHover { hovered = $0 }
    .help(label)
    .accessibilityLabel(label)
  }
}

/**
 * Find's field: a plain Mac text field, so Enter, Shift-Enter and Escape
 * reach find before anything else (`u_n`'s keys). It takes the keys when it
 * opens (`autoFocus`) and again, its words chosen, on each ⌘F.
 */
private struct FindField: NSViewRepresentable {
  @Binding var text: String
  let focus: Int
  let look: Look
  let next: () -> Void
  let previous: () -> Void
  let close: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  /** As wide as the bar gives it, whatever is typed (a text field would grow with its words). */
  func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSTextField, context: Context) -> CGSize? {
    CGSize(width: proposal.width ?? 136, height: 18)
  }

  func makeNSView(context: Context) -> NSTextField {
    let field = NSTextField()
    field.isBordered = false
    field.isBezeled = false
    field.drawsBackground = false
    field.focusRingType = .none
    field.font = .systemFont(ofSize: 13)
    field.lineBreakMode = .byClipping
    field.cell?.isScrollable = true
    field.cell?.wraps = false
    field.usesSingleLineMode = true
    field.delegate = context.coordinator
    field.setAccessibilityLabel("Find in chat")
    paint(field)
    return field
  }

  func updateNSView(_ field: NSTextField, context: Context) {
    context.coordinator.parent = self
    if field.stringValue != text { field.stringValue = text }
    paint(field)
    if context.coordinator.focused != focus {
      context.coordinator.focused = focus
      DispatchQueue.main.async {
        field.window?.makeFirstResponder(field)
        field.currentEditor()?.selectAll(nil)
      }
    }
  }

  private func paint(_ field: NSTextField) {
    field.textColor = NSColor(look.ink)
    field.placeholderAttributedString = NSAttributedString(string: "Find in chat", attributes: [
      .font: NSFont.systemFont(ofSize: 13),
      .foregroundColor: NSColor(look.placeholder),
    ])
  }

  @MainActor
  final class Coordinator: NSObject, NSTextFieldDelegate {
    var parent: FindField
    /** The ⌘F last answered; none yet, so the field takes the keys when it first shows. */
    var focused = -1

    init(_ parent: FindField) { self.parent = parent }

    func controlTextDidChange(_ notification: Notification) {
      guard let field = notification.object as? NSTextField else { return }
      parent.text = field.stringValue
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
      switch selector {
      case #selector(NSResponder.insertNewline(_:)), #selector(NSResponder.insertNewlineIgnoringFieldEditor(_:)):
        if NSApp.currentEvent?.modifierFlags.contains(.shift) == true { parent.previous() } else { parent.next() }
        return true
      case #selector(NSResponder.cancelOperation(_:)):
        parent.close()
        return true
      default:
        return false
      }
    }
  }
}
