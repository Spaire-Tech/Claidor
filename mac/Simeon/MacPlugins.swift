import AppKit
import SwiftUI
import SimeonCore

/**
 * Connect apps, as the shipped window has it (the Plugins overlay,
 * `view-B5Ug8wEm.js`; the founder's light look from the patch, lines
 * 1811–1820): "Plugins", Marketplace and Yours, the filter and "Search
 * plugins"; the catalog by section with "Show N more", each plugin's page
 * (Add, Uninstall, its accounts, tools, setup values, connectors and
 * skills), a server's page with its Details, the setup page, the agent's
 * skills and their page, the GitHub banner with Fix with agent, and the
 * notices. The rules are SimeonCore's (`Plugins`), checked against the
 * overlay's own functions. Account rename, remove and Add Another Account
 * and the skill publishing menu are behind gates Simeon leaves off
 * (`mcp_multi_account`, `publish_user_skills`), so they are not here.
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

  struct Pending: Equatable {
    let url: URL
    var openedAt: Date
    var timedOut: Bool
  }

  struct Setup: Equatable {
    let entryId: String
    let editing: Bool
  }

  var tab = "marketplace"
  var query = ""
  var marketplaceFilter = PluginFilter()
  var yoursFilter = PluginFilter()
  var path: [Page] = []
  var setup: Setup?
  var catalog: [PluginEntry] = []
  var catalogLoaded = false
  var servers: [PluginServer] = []
  var plugins: [EffectivePlugin] = []
  var tools: [String: [PluginTool]] = [:]
  var toolFailures: [String: String] = [:]
  var skills: [AgentSkill] = []
  var authBlocked: [String] = []
  var pending: [String: Pending] = [:]
  var busy = 0
  var adding: String?
  var notice: Plugins.Notice?
  var launchingFix = false
  @ObservationIgnored weak var store: AppStore?
  @ObservationIgnored private var noticeTask: Task<Void, Never>?
  @ObservationIgnored private var lastOpen = Date.distantPast

  /** A sign-in left open this long becomes Retry (`PBn`). */
  static let signInTimeout: TimeInterval = 600

  var isBusy: Bool { busy > 0 }
  var filter: PluginFilter {
    get { tab == "marketplace" ? marketplaceFilter : yoursFilter }
    set { if tab == "marketplace" { marketplaceFilter = newValue } else { yoursFilter = newValue } }
  }

  var onePerServer: [PluginServer] { Plugins.onePerServer(servers) }
  var effective: [String: EffectivePlugin] { Dictionary(plugins.map { ($0.pluginId, $0) }, uniquingKeysWith: { _, last in last }) }

  func installed(_ entry: PluginEntry) -> Plugins.Installed {
    let deduped = onePerServer
    return Plugins.installed(entry, servers: deduped, byName: Plugins.byName(deduped), plugins: effective)
  }

  var yoursItems: [PluginItem] { Plugins.items(onePerServer, catalog: catalog, plugins: plugins) }

  // MARK: Reading

  private func call(_ method: String, _ args: JSON) async throws -> JSON {
    guard let backend = store?.backend else { throw SimeonAPIError(message: "Sign in to Simeon first.", status: 401) }
    return try await backend.command(method, args)
  }

  private func mcp(_ action: String, _ args: [JSON] = []) async throws -> JSON {
    try await call("desktopMcp", ["action": .string(action), "args": .array(args)])
  }

  func load(agentId: String?) async {
    async let catalogAnswer = try? mcp("getCatalog")
    async let pluginsAnswer = try? mcp("listEffectivePlugins")
    await refreshServers()
    if let answer = await catalogAnswer {
      catalog = (answer.array ?? answer["plugins"]?.array ?? []).compactMap(PluginEntry.init(json:))
    }
    catalogLoaded = true
    if let answer = await pluginsAnswer { plugins = (answer.array ?? []).compactMap(EffectivePlugin.init(json:)) }
    await loadSkills(agentId)
    // The banner's status, and the one sync its subscription starts.
    if let status = try? await call("getPluginSyncStatus", [:]) {
      authBlocked = (status["authBlocked"]?.array ?? []).map { $0["pluginName"]?.string ?? "" }
    }
    Task { _ = try? await self.call("syncPluginSkills", [:]) }
  }

  func refreshServers() async {
    guard let answer = try? await mcp("listServers") else { return }
    apply(servers: answer)
  }

  private func apply(servers answer: JSON?) {
    guard let rows = answer?["servers"]?.array ?? answer?.array else { return }
    servers = rows.compactMap(PluginServer.init(json:))
    // A sign-in that finished clears its pending state (`clearResolved`).
    for (key, _) in pending where servers.contains(where: { $0.serverIdentifier == key && $0.status == "connected" }) { pending[key] = nil }
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
    adding = entry.id
    defer { adding = nil }
    let team = effective[entry.id]?.hasTeamConfiguredVariables == true
    if entry.connectorList.isEmpty {
      guard let agentId else { show(Plugins.Notice(isError: true, text: "Open an agent to add skills")); return }
      guard await install(entry.id, values: [:], team: team) else { return }
      let synced = await syncSkills(entry, agentId: agentId)
      if let error = synced.error {
        show(Plugins.Notice(isError: true, text: "Added \(entry.displayName), but its skills didn't sync: \(error)"))
      } else {
        show(Plugins.skillsAddedNotice(entry.displayName, added: synced.added))
      }
      return
    }
    if entry.hasSetupFields && !team {
      setup = Setup(entryId: entry.id, editing: false)
      path.append(.setup(entry.id))
      return
    }
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
        await openInBrowser(url)
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

  /** The setup page's button (`At`): install with the values, or replace them. */
  func submitSetup(_ values: [String: String], agentId: String?) async {
    guard let setup else { return }
    let entry = catalog.first { $0.id == setup.entryId }
    let name = entry?.displayName ?? "the plugin"
    show(nil)
    await reporting {
      if setup.editing {
        _ = try await mcp("updatePluginInstall", [["pluginId": .string(setup.entryId), "values": .object(values.mapValues(JSON.string))]])
        show(Plugins.Notice(isError: false, text: "Saved \(name)'s setup values"))
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
      if !path.isEmpty { path.removeLast() }
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
      if removed && entry == nil && !path.isEmpty { path.removeLast() }
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

  // MARK: Sign-in (`zs`)

  func pendingKey(_ server: PluginServer, accountKey: String) -> String {
    Plugins.accounts(servers, of: server.id).first { $0.accountKey == accountKey }?.serverIdentifier
      ?? (accountKey == PluginServer.defaultAccount ? server.rowServerIdentifier : "\(server.rowServerIdentifier)--\(accountKey)")
  }

  func authenticate(serverId: String, accountKey: String = PluginServer.defaultAccount) async {
    guard let row = Plugins.accounts(servers, of: serverId).first ?? onePerServer.first(where: { $0.id == serverId }) else { return }
    show(nil)
    await reporting {
      // No trigger: the overlay's own sign-in, not a card's.
      let answer = try await mcp("authenticateServer", [.string(serverId), .string(accountKey)])
      let status = answer["status"]?.string ?? ""
      if status == "started", let url = answer["authorizationUrl"]?.text.flatMap(URL.init(string:)) {
        let key = pendingKey(row, accountKey: accountKey)
        let opened = Date()
        pending[key] = Pending(url: url, openedAt: opened, timedOut: false)
        expire(key, opened: opened)
        await openInBrowser(url)
      }
      show(Plugins.signInNotice(status: status, message: answer["message"]?.string))
      await refreshServers()
    }
  }

  /** Reopen: the same page again, its ten minutes started again. */
  func reopen(_ key: String) async {
    guard var entry = pending[key] else { return }
    entry.openedAt = Date()
    entry.timedOut = false
    pending[key] = entry
    expire(key, opened: entry.openedAt)
    await openInBrowser(entry.url)
  }

  private func expire(_ key: String, opened: Date) {
    Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(Self.signInTimeout * 1_000_000_000))
      guard let self, var entry = self.pending[key], entry.openedAt == opened else { return }
      entry.timedOut = true
      self.pending[key] = entry
    }
  }

  /** The sign-in page in the person's browser, at least 0.9 s after the last one. */
  private func openInBrowser(_ url: URL) async {
    let wait = 0.9 - Date().timeIntervalSince(lastOpen)
    if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
    lastOpen = Date()
    NSWorkspace.shared.open(url)
  }

  // MARK: Tools and skills

  /** A tool's switch: changed at once, then asked of the box (`toggleMcpToolDisabled`); a failure is said under the tools. */
  func toggle(_ tool: PluginTool, of serverId: String) async {
    if var list = tools[serverId], let index = list.firstIndex(where: { $0.name == tool.name }) {
      list[index].isDisabled.toggle()
      tools[serverId] = list
    }
    do {
      let answer = try await mcp("toggleMcpToolDisabled", [["serverId": .string(serverId), "toolName": .string(tool.name)]])
      tools[serverId] = (answer.array ?? []).compactMap(PluginTool.init(json:))
      toolFailures[serverId] = nil
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
    var spec: [String: JSON] = ["name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)), "description": .string(description.trimmingCharacters(in: .whitespacesAndNewlines)), "body": .string(body)]
    if let trigger = skill.trigger { spec["trigger"] = trigger }
    if let sourceRef = skill.sourceRef { spec["sourceRef"] = .string(sourceRef) }
    do {
      let answer = try await call("updateAgentWorkflow", ["id": .string(agentId), "workflowId": .string(skill.id), "spec": .object(spec)])
      if let list = answer.array { skills = list.compactMap(AgentSkill.init(json:)) }
      show(Plugins.Notice(isError: false, text: "Saved \(name.trimmingCharacters(in: .whitespacesAndNewlines))"))
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
      show(Plugins.Notice(isError: false, text: "Deleted \(skill.name)"))
      if !path.isEmpty { path.removeLast() }
    } catch {
      fail(error)
    }
  }

  // MARK: Fix with agent (`si.launch`)

  /** The Plugin Setup agent: the one there is, else a new one told what to do; the agent's id once it is open. */
  func fixWithAgent() async -> String? {
    guard !launchingFix, let store else { return nil }
    if let existing = store.agents.first(where: { $0.purpose == Plugins.setupAgentPurpose }) { return existing.id }
    if store.isLoading { return nil }
    launchingFix = true
    defer { launchingFix = false }
    do {
      let answer = try await call("createAgent", [
        "name": .string(Plugins.setupAgentName), "description": .string(Plugins.setupAgentDescription),
        "purpose": .string(Plugins.setupAgentPurpose), "isIntroductionSuppressed": true, "origin": "user",
        "clientNonce": .string("mac-\(UUID().uuidString.lowercased())"),
      ])
      guard let id = answer["agent"]?["id"]?.text else { throw GatewayError(message: "createAgent: no agent in the answer", refused: true) }
      await store.reloadRoster()
      try await store.backend?.send(id, text: Plugins.setupAgentRequest, attachments: [], replyTo: nil)
      return id
    } catch {
      show(Plugins.Notice(isError: true, text: "Couldn't start the agent: \(error.localizedDescription)"))
      return nil
    }
  }
}

// MARK: - The window

struct MacPlugins: View {
  @Environment(AppStore.self) private var store
  @Environment(MacNavigation.self) private var navigation
  @Environment(\.dismissWindow) private var dismissWindow
  @State private var model = PluginsModel()
  @FocusState private var searchFocused: Bool
  @State private var hostWindow: NSWindow?

  private var agentId: String? { navigation.selected }

  var body: some View {
    NavigationStack(path: $model.path) {
      PluginsList(agentId: agentId, close: { dismissWindow(id: "connect-apps") })
        .navigationDestination(for: PluginsModel.Page.self) { page in
          PluginsPage(page: page, agentId: agentId)
        }
    }
    .environment(model)
    .searchable(text: $model.query, placement: .toolbar, prompt: "Search plugins")
    .searchFocused($searchFocused)
    .overlay(alignment: .bottom) { PluginsNoticeView() .environment(model) }
    .background { WindowReader(window: $hostWindow) }
    .frame(minWidth: 760, minHeight: 520)
    .task {
      model.store = store
      await model.load(agentId: agentId)
      // The box's servers every 15 s while this is open (`retainServers`).
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 15_000_000_000)
        await model.refreshServers()
      }
    }
    .onChange(of: agentId) { _, now in Task { await model.loadSkills(now) } }
    .onChange(of: store.apps) { _, _ in Task { await model.refreshServers() } }
    .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { note in
      guard (note.object as? NSWindow) === hostWindow else { return }
      Task { await model.refreshServers() }
    }
    // ⌘F (the Agent menu's Find) focuses the search while this window is in front.
    .onReceive(NotificationCenter.default.publisher(for: .simeonFind)) { note in
      guard hostWindow?.isKeyWindow == true, note.object == nil, model.path.isEmpty else { return }
      searchFocused = true
    }
    // A plugin's link (`simeon-mac://…/plugin/add?id=`) opens on its page.
    .onChange(of: navigation.pluginFocus, initial: true) { _, id in
      guard let id else { return }
      model.tab = "marketplace"
      model.path = [.plugin(id)]
      navigation.pluginFocus = nil
    }
  }
}

/** The list: Marketplace or Yours, the filter, then its items. */
private struct PluginsList: View {
  let agentId: String?
  let close: () -> Void
  @Environment(PluginsModel.self) private var model

  var body: some View {
    @Bindable var model = model
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        if model.tab == "marketplace" { MarketplaceList(agentId: agentId) } else { YoursList(agentId: agentId, close: close) }
      }
      .padding(.horizontal, 32).padding(.vertical, 22)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .id(model.tab)
    .navigationTitle("Plugins")
    .toolbar {
      ToolbarItem(placement: .navigation) {
        Picker("Plugins view", selection: $model.tab) {
          Text("Marketplace").tag("marketplace")
          Text("Yours").tag("yours")
        }
        .pickerStyle(.segmented)
        .labelsHidden()
      }
      ToolbarItem(placement: .primaryAction) { FilterMenu() }
    }
  }
}

