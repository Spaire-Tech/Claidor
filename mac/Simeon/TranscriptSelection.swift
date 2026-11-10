import AppKit
import SwiftUI
import SimeonCore

/**
 * Words chosen across a chat's messages, as a page in a browser chooses them
 * (the founder, 5 November 2026: "you can only select one dialogue at the
 * time when you should be able to select all", with the Electron window's
 * for reference). A drag over the chat chooses every word from where it began
 * to where it is, through as many messages as it crosses; a click lets them
 * go, as does another chat or words chosen in the message field. ⌘C (and the
 * Edit menu's Copy while the message field has the keys) copies them in
 * order, a message from the next a blank line apart.
 *
 * Until then each message's words were their own selectable text (SwiftUI's
 * `textSelection`), which keeps a drag inside the words it began in. Now the
 * chat itself takes the drag (`Transcript`), each run of a message's words
 * draws its own part of the choice and writes down which of its words are in
 * it (`WordsRenderer`, `ChosenWords`), and the messages between the first and
 * the last, in view or not, are copied whole from the chat.
 *
 * Not done: a double click choosing a word, and the chat scrolling by itself
 * while a drag holds at its top or bottom edge.
 */
@MainActor
@Observable
final class TranscriptSelection {
  /** The transcript's own space: the rows' places and the drag are read in it, so scrolling changes neither. */
  nonisolated static let space = "transcript.words"
  /** The chat whose words are chosen, for ⌘C wherever the keys are (`MainWindow`, `FieldTextView`). */
  static weak var current: TranscriptSelection?

  /**
   * A drag chose words, until they are let go. Read by the messages to lay
   * out their words as pieces each can be read back from (`ChosenWord`): only
   * meanwhile, as it costs.
   */
  private(set) var active = false
  /** Where the drag began, and where it is now, in `space`. */
  private(set) var anchor: CGPoint?
  private(set) var focus: CGPoint?

  /** What each run of words in view has chosen, written as it draws. */
  let chosen = ChosenWords()
  /** The chat's rows in order, as last drawn. */
  @ObservationIgnored var rows: [ChatRow] = []
  /** Each row laid out now and where. */
  @ObservationIgnored private var frames: [String: CGRect] = [:]
  /** The rows under the drag's start and under it now. */
  @ObservationIgnored private var anchorRow: String?
  @ObservationIgnored private var focusRow: String?

  var span: WordSpan? {
    guard active, let anchor, let focus else { return nil }
    return anchor.y <= focus.y ? WordSpan(start: anchor, end: focus) : WordSpan(start: focus, end: anchor)
  }

  /** A row laid out, and where. */
  func place(_ row: String, _ frame: CGRect) { frames[row] = frame }
  /** A row out of the laid-out range: its place no longer holds. */
  func forget(_ row: String) { frames[row] = nil }

  /** The drag, from where it began to where it is now. */
  func drag(from start: CGPoint, to now: CGPoint) {
    if !active || anchor != start {
      // A new drag: the last choice goes, and words chosen in a field with it (one choice at a time, as a page's).
      chosen.clear()
      anchor = start
      anchorRow = row(at: start)
      active = true
      TranscriptSelection.current = self
      TranscriptSelection.collapseFieldChoice()
    }
    if focus != now { focus = now }
    focusRow = row(at: now)
  }

  /** The words let go: a click, another chat, words chosen in the message field. */
  func clear() {
    guard active || anchor != nil else { return }
    active = false
    anchor = nil
    focus = nil
    anchorRow = nil
    focusRow = nil
    chosen.clear()
    if TranscriptSelection.current === self { TranscriptSelection.current = nil }
  }

  /** The row at a height, or the nearest. */
  private func row(at point: CGPoint) -> String? {
    var best: (id: String, distance: CGFloat)?
    for (id, frame) in frames {
      let distance = point.y < frame.minY ? frame.minY - point.y : point.y > frame.maxY ? point.y - frame.maxY : 0
      if distance == 0 { return id }
      if best == nil || distance < best!.distance { best = (id, distance) }
    }
    return best?.id
  }

