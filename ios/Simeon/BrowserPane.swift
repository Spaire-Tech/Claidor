import SwiftUI
#if os(iOS)
import UIKit
import SimeonCore

/**
 * The agent's browser on the phone (15 October 2026), laid out as Muse lays
 * out its own: the page the agent works in, alone, at the phone's size
 * while the person is in control (`host/box/tab-view.ts` streams the tab and
 * lays it out at this view's size), its address at the top, and one big
 * blue Take control at the foot. The founder, after an Apple sign-in on
 * the whole computer: "that hand icon should be the main thing, not an
 * option. it made no sense."
 *
 * - Watching the agent work: Take control (blue, the main button) and Stop
 *   task. Taking control while it works stops it, and the checkmark hands
 *   the computer back and resumes it.
 * - The agent asked for the person (a sign-in, a code): the view opens
 *   already in control; the checkmark hands it back, Skip step declines.
 * - In control a tap is a click, a drag scrolls, and the keyboard comes up
 *   by itself when a field takes it.
 * - No browser tab (a desktop app, the demo): the whole computer instead,
 *   which the screen button at the top left also shows.
 */
struct BrowserPane: View {
  let agentId: String
  /** The agent asked for the person: the view opens in control. */
  let opensInControl: Bool
  /** The whole computer instead; true when the person is in control, so it opens theirs too. */
  let showComputer: (Bool) -> Void

  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var control: Bool
  @State private var picture: UIImage?
  /** The page's own size in CSS pixels, from the last picture: touches are mapped with it. */
  @State private var pageSize: CGSize = .zero
  /** The picture's area on the phone, in points. */
  @State private var viewSize: CGSize = .zero
  /** The size the tab was asked for (the area's first size; a new width asks again). */
  @State private var streamSize: CGSize?
  @State private var address = ""
  @State private var problem: String?
  @State private var attempt = 0
  @State private var reconnects = 0
  @State private var inputs: TabInputQueue?
  @State private var typing = false
  @State private var note: String?
  @State private var dragged: CGSize?
  @State private var working = false

  init(agentId: String, opensInControl: Bool, showComputer: @escaping (Bool) -> Void) {
    self.agentId = agentId
    self.opensInControl = opensInControl
    self.showComputer = showComputer
    _control = State(initialValue: opensInControl)
  }

  var body: some View {
    VStack(spacing: 0) {
      header
      page
        .padding(.top, 8)
      footer
        .padding(.top, 12)
        .padding(.bottom, 10)
    }
    .background(Color.black)
    // The page keeps its size when the keyboard comes up: a new size would lay the page out again under the person's fingers.
    .ignoresSafeArea(.keyboard)
    .background { KeyCatcher(isActive: $typing, type: { typed($0) }, delete: { push(.key("Backspace")) }).frame(width: 0, height: 0) }
    .task(id: StreamKey(attempt: attempt, size: streamSize)) { await stream() }
    .onAppear { if inputs == nil { inputs = store.tabInputs(agentId) } }
    // The agent asks for the person while they watch: the page is theirs at once.
    .onChange(of: waitingOnPerson) { _, waiting in
      guard waiting, !control else { return }
      control = true
      push(.control(true))
    }
  }

  // MARK: The top: what is happening, the page's address, and the way out

