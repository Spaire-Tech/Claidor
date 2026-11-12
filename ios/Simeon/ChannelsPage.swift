import SwiftUI
import SimeonCore

/**
 * An agent's channels as its computer last answered (the Mac's
 * `ChannelsModel`, mac/Simeon/ChannelsPage.swift; the window's channels
 * store, `I$n`): read when the page shows, every 4 s while it is open and
 * the app is active, and when the app comes forward (the window's own reads
 * only while it can be seen, `document.visibilityState`), 15 s at most, a
 * failed read keeping the last answer; those last two let a resting
 * computer rest. Connect, Disconnect and Refresh put the answer in place,
 * then read again.
 */
@MainActor
@Observable
final class ChannelsModel {
  private(set) var view: ChannelsView?
  /** Calls under way per platform: its section's buttons wait while any is. */
  private(set) var busy: [String: Int] = [:]
  /** What went wrong opening a platform's sign-in, shown in its row until the next try. */
  private(set) var problem: [String: String] = [:]
  /** The first read has answered or given up: until then the page says it is reading. */
  private(set) var firstReadDone = false
  /** Each read and call numbered as it starts: an answer older than the one shown is dropped (the 4 s reads, the app coming forward and a call's own answer overlap). */
  @ObservationIgnored private var issued = 0
  @ObservationIgnored private var shown = 0

  /** A read; with `wakes` false, one that lets a resting computer rest (`AppStore.channels`). */
  func load(_ agentId: String, store: AppStore, wakes: Bool = true) async {
    issued += 1
    let number = issued
    apply(await store.channels(agentId, wakes: wakes), number)
    firstReadDone = true
  }

  private func apply(_ next: ChannelsView?, _ number: Int) {
    guard let next, number > shown else { return }
    shown = number
    view = next
  }

  func isBusy(_ platform: String) -> Bool { (busy[platform] ?? 0) > 0 }

  /**
   * Connect through the browser (Slack through Simeon's own app, the Mac's
   * `connectInBrowser`): Slack's sign-in opens, and the row waits (its
   * spinner) while the computer is asked every 3 s whether it is connected,
   * five minutes at most.
   */
  func connectInBrowser(_ platform: String, agentId: String, store: AppStore, open: @escaping @MainActor (URL) -> Void) async {
    guard !isBusy(platform) else { return }
    problem[platform] = nil
    busy[platform, default: 0] += 1
    defer { busy[platform, default: 1] -= 1 }
    guard let url = await store.channelConnectLink(agentId, platform: platform) else {
      problem[platform] = ChannelsView.couldNotConnect
      return
    }
    open(url)
    let deadline = Date().addingTimeInterval(ChannelsView.connectWaitSeconds)
    while Date() < deadline, !Task.isCancelled {
      try? await Task.sleep(nanoseconds: UInt64(ChannelsView.connectPollSeconds * 1_000_000_000))
      issued += 1
      let number = issued
      apply(await store.refreshChannel(agentId, platform: platform), number)
      if let view, let manifest = view.manifests.first(where: { $0.platform == platform }), view.state(manifest) == .connected { return }
    }
  }

  /** A call for one platform, then a read; its section waits meanwhile. */
  func run(_ platform: String, agentId: String, store: AppStore, _ call: @escaping @MainActor () async -> ChannelsView?) async {
    busy[platform, default: 0] += 1
    issued += 1
    let number = issued
    apply(await call(), number)
    busy[platform, default: 1] -= 1
    await load(agentId, store: store)
  }
}

/**
 * An agent's Channels (the Mac's Channels page of the agent's pane, O01,
 * `_0n`; "Channels" in its ⌘K and "/"), in Settings' parts (the founder, 28
 * October 2026: "this isn't our Apple design… too many words"): one group, a
 * row per platform, as the Connectors list draws an app.
 */
