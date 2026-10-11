import AppKit
import SwiftUI
import SimeonCore

/**
 * What the Plugins overlay (step 9, K01–K09) knows and does, as the
 * window's overlay does it (`view-B5Ug8wEm.js`): the catalog, the
 * computer's servers and plugins, the open agent's skills; Add (with its
 * setup page when a plugin needs values), Uninstall and Remove, each
 * account's sign-in in the browser (Reopen, and Retry after ten minutes),
 * the tools' switches, a skill's Save and Delete, the GitHub banner's Fix
 * with agent, and the notice that says how each went. The rules and words
 * are SimeonCore's (`Plugins`), checked against the overlay's own
 * functions. The calls are the Mac app's first Plugins window's (9 October
 * 2026), checked again against the window and the box (mac/STEPS.md, step 9).
 */
@MainActor
@Observable
final class PluginsModel {
  enum Page: Hashable {
    case plugin(String)
    case installed(String)
    case setup(String)
    case skill(String)
  }

  enum Tab: Hashable { case marketplace, yours }

  /** A sign-in waiting in the browser (`PBn`): its page, when it was opened, and whether ten minutes have gone. */
  struct Flow: Equatable {
    let url: URL
    var openedAt: Date
    var timedOut: Bool
  }

  struct Setup: Equatable {
    let entryId: String
    let editing: Bool
  }

  // The view's state: forgotten when the overlay closes (`reset`).
  var tab = Tab.marketplace {
    didSet { if tab != oldValue { expanded = [] } }
  }
  var query = ""
  var marketplaceFilter = PluginFilter()
  var yoursFilter = PluginFilter()
  var path: [Page] = [] {
    didSet { if path.count < oldValue.count { expanded = [] } }
  }
  var setup: Setup?
  /** Sections opened with "Show N more" (and Yours' "Show all"); folded again when the list is drawn anew (a tab, Back). */
  var expanded: Set<String> = []
  var notice: Plugins.Notice?

  // What the computer says.
  var catalog: [PluginEntry] = []
  var catalogLoaded = false
  var servers: [PluginServer] = []
  var plugins: [EffectivePlugin] = []
  var tools: [String: [PluginTool]] = [:]
  var toolFailures: [String: String] = [:]
  var skills: [AgentSkill] = []
  var authBlocked: [String] = []
  /** Sign-ins waiting in the browser, by key (`Plugins.signInKey`); kept across openings, as the window keeps them. */
  var flows: [String: Flow] = [:]
  /** Catalog logos read so far (`resolvePluginLogo`), by address. */
  var logos: [String: NSImage] = [:]

  var busy = 0
  var adding: String?
  var launchingFix = false
  @ObservationIgnored weak var store: AppStore?
  @ObservationIgnored private var noticeTask: Task<Void, Never>?
  @ObservationIgnored private var lastOpen = Date.distantPast
  @ObservationIgnored private var logoReads: Set<String> = []

  var isBusy: Bool { busy > 0 }
  var filter: PluginFilter {
    get { tab == .marketplace ? marketplaceFilter : yoursFilter }
    set { if tab == .marketplace { marketplaceFilter = newValue } else { yoursFilter = newValue } }
  }

  var onePerServer: [PluginServer] { Plugins.onePerServer(servers) }
  var effective: [String: EffectivePlugin] { Dictionary(plugins.map { ($0.pluginId, $0) }, uniquingKeysWith: { _, last in last }) }

  func installed(_ entry: PluginEntry) -> Plugins.Installed {
    let deduped = onePerServer
    return Plugins.installed(entry, servers: deduped, byName: Plugins.byName(deduped), plugins: effective)
  }

  var yoursItems: [PluginItem] { Plugins.items(onePerServer, catalog: catalog, plugins: plugins) }

  /** Signed out: nothing of this account's is kept for the next one. */
  func forget() {
    reset()
    catalog = []
    catalogLoaded = false
    servers = []
    plugins = []
    tools = [:]
    toolFailures = [:]
    skills = []
    authBlocked = []
    flows = [:]
  }

