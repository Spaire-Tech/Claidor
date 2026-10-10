import AppKit
import SwiftUI
import SimeonCore

// MARK: The agent at work

/**
 * The working line's place under the messages (`sand-activity-slot`), 40
 * high whether or not the agent works, so the messages do not move when it
 * starts. It comes in when the agent starts writing or working, holds each
 * activity's words for at least 0.8 s (SimeonCore's `ActivityHold`, the
 * window's `EJn`), and goes out over 0.14 s when it stops (`xJn`).
 */
struct ActivitySlot: View {
  let agent: Agent?
  let line: ActivityLine?
  let look: Look
  @State private var hold = ActivityHold(nil, at: 0)
  /** Shown, and going out. */
  @State private var shown: Agent?
  @State private var exiting = false
  /** Bumped when it comes in again, so its entrance plays again. */
  @State private var entrance = 0
  /** Bumped each minute, for the time on the words. */
  @State private var minute = 0
  /** The latest line, for a waiting one's turn. */
  @State private var latest: ActivityLine?

  var body: some View {
    let _ = minute
    let now = Date().timeIntervalSinceReferenceDate
    ZStack(alignment: .leading) {
      if let shown {
        let typing = line?.verb == "typing" || (line == nil && hold.shown == nil)
        let words = typing ? "Typing…" : hold.shown?.text ?? "Working…"
        // The agent as it is now (its butterfly's state), the one shown while it goes out.
        ActivityRow(
          agent: agent ?? shown,
          words: words,
          wordsKey: typing ? "typing" : hold.shown?.key ?? "working",
          elapsed: typing ? nil : hold.elapsed(at: now),
          spoken: typing ? "\(shown.name) is typing" : "\(shown.name): \(words)",
          exiting: exiting,
          look: look)
          .id(entrance)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .frame(height: 40)
    .onChange(of: line, initial: true) { _, line in update(line) }
    .task(id: hold.due) {
      // A newer activity waits for the shown one's 0.8 s.
      // Not while it goes out: the line keeps its last words.
      guard let due = hold.due, !exiting else { return }
      try? await Task.sleep(for: .seconds(max(0, due - Date().timeIntervalSinceReferenceDate)))
      guard !Task.isCancelled else { return }
      hold.want(working(latest), at: Date().timeIntervalSinceReferenceDate)
    }
    .task(id: hold.shownAt) {
      // The time joins the words after a minute and moves on each minute.
      while !Task.isCancelled, let next = hold.nextMinute(after: Date().timeIntervalSinceReferenceDate) {
        try? await Task.sleep(for: .seconds(max(0.05, next - Date().timeIntervalSinceReferenceDate)))
        minute += 1
      }
    }
    .task(id: exiting) {
      guard exiting else { return }
      try? await Task.sleep(for: .milliseconds(140))
      guard !Task.isCancelled, exiting else { return }
      exiting = false
      shown = nil
    }
  }

  /** The activity the hold keeps, while working (typing clears it). */
  private func working(_ line: ActivityLine?) -> ActivityLine? {
    guard let line, line.verb != "typing" else { return nil }
    return line
  }

  private func update(_ line: ActivityLine?) {
    let now = Date().timeIntervalSinceReferenceDate
    latest = line
    guard let line, let agent else {
      if shown != nil && !exiting { exiting = true }
      return
    }
    if shown == nil || exiting {
      // Coming in (again): a fresh hold, the entrance from the start.
      hold = ActivityHold(working(line), at: now)
      if exiting { entrance += 1 }
      exiting = false
    } else if line.verb == "typing" {
      hold = ActivityHold(nil, at: now)
    } else {
      hold.want(line, at: now)
    }
    shown = agent
  }
}

/**
 * The agent at work (`sand-activity-mark`, 36 high, padded 8 on the left):
 * its butterfly (28, facing the other way, moving) and what it is doing,
 * 14 on 22 at 500 under the window's sweep of light, the time after a
 * minute at 12 in the tertiary grey. It comes in over 0.18 s, scaled from
 * 0.92 at its left (`sand-11nrck8`); the butterfly pops in from 0.6 a
 * little after (0.34 s, 0.22 s late, overshooting); new words rise 4
 * points as they come (`sand-gcq4cg`). Clicking the butterfly gives it a
 * turn, a hop or a burst of sparks, in turn.
 */
private struct ActivityRow: View {
  let agent: Agent
  let words: String
  let wordsKey: String
  let elapsed: String?
  let spoken: String
  let exiting: Bool
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var entered = false
  @State private var markIn = false
  @State private var pokes = 0

  /** The window's curves: in (`cubic-bezier(.22,1,.36,1)`), and the butterfly's overshooting pop; with Reduce motion, a 0.12 s fade (`sand-18re5ia`). */
  static let into = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.18)
  static let pop = Animation.timingCurve(0.34, 1.56, 0.64, 1, duration: 0.34).delay(0.22)
  static let fade = Animation.easeOut(duration: 0.12)

  var body: some View {
    let shown = entered && !exiting
    HStack(spacing: 8) {
      AgentMark(agent: agent, agents: store.agents, size: 28, live: true)
        .scaleEffect(x: -1, y: 1)
        .scaleEffect(markIn || reduceMotion ? 1 : 0.6)
        .opacity(markIn ? 1 : 0)
        .contentShape(Rectangle())
        .onTapGesture { poke() }
      ActivityWords(words: words, elapsed: elapsed, look: look)
        .id(wordsKey)
        .offset(y: -1)
    }
    .padding(.leading, 8)
    .frame(height: 36)
    .scaleEffect(shown || reduceMotion ? 1 : 0.92, anchor: .leading)
    .opacity(shown ? 1 : 0)
    .animation(reduceMotion ? ActivityRow.fade : .timingCurve(0.22, 1, 0.36, 1, duration: 0.14), value: exiting)
    .onAppear {
      withAnimation(reduceMotion ? ActivityRow.fade : ActivityRow.into) { entered = true }
      withAnimation(reduceMotion ? ActivityRow.fade : ActivityRow.pop) { markIn = true }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(spoken)
  }

  /** The window's pokes in turn (`eqe`): a turn, a hop, a burst. */
  private func poke() {
    guard !agent.isGroup, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
    let kinds = MarkSource.Poke.allCases
    MarkStage.source(agent.id).poke(kinds[pokes % kinds.count], palette: agent.palette)
    pokes += 1
  }
}

/** The working line's words (`sand-activity-mark__label`), rising 4 points as they come in. */
private struct ActivityWords: View {
  let words: String
  let elapsed: String?
  let look: Look
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var risen = false

  var body: some View {
    HStack(spacing: 6) {
      ShimmerText(words: Text(words).font(.system(size: 14, weight: .medium)), look: look)
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(height: 22)
      if let elapsed {
        Text(verbatim: "· \(elapsed)")
          .font(.system(size: 12))
          .foregroundStyle(look.inkTertiary)
          .lineLimit(1)
          .fixedSize()
      }
    }
    .offset(y: risen || reduceMotion ? 0 : 4)
    .opacity(risen ? 1 : 0)
    .onAppear { withAnimation(reduceMotion ? ActivityRow.fade : ActivityRow.into) { risen = true } }
  }
}

// MARK: A new message coming in

/**
 * A message that arrives while the chat is at its newest comes in
 * (`sand-1im2lgs`, 0.24 s, `cubic-bezier(.23,1,.32,1)`): from 12 lower and
 * 94 % size about its bottom corner on its own side, its fade done by 55 %.
 */
struct RowEntrance: ViewModifier {
  let active: Bool
  let anchor: UnitPoint
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var faded = false
  @State private var settled = false

  func body(content: Content) -> some View {
    content
      .opacity(active && !faded ? 0 : 1)
      .scaleEffect(active && !settled && !reduceMotion ? 0.94 : 1, anchor: anchor)
      .offset(y: active && !settled && !reduceMotion ? 12 : 0)
      .onAppear {
        guard active else { return }
        // With Reduce motion, a 0.12 s fade only.
        let move = Animation.timingCurve(0.23, 1, 0.32, 1, duration: reduceMotion ? 0.12 : 0.24)
        withAnimation(move) { settled = true }
        withAnimation(.timingCurve(0.23, 1, 0.32, 1, duration: reduceMotion ? 0.12 : 0.24 * 0.55)) { faded = true }
      }
  }
}

// MARK: A message's time on a sideways swipe

extension ChatControl {
  /** How far a sideways swipe moves the person's messages (`C2e`). */
  static let peekReach: CGFloat = 82
}

/**
 * The release of a sideways swipe (`HSn`): the window's `linear()` curve,
 * which overshoots by 3.6 % at 58 % of its 0.435 s and settles.
 */
struct PeekRelease: CustomAnimation {
  static let duration = 0.435
  static let points: [(at: Double, value: Double)] = [
    (0, 0), (0.04, 0.03866), (0.08, 0.133), (0.12, 0.2566), (0.15, 0.3901), (0.19, 0.5206), (0.23, 0.6396),
    (0.27, 0.7426), (0.31, 0.8278), (0.35, 0.8954), (0.38, 0.9467), (0.42, 0.9837), (0.46, 1.009), (0.50, 1.024),
    (0.54, 1.033), (0.58, 1.036), (0.62, 1.035), (0.65, 1.032), (0.69, 1.028), (0.73, 1.023), (0.77, 1.019),
    (0.81, 1.014), (0.85, 1.01), (0.88, 1.007), (0.92, 1.004), (0.96, 1.002), (1, 1.001),
  ]

  static func curve(_ t: Double) -> Double {
    guard t > 0 else { return 0 }
    guard t < 1 else { return 1 }
    for index in 1..<points.count where t <= points[index].at {
      let a = points[index - 1], b = points[index]
      return a.value + (b.value - a.value) * (t - a.at) / (b.at - a.at)
    }
    return 1
  }

  func animate<V: VectorArithmetic>(value: V, time: TimeInterval, context: inout AnimationContext<V>) -> V? {
    guard time < PeekRelease.duration else { return nil }
    return value.scaled(by: PeekRelease.curve(time / PeekRelease.duration))
  }
}

/**
 * A sideways swipe over the chat (the window's `ZSn`, on its wheel events):
 * a mostly sideways scroll of at least 1.5 points, not inside something
 * that scrolls sideways itself (a code block, a table), moves the person's
 * messages left by as much (82 at most) and brings every message's time in
 * at its right. 90 ms after the last of it, everything springs back. While
 * it lasts, the messages' hover bars stay away.
 */
struct PeekCatcher: NSViewRepresentable {
  let control: ChatControl
  /** A file, picture or diagram full screen: its swipes are its own. */
  let viewers: Viewers

  func makeNSView(context: Context) -> CatchView {
    let view = CatchView()
    view.control = control
    view.viewers = viewers
    return view
  }

  func updateNSView(_ view: CatchView, context: Context) {
    view.control = control
    view.viewers = viewers
  }

  final class CatchView: NSView {
    weak var control: ChatControl?
    weak var viewers: Viewers?
    nonisolated(unsafe) private var monitor: Any?
    private var tracking = false
    /** Where the swipe has got to (the window's `r`). */
    private var value: CGFloat = 0
    /** A release under way: from how far, since when. */
    private var releasing: (from: CGFloat, at: Date)?
    private var timer: Task<Void, Never>?

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
        let took = MainActor.assumeIsolated { self?.wheel(event) ?? false }
        return took ? nil : event
      }
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }

    private func wheel(_ event: NSEvent) -> Bool {
      let local = convert(event.locationInWindow, from: nil)
      guard let control, event.window === window, bounds.contains(local) else { return false }
      // Not under an exchange or a viewer over the chat.
      guard viewers?.shown == nil, control.exchangePeer == nil, !SearchState.showing else { return false }
      // The message field over the chat's foot is not the transcript's (16 under it).
      let fromBottom = isFlipped ? bounds.height - local.y : local.y
      guard tracking || fromBottom > control.composerHeight + 16 else { return false }
      // The browser's wheel deltas: points, positive to the right and down.
      let scale: CGFloat = event.hasPreciseScrollingDeltas ? 1 : 40
      let dx = -event.scrollingDeltaX * scale, dy = -event.scrollingDeltaY * scale
      let sideways = abs(dx) > abs(dy)
      if tracking {
        guard sideways else { return false }
      } else {
        guard sideways, abs(dx) >= 1.5, !scrollsSideways(event, dx) else { return false }
        tracking = true
        control.peeking = true
      }
      // Picked up again mid-release: from wherever the release has got to.
      if let releasing {
        let t = Date().timeIntervalSince(releasing.at) / PeekRelease.duration
        value = releasing.from * (1 - PeekRelease.curve(t))
        self.releasing = nil
      }
      value = min(max(value + dx, 0), ChatControl.peekReach)
      var still = Transaction()
      still.disablesAnimations = true
      withTransaction(still) { control.peek = value }
      timer?.cancel()
      timer = Task { [weak self] in
        try? await Task.sleep(for: .milliseconds(90))
        guard !Task.isCancelled else { return }
        self?.letGo()
      }
      return true
    }

    /** 90 ms after the last of it: back over 0.435 s, and the hover bars come back after. */
    private func letGo() {
      tracking = false
      guard let control else { return }
      guard value > 0 else {
        control.peeking = false
        return
      }
      // With Reduce motion it goes back at once (`Fo()`).
      if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
        value = 0
        control.peek = 0
        control.peeking = false
        return
      }
      releasing = (value, Date())
      value = 0
      withAnimation(Animation(PeekRelease())) { control.peek = 0 }
      timer = Task { [weak self] in
        try? await Task.sleep(for: .seconds(PeekRelease.duration))
        guard !Task.isCancelled, let self else { return }
        self.releasing = nil
        self.control?.peeking = false
      }
    }

