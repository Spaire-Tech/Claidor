import AppKit
import SwiftUI
import SimeonCore

/**
 * The call's banner (`electron-main/voice/voice-call-window.ts`): a
 * borderless panel at the top right of the screen under the pointer, 12 pt
 * under the menu bar and 16 pt from the edge, above other windows and on
 * every Space, that never takes the keys from what the person is doing,
 * and that grows and shrinks with the call (the transcript). One call at a
 * time: starting another brings this one forward.
 */
@MainActor
final class MacCallBanner {
  static let shared = MacCallBanner()

  /** Transparent room around the banner for its shadow (`BANNER_MARGIN`). */
  static let margin = NSEdgeInsets(top: 10, left: 28, bottom: 46, right: 28)
  /** The ringing banner's height (one row), before it measures itself; then 40 to 480. */
  static let initialHeight = 78.0
  static let heightRange = 40.0...480.0

  private var panel: NSPanel?
  private var height = initialHeight
  private weak var followed: AppStore?

  /** The banner opens with a call and closes when it is put away, whichever of the app's windows are open. Once, at launch. */
  func follow(_ store: AppStore) {
    guard followed !== store else { return }
    followed = store
    track(store)
  }

  private func track(_ store: AppStore) {
    guard followed === store else { return }
    let on = withObservationTracking { store.call != nil } onChange: { [weak self, weak store] in
      Task { @MainActor in if let self, let store { self.track(store) } }
    }
    if on && panel == nil { show(store) } else if !on && panel != nil { close() }
  }

  /** Opens the banner for the call on, or brings it forward. */
  private func show(_ store: AppStore) {
    if let panel {
      panel.orderFrontRegardless()
      return
    }
    height = Self.initialHeight
    let panel = BannerPanel(contentRect: frame(for: height, on: Self.screenUnderPointer()), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    panel.title = "Simeon call"
    panel.isFloatingPanel = true
    panel.level = .floating
    // On every Space, as the Electron banner (not over another app's full screen: Electron could not without taking focus).
    panel.collectionBehavior = [.canJoinAllSpaces, .ignoresCycle]
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = false
    panel.hidesOnDeactivate = false
    // A click makes it key, as the Electron panel (focusable) is, so the transcript can be selected and copied; it never brings Simeon forward.
    panel.becomesKeyOnlyIfNeeded = false
    panel.isReleasedWhenClosed = false
    panel.animationBehavior = .utilityWindow
    let host = BannerHostingView(rootView: AnyView(MacCallBannerView(resize: { [weak self] in self?.resize(to: $0) }).environment(store)))
    // The panel's size is the banner's to set (`resize`), not the hosting view's own constraints.
    host.sizingOptions = []
    panel.contentView = host
    self.panel = panel
    panel.orderFrontRegardless()
  }

  func focus() { panel?.orderFrontRegardless() }

  /** Call, wherever it is asked for: while a call is on, its banner comes forward instead (the service's `focused`). */
  static func call(_ agent: Agent, store: AppStore) {
    if store.call != nil { shared.focus() } else { store.startCall(agent) }
  }

  func close() {
    panel?.orderOut(nil)
    panel?.contentView = nil
    panel = nil
  }

  /** The banner measured itself: the window follows, its top right corner where it is. */
  private func resize(to bannerHeight: Double) {
    let next = min(Self.heightRange.upperBound, max(Self.heightRange.lowerBound, bannerHeight.rounded(.up)))
    guard let panel, next != height else { return }
    height = next
    var frame = panel.frame
    let top = frame.maxY
    frame.size.height = next + Self.margin.top + Self.margin.bottom
    frame.origin.y = top - frame.size.height
    // Animated without holding the main thread (`setFrame(_:display:animate:)` waits for the animation to end).
    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.18
      panel.animator().setFrame(frame, display: true)
    }
  }

  private func frame(for bannerHeight: Double, on screen: NSScreen?) -> NSRect {
    let area = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
    let width = CallBanner.width + Self.margin.left + Self.margin.right
    let windowHeight = bannerHeight + Self.margin.top + Self.margin.bottom
    let x = area.maxX - CallBanner.insetRight - CallBanner.width - Self.margin.left
    let top = area.maxY - CallBanner.insetTop + Self.margin.top
    return NSRect(x: x.rounded(), y: (top - windowHeight).rounded(), width: width, height: windowHeight)
  }

  private static func screenUnderPointer() -> NSScreen? {
    let point = NSEvent.mouseLocation
    return NSScreen.screens.first { NSMouseInRect(point, $0.frame, false) } ?? NSScreen.main
  }

  /** A click on the banner works without bringing Simeon forward (`acceptFirstMouse`). */
  private final class BannerHostingView: NSHostingView<AnyView> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  }

  /** A borderless panel can take the keys only when it says so. */
  private final class BannerPanel: NSPanel {
    override var canBecomeKey: Bool { true }
  }
}

