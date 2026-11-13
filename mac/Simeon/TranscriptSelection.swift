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
 * As on a page (the founder, 12 November 2026: "double click dont select.
 * select and going up dont move the screen"): a double click chooses the word
 * under it, a triple click its paragraph, a shift-click carries a drag's
 * choice on to it, and a drag held past the chat's top or bottom scrolls the
 * chat that way, the choice going with it (`Transcript.scrollWhileChoosing`).
 * The choice's ends are kept on their messages, so rows drawn above while it
 * scrolls (or a new message) do not move it off its words. The mouse-up that
 * ends a drag is not a click: the words stay chosen for ⌘C and the right
 * click's Copy (`MessageMenu`).
 */
@MainActor
@Observable
final class TranscriptSelection {
  /** The transcript's own space: the rows' places and the drag are read in it, so scrolling changes neither. */
  nonisolated static let space = "transcript.words"
  /** The chat whose words are chosen, for ⌘C wherever the keys are (`MainWindow`, `FieldTextView`). */
  static weak var current: TranscriptSelection?

  /**
   * Words are chosen, until they are let go. Read by the messages to lay out
   * their words as pieces each can be read back from (`ChosenWord`): only
   * meanwhile, as it costs.
   */
  private(set) var active = false
  /** Where the choice began, and where it is now, in `space`; one point for a word or a paragraph. */
  private(set) var anchor: CGPoint?
  private(set) var focus: CGPoint?
  /** From point to point (a drag), or the word or paragraph under a double or triple click. */
  private(set) var grain = WordGrain.points

  /** What each run of words in view has chosen, written as it draws. */
  let chosen = ChosenWords()
  /** The chat's rows in order, as last drawn. */
  @ObservationIgnored var rows: [ChatRow] = []
  /** Each row laid out now and where. */
  @ObservationIgnored private var frames: [String: CGRect] = [:]
  /** The rows under the choice's start and its end, and where in them: the ends move with their rows. */
  @ObservationIgnored private var anchorRow: String?
  @ObservationIgnored private var focusRow: String?
  @ObservationIgnored private var anchorOffset: CGSize?
  @ObservationIgnored private var focusOffset: CGSize?
  /** A drag is under way: where it began (as the gesture gives it, which tells one drag from the next), and when it last moved. */
  @ObservationIgnored private(set) var dragging = false
  @ObservationIgnored private var dragStart: CGPoint?
  @ObservationIgnored private var movedAt = Date.distantPast
  /** When the last drag ended: its mouse-up is not a click that lets the words go. */
  @ObservationIgnored private var endedAt = Date.distantPast
  /** Where `space` stands in the scroll view's own space (`.scrollView`), and the pointer there while a drag is under way. */
  @ObservationIgnored private var origin = CGPoint.zero
  @ObservationIgnored private var pointer: CGPoint?

  var span: WordSpan? {
    guard active, let anchor, let focus else { return nil }
    if grain != .points { return WordSpan(start: anchor, end: anchor, grain: grain) }
    return anchor.y <= focus.y ? WordSpan(start: anchor, end: focus) : WordSpan(start: focus, end: anchor)
  }

  /** A row laid out, and where: an end of the choice on it moves with it. */
  func place(_ row: String, _ frame: CGRect) {
    frames[row] = frame
    guard active else { return }
    if row == anchorRow, let offset = anchorOffset {
      let next = CGPoint(x: frame.minX + offset.width, y: frame.minY + offset.height)
      if TranscriptSelection.differs(anchor, next) { anchor = next }
    }
    // While a drag is under way its end is the pointer (`contentMoved`).
    if !dragging, row == focusRow, let offset = focusOffset {
      let next = CGPoint(x: frame.minX + offset.width, y: frame.minY + offset.height)
      if TranscriptSelection.differs(focus, next) { focus = next }
    }
  }

  /** A row out of the laid-out range: its place no longer holds. */
  func forget(_ row: String) { frames[row] = nil }

  /** The drag, from where it began to where it is now. */
  func drag(from start: CGPoint, to now: CGPoint) {
    if !dragging || dragStart != start {
      // A new drag: the last choice goes, and words chosen in a field with it (one choice at a time, as a page's).
      dragging = true
      dragStart = start
      begin(.points, at: start)
    }
    movedAt = Date()
    pointer = CGPoint(x: now.x + origin.x, y: now.y + origin.y)
    reach(now)
  }

  /** The drag let go: the words stay chosen. */
  func dragEnded() {
    dragging = false
    pointer = nil
    endedAt = Date()
  }

  /**
   * A click in the chat, with how many in a row (`NSEvent.clickCount`): one
   * lets the words go (with shift, carries a drag's choice on to it), two
   * choose the word under it, three its paragraph. Decided once the event is
   * done, so that the mouse-up ending a drag, should it come as a click too,
   * is known as the drag's.
   */
  func click(at point: CGPoint, count: Int, shift: Bool) {
    DispatchQueue.main.async { [self] in
      if dragging && Date().timeIntervalSince(movedAt) < 1 { return }
      if Date().timeIntervalSince(endedAt) < 0.3 { return }
      // A drag cancelled without its end (the chat changed under it) ends here.
      dragging = false
      switch count {
      case 2:
        begin(.word, at: point)
      case 3...:
        begin(.paragraph, at: point)
      default:
        if shift && active && grain == .points && anchor != nil {
          reach(point)
        } else {
          clear()
        }
      }
    }
  }

  /**
   * The chat's content moved in the scroll view (scrolled, rows drawn above):
   * `origin` is where `space` now stands in `.scrollView`. A drag's end stays
   * under the pointer, which has not moved.
   */
  func contentMoved(_ origin: CGPoint) {
    self.origin = origin
    guard dragging, let pointer else { return }
    reach(CGPoint(x: pointer.x - origin.x, y: pointer.y - origin.y))
  }

  /**
   * How far the chat scrolls this moment while a drag holds near or past its
   * top (`top`, under the chat's head) or its bottom (`bottom`, over the
   * message field), both in `.scrollView`: up is less than 0, the further out
   * the faster; nil when the pointer is between them, or no drag is.
   */
  func edgeStep(top: CGFloat, bottom: CGFloat) -> CGFloat? {
    guard dragging, let pointer else { return nil }
    let band: CGFloat = 16
    if pointer.y < top + band { return -TranscriptSelection.step(top + band - pointer.y) }
    if pointer.y > bottom - band { return TranscriptSelection.step(pointer.y - (bottom - band)) }
    return nil
  }

  /** Points a sixtieth of a second, by how far past the edge the pointer is: slowly at the edge, at most 36. */
  nonisolated static func step(_ beyond: CGFloat) -> CGFloat { min(36, 3 + max(0, beyond) * 0.35) }

  /** The words let go: a click, another chat, words chosen in the message field. */
  func clear() {
    dragging = false
    dragStart = nil
    pointer = nil
    guard active || anchor != nil else { return }
    active = false
    anchor = nil
    focus = nil
    grain = .points
    anchorRow = nil
    focusRow = nil
    anchorOffset = nil
    focusOffset = nil
    chosen.clear()
    if TranscriptSelection.current === self { TranscriptSelection.current = nil }
  }

  /** The messages the choice runs through include this one. */
  func includes(_ id: String) -> Bool {
    guard active, let a = anchorRow, let f = focusRow,
          let ai = rows.firstIndex(where: { $0.id == a }), let fi = rows.firstIndex(where: { $0.id == f }),
          let index = rows.firstIndex(where: { $0.id == id }) else { return false }
    return index >= min(ai, fi) && index <= max(ai, fi)
  }

  /** A new choice from `point`: the last one goes, and words chosen in a field with it (one choice at a time, as a page's). */
  private func begin(_ grain: WordGrain, at point: CGPoint) {
    chosen.clear()
    self.grain = grain
    let under = row(at: point)
    anchor = point
    anchorRow = under
    anchorOffset = offset(of: point, in: under)
    focus = point
    focusRow = under
    focusOffset = anchorOffset
    active = true
    TranscriptSelection.current = self
    TranscriptSelection.collapseFieldChoice()
  }

  /** The choice's end, here now. */
  private func reach(_ point: CGPoint) {
    if TranscriptSelection.differs(focus, point) { focus = point }
    focusRow = row(at: point)
    focusOffset = offset(of: point, in: focusRow)
  }

  /** Where a point is from a row's top left, to follow the row. */
  private func offset(of point: CGPoint, in row: String?) -> CGSize? {
    guard let row, let frame = frames[row] else { return nil }
    return CGSize(width: point.x - frame.minX, height: point.y - frame.minY)
  }

  /** A point is set only when it moved, so the words are drawn again only then. */
  private static func differs(_ point: CGPoint?, _ next: CGPoint) -> Bool {
    guard let point else { return true }
    return abs(point.x - next.x) >= 0.25 || abs(point.y - next.y) >= 0.25
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
        // A message between the first and the last is chosen whole: its own words, not what of it was last drawn.
        text = TranscriptSelection.whole(row) ?? drawn
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

/** How a choice of words is made: from point to point (a drag), or the word or the paragraph under a point (a double or triple click). */
enum WordGrain: Equatable, Sendable {
  case points, word, paragraph
}

/** The chat's choice of words from its start to its end, the higher first, in some view's own space. */
struct WordSpan: Equatable, Sendable {
  var start: CGPoint
  var end: CGPoint
  /** For a word or a paragraph, `start` is the point under the click. */
  var grain = WordGrain.points

  func moved(by origin: CGPoint) -> WordSpan {
    WordSpan(start: CGPoint(x: start.x - origin.x, y: start.y - origin.y), end: CGPoint(x: end.x - origin.x, y: end.y - origin.y), grain: grain)
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

  private static func key(_ row: String, _ origin: CGPoint) -> String {
    "\(row)|\(Int(origin.y.rounded()))|\(Int(origin.x.rounded()))"
  }

  func record(row: String, origin: CGPoint, text: String) {
    let key = ChosenWords.key(row, origin)
    lock.lock()
    defer { lock.unlock() }
    pieces[key] = Piece(row: row, origin: origin, text: text)
  }

  /**
   * A run of words moved (rows drawn above it, a new width): what it wrote
   * where it was goes, or its words would be copied twice.
   */
  func drop(row: String, origin: CGPoint) {
    let key = ChosenWords.key(row, origin)
    lock.lock()
    defer { lock.unlock() }
    pieces[key] = nil
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
    switch span.grain {
    case .points:
      break
    case .word:
      return word(in: layout, at: span.start)
    case .paragraph:
      // All of these words, when the click is on them.
      guard line(in: layout, at: span.start) != nil else { return ([], "") }
      let far: CGFloat = 1_000_000
      return measure(layout, span: WordSpan(start: CGPoint(x: -far, y: -far), end: CGPoint(x: far, y: far)))
    }
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

  /**
   * The line under a point, its band reaching down to the next line (as a
   * drag's does), and the point over its words give or take 4 points; nil
   * when the point is beside or between these words, not on them.
   */
  static func line(in layout: Text.Layout, at point: CGPoint) -> Int? {
    let lines = Array(layout)
    for (index, line) in lines.enumerated() {
      let box = line.typographicBounds.rect
      let below = index + 1 < lines.count ? lines[index + 1].typographicBounds.rect.minY : box.maxY
      guard point.y >= box.minY, point.y <= max(box.maxY, below) else { continue }
      return point.x >= box.minX - 4 && point.x <= box.maxX + 4 ? index : nil
    }
    return nil
  }

  /**
   * A double click: the word under the point (the `ChosenWord` piece under
   * it, or the nearest on its line), without the spaces after it; a link or
   * a piece of code whole. Its glyphs are counted as `measure` counts them,
   * each standing for the piece's character at the same place.
   */
  static func word(in layout: Text.Layout, at point: CGPoint) -> (bands: [CGRect], text: String) {
    guard let hit = line(in: layout, at: point) else { return ([], "") }
    let lines = Array(layout)
    var found: (word: ChosenWord, distance: CGFloat)?
    for run in lines[hit] {
      guard let word = run[ChosenWord.self] else { continue }
      for glyph in run {
        let rect = glyph.typographicBounds.rect
        let distance = point.x < rect.minX ? rect.minX - point.x : point.x > rect.maxX ? point.x - rect.maxX : 0
        if found == nil || distance < found!.distance { found = (word, distance) }
      }
    }
    guard let word = found?.word else { return ([], "") }
    let characters = Array(word.text)
    var keep = characters.count
    while keep > 0, characters[keep - 1].isWhitespace { keep -= 1 }
    guard keep > 0 else { return ([], "") }
    var bands: [CGRect] = []
    var counts: [Int: Int] = [:]
    for (index, line) in lines.enumerated() {
      let box = line.typographicBounds.rect
      let below = index + 1 < lines.count ? lines[index + 1].typographicBounds.rect.minY : box.maxY
      let bottom = max(box.maxY, below)
      var low: CGFloat?
      var high: CGFloat?
      for run in line {
        guard let piece = run[ChosenWord.self], piece.id == word.id else { continue }
        for glyph in run {
          let at = counts[piece.id, default: 0]
          counts[piece.id] = at + 1
          guard at < keep else { continue }
          let rect = glyph.typographicBounds.rect
          low = min(low ?? rect.minX, rect.minX)
          high = max(high ?? rect.maxX, rect.maxX)
        }
      }
      if let low, let high, high > low {
        bands.append(CGRect(x: low, y: box.minY, width: high - low, height: bottom - box.minY))
      }
    }
    return (bands, String(characters[0..<keep]))
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
          // Moved: what these words wrote of the choice where they were goes (`ChosenWords.drop`).
          if let old = origin, old != value { selection.chosen.drop(row: row, origin: old) }
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
