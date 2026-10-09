import SwiftUI
import UIKit
import SimeonCore

/** A message's type: 15 pt on a 21 pt line, a point up from the Mac's 14 on 20 (`.sand-message-prose`) so it reads easily on a phone. */
enum MessageType {
  static let size: CGFloat = 15
  static let lineHeight: CGFloat = 21
  /** The person's bubble sets its text a point looser (22 pt). */
  static let mineLineHeight: CGFloat = 22

  static func spacing(size: CGFloat = size, lineHeight: CGFloat = lineHeight) -> CGFloat {
    max(0, lineHeight - UIFont.systemFont(ofSize: size).lineHeight)
  }
}

/** Who a message can name: the roster's agents, the person's own name (never dressed as an agent), and the theme the marks are drawn for. */
struct Mentioning: Equatable {
  var agents: [Mentions.AgentName]
  var personName: String?
  var dark: Bool

  init(agents: [Agent], personName: String?, dark: Bool) {
    self.init(names: agents.filter { !$0.isGroup }.map { Mentions.AgentName(name: $0.name.trimmingCharacters(in: .whitespaces), id: $0.id, colour: $0.palette.id) }, personName: personName, dark: dark)
  }

  init(names: [Mentions.AgentName], personName: String?, dark: Bool) {
    self.agents = names
    self.personName = personName
    self.dark = dark
  }
}

/**
 * The marks drawn into a line of text: a brand's logo (1.05 em square, .04 em
 * before it and .26 em after, `.simeon-app__logo`) and an agent's butterfly
 * (1.44 × 1.05 em, .02 em before and .22 em after, `.simeon-agent__mark`),
 * both sitting .18 em below the baseline. One image per mark, size and theme.
 */
@MainActor
enum MentionArt {
  private static var cache: [String: UIImage] = [:]

  static func brand(_ brand: BrandMention, em: CGFloat, dark: Bool) -> UIImage? {
    let key = "b|\(brand.key)|\(Int(em * 100))|\(dark)"
    if let made = cache[key] { return made }
    guard let logo = UIImage(named: "Brands/\(brand.key)") else { return nil }
    let tinted = brand.mono ? logo.withTintColor(UIColor(hex: dark ? brand.dark : brand.light), renderingMode: .alwaysOriginal) : logo
    let image = padded(width: em * (0.04 + 1.05 + 0.26), height: em * 1.05) { _ in
      tinted.draw(in: fit(tinted.size, in: CGRect(x: em * 0.04, y: 0, width: em * 1.05, height: em * 1.05)))
    }
    cache[key] = image
    return image
  }

  static func agent(_ palette: AgentPalette, em: CGFloat, dark: Bool) -> UIImage {
    let key = "a|\(palette.id)|\(Int(em * 100))|\(dark)"
    if let made = cache[key] { return made }
    let mark = MarkDrawing.mentionImage(palette, height: em * 1.05, dark: dark)
    let image = padded(width: em * (0.02 + 1.44 + 0.22), height: em * 1.05) { _ in
      mark.draw(in: fit(mark.size, in: CGRect(x: em * 0.02, y: 0, width: em * 1.44, height: em * 1.05)))
    }
    cache[key] = image
    return image
  }

  /** A connected app's mark for a card's tile (`Connectors/<slug>`), or a brand's, or nil. */
  static func connector(_ name: String) -> UIImage? {
    let slug = CatalogApp.slug(name)
    if let image = UIImage(named: "Connectors/\(slug)") { return image }
    if let brand = Brands.mentions.first(where: { $0.name.lowercased() == name.lowercased() }) { return UIImage(named: "Brands/\(brand.key)") }
    return nil
  }

  private static func padded(width: CGFloat, height: CGFloat, draw: (UIGraphicsImageRendererContext) -> Void) -> UIImage {
    UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: .preferred()).image(actions: draw)
  }

  private static func fit(_ size: CGSize, in rect: CGRect) -> CGRect {
    guard size.width > 0, size.height > 0 else { return rect }
    let scale = min(rect.width / size.width, rect.height / size.height)
    let w = size.width * scale, h = size.height * scale
    return CGRect(x: rect.minX + (rect.width - w) / 2, y: rect.minY + (rect.height - h) / 2, width: w, height: h)
  }
}