/**
 * The banner as the approved mock-up draws it (`voice-call/index.html`,
 * `banner.css`): the agent, its name and the status (a red hang-up while it
 * rings), the waveform while the call is live, what both say when
 * Transcript is on, and Mute, Transcript and End; a failure with Close.
 * Solid white, or #2a2a2d in dark, as the founder asked ("remove the
 * transparant").
 */
struct MacCallBannerView: View {
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
    .padding(EdgeInsets(top: MacCallBanner.margin.top, leading: MacCallBanner.margin.left, bottom: MacCallBanner.margin.bottom, trailing: MacCallBanner.margin.right))
    .fixedSize()
    // Pinned to the top while the panel grows or shrinks under it.
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    // A Close or a new call's banner: the old call's 20 s never put the next one away.
    .onDisappear { dismissing?.cancel(); dismissing = nil }
  }

  private var fill: Color { scheme == .dark ? Color(red: 0.165, green: 0.165, blue: 0.176) : .white }
  private var ink: Color { scheme == .dark ? Color(red: 0.96, green: 0.96, blue: 0.97) : Color(red: 0.114, green: 0.114, blue: 0.122) }
  private var sub: Color { scheme == .dark ? Color(red: 0.92, green: 0.92, blue: 0.96).opacity(0.6) : Color(red: 0.235, green: 0.235, blue: 0.263).opacity(0.62) }
  private var separator: Color { scheme == .dark ? Color(red: 0.92, green: 0.92, blue: 0.96).opacity(0.12) : Color(red: 0.235, green: 0.235, blue: 0.263).opacity(0.14) }
  private var buttonTint: Color { Color(red: 0.47, green: 0.47, blue: 0.5).opacity(scheme == .dark ? 0.24 : 0.12) }
  private static let red = Color(red: 1, green: 0.231, blue: 0.188)
  private static let orange = Color(red: 1, green: 0.624, blue: 0.039)

  private func card(_ call: CallState) -> some View {
    let look = CallBanner.look(call)
    return VStack(spacing: 0) {
      top(call, look: look)
      if CallBanner.hasWave(call) {
        BannerWave(speaking: look == .speaking, ink: ink)
          .frame(height: 12 + 14)
          .padding(.horizontal, 20)
      }
      if showsTranscript && look != .ringing {
        transcript(call)
      }
      bar(call, look: look)
    }
    .frame(width: CallBanner.width)
    .background(fill)
    .overlay {
      LinearGradient(colors: [.white.opacity(scheme == .dark ? 0.08 : 0.28), .clear], startPoint: UnitPoint(x: 0.33, y: 0), endPoint: UnitPoint(x: 0.55, y: 0.38))
        .allowsHitTesting(false)
    }
    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(.black.opacity(scheme == .dark ? 0.45 : 0.08), lineWidth: 0.5))
    .shadow(color: .black.opacity(scheme == .dark ? 0.5 : 0.28), radius: 20, y: 18)
    .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.12), radius: 5, y: 4)
    .onGeometryChange(for: Double.self) { $0.size.height } action: { resize($0) }
    .onHover { inside in
      hovering = inside
      scheduleDismiss(call)
    }
    .onChange(of: look, initial: true) { _, _ in scheduleDismiss(call) }
    .animation(.easeOut(duration: 0.18), value: look)
    .animation(.easeOut(duration: 0.18), value: showsTranscript)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Call")
  }

  private func top(_ call: CallState, look: CallBanner.Look) -> some View {
    HStack(spacing: 14) {
      CallAvatar(call: call, size: 46)
      VStack(alignment: .leading, spacing: 2) {
        Text(call.agentName).font(.system(size: 15, weight: .semibold)).foregroundStyle(ink).lineLimit(1)
        TimelineView(.periodic(from: .now, by: 1)) { context in
          Text(CallBanner.status(call, now: context.date))
            .font(.system(size: 13)).monospacedDigit().foregroundStyle(sub).lineLimit(1)
        }
        .accessibilityAddTraits(.updatesFrequently)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if look == .ringing {
        Button { store.hangUp() } label: {
          Image(systemName: "phone.down.fill").font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
            .frame(width: 34, height: 34)
            .background(Self.red, in: Circle())
            .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("End call")
      }
    }
    .padding(EdgeInsets(top: 18, leading: 18, bottom: 14, trailing: 18))
  }

  /** What both say, in the chat's own bubbles: the person's blue on the right, the agent's grey on the left. */
  private func transcript(_ call: CallState) -> some View {
    VStack(spacing: 0) {
      separator.frame(height: 0.5)
      ScrollView {
        VStack(spacing: 8) {
          if call.lines.isEmpty {
            Text(CallBanner.emptyTranscript).font(.system(size: 13)).foregroundStyle(sub).frame(maxWidth: .infinity).padding(.vertical, 4)
          }
          ForEach(Array(call.lines.enumerated()), id: \.offset) { _, line in
            Text(line.text)
              .font(.system(size: 13.5))
              .foregroundStyle(line.fromPerson ? Color.white : ink)
              .textSelection(.enabled)
              .padding(.horizontal, 13).padding(.vertical, 8)
              .background {
                if line.fromPerson {
                  LinearGradient(colors: scheme == .dark ? [Color(red: 0.122, green: 0.314, blue: 0.529), Color(red: 0.157, green: 0.361, blue: 0.576)]
                                                       : [Color(red: 0.145, green: 0.353, blue: 0.576), Color(red: 0.18, green: 0.404, blue: 0.624)],
                                 startPoint: .top, endPoint: .bottom)
                } else {
                  buttonTint
                }
              }
              .clipShape(RoundedRectangle(cornerRadius: 17, style: .continuous))
              .frame(maxWidth: (CallBanner.width - 36) * 0.84, alignment: line.fromPerson ? .trailing : .leading)
              .frame(maxWidth: .infinity, alignment: line.fromPerson ? .trailing : .leading)
          }
        }
        .padding(EdgeInsets(top: 14, leading: 18, bottom: 16, trailing: 18))
      }
      .defaultScrollAnchor(.bottom)
      .frame(maxHeight: 260)
      .fixedSize(horizontal: false, vertical: true)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Transcript")
  }

  /** None while it rings, Mute | Transcript | End while it is on, none once ended, Close when it failed. */
  @ViewBuilder
  private func bar(_ call: CallState, look: CallBanner.Look) -> some View {
    switch look {
    case .ringing, .ended:
      EmptyView()
    case .failed:
      VStack(spacing: 0) {
        separator.frame(height: 0.5)
        BannerButton(title: "Close", symbol: nil, colour: ink, tint: buttonTint) { store.dismissCall() }
      }
    default:
      VStack(spacing: 0) {
        separator.frame(height: 0.5)
        HStack(spacing: 0) {
          BannerButton(title: call.isMuted ? "Unmute" : "Mute", symbol: call.isMuted ? "mic.slash.fill" : "mic.fill", colour: call.isMuted ? Self.orange : ink, tint: buttonTint) {
            store.mute(!call.isMuted)
          }
          .accessibilityAddTraits(call.isMuted ? .isSelected : [])
          separator.frame(width: 0.5)
          BannerButton(title: "Transcript", symbol: "text.alignleft", colour: ink, tint: buttonTint, pressed: showsTranscript) { showsTranscript.toggle() }
            .accessibilityAddTraits(showsTranscript ? .isSelected : [])
          separator.frame(width: 0.5)
          BannerButton(title: "End", symbol: "phone.down.fill", colour: Self.red, tint: buttonTint) { store.hangUp() }
        }
        .frame(height: 48)
      }
    }
  }

  /** A finished call leaves by itself (the call does it, 1.2 s); a failure stays 20 s, and while the pointer is on it. */
  private func scheduleDismiss(_ call: CallState) {
    dismissing?.cancel()
    dismissing = nil
    guard CallBanner.look(call) == .failed, !hovering else { return }
    let endedAt = call.endedAt
    dismissing = Task {
      try? await Task.sleep(nanoseconds: UInt64(CallBanner.failedStays * 1_000_000_000))
      // Only the failure it was set for: not a call started since.
      guard !Task.isCancelled, let now = store.call, now.failed, now.endedAt == endedAt else { return }
      store.dismissCall()
    }
  }
}

/** One of the banner's buttons: its glyph and word, a tint under the pointer or while it is on. */
private struct BannerButton: View {
  let title: String
  let symbol: String?
  let colour: Color
  let tint: Color
  var pressed = false
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 7) {
        if let symbol { Image(systemName: symbol).font(.system(size: 13)) }
        Text(title).font(.system(size: 13.5, weight: .medium))
      }
      .foregroundStyle(colour)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(hovering || pressed ? tint : .clear)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .frame(height: 48)
    .onHover { hovering = $0 }
  }
}

/** The waveform: 46 bars, highest in the middle, the voice's loudness bar by bar (`setLevels`). */
private struct BannerWave: View {
  let speaking: Bool
  let ink: Color
  @Environment(AppStore.self) private var store

  var body: some View {
    let heights = CallBanner.barHeights(store.callLevels, speaking: speaking)
    HStack(alignment: .center, spacing: 2) {
      ForEach(Array(heights.enumerated()), id: \.offset) { _, height in
        RoundedRectangle(cornerRadius: 1).fill(ink.opacity(0.55)).frame(maxWidth: .infinity).frame(height: height)
      }
    }
    .frame(maxHeight: .infinity, alignment: .center)
    .padding(.bottom, 14)
    .animation(.linear(duration: 0.08), value: heights)
    .accessibilityHidden(true)
  }
}
