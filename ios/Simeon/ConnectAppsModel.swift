import SwiftUI
import SimeonCore

/**
 * What Connect apps knows of the box besides the apps the store lists, and
 * what it does with it, as the Mac's Plugins window does
 * (mac/Simeon/PluginsModel.swift), through the same calls (SimeonCore's
 * `PluginCalls`): the catalog's entries (their setup values, connectors,
 * skills, marketplace and source), the servers and plugins (who added
 * what), the GitHub banner's plugins, and one agent's skills; Add's setup
 * page and Edit Values, Uninstall and Remove, a private skill's switch,
 * Save and Delete, Fix with agent, and the notice that says how each went
 * (the Mac's words, with the phone's tap under the finger). One for each
 * opening of the sheet, as the Mac's overlay forgets its view on closing.
 *
 * The Mac's open agent is the phone's chosen one: Settings opens Connect
 * apps from the list, not from a chat, so Yours › Private names the agent
 * whose skills it shows, the most recently active to start.
 */
@MainActor
@Observable
final class ConnectAppsModel {
  /** The setup page asked for: Add's, for a plugin that needs values, or Edit Values' on an added one. */
  struct Setup: Identifiable, Equatable {
    let entryId: String
    let editing: Bool
    var id: String { entryId }
  }

  // What the box says.
  var entries: [PluginEntry] = []
  var catalogLoaded = false
  var servers: [PluginServer] = []
  var serversLoaded = false
  var plugins: [EffectivePlugin] = []
  var skills: [AgentSkill] = []
  var authBlocked: [String] = []

  // The view's state.
  var marketplaceFilter = PluginFilter()
  var yoursFilter = PluginFilter()
  /** The agent whose private skills Yours shows, and that a skills-only plugin is added for (the Mac's open agent). */
  private(set) var agentId: String?
  var setup: Setup?
  var notice: Plugins.Notice?
  var busy = 0
  var adding: String?
  var launchingFix = false

  @ObservationIgnored weak var store: AppStore?
  @ObservationIgnored private var noticeTask: Task<Void, Never>?
  /** A vendor's sign-in after an install with setup values, opened once the setup page has gone (the system's sheet opens over the app, not over a sheet on its way out). */
  @ObservationIgnored private var pendingSignIn: ConnectedApp?

  var isBusy: Bool { busy > 0 }
  var onePerServer: [PluginServer] { Plugins.onePerServer(servers) }
  var effective: [String: EffectivePlugin] { Dictionary(plugins.map { ($0.pluginId, $0) }, uniquingKeysWith: { _, last in last }) }
  var yoursItems: [PluginItem] { Plugins.items(onePerServer, catalog: entries, plugins: plugins) }

  func entry(_ id: String) -> PluginEntry? { entries.first { $0.id == id } }

  /** The entry an app of Your plugins belongs to (`Ue`): by its server's plugin, else by name. */
  func entry(for app: ConnectedApp) -> PluginEntry? {
    if let server = onePerServer.first(where: { $0.id == app.serverId }) { return Plugins.entry(for: server, in: entries) }
    if let id = app.pluginId, let found = entry(id) { return found }
    let key = app.name.lowercased()
    return entries.first { $0.name.lowercased() == key || $0.displayName.lowercased() == key }
  }

  func installed(_ entry: PluginEntry) -> Plugins.Installed {
    let deduped = onePerServer
    return Plugins.installed(entry, servers: deduped, byName: Plugins.byName(deduped), plugins: effective)
  }

  /** Yours › Installed's row of a plugin (`rt`): its install mode, and its connectors' servers. */
  func item(of entry: PluginEntry) -> PluginItem? {
    yoursItems.first { if case .plugin(let found, _, _) = $0 { return found.id == entry.id }; return false }
  }

  /** Add opens the setup page first (`Bl`): the plugin asks for values, and the team has not set them. */
  func needsSetup(_ entry: PluginEntry) -> Bool {
    Plugins.needsSetupPage(entry, teamConfigured: effective[entry.id]?.hasTeamConfiguredVariables == true)
  }

