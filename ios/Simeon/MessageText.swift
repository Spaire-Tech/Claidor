import SwiftUI
#if os(iOS)
import UIKit
#endif
import SimeonCore

/**
 * A message's type: on the iPhone 17 pt on a 23 pt line, the size Messages
 * sets (the founder asked twice for bigger); on the Mac the Mac window's,
 * 14 on 20 (`.sand-message-prose`).
 */
enum MessageType {
  #if os(macOS)
  static let size: CGFloat = 14
  static let lineHeight: CGFloat = 20
  static let mineLineHeight: CGFloat = 21
  #else
  /** 18 pt since 11 October 2026 (the founder: "increase the font size slightly"); it was 17 on 23 and 24. */
  static let size: CGFloat = 18
  static let lineHeight: CGFloat = 24
  /** The person's bubble sets its text a point looser (25 pt). */
  static let mineLineHeight: CGFloat = 25
  #endif

  static func spacing(size: CGFloat = size, lineHeight: CGFloat = lineHeight) -> CGFloat {
    max(0, lineHeight - UIFont.systemFont(ofSize: size).lineHeight)
  }
}

/** Who a message can name: the roster's agents, the person's own name (never dressed as an agent), the agent who wrote it (its own name is not dressed either), and the theme the marks are drawn for. */
struct Mentioning: Equatable {
  var agents: [Mentions.AgentName]
  var personName: String?
  var speaker: String?
  var dark: Bool

  init(agents: [Agent], personName: String?, dark: Bool) {
    self.init(names: agents.filter { !$0.isGroup }.map { Mentions.AgentName(name: $0.name.trimmingCharacters(in: .whitespaces), id: $0.id, picture: $0.picture) }, personName: personName, dark: dark)
  }

  init(names: [Mentions.AgentName], personName: String?, speaker: String? = nil, dark: Bool) {
    self.agents = names
    self.personName = personName
    self.speaker = speaker
    self.dark = dark
  }

  /** The same for a message the agent with this id wrote. */
  func spoken(by speaker: String?) -> Mentioning {
    var out = self
    out.speaker = speaker
    return out
  }
}

/**
 * The marks drawn into a line of text: a brand's logo (1.05 em square, .04 em
 * before it and .26 em after, `.simeon-app__logo`), sitting .18 em below the
 * baseline, and an agent's face in its glass pill (`MentionPills`): a 1.1 em
 * circle with .22 em of the pill before it and .24 em after, and the pill's
 * end after the name. One image per mark, size and theme.
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

  /** An agent's face for its mention: its picture in a 1.1 em circle, inside the pill's start. */
  static func agent(_ picture: AgentPictureSource?, em: CGFloat, dark: Bool) -> UIImage {
    let key = "a|\(picture?.key ?? "-")|\(Int(em * 100))|\(dark)"
    if let made = cache[key] { return made }
    let side = em * 1.1
    let photo = AgentPictures.image(picture)
    let blank = UIColor.secondarySystemFill.resolvedColor(with: UITraitCollection(userInterfaceStyle: dark ? .dark : .light))
    let image = padded(width: em * (0.22 + 1.1 + 0.24), height: side) { context in
      let circle = CGRect(x: em * 0.22, y: 0, width: side, height: side)
      context.cgContext.addEllipse(in: circle)
      context.cgContext.clip()
      if let photo { photo.draw(in: circle) } else { blank.setFill(); context.fill(circle) }
    }
    if cache.count > 400 { cache.removeAll() }
    cache[key] = image
    return image
  }

  /** The pill's end after the name: room, nothing drawn. */
  static func pillEnd(em: CGFloat) -> UIImage {
    let key = "e|\(Int(em * 100))"
    if let made = cache[key] { return made }
    let image = padded(width: em * 0.36, height: em * 1.1) { _ in }
    cache[key] = image
    return image
  }

  /** A connected app's mark for a card's tile (`Connectors/<slug>`, else by the connector's id: "monday.com" is `monday`), or a brand's, or nil. */
  static func connector(_ name: String) -> UIImage? {
    let slug = CatalogApp.slug(name)
    if let image = UIImage(named: "Connectors/\(slug)") { return image }
    if let id = ConnectorIcons.id(for: name), let image = UIImage(named: "Connectors/\(id)") { return image }
    if let brand = Brands.mentions.first(where: { $0.name.lowercased() == name.lowercased() }) { return UIImage(named: "Brands/\(brand.key)") }
    return nil
  }

  /** A connector's own app icon (`AppIcons/<id>`, the logo filling the tile, 14 October 2026), by its id or any of its names; nil for an app that is not a connector. */
  static func appIcon(id: String? = nil, name: String) -> UIImage? {
    guard let key = id.flatMap(ConnectorIcons.id(for:)) ?? ConnectorIcons.id(for: name) else { return nil }
    return UIImage(named: "AppIcons/\(key)")
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
 * blue) and every name the Mac dresses: a brand with its logo and colour at
 * 500, an agent with its face in a glass pill, its name in the app's blue at
 * 600 (the founder, 12 October 2026), never inside code or a link.
 */
