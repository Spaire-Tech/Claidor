import Foundation

/** A colour of a trail, as the window writes its gradient stops: `hsl(hue saturation% lightness%)`. */
public struct TrailColour: Sendable, Equatable {
  public let hue: Double, saturation: Double, lightness: Double

  /** In sRGB, 0 to 1. */
  public var rgb: (r: Double, g: Double, b: Double) {
    let s = saturation / 100, l = lightness / 100
    let c = (1 - abs(2 * l - 1)) * s
    let h = ((hue.truncatingRemainder(dividingBy: 360)) + 360).truncatingRemainder(dividingBy: 360) / 60
    let x = c * (1 - abs(h.truncatingRemainder(dividingBy: 2) - 1))
    let m = l - c / 2
    let (r, g, b): (Double, Double, Double)
    switch h {
    case ..<1: (r, g, b) = (c, x, 0)
    case ..<2: (r, g, b) = (x, c, 0)
    case ..<3: (r, g, b) = (0, c, x)
    case ..<4: (r, g, b) = (0, x, c)
    case ..<5: (r, g, b) = (x, 0, c)
    default: (r, g, b) = (c, 0, x)
    }
    return (r + m, g + m, b + m)
  }

  /** A palette stop as the window reads it off the mark (`__simeonInk`): its hue, its saturation at most 88 %, its lightness between 52 % and 74 %. */
  public init(_ rgb: RGB) {
    let high = max(rgb.r, rgb.g, rgb.b), low = min(rgb.r, rgb.g, rgb.b)
    let l = (high + low) / 2, c = high - low
    var h = 0.0, s = 0.0
    if c > 0 {
      s = c / (1 - abs(2 * l - 1))
      if high == rgb.r { h = ((rgb.g - rgb.b) / c).truncatingRemainder(dividingBy: 6) }
      else if high == rgb.g { h = (rgb.b - rgb.r) / c + 2 }
      else { h = (rgb.r - rgb.g) / c + 4 }
      h *= 60
      if h < 0 { h += 360 }
    }
    self.init(hue: h, saturation: min(s * 100, 88), lightness: min(max(l * 100, 52), 74))
  }

  public init(hue: Double, saturation: Double, lightness: Double) {
    self.hue = hue; self.saturation = saturation; self.lightness = lightness
  }
}

/**
 * One light trail as drawn this frame: its outline in the mark's units, cut
 * where it passes behind the butterfly (`back`, drawn under the body) and in
 * front of it (`front`, over it); filled with a five-stop gradient from its
 * tail to its head.
 */
public struct TrailRibbon: Sendable {
  public let back: [[Butterfly.Point]]
  public let front: [[Butterfly.Point]]
  public let from: Butterfly.Point
  public let to: Butterfly.Point
  public let stops: [TrailColour]
  public let opacity: Double
}

/**
 * A spark of the burst as drawn this frame, in the mark's units: a star
 * (`size` is its outer radius, turned `rotation` degrees), a dot (`size` is
 * its radius) or a dash (`length` by 1.5 × `size`, round-ended, lying along
 * its flight at `rotation` degrees).
 */
public struct TrailSpark: Sendable {
  public enum Kind: Sendable { case star, round, dash }
  public let kind: Kind
  public let x: Double, y: Double
  public let size: Double
  public let rotation: Double
  public let length: Double
  public let colour: TrailColour
  public let opacity: Double

  /** The star's ten points on a unit circle, alternately 1 and 0.42 out (`GJt`). */
  public static let starPoints: [Butterfly.Point] = (0..<10).map { i in
    let a = -Double.pi / 2 + Double(i) * .pi / 5, r = i % 2 == 0 ? 1.0 : 0.42
    return Butterfly.Point(cos(a) * r, sin(a) * r)
  }
}

/**
 * The spin's light trails (the window's `E_t`, in the agent's colours as the
 * patch's `spin-trails-*` replacements give them): when the butterfly
 * turns fast, three to five tapered ribbons of light are flung onto a
 * tilted orbit around it, a little apart in time and in lane, each running
 * between two neighbouring stops of the agent's palette. They follow the
 * spin, coast and draw in once it stops, and fade. While it makes a
 * picture (the whirl), they are thrown again each time the last set draws in.
 */