  /** The agents Private can show: each one of the person's own (no groups, no one else's rooms). */
  var skillAgents: [Agent] { (store?.agents ?? []).filter { !$0.isGroup && !$0.isRemoteRoom } }

  // MARK: Reading

  private func calls() throws -> PluginCalls {
    guard let backend = store?.backend else { throw GatewayError(message: String(localized: "Sign in to Simeon first."), refused: true) }
    return PluginCalls(backend)
  }

  /** Opening, as the Mac's overlay opens: the catalog, the servers, the plugins, the agent's skills, the banner; then the one sync it starts, and the banner again. */
  func load() async {
    if agentId == nil { agentId = Self.recentAgent(skillAgents) }
    let reader = try? calls()
    async let catalogAnswer = try? reader?.catalog()
    async let pluginsAnswer = try? reader?.effectivePlugins()
    await refreshServers()
    if let list = await catalogAnswer { entries = list }
    catalogLoaded = true
    if let list = await pluginsAnswer { plugins = list }
    await loadSkills()
    await readSyncStatus()
    Task {
      _ = try? await reader?.syncSkills()
      await self.readSyncStatus()
    }
  }

  /** The most recently active of the person's agents: Private's to start. */
  static func recentAgent(_ agents: [Agent]) -> String? {
    let shown = agents.filter { !$0.isHidden }
    return (shown.isEmpty ? agents : shown).max { ($0.lastActivityAt ?? 0) < ($1.lastActivityAt ?? 0) }?.id
  }

  func readSyncStatus() async {
    if let names = try? await calls().authBlocked() { authBlocked = names }
  }

  func refreshServers() async {
    guard let next = try? await calls().servers() else { return }
    apply(servers: next)
  }

  private func apply(servers next: [PluginServer]?) {
    guard let next else { return }
    if next != servers { servers = next }
    serversLoaded = true
  }

  func refreshPlugins() async {
    if let list = try? await calls().effectivePlugins() { plugins = list }
  }

  func loadSkills() async {
    guard let agentId else { skills = []; return }
    if let list = try? await calls().skills(agentId) { skills = list }
  }

  /** Private's agent chosen: its skills read. */
  func choose(agent id: String) async {
    guard id != agentId else { return }
    agentId = id
    skills = []
    await loadSkills()
  }

  // MARK: The notice (`TKn`)

