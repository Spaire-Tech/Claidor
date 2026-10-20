import AppKit
import Observation
import SwiftUI
import SimeonCore

/**
 * The call's banner (step 11, M10–M19; `electron-main/voice/voice-call-window.ts`,
 * `voice-call/banner.css`): a panel of its own, 360 wide plus room for its
 * shadow (28 each side, 10 above, 46 below), 12 under the menu bar and 16
 * from the right edge of the screen the pointer is on when the call starts.
 * It floats over other windows on every Space (not over another app's full
 * screen, as the Electron one), never takes Simeon forward, and grows and
 * shrinks with the call, its top where it is. One call at a time: asked to
 * call while a call is up (live, ended or failed), it comes forward instead.
 */
@MainActor
final class CallBannerWindow {
  static let shared = CallBannerWindow()

  /** Transparent room around the card for its shadow (`BANNER_MARGIN`). */
  static let margin = NSEdgeInsets(top: 10, left: 28, bottom: 46, right: 28)
  /** The window's height follows the card's, within these (`MIN/MAX_BANNER_HEIGHT`). */
  static let heightRange = 40.0...480.0
  /** The ringing card's height, before it measures itself. */
  static let firstHeight = 78.0

  private var panel: BannerPanel?
  private var height = firstHeight
  private weak var followed: AppStore?
  /** Whether the pointer is on the banner, seen even while another app is in front (a tracking area that is always on). */
  let pointer = BannerPointer()

  /** The banner opens with a call and closes when the call is put away, whatever windows are open. Once, at launch. */
  func follow(_ store: AppStore) {
    guard followed !== store else { return }
    followed = store
    track(store)
    // Quitting with a call on ends it (its voice let go, its record on its way), rather than leaving its line "now".
    NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { [weak store] _ in
      MainActor.assumeIsolated {
        guard let store, let call = store.call, call.phase != .ended else { return }
        store.hangUp()
      }
    }
  }

  private func track(_ store: AppStore) {
    guard followed === store else { return }
    let on = withObservationTracking { store.call != nil } onChange: { [weak self, weak store] in
      Task { @MainActor in if let self, let store { self.track(store) } }
    }
    if on && panel == nil { show(store) } else if !on && panel != nil { close() }
  }

  private func show(_ store: AppStore) {
    height = Self.firstHeight
    let panel = BannerPanel(contentRect: frame(for: height, on: Self.screenUnderPointer()), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.title = String(localized: "Simeon call")
    panel.isFloatingPanel = true
    panel.level = .floating
    panel.collectionBehavior = [.canJoinAllSpaces, .ignoresCycle]
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = false
    panel.hidesOnDeactivate = false
    panel.isMovable = false
    panel.isExcludedFromWindowsMenu = true
    panel.isReleasedWhenClosed = false
    panel.animationBehavior = .none
    // A click makes it key (so the transcript can be chosen and copied) without bringing Simeon forward.
    panel.becomesKeyOnlyIfNeeded = false
    // File › Close Window on the banner: a call that is on ends (and is recorded), one that is over goes.
    panel.closing = { [weak store] in
      guard let store, let call = store.call else { return }
      if call.phase == .ended { store.dismissCall() } else { store.hangUp() }
    }
    pointer.inside = false
    let host = BannerHostingView(rootView: AnyView(CallBannerCard(pointer: pointer, resize: { [weak self] in self?.resize(to: $0) }).environment(store)))
    host.pointer = pointer
    // The window's size is the card's to set (`resize`), not the hosting view's.
    host.sizingOptions = []
    panel.contentView = host
    self.panel = panel
    panel.orderFrontRegardless()
  }

  /** The banner brought forward, without taking the keys (`showInactive`, `moveTop`). */
  func focus() { panel?.orderFrontRegardless() }

  private func close() {
    panel?.orderOut(nil)
    panel?.contentView = nil
    panel = nil
  }

  /** The card measured itself: the window follows, its top where it is, the change animated (`setBounds(…, animate)`). */
  private func resize(to cardHeight: Double) {
    let next = min(Self.heightRange.upperBound, max(Self.heightRange.lowerBound, cardHeight.rounded(.up)))
    guard let panel, next != height else { return }
    height = next
    var frame = panel.frame
    let top = frame.maxY
    frame.size.height = next + Self.margin.top + Self.margin.bottom
    frame.origin.y = top - frame.size.height
    // Without holding the main thread (`setFrame(_:display:animate:)` waits for the animation).
    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.18
      panel.animator().setFrame(frame, display: true)
    }
  }

