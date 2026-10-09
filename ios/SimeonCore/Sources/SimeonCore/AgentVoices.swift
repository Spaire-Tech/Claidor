import Foundation

/**
 * Each agent's own voice, given as the Mac gives it
 * (desktop/source/shared/voice-call/agent-voices.ts and
 * `assignMissingVoices` in electron-main/voice/voice-call-service.ts).
 *
 * The founder, 9 October 2026: "you brought back voices like jessica that i
 * deleted. theres no smart attribution of voices as well. every voice says
 * "michael" by default, even tho its a different voice … both on mac and on
 * the phone." Until then the phone gave no agent a voice: its picker showed
 * Michael for an agent with none, while the call spoke in the platform
 * agent's own voice (Jessica, until the server's fix the same day), and an
 * agent still holding a voice taken off the list kept speaking in it.
 *
 * - The Chief of Staff gets Simeon's own voice, which no other agent is given.
 * - Any other agent gets the voice fewest agents have, among the voices of
 *   its name's gender when the name has one (Maya, Nina: a woman's; Leo, Jon:
 *   a man's), among all of them otherwise (Jordan, Sage).
 * - Between voices equally free, the agent's id decides (the Mac's FNV-1a
 *   hash over the id's UTF-16), so two agents hired together differ, and the
 *   phone and the Mac give the same agent the same voice.
 * - A voice no longer on the account's list is none, and is replaced.
 */
public enum AgentVoices {
  /** The Chief of Staff's voice, `SIMEON_VOICE_ID` in server/simeon/desktop/voice.py. */
  public static let simeonVoiceId = "Cz0K1kOv9tD8l0b5Qu53"

  /** Each curated voice's gender, for a server that sends none: `CURATED_VOICE_GENDERS` (the server's and the Mac's). */
  public static let curatedGenders: [String: String] = [
    "ljX1ZrXuDIIRVcmiVSyR": "male", // Michael
    "1t1EeRixsJrKbiF1zwM6": "male", // Jerry
    "XcXEQzuLXRU9RcfWzEJt": "female", // Veda
    "s3TPKV1kjDlVtZbl4Ksh": "male", // Adam
    "UgBBYS2sOqTuMpoF3BR0": "male", // Mark
    "6OzrBCQf8cjERkYgzSg8": "male", // Jamal
    "Cz0K1kOv9tD8l0b5Qu53": "male", // Simeon
    "WI5pMmcGGS32yI7yttoP": "female", // Amanda
    "snyKKuaGYk1VUEh42zbW": "male", // Chris
    "gfRt6Z3Z8aTbpLfexQ7N": "male", // Boyd
    "NHRgOEwqx5WZNClv5sat": "female", // Chelsea
    "5u41aNhyCU6hXOcjPPv0": "female", // Hope
  ]

  /** A title before the name: a gender, or none to look at the next word. */
  private static let titles: [String: String?] = [
    "mrs": "female", "ms": "female", "miss": "female", "madam": "female", "lady": "female",
    "mr": "male", "sir": "male", "lord": "male",
    "dr": nil, "doctor": nil, "prof": nil, "professor": nil, "captain": nil, "coach": nil,
  ]

  private static let women = Set(GeneratedNameGenders.women.split(whereSeparator: \.isWhitespace).map(String.init))
  private static let men = Set(GeneratedNameGenders.men.split(whereSeparator: \.isWhitespace).map(String.init))

