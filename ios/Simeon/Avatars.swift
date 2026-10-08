import SwiftUI
import UIKit
import SimeonCore

/**
 * The butterfly's pieces as paths, in the mark's own square (SimeonCore's
 * `Butterfly`): the wings as the window draws them (smoothed and
 * normalised), the raw straight-edged outline, and the details.
 */
enum ButterflyPaths {
  /** The window's wings: the engine's smoothed, normalised outline (`Yse`, `p_t`). */
  static let wings: Path = {
    var path = Path()
    for (index, segment) in Butterfly.wings.enumerated() {
      if index == 0 { path.move(to: CGPoint(x: segment.from.x, y: segment.from.y)) }
      path.addCurve(to: CGPoint(x: segment.to.x, y: segment.to.y), control1: CGPoint(x: segment.c1.x, y: segment.c1.y), control2: CGPoint(x: segment.c2.x, y: segment.c2.y))
    }
    path.closeSubpath()
    return path
  }()

  /** The raw outline, 200 straight edges (`BUTTERFLY_OUTLINE`): the live mark's border band and the mentions' copy. */
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
}

/**
 * The three ways the Mac draws an agent's butterfly:
 * - `live`: the avatar of a row, the chat's header, the agent's page (the
 *   mark engine `$_t`): the window's wings, a gradient at the bounding
 *   box's slant, the border band from the raw outline, antennae lighter in
 *   dark mode;
 * - `still`: group members and other image-only marks (`rOt`): a straight
 *   top-to-bottom gradient, the band on the window's wings, antennae always
 *   the body's shade;
 * - `mention`: the copy beside a name in a message and in the call banner
 *   (`butterflyMarkSvg`): the raw outline, cropped close.
 */
enum MarkStyle { case live, still, mention }

enum MarkDrawing {
  /** The square the live and still marks are drawn in (`-15 -15 259 259`), the mark scaled x259/229 about its centre. */
  static let avatarView = CGRect(x: Butterfly.viewOrigin, y: Butterfly.viewOrigin, width: Butterfly.viewSide, height: Butterfly.viewSide)
  /** The mention's crop (`AGENT_MENTION_VIEWBOX`, "3 30 223 163"). */
  static let mentionView = CGRect(x: 3, y: 30, width: 223, height: 163)

  /** The wings' outline placed in `rect` as `style` places it: for cutting a group member out of the one behind. */
  static func wings(in rect: CGRect, style: MarkStyle) -> Path {
    let transform = self.transform(in: rect, style: style)
    return (style == .mention ? ButterflyPaths.outline : ButterflyPaths.wings).applying(transform)
  }

  static func transform(in rect: CGRect, style: MarkStyle) -> CGAffineTransform {
    let view = style == .mention ? mentionView : avatarView
    let scale = min(rect.width / view.width, rect.height / view.height)
    let offsetX = rect.minX + (rect.width - view.width * scale) / 2
    let offsetY = rect.minY + (rect.height - view.height * scale) / 2
    var t = CGAffineTransform(translationX: offsetX, y: offsetY)
    t = t.scaledBy(x: scale, y: scale)
    t = t.translatedBy(x: -view.minX, y: -view.minY)
    if style != .mention {
      let c = Butterfly.centre, m = Butterfly.markScale
      t = t.translatedBy(x: c, y: c).scaledBy(x: m, y: m).translatedBy(x: -c, y: -c)
    }
    return t
  }

  /** The live mark's view centre (`-15 + 259 / 2`): a small mark zooms in on its glyph about it. */
  static let viewCentre = Butterfly.viewOrigin + Butterfly.viewSide / 2

  /** A closed ring of points as the engine draws it (`W9e`): a smooth curve through them. */
  static func smoothPath(_ points: [Butterfly.Point]) -> Path {
    var path = Path()
    for (index, segment) in Butterfly.smooth(points).enumerated() {
      if index == 0 { path.move(to: CGPoint(x: segment.from.x, y: segment.from.y)) }
      path.addCurve(to: CGPoint(x: segment.to.x, y: segment.to.y), control1: CGPoint(x: segment.c1.x, y: segment.c1.y), control2: CGPoint(x: segment.c2.x, y: segment.c2.y))
    }
    path.closeSubpath()
    return path
  }

