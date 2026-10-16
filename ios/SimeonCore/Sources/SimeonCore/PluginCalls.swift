import Foundation

/**
 * The Plugins overlay's calls to the box (`desktopMcp` and the agent's
 * workflows), as the Mac's Plugins window makes them
 * (mac/Simeon/PluginsModel.swift, which uses these), shared with the
 * iPhone's Connect apps: the catalog, the servers, the plugins, a server's
 * tools, the agent's skills and the GitHub banner's plugins; Add with its
 * setup values, Edit Values (`updatePluginInstall`), Uninstall
 * (`uninstallPlugin`) and Remove (`removeServer`); the skills' sync and the
 * agent's private copies it replaces; a skill's switch, Save and Delete;
 * and Fix with agent's Plugin Setup agent. Each says what the box answered,
 * read into the overlay's types; what to show of it is each app's.
 */
public struct PluginCalls: Sendable {
  public let backend: AgentBackend

  public init(_ backend: AgentBackend) { self.backend = backend }

  /** One of the host's gateway commands. */
  public func call(_ method: String, _ args: JSON = [:]) async throws -> JSON {
    try await backend.command(method, args)
  }

  /** One action of the box's manager (`desktopMcp`). */
  public func mcp(_ action: String, _ args: [JSON] = []) async throws -> JSON {
    try await call("desktopMcp", ["action": .string(action), "args": .array(args)])
  }

  // MARK: Reading

  /** The catalog (`getCatalog`): a list, or one under `plugins`. */
  public func catalog() async throws -> [PluginEntry] {
    let answer = try await mcp("getCatalog")
    return (answer.array ?? answer["plugins"]?.array ?? []).compactMap(PluginEntry.init(json:))
  }

  /** The plugins the box has on (`listEffectivePlugins`). */
  public func effectivePlugins() async throws -> [EffectivePlugin] {
    (try await mcp("listEffectivePlugins").array ?? []).compactMap(EffectivePlugin.init(json:))
  }

  /** Each account of each server (`listServers`); nil when the answer holds no list. */
  public func servers() async throws -> [PluginServer]? {
    Plugins.servers(in: try await mcp("listServers"))
  }

  /** A server's tools, each with its switch (`listServerTools`). */
  public func tools(_ serverId: String) async throws -> [PluginTool] {
    (try await mcp("listServerTools", [.string(serverId)]).array ?? []).compactMap(PluginTool.init(json:))
  }

  /** A tool switched off, or back on, for every agent (`toggleMcpToolDisabled`): the server's tools as they are now. */
  public func toggleTool(_ toolName: String, of serverId: String) async throws -> [PluginTool] {
    (try await mcp("toggleMcpToolDisabled", [["serverId": .string(serverId), "toolName": .string(toolName)]]).array ?? []).compactMap(PluginTool.init(json:))
  }

  /** The agent's skills (`getAgentWorkflows`). */
  public func skills(_ agentId: String) async throws -> [AgentSkill] {
    (try await call("getAgentWorkflows", ["id": .string(agentId)]).array ?? []).compactMap(AgentSkill.init(json:))
  }

  /** The plugins the GitHub banner names (`getPluginSyncStatus`): their content can't be fetched. */
  public func authBlocked() async throws -> [String] {
    (try await call("getPluginSyncStatus")["authBlocked"]?.array ?? []).map { $0["pluginName"]?.string ?? "" }
  }

  /** A catalog entry's logo (`resolvePluginLogo`): a data URL, SVG or PNG. */
  public func logo(_ address: String) async throws -> String? {
    let answer = try await mcp("resolvePluginLogo", [.string(address)])
    return answer.string ?? answer["src"]?.string
  }

  // MARK: Add, setup, remove

  /** Add (`installEntry`): the entry with its setup values, said to be the team's when the team set them; the servers as they are now. */
  public func install(_ entryId: String, values: [String: String], team: Bool) async throws -> [PluginServer]? {
    var args: [String: JSON] = ["entryId": .string(entryId), "values": .object(values.mapValues(JSON.string))]
    if team { args["hasTeamConfiguredVariables"] = .bool(true) }
    return Plugins.servers(in: try await mcp("installEntry", [.object(args)]))
  }

