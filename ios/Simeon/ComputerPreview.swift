import SwiftUI
import SimeonCore

#if os(iOS)
/**
 * The agent's computer on its page and in its full view, as the Mac draws
 * them (mac/Simeon/ComputerPreview.swift, ComputerView.swift): the screen
 * read from the computer's status and watched while it shows, the agent's
 * own pointer over it, the words for a screen not there yet with Retry under
 * "Can't reach…", "Needs your attention" while the agent waits on the
 * person, and the helpers' screens. The rules and words are the shared
 * core's (CloudComputer.swift, StoreComputer.swift).
 */

// MARK: - The stream's reasons

/**
 * Why a screen is stuck, from the lines its page reports (the Mac's
 * `ComputerStreamLog`, kept in memory here, the lines going to the
 * console): the last reason given, cleared once one connects
 * (`computerStreamReason`).
 */
@MainActor
@Observable
final class ScreenNotices {
  static let shared = ScreenNotices()

  /** The last reason a screen gave for not connecting; cleared once one connects. */
  private(set) var reason: String?

  func write(_ line: String) {
    Trace.log("[simeon] computer-stream \(line)")
    switch ComputerStreamReason.change(for: line) {
    case .keep: break
    case .clear: reason = nil
    case .set(let next): reason = next
    }
  }

  /** The words of a notice: what is wrong and the last reason (`noticeText`; the phone has no log file to name). */
  func notice(_ lead: String) -> String { ComputerStreamReason.notice(lead: lead, reason: reason, filePath: nil) }
}

// MARK: - A screen

/**
 * A screen of an agent's computer, watched only, connected through Simeon
 * Labs' proxy once its address is known (the Mac's `ComputerScreenView`):
 * asked for again when the stream comes back, as a rebuilt computer has a
 * new network token. Every line it reports goes to `ScreenNotices`.
 */
struct ComputerScreenView: View {
  let vncUrl: String
  @Binding var phase: String
  let events: ScreenEvents
  @Environment(AppStore.self) private var store
  @State private var socket: URL?

