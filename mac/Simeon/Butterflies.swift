import AppKit
import SwiftUI
import SimeonCore

/**
 * Every agent is a butterfly in its palette, drawn as the Electron window's
 * mark engine draws it at rest (the window's `#sand-agent-mark-source-…`
 * marks, measured 10 October 2026): the wings filled with the palette's
 * three stops on a slant, a rim, the veins and a band inside the wings, the
 * antennae, their knobs and the body. The geometry is SimeonCore's
 * `Butterfly`, the window's own numbers. The window's grain filter is left
 * out: it blends mid-grey over opaque wings, which leaves them unchanged.
 */
enum ButterflyArt {
  /** How the window draws one: a row's or a header's mark (`live`), or a group member (`still`: a straight top-to-bottom gradient, antennae in the body's shade). */
  enum Style { case live, still }

  static let wings: Path = {
    var path = Path()
    for (index, segment) in Butterfly.wings.enumerated() {
      if index == 0 { path.move(to: CGPoint(x: segment.from.x, y: segment.from.y)) }
      path.addCurve(to: CGPoint(x: segment.to.x, y: segment.to.y), control1: CGPoint(x: segment.c1.x, y: segment.c1.y), control2: CGPoint(x: segment.c2.x, y: segment.c2.y))
    }
    path.closeSubpath()
    return path
  }()

  /** The 200-point outline the band inside the wings follows (`BUTTERFLY_OUTLINE`). */
  static let outline: Path = {
    var path = Path()
    for (index, point) in Butterfly.outline.enumerated() {
      let p = CGPoint(x: point.x, y: point.y)
      if index == 0 { path.move(to: p) } else { path.addLine(to: p) }
    }
    path.closeSubpath()
    return path
  }()

  static let veins: Path = {
    var path = Path()
    for curve in Butterfly.veins {
      path.move(to: CGPoint(x: curve.from.x, y: curve.from.y))
      path.addQuadCurve(to: CGPoint(x: curve.to.x, y: curve.to.y), control: CGPoint(x: curve.control.x, y: curve.control.y))
    }
    return path
  }()

  static let antennae: Path = {
    var path = Path()
    for cubic in Butterfly.antennae {
      path.move(to: CGPoint(x: cubic.from.x, y: cubic.from.y))
      path.addCurve(to: CGPoint(x: cubic.to.x, y: cubic.to.y), control1: CGPoint(x: cubic.c1.x, y: cubic.c1.y), control2: CGPoint(x: cubic.c2.x, y: cubic.c2.y))
    }
    return path
  }()

  static let knobs: Path = {
    var path = Path()
    let r = Butterfly.knobRadius
    for knob in Butterfly.knobs { path.addEllipse(in: CGRect(x: knob.x - r, y: knob.y - r, width: 2 * r, height: 2 * r)) }
    return path
  }()

  static let body: Path = {
    var path = Path()
    for part in Butterfly.body { path.addEllipse(in: CGRect(x: part.cx - part.rx, y: part.cy - part.ry, width: 2 * part.rx, height: 2 * part.ry)) }
    return path
  }()

  /**
   * From the mark's square to `rect`: the window's `-15 -15 259 259` view
   * fitted to the rect, the mark scaled ×259/229 about its centre.
   */
  static func transform(in rect: CGRect) -> CGAffineTransform {
    let side = Butterfly.viewSide, origin = Butterfly.viewOrigin
    let scale = min(rect.width, rect.height) / side
    let offsetX = rect.minX + (rect.width - side * scale) / 2
    let offsetY = rect.minY + (rect.height - side * scale) / 2
    let c = Butterfly.centre, m = Butterfly.markScale
    return CGAffineTransform(translationX: offsetX, y: offsetY)
      .scaledBy(x: scale, y: scale)
      .translatedBy(x: -origin, y: -origin)
      .translatedBy(x: c, y: c).scaledBy(x: m, y: m).translatedBy(x: -c, y: -c)
  }

