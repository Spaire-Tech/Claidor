import SwiftUI
import SimeonCore

/**
 * One agent's moving butterfly, as the window keeps it (`dln`): one hidden
 * source mark per agent, 8 points wide, that every live place mirrors (the
 * agent's sidebar row and its chat's working line), so they move as one.
 * Its engine (SimeonCore's `MarkEngine`, the window's `$_t`) and light
 * trails step once per frame, whoever draws first. Because the source is
 * 8 points, every mirror gets the small mark's zoom on its glyph and the
 * thickest trails.
 *
 * At rest the window pauses it: 1.4 s after the agent stops working, once
 * nothing is still folding, turning, hopping or trailing, it snaps to its
 * rest pose and stops drawing until the agent works again.
 */
@MainActor
final class MarkSource {
  private var engine = MarkEngine()
  private var trails = LightTrails()
  private var seen: MarkState = .idle
  /** When it last went idle; at first it is resting already. */
  private var idleSince = -Double.infinity
  private var last: (time: Double, drawn: LiveFrame)?

  /** The source's width as the window lays it out (8 points, ×1.131). */
  static let sourcePoints = 8 * Butterfly.markScale
  /** How long a mark keeps moving after it goes idle (`sand-68fwb3`'s 1.4 s). */
  static let settle = 1.4

  /** Reduce motion: no turns or trails, folds at once, and it pauses as soon as it is idle (`sand-dn7m2a`'s 1 ms). */
  private var reduceMotion = false

  /** This frame: stepped once for every view drawing it at `now` (seconds). */
  func frame(at now: Double, state: MarkState, palette: AgentPalette, reduceMotion: Bool) -> LiveFrame {
    if let last, abs(last.time - now) < 0.001 { return last.drawn }
    if last.map({ now - $0.time > 0.5 }) ?? true {
      // Its clock had stopped (at rest): it starts again from the rest pose, as the window resets its springs when it pauses.
      engine = MarkEngine()
      trails = LightTrails()
    }
    self.reduceMotion = reduceMotion
    engine.reduceMotion = reduceMotion
    trails.reduceMotion = reduceMotion
    if state != seen {
      if state == .idle { idleSince = now }
      seen = state
    }
    let frame = engine.frame(at: now, state: state, sizePoints: MarkSource.sourcePoints)
    trails.update(nowMs: now * 1000, spinAngle: frame.spinAngle, sizeScale: LightTrails.sizeScale(points: MarkSource.sourcePoints), sustain: frame.whirling, palette: palette, radius: frame.beltRadius)
    let drawn = LiveFrame(frame: frame, ribbons: trails.drawn, sparks: trails.sparks)
    last = (now, drawn)
    return drawn
  }

  /** Paused and nothing left moving: the views stop their clocks and draw the rest pose. */
  func isResting(at now: Double) -> Bool {
    seen == .idle && now - idleSince >= (reduceMotion ? 0.001 : MarkSource.settle) && engine.isSettled && !trails.hasLife
  }

  /** A click on the working butterfly (`tryPokeMark`): a turn, a hop or a burst of sparks, in turn. */
  func poke(_ kind: Poke, palette: AgentPalette) {
    guard !isResting(at: Date().timeIntervalSinceReferenceDate) else { return }
    switch kind {
    case .spin: engine.turnNow(direction: Bool.random() ? 1 : -1)
    case .bounce: engine.bounce()
    case .burst: trails.burst(count: 22, speed: 1.1, swirl: 0.3, palette: palette)
    }
  }

  enum Poke: CaseIterable { case spin, bounce, burst }
}

/** One frame of a live mark: the butterfly, its trails and the burst's sparks. */
struct LiveFrame {
  var frame: MarkFrame
  var ribbons: [TrailRibbon]
  var sparks: [TrailSpark]

  static let rest = LiveFrame(frame: .rest, ribbons: [], sparks: [])
}

