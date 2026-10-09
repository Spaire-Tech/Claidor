import AppKit
import SwiftUI
import WebKit
import SimeonCore

/**
 * The log of the screens' connections (`computer-stream.log`, as the
 * Electron app keeps it beside its data): emptied at each launch, a line per
 * step with its time, and the last reason a screen is stuck, read from
 * those lines (`computerStreamReason`) for the notices under a stuck screen.
 */
@MainActor
@Observable
final class ComputerStreamLog {
  static let shared = ComputerStreamLog()

  /** The last reason a screen gave for not connecting; cleared once one connects. */
  private(set) var reason: String?
  let path: String
  @ObservationIgnored private var handle: FileHandle?

  private init() {
    let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!.appendingPathComponent("Simeon", isDirectory: true)
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let file = folder.appendingPathComponent("computer-stream.log")
    path = file.path
    FileManager.default.createFile(atPath: path, contents: Data())
    handle = try? FileHandle(forWritingTo: file)
    write("computer stream log at \(path)")
  }

  func write(_ text: String) {
    let line = "\(ISO8601DateFormatter.withFraction.string(from: Date())) \(text)\n"
    handle?.seekToEndOfFile()
    handle?.write(Data(line.utf8))
    switch ComputerStreamReason.change(for: text) {
    case .keep: break
    case .clear: reason = nil
    case .set(let next): reason = next
    }
  }

  /** The words of a notice: what is wrong, the last reason, where the log is (`noticeText`). */
  func notice(_ lead: String) -> String { ComputerStreamReason.notice(lead: lead, reason: reason, filePath: path) }
}

private extension ISO8601DateFormatter {
  static let withFraction: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
}

/** The notice's red (`light-dark(#8a1c1c, #ff8a80)`). */
private let noticeRed = Color.dynamic(light: "#8a1c1c", dark: "#ff8a80")

/** A screen of an agent's computer, connected through Simeon Labs' proxy once its address is known; every line it reports goes to the log. */
struct MacScreen: View {
  let vncUrl: String
  var interactive = false
  @Binding var phase: String
  var events: ScreenEvents
  @Environment(AppStore.self) private var store
  @State private var socket: URL?

  var body: some View {
    Group {
      if let socket {
        LiveScreen(socket: socket, viewOnly: !interactive, phase: $phase, events: events, interactive: interactive)
      } else {
        Color.clear
      }
    }
    .task(id: vncUrl) {
      events.onLog = { line in ComputerStreamLog.shared.write(line) }
      socket = await store.screenSocket(vncUrl)
    }
  }
}

// MARK: - The Computer tab

/**
 * The Computer tab of the agent's pane (`_bn`): "Needs your attention" with
 * Skip this step and I'm done, continue while the agent waits on the
 * person; the screen, watched only, 1280 by 800 scaled to fit, with the
 * agent's own pointer over it; "Open" on hover, and a click anywhere opens
 * the computer's window; the words for a screen not there yet; "{name}'s
 * screen" under it. It only reads the computer; opening it starts it.
 */