/** The Filter menu (`ii`): Type and Ownership, each with its check; it stays open while choosing. */
private struct FilterMenu: View {
  @Environment(PluginsModel.self) private var model

  var body: some View {
    @Bindable var model = model
    Menu {
      Section("Type") {
        Picker("Type", selection: $model.filter.type) {
          ForEach(PluginFilter.Kind.allCases, id: \.self) { Text(PluginFilter.label($0)).tag($0) }
        }
        .pickerStyle(.inline)
      }
      Section("Ownership") {
        Picker("Ownership", selection: $model.filter.ownership) {
          ForEach(PluginFilter.Ownership.allCases, id: \.self) { Text(PluginFilter.label($0)).tag($0) }
        }
        .pickerStyle(.inline)
      }
    } label: {
      Image(systemName: model.filter.isAll ? "line.3.horizontal.decrease" : "line.3.horizontal.decrease.circle.fill")
    }
    .menuIndicator(.hidden)
    .help("Filter plugins")
    .accessibilityLabel("Filter plugins")
  }
}

// MARK: Marketplace

private struct MarketplaceList: View {
  let agentId: String?
  @Environment(PluginsModel.self) private var model

  var body: some View {
    let entries = Plugins.search(model.catalog, model.query).filter { Plugins.keeps($0, model.marketplaceFilter) }
    let searching = !model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    if entries.isEmpty {
      PluginsEmpty(text: emptyText)
    } else if searching {
      MarketplaceSection(title: "Results", entries: entries, collapses: false, agentId: agentId)
    } else {
      ForEach(Plugins.sections(entries), id: \.key) { section in
        MarketplaceSection(title: section.title, entries: section.items, collapses: true, agentId: agentId)
      }
    }
  }

