import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * Each agent's channels as the box last answered (the window's channels
 * store): read with a 15 s deadline, a failed read keeping the last answer;
 * Connect, Disconnect and Refresh put the box's new answer in place.
 */
@MainActor
@Observable
final class MacChannels {
  static let shared = MacChannels()
  private(set) var views: [String: ChannelsView] = [:]
  private(set) var busy: Set<String> = []

  func view(_ agentId: String) -> ChannelsView { views[agentId] ?? .empty }

  func load(_ agentId: String, store: AppStore) async {
    guard let backend = store.backend else { return }
    let answer = await withTaskGroup(of: JSON?.self) { group in
      group.addTask { try? await backend.command("getAgentChannels", ["id": .string(agentId)]) }
      group.addTask { try? await Task.sleep(nanoseconds: 15_000_000_000); return nil }
      let first = await group.next() ?? nil
      group.cancelAll()
      return first
    }
    if let view = ChannelsView(json: answer) { views[agentId] = view }
  }

  /** `connectChannel`, `disconnectChannel`, `refreshChannel`: the answer is the view again. */
  func run(_ command: String, agentId: String, platform: String, token: String? = nil, store: AppStore) async {
    guard let backend = store.backend else { return }
    let key = "\(command):\(agentId):\(platform)"
    busy.insert(key)
    defer { busy.remove(key) }
    var args: JSON = ["id": .string(agentId), "platform": .string(platform)]
    if let token { args = args.setting("token", .string(token)) }
    if let view = ChannelsView(json: try? await backend.command(command, args)) { views[agentId] = view }
  }

  func isBusy(_ command: String, agentId: String, platform: String) -> Bool { busy.contains("\(command):\(agentId):\(platform)") }
}

/**
 * The Channels view in the agent's pane (`_0n`), reached from "Channels" in
 * ⌘K and "/" (it has no tab): the line, then each platform with its logo,
 * name, line, chip and "…" menu (How to connect, Refresh, Disconnect),
 * Connect or Reconnect, and the token field. Read again every 4 s while it
 * is open and when the window comes forward.
 */
struct MacChannelsTab: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  private let channels = MacChannels.shared

  var body: some View {
    let view = channels.view(agentId)
    VStack(alignment: .leading, spacing: 16) {
      Text(ChannelsView.intro).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
      if view.manifests.isEmpty {
        Text(ChannelsView.none).font(.system(size: 13)).foregroundStyle(Ink.secondary)
      } else {
        ForEach(view.manifests, id: \.platform) { manifest in
          MacChannelRow(agentId: agentId, manifest: manifest, view: view)
        }
      }
    }
    .task(id: agentId) {
      while !Task.isCancelled {
        await channels.load(agentId, store: store)
        try? await Task.sleep(nanoseconds: 4_000_000_000)
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in Task { await channels.load(agentId, store: store) } }
  }
}

struct MacChannelRow: View {
  let agentId: String
  let manifest: ChannelsView.Manifest
  let view: ChannelsView
  @Environment(AppStore.self) private var store
  @State private var formOpen = false
  @State private var token = ""
  @State private var guide = false
  @State private var hovering = false
  private let channels = MacChannels.shared

