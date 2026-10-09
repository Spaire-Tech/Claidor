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
  func choose(_ value: LocalToolPermission, store: AppStore) async {
    isPending = true
    defer { isPending = false }
    settings.choice = value
    mirror()
    for attempt in 0..<3 {
      let permission = settings.effective
      if let backend = store.backend, let applied = try? await backend.command("setHostSettings", ["localToolPermission": .string(permission.rawValue)]), applied["localToolPermission"]?.string == permission.rawValue { break }
      try? await Task.sleep(nanoseconds: UInt64(250_000_000 * (attempt + 1)))
    }
  }

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
