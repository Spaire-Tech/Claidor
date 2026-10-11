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
 * `_0n`; "Channels" in its ⌘K and "/"), as a grouped page on the phone: the
 * line saying what it is for, then Discord and Slack, a section each with
 * its logo, name, line and chip, and its actions as rows: Connect (the
 * token's secure field opens under it, with Store securely and Cancel),
 * Reconnect and Disconnect when it went wrong, Refresh and Disconnect
 * while connected or connecting (the Mac's "…" menu), How to connect.
 */
struct ChannelsPage: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.scenePhase) private var scenePhase
  @State private var model = ChannelsModel()

  var body: some View {
    Form {
      Section {
        Text(ChannelsView.intro)
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .listRowBackground(Color.clear)
          .listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4))
      }
      if let view = model.view {
        if view.manifests.isEmpty {
          Section {
            Text(ChannelsView.none).foregroundStyle(Ink.tertiary)
          }
          .listRowBackground(Ink.groupedRow)
        } else {
          ForEach(view.manifests, id: \.platform) { manifest in
            ChannelSection(agentId: agentId, manifest: manifest, view: view, model: model)
          }
        }
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
 * A platform (`B0n`) as a section: its logo on a 40 tile (round 11), its
 * name over its line (at most two lines), its chip ("Connected", "Needs
 * attention", "Connecting", "Soon"); then its actions. A coming-soon
 * platform is faded and offers only How to connect.
 */
private struct ChannelSection: View {
  let agentId: String
  let manifest: ChannelsView.Manifest
  let view: ChannelsView
  let model: ChannelsModel
  @Environment(AppStore.self) private var store
  @State private var formOpen = false
  @State private var token = ""
  @State private var guide = false
  @FocusState private var fieldFocused: Bool

  var body: some View {
    let state = view.state(manifest)
    let busy = model.isBusy(manifest.platform)
    let showsForm = formOpen && state != .comingSoon
    Section {
      head(state)
      switch state {
      case .available:
        Button("Connect") { toggleForm() }
          .disabled(busy)
      case .error:
        Button("Reconnect") { toggleForm() }
          .disabled(busy)
        disconnectButton(busy: busy)
      case .connected, .connecting:
        Button("Refresh") {
          Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.refreshChannel(agentId, platform: manifest.platform) } }
        }
        .disabled(busy)
        disconnectButton(busy: busy)
      case .comingSoon:
        EmptyView()
      }
      if showsForm {
        SecureField(ChannelsView.placeholder(manifest), text: $token)
          .font(.system(size: 15))
          .typedAsIs()
          .autocorrectionDisabled()
          .submitLabel(.done)
          .focused($fieldFocused)
          .onAppear { fieldFocused = true }
          .onSubmit { storeToken() }
        Button("Store securely") { storeToken() }
          .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
        Button("Cancel") {
          token = ""
          formOpen = false
        }
        .foregroundStyle(Ink.primary)
      }
      Button { guide = true } label: {
        Label("How to connect", systemImage: "questionmark.circle")
      }
      .foregroundStyle(Ink.primary)
      .alert(ChannelsView.guide(manifest).title, isPresented: $guide) {
        Button("Got it", role: .cancel) {}
      } message: {
        Text("\(ChannelsView.guide(manifest).description)\n\nComing soon\n\(ChannelsView.guide(manifest).blurb)")
      }
    } footer: {
      if showsForm {
        Label(ChannelsView.storedSecurely, systemImage: "checkmark.shield")
          .font(.system(size: 13))
          .foregroundStyle(Ink.tertiary)
      }
    }
    .listRowBackground(Ink.groupedRow)
  }

  /** The logo, the name and its line, the chip. */
  private func head(_ state: ChannelsView.RowState) -> some View {
    HStack(alignment: .center, spacing: 14) {
      Image("Connectors/\(manifest.platform)")
        .resizable()
        .interpolation(.high)
        .aspectRatio(contentMode: .fit)
        .frame(width: 22, height: 22)
        .frame(width: 40, height: 40)
        .background(Ink.tile, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Ink.tileEdge, lineWidth: 1))
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(manifest.displayName)
          .font(.system(size: 17, weight: .medium))
          .foregroundStyle(Ink.primary)
        Text(view.subtitle(manifest))
          .font(.system(size: 13))
          .foregroundStyle(Ink.secondary)
          .lineLimit(2)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let chip = ChannelsView.chip(state) {
        ChannelChip(text: chip, state: state)
      }
    }
    .padding(.vertical, 4)
    .opacity(state == .comingSoon ? 0.6 : 1)
    .accessibilityElement(children: .combine)
  }

  /** Disconnect, in the danger red (the Mac's red plug). */
  private func disconnectButton(busy: Bool) -> some View {
    Button("Disconnect", role: .destructive) {
      Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.disconnectChannel(agentId, platform: manifest.platform) } }
    }
    .foregroundStyle(Ink.danger)
    .disabled(busy)
  }

  /** Connect toggles the field (it takes the keys as it appears). */
  private func toggleForm() {
    formOpen.toggle()
    if !formOpen { token = "" }
  }

  /** The value goes once, the field emptied and shut; the section changes with the computer's answer. */
  private func storeToken() {
    let value = token
    guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !model.isBusy(manifest.platform) else { return }
    token = ""
    formOpen = false
    Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.connectChannel(agentId, platform: manifest.platform, token: value) } }
  }
}

/** The chip (`O0n`): 26 high, round, a 6-point dot of its colour; "Soon" has none. */
private struct ChannelChip: View {
  let text: String
  let state: ChannelsView.RowState

  var body: some View {
    let tint: Color?
    switch state {
    case .connected: tint = Ink.addedGreen
    case .error: tint = Ink.danger
    default: tint = nil
    }
    return HStack(spacing: 5) {
      if state != .comingSoon {
        Circle().fill(tint ?? Ink.secondary).frame(width: 6, height: 6)
      }
      Text(text)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(tint ?? Ink.secondary)
    }
    .padding(.horizontal, 9)
    .frame(height: 26)
    .background(Capsule().fill((tint ?? Ink.primary).opacity(tint == nil ? 0.06 : 0.16)))
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
