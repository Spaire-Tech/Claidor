import AppKit
import SwiftUI
import SimeonCore
import SimeonMacCore

/**
 * Settings › Agent › "Execution on Local Computer", kept on this Mac per
 * account and given to the box (`localToolPermission` in its settings), as
 * the Electron app does: main's settings store holds the choice and the
 * team's ceiling (`sand-settings-store.ts`), the box is told the choice
 * lowered to the ceiling (`main-edge.ts` `setLocalToolPermission`), and
 * connecting to the box squares the two (`coordinator-resync.ts`).
 */
@MainActor
@Observable
final class MacLocalPermission {
  static let shared = MacLocalPermission()

  @ObservationIgnored private let settings = LocalToolSettings()
  /** What the menu shows: the choice lowered to the ceiling. */
  private(set) var effective: LocalToolPermission
  private(set) var ceiling: LocalToolPermission?
  /** A change on its way to the box: the menu is greyed meanwhile (the window's `isPending`). */
  private(set) var isPending = false
  /** Bumped by each read of the team's ceiling, so an older answer is dropped (`localToolCeilingSyncSeq`). */
  @ObservationIgnored private var ceilingReads = 0

  private init() {
    effective = settings.effective
    ceiling = settings.ceiling
  }

  private func mirror() {
    effective = settings.effective
    ceiling = settings.ceiling
  }

  /**
   * The person picked one: kept here, then the box told, up to three times
   * until it says it has it (250, 500, 750 ms apart). A failure says nothing,
   * as the window's catch does nothing.
   */
  @discardableResult
  func choose(_ value: LocalToolPermission, store: AppStore) async -> LocalToolPermission {
    isPending = true
    defer { isPending = false }
    settings.choice = value
    mirror()
    for attempt in 0..<3 {
      let permission = settings.effective
      if let backend = store.backend, let applied = try? await backend.command("setHostSettings", ["localToolPermission": .string(permission.rawValue)]), applied["localToolPermission"]?.string == permission.rawValue { break }
      try? await Task.sleep(nanoseconds: UInt64(250_000_000 * (attempt + 1)))
    }
    // What it is now, the ceiling applied: the Allow card answers by it (`OLn`).
    return settings.effective
  }

  /** The setting as the hands on this Mac read it, at each request (the daemon reads `settings.json` each time). */
  nonisolated var current: LocalToolPermission { LocalToolSettings().effective }

  /** "Allow once" answers (`~/.simeon/local-tool-approvals.json`), shared by the Allow card and the hands. */
  nonisolated static let approvals = LocalToolApprovals()

  /**
   * Signed in (and at each launch): this account's choice, and its team's
   * ceiling read from Simeon Labs (`GetTeamAdminSettingsOrEmptyIfNotInTeam`;
   * none when it does not answer). The box is told when that changes what
   * it should do.
   */
  func signedIn(_ account: String, backend: AgentBackend) async {
    settings.scope(to: account)
    let previous = settings.effective
    mirror()
    ceilingReads += 1
    let read = ceilingReads
    let answer = try? await backend.dashboard("GetTeamAdminSettingsOrEmptyIfNotInTeam", [:])
    guard read == ceilingReads else { return }
    settings.ceiling = LocalToolPermission.ceiling(teamAdminSettings: answer)
    mirror()
    let now = settings.effective
    guard now != previous else { return }
    _ = try? await backend.command("setHostSettings", ["localToolPermission": .string(now.rawValue)])
  }

  /** Signed out: forgotten, so the next account starts from "Ask every time". */
  func signedOut() {
    ceilingReads += 1
    settings.clearScope()
    mirror()
  }

  /** Connected to the box: a box set to always or never by another Mac is taken while this one is at the default; otherwise the box is told this Mac's. */
  func connected(_ backend: AgentBackend) async {
    let box = (try? await backend.command("getHostSettings", [:]))?["localToolPermission"]?.string
    switch LocalToolPermission.reconcile(box: box, mac: settings.effective) {
    case .adopt(let value):
      settings.choice = value
      mirror()
    case .push(let value):
      _ = try? await backend.command("setHostSettings", ["localToolPermission": .string(value.rawValue)])
    }
  }
}

/**
 * The row (`da`): "Execution on Local Computer", its line, the team's
 * ceiling under it when there is one, and the menu (Always allow, Ask
 * every time, Never allow), the choices above the ceiling greyed.
 */
struct MacLocalExecutionRow: View {
  @Environment(AppStore.self) private var store
  private let permission = MacLocalPermission.shared

  var body: some View {
    Picker(selection: Binding(get: { permission.effective }, set: { value in Task { await permission.choose(value, store: store) } })) {
      ForEach(LocalToolPermission.choices, id: \.self) { choice in
        Text(choice.label).tag(choice).selectionDisabled(choice.isAbove(permission.ceiling))
      }
    } label: {
      Text(LocalToolPermission.title)
      Text(LocalToolPermission.explanation)
      if let ceiling = permission.ceiling { Text(LocalToolPermission.ceilingLine(ceiling)) }
    }
    .disabled(permission.isPending)
  }
}