struct MacComputerPreview: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @Environment(\.openWindow) private var openWindow
  @State private var phase = "starting"
  @State private var connected = false
  @State private var spinningSince: Date?
  @State private var stuck = false
  @State private var hovering = false
  @State private var events = ScreenEvents()

  var body: some View {
    let id = agent.id
    let status = store.computer.status(id)
    let read = store.computer.readState(id)
    let computerPhase = store.computer.phase(id)
    let helpers = store.computerHelpers(id)
    let first = helpers.first
    let url = status?.screenURL
    let name = agent.name.isEmpty ? "This agent" : agent.name
    VStack(spacing: 10) {
      if let handoff = status?.handoff {
        attention(handoff, name: name)
      }
      ZStack {
        if let url {
          MacScreen(vncUrl: url, phase: $phase, events: events)
            .opacity(connected && phase != "unavailable" ? 1 : 0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
          MacAgentPointerOverlay(pointer: store.pointers[first?.subagentId ?? id])
        }
        // The whole frame opens the computer; "Open" shows on hover or focus while there is a screen.
        Button { open() } label: {
          ZStack {
            Color.clear.contentShape(.rect)
            if url != nil {
              Label("Open", systemImage: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(.black.opacity(0.6), in: Capsule())
                .opacity(hovering ? 1 : 0)
                .animation(.easeOut(duration: 0.12), value: hovering)
            }
          }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(first?.title ?? "Open computer")
        .help(first?.title ?? "")
        .onHover { hovering = $0 }
        // Over the button: what is happening while there is no screen yet, and its Retry.
        if url != nil {
          if phase == "unavailable" {
            Text(ScreenCrashes.unavailable).font(.system(size: 13)).foregroundStyle(.secondary).allowsHitTesting(false)
          } else if !connected {
            ProgressView().controlSize(.small).allowsHitTesting(false)
          }
        } else if let copy = ComputerPlaceholder.preview(name: name, read: read, phase: computerPhase, pullPercent: status?.pullPercent) {
          MacComputerPlaceholder(copy: copy, tone: .pane) { store.retryComputer(id) }
        } else {
          Image(systemName: "desktopcomputer").font(.system(size: 17)).foregroundStyle(.secondary).allowsHitTesting(false).accessibilityHidden(true)
        }
        if stuck && url != nil && !connected && phase != "unavailable" {
          VStack {
            Spacer()
            Text(ComputerStreamLog.shared.notice(ComputerStreamReason.notConnecting))
              .font(.system(size: 12))
              .foregroundStyle(noticeRed)
              .multilineTextAlignment(.center)
              .padding(.horizontal, 8).padding(.vertical, 6)
              .frame(maxWidth: .infinity)
              .background(Color.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
              .padding(8)
              .allowsHitTesting(false)
          }
        }
      }
      .frame(maxWidth: .infinity)
      .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
      .background(Ink.pill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Ink.hairline, lineWidth: 1))
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Computer preview")
      Text("\(name)'s screen")
        .font(.system(size: 13))
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
    }
    // Its computer followed while the tab shows (`retain`).
    .onAppear { store.watchComputer(id) }
    .onDisappear { store.unwatchComputer(id) }
    // "Connected" holds from the first connection until the page is loaded again (`DAe`).
    .onChange(of: phase) { _, now in
      if now == "connected" { connected = true }
      if now == "starting" { connected = false }
    }
    .onChange(of: url) { _, _ in connected = false; phase = "starting" }
    .onChange(of: url != nil && !connected && phase != "unavailable", initial: true) { _, spinning in
      spinningSince = spinning ? Date() : nil
      stuck = false
    }
    // A spinner up 20 s gets its notice (`COMPUTER_STREAM_NOTICE_DELAY_MS`).
    .task(id: spinningSince) {
      guard spinningSince != nil else { return }
      try? await Task.sleep(nanoseconds: UInt64((ComputerScreen.noticeDelay + 0.05) * 1_000_000_000))
      if !Task.isCancelled && spinningSince != nil { stuck = true }
    }
  }

  /** "Needs your attention" (`V1t`): the instruction, or "{name} needs you"; its buttons answer and open nothing. */
  private func attention(_ handoff: BoxStatus.Handoff, name: String) -> some View {
    let instruction = handoff.instruction.trimmingCharacters(in: .whitespacesAndNewlines)
    return VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Needs your attention").font(.system(size: 13, weight: .medium)).foregroundStyle(.yellow)
        Text(instruction.isEmpty ? "\(name) needs you" : handoff.instruction)
          .font(.system(size: 13)).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
      }
      HStack(spacing: 4) {
        Spacer(minLength: 0)
        Button("Skip this step") { Task { await store.handBackComputer(agent.id, skip: true) } }
        Button("I'm done, continue") { Task { await store.handBackComputer(agent.id) } }
          .buttonStyle(.borderedProminent)
      }
      .controlSize(.small)
    }
    .padding(10)
    .background(Color.yellow.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Ink.hairline, lineWidth: 1))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Needs your attention")
  }

  private func open() {
    store.openComputer(agent.id)
    openWindow(id: "computer", value: agent.id)
  }
}

/**
 * The words over a screen not there yet (`U1t`): what is happening, a bar
 * (how far, or moving), and Retry under "Can't reach…" with the reason
 * the log last gave. In the pane's tone or the computer window's.
 */
