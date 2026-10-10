import AppKit
import PDFKit
import Quartz
import SwiftUI
import SimeonCore

// MARK: PDF

/** The PDF preview's zoom and page, shared by its head's controls and its pages (`evn`). */
@MainActor
@Observable
final class PDFControl {
  /** The zoom over fitting the width: 0.5 to 4, a quarter a step. */
  static let step = 0.25
  var zoom = 1.0
  var page = 1
  var pages = 0

  func zoom(by delta: Double) { zoom = min(4, max(0.5, zoom + delta)) }
}

/** The PDF's controls in the head (`sand-file-viewer__toolbar`, 8 apart): Zoom out, "1 / 2" (11, at 60%), Zoom in. */
struct PDFToolbar: View {
  let control: PDFControl
  let look: Look

  var body: some View {
    HStack(spacing: 8) {
      ToolButton(symbol: "minus.magnifyingglass", label: "Zoom out", look: look) { control.zoom(by: -PDFControl.step) }
        .disabled(control.zoom <= 0.5)
      Text("\(control.page) / \(control.pages)")
        .font(.system(size: 11))
        .monospacedDigit()
        .foregroundStyle(look.inkSecondary)
        .frame(width: 78)
      ToolButton(symbol: "plus.magnifyingglass", label: "Zoom in", look: look) { control.zoom(by: PDFControl.step) }
        .disabled(control.zoom >= 4)
    }
  }
}

/** A small head button (`ui-icon-button`): 20, 4 round, its glyph 12 at 60%. */
private struct ToolButton: View {
  let symbol: String
  let label: String
  let look: Look
  let action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 20, height: 20)
        .background(hovered ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 4))
        .contentShape(RoundedRectangle(cornerRadius: 4))
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .help(label)
    .accessibilityLabel(label)
  }
}

/**
 * A PDF's pages (`sand-pdf-page`) in Apple's PDF view: one under another,
 * 16 apart, as wide as the panel less 32 times the zoom, each with its
 * number at its foot (11, white at 90%, on black at 55%, 8 up). The words
 * can be chosen and copied, as in the window's text layer.
 */
struct PDFBody: NSViewRepresentable {
  let document: PDFDocument
  let control: PDFControl
  let look: Look

  func makeCoordinator() -> Coordinator { Coordinator(control: control) }

  func makeNSView(context: Context) -> FittedPDFView {
    let view = FittedPDFView()
    view.autoScales = false
    view.displayMode = .singlePageContinuous
    view.displaysPageBreaks = true
    view.pageBreakMargins = NSEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
    view.pageShadowsEnabled = true
    view.backgroundColor = NSColor(look.ground)
    view.pageOverlayViewProvider = context.coordinator
    view.document = document
    view.onWidth = { [weak coordinator = context.coordinator, weak view] in
      guard let coordinator, let view else { return }
      coordinator.fit(view)
    }
    NotificationCenter.default.addObserver(context.coordinator, selector: #selector(Coordinator.pageChanged(_:)), name: .PDFViewPageChanged, object: view)
    context.coordinator.view = view
    return view
  }

  func updateNSView(_ view: FittedPDFView, context: Context) {
    view.backgroundColor = NSColor(look.ground)
    if context.coordinator.zoom != control.zoom {
      context.coordinator.zoom = control.zoom
      context.coordinator.fit(view)
    }
  }

  static func dismantleNSView(_ view: FittedPDFView, coordinator: Coordinator) {
    NotificationCenter.default.removeObserver(coordinator)
  }

  @MainActor
  final class Coordinator: NSObject, PDFPageOverlayViewProvider {
    let control: PDFControl
    var zoom = 1.0
    weak var view: PDFView?

    init(control: PDFControl) { self.control = control }

    /** The window's scale: the panel's width less 32 over the first page's, a quarter to four, times the zoom. */
    func fit(_ view: PDFView) {
      guard let page = view.document?.page(at: 0) else { return }
      let pageWidth = page.bounds(for: .cropBox).width
      guard pageWidth > 0, view.bounds.width > 32 else { return }
      let base = min(4, max(0.25, (view.bounds.width - 32) / pageWidth))
      view.scaleFactor = base * zoom
    }

    @objc func pageChanged(_ note: Notification) {
      guard let view, let page = view.currentPage, let document = view.document else { return }
      let index = document.index(for: page) + 1
      if control.page != index { control.page = index }
    }

    func pdfView(_ view: PDFView, overlayViewFor page: PDFPage) -> NSView? {
      let overlay = PageBadge()
      overlay.number = (view.document?.index(for: page) ?? 0) + 1
      return overlay
    }
  }
}

/** A page's number at its foot (`sand-pdf-page__badge`): 11, white at 90%, on a black pill at 55%, padded 2 8, 8 up. */
final class PageBadge: NSView {
  var number = 1

