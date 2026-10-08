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
    TimelineView(.animation(paused: !moving)) { context in
      Canvas { graphics, size in
        let frame = moving ? engine.frame(at: context.date.timeIntervalSinceReferenceDate, state: state, sizePoints: size.width) : .rest
        MarkDrawing.draw(&graphics, in: CGRect(origin: .zero, size: size), palette: palette, dark: scheme == .dark, style: .live, frame: frame)
      }
    }
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
