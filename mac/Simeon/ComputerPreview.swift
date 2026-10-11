import AppKit
import SwiftUI
import WebKit
import SimeonCore

// MARK: - The stream's log

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
    let line = "\(Self.stamp.string(from: Date())) \(text)\n"
    // The throwing calls: a full disk is an error here, not an exception.
    _ = try? handle?.seekToEnd()
    try? handle?.write(contentsOf: Data(line.utf8))
    switch ComputerStreamReason.change(for: text) {
    case .keep: break
    case .clear: reason = nil
    case .set(let next): reason = next
    }
  }

  /** The words of a notice: what is wrong, the last reason, where the log is (`noticeText`). */
  func notice(_ lead: String) -> String { ComputerStreamReason.notice(lead: lead, reason: reason, filePath: path) }

  private static let stamp: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()
}

// MARK: - Colours

extension Look {
  /** The stream's notices (`light-dark(#8a1c1c, #ff8a80)`). */
  var screenNotice: Color { dark ? Color(hex: 0xff8a80) : Color(hex: 0x8a1c1c) }
  /** "Needs your attention" and low disk: the orange title and its wash (`#c27400`, `#ffaf38`; 9%, 17.3%). */
  var attentionInk: Color { dark ? Color(hex: 0xffaf38) : Color(hex: 0xc27400) }
  var attentionWash: Color { Color(red: 1, green: 152 / 255, blue: 0).opacity(dark ? 0.173 : 0.09) }
}

// MARK: - A screen

/**
 * A screen of an agent's computer, connected through Simeon Labs' proxy
 * once its address is known (`LiveScreen`, noVNC in a web view, shared with
 * the iPhone); every line it reports goes to the log.
 */
struct ComputerScreenView: View {
  let vncUrl: String
  var interactive = false
  @Binding var phase: String
  let events: ScreenEvents
  @Environment(AppStore.self) private var store
  @State private var socket: URL?

  var body: some View {
    Group {
      if let socket {
        // A new address is a new page: the old one would never say it connected again.
        LiveScreen(socket: socket, viewOnly: !interactive, phase: $phase, events: events, interactive: interactive)
          .id(socket)
      } else {
        Color.clear
      }
    }
    // Asked again when the stream comes back: a rebuilt computer has a new network token.
    .task(id: SocketKey(vncUrl: vncUrl, live: store.isLive)) {
      events.onLog = { line in ComputerStreamLog.shared.write(line) }
      for attempt in 0..<20 {
        if let found = await store.screenSocket(vncUrl) {
          if found != socket { socket = found; phase = "starting" }
          return
        }
        if attempt == 0 { events.log("box reachability outcome=network method=screenSocket cause=no-connection baseUrl=") }
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        if Task.isCancelled { return }
      }
    }
  }

  private struct SocketKey: Equatable {
    let vncUrl: String
    let live: Bool
  }
}

// MARK: - The Computer tab

/**
 * The Computer tab of an agent's pane (I03, `_bn`): "Needs your attention"
 * while the agent waits on the person; the frame (the pane's width less 40,
 * 16:10, 14 round, the pane's grey and a hairline) with the screen watched
 * only, the agent's own pointer over it and "Open" on hover or focus; the
 * words for a screen not there yet, a spinner while it connects (its notice
 * after 20 seconds), "Screen preview unavailable" after too many crashes,
 * or the display's glyph; "{name}'s screen" under it. A click anywhere on
 * the frame opens the full view, which starts the computer; the tab itself
 * only reads it (the window watches the open agent's computer).
 */