  /** The card 12 under the menu bar and 16 from the right of the screen's working area. */
  private func frame(for cardHeight: Double, on screen: NSScreen?) -> NSRect {
    let area = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
    let width = CallBanner.width + Self.margin.left + Self.margin.right
    let windowHeight = cardHeight + Self.margin.top + Self.margin.bottom
    let x = area.maxX - CallBanner.insetRight - CallBanner.width - Self.margin.left
    let top = area.maxY - CallBanner.insetTop + Self.margin.top
    return NSRect(x: x.rounded(), y: (top - windowHeight).rounded(), width: width, height: windowHeight)
  }

  private static func screenUnderPointer() -> NSScreen? {
    let point = NSEvent.mouseLocation
    return NSScreen.screens.first { NSMouseInRect(point, $0.frame, false) } ?? NSScreen.main
  }

  /** The first click acts, without bringing Simeon forward (`acceptFirstMouse`); the pointer is followed whatever app is in front. */
  private final class BannerHostingView: NSHostingView<AnyView> {
    weak var pointer: BannerPointer?
    private var area: NSTrackingArea?

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
      super.updateTrackingAreas()
      if let area { removeTrackingArea(area) }
      // The card, not the clear room around it for its shadow.
      let card = NSRect(x: CallBannerWindow.margin.left, y: isFlipped ? CallBannerWindow.margin.top : CallBannerWindow.margin.bottom,
                        width: max(0, bounds.width - CallBannerWindow.margin.left - CallBannerWindow.margin.right),
                        height: max(0, bounds.height - CallBannerWindow.margin.top - CallBannerWindow.margin.bottom))
      let next = NSTrackingArea(rect: card, options: [.mouseEnteredAndExited, .activeAlways], owner: self, userInfo: nil)
      addTrackingArea(next)
      area = next
    }

    override func mouseEntered(with event: NSEvent) {
      super.mouseEntered(with: event)
      pointer?.inside = true
    }

    override func mouseExited(with event: NSEvent) {
      super.mouseExited(with: event)
      pointer?.inside = false
    }
  }

  /** A borderless panel takes the keys only when it says so; Close Window asks the call. */
  private final class BannerPanel: NSPanel {
    var closing: (() -> Void)?
    override var canBecomeKey: Bool { true }
    override func performClose(_ sender: Any?) { closing?() }
  }
}

/** Whether the pointer is on the banner's card. */
@MainActor
@Observable
final class BannerPointer {
  var inside = false
}

/** The banner's colours (`banner.css`), light and dark. */
private struct BannerLook {
  let dark: Bool

  var fill: Color { dark ? Color(hex: 0x2A2A2D) : .white }
  var ink: Color { dark ? Color(hex: 0xF5F5F7) : Color(hex: 0x1D1D1F) }
  var sub: Color { dark ? Color(red: 235 / 255, green: 235 / 255, blue: 245 / 255).opacity(0.60) : Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.62) }
  /** The hairlines, 1 pt as drawn (#E3E3E4 on white, #414145 on the dark). */
  var separator: Color { dark ? Color(hex: 0x414145) : Color(hex: 0xE3E3E4) }
  /** A button under the pointer, Transcript while it is on, the agent's bubbles. */
  var tint: Color { Color(red: 120 / 255, green: 120 / 255, blue: 128 / 255).opacity(dark ? 0.24 : 0.12) }
  static let red = Color(hex: 0xFF3B30)
  static let orange = Color(hex: 0xFF9F0A)
  /** The person's bubble: 165°, the chat's own blue. */
  var personBubble: LinearGradient {
    LinearGradient(colors: dark ? [Color(hex: 0x1F5087), Color(hex: 0x285C93)] : [Color(hex: 0x255A93), Color(hex: 0x2E679F)],
                   startPoint: UnitPoint(x: 0.43, y: 0), endPoint: UnitPoint(x: 0.57, y: 1))
  }
}

/**
 * The card (`.banner`): the agent and the status line (a red hang-up while
 * it rings), the waveform while the call is on and the agent not working
 * on something, what both said when Transcript is on, then Mute (Unmute),
 * Transcript and End; Close alone when the call failed; nothing once it
 * ended. 360 wide, round 24, solid white (#2A2A2D on dark), as the founder
 * asked ("remove the transparant"); without the window's white sheen at the
 * top left, which the founder asked away too.
 */