  private var emptyText: String {
    let q = model.query.trimmingCharacters(in: .whitespacesAndNewlines)
    if !model.catalogLoaded && model.catalog.isEmpty { return "Loading the marketplace…" }
    if !model.marketplaceFilter.isAll { return "No plugins match the current filters" }
    if !q.isEmpty { return "No plugins match \"\(q)\"" }
    return "The marketplace isn't available right now. Check back later."
  }
}

private struct MarketplaceSection: View {
  let title: String
  let entries: [PluginEntry]
  let collapses: Bool
  let agentId: String?
  @State private var expanded = false
  @Environment(PluginsModel.self) private var model

  var body: some View {
    let shown = Plugins.collapse(entries, expanded: expanded || !collapses, limit: Plugins.marketplaceLimit)
    VStack(alignment: .leading, spacing: 10) {
      Text(title).font(.system(size: 12, weight: .medium)).foregroundStyle(.tertiary)
      PluginsGrid {
        ForEach(shown.visible) { entry in
          let installed = model.installed(entry)
          PluginRow(
            title: entry.displayName, subtitle: entry.description, icon: { PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, size: 40) },
            // Team, with the marketplace's name, unless it is one of the person's own publishers.
            badge: entry.marketplace != nil && entry.publisher?.isUserOwned != true ? .team(entry.marketplace?.displayName ?? "") : nil,
            open: { model.path.append(.plugin(entry.id)) }, openLabel: "Open \(entry.displayName)"
          ) {
            if installed.isInstalled {
              AddedPill()
            } else if model.adding == entry.id {
              ProgressView().controlSize(.small).accessibilityLabel("Adding \(entry.displayName)")
            } else {
              Button("Add") { Task { await model.add(entry, agentId: agentId) } }
                .controlSize(.small)
                .disabled(model.isBusy)
            }
          }
        }
      }
      if shown.hidden > 0 {
        Button("Show \(shown.hidden) more") { expanded = true }.buttonStyle(.link)
      }
    }
  }
}