  /** Closing forgets the view: Marketplace, no search, no filters, no page (measured). */
  func reset() {
    tab = .marketplace
    query = ""
    marketplaceFilter = PluginFilter()
    yoursFilter = PluginFilter()
    path = []
    setup = nil
    expanded = []
    show(nil)
  }

  // MARK: Reading

  private func call(_ method: String, _ args: JSON) async throws -> JSON {
    guard let backend = store?.backend else { throw GatewayError(message: "Sign in to Simeon first.", refused: true) }
    return try await backend.command(method, args)
  }

  private func mcp(_ action: String, _ args: [JSON] = []) async throws -> JSON {
    try await call("desktopMcp", ["action": .string(action), "args": .array(args)])
  }

  /** Opening (`getMcpState`, `getEffectivePlugins`, the sync status, a sync, the agent's skills); the catalog once it is in. */
  func load(agentId: String?) async {
    // This opening's catalog: a page asked for by a link waits for it, not for the last opening's.
    catalogLoaded = false
    async let catalogAnswer = try? mcp("getCatalog")
    async let pluginsAnswer = try? mcp("listEffectivePlugins")
    await refreshServers()
    if let answer = await catalogAnswer {
      catalog = (answer.array ?? answer["plugins"]?.array ?? []).compactMap(PluginEntry.init(json:))
    }
    catalogLoaded = true
    if let answer = await pluginsAnswer { plugins = (answer.array ?? []).compactMap(EffectivePlugin.init(json:)) }
    await loadSkills(agentId)
    await readSyncStatus()
    // The one sync its opening starts; the banner is read again after it.
    Task {
      _ = try? await self.call("syncPluginSkills", [:])
      await self.readSyncStatus()
    }
  }

  /** The banner's plugins (`getPluginSyncStatus`). */
  func readSyncStatus() async {
    if let status = try? await call("getPluginSyncStatus", [:]) {
      authBlocked = (status["authBlocked"]?.array ?? []).map { $0["pluginName"]?.string ?? "" }
    }
  }

  func refreshServers() async {
    guard let answer = try? await mcp("listServers") else { return }
    apply(servers: answer)
  }

  private func apply(servers answer: JSON?) {
    guard let rows = answer?["servers"]?.array ?? answer?.array else { return }
    // Only a change redraws the list and the page (the servers are read every 15 s).
    let next = rows.compactMap(PluginServer.init(json:))
    if next != servers { servers = next }
    // A sign-in whose account now says connected is over.
    for key in flows.keys where servers.contains(where: { Plugins.signInKey($0.serverIdentifier) == key && $0.status == "connected" }) { flows[key] = nil }
  }

  private func refreshPlugins() async {
    if let answer = try? await mcp("listEffectivePlugins") { plugins = (answer.array ?? []).compactMap(EffectivePlugin.init(json:)) }
  }

  func loadSkills(_ agentId: String?) async {
    guard let agentId else { skills = []; return }
    if let answer = try? await call("getAgentWorkflows", ["id": .string(agentId)]) {
      skills = (answer.array ?? []).compactMap(AgentSkill.init(json:))
    }
  }

  func loadTools(_ serverId: String) async {
    guard let answer = try? await mcp("listServerTools", [.string(serverId)]) else { return }
    tools[serverId] = (answer.array ?? []).compactMap(PluginTool.init(json:))
  }

  /** A catalog entry's logo (`getMcpPluginLogo`): the box answers with a data URL (SVG or PNG); read once per address. */
  func loadLogo(_ address: String) async {
    guard logos[address] == nil, !logoReads.contains(address) else { return }
    logoReads.insert(address)
    guard let answer = try? await mcp("resolvePluginLogo", [.string(address)]),
          let source = answer.string ?? answer["src"]?.string,
          let image = Self.decode(source) else { return }
    logos[address] = image
  }