  override func hitTest(_ point: NSPoint) -> NSView? { nil }

  override func draw(_ dirtyRect: NSRect) {
    let words = NSAttributedString(string: "\(number)", attributes: [
      .font: NSFont.systemFont(ofSize: 11),
      .foregroundColor: NSColor.white.withAlphaComponent(0.9),
    ])
    let size = words.size()
    let width = max(22, ceil(size.width) + 16)
    let height: CGFloat = 18
    let y = isFlipped ? bounds.maxY - 8 - height : bounds.minY + 8
    let pill = NSRect(x: bounds.midX - width / 2, y: y, width: width, height: height)
    NSColor.black.withAlphaComponent(0.55).setFill()
    NSBezierPath(roundedRect: pill, xRadius: height / 2, yRadius: height / 2).fill()
    words.draw(at: NSPoint(x: pill.midX - size.width / 2, y: pill.midY - size.height / 2))
  }
}

/** Apple's PDF view, saying when its width changes so the pages fit it again. */
final class FittedPDFView: PDFView {
  var onWidth: (() -> Void)?

  override func setFrameSize(_ newSize: NSSize) {
    let changed = abs(newSize.width - frame.width) > 0.5
    super.setFrameSize(newSize)
    if changed { onWidth?() }
  }
}

// MARK: Markdown

/**
 * A Markdown file as a page (`sand-file-markdown-page`): at most 624 wide
 * and centred, padded 40 above, 56 below and 32 at the sides; its words 15
 * on 24 in the text colour, its blocks 12 apart, drawn as a message's are
 * but with the page's headings, lists, tables and quotes. App and agent
 * names are left as words.
 */
struct MarkdownPage: View {
  let text: String
  let look: Look

  var body: some View {
    let blocks = Markdown.blocks(text)
    let line = MessageLine(size: 15, lineHeight: 24, colour: look.ink, look: look, agents: [], personName: nil, marksNames: false)
    ScrollView(.vertical) {
      MessageBlocks(blocks: blocks, line: line, spacing: 12)
        .environment(\.proseDocument, true)
        .textSelection(.enabled)
        .padding(.top, 40)
        .padding(.bottom, 56)
        .padding(.horizontal, 32)
        .frame(maxWidth: 624, alignment: .leading)
        .frame(maxWidth: .infinity)
    }
  }
}

// MARK: Code and text

/**
 * A text or code file (`g1t`): its line numbers down the left (12.5 on 20,
 * at 30%, padded 16 12 24 16, staying while the lines scroll sideways),
 * its lines beside them never wrapping (12.5 on 20, monospaced, padded 16
 * 24 24 16), coloured as the window colours them (highlight.js, the
 * window's palette). The words can be chosen and copied.
 */
struct CodeBody: NSViewRepresentable {
  let text: String
  let name: String
  let look: Look