/**
 * A run of a message's text: Markdown's inline marks drawn the window's way
 * (bold at 600, italics, red code on a grey tint, struck text greyed, links
 * blue) and every name the Mac dresses: a brand with its logo and colour, an
 * agent with its butterfly and colour, both at 500 (the bold's own weight
 * inside bold), never inside code or a link.
 */
@MainActor
enum InlineText {
  private static var cache: [String: Text] = [:]

  static func make(_ markdown: String, size: CGFloat = MessageType.size, weight: Font.Weight = .regular, colour: Color? = nil, mentioning: Mentioning?) -> Text {
    let key = "\(size)|\(weight)|\(mentioning?.dark ?? false)|\(mentioning.map { $0.agents.map { "\($0.name)=\($0.colour)" }.joined(separator: ",") + "|" + ($0.personName ?? "") } ?? "-")|\(markdown)"
    if colour == nil, let made = cache[key] { return made }
    let made = build(markdown, size: size, weight: weight, colour: colour, mentioning: mentioning)
    if colour == nil {
      if cache.count > 600 { cache.removeAll(keepingCapacity: true) }
      cache[key] = made
    }
    return made
  }

  private struct Style { var bold = false; var italic = false; var code = false; var struck = false; var link = false }

  private static func build(_ markdown: String, size: CGFloat, weight: Font.Weight, colour: Color?, mentioning: Mentioning?) -> Text {
    let options = AttributedString.MarkdownParsingOptions(allowsExtendedAttributes: false, interpretedSyntax: .inlineOnlyPreservingWhitespace, failurePolicy: .returnPartiallyParsedIfPossible)
    let parsed = (try? AttributedString(markdown: markdown, options: options)) ?? AttributedString(markdown)

    // Each character's style, read from Markdown's marks.
    var styles: [Style] = []
    var characters: [Character] = []
    var links: [URL?] = []
    for run in parsed.runs {
      let intent = run.inlinePresentationIntent ?? []
      let style = Style(bold: intent.contains(.stronglyEmphasized), italic: intent.contains(.emphasized), code: intent.contains(.code), struck: intent.contains(.strikethrough), link: run.link != nil)
      for ch in parsed[run.range].characters { characters.append(ch); styles.append(style); links.append(run.link) }
    }
    let plain = String(characters)

    // Names, at character offsets; none inside code or a link.
    var marks: [(start: Int, end: Int, kind: Mentions.Kind)] = []
    if let mentioning {
      for match in Mentions.find(in: plain, agents: mentioning.agents, personName: mentioning.personName) {
        guard let range = Range(NSRange(location: match.location, length: match.length), in: plain) else { continue }
        let start = plain.distance(from: plain.startIndex, to: range.lowerBound)
        let end = start + plain[range].count
        guard start < styles.count, !(start..<end).contains(where: { styles[$0].code || styles[$0].link }) else { continue }
        marks.append((start, end, match.kind))
      }
    }

    func font(_ style: Style, mention: Bool = false) -> Font {
      if style.code { return .system(size: size * 0.93, design: .monospaced) }
      let w: Font.Weight = style.bold ? .semibold : mention ? .medium : weight
      let base = Font.system(size: size, weight: w)
      return style.italic ? base.italic() : base
    }

    func piece(_ from: Int, _ to: Int, mention: Color? = nil) -> AttributedString {
      var out = AttributedString()
      var i = from
      while i < to {
        var j = i + 1
        while j < to, styleKey(styles[j]) == styleKey(styles[i]), links[j] == links[i] { j += 1 }
        var run = AttributedString(String(characters[i..<j]))
        let style = styles[i]
        run.font = font(style, mention: mention != nil)
        if let mention { run.foregroundColor = mention }
        else if style.code { run.foregroundColor = Ink.codeInk; run.backgroundColor = Ink.codeTint }
        else if style.link { run.foregroundColor = Ink.link }
        else if style.struck { run.foregroundColor = Ink.tertiary }
        else if let colour { run.foregroundColor = colour }
        if style.struck { run.strikethroughStyle = Text.LineStyle.single }
        if let link = links[i] { run.link = link }
        out.append(run)
        i = j
      }
      return out
    }

    guard !marks.isEmpty else { return Text(piece(0, characters.count)) }
    var text = Text(verbatim: "")
    var cursor = 0
    let em = size
    for mark in marks {
      if mark.start > cursor { text = Text("\(text)\(Text(piece(cursor, mark.start)))") }
      switch mark.kind {
      case .brand(let brand):
        let tint = Color.dynamic(light: brand.light, dark: brand.dark)
        if let logo = MentionArt.brand(brand, em: em, dark: mentioning?.dark ?? false) {
          text = Text("\(text)\(Text(Image(uiImage: logo)).baselineOffset(-0.18 * em))")
        }
        text = Text("\(text)\(Text(piece(mark.start, mark.end, mention: tint)))")
      case .agent(_, let colourId):
        let palette = AgentPalette.named(colourId)
        let dark = mentioning?.dark ?? false
        let name = Brands.agentNameColours[palette.id]
        let tint = name.map { Color.dynamic(light: $0.light, dark: $0.dark) } ?? Color(palette.nameColour(dark: dark))
        text = Text("\(text)\(Text(Image(uiImage: MentionArt.agent(palette, em: em, dark: dark))).baselineOffset(-0.18 * em))")
        text = Text("\(text)\(Text(piece(mark.start, mark.end, mention: tint)))")
      }
      cursor = mark.end
    }
    if cursor < characters.count { text = Text("\(text)\(Text(piece(cursor, characters.count)))") }
    return text
  }