  /** A data URL's picture: base64, or the words of an SVG as they are (URL-encoded). */
  static func decode(_ source: String) -> NSImage? {
    guard source.hasPrefix("data:"), let comma = source.firstIndex(of: ",") else { return nil }
    let head = source[source.startIndex..<comma]
    let body = String(source[source.index(after: comma)...])
    let data = head.hasSuffix(";base64") ? Data(base64Encoded: body) : (body.removingPercentEncoding ?? body).data(using: .utf8)
    return data.flatMap(NSImage.init(data:))
  }

  // MARK: Notices (`TKn`)

  func show(_ next: Plugins.Notice?) {
    noticeTask?.cancel()
    notice = next
    guard let next else { return }
    noticeTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(next.seconds * 1_000_000_000))
      guard !Task.isCancelled else { return }
      self?.notice = nil
    }
  }

  private func fail(_ error: Error) { show(Plugins.Notice(isError: true, text: error.localizedDescription)) }

  /** One of the overlay's busy actions, its failure as the notice (`runReportingNotice`). */
  private func reporting(_ work: () async throws -> Void) async {
    busy += 1
    defer { busy -= 1 }
    do { try await work() } catch { fail(error) }
  }

  // MARK: Add, setup, remove

  /** Add (`Ct`): a skills-only plugin needs an agent; one with values to give opens its setup page; else it is installed and its skills synced. */
  func add(_ entry: PluginEntry, agentId: String?) async {
    show(nil)
    let team = effective[entry.id]?.hasTeamConfiguredVariables == true
    if entry.connectorList.isEmpty {
      guard let agentId else { show(Plugins.needsAgentNotice); return }
      adding = entry.id
      defer { adding = nil }
      guard await install(entry.id, values: [:], team: team) else { return }
      let synced = await syncSkills(entry, agentId: agentId)
      show(synced.error.map { Plugins.skillsDidntSyncNotice(entry.displayName, $0) } ?? Plugins.skillsAddedNotice(entry.displayName, added: synced.added))
      return
    }
    if Plugins.needsSetupPage(entry, teamConfigured: team) {
      setup = Setup(entryId: entry.id, editing: false)
      path.append(.setup(entry.id))
      return
    }
    adding = entry.id
    defer { adding = nil }
    guard await install(entry.id, values: [:], team: team) else { return }
    let synced = await syncSkills(entry, agentId: agentId)
    show(Plugins.addedNotice(entry.displayName, added: synced.added, failed: [], error: synced.error))
  }

  /** `installEntry`; a vendor's own server then opens its sign-in in the browser, as Electron's main process does. */
  private func install(_ entryId: String, values: [String: String], team: Bool) async -> Bool {
    busy += 1
    defer { busy -= 1 }
    var args: [String: JSON] = ["entryId": .string(entryId), "values": .object(values.mapValues(JSON.string))]
    if team { args["hasTeamConfiguredVariables"] = .bool(true) }
    do {
      let state = try await mcp("installEntry", [.object(args)])
      apply(servers: state)
      await refreshPlugins()
      if let vendor = try? await mcp("vendorServerIdForPlugin", [.string(entryId)]), let serverId = vendor.text,
         let started = try? await mcp("authenticateServer", [.string(serverId), .string(PluginServer.defaultAccount)]),
         let url = started["authorizationUrl"]?.text.flatMap(URL.init(string:)) {
        let name = catalog.first { $0.id == entryId }?.displayName ?? serverId
        await openSignIn(url, serverId: serverId, accountKey: PluginServer.defaultAccount, name: name)
      }
      return true
    } catch {
      fail(error)
      return false
    }
  }

  /** The skills step (`Is`): the agent's private copies of the plugin's skills dropped, then the box's plugin skills synced. */
  private func syncSkills(_ entry: PluginEntry, agentId: String?) async -> (added: Int, error: String?) {
    await dropPrivateCopies(entry, agentId: agentId)
    busy += 1
    defer { busy -= 1 }
    do {
      let answer = try await call("syncPluginSkills", [:])
      await readSyncStatus()
      await loadSkills(agentId)
      return ((answer.array ?? []).filter { $0["pluginId"]?.string == entry.id }.count, nil)
    } catch {
      return (0, error.localizedDescription)
    }
  }

  private func dropPrivateCopies(_ entry: PluginEntry, agentId: String?) async {
    guard let agentId else { return }
    let sources = Set((entry.skills ?? []).compactMap(\.sourceUrl))
    guard !sources.isEmpty else { return }
    for skill in skills where skill.sourceRef.map(sources.contains) == true {
      _ = try? await call("deleteAgentWorkflow", ["id": .string(agentId), "workflowId": .string(skill.id)])
    }
  }

  /** Edit Values (`Ze`): the setup page, its values never shown. */
  func editValues(_ entry: PluginEntry) {
    guard entry.hasSetupFields else { return }
    show(nil)
    setup = Setup(entryId: entry.id, editing: true)
    path.append(.setup(entry.id))
  }

  /** The setup page's button (`At`): install with the values, or replace them; then back one page. */
  func submitSetup(_ values: [String: String], agentId: String?) async {
    guard let setup else { return }
    let entry = catalog.first { $0.id == setup.entryId }
    let name = entry?.displayName ?? "the plugin"
    show(nil)
    await reporting {
      if setup.editing {
        _ = try await mcp("updatePluginInstall", [["pluginId": .string(setup.entryId), "values": .object(values.mapValues(JSON.string))]])
        show(Plugins.setupSavedNotice(name))
      } else {
        guard await install(setup.entryId, values: values, team: false) else { return }
        if let entry {
          let synced = await syncSkills(entry, agentId: agentId)
          show(Plugins.addedNotice(name, added: synced.added, failed: [], error: synced.error))
        } else {
          show(Plugins.Notice(isError: false, text: "Added \(name)"))
        }
      }
      self.setup = nil
      // Back to where Add or Edit Values was pressed, unless the person went back already.
      if path.last == .setup(setup.entryId) { path.removeLast() }
    }
  }

  /** Uninstall or Remove of a server (`dn`). */
  func remove(serverId: String, agentId: String?) async {
    guard let server = onePerServer.first(where: { $0.id == serverId }) else { return }
    show(nil)
    await reporting {
      let answer = try await mcp("removeServer", [.string(serverId)])
      apply(servers: answer["state"])
      let removed = answer["removed"]?.bool == true
      let reason = answer["reason"]?.string
      show(Plugins.removedNotice(server.name, removed: removed, reason: reason))
      let entry = Plugins.entry(for: server, in: catalog)
      if let entry, removed || reason == "team-server" {
        await dropPrivateCopies(entry, agentId: agentId)
        _ = try? await call("syncPluginSkills", [:])
        await loadSkills(agentId)
      }
      // A server no entry claims has no page left.
      if removed && entry == nil && path.last == .installed(serverId) { path.removeLast() }
    }
  }

  /** Uninstall of a plugin (`Tt`); the page stays, now with Add. */
  func uninstall(pluginId: String, agentId: String?) async {
    let entry = catalog.first { $0.id == pluginId }
    let name = entry?.displayName ?? effective[pluginId]?.displayName ?? "the plugin"
    show(nil)
    await reporting {
      let answer = try await mcp("uninstallPlugin", [.string(pluginId)])
      apply(servers: answer["state"])
      await refreshPlugins()
      let removed = answer["removed"]?.bool == true
      let reason = answer["reason"]?.string
      show(Plugins.removedNotice(name, removed: removed, reason: reason))
      if let entry, removed || reason == "team-server" {
        await dropPrivateCopies(entry, agentId: agentId)
        _ = try? await call("syncPluginSkills", [:])
        await loadSkills(agentId)
      }
    }
  }

  // MARK: Sign-in (`PBn`, `Qn`)

  /** The key of an account's sign-in: its own row's identifier, else the server's with the account's name. */
  func signInKey(_ server: PluginServer, accountKey: String) -> String {
    let identifier = Plugins.accounts(servers, of: server.id).first { $0.accountKey == accountKey }?.serverIdentifier
      ?? (accountKey == PluginServer.defaultAccount ? server.rowServerIdentifier : "\(server.rowServerIdentifier)--\(accountKey)")
    return Plugins.signInKey(identifier)
  }

  func signInState(_ server: PluginServer, accountKey: String) -> Plugins.SignInState {
    guard let flow = flows[signInKey(server, accountKey: accountKey)] else { return .none }
    return flow.timedOut ? .timedOut : .waiting
  }

  /** The sign-in button: Reopen opens the waiting page again; Authenticate and Retry ask the box for a sign-in (no trigger: the overlay's own). */
  func signIn(_ server: PluginServer, accountKey: String) async {
    let key = signInKey(server, accountKey: accountKey)
    if let flow = flows[key], !flow.timedOut {
      flows[key]?.openedAt = Date()
      expire(key, opened: flows[key]?.openedAt ?? Date())
      await openSignIn(flow.url, serverId: server.id, accountKey: accountKey, name: server.name)
      return
    }
    show(nil)
    await reporting {
      let answer = try await mcp("authenticateServer", [.string(server.id), .string(accountKey)])
      let status = answer["status"]?.string ?? ""
      if status == "started", let url = answer["authorizationUrl"]?.text.flatMap(URL.init(string:)) {
        let opened = Date()
        flows[key] = Flow(url: url, openedAt: opened, timedOut: false)
        expire(key, opened: opened)
        await openSignIn(url, serverId: server.id, accountKey: accountKey, name: server.name)
      }
      show(Plugins.signInNotice(status: status, message: answer["message"]?.string))
      await refreshServers()
    }
  }

  private func expire(_ key: String, opened: Date) {
    Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(Plugins.signInTimeout * 1_000_000_000))
      guard let self, let flow = self.flows[key], flow.openedAt == opened else { return }
      self.flows[key]?.timedOut = true
    }
  }

  /**
   * The sign-in page, at least 0.9 s after the last one: since the Apple
   * design pass in the app's own sign-in sheet on the window
   * (`MacConnector`; the Electron app opened the browser), closed by itself
   * once the box says the account is connected. Not waited for: the page
   * and its buttons are free while it is open.
   */
  private func openSignIn(_ url: URL, serverId: String, accountKey: String, name: String) async {
    let wait = Plugins.signInSpacing - Date().timeIntervalSince(lastOpen)
    if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
    lastOpen = Date()
    Task { [weak self] in
      await MacConnector.shared.signIn(url, name: name) {
        guard let self else { return true }
        await self.refreshServers()
        return Plugins.accounts(self.servers, of: serverId).first { $0.accountKey == accountKey }?.status == "connected"
      }
    }
  }

  /**
   * Add, the consent first when the plugin brings an app to sign in to
   * (the Apple design pass: the iPhone's step before every connect); a
   * skills-only plugin is added at once.
   */
  func requestAdd(_ entry: PluginEntry, agentId: String?) {
    guard !entry.connectorList.isEmpty else {
      Task { await add(entry, agentId: agentId) }
      return
    }
    MacConnector.shared.ask(entry.displayName, store: store) { [weak self] in
      await self?.add(entry, agentId: agentId)
    }
  }

  /** The sign-in button: the consent first for a new sign-in (Authenticate, Retry); Reopen opens the waiting page again at once. */
  func requestSignIn(_ server: PluginServer, accountKey: String) {
    if let flow = flows[signInKey(server, accountKey: accountKey)], !flow.timedOut {
      Task { await signIn(server, accountKey: accountKey) }
      return
    }
    MacConnector.shared.ask(server.name, store: store) { [weak self] in
      await self?.signIn(server, accountKey: accountKey)
    }
  }

  // MARK: Tools and skills

  /** A tool's switch: changed at once, then asked of the box (`toggleMcpToolDisabled`); a failure is said under the tools and the switch goes back. */
  func toggle(_ tool: PluginTool, of serverId: String) async {
    if var list = tools[serverId], let index = list.firstIndex(where: { $0.name == tool.name }) {
      list[index].isDisabled.toggle()
      tools[serverId] = list
    }
    do {
      let answer = try await mcp("toggleMcpToolDisabled", [["serverId": .string(serverId), "toolName": .string(tool.name)]])
      tools[serverId] = (answer.array ?? []).compactMap(PluginTool.init(json:))
      toolFailures[serverId] = nil
      await refreshServers()
    } catch {
      toolFailures[serverId] = error.localizedDescription
      await loadTools(serverId)
    }
  }

  /** A private skill's switch; a failure is let go, as the overlay does. */
  func setEnabled(_ skill: AgentSkill, agentId: String?) async {
    guard let agentId else { return }
    if let answer = try? await call("setAgentWorkflowEnabled", ["id": .string(agentId), "workflowId": .string(skill.id), "isEnabled": .bool(!skill.isEnabledForAgent)]) {
      skills = (answer.array ?? []).compactMap(AgentSkill.init(json:))
    }
  }

  func save(_ skill: AgentSkill, name: String, description: String, body: String, agentId: String) async -> Bool {
    show(nil)
    let named = name.trimmingCharacters(in: .whitespacesAndNewlines)
    var spec: [String: JSON] = ["name": .string(named), "description": .string(description.trimmingCharacters(in: .whitespacesAndNewlines)), "body": .string(body)]
    if let trigger = skill.trigger { spec["trigger"] = trigger }
    if let sourceRef = skill.sourceRef { spec["sourceRef"] = .string(sourceRef) }
    do {
      let answer = try await call("updateAgentWorkflow", ["id": .string(agentId), "workflowId": .string(skill.id), "spec": .object(spec)])
      if let list = answer.array { skills = list.compactMap(AgentSkill.init(json:)) }
      show(Plugins.savedNotice(named))
      return true
    } catch {
      fail(error)
      return false
    }
  }

  func delete(_ skill: AgentSkill, agentId: String) async {
    show(nil)
    do {
      let answer = try await call("deleteAgentWorkflow", ["id": .string(agentId), "workflowId": .string(skill.id)])
      if let list = answer.array { skills = list.compactMap(AgentSkill.init(json:)) }
      show(Plugins.deletedNotice(skill.name))
      if path.last == .skill(skill.id) { path.removeLast() }
    } catch {
      fail(error)
    }
  }

  // MARK: Fix with agent (`si.launch`)

  /** The Plugin Setup agent: the one there is, else a new one told what to do; the agent's id once it can be opened. */
  func fixWithAgent() async -> String? {
    guard !launchingFix, let store else { return nil }
    if let existing = store.agents.first(where: { $0.purpose == Plugins.setupAgentPurpose }) { return existing.id }
    if store.isLoading { return nil }
    launchingFix = true
    defer { launchingFix = false }
    do {
      let answer = try await call("createAgent", [
        "name": .string(Plugins.setupAgentName), "description": .string(Plugins.setupAgentDescription),
        "purpose": .string(Plugins.setupAgentPurpose), "isIntroductionSuppressed": true,
      ])
      guard let id = answer["agent"]?["id"]?.text ?? answer["id"]?.text else { throw GatewayError(message: "createAgent: no agent in the answer", refused: true) }
      await store.reloadRoster()
      // The agent exists now: it opens even if its first message could not be sent, which the notice says.
      do { try await store.backend?.send(id, text: Plugins.setupAgentRequest, attachments: [], replyTo: nil) } catch {
        show(Plugins.agentFailedNotice(error.localizedDescription))
      }
      return id
    } catch {
      show(Plugins.agentFailedNotice(error.localizedDescription))
      return nil
    }
  }
}
