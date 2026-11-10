import AppKit
import SwiftUI
import WebKit
import SimeonCore

/** The full computer view over the window (step 13, `bbn`), while one is open. */
struct ComputerLayer: View {
  @Environment(WindowState.self) private var window

  var body: some View {
    if let open = window.computer {
      ComputerFullView(open: open)
        .id(open.agentId)
    }
  }
}

/**
 * An agent's computer over the whole window (`bbn`: sidebar, chat and pane
 * under it, the window showing through at 5%). At the top a 44-point bar
 * (the window's traffic lights at its left, a strip that moves the window,
 * Exit fullscreen at its right); under it, 8 in: the hand-off's banner, the
 * screen as the largest 16:10 that fits, the Watching / Take control pill,
 * the helper's name when a helper's screen is shown, and the other helpers'
 * screens. Opening and closing are instant. Opening it started the
 * computer; closing it lets go of the screen (decision 4); the message field
 * takes the keys again.
 *
 * It opens watching (the founder, 10 November 2026: "you can use the
 * computer while its on use by the agent without much clicking anywhere to
 * allow you. well thats not good", with a reference picture of a watching/take-over picker): the screen takes no
 * click or key until Take control, a click on it only nudges the pill. In
 * control the keys are the computer's (decision 1) and the clipboard goes
 * both ways; taking control while the agent works pauses it
 * (`takeComputerControl`, as on the iPhone), and Stop, or closing the view,
 * hands the computer back, which resumes it. It opens in control while the
 * agent waits on the person (a hand-off it asked for), and that hand-off is
 * still answered from its banner, which closing the view does not.
 */
private struct ComputerFullView: View {
  let open: WindowState.ComputerOpen
  @Environment(WindowState.self) private var window
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme
  @State private var phase = "starting"
  @State private var events = ScreenEvents()
  @State private var bridge = ClipboardBridge()
  /** The clipboard's `changeCount` last read or written here. */
  @State private var pasteboardSeen = -1
  /** The clipboard's `changeCount` whose words the computer has (sent, or copied from it). */
  @State private var pasteboardSent = -1
  @State private var fullScreen = false
  /** The person has the computer (Take control); else they watch. */
  @State private var control = false
  /** Taking control paused the working agent: Stop, or closing the view, hands the computer back and resumes it. */
  @State private var paused = false
  /** A click on the screen while watching: the pill's Take control answers it. */
  @State private var nudge = 0

