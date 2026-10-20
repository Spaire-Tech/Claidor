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
 * under it, the window showing through at 5%), always the person's to use
 * while it is open. At the top a 44-point bar (the window's traffic lights
 * at its left, a strip that moves the window, Exit fullscreen at its
 * right); under it, 8 in: the hand-off's banner, the screen as the largest
 * 16:10 that fits, the helper's name when a helper's screen is shown, and
 * the other helpers' screens. Opening and closing are instant. Opening it
 * started the computer; closing it hands nothing back and lets go of the
 * screen (decision 4); the message field takes the keys again. While it
 * shows, the keys are the computer's (decision 1); the clipboard goes both
 * ways.
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
  @State private var fullScreen = false

  var body: some View {
    let look = Look(scheme)
    let agentId = open.agentId
    let name = store.agent(agentId).flatMap { $0.name.isEmpty ? nil : $0.name } ?? String(localized: "This agent")
    let status = store.computer.status(agentId)
    let helpers = store.computerHelpers(agentId)
    let focusedHelper = ComputerHelper.focused(helpers, asked: open.helper)
    let helper = helpers.first { $0.subagentId == focusedHelper }
    let url = status?.screenURL
    // A helper's screen is a new connection (`{stageKey}:{url}`).
    let stageKey = focusedHelper ?? "setup"
    VStack(spacing: 0) {
      ComputerTopBar(fullScreen: fullScreen, look: look) { window.closeComputer() }
      VStack(spacing: 0) {
        if let handoff = status?.handoff {
          HandoffBanner(agentId: agentId, name: name, instruction: handoff.instruction)
            .padding(.bottom, 8)
        }
        Group {
          if let url {
            ComputerScreenView(vncUrl: url, interactive: true, phase: $phase, events: events)
              .id("\(stageKey):\(url)")
              .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
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
      }
      // This Mac's clipboard to the computer on a click in it, the window coming forward, or the view opening; 0.2 s apart at most.
      events.onPointerDown = { sendClipboard() }
      sendClipboard()
    }
    .onDisappear {
      // The closures hold this view's state; let them go with it.
      events.onHostKey = { _ in }
      events.onClipboard = { _ in }
      events.onPointerDown = {}
    }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in sendClipboard() }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didEnterFullScreenNotification)) { _ in fullScreen = true }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didExitFullScreenNotification)) { _ in fullScreen = false }
    .onChange(of: phase) { _, now in
      guard now == "connected" else { return }
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
   */
  private func sendClipboard() {
    let pasteboard = NSPasteboard.general
    guard pasteboard.changeCount != pasteboardSeen, bridge.mayRead() else { return }
    pasteboardSeen = pasteboard.changeCount
    guard let text = pasteboard.string(forType: .string), !text.isEmpty else { return }
    events.paste(text)
    bridge.sent(text)
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
