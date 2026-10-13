import XCTest
@testable import SimeonCore

/**
 * The Plugins overlay's calls (PluginCalls.swift), as the Mac's Plugins
 * window makes them: what each sends the box, and how its answer is read.
 */
final class PluginCallsTests: XCTestCase {
  func testTheReadsTakeTheAnswersAsTheMacDoes() async throws {
    let box = PluginsBox()
    let calls = PluginCalls(box)
    box.answers["desktopMcp:getCatalog"] = ["plugins": [["id": "linear", "displayName": "Linear"], ["name": "no id"]]]
    let listed = try await calls.catalog()
    XCTAssertEqual(listed.map(\.id), ["linear"])
    box.answers["desktopMcp:getCatalog"] = [["id": "gmail"], ["pluginId": "notion"]]
    let bare = try await calls.catalog()
    XCTAssertEqual(bare.map(\.id), ["gmail", "notion"])

    box.answers["desktopMcp:listEffectivePlugins"] = [["pluginId": "linear", "isEnabled": true, "installMode": "team-default"]]
    let plugins = try await calls.effectivePlugins()
    XCTAssertEqual(plugins.first?.installMode, .teamDefault)

    box.answers["desktopMcp:listServers"] = ["nothing": true]
    let none = try await calls.servers()
    XCTAssertNil(none, "an answer with no list leaves the servers as they were")
    box.answers["desktopMcp:listServers"] = ["servers": [["id": "s1", "name": "Linear", "transport": "http"]]]
    let servers = try await calls.servers()
    XCTAssertEqual(servers?.map(\.id), ["s1"])
    XCTAssertEqual(Plugins.servers(in: [["id": "s2"]])?.map(\.id), ["s2"])
    XCTAssertNil(Plugins.servers(in: nil))

    box.answers["desktopMcp:listServerTools"] = [["name": "search"], ["name": "read", "isDisabled": true]]
    let tools = try await calls.tools("s1")
    XCTAssertEqual(tools.map(\.isDisabled), [false, true])
    XCTAssertEqual(box.sent("desktopMcp:listServerTools")?["args"], ["s1"])

    box.answers["getAgentWorkflows"] = [["id": "w1", "name": "Brief", "source": "workflow"]]
    let skills = try await calls.skills("theo")
    XCTAssertEqual(skills.map(\.id), ["w1"])
    XCTAssertEqual(box.sent("getAgentWorkflows"), ["id": "theo"])

    box.answers["getPluginSyncStatus"] = ["authBlocked": [["pluginName": "Acme"], [:]]]
    let blocked = try await calls.authBlocked()
    XCTAssertEqual(blocked, ["Acme", ""])

    // Details' Tools from the phone's own tool rows reads as the Mac's from its own.
    XCTAssertEqual(Plugins.toolsValue(enabled: 1, total: 2, count: 9), Plugins.toolsValue(tools, count: 9))
    XCTAssertEqual(Plugins.toolsValue(enabled: 0, total: 0, count: 9), Plugins.toolsValue(nil, count: 9))

    box.answers["desktopMcp:resolvePluginLogo"] = ["src": "data:image/png;base64,AA=="]
    let logo = try await calls.logo("https://acme.dev/logo.png")
    XCTAssertEqual(logo, "data:image/png;base64,AA==")
  }