  static let font = NSFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeNSView(context: Context) -> NSScrollView {
    let scroll = NSScrollView()
    scroll.drawsBackground = false
    scroll.hasVerticalScroller = true
    scroll.hasHorizontalScroller = true
    scroll.autohidesScrollers = true
    let view = NSTextView(frame: .zero)
    view.isEditable = false
    view.isSelectable = true
    view.isRichText = true
    view.drawsBackground = false
    view.textContainerInset = NSSize(width: 0, height: 16)
    view.textContainer?.lineFragmentPadding = 0
    view.textContainer?.widthTracksTextView = false
    view.textContainer?.containerSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    view.isHorizontallyResizable = true
    view.isVerticallyResizable = true
    view.autoresizingMask = []
    view.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    scroll.documentView = view
    let ruler = LineNumbers(scrollView: scroll, look: look)
    ruler.clientView = view
    scroll.verticalRulerView = ruler
    scroll.hasVerticalRuler = true
    scroll.rulersVisible = true
    context.coordinator.show(text, name: name, look: look, in: view, ruler: ruler)
    return scroll
  }

  func updateNSView(_ scroll: NSScrollView, context: Context) {
    guard let view = scroll.documentView as? NSTextView, let ruler = scroll.verticalRulerView as? LineNumbers else { return }
    if context.coordinator.shown != text || context.coordinator.dark != look.dark {
      context.coordinator.show(text, name: name, look: look, in: view, ruler: ruler)
    }
  }

  /** The lines' look: 12.5 on 20, the extra half of the line above and below as CSS sets it. */
  static func attributes(_ colour: NSColor) -> [NSAttributedString.Key: Any] {
    let style = NSMutableParagraphStyle()
    style.minimumLineHeight = 20
    style.maximumLineHeight = 20
    let spare = 20 - (font.ascender - font.descender + font.leading)
    return [.font: font, .foregroundColor: colour, .paragraphStyle: style, .baselineOffset: spare / 4]
  }

  @MainActor
  final class Coordinator {
    var shown: String?
    var dark = false

    func show(_ text: String, name: String, look: Look, in view: NSTextView, ruler: LineNumbers) {
      shown = text
      dark = look.dark
      ruler.look = look
      ruler.lines = text.reduce(into: 1) { count, character in if character == "\n" || character == "\r\n" { count += 1 } }
      let plain = NSAttributedString(string: text, attributes: CodeBody.attributes(NSColor(look.ink)))
      view.textStorage?.setAttributedString(plain)
      view.textContainerInset = NSSize(width: 16, height: 16)
      ruler.needsDisplay = true
      guard let language = FilePreview.language(name) else { return }
      Task {
        guard let runs = await CodeColours.shared.runs(text, language: language) else { return }
        guard self.shown == text, self.dark == look.dark else { return }
        view.textStorage?.setAttributedString(CodeColours.attributed(text, runs: runs, look: look))
      }
    }
  }
}

/** The line numbers beside a text file: one every 20 points from 16 down, right-aligned, at 30%, on the ground. */
final class LineNumbers: NSRulerView {
  var look: Look
  var lines = 1 { didSet { ruleThickness = max(37, CGFloat(String(lines).count) * 7.6 + 28) } }

  init(scrollView: NSScrollView, look: Look) {
    self.look = look
    super.init(scrollView: scrollView, orientation: .verticalRuler)
    ruleThickness = 37
  }

  required init(coder: NSCoder) { fatalError("not from a nib") }

  override func drawHashMarksAndLabels(in rect: NSRect) {
    NSColor(look.ground).setFill()
    rect.fill()
    guard let text = clientView else { return }
    // Where the text's top is in the ruler, so the numbers move with the lines.
    let origin = convert(NSPoint.zero, from: text).y
    let first = max(0, Int((rect.minY - origin - 16) / 20))
    let last = min(lines - 1, Int((rect.maxY - origin - 16) / 20) + 1)
    guard first <= last else { return }
    let attributes = CodeBody.attributes(NSColor(look.ink.opacity(0.3)))
    for index in first...last {
      let words = NSAttributedString(string: "\(index + 1)", attributes: attributes)
      let width = words.size().width
      words.draw(at: NSPoint(x: ruleThickness - 12 - width, y: origin + 16 + CGFloat(index) * 20))
    }
  }

