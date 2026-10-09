import Foundation

/**
 * What an agent's butterfly shows it doing, read off its roster row as the
 * window reads it (`wbe`, `nln`, `tln` and the verbs of `dse`): resting,
 * thinking (it folds into three dots), searching, working, waiting on or
 * messaging someone (an orbit), sending to another agent, or making a
 * picture.
 */
public enum MarkState: String, Sendable, CaseIterable {
  case idle, thinking, searching, working, orbit, sending, loading

  /** The glyph the butterfly folds into (`A_t`); the other states keep the wings. */
  public var glyph: MarkGlyph? {
    switch self {
    case .thinking: .dots
    case .orbit: .orbit
    case .sending: .send
    case .loading: .whirl
    case .idle, .searching, .working: nil
    }
  }

  /** The state for a running agent's current activity (`{kind: "thinking"}` or `{kind: "tool", tool, detail}`). */
  public static func of(activityKind kind: String?, tool: String?, detail: String?) -> MarkState {
    guard let kind else { return .working }
    if kind == "tool" && tool == "SendToAgent" { return .sending }
    if kind == "thinking" { return .thinking }
    guard let tool, !tool.isEmpty else { return .working }
    // Drafting a file and running commands are both "working" (`tln`), so the detail does not change the state.
    switch tool {
    case "WebSearch", "WebFetch", "Read", "ExternalRead", "BoxRead": return .searching
    case "ExternalShell", "Shell", "BoxShell", "CopyToBox", "CopyFromBox", "CloudAgent", "Screenshot", "Computer", "request_box_help": return .working
    case "Await", "AwaitShell", "AwaitExternalShell", "Task", "SendToAgent", "UpdateAgent", "CreateAgent", "ReactToMessage": return .orbit
    case "GenerateImage": return .loading
    default:
      if tool == "CallMcpTool" || connecting.contains(tool) || tool.hasPrefix("browser_") { return .searching }
      if subagentWaits.contains(tool) { return .orbit }
      return .working
    }
  }

  /** Tools the window shows as "Connecting to a third party app" (`Xon`). */
  static let connecting: Set<String> = ["GetMcpTools", "McpAuth", "SearchPlugins", "GetPlugin", "InstallPlugin", "UninstallPlugin", "GetMcpServerStatus", "AddMcpServer", "UninstallMcpServer", "AuthenticateMcpServer", "RestartMcpServers", "SetMcpInstructions", "SearchMcpServers", "InstallMcpServer", "EnableTeamServer"]
  /** Tools the window shows as "Waiting on another agent" (`Qon`). */
  static let subagentWaits: Set<String> = ["CheckSubagent", "MessageSubagent", "StopSubagent"]
}

extension Agent {
  /** What its butterfly shows (`mct`): resting while it waits on you or is not running; thinking while it writes. */
  public var markState: MarkState {
    if awaitingUserResponse { return .idle }
    if isComposing { return .thinking }
    guard isRunning || isRunningTurn else { return .idle }
    return MarkState.of(activityKind: activityKind, tool: activityTool, detail: activityDetail)
  }
}

/** The glyphs the butterfly folds into. */
public enum MarkGlyph: String, Sendable {
  case dots, orbit, send, whirl

  /** The folded orb's radius in the mark's units (`Rs`). */
  var orbRadius: Double {
    switch self {
    case .dots: 22
    case .orbit: 19
    case .send: 20
    case .whirl: 15
    }
  }

  /** How far a small mark zooms in on the glyph (`__t`). */
  var zoom: Double {
    switch self {
    case .dots: 1.5
    case .orbit: 1.14
    case .send: 1.12
    case .whirl: 1.45
    }
  }
}

/** A round part of a glyph, in the mark's square, drawn in the palette's flat colour behind the body. */
public struct MarkDot: Sendable, Equatable {
  public let x: Double, y: Double, radius: Double, opacity: Double
}

/** A ring of a glyph, around the mark's centre, stroked in the flat colour. */
public struct MarkRing: Sendable, Equatable {
  public let radius: Double, lineWidth: Double, opacity: Double
}

/**
 * One frame of the butterfly: the body's transform about the mark's
 * centre (`translate(c+dx, c+dy) rotate(r) scale(sx, sy) translate(-c, -c)`),
 * its outline when a spin or a fold changes it, how much of the details
 * show, the glyph's parts and the small mark's zoom.
 */
