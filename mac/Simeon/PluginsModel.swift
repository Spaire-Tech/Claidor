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
 * 2026), checked again against the window and the box (mac/STEPS.md, step 9);
 * since 11 October 2026 they are SimeonCore's (`PluginCalls`), which the
 * iPhone's Connect apps makes too.
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

  /** The box's calls (SimeonCore's `PluginCalls`), or the overlay's words when no one is signed in. */
  private func calls() throws -> PluginCalls {
    guard let backend = store?.backend else { throw GatewayError(message: "Sign in to Simeon first.", refused: true) }
    return PluginCalls(backend)
  }

  /** Opening (`getMcpState`, `getEffectivePlugins`, the sync status, a sync, the agent's skills); the catalog once it is in. */
  func load(agentId: String?) async {
    // This opening's catalog: a page asked for by a link waits for it, not for the last opening's.
    catalogLoaded = false
    let reader = try? calls()
    async let catalogAnswer = try? reader?.catalog()
    async let pluginsAnswer = try? reader?.effectivePlugins()
    await refreshServers()
    if let entries = await catalogAnswer { catalog = entries }
    catalogLoaded = true
    if let list = await pluginsAnswer { plugins = list }
    await loadSkills(agentId)
    await readSyncStatus()
    // The one sync its opening starts; the banner is read again after it.
    Task {
      _ = try? await reader?.syncSkills()
      await self.readSyncStatus()
    }
  }

  /** The banner's plugins (`getPluginSyncStatus`). */
  func readSyncStatus() async {
    if let names = try? await calls().authBlocked() { authBlocked = names }
  }

  func refreshServers() async {
    guard let next = try? await calls().servers() else { return }
    apply(servers: next)
  }

  /** The servers an answer held (none: they stay as they were). */
  private func apply(servers next: [PluginServer]?) {
    guard let next else { return }
    // Only a change redraws the list and the page (the servers are read every 15 s).
    if next != servers { servers = next }
    // A sign-in whose account now says connected is over.
    for key in flows.keys where servers.contains(where: { Plugins.signInKey($0.serverIdentifier) == key && $0.status == "connected" }) { flows[key] = nil }
  }

  private func refreshPlugins() async {
    if let list = try? await calls().effectivePlugins() { plugins = list }
  }

  func loadSkills(_ agentId: String?) async {
    guard let agentId else { skills = []; return }
    if let list = try? await calls().skills(agentId) { skills = list }
  }

  func loadTools(_ serverId: String) async {
    guard let list = try? await calls().tools(serverId) else { return }
    tools[serverId] = list
  }

  /** A catalog entry's logo (`getMcpPluginLogo`): the box answers with a data URL (SVG or PNG); read once per address. */
  func loadLogo(_ address: String) async {
    guard logos[address] == nil, !logoReads.contains(address) else { return }
    logoReads.insert(address)
    guard let source = try? await calls().logo(address),
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

  private func fail(_ error: Error) { show(Plugins.Notice(isError: true, text: PlainWords.error(error.localizedDescription))) }

  /** One of the overlay's busy actions, its failure as the notice (`runReportingNotice`). */
  private func reporting(_ work: () async throws -> Void) async {
    busy += 1
    defer { busy -= 1 }
    do { try await work() } catch { fail(error) }
  }

  // MARK: Add, setup, remove

  /**
   * Add (`Ct`), Connect since 13 October 2026 (`Connecting`): a skills-only
   * plugin needs an agent; one with values to give opens its setup page;
   * else it is installed and its sign-in opened at once and waited for
   * (`connectAfterInstall`): "Connected" only once it is, and a sign-in the
   * person cancels takes the app back out. Before, the window said "Added"
   * while the sign-in opened (or silently didn't) on its own, and the app sat
   * in Yours under Authenticate.
   */
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
    let addedNow = !installed(entry).isInstalled
    guard await install(entry.id, values: [:], team: team) else { return }
    await connectAfterInstall(entry, addedNow: addedNow, agentId: agentId)
  }

  /** `installEntry` (the sign-in is the caller's: `connectAfterInstall`). */
  private func install(_ entryId: String, values: [String: String], team: Bool) async -> Bool {
    busy += 1
    defer { busy -= 1 }
    do {
      apply(servers: try await calls().install(entryId, values: values, team: team))
      await refreshPlugins()
      return true
    } catch {
      fail(error)
      return false
    }
  }

  /**
   * The sign-in of a plugin just installed, opened in the window and waited
   * for (`Connecting`): once connected, its skills synced and "Connected
   * Gmail" said; cancelled, or no sign-in to open, the app this connect
   * added (`addedNow`) taken back out and why said; closed on the vendor's
   * page before the computer said so, kept, as it may still finish. A
   * plugin whose server needs no sign-in is added as before.
   */
  private func connectAfterInstall(_ entry: PluginEntry, addedNow: Bool, agentId: String?) async {
    let name = entry.displayName
    guard let box = try? calls() else { return }
    let vendorId = await box.vendorServerId(entry.id)
    let row = vendorId.flatMap { id in servers.first { $0.id == id } } ?? servers.first { $0.pluginId == entry.id }
    let needsSignIn = vendorId != nil ? row?.status != "connected" : row?.status == "needsAuth"
    guard let serverId = vendorId ?? row?.id, needsSignIn else {
      let synced = await syncSkills(entry, agentId: agentId)
      show(row?.status == "connected"
        ? Connecting.connectedNotice(name, skills: synced.added, error: synced.error)
        : Plugins.addedNotice(name, added: synced.added, failed: [], error: synced.error))
      return
    }
    let accountKey = PluginServer.defaultAccount
    let answer: JSON
    do {
      answer = try await box.signIn(serverId, accountKey: accountKey)
    } catch {
      if addedNow { await takeBack(entry, serverId: serverId) }
      show(Plugins.Notice(isError: true, text: Connecting.didntConnect(name, why: PlainWords.error(error.localizedDescription))))
      return
    }
    if answer["status"]?.string == "already-authenticated" {
      await refreshServers()
      let synced = await syncSkills(entry, agentId: agentId)
      show(Connecting.connectedNotice(name, skills: synced.added, error: synced.error))
      return
    }
    guard let url = answer["authorizationUrl"]?.text.flatMap(URL.init(string:)) else {
      if addedNow { await takeBack(entry, serverId: serverId) }
      show(Plugins.Notice(isError: true, text: Connecting.didntConnect(name, why: answer["message"]?.string)))
      return
    }
    switch await openSignInAndWait(url, serverId: serverId, accountKey: accountKey, name: name) {
    case .connected:
      let synced = await syncSkills(entry, agentId: agentId)
      show(Connecting.connectedNotice(name, skills: synced.added, error: synced.error))
    case .cancelled:
      if addedNow { await takeBack(entry, serverId: serverId) }
      show(Connecting.notConnectedNotice(name))
    case .unconfirmed:
      show(Connecting.stillConnectingNotice(name))
    case .replaced:
      break
    }
  }

  /** A connect's app taken back out (`Connecting.undoes`): uninstalled again (`uninstallPlugin`, as Uninstall does), unless the computer says it connected after all. */
  private func takeBack(_ entry: PluginEntry, serverId: String) async {
    await refreshServers()
    if Plugins.accounts(servers, of: serverId).contains(where: { $0.status == "connected" }) { return }
    guard let removal = try? await calls().uninstallPlugin(entry.id) else { return }
    apply(servers: removal.servers)
    await refreshPlugins()
    await store?.loadApps()
  }

  /** The skills step (`Is`): the agent's private copies of the plugin's skills dropped, then the box's plugin skills synced. */
  private func syncSkills(_ entry: PluginEntry, agentId: String?) async -> (added: Int, error: String?) {
    await dropPrivateCopies(entry, agentId: agentId)
    busy += 1
    defer { busy -= 1 }
    do {
      let added = try await calls().syncSkills(of: entry.id)
      await readSyncStatus()
      await loadSkills(agentId)
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
    path.append(.setup(entry.id))
  }

  /** The setup page's button (`At`): install with the values, or replace them; then back one page, and a new one's sign-in as Connect opens it. */
  func submitSetup(_ values: [String: String], agentId: String?) async {
    guard let setup else { return }
    let entry = catalog.first { $0.id == setup.entryId }
    let name = entry?.displayName ?? "the plugin"
    show(nil)
    var installedNew = false
    await reporting {
      if setup.editing {
        try await calls().updateInstall(setup.entryId, values: values)
        show(Plugins.setupSavedNotice(name))
      } else {
        guard await install(setup.entryId, values: values, team: false) else { return }
        installedNew = true
      }
      self.setup = nil
      // Back to where Add or Edit Values was pressed, unless the person went back already.
      if path.last == .setup(setup.entryId) { path.removeLast() }
    }
    guard installedNew else { return }
    // Its sign-in, when it has one, outside the busy mark (the window stays usable while the page is open); the values given are kept whatever the sign-in does.
    if let entry {
      await connectAfterInstall(entry, addedNow: false, agentId: agentId)
    } else {
      show(Plugins.Notice(isError: false, text: "Added \(name)"))
    }
  }

  /** Uninstall or Remove of a server (`dn`). */
  func remove(serverId: String, agentId: String?) async {
    guard let server = onePerServer.first(where: { $0.id == serverId }) else { return }
    show(nil)
    await reporting {
      let removal = try await calls().removeServer(serverId)
      apply(servers: removal.servers)
      show(Plugins.removedNotice(server.name, removed: removal.removed, reason: removal.reason))
      let entry = Plugins.entry(for: server, in: catalog)
      if let entry, removal.resyncsSkills {
        await dropPrivateCopies(entry, agentId: agentId)
        _ = try? await calls().syncSkills()
        await loadSkills(agentId)
      }
      // A server no entry claims has no page left.
      if removal.removed && entry == nil && path.last == .installed(serverId) { path.removeLast() }
    }
  }

  /** Uninstall of a plugin (`Tt`); the page stays, now with Add. */
  func uninstall(pluginId: String, agentId: String?) async {
    let entry = catalog.first { $0.id == pluginId }
    let name = entry?.displayName ?? effective[pluginId]?.displayName ?? "the plugin"
    show(nil)
    await reporting {
      let removal = try await calls().uninstallPlugin(pluginId)
      apply(servers: removal.servers)
      await refreshPlugins()
      show(Plugins.removedNotice(name, removed: removal.removed, reason: removal.reason))
      if let entry, removal.resyncsSkills {
        await dropPrivateCopies(entry, agentId: agentId)
        _ = try? await calls().syncSkills()
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

  /** The sign-in button: Reopen opens the waiting page again; Connect (Authenticate until 13 October 2026) and Retry ask the box for a sign-in (no trigger: the overlay's own), and say how it ended as Connect does. */
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
      let answer = try await calls().signIn(server.id, accountKey: accountKey)
      let status = answer["status"]?.string ?? ""
      if status == "started", let url = answer["authorizationUrl"]?.text.flatMap(URL.init(string:)) {
        let opened = Date()
        flows[key] = Flow(url: url, openedAt: opened, timedOut: false)
        expire(key, opened: opened)
        // The sheet over the window is what the person sees now ("Opened the OAuth flow in your browser" no longer said); how it ends is said once it has.
        Task { [weak self] in
          guard let self else { return }
          switch await self.openSignInAndWait(url, serverId: server.id, accountKey: accountKey, name: server.name) {
          case .connected: self.show(Connecting.connectedNotice(server.name, skills: 0, error: nil))
          case .cancelled: self.show(Connecting.notConnectedNotice(server.name))
          case .unconfirmed: self.show(Connecting.stillConnectingNotice(server.name))
          case .replaced: break
          }
        }
      } else if status == "already-authenticated" {
        show(Connecting.connectedNotice(server.name, skills: 0, error: nil))
      } else {
        show(Plugins.signInNotice(status: status, message: answer["message"]?.string))
      }
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
      await MacConnector.shared.signIn(url, name: name, store: self?.store) {
        guard let self else { return true }
        await self.refreshServers()
        return Plugins.accounts(self.servers, of: serverId).first { $0.accountKey == accountKey }?.status == "connected"
      }
    }
  }

  /** The same page, waited for: how the sign-in ended (Connect's, `connectAfterInstall`). */
  private func openSignInAndWait(_ url: URL, serverId: String, accountKey: String, name: String) async -> SignInEnd {
    let wait = Plugins.signInSpacing - Date().timeIntervalSince(lastOpen)
    if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
    lastOpen = Date()
    return await MacConnector.shared.signIn(url, name: name, store: store) { [weak self] in
      guard let self else { return true }
      await self.refreshServers()
      return Plugins.accounts(self.servers, of: serverId).first { $0.accountKey == accountKey }?.status == "connected"
    }
  }

  /** An installed plugin's server, for its Marketplace row (`Connecting`): Connect while it waits for its sign-in, Connected once it is, else its status; never "Added" for an app not signed in. */
  func serverState(_ entry: PluginEntry) -> PluginServer? {
    installed(entry).server ?? servers.first { $0.pluginId == entry.id }
  }

  /**
   * Add, the consent first when the plugin brings an app to sign in to
   * (the Apple design pass: the iPhone's step before every connect); a
   * skills-only plugin is added at once.
   */
  func requestAdd(_ entry: PluginEntry, agentId: String?) {
    guard !comingSoon(entry) else { return }
    guard !entry.connectorList.isEmpty else {
      Task { await add(entry, agentId: agentId) }
      return
    }
    MacConnector.shared.ask(entry.displayName, store: store) { [weak self] in
      await self?.add(entry, agentId: agentId)
    }
  }

  /** Whether the plugin's app can't be added yet (`AppsComingSoon`): its row and page say "Coming soon", with no Add. */
  func comingSoon(_ entry: PluginEntry) -> Bool {
    store?.isComingSoon(entry.id) ?? AppsComingSoon.builtIn.contains(entry.id.lowercased())
  }

  /** The sign-in button: the consent first for a new sign-in (Connect, Retry); Reopen opens the waiting page again at once. */
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
      tools[serverId] = try await calls().toggleTool(tool.name, of: serverId)
      toolFailures[serverId] = nil
      await refreshServers()
    } catch {
      toolFailures[serverId] = PlainWords.error(error.localizedDescription)
      await loadTools(serverId)
    }
  }

  /** A private skill's switch; a failure is let go, as the overlay does. */
  func setEnabled(_ skill: AgentSkill, agentId: String?) async {
    guard let agentId else { return }
    if let list = try? await calls().setSkillEnabled(skill, !skill.isEnabledForAgent, agentId: agentId) { skills = list }
  }

  func save(_ skill: AgentSkill, name: String, description: String, body: String, agentId: String) async -> Bool {
    show(nil)
    let named = name.trimmingCharacters(in: .whitespacesAndNewlines)
    do {
      // The name and description trimmed, the trigger and source kept (`Plugins.skillSpec`).
      if let list = try await calls().updateSkill(skill, name: name, description: description, body: body, agentId: agentId) { skills = list }
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
      if let list = try await calls().deleteSkill(skill.id, agentId: agentId) { skills = list }
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
    if let existing = Plugins.setupAgent(in: store.agents) { return existing.id }
    if store.isLoading { return nil }
    launchingFix = true
    defer { launchingFix = false }
    // Made, the roster read again, and told what to do (SimeonCore's): once the agent exists it opens, even if its first
    // message could not be sent, which the notice says.
    let made = await store.makePluginSetupAgent()
    if let failure = made.failure { show(Plugins.agentFailedNotice(failure)) }
    return made.id
  }
}
