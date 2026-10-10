import AppKit
import SwiftUI
import SimeonCore

/**
 * The window's CSS line heights on Apple's text. A CSS line height leaves
 * the room beyond the face's own height between lines and splits it above
 * the first line and below the last; SwiftUI puts it only between lines,
 * so the rest goes above and below.
 */
enum LineBox {
  static func extra(size: CGFloat, weight: NSFont.Weight = .regular, lineHeight: CGFloat) -> CGFloat {
    let font = NSFont.systemFont(ofSize: size, weight: weight)
    return max(0, lineHeight - (font.ascender - font.descender + font.leading))
  }
}

extension View {
  /** Text of `size` set on the window's `lineHeight`. */
  func cssLineHeight(_ lineHeight: CGFloat, size: CGFloat, weight: NSFont.Weight = .regular) -> some View {
    let extra = LineBox.extra(size: size, weight: weight, lineHeight: lineHeight)
    return self.lineSpacing(extra).padding(.vertical, extra / 2)
  }
}

/**
 * The pictures inside a message's words: an app's logo before its name
 * (`simeon-app__logo`, 1.05 em square), made once, and an agent's butterfly
 * before its name (`simeon-agent__mark`, 1.44 × 1.05 em, the mark's
 * `3 30 223 163` crop), drawn in place.
 */
@MainActor
enum InlineImages {
  private static var logos: [String: NSImage] = [:]

  /** The window's crop of the butterfly beside an agent's name (`AGENT_MENTION_VIEWBOX`). */
  static let markCrop = CGRect(x: 3, y: 30, width: 223, height: 163)

  /** The app's logo from the app's own copy (`Brands/<key>`), at most `side` points each way. */
  static func logo(_ key: String, side: CGFloat) -> NSImage? {
    let id = "\(key)@\(side)"
    if let hit = logos[id] { return hit }
    guard let source = NSImage(named: "Brands/\(key)"), let copy = source.copy() as? NSImage else { return nil }
    let w = source.size.width, h = source.size.height
    guard w > 0, h > 0 else { return nil }
    let scale = min(side / w, side / h)
    copy.size = NSSize(width: w * scale, height: h * scale)
    logos[id] = copy
    return copy
  }

  /** The agent's butterfly beside its name, drawn by SwiftUI where the words are laid out. */
  static func mark(_ palette: AgentPalette, dark: Bool, size: CGSize) -> Image {
    Image(size: size) { context in
      ButterflyArt.draw(&context, transform: ButterflyArt.transform(showing: markCrop, in: CGRect(origin: .zero, size: size)), palette: palette, dark: dark, style: .live)
    }
  }
}


/**
 * One line of a message as the window writes it (react-markdown with
 * GitHub's extensions, then `__simeonAppMentions` and
 * `__simeonAgentMentions`): bold at 600, italics, strikethrough at 40%, code
 * in red on grey (`refunds`), links in the link blue with no underline, a
 * bare address made a link; then, in each run of plain words (never in a
 * link or code), app names in their colour after their logo and agents'
 * names in theirs after their butterfly, both at 500, or bold inside bold.
 * The person's own name is never an agent's.
 */
@MainActor
struct MessageLine {
  let size: CGFloat
  let lineHeight: CGFloat
  let colour: Color
  let look: Look
  let agents: [Mentions.AgentName]
  let personName: String?

  /** The same line at another size or in another colour (a heading, a table, a quote). */
  func with(size: CGFloat? = nil, lineHeight: CGFloat? = nil, colour: Color? = nil) -> MessageLine {
    MessageLine(size: size ?? self.size, lineHeight: lineHeight ?? self.lineHeight, colour: colour ?? self.colour, look: look, agents: agents, personName: personName)
  }