public struct MarkFrame: Sendable, Equatable {
  public var dx = 0.0, dy = 0.0
  /** Degrees. */
  public var rotation = 0.0
  public var scaleX = 1.0, scaleY = 1.0
  /** A closed ring of points to draw smooth (`W9e`); nil draws the wings as they are. */
  public var outline: [Butterfly.Point]?
  /** The veins, border band, rim, antennae and body: gone once the wings fold into the orb. */
  public var artOpacity = 1.0
  public var opacity = 1.0
  public var dots: [MarkDot] = []
  public var rings: [MarkRing] = []
  /** The view zooms in by this about its centre (a small mark's glyph). */
  public var zoom = 1.0

  public static let rest = MarkFrame()
}

/** A spring as the engine steps it (`tc`, `xl`): stiffness, damping ratio, semi-implicit Euler. */
struct MarkSpring {
  var x: Double, v = 0.0, t: Double
  init(_ value: Double) { x = value; t = value }

  mutating func step(_ stiffness: Double, _ damping: Double, _ dt: Double) {
    v += (-2 * damping * stiffness * v - stiffness * stiffness * (x - t)) * dt
    x += v * dt
    if !x.isFinite || !v.isFinite { x = t; v = 0 }
  }
}

/**
 * The window's mark engine (`$_t`), the part the butterfly uses: each
 * state's pose (turn, tilt, roll and squash, each on its own spring), the
 * spins a working or searching agent does every few seconds (the outline
 * turned as a set of spheres), and the fold into a glyph while it thinks
 * or waits (the wings morph into a small orb, the details fade, and the
 * three dots ripple). The spin's light trails are not drawn here.
 */
public final class MarkEngine {
  private let random: () -> Double
  private var turn = MarkSpring(0), tilt = MarkSpring(0), roll = MarkSpring(0), squash = MarkSpring(1)
  private var fold = MarkSpring(0), crossfade = MarkSpring(1)
  private var spin: MarkSpring?
  private var startMs: Double?
  private var lastMs: Double?
  private var seenState: MarkState?
  private var stateStartMs = 0.0
  private var nextSpinMs = 0.0
  private var glyph: MarkGlyph?
  private var fadingGlyph: MarkGlyph?
  private var lastGlyphTarget: MarkGlyph?
  private var glyphStartMs = -1e9

  public init(random: @escaping () -> Double = { Double.random(in: 0..<1) }) {
    self.random = random
  }

  private func between(_ low: Double, _ high: Double) -> Double { low + random() * (high - low) }

  /** Nothing left moving: a resting mark may stop its clock. */
  public var isSettled: Bool {
    seenState == .idle && spin == nil && fold.x < 0.004 && abs(fold.v) < 0.01
  }

  /** The frame at `now` (seconds) for a mark `sizePoints` across showing `state`. */
  public func frame(at now: Double, state: MarkState, sizePoints: Double) -> MarkFrame {
    let ms = now * 1000
    if startMs == nil { startMs = ms }
    let dt = min(max((ms - (lastMs ?? ms)) / 1000, 0), 0.1)
    lastMs = ms

    // The glyph to fold into, crossfading from the one before (`tn`).
    let target = state.glyph
    if target != lastGlyphTarget { lastGlyphTarget = target }
    fold.t = target == nil ? 0 : 1
    if let target, target != glyph {
      if glyph != nil && fold.x > 0.02 {
        fadingGlyph = glyph; crossfade = MarkSpring(0); crossfade.t = 1
      } else {
        fadingGlyph = nil; crossfade = MarkSpring(1)
      }
      glyph = target
      glyphStartMs = ms
    }
    if target == nil && fold.x < 0.004 { glyph = nil; fadingGlyph = nil }
    if crossfade.x > 0.996 { fadingGlyph = nil }

    pose(ms, state)

    let steps = max(1, Int((dt / (1.0 / 120)).rounded(.up)))
    let h = dt / Double(steps)
    for _ in 0..<steps where h > 0 {
      spin?.step(6.2, 1, h)
      turn.step(5, 0.9, h); tilt.step(3.5, 1, h); roll.step(4, 1, h); squash.step(10, 0.8, h)
      fold.step(14, 1, h); crossfade.step(11, 1, h)
    }
    return render(ms, sizePoints)
  }