  var body: some View {
    let look = Look(scheme)
    let agentId = open.agentId
    let name = store.agent(agentId).flatMap { $0.name.isEmpty ? nil : $0.name } ?? String(localized: "This agent")
    let status = store.computer.status(agentId)
    let helpers = store.computerHelpers(agentId)
    let focusedHelper = ComputerHelper.focused(helpers, asked: open.helper)
    let helper = helpers.first { $0.subagentId == focusedHelper }
    let url = status?.screenURL
    let waiting = status?.handoff != nil
    // A helper's screen is a new connection (`{stageKey}:{url}`).
    let stageKey = focusedHelper ?? "setup"
    VStack(spacing: 0) {
      ComputerTopBar(fullScreen: fullScreen, look: look) { window.closeComputer() }
      VStack(spacing: 0) {
        // The hand-off the agent asked for; the one taking control started is the pill's.
        if let handoff = status?.handoff, !paused {
          HandoffBanner(agentId: agentId, name: name, instruction: handoff.instruction)
            .padding(.bottom, 8)
        }
        Group {
          if let url {
            ComputerScreenView(vncUrl: url, interactive: true, watching: !control, phase: $phase, events: events)
              .id("\(stageKey):\(url)")
              .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
              // Watching, a click on the screen reaches nothing on it: the pill's Take control answers it.
              .overlay {
                if !control {
                  Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { nudge += 1 }
                    .accessibilityHidden(true)
                }
              }
              // The editor's ground until the picture paints (a white box on light), 6 round, a faint edge.
              .background(look.ground)
              .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
              .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color(hex: 0xfcfcfc).opacity(0.102), lineWidth: 0.5))
          } else {
            let copy = ComputerPlaceholder.full(name: name, read: store.computer.readState(agentId), phase: store.computer.phase(agentId),
                                                pullPercent: status?.pullPercent, hasHelpers: !helpers.isEmpty)
            ComputerPlaceholderView(copy: copy, tone: .cover, look: look) { store.retryComputer(agentId) }
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        if url != nil {
          ControlPill(control: control, enabled: phase == "connected", nudge: nudge, take: { takeControl(agentId) }, stop: { stopControl(agentId) })
            .padding(.top, 12)
          if control && paused {
            Text("\(name) is paused while you're in control.")
              .font(.system(size: 12))
              .cssLineHeight(16, size: 12)
              .foregroundStyle(Color(hex: 0xfcfcfc).opacity(0.6))
              .lineLimit(1)
              .padding(.top, 6)
              .transition(.opacity)
          }
        }
        if let helper {
          Text(helper.title)
            .font(.system(size: 12))
            .cssLineHeight(16, size: 12)
            .foregroundStyle(Color(hex: 0xfcfcfc).opacity(0.6))
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.top, 6)
        }
        if helpers.count > 1 {
          HelperStrip(helpers: helpers.filter { $0.subagentId != focusedHelper }, vncUrl: url, look: look) { pick in
            window.computer?.helper = pick
          }
          .padding(.top, 12)
        }
      }
      .padding(8)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(Color(hex: 0x141414).opacity(0.95))
    // It takes every click: nothing under it can be reached.
    .contentShape(Rectangle())
    .ignoresSafeArea()
    .accessibilityElement(children: .contain)
    .accessibilityLabel("\(name)'s screen")
    .accessibilityAddTraits(.isModal)
    .onAppear {
      // The agent waits on the person: the computer opens theirs to use.
      if waiting { control = true }
      fullScreen = NSApp.keyWindow?.styleMask.contains(.fullScreen) ?? false
      // The arrows from inside the screen switch between helpers' screens too (`sand:vnc-host-key`).
      events.onHostKey = { key in
        window.stepComputerHelper(key == "ArrowUp" || key == "ArrowLeft" ? -1 : 1, store: store)
      }
      // The computer's copied text onto this Mac's clipboard, unless it was just sent either way.
      events.onClipboard = { text in
        guard let fresh = bridge.fromBox(text) else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(fresh, forType: .string)
        pasteboardSeen = NSPasteboard.general.changeCount
        pasteboardSent = pasteboardSeen
      }
      // This Mac's clipboard to the computer on a click in it, the window coming forward, or the screen coming up; 0.2 s apart at most.
      events.onPointerDown = { sendClipboard() }
      // ⌘V: the words the computer does not have yet go with the keys, read on the key itself.
      events.onPasteKey = { shift in
        guard phase == "connected" else { return }
        events.pasteAndPress(readClipboard(), shift: shift)
      }
    }
    .onDisappear {
      // The closures hold this view's state; let them go with it.
      events.onHostKey = { _ in }
      events.onClipboard = { _ in }
      events.onPointerDown = {}
      events.onPasteKey = { _ in }
      // Closed while the agent was paused for the person: it has the computer back.
      if paused { Task { await store.handBackComputer(agentId) } }
    }
    // The agent hands the computer over and waits: it is the person's to use.
    .onChange(of: waiting) { _, now in
      if now && !control { withAnimation(.easeOut(duration: 0.18)) { control = true } }
    }
    // In control the screen takes the keys and this Mac's clipboard; watching, it gives the keys back.
    .onChange(of: control) { _, now in
      guard let view = events.view, let window = view.window else { return }
      if now {
        window.makeFirstResponder(view)
        sendClipboard()
      } else if (window.firstResponder as? NSView)?.isDescendant(of: view) == true {
        window.makeFirstResponder(nil)
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in sendClipboard() }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didEnterFullScreenNotification)) { _ in fullScreen = true }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didExitFullScreenNotification)) { _ in fullScreen = false }
    .onChange(of: phase) { _, now in
      guard now == "connected", control else { return }
      sendClipboard()
      // Once the screen is up it takes the keys (the window focuses its page when ready).
      if let view = events.view { view.window?.makeFirstResponder(view) }
    }
    // Another helper's screen is a new connection: the clipboard goes again once it is up.
    .onChange(of: stageKey) { _, _ in phase = "starting" }
  }

  /**
   * This Mac's clipboard to the computer. Read only when it changed since
   * it was last read or written here: the same text sent again changes
   * nothing on the computer, and each read can ask the person on macOS 26.
   * Not before the screen is up: the page had no connection to send it on
   * and dropped it, and the change counted as sent, so what was copied
   * before the computer opened never reached it.
   */
  private func sendClipboard() {
    // Watching, the screen takes nothing: words sent now would be dropped and counted as sent.
    guard phase == "connected", control else { return }
    let pasteboard = NSPasteboard.general
    guard pasteboard.changeCount != pasteboardSeen, bridge.mayRead() else { return }
    guard let text = readClipboard() else { return }
    events.paste(text)
  }

  /** Take control: the screen is the person's at once; a working agent is paused meanwhile (`takeComputerControl`). */
  private func takeControl(_ agentId: String) {
    withAnimation(.easeOut(duration: 0.18)) { control = true }
    Task {
      guard await store.takeComputerControl(agentId) else { return }
      if control {
        withAnimation(.easeOut(duration: 0.18)) { paused = true }
      } else {
        // Stopped before the agent was paused: it has the computer back at once.
        await store.handBackComputer(agentId)
      }
    }
  }

  /** Stop: back to watching; an agent paused for the person has the computer back and goes on. */
  private func stopControl(_ agentId: String) {
    withAnimation(.easeOut(duration: 0.18)) { control = false }
    guard paused else { return }
    paused = false
    Task { await store.handBackComputer(agentId) }
  }

  /**
   * This Mac's words when the computer does not have them yet, else nil. A
   * read that came back with nothing while words are there (macOS can
   * refuse one outside a paste) is tried again on the next ⌘V.
   */
  private func readClipboard() -> String? {
    let pasteboard = NSPasteboard.general
    let count = pasteboard.changeCount
    guard count != pasteboardSent else { return nil }
    pasteboardSeen = count
    guard let text = pasteboard.string(forType: .string), !text.isEmpty else { return nil }
    pasteboardSent = count
    bridge.sent(text)
    return text
  }
}