  private static func styleKey(_ style: Style) -> Int {
    (style.bold ? 1 : 0) | (style.italic ? 2 : 0) | (style.code ? 4 : 0) | (style.struck ? 8 : 0) | (style.link ? 16 : 0)
  }
}

/** An agent's message, block by block (`kPn`): paragraphs, headings, lists, quotes, code, tables. */
struct MarkdownView: View {
  let blocks: [MarkdownBlock]
  let mentioning: Mentioning?
  var depth = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
        MarkdownBlockView(block: block, mentioning: mentioning, depth: depth)
      }
    }
  }
}

struct MarkdownBlockView: View {
  let block: MarkdownBlock
  let mentioning: Mentioning?
  let depth: Int

  var body: some View {
    switch block {
    case .paragraph(let text):
      InlineText.make(text, mentioning: mentioning)
        .lineSpacing(MessageType.spacing())
        .fixedSize(horizontal: false, vertical: true)
    case .heading(let level, let text):
      // A point over the Mac's: h1 23 / 29, h2 18 / 25, h3 and below the message's own 15 / 21 with 8 above; all 600.
      let size: CGFloat = level == 1 ? 23 : level == 2 ? 18 : MessageType.size
      let line: CGFloat = level == 1 ? 29 : level == 2 ? 25 : MessageType.lineHeight
      InlineText.make(text, size: size, weight: .semibold, mentioning: mentioning)
        .lineSpacing(MessageType.spacing(size: size, lineHeight: line))
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, level >= 3 ? 8 : 0)
    case .list(let ordered, let start, let items):
      MarkdownList(ordered: ordered, start: start, items: items, mentioning: mentioning, depth: depth)
    case .quote(let inner):
      HStack(alignment: .top, spacing: 0) {
        Rectangle().fill(Ink.tertiary).frame(width: 2)
        MarkdownView(blocks: inner, mentioning: mentioning, depth: depth)
          .foregroundStyle(Ink.secondary)
          .padding(.leading, 10)
      }
      .fixedSize(horizontal: false, vertical: true)
    case .code(_, let text):
      CodeBlockView(text: text)
    case .table(let header, let alignments, let rows):
      MarkdownTable(header: header, alignments: alignments, rows: rows, mentioning: mentioning)
    case .rule:
      Color.clear.frame(height: 1)
    }
  }
}

/** Bullets go disc, circle, square; numbers go 1., a., i. (the window's nesting); a task's box is the chat's blue when done. */
struct MarkdownList: View {
  let ordered: Bool
  let start: Int
  let items: [MarkdownListItem]
  let mentioning: Mentioning?
  let depth: Int