// MARK: Yours

private struct YoursList: View {
  let agentId: String?
  let close: () -> Void
  @Environment(PluginsModel.self) private var model
  @Environment(MacNavigation.self) private var navigation
  @State private var showsAll = false

  var body: some View {
    let q = model.query.trimmingCharacters(in: .whitespacesAndNewlines)
    let filter = model.yoursFilter
    let found = Plugins.search(model.onePerServer, q)
    let items = Plugins.items(found, catalog: model.catalog, plugins: model.plugins).filter { Plugins.keeps($0, query: q) && Plugins.keeps($0, filter) }
    let skills = Plugins.privateSkills(model.skills).filter { (q.isEmpty || $0.name.lowercased().contains(q.lowercased())) && Plugins.keeps($0, filter) }
    let showsInstalled = filter.isAll || !items.isEmpty
    let showsPrivate = filter.isAll || agentId == nil || !skills.isEmpty
    if !model.authBlocked.isEmpty { GitHubBanner(close: close) }
    if !showsInstalled && !showsPrivate {
      PluginsEmpty(text: "No plugins match the current filters")
    }
    if showsInstalled {
      VStack(alignment: .leading, spacing: 10) {
        Text("Installed").font(.system(size: 12, weight: .medium)).foregroundStyle(.tertiary)
        if items.isEmpty {
          PluginsEmpty(text: q.isEmpty ? "Nothing installed yet. Find plugins in the Marketplace tab." : "No installed plugins match \"\(q)\"")
        } else {
          let shown = Plugins.collapse(items, expanded: showsAll || !q.isEmpty, limit: Plugins.installedLimit)
          PluginsGrid {
            ForEach(Array(shown.visible.enumerated()), id: \.offset) { _, item in InstalledRow(item: item) }
          }
          if shown.hidden > 0 {
            Button("Show all \(items.count) plugins") { showsAll = true }.buttonStyle(.link)
          }
        }
      }
    }
    if showsPrivate {
      VStack(alignment: .leading, spacing: 10) {
        Text("Private").font(.system(size: 12, weight: .medium)).foregroundStyle(.tertiary)
        if agentId == nil {
          PluginsEmpty(text: "Open an agent to see its private skills")
        } else if skills.isEmpty {
          PluginsEmpty(text: q.isEmpty ? "No private skills yet. Ask your Agent to create one for you." : "No private skills match \"\(q)\"")
        } else {
          VStack(spacing: 8) {
            ForEach(skills) { skill in
              PluginRow(title: skill.name, subtitle: skill.subtitle, icon: { SkillIcon(size: 40) }, badge: nil,
                        open: { model.path.append(.skill(skill.id)) }, openLabel: "Open \(skill.name)") {
                if skill.source == "workflow" {
                  Toggle("Enable \(skill.name)", isOn: Binding(get: { skill.isEnabledForAgent }, set: { _ in Task { await model.setEnabled(skill, agentId: agentId) } }))
                    .toggleStyle(.switch).labelsHidden().controlSize(.small)
                    .disabled(model.isBusy)
                }
              }
            }
          }
        }
      }
    }
  }
}

/** A row of Installed: a plugin with its first connector's state, or a server of its own. */
private struct InstalledRow: View {
  let item: PluginItem
  @Environment(PluginsModel.self) private var model

  var body: some View {
    switch item {
    case .plugin(let entry, let mode, let connectors):
      PluginRow(title: entry.displayName, subtitle: Plugins.contributions(entry), icon: { PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, size: 40) },
                badge: TeamBadge.of(mode), open: { model.path.append(.plugin(entry.id)) }, openLabel: "Open \(entry.displayName)") {
        if let first = connectors.first { ServerState(server: first, showsPill: first.status != "needsAuth") }
      }
    case .connector(let server, let mode):
      PluginRow(title: server.name, subtitle: Plugins.contributions(server, catalog: model.catalog), icon: { PluginIcon(name: server.name, iconUrl: nil, size: 40) },
                badge: TeamBadge.of(mode), open: { model.path.append(.installed(server.id)) }, openLabel: "Open \(server.name)") {
        ServerState(server: server, showsPill: server.status != "needsAuth")
      }
    }
  }
}

/** The status pill, or Authenticate (Reopen, Retry) for a server that needs its sign-in. */
private struct ServerState: View {
  let server: PluginServer
  var showsPill = true
  var accountKey = PluginServer.defaultAccount
  @Environment(PluginsModel.self) private var model

  var body: some View {
    HStack(spacing: 8) {
      if showsPill { StatusPill(status: server.status, detail: server.statusDetail) }
      if server.status == "needsAuth" {
        let key = model.pendingKey(server, accountKey: accountKey)
        let pending = model.pending[key]
        Button(pending == nil ? "Authenticate" : pending?.timedOut == true ? "Retry" : "Reopen") {
          Task {
            if pending?.timedOut == false { await model.reopen(key) } else { await model.authenticate(serverId: server.id, accountKey: accountKey) }
          }
        }
        .controlSize(.small)
        .disabled(model.isBusy)
      }
    }
  }
}

private struct StatusPill: View {
  let status: String
  let detail: String?