  /** Each state's pose targets (`Gr`), and its spins. */
  private func pose(_ ms: Double, _ state: MarkState) {
    if seenState != state {
      seenState = state
      stateStartMs = ms
      nextSpinMs = ms + (state == .searching ? between(800, 1600) : state == .working ? between(1200, 2400) : between(6000, 10000))
    }
    let t = (ms - (startMs ?? ms)) / 1000
    switch state {
    case .idle:
      turn.t = sin(t * 0.5) * 1.5 + sin(t * 0.17) * 0.6
      tilt.t = sin(t * 0.27)
      roll.t = sin(t * 0.85) * 1.2
      squash.t = 1 + sin(t * 0.85) * 0.007
    case .thinking:
      turn.t = -9 + sin(t * 0.35) * 5
      tilt.t = sin(t * 0.3) * 5
      roll.t = sin(t * 0.6) * 2.5
      squash.t = 1
    case .searching:
      let e = sin(t * 1.3)
      turn.t = e * 13; tilt.t = e * 7; roll.t = sin(t * 1.7) * 3; squash.t = 1
      if ms >= nextSpinMs { startSpin(direction: random() < 0.5 ? 1 : -1); nextSpinMs = ms + between(4000, 7000) }
    case .working:
      let e = sin(t * .pi * 2 * 1.6)
      turn.t = 4 + e * 2.5; tilt.t = 3; roll.t = 1.5 + max(0, e) * 3; squash.t = 1 - max(0, e) * 0.02
      if ms >= nextSpinMs { startSpin(direction: 1); nextSpinMs = ms + between(6000, 9000) }
    case .orbit, .sending, .loading:
      turn.t = 0; tilt.t = 0; roll.t = 0; squash.t = 1
    }
  }

  /** One turn around its own axis now, the turn a working mark makes every few seconds: the app's launch shows it. */
  public func turnNow(direction: Double = 1) { startSpin(direction: direction) }

  /** Whether a turn is under way. */
  public var isTurning: Bool { spin != nil }

  /** One turn around its own axis (`pn`). */
  private func startSpin(direction: Double) {
    guard spin == nil else { return }
    var s = MarkSpring(0)
    s.t = 2 * .pi * direction
    spin = s
  }

  /** The ripple through the three dots (`ca`): each in turn lifts, grows and brightens. */
  private func wave(_ ms: Double, index: Double, amount: Double) -> (lift: Double, pop: Double, tone: Double) {
    let phase = ((((ms - glyphStartMs) / 1400 + 0.119).truncatingRemainder(dividingBy: 1)) + 1).truncatingRemainder(dividingBy: 1)
    var d = abs(phase - index / 3)
    d = min(d, 1 - d)
    let near = exp(-(d * d) / (2 * 0.15 * 0.15))
    return (near * 9 * amount, 0.84 + 0.22 * near, 1 - 0.5 * (1 - near))
  }

  private func render(_ ms: Double, _ sizePoints: Double) -> MarkFrame {
    var frame = MarkFrame()
    var spinAngle = 0.0, spinning = false
    if let s = spin {
      spinAngle = s.x; spinning = true
      if abs(s.t - s.x) < 0.004 && abs(s.v) < 0.015 { spin = nil; spinAngle = 0; spinning = false }
    }
    let folded = min(max(fold.x, 0), 1)
    let mix = min(max(crossfade.x, 0), 1)
    let fading = mix < 0.999 ? fadingGlyph : nil
    // A spring only nears its rest, so a fold under a thousandth is the wings again (the window's path differs from them by less than a hundredth of a unit there).
    let morph = folded < 0.001 ? 0 : min(max(folded / 0.62, 0), 1)

    if morph >= 1 {
      frame.outline = MarkShape.circle
    } else if morph > 0 || spinning {
      let ring = spinning ? MarkShape.turned(spinAngle) : MarkShape.ring
      frame.outline = morph > 0 ? zip(ring, MarkShape.circle).map { a, b in
        let k = easeInOutCubic(morph)
        return Butterfly.Point(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k)
      } : ring
    }
    frame.artOpacity = max(0, 1 - 2.2 * morph)

    func amount(_ g: MarkGlyph) -> Double { g == glyph ? folded * mix : g == fading ? folded * (1 - mix) : 0 }
    let orb = glyph.map { $0.orbRadius * mix + (fading?.orbRadius ?? $0.orbRadius) * (1 - mix) } ?? 19
    let middle = wave(ms, index: 1, amount: folded)
    let dotsAmount = amount(.dots)
    var pop = glyph == .dots || fading == .dots ? 1 + (middle.pop - 1) * (dotsAmount / max(folded, 0.001)) : 1
    let sinceState = ms - stateStartMs
    let sendAmount = amount(.send)
    if sendAmount > 0.004 {
      let u = (((sinceState / 1500).truncatingRemainder(dividingBy: 1)) + 1).truncatingRemainder(dividingBy: 1)
      let dip = u < 0.18 ? -0.06 * sin(u / 0.18 * .pi) : 0
      let swell = u >= 0.18 && u < 0.42 ? 0.05 * sin((u - 0.18) / 0.24 * .pi) : 0
      pop *= 1 + (dip + swell) * sendAmount
    }
    var wanderX = 0.0, wanderY = 0.0
    let whirlAmount = amount(.whirl)
    if whirlAmount > 0.004 {
      let s = ms / 1000
      wanderX += (sin(s * 0.9) * 2 + sin(s * 1.7) * 0.8) * whirlAmount
      wanderY += (sin(s * 1.3) * 2.4 + sin(s * 0.6) * 1.2) * whirlAmount
    }
    let orbScale = orb / Butterfly.centre * pop
    let wings = 1 - folded
    frame.dx = tilt.x * wings + wanderX * folded
    frame.dy = roll.x * wings - middle.lift * dotsAmount + wanderY * folded
    frame.rotation = turn.x * wings * MarkShape.tiltScale
    frame.scaleX = wings + orbScale * folded
    frame.scaleY = squash.x * wings + orbScale * folded
    frame.opacity = 1 - (1 - middle.tone) * dotsAmount

    if dotsAmount > 0.004 { dots(ms, dotsAmount, into: &frame) }
    let orbitAmount = amount(.orbit)
    if orbitAmount > 0.004 { orbit(ms, orbitAmount, into: &frame) }
    if sendAmount > 0.004 { send(sinceState, sendAmount, into: &frame) }

    // A small mark zooms in on its glyph (`XBe`), less as it grows past 44 pt.
    let small = 1 - smoothstep(min(max((sizePoints - 44) / 90, 0), 1))
    let poseScale = Butterfly.markScale
    let zoomNow = glyph.map { max($0.zoom / max(poseScale, 1), 1) } ?? 1
    let zoomBefore = fading.map { max($0.zoom / max(poseScale, 1), 1) } ?? zoomNow
    frame.zoom = 1 + (zoomNow * mix + zoomBefore * (1 - mix) - 1) * folded * small
    return frame
  }

