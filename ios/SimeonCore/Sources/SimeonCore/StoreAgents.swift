import Foundation

/**
 * The agents' own commands as the Mac's window sends them (slice 3): the
 * routines of the agent's pane, the sidebar's sections, the profile's
 * fields one at a time, the avatar and the group's members, and the new
 * chat's agents and groups. Where the window shows nothing on a failure,
 * these stay quiet too and say so by their answer.
 */
extension AppStore {
  // MARK: Routines (the pane's Routines tab)

  /** The agent's routines, read again (`getAgentAutomations`); false when the computer did not answer. */
  @discardableResult
  public func loadRoutines(_ agentId: String) async -> Bool {
    guard let backend, let answer = try? await backend.command("getAgentAutomations", ["id": .string(agentId)]) else { return false }
    takeRoutines(agentId, answer)
    return true
  }

  /** A new routine (`createAgentAutomation`): the record made, or nil when none was (a refusal, or the agent's 50 already). */
  public func createRoutine(_ agentId: String, spec: JSON) async -> Routine? {
    guard let backend else { return nil }
    let before = Set((routinesByAgent[agentId] ?? []).map(\.id))
    guard let answer = try? await backend.command("createAgentAutomation", ["id": .string(agentId), "spec": spec]) else { return nil }
    takeRoutines(agentId, answer)
    return RoutineDraft.created(routinesByAgent[agentId] ?? [], before: before, name: spec["name"]?.string ?? "")
  }

  /** A routine changed (`updateAgentAutomation`); false when it was not saved. */
  public func updateRoutine(_ agentId: String, _ routineId: String, spec: JSON) async -> Bool {
    guard let backend, let answer = try? await backend.command("updateAgentAutomation", ["id": .string(agentId), "automationId": .string(routineId), "spec": spec]) else { return false }
    takeRoutines(agentId, answer)
    return true
  }

  /** The Active switch (`setAgentAutomationEnabled`), shown at once; false when refused, and the switch goes back. */
  public func enableRoutine(_ agentId: String, _ routineId: String, _ on: Bool) async -> Bool {
    let was = routinesByAgent[agentId]
    if var list = was, let index = list.firstIndex(where: { $0.id == routineId }) {
      list[index].isEnabled = on
      routinesByAgent[agentId] = list
    }
    guard let backend, let answer = try? await backend.command("setAgentAutomationEnabled", ["id": .string(agentId), "automationId": .string(routineId), "isEnabled": .bool(on)]) else {
      routinesByAgent[agentId] = was
      return false
    }
    takeRoutines(agentId, answer)
    return true
  }

  /** Delete, with no question and nothing said when it fails (`deleteAgentAutomation`). */
  public func removeRoutine(_ agentId: String, _ routineId: String) async {
    guard let backend, let answer = try? await backend.command("deleteAgentAutomation", ["id": .string(agentId), "automationId": .string(routineId)]) else { return }
    takeRoutines(agentId, answer)
  }

  /** Test run (`runAgentAutomationNow`), then the list again for its new run; nothing is said either way. */
  public func testRoutine(_ agentId: String, _ routineId: String) async {
    _ = try? await backend?.command("runAgentAutomationNow", ["id": .string(agentId), "automationId": .string(routineId)])
    await loadRoutines(agentId)
  }

  func takeRoutines(_ agentId: String, _ answer: JSON) {
    guard let rows = answer.array ?? answer["automations"]?.array else { return }
    let list = rows.compactMap(Routine.init(json:))
    if routinesByAgent[agentId] != list { routinesByAgent[agentId] = list }
  }

  // MARK: The sidebar's sections

  /** The host's sections (`getHostSettings` → `sidebarSections`, an empty list when none). */
  public func loadSections() async {
    let started = sectionWrites
    guard let settings = try? await backend?.command("getHostSettings", [:]), started == sectionWrites else { return }
    let next = SidebarSections.parse(settings["sidebarSections"] ?? .array([]))
    if next != sidebarSections { sidebarSections = next }
  }

  /**
   * One change to the sections, shown at once and written whole
   * (`setHostSettings({sidebarSections})`), as the window's store edits
   * them; a refusal puts back what the host holds. Nothing changes before
   * the computer has answered once.
   */
  @discardableResult
  public func editSections(_ change: ([SidebarSection]) -> [SidebarSection]) -> Bool {
    guard let current = sidebarSections else { return false }
    let next = SidebarSections.normalize(change(current))
    guard next != current else { return true }
    sectionWrites += 1
    sidebarSections = next
    Task {
      let written = try? await backend?.command("setHostSettings", ["sidebarSections": SidebarSections.json(next)])
      if written == nil { await loadSections() }
    }
    return true
  }

  /** A new section at the top, holding these agents; its id, to rename it at once. */
  public func createSection(with agentIds: [String]) -> String? {
    guard sidebarSections != nil else { return nil }
    sectionSeed += 1
    let id = SidebarSections.newId(seed: sectionSeed)
    editSections { SidebarSections.create($0, id: id, agentIds: agentIds) }
    return id
  }

  // MARK: The profile, a field at a time

