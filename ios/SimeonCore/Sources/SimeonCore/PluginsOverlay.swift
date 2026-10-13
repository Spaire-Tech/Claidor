import Foundation

/**
 * The Plugins overlay's words and small rules that sit around the list
 * rules in Plugins.swift, read from the same chunk (`view-B5Ug8wEm.js`) and
 * the main bundle (step 9's spec, §10.3): the empty lines, the team's
 * labels and actions, the status words' tone, a sign-in's progress
 * (`PBn`), the setup form (`Di`), a server's Details (`wi`), the page
 * title (`Rt`), the skill page's Save, and the notices the overlay says.
 */
extension Plugins {
  // MARK: Empty lines (`oi`, Yours' sections)

  public static let loadingMarketplace = "Loading the marketplace…"
  public static let noFilterMatch = "No plugins match the current filters"
  public static let marketplaceUnavailable = "The marketplace isn't available right now. Check back later."

  /** Marketplace with nothing to draw: loading, a filter, a search, or no catalog (a failed read says the same). */
  public static func marketplaceEmpty(loaded: Bool, catalogEmpty: Bool, filterSet: Bool, query: String) -> String {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    if !loaded && catalogEmpty { return loadingMarketplace }
    if filterSet { return noFilterMatch }
    if !q.isEmpty { return "No plugins match \"\(q)\"" }
    return marketplaceUnavailable
  }

  /** Yours › Installed with nothing in it. */
  public static func installedEmpty(query: String) -> String {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    return q.isEmpty ? "Nothing installed yet. Find plugins in the Marketplace tab." : "No installed plugins match \"\(q)\""
  }

  /** Yours › Private with nothing in it. */
  public static func privateEmpty(agentOpen: Bool, query: String) -> String {
    let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
    if !agentOpen { return "Open an agent to see its private skills" }
    return q.isEmpty ? "No private skills yet. Ask your Agent to create one for you." : "No private skills match \"\(q)\""
  }

  // MARK: The team's (`ct`, `hi`, `Xn`)

  /** What a team install says beside it: "Managed by your team", "Added by your team", or nothing. */
  public static func modeLabel(_ mode: PluginInstallMode) -> String? {
    switch mode {
    case .teamRequired: return "Managed by your team"
    case .teamDefault: return "Added by your team"
    case .user: return nil
    }
  }

  /** A page's action at the top right (`ft`). */
  public enum PageAction: Equatable, Sendable {
    /** Not installed: Add (the blue). */
    case add
    /** Installed by the person. */
    case uninstall
    /** Added by the team: its label, then Remove. */
    case remove(label: String)
    /** Required by the team: its label alone. */
    case managed(label: String)
  }

  public static func pageAction(installed: Bool, mode: PluginInstallMode?) -> PageAction {
    guard installed, let mode else { return .add }
    switch mode {
    case .user: return .uninstall
    case .teamDefault: return .remove(label: "Added by your team")
    case .teamRequired: return .managed(label: "Managed by your team")
    }
  }

  /** A Marketplace row's Team mark (`Xn`): an entry from a marketplace, not from the person's own publisher; its tooltip the marketplace's name. */
  public static func teamMark(_ entry: PluginEntry) -> String? {
    guard let market = entry.marketplace, entry.publisher?.isUserOwned != true else { return nil }
    return market.displayName
  }

  /** Add on an entry opens its setup page first (`Bl`): it asks for values, and the team has not set them. */
  public static func needsSetupPage(_ entry: PluginEntry, teamConfigured: Bool) -> Bool {
    entry.hasSetupFields && !teamConfigured
  }

  // MARK: Status (`pKn`)

  public enum Tone: Equatable, Sendable { case success, warning, danger, tertiary }

  /** The status word's colour: connected green, needs auth orange, error red, the rest grey. */
  public static func tone(_ status: String) -> Tone {
    switch status {
    case "connected": return .success
    case "needsAuth": return .warning
    case "error": return .danger
    default: return .tertiary
    }
  }

  // MARK: Sign-in (`PBn`)

  /** A sign-in left waiting this long becomes Retry (`ABn`). */
  public static let signInTimeout: TimeInterval = 600
  /** Two sign-in pages are opened at least this far apart (`IBn`). */
  public static let signInSpacing: TimeInterval = 0.9

  /** A sign-in's key (`ene`): the account's server identifier lower-cased, only its letters and digits; kept as it is when it holds "--". */
  public static func signInKey(_ serverIdentifier: String) -> String {
    if serverIdentifier.contains("--") { return serverIdentifier }
    return String(serverIdentifier.lowercased().unicodeScalars.filter { ("a"..."z").contains($0) || ("0"..."9").contains($0) }.map(Character.init))
  }

