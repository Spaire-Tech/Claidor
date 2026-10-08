import Foundation

/**
 * The butterfly every agent is, as numbers: the same wings, veins, body and
 * antennae `butterflyMarkSvg` draws for the window
 * (desktop/scripts/lib/router-renderer-patch.mjs, "The butterfly"), in the
 * mark's own square, 0 to 228.541 on each side with the centre at 114.2705
 * (y down). The app scales it to any size.
 */
public enum Butterfly {
  public static let centre = 114.2705
  public static let side = 2 * centre

  /** The wings: rotated ellipses [cx, cy, a, b, degrees] around the centre, the left side mirroring the right (`BUTTERFLY_ELLIPSES`). */
  public static let ellipses: [[Double]] = [[52, -36, 63, 39, -30], [38, 36, 44, 35, 48], [0, 0, 7, 50, 90]].flatMap { e -> [[Double]] in
    e[0] == 0 ? [e] : [e, [-e[0], e[1], e[2], e[3], 180 - e[4]]]
  }

  /** How far from the centre the wings reach along the angle `t` (radians, y down): `butterflyReach`. */
  public static func reach(_ t: Double) -> Double {
    let dx = cos(t), dy = sin(t)
    var k = 0.0
    for e in ellipses {
      let (cx, cy, a, b, g) = (e[0], e[1], e[2], e[3], e[4])
      let r = g * .pi / 180, c = cos(r), s = sin(r)
      let px = -cx * c - cy * s, py = cx * s - cy * c
      let vx = dx * c + dy * s, vy = -dx * s + dy * c
      let A = vx * vx / (a * a) + vy * vy / (b * b)
      let B = 2 * (px * vx / (a * a) + py * vy / (b * b))
      let C = px * px / (a * a) + py * py / (b * b) - 1
      let D = B * B - 4 * A * C
      if D < 0 { continue }
      let q = (-B + D.squareRoot()) / (2 * A)
      if q > k { k = q }
    }
    return k
  }

  /** The wings' outline, sampled at the window's 200 angles (`BUTTERFLY_OUTLINE`). */
  public static let outline: [(x: Double, y: Double)] = (0..<200).map { i in
    let t = Double(i) / 200 * .pi * 2, k = reach(t)
    return (centre + cos(t) * k, centre + sin(t) * k)
  }

  /** A quadratic curve: from, control, to. */
  public struct Curve: Sendable {
    public let from: (x: Double, y: Double)
    public let control: (x: Double, y: Double)
    public let to: (x: Double, y: Double)
  }

  /** Veins: four on each forewing, three on each hindwing, from the root to just inside the edge (`BUTTERFLY_VEINS`). */
  public static let veins: [Curve] = {
    var curves: [Curve] = []
    let at = { (x: Double, y: Double) in (x: centre + x, y: centre + y) }
    for side in [1.0, -1.0] {
      for (rootY, fan) in [(-8.0, [(-58.0, 4.0), (-40, 2), (-22, 1), (-6, -1)]), (6.0, [(22.0, -2.0), (42, 0), (64, 2)])] {
        for (degrees, bend) in fan {
          let t = degrees * .pi / 180
          let k = reach(atan2(sin(t), cos(t) * side))
          let x0 = 4 * side, y0 = rootY
          let x1 = side * abs(k * cos(t)) * 0.97, y1 = k * sin(t) * 0.97
          let bent = bend * side
          let length = max(hypot(x1 - x0, y1 - y0), 1)
          let cx = (x0 + x1) / 2 - ((y1 - y0) / length) * bent
          let cy = (y0 + y1) / 2 + ((x1 - x0) / length) * bent
          curves.append(Curve(from: at(x0, y0), control: at(cx, cy), to: at(x1, y1)))
        }
      }
    }
    return curves
  }()

  /** A cubic curve: from, two controls, to. */
  public struct Cubic: Sendable {
    public let from: (x: Double, y: Double)
    public let c1: (x: Double, y: Double)
    public let c2: (x: Double, y: Double)
    public let to: (x: Double, y: Double)
  }

  /** The two antennae (`BUTTERFLY_ANTENNAE`) and their knobs, radius 2.6. */
  public static let antennae: [Cubic] = {
    let R = centre
    return [
      Cubic(from: (R - 2, R - 30), c1: (R - 6, R - 50), c2: (R - 14, R - 66), to: (R - 24, R - 80)),
      Cubic(from: (R + 2, R - 30), c1: (R + 6, R - 50), c2: (R + 14, R - 66), to: (R + 24, R - 80)),
    ]
  }()
  public static let knobs: [(x: Double, y: Double)] = [(centre - 24, centre - 80), (centre + 24, centre - 80)]
  public static let knobRadius = 2.6

  /** The body: head, thorax, abdomen, as ellipses (cx, cy, rx, ry) (`BUTTERFLY_BODY`). */
  public static let body: [(cx: Double, cy: Double, rx: Double, ry: Double)] = [
    (centre, centre - 26, 4, 4), (centre, centre - 11, 4.6, 11), (centre, centre + 20, 3.2, 22),
  ]

  /** The wings' own box in the square, the rim included (x 3.3 to 225.3, y 30.6 to 191.6): what a tight avatar crops to. */
  public static let wingBox = (minX: 3.3, minY: 30.6, maxX: 225.3, maxY: 191.6)

  // MARK: The window's mark (the engine's own outline, size and colours)