  /**
   * Draws one butterfly into `rect` (a square, or the mention's 223×163
   * box). A live mark takes the engine's frame: the glyph's dots behind,
   * then the body moved, its outline turned or folded, its details faded.
   */
  static func draw(_ context: inout GraphicsContext, in rect: CGRect, palette: AgentPalette, dark: Bool, style: MarkStyle, frame: MarkFrame = .rest) {
    var ctx = context
    ctx.concatenate(transform(in: rect, style: style))
    if frame.zoom != 1 {
      let c = viewCentre
      ctx.concatenate(CGAffineTransform(translationX: c, y: c).scaledBy(x: frame.zoom, y: frame.zoom).translatedBy(x: -c, y: -c))
    }
    let c = Butterfly.centre
    // The glyph's parts, in the palette's flat colour (`--fg`, its middle stop), behind the body.
    let flat = Color(palette.mid)
    for ring in frame.rings {
      ctx.stroke(Path(ellipseIn: CGRect(x: c - ring.radius, y: c - ring.radius, width: 2 * ring.radius, height: 2 * ring.radius)), with: .color(flat.opacity(ring.opacity)), lineWidth: ring.lineWidth)
    }
    for dot in frame.dots {
      ctx.fill(Path(ellipseIn: CGRect(x: dot.x - dot.radius, y: dot.y - dot.radius, width: 2 * dot.radius, height: 2 * dot.radius)), with: .color(flat.opacity(dot.opacity)))
    }
    var body = ctx
    body.opacity = frame.opacity
    if frame != .rest {
      body.concatenate(CGAffineTransform(translationX: c + frame.dx, y: c + frame.dy).rotated(by: frame.rotation * .pi / 180).scaledBy(x: frame.scaleX, y: frame.scaleY).translatedBy(x: -c, y: -c))
    }
    let wings = frame.outline.map(smoothPath) ?? (style == .mention ? ButterflyPaths.outline : ButterflyPaths.wings)
    let box = wings.boundingRect
    let edge = Color(palette.edge)
    let ink = Gradient(stops: [
      .init(color: Color(palette.top), location: 0),
      .init(color: Color(palette.mid), location: 0.55),
      .init(color: Color(palette.bottom), location: 1),
    ])
    let start: CGPoint, end: CGPoint
    if style == .still {
      start = CGPoint(x: box.midX, y: box.minY); end = CGPoint(x: box.midX, y: box.maxY)
    } else {
      // The vector (0,0)-(0.15,1) in the box's own units, as user space:
      // the same bands as SVG's objectBoundingBox gradient.
      let a = 0.15 / (box.width * 1.0225), b = 1 / (box.height * 1.0225), n = a * a + b * b
      start = CGPoint(x: box.minX, y: box.minY); end = CGPoint(x: box.minX + a / n, y: box.minY + b / n)
    }
    body.fill(wings, with: .linearGradient(ink, startPoint: start, endPoint: end))
    // The rim, the veins, the border band, the antennae and the body fade as the wings fold into the orb.
    guard frame.artOpacity > 0.001 else { return }
    var art = body
    art.opacity = frame.opacity * frame.artOpacity
    art.drawLayer { layer in
      layer.stroke(wings, with: .color(edge), style: StrokeStyle(lineWidth: 2.2, lineJoin: .round))
      let band = style == .still ? ButterflyPaths.wings : ButterflyPaths.outline
      layer.drawLayer { inside in
        inside.clip(to: wings)
        inside.stroke(ButterflyPaths.veins, with: .color(edge.opacity(0.22)), style: StrokeStyle(lineWidth: 0.9, lineCap: .round))
        inside.stroke(band, with: .color(edge.opacity(0.22)), style: StrokeStyle(lineWidth: 22, lineJoin: .round))
      }
      let feelers = Color(style == .still || !dark ? palette.body : palette.feelersOnDark)
      layer.stroke(ButterflyPaths.antennae, with: .color(feelers), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
      layer.fill(ButterflyPaths.knobs, with: .color(feelers))
      layer.fill(ButterflyPaths.body, with: .color(Color(palette.body)))
    }
  }

  /**
   * A mention's butterfly as an image, for drawing inside a line of text; one
   * per palette, size and theme. It is asked for while a message is being
   * drawn, so it is drawn here with Core Graphics: it was a whole second
   * SwiftUI render (`ImageRenderer` of a `Canvas`) run inside the chat's own.
   */
  @MainActor static func mentionImage(_ palette: AgentPalette, height: CGFloat, dark: Bool) -> UIImage {
    let key = "\(palette.id)|\(Int(height * 10))|\(dark)"
    if let made = mentionImages[key] { return made }
    let size = CGSize(width: height * mentionView.width / mentionView.height, height: height)
    let image = UIGraphicsImageRenderer(size: size, format: .preferred()).image { context in
      drawResting(context.cgContext, in: CGRect(origin: .zero, size: size), palette: palette, dark: dark, style: .mention)
    }
    mentionImages[key] = image
    return image
  }

  @MainActor private static var mentionImages: [String: UIImage] = [:]

  /** `draw` at rest, in Core Graphics, for a butterfly drawn into an image rather than a view: the same paths, gradient and strokes. */
  static func drawResting(_ cg: CGContext, in rect: CGRect, palette: AgentPalette, dark: Bool, style: MarkStyle) {
    cg.saveGState()
    defer { cg.restoreGState() }
    cg.concatenate(transform(in: rect, style: style))
    let wings = (style == .mention ? ButterflyPaths.outline : ButterflyPaths.wings).cgPath
    let box = wings.boundingBoxOfPath
    let colour = { (rgb: RGB, alpha: Double) in CGColor(srgbRed: rgb.r, green: rgb.g, blue: rgb.b, alpha: rgb.a * alpha) }
    let start: CGPoint, end: CGPoint
    if style == .still {
      start = CGPoint(x: box.midX, y: box.minY); end = CGPoint(x: box.midX, y: box.maxY)
    } else {
      let a = 0.15 / (box.width * 1.0225), b = 1 / (box.height * 1.0225), n = a * a + b * b
      start = CGPoint(x: box.minX, y: box.minY); end = CGPoint(x: box.minX + a / n, y: box.minY + b / n)
    }
    if let space = CGColorSpace(name: CGColorSpace.sRGB),
       let ink = CGGradient(colorsSpace: space, colors: [colour(palette.top, 1), colour(palette.mid, 1), colour(palette.bottom, 1)] as CFArray, locations: [0, 0.55, 1]) {
      cg.saveGState()
      cg.addPath(wings)
      cg.clip()
      cg.drawLinearGradient(ink, start: start, end: end, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
      cg.restoreGState()
    }
    func stroke(_ path: CGPath, _ ink: CGColor, width: CGFloat, cap: CGLineCap = .butt, join: CGLineJoin = .miter) {
      cg.addPath(path)
      cg.setStrokeColor(ink)
      cg.setLineWidth(width)
      cg.setLineCap(cap)
      cg.setLineJoin(join)
      cg.strokePath()
    }
    func fill(_ path: CGPath, _ ink: CGColor) {
      cg.addPath(path)
      cg.setFillColor(ink)
      cg.fillPath()
    }
    // The rim; inside the wings the veins and the border band; the antennae, their knobs and the body.
    stroke(wings, colour(palette.edge, 1), width: 2.2, join: .round)
    cg.saveGState()
    cg.addPath(wings)
    cg.clip()
    stroke(ButterflyPaths.veins.cgPath, colour(palette.edge, 0.22), width: 0.9, cap: .round)
    stroke((style == .still ? ButterflyPaths.wings : ButterflyPaths.outline).cgPath, colour(palette.edge, 0.22), width: 22, join: .round)
    cg.restoreGState()
    let feelers = colour(style == .still || !dark ? palette.body : palette.feelersOnDark, 1)
    stroke(ButterflyPaths.antennae.cgPath, feelers, width: 1.8, cap: .round)
    fill(ButterflyPaths.knobs.cgPath, feelers)
    fill(ButterflyPaths.body.cgPath, colour(palette.body, 1))
  }
}

/**
 * One agent's butterfly. With a `motion` it moves as the Mac's live mark
 * does (`LiveButterfly`); a list row's or the header's holds still while
 * its agent rests (`stillWhenIdle`). Without one it is drawn once: the
 * bubbles' avatars, the colour choices, the group members.
 */
struct ButterflyView: View {
  let palette: AgentPalette
  var style: MarkStyle = .live
  var motion: MarkState?
  var stillWhenIdle = false
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let _ = Trace.tally("ButterflyView drawn")
    if style == .live, let motion {
      LiveButterfly(palette: palette, state: motion, stillWhenIdle: stillWhenIdle)
    } else {
      Canvas { context, size in
        MarkDrawing.draw(&context, in: CGRect(origin: .zero, size: size), palette: palette, dark: scheme == .dark, style: style)
      }
      .accessibilityHidden(true)
    }
  }
}

/** An agent's face: its own picture when it has one, else its butterfly; a group is its members' butterflies. */
struct AgentAvatar: View {
  let agent: Agent
  var members: [Agent] = []
  /** In the chat's header the members stand side by side; in a list row they cluster. */
  var groupInARow = false
  /** A list row's and the header's butterfly move while the agent works (the Mac's sidebar). */
  var moves = false