@MainActor
enum InlineText {
  /** A run's words, and the agents whose pills are in them (each once, in order), for a tap to open (`MentionTaps`). */
  struct Made {
    let text: Text
    let agents: [String]
  }

  private static var cache: [String: Made] = [:]

  static func made(_ markdown: String, size: CGFloat = MessageType.size, weight: Font.Weight = .regular, colour: Color? = nil, mentioning: Mentioning?) -> Made {
    // In steps: one expression of `+` and `??` is more than the compiler will check in time.
    var names = "-"
    if let mentioning {
      let agents: String = mentioning.agents.map { agent in "\(agent.name)=\(agent.picture?.key ?? "")" }.joined(separator: ",")
      names = "\(agents)|\(mentioning.personName ?? "")|\(mentioning.speaker ?? "")"
    }
    let key = "\(size)|\(weight)|\(mentioning?.dark ?? false)|\(names)|\(markdown)"
    if colour == nil, let made = cache[key] { return made }
    let made = build(markdown, size: size, weight: weight, colour: colour, mentioning: mentioning)
    if colour == nil {
      if cache.count > 600 { cache.removeAll(keepingCapacity: true) }
      cache[key] = made
    }
    return made
  }

  private struct Style { var bold = false; var italic = false; var code = false; var struck = false; var link = false }

  private static func build(_ markdown: String, size: CGFloat, weight: Font.Weight, colour: Color?, mentioning: Mentioning?) -> Made {
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
      for match in Mentions.find(in: plain, agents: mentioning.agents, personName: mentioning.personName, speaker: mentioning.speaker) {
        guard let range = Range(NSRange(location: match.location, length: match.length), in: plain) else { continue }
        let start = plain.distance(from: plain.startIndex, to: range.lowerBound)
        let end = start + plain[range].count
        guard start < styles.count, !(start..<end).contains(where: { styles[$0].code || styles[$0].link }) else { continue }
        marks.append((start, end, match.kind))
      }
    }

    func font(_ style: Style, mention: Bool = false, agent: Bool = false) -> Font {
      if style.code { return .system(size: size * 0.93, design: .monospaced) }
      let w: Font.Weight = style.bold || agent ? .semibold : mention ? .medium : weight
      let base = Font.system(size: size, weight: w)
      return style.italic ? base.italic() : base
    }

    func piece(_ from: Int, _ to: Int, mention: Color? = nil, agent: Bool = false) -> AttributedString {
      var out = AttributedString()
      var i = from
      while i < to {
        var j = i + 1
        while j < to, styleKey(styles[j]) == styleKey(styles[i]), links[j] == links[i] { j += 1 }
        // An agent's name does not break at its spaces (`white-space: nowrap`).
        var run = AttributedString(agent ? String(characters[i..<j]).replacingOccurrences(of: " ", with: "\u{00A0}") : String(characters[i..<j]))
        let style = styles[i]
        run.font = font(style, mention: mention != nil, agent: agent)
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

    guard !marks.isEmpty else { return Made(text: Text(piece(0, characters.count)), agents: []) }
    var text = Text(verbatim: "")
    var agents: [String] = []
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
      case .agent(let id):
        // The face, the name and the pill's end, each marked for `MentionPills` to draw the glass behind (and a tap to find); word joiners and the name's unbreaking spaces keep the pill on one line.
        let picture = mentioning?.agents.first { $0.id == id }?.picture
        let pill = MentionPill(agentId: id)
        let joiner = Text(verbatim: "\u{2060}").customAttribute(pill)
        text = Text("\(text)\(Text(Image(uiImage: MentionArt.agent(picture, em: em, dark: mentioning?.dark ?? false))).baselineOffset(-0.2 * em).customAttribute(pill))\(joiner)")
        text = Text("\(text)\(Text(piece(mark.start, mark.end, mention: Ink.title, agent: true)).customAttribute(pill))\(joiner)")
        text = Text("\(text)\(Text(Image(uiImage: MentionArt.pillEnd(em: em))).baselineOffset(-0.2 * em).customAttribute(pill))")
        if !agents.contains(id) { agents.append(id) }
      }
      cursor = mark.end
    }
    if cursor < characters.count { text = Text("\(text)\(Text(piece(cursor, characters.count)))") }
    return Made(text: text, agents: agents)
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

/** A run of an agent's mention: its face, its name and the pill's end (`InlineText`), and whose it is. */
struct MentionPill: TextAttribute {
  var agentId: String
}

/**
 * Each mention of an agent in a glass pill (the founder, 12 October 2026:
 * "the pill, but water glass, and the name in our blue"): drawn behind the
 * mention's runs, a clear frosted fill, a bright rim, a soft shadow. Apple's
 * own Liquid Glass is a view's effect and cannot wrap a word inside a
 * paragraph, so the glass is drawn; the same on every system. Where each
 * pill was drawn goes to `spots`, for a tap to find (`MentionTaps`).
 */
struct MentionPills: TextRenderer {
  var dark: Bool
  var spots: MentionSpots? = nil