  var body: some View {
    Text(Plugins.statusWord(status))
      .font(.system(size: 11, weight: .medium))
      .foregroundStyle(tint)
      .padding(.horizontal, 8).padding(.vertical, 3)
      .background(tint.opacity(0.12), in: Capsule())
      .help(detail ?? "")
      .accessibilityLabel(Plugins.statusWord(status))
  }

  private var tint: Color {
    switch status {
    case "connected": return .green
    case "needsAuth": return .orange
    case "error": return .red
    default: return .secondary
    }
  }
}

/** The GitHub banner (`Yours`): what can't be fetched, and Fix with agent. */
private struct GitHubBanner: View {
  let close: () -> Void
  @Environment(PluginsModel.self) private var model
  @Environment(MacNavigation.self) private var navigation

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
      VStack(alignment: .leading, spacing: 4) {
        Text("Complete GitHub auth to sync installed plugins").font(.system(size: 13, weight: .semibold))
        Text(Plugins.authBlockedLine(model.authBlocked)).font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 8)
      Button(model.launchingFix ? "Opening…" : "Fix with agent") {
        Task {
          if let id = await model.fixWithAgent() {
            navigation.selected = id
            close()
          }
        }
      }
      .controlSize(.small)
      .disabled(model.launchingFix)
    }
    .padding(14)
    .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Plugin content needs GitHub authentication")
  }
}

// MARK: Pages

private struct PluginsPage: View {
  let page: PluginsModel.Page
  let agentId: String?
  @Environment(PluginsModel.self) private var model

  var body: some View {
    Group {
      switch page {
      case .plugin(let id):
        if let entry = model.catalog.first(where: { $0.id == id }) { PluginDetail(entry: entry, agentId: agentId) } else { missing }
      case .installed(let id):
        if let server = model.onePerServer.first(where: { $0.id == id }) {
          if let entry = Plugins.entry(for: server, in: model.catalog) { PluginDetail(entry: entry, agentId: agentId) } else { ServerDetail(server: server, agentId: agentId) }
        } else { missing }
      case .setup(let id):
        if let entry = model.catalog.first(where: { $0.id == id }), let setup = model.setup, setup.entryId == id { SetupPage(entry: entry, editing: setup.editing, agentId: agentId) } else { missing }
      case .skill(let id):
        if let skill = model.skills.first(where: { $0.id == id }), skill.hasPage { SkillPage(skill: skill, agentId: agentId) } else { missing }
      }
    }
  }

  /** A page that can no longer be drawn goes back to the list. */
  private var missing: some View {
    Color.clear.onAppear { if !model.path.isEmpty { model.path.removeLast() } }
  }
}

/** A plugin's page (`Ri`): its icon, name and meta line, Add or Uninstall, the description; its accounts and tools when added; Setup; its connectors and skills. */
private struct PluginDetail: View {
  let entry: PluginEntry
  let agentId: String?
  @Environment(PluginsModel.self) private var model
  @Environment(\.openURL) private var openURL

  var body: some View {
    let installed = model.installed(entry)
    let item = model.yoursItems.first { if case .plugin(let e, _, _) = $0 { return e.id == entry.id }; return false }
    let mode = installed.plugin?.installMode ?? installed.server?.installMode ?? item?.installMode
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack(alignment: .center, spacing: 12) {
          PluginIcon(name: entry.displayName, iconUrl: entry.iconUrl, size: 56)
          VStack(alignment: .leading, spacing: 3) {
            Text(entry.displayName).font(.system(size: 17, weight: .semibold))
            meta
          }
          Spacer(minLength: 8)
          actions(installed: installed, mode: mode)
        }
        Text(entry.description).font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        if let server = installed.server {
          AccountsBlock(serverId: server.id)
          ToolsBlock(serverId: server.id)
        }
        if installed.isInstalled && item != nil && entry.hasSetupFields {
          PluginsHeading("Setup")
          PluginsCard {
            HStack {
              Text("Setup Values").font(.system(size: 13))
              Spacer()
              Button("Edit Values") { model.editValues(entry) }.controlSize(.small).disabled(model.isBusy)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
          }
        }
        ListCard(heading: "Connectors", noun: "connector", rows: entry.connectorList.map { ($0.name, $0.description.isEmpty ? "Connector" : $0.description) })
        if let skills = entry.skills, !skills.isEmpty {
          ListCard(heading: "Skills", noun: "skill", rows: skills.map { ($0.name, $0.description.isEmpty ? "Skill" : $0.description) })
        }
      }
      .padding(.horizontal, 32).padding(.vertical, 22)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .navigationTitle(entry.displayName)
    .task { if let server = installed.server { await model.loadTools(server.id) } }
  }

  @ViewBuilder
  private var meta: some View {
    let market = entry.marketplace?.displayName
    if market != nil || entry.homepage != nil {
      HStack(spacing: 6) {
        if let market { Text(market) }
        if market != nil && entry.homepage != nil { Text("·") }
        if let homepage = entry.homepage.flatMap(URL.init(string:)) {
          Button { openURL(homepage) } label: { Label("View Source", systemImage: "arrow.up.right").labelStyle(.titleAndIcon) }
            .buttonStyle(.link)
        }
      }
      .font(.system(size: 12)).foregroundStyle(.secondary)
    }
  }

  @ViewBuilder
  private func actions(installed: Plugins.Installed, mode: PluginInstallMode?) -> some View {
    if let mode, installed.isInstalled {
      HStack(spacing: 8) {
        switch mode {
        case .teamRequired:
          Text("Managed by your team").font(.system(size: 12)).foregroundStyle(.secondary)
        case .teamDefault:
          Text("Added by your team").font(.system(size: 12)).foregroundStyle(.secondary)
          Button("Remove") { remove(installed) }.disabled(model.isBusy)
        case .user:
          Button("Uninstall") { remove(installed) }.disabled(model.isBusy)
        }
      }
    } else if model.adding == entry.id {
      ProgressView().controlSize(.small).accessibilityLabel("Adding \(entry.displayName)")
    } else {
      Button("Add") { Task { await model.add(entry, agentId: agentId) } }
        .buttonStyle(.borderedProminent)
        .disabled(model.isBusy)
    }
  }