  func testAddSendsTheValuesAndSaysWhenTheTeamSetThem() async throws {
    let box = PluginsBox()
    let calls = PluginCalls(box)
    box.answers["desktopMcp:installEntry"] = ["servers": [["id": "acme", "pluginId": "acme"]]]
    let servers = try await calls.install("acme", values: ["token": "abc"], team: false)
    XCTAssertEqual(servers?.map(\.id), ["acme"])
    XCTAssertEqual(box.sent("desktopMcp:installEntry")?["args"], [["entryId": "acme", "values": ["token": "abc"]]])
    _ = try await calls.install("acme", values: [:], team: true)
    XCTAssertEqual(box.sent("desktopMcp:installEntry")?["args"], [["entryId": "acme", "values": [:], "hasTeamConfiguredVariables": true]])

    box.answers["desktopMcp:vendorServerIdForPlugin"] = "acme-vendor"
    let vendor = await calls.vendorServerId("acme")
    XCTAssertEqual(vendor, "acme-vendor")
    box.failing.insert("desktopMcp:vendorServerIdForPlugin")
    let noVendor = await calls.vendorServerId("acme")
    XCTAssertNil(noVendor, "a failure is no vendor's server")

    box.answers["desktopMcp:authenticateServer"] = ["status": "started", "authorizationUrl": "https://acme.dev/oauth"]
    let started = try await calls.signIn("acme-vendor", accountKey: PluginServer.defaultAccount)
    XCTAssertEqual(started["status"], "started")
    XCTAssertEqual(box.sent("desktopMcp:authenticateServer")?["args"], ["acme-vendor", "default"])

    try await calls.updateInstall("acme", values: ["token": "new"])
    XCTAssertEqual(box.sent("desktopMcp:updatePluginInstall")?["args"], [["pluginId": "acme", "values": ["token": "new"]]])
  }

  func testUninstallAndRemoveSayWhatHappened() async throws {
    let box = PluginsBox()
    let calls = PluginCalls(box)
    box.answers["desktopMcp:uninstallPlugin"] = ["removed": true, "state": ["servers": []]]
    let gone = try await calls.uninstallPlugin("linear")
    XCTAssertTrue(gone.removed)
    XCTAssertEqual(gone.servers, [])
    XCTAssertTrue(gone.resyncsSkills)
    XCTAssertEqual(box.sent("desktopMcp:uninstallPlugin")?["args"], ["linear"])

    box.answers["desktopMcp:removeServer"] = ["removed": false, "reason": "team-server"]
    let kept = try await calls.removeServer("s1")
    XCTAssertFalse(kept.removed)
    XCTAssertNil(kept.servers, "no state, the servers as they were")
    XCTAssertTrue(kept.resyncsSkills, "the team keeps it: its skills are synced again")
    XCTAssertEqual(Plugins.removedNotice("Linear", removed: kept.removed, reason: kept.reason).text, "Linear is provided by your team and can't be removed here")

    box.answers["desktopMcp:removeServer"] = ["removed": false]
    let refused = try await calls.removeServer("s1")
    XCTAssertFalse(refused.resyncsSkills)
  }

  func testTheSkillsSyncReplacesThePrivateCopies() async throws {
    let box = PluginsBox()
    let calls = PluginCalls(box)
    box.answers["syncPluginSkills"] = [["pluginId": "acme"], ["pluginId": "acme"], ["pluginId": "other"]]
    let counted = try await calls.syncSkills(of: "acme")
    XCTAssertEqual(counted, 2)
    let uncounted = try await calls.syncSkills()
    XCTAssertEqual(uncounted, 0)

    let entry = PluginEntry(json: ["id": "acme", "skills": [["name": "Brief", "sourceUrl": "git://acme/brief"], ["name": "Plain"]]])!
    let skills = [
      AgentSkill(json: ["id": "copy", "name": "Brief", "sourceRef": "git://acme/brief"])!,
      AgentSkill(json: ["id": "own", "name": "Mine"])!,
      AgentSkill(json: ["id": "elsewhere", "name": "Other", "sourceRef": "git://other/x"])!,
    ]
    XCTAssertEqual(Plugins.privateCopies(of: entry, in: skills).map(\.id), ["copy"])
    XCTAssertEqual(Plugins.privateCopies(of: PluginEntry(json: ["id": "bare"])!, in: skills), [])

    await calls.dropPrivateCopies(of: entry, from: skills, agentId: nil)
    XCTAssertNil(box.sent("deleteAgentWorkflow"), "no agent, nothing dropped")
    box.failing.insert("deleteAgentWorkflow")
    await calls.dropPrivateCopies(of: entry, from: skills, agentId: "theo")
    XCTAssertEqual(box.all("deleteAgentWorkflow"), [["id": "theo", "workflowId": "copy"]], "a failure is let go")
  }