  var body: some View {
    Group {
      if let socket {
        // A new address is a new page: the old one would never say it connected again.
        LiveScreen(socket: socket, viewOnly: true, phase: $phase, events: events)
          .id(socket)
      } else {
        Color.clear
      }
    }
    .task(id: SocketKey(vncUrl: vncUrl, live: store.isLive)) {
      events.onLog = { line in ScreenNotices.shared.write(line) }
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
 * The agent page's Computer tab (the Mac's `ComputerPreview`, `_bn`):
 * "Needs your attention" while the agent waits on the person; the frame
 * (16:10, 16 round, the cards' grey and a hairline) with the screen watched
 * only and the agent's own pointer over it; the words for a screen not there
 * yet (a bar while it boots or downloads, Retry under "Can't reach…" with the
 * last reason), a spinner while it connects (its notice after 20 seconds),
 * "Screen preview unavailable" after too many crashes, or the display's
 * glyph; "{name}'s screen" under it. A tap anywhere on the frame opens the
 * full view (`ComputerSheet`), which starts the computer; the tab itself only
 * reads it, and draws nothing while the full view shows it (one connection
 * at a time).
 */
struct ComputerTabPreview: View {
  let agent: Agent
  @Environment(AppStore.self) private var store
  @State private var phase = "starting"
  @State private var connected = false
  @State private var spinningSince: Date?
  @State private var stuck = false
  @State private var open = false
  @State private var watching = false
  @State private var events = ScreenEvents()

  var body: some View {
    let id = agent.id
    let status = store.computer.status(id)
    let read = store.computer.readState(id)
    let helpers = store.computerHelpers(id)
    let first = helpers.first
    let url = open ? nil : status?.screenURL
    let name = agent.name.isEmpty ? String(localized: "This agent") : agent.name
    VStack(spacing: 10) {
      if let handoff = status?.handoff {
        ComputerAttention(agentId: id, name: name, instruction: handoff.instruction)
      }
      ZStack {
        if let url {
          ComputerScreenView(vncUrl: url, phase: $phase, events: events)
            .opacity(connected && phase != "unavailable" ? 1 : 0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
          AgentPointerOverlay(pointer: store.pointers[first?.subagentId ?? id])
        }
        // The whole frame opens the computer; only Retry, drawn over it, takes its own tap.
        Button { open = true } label: {
          Color.clear.contentShape(.rect)
        }
        .buttonStyle(.tactile)
        .accessibilityLabel(first?.title ?? String(localized: "Open computer"))
        if !open {
          if url != nil {
            if phase == "unavailable" {
              Text(ScreenCrashes.unavailable)
                .font(.system(size: 13))
                .foregroundStyle(Ink.tertiary)
                .allowsHitTesting(false)
            } else if !connected {
              ProgressView()
                .tint(Ink.secondary)
                .allowsHitTesting(false)
            }
          } else if let copy = ComputerPlaceholder.preview(name: name, read: read, phase: store.computer.phase(id), pullPercent: status?.pullPercent) {
            ComputerPlaceholderView(copy: copy) { store.retryComputer(id) }
          } else {
            Image(systemName: "display")
              .font(.system(size: 17))
              .foregroundStyle(Ink.tertiary)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
          }
          // A spinner up 20 seconds: why, at the frame's foot.
          if stuck && url != nil && !connected && phase != "unavailable" {
            VStack {
              Spacer(minLength: 0)
              Text(ScreenNotices.shared.notice(ComputerStreamReason.notConnecting))
                .font(.system(size: 12))
                .foregroundStyle(Ink.danger)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(Ink.ground.opacity(0.92), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .padding(8)
            }
            .allowsHitTesting(false)
          }
        }
      }
      .frame(maxWidth: .infinity)
      .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
      .background(Ink.bubbleTheirs)
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Ink.hairline, lineWidth: 1))
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Computer preview")
      Text("\(name)'s screen")
        .font(.system(size: 13))
        .foregroundStyle(Ink.secondary)
        .lineLimit(1)
        .frame(maxWidth: .infinity)
    }
    // Read and kept fresh while the tab shows (the window watches the open agent's computer; the phone's page may show another).
    .onAppear {
      guard !watching else { return }
      watching = true
      store.watchComputer(id)
    }
    .onDisappear {
      guard watching else { return }
      watching = false
      store.unwatchComputer(id)
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
    .sheet(isPresented: $open) { ComputerSheet(agentId: id).problemAlert() }
  }
}

/**
 * "Needs your attention" over the frame (`V1t`, the Mac's
 * `ComputerAttention`): the title in orange, the instruction or "{name}
 * needs you", then Skip this step and I'm done, continue at the right. Both
 * answer the agent; neither opens or closes anything.
 */
private struct ComputerAttention: View {
  let agentId: String
  let name: String
  let instruction: String
  @Environment(AppStore.self) private var store

  var body: some View {
    let blank = instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    VStack(alignment: .leading, spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text("Needs your attention")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Ink.attentionInk)
        Text(blank ? String(localized: "\(name) needs you") : instruction)
          .font(.system(size: 14))
          .foregroundStyle(Ink.primary)
          .fixedSize(horizontal: false, vertical: true)
      }
      HStack(spacing: 8) {
        Spacer(minLength: 0)
        Button("Skip this step") { answer(skip: true) }
          .buttonStyle(Tactile(look: AttentionButtonStyle(primary: false)))
        Button("I'm done, continue") { answer(skip: false) }
          .buttonStyle(Tactile(look: AttentionButtonStyle(primary: true)))
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.attentionWash, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Needs your attention")
  }

  private func answer(skip: Bool) {
    Haptics.tap()
    Task { await store.handBackComputer(agentId, skip: skip) }
  }
}

/** The attention's buttons: 32 high, a capsule; the primary in the ink with the ground's words, the other on the quiet pill. */
private struct AttentionButtonStyle: ButtonStyle {
  let primary: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(primary ? Ink.ground : Ink.primary)
      .padding(.horizontal, 12)
      .frame(height: 32)
      .background(primary ? Ink.primary : Ink.pillButton, in: Capsule())
      .contentShape(.capsule)
      .opacity(configuration.isPressed ? 0.75 : 1)
  }
}

// MARK: - Words over a screen not there yet

/**
 * The words over a screen not there yet (`U1t`, the Mac's
 * `ComputerPlaceholderView` in the pane's tone): what is happening, a bar
 * (how far, or moving), and Retry under "Can't reach…" with the reason the
 * stream last gave, in red. Only Retry takes the touch: a tap elsewhere goes
 * to the frame under it, which opens the computer.
 */
struct ComputerPlaceholderView: View {
  let copy: ComputerPlaceholder
  let retry: () -> Void

  var body: some View {
    VStack(spacing: 8) {
      Text(copy.message)
        .font(.system(size: 14))
        .foregroundStyle(Ink.secondary)
        .multilineTextAlignment(.center)
        .allowsHitTesting(false)
      if copy.isBusy {
        ComputerBar(percent: copy.percent, color: Ink.secondary)
          .allowsHitTesting(false)
      }
      if copy.hasRetry {
        Button {
          Haptics.tap()
          retry()
        } label: {
          Text("Retry")
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(Ink.primary)
            .padding(.horizontal, 16)
            .frame(height: 32)
            .background(Ink.pillButton, in: Capsule())
            .contentShape(.capsule)
        }
        .buttonStyle(.tactile)
        .padding(.top, 4)
        // The reason, at once, under "Can't reach…" (`computer-stream-notice.ts`).
        Text(ScreenNotices.shared.notice(ComputerStreamReason.statusUnreadable))
          .font(.system(size: 12))
          .foregroundStyle(Ink.danger)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 4)
          .allowsHitTesting(false)
      }
    }
    .padding(12)
  }
}

/**
 * The bar under the words (`Y9n`, the Mac's `ComputerBar`): 6 high and
 * round, the words' colour at 10% under it. Moving, a 30% piece crosses it
 * every 1.4 s (still with Reduce Motion); with a percent the track makes room
 * for "NN%" and fills to it.
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
          .monospacedDigit()
          .foregroundStyle(color)
          .fixedSize()
      }
    }
    .frame(width: 200)
    .accessibilityElement()
    .accessibilityLabel(percent.map { "\(Int($0.rounded()))%" } ?? String(localized: "Loading"))
  }
}

// MARK: - The agent's pointer

/** The agent's own pointer on its screen (`Abn`, the Mac's `AgentPointerOverlay`): where it last moved or clicked, gliding there, pressing on a click. */
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

// MARK: - The helpers' screens

/**
 * The helpers' screens under the full view's screen (`fbn`, the Mac's
 * `HelperStrip`): the others, all of them up to four, else three and "and N
 * more" with a menu of the rest; a tap switches to one. Each is a tile with
 * its name, not a live picture: every helper is drawn with the agent's own
 * screen (`CTn`), already live above, and a phone opening one more stream
 * of it per tile would only spend its data. On the full view's dark.
 */
struct HelperStrip: View {
  /** The helpers not on the screen now, in the host's order. */
  let helpers: [ComputerHelper]
  let pick: (String) -> Void

  var body: some View {
    let strip = ComputerHelper.strip(helpers.count)
    HStack(alignment: .top, spacing: 8) {
      ForEach(helpers.prefix(strip.shown)) { helper in
        Button {
          Haptics.select()
          pick(helper.subagentId)
        } label: {
          tile(helper.title)
        }
        .buttonStyle(.tactile)
        .accessibilityLabel("Switch to \(helper.title)")
      }
      if let more = strip.more {
        Menu {
          ForEach(Array(helpers.dropFirst(strip.shown))) { helper in
            Button(helper.title) { pick(helper.subagentId) }
          }
        } label: {
          tile(String(localized: "and \(more) more"))
        }
        .accessibilityLabel("Show \(more) more screens")
      }
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .contain)
  }

  private func tile(_ title: String) -> some View {
    VStack(spacing: 6) {
      Image(systemName: "display")
        .font(.system(size: 17))
        .foregroundStyle(.white.opacity(0.4))
        .frame(width: 80, height: 50)
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
      Text(title)
        .font(.system(size: 12))
        .foregroundStyle(.white.opacity(0.6))
        .lineLimit(1)
        .truncationMode(.tail)
    }
    .frame(width: 80)
    .contentShape(.rect)
  }
}
#endif
