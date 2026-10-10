import SwiftUI
import SimeonCore

/**
 * A butterfly that moves as the Mac's does (SimeonCore's `MarkEngine`, the
 * window's mark engine): it sways at rest, leans and bobs while its agent
 * works, swings while it searches, spins now and then with the spin's light
 * trails circling it in its own colours, folds into three dots while it
 * thinks, and whirls while it makes a picture. Drawn each display frame
 * while it moves; a list row's butterfly holds still while its agent rests,
 * as the Mac's sidebar pauses it. With Reduce Motion on it stays still.
 */
struct LiveButterfly: View {
  let palette: AgentPalette
  var state: MarkState = .idle
  var stillWhenIdle = false
  @State private var engine = MarkEngine()
  @State private var trails = LightTrails()
  @State private var resting: Bool
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(palette: AgentPalette, state: MarkState = .idle, stillWhenIdle: Bool = false) {
    self.palette = palette
    self.state = state
    self.stillWhenIdle = stillWhenIdle
    _resting = State(initialValue: stillWhenIdle && state == .idle)
  }

  var body: some View {
    let moving = !reduceMotion && !resting
    Group {
      if moving {
        // 30 frames a second, at work too: each frame runs the engine and draws every path on the main thread, and two
        // butterflies at 60 kept it busy enough that taps waited (the founder, 10 October 2026: "all our buttons feel heavy").
        MarkCanvas(palette: palette, engine: engine, trails: trails, state: state, fps: 30)
      } else {
        // Still: the image drawn once, not a canvas drawn again on every redraw.
        Image(uiImage: MarkDrawing.image(palette, style: .live, dark: scheme == .dark))
          .resizable().interpolation(.high).scaledToFit()
      }
    }
    .task(id: state) {
      guard stillWhenIdle else { return }
      if state != .idle { if resting { resting = false }; return }
      // Back at rest: let the fold, any spin and its trails finish, then hold still.
      while !Task.isCancelled && !resting {
        try? await Task.sleep(for: .milliseconds(400))
        if engine.isSettled && !trails.hasLife { resting = true }
      }
    }
    .accessibilityHidden(true)
  }
}

/**
 * The live butterfly's canvas. It reaches past the butterfly's own square
 * (`reach`), without taking more room, so the spin's light trails can circle
 * outside it as they do on the Mac; the half of each trail behind the
 * butterfly is drawn under its body, the half in front over it.
 */
struct MarkCanvas: View {
  let palette: AgentPalette
  let engine: MarkEngine
  let trails: LightTrails
  let state: MarkState
  var fps: Double = 60
  @State private var side: CGFloat = 0
  @Environment(\.colorScheme) private var scheme
  static let reach: CGFloat = 1.7

  var body: some View {
    // Its own square takes taps, as the canvas did (the chat's header opens the agent's page from it); the trails past it do not.
    Color.clear
      .contentShape(.rect)
      .onGeometryChange(for: CGFloat.self) { min($0.size.width, $0.size.height).rounded() } action: { if abs($0 - side) >= 1 { side = $0 } }
      .overlay {
        if side > 0 {
          let side = side
          TimelineView(.animation(minimumInterval: 1.0 / fps, paused: false)) { context in
            Canvas { graphics, size in
              let now = context.date.timeIntervalSinceReferenceDate
              let frame = engine.frame(at: now, state: state, sizePoints: side)
              trails.update(nowMs: now * 1000, spinAngle: frame.spinAngle, sizeScale: LightTrails.sizeScale(points: side), sustain: frame.whirling, palette: palette)
              let box = CGRect(x: (size.width - side) / 2, y: (size.height - side) / 2, width: side, height: side)
              MarkDrawing.draw(&graphics, in: box, palette: palette, dark: scheme == .dark, style: .live, frame: frame, trails: trails.drawn)
            }
            .frame(width: side * Self.reach, height: side * Self.reach)
          }
          .allowsHitTesting(false)
        } else {
          Image(uiImage: MarkDrawing.image(palette, style: .live, dark: scheme == .dark))
            .resizable().interpolation(.high).scaledToFit()
        }
      }
  }
}
