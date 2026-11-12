import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * An agent's channels as its computer last answered (the window's channels
 * store, `I$n`): read when the page shows, every 4 s while the pane is open
 * and Simeon is in front, and when the window comes forward (the window's
 * own reads only while it can be seen, `document.visibilityState`), 15 s at
 * most, a failed read keeping the last answer; those last two let a resting
 * computer rest. Connect, Disconnect and Refresh put the answer in place,
 * then read again.
 */
@MainActor
@Observable
final class ChannelsModel {
  private(set) var view: ChannelsView?
  /** Calls under way per platform: its row's buttons and menu wait while any is. */
  private(set) var busy: [String: Int] = [:]
  /** What went wrong opening a platform's sign-in, shown in its row until the next try. */
  private(set) var problem: [String: String] = [:]
  /** Each read and call numbered as it starts: an answer older than the one shown is dropped (the 4 s reads, the window coming forward and a call's own answer overlap). */
  @ObservationIgnored private var issued = 0
  @ObservationIgnored private var shown = 0

  /** A read; with `wakes` false, one that lets a resting computer rest (`AppStore.channels`). */
  func load(_ agentId: String, store: AppStore, wakes: Bool = true) async {
    issued += 1
    let number = issued
    apply(await store.channels(agentId, wakes: wakes), number)
  }

  private func apply(_ next: ChannelsView?, _ number: Int) {
    guard let next, number > shown else { return }
    shown = number
    view = next
  }

  func isBusy(_ platform: String) -> Bool { (busy[platform] ?? 0) > 0 }

  /**
   * Connect through the browser (Slack through Simeon's own app, 12 November
   * 2026): Slack's sign-in opens, and the row waits (its spinner) while the
   * computer is asked every 3 s whether it is connected, five minutes at most.
   */
  func connectInBrowser(_ platform: String, agentId: String, store: AppStore) async {
    guard !isBusy(platform) else { return }
    problem[platform] = nil
    busy[platform, default: 0] += 1
    defer { busy[platform, default: 1] -= 1 }
    guard let url = await store.channelConnectLink(agentId, platform: platform) else {
      problem[platform] = ChannelsView.couldNotConnect
      return
    }
    NSWorkspace.shared.open(url)
    let deadline = Date().addingTimeInterval(ChannelsView.connectWaitSeconds)
    while Date() < deadline, !Task.isCancelled {
      try? await Task.sleep(nanoseconds: UInt64(ChannelsView.connectPollSeconds * 1_000_000_000))
      issued += 1
      let number = issued
      apply(await store.refreshChannel(agentId, platform: platform), number)
      if let view, let manifest = view.manifests.first(where: { $0.platform == platform }), view.state(manifest) == .connected { return }
    }
  }

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
      await model.load(agent.id, store: store)
      // Every 4 s only while Simeon is in front (the window's own: while `document.visibilityState` is "visible"), so a pane left open behind other apps, or a hidden Simeon, asks nothing.
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 4_000_000_000)
        if !Task.isCancelled && NSApp.isActive { await model.load(agent.id, store: store, wakes: false) }
      }
    }
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
      Task { await model.load(agent.id, store: store, wakes: false) }
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
          Text(model.problem[manifest.platform] ?? view.subtitle(manifest))
            .font(PanelType.detail)
            .foregroundStyle(isError(state) || model.problem[manifest.platform] != nil ? look.danger : look.inkSecondary)
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
        PlusMark(disabled: formOpen, look: look) { connect() }
          .accessibilityLabel("Connect \(manifest.displayName)")
      }
    case .connected:
      AddedMark(look: look)
    case .connecting:
      AddingSpinner(name: manifest.displayName, look: look)
    case .error:
      if busy && manifest.connectsInBrowser {
        AddingSpinner(name: manifest.displayName, look: look)
      } else {
        SettingsPill(title: String(localized: "Reconnect"), disabled: busy || formOpen, look: look) { connect() }
      }
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

  /** + and Reconnect: Slack's sign-in in the browser for a platform connected through Simeon's own app, else the token's field. */
  private func connect() {
    if manifest.connectsInBrowser {
      Task { await model.connectInBrowser(manifest.platform, agentId: agentId, store: store) }
    } else {
      openForm()
    }
  }

  /** The token's field opens (it takes the keys as it appears: the window leaves them on Connect; decision 6). */
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