/**
 * Under the screen, who has the computer (the founder's reference picture,
 * 10 November 2026): a dark capsule (#1c1c1e at 94%, a hairline, 4 in) with
 * the eye and "Watching" in white at 60% and Take control (white, the ink
 * on it), or the pointer and "You're in control" in white and Stop (white
 * at 12%). 13 points, 30 high inside. Take control waits for the picture; a
 * click on the screen while watching swells it once.
 */
private struct ControlPill: View {
  let control: Bool
  let enabled: Bool
  let nudge: Int
  let take: () -> Void
  let stop: () -> Void
  @State private var hovering = false
  @State private var swelling = false
  @FocusState private var focused: Bool

  var body: some View {
    HStack(spacing: 10) {
      HStack(spacing: 6) {
        Image(systemName: control ? "cursorarrow" : "eye")
          .font(.system(size: 12, weight: .medium))
          .frame(width: 14)
        Text(control ? "You're in control" : "Watching")
          .font(.system(size: 13))
          .lineLimit(1)
      }
      .foregroundStyle(Color.white.opacity(control ? 1 : 0.6))
      .padding(.leading, 10)
      .contentTransition(.opacity)
      Button(action: control ? stop : take) {
        Text(control ? "Stop" : "Take control")
          .font(.system(size: 13, weight: .medium))
          .lineLimit(1)
          .foregroundStyle(control ? Color.white : Color(hex: 0x141414))
          .padding(.horizontal, 14)
          .frame(height: 30)
          .background(fill, in: Capsule())
          .contentShape(Capsule())
          .contentTransition(.opacity)
      }
      .buttonStyle(.hand)
      .disabled(!control && !enabled)
      .opacity(!control && !enabled ? 0.5 : 1)
      .scaleEffect(swelling ? 1.08 : 1)
      .focused($focused)
      .focusEffectDisabled()
      .overlay {
        if focused {
          Capsule().strokeBorder(Color(hex: 0xfcfcfc).opacity(0.4), lineWidth: 2).padding(-2)
        }
      }
      .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
      .pointerStyle(.link)
      .accessibilityLabel(control ? "Stop" : "Take control")
    }
    .padding(4)
    .background(Color(hex: 0x1c1c1e).opacity(0.94), in: Capsule())
    .overlay(Capsule().strokeBorder(Color.white.opacity(0.1), lineWidth: 0.5))
    .shadow(color: .black.opacity(0.35), radius: 12, y: 4)
    .fixedSize()
    .animation(.easeOut(duration: 0.18), value: control)
    .onChange(of: nudge) { _, _ in
      guard !control else { return }
      withAnimation(.spring(response: 0.18, dampingFraction: 0.5)) { swelling = true }
      Task {
        try? await Task.sleep(nanoseconds: 180_000_000)
        withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) { swelling = false }
      }
    }
    .accessibilityElement(children: .contain)
  }

  private var fill: Color {
    control ? Color.white.opacity(hovering ? 0.18 : 0.12) : (hovering ? Color(hex: 0xe9e9eb) : Color.white)
  }
}

