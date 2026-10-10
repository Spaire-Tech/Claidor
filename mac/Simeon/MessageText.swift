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
 * The pictures inside a message's words, made once: an app's logo before
 * its name (`simeon-app__logo`, 1.05 em square) and an agent's butterfly
 * before its name (`simeon-agent__mark`, 1.44 × 1.05 em, the mark's
 * `3 30 223 163` crop).
 */
@MainActor
enum InlineImages {
  private static var logos: [String: NSImage] = [:]
  private static var marks: [String: NSImage] = [:]

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

  /** The agent's butterfly, `size` points, in its palette. */
  static func mark(_ palette: AgentPalette, dark: Bool, size: CGSize) -> NSImage? {
    let id = "\(palette.id)-\(dark)-\(size.width)x\(size.height)"
    if let hit = marks[id] { return hit }
    let renderer = ImageRenderer(content: MentionMark(palette: palette, dark: dark).frame(width: size.width, height: size.height))
    renderer.scale = NSScreen.main?.backingScaleFactor ?? 2
    guard let image = renderer.nsImage else { return nil }
    marks[id] = image
    return image
  }
}

/** The butterfly beside an agent's name: the window's mention mark (`AGENT_MENTION_VIEWBOX`). */
private struct MentionMark: View {
  let palette: AgentPalette
  let dark: Bool

  static let crop = CGRect(x: 3, y: 30, width: 223, height: 163)

  var body: some View {
    Canvas { context, size in
      ButterflyArt.draw(&context, transform: ButterflyArt.transform(showing: Self.crop, in: CGRect(origin: .zero, size: size)), palette: palette, dark: dark, style: .live)
    }
  }
}

/**
 * One line of an agent's message as the window writes it (react-markdown,
 * then `__simeonAppMentions` and `__simeonAgentMentions`): bold at 600,
 * italics, code, strikethrough and links; then, in each run of plain words
 * (never in a link or code), app names in their colour after their logo and
 * agents' names in theirs after their butterfly, both at 500, or bold inside
 * bold. The person's own name is never an agent's.
 */
@MainActor
struct MessageLine {
  let size: CGFloat
  let colour: Color
  let look: Look
  let agents: [Mentions.AgentName]
  let personName: String?

  func text(_ markdown: String) -> Text {
    let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace, failurePolicy: .returnPartiallyParsedIfPossible)
    let parsed = (try? AttributedString(markdown: markdown, options: options)) ?? AttributedString(markdown)
    var pieces: [Text] = []
    for run in parsed.runs {
      let words = String(parsed[run.range].characters)
      let intent = run.inlinePresentationIntent ?? []
      let style = Style(bold: intent.contains(.stronglyEmphasized), italic: intent.contains(.emphasized), code: intent.contains(.code), struck: intent.contains(.strikethrough))
      if let link = run.link {
        var container = AttributeContainer()
        container.link = link
        pieces.append(style.apply(Text(AttributedString(words, attributes: container)), size: size))
        continue
      }
      if style.code {
        pieces.append(style.apply(Text(verbatim: words).foregroundColor(colour), size: size))
        continue
      }
      let ns = words as NSString
      var cursor = 0
      for match in Mentions.find(in: words, agents: agents, personName: personName) {
        if match.location > cursor {
          pieces.append(style.apply(Text(verbatim: ns.substring(with: NSRange(location: cursor, length: match.location - cursor))).foregroundColor(colour), size: size))
        }
        let name = ns.substring(with: NSRange(location: match.location, length: match.length))
        pieces.append(mention(name, kind: match.kind, style: style))
        cursor = match.location + match.length
      }
      if cursor < ns.length {
        pieces.append(style.apply(Text(verbatim: ns.substring(from: cursor)).foregroundColor(colour), size: size))
      }
    }
    return MessageLine.joined(pieces)
  }

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
      let words = style.apply(Text(verbatim: kept).foregroundColor(tint).fontWeight(weight), size: size)
      guard let logo = InlineImages.logo(brand.key, side: (1.05 * size).rounded()) else { return words }
      let picture = Text(Image(nsImage: logo).renderingMode(brand.mono ? .template : .original)).foregroundColor(tint).baselineOffset(drop)
      return MessageLine.joined([picture, Text(verbatim: "\u{202F}"), words])
    case .agent(_, let paletteId):
      let palette = AgentPalette.named(paletteId)
      let hex = Brands.agentNameColours[palette.id].map { look.dark ? $0.dark : $0.light }
      let tint = hex.map { Color(RGB(hex: $0)) } ?? nameColour(palette)
      let words = style.apply(Text(verbatim: kept).foregroundColor(tint).fontWeight(weight), size: size)
      guard let mark = InlineImages.mark(palette, dark: look.dark, size: CGSize(width: (1.44 * size).rounded(), height: (1.05 * size).rounded())) else { return words }
      let picture = Text(Image(nsImage: mark)).baselineOffset(drop)
      return MessageLine.joined([picture, Text(verbatim: "\u{202F}"), words])
    }
  }

  private func nameColour(_ palette: AgentPalette) -> Color { Color(palette.nameColour(dark: look.dark)) }

  /** A run's Markdown: bold (the window's `strong`, 600), italics, code, strikethrough. */
  struct Style {
    let bold: Bool
    let italic: Bool
    let code: Bool
    let struck: Bool

    func apply(_ text: Text, size: CGFloat) -> Text {
      var text = text
      if code { text = text.font(.system(size: size - 1, design: .monospaced)) }
      if bold { text = text.fontWeight(.semibold) }
      if italic { text = text.italic() }
      if struck { text = text.strikethrough() }
      return text
    }
  }
}