  /** The two side dots of thinking (`za`); the middle one is the orb itself. */
  private func dots(_ ms: Double, _ amount: Double, into frame: inout MarkFrame) {
    let c = Butterfly.centre
    for (index, x) in [c - 62, c + 62].enumerated() {
      let offset = Double(index) * 0.12
      let p = min(max((amount - offset) / (1 - offset), 0), 1)
      guard p > 0.004 else { continue }
      let grow = easeOutCubic(p), spread = easeOutBack(p)
      let w = wave(ms, index: index == 0 ? 0 : 2, amount: amount)
      frame.dots.append(MarkDot(x: c + (x - c) * spread, y: c - w.lift, radius: 22 * grow * w.pop * 1.02, opacity: grow * w.tone))
    }
  }

  /** Five dots circling (`$a`): messaging, or waiting on someone. */
  private func orbit(_ ms: Double, _ amount: Double, into frame: inout MarkFrame) {
    let c = Butterfly.centre
    let grow = easeOutCubic(amount), reach = 52 * easeOutBack(amount), start = ms * 0.0017
    for index in 0..<5 {
      let angle = start + Double(index) * .pi * 2 / 5
      let front = cos(angle)
      let near = 0.5 + 0.5 * min(max(front, 0), 1)
      frame.dots.append(MarkDot(x: c + reach * sin(angle), y: c - reach * 0.42 * cos(angle), radius: max(12 * near * grow, 0.3), opacity: min(max((front + 0.4) / 0.6, 0.18), 1) * grow))
    }
  }

  /** A dot flying out to the top right with its trail and a ring (`No`): sending to another agent. */
  private func send(_ sinceState: Double, _ amount: Double, into frame: inout MarkFrame) {
    let c = Butterfly.centre
    let grow = easeOutCubic(amount)
    let u = (((sinceState / 1500).truncatingRemainder(dividingBy: 1)) + 1).truncatingRemainder(dividingBy: 1)
    let out = min(max((u - 0.18) / 0.55, 0), 1)
    let flight = out * out * (0.4 + 0.6 * out)
    if out > 0 && out < 1 {
      frame.dots.append(MarkDot(x: c + 0.74 * 108 * flight, y: c - 0.62 * 108 * flight, radius: 10 * (1 - flight * 0.55) * grow, opacity: grow * (1 - flight * flight)))
    }
    let trailOut = min(max((u - 0.26) / 0.55, 0), 1)
    let trail = trailOut * trailOut * (0.4 + 0.6 * trailOut)
    if out > 0 && trailOut > 0 && trailOut < 1 {
      frame.dots.append(MarkDot(x: c + 0.74 * 108 * trail, y: c - 0.62 * 108 * trail, radius: 5 * (1 - trail * 0.6) * grow, opacity: grow * 0.3 * (1 - trail)))
    }
    let ring = min(max((u - 0.18) / 0.3, 0), 1)
    if ring > 0 && ring < 1 {
      frame.rings.append(MarkRing(radius: 20 + 34 * easeOutCubic(ring), lineWidth: 2.8 * (1 - ring), opacity: grow * (1 - ring) * 0.8))
    }
  }
}