/**
 * The bar across the top (`pbn`, 44 high, black at 55%): 88 in from the
 * left for the traffic lights (8 in full screen), a strip that moves the
 * window, and Exit fullscreen at the right (24 × 24, 6 round, the contract
 * arrows in white at 85%; white on a faint grey under the pointer). No
 * title.
 */
private struct ComputerTopBar: View {
  let fullScreen: Bool
  let look: Look
  let exit: () -> Void
  @State private var hovering = false
  @FocusState private var focused: Bool

  var body: some View {
    HStack(spacing: 8) {
      WindowDragArea()
      Button(action: exit) {
        Image(systemName: "arrow.down.right.and.arrow.up.left")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(Color.white.opacity(hovering ? 1 : 0.85))
          .frame(width: 24, height: 24)
          .background(hovering ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
          .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
      }
      .buttonStyle(.hand)
      .focused($focused)
      .focusEffectDisabled()
      // A ring that shows on the dark bar in both themes (the window's is invisible on light).
      .overlay {
        if focused {
          RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Color(hex: 0xfcfcfc).opacity(0.4), lineWidth: 2).padding(-1)
        }
      }
      .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
      .pointerStyle(.link)
      .help("Exit fullscreen")
      .accessibilityLabel("Exit fullscreen")
    }
    .padding(.leading, fullScreen ? 8 : 88)
    .padding(.trailing, 8)
    .frame(height: 44)
    .background(Color.black.opacity(0.549))
  }
}

/**
 * The hand-off over the screen (`Je`, 10 round, the orange at 13%): the
 * instruction or "{name} needs you" in amber (13/18, two lines at most, all
 * of it on hover), then Skip this step and I'm done, continue (24 high, 6
 * round, 12/16). Both answer the agent, close the view and give the
 * message field the keys.
 */
private struct HandoffBanner: View {
  let agentId: String
  let name: String
  let instruction: String
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window

  var body: some View {
    let blank = instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let text = blank ? String(localized: "\(name) needs you") : instruction
    HStack(spacing: 16) {
      Text(text)
        .font(.system(size: 13))
        .cssLineHeight(18, size: 13)
        .foregroundStyle(Color(hex: 0xffbd3b))
        .lineLimit(2)
        .truncationMode(.tail)
        .help(text)
        .frame(maxWidth: .infinity, alignment: .leading)
      HStack(spacing: 8) {
        HandoffBannerButton(title: String(localized: "Skip this step"), primary: false) { answer(skip: true) }
        HandoffBannerButton(title: String(localized: "I'm done, continue"), primary: true) { answer(skip: false) }
      }
      .fixedSize()
    }
    .padding(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 10))
    .background(Color(red: 249 / 255, green: 133 / 255, blue: 0).opacity(0.129), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func answer(skip: Bool) {
    Task { await store.handBackComputer(agentId, skip: skip) }
    window.closeComputer()
  }
}

private struct HandoffBannerButton: View {
  let title: String
  let primary: Bool
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
        .foregroundStyle(primary ? Color(hex: 0x141414) : Color(hex: 0xfcfcfc))
        .padding(.horizontal, 6)
        .frame(height: 24)
        .background(fill, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .overlay {
          if !primary {
            RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color(hex: 0xfcfcfc).opacity(0.102), lineWidth: 0.5)
          }
        }
        .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
    .buttonStyle(.hand)
    .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
  }