struct MacComputerPlaceholder: View {
  enum Tone { case pane, cover }
  let copy: ComputerPlaceholder
  let tone: Tone
  let retry: () -> Void

  var body: some View {
    VStack(spacing: tone == .pane ? 8 : 12) {
      Text(copy.message)
        .font(.system(size: tone == .pane ? 14 : 13))
        .foregroundStyle(tone == .pane ? AnyShapeStyle(.secondary) : AnyShapeStyle(Color.white))
        .multilineTextAlignment(.center)
      if copy.isBusy {
        HStack(spacing: 8) {
          if let percent = copy.percent {
            ProgressView(value: min(max(percent, 0), 100), total: 100).progressViewStyle(.linear)
            Text("\(Int(percent.rounded()))%").font(.system(size: 12)).monospacedDigit()
              .foregroundStyle(tone == .pane ? AnyShapeStyle(.secondary) : AnyShapeStyle(Color.white))
          } else {
            ProgressView().progressViewStyle(.linear)
          }
        }
        .frame(width: 237)
        .tint(tone == .pane ? nil : .white)
      }
      if copy.hasRetry {
        Button("Retry", action: retry)
          .buttonStyle(.bordered)
          .buttonBorderShape(.capsule)
          .controlSize(.small)
          .tint(tone == .cover ? .white : nil)
        // The reason, at once, under "Can't reach…" (`computer-stream-notice.ts`).
        Text(ComputerStreamLog.shared.notice(ComputerStreamReason.statusUnreadable))
          .font(.system(size: 12))
          .foregroundStyle(noticeRed)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 430)
          .padding(.top, 6)
      }
    }
    .padding(tone == .pane ? 12 : 24)
  }
}

/** The agent's own pointer on its screen (`Abn`): where it last moved or clicked, gliding there, pressing on a click. */
struct MacAgentPointerOverlay: View {
  let pointer: AgentPointer?
  @State private var shown: AgentPointer?
  @State private var moves = 0
  @State private var lastMove: Date?
  @State private var pressed = false