  var body: some View {
    VStack(alignment: .leading, spacing: items.contains { $0.checked != nil } ? 8 : 4) {
      ForEach(Array(items.enumerated()), id: \.offset) { index, item in
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          marker(index, item)
          MarkdownView(blocks: item.blocks, mentioning: mentioning, depth: depth + 1)
        }
      }
    }
    .padding(.leading, ordered ? 2 : 4)
  }

  @ViewBuilder
  private func marker(_ index: Int, _ item: MarkdownListItem) -> some View {
    if let checked = item.checked {
      ZStack {
        RoundedRectangle(cornerRadius: 4, style: .continuous)
          .fill(checked ? Ink.blue : Ink.field)
          .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).stroke(checked ? Color.clear : Ink.tertiary.opacity(0.75), lineWidth: 1))
        if checked { Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.white) }
      }
      .frame(width: 16, height: 16)
      .alignmentGuide(.firstTextBaseline) { d in d[.bottom] - 3 }
    } else if ordered {
      Text(Self.number(start + index, depth: depth))
        .font(.system(size: MessageType.size)).monospacedDigit()
        .foregroundStyle(Ink.secondary)
        .frame(minWidth: 14, alignment: .trailing)
    } else {
      Text(["•", "◦", "▪︎"][min(depth, 2)])
        .font(.system(size: MessageType.size))
        .foregroundStyle(Ink.secondary)
        .frame(width: 10, alignment: .center)
    }
  }

  static func number(_ n: Int, depth: Int) -> String {
    switch depth % 3 {
    case 1:
      let letters = Array("abcdefghijklmnopqrstuvwxyz")
      return "\(letters[(max(n, 1) - 1) % 26])."
    case 2:
      return "\(roman(n))."
    default:
      return "\(n)."
    }
  }

  static func roman(_ number: Int) -> String {
    let table: [(Int, String)] = [(1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
    var n = max(1, number), out = ""
    for (value, letters) in table { while n >= value { out += letters; n -= value } }
    return out
  }
}

/** A fenced block: monospaced on the field's white, a hairline edge, sideways scrolling, Copy in its menu. */
struct CodeBlockView: View {
  let text: String
  @State private var expanded = false

  var body: some View {
    // A code block does not wrap, so it is laid out whole: 200 lines of at most 1,000 characters each (2,000 lines open).
    let shown = Chat.clippedCode(text, lines: expanded ? 2_000 : 200, width: 1_000)
    VStack(alignment: .leading, spacing: 0) {
    ScrollView(.horizontal, showsIndicators: false) {
      Text(shown.text)
        .font(.system(size: 14, design: .monospaced))
        .foregroundStyle(Ink.theirsText)
        .lineSpacing(3)
        .fixedSize(horizontal: true, vertical: true)
        .padding(.horizontal, 12).padding(.vertical, 6)
    }
    if shown.clipped || expanded {
      Button { expanded.toggle() } label: {
        Text(expanded ? "Show less" : "Show more").font(.system(size: 12, weight: .medium)).foregroundStyle(Ink.secondary)
          .padding(.horizontal, 12).padding(.bottom, 8).padding(.top, 2)
          .contentShape(.rect)
      }
      .buttonStyle(.plain)
    }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Ink.hairline, lineWidth: 1))
    .contextMenu {
      Button { UIPasteboard.general.string = text } label: { Label("Copy", systemImage: "doc.on.doc") }
    }
  }
}

/** A table: 13 pt, the header at 500, the cells grey, hairlines between rows, sideways scrolling when wide. */
struct MarkdownTable: View {
  let header: [String]
  let alignments: [MarkdownAlignment]
  let rows: [[String]]
  let mentioning: Mentioning?

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
        GridRow {
          ForEach(Array(header.enumerated()), id: \.offset) { index, cell in
            InlineText.make(cell, size: 14, weight: .medium, mentioning: mentioning)
              .foregroundStyle(Ink.primary)
              .gridColumnAlignment(alignment(index))
              .padding(8)
          }
        }
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          Divider().overlay(Ink.hairline).gridCellUnsizedAxes(.horizontal)
          GridRow {
            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
              InlineText.make(cell, size: 14, mentioning: mentioning)
                .foregroundStyle(Ink.secondary)
                .padding(8)
            }
          }
        }
      }
      .fixedSize()
    }
  }

  private func alignment(_ index: Int) -> HorizontalAlignment {
    switch index < alignments.count ? alignments[index] : .leading {
    case .center: return .center
    case .trailing: return .trailing
    case .leading: return .leading
    }
  }
}