  private func remove(_ installed: Plugins.Installed) {
    Task {
      if installed.plugin != nil { await model.uninstall(pluginId: entry.id, agentId: agentId) }
      else if let server = installed.server { await model.remove(serverId: server.id, agentId: agentId) }
    }
  }
}

/** A server no catalog entry claims (`_i`): its name and host, Uninstall, its accounts, tools and Details. */
private struct ServerDetail: View {
  let server: PluginServer
  let agentId: String?
  @Environment(PluginsModel.self) private var model

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 12) {
          PluginIcon(name: server.name, iconUrl: nil, size: 56)
          VStack(alignment: .leading, spacing: 3) {
            Text(server.name).font(.system(size: 17, weight: .semibold))
            if let host = server.url.flatMap(URL.init(string:))?.host { Text(host).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1) }
          }
          Spacer(minLength: 8)
          if server.installMode == .teamRequired {
            Text("Managed by your team").font(.system(size: 12)).foregroundStyle(.secondary)
          } else {
            Button("Uninstall") { Task { await model.remove(serverId: server.id, agentId: agentId) } }.disabled(model.isBusy)
          }
        }
        AccountsBlock(serverId: server.id)
        ToolsBlock(serverId: server.id)
        PluginsHeading("Details")
        PluginsCard {
          VStack(spacing: 0) {
            detail("Source", server.isTeamServer ? "Your team" : "Added manually")
            Divider()
            detail("Transport", ["http": "HTTP", "sse": "SSE", "stdio": "Command"][server.transport] ?? server.transport)
            Divider()
            if let url = server.url { detail("URL", url) } else { detail("Command", server.command ?? "—") }
            Divider()
            detail("Tools", toolsLine)
          }
        }
      }
      .padding(.horizontal, 32).padding(.vertical, 22)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .navigationTitle(server.name)
    .task { await model.loadTools(server.id) }
  }

  private var toolsLine: String {
    guard let tools = model.tools[server.id], !tools.isEmpty else { return "\(server.toolCount)" }
    return "\(tools.filter { !$0.isDisabled }.count) of \(tools.count) enabled"
  }

  private func detail(_ term: String, _ value: String) -> some View {
    HStack {
      Text(term).font(.system(size: 13)).foregroundStyle(.secondary)
      Spacer()
      Text(value.isEmpty ? "—" : value).font(.system(size: 13)).lineLimit(1).truncationMode(.middle).help(value)
    }
    .padding(.horizontal, 14).padding(.vertical, 9)
  }
}

/** Accounts (`ut`): one line each, the default first: its name, its error, its state and sign-in. */
private struct AccountsBlock: View {
  let serverId: String
  @Environment(PluginsModel.self) private var model

  var body: some View {
    let rows = Plugins.accounts(model.servers, of: serverId)
    if !rows.isEmpty {
      PluginsHeading("Accounts")
      PluginsCard {
        VStack(spacing: 0) {
          ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
            HStack(alignment: .center) {
              VStack(alignment: .leading, spacing: 2) {
                Text(Plugins.accountLabel(row.accountKey)).font(.system(size: 13))
                if row.status == "error", let detail = row.statusDetail {
                  Text(detail).font(.system(size: 11)).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
                }
              }
              Spacer(minLength: 8)
              ServerState(server: row, showsPill: true, accountKey: row.accountKey)
            }
            .padding(.horizontal, 14).padding(.vertical, 9)
            if index < rows.count - 1 { Divider() }
          }
        }
      }
    }
  }
}

/** Tools (`ht`): folded, "n of m enabled"; each tool's name and switch, changed at once; a failure under them. */
private struct ToolsBlock: View {
  let serverId: String
  @Environment(PluginsModel.self) private var model
  @State private var open = false

  var body: some View {
    let tools = model.tools[serverId] ?? []
    if !tools.isEmpty {
      let names = Plugins.toolNames(tools)
      PluginsHeading("Tools")
      PluginsCard {
        VStack(spacing: 0) {
          Button { withAnimation(.snappy(duration: 0.2)) { open.toggle() } } label: {
            HStack {
              Text("\(tools.filter { !$0.isDisabled }.count) of \(tools.count) enabled").font(.system(size: 13))
              Spacer()
              Image(systemName: "chevron.down").rotationEffect(.degrees(open ? 180 : 0)).foregroundStyle(.secondary)
            }
            .contentShape(.rect)
            .padding(.horizontal, 14).padding(.vertical, 10)
          }
          .buttonStyle(.plain)
          .accessibilityValue(open ? "expanded" : "collapsed")
          if open {
            ForEach(tools) { tool in
              Divider()
              let name = names[tool.name] ?? tool.name
              Toggle(isOn: Binding(get: { !tool.isDisabled }, set: { _ in Task { await model.toggle(tool, of: serverId) } })) {
                Text(name).font(.system(size: 13)).help(tool.description)
              }
              .toggleStyle(.switch).controlSize(.small)
              .accessibilityLabel(tool.isDisabled ? "Enable \(name)" : "Disable \(name)")
              .padding(.horizontal, 14).padding(.vertical, 7)
            }
          }
          if let failure = model.toolFailures[serverId] {
            Divider()
            Text(failure).font(.system(size: 12)).foregroundStyle(.red).padding(.horizontal, 14).padding(.vertical, 8)
              .frame(maxWidth: .infinity, alignment: .leading)
              .accessibilityAddTraits(.isStaticText)
          }
        }
      }
    }
  }
}

