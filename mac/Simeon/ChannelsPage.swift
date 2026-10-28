import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * An agent's channels as its computer last answered (the window's channels
 * store, `I$n`): read when the page shows, every 4 s while the pane is open
 * and when the window comes forward, 15 s at most, a failed read keeping
 * the last answer; Connect, Disconnect and Refresh put the answer in place,
 * then read again.
 */
@MainActor
@Observable
final class ChannelsModel {
  private(set) var view: ChannelsView?
  /** Calls under way per platform: its row's buttons and menu wait while any is. */
  private(set) var busy: [String: Int] = [:]
  /** Each read and call numbered as it starts: an answer older than the one shown is dropped (the 4 s reads, the window coming forward and a call's own answer overlap). */
  @ObservationIgnored private var issued = 0
  @ObservationIgnored private var shown = 0

  func load(_ agentId: String, store: AppStore) async {
    issued += 1
    let number = issued
    apply(await store.channels(agentId), number)
  }

  private func apply(_ next: ChannelsView?, _ number: Int) {
    guard let next, number > shown else { return }
    shown = number
    view = next
  }

  func isBusy(_ platform: String) -> Bool { (busy[platform] ?? 0) > 0 }

  /** A call for one platform, then a read; its row waits meanwhile. */
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
 * The Channels page of the agent's pane (O01, `_0n`; "Channels" in ⌘K and
 * "/", no tab of its own), in Settings' parts (the founder, 28 October
 * 2026: "this isn't our Apple design… too many words"): one card, a row per
 * platform, as the Connectors list draws an app.
 */
