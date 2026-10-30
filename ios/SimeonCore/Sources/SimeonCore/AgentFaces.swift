import Foundation

/**
 * One of the agents' faces: the founder's clay characters (12 October 2026),
 * shipped in both apps (Resources/Faces, made by ios/scripts/make-faces.py).
 * Any face fits any role; each is a woman's or a man's.
 */
public struct AgentFace: Identifiable, Hashable, Sendable {
  /** "clay-07"; Simeon's is "clay-simeon". Stored on the agent as its `avatarShape`. */
  public let id: String
  /** "female" or "male", as `AgentVoices` writes a name's or a voice's. */
  public let gender: String
  public let file: String
  /** The first 16 hex characters of the file's SHA-256: the host's `avatarVersion` for an agent wearing it. */
  public let version: String
  /** The colour of the face's background ("#618283"), which the "just joined your team" card is drawn in (`JoinedCard.Colours`). */
  public let backdrop: RGB?

  public init(id: String, gender: String, file: String, version: String, backdrop: RGB? = nil) {
    self.id = id; self.gender = gender; self.file = file; self.version = version; self.backdrop = backdrop
  }
}

/**
 * Every agent shows a picture (the founder, 12 October 2026: "No more
 * butterflies"). A face from the catalogue is a picture like any other: it
 * is set with `setAgentAvatarBytes`, so it lands in the agent's folder as
 * `avatar.png`, syncs, and shows wherever an uploaded picture does.
 *
 * Which face an agent gets:
 * - The Chief of Staff gets Simeon's own face, which no other agent is given.
 * - Any other agent gets the face fewest agents wear, among its gender's: the
 *   name's gender (`AgentVoices.nameGender`, as its voice gets), so face and
 *   voice agree. A name with none (Alex, Sam) takes its voice's gender, else
 *   one its id picks; the face then keeps it, and its voice follows the face.
 * - Between faces equally free, the agent's id decides (the voices' FNV-1a
 *   hash), so the iPhone and the Mac give the same agent the same face.
 * - The face it was given is kept on the agent (`avatarShape`, a profile
 *   field the host stores and passes on untouched): a picture uploaded later
 *   leaves it, and Reset puts it back.
 */
public enum AgentFaces {
  public static let simeonId = "clay-simeon"

  /** Every face, in the editor's order: the numbered ones, then Simeon's. */
  public static let all: [AgentFace] = load()
  /** The faces given to agents: all but Simeon's. */
  public static let pool: [AgentFace] = all.filter { $0.id != simeonId }