    /** Something under the pointer that can still scroll that way (`KSn`): it takes the swipe. */
    private func scrollsSideways(_ event: NSEvent, _ dx: CGFloat) -> Bool {
      guard let content = window?.contentView, let frame = content.superview else { return false }
      var view = content.hitTest(frame.convert(event.locationInWindow, from: nil))
      while let current = view {
        if let scroll = current as? NSScrollView, let document = scroll.documentView {
          let room = document.frame.width - scroll.contentView.bounds.width
          let x = scroll.contentView.bounds.origin.x
          if room > 1 && (dx < 0 ? x > 0 : x < room - 1) { return true }
        }
        view = current.superview
      }
      return false
    }
  }
}

/** The person's own rows slide left with a sideways swipe. */
struct PeekShift: ViewModifier {
  let mine: Bool
  @Environment(ChatControl.self) private var control

  func body(content: Content) -> some View {
    content.offset(x: mine ? -control.peek : 0)
  }
}

/**
 * A row's time at its right during a sideways swipe (`sand-row-timestamp`):
 * 12 at 500, tabular, in the tertiary grey, 10 in from what is beside it,
 * fading in with the swipe and sliding in from its own width.
 */
struct PeekTime: View {
  let timestampMs: Double
  let look: Look
  @Environment(ChatControl.self) private var control

  var body: some View {
    let progress = control.peek / ChatControl.peekReach
    Text(Date(timeIntervalSince1970: timestampMs / 1000).formatted(date: .omitted, time: .shortened))
      .font(.system(size: 12, weight: .medium))
      .monospacedDigit()
      .foregroundStyle(look.inkTertiary)
      .lineLimit(1)
      .fixedSize()
      .padding(.leading, 10)
      .visualEffect { content, proxy in content.offset(x: (1 - progress) * proxy.size.width) }
      .opacity(min(max(progress, 0), 1))
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }
}