struct ComputerPreview: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @State private var phase = "starting"
  @State private var connected = false
  @State private var spinningSince: Date?
  @State private var stuck = false
  @State private var hovering = false
  @State private var events = ScreenEvents()
  @FocusState private var focused: Bool

  var body: some View {
    let id = agent.id
    let status = store.computer.status(id)
    let read = store.computer.readState(id)
    let helpers = store.computerHelpers(id)
    let first = helpers.first
    // While the full view shows this computer the preview draws nothing (`XOn`): one connection to it at a time.
    let covered = window.computer?.agentId == id
    let url = covered ? nil : status?.screenURL
    let name = agent.name.isEmpty ? "This agent" : agent.name
    VStack(spacing: 10) {
      if let handoff = status?.handoff {
        ComputerAttention(agentId: id, name: name, instruction: handoff.instruction, look: look)
      }
      ZStack {
        if let url {
          ComputerScreenView(vncUrl: url, phase: $phase, events: events)
            .opacity(connected && phase != "unavailable" ? 1 : 0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
          AgentPointerOverlay(pointer: store.pointers[first?.subagentId ?? id])
        }
        // The whole frame opens the computer; "Open" shows on hover or keyboard focus while there is a screen.
        Button {
          window.openComputer(id, helper: first?.subagentId, store: store)
        } label: {
          ZStack {
            Color.clear.contentShape(Rectangle())
            if url != nil {
              OpenPill(look: look)
                .opacity(hovering || focused ? 1 : 0)
                .animation(.easeOut(duration: 0.12), value: hovering || focused)
            }
          }
        }
        .buttonStyle(.plain)
        .focused($focused)
        // Its ring would be cut by the frame (the window's is): the pill shows the focus instead.
        .focusEffectDisabled()
        .onHover { hovering = $0 }
        .pointerStyle(.link)
        .accessibilityLabel(first?.title ?? "Open computer")
        .help(first?.title ?? "")
        if !covered {
          if url != nil {
            if phase == "unavailable" {
              Text(ScreenCrashes.unavailable)
                .font(.system(size: 12))
                .cssLineHeight(16, size: 12)
                .foregroundStyle(look.inkTertiary)
                .allowsHitTesting(false)
            } else if !connected {
              ScreenSpinner(color: look.ink, size: 20)
                .allowsHitTesting(false)
            }
          } else if let copy = ComputerPlaceholder.preview(name: name, read: read, phase: store.computer.phase(id), pullPercent: status?.pullPercent) {
            ComputerPlaceholderView(copy: copy, tone: .pane, look: look) { store.retryComputer(id) }
          } else {
            Image(systemName: "display")
              .font(.system(size: 13))
              .foregroundStyle(look.inkTertiary)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
          }
          // A spinner up 20 seconds: why, at the frame's foot (the window means this plate; its own falls apart).
          if stuck && url != nil && !connected && phase != "unavailable" {
            VStack {
              Spacer(minLength: 0)
              Text(ComputerStreamLog.shared.notice(ComputerStreamReason.notConnecting))
                .font(.system(size: 12))
                .lineSpacing(16.2 - 14.3)
                .foregroundStyle(look.screenNotice)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(look.elevated.opacity(0.92), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .padding(8)
            }
            .allowsHitTesting(false)
          }
        }
      }
      .frame(maxWidth: .infinity)
      .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
      .background(look.paneFill)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.paneHairline, lineWidth: 1))
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Computer preview")
      Text("\(name)'s screen")
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
        .foregroundStyle(look.inkTertiary)
        .lineLimit(1)
        .frame(maxWidth: .infinity)
    }
    // "Connected" holds from the first connection until the page is loaded again (`DAe`): a reconnect keeps the picture.
    .onChange(of: phase) { _, now in
      if now == "connected" { connected = true }
      if now == "starting" { connected = false }
    }
    .onChange(of: url) { _, _ in connected = false; phase = "starting" }
    .onChange(of: url != nil && !connected && phase != "unavailable", initial: true) { _, spinning in
      spinningSince = spinning ? Date() : nil
      stuck = false
    }
    // A spinner up 20 s gets its notice (`COMPUTER_STREAM_NOTICE_DELAY_MS`, checked 50 ms after).
    .task(id: spinningSince) {
      guard spinningSince != nil else { return }
      try? await Task.sleep(nanoseconds: UInt64((ComputerScreen.noticeDelay + 0.05) * 1_000_000_000))
      if !Task.isCancelled && spinningSince != nil { stuck = true }
    }
  }
}