  private var fill: Color {
    primary ? (hovering ? .white : Color(hex: 0xfdfdfd)) : Color(red: 247 / 255, green: 234 / 255, blue: 234 / 255).opacity(hovering ? 0.102 : 0.051)
  }
}

/**
 * The helpers' screens under the stage (`fbn`, 122 high, 8 apart, centred):
 * the others, all of them up to four, else three and "and N more" with the
 * Mac's menu of the rest. Each is the agent's screen watched only (160 ×
 * 100, 8 round) over its name (12/16); a click switches to it. The "more"
 * tile has the thumbnails' frame (decision 8; the window's is 42 high).
 */
private struct HelperStrip: View {
  let helpers: [ComputerHelper]
  let vncUrl: String?
  let look: Look
  let pick: (String) -> Void
  @State private var moreSpot = WindowSpot()

  var body: some View {
    let strip = ComputerHelper.strip(helpers.count)
    HStack(alignment: .top, spacing: 8) {
      ForEach(helpers.prefix(strip.shown)) { helper in
        Button { pick(helper.subagentId) } label: {
          VStack(spacing: 6) {
            HelperThumb(vncUrl: vncUrl, look: look)
            Text(helper.title)
              .font(.system(size: 12))
              .cssLineHeight(16, size: 12)
              .foregroundStyle(Color(hex: 0xfcfcfc).opacity(0.6))
              .lineLimit(1)
              .truncationMode(.tail)
          }
          .frame(width: 160)
          .contentShape(Rectangle())
        }
        .buttonStyle(.hand)
        .accessibilityLabel("Switch to \(helper.title)")
        .help("Switch to \(helper.title)")
      }
      if let more = strip.more {
        let rest = Array(helpers.dropFirst(strip.shown))
        Button { showMore(rest) } label: {
          VStack(spacing: 6) {
            Image(systemName: "display")
              .font(.system(size: 18))
              .foregroundStyle(Color(hex: 0xfcfcfc).opacity(0.4))
              .frame(width: 160, height: 100)
              .background(Color(red: 247 / 255, green: 234 / 255, blue: 234 / 255).opacity(0.051), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
              .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(hex: 0xfcfcfc).opacity(0.102), lineWidth: 0.5))
            Text("and \(more) more")
              .font(.system(size: 12))
              .cssLineHeight(16, size: 12)
              .foregroundStyle(Color(hex: 0xfcfcfc).opacity(0.6))
          }
          .frame(width: 160)
          .contentShape(Rectangle())
        }
        .buttonStyle(.hand)
        .background(WindowSpotReader(spot: moreSpot))
        .accessibilityLabel("Show \(more) more screens")
        .help("\(more) more screens")
      }
    }
    .frame(height: 122, alignment: .top)
    .accessibilityElement(children: .contain)
  }

  /** "More screens" (`fbn`): the rest, by title; the one chosen is switched to. */
  private func showMore(_ rest: [ComputerHelper]) {
    let menu = NSMenu(title: String(localized: "More screens"))
    for helper in rest {
      menu.addItem(BlockMenuItem(helper.title) { pick(helper.subagentId) })
    }
    RoutineMenus.popUp(menu, under: moreSpot.frame)
  }
}

/** A helper's thumbnail: the agent's own screen (`CTn` gives each the agent's address), watched only, shown once connected. */
private struct HelperThumb: View {
  let vncUrl: String?
  let look: Look
  @State private var phase = "starting"
  @State private var events = ScreenEvents()

  var body: some View {
    ZStack {
      if let vncUrl {
        ComputerScreenView(vncUrl: vncUrl, phase: $phase, events: events)
          .opacity(phase == "connected" ? 1 : 0)
          .allowsHitTesting(false)
          .accessibilityHidden(true)
      }
    }
    .frame(width: 160, height: 100)
    .background(look.ground)
    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(Color(hex: 0xfcfcfc).opacity(0.102), lineWidth: 0.5))
  }
}