/**
 * Slack in the agent's Profile, under Notifications (12 November 2026, the
 * founder: "slack to be there below notifications", no Channels page on the
 * way), in Notifications' parts: Slack's 40 tile, "Slack" (15/20, medium)
 * over the workspace once connected, else "Channels and DMs" (13/17, grey;
 * red when the sign-in couldn't open), and at the right + (Slack's sign-in in
 * the browser), the spinner while it is waited for, or the green tick. A
 * connection's "…" (Disconnect) shows under the pointer. Read from Simeon
 * Labs' server (`SlackRowModel`), so the profile never wakes the computer;
 * drawn only while Slack can be connected, or the agent talks there.
 */
struct SlackProfileRow: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model = SlackRowModel()
  @State private var hovering = false
  @State private var menuOpen = false
  @State private var menuSpot = WindowSpot()

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if model.shown, let state = model.state {
        HStack(spacing: 14) {
          AppLogoTile(name: "Slack", look: look, side: 40, id: "slack")
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: "Slack")
              .font(.system(size: 15, weight: .medium))
              .tracking(-0.16)
              .foregroundStyle(look.paneInk)
            Text(model.problem ?? state.subtitle)
              .font(.system(size: 13))
              .lineSpacing(LineBox.extra(size: 13, lineHeight: 17))
              .foregroundStyle(model.problem == nil ? look.paneInk2 : look.danger)
              .lineLimit(2)
              .fixedSize(horizontal: false, vertical: true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          if state.connected && !model.busy {
            more
          }
          mark(state)
        }
        .padding(.top, 18)
        .contentShape(Rectangle())
        .onHover { inside in withAnimation(.easeInOut(duration: 0.15)) { hovering = inside } }
      } else {
        // Something to hang the read on while the row is not drawn.
        Color.clear.frame(height: 0)
      }
    }
    .task(id: agent.id) { await model.load(agent.id, store: store) }
    // Back from the browser: read at once.
    .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
      Task { await model.load(agent.id, store: store) }
    }
  }

  /** +, the spinner, or the tick. */
  @ViewBuilder
  private func mark(_ state: SlackState) -> some View {
    if model.busy {
      AddingSpinner(name: "Slack", look: look)
    } else if state.connected {
      AddedMark(look: look)
    } else {
      PlusMark(disabled: false, look: look) {
        Task { await model.connect(agent.id, store: store) { url in NSWorkspace.shared.open(url) } }
      }
      .accessibilityLabel("Connect \("Slack")")
    }
  }

  /** "…" under the pointer or while its menu is open: Disconnect, its icon red. */
  private var more: some View {
    Button { openMenu() } label: {
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

  private func openMenu() {
    let menu = NSMenu(title: String(localized: "Connection actions"))
    menu.autoenablesItems = false
    let disconnect = BlockMenuItem(String(localized: "Disconnect")) {
      Task { await model.disconnect(agent.id, store: store) }
    }
    disconnect.image = NSImage(systemSymbolName: "powerplug", accessibilityDescription: nil)?
      .withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [look.dark ? NSColor(red: 1, green: 0x56 / 255, blue: 0x67 / 255, alpha: 1) : NSColor(red: 0xc2 / 255, green: 0x1d / 255, blue: 0x2e / 255, alpha: 1)]))
    disconnect.isEnabled = !model.busy
    menu.addItem(disconnect)
    menu.minimumWidth = 200
    menuOpen = true
    RoutineMenus.popUp(menu, under: menuSpot.frame)
    menuOpen = false
  }
}