  /** The wings as placed in `rect`: what a group member cuts its gap around. */
  static func wings(in rect: CGRect) -> Path { wings.applying(transform(in: rect)) }

  /**
   * From the mark's own square to `rect`, showing only `crop` of it, fitted
   * and centred (an SVG `viewBox` drawn `center/contain`, with no ×259/229).
   */
  static func transform(showing crop: CGRect, in rect: CGRect) -> CGAffineTransform {
    let scale = min(rect.width / crop.width, rect.height / crop.height)
    let offsetX = rect.minX + (rect.width - crop.width * scale) / 2
    let offsetY = rect.minY + (rect.height - crop.height * scale) / 2
    return CGAffineTransform(translationX: offsetX, y: offsetY)
      .scaledBy(x: scale, y: scale)
      .translatedBy(x: -crop.minX, y: -crop.minY)
  }

  static func draw(_ context: inout GraphicsContext, in rect: CGRect, palette: AgentPalette, dark: Bool, style: Style) {
    draw(&context, transform: transform(in: rect), palette: palette, dark: dark, style: style)
  }

  static func draw(_ context: inout GraphicsContext, transform: CGAffineTransform, palette: AgentPalette, dark: Bool, style: Style) {
    var ctx = context
    ctx.concatenate(transform)
    let box = wings.boundingRect
    let ink = Gradient(stops: [
      .init(color: Color(palette.top), location: 0),
      .init(color: Color(palette.mid), location: 0.55),
      .init(color: Color(palette.bottom), location: 1),
    ])
    let start: CGPoint, end: CGPoint
    if style == .still {
      start = CGPoint(x: box.midX, y: box.minY)
      end = CGPoint(x: box.midX, y: box.maxY)
    } else {
      // The gradient's (0,0) to (0.15,1) in the wings' own box, as SVG's objectBoundingBox draws it: bands across that slant.
      let a = 0.15 / box.width, b = 1 / box.height, n = a * a + b * b
      start = CGPoint(x: box.minX, y: box.minY)
      end = CGPoint(x: box.minX + a / n, y: box.minY + b / n)
    }
    let edge = Color(palette.edge)
    ctx.fill(wings, with: .linearGradient(ink, startPoint: start, endPoint: end))
    ctx.stroke(wings, with: .color(edge), style: StrokeStyle(lineWidth: 2.2, lineJoin: .round))
    ctx.drawLayer { inside in
      inside.clip(to: wings)
      inside.stroke(veins, with: .color(edge.opacity(0.22)), style: StrokeStyle(lineWidth: 0.9, lineCap: .round))
      inside.stroke(style == .still ? wings : outline, with: .color(edge.opacity(0.22)), style: StrokeStyle(lineWidth: 22, lineJoin: .round))
    }
    let feelers = Color(style == .still || !dark ? palette.body : palette.feelersOnDark)
    ctx.stroke(antennae, with: .color(feelers), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
    ctx.fill(knobs, with: .color(feelers))
    ctx.fill(body, with: .color(Color(palette.body)))
  }
}

extension Color {
  init(_ rgb: RGB) { self.init(.sRGB, red: rgb.r, green: rgb.g, blue: rgb.b) }
}

/** One agent's butterfly, `size` points square, as a row draws it. */
struct ButterflyMark: View {
  let palette: AgentPalette
  var size: CGFloat = 36
  var style: ButterflyArt.Style = .live
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Canvas { context, canvas in
      ButterflyArt.draw(&context, in: CGRect(origin: .zero, size: canvas), palette: palette, dark: scheme == .dark, style: style)
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/**
 * A group's avatar (`sand-group-avatar`): its first members in the square,
 * three as a pyramid at 5/9 of it, each later one cutting its outline and a
 * small gap into the ones behind (SimeonCore's `groupLayout`, `groupGap`);
 * a member with a picture is its round picture, and cuts a circle. Past
 * four members, three and "+N" (`OOt`).
 */
struct GroupMark: View {
  let members: [MarkMember]
  var size: CGFloat = 36
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Canvas { context, canvas in
      let frame = Double(min(canvas.width, canvas.height))
      let shown = members.count > 4 ? Array(members.prefix(3)) + [.more(members.count - 3)] : members
      let slots = Butterfly.groupLayout(count: shown.count, frame: frame)
      let gap = Butterfly.groupGap(frame: frame)
      for (index, member) in shown.enumerated() where index < slots.count {
        let slot = slots[index]
        let rect = CGRect(x: slot.x, y: slot.y, width: slot.size, height: slot.size)
        // The later member's outline, widened by the gap, cleared out of those already drawn.
        if index > 0 { MarkDrawing.cut(&context, member, in: rect, gap: gap) }
        MarkDrawing.draw(&context, member, in: rect, dark: scheme == .dark, moreFont: rect.width * 0.34)
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/**
 * A group's avatar of 20 points or less with two members or more, the chat
 * head's group (drawn at 20 and zoomed by the window, so 52 here), and the
 * exchange chip's agents (`fnt`): the members in a row at `unit` each, each
 * overlapping the next by 6/16 of it, each later one cutting its outline
 * and a 2/16 gap out of the one before. Counted, past four it is three and
 * "+N"; elided (the chip), the first three.
 */
struct MarkRow: View {
  let members: [MarkMember]
  var unit: CGFloat = 16
  var counted = true
  @Environment(\.colorScheme) private var scheme

  static func shown(_ members: [MarkMember], counted: Bool) -> [MarkMember] {
    guard counted else { return Array(members.prefix(3)) }
    return members.count <= 4 ? members : Array(members.prefix(3)) + [.more(members.count - 3)]
  }

  var body: some View {
    let shown = MarkRow.shown(members, counted: counted)
    let step = unit * 10 / 16
    Canvas { context, _ in
      for (index, member) in shown.enumerated() {
        let rect = CGRect(x: CGFloat(index) * step, y: 0, width: unit, height: unit)
        if index > 0 { MarkDrawing.cut(&context, member, in: rect, gap: unit * 2 / 16) }
        MarkDrawing.draw(&context, member, in: rect, dark: scheme == .dark, moreFont: unit * 14 / 36)
      }
    }
    .frame(width: shown.isEmpty ? 0 : unit + CGFloat(shown.count - 1) * step, height: unit)
    .accessibilityHidden(true)
  }
}

/** One place in a group's avatar: a member's own picture, its butterfly, or "+N" for the rest (`MOt`). */
enum MarkMember {
  case picture(NSImage)
  case butterfly(AgentPalette)
  case more(Int)

  static func of(_ agent: Agent) -> MarkMember {
    if let picture = AvatarPictures.image(for: agent) { return .picture(picture) }
    return .butterfly(agent.palette)
  }

  /** A group's members as its avatar shows them, in the group's order. */
  static func members(of group: Agent, in agents: [Agent]) -> [MarkMember] {
    group.memberIds.compactMap { id in agents.first { $0.id == id } }.map(of)
  }
}

/** How a member is drawn in a group's avatar, and what it cuts from those behind it. */
enum MarkDrawing {
  /** A picture's edge (`--sand-border-weak`): 10 % of the ink, so it darkens the rim in light and lightens it in dark. */
  static func edge(dark: Bool) -> Color { (dark ? Color(hex: 0xfcfcfc) : Color(hex: 0x141414)).opacity(0.1) }

  static func draw(_ context: inout GraphicsContext, _ member: MarkMember, in rect: CGRect, dark: Bool, moreFont: CGFloat) {
    switch member {
    case .butterfly(let palette):
      ButterflyArt.draw(&context, in: rect, palette: palette, dark: dark, style: .still)
    case .picture(let image):
      // `object-fit: cover` in the circle, then the half-point edge inside it.
      var clipped = context
      clipped.clip(to: Path(ellipseIn: rect))
      clipped.draw(Image(nsImage: image), in: cover(image.size, in: rect))
      context.stroke(Path(ellipseIn: rect.insetBy(dx: 0.25, dy: 0.25)), with: .color(edge(dark: dark)), lineWidth: 0.5)
    case .more(let count):
      // The faint disc (`--sand-fill-neutral-subtle`) with the count in the neutral text, no edge.
      context.fill(Path(ellipseIn: rect), with: .color(Color(hex: 0x777777).opacity(dark ? 0.173 : 0.09)))
      let words = Text("+\(count)").font(.system(size: moreFont, weight: .medium)).foregroundColor(dark ? Color(hex: 0xc2c2c2) : Color(hex: 0x3d3d3d))
      context.draw(words, at: CGPoint(x: rect.midX, y: rect.midY))
    }
  }

  /** A later member's outline widened by the gap, cleared from those already drawn: the wings for a butterfly, a circle otherwise. */
  static func cut(_ context: inout GraphicsContext, _ member: MarkMember, in rect: CGRect, gap: CGFloat) {
    var eraser = context
    eraser.blendMode = .clear
    if case .butterfly = member {
      let wings = ButterflyArt.wings(in: rect)
      eraser.fill(wings, with: .color(.black))
      eraser.stroke(wings, with: .color(.black), style: StrokeStyle(lineWidth: 2 * gap, lineJoin: .round))
    } else {
      eraser.fill(Path(ellipseIn: rect.insetBy(dx: -gap, dy: -gap)), with: .color(.black))
    }
  }

  /** The rectangle a picture of this size fills `rect` with, cropped to its middle. */
  static func cover(_ size: CGSize, in rect: CGRect) -> CGRect {
    guard size.width > 0, size.height > 0 else { return rect }
    let scale = max(rect.width / size.width, rect.height / size.height)
    let width = size.width * scale, height = size.height * scale
    return CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
  }
}

/**
 * An agent's own picture (`au` with its picture): round, filling the
 * circle, a half-point edge at 10 % of the ink over it, nothing behind it.
 * It never moves, never pokes, and shows the same in every place.
 */
struct AgentPicture: View {
  let image: NSImage
  var size: CGFloat = 36
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Image(nsImage: image)
      .resizable()
      .scaledToFill()
      .frame(width: size, height: size)
      .clipShape(Circle())
      .overlay(Circle().strokeBorder(MarkDrawing.edge(dark: scheme == .dark), lineWidth: 0.5))
      .accessibilityHidden(true)
  }
}

/**
 * An agent's avatar: its own picture when it has one (a group's too:
 * `gct` looks at the picture first), else a group's members (a row at 20
 * or less, or where asked: the chat's head), else its butterfly. Where the
 * window lets it move (`live`: a sidebar row, the working line) the
 * butterfly is the agent's live mark; a picture never moves, and one that
 * cannot be read gives way to the butterfly (step 14, decision 23).
 */
struct AgentMark: View {
  let agent: Agent
  let agents: [Agent]
  var size: CGFloat = 36
  var live = false
  /** A group as its row of members at `size` each, whatever the size (the chat's head). */
  var groupRow = false

  var body: some View {
    if let picture = AvatarPictures.image(for: agent) {
      AgentPicture(image: picture, size: size)
    } else if agent.isGroup {
      let members = MarkMember.members(of: agent, in: agents)
      if members.count > 1 && (groupRow || size <= 20) {
        MarkRow(members: members, unit: size)
      } else {
        GroupMark(members: members, size: size)
      }
    } else if live {
      LiveMark(agent: agent, size: size)
    } else {
      ButterflyMark(palette: agent.palette, size: size)
    }
  }
}