public final class LightTrails {
  struct Orbit {
    var lam: Double, lamVel: Double, tilt: Double, roll: Double, rad: Double, radVel: Double, follow: Double, carry: Double, arc: Double
  }
  struct Sample { var x: Double, y: Double, l: Double, z: Double }
  struct Ribbon {
    var orbit: Orbit
    var life = 0.0
    let max = 9.0
    let r: Double
    var ret = 0.0
    let hue: Double, hueSpan: Double, hueVel: Double, saturation: Double, lit: (Double, Double)
    var hist: [Sample] = []
  }

  private let random: () -> Double
  private var ribbons: [Ribbon] = []
  private var belts: [(tilt: Double, roll: Double)] = []
  private var count = 4
  private var firing = false
  private var rearmed = false
  private var pending: [(at: Double, index: Int)] = []
  private var lastAngle = 0.0
  private var velocity = 0.0
  private var lastMs = -1.0
  /** The belt's radius in the mark's units over the butterfly's half width (`radius()/114.27`). */
  private var beltScale = MarkShape.beltRadius / Butterfly.centre
  private var sparkState: [Spark] = []
  public private(set) var drawn: [TrailRibbon] = []
  /** The burst's sparks as drawn this frame, behind the butterfly. */
  public private(set) var sparks: [TrailSpark] = []
  /** Reduce motion: no trails are thrown and no sparks burst (the window's `s`). */
  public var reduceMotion = false

  public init(random: @escaping () -> Double = { Double.random(in: 0..<1) }) {
    self.random = random
  }

  private func between(_ low: Double, _ high: Double) -> Double { low + random() * (high - low) }

  /** How thick the trails draw on a mark this many points across (the window's `(340 / width)^0.7`, between 1 and 2.6). */
  public static func sizeScale(points: Double) -> Double { min(max(pow(340 / max(points, 1), 0.7), 1), 2.6) }

  /** Something still drawn or about to be: the mark's clock keeps running for it. */
  public var hasLife: Bool { !ribbons.isEmpty || !pending.isEmpty || !sparkState.isEmpty }

  /**
   * One frame: the butterfly's turn so far (`spinAngle`, radians), how
   * thick the trails draw for the mark's size (`sizeScale`, the window's
   * `(340 / width)^0.7`, 1 to 2.6), whether the whirl keeps throwing them,
   * and the agent's palette.
   */
  public func update(nowMs: Double, spinAngle: Double, sizeScale: Double, sustain: Bool, palette: AgentPalette, radius: Double = MarkShape.beltRadius) {
    let wall = lastMs < 0 ? 1.0 / 60 : max((nowMs - lastMs) / 1000, 0)
    let dt = min(wall, 0.1)
    lastMs = nowMs
    beltScale = radius / Butterfly.centre
    measure(spinAngle, dt)
    fire(nowMs, spinAngle, sustain, palette)
    move(dt, wall, sizeScale)
    moveSparks(dt, wall)
  }

  public func clear() {
    ribbons = []; pending = []; firing = false; rearmed = false; drawn = []; sparkState = []; sparks = []
  }

  // MARK: The burst (`f`, the poke "burst")

  struct Spark {
    var x: Double, y: Double, vx: Double, vy: Double
    var life = 0.0
    let max: Double, r: Double
    var rot: Double
    let vr: Double
    let colour: TrailColour
    let kind: TrailSpark.Kind
  }

  /**
   * Sparks flung out from the wings' edge (`burst(22, 1.1, 0.3)` when the
   * working butterfly is clicked): `count` of them around the ring, each
   * flying out at 170 to 360 units a second (times `speed`), turned a little
   * by `swirl`, falling and slowing, gone in under a second. Most are dots
   * and dashes in the palette's colours, about one in six a pale star.
   */
  public func burst(count: Int = 20, speed: Double = 1, swirl: Double = 0, palette: AgentPalette) {
    guard !reduceMotion, ribbons.count + sparkState.count <= 120 else { return }
    let inks = [palette.top, palette.mid, palette.bottom].map(TrailColour.init)
    let c = Butterfly.centre
    for index in 0..<count {
      let angle = Double(index) / Double(count) * 2 * .pi + between(-0.35, 0.35)
      let out = between(96, 116) * beltScale
      let fling = between(170, 360) * speed
      let across = swirl * fling * 0.2
      let star = random() < 0.18
      let vy = sin(angle) * fling + cos(angle) * across - between(20, 75)
      let life = between(0.45, 0.85)
      let r = star ? between(4, 7) : between(3.5, 8)
      let rot = between(0, 360), vr = between(-260, 260)
      let colour = star ? spark(inks.map { TrailColour(hue: $0.hue, saturation: $0.saturation, lightness: 76) }, 6) : spark(inks, 10)
      let round = !star && random() < 0.3
      sparkState.append(Spark(
        x: c + cos(angle) * out, y: c + sin(angle) * out, vx: cos(angle) * fling - sin(angle) * across, vy: vy,
        max: life, r: r, rot: rot, vr: vr, colour: colour, kind: star ? .star : round ? .round : .dash))
    }
  }