  /** "female", "male", or nil when the name is neither or unknown (the Mac's `nameGender`). */
  public static func nameGender(_ name: String) -> String? {
    let bare = String(String.UnicodeScalarView(name.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !$0.properties.isDiacritic })).lowercased()
    var words: [String] = []
    var word = ""
    for scalar in bare.unicodeScalars {
      if scalar.value >= 0x61 && scalar.value <= 0x7A { word.unicodeScalars.append(scalar) } else if !word.isEmpty { words.append(word); word = "" }
    }
    if !word.isEmpty { words.append(word) }
    for word in words {
      if let titled = titles[word] {
        if let titled { return titled }
        continue
      }
      return women.contains(word) ? "female" : men.contains(word) ? "male" : nil
    }
    return nil
  }

  /** The Mac's `stableHash`: FNV-1a over the UTF-16 code units. */
  static func stableHash(_ text: String) -> UInt32 {
    var hash: UInt32 = 2_166_136_261
    for unit in text.utf16 {
      hash ^= UInt32(unit)
      hash = hash &* 16_777_619
    }
    return hash
  }

  /** The Chief of Staff is the agent titled so (`isChiefOfStaffTitle`). */
  public static func isChiefOfStaff(title: String) -> Bool {
    ["chief of staff", "coo"].contains(title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
  }

  /** A voice's gender: the server's, else the curated list's. */
  public static func gender(of voice: AppStore.VoiceChoice) -> String? {
    voice.gender ?? curatedGenders[voice.id]
  }

  /** The voice an agent without one gets among `voices`; nil when there is none to give (the Mac's `pickAgentVoice`). */
  public static func pick(agentId: String, name: String, isChiefOfStaff: Bool, voices: [AppStore.VoiceChoice], taken: [String]) -> String? {
    if isChiefOfStaff && voices.contains(where: { $0.id == simeonVoiceId }) { return simeonVoiceId }
    let others = voices.filter { $0.id != simeonVoiceId }
    let wanted = nameGender(name)
    let matching = wanted == nil ? [] : others.filter { gender(of: $0) == wanted }
    let pool = matching.isEmpty ? others : matching
    guard !pool.isEmpty else { return nil }
    var counts: [String: Int] = [:]
    for id in taken { counts[id, default: 0] += 1 }
    let fewest = pool.map { counts[$0.id] ?? 0 }.min() ?? 0
    let free = pool.filter { (counts[$0.id] ?? 0) == fewest }
    return free[Int(stableHash(agentId) % UInt32(free.count))].id
  }

  /** A voice id the Mac would store (`VOICE_ID_PATTERN`): letters and digits, 1 to 64. */
  static func usable(_ voiceId: String?) -> String? {
    guard let voiceId, (1...64).contains(voiceId.count), voiceId.unicodeScalars.allSatisfy({ ($0.value >= 0x30 && $0.value <= 0x39) || ($0.value >= 0x41 && $0.value <= 0x5A) || ($0.value >= 0x61 && $0.value <= 0x7A) }) else { return nil }
    return voiceId
  }

  /** The agent's stored voice while it is on the list; a voice taken off it is none. An empty list judges nothing. */
  public static func kept(_ voiceId: String?, listed: [AppStore.VoiceChoice]) -> String? {
    guard let voiceId = usable(voiceId) else { return nil }
    return listed.isEmpty || listed.contains(where: { $0.id == voiceId }) ? voiceId : nil
  }

  /** Every agent's voice after one pass, and the ones it gives, in agent-id order as the Mac gives them. Groups and shared rooms have none. */
  public static func plan(agents: [Agent], voices: [AppStore.VoiceChoice]) -> (voices: [String: String], given: [(agentId: String, voiceId: String)]) {
    let people = agents.filter { !$0.isGroup && !$0.isRemoteRoom && !$0.id.isEmpty }.sorted { Array($0.id.utf16).lexicographicallyPrecedes(Array($1.id.utf16)) }
    var all: [String: String] = [:]
    for agent in people { if let voice = kept(agent.voiceId, listed: voices) { all[agent.id] = voice } }
    guard !voices.isEmpty else { return (all, []) }
    var given: [(agentId: String, voiceId: String)] = []
    for agent in people where all[agent.id] == nil {
      let taken = people.compactMap { all[$0.id] }
      guard let voice = pick(agentId: agent.id, name: agent.name, isChiefOfStaff: isChiefOfStaff(title: agent.title), voices: voices, taken: taken) else { continue }
      all[agent.id] = voice
      given.append((agent.id, voice))
    }
    return (all, given)
  }
}