  func text(_ markdown: String) -> Text {
    let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace, failurePolicy: .returnPartiallyParsedIfPossible)
    let parsed = (try? AttributedString(markdown: markdown, options: options)) ?? AttributedString(markdown)
    var pieces: [Text] = []
    for run in parsed.runs {
      let words = String(parsed[run.range].characters)
      let intent = run.inlinePresentationIntent ?? []
      let style = Style(bold: intent.contains(.stronglyEmphasized), italic: intent.contains(.emphasized), code: intent.contains(.code), struck: intent.contains(.strikethrough))
      if let link = run.link {
        pieces.append(linked(words, link, style: style))
        continue
      }
      if style.code {
        pieces.append(code(words))
        continue
      }
      for part in MessageLine.autolinks(words) {
        if let url = part.url {
          pieces.append(linked(part.text, url, style: style))
        } else {
          pieces += plain(part.text, style: style)
        }
      }
    }
    return MessageLine.joined(pieces)
  }

  /** Words with their app and agent names. */
  private func plain(_ words: String, style: Style) -> [Text] {
    let ink = style.struck ? look.inkTertiary : colour
    let ns = words as NSString
    var pieces: [Text] = []
    var cursor = 0
    for match in Mentions.find(in: words, agents: agents, personName: personName) {
      if match.location > cursor {
        pieces.append(style.apply(Text(verbatim: ns.substring(with: NSRange(location: cursor, length: match.location - cursor))).foregroundColor(ink)))
      }
      let name = ns.substring(with: NSRange(location: match.location, length: match.length))
      pieces.append(mention(name, kind: match.kind, style: style))
      cursor = match.location + match.length
    }
    if cursor < ns.length {
      pieces.append(style.apply(Text(verbatim: ns.substring(from: cursor)).foregroundColor(ink)))
    }
    return pieces
  }

  /** A link: the link blue (the bubble's tint), no underline. */
  private func linked(_ words: String, _ url: URL, style: Style) -> Text {
    var container = AttributeContainer()
    container.link = url
    return style.apply(Text(AttributedString(words, attributes: container)))
  }

  /** Inline code: 0.93 em monospaced, red on a grey wash (`code`, padded 0 4 and 4 round in the window). */
  private func code(_ words: String) -> Text {
    var piece = AttributedString("\u{2009}" + words + "\u{2009}")
    piece.font = .system(size: (size * 0.93 * 100).rounded() / 100, design: .monospaced)
    piece.foregroundColor = look.codeInk
    piece.backgroundColor = look.codeWash
    return Text(piece)
  }

  /**
   * GitHub's bare links (`remark-gfm`'s autolink literals): an address that
   * starts `http://`, `https://` or `www.`, its trailing stop left out.
   */
  static func autolinks(_ words: String) -> [(text: String, url: URL?)] {
    guard words.contains("http") || words.contains("www.") else { return [(words, nil)] }
    let ns = words as NSString
    guard let detector = MessageLine.detector else { return [(words, nil)] }
    var parts: [(text: String, url: URL?)] = []
    var cursor = 0
    for match in detector.matches(in: words, range: NSRange(location: 0, length: ns.length)) {
      let found = ns.substring(with: match.range)
      let lower = found.lowercased()
      guard lower.hasPrefix("http://") || lower.hasPrefix("https://") || lower.hasPrefix("www."), match.range.location >= cursor else { continue }
      let url = lower.hasPrefix("www.") ? URL(string: "http://" + found) : URL(string: found)
      guard let url else { continue }
      if match.range.location > cursor { parts.append((ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor)), nil)) }
      parts.append((found, url))
      cursor = match.range.location + match.range.length
    }
    if cursor < ns.length { parts.append((ns.substring(from: cursor), nil)) }
    return parts.isEmpty ? [(words, nil)] : parts
  }

  private static let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

  /** Pieces of text as one, so they wrap as one line of words. */
  static func joined(_ pieces: [Text]) -> Text {
    guard var whole = pieces.first else { return Text(verbatim: "") }
    for piece in pieces.dropFirst() { whole = Text("\(whole)\(piece)") }
    return whole
  }

  /** An app's or an agent's name with its picture, the two kept on one line. */
  private func mention(_ name: String, kind: Mentions.Kind, style: Style) -> Text {
    // `white-space: nowrap`: the name's spaces do not break, nor the gap after the picture.
    let kept = name.replacingOccurrences(of: " ", with: "\u{00A0}")
    let weight: Font.Weight = style.bold ? .semibold : .medium
    let drop = -0.18 * size
    switch kind {
    case .brand(let brand):
      let tint = Color(RGB(hex: look.dark ? brand.dark : brand.light))
      let words = style.apply(Text(verbatim: kept).foregroundColor(tint).fontWeight(weight))
      guard let logo = InlineImages.logo(brand.key, side: (1.05 * size).rounded()) else { return words }
      let picture = Text(Image(nsImage: logo).renderingMode(brand.mono ? .template : .original)).foregroundColor(tint).baselineOffset(drop)
      return MessageLine.joined([picture, Text(verbatim: "\u{202F}"), words])
    case .agent(_, let paletteId):
      let palette = AgentPalette.named(paletteId)
      let hex = Brands.agentNameColours[palette.id].map { look.dark ? $0.dark : $0.light }
      let tint = hex.map { Color(RGB(hex: $0)) } ?? Color(palette.nameColour(dark: look.dark))
      let words = style.apply(Text(verbatim: kept).foregroundColor(tint).fontWeight(weight))
      let mark = InlineImages.mark(palette, dark: look.dark, size: CGSize(width: (1.44 * size).rounded(), height: (1.05 * size).rounded()))
      let picture = Text(mark).baselineOffset(drop)
      return MessageLine.joined([picture, Text(verbatim: "\u{202F}"), words])
    }
  }

  /** A run's Markdown: bold (the window's `strong`, 600), italics, strikethrough. */
  struct Style {
    let bold: Bool
    let italic: Bool
    let code: Bool
    let struck: Bool

    func apply(_ text: Text) -> Text {
      var text = text
      if bold { text = text.fontWeight(.semibold) }
      if italic { text = text.italic() }
      if struck { text = text.strikethrough() }
      return text
    }
  }
}

