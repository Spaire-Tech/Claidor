import Foundation

/**
 * The agents' faces in the store (AgentFaces, 12 October 2026). Every agent
 * with no picture is given a face as soon as the roster lists it: new ones
 * hired by Simeon on the computer, and those from before faces existed. The
 * face is a picture like an uploaded one (`setAgentAvatarBytes`), and the
 * face given is kept on the agent (`updateAgent` with `avatarShape`), so the
 * iPhone, the Mac and the computer all see it. Faces are given here, in the
 * apps, so no new engine is needed: the host only stores what it is sent.
 */
extension AppStore {
  /** Rows from the host with the faces given here and not yet on them worn already, so a face shows at once; a face the host shows is no longer pending. */
  func wearingFaces(_ list: [Agent]) -> [Agent] {
    guard !pendingFaces.isEmpty else { return list }
    var worn = list
    for index in worn.indices {
      let agent = worn[index]
      guard let face = pendingFaces[agent.id] else { continue }
      if agent.hasPicture {
        // The host has it now, or another picture came meanwhile: the host's row is the agent's.
        pendingFaces[agent.id] = nil
      } else {
        worn[index].avatarVersion = face.version
        worn[index].avatarShape = face.id
      }
    }
    return worn
  }

  /** On a roster change: a pass when an agent lacks a face and none has been sent for it. */
  func queueFaces() {
    // Not on the list kept on this device: it may hold an agent deleted since, and the computer's own list follows.
    guard givingFaces == nil, backend != nil, !showingSaved else { return }
    guard agents.contains(where: { !$0.isGroup && !$0.isRemoteRoom && !$0.hasPicture && !facesSent.contains($0.id) }) else { return }
    givingFaces = Task { [weak self] in
      await self?.giveMissingFaces()
      self?.givingFaces = nil
    }
  }

  /** Every agent without a picture given its face; waits for a pass already under way. */
  public func assignMissingFaces() async {
    if let givingFaces { await givingFaces.value; return }
    let task = Task { await self.giveMissingFaces() }
    givingFaces = task
    await task.value
    givingFaces = nil
  }

  private func giveMissingFaces() async {
    let list = await voices()
    let plan = AgentFaces.plan(agents: agents, voices: list).filter { !facesSent.contains($0.agentId) }
    guard !plan.isEmpty, let backend else { return }
    // The rows as the host has them, before the faces are worn on them here.
    let rows = Dictionary(agents.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    for (agentId, face) in plan {
      pendingFaces[agentId] = face
      facesSent.insert(agentId)
    }
    wearPendingFaces()
    for (agentId, face) in plan {
      guard !Task.isCancelled, let agent = rows[agentId] else { continue }
      do {
        try await send(face, to: agent, backend: backend)
        Trace.mark("face for \(agentId): \(face.id)")
      } catch {
        Trace.mark("face \(face.id) shown on \(agentId), not saved: \(error.localizedDescription)")
      }
    }
    await reloadRoster()
  }

  /** The face's picture to the host, and the face kept on the agent when it was not kept already (with the voice, when one is given with it). */
  private func send(_ face: AgentFace, to agent: Agent, voiceId: String? = nil, backend: AgentBackend) async throws {
    guard let bytes = AgentFaces.data(face) else { throw GatewayError(message: L10n.text("The face \(face.id) is missing from the app."), refused: true) }
    _ = try await backend.command("setAgentAvatarBytes", ["id": .string(agent.id), "pngBase64": .string(bytes.base64EncodedString())])
    guard agent.avatarShape != face.id || voiceId != nil else { return }
    // `updateAgent` always carries the name and the description; the fields left out are kept.
    var profile: JSON = ["name": .string(agent.name), "description": .string(agent.description), "avatarShape": .string(face.id)]
    if let voiceId { profile = profile.setting("voiceId", .string(voiceId)) }
    _ = try await backend.command("updateAgent", ["id": .string(agent.id), "profile": profile])
  }

  // MARK: The avatar editor

  /**
   * A face from the editor (a pick, Shuffle or Reset): the agent's picture,
   * and the face kept on it. When the face is not of its voice's gender, the
   * voice changes with it to the voice of the face's gender fewest agents
   * have, so face and voice agree (the founder, 12 October 2026). Shown at
   * once; a refusal puts the roster back and is thrown.
   */
  public func wearFace(_ agentId: String, _ face: AgentFace) async throws {
    guard let backend, let agent = agent(agentId) else { return }
    pendingFaces[agentId] = nil
    let list = await voices()
    let voiceId = AgentFaces.voice(for: agent, wearing: face, agents: agents, voices: list)
    if let index = agents.firstIndex(where: { $0.id == agentId }) {
      updateAgentLocally(index) { row in
        row.avatarVersion = face.version; row.avatarShape = face.id; row.avatarDataURL = nil
        if let voiceId { row.voiceId = voiceId }
      }
    }
    do {
      try await send(face, to: agent, voiceId: voiceId, backend: backend)
    } catch {
      await reloadRoster()
      throw error
    }
    await reloadRoster()
  }


  /** Shuffle: the next face of `gender` no other agent wears, put on at once; the face, or nil when there is none. */
  @discardableResult
  public func shuffleFace(_ agentId: String, gender: String) async throws -> AgentFace? {
    guard let agent = agent(agentId) else { return nil }
    let current = AgentFaces.own(agent)
    guard let face = AgentFaces.shuffle(after: current?.gender == gender ? current : nil, gender: gender, agentId: agentId, agents: agents) else { return nil }
    try await wearFace(agentId, face)
    return face
  }

  /** Reset: back to the face the agent was given (or the one it would be given now, for an agent from before faces). */
  @discardableResult
  public func resetFace(_ agentId: String) async throws -> AgentFace? {
    guard let agent = agent(agentId), let face = AgentFaces.reset(agent, agents: agents, voices: await voices()) else { return nil }
    try await wearFace(agentId, face)
    return face
  }
}
