import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * "Execution on Local Computer", kept on this Mac per account and given to
 * the computer (`localToolPermission` in its settings), as the Electron app
 * does: main's settings store holds the choice and the team's ceiling, the
 * computer is told the choice lowered to the ceiling, and connecting
 * squares the two (`coordinator-resync.ts`). Settings › General shows the
 * same stored choice (`GeneralSettingsModel`).
 */
@MainActor
@Observable
final class MacLocalPermission {
  static let shared = MacLocalPermission()

  @ObservationIgnored private let settings = LocalToolSettings()
  /** The team's ceiling, once read this sign-in (a failed read counts as none). */
  private(set) var ceiling: LocalToolPermission?
  private(set) var ceilingKnown = false
  /** Bumped by each read of the ceiling, so an older answer is dropped (`localToolCeilingSyncSeq`). */
  @ObservationIgnored private var ceilingReads = 0

  private init() {
    ceiling = settings.ceiling
  }

  /**
   * A choice made on the Allow card: kept here, then the computer told, up to
   * three times until it says it has it (250, 500, 750 ms apart). What it is
   * now, the ceiling applied, comes back: the card answers by it (`OLn`).
   */
  func choose(_ value: LocalToolPermission, store: AppStore) async -> LocalToolPermission {
    settings.choice = value
    let permission = settings.effective
    _ = await store.pushHostSetting("localToolPermission", .string(permission.rawValue))
    return settings.effective
  }

  /** "Allow once" answers (`~/.simeon/local-tool-approvals.json`), shared by the card and the hands (and the Electron app). */
  nonisolated static let approvals = LocalToolApprovals()

  /**
   * Signed in (and at each launch): this account's choice, and its team's
   * ceiling read from Simeon Labs (`GetTeamAdminSettingsOrEmptyIfNotInTeam`;
   * none when it does not answer). The computer is told when that changes
   * what it should do.
   */
  func signedIn(_ account: String?, store: AppStore) async {
    // Kept for this account once it is known (before, the choice kept from the last launch stands).
    if let account { settings.scope(to: account) }
    let previous = settings.effective
    ceilingReads += 1
    let read = ceilingReads
    let answer = await store.teamAdminSettings()
    guard read == ceilingReads else { return }
    settings.ceiling = LocalToolPermission.ceiling(teamAdminSettings: answer)
    ceiling = settings.ceiling
    ceilingKnown = true
    let now = settings.effective
    guard now != previous else { return }
    _ = await store.pushHostSetting("localToolPermission", .string(now.rawValue))
  }

  /** Settings › General read the ceiling again: the card follows it. */
  func took(ceiling value: LocalToolPermission?) {
    ceiling = value
    ceilingKnown = true
  }

  /** Signed out: forgotten, so the next account starts from "Ask every time". */
  func signedOut() {
    ceilingReads += 1
    settings.clearScope()
    ceiling = nil
    ceilingKnown = false
  }

  /** Connected: a computer set to always or never while this Mac is at the default is taken; otherwise it is told this Mac's. */
  func connected(_ backend: AgentBackend) async {
    let box = (try? await backend.command("getHostSettings", [:]))?["localToolPermission"]?.string
    switch LocalToolPermission.reconcile(box: box, mac: settings.effective) {
    case .adopt(let value):
      settings.choice = value
    case .push(let value):
      _ = try? await backend.command("setHostSettings", ["localToolPermission": .string(value.rawValue)])
    }
  }
}

// MARK: - The Allow card

/**
 * The card that asks to use this Mac (`LLn`), 8 over the message field and
 * as wide (`BLn`): the orange triangle, "Allow Simeon and all agents to run
 * commands on your local computer?" (one title for every ask, as the
 * window's: decision 1), its ✕ (Deny once, also Esc), the line under it,
 * then Always allow (black, white on dark), Allow once and Never. An answer
 * greys the buttons until the computer's own copy settles the ask; one that
 * fails says so in red and can be tried again. Always allow waits for the
 * team's policy and is off below "Always allow".
 */
struct LocalAskDock: View {
  let ask: LocalAsk
  let agentId: String
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(Viewers.self) private var viewers
  @Environment(PaneState.self) private var pane
  @Environment(WindowState.self) private var window
  @State private var submitting = false
  @State private var failed = false
  @State private var closeHover = false
  @FocusState private var closeFocused: Bool

  /** Cards on screen (one chat at a time; counted so a card leaving as the next comes does not clear it). The window's own Escape waits while one shows (MainWindow). */
  static var shown = 0

  private var alwaysBlocked: String? {
    let permission = MacLocalPermission.shared
    guard permission.ceilingKnown else { return LocalToolAsk.loadingPolicy }
    guard let ceiling = permission.ceiling else { return nil }
    return ceiling == .always ? nil : LocalToolAsk.blockedByPolicy
  }