  func testASkillsSwitchSaveAndDelete() async throws {
    let box = PluginsBox()
    let calls = PluginCalls(box)
    let skill = AgentSkill(json: ["id": "w1", "name": "Brief", "description": "Use when", "body": "Do it", "trigger": ["type": "manual"], "sourceRef": "git://acme/brief"])!

    box.answers["setAgentWorkflowEnabled"] = [["id": "w1", "isEnabledForAgent": false]]
    let switched = try await calls.setSkillEnabled(skill, false, agentId: "theo")
    XCTAssertEqual(switched.map(\.isEnabledForAgent), [false])
    XCTAssertEqual(box.sent("setAgentWorkflowEnabled"), ["id": "theo", "workflowId": "w1", "isEnabled": false])
    box.answers["setAgentWorkflowEnabled"] = ["ok": true]
    let odd = try await calls.setSkillEnabled(skill, true, agentId: "theo")
    XCTAssertEqual(odd, [], "an answer that is no list empties them, as the overlay's does")

    XCTAssertEqual(Plugins.skillSpec(skill, name: "  Morning brief ", description: " When asked \n", body: " Steps \n"),
                   ["name": "Morning brief", "description": "When asked", "body": " Steps \n", "trigger": ["type": "manual"], "sourceRef": "git://acme/brief"])
    let plain = AgentSkill(json: ["id": "w2", "name": "Plain"])!
    XCTAssertEqual(Plugins.skillSpec(plain, name: "Plain", description: "D", body: "B"), ["name": "Plain", "description": "D", "body": "B"])

    box.answers["updateAgentWorkflow"] = [["id": "w1", "name": "Morning brief"]]
    let saved = try await calls.updateSkill(skill, name: "Morning brief", description: "Use when", body: "Do it", agentId: "theo")
    XCTAssertEqual(saved?.map(\.name), ["Morning brief"])
    XCTAssertEqual(box.sent("updateAgentWorkflow")?["workflowId"], "w1")
    XCTAssertEqual(box.sent("updateAgentWorkflow")?["spec"]?["name"], "Morning brief")
    box.answers["updateAgentWorkflow"] = ["ok": true]
    let unlisted = try await calls.updateSkill(skill, name: "x", description: "y", body: "z", agentId: "theo")
    XCTAssertNil(unlisted, "no list: the skills stay as they were")

    box.answers["deleteAgentWorkflow"] = []
    let left = try await calls.deleteSkill("w1", agentId: "theo")
    XCTAssertEqual(left, [])
    XCTAssertEqual(box.sent("deleteAgentWorkflow"), ["id": "theo", "workflowId": "w1"])
  }

  @MainActor
  func testFixWithAgentMakesThePluginSetupAgentAndTellsIt() async throws {
    let box = PluginsBox()
    box.answers["createAgent"] = ["agent": ["id": "setup-1"]]
    let store = AppStore()
    await store.attach(box)
    let made = await store.makePluginSetupAgent()
    XCTAssertEqual(made.id, "setup-1")
    XCTAssertNil(made.failure)
    XCTAssertEqual(box.sent("createAgent"), ["name": "Plugin Setup", "description": .string(Plugins.setupAgentDescription), "purpose": "plugin-auth", "isIntroductionSuppressed": true])
    XCTAssertEqual(box.messages.map(\.agentId), ["setup-1"])
    XCTAssertEqual(box.messages.first?.text, Plugins.setupAgentRequest)
    XCTAssertEqual(Plugins.setupAgent(in: store.agents)?.id, "setup-1", "the roster was read again, and has it")

    // The message could not be sent: the agent opens all the same, and why is said.
    box.failSends = true
    let unsent = await store.makePluginSetupAgent()
    XCTAssertEqual(unsent.id, "setup-1")
    XCTAssertEqual(unsent.failure, "offline")

    box.answers["createAgent"] = ["ok": true]
    let none = await store.makePluginSetupAgent()
    XCTAssertNil(none.id)
    // The gateway's own words never show (PlainWords, 13 October 2026).
    XCTAssertEqual(none.failure, PlainWords.unavailable)
    XCTAssertEqual(Plugins.agentFailedNotice(none.failure ?? "").text, "Couldn't start the agent: \(PlainWords.unavailable)")

    let signedOut = AppStore()
    let out = await signedOut.makePluginSetupAgent()
    XCTAssertEqual(out.failure, "Sign in to Simeon first.")
  }