  public enum SignInState: Equatable, Sendable { case none, waiting, timedOut }

  /**
   * The sign-in button's word (`Qn`): Connect, Reopen while the page is
   * waiting, Retry once it has waited ten minutes. Connect was Authenticate
   * until 13 October 2026 (the founder: "should just be a connect button";
   * `Connecting`).
   */
  public static func signInButton(_ state: SignInState) -> String {
    switch state {
    case .none: return Connecting.connect
    case .waiting: return "Reopen"
    case .timedOut: return "Retry"
    }
  }

  // MARK: The setup page (`Di`, `Mi`, `$i`, `Li`)

  /** The values a setup page starts with: each field's default (current values are never shown). */
  public static func setupStart(_ fields: [PluginEntry.Field]) -> [String: String] {
    Dictionary(fields.map { ($0.key, $0.defaultValue ?? "") }, uniquingKeysWith: { first, _ in first })
  }

  /** The required fields left blank. */
  public static func setupMissing(_ fields: [PluginEntry.Field], _ values: [String: String]) -> [PluginEntry.Field] {
    fields.filter { $0.isRequired && (values[$0.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  }

  /** What is sent: each value trimmed, the blank ones left out. */
  public static func setupValues(_ values: [String: String]) -> [String: String] {
    values.compactMapValues { value in
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
  }

  public static func setupIntro(_ name: String, editing: Bool) -> String {
    editing
      ? "Saving replaces all of \(name)'s setup values and applies them to its connectors. Current values aren't shown; a field left blank is cleared."
      : "\(name) needs a few values before it can be added"
  }

  public static func setupSubmit(_ name: String, editing: Bool) -> String { editing ? "Save Values" : "Add \(name)" }

  public static func requiredLine(_ label: String) -> String { "\(label) is required" }

  public static func fillInLine(missing: Int) -> String {
    missing > 1 ? "Fill in the required fields to continue" : "Fill in the required field to continue"
  }

  // MARK: A server's Details (`wi`, `Ii`, `Fl`)

  public static func transportWord(_ transport: String) -> String {
    switch transport {
    case "http": return "HTTP"
    case "sse": return "SSE"
    case "stdio": return "Command"
    default: return transport
    }
  }

  public static func sourceWord(isTeamServer: Bool) -> String { isTeamServer ? "Your team" : "Added manually" }

  /** The meta line of a server's page: its address's host. */
  public static func hostLine(_ url: String?) -> String? {
    guard let url, let host = URL(string: url)?.host, !host.isEmpty else { return nil }
    return host
  }

  /** "n of m enabled" once the tools are read, else the server's own count. */
  public static func toolsValue(_ tools: [PluginTool]?, count: Int) -> String {
    guard let tools, !tools.isEmpty else { return "\(count)" }
    return enabledLine(tools)
  }

  /** The Tools card's summary (`ht`). */
  public static func enabledLine(_ tools: [PluginTool]) -> String { "\(tools.filter { !$0.isDisabled }.count) of \(tools.count) enabled" }

  /** A value shown in Details: "—" when there is none. */
  public static func detailValue(_ value: String?) -> String {
    guard let value, !value.isEmpty else { return "—" }
    return value
  }

  // MARK: A skill's page (`Hi`)

  /** Save waits for an open agent, a change, and a name, a description and instructions, and for nothing saving. */
  public static func canSaveSkill(agentOpen: Bool, changed: Bool, name: String, description: String, body: String, saving: Bool) -> Bool {
    let filled = [name, description, body].allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    return agentOpen && changed && filled && !saving
  }

  public static let skillDescriptionHint = "Required. Describe when to use this skill."

  // MARK: More notices

  public static let needsAgentNotice = Notice(isError: true, text: "Open an agent to add skills")

  public static func skillsDidntSyncNotice(_ name: String, _ why: String) -> Notice {
    Notice(isError: true, text: "Added \(name), but its skills didn't sync: \(why)")
  }

  public static func setupSavedNotice(_ name: String) -> Notice { Notice(isError: false, text: "Saved \(name)'s setup values") }
  public static func savedNotice(_ name: String) -> Notice { Notice(isError: false, text: "Saved \(name)") }
  public static func deletedNotice(_ name: String) -> Notice { Notice(isError: false, text: "Deleted \(name)") }
  public static func agentFailedNotice(_ why: String) -> Notice { Notice(isError: true, text: "Couldn't start the agent: \(why)") }
}