  override var isFlipped: Bool { true }
}

// MARK: JSON

/**
 * A JSON file as a tree (`qkn`): 12 on 20.4, monospaced, at 60%, padded 16
 * 24 28; open two levels deep. Each object and list has its caret (16 wide,
 * at 30%), its name, and its size ("{5 keys}", "[2 items]", at 40%); its
 * entries 16 in under a line at the edge, at most 200 then "… 12 more".
 * Names amber, strings green, numbers orange, true, false and null violet,
 * the colon at 30%. A file that is not JSON shows as text.
 */
struct JSONBody: View {
  let text: String
  let name: String
  let look: Look
  @State private var tree: JSONTree??

  var body: some View {
    Group {
      switch tree {
      case nil:
        ViewerState(look: look, loading: "Loading file…")
      case .some(nil):
        CodeBody(text: text, name: name, look: look)
      case .some(.some(let root)):
        ScrollView([.vertical, .horizontal]) {
          JSONNode(name: nil, value: root, depth: 0, look: look)
            .font(.system(size: 12, design: .monospaced))
            .textSelection(.enabled)
            .padding(.top, 16)
            .padding(.bottom, 28)
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    }
    .task(id: text) {
      let source = text
      tree = .some(await Task.detached { JSONTree.parse(source) }.value)
    }
  }
}

private struct JSONNode: View {
  let name: String?
  let value: JSONTree
  let depth: Int
  let look: Look
  @State private var open: Bool

  init(name: String?, value: JSONTree, depth: Int, look: Look) {
    self.name = name
    self.value = value
    self.depth = depth
    self.look = look
    _open = State(initialValue: depth < 2)
  }

  var body: some View {
    if let entries = value.entries {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 0) {
          if !entries.isEmpty {
            Button { open.toggle() } label: {
              Image(systemName: open ? "chevron.down" : "chevron.right")
                .font(.system(size: 8, weight: .semibold))
                .foregroundStyle(look.ink.opacity(0.3))
                .frame(width: 16, height: 20)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(open ? "Collapse" : "Expand") \(name ?? "root")")
          } else {
            Color.clear.frame(width: 16, height: 20)
          }
          label
          Text(FilePreview.jsonSummary(isList: value.isList, count: entries.count))
            .foregroundStyle(look.inkTertiary)
        }
        .frame(height: 20.4, alignment: .leading)
        if open, !entries.isEmpty {
          let shown = Array(entries.prefix(FilePreview.jsonEntries))
          VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(shown.enumerated()), id: \.offset) { _, entry in
              JSONNode(name: entry.name, value: entry.value, depth: depth + 1, look: look)
            }
            if entries.count > shown.count {
              Text("… \(entries.count - shown.count) more")
                .foregroundStyle(look.inkTertiary)
                .padding(.leading, 16)
                .frame(height: 20.4, alignment: .leading)
            }
          }
          .padding(.leading, 9)
          .overlay(alignment: .leading) { Rectangle().fill(look.ink.opacity(0.06)).frame(width: 1) }
          .padding(.leading, 7)
        }
      }
    } else {
      HStack(alignment: .firstTextBaseline, spacing: 0) {
        Color.clear.frame(width: 16, height: 1)
        label
        Text(value.written).foregroundStyle(colour)
      }
      .frame(minHeight: 20.4, alignment: .leading)
    }
  }

  /** "name: " with the name in amber and the colon at 30%. */
  @ViewBuilder
  private var label: some View {
    if let name {
      Text(name).foregroundStyle(look.jsonKey)
      Text(": ").foregroundStyle(look.ink.opacity(0.3))
    }
  }

  private var colour: Color {
    switch value {
    case .string: return look.jsonString
    case .number: return look.jsonNumber
    default: return look.jsonKeyword
    }
  }
}

// MARK: Spreadsheets