  /** A cubic Bézier segment: start, two controls, end. */
  public struct Segment: Sendable, Equatable {
    public let from: Point, c1: Point, c2: Point, to: Point
  }

  public struct Point: Sendable, Equatable {
    public let x: Double, y: Double
    public init(_ x: Double, _ y: Double) { self.x = x; self.y = y }
  }

  /** The engine rounds every number it writes to two places (`Nr`). */
  static func nr(_ value: Double) -> Double { (value * 100).rounded() / 100 }

  /**
   * A closed smooth curve through the points, as the engine draws a shape
   * (`Ztt`): a Catmull-Rom spline written as cubic Béziers.
   */
  public static func smooth(_ points: [Point]) -> [Segment] {
    let n = points.count
    return (0..<n).map { s in
      let r = points[(s - 1 + n) % n], i = points[s], o = points[(s + 1) % n], l = points[(s + 2) % n]
      return Segment(
        from: Point(nr(i.x), nr(i.y)),
        c1: Point(nr(i.x + (o.x - r.x) / 6), nr(i.y + (o.y - r.y) / 6)),
        c2: Point(nr(o.x - (l.x - i.x) / 6), nr(o.y - (l.y - i.y) / 6)),
        to: Point(nr(o.x), nr(o.y)))
    }
  }

  /** Points along the curve, every 4 units or so (`$Be`): what the engine measures a shape's box from. */
  public static func samples(_ segments: [Segment]) -> [Point] {
    var points: [Point] = segments.first.map { [$0.from] } ?? []
    for segment in segments {
      let length = hypot(segment.c1.x - segment.from.x, segment.c1.y - segment.from.y) + hypot(segment.c2.x - segment.c1.x, segment.c2.y - segment.c1.y) + hypot(segment.to.x - segment.c2.x, segment.to.y - segment.c2.y)
      let steps = max(2, Int((length / 4).rounded(.up)))
      for k in 1...steps {
        let t = Double(k) / Double(steps), u = 1 - t
        let a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
        points.append(Point(a * segment.from.x + b * segment.c1.x + c * segment.c2.x + d * segment.to.x, a * segment.from.y + b * segment.c1.y + c * segment.c2.y + d * segment.to.y))
      }
    }
    return points
  }

  /**
   * The wings as the window draws them: the 200 reach points smoothed
   * (`Yse`), then centred in the square and scaled so their larger side is
   * 228.44 (`p_t`, `h_t`; clamped to 0.9-1.35): about 2.98 down and x1.039.
   */
  public static let wings: [Segment] = {
    let raw = smooth(outline.map { Point($0.x, $0.y) })
    let points = samples(raw)
    let minX = points.map(\.x).min()!, maxX = points.map(\.x).max()!
    let minY = points.map(\.y).min()!, maxY = points.map(\.y).max()!
    let dx = centre - (minX + maxX) / 2, dy = centre - (minY + maxY) / 2
    let scale = min(max(228.44 / max(maxX - minX, maxY - minY), 0.9), 1.35)
    let move = { (p: Point) in Point(nr(centre + (p.x + dx - centre) * scale), nr(centre + (p.y + dy - centre) * scale)) }
    return raw.map { Segment(from: move($0.from), c1: move($0.c1), c2: move($0.c2), to: move($0.to)) }
  }()

  /** The box of the wings as drawn. */
  public static let wingsBox: (minX: Double, minY: Double, maxX: Double, maxY: Double) = {
    let points = samples(wings)
    return (points.map(\.x).min()!, points.map(\.y).min()!, points.map(\.x).max()!, points.map(\.y).max()!)
  }()

  /** The mark is drawn x259/229 about the centre (`$de * c4e`), in a 259-unit view from -15: the wings span the avatar's full width. */
  public static let markScale = 259.0 / 229.0
  public static let viewOrigin = -15.0
  public static let viewSide = 259.0

  // MARK: Group avatars (the window's `mnt`, `fnt`)

  /** Where each member sits in a group's square avatar of side `frame`: two at 2/3, three at 5/9, four in a grid. */
  public static func groupLayout(count: Int, frame: Double) -> [(x: Double, y: Double, size: Double)] {
    if count <= 1 { return [(0, 0, frame)] }
    if count == 2 {
      let size = frame * 2 / 3, step = frame - size
      return [(0, 0, size), (step, step, size)]
    }
    let size = frame * 5 / 9, step = frame - size
    if count == 3 { return [(step / 2, 0, size), (0, step, size), (step, step, size)] }
    return [(0, 0, size), (step, 0, size), (0, step, size), (step, step, size)]
  }

  /** The gap cut around a later member, by the frame's size (`ONe` 2 at 36 px). */
  public static func groupGap(frame: Double) -> Double { 2 * frame / 36 }
}

extension AgentPalette {
  /**
   * The colour an agent with none stored wears: the window's `sle`, a hash
   * of its id (FNV-1a, then mulberry32) into the first ten palettes.
   */
  public static func defaultColour(forAgentId id: String) -> String {
    var hash: UInt32 = 2166136261
    for unit in id.utf16 { hash ^= UInt32(unit); hash = hash &* 16777619 }
    let seed = hash ^ (1 &* 2654435769)
    var state = seed ^ (1 &* 2654435769)
    // mulberry32, one draw.
    state = state &+ 1831565813
    var t = (state ^ (state >> 15)) &* (1 | state)
    t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
    let draw = Double(t ^ (t >> 14)) / 4294967296
    let index = Int(draw * 10)
    return all.indices.contains(index) ? all[index].id : "black"
  }
}
