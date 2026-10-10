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

  static func draw(_ context: inout GraphicsContext, in rect: CGRect, palette: AgentPalette, dark: Bool, style: Style) {
    var ctx = context
    ctx.concatenate(transform(in: rect))
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
 * A group's avatar (`sand-group-avatar`): its first members' butterflies in
 * the square, three as a pyramid at 5/9 of it, each later one cutting a
 * small gap into the ones behind (SimeonCore's `groupLayout`, `groupGap`).
 */
struct GroupMark: View {
  let members: [AgentPalette]
  var size: CGFloat = 36
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Canvas { context, canvas in
      let frame = Double(min(canvas.width, canvas.height))
      let shown = Array(members.prefix(4))
      let slots = Butterfly.groupLayout(count: shown.count, frame: frame)
      let gap = Butterfly.groupGap(frame: frame)
      for (index, palette) in shown.enumerated() where index < slots.count {
        let slot = slots[index]
        let rect = CGRect(x: slot.x, y: slot.y, width: slot.size, height: slot.size)
        if index > 0 {
          // The later member's outline, widened by the gap, cleared out of those already drawn.
          let cut = ButterflyArt.wings(in: rect)
          var eraser = context
          eraser.blendMode = .clear
          eraser.fill(cut, with: .color(.black))
          eraser.stroke(cut, with: .color(.black), style: StrokeStyle(lineWidth: 2 * gap, lineJoin: .round))
        }
        ButterflyArt.draw(&context, in: rect, palette: palette, dark: scheme == .dark, style: .still)
      }
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }
}

/** An agent's avatar in the list: its butterfly, or its members' for a group. */
struct AgentMark: View {
  let agent: Agent
  let agents: [Agent]
  var size: CGFloat = 36

  var body: some View {
    if agent.isGroup {
      GroupMark(members: agent.memberIds.compactMap { id in agents.first { $0.id == id }?.palette }, size: size)
    } else {
      ButterflyMark(palette: agent.palette, size: size)
    }
  }
}