/** "Open" over the screen (67 × 32): the expand arrows (12) and the word (12/16), light on the dark scrim, a capsule. */
private struct OpenPill: View {
  let look: Look

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: "arrow.up.left.and.arrow.down.right")
        .font(.system(size: 11, weight: .medium))
      Text("Open")
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
    }
    .foregroundStyle(Color(hex: 0xfcfcfc))
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(look.fileScrim, in: Capsule())
    .accessibilityHidden(true)
  }
}

/**
 * "Needs your attention" over the frame (`V1t`, 14 round, padded 10, the
 * orange wash and a hairline): the title (13/18, 500, orange), the
 * instruction or "{name} needs you", then Skip this step and I'm done,
 * continue at the right (24 high, 6 round, 12/16). Both answer the agent;
 * neither opens or closes anything.
 */
private struct ComputerAttention: View {
  let agentId: String
  let name: String
  let instruction: String
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let blank = instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Needs your attention")
          .font(.system(size: 13, weight: .medium))
          .tracking(-0.08)
          .cssLineHeight(18, size: 13, weight: .medium)
          .foregroundStyle(look.attentionInk)
        Text(blank ? "\(name) needs you" : instruction)
          .font(.system(size: 13))
          .cssLineHeight(18, size: 13)
          .foregroundStyle(look.ink)
          .fixedSize(horizontal: false, vertical: true)
      }
      HStack(spacing: 4) {
        Spacer(minLength: 0)
        AttentionButton(title: "Skip this step", fill: look.rowHover, ink: look.ink) {
          Task { await store.handBackComputer(agentId, skip: true) }
        }
        AttentionButton(title: "I'm done, continue", fill: look.primaryFill, ink: look.onPrimary) {
          Task { await store.handBackComputer(agentId) }
        }
      }
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(look.attentionWash, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Needs your attention")
  }
}

private struct AttentionButton: View {
  let title: String
  let fill: Color
  let ink: Color
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
        .foregroundStyle(ink)
        .padding(.horizontal, 6)
        .frame(height: 24)
        .background(fill, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
    .buttonStyle(.plain)
  }
}

// MARK: - Words over a screen not there yet

/**
 * The words over a screen not there yet (`U1t`): what is happening (13/18),
 * a bar (how far, or moving), and Retry under "Can't reach…" with the
 * reason the log last gave, in red. In the pane's tone (its grey, padded
 * 12) or over the full view's dark (white, padded 24). Only Retry takes the
 * pointer: a click elsewhere goes to what is under it.
 */
struct ComputerPlaceholderView: View {
  enum Tone { case pane, cover }
  let copy: ComputerPlaceholder
  let tone: Tone
  let look: Look
  let retry: () -> Void

  var body: some View {
    let ink = tone == .pane ? look.inkSecondary : Color(hex: 0xfcfcfc)
    VStack(spacing: tone == .pane ? 8 : 12) {
      Text(copy.message)
        .font(.system(size: 13))
        .cssLineHeight(18, size: 13)
        .foregroundStyle(ink)
        .multilineTextAlignment(.center)
        .allowsHitTesting(false)
      if copy.isBusy {
        ComputerBar(percent: copy.percent, color: ink)
          .allowsHitTesting(false)
      }
      if copy.hasRetry {
        if tone == .pane {
          PaneRetry(look: look, action: retry)
            .padding(.top, 4)
        } else {
          CoverRetry(action: retry)
        }
        // The reason, at once, under "Can't reach…" (`computer-stream-notice.ts`); the dark view's red on its dark (decision 10).
        Text(ComputerStreamLog.shared.notice(ComputerStreamReason.statusUnreadable))
          .font(.system(size: 12))
          .lineSpacing(16.2 - 14.3)
          .foregroundStyle(tone == .cover ? Color(hex: 0xff8a80) : look.screenNotice)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 432)
          .padding(.top, tone == .pane ? 10 : 6)
          .allowsHitTesting(false)
      }
    }
    .padding(tone == .pane ? 12 : 24)
  }
}