struct ChannelsPage: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.scenePhase) private var scenePhase
  @State private var model = ChannelsModel()
  /** The app is active (`scenePhase`), kept where the 4 s loop reads it as it is now. */
  @State private var active = true

  var body: some View {
    Form {
      if let view = model.view {
        Section {
          if view.manifests.isEmpty {
            Text(ChannelsView.none).foregroundStyle(Ink.tertiary)
          } else {
            ForEach(view.manifests, id: \.platform) { manifest in
              ChannelRows(agentId: agentId, manifest: manifest, view: view, model: model)
            }
          }
        }
        .listRowBackground(Ink.groupedRow)
      } else if !model.firstReadDone {
        Section {
          ProgressView().frame(maxWidth: .infinity)
        }
        .listRowBackground(Color.clear)
      }
    }
    .groupedGround()
    .containerBackground(Ink.groupedGround, for: .navigation)
    .navigationTitle("Channels")
    .inlineBarTitle()
    .tint(Ink.blue)
    .task(id: agentId) {
      await model.load(agentId, store: store)
      // Every 4 s only while the app is active (the window's own: while `document.visibilityState` is "visible").
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 4_000_000_000)
        if !Task.isCancelled && active { await model.load(agentId, store: store, wakes: false) }
      }
    }
    // Back in front: read at once (the Mac's window coming forward), letting a resting computer rest.
    .onChange(of: scenePhase) { _, phase in
      active = phase == .active
      if phase == .active { Task { await model.load(agentId, store: store, wakes: false) } }
    }
  }
}

/**
 * A platform, as a Connectors row: its app icon, its name over a few words
 * in grey (red when it went wrong), and its mark: + to connect, the green
 * tick, the spinner while it connects, Coming soon said quietly, Reconnect
 * when it went wrong. A connection's "…" holds Refresh and Disconnect. +
 * opens the token's field as the next row, with Save; Cancel takes +'s place.
 */
private struct ChannelRows: View {
  let agentId: String
  let manifest: ChannelsView.Manifest
  let view: ChannelsView
  let model: ChannelsModel
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @State private var formOpen = false
  @State private var token = ""
  @FocusState private var fieldFocused: Bool

  var body: some View {
    let state = view.state(manifest)
    let problem = model.problem[manifest.platform]
    let busy = model.isBusy(manifest.platform)
    HStack(spacing: 14) {
      ConnectorTile(name: manifest.displayName, size: 40, logo: ConnectorLogo.fill, id: manifest.platform)
      VStack(alignment: .leading, spacing: 2) {
        Text(manifest.displayName)
          .font(.system(size: 17))
          .foregroundStyle(Ink.primary)
        Text(problem ?? view.subtitle(manifest))
          .font(.system(size: 15))
          .foregroundStyle(isError(state) || problem != nil ? Ink.danger : Ink.secondary)
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .opacity(state == .comingSoon ? 0.6 : 1)
      if hasMenu(state) {
        menu(state, busy: busy)
      }
      mark(state, busy: busy)
    }
    .padding(.vertical, 2)
    if formOpen && state != .comingSoon {
      HStack(spacing: 12) {
        SecureField(ChannelsView.placeholder(manifest), text: $token)
          .font(.system(size: 17))
          .typedAsIs()
          .autocorrectionDisabled()
          .submitLabel(.done)
          .focused($fieldFocused)
          .onAppear { fieldFocused = true }
          .onSubmit { storeToken() }
        Button("Save") { storeToken() }
          .font(.system(size: 17, weight: .medium))
          .buttonStyle(.borderless)
          .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
      }
    }
  }

  private func isError(_ state: ChannelsView.RowState) -> Bool {
    if case .error = state { return true }
    return false
  }

  private func hasMenu(_ state: ChannelsView.RowState) -> Bool {
    state == .connected || state == .connecting || isError(state)
  }

  /** The row's end: +, Cancel while the field is open, the tick, the spinner, Coming soon, or Reconnect. */
  @ViewBuilder
  private func mark(_ state: ChannelsView.RowState, busy: Bool) -> some View {
    if formOpen && (state == .available || isError(state)) {
      Button("Cancel") {
        token = ""
        formOpen = false
      }
      .font(.system(size: 15))
      .foregroundStyle(Ink.secondary)
      .buttonStyle(.borderless)
    } else {
      switch state {
      case .available:
        if busy {
          ConnectorMark.busy()
        } else {
          Button { connect() } label: { ConnectorMark.plus() }
            .buttonStyle(.borderless)
            .accessibilityLabel("Connect \(manifest.displayName)")
        }
      case .connected:
        ConnectorMark.added()
      case .connecting:
        ConnectorMark.busy()
      case .error:
        if busy && manifest.connectsInBrowser {
          ConnectorMark.busy()
        } else {
          Button("Reconnect") { connect() }
            .font(.system(size: 15, weight: .medium))
            .buttonStyle(.borderless)
            .disabled(busy)
        }
      case .comingSoon:
        ConnectorMark.soon()
      }
    }
  }

  /** "…": Refresh while connected or connecting, and Disconnect in red; they wait while a call runs. */
  private func menu(_ state: ChannelsView.RowState, busy: Bool) -> some View {
    Menu {
      if state == .connected || state == .connecting {
        Button("Refresh", systemImage: "arrow.clockwise") {
          Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.refreshChannel(agentId, platform: manifest.platform) } }
        }
      }
      Button("Disconnect", systemImage: "powerplug", role: .destructive) {
        Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.disconnectChannel(agentId, platform: manifest.platform) } }
      }
    } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 17))
        .foregroundStyle(Ink.secondary)
        .frame(width: 32, height: 44)
        .contentShape(.rect)
    }
    .buttonStyle(.borderless)
    .disabled(busy)
    .accessibilityLabel("Connection actions")
  }

  /** + and Reconnect: Slack's sign-in in Safari for a platform connected through Simeon's own app, else the token's field. */
  private func connect() {
    if manifest.connectsInBrowser {
      Task { await model.connectInBrowser(manifest.platform, agentId: agentId, store: store) { url in openURL(url) } }
    } else {
      openForm()
    }
  }

  /** The token's field opens (it takes the keys as it appears). */
  private func openForm() {
    token = ""
    formOpen = true
  }

  /** The value goes once, the field emptied and shut; the row changes with the computer's answer. */
  private func storeToken() {
    let value = token
    guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !model.isBusy(manifest.platform) else { return }
    token = ""
    formOpen = false
    Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.connectChannel(agentId, platform: manifest.platform, token: value) } }
  }
}