  private static let byId: [String: AgentFace] = Dictionary(all.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
  private static let byVersion: [String: AgentFace] = Dictionary(all.map { ($0.version, $0) }, uniquingKeysWith: { first, _ in first })

  static func load() -> [AgentFace] {
    guard let url = Bundle.module.url(forResource: "faces", withExtension: "json", subdirectory: "Faces"),
          let data = try? Data(contentsOf: url),
          let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let rows = root["faces"] as? [[String: Any]] else { return [] }
    return rows.compactMap { row in
      guard let id = row["id"] as? String, let gender = row["gender"] as? String,
            let file = row["file"] as? String, let version = row["version"] as? String else { return nil }
      return AgentFace(id: id, gender: gender, file: file, version: version, backdrop: (row["backdrop"] as? String).map { RGB(hex: $0) })
    }
  }

  public static func face(id: String?) -> AgentFace? { id.flatMap { byId[$0] } }
  public static func face(version: String?) -> AgentFace? { version.flatMap { byVersion[$0] } }
  public static var simeon: AgentFace? { byId[simeonId] }

  /** The face's picture as shipped (WebP, 512 px): what is sent to the host, and what the apps draw. */
  public static func data(_ face: AgentFace) -> Data? {
    let name = (face.file as NSString).deletingPathExtension
    let type = (face.file as NSString).pathExtension
    guard let url = Bundle.module.url(forResource: name, withExtension: type, subdirectory: "Faces") else { return nil }
    return try? Data(contentsOf: url)
  }

  /**
   * The face standing on its own, its background taken away
   * (Resources/Faces/Standing, made by ios/scripts/make-face-cutouts.py):
   * what the "just joined your team" card shows (JoinedCard.swift).
   */
  public static func standingData(_ face: AgentFace) -> Data? {
    guard let url = Bundle.module.url(forResource: face.id, withExtension: "webp", subdirectory: "Faces/Standing") else { return nil }
    return try? Data(contentsOf: url)
  }

  /** The face an agent stands as on that card: the catalogue face it wears, or, with no picture yet, the one it was given; none for a picture of its own. */
  public static func standing(_ agent: Agent) -> AgentFace? {
    if let face = worn(agent) { return face }
    return agent.hasPicture ? nil : given(agent)
  }

  /** The catalogue face the agent's picture is, if it is one. */
  public static func worn(_ agent: Agent) -> AgentFace? { face(version: agent.avatarVersion) }
  /** The face the agent was given (`avatarShape`), worn now or not. */
  public static func given(_ agent: Agent) -> AgentFace? { face(id: agent.avatarShape) }
  /** Its face: the one it wears, else the one it was given. */
  public static func own(_ agent: Agent) -> AgentFace? { worn(agent) ?? given(agent) }

  /** A face for an agent this app knows only by its id (a member of someone else's room): never stored. */
  public static func stand(forId id: String) -> AgentFace? {
    pool.isEmpty ? simeon : pool[Int(AgentVoices.stableHash(id) % UInt32(pool.count))]
  }

  /** A voice's gender: the listed voice's, else the curated list's. */
  public static func voiceGender(_ voiceId: String?, voices: [AppStore.VoiceChoice]) -> String? {
    guard let voiceId else { return nil }
    return voices.first { $0.id == voiceId }.flatMap(AgentVoices.gender(of:)) ?? AgentVoices.curatedGenders[voiceId]
  }

  /** The gender of the face an agent is given: its name's; else its face's; else its voice's; else one its id picks. */
  public static func gender(for agent: Agent, voices: [AppStore.VoiceChoice] = []) -> String {
    if let named = AgentVoices.nameGender(agent.name) { return named }
    if let face = own(agent) { return face.gender }
    if let voice = voiceGender(agent.voiceId, voices: voices) { return voice }
    return AgentVoices.stableHash(agent.id) % 2 == 0 ? "female" : "male"
  }

  /** The face fewest agents wear among `gender`'s (all faces when that gender has none); ties go by the agent's id. */
  public static func pick(agentId: String, gender: String, taken: [String]) -> AgentFace? {
    let matching = pool.filter { $0.gender == gender }
    let candidates = matching.isEmpty ? pool : matching
    guard !candidates.isEmpty else { return nil }
    var counts: [String: Int] = [:]
    for id in taken { counts[id, default: 0] += 1 }
    let fewest = candidates.map { counts[$0.id] ?? 0 }.min() ?? 0
    let free = candidates.filter { (counts[$0.id] ?? 0) == fewest }
    return free[Int(AgentVoices.stableHash(agentId) % UInt32(free.count))]
  }

  /** Agents that wear a face: not groups, not someone else's rooms. */
  static func people(_ agents: [Agent]) -> [Agent] {
    agents.filter { !$0.isGroup && !$0.isRemoteRoom && !$0.id.isEmpty }.sorted { Array($0.id.utf16).lexicographicallyPrecedes(Array($1.id.utf16)) }
  }

  /**
   * The faces to give in one pass, in agent-id order as the voices are
   * given: to every agent with no picture. One that was given a face before
   * gets it back; the Chief of Staff gets Simeon's; any other the face its
   * gender has fewest of, counting the ones given earlier in the pass.
   */
  public static func plan(agents: [Agent], voices: [AppStore.VoiceChoice] = []) -> [(agentId: String, face: AgentFace)] {
    let people = people(agents)
    let chief = Agent.chiefOfStaff(in: people)?.id
    var taken = people.compactMap { own($0)?.id }
    var given: [(agentId: String, face: AgentFace)] = []
    for agent in people where !agent.hasPicture {
      guard let face = face(toGive: agent, isChiefOfStaff: agent.id == chief, taken: taken, voices: voices) else { continue }
      given.append((agent.id, face))
      if own(agent) == nil { taken.append(face.id) }
    }
    return given
  }

  /** The face `agent` is given: the one it was given before, Simeon's for the Chief of Staff, else the one its gender has fewest of in `taken`. */
  static func face(toGive agent: Agent, isChiefOfStaff: Bool, taken: [String], voices: [AppStore.VoiceChoice]) -> AgentFace? {
    if let back = given(agent) { return back }
    if isChiefOfStaff, let simeon { return simeon }
    return pick(agentId: agent.id, gender: gender(for: agent, voices: voices), taken: taken)
  }

  /** The voice that goes with `face` when the agent's own is of the other gender (the editor's choice of a face); nil to keep its own, or when it has none yet: it will be given one of the face's gender. */
  public static func voice(for agent: Agent, wearing face: AgentFace, agents: [Agent], voices: [AppStore.VoiceChoice]) -> String? {
    guard !voices.isEmpty, let current = AgentVoices.kept(agent.voiceId, listed: voices),
          let gender = voiceGender(current, voices: voices), gender != face.gender else { return nil }
    let isChief = Agent.chiefOfStaff(in: agents)?.id == agent.id && simeon?.gender == face.gender
    let taken = agents.filter { $0.id != agent.id }.compactMap { AgentVoices.kept($0.voiceId, listed: voices) }
    return AgentVoices.pick(agentId: agent.id, name: agent.name, isChiefOfStaff: isChief, voices: voices, taken: taken, gender: face.gender)
  }

  /**
   * The face a new agent named `name` gets (the New Agent sheet shows it as
   * the name is typed, and sends it as the agent's face): of the name's
   * gender, else one the name picks, the one the team has fewest of.
   */
  public static func preview(name: String, agents: [Agent]) -> AgentFace? {
    let seed = name.split(whereSeparator: \.isWhitespace).joined(separator: " ").lowercased()
    let gender = AgentVoices.nameGender(name) ?? (AgentVoices.stableHash(seed) % 2 == 0 ? "female" : "male")
    return pick(agentId: seed, gender: gender, taken: people(agents).compactMap { own($0)?.id })
  }

  /** The editor's Reset: the face the agent was given, else the one it would be given now, counting every other agent's. */
  public static func reset(_ agent: Agent, agents: [Agent], voices: [AppStore.VoiceChoice] = []) -> AgentFace? {
    let others = people(agents).filter { $0.id != agent.id }
    let isChief = Agent.chiefOfStaff(in: people(agents))?.id == agent.id
    var bare = agent
    bare.avatarVersion = nil; bare.avatarDataURL = nil
    return face(toGive: bare, isChiefOfStaff: isChief, taken: others.compactMap { own($0)?.id }, voices: voices)
  }

  /**
   * The editor's Shuffle: the next face of `gender` after `current` (in the
   * catalogue's order, round again at the end) that no other agent wears; when
   * every one is worn, simply the next.
   */
  public static func shuffle(after current: AgentFace?, gender: String, agentId: String, agents: [Agent]) -> AgentFace? {
    let faces = pool.filter { $0.gender == gender }
    guard !faces.isEmpty else { return nil }
    let others = Set(people(agents).filter { $0.id != agentId }.compactMap { own($0)?.id })
    let start = current.flatMap { face in faces.firstIndex(of: face) } ?? (faces.count - 1)
    let order = (1...faces.count).map { faces[(start + $0) % faces.count] }
    return order.first { $0 != current && !others.contains($0.id) } ?? order.first
  }
}

/** What an agent's circle shows: one of the faces, drawn from the app's own copy, or its own picture. */
public enum AgentPictureSource: Hashable, Sendable {
  case face(AgentFace)
  /** Its own picture as a data URL, and a short key that changes with it (its version, else its length and end). */
  case own(dataURL: String, key: String)