  var body: some View {
    GeometryReader { geo in
      if let shown {
        let place = shown.place(width: geo.size.width, height: geo.size.height)
        let scale = AgentPointer.scale(frameWidth: geo.size.width)
        ZStack {
          Image(systemName: "location.fill").font(.system(size: 20)).foregroundStyle(.white).offset(x: 0.6, y: 0.6)
          Image(systemName: "location.fill").font(.system(size: 20)).foregroundStyle(.white).offset(x: -0.6, y: -0.6)
          Image(systemName: "location.fill").font(.system(size: 19)).foregroundStyle(.black)
        }
        .rotationEffect(.degrees(-90))
        .scaleEffect(0.85 * scale * (pressed ? 0.8 : 1), anchor: .topLeading)
        .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
        .position(x: place.x + 10 * scale, y: place.y + 10 * scale)
        .animation(moves > 1 ? .timingCurve(0.19, 1, 0.22, 1, duration: 0.5) : nil, value: place.x)
        .animation(moves > 1 ? .timingCurve(0.19, 1, 0.22, 1, duration: 0.5) : nil, value: place.y)
        .transition(.opacity.animation(.easeOut(duration: 0.09)))
      }
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .onChange(of: pointer, initial: true) { old, now in
      guard let now else { return }
      let moved = old.map { $0.x != now.x || $0.y != now.y } ?? false
      let sinceMove = lastMove.map { now.at.timeIntervalSince($0) }
      if moved { lastMove = now.at }
      moves += 1
      shown = now
      guard now.type == "click" else { return }
      let delay = AgentPointer.pressDelay(sinceMove: sinceMove ?? 0)
      Task {
        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        withAnimation(.easeOut(duration: 0.14)) { pressed = true }
        try? await Task.sleep(nanoseconds: 140_000_000)
        withAnimation(.easeOut(duration: 0.14)) { pressed = false }
      }
    }
  }
}

// MARK: - The computer's window

/**
 * An agent's computer in a window of its own (the Electron window's
 * full-size computer, `bbn`), "{name}'s screen": always the person's to
 * use while it is open, the largest 16:10 that fits; the hand-off's banner
 * above it (both its buttons answer, close the window and go back to the
 * message field); the helpers' screens under it, ↑← and ↓→ between them;
 * the clipboard both ways while it is open; the words for a screen not
 * there yet. Opening it started the computer; closing it hands nothing back.
 */
struct MacComputerWindow: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.dismissWindow) private var dismissWindow
  @State private var asked: String?
  @State private var phase = "starting"
  @State private var events = ScreenEvents()
  @State private var bridge = ClipboardBridge()
  @State private var hostWindow: NSWindow?
  @FocusState private var focused: Bool

  var body: some View {
    let agent = store.agent(agentId)
    let name = (agent?.name).flatMap { $0.isEmpty ? nil : $0 } ?? "This agent"
    let status = store.computer.status(agentId)
    let helpers = store.computerHelpers(agentId)
    let focusedHelper = ComputerHelper.focused(helpers, asked: asked)
    let helper = helpers.first { $0.subagentId == focusedHelper }
    let url = status?.screenURL
    let stageKey = focusedHelper ?? "setup"
    VStack(spacing: 0) {
      if let handoff = status?.handoff {
        banner(handoff, name: name)
      }
      // The stage: the largest 16:10 that fits.
      ZStack {
        if let url {
          MacScreen(vncUrl: url, interactive: true, phase: $phase, events: events)
            .id("\(stageKey):\(url)")
        } else {
          MacComputerPlaceholder(copy: ComputerPlaceholder.full(name: name, read: store.computer.readState(agentId), phase: store.computer.phase(agentId),
                                                                pullPercent: status?.pullPercent, hasHelpers: !helpers.isEmpty), tone: .cover) {
            store.retryComputer(agentId)
          }
        }
      }
      .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
      .background(Color(white: 0.08), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
      .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color.white.opacity(0.1), lineWidth: 0.5))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      if let helper {
        Text(helper.title).font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.6)).lineLimit(1).padding(.top, 6)
      }
      if helpers.count > 1 {
        MacHelperStrip(helpers: helpers.filter { $0.subagentId != focusedHelper }, vncUrl: url) { asked = $0 }
      }
    }
    .padding(8)
    .background(Color(white: 0.08, opacity: 0.95))
    .environment(\.colorScheme, .dark)
    .focusable()
    .focused($focused)
    .focusEffectDisabled()
    // The arrows between helpers' screens, from the window or from inside the screen (`bbn`, `sand:vnc-host-key`).
    .onKeyPress(keys: [.upArrow, .leftArrow, .downArrow, .rightArrow]) { press in
      guard helpers.count >= 2 else { return .ignored }
      step(press.key == .upArrow || press.key == .leftArrow ? -1 : 1, helpers, from: focusedHelper)
      return .handled
    }
    .navigationTitle("\(name)'s screen")
    .toolbar {
      ToolbarItem(placement: .primaryAction) {
        Button { exit() } label: { Label("Exit fullscreen", systemImage: "arrow.down.right.and.arrow.up.left") }
          .help("Exit fullscreen")
      }
    }
    .frame(minWidth: 640, minHeight: 440)
    .background { WindowReader(window: $hostWindow) }
    .onAppear {
      focused = true
      events.onHostKey = { key in
        let now = store.computerHelpers(agentId)
        guard now.count >= 2 else { return }
        step(key == "ArrowUp" || key == "ArrowLeft" ? -1 : 1, now, from: ComputerHelper.focused(now, asked: asked))
      }
      // The computer's copied text onto this Mac's clipboard, unless it was just sent either way.
      events.onClipboard = { text in
        if let fresh = bridge.fromBox(text) {
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(fresh, forType: .string)
        }
      }
      // This Mac's clipboard to the computer on a click in it, the window coming forward, or the view opening; 0.2 s apart at most.
      events.onPointerDown = { sendClipboard() }
      store.watchComputer(agentId)
      sendClipboard()
    }
    .onDisappear { store.unwatchComputer(agentId) }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { note in
      if let window = note.object as? NSWindow, window === hostWindow { sendClipboard() }
    }
    .onChange(of: phase) { _, now in if now == "connected" { sendClipboard() } }
  }

  /** The hand-off's banner (`bbn`): the instruction or "{name} needs you", Skip this step and I'm done, continue; both answer, then close. */
  private func banner(_ handoff: BoxStatus.Handoff, name: String) -> some View {
    let instruction = handoff.instruction.trimmingCharacters(in: .whitespacesAndNewlines)
    let text = instruction.isEmpty ? "\(name) needs you" : handoff.instruction
    return HStack(spacing: 16) {
      Text(text).font(.system(size: 13)).foregroundStyle(Color(red: 1, green: 0.74, blue: 0.23)).lineLimit(2).help(text)
      Spacer(minLength: 0)
      Button("Skip this step") { handBack(skip: true) }
      Button("I'm done, continue") { handBack(skip: false) }
        .buttonStyle(.borderedProminent)
        .tint(.white)
        .foregroundStyle(.black)
    }
    .controlSize(.small)
    .padding(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 10))
    .background(Color(red: 0.98, green: 0.52, blue: 0).opacity(0.13), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .padding(.bottom, 8)
  }

  private func handBack(skip: Bool) {
    Task { await store.handBackComputer(agentId, skip: skip) }
    exit()
  }

  /** "Exit fullscreen" and both banner buttons: the window goes, the message field takes the keys (`W`). */
  private func exit() {
    dismissWindow(id: "computer", value: agentId)
    NotificationCenter.default.post(name: .simeonFocusComposer, object: nil)
  }

  private func step(_ by: Int, _ helpers: [ComputerHelper], from current: String?) {
    if let next = ComputerHelper.step(helpers, from: current, by: by) { asked = next }
  }

  private func sendClipboard() {
    guard bridge.mayRead(), let text = NSPasteboard.general.string(forType: .string), !text.isEmpty else { return }
    events.paste(text)
    bridge.sent(text)
  }
}