/**
 * A CSV or TSV (`wvn`): a grid padded 12, 12.5 with even figures at 60%;
 * each cell padded 5 10, at most 360 wide and cut with an ellipsis, a
 * hairline (10%) round it; the head row and the row numbers on the text
 * mixed 6% into the ground, the head at 500 in the text colour, the
 * numbers at 30%; the head row stays while the rows scroll. A cell clicked
 * is chosen (grey) and its words open at the foot in a card ("Revenue ·
 * row 2"), clicked again they close. At most 2000 rows and 200 columns.
 */
struct TableBody: View {
  let sheet: FilePreview.Sheet
  let look: Look
  @State private var chosen: (row: Int, column: Int)?
  @State private var widths: [CGFloat] = []

  static let font = NSFont.systemFont(ofSize: 12.5)

  var body: some View {
    let columns = min(FilePreview.tableColumns, sheet.rows.map(\.count).max() ?? 0)
    let heading = sheet.rows.first ?? []
    let rows = Array(sheet.rows.dropFirst())
    Group {
      if sheet.rows.isEmpty {
        ViewerState(look: look, symbol: "tablecells", title: "This sheet is empty")
      } else {
        ScrollView([.vertical, .horizontal]) {
          LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
            Section {
              ForEach(0..<rows.count, id: \.self) { index in
                row(rows[index], number: "\(index + 1)", rowIndex: index, columns: columns, head: false)
              }
            } header: {
              row(heading, number: "", rowIndex: -1, columns: columns, head: true)
            }
          }
          .padding(12)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .overlay(alignment: .bottom) { detail(heading: heading, rows: rows) }
      }
    }
    .task(id: sheet) { widths = Self.widths(sheet, columns: columns) }
  }

  private func row(_ cells: [String], number: String, rowIndex: Int, columns: Int, head: Bool) -> some View {
    HStack(spacing: 0) {
      Text(number)
        .font(.system(size: 12.5, weight: head ? .medium : .regular))
        .monospacedDigit()
        .foregroundStyle(look.ink.opacity(0.3))
        .padding(.vertical, 5)
        .padding(.horizontal, 10)
        .frame(width: numberWidth, height: 25, alignment: .leading)
        .background(look.tableHead)
        .border(look.ink.opacity(0.1), width: 0.5)
      ForEach(0..<columns, id: \.self) { column in
        let words = column < cells.count ? cells[column] : ""
        let picked = chosen.map { $0.row == rowIndex && $0.column == column } ?? false
        Text(words)
          .font(.system(size: 12.5, weight: head ? .medium : .regular))
          .monospacedDigit()
          .foregroundStyle(head || picked ? look.ink : look.inkSecondary)
          .lineLimit(1)
          .truncationMode(.tail)
          .padding(.vertical, 5)
          .padding(.horizontal, 10)
          .frame(width: column < widths.count ? widths[column] : 80, height: 25, alignment: .leading)
          .background(picked ? look.selectedCell : head ? look.tableHead : .clear)
          .border(look.ink.opacity(0.1), width: 0.5)
          .contentShape(Rectangle())
          .help(words)
          .onTapGesture {
            chosen = picked ? nil : (rowIndex, column)
          }
      }
    }
  }

  /** The row number column: as wide as the largest number. */
  private var numberWidth: CGFloat {
    let widest = ("\(max(1, sheet.rows.count - 1))" as NSString).size(withAttributes: [.font: TableBody.font]).width
    return ceil(widest) + 21
  }

  @ViewBuilder
  private func detail(heading: [String], rows: [[String]]) -> some View {
    if let chosen {
      let cells = chosen.row < 0 ? heading : (chosen.row < rows.count ? rows[chosen.row] : [])
      let words = chosen.column < cells.count ? cells[chosen.column] : ""
      if !words.isEmpty {
        let label = FilePreview.cellLabel(column: chosen.column, row: chosen.row, heading: chosen.column < heading.count ? heading[chosen.column] : "")
        GeometryReader { box in
          VStack(spacing: 0) {
            Spacer(minLength: 0)
            CellDetail(label: label, words: words, look: look) { self.chosen = nil }
              .frame(maxHeight: box.size.height * 0.45)
          }
        }
        .padding(12)
      }
    }
  }