  /**
   * The chosen words, plain, in order: the first and the last message as
   * much of them as is chosen, those between whole; nil when none.
   */
  func words() -> String? {
    guard active, let a = anchorRow, let f = focusRow,
          let ai = rows.firstIndex(where: { $0.id == a }), let fi = rows.firstIndex(where: { $0.id == f }) else { return nil }
    let low = min(ai, fi), high = max(ai, fi)
    var parts: [String] = []
    for index in low...high {
      let row = rows[index]
      let drawn = chosen.text(in: row.id)
      let text: String?
      if index == low || index == high {
        text = drawn
      } else {
        text = drawn?.isEmpty == false ? drawn : TranscriptSelection.whole(row)
      }
      if let text, !text.isEmpty { parts.append(text) }
    }
    let joined = ChosenWords.cleaned(parts.joined(separator: "\n\n"))
    return joined.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : joined
  }

  /** The chosen words to the clipboard; false when there are none. */
  @discardableResult
  func copy() -> Bool {
    guard let words = words() else { return false }
    let board = NSPasteboard.general
    board.clearContents()
    board.setString(words, forType: .string)
    return true
  }

  /** ⌘C: the chat's chosen words, unless the view with the keys has words of its own chosen. */
  static func copyChosen(over responder: NSResponder?) -> Bool {
    if let text = responder as? NSTextView, text.selectedRange().length > 0 { return false }
    return current?.copy() ?? false
  }

  /** Words are chosen in a chat: the Edit menu's Copy is on. */
  static var hasWords: Bool { current?.active == true }

  /** Words chosen in the field with the keys go when a drag chooses the chat's. */
  private static func collapseFieldChoice() {
    guard let text = NSApp.keyWindow?.firstResponder as? NSTextView else { return }
    let range = text.selectedRange()
    if range.length > 0 { text.setSelectedRange(NSRange(location: NSMaxRange(range), length: 0)) }
  }

  /** A whole row's words, for a message between the first and the last (in view or not); nil for a card. */
  static func whole(_ row: ChatRow) -> String? {
    switch row {
    case .bubble(let bubble):
      return bubble.fromPerson ? bubble.text : plain(Markdown.cachedBlocks(bubble.text))
    case .notice(_, let text):
      return text
    case .modelChange(_, let change):
      return change.text
    default:
      return nil
    }
  }

  /** A message's blocks as plain words, as a page copies them: a block a line, a table's cells a tab apart. */
  static func plain(_ blocks: [MarkdownBlock]) -> String {
    blocks.map { block -> String in
      switch block {
      case .paragraph(let text):
        return Markdown.inlineMath(text) != nil ? text : MessageLine.shown(text)
      case .heading(_, let text):
        return MessageLine.shown(text)
      case .list(_, _, let items):
        return items.map { plain($0.blocks) }.joined(separator: "\n")
      case .quote(let inner):
        return plain(inner)
      case .code(_, let text):
        return text
      case .table(let header, _, let rows):
        return ([header] + rows).map { $0.map(MessageLine.shown).joined(separator: "\t") }.joined(separator: "\n")
      case .rule, .math:
        return ""
      }
    }
    .filter { !$0.isEmpty }
    .joined(separator: "\n")
  }
}

/** The chat's choice of words from its start to its end, the higher first, in some view's own space. */
struct WordSpan: Equatable, Sendable {
  var start: CGPoint
  var end: CGPoint

  func moved(by origin: CGPoint) -> WordSpan {
    WordSpan(start: CGPoint(x: start.x - origin.x, y: start.y - origin.y), end: CGPoint(x: end.x - origin.x, y: end.y - origin.y))
  }

  /**
   * A glyph whose middle is at `midX`, on a line from `top` to `bottom`, is
   * chosen: lines between the start's and the end's whole, the start's from
   * it on, the end's up to it, and from one to the other when both are on
   * the line.
   */
  func covers(midX: CGFloat, top: CGFloat, bottom: CGFloat) -> Bool {
    let startIn = start.y >= top && start.y <= bottom
    let endIn = end.y >= top && end.y <= bottom
    if startIn && endIn { return midX >= min(start.x, end.x) && midX <= max(start.x, end.x) }
    let afterStart = start.y < top || (startIn && midX >= start.x)
    let beforeEnd = end.y > bottom || (endIn && midX <= end.x)
    return afterStart && beforeEnd
  }
}

/**
 * What each run of words in view has chosen, written as it draws (off the
 * main thread, so behind a lock), keyed by its row and where it sits.
 */
final class ChosenWords: @unchecked Sendable {
  /** One run of words' pen: its row, where it sits in the transcript. */
  struct Recorder: Sendable {
    let words: ChosenWords
    let row: String
    let origin: CGPoint

    func write(_ text: String) { words.record(row: row, origin: origin, text: text) }
  }