/**
 * An agent's message as blocks (SimeonCore's `Markdown`, the window's
 * react-markdown, `sand-message-prose`), 10 apart: paragraphs 14 on 20;
 * headings at 600 (# 22 on 28, ## 17 on 24, ### and smaller 14 on 20 with
 * 8 more above); lists, quotes, code, tables, rules, maths and diagrams as
 * measured below.
 */
struct MessageBlocks: View {
  let blocks: [MarkdownBlock]
  let line: MessageLine
  var spacing: CGFloat = 10

  var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        BlockView(block: block, line: line)
      }
    }
  }
}

private struct BlockView: View {
  let block: MarkdownBlock
  let line: MessageLine

  var body: some View {
    switch block {
    case .paragraph(let text):
      if Markdown.inlineMath(text) != nil {
        DrawingView(drawing: .mathsInLine(text), look: line.look)
      } else {
        paragraph(text, line: line)
      }
    case .heading(let level, let text):
      let size: CGFloat = level == 1 ? 22 : level == 2 ? 17 : 14
      let height: CGFloat = level == 1 ? 28 : level == 2 ? 24 : 20
      let tracking: CGFloat = level == 1 ? -0.264 : level == 2 ? -0.136 : -0.042
      line.with(size: size, lineHeight: height).text(text)
        .font(.system(size: size, weight: .semibold))
        .tracking(tracking)
        .fixedSize(horizontal: false, vertical: true)
        .cssLineHeight(height, size: size, weight: .semibold)
        .padding(.top, level >= 3 ? 8 : 0)
    case .list(let ordered, let start, let items):
      ListBlock(ordered: ordered, start: start, items: items, depth: 0, line: line)
    case .quote(let blocks):
      // `blockquote`: a 2-point bar at 30%, the words 10 in, at 60%.
      HStack(alignment: .top, spacing: 0) {
        Rectangle()
          .fill(line.look.ink.opacity(0.3))
          .frame(width: 2)
        AnyView(MessageBlocks(blocks: blocks, line: line.with(colour: line.look.inkSecondary)))
          .padding(.leading, 10)
      }
      .fixedSize(horizontal: false, vertical: true)
    case .code(let language, let text):
      if language?.lowercased() == "mermaid" {
        DrawingView(drawing: .diagram(text), look: line.look)
      } else {
        CodeBlock(language: language, text: text, look: line.look)
      }
    case .table(let header, let alignments, let rows):
      TableBlock(header: header, alignments: alignments, rows: rows, line: line)
    case .rule:
      // The window's rule is drawn with no width: only its line of space shows.
      Color.clear.frame(height: 1)
    case .math(let tex):
      DrawingView(drawing: .maths(tex), look: line.look)
    }
  }
}