  /** One of the palette's inks, its hue moved up to `spread` degrees and its lightness up to 6 points, kept 50 to 76 (`__simeonSpark`). */
  private func spark(_ inks: [TrailColour], _ spread: Double) -> TrailColour {
    let ink = inks[min(Int(random() * Double(inks.count)), inks.count - 1)]
    let hue = (((ink.hue + between(-spread, spread)).truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)).rounded(.down)
    let light = min(max(ink.lightness + between(-6, 6), 50), 76).rounded(.down)
    return TrailColour(hue: hue, saturation: ink.saturation.rounded(.down), lightness: light)
  }

  /** Each spark along its flight (`z` for a particle): drag 6 % a frame, falling at 40 units a second squared, in over its first tenth and fading out. */
  private func moveSparks(_ dt: Double, _ wall: Double) {
    var kept: [Spark] = []
    var out: [TrailSpark] = []
    for var spark in sparkState {
      spark.life += spark.life > 0 ? wall : dt
      if spark.life >= spark.max { continue }
      spark.x += spark.vx * dt
      spark.y += spark.vy * dt
      let drag = pow(0.94, dt * 60)
      spark.vx *= drag
      spark.vy = spark.vy * drag + 40 * dt
      let age = min(max(spark.life / spark.max, 0), 1)
      let opacity = age < 0.1 ? age / 0.1 : pow(1 - (age - 0.1) / 0.9, 1.7)
      let size = Swift.max(spark.r * (1 - age * 0.4), 0.5)
      if spark.kind == .star { spark.rot += spark.vr * dt }
      let speed = hypot(spark.vx, spark.vy)
      out.append(TrailSpark(
        kind: spark.kind, x: spark.x, y: spark.y, size: size, rotation: spark.kind == .star ? spark.rot : atan2(spark.vy, spark.vx) * 180 / .pi,
        length: Swift.max(size * 2, Swift.min(speed * 0.05, 30)), colour: spark.colour, opacity: opacity))
      kept.append(spark)
    }
    sparkState = kept
    sparks = out
  }

  /** The turn's speed (`B`): a fresh turn sets up the orbit's belt. */
  private func measure(_ angle: Double, _ dt: Double) {
    var step = angle - lastAngle
    if !step.isFinite || abs(step) > 1.2 { step = 0 }
    lastAngle = angle
    let was = abs(velocity) >= 0.9
    velocity = dt > 0 ? step / dt : 0
    let now = abs(velocity) >= 0.9
    if !was && now { belts(1); firing = false; rearmed = false }
    if was && !now { pending = []; rearmed = false }
  }

  private func belts(_ n: Int) {
    let roll = between(-0.85, 0.85)
    belts = (0..<n).map { i in (between(0.16, 0.5), roll + Double(i) * .pi / Double(n) + between(-0.12, 0.12)) }
    count = n > 1 ? n * 3 : Int(between(3, 5).rounded())
  }

  /** Over 5 rad/s the ribbons are thrown, 55 to 105 ms apart (`R`); the whirl throws again once the last set has drawn in. */
  private func fire(_ nowMs: Double, _ angle: Double, _ sustain: Bool, _ palette: AgentPalette) {
    guard !reduceMotion else { return }
    let speed = abs(velocity)
    let orbiting = ribbons.contains { $0.ret < 1 }
    if sustain && firing && pending.isEmpty && speed >= 0.9 && !orbiting { firing = false; rearmed = true }
    if !firing && (speed >= 5 || (sustain && rearmed && speed >= 0.9)) {
      firing = true; rearmed = false
      pending = (0..<count).map { (nowMs + Double($0) * between(55, 105), $0) }
    }
    while let next = pending.first, nowMs >= next.at {
      pending.removeFirst()
      throwRibbon(angle - between(0, 0.18), direction: velocity < 0 ? -1 : 1, index: next.index, palette: palette)
    }
  }