/** Every agent's source mark (the window's hidden stage, `mln`). */
@MainActor
enum MarkStage {
  private static var sources: [String: MarkSource] = [:]

  static func source(_ agentId: String) -> MarkSource {
    if let source = sources[agentId] { return source }
    let source = MarkSource()
    sources[agentId] = source
    return source
  }
}

/**
 * An agent's butterfly where the window lets it move (`isStatic: false`):
 * a sidebar row and the chat's working line. It runs the agent's source
 * mark while the agent works and for its settling after, and draws the
 * still butterfly at rest.
 */
struct LiveMark: View {
  let agent: Agent
  var size: CGFloat = 36
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var awake = false

  var body: some View {
    let state = agent.markState
    let reduce = reduceMotion
    let palette = agent.palette
    let dark = scheme == .dark
    let source = MarkStage.source(agent.id)
    TimelineView(.animation(minimumInterval: nil, paused: !awake)) { context in
      Canvas { canvas, box in
        let drawn = awake ? MainActor.assumeIsolated { source.frame(at: context.date.timeIntervalSinceReferenceDate, state: state, palette: palette, reduceMotion: reduce) } : .rest
        LiveArt.draw(&canvas, drawn, in: CGRect(origin: .zero, size: box), palette: palette, dark: dark)
      }
    }
    .frame(width: size, height: size)
    .task(id: state) {
      // Awake while it works, and until its source has settled after; checked four times a second.
      if state != .idle || !source.isResting(at: Date().timeIntervalSinceReferenceDate) { awake = true }
      while awake && !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(250))
        if source.isResting(at: Date().timeIntervalSinceReferenceDate) { awake = false }
      }
    }
    .accessibilityHidden(true)
  }
}

/**
 * Drawing a live frame as the window's mark draws it (`$_t`'s SVG): the
 * window's `-15 -15 259 259` view, zoomed about its middle by the frame's
 * zoom, ×1.131 about the box's centre; behind the butterfly the far side of
 * the light trails, the burst's sparks, the glyph's dots and rings in the
 * palette's flat colour; then the butterfly turned, tilted and squashed
 * about its centre, its outline drawn smooth when a turn or a fold changes
 * it, the details (rim, veins, band, antennae, body) faded as it folds;
 * then the near side of the trails.
 */
enum LiveArt {
  static func transform(in rect: CGRect, zoom: Double) -> CGAffineTransform {
    let half = Butterfly.viewSide / 2 / max(zoom, 0.01)
    let middle = Butterfly.viewOrigin + Butterfly.viewSide / 2
    let origin = middle - half, side = 2 * half
    let scale = min(rect.width, rect.height) / side
    let offsetX = rect.minX + (rect.width - side * scale) / 2
    let offsetY = rect.minY + (rect.height - side * scale) / 2
    let m = Butterfly.markScale
    let fitted = CGAffineTransform(translationX: offsetX, y: offsetY)
      .scaledBy(x: scale, y: scale)
      .translatedBy(x: -origin, y: -origin)
    // Then the CSS `scale(1.131)` about the box's middle.
    let grown = CGAffineTransform(translationX: rect.midX, y: rect.midY)
      .scaledBy(x: m, y: m)
      .translatedBy(x: -rect.midX, y: -rect.midY)
    return fitted.concatenating(grown)
  }

  /** A closed ring of points drawn smooth (`Ztt`: each point to the next as a cubic through its neighbours). */
  static func smooth(_ points: [Butterfly.Point]) -> Path {
    var path = Path()
    let n = points.count
    guard n > 2 else { return path }
    func p(_ i: Int) -> CGPoint { let q = points[(i % n + n) % n]; return CGPoint(x: q.x, y: q.y) }
    path.move(to: p(0))
    for i in 0..<n {
      let before = p(i - 1), here = p(i), next = p(i + 1), after = p(i + 2)
      path.addCurve(
        to: next,
        control1: CGPoint(x: here.x + (next.x - before.x) / 6, y: here.y + (next.y - before.y) / 6),
        control2: CGPoint(x: next.x - (after.x - here.x) / 6, y: next.y - (after.y - here.y) / 6))
    }
    path.closeSubpath()
    return path
  }

