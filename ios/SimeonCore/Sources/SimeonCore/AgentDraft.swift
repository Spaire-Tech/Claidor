import Foundation

/**
 * A new agent's look before it exists (the New Agent sheet's pencil, the
 * founder, 13 October 2026: "have the avatar picker available too"): the
 * face picked, else the one its name gets (`AgentFaces.preview`, as the sheet
 * showed before); a picture drawn or uploaded instead of a face; the voice
 * picked, else, once the person chose anything, one of the face's gender, so
 * a woman's face picked for "Leo" speaks with a woman's voice. Nothing goes
 * to the host until Create (`AppStore.createAgent(name:draft:)`).
 */
public struct AgentDraft: Equatable, Sendable {
  public var name: String
  /** A face the person picked (a tap, Shuffle); nil follows the name. */
  public private(set) var face: AgentFace?
  /** A picture drawn or uploaded, cropped: the 256-pixel PNG the editor makes. */
  public private(set) var picture: Data?
  /** The voice: picked, or settled for the editor to show. */
  public private(set) var voiceId: String?

  public init(name: String = "") {
    self.name = name
  }

  /** Whether the person chose anything; otherwise the agent is made as before (its name's face, a voice given later). */
  public var chosen: Bool { face != nil || picture != nil || voiceId != nil }

  /** The face shown and kept on the agent: the one picked, else its name's. */
  public func shownFace(agents: [Agent]) -> AgentFace? {
    face ?? AgentFaces.preview(name: name, agents: agents)
  }

  /** The agent as the editor draws it: no id yet, wearing the face (or the picture) and the voice chosen. */
  public func agent(agents: [Agent]) -> Agent {
    var agent = Agent(id: "", name: name)
    let shown = shownFace(agents: agents)
    agent.avatarShape = shown?.id
    if let picture {
      agent.avatarDataURL = "data:image/png;base64," + picture.base64EncodedString()
    } else {
      agent.avatarVersion = shown?.version
    }
    agent.voiceId = voiceId
    return agent
  }

  /** A face picked: worn instead of any picture; a voice of the other gender changes with it (as `AppStore.wearFace`). */
  public mutating func wear(_ face: AgentFace, agents: [Agent], voices: [AppStore.VoiceChoice]) {
    self.face = face
    picture = nil
    follow(face, agents: agents, voices: voices)
  }

  /** Shuffle: the next face of `gender` no agent wears. */
  public mutating func shuffle(gender: String, agents: [Agent], voices: [AppStore.VoiceChoice]) {
    let current = picture == nil ? shownFace(agents: agents) : nil
    guard let next = AgentFaces.shuffle(after: current, gender: gender, agentId: "", agents: agents) else { return }
    wear(next, agents: agents, voices: voices)
  }

  /** Reset face: back to the face its name gets, the picture gone. */
  public mutating func reset(agents: [Agent], voices: [AppStore.VoiceChoice]) {
    face = nil
    picture = nil
    if let shown = shownFace(agents: agents) { follow(shown, agents: agents, voices: voices) }
  }

  /** A picture drawn or uploaded, worn instead of a face. */
  public mutating func setPicture(_ png: Data) {
    picture = png
  }

  public mutating func pickVoice(_ voiceId: String) {
    self.voiceId = voiceId
  }

  /** The voice to show and send: the one picked while listed, else the voice of the face's gender the team has fewest of. */
  public func voice(agents: [Agent], voices: [AppStore.VoiceChoice]) -> String? {
    if let kept = AgentVoices.kept(voiceId, listed: voices) { return kept }
    guard !voices.isEmpty else { return nil }
    return AgentVoices.pick(agentId: seed, name: name, isChiefOfStaff: false, voices: voices, taken: taken(agents, voices), gender: shownFace(agents: agents)?.gender)
  }

  /** The voice kept for Create (`voice(agents:voices:)`). */
  public mutating func settleVoice(agents: [Agent], voices: [AppStore.VoiceChoice]) {
    guard !voices.isEmpty else { return }
    voiceId = voice(agents: agents, voices: voices)
  }

  /** Whether the editor's Reset face has anything to undo. */
  public var resettable: Bool { face != nil || picture != nil }

  /** A voice picked of the other gender than the new face's gives way to one of its gender; a voice not picked follows the face anyway (`voice(agents:voices:)`). */
  private mutating func follow(_ face: AgentFace, agents: [Agent], voices: [AppStore.VoiceChoice]) {
    guard let current = AgentVoices.kept(voiceId, listed: voices),
          let gender = AgentFaces.voiceGender(current, voices: voices), gender != face.gender else { return }
    voiceId = AgentVoices.pick(agentId: seed, name: name, isChiefOfStaff: false, voices: voices, taken: taken(agents, voices), gender: face.gender)
  }

  private var seed: String { name.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased() }

  private func taken(_ agents: [Agent], _ voices: [AppStore.VoiceChoice]) -> [String] {
    AgentFaces.people(agents).compactMap { AgentVoices.kept($0.voiceId, listed: voices) }
  }
}