/** The butterfly's own measures for the engine (`Po` on its outline), checked against the window's numbers in the tests. */
public enum MarkShape {
  /** How much of the pose's turn shows as a rotation (`m_t` on the wings: 0.17). */
  public static let tiltScale = 0.17
  /** Rays the engine measures a shape along (`Kne`). */
  static let rays = 96

  /** The full circle the wings fold into (`PNe`). */
  public static let circle: [Butterfly.Point] = (0..<rays).map { i in
    let a = Double(i) / Double(rays) * 2 * .pi
    return Butterfly.Point(Butterfly.centre + cos(a) * Butterfly.centre, Butterfly.centre + sin(a) * Butterfly.centre)
  }

  /** The wings' outline along the 96 rays from the centre (`d_t`): how far out each ray leaves the wings. */
  public static let ring: [Butterfly.Point] = {
    let c = Butterfly.centre
    let points = Butterfly.samples(Butterfly.wings)
    return (0..<rays).map { i in
      let a = Double(i) / Double(rays) * 2 * .pi, r = cos(a), s = sin(a)
      var far = 0.0
      for index in points.indices {
        let p = points[index], q = points[(index + 1) % points.count]
        let d = p.x - c, m = p.y - c, f = q.x - c, h = q.y - c
        let y = (f - d) * s - (h - m) * r
        if abs(y) < 1e-9 { continue }
        let k = (d * s - m * r) / -y
        if k < 0 || k > 1 { continue }
        let v = (d + (f - d) * k) * r + (m + (h - m) * k) * s
        if v > far { far = v }
      }
      return Butterfly.Point(c + r * far, c + s * far)
    }
  }()

  /** The wings as spheres, for turning (`solid`: x, y, z, radius about the centre). */
  static let spheres: [(x: Double, y: Double, z: Double, r: Double)] = [(-52, -36, 10, 46), (52, -36, -12, 46), (-38, 36, 8, 38), (38, 36, -10, 38), (0, 0, 14, 12)]

  /** The spheres' silhouette along each ray, turned `angle` about the upright axis (`HBe`). */
  static func silhouette(_ angle: Double) -> [Double] {
    let c = cos(angle), s = sin(angle)
    let turned = spheres.map { (x: $0.x * c + $0.z * s, y: $0.y, r: $0.r) }
    let reach: [Double] = (0..<rays).map { i in
      let a = Double(i) / Double(rays) * 2 * .pi, dx = cos(a), dy = sin(a)
      var far = 0.0
      for sphere in turned {
        let v = dx * sphere.x + dy * sphere.y
        let b = v * v - (sphere.x * sphere.x + sphere.y * sphere.y) + sphere.r * sphere.r
        if b <= 0 { continue }
        far = max(far, v + b.squareRoot())
      }
      return far
    }
    return blur(reach)
  }

  static func blur(_ values: [Double]) -> [Double] {
    let n = values.count
    return values.indices.map { i in (values[(i - 2 + n) % n] + 4 * values[(i - 1 + n) % n] + 6 * values[i] + 4 * values[(i + 1) % n] + values[(i + 2) % n]) / 16 }
  }

  private static let silhouetteAtRest = silhouette(0)

  /** The outline mid-spin (`turnAt`): each ray scaled by how the spheres' silhouette has narrowed or widened, smoothed. */
  public static func turned(_ angle: Double) -> [Butterfly.Point] {
    var scale = zip(silhouette(angle), silhouetteAtRest).map { min(max(($0 + 12) / ($1 + 12), 0.32), 1.5) }
    for _ in 0..<3 { scale = blur(scale) }
    let c = Butterfly.centre
    return zip(ring, scale).map { p, k in Butterfly.Point(c + (p.x - c) * k, c + (p.y - c) * k) }
  }
}

func easeOutCubic(_ x: Double) -> Double { 1 - pow(1 - x, 3) }
func easeOutBack(_ x: Double) -> Double { 1 + 2.70158 * pow(x - 1, 3) + 1.70158 * pow(x - 1, 2) }
func easeInOutCubic(_ x: Double) -> Double { x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2 }
func smoothstep(_ x: Double) -> Double { x * x * (3 - 2 * x) }