  /** The folded orb (`KBe`), drawn once. */
  static let circle = smooth(MarkShape.circle)

  static func draw(_ context: inout GraphicsContext, _ drawn: LiveFrame, in rect: CGRect, palette: AgentPalette, dark: Bool) {
    let frame = drawn.frame
    var ctx = context
    ctx.concatenate(transform(in: rect, zoom: frame.zoom))
    let flat = Color(palette.mid)
    let c = Butterfly.centre

    for ribbon in drawn.ribbons { fill(ribbon, ribbon.back, in: &ctx) }
    for spark in drawn.sparks { draw(spark, in: &ctx) }
    for dot in frame.dots where dot.radius > 0 {
      ctx.fill(Path(ellipseIn: CGRect(x: dot.x - dot.radius, y: dot.y - dot.radius, width: 2 * dot.radius, height: 2 * dot.radius)), with: .color(flat.opacity(dot.opacity)))
    }
    for ring in frame.rings where ring.radius > 0 {
      ctx.stroke(Path(ellipseIn: CGRect(x: c - ring.radius, y: c - ring.radius, width: 2 * ring.radius, height: 2 * ring.radius)), with: .color(flat.opacity(ring.opacity)), lineWidth: ring.lineWidth)
    }

    let pose = CGAffineTransform(translationX: c + frame.dx, y: c + frame.dy)
      .rotated(by: frame.rotation * .pi / 180)
      .scaledBy(x: frame.scaleX, y: frame.scaleY)
      .translatedBy(x: -c, y: -c)
    if frame.opacity >= 0.999 {
      var body = ctx
      body.concatenate(pose)
      butterfly(&body, frame, palette: palette, dark: dark)
    } else {
      var group = ctx
      group.opacity = frame.opacity
      group.drawLayer { layer in
        layer.concatenate(pose)
        butterfly(&layer, frame, palette: palette, dark: dark)
      }
    }

    for ribbon in drawn.ribbons { fill(ribbon, ribbon.front, in: &ctx) }
  }

  /** The butterfly in its own units: the wings (or the outline a turn or fold gives them) and its details. */
  private static func butterfly(_ ctx: inout GraphicsContext, _ frame: MarkFrame, palette: AgentPalette, dark: Bool) {
    let shape: Path
    if let outline = frame.outline {
      shape = outline == MarkShape.circle ? circle : smooth(outline)
    } else {
      shape = ButterflyArt.wings
    }
    // The gradient's (0,0) to (0.15,1) in the shape's own box, as SVG's objectBoundingBox draws it.
    let box = shape.boundingRect
    let ink = Gradient(stops: [
      .init(color: Color(palette.top), location: 0),
      .init(color: Color(palette.mid), location: 0.55),
      .init(color: Color(palette.bottom), location: 1),
    ])
    let a = 0.15 / max(box.width, 0.01), b = 1 / max(box.height, 0.01), n = a * a + b * b
    ctx.fill(shape, with: .linearGradient(ink, startPoint: CGPoint(x: box.minX, y: box.minY), endPoint: CGPoint(x: box.minX + a / n, y: box.minY + b / n)))
    let art = frame.artOpacity
    guard art > 0.001 else { return }
    let edge = Color(palette.edge)
    ctx.stroke(shape, with: .color(edge.opacity(art)), style: StrokeStyle(lineWidth: 2.2, lineJoin: .round))
    if art >= 0.999 {
      details(&ctx, clip: shape, palette: palette, dark: dark)
    } else {
      var faded = ctx
      faded.opacity = art
      faded.drawLayer { layer in details(&layer, clip: shape, palette: palette, dark: dark) }
    }
  }