/** Setup (`Di`): each value (secrets hidden), what is required, and Add or Save Values. */
private struct SetupPage: View {
  let entry: PluginEntry
  let editing: Bool
  let agentId: String?
  @Environment(PluginsModel.self) private var model
  @State private var values: [String: String] = [:]
  @State private var tried = false

  var body: some View {
    let fields = entry.fields ?? []
    let missing = fields.filter { $0.isRequired && (values[$0.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text(editing
             ? "Saving replaces all of \(entry.displayName)'s setup values and applies them to its connectors. Current values aren't shown; a field left blank is cleared."
             : "\(entry.displayName) needs a few values before it can be added")
          .font(.system(size: 13)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        ForEach(fields) { field in
          let invalid = tried && missing.contains(field)
          VStack(alignment: .leading, spacing: 5) {
            (Text(field.label) + (field.isRequired ? Text("") : Text(" (optional)").foregroundStyle(.tertiary))).font(.system(size: 13, weight: .medium))
            Group {
              if field.isSecret {
                SecureField(field.placeholder ?? field.key, text: binding(field))
              } else {
                TextField(field.placeholder ?? field.key, text: binding(field))
              }
            }
            .textFieldStyle(.roundedBorder)
            .autocorrectionDisabled()
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(invalid ? Color.red : .clear))
            if invalid {
              Text("\(field.label) is required").font(.system(size: 11)).foregroundStyle(.red)
            } else if let hint = field.hint {
              Text(hint).font(.system(size: 11)).foregroundStyle(.tertiary).help(hint)
            }
          }
        }
        HStack {
          if tried && !missing.isEmpty {
            Text(missing.count > 1 ? "Fill in the required fields to continue" : "Fill in the required field to continue").font(.system(size: 12)).foregroundStyle(.red)
          }
          Spacer()
          Button(editing ? "Save Values" : "Add \(entry.displayName)") { submit(missing: missing) }
            .buttonStyle(.borderedProminent)
            .keyboardShortcut(.defaultAction)
            .disabled(model.isBusy)
        }
      }
      .padding(.horizontal, 32).padding(.vertical, 22)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .navigationTitle(entry.displayName)
    .onAppear {
      // The values start as the field's default; current values are never shown.
      for field in fields where values[field.key] == nil { values[field.key] = field.defaultValue ?? "" }
    }
  }

  private func binding(_ field: PluginEntry.Field) -> Binding<String> {
    Binding(get: { values[field.key] ?? "" }, set: { values[field.key] = $0 })
  }

  private func submit(missing: [PluginEntry.Field]) {
    tried = true
    guard missing.isEmpty else { return }
    let given = values.compactMapValues { value -> String? in
      let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
      return trimmed.isEmpty ? nil : trimmed
    }
    Task { await model.submitSetup(given, agentId: agentId) }
  }
}

/** A skill's page (`Hi`): its kind, Name, Description ("Use when…") and Instructions, Save and Delete skill. */
private struct SkillPage: View {
  let skill: AgentSkill
  let agentId: String?
  @Environment(PluginsModel.self) private var model
  @State private var name = ""
  @State private var details = ""
  @State private var instructions = ""
  @State private var working = false

  var body: some View {
    let managed = skill.source == "managed"
    let changed = name != skill.name || details != skill.description || instructions != skill.body
    let ready = agentId != nil && changed && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !instructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !working
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 12) {
          SkillIcon(size: 40)
          VStack(alignment: .leading, spacing: 2) {
            Text(skill.name).font(.system(size: 17, weight: .semibold))
            Text(skill.kindLine).font(.system(size: 12)).foregroundStyle(.secondary)
          }
          Spacer()
        }
        if !skill.description.isEmpty { Text(skill.description).font(.system(size: 13)).foregroundStyle(.secondary) }
        field("Name") { TextField("", text: $name).autocorrectionDisabled() }
        field("Description") {
          TextField("Use when…", text: $details)
          if details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !managed {
            Text("Required. Describe when to use this skill.").font(.system(size: 11)).foregroundStyle(.tertiary)
          }
        }
        field("Instructions") {
          TextEditor(text: $instructions)
            .font(.system(size: 13, design: .monospaced))
            .frame(minHeight: 200)
            .overlay(alignment: .topLeading) {
              if instructions.isEmpty {
                Text("Markdown instructions the agent follows when it runs this skill").font(.system(size: 13)).foregroundStyle(.tertiary).padding(6).allowsHitTesting(false)
              }
            }
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(.separator))
        }
        .disabled(managed)
        if !managed {
          HStack {
            if let agentId, skill.source != "plugin" {
              Button("Delete skill", role: .destructive) {
                working = true
                Task { await model.delete(skill, agentId: agentId); working = false }
              }
              .disabled(working)
            }
            Spacer()
            Button("Save") {
              guard let agentId else { return }
              working = true
              Task { _ = await model.save(skill, name: name, description: details, body: instructions, agentId: agentId); working = false }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!ready)
          }
        }
      }
      .textFieldStyle(.roundedBorder)
      .padding(.horizontal, 32).padding(.vertical, 22)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .navigationTitle(skill.name)
    // The fields follow the skill when it changes from outside.
    .onChange(of: skill, initial: true) { _, now in name = now.name; details = now.description; instructions = now.body }
  }

  private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(label).font(.system(size: 11)).foregroundStyle(.tertiary)
      content()
    }
  }
}

// MARK: Pieces

/** Two columns of rows, 12 pt apart (the patch's light grid). */
private struct PluginsGrid<Content: View>: View {
  @ViewBuilder let content: Content
  var body: some View {
    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], alignment: .leading, spacing: 12) { content }
  }
}

private enum TeamBadge: Equatable {
  case team(String)