/**
 * The card that asks to use this Mac (`LLn`), in the dock above the
 * composer: the orange triangle, "Allow Simeon and all agents to run
 * commands on your local computer?", its ✕ (Deny once, also Esc), the line
 * under it, Always allow, Allow once and Never. An answer greys it until the
 * computer's own copy settles it; one that fails says so and can be tried
 * again. Always allow waits for the team's policy and is refused below
 * "Always allow".
 */
struct MacLocalAskCard: View {
  let ask: LocalAsk
  let agentId: String
  @Environment(AppStore.self) private var store
  private let permission = MacLocalPermission.shared
  @State private var submitting = false
  @State private var failed = false
  @State private var escape: Any?

  private var alwaysBlocked: String? {
    guard let ceiling = permission.ceiling else { return nil }
    return ceiling == .always ? nil : LocalToolAsk.blockedByPolicy
  }

  var body: some View {
    let enabled = !submitting && store.backend != nil
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .top, spacing: 8) {
          Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 14)).foregroundStyle(.orange).padding(.top, 2)
            .accessibilityHidden(true)
          Text(LocalToolAsk.title).font(.system(size: 14, weight: .medium)).foregroundStyle(Ink.primary)
            .frame(maxWidth: .infinity, alignment: .leading).fixedSize(horizontal: false, vertical: true)
          Button { answer(.deny) } label: {
            Image(systemName: "xmark").font(.system(size: 10, weight: .semibold)).foregroundStyle(Ink.secondary)
              .frame(width: 20, height: 20).contentShape(.rect)
          }
          .buttonStyle(.plain)
          .disabled(!enabled)
          .accessibilityLabel(LocalToolAsk.denyOnce)
          .help(LocalToolAsk.denyOnceTooltip)
        }
        Text(LocalToolAsk.description).font(.system(size: 13)).foregroundStyle(Ink.secondary).fixedSize(horizontal: false, vertical: true)
        if failed {
          Text(LocalToolAsk.failure).font(.system(size: 13)).foregroundStyle(Ink.danger).accessibilityAddTraits(.isStaticText)
        }
      }
      HStack(spacing: 8) {
        Button("Always allow") { answer(.always) }
          .buttonStyle(.borderedProminent).tint(Ink.primary)
          .disabled(!enabled || alwaysBlocked != nil)
          .help(alwaysBlocked ?? "")
        Button("Allow once") { answer(.allowOnce) }.buttonStyle(.bordered).disabled(!enabled)
        Button("Never") { answer(.never) }.buttonStyle(.bordered).disabled(!enabled)
      }
      .controlSize(.regular)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Ink.hairline, lineWidth: 1))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Local tool permission")
    .onAppear { watchEscape() }
    .onDisappear { if let escape { NSEvent.removeMonitor(escape) }; escape = nil }
  }

  /**
   * Esc denies once, as the window's listener does: not repeated, no
   * modifier, not in a text field, and nothing else (a sheet, the palette)
   * in front of the window.
   */
  private func watchEscape() {
    guard escape == nil else { return }
    escape = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      guard event.keyCode == 53, !event.isARepeat, event.modifierFlags.intersection([.command, .control, .option, .shift]).isEmpty,
            let window = event.window, window === MacServices.shared.mainWindow, window.attachedSheet == nil,
            !((window.firstResponder as? NSTextView)?.isFieldEditor ?? false),
            !submitting, store.backend != nil else { return event }
      answer(.deny)
      return nil
    }
  }

  /**
   * The answer (`OLn`): Always allow and Never change the setting first and
   * fall back to once when it did not take (a team's ceiling); Allow once is
   * written down here first, or the hands would refuse what the computer
   * then asks; then the computer is told.
   */
  private func answer(_ resolution: LocalToolAsk.Resolution) {
    guard !submitting else { return }
    submitting = true
    failed = false
    Task {
      var sent = resolution
      if resolution == .always || resolution == .never {
        let wanted: LocalToolPermission = resolution == .always ? .always : .never
        let now = await permission.choose(wanted, store: store)
        if now != wanted { sent = resolution == .always ? .allowOnce : .deny }
      }
      if sent == .allowOnce {
        MacLocalPermission.approvals.record(LocalToolApproval(id: ask.requestId, action: ask.action, target: ask.target))
      }
      do {
        guard let backend = store.backend else { throw GatewayError(message: "Not signed in.", refused: true) }
        _ = try await backend.command("resolveLocalToolPermission", ["entryId": .string(ask.entryId), "requestId": .string(ask.requestId), "resolution": .string(sent.rawValue), "agentId": .string(agentId)])
      } catch {
        submitting = false
        failed = true
      }
    }
  }
}