  /** The veins and the band inside the wings (clipped to the shape), the antennae, their knobs and the body. */
  private static func details(_ ctx: inout GraphicsContext, clip: Path, palette: AgentPalette, dark: Bool) {
    let edge = Color(palette.edge)
    var inside = ctx
    inside.clip(to: clip)
    inside.stroke(ButterflyArt.veins, with: .color(edge.opacity(0.22)), style: StrokeStyle(lineWidth: 0.9, lineCap: .round))
    inside.stroke(ButterflyArt.outline, with: .color(edge.opacity(0.22)), style: StrokeStyle(lineWidth: 22, lineJoin: .round))
    let feelers = Color(dark ? palette.feelersOnDark : palette.body)
    ctx.stroke(ButterflyArt.antennae, with: .color(feelers), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
    ctx.fill(ButterflyArt.knobs, with: .color(feelers))
    ctx.fill(ButterflyArt.body, with: .color(Color(palette.body)))
  }

  /** A trail's run on one side of the butterfly, filled tail to head with its five colours. */
  private static func fill(_ ribbon: TrailRibbon, _ runs: [[Butterfly.Point]], in ctx: inout GraphicsContext) {
    guard !runs.isEmpty, ribbon.opacity > 0.001 else { return }
    var path = Path()
    for run in runs where run.count > 2 {
      path.move(to: CGPoint(x: run[0].x, y: run[0].y))
      for point in run.dropFirst() { path.addLine(to: CGPoint(x: point.x, y: point.y)) }
      path.closeSubpath()
    }
    let stops = ribbon.stops.enumerated().map { index, colour in
      Gradient.Stop(color: colour.color, location: Double(index) / Double(max(ribbon.stops.count - 1, 1)))
    }
    var faded = ctx
    faded.opacity = ribbon.opacity
    faded.fill(path, with: .linearGradient(Gradient(stops: stops), startPoint: CGPoint(x: ribbon.from.x, y: ribbon.from.y), endPoint: CGPoint(x: ribbon.to.x, y: ribbon.to.y)))
  }

  private static let star: Path = {
    var path = Path()
    for (index, point) in TrailSpark.starPoints.enumerated() {
      let p = CGPoint(x: point.x, y: point.y)
      if index == 0 { path.move(to: p) } else { path.addLine(to: p) }
    }
    path.closeSubpath()
    return path
  }()

  /** A spark of the burst: a star, a dot, or a dash along its flight. */
  private static func draw(_ spark: TrailSpark, in ctx: inout GraphicsContext) {
    let colour = spark.colour.color.opacity(spark.opacity)
    switch spark.kind {
    case .star:
      let placed = star.applying(CGAffineTransform(translationX: spark.x, y: spark.y).rotated(by: spark.rotation * .pi / 180).scaledBy(x: spark.size, y: spark.size))
      ctx.fill(placed, with: .color(colour))
    case .round:
      ctx.fill(Path(ellipseIn: CGRect(x: spark.x - spark.size, y: spark.y - spark.size, width: 2 * spark.size, height: 2 * spark.size)), with: .color(colour))
    case .dash:
      let height = spark.size * 1.5
      let dash = Path(roundedRect: CGRect(x: -spark.length / 2, y: -height / 2, width: spark.length, height: height), cornerRadius: height / 2)
      ctx.fill(dash.applying(CGAffineTransform(translationX: spark.x, y: spark.y).rotated(by: spark.rotation * .pi / 180)), with: .color(colour))
    }
  }
}

extension TrailColour {
  /** As the window writes it: `hsl()` with whole numbers. */
  var color: Color {
    let rgb = TrailColour(hue: hue.rounded(), saturation: saturation.rounded(), lightness: lightness.rounded()).rgb
    return Color(.sRGB, red: rgb.r, green: rgb.g, blue: rgb.b)
  }
}