  var body: some View {
    let _ = Trace.tally("AgentAvatar drawn")
    if agent.isGroup {
      let shown = members.isEmpty ? [agent] : members
      if groupInARow { GroupStack(members: shown) } else { GroupCluster(members: shown) }
    } else if let image = Self.image(agent.avatarDataURL) {
      Image(uiImage: image).resizable().scaledToFill().clipShape(Circle())
    } else {
      ButterflyView(palette: agent.palette, motion: moves ? agent.markState : nil, stillWhenIdle: true)
    }
  }

  /** An agent's own picture, decoded once: a row asks again on every redraw, and a picture is tens of kilobytes of text. One that cannot be decoded is remembered too, or it was decoded again on every redraw. */
  @MainActor static func image(_ dataURL: String?) -> UIImage? {
    guard let dataURL, dataURL.hasPrefix("data:image") else { return nil }
    let bytes = dataURL.utf8
    let key = "\(bytes.count)|" + String(decoding: bytes.suffix(48), as: UTF8.self)
    if let known = decoded[key] { return known }
    let image = dataURL.firstIndex(of: ",").flatMap { comma in Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])) }.flatMap(UIImage.init(data:))
    if decoded.count > 200 { decoded.removeAll() }
    decoded[key] = .some(image)
    return image
  }

  @MainActor private static var decoded: [String: UIImage?] = [:]
}