  /** Apps that can't be added yet (the founder, 13 October 2026: "mark a clearer coming soon … they cant be added"). */
  @MainActor
  func testAppsThatCantBeAddedYetSayComingSoon() async throws {
    // Before Simeon Labs' server answers: the apps that need its own sign-in with the company.
    let store = AppStore()
    XCTAssertTrue(store.isComingSoon("Xero"))
    XCTAssertTrue(store.isComingSoon("docusign"))
    XCTAssertFalse(store.isComingSoon("Gmail"))

    let box = PluginsBox()
    box.answers["desktopMcp:getCatalog"] = ["plugins": [["id": "xero", "displayName": "Xero"], ["id": "acme", "displayName": "Acme", "comingSoon": true], ["id": "gmail", "displayName": "Gmail"]]]
    box.answers["server:apps"] = ["available": true, "comingSoon": ["gusto", "Brex"]]
    await store.attach(box)
    await store.loadApps()
    XCTAssertEqual(store.appsComingSoon, ["gusto", "brex"])
    XCTAssertFalse(store.isComingSoon("Xero"), "its own sign-in is set up on the server: Add is back")
    XCTAssertTrue(store.isComingSoon("Gusto"))
    XCTAssertTrue(store.isComingSoon("Acme"), "the catalog's own word holds")
    XCTAssertFalse(store.isComingSoon("Gmail"))

    // An older server names none: the list stays as it is.
    box.answers["server:apps"] = ["available": true]
    await store.loadAppsComingSoon()
    XCTAssertEqual(store.appsComingSoon, ["gusto", "brex"])
    XCTAssertNil(AppsComingSoon.from(["available": true]))
    XCTAssertEqual(AppsComingSoon.from(["comingSoon": []]), [])
  }
}

/** A box that writes down each command and answers from a script: `desktopMcp`'s actions by "desktopMcp:<action>". */
final class PluginsBox: AgentBackend, @unchecked Sendable {
  private let lock = NSLock()
  private var log: [(key: String, args: JSON)] = []
  var answers: [String: JSON] = [:]
  var failing: Set<String> = []
  var failSends = false
  private(set) var messages: [(agentId: String, text: String)] = []
  private var made: [Agent] = []

  /** The arguments of the last call to `key`. */
  func sent(_ key: String) -> JSON? { lock.withLock { log.last { $0.key == key }?.args } }
  /** The arguments of every call to `key`. */
  func all(_ key: String) -> [JSON] { lock.withLock { log.filter { $0.key == key }.map(\.args) } }

  func command(_ method: String, _ args: JSON) async throws -> JSON {
    let key = method == "desktopMcp" ? "desktopMcp:\(args["action"]?.string ?? "")" : method
    let answer: JSON? = lock.withLock {
      log.append((key, args))
      if key == "createAgent", let id = answers[key]?["agent"]?["id"]?.text, !made.contains(where: { $0.id == id }) {
        var agent = Agent(id: id, name: args["name"]?.text ?? "")
        agent.purpose = args["purpose"]?.text
        made.append(agent)
      }
      return failing.contains(key) ? nil : answers[key] ?? .null
    }
    guard let answer else { throw GatewayError(message: "\(key) failed", refused: true) }
    return answer
  }

  func listAgents() async throws -> [Agent] { lock.withLock { made } }
  func transcript(_ agentId: String) async throws -> [Entry] { [] }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws {
    if failSends { throw GatewayError(message: "offline", refused: false) }
    lock.withLock { messages.append((agentId, text)) }
  }
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, face: String?) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { _ in } }
  var call: CallEngine? { nil }
  /** Simeon Labs' server, answered by "server:<path>". */
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON {
    lock.withLock {
      log.append(("server:\(path)", body ?? .null))
      return answers["server:\(path)"] ?? [:]
    }
  }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