  private func throwRibbon(_ lam: Double, direction: Double, index: Int, palette: AgentPalette) {
    guard ribbons.count + sparkState.count <= 110 else { return }
    if belts.isEmpty { belts(1) }
    let belt = belts[index % belts.count]
    let ink = [palette.top, palette.mid, palette.bottom].map(TrailColour.init)
    let first = random() < 0.5 ? 0 : 1
    let a = ink[first], b = ink[first + 1]
    let lanes = Double(index / belts.count) * (38 / Double(max(Int((Double(count) / Double(belts.count)).rounded(.up)) - 1, 1)))
    let width = count <= 3 ? between(8, 10.5) : count == 4 ? between(6.6, 8.6) : between(5.6, 7.4)
    let orbit = Orbit(
      lam: lam, lamVel: direction * between(0.5, 1.1), tilt: belt.tilt + between(-0.04, 0.04), roll: belt.roll + between(-0.05, 0.05),
      rad: beltScale * 116 + lanes + between(-1.5, 1.5), radVel: between(0, 2.5), follow: between(0.74, 0.94), carry: 0, arc: between(2.2, 3.4))
    ribbons.append(Ribbon(
      orbit: orbit, r: width,
      hue: a.hue + between(-8, 8), hueSpan: ((b.hue - a.hue + 540).truncatingRemainder(dividingBy: 360) - 180) + between(-8, 8),
      hueVel: between(1, 3) * (random() < 0.5 ? 1 : -1), saturation: (a.saturation + b.saturation) / 2, lit: (a.lightness, b.lightness)))
  }

  private func point(_ o: Orbit, _ lam: Double) -> Sample {
    let g = o.rad * sin(lam), y = -o.rad * cos(lam) * sin(o.tilt)
    let c = Butterfly.centre
    return Sample(x: c + g * cos(o.roll) - y * sin(o.roll), y: c + g * sin(o.roll) + y * cos(o.roll), l: lam, z: cos(lam) * cos(o.tilt))
  }

  /** Each ribbon along its orbit (`z`), drawn in, and laid out as outlines. */
  private func move(_ dt: Double, _ wall: Double, _ sizeScale: Double) {
    let spinning = abs(velocity) >= 0.9
    var kept: [Ribbon] = []
    var out: [TrailRibbon] = []
    for var ribbon in ribbons {
      ribbon.life += ribbon.life > 0 ? wall : dt
      let age = min(max(ribbon.life / ribbon.max, 0), 1)
      let drawIn = !spinning || age > 0.55
      ribbon.ret = min(max(ribbon.ret + (drawIn ? wall / 0.5 : -wall / 0.35), 0), 1)
      if ribbon.ret >= 1 { continue }
      let opacity = min(1, ribbon.life / 0.26)
      var o = ribbon.orbit
      if spinning {
        o.carry = velocity * o.follow
        o.lam += velocity * dt * o.follow + o.lamVel * dt
      } else {
        o.lam += (o.carry + o.lamVel) * dt
        o.carry *= exp(-2.6 * dt)
        o.lamVel *= exp(-2.6 * dt)
      }
      o.rad += o.radVel * dt
      ribbon.orbit = o
      let here = point(o, o.lam)
      let near = 0.72 + 0.28 * min(max(here.z, 0), 1)
      let grow = smoothstep(min(ribbon.life / 0.34, 1))
      let width = max(ribbon.r * near * 1.7 * sizeScale * grow * (1 - 0.72 * ribbon.ret * ribbon.ret), 0.5)
      // The path it has run along, in steps of at most 0.09 rad, cut to its arc.
      let last = ribbon.hist.last?.l ?? o.lam
      let span = o.lam - last
      let steps = min(Int((abs(span) / 0.09).rounded(.up)), 24)
      if steps > 0 { for s in 1...steps { ribbon.hist.append(point(o, last + span * Double(s) / Double(steps))) } }
      if ribbon.hist.isEmpty { ribbon.hist.append(here) }
      let arc = o.arc * (1 - smoothstep(ribbon.ret))
      while ribbon.hist.count > 2 && abs(o.lam - ribbon.hist[0].l) > arc { ribbon.hist.removeFirst() }
      let over = abs(o.lam - ribbon.hist[0].l) - arc
      if ribbon.hist.count >= 2 && over > 0 {
        ribbon.hist[0] = point(o, ribbon.hist[0].l + (o.lam - ribbon.hist[0].l < 0 ? -1 : 1) * over)
      }
      if ribbon.hist.count > 48 { ribbon.hist.removeFirst(ribbon.hist.count - 48) }
      if ribbon.hist.count >= 2 {
        let hue = ribbon.hue + ribbon.hueVel * ribbon.life
        let stops = (0..<5).map { i -> TrailColour in
          let p = Double(i) / 4
          return TrailColour(hue: ((hue + p * ribbon.hueSpan).truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360), saturation: ribbon.saturation, lightness: ribbon.lit.0 + (ribbon.lit.1 - ribbon.lit.0) * p)
        }
        let shape = Self.outline(ribbon.hist, width)
        out.append(TrailRibbon(back: shape.back, front: shape.front, from: Butterfly.Point(ribbon.hist[0].x, ribbon.hist[0].y), to: Butterfly.Point(ribbon.hist[ribbon.hist.count - 1].x, ribbon.hist[ribbon.hist.count - 1].y), stops: stops, opacity: opacity))
      }
      kept.append(ribbon)
    }
    ribbons = kept
    drawn = out
  }