/**
 * The helpers' screens under the stage (`fbn`): the others, all of them up
 * to four, else three and "and N more" with a menu of the rest. Each is a
 * live picture, watched only; a click switches to it.
 */
struct MacHelperStrip: View {
  let helpers: [ComputerHelper]
  let vncUrl: String?
  let pick: (String) -> Void

  var body: some View {
    let (shown, more) = ComputerHelper.strip(helpers.count)
    HStack(spacing: 8) {
      ForEach(helpers.prefix(shown)) { helper in
        Button { pick(helper.subagentId) } label: {
          VStack(spacing: 6) {
            thumb
            Text(helper.title).font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
          }
          .frame(maxWidth: 160)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Switch to \(helper.title)")
        .help("Switch to \(helper.title)")
      }
      if let more {
        Menu {
          ForEach(helpers.dropFirst(shown)) { helper in
            Button(helper.title) { pick(helper.subagentId) }
          }
        } label: {
          VStack(spacing: 6) {
            Image(systemName: "desktopcomputer").font(.system(size: 22)).foregroundStyle(.white.opacity(0.6))
              .frame(maxWidth: 160).aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
              .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            Text("and \(more) more").font(.system(size: 12, weight: .medium)).foregroundStyle(.white.opacity(0.6))
          }
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .accessibilityLabel("Show \(more) more screens")
        .help("\(more) more screens")
      }
    }
    .frame(height: 122)
    .padding(.top, 12)
    .accessibilityElement(children: .contain)
  }

  /** Every helper shows the agent's own screen (`CTn` gives each the agent's address). */
  @ViewBuilder
  private var thumb: some View {
    ZStack {
      if let vncUrl {
        MacStripScreen(vncUrl: vncUrl)
      }
    }
    .frame(maxWidth: 160)
    .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
    .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
  }
}

/** A thumbnail's live screen, watched only. */
private struct MacStripScreen: View {
  let vncUrl: String
  @State private var phase = "starting"
  @State private var events = ScreenEvents()

  var body: some View {
    MacScreen(vncUrl: vncUrl, phase: $phase, events: events)
      .opacity(phase == "connected" ? 1 : 0)
      .allowsHitTesting(false)
  }
}
