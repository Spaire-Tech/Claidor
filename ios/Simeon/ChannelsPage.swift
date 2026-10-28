import SwiftUI
import SimeonCore

/**
 * An agent's channels as its computer last answered (the Mac's
 * `ChannelsModel`, mac/Simeon/ChannelsPage.swift; the window's channels
 * store, `I$n`): read when the page shows, every 4 s while it is open and
 * when the app comes forward, 15 s at most, a failed read keeping the last
 * answer; Connect, Disconnect and Refresh put the answer in place, then
 * read again.
 */
@MainActor
@Observable
final class ChannelsModel {
  private(set) var view: ChannelsView?
  /** Calls under way per platform: its section's buttons wait while any is. */
  private(set) var busy: [String: Int] = [:]
  /** The first read has answered or given up: until then the page says it is reading. */
  private(set) var firstReadDone = false
  /** Each read and call numbered as it starts: an answer older than the one shown is dropped (the 4 s reads, the app coming forward and a call's own answer overlap). */
  @ObservationIgnored private var issued = 0
  @ObservationIgnored private var shown = 0

  func load(_ agentId: String, store: AppStore) async {
    issued += 1
    let number = issued
    apply(await store.channels(agentId), number)
    firstReadDone = true
  }

  private func apply(_ next: ChannelsView?, _ number: Int) {
    guard let next, number > shown else { return }
    shown = number
    view = next
  }

  func isBusy(_ platform: String) -> Bool { (busy[platform] ?? 0) > 0 }

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
      while !Task.isCancelled {
        await model.load(agentId, store: store)
        try? await Task.sleep(nanoseconds: 4_000_000_000)
      }
    }
    // Back in front: read at once (the Mac's window coming forward).
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { Task { await model.load(agentId, store: store) } }
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
  @State private var formOpen = false
  @State private var token = ""
  @FocusState private var fieldFocused: Bool

  var body: some View {
    let state = view.state(manifest)
    let busy = model.isBusy(manifest.platform)
    HStack(spacing: 14) {
      ConnectorTile(name: manifest.displayName, size: 40, logo: ConnectorLogo.fill, id: manifest.platform)
      VStack(alignment: .leading, spacing: 2) {
        Text(manifest.displayName)
          .font(.system(size: 17))
          .foregroundStyle(Ink.primary)
        Text(view.subtitle(manifest))
          .font(.system(size: 15))
          .foregroundStyle(isError(state) ? Ink.danger : Ink.secondary)
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
          Button { openForm() } label: { ConnectorMark.plus() }
            .buttonStyle(.borderless)
            .accessibilityLabel("Connect \(manifest.displayName)")
        }
      case .connected:
        ConnectorMark.added()
      case .connecting:
        ConnectorMark.busy()
      case .error:
        Button("Reconnect") { openForm() }
          .font(.system(size: 15, weight: .medium))
          .buttonStyle(.borderless)
          .disabled(busy)
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

  /** + and Reconnect open the field (it takes the keys as it appears). */
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
 * "Channels" on the agent's page, shown only while its computer offers a
 * platform or holds a connection (the Mac offers "Channels" in its ⌘K and
 * "/" on the same answer, `mmt`): the Notifications row's look, the
 * platforms it offers under the word; a tap opens the page. Inside the
 * page's navigation stack (AgentPageSheet's).
 */
struct ChannelsLink: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @State private var view: ChannelsView?

  var body: some View {
    VStack(spacing: 0) {
      if let view, view.hasChannels {
        NavigationLink { ChannelsPage(agentId: agentId) } label: { row(view) }
          .buttonStyle(.plain)
          .padding(.top, 22)
      } else {
        // Something to hang the read on while the row is not drawn.
        Color.clear.frame(height: 0)
      }
    }
    .task(id: agentId) { view = await store.channels(agentId) }
  }

  private func row(_ view: ChannelsView) -> some View {
    let offered = view.manifests.filter { $0.availability == "available" || view.connection($0) != nil }.map(\.displayName)
    return HStack(spacing: 14) {
      Image(systemName: "bubble.left.and.bubble.right").font(.system(size: 16)).foregroundStyle(Ink.primary)
        .frame(width: 40, height: 40)
        .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text("Channels").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
        if !offered.isEmpty {
          Text(offered.joined(separator: ", ")).font(.system(size: 13)).foregroundStyle(Ink.secondary)
        }
      }
      Spacer(minLength: 8)
      Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Ink.tertiary)
    }
    .contentShape(.rect)
  }
}