struct ChannelsBody: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model = ChannelsModel()

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let view = model.view {
        if view.manifests.isEmpty {
          Text(ChannelsView.none)
            .font(PanelType.row)
            .foregroundStyle(look.inkTertiary)
        } else {
          SettingsGroup(look: look) {
            ForEach(Array(view.manifests.enumerated()), id: \.element.platform) { index, manifest in
              ChannelRow(agentId: agent.id, manifest: manifest, view: view, model: model, divided: index > 0, look: look)
            }
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .task(id: agent.id) {
      while !Task.isCancelled {
        await model.load(agent.id, store: store)
        try? await Task.sleep(nanoseconds: 4_000_000_000)
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
      Task { await model.load(agent.id, store: store) }
    }
  }
}

/**
 * A platform, as a Connectors row: its app icon (36), its name over a few
 * words in grey (red when it went wrong), and its mark: + to connect, the
 * green tick, the spinner while it connects, Coming soon said quietly,
 * Reconnect when it went wrong. A connection's "…" (Refresh, Disconnect)
 * shows under the pointer. + opens the token's field in the card, with
 * Cancel and Save.
 */
private struct ChannelRow: View {
  let agentId: String
  let manifest: ChannelsView.Manifest
  let view: ChannelsView
  let model: ChannelsModel
  let divided: Bool
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var formOpen = false
  @State private var token = ""
  @State private var hovering = false
  /** "…"'s menu is open: "…" stays. */
  @State private var menuOpen = false
  @State private var menuSpot = WindowSpot()
  @FocusState private var fieldFocused: Bool

  var body: some View {
    let state = view.state(manifest)
    let busy = model.isBusy(manifest.platform)
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 12) {
        AppLogoTile(name: manifest.displayName, look: look, side: 36, id: manifest.platform)
        VStack(alignment: .leading, spacing: 2) {
          Text(manifest.displayName)
            .font(PanelType.row)
            .foregroundStyle(look.ink)
          Text(view.subtitle(manifest))
            .font(PanelType.detail)
            .foregroundStyle(isError(state) ? look.danger : look.inkSecondary)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(state == .comingSoon ? 0.6 : 1)
        if hasMenu(state) {
          more(state, busy: busy)
        }
        mark(state, busy: busy)
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, 10)
      .frame(minHeight: SettingsRowSize.minHeight)
      if formOpen && state != .comingSoon {
        form(busy: busy)
      }
    }
    .overlay(alignment: .top) {
      if divided { SettingsDivider(look: look) }
    }
    .contentShape(Rectangle())
    .onHover { inside in withAnimation(.easeInOut(duration: 0.15)) { hovering = inside } }
  }

  private func isError(_ state: ChannelsView.RowState) -> Bool {
    if case .error = state { return true }
    return false
  }

  private func hasMenu(_ state: ChannelsView.RowState) -> Bool {
    state == .connected || state == .connecting || isError(state)
  }

  /** The row's end: +, the tick, the spinner, Coming soon, or Reconnect. */
  @ViewBuilder
  private func mark(_ state: ChannelsView.RowState, busy: Bool) -> some View {
    switch state {
    case .available:
      if busy {
        AddingSpinner(name: manifest.displayName, look: look)
      } else {
        PlusMark(disabled: formOpen, look: look) { openForm() }
          .accessibilityLabel("Connect \(manifest.displayName)")
      }
    case .connected:
      AddedMark(look: look)
    case .connecting:
      AddingSpinner(name: manifest.displayName, look: look)
    case .error:
      SettingsPill(title: String(localized: "Reconnect"), disabled: busy || formOpen, look: look) { openForm() }
    case .comingSoon:
      SoonWord(look: look)
    }
  }

  /** "…" under the pointer or while its menu is open: Refresh and Disconnect (its icon red), waiting while a call runs. */
  private func more(_ state: ChannelsView.RowState, busy: Bool) -> some View {
    Button { openMenu(state) } label: {
      Image(systemName: "ellipsis")
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 28, height: 28)
        .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .background(WindowSpotReader(spot: menuSpot))
    .opacity(hovering || menuOpen ? 1 : 0)
    .accessibilityLabel("Connection actions")
  }

  private func openMenu(_ state: ChannelsView.RowState) {
    let menu = NSMenu(title: String(localized: "Connection actions"))
    menu.autoenablesItems = false
    let busy = model.isBusy(manifest.platform)
    if state == .connected || state == .connecting {
      let refresh = BlockMenuItem(String(localized: "Refresh")) {
        Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.refreshChannel(agentId, platform: manifest.platform) } }
      }
      refresh.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: nil)
      refresh.isEnabled = !busy
      menu.addItem(refresh)
    }
    let disconnect = BlockMenuItem(String(localized: "Disconnect")) {
      Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.disconnectChannel(agentId, platform: manifest.platform) } }
    }
    disconnect.image = NSImage(systemSymbolName: "powerplug", accessibilityDescription: nil)?
      .withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [look.dark ? NSColor(red: 1, green: 0x56 / 255, blue: 0x67 / 255, alpha: 1) : NSColor(red: 0xc2 / 255, green: 0x1d / 255, blue: 0x2e / 255, alpha: 1)]))
    disconnect.isEnabled = !busy
    menu.addItem(disconnect)
    menu.minimumWidth = 200
    menuOpen = true
    RoutineMenus.popUp(menu, under: menuSpot.frame)
    menuOpen = false
  }

  /** + and Reconnect open the field (it takes the keys as it appears: the window leaves them on Connect; decision 6). */
  private func openForm() {
    token = ""
    formOpen = true
  }

  /** The token's field (secret, Settings' field) under the name, then Cancel and Save. */
  private func form(busy: Bool) -> some View {
    let blank = token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    return HStack(spacing: 8) {
      SecureField(ChannelsView.placeholder(manifest), text: $token)
        .textFieldStyle(.plain)
        .font(PanelType.row)
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.groupedGround))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(fieldFocused ? 0.2 : 0.1), lineWidth: 1))
        .focused($fieldFocused)
        .onAppear { fieldFocused = true }
        .onSubmit { storeToken() }
      SettingsPill(title: String(localized: "Cancel"), look: look) {
        token = ""
        formOpen = false
      }
      SettingsPill(title: String(localized: "Save"), primary: true, disabled: blank || busy, look: look) { storeToken() }
    }
    .padding(.leading, SettingsRowSize.inset + 36 + 12)
    .padding(.trailing, SettingsRowSize.inset)
    .padding(.bottom, 12)
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