  /**
   * A ribbon's outline (`L`): tapered from a quarter of its width at the tail
   * to half at the head, round at both ends, cut into runs in front of the
   * butterfly and behind it (each run overlapping its neighbour by a point).
   */
  static func outline(_ samples: [Sample], _ width: Double) -> (front: [[Butterfly.Point]], back: [[Butterfly.Point]]) {
    let n = samples.count
    guard n >= 2 else { return ([], []) }
    var length = 0.0
    for i in 1..<n { length += hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y) }
    let full = min(width, length * 0.34)
    var offsets: [(x: Double, y: Double)] = []
    var tangents: [(x: Double, y: Double)] = []
    for i in 0..<n {
      let a = samples[max(i - 1, 0)], b = samples[min(i + 1, n - 1)]
      var tx = b.x - a.x, ty = b.y - a.y
      let d = hypot(tx, ty)
      if d > 0 { tx /= d; ty /= d } else { tx = 1; ty = 0 }
      let half = full * (0.5 + 0.5 * (Double(i) / Double(n - 1))) / 2
      offsets.append((-ty * half, tx * half))
      tangents.append((tx, ty))
    }
    func cap(_ i: Int, forward: Bool) -> [Butterfly.Point] {
      let o = offsets[i], t = tangents[i], p = samples[i]
      let r = max(hypot(o.x, o.y), 0.2)
      let ux = o.x / max(hypot(o.x, o.y), 1e-9), uy = o.y / max(hypot(o.x, o.y), 1e-9)
      let sign = forward ? 1.0 : -1.0
      return (1..<8).map { k in
        let a = Double(k) / 8 * .pi
        return Butterfly.Point(p.x + r * sign * (ux * cos(a) + t.x * sin(a)), p.y + r * sign * (uy * cos(a) + t.y * sin(a)))
      }
    }
    func run(_ from: Int, _ to: Int) -> [Butterfly.Point] {
      var points: [Butterfly.Point] = []
      for i in from...to { points.append(Butterfly.Point(samples[i].x + offsets[i].x, samples[i].y + offsets[i].y)) }
      if to == n - 1 { points += cap(to, forward: true) }
      for i in stride(from: to, through: from, by: -1) { points.append(Butterfly.Point(samples[i].x - offsets[i].x, samples[i].y - offsets[i].y)) }
      if from == 0 { points += cap(0, forward: false) }
      return points
    }
    var front: [[Butterfly.Point]] = [], back: [[Butterfly.Point]] = []
    var start = 0
    while start < n {
      let inFront = samples[start].z >= 0
      var end = start
      while end + 1 < n && (samples[end + 1].z >= 0) == inFront { end += 1 }
      let a = max(start - 1, 0), b = min(end + 1, n - 1)
      if b > a { if inFront { front.append(run(a, b)) } else { back.append(run(a, b)) } }
      start = end + 1
    }
    return (front, back)
  }
}