  /** The pill reaches a little past the line, and its shadow below it: room to draw them on a block's first and last lines. */
  var displayPadding: EdgeInsets { EdgeInsets(top: 3, leading: 1, bottom: 3, trailing: 1) }

  func draw(layout: Text.Layout, in ctx: inout GraphicsContext) {
    var pills: [MentionSpots.Spot] = []
    for line in layout {
      var current: MentionSpots.Spot?
      for run in line {
        if let pill = run[MentionPill.self] {
          let rect = run.typographicBounds.rect
          if let open = current, open.agentId == pill.agentId {
            current = MentionSpots.Spot(rect: open.rect.union(rect), agentId: open.agentId)
          } else {
            if let done = current { pills.append(done) }
            current = MentionSpots.Spot(rect: rect, agentId: pill.agentId)
          }
        } else if let done = current {
          pills.append(done)
          current = nil
        }
      }
      if let done = current { pills.append(done) }
    }
    spots?.record(pills)
    for pill in pills { glass(pill.rect, in: &ctx) }
    for line in layout { ctx.draw(line) }
  }

  private func glass(_ rect: CGRect, in ctx: inout GraphicsContext) {
    let box = rect.insetBy(dx: 0, dy: -rect.height * 0.04)
    let shape = Path(roundedRect: box, cornerRadius: box.height / 2, style: .continuous)
    let top = CGPoint(x: box.midX, y: box.minY), bottom = CGPoint(x: box.midX, y: box.maxY)
    ctx.drawLayer { layer in
      layer.addFilter(.shadow(color: .black.opacity(dark ? 0.45 : 0.08), radius: dark ? 1.5 : 1.2, x: 0, y: 1))
      let fill = dark ? [Color.white.opacity(0.14), Color.white.opacity(0.05)] : [Color.white.opacity(0.85), Color.white.opacity(0.5)]
      layer.fill(shape, with: .linearGradient(Gradient(colors: fill), startPoint: top, endPoint: bottom))
    }
    let rim = dark ? [Color.white.opacity(0.24), Color.white.opacity(0.06)] : [Color.white, Color.white.opacity(0.55)]
    ctx.stroke(shape, with: .linearGradient(Gradient(colors: rim), startPoint: top, endPoint: bottom), lineWidth: 0.75)
    if !dark { ctx.stroke(shape, with: .color(.black.opacity(0.07)), lineWidth: 0.5) }
  }
}

/** Where a run of words drew its agents' pills, in its own space: written as it draws, read by a tap. */
final class MentionSpots: @unchecked Sendable {
  struct Spot {
    let rect: CGRect
    let agentId: String
  }

  private let lock = NSLock()
  private var spots: [Spot] = []

  func record(_ drawn: [Spot]) {
    lock.lock(); defer { lock.unlock() }
    spots = drawn
  }

  /** The agent whose pill is under the finger, a few points around it counting. */
  func agent(at point: CGPoint) -> String? {
    lock.lock(); defer { lock.unlock() }
    return spots.first { $0.rect.insetBy(dx: -4, dy: -6).contains(point) }?.agentId
  }
}

/**
 * A run of words whose agents' pills open their chats (the founder, 12
 * October 2026): the pills drawn on this run itself, so a tap lands where
 * they were drawn; a tap anywhere else, a link's, a long press's, goes on as
 * before. The chat opens as a tapped notification's does.
 */
struct MentionTaps: ViewModifier {
  let agents: [String]
  let mentioning: Mentioning?
  @State private var spots = MentionSpots()

