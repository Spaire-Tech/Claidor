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
}