  /** Each column as wide as its widest cell in the first rows, padded, at most 360. */
  static func widths(_ sheet: FilePreview.Sheet, columns: Int) -> [CGFloat] {
    var widths = [CGFloat](repeating: 40, count: columns)
    let attributes: [NSAttributedString.Key: Any] = [.font: font]
    let medium: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12.5, weight: .medium)]
    for (index, row) in sheet.rows.prefix(200).enumerated() {
      for column in 0..<min(columns, row.count) where !row[column].isEmpty {
        let width = (row[column] as NSString).size(withAttributes: index == 0 ? medium : attributes).width
        widths[column] = max(widths[column], min(360, ceil(width) + 21))
      }
    }
    return widths
  }
}

/**
 * A chosen cell's words (`wvn`'s detail): a card 12 in from the table's
 * sides and foot, at most 45% of its height, 10 round with a hairline and a
 * soft shadow; its head ("Revenue · row 2", 12, 500, at 40%, padded 6 12
 * 6 8, a hairline under it) with Close; the words 12.5 on 1.5, padded 10
 * 14 12, scrolling when longer.
 */
private struct CellDetail: View {
  let label: String
  let words: String
  let look: Look
  let close: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 8) {
        Text(label)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(look.inkTertiary)
          .lineLimit(1)
        Spacer(minLength: 0)
        Button(action: close) {
          Image(systemName: "xmark")
            .font(.system(size: 10, weight: .medium))
            .foregroundStyle(look.inkSecondary)
            .frame(width: 20, height: 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help("Close cell detail")
        .accessibilityLabel("Close cell detail")
      }
      .padding(.vertical, 6)
      .padding(.leading, 12)
      .padding(.trailing, 8)
      .overlay(alignment: .bottom) { Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1) }
      ViewThatFits(in: .vertical) {
        wordsView
        ScrollView(.vertical) { wordsView }
      }
    }
    .background(look.dark ? Color(hex: 0x1a1a1a) : Color.white, in: RoundedRectangle(cornerRadius: 10))
    .clipShape(RoundedRectangle(cornerRadius: 10))
    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(look.ink.opacity(0.1), lineWidth: 1) }
    .shadow(color: .black.opacity(0.4), radius: 16, x: 0, y: 12)
  }

  private var wordsView: some View {
    Text(words)
      .font(.system(size: 12.5))
      .monospacedDigit()
      .foregroundStyle(look.ink)
      .cssLineHeight(18.75, size: 12.5)
      .textSelection(.enabled)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 10)
      .padding(.bottom, 12)
      .padding(.horizontal, 14)
  }
}

// MARK: Word, Excel and audio

/**
 * A Word document, an Excel workbook or a sound (the window draws these
 * with its own readers and player): Apple's Quick Look shows them here,
 * from a copy of the file in the app's temporary folder.
 */
struct QuickLookBody: NSViewRepresentable {
  let data: Data
  let name: String

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeNSView(context: Context) -> QLPreviewView {
    let view: QLPreviewView = QLPreviewView(frame: .zero, style: .normal)
    view.shouldCloseWithWindow = false
    let file = QuickLookBody.file(data, name: name)
    context.coordinator.folder = file?.deletingLastPathComponent()
    view.previewItem = file as NSURL?
    return view
  }

  func updateNSView(_ view: QLPreviewView, context: Context) {}

  static func dismantleNSView(_ view: QLPreviewView, coordinator: Coordinator) {
    view.close()
    if let folder = coordinator.folder { try? FileManager.default.removeItem(at: folder) }
  }

  final class Coordinator {
    var folder: URL?
  }

  /** The file written where Quick Look can read it, under its own name. */
  static func file(_ data: Data, name: String) -> URL? {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("Preview-\(UUID().uuidString)", isDirectory: true)
    let safe = name.replacingOccurrences(of: "/", with: "-")
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let url = folder.appendingPathComponent(safe.isEmpty ? "file" : safe)
      try data.write(to: url)
      return url
    } catch {
      return nil
    }
  }
}