struct CallBannerCard: View {
  let pointer: BannerPointer
  let resize: (Double) -> Void
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme
  @State private var showsTranscript = false
  @State private var hovering = false
  @State private var dismissing: Task<Void, Never>?

  var body: some View {
    Group {
      if let call = store.call {
        card(call)
      } else {
        Color.clear.frame(width: CallBanner.width, height: 1)
      }
    }
    .padding(EdgeInsets(top: CallBannerWindow.margin.top, leading: CallBannerWindow.margin.left, bottom: CallBannerWindow.margin.bottom, trailing: CallBannerWindow.margin.right))
    .fixedSize()
    // Pinned to the top while the window catches up with it.
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .onDisappear { dismissing?.cancel(); dismissing = nil }
  }

  private func card(_ call: CallState) -> some View {
    let look = BannerLook(dark: scheme == .dark)
    let state = CallBanner.look(call)
    return VStack(spacing: 0) {
      top(call, state: state, look: look)
      if CallBanner.hasWave(call) {
        // A 12-point band (26 with the 14 under it), the bars centred on it and free to rise 3 past it either way.
        BannerWave(speaking: state == .speaking, ink: look.ink)
          .frame(height: 24)
          .padding(.horizontal, 20)
          .padding(.top, -6)
          .padding(.bottom, 8)
      }
      if showsTranscript && state != .ringing {
        BannerTranscript(lines: call.lines, look: look)
      }
      bar(call, state: state, look: look)
    }
    .frame(width: CallBanner.width)
    // Solid: the window's white sheen at the top left is gone (the founder, 11 October 2026: "got a light /white accent … please remove").
    .background(look.fill)
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .circular))
    .overlay(RoundedRectangle(cornerRadius: 24, style: .circular).strokeBorder(.white.opacity(look.dark ? 0.14 : 0.55), lineWidth: 0.5))
    .overlay(RoundedRectangle(cornerRadius: 24, style: .circular).inset(by: -0.5).stroke(.black.opacity(look.dark ? 0.45 : 0.08), lineWidth: 0.5))
    .shadow(color: .black.opacity(look.dark ? 0.5 : 0.28), radius: 13, y: 18)
    .shadow(color: .black.opacity(look.dark ? 0 : 0.12), radius: 3, y: 4)
    .onGeometryChange(for: Double.self) { $0.size.height } action: { resize($0) }
    .onHover { inside in
      hovering = inside
      timeFailure(call)
    }
    .onChange(of: pointer.inside) { _, _ in timeFailure(call) }
    .onChange(of: state, initial: true) { _, _ in timeFailure(call) }
    // Closed at each call's start.
    .onChange(of: call.agentId) { _, _ in showsTranscript = false }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Call")
  }

  /** The agent (46), its name (15, 600) over the status (13, the clock's figures even), 14 apart; the red hang-up while it rings. */
  private func top(_ call: CallState, state: CallBanner.Look, look: BannerLook) -> some View {
    HStack(spacing: 14) {
      BannerAvatar(call: call)
      VStack(alignment: .leading, spacing: 2) {
        Text(call.agentName)
          .font(.system(size: 15, weight: .semibold))
          .tracking(-0.075)
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
        TimelineView(.periodic(from: .now, by: 1)) { context in
          Text(CallBanner.status(call, now: context.date))
            .font(.system(size: 13))
            .monospacedDigit()
            .foregroundStyle(look.sub)
            .lineLimit(1)
            .truncationMode(.tail)
        }
        .accessibilityAddTraits(.updatesFrequently)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if state == .ringing {
        Button { store.hangUp() } label: {
          Image(systemName: "phone.down.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: 34, height: 34)
            .background(BannerLook.red, in: Circle())
            .contentShape(Circle())
        }
        .buttonStyle(.hand)
        .accessibilityLabel("End call")
      }
    }
    .padding(EdgeInsets(top: 18, leading: 18, bottom: 14, trailing: 18))
  }

  /** Nothing while it rings or once it ended; Close when it failed; else Mute (Unmute), Transcript, End, 48 high, 1 apart. */
  @ViewBuilder
  private func bar(_ call: CallState, state: CallBanner.Look, look: BannerLook) -> some View {
    switch state {
    case .ringing, .ended:
      EmptyView()
    case .failed:
      VStack(spacing: 0) {
        look.separator.frame(height: 1)
        BannerButton(title: String(localized: "Close"), glyph: nil, colour: look.ink, tint: look.tint) { store.dismissCall() }
      }
    case .speaking, .listening, .working:
      VStack(spacing: 0) {
        look.separator.frame(height: 1)
        HStack(spacing: 0) {
          BannerButton(title: call.isMuted ? String(localized: "Unmute") : String(localized: "Mute"), glyph: .symbol(call.isMuted ? "mic.slash.fill" : "mic.fill"), colour: call.isMuted ? BannerLook.orange : look.ink, tint: look.tint) {
            store.mute(!call.isMuted)
          }
          .accessibilityAddTraits(call.isMuted ? .isSelected : [])
          look.separator.frame(width: 1)
          BannerButton(title: String(localized: "Transcript"), glyph: .lines, colour: look.ink, tint: look.tint, on: showsTranscript) { showsTranscript.toggle() }
            .accessibilityAddTraits(showsTranscript ? .isSelected : [])
          look.separator.frame(width: 1)
          BannerButton(title: String(localized: "End"), glyph: .symbol("phone.down.fill"), colour: BannerLook.red, tint: look.tint) { store.hangUp() }
        }
        .frame(height: 48)
      }
    }
  }

  /** A failed call stays 20 s, and while the pointer is on it; leaving starts the 20 s again (`FAILED_DISMISS_MS`). An ended one leaves by itself after 1.2 s (the call). */
  private func timeFailure(_ call: CallState) {
    dismissing?.cancel()
    dismissing = nil
    guard CallBanner.look(call) == .failed, !hovering, !pointer.inside else { return }
    let endedAt = call.endedAt
    dismissing = Task {
      try? await Task.sleep(nanoseconds: UInt64(CallBanner.failedStays * 1_000_000_000))
      // Only the failure it was set for, never a call started since.
      guard !Task.isCancelled, let now = store.call, now.failed, now.endedAt == endedAt else { return }
      store.dismissCall()
    }
  }
}

/**
 * What both said (`.live`): the person's on the right in the chat's blue,
 * the agent's on the left in the grey; 260 at most, then it scrolls. It
 * opens at the newest, and a new line brings it there only when it was
 * within 24 of the foot (someone reading further up stays where they are).
 */
private struct BannerTranscript: View {
  let lines: [CallLine]
  let look: BannerLook
  @State private var position = ScrollPosition(edge: .bottom)
  @State private var nearFoot = true

  var body: some View {
    VStack(spacing: 0) {
      look.separator.frame(height: 1)
      ScrollView {
        VStack(spacing: 8) {
          if lines.isEmpty {
            Text(CallBanner.emptyTranscript)
              .font(.system(size: 13))
              .foregroundStyle(look.sub)
              .frame(maxWidth: .infinity)
              .padding(.vertical, 4)
          }
          ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
            Text(line.text)
              .font(.system(size: 13.5))
              .lineSpacing(18.9 - 16.1)
              .foregroundStyle(line.fromPerson ? Color.white : look.ink)
              .textSelection(.enabled)
              .padding(.vertical, 8)
              .padding(.horizontal, 13)
              .background {
                if line.fromPerson { look.personBubble } else { look.tint }
              }
              .clipShape(RoundedRectangle(cornerRadius: 17, style: .circular))
              .frame(maxWidth: (CallBanner.width - 36) * 0.84, alignment: line.fromPerson ? .trailing : .leading)
              .frame(maxWidth: .infinity, alignment: line.fromPerson ? .trailing : .leading)
          }
        }
        .padding(EdgeInsets(top: 14, leading: 18, bottom: 16, trailing: 18))
      }
      .scrollPosition($position)
      .defaultScrollAnchor(.bottom, for: .initialOffset)
      .onScrollGeometryChange(for: Bool.self) { geometry in
        geometry.contentOffset.y + geometry.containerSize.height >= geometry.contentSize.height - 24
      } action: { _, near in
        nearFoot = near
      }
      .onChange(of: lines.count) { _, _ in
        guard nearFoot else { return }
        position.scrollTo(edge: .bottom)
      }
      .frame(maxHeight: 259)
      .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Transcript")
  }
}

/** The agent at 46: its picture, still. */
private struct BannerAvatar: View {
  let call: CallState
  @Environment(AppStore.self) private var store

  var body: some View {
    // The agent's picture, still (the founder, 12 October 2026: faces, no butterflies, no motion).
    Group {
      AgentIdMark(id: call.agentId, agents: store.agents, size: 46)
    }
    .frame(width: 46, height: 46)
    .accessibilityHidden(true)
  }
}

/**
 * The waveform (`setLevels`): 46 bars 5 wide and 2 apart, round 1, the ink
 * at 55%, highest in the middle and falling off to the edges, 16 above
 * their 2-point floor while the agent speaks and 12 while it listens; each
 * bar falls back by a fifth every frame (×0.82) unless the voice lifts it.
 */
private struct BannerWave: View {
  let speaking: Bool
  let ink: Color
  @Environment(AppStore.self) private var store
  @State private var memory = WaveMemory()

  var body: some View {
    let levels = store.callLevels
    TimelineView(.animation(minimumInterval: 1.0 / 60)) { context in
      Canvas { graphics, size in
        let heights = memory.step(levels, speaking: speaking, at: context.date)
        let count = heights.count
        let gap = 2.0
        let barWidth = (size.width - gap * Double(count - 1)) / Double(count)
        for (index, height) in heights.enumerated() {
          let rect = CGRect(x: Double(index) * (barWidth + gap), y: (size.height - height) / 2, width: barWidth, height: height)
          graphics.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(ink.opacity(0.55)))
        }
      }
    }
    .accessibilityHidden(true)
  }

  private final class WaveMemory {
    private var levels = [Double](repeating: 0, count: CallBanner.bars)
    private var last: Date?

    func step(_ incoming: [Double], speaking: Bool, at date: Date) -> [Double] {
      let frames = last.map { max(0, date.timeIntervalSince($0) * 60) } ?? 1
      last = date
      let fall = pow(0.82, frames)
      let bars = CallBanner.bars
      let amplitude = speaking ? 16.0 : 12.0
      return (0..<bars).map { index in
        // Symmetric: the middle bars from the first levels, as the window reads the lowest frequencies there.
        let slot = min(max(0, incoming.count - 1), Int(abs(Double(index) - Double(bars - 1) / 2) / (Double(bars) / 2 + 0.5) * Double(incoming.count)))
        let target = incoming.isEmpty ? 0 : max(0, min(1, incoming[slot]))
        levels[index] = max(target, levels[index] * fall)
        return 2 + levels[index] * amplitude * sin(Double.pi * (Double(index) + 0.5) / Double(bars))
      }
    }
  }
}

