import SwiftUI
import SimeonCore

/**
 * A butterfly that moves as the Mac's does (SimeonCore's `MarkEngine`, the
 * window's mark engine): it sways at rest, leans and bobs while its agent
 * works, swings while it searches, spins now and then, and folds into three
 * dots while it thinks. Drawn each display frame while it moves; a list
 * row's butterfly holds still while its agent rests, as the Mac's sidebar
 * pauses it. With Reduce Motion on it stays still.
 */
struct LiveButterfly: View {
  let palette: AgentPalette
  var state: MarkState = .idle
  var stillWhenIdle = false
  @State private var engine = MarkEngine()
  @State private var resting: Bool
  @State private var side: CGFloat = 28
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
    // At most 60 frames a second, and a butterfly at rest at 30: on a 120 Hz screen each one drew twice as often as the eye needs.
    TimelineView(.animation(minimumInterval: state == .idle ? 1.0 / 30 : 1.0 / 60, paused: !moving)) { context in
      // The pose is worked out here, on the main thread; the drawing, the heavy part, is done off it.
      let frame = moving ? engine.frame(at: context.date.timeIntervalSinceReferenceDate, state: state, sizePoints: side) : .rest
      let dark = scheme == .dark
      Canvas(rendersAsynchronously: true) { graphics, size in
        MarkDrawing.draw(&graphics, in: CGRect(origin: .zero, size: size), palette: palette, dark: dark, style: .live, frame: frame)
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { side = $0 }
    .task(id: state) {
      guard stillWhenIdle else { return }
      if state != .idle { resting = false; return }
      // Back at rest: let the fold and any spin finish, then hold still.
      while !Task.isCancelled && !resting {
        try? await Task.sleep(for: .milliseconds(400))
        if engine.isSettled { resting = true }
      }
    }
    .accessibilityHidden(true)
  }
}