  /** The server a plugin from the app's own vendor makes (`vendorServerIdForPlugin`), whose sign-in opens after Add; nil for the rest. */
  public func vendorServerId(_ entryId: String) async -> String? {
    (try? await mcp("vendorServerIdForPlugin", [.string(entryId)]))?.text
  }

  /** An account's sign-in asked for (`authenticateServer`, no trigger: the overlay's own): the box's answer, its status and the page to open. */
  public func signIn(_ serverId: String, accountKey: String) async throws -> JSON {
    try await mcp("authenticateServer", [.string(serverId), .string(accountKey)])
  }

  /** Edit Values (`updatePluginInstall`): all of the plugin's setup values replaced. */
  public func updateInstall(_ pluginId: String, values: [String: String]) async throws {
    _ = try await mcp("updatePluginInstall", [["pluginId": .string(pluginId), "values": .object(values.mapValues(JSON.string))]])
  }

  /** What Uninstall or Remove did: gone, or why not (`team-server`), and the servers as they are now. */
  public struct Removal: Equatable, Sendable {
    public let removed: Bool
    public let reason: String?
    public let servers: [PluginServer]?

    public init(_ answer: JSON) {
      removed = answer["removed"]?.bool == true
      reason = answer["reason"]?.string
      servers = Plugins.servers(in: answer["state"])
    }

    /** The plugin's skills are synced again: it went, or the team keeps it. */
    public var resyncsSkills: Bool { removed || reason == "team-server" }
  }

  /** Uninstall or Remove of a server (`removeServer`). */
  public func removeServer(_ serverId: String) async throws -> Removal {
    Removal(try await mcp("removeServer", [.string(serverId)]))
  }

  /** Uninstall of a plugin (`uninstallPlugin`). */
  public func uninstallPlugin(_ pluginId: String) async throws -> Removal {
    Removal(try await mcp("uninstallPlugin", [.string(pluginId)]))
  }

  // MARK: Skills

  /** The box's plugin skills synced (`syncPluginSkills`): how many of those synced are the plugin's (none asked, none counted). */
  @discardableResult
  public func syncSkills(of pluginId: String? = nil) async throws -> Int {
    let answer = try await call("syncPluginSkills")
    guard let pluginId else { return 0 }
    return (answer.array ?? []).filter { $0["pluginId"]?.string == pluginId }.count
  }

  /** The agent's private copies of a plugin's skills, dropped before its own are synced (`deleteAgentWorkflow`); a failure is let go. */
  public func dropPrivateCopies(of entry: PluginEntry, from skills: [AgentSkill], agentId: String?) async {
    guard let agentId else { return }
    for skill in Plugins.privateCopies(of: entry, in: skills) {
      _ = try? await call("deleteAgentWorkflow", ["id": .string(agentId), "workflowId": .string(skill.id)])
    }
  }

  /** A private skill's switch (`setAgentWorkflowEnabled`): the agent's skills as they are now. */
  public func setSkillEnabled(_ skill: AgentSkill, _ on: Bool, agentId: String) async throws -> [AgentSkill] {
    let answer = try await call("setAgentWorkflowEnabled", ["id": .string(agentId), "workflowId": .string(skill.id), "isEnabled": .bool(on)])
    return (answer.array ?? []).compactMap(AgentSkill.init(json:))
  }

  /** Save on a skill's page (`updateAgentWorkflow`): the agent's skills as they are now, when the box lists them. */
  public func updateSkill(_ skill: AgentSkill, name: String, description: String, body: String, agentId: String) async throws -> [AgentSkill]? {
    let spec = Plugins.skillSpec(skill, name: name, description: description, body: body)
    let answer = try await call("updateAgentWorkflow", ["id": .string(agentId), "workflowId": .string(skill.id), "spec": spec])
    return answer.array?.compactMap(AgentSkill.init(json:))
  }