/** The pane's Retry (59 × 28 capsule, 13/16 500, the pane's second grey); it does not change under the pointer. */
private struct PaneRetry: View {
  let look: Look
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text("Retry")
        .font(.system(size: 13, weight: .medium))
        .cssLineHeight(16, size: 13, weight: .medium)
        .foregroundStyle(look.paneInk)
        .padding(.horizontal, 13)
        .frame(height: 28)
        .background(look.paneFill2, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}

/** The full view's Retry (24 high, 12/16, white on a faint wash, a half-point edge; brighter under the pointer). */
private struct CoverRetry: View {
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text("Retry")
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
        .foregroundStyle(Color(hex: 0xfcfcfc))
        .padding(.horizontal, 8)
        .frame(height: 24)
        .background(Color(red: 247 / 255, green: 234 / 255, blue: 234 / 255).opacity(hovering ? 0.102 : 0.051), in: Capsule())
        .overlay(Capsule().strokeBorder(Color(hex: 0xfcfcfc).opacity(0.102), lineWidth: 0.5))
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { hovering = inside } }
  }
}

/**
 * The bar under the words (`Y9n`): 6 high and round, the words' colour at
 * 10% under it. Moving, a 30% piece crosses it every 1.4 s (still with
 * Reduce Motion); with a percent the track makes room for "NN%" and fills
 * to it. 237 wide with its label.
 */
struct ComputerBar: View {
  let percent: Double?
  let color: Color
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    HStack(spacing: 8) {
      GeometryReader { box in
        let width = box.size.width
        ZStack(alignment: .leading) {
          Capsule().fill(color.opacity(0.1))
          if let percent {
            Capsule().fill(color).frame(width: width * min(max(percent, 0), 100) / 100)
          } else {
            TimelineView(.animation(paused: reduceMotion)) { context in
              let piece = width * 0.3
              let t = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.4) / 1.4
              // ease-in-out, from 100% left of the track to 340% of the piece.
              let eased = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
              Capsule().fill(color)
                .frame(width: piece)
                .offset(x: reduceMotion ? 0 : -piece + eased * piece * 4.4)
            }
          }
        }
        .clipShape(Capsule())
      }
      .frame(height: 6)
      if let percent {
        Text("\(Int(percent.rounded()))%")
          .font(.system(size: 13))
          .cssLineHeight(18, size: 13)
          .foregroundStyle(color)
          .fixedSize()
      }
    }
    .frame(width: 237)
    .accessibilityElement()
    .accessibilityLabel(percent.map { "\(Int($0.rounded()))%" } ?? "Loading")
  }
}

/** The window's spinner: a ring (2 points) at 30% with its top quarter at 60%, turning every 0.7 s. */
struct ScreenSpinner: View {
  let color: Color
  let size: CGFloat
  var period: Double = 0.7
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    TimelineView(.animation(paused: reduceMotion)) { context in
      let turn = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
      ZStack {
        Circle().inset(by: 1).trim(from: 0.25, to: 1).stroke(color.opacity(0.3), lineWidth: 2)
        Circle().inset(by: 1).trim(from: 0, to: 0.25).stroke(color.opacity(0.6), lineWidth: 2)
      }
      // The quarter at the top (from 10:30 to 1:30), then turning.
      .rotationEffect(.degrees(-135 + turn * 360))
    }
    .frame(width: size, height: size)
    .accessibilityLabel("Loading")
  }
}

// MARK: - The agent's pointer

/** The agent's own pointer on its screen (`Abn`): where it last moved or clicked, gliding there, pressing on a click. */
struct AgentPointerOverlay: View {
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
        .scaleEffect(0.85 * scale * (pressed ? 0.75 : 1), anchor: .topLeading)
        .shadow(color: .black.opacity(0.35), radius: 1.2, y: 1)
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
      // A click presses once the pointer has had half a second to get there (`Ebn`), 0.28 s down and back.
      let delay = AgentPointer.pressDelay(sinceMove: sinceMove ?? 0)
      Task {
        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        withAnimation(.easeOut(duration: 0.13)) { pressed = true }
        try? await Task.sleep(nanoseconds: 150_000_000)
        withAnimation(.easeOut(duration: 0.15)) { pressed = false }
      }
    }
  }
}