/** A paragraph at the line's size and line height. */
@MainActor
private func paragraph(_ text: String, line: MessageLine) -> some View {
  line.text(text)
    .font(.system(size: line.size))
    .fixedSize(horizontal: false, vertical: true)
    .cssLineHeight(line.lineHeight, size: line.size)
}

/**
 * A list (`ol`, `ul`): 20 in (16 for a list inside a list), its items 4
 * apart, numbers and bullets at 40% (tabular figures), bullets a disc, then
 * a circle, then a square. A list with check boxes (`contains-task-list`)
 * is 13 on 18, 4 in, with no bullets; a checked item's box is the window's
 * blue with a white tick, an open one the ground with a 30% edge, 16 and 4
 * round; its items 8 apart.
 */
private struct ListBlock: View {
  let ordered: Bool
  let start: Int
  let items: [MarkdownListItem]
  let depth: Int
  let line: MessageLine

  var body: some View {
    let tasks = items.contains { $0.checked != nil }
    let itemLine = tasks ? line.with(size: 13, lineHeight: 18) : line
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(items.enumerated()), id: \.offset) { index, item in
        HStack(alignment: .firstTextBaseline, spacing: 0) {
          if let checked = item.checked {
            CheckBox(checked: checked, look: line.look)
              .padding(.trailing, 6)
          } else if !tasks {
            Text(verbatim: marker(index))
              .font(.system(size: line.size))
              .monospacedDigit()
              .foregroundStyle(line.look.inkTertiary)
              .lineLimit(1)
              .fixedSize()
              .frame(width: indent - 4, alignment: .trailing)
              .padding(.trailing, 4)
          }
          ItemBlocks(blocks: item.blocks, line: itemLine, depth: depth)
        }
        .padding(.top, index == 0 ? 0 : (tasks && item.checked != nil ? 8 : 4))
      }
    }
    .padding(.leading, tasks ? 4 : 0)
  }

  private var indent: CGFloat { depth == 0 ? 20 : 16 }

  private func marker(_ index: Int) -> String {
    if ordered { return "\(start + index)." }
    switch depth {
    case 0: return "•"
    case 1: return "◦"
    default: return "▪"
    }
  }
}

/** An item's own blocks: its words, then any list inside it, 4 below. */
private struct ItemBlocks: View {
  let blocks: [MarkdownBlock]
  let line: MessageLine
  let depth: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        switch block {
        case .list(let ordered, let start, let items):
          AnyView(ListBlock(ordered: ordered, start: start, items: items, depth: depth + 1, line: line))
        case .paragraph(let text):
          paragraph(text, line: line)
        default:
          AnyView(BlockView(block: block, line: line))
        }
      }
    }
  }
}

/** A task list's box (`sand-markdown-checkbox`). */
private struct CheckBox: View {
  let checked: Bool
  let look: Look