  var body: some View {
    let state = view.state(manifest)
    let connectedOrConnecting = state == .connected || state == .connecting
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 12) {
        // The platform's logo on its tile, as Connect apps draws a connector's.
        ConnectorTile(name: manifest.displayName, size: 40)
        VStack(alignment: .leading, spacing: 2) {
          Text(manifest.displayName).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.primary)
          Text(view.subtitle(manifest)).font(.system(size: 13)).foregroundStyle(Ink.secondary).lineLimit(2)
        }
        Spacer(minLength: 8)
        ZStack(alignment: .trailing) {
          if let chip = ChannelsView.chip(state) {
            chipView(chip, state: state).opacity(hovering ? 0 : 1)
          }
          Menu {
            Button { guide = true } label: { Label("How to connect", systemImage: "questionmark.circle") }
            if connectedOrConnecting {
              Button { Task { await channels.run("refreshChannel", agentId: agentId, platform: manifest.platform, store: store) } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                .disabled(channels.isBusy("refreshChannel", agentId: agentId, platform: manifest.platform))
              Button(role: .destructive) { Task { await channels.run("disconnectChannel", agentId: agentId, platform: manifest.platform, store: store) } } label: { Label("Disconnect", systemImage: "powerplug") }
                .disabled(channels.isBusy("disconnectChannel", agentId: agentId, platform: manifest.platform))
            }
          } label: {
            Image(systemName: "ellipsis")
          }
          .menuStyle(.borderlessButton)
          .menuIndicator(.hidden)
          .fixedSize()
          .opacity(hovering ? 1 : 0)
          .accessibilityLabel("Connection actions")
        }
      }
      switch state {
      case .available:
        Button("Connect") { formOpen.toggle() }.buttonStyle(.borderedProminent).controlSize(.small)
      case .error:
        HStack(spacing: 8) {
          Button("Reconnect") { formOpen.toggle() }.buttonStyle(.bordered).controlSize(.small)
          Button("Disconnect") { Task { await channels.run("disconnectChannel", agentId: agentId, platform: manifest.platform, store: store) } }
            .buttonStyle(.borderless).controlSize(.small)
            .disabled(channels.isBusy("disconnectChannel", agentId: agentId, platform: manifest.platform))
        }
      default:
        EmptyView()
      }
      if formOpen && state != .comingSoon {
        VStack(alignment: .leading, spacing: 8) {
          SecureField(ChannelsView.placeholder(manifest), text: $token)
            .textFieldStyle(.roundedBorder)
            .onSubmit(store_)
          Label(ChannelsView.storedSecurely, systemImage: "checkmark.shield").font(.system(size: 12)).foregroundStyle(Ink.secondary)
          HStack(spacing: 8) {
            Button("Cancel") { token = ""; formOpen = false }.buttonStyle(.borderless)
            Button("Store securely", action: store_)
              .buttonStyle(.borderedProminent)
              .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || channels.isBusy("connectChannel", agentId: agentId, platform: manifest.platform))
          }
          .controlSize(.small)
        }
      }
    }
    .opacity(state == .comingSoon ? 0.6 : 1)
    .contentShape(.rect)
    .onHover { hovering = $0 }
    .alert(ChannelsView.guide(manifest).title, isPresented: $guide) {
      Button("Got it", role: .cancel) {}
    } message: {
      Text("\(ChannelsView.guide(manifest).description)\n\nComing soon\n\(ChannelsView.guide(manifest).blurb)")
    }
  }

  /** The field's value, sent once and cleared (`connectChannel`); the row changes with the box's next answer. */
  private func store_() {
    let value = token
    guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !channels.isBusy("connectChannel", agentId: agentId, platform: manifest.platform) else { return }
    token = ""
    formOpen = false
    Task { await channels.run("connectChannel", agentId: agentId, platform: manifest.platform, token: value, store: store) }
  }

  private func chipView(_ text: String, state: ChannelsView.RowState) -> some View {
    let tint: Color? = state == .connected ? Color(red: 0x3f / 255, green: 0xb9 / 255, blue: 0x50 / 255) : { if case .error = state { return Color(red: 1, green: 0x5f / 255, blue: 0x57 / 255) }; return nil }()
    return HStack(spacing: 5) {
      Circle().fill(tint ?? Ink.tertiary).frame(width: 6, height: 6)
      Text(text).font(.system(size: 12, weight: .medium)).foregroundStyle(tint ?? Ink.secondary)
    }
    .padding(.horizontal, 8).padding(.vertical, 2)
    .background((tint ?? Ink.primary).opacity(tint == nil ? 0.06 : 0.16), in: Capsule())
  }
}