  /**
   * One field of the profile (`updateAgent`), as the pane sends it: the
   * name and description always, the title only when it is the field
   * changed. Shown at once; a refusal puts the roster back.
   */
  public func saveProfileField(_ agentId: String, name: String, description: String, title: String? = nil) async {
    guard let index = agents.firstIndex(where: { $0.id == agentId }) else { return }
    var profile: JSON = ["name": .string(name), "description": .string(description)]
    if let title { profile = profile.setting("title", .string(title)) }
    updateAgentLocally(index) { agent in
      agent.name = name; agent.description = description
      if let title { agent.title = title }
    }
    if (try? await backend?.command("updateAgent", ["id": .string(agentId), "profile": profile])) == nil { await reloadRoster() }
  }

  /** Rename in the row (`updateAgent` with the name and the description as they are). */
  public func renameAgent(_ agentId: String, to name: String) async {
    guard let agent = agent(agentId) else { return }
    await saveProfileField(agentId, name: name, description: agent.description)
  }

  /** The character's colour (`updateAgent` with `avatarColor`); "" puts the shape and colour back to the agent's own. */
  public func setCharacter(_ agentId: String, colour: String) async throws {
    guard let agent = agent(agentId), let backend else { return }
    var profile: JSON = ["name": .string(agent.name), "description": .string(agent.description), "avatarColor": .string(colour)]
    if colour.isEmpty { profile = profile.setting("avatarShape", .string("")) }
    if let index = agents.firstIndex(where: { $0.id == agentId }) { updateAgentLocally(index) { $0.colour = colour.isEmpty ? nil : colour } }
    do { _ = try await backend.command("updateAgent", ["id": .string(agentId), "profile": profile]) } catch {
      await reloadRoster()
      throw error
    }
  }

  /** A picture for the agent, or none to go back to its character (`setAgentAvatarBytes`); the host's refusal is thrown. */
  public func setAvatarImage(_ agentId: String, png: Data?) async throws {
    guard let backend else { return }
    _ = try await backend.command("setAgentAvatarBytes", ["id": .string(agentId), "pngBase64": png.map { .string($0.base64EncodedString()) } ?? .null])
    await reloadRoster()
  }

  /** A picture drawn from a description for the avatar editor (`images/generations`, as the Mac asks for one); its words on failure. */
  public func generateAvatarImage(_ description: String) async throws -> Data {
    let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { throw GatewayError(message: "Describe the avatar to generate first.", refused: true) }
    guard let backend else { throw GatewayError(message: "Image generation returned no picture.", refused: false) }
    let answer = try await backend.server("proxy/v1/images/generations", method: "POST", body: ["prompt": .string(text), "size": "auto", "quality": "low"])
    guard let base64 = answer["data"]?[0]?["b64_json"]?.text, let bytes = Data(base64Encoded: base64) else {
      throw GatewayError(message: "Image generation returned no picture.", refused: false)
    }
    return bytes
  }

  /** A group's members (`setGroupMembers`); thrown when refused, for the dialog to say. */
  public func setGroupMembers(_ groupId: String, _ memberIds: [String]) async throws {
    guard let backend else { return }
    let was = agent(groupId)?.memberIds
    if let index = agents.firstIndex(where: { $0.id == groupId }) { updateAgentLocally(index) { $0.memberIds = memberIds } }
    do { _ = try await backend.command("setGroupMembers", ["id": .string(groupId), "memberAgentIds": JSON(memberIds)]) } catch {
      if let was, let index = agents.firstIndex(where: { $0.id == groupId }) { updateAgentLocally(index) { $0.memberIds = was } }
      throw error
    }
  }

  // MARK: The new chat

  /**
   * A new agent from the To: line (`createAgent` with `origin: "user"`, the
   * host picking its colour): its id. `kickstart` asks the host to have it
   * introduce itself; `quiet` keeps it from introducing itself at all.
   */
  public func makeAgent(name: String, description: String = "", kickstart: Bool? = nil, quiet: Bool = false) async throws -> String {
    guard let backend else { throw GatewayError(message: "Can't reach your computer right now. Check your connection and try again.", refused: false) }
    var args: JSON = ["name": .string(name), "description": .string(description), "origin": "user"]
    if let kickstart { args = args.setting("isKickstartRequested", .bool(kickstart)) }
    if quiet { args = args.setting("isIntroductionSuppressed", true) }
    let answer = try await backend.command("createAgent", args)
    guard let id = answer["agent"]?["id"]?.text ?? answer["id"]?.text else { throw GatewayError(message: "createAgent: no agent in the answer", refused: true) }
    await reloadRoster()
    return id
  }

  /** A group of agents (`createGroup`); the host opens the one it already has for the same members. */
  public func makeGroup(name: String, memberIds: [String]) async throws -> String {
    guard let backend else { throw GatewayError(message: "Can't reach your computer right now. Check your connection and try again.", refused: false) }
    let answer = try await backend.command("createGroup", ["name": .string(name), "description": "", "memberAgentIds": JSON(memberIds)])
    guard let id = answer["agent"]?["id"]?.text ?? answer["id"]?.text else { throw GatewayError(message: "createGroup: no group in the answer", refused: true) }
    await reloadRoster()
    return id
  }

  /** A new agent with nothing to say yet introduces itself (`kickstartAgent`). */
  public func kickstart(_ agentId: String) async {
    _ = try? await backend?.command("kickstartAgent", ["id": .string(agentId)])
  }

  /** Deletes agents or groups (`deleteAgents`); thrown when refused, for the dialog to say, and nothing else is said. */
  public func deleteAgents(_ agentIds: [String]) async throws {
    guard let backend else { return }
    _ = try await backend.command("deleteAgents", ["ids": JSON(agentIds)])
    forgetAgents(agentIds)
  }
}