  private struct Piece {
    let row: String
    let origin: CGPoint
    let text: String
  }

  private let lock = NSLock()
  private var pieces: [String: Piece] = [:]

  func record(row: String, origin: CGPoint, text: String) {
    let key = "\(row)|\(Int(origin.y.rounded()))|\(Int(origin.x.rounded()))"
    lock.lock()
    defer { lock.unlock() }
    pieces[key] = Piece(row: row, origin: origin, text: text)
  }

  func clear() {
    lock.lock()
    defer { lock.unlock() }
    pieces.removeAll()
  }

  /** What of a row's words is chosen, in reading order: runs on one line a tab apart (a table's cells), else a line each; nil when none of its words were drawn. */
  func text(in row: String) -> String? {
    lock.lock()
    let mine = pieces.values.filter { $0.row == row }
    lock.unlock()
    guard !mine.isEmpty else { return nil }
    let ordered = mine.sorted { abs($0.origin.y - $1.origin.y) > 1 ? $0.origin.y < $1.origin.y : $0.origin.x < $1.origin.x }
    var out = ""
    var lastY: CGFloat?
    for piece in ordered where !piece.text.isEmpty {
      if let y = lastY { out += abs(piece.origin.y - y) <= 1 ? "\t" : "\n" }
      out += piece.text
      lastY = piece.origin.y
    }
    return out
  }

  /** The marks the words are drawn with taken out: the code's thin spaces, the pills' joiners; a name's kept spaces plain again. */
  static func cleaned(_ text: String) -> String {
    text.replacingOccurrences(of: "\u{00A0}", with: " ")
      .replacingOccurrences(of: "\u{2009}", with: "")
      .replacingOccurrences(of: "\u{2060}", with: "")
  }

  /**
   * The highlight's bands on each line and the words chosen, read from the
   * laid-out text: a glyph is chosen when its middle is inside the span
   * (`WordSpan.covers`); each glyph of a `ChosenWord` piece stands for that
   * piece's character at the same place, and a piece chosen to its last
   * glyph gives its trailing space too (a line's last space is not drawn).
   */
  static func measure(_ layout: Text.Layout, span: WordSpan) -> (bands: [CGRect], text: String) {
    let lines = Array(layout)
    var bands: [CGRect] = []
    var counts: [Int: Int] = [:]
    var first: [Int: Int] = [:]
    var last: [Int: Int] = [:]
    var texts: [Int: String] = [:]
    var order: [Int] = []
    for (index, line) in lines.enumerated() {
      let box = line.typographicBounds.rect
      // The band reaches down to the next line, so the lines' gaps are chosen too.
      let below = index + 1 < lines.count ? lines[index + 1].typographicBounds.rect.minY : box.maxY
      let bottom = max(box.maxY, below)
      var low: CGFloat?
      var high: CGFloat?
      for run in line {
        let word = run[ChosenWord.self]
        if let word, texts[word.id] == nil {
          texts[word.id] = word.text
          order.append(word.id)
        }
        for glyph in run {
          let rect = glyph.typographicBounds.rect
          let at = word.map { counts[$0.id, default: 0] } ?? 0
          if let word { counts[word.id] = at + 1 }
          guard span.covers(midX: rect.midX, top: box.minY, bottom: bottom) else { continue }
          low = min(low ?? rect.minX, rect.minX)
          high = max(high ?? rect.maxX, rect.maxX)
          if let word {
            if first[word.id] == nil { first[word.id] = at }
            last[word.id] = at
          }
        }
      }
      if let low, let high, high > low {
        bands.append(CGRect(x: low, y: box.minY, width: high - low, height: bottom - box.minY))
      }
    }
    var text = ""
    for id in order {
      guard let from = first[id], let to = last[id], let words = texts[id] else { continue }
      let characters = Array(words)
      guard from < characters.count else { continue }
      let glyphs = counts[id] ?? characters.count
      let end = to >= glyphs - 1 ? characters.count - 1 : min(to, characters.count - 1)
      guard end >= from else { continue }
      text += String(characters[from...end])
    }
    return (bands, text)
  }
}

/**
 * A piece of a message's words, marked so a run of glyphs can be read back
 * as the words it draws (`ChosenWords.measure`): a word and the space after
 * it, a link, a piece of code, a line of a code block. `id` is the piece's
 * place in its words, unique in them.
 */
struct ChosenWord: TextAttribute {
  let id: Int
  let text: String