  public static func == (a: AgentPictureSource, b: AgentPictureSource) -> Bool {
    switch (a, b) {
    case let (.face(x), .face(y)): return x == y
    case let (.own(_, x), .own(_, y)): return x == y
    default: return false
    }
  }

  public func hash(into hasher: inout Hasher) {
    switch self {
    case .face(let face): hasher.combine(0); hasher.combine(face.id)
    case .own(_, let key): hasher.combine(1); hasher.combine(key)
    }
  }

  /** A key for caches: the face's id, or the picture's key. */
  public var key: String {
    switch self {
    case .face(let face): return face.id
    case .own(_, let key): return key
    }
  }
}

extension Agent {
  /**
   * Its picture: the face it wears (drawn from the app's copy, not decoded
   * from the roster), else its own picture, else the face it was given (a
   * picture on its way), else a face its id picks, never stored (a roster
   * kept from before, someone else's agent). A group shows its members.
   */
  public var picture: AgentPictureSource? {
    if let face = AgentFaces.worn(self) { return .face(face) }
    if let url = avatarDataURL, url.hasPrefix("data:image") {
      let bytes = url.utf8
      return .own(dataURL: url, key: avatarVersion ?? "\(bytes.count)|" + String(decoding: bytes.suffix(48), as: UTF8.self))
    }
    if let face = AgentFaces.given(self) { return .face(face) }
    return AgentFaces.stand(forId: id).map(AgentPictureSource.face)
  }
}

/**
 * A group's members drawn together: in a list row the Mac's cluster (`OOt`,
 * `mnt`): two members at 2/3 of the square, three at 5/9 (one above two),
 * four in a grid, more as three and "+N", each later one cut out of the one
 * behind with a small gap.
 */
public enum GroupLayout {
  /** The members' squares in a `frame`-sided square (x, y, side). */
  public static func slots(count: Int, frame: Double) -> [(x: Double, y: Double, size: Double)] {
    if count <= 1 { return [(0, 0, frame)] }
    if count == 2 {
      let size = frame * 2 / 3, step = frame - size
      return [(0, 0, size), (step, step, size)]
    }
    let size = frame * 5 / 9, step = frame - size
    if count == 3 { return [(step / 2, 0, size), (0, step, size), (step, step, size)] }
    return [(0, 0, size), (step, 0, size), (0, step, size), (step, step, size)]
  }

  /** The gap cut around a later member, by the frame's size (`ONe` 2 at 36 px). */
  public static func gap(frame: Double) -> Double { 2 * frame / 36 }
}