  /** Delete skill (`deleteAgentWorkflow`): the agent's skills as they are now, when the box lists them. */
  public func deleteSkill(_ skillId: String, agentId: String) async throws -> [AgentSkill]? {
    let answer = try await call("deleteAgentWorkflow", ["id": .string(agentId), "workflowId": .string(skillId)])
    return answer.array?.compactMap(AgentSkill.init(json:))
  }

  // MARK: Fix with agent (`si.launch`)

  /** The Plugin Setup agent, made with its introduction held back (`createAgent`): its id. */
  public func createSetupAgent() async throws -> String {
    let answer = try await call("createAgent", [
      "name": .string(Plugins.setupAgentName), "description": .string(Plugins.setupAgentDescription),
      "purpose": .string(Plugins.setupAgentPurpose), "isIntroductionSuppressed": true,
    ])
    guard let id = answer["agent"]?["id"]?.text ?? answer["id"]?.text else { throw GatewayError(message: "createAgent: no agent in the answer", refused: true) }
    return id
  }

  /** What the Plugin Setup agent is first told (`Zl`). */
  public func sendSetupRequest(to agentId: String) async throws {
    try await backend.send(agentId, text: Plugins.setupAgentRequest, attachments: [], replyTo: nil)
  }
}

extension Plugins {
  /** The servers in an answer (under `servers`, or the answer itself a list); nil when it holds none. */
  public static func servers(in answer: JSON?) -> [PluginServer]? {
    guard let rows = answer?["servers"]?.array ?? answer?.array else { return nil }
    return rows.compactMap(PluginServer.init(json:))
  }

  /** The agent's private copies of a plugin's skills (`Is`): the skills made from one of its skills' sources. */
  public static func privateCopies(of entry: PluginEntry, in skills: [AgentSkill]) -> [AgentSkill] {
    let sources = Set((entry.skills ?? []).compactMap(\.sourceUrl))
    guard !sources.isEmpty else { return [] }
    return skills.filter { $0.sourceRef.map(sources.contains) == true }
  }

  /** What a skill's Save sends (`Hi`): the name and description trimmed, the instructions as written, its trigger and source kept. */
  public static func skillSpec(_ skill: AgentSkill, name: String, description: String, body: String) -> JSON {
    var spec: [String: JSON] = [
      "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
      "description": .string(description.trimmingCharacters(in: .whitespacesAndNewlines)),
      "body": .string(body),
    ]
    if let trigger = skill.trigger { spec["trigger"] = trigger }
    if let sourceRef = skill.sourceRef { spec["sourceRef"] = .string(sourceRef) }
    return .object(spec)
  }

  /** Details' Tools for switches counted by the app (the iPhone's `AppTool`s): "n of m enabled" once read, else the server's own count (`toolsValue`). */
  public static func toolsValue(enabled: Int, total: Int, count: Int) -> String {
    total == 0 ? "\(count)" : "\(enabled) of \(total) enabled"
  }

  /** The Plugin Setup agent already made, when there is one (by its purpose). */
  public static func setupAgent(in agents: [Agent]) -> Agent? {
    agents.first { $0.purpose == setupAgentPurpose }
  }
}

extension AppStore {
  /**
   * Fix with agent (`si.launch`) once the agent there is was not found and
   * the roster is in: the Plugin Setup agent made, the roster read again,
   * and its first message sent. Its id once it can be opened (even when
   * the message could not be sent), and what went wrong on the way, which
   * the app says as `Plugins.agentFailedNotice`.
   */
  public func makePluginSetupAgent() async -> (id: String?, failure: String?) {
    guard let backend else { return (nil, "Sign in to Simeon first.") }
    let calls = PluginCalls(backend)
    let id: String
    do {
      id = try await calls.createSetupAgent()
    } catch {
      return (nil, PlainWords.error(error.localizedDescription))
    }
    await reloadRoster()
    do {
      try await calls.sendSetupRequest(to: id)
    } catch {
      return (id, PlainWords.error(error.localizedDescription))
    }
    return (id, nil)
  }
}