/** One of the banner's buttons: its glyph (15) and word (13.5, 500), 7 apart; the grey under the pointer, or while it is on. Pressing changes nothing. */
private struct BannerButton: View {
  enum Glyph { case symbol(String), lines }

  let title: String
  let glyph: Glyph?
  let colour: Color
  let tint: Color
  var on = false
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 7) {
        switch glyph {
        case .symbol(let name):
          Image(systemName: name)
            .font(.system(size: 13))
            .frame(width: 15, height: 15)
        case .lines:
          TranscriptGlyph()
            .stroke(style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
            .frame(width: 15, height: 15)
        case nil:
          EmptyView()
        }
        Text(title)
          .font(.system(size: 13.5, weight: .medium))
      }
      .foregroundStyle(colour)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(hovering || on ? tint : .clear)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .frame(height: 48)
    .onHover { hovering = $0 }
  }
}

/** Transcript's glyph (`#i-talk`): three lines, the last one shorter. */
private struct TranscriptGlyph: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    let unit = rect.width / 15
    for (row, length) in [(4.5, 12.0), (7.5, 12.0), (10.5, 7.0)] {
      path.move(to: CGPoint(x: rect.minX + 1.5 * unit, y: rect.minY + row * unit))
      path.addLine(to: CGPoint(x: rect.minX + (1.5 + length) * unit, y: rect.minY + row * unit))
    }
    return path
  }
}

/** Calling, wherever it is asked (the chat's phone, Agent › Call): while a call is up, its banner comes forward instead, whichever agent was asked (`voice-call-service.ts`). */
@MainActor
enum CallActions {
  static func call(_ agent: Agent, store: AppStore) {
    if store.call != nil {
      CallBannerWindow.shared.focus()
      return
    }
    store.startCall(agent)
  }
}