  /** Words cut after each run of spaces: "a b  c" is "a ", "b  ", "c". */
  static func split(_ words: String) -> [String] {
    var out: [String] = []
    var current = ""
    var inSpace = false
    for character in words {
      if character.isWhitespace {
        current.append(character)
        inSpace = true
      } else {
        if inSpace {
          out.append(current)
          current = ""
          inSpace = false
        }
        current.append(character)
      }
    }
    if !current.isEmpty { out.append(current) }
    return out
  }

  /**
   * Words as one Text, each word marked (while a choice is being made) or
   * whole, under `background` when find marked them; `offset` is where they
   * start in their run of words (UTF-16).
   */
  @MainActor
  static func text(_ words: String, at offset: Int, marked: Bool, background: Color? = nil) -> Text {
    func one(_ piece: String, _ id: Int) -> Text {
      let text: Text
      if let background {
        var painted = AttributedString(piece)
        painted.backgroundColor = background
        text = Text(painted)
      } else {
        text = Text(verbatim: piece)
      }
      return marked ? text.customAttribute(ChosenWord(id: id, text: piece)) : text
    }
    guard marked else { return one(words, offset) }
    var pieces: [Text] = []
    var at = offset
    for word in split(words) {
      pieces.append(one(word, at))
      at += (word as NSString).length
    }
    return MessageLine.joined(pieces)
  }
}

/**
 * A run of a message's words drawn with the chat's choice under it (the
 * system's highlight, or the bubble's own), then the agents' pills
 * (`MentionPills`), then the words; what of them is chosen goes to
 * `ChosenWords`.
 */
struct WordsRenderer: TextRenderer {
  var pills: MentionPills?
  var span: WordSpan?
  var tint: Color
  var recorder: ChosenWords.Recorder?

  var displayPadding: EdgeInsets { pills?.displayPadding ?? EdgeInsets() }

  func draw(layout: Text.Layout, in ctx: inout GraphicsContext) {
    if let span {
      let measured = ChosenWords.measure(layout, span: span)
      for band in measured.bands { ctx.fill(Path(band), with: .color(tint)) }
      recorder?.write(measured.text)
    }
    pills?.drawPills(layout, in: &ctx)
    for line in layout { ctx.draw(line) }
  }
}

/**
 * Words in the chat that a drag can choose: drawn by `WordsRenderer` with
 * the chat's choice, the I-beam over them; outside a chat, the agents'
 * pills alone (`MentionPills`), as before.
 */
struct Choosable: ViewModifier {
  /** Where the agents' pills are drawn, when the words have any (`MentionClicks`). */
  var spots: MentionSpots? = nil
  var dark = false
  /** The highlight: the system's, or another on a coloured bubble. */
  var tint: Color? = nil
  @Environment(TranscriptSelection.self) private var selection: TranscriptSelection?
  @Environment(\.transcriptRow) private var row
  /** Where these words sit in the transcript. */
  @State private var origin: CGPoint?

  @ViewBuilder
  func body(content: Content) -> some View {
    if let selection, let row {
      content
        .textRenderer(renderer(selection, row: row))
        .onGeometryChange(for: CGPoint.self) { proxy in
          proxy.frame(in: .named(TranscriptSelection.space)).origin
        } action: { value in
          origin = value
        }
        .pointerStyle(.horizontalText)
    } else if let spots {
      content.textRenderer(MentionPills(dark: dark, spots: spots))
    } else {
      content
    }
  }

  private func renderer(_ selection: TranscriptSelection, row: String) -> WordsRenderer {
    let span = origin.flatMap { origin in selection.span?.moved(by: origin) }
    return WordsRenderer(
      pills: spots.map { MentionPills(dark: dark, spots: $0) },
      span: span,
      tint: tint ?? Color(nsColor: .selectedTextBackgroundColor),
      recorder: origin.map { ChosenWords.Recorder(words: selection.chosen, row: row, origin: $0) }
    )
  }
}

/** SwiftUI's own selectable text, outside a chat only: in a chat the chat chooses (`TranscriptSelection`). */
struct OwnSelection: ViewModifier {
  @Environment(TranscriptSelection.self) private var selection: TranscriptSelection?

  @ViewBuilder
  func body(content: Content) -> some View {
    if selection == nil {
      content.textSelection(.enabled)
    } else {
      content
    }
  }
}

extension EnvironmentValues {
  /** The chat row being drawn: whose words a run of words chooses. */
  @Entry var transcriptRow: String? = nil
}