  private var header: some View {
    let name = store.agent(agentId)?.name ?? "The agent"
    return ZStack {
      VStack(spacing: 2) {
        Text(control ? "You're in control" : "\(name)'s browser")
          .font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
        HStack(spacing: 4) {
          if address.hasPrefix("https://") { Image(systemName: "lock.fill").font(.system(size: 11, weight: .semibold)) }
          Text(note ?? (host.isEmpty ? "Opening the page…" : host)).font(.system(size: 15))
        }
        .foregroundStyle(.white.opacity(0.55))
        .contentTransition(.opacity)
        .animation(.easeOut(duration: 0.2), value: note)
      }
      .lineLimit(1)
      .padding(.horizontal, 64)
      HStack {
        Button { showComputer(control) } label: {
          Image(systemName: "desktopcomputer").font(.system(size: 17, weight: .medium)).foregroundStyle(.white)
            .frame(width: 48, height: 48)
        }
        .buttonStyle(GlassDisc())
        .accessibilityLabel("Show the whole computer")
        Spacer(minLength: 0)
        if control {
          Button { handBack() } label: {
            Image(systemName: "checkmark").font(.system(size: 19, weight: .semibold)).foregroundStyle(.white)
              .frame(width: 48, height: 48)
          }
          .buttonStyle(GlassDisc())
          .accessibilityLabel("I'm done, hand it back")
        } else {
          Button { dismiss() } label: {
            Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
              .frame(width: 48, height: 48)
          }
          .buttonStyle(GlassDisc())
          .accessibilityLabel("Close")
        }
      }
    }
    .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 12)
    .background(Color(white: 0.11))
  }

  private var host: String { URL(string: address)?.host?.replacingOccurrences(of: "www.", with: "") ?? "" }

  // MARK: The page

  private var page: some View {
    GeometryReader { geometry in
      ZStack {
        Color.black
        if let picture {
          Image(uiImage: picture)
            .resizable()
            .interpolation(.medium)
            .aspectRatio(contentMode: .fit)
        }
        if let problem {
          VStack(spacing: 12) {
            Text(problem).font(.system(size: 15)).foregroundStyle(.white.opacity(0.85)).multilineTextAlignment(.center)
            HStack(spacing: 10) {
              Button("Try again") { self.problem = nil; reconnects = 0; attempt += 1 }.buttonStyle(PillButtonStyle(primary: false)).fixedSize()
              Button("Whole computer") { showComputer(control) }.buttonStyle(PillButtonStyle(primary: false)).fixedSize()
            }
          }
          .padding(24)
          .background(Color.black.opacity(picture == nil ? 0 : 0.7), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        } else if picture == nil {
          VStack(spacing: 10) {
            ProgressView().tint(.white)
            Text("Opening the page…").font(.system(size: 14)).foregroundStyle(.white.opacity(0.75))
          }
        }
      }
      .contentShape(.rect)
      // Watching, the page takes no touch: a swipe down closes the sheet.
      .gesture(touches, including: control ? .all : .subviews)
      .onAppear { measured(geometry.size) }
      .onChange(of: geometry.size) { _, size in measured(size) }
    }
  }

  /** The area's size; the tab is asked for again only when the width changes (the phone turned), never for the keyboard. */
  private func measured(_ size: CGSize) {
    viewSize = size
    guard size.width > 0, size.height > 0 else { return }
    if let streamSize, abs(streamSize.width - size.width) < 1 { return }
    streamSize = size
  }

  /** In control, a touch that does not move is a click, and one that moves scrolls the page. */
  private var touches: some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { value in
        guard control, pageSize.width > 0 else { return }
        let moved = hypot(value.translation.width, value.translation.height)
        if dragged == nil && moved < 8 { return }
        let before = dragged ?? .zero
        let step = CGSize(width: value.translation.width - before.width, height: value.translation.height - before.height)
        dragged = value.translation
        let delta = TabViewGeometry.scrollDelta(step, view: viewSize, page: pageSize)
        guard let at = TabViewGeometry.pagePoint(value.location, view: viewSize, page: pageSize) else { return }
        push(.scroll(x: at.x, y: at.y, dx: delta.width, dy: delta.height))
      }
      .onEnded { value in
        let wasScroll = dragged != nil
        dragged = nil
        guard control, !wasScroll, pageSize.width > 0,
              let at = TabViewGeometry.pagePoint(value.location, view: viewSize, page: pageSize) else { return }
        tap(at)
      }
  }

  // MARK: The foot: Take control and Stop task, or the person's own tools

  @ViewBuilder
  private var footer: some View {
    if control {
      HStack(spacing: 12) {
        if waitingOnPerson {
          Button { skip() } label: {
            Text("Skip step").font(.system(size: 17, weight: .medium)).foregroundStyle(.white)
              .padding(.horizontal, 26).frame(height: 54)
              .background(Color(white: 0.17), in: Capsule())
              .contentShape(Capsule())
          }
          .buttonStyle(.plain)
        }
        Spacer(minLength: 0)
        HStack(spacing: 0) {
          Button { pasteFromPhone() } label: {
            Image(systemName: "doc.on.clipboard").font(.system(size: 19, weight: .medium)).foregroundStyle(.white)
              .frame(width: 58, height: 54).contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Paste from Phone")
          Button { typing.toggle() } label: {
            Image(systemName: typing ? "keyboard.chevron.compact.down" : "keyboard").font(.system(size: 19, weight: .medium)).foregroundStyle(.white)
              .frame(width: 58, height: 54).contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityLabel(typing ? "Hide keyboard" : "Keyboard")
        }
        .padding(.horizontal, 6)
        .background(Color(white: 0.17), in: Capsule())
      }
      .padding(.horizontal, 16)
    } else {
      HStack(spacing: 12) {
        if store.agent(agentId)?.isRunning == true {
          Button { stopTask() } label: {
            Text("Stop task").font(.system(size: 17, weight: .medium)).foregroundStyle(.white)
              .padding(.horizontal, 24).frame(height: 56)
              .background(Color(white: 0.17), in: Capsule())
              .contentShape(Capsule())
          }
          .buttonStyle(.plain)
          .disabled(working)
        }
        Button { takeControl() } label: {
          Label("Take control", systemImage: "hand.point.up.left.fill")
            .font(.system(size: 18, weight: .semibold)).foregroundStyle(.white)
            .frame(maxWidth: .infinity).frame(height: 56)
            .background(Self.blue, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(picture == nil)
        .opacity(picture == nil ? 0.5 : 1)
      }
      .padding(.horizontal, 16)
    }
  }

  /** iOS's own blue (systemBlue in the dark): the one thing to press. */
  static let blue = Color(red: 0.039, green: 0.518, blue: 1.0)

  /** The agent asked for the person and waits ("Your turn on the computer" not yet answered). */
  private var waitingOnPerson: Bool {
    store.rows(for: agentId).contains { row in
      if case .request(_, .computer(_, _, let resolution)) = row { return resolution == nil }
      return false
    }
  }

  // MARK: Doing

  private func push(_ input: TabInput) {
    guard let inputs else { return }
    Task { await inputs.push(input) }
  }

  private func typed(_ text: String) {
    if text == "\n" { push(.key("Enter")) } else { push(.text(text)) }
  }

  /** A click; the keyboard comes up when a field took it, and goes when nothing did. */
  private func tap(_ at: CGPoint) {
    guard let inputs else { return }
    Task {
      guard let focus = await inputs.tap(x: at.x, y: at.y) else { return }
      typing = !focus.isEmpty
    }
  }

  /** Take control: the page at the phone's size, now; a working agent is stopped meanwhile (its hand-off resumes it). */
  private func takeControl() {
    control = true
    push(.control(true))
    Task {
      let handedOver = await store.takeComputerControl(agentId)
      if handedOver { show("\(store.agent(agentId)?.name ?? "The agent") is paused while you're in control.") }
    }
  }

  private func handBack() {
    typing = false
    Task { await store.handBackComputer(agentId); dismiss() }
  }

  private func skip() {
    typing = false
    Task { await store.handBackComputer(agentId, skip: true); dismiss() }
  }

  private func stopTask() {
    working = true
    Task {
      let stopped = await store.stopAgentTask(agentId)
      working = false
      show(stopped ? "Stopped." : "Nothing was running.")
    }
  }

  private func pasteFromPhone() {
    guard let text = UIPasteboard.general.string, !text.isEmpty else { show("Your phone's clipboard is empty."); return }
    push(.text(text))
    show("Pasted from your phone.")
  }

  private func show(_ text: String) {
    note = text
    Task {
      try? await Task.sleep(nanoseconds: 2_500_000_000)
      if note == text { note = nil }
    }
  }

  // MARK: The stream

  private struct StreamKey: Equatable {
    let attempt: Int
    let size: CGSize?
  }

  private func stream() async {
    guard let size = streamSize else { return }
    var sawPicture = picture != nil
    for await event in store.tabView(agentId, width: Int(size.width.rounded()), height: Int(size.height.rounded()), control: control) {
      switch event {
      case .tab(let url, _):
        address = url
      case .frame(let jpeg, let width, let height):
        // Decoded off the main thread, so touches and the keyboard never wait on a picture.
        guard let image = await Self.decoded(jpeg), !Task.isCancelled else { continue }
        picture = image
        pageSize = CGSize(width: width, height: height)
        sawPicture = true
        reconnects = 0
        problem = nil
      case .closed(let reason):
        closed(reason, sawPicture: sawPicture)
      }
    }
  }

  private static func decoded(_ jpeg: Data) async -> UIImage? {
    await Task.detached(priority: .userInitiated) { UIImage(data: jpeg)?.preparingForDisplay() }.value
  }

  private func closed(_ reason: String, sawPicture: Bool) {
    switch reason {
    case "no-browser", "no-tab", "tab-unreachable", "unavailable":
      // No tab to show (a desktop app, the demo, an older computer): the whole computer.
      if sawPicture { problem = "The page isn't available any more." } else { showComputer(control) }
    case "replaced":
      problem = "This page opened on another device."
    case "tab-closed":
      problem = "The page was closed."
    default:
      // The connection dropped (the phone slept, the network changed): again, a few times.
      guard !Task.isCancelled else { return }
      if reconnects < 5 {
        reconnects += 1
        Task {
          try? await Task.sleep(nanoseconds: 1_000_000_000)
          attempt += 1
        }
      } else {
        problem = "Lost the connection to the computer."
      }
    }
  }
}
#endif
