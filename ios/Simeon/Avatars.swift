import SwiftUI
import UIKit
import SimeonCore

/** The butterfly's pieces as paths, in the mark's own square (SimeonCore's `Butterfly`). */
enum ButterflyPaths {
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
 * An agent's butterfly in its palette, as `butterflyMarkSvg` draws it for
 * the window: the gradient wings with their rim, a soft darker border and
 * fine veins, the body, and the antennae (lighter on a dark ground).
 */
struct ButterflyView: View {
  let palette: AgentPalette
  /** How much of the mark's square around the wings to keep: the window's mark has 15 of 259 on each side. */
  var margin: Double = 15
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Canvas { context, size in
      let box = Butterfly.side + 2 * margin
      let scale = min(size.width, size.height) / box
      context.translateBy(x: (size.width - box * scale) / 2 + margin * scale, y: (size.height - box * scale) / 2 + margin * scale)
      context.scaleBy(x: scale, y: scale)
      let outline = ButterflyPaths.outline
      let bounds = outline.boundingRect
      let edge = Color(palette.edge)
      let ink = Gradient(stops: [
        .init(color: Color(palette.top), location: 0),
        .init(color: Color(palette.mid), location: 0.55),
        .init(color: Color(palette.bottom), location: 1),
      ])
      context.fill(outline, with: .linearGradient(ink, startPoint: CGPoint(x: bounds.minX, y: bounds.minY), endPoint: CGPoint(x: bounds.minX + 0.15 * bounds.width, y: bounds.maxY)))
      context.stroke(outline, with: .color(edge), style: StrokeStyle(lineWidth: 2.2, lineJoin: .round))
      context.drawLayer { wings in
        wings.clip(to: outline)
        wings.stroke(ButterflyPaths.veins, with: .color(edge.opacity(0.22)), style: StrokeStyle(lineWidth: 0.9, lineCap: .round))
        wings.stroke(outline, with: .color(edge.opacity(0.22)), style: StrokeStyle(lineWidth: 22, lineJoin: .round))
      }
      let feelers = Color(scheme == .dark ? palette.feelersOnDark : palette.body)
      context.stroke(ButterflyPaths.antennae, with: .color(feelers), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
      context.fill(ButterflyPaths.knobs, with: .color(feelers))
      context.fill(ButterflyPaths.body, with: .color(Color(palette.body)))
    }
    .accessibilityHidden(true)
  }
}

/** An agent's face: its own picture when it has one, else its butterfly; a group is its members' butterflies. */
struct AgentAvatar: View {
  let agent: Agent
  var members: [Agent] = []
  /** In a header the members stand side by side; in a row they cluster. */
  var groupInARow = false

  var body: some View {
    if agent.isGroup {
      GroupAvatar(palettes: (members.isEmpty ? [agent] : members).prefix(3).map(\.palette), inARow: groupInARow)
    } else if let image = Self.image(agent.avatarDataURL) {
      Image(uiImage: image).resizable().scaledToFill().clipShape(Circle())
    } else {
      ButterflyView(palette: agent.palette)
    }
  }

  static func image(_ dataURL: String?) -> UIImage? {
    guard let dataURL, let comma = dataURL.firstIndex(of: ","), dataURL.hasPrefix("data:image") else { return nil }
    return Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])).flatMap(UIImage.init(data:))
  }
}

/** A group's butterflies: one above two in a row of the list, three side by side in the chat's header (the window's group avatar). */
struct GroupAvatar: View {
  let palettes: [AgentPalette]
  var inARow = false

  var body: some View {
    GeometryReader { geometry in
      let side = min(geometry.size.width, geometry.size.height)
      if inARow {
        HStack(spacing: -side * 0.18) {
          ForEach(Array(palettes.enumerated()), id: \.offset) { _, palette in
            ButterflyView(palette: palette, margin: 4).frame(width: side * 0.62, height: side * 0.62)
          }
        }
        .frame(width: geometry.size.width, height: geometry.size.height)
      } else {
        let small = side * 0.58
        ZStack {
          ForEach(Array(palettes.enumerated()), id: \.offset) { index, palette in
            ButterflyView(palette: palette, margin: 4)
              .frame(width: small, height: small)
              .position(Self.spot(index, of: palettes.count, side: side, small: small))
          }
        }
        .frame(width: side, height: side)
      }
    }
  }

  static func spot(_ index: Int, of count: Int, side: Double, small: Double) -> CGPoint {
    let half = small / 2
    switch (count, index) {
    case (1, _): return CGPoint(x: side / 2, y: side / 2)
    case (2, 0): return CGPoint(x: half, y: half)
    case (2, _): return CGPoint(x: side - half, y: side - half)
    case (_, 0): return CGPoint(x: side / 2, y: half)
    case (_, 1): return CGPoint(x: half, y: side - half)
    default: return CGPoint(x: side - half, y: side - half)
    }
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