  var body: some View {
    let enabled = !submitting && store.backend != nil
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .top, spacing: 8) {
          Image(systemName: "exclamationmark.triangle")
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(look.jsonNumber)
            .frame(width: 14, height: 14)
            .padding(.top, 2)
            .accessibilityHidden(true)
          Text(LocalToolAsk.title)
            .font(.system(size: 14, weight: .medium))
            .tracking(-0.15)
            .cssLineHeight(22, size: 14, weight: .medium)
            .foregroundStyle(look.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
          Button { answer(.deny) } label: {
            Image(systemName: "xmark")
              .font(.system(size: 9, weight: .semibold))
              .foregroundStyle(closeHover ? look.ink : look.inkSecondary)
              .frame(width: 20, height: 20)
              .background(closeHover ? look.wash : .clear, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
              .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
          }
          .buttonStyle(.plain)
          .focused($closeFocused)
          .focusEffectDisabled()
          // A ring with the keys (decision 9: the window's has none).
          .overlay {
            if closeFocused {
              RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(look.ink.opacity(0.4), lineWidth: 2).padding(-1)
            }
          }
          .onHover { inside in withAnimation(.easeOut(duration: 0.12)) { closeHover = inside } }
          .disabled(!enabled)
          .padding(.top, 2)
          .accessibilityLabel(LocalToolAsk.denyOnce)
          .help(LocalToolAsk.denyOnceTooltip)
        }
        Text(LocalToolAsk.description)
          .font(.system(size: 13))
          .tracking(-0.08)
          .cssLineHeight(18, size: 13)
          .foregroundStyle(look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
        if failed {
          Text(LocalToolAsk.failure)
            .font(.system(size: 13))
            .cssLineHeight(18, size: 13)
            .foregroundStyle(look.danger)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      HStack(spacing: 8) {
        // The disabled button's words still show on hover, as the window wraps it in a span.
        AskButton(title: "Always allow", primary: true, enabled: enabled && alwaysBlocked == nil, look: look) { answer(.always) }
          .contentShape(Rectangle())
          .help(alwaysBlocked ?? "")
        AskButton(title: "Allow once", primary: false, enabled: enabled, look: look) { answer(.allowOnce) }
        AskButton(title: "Never", primary: false, enabled: enabled, look: look) { answer(.never) }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(look.theirs, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Local tool permission")
    .background(ViewerKeys { event in
      // Esc denies once: not repeated, no modifier, and not while a field has the keys (decision 14: the window denies even
      // from the message field). Not while anything stands over the chat (the window's overlays: a picture or file, an
      // exchange, the org chart, Deep Links, the pane's popovers); search, Settings and the computer hold the keys already.
      let mods = event.modifierFlags.intersection([.command, .control, .option, .shift])
      guard event.keyCode == 53, !event.isARepeat, mods.isEmpty, enabled,
            event.window?.attachedSheet == nil, !(event.window?.firstResponder is NSText),
            viewers.shown == nil, !ChatControl.exchangeShowing, !window.orgChart, MacServices.shared.deepLinkInfo == nil,
            pane.avatarEditor == nil, pane.routineEditor?.popover == nil else { return false }
      answer(.deny)
      return true
    })
    .onAppear { LocalAskDock.shown += 1 }
    .onDisappear { LocalAskDock.shown -= 1 }
  }

  /**
   * The answer (`OLn`): Always allow and Never change the setting first and
   * fall back to once when it did not take (a team's ceiling); Allow once is
   * written down here first, or the hands would refuse what the computer
   * then asks; then the computer is told. The message field takes the keys
   * back after (the window leaves them nowhere).
   */
  private func answer(_ resolution: LocalToolAsk.Resolution) {
    guard !submitting else { return }
    submitting = true
    failed = false
    Task {
      var sent = resolution
      if resolution == .always || resolution == .never {
        let wanted: LocalToolPermission = resolution == .always ? .always : .never
        let now = await MacLocalPermission.shared.choose(wanted, store: store)
        if now != wanted { sent = resolution == .always ? .allowOnce : .deny }
      }
      if sent == .allowOnce {
        MacLocalPermission.approvals.record(LocalToolApproval(id: ask.requestId, action: ask.action, target: ask.target))
      }
      do {
        guard let backend = store.backend else { throw GatewayError(message: "Not signed in.", refused: true) }
        _ = try await backend.command("resolveLocalToolPermission", ["entryId": .string(ask.entryId), "requestId": .string(ask.requestId),
                                                                    "resolution": .string(sent.rawValue), "agentId": .string(agentId)])
        WindowState.composerFocus += 1
      } catch {
        submitting = false
        failed = true
      }
    }
  }
}

/**
 * The card's buttons (32 high, 8 round, 14 on 22): Always allow in the
 * ink (its words in the ground), at 60% under the pointer; Allow once and
 * Never on a faint grey with a 15% edge, a little darker under the
 * pointer; .56 while they wait.
 */
private struct AskButton: View {
  let title: String
  let primary: Bool
  let enabled: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    let on = hovering && enabled
    Button(action: action) {
      Text(title)
        .font(.system(size: 14))
        .cssLineHeight(22, size: 14)
        .foregroundStyle(primary ? (look.dark ? Color(hex: 0x070707) : Color(hex: 0xfcfcfc)) : look.ink)
        .padding(.horizontal, 10)
        .frame(height: 32)
        .background(primary ? look.ink.opacity(on ? 0.6 : 1) : (on ? look.rowHover : look.wash), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
          if !primary { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1) }
        }
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .fixedSize()
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.56)
    .onHover { inside in withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.14)) { hovering = inside } }
  }
}