/**
 * A group in a list row (`OOt`, `mnt`): two members at 2/3 of the square,
 * three at 5/9 (one above two), four in a grid, more as three and "+N";
 * each later member drawn on top, the ones behind cut out around its
 * butterfly with a small gap.
 */
struct GroupCluster: View {
  let members: [Agent]
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    GeometryReader { geometry in
      let frame = min(geometry.size.width, geometry.size.height)
      let overflow = members.count > 4
      let shown = overflow ? Array(members.prefix(3)) : members
      let slots = Butterfly.groupLayout(count: shown.count + (overflow ? 1 : 0), frame: frame)
      let gap = Butterfly.groupGap(frame: frame)
      let photos = shown.map { AgentAvatar.image($0.avatarDataURL) }
      let dark = scheme == .dark
      ZStack(alignment: .topLeading) {
        Canvas { context, _ in
          for (index, member) in shown.enumerated() {
            let slot = slots[index]
            let rect = CGRect(x: slot.x, y: slot.y, width: slot.size, height: slot.size)
            if index > 0 { cut(&context, around: rect, gap: gap) }
            if let image = photos[index] {
              var photo = context
              photo.clip(to: Path(ellipseIn: rect))
              photo.draw(Image(uiImage: image), in: rect)
            } else {
              MarkDrawing.draw(&context, in: rect, palette: member.palette, dark: dark, style: .still)
            }
          }
        }
        if overflow, let slot = slots.last {
          Text("+\(members.count - 3)")
            .font(.system(size: slot.size * 0.34, weight: .semibold))
            .foregroundStyle(Ink.secondary)
            .frame(width: slot.size, height: slot.size)
            .background(Ink.bubbleTheirs, in: Circle())
            .offset(x: slot.x, y: slot.y)
        }
      }
      .frame(width: frame, height: frame)
    }
  }

  /** Clears what is already drawn under the next member's butterfly, inflated by the gap. */
  private func cut(_ context: inout GraphicsContext, around rect: CGRect, gap: Double) {
    var eraser = context
    eraser.blendMode = .destinationOut
    let shape = MarkDrawing.wings(in: rect, style: .still)
    eraser.fill(shape, with: .color(.black))
    eraser.stroke(shape, with: .color(.black), style: StrokeStyle(lineWidth: gap * 2, lineJoin: .round))
  }
}

/**
 * A group in the chat's header (`fnt`): the members side by side at 20 px
 * steps of 12.5, each cut by its right neighbour's butterfly and a 2.5 px
 * gap, the stack zoomed x2.6 (52 pt members).
 */
struct GroupStack: View {
  let members: [Agent]
  var memberSize: Double = 52
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let shown = Array(members.prefix(3))
    let step = memberSize * 12.5 / 20
    let gap = memberSize * 2.5 / 20
    let width = memberSize + step * Double(max(shown.count - 1, 0))
    Canvas { context, _ in
      for (index, member) in shown.enumerated() {
        let rect = CGRect(x: step * Double(index), y: 0, width: memberSize, height: memberSize)
        if index > 0 {
          var eraser = context
          eraser.blendMode = .destinationOut
          let shape = MarkDrawing.wings(in: rect, style: .still)
          eraser.fill(shape, with: .color(.black))
          eraser.stroke(shape, with: .color(.black), style: StrokeStyle(lineWidth: gap * 2, lineJoin: .round))
        }
        MarkDrawing.draw(&context, in: rect, palette: member.palette, dark: scheme == .dark, style: .still)
      }
    }
    .frame(width: width, height: memberSize)
  }
}

/** The account button's letters in a disc ("BF"). */
struct Initials: View {
  let letters: String
  var size: Double = 36

  var body: some View {
    Text(letters.isEmpty ? "?" : letters)
      .font(.system(size: size * 0.4, weight: .semibold))
      .foregroundStyle(Ink.primary)
      .frame(width: size, height: size)
  }
}