  var body: some View {
    RoundedRectangle(cornerRadius: 4)
      .fill(checked ? look.yours : look.ground)
      .overlay {
        RoundedRectangle(cornerRadius: 4).strokeBorder(checked ? Color.clear : look.ink.opacity(0.3), lineWidth: 1)
      }
      .overlay {
        if checked {
          Image(systemName: "checkmark")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(look.yoursText)
        }
      }
      .frame(width: 16, height: 16)
      .alignmentGuide(.firstTextBaseline) { box in box[.bottom] - 3 }
      .accessibilityLabel(checked ? "Done" : "Not done")
  }
}

/**
 * A table: 13 on 18, each cell padded 8, the heading row at 500 in the
 * text colour, the others at 60%, a hairline (10%) under every row but the
 * last, each column aligned as written; wider than the message, it scrolls.
 */
private struct TableBlock: View {
  let header: [String]
  let alignments: [MarkdownAlignment]
  let rows: [[String]]
  let line: MessageLine

  var body: some View {
    let look = line.look
    let head = line.with(size: 13, lineHeight: 18, colour: look.ink)
    let cells = line.with(size: 13, lineHeight: 18, colour: look.inkSecondary)
    ScrollView(.horizontal) {
      Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
        GridRow {
          ForEach(0..<header.count, id: \.self) { column in
            cell(header[column], column: column, line: head)
              .fontWeight(.medium)
          }
        }
        Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1).gridCellUnsizedAxes(.horizontal)
        ForEach(0..<rows.count, id: \.self) { index in
          GridRow {
            ForEach(0..<header.count, id: \.self) { column in
              cell(column < rows[index].count ? rows[index][column] : "", column: column, line: cells)
            }
          }
          if index < rows.count - 1 {
            Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1).gridCellUnsizedAxes(.horizontal)
          }
        }
      }
      .fixedSize()
    }
    .scrollIndicators(.never)
  }

  private func cell(_ text: String, column: Int, line: MessageLine) -> some View {
    let alignment = column < alignments.count ? alignments[column] : .leading
    return line.text(text)
      .font(.system(size: 13))
      .multilineTextAlignment(alignment == .trailing ? .trailing : alignment == .center ? .center : .leading)
      .cssLineHeight(18, size: 13)
      .padding(8)
      .gridColumnAlignment(alignment == .trailing ? .trailing : alignment == .center ? .center : .leading)
  }
}

/**
 * A code block (`ui-code-block`): the ground, a 10% edge, 10 round; its
 * lines 12 on 18 monospaced at 92% (`#d6d6dd` on dark), 10 in and 6 from top
 * and bottom; wider than the message, it scrolls. Copy at its top right
 * under the pointer. The window colours the words by language; that is not
 * copied yet.
 */
struct CodeBlock: View {
  let language: String?
  let text: String
  let look: Look
  @State private var hovering = false
  @State private var copied = false

  var body: some View {
    let lines = text.components(separatedBy: "\n")
    ScrollView(.horizontal) {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(lines.enumerated()), id: \.offset) { _, words in
          Text(verbatim: words.isEmpty ? " " : words)
            .font(.system(size: 12, design: .monospaced))
            .foregroundStyle(look.codeText)
            .lineLimit(1)
            .fixedSize()
            .frame(height: 18, alignment: .leading)
        }
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .textSelection(.enabled)
    }
    .scrollIndicators(.never)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(look.ground, in: RoundedRectangle(cornerRadius: 10))
    .overlay { RoundedRectangle(cornerRadius: 10).strokeBorder(look.ink.opacity(0.1), lineWidth: 1) }
    .overlay(alignment: .topTrailing) {
      if hovering {
        Button {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(text, forType: .string)
          copied = true
        } label: {
          Image(systemName: copied ? "checkmark" : "doc.on.doc")
            .font(.system(size: 11))
            .foregroundStyle(look.inkSecondary)
            .frame(width: 24, height: 24)
            .contentShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .help("Copy code")
        .accessibilityLabel("Copy code")
        .padding(4)
      }
    }
    .onHover { inside in
      hovering = inside
      if !inside { copied = false }
    }
  }
}