/**
 * An agent's message as blocks (SimeonCore's `Markdown`, the window's
 * react-markdown): paragraphs 10 apart (`sand-message-prose`), headings,
 * lists, quotes, code, tables, rules and maths. Step 2b measures each
 * block against the window; until then they are drawn plainly.
 */
struct MessageBlocks: View {
  let blocks: [MarkdownBlock]
  let line: MessageLine

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
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
      line.text(text)
        .fixedSize(horizontal: false, vertical: true)
    case .heading(let level, let text):
      line.text(text)
        .font(.system(size: level == 1 ? 17 : level == 2 ? 15 : line.size, weight: .semibold))
        .fixedSize(horizontal: false, vertical: true)
    case .list(let ordered, let start, let items):
      VStack(alignment: .leading, spacing: 4) {
        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
          HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(verbatim: marker(ordered: ordered, number: start + index, checked: item.checked))
              .foregroundStyle(line.look.inkSecondary)
              .frame(minWidth: 14, alignment: .trailing)
            // A list's item holds blocks of its own, lists among them.
            AnyView(MessageBlocks(blocks: item.blocks, line: line))
          }
        }
      }
    case .quote(let blocks):
      HStack(alignment: .top, spacing: 10) {
        RoundedRectangle(cornerRadius: 1.5)
          .fill(line.look.inkTertiary)
          .frame(width: 3)
        AnyView(MessageBlocks(blocks: blocks, line: line))
      }
      .fixedSize(horizontal: false, vertical: true)
    case .code(_, let text):
      ScrollView(.horizontal) {
        Text(verbatim: text)
          .font(.system(size: 12.5, design: .monospaced))
          .foregroundStyle(line.colour)
          .textSelection(.enabled)
          .padding(10)
      }
      .scrollIndicators(.never)
      .background(line.look.ink.opacity(0.05), in: RoundedRectangle(cornerRadius: 8))
    case .table(let header, _, let rows):
      Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
        GridRow {
          ForEach(Array(header.enumerated()), id: \.offset) { _, cell in
            line.text(cell).fontWeight(.semibold)
          }
        }
        Divider()
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          GridRow {
            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
              line.text(cell)
            }
          }
        }
      }
    case .rule:
      Rectangle().fill(line.look.ink.opacity(0.12)).frame(height: 1)
    case .math(let tex):
      Text(verbatim: tex)
        .font(.system(size: 13, design: .monospaced))
        .foregroundStyle(line.colour)
    }
  }

  private func marker(ordered: Bool, number: Int, checked: Bool?) -> String {
    if let checked { return checked ? "☑" : "☐" }
    return ordered ? "\(number)." : "•"
  }
}
