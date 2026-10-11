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
 * "/", no tab of its own): the line saying what it is for, then Discord and
 * Slack, each with its logo, name and line, its chip or Connect, the "…"
 * menu under the pointer, and the token's field under the row.
 */
struct ChannelsBody: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var model = ChannelsModel()

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(ChannelsView.intro)
        .font(.system(size: 13))
        .cssLineHeight(18, size: 13)
        .foregroundStyle(look.paneInk2)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.bottom, 2)
      if let view = model.view {
        if view.manifests.isEmpty {
          Text(ChannelsView.none)
            .font(.system(size: 13))
            .foregroundStyle(look.inkTertiary)
        } else {
          VStack(alignment: .leading, spacing: 16) {
            ForEach(view.manifests, id: \.platform) { manifest in
              ChannelRow(agentId: agent.id, manifest: manifest, view: view, model: model, look: look)
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
 * A platform (`B0n`): its logo on a 40 tile (round 11), its name (15, 500)
 * over its line (13, at most two lines), then the chip ("Connected",
 * "Needs attention", "Connecting", "Soon") or Connect; Reconnect and
 * Disconnect when it went wrong. Under the pointer the chip gives way to
 * "…" (How to connect, Refresh, Disconnect). A coming-soon row is faded.
 */
private struct ChannelRow: View {
  let agentId: String
  let manifest: ChannelsView.Manifest
  let view: ChannelsView
  let model: ChannelsModel
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var formOpen = false
  @State private var token = ""
  @State private var hovering = false
  @State private var guide = false
  /** "…"'s menu is open: "…" stays, the chip stays hidden. */
  @State private var menuOpen = false
  @State private var menuSpot = WindowSpot()
  @FocusState private var fieldFocused: Bool

  var body: some View {
    let state = view.state(manifest)
    let busy = model.isBusy(manifest.platform)
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center, spacing: 0) {
        HStack(alignment: .center, spacing: 14) {
          logo
          VStack(alignment: .leading, spacing: 1) {
            Text(manifest.displayName)
              .font(.system(size: 15, weight: .medium))
              .cssLineHeight(20, size: 15)
              .foregroundStyle(look.paneInk)
            Text(view.subtitle(manifest))
              .font(.system(size: 13))
              .cssLineHeight(17, size: 13)
              .foregroundStyle(look.paneInk2)
              .lineLimit(2)
              .fixedSize(horizontal: false, vertical: true)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          status(state)
        }
        buttons(state, busy: busy)
      }
      if formOpen && state != .comingSoon {
        form(busy: busy)
      }
    }
    .opacity(state == .comingSoon ? 0.6 : 1)
    .contentShape(Rectangle())
    .onHover { inside in withAnimation(.easeInOut(duration: 0.15)) { hovering = inside } }
    .alert(ChannelsView.guide(manifest).title, isPresented: $guide) {
      Button("Got it", role: .cancel) {}
    } message: {
      Text("\(ChannelsView.guide(manifest).description)\n\nComing soon\n\(ChannelsView.guide(manifest).blurb)")
    }
  }

  private var logo: some View {
    Image("Connectors/\(manifest.platform)")
      .resizable()
      .aspectRatio(contentMode: .fit)
      .frame(width: 20, height: 20)
      .frame(width: 40, height: 40)
      .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(look.paneFill))
      .accessibilityHidden(true)
  }

  /** The chip, and "…" in its place under the pointer or while its menu is open (.15 s). */
  @ViewBuilder
  private func status(_ state: ChannelsView.RowState) -> some View {
    let showsMore = hovering || menuOpen
    ZStack(alignment: .trailing) {
      if let chip = ChannelsView.chip(state) {
        chipView(chip, state: state)
          .opacity(showsMore ? 0 : 1)
      }
      Button { openMenu(state) } label: {
        Image(systemName: "ellipsis")
          .font(.system(size: 12))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 16, height: 16)
          .contentShape(Rectangle())
      }
      .buttonStyle(.hand)
      .background(WindowSpotReader(spot: menuSpot))
      .opacity(showsMore ? 1 : 0)
      .accessibilityLabel("Connection actions")
    }
  }

  /** "Connection actions", the Mac's menu under "…": How to connect; Refresh and Disconnect (its icon red) while connected or connecting, waiting while a call runs. */
  private func openMenu(_ state: ChannelsView.RowState) {
    let menu = NSMenu(title: "Connection actions")
    menu.autoenablesItems = false
    let busy = model.isBusy(manifest.platform)
    let how = BlockMenuItem("How to connect") { guide = true }
    how.image = NSImage(systemSymbolName: "questionmark.circle", accessibilityDescription: nil)
    menu.addItem(how)
    if state == .connected || state == .connecting {
      let refresh = BlockMenuItem("Refresh") {
        Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.refreshChannel(agentId, platform: manifest.platform) } }
      }
      refresh.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: nil)
      refresh.isEnabled = !busy
      menu.addItem(refresh)
      let disconnect = BlockMenuItem("Disconnect") {
        Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.disconnectChannel(agentId, platform: manifest.platform) } }
      }
      disconnect.image = NSImage(systemSymbolName: "powerplug", accessibilityDescription: nil)?
        .withSymbolConfiguration(NSImage.SymbolConfiguration(paletteColors: [look.dark ? NSColor(red: 1, green: 0x56 / 255, blue: 0x67 / 255, alpha: 1) : NSColor(red: 0xc2 / 255, green: 0x1d / 255, blue: 0x2e / 255, alpha: 1)]))
      disconnect.isEnabled = !busy
      menu.addItem(disconnect)
    }
    menu.minimumWidth = 220
    menuOpen = true
    RoutineMenus.popUp(menu, under: menuSpot.frame)
    menuOpen = false
  }

  /** The chip (`O0n`): 26 high, round, a 6-point dot of its colour; "Soon" has none. */
  private func chipView(_ text: String, state: ChannelsView.RowState) -> some View {
    let tint: Color?
    switch state {
    case .connected: tint = look.added
    case .error: tint = look.danger
    default: tint = nil
    }
    return HStack(spacing: 5) {
      if state != .comingSoon {
        Circle().fill(tint ?? look.inkSecondary).frame(width: 6, height: 6)
      }
      Text(text)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(tint ?? look.inkSecondary)
    }
    .padding(.horizontal, 9)
    .frame(height: 26)
    .background(Capsule().fill((tint ?? look.ink).opacity(tint == nil ? 0.06 : 0.16)))
  }

  /** Connect (no connection), or Reconnect and Disconnect (it went wrong): 28-point pills on the pane's grey. */
  @ViewBuilder
  private func buttons(_ state: ChannelsView.RowState, busy: Bool) -> some View {
    switch state {
    case .available:
      pill("Connect", disabled: busy) { toggleForm() }
        .padding(.leading, 6)
    case .error:
      HStack(spacing: 6) {
        pill("Reconnect", disabled: busy) { toggleForm() }
        pill("Disconnect", disabled: busy) {
          Task { await model.run(manifest.platform, agentId: agentId, store: store) { await store.disconnectChannel(agentId, platform: manifest.platform) } }
        }
      }
      .padding(.leading, 6)
    default:
      EmptyView()
    }
  }

  private func pill(_ title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(look.paneInk)
        .padding(.horizontal, 13)
        .frame(height: 28)
        .background(Capsule().fill(look.paneFill))
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .disabled(disabled)
    .opacity(disabled ? 0.56 : 1)
  }

  /** Connect toggles the field (it takes the keys as it appears: the window leaves them on Connect; decision 6). */
  private func toggleForm() {
    formOpen.toggle()
    if !formOpen { token = "" }
  }

  /** The token's field (secret), "Stored securely, never shown to your agent.", Cancel and Store securely. */
  private func form(busy: Bool) -> some View {
    let blank = token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    return VStack(alignment: .leading, spacing: 8) {
      SecureField(ChannelsView.placeholder(manifest), text: $token)
        .textFieldStyle(.plain)
        .font(.system(size: 12))
        .padding(EdgeInsets(top: 9, leading: 10, bottom: 9, trailing: 10))
        .frame(height: 36)
        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(look.ground))
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(look.ink.opacity(fieldFocused ? 0.20 : 0.10), lineWidth: 1))
        .focused($fieldFocused)
        .onAppear { fieldFocused = true }
        .onSubmit { storeToken() }
      HStack(alignment: .center, spacing: 8) {
        Label {
          Text(ChannelsView.storedSecurely)
        } icon: {
          Image(systemName: "checkmark.shield")
            .font(.system(size: 11))
        }
        .font(.system(size: 11))
        .foregroundStyle(look.inkTertiary)
        Spacer(minLength: 8)
        pill("Cancel", disabled: false) {
          token = ""
          formOpen = false
        }
        pill("Store securely", disabled: blank || busy) { storeToken() }
      }
    }
    .padding(.top, 10)
    .overlay(alignment: .top) {
      Rectangle().fill(look.ink.opacity(0.10)).frame(height: 1)
    }
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