  static func of(_ mode: PluginInstallMode) -> TeamBadge? {
    switch mode {
    case .teamRequired: return .team("Managed by your team")
    case .teamDefault: return .team("Added by your team")
    case .user: return nil
    }
  }
}

/** A row (`fs`): the icon, the name with its Team mark, one line under it; the whole row opens its page; its control at the end. */
private struct PluginRow<Icon: View, Trailing: View>: View {
  let title: String
  let subtitle: String
  @ViewBuilder let icon: Icon
  let badge: TeamBadge?
  let open: () -> Void
  let openLabel: String
  @ViewBuilder let trailing: Trailing

  var body: some View {
    HStack(spacing: 12) {
      Button(action: open) {
        HStack(spacing: 12) {
          icon
          VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
              Text(title).font(.system(size: 13, weight: .medium)).lineLimit(1)
              if case .team(let tip) = badge {
                Label("Team", systemImage: "person.2.fill").font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
                  .padding(.horizontal, 6).padding(.vertical, 2).background(.quaternary, in: Capsule()).help(tip)
              }
            }
            if !subtitle.isEmpty { Text(subtitle).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1) }
          }
          Spacer(minLength: 0)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(openLabel)
      trailing
    }
    .padding(.horizontal, 14).padding(.vertical, 10)
    .background(.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.separator, lineWidth: 0.5))
  }
}

private struct AddedPill: View {
  var body: some View {
    Label("Added", systemImage: "checkmark").font(.system(size: 11, weight: .medium)).foregroundStyle(.green)
      .padding(.horizontal, 8).padding(.vertical, 3).background(Color.green.opacity(0.1), in: Capsule())
  }
}

/** An app's icon (`ToolIcon`): its logo when the app has one bundled or the catalog names one, else its first letter. */
private struct PluginIcon: View {
  let name: String
  let iconUrl: String?
  let size: CGFloat
  @Environment(AppStore.self) private var store
  @State private var image: NSImage?

  var body: some View {
    Group {
      if MentionArt.connector(name) == nil, let image {
        Image(nsImage: image).resizable().scaledToFit().frame(width: size, height: size)
          .clipShape(RoundedRectangle(cornerRadius: (size * 0.28).rounded(), style: .continuous))
      } else {
        ConnectorTile(name: name.isEmpty ? "?" : name, size: size)
      }
    }
    .task(id: iconUrl) {
      guard MentionArt.connector(name) == nil, let iconUrl,
            let answer = try? await store.backend?.command("desktopMcp", ["action": "resolvePluginLogo", "args": [.string(iconUrl)]]),
            let source = answer.string ?? answer["src"]?.string else { return }
      image = Self.decode(source)
    }
  }

  static func decode(_ source: String) -> NSImage? {
    if source.hasPrefix("data:"), let comma = source.firstIndex(of: ","), let data = Data(base64Encoded: String(source[source.index(after: comma)...])) { return NSImage(data: data) }
    return nil
  }
}

private struct SkillIcon: View {
  let size: CGFloat
  var body: some View {
    Image(systemName: "list.bullet.rectangle").font(.system(size: size * 0.42)).foregroundStyle(.secondary)
      .frame(width: size, height: size)
      .background(.quaternary.opacity(0.6), in: RoundedRectangle(cornerRadius: (size * 0.28).rounded(), style: .continuous))
  }
}

private struct PluginsHeading: View {
  let text: String
  init(_ text: String) { self.text = text }
  var body: some View { Text(text).font(.system(size: 13, weight: .semibold)).padding(.top, 4) }
}

private struct PluginsCard<Content: View>: View {
  @ViewBuilder let content: Content
  var body: some View {
    content
      .background(.background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.separator, lineWidth: 0.5))
  }
}

/** A folded card (`$n`): its heading, "N connectors" or "N skills", then each line. */
private struct ListCard: View {
  let heading: String
  let noun: String
  let rows: [(String, String)]
  @State private var open = false

  var body: some View {
    PluginsHeading(heading)
    PluginsCard {
      VStack(spacing: 0) {
        Button { withAnimation(.snappy(duration: 0.2)) { open.toggle() } } label: {
          HStack {
            Text(Plugins.count(rows.count, noun)).font(.system(size: 13))
            Spacer()
            Image(systemName: "chevron.down").rotationEffect(.degrees(open ? 180 : 0)).foregroundStyle(.secondary)
          }
          .contentShape(.rect)
          .padding(.horizontal, 14).padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .accessibilityValue(open ? "expanded" : "collapsed")
        if open {
          ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
            Divider()
            VStack(alignment: .leading, spacing: 2) {
              Text(row.0).font(.system(size: 13))
              Text(row.1).font(.system(size: 12)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.vertical, 8)
          }
        }
      }
    }
  }
}

private struct PluginsEmpty: View {
  let text: String
  var body: some View { Text(text).font(.system(size: 12)).foregroundStyle(.tertiary) }
}

/** The notice (`TKn`): a tick or a cross, the words, and its close; it goes by itself. */
private struct PluginsNoticeView: View {
  @Environment(PluginsModel.self) private var model

  var body: some View {
    if let notice = model.notice {
      HStack(spacing: 10) {
        Image(systemName: notice.isError ? "xmark.circle.fill" : "checkmark.circle.fill").foregroundStyle(notice.isError ? .red : .green)
        Text(notice.text).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
        Button { model.show(nil) } label: { Image(systemName: "xmark").font(.system(size: 10, weight: .semibold)) }
          .buttonStyle(.borderless)
          .accessibilityLabel("Dismiss")
      }
      .padding(.horizontal, 14).padding(.vertical, 10)
      .glassEffect(.regular, in: .capsule)
      .padding(.bottom, 18)
      .frame(maxWidth: 560)
      .transition(.move(edge: .bottom).combined(with: .opacity))
      .accessibilityElement(children: .combine)
    }
  }
}