  @ViewBuilder
  func body(content: Content) -> some View {
    if agents.isEmpty {
      content
    } else {
      content
        .textRenderer(MentionPills(dark: mentioning?.dark ?? false, spots: spots))
        .simultaneousGesture(SpatialTapGesture().onEnded { tap in
          if let id = spots.agent(at: tap.location) { open(id) }
        })
        .accessibilityActions {
          ForEach(agents, id: \.self) { id in
            if let name = mentioning?.agents.first(where: { $0.id == id })?.name {
              Button("Open \(name)") { open(id) }
            }
          }
        }
    }
  }

  private func open(_ id: String) {
    Haptics.tap()
    Notifications.shared.openAgent = id
  }
}

extension View {
  /** These words' agent pills open their chats (`MentionTaps`). */
  func mentionTaps(_ made: InlineText.Made, mentioning: Mentioning?) -> some View {
    modifier(MentionTaps(agents: made.agents, mentioning: mentioning))
  }
}

struct MarkdownBlockView: View {
  let block: MarkdownBlock
  let mentioning: Mentioning?
  let depth: Int

  var body: some View {
    switch block {
    case .paragraph(let text):
      if Markdown.inlineMath(text) != nil {
        // `$$…$$` within its lines: the paragraph drawn with its maths (Rendering.swift).
        RenderedBlock(kind: .mathText(text))
      } else {
        let made = InlineText.made(text, mentioning: mentioning)
        made.text
          .mentionTaps(made, mentioning: mentioning)
          .lineSpacing(MessageType.spacing())
          .fixedSize(horizontal: false, vertical: true)
      }
    case .heading(let level, let text):
      // Over the Mac's, with the message's 17: h1 25 / 31, h2 20 / 27, h3 and below the message's own 17 / 23 with 8 above; all 600.
      let size: CGFloat = level == 1 ? 25 : level == 2 ? 20 : MessageType.size
      let line: CGFloat = level == 1 ? 31 : level == 2 ? 27 : MessageType.lineHeight
      let made = InlineText.made(text, size: size, weight: .semibold, mentioning: mentioning)
      made.text
        .mentionTaps(made, mentioning: mentioning)
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
    case .code(let language, let text):
      // A ```mermaid block is a diagram, as the window draws it (Rendering.swift).
      if language?.lowercased() == "mermaid" {
        MermaidBlock(source: text)
      } else {
        CodeBlockView(text: text)
      }
    case .table(let header, let alignments, let rows):
      MarkdownTable(header: header, alignments: alignments, rows: rows, mentioning: mentioning)
    case .rule:
      Color.clear.frame(height: 1)
    case .math(let tex):
      RenderedBlock(kind: .math(tex, display: true))
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

/**
 * A fenced block: monospaced on the field's white, a hairline edge,
 * sideways scrolling, and the window's "Copy code" button at its corner
 * ("Copied" with a tick for two seconds).
 */
struct CodeBlockView: View {
  let text: String
  @State private var expanded = false
  @State private var copied = false

  var body: some View {
    // A code block does not wrap, so it is laid out whole: 200 lines of at most 1,000 characters each (2,000 lines open).
    let shown = Chat.clippedCode(text, lines: expanded ? 2_000 : 200, width: 1_000)
    VStack(alignment: .leading, spacing: 0) {
    ScrollView(.horizontal, showsIndicators: false) {
      Text(shown.text)
        .font(.system(size: 16, design: .monospaced))
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
      .buttonStyle(.tactile)
    }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.field, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Ink.hairline, lineWidth: 1))
    .overlay(alignment: .topTrailing) {
      Button(action: copy) {
        Image(systemName: copied ? "checkmark" : "doc.on.doc").font(.system(size: 11, weight: .medium)).foregroundStyle(Ink.secondary)
          .frame(width: 24, height: 24).tapRoom(10)
      }
      .buttonStyle(.tactile)
      .padding(4)
      .accessibilityLabel(copied ? "Copied" : "Copy code")
      #if os(macOS)
      .help(copied ? "Copied" : "Copy code")
      #endif
    }
    #if os(iOS)
    .contextMenu {
      Button(action: copy) { Label("Copy", systemImage: "doc.on.doc") }
    }
    #endif
  }

  private func copy() {
    UIPasteboard.general.string = text
    Haptics.tap()
    copied = true
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      copied = false
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
            let made = InlineText.made(cell, size: 16, weight: .medium, mentioning: mentioning)
            made.text
              .mentionTaps(made, mentioning: mentioning)
              .foregroundStyle(Ink.primary)
              .gridColumnAlignment(alignment(index))
              .padding(8)
          }
        }
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          Divider().overlay(Ink.hairline).gridCellUnsizedAxes(.horizontal)
          GridRow {
            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
              let made = InlineText.made(cell, size: 16, mentioning: mentioning)
              made.text
                .mentionTaps(made, mentioning: mentioning)
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