  func show(_ next: Plugins.Notice?) {
    noticeTask?.cancel()
    notice = next
    guard let next else { return }
    if next.isError { Haptics.warning() } else { Haptics.success() }
    noticeTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(next.seconds * 1_000_000_000))
      guard !Task.isCancelled else { return }
      self?.notice = nil
    }
  }

  private func fail(_ error: Error) { show(Plugins.Notice(isError: true, text: PlainWords.error(error.localizedDescription))) }

  /** One of the busy actions, its failure as the notice (`runReportingNotice`). */
  private func reporting(_ work: () async throws -> Void) async {
    busy += 1
    defer { busy -= 1 }
    do { try await work() } catch { fail(error) }
  }

  // MARK: Add, setup, remove

  /**
   * A skills-only plugin's Add (`Ct`): it needs an agent, is installed, and
   * its skills synced. The rest go through the consent: then the setup page
   * when it asks for values (`needsSetup`), else the phone's own connect
   * (AppConnector: installed, then signed in), followed by `connected`.
   */
  func addSkills(_ entry: PluginEntry) async {
    show(nil)
    guard let agentId else { show(Plugins.needsAgentNotice); return }
    let team = effective[entry.id]?.hasTeamConfiguredVariables == true
    adding = entry.id
    defer { adding = nil }
    guard await install(entry.id, values: [:], team: team) else { return }
    let synced = await syncSkills(entry, agentId: agentId)
    show(synced.error.map { Plugins.skillsDidntSyncNotice(entry.displayName, $0) } ?? Plugins.skillsAddedNotice(entry.displayName, added: synced.added))
    signInAfterSetup()
  }

  /**
   * After the phone's Connect (`Connecting`): connected, its skills synced as
   * the Mac's Add syncs them and "Connected Gmail" said; cancelled, "Gmail
   * wasn't connected" (the app it added is gone again); closed on the
   * vendor's page before the computer said so, that it is finishing. No
   * sign-in at all: the store's problem has said why.
   */
  func connectEnded(_ entry: PluginEntry?, name: String, end: SignInEnd?) async {
    await refreshPlugins()
    await refreshServers()
    let shown = entry?.displayName ?? name
    switch end {
    case .connected?:
      guard store?.isConnected(name) == true else { return }
      guard let entry else { show(Connecting.connectedNotice(shown, skills: 0, error: nil)); return }
      let synced = await syncSkills(entry, agentId: agentId)
      show(Connecting.connectedNotice(shown, skills: synced.added, error: synced.error))
    case .cancelled?:
      show(Connecting.notConnectedNotice(shown))
    case .unconfirmed?:
      show(Connecting.stillConnectingNotice(shown))
    case .replaced?, nil:
      break
    }
  }

  /** `installEntry`; a vendor's own server then has its sign-in opened, once the setup page has gone. */
  private func install(_ entryId: String, values: [String: String], team: Bool) async -> Bool {
    busy += 1
    defer { busy -= 1 }
    do {
      let box = try calls()
      apply(servers: try await box.install(entryId, values: values, team: team))
      await refreshPlugins()
      if let serverId = await box.vendorServerId(entryId) {
        let name = entry(entryId)?.displayName ?? serverId
        pendingSignIn = ConnectedApp(serverId: serverId, name: name, pluginId: entryId, accountKey: PluginServer.defaultAccount, status: "needsAuth", toolCount: 0)
      }
      Task { await store?.loadApps() }
      return true
    } catch {
      fail(error)
      return false
    }
  }

  /** The vendor's sign-in an install left waiting, in the system's sheet (not waited for); then how it went, as Connect says it. */
  func signInAfterSetup() {
    guard let account = pendingSignIn, let store else { return }
    pendingSignIn = nil
    Task {
      let end = await AppConnector.shared.signIn(account, store: store)
      await self.connectEnded(account.pluginId.flatMap { self.entry($0) }, name: account.name, end: end)
    }
  }

  /** The skills step (`Is`): the agent's private copies of the plugin's skills dropped, then the box's plugin skills synced. */
  private func syncSkills(_ entry: PluginEntry, agentId: String?) async -> (added: Int, error: String?) {
    await dropPrivateCopies(entry, agentId: agentId)
    busy += 1
    defer { busy -= 1 }
    do {
      let added = try await calls().syncSkills(of: entry.id)
      await readSyncStatus()
      await loadSkills()
      return (added, nil)
    } catch {
      return (0, PlainWords.error(error.localizedDescription))
    }
  }

  private func dropPrivateCopies(_ entry: PluginEntry, agentId: String?) async {
    guard let box = try? calls() else { return }
    await box.dropPrivateCopies(of: entry, from: skills, agentId: agentId)
  }

  /** Edit Values (`Ze`): the setup page, its values never shown. */
  func editValues(_ entry: PluginEntry) {
    guard entry.hasSetupFields else { return }
    show(nil)
    setup = Setup(entryId: entry.id, editing: true)
  }

  /** The setup page's button (`At`): install with the values, or replace them; the page goes once it is done. */
  func submitSetup(_ values: [String: String]) async {
    guard let setup else { return }
    let entry = self.entry(setup.entryId)
    let name = entry?.displayName ?? String(localized: "the plugin")
    show(nil)
    await reporting {
      if setup.editing {
        try await calls().updateInstall(setup.entryId, values: values)
        show(Plugins.setupSavedNotice(name))
      } else {
        adding = setup.entryId
        defer { adding = nil }
        guard await install(setup.entryId, values: values, team: false) else { return }
        if pendingSignIn != nil {
          // Its sign-in opens once this page has gone (`signInAfterSetup`), and says how it went: not "Added" before it is connected.
        } else if let entry {
          let synced = await syncSkills(entry, agentId: agentId)
          show(Plugins.addedNotice(name, added: synced.added, failed: [], error: synced.error))
        } else {
          show(Plugins.Notice(isError: false, text: String(localized: "Added \(name)")))
        }
      }
      if self.setup == setup { self.setup = nil }
    }
  }

  /** Uninstall or Remove of a server (`dn`); whether it went. */
  func remove(serverId: String) async -> Bool {
    guard let server = onePerServer.first(where: { $0.id == serverId }) else { return false }
    show(nil)
    var removed = false
    await reporting {
      let removal = try await calls().removeServer(serverId)
      apply(servers: removal.servers)
      removed = removal.removed
      show(Plugins.removedNotice(server.name, removed: removal.removed, reason: removal.reason))
      if let entry = Plugins.entry(for: server, in: entries), removal.resyncsSkills {
        await dropPrivateCopies(entry, agentId: agentId)
        _ = try? await calls().syncSkills()
        await loadSkills()
      }
    }
    await store?.loadApps()
    return removed
  }

  /** Uninstall of a plugin (`Tt`); the page stays, now with Add. */
  func uninstall(pluginId: String) async {
    let entry = self.entry(pluginId)
    let name = entry?.displayName ?? effective[pluginId]?.displayName ?? String(localized: "the plugin")
    show(nil)
    await reporting {
      let removal = try await calls().uninstallPlugin(pluginId)
      apply(servers: removal.servers)
      await refreshPlugins()
      show(Plugins.removedNotice(name, removed: removal.removed, reason: removal.reason))
      if let entry, removal.resyncsSkills {
        await dropPrivateCopies(entry, agentId: agentId)
        _ = try? await calls().syncSkills()
        await loadSkills()
      }
    }
    await store?.loadApps()
  }

  // MARK: Skills

  /** A private skill's switch; a failure is let go, as the overlay does. */
  func setEnabled(_ skill: AgentSkill) async {
    guard let agentId else { return }
    if let list = try? await calls().setSkillEnabled(skill, !skill.isEnabledForAgent, agentId: agentId) { skills = list }
  }

  func save(_ skill: AgentSkill, name: String, description: String, body: String) async -> Bool {
    guard let agentId else { return false }
    show(nil)
    let named = name.trimmingCharacters(in: .whitespacesAndNewlines)
    do {
      if let list = try await calls().updateSkill(skill, name: name, description: description, body: body, agentId: agentId) { skills = list }
      show(Plugins.savedNotice(named))
      return true
    } catch {
      fail(error)
      return false
    }
  }

  /** Delete skill; whether it went (its page closes then). */
  func delete(_ skill: AgentSkill) async -> Bool {
    guard let agentId else { return false }
    show(nil)
    do {
      if let list = try await calls().deleteSkill(skill.id, agentId: agentId) { skills = list }
      show(Plugins.deletedNotice(skill.name))
      return true
    } catch {
      fail(error)
      return false
    }
  }

  // MARK: Fix with agent (`si.launch`)

  /** The Plugin Setup agent: the one there is, else a new one told what to do; the agent's id once it can be opened. */
  func fixWithAgent() async -> String? {
    guard !launchingFix, let store else { return nil }
    if let existing = Plugins.setupAgent(in: store.agents) { return existing.id }
    if store.isLoading { return nil }
    launchingFix = true
    defer { launchingFix = false }
    let made = await store.makePluginSetupAgent()
    if let failure = made.failure { show(Plugins.agentFailedNotice(failure)) }
    return made.id
  }
}