/**
 * Slack on the agent's page, under Notifications (12 November 2026, the
 * founder: "slack to be there below notifications", no Channels page on the
 * way; the Mac's `SlackProfileRow`), in Notifications' parts: Slack's 40
 * tile, "Slack" over the workspace once connected, else "Channels and DMs"
 * (red when the sign-in couldn't open), and at the right + (Slack's sign-in
 * in Safari), the spinner while it is waited for, or the green tick with
 * "…" (Disconnect). Read from Simeon Labs' server (`SlackRowModel`), so the
 * page never wakes the computer; drawn only while Slack can be connected,
 * or the agent talks there.
 */
struct SlackProfileRow: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase
  @State private var model = SlackRowModel()

  var body: some View {
    VStack(spacing: 0) {
      if model.shown, let state = model.state {
        HStack(spacing: 14) {
          ConnectorTile(name: "Slack", size: 40, logo: ConnectorLogo.fill, id: "slack")
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: "Slack").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
            Text(model.problem ?? state.subtitle).font(.system(size: 13)).foregroundStyle(model.problem == nil ? Ink.secondary : Ink.danger).lineLimit(2)
          }
          Spacer(minLength: 8)
          if model.busy {
            ConnectorMark.busy()
          } else if state.connected {
            Menu {
              Button("Disconnect", systemImage: "powerplug", role: .destructive) {
                Task { await model.disconnect(agentId, store: store) }
              }
            } label: {
              ConnectorMark.added()
                .contentShape(.rect)
            }
            .accessibilityLabel("Connection actions")
          } else {
            Button {
              Haptics.tap()
              Task { await model.connect(agentId, store: store) { url in openURL(url) } }
            } label: { ConnectorMark.plus() }
              .buttonStyle(.borderless)
              .accessibilityLabel("Connect \("Slack")")
          }
        }
        .padding(.top, 18)
      } else {
        // Something to hang the read on while the row is not drawn.
        Color.clear.frame(height: 0)
      }
    }
    .task(id: agentId) { await model.load(agentId, store: store) }
    // Back from Safari: read at once.
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await model.load(agentId, store: store) } }
    }
  }
}
