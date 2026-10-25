import XCTest
@testable import SimeonCore

/** The agents' faces (AgentFaces, 12 October 2026): the catalogue, the choice, Shuffle and Reset, and the store giving them. */
final class AgentFaceTests: XCTestCase {
  /** The curated voices as listed (AgentVoiceTests'), their genders from the curated list. */
  private static let listed: [AppStore.VoiceChoice] = [("ljX1ZrXuDIIRVcmiVSyR", "Michael"), ("XcXEQzuLXRU9RcfWzEJt", "Veda"), ("s3TPKV1kjDlVtZbl4Ksh", "Adam"), ("Cz0K1kOv9tD8l0b5Qu53", "Simeon"), ("WI5pMmcGGS32yI7yttoP", "Amanda"), ("NHRgOEwqx5WZNClv5sat", "Chelsea")].map { AppStore.VoiceChoice(id: $0.0, name: $0.1, sample: nil) }

  private func agent(_ id: String, _ name: String, title: String = "", voice: String? = nil, face: String? = nil, wearing: String? = nil, picture: String? = nil, group: Bool = false, room: Bool = false, created: Double? = nil) -> Agent {
    var row = Agent(id: id, name: name, title: title, avatarDataURL: picture, isGroup: group)
    row.voiceId = voice; row.avatarShape = face; row.isRemoteRoom = room; row.createdAt = created
    if let wearing { row.avatarVersion = AgentFaces.face(id: wearing)?.version }
    return row
  }

  private func women() -> [AgentFace] { AgentFaces.pool.filter { $0.gender == "female" } }
  private func men() -> [AgentFace] { AgentFaces.pool.filter { $0.gender == "male" } }

  func testTheCatalogueIsTheFoundersThirtyOneFaces() throws {
    XCTAssertEqual(AgentFaces.all.count, 31)
    XCTAssertEqual(women().count, 15)
    XCTAssertEqual(men().count, 15)
    XCTAssertEqual(AgentFaces.pool.count, 30)
    XCTAssertEqual(AgentFaces.simeon?.gender, "male")
    XCTAssertFalse(AgentFaces.pool.contains { $0.id == AgentFaces.simeonId })
    XCTAssertEqual(Set(AgentFaces.all.map(\.version)).count, 31)
    // Each face's version is the host's for its bytes (agent-avatar.ts: SHA-256, 16 hex), so an agent wearing it is known by it.
    for face in AgentFaces.all {
      let bytes = try XCTUnwrap(AgentFaces.data(face), face.id)
      XCTAssertEqual(Array(bytes.prefix(4)), Array("RIFF".utf8), face.id)
      XCTAssertLessThan(bytes.count, 40_000, face.id)
      XCTAssertEqual(sha256(Array(bytes)).prefix(8).map { String(format: "%02x", $0) }.joined(), face.version, face.id)
    }
  }

  func testAWomansNameGetsAWomansFaceAndAMansAMans() {
    let plan = AgentFaces.plan(agents: [agent("a1", "Maya"), agent("a2", "Leo"), agent("a3", "Ms Taylor"), agent("a4", "Mr. Kim")])
    let given = Dictionary(uniqueKeysWithValues: plan.map { ($0.agentId, $0.face.gender) })
    XCTAssertEqual(given, ["a1": "female", "a2": "male", "a3": "female", "a4": "male"])
  }

  func testTheLeastUsedFaceOfTheGenderIsGiven() {
    // Every woman's face but one is worn already: Nina gets that one.
    let free = women()[6]
    var roster = women().filter { $0 != free }.enumerated().map { agent("w\($0.offset)", "Agent", wearing: $0.element.id) }
    roster.append(agent("nina", "Nina"))
    XCTAssertEqual(AgentFaces.plan(agents: roster).map(\.face), [free])
    // With every face worn once, the pool runs out evenly: the next woman gets one worn once, not one worn twice.
    var full = women().enumerated().map { agent("x\($0.offset)", "Agent", wearing: $0.element.id) }
    full.append(agent("y", "Agent", wearing: women()[0].id))
    full.append(agent("maya", "Maya"))
    let given = AgentFaces.plan(agents: full).first?.face
    XCTAssertNotNil(given)
    XCTAssertNotEqual(given, women()[0])
  }

  func testAgentsHiredTogetherGetDifferentFaces() {
    let names = ["Maya", "Nina", "Ava", "Isla", "Fatou", "Zoë"]
    let roster = names.enumerated().map { agent("hire-\($0.offset)", $0.element) }
    let faces = AgentFaces.plan(agents: roster).map(\.face)
    XCTAssertEqual(faces.count, 6)
    XCTAssertEqual(Set(faces).count, 6)
    XCTAssertTrue(faces.allSatisfy { $0.gender == "female" })
  }

  func testTheChoiceIsTheSameOnEveryDevice() {
    // The same roster in another order gives the same faces: the iPhone and the Mac agree on a new agent.
    let roster = [agent("7d1c", "Simeon", title: "Chief of Staff", created: 1), agent("b22e", "Leo"), agent("a91f", "Maya"), agent("d4", "Jordan"), agent("e5", "Ava")]
    let one = AgentFaces.plan(agents: roster).map { "\($0.agentId)=\($0.face.id)" }
    let two = AgentFaces.plan(agents: roster.reversed()).map { "\($0.agentId)=\($0.face.id)" }
    XCTAssertEqual(one, two)
    XCTAssertEqual(one, AgentFaces.plan(agents: roster).map { "\($0.agentId)=\($0.face.id)" })
    // Ties go by the voices' FNV-1a hash of the id, as the Mac's.
    let pick = AgentFaces.pick(agentId: "maya", gender: "female", taken: [])
    XCTAssertEqual(pick, women()[Int(AgentVoices.stableHash("maya") % UInt32(women().count))])
  }

  func testANameWithNoGenderTakesItsVoicesAndKeepsIt() {
    // Jordan speaks with Michael's voice: a man's face. Sage speaks with Veda's: a woman's.
    let plan = AgentFaces.plan(agents: [agent("j", "Jordan", voice: "ljX1ZrXuDIIRVcmiVSyR"), agent("s", "Sage", voice: "XcXEQzuLXRU9RcfWzEJt")])
    XCTAssertEqual(plan.map(\.face.gender), ["male", "female"])
    // With no voice, its id picks a gender, always the same one.
    let alex = agent("alex-1", "Alex")
    let gender = AgentFaces.gender(for: alex)
    XCTAssertEqual(gender, AgentVoices.stableHash("alex-1") % 2 == 0 ? "female" : "male")
    XCTAssertEqual(AgentFaces.plan(agents: [alex]).first?.face.gender, gender)
    // Once it has a face, the face's gender is its own, and its voice is given of that gender.
    let woman = women()[2]
    var riley = agent("riley", "Riley", face: woman.id)
    XCTAssertEqual(AgentFaces.gender(for: riley), "female")
    let voices = Self.listed
    let given = AgentVoices.plan(agents: [riley], voices: voices).voices["riley"]
    XCTAssertEqual(given.flatMap { AgentVoices.curatedGenders[$0] }, "female")
    riley.avatarShape = men()[0].id
    XCTAssertEqual(AgentVoices.plan(agents: [riley], voices: voices).voices["riley"].flatMap { AgentVoices.curatedGenders[$0] }, "male")
  }

  func testSimeonWearsHisOwnFaceAndNoOneElseIsGivenIt() {
    let roster = [agent("cos", "Simeon", title: "Chief of Staff", created: 1), agent("later", "Ezra", title: "Chief of Staff", created: 5)] + (0..<40).map { agent("m\($0)", "Leo") }
    let plan = AgentFaces.plan(agents: roster)
    XCTAssertEqual(plan.first { $0.agentId == "cos" }?.face.id, AgentFaces.simeonId)
    XCTAssertEqual(plan.filter { $0.face.id == AgentFaces.simeonId }.count, 1)
    // Renamed, he keeps it: it is the Chief of Staff's, whatever his name.
    XCTAssertEqual(AgentFaces.plan(agents: [agent("cos", "Maya", title: "Chief of Staff")]).first?.face.id, AgentFaces.simeonId)
  }

  func testPicturesOfTheirOwnAreKeptAndAGivenFaceComesBack() {
    let roster = [
      agent("own", "Maya", picture: "data:image/png;base64,iVBORw0KGgo="),
      agent("wears", "Leo", wearing: men()[3].id),
      agent("back", "Nina", face: women()[9].id),
      agent("team", "Team", group: true),
      agent("theirs", "Shared", room: true),
    ]
    let plan = AgentFaces.plan(agents: roster)
    XCTAssertEqual(plan.map(\.agentId), ["back"])
    XCTAssertEqual(plan.first?.face, women()[9])
  }

  func testWhatAnAgentsCircleShows() {
    let face = women()[4]
    XCTAssertEqual(agent("a", "Maya", wearing: face.id).picture, .face(face))
    let own = agent("b", "Maya", face: face.id, picture: "data:image/png;base64,iVBORw0KGgo=")
    guard case .own(let url, _)? = own.picture else { return XCTFail() }
    XCTAssertEqual(url, "data:image/png;base64,iVBORw0KGgo=")
    XCTAssertEqual(agent("c", "Maya", face: face.id).picture, .face(face))
    XCTAssertEqual(agent("d", "Maya").picture, AgentFaces.stand(forId: "d").map(AgentPictureSource.face))
    // A face shown is drawn from the app's copy even when the roster carries its bytes too.
    var both = agent("e", "Maya", wearing: face.id)
    both.avatarDataURL = "data:image/webp;base64,UklGRg=="
    XCTAssertEqual(both.picture, .face(face))
  }

  func testTheNewAgentSheetShowsTheFaceTheAgentGets() {
    let roster = [agent("w", "Maya", wearing: women()[0].id)]
    let nora = AgentFaces.preview(name: "Nora", agents: roster)
    XCTAssertEqual(nora?.gender, "female")
    XCTAssertNotEqual(nora, women()[0])
    XCTAssertEqual(AgentFaces.preview(name: "  Nora ", agents: roster), nora)
    XCTAssertEqual(AgentFaces.preview(name: "Leo", agents: roster)?.gender, "male")
    // Sent as its face, it is the one it is given.
    XCTAssertEqual(AgentFaces.plan(agents: roster + [agent("new", "Nora", face: nora?.id)]).first?.face, nora)
  }

  func testTheNewAgentsFaceStaysWhileItsNameIsTyped() {
    let roster = [agent("w", "Maya", wearing: women()[0].id)]
    var draft = AgentDraft()
    draft.settleFace(agents: roster)
    let first = draft.shownFace(agents: roster)
    XCTAssertNotNil(first)
    // Letter by letter, a name of no known gender keeps the face.
    for typed in ["Q", "Qu", "Qui", "Quill", "Quill Bot"] {
      draft.name = typed
      draft.settleFace(agents: roster)
      XCTAssertEqual(draft.shownFace(agents: roster), first, typed)
    }
    // A name of the other gender changes it once, then it stays.
    let other = first?.gender == "female" ? ("Leo", "male") : ("Nora", "female")
    draft.name = other.0
    draft.settleFace(agents: roster)
    let changed = draft.shownFace(agents: roster)
    XCTAssertEqual(changed?.gender, other.1)
    draft.name = other.0 + " Smith"
    draft.settleFace(agents: roster)
    XCTAssertEqual(draft.shownFace(agents: roster), changed)
    // A face picked wins over the name's.
    draft.wear(women()[3], agents: roster, voices: [])
    draft.name = "Leo"
    draft.settleFace(agents: roster)
    XCTAssertEqual(draft.shownFace(agents: roster), women()[3])
  }

  func testShuffleGoesToTheNextFaceNoOneWears() {
    let women = women()
    // Maya wears the first; the second is worn by Nina: Shuffle skips to the third.
    let roster = [agent("maya", "Maya", wearing: women[0].id), agent("nina", "Nina", wearing: women[1].id)]
    XCTAssertEqual(AgentFaces.shuffle(after: women[0], gender: "female", agentId: "maya", agents: roster), women[2])
    // From the last, round again to the first free one.
    XCTAssertEqual(AgentFaces.shuffle(after: women.last, gender: "female", agentId: "maya", agents: roster), women[0])
    // Switching to the men's faces starts at the first free man's.
    XCTAssertEqual(AgentFaces.shuffle(after: nil, gender: "male", agentId: "maya", agents: roster), men()[0])
    // With every face worn by someone else, simply the next.
    let everyone = women.enumerated().map { agent("w\($0.offset)", "Ava", wearing: $0.element.id) }
    XCTAssertEqual(AgentFaces.shuffle(after: women[3], gender: "female", agentId: "w3", agents: everyone), women[4])
  }

  func testResetGoesBackToTheFaceGiven() {
    let given = women()[7]
    let uploaded = agent("maya", "Maya", face: given.id, picture: "data:image/png;base64,iVBORw0KGgo=")
    XCTAssertEqual(AgentFaces.reset(uploaded, agents: [uploaded]), given)
    // An agent from before faces, with a picture of its own and no face given: the face it would be given now.
    let old = agent("leo", "Leo", picture: "data:image/png;base64,iVBORw0KGgo=")
    XCTAssertEqual(AgentFaces.reset(old, agents: [old])?.gender, "male")
    let chief = agent("cos", "Simeon", title: "Chief of Staff", picture: "data:image/png;base64,iVBORw0KGgo=")
    XCTAssertEqual(AgentFaces.reset(chief, agents: [chief])?.id, AgentFaces.simeonId)
  }

  func testChangingTheFacesGenderChangesTheVoice() {
    let voices = Self.listed
    let maya = agent("maya", "Maya", voice: "XcXEQzuLXRU9RcfWzEJt") // Veda
    // A man's face: a man's voice with it.
    let voice = AgentFaces.voice(for: maya, wearing: men()[0], agents: [maya], voices: voices)
    XCTAssertEqual(voice.flatMap { AgentVoices.curatedGenders[$0] }, "male")
    XCTAssertNotEqual(voice, AgentVoices.simeonVoiceId)
    // Another woman's face: the voice stays.
    XCTAssertNil(AgentFaces.voice(for: maya, wearing: women()[5], agents: [maya], voices: voices))
    // No voice yet: none given here (the voice pass gives one of the face's gender).
    XCTAssertNil(AgentFaces.voice(for: agent("x", "Maya"), wearing: men()[0], agents: [], voices: voices))
    // The Chief of Staff back in Simeon's face gets Simeon's voice back.
    let chief = agent("cos", "Simeon", title: "Chief of Staff", voice: "XcXEQzuLXRU9RcfWzEJt")
    XCTAssertEqual(AgentFaces.voice(for: chief, wearing: AgentFaces.simeon!, agents: [chief], voices: voices), AgentVoices.simeonVoiceId)
  }
}

@MainActor
final class StoreFaceTests: XCTestCase {
  func testTheStoreGivesEveryAgentAFaceTheHostKeeps() async throws {
    let store = AppStore()
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    await store.attach(backend)
    await store.assignMissingFaces()
    let people = store.agents.filter { !$0.isGroup }
    XCTAssertFalse(people.isEmpty)
    for agent in people {
      // The host's row: the face's bytes as sent (its version) and the face kept on the agent.
      let face = try XCTUnwrap(AgentFaces.worn(agent), agent.name)
      XCTAssertEqual(agent.avatarShape, face.id, agent.name)
      XCTAssertNotNil(agent.avatarDataURL, agent.name)
    }
    let chief = try XCTUnwrap(Agent.chiefOfStaff(in: store.agents))
    XCTAssertEqual(AgentFaces.worn(chief)?.id, AgentFaces.simeonId)
    XCTAssertEqual(Set(people.compactMap { AgentFaces.worn($0) }).count, people.count)

    // The editor: Shuffle puts on the next face, Reset puts back the given one.
    let id = try XCTUnwrap(people.first { $0.id != chief.id }?.id)
    let given = try XCTUnwrap(AgentFaces.worn(try XCTUnwrap(store.agent(id))))
    let shuffled = try await store.shuffleFace(id, gender: given.gender == "female" ? "male" : "female")
    let other = try XCTUnwrap(shuffled)
    XCTAssertEqual(AgentFaces.worn(try XCTUnwrap(store.agent(id))), other)
    XCTAssertEqual(store.agent(id)?.avatarShape, other.id)
    // An upload keeps the face; Reset goes back to it.
    try await store.setAvatarImage(id, png: Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]))
    XCTAssertNil(AgentFaces.worn(try XCTUnwrap(store.agent(id))))
    XCTAssertEqual(store.agent(id)?.avatarShape, other.id)
    try await store.resetFace(id)
    XCTAssertEqual(AgentFaces.worn(try XCTUnwrap(store.agent(id))), other)
  }
}

/** The New Agent sheet's pencil (AgentDraft, the founder, 13 October 2026): a face, a picture and a voice chosen before the agent exists. */
@MainActor
final class AgentDraftTests: XCTestCase {
  private static let listed: [AppStore.VoiceChoice] = [("ljX1ZrXuDIIRVcmiVSyR", "Michael"), ("XcXEQzuLXRU9RcfWzEJt", "Veda"), ("s3TPKV1kjDlVtZbl4Ksh", "Adam"), ("WI5pMmcGGS32yI7yttoP", "Amanda"), ("NHRgOEwqx5WZNClv5sat", "Chelsea")].map { AppStore.VoiceChoice(id: $0.0, name: $0.1, sample: nil) }
  private static let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0])

  func testUntouchedTheDraftIsTheFaceTheNameGets() {
    let draft = AgentDraft(name: "Leo")
    XCTAssertFalse(draft.chosen)
    XCTAssertFalse(draft.resettable)
    XCTAssertEqual(draft.shownFace(agents: []), AgentFaces.preview(name: "Leo", agents: []))
    XCTAssertEqual(draft.shownFace(agents: [])?.gender, "male")
    // The editor draws it wearing that face.
    XCTAssertEqual(AgentFaces.worn(draft.agent(agents: [])), draft.shownFace(agents: []))
  }

  func testAFacePickedBringsAVoiceOfItsGender() throws {
    var draft = AgentDraft(name: "Leo")
    let woman = try XCTUnwrap(AgentFaces.pool.first { $0.gender == "female" })
    draft.wear(woman, agents: [], voices: Self.listed)
    XCTAssertTrue(draft.chosen)
    XCTAssertEqual(draft.shownFace(agents: []), woman)
    draft.settleVoice(agents: [], voices: Self.listed)
    // Leo is a man's name; the woman's face picked for him decides his voice.
    XCTAssertEqual(AgentFaces.voiceGender(draft.voiceId, voices: Self.listed), "female")
    // A man's face then takes the voice back to a man's.
    let man = try XCTUnwrap(AgentFaces.pool.first { $0.gender == "male" })
    draft.wear(man, agents: [], voices: Self.listed)
    XCTAssertEqual(AgentFaces.voiceGender(draft.voiceId, voices: Self.listed), "male")
  }

  func testAVoicePickedIsKeptWhileTheFaceAgrees() throws {
    var draft = AgentDraft(name: "Maya")
    draft.pickVoice("NHRgOEwqx5WZNClv5sat")
    draft.settleVoice(agents: [], voices: Self.listed)
    XCTAssertEqual(draft.voiceId, "NHRgOEwqx5WZNClv5sat")
    let another = try XCTUnwrap(AgentFaces.pool.last { $0.gender == "female" })
    draft.wear(another, agents: [], voices: Self.listed)
    XCTAssertEqual(draft.voiceId, "NHRgOEwqx5WZNClv5sat")
  }

  func testAPictureIsWornInsteadOfAFaceAndResetGoesBackToTheName() throws {
    var draft = AgentDraft(name: "Nora")
    draft.setPicture(Self.png)
    let agent = draft.agent(agents: [])
    XCTAssertNil(AgentFaces.worn(agent))
    guard case .own? = agent.picture else { return XCTFail("the picture should be shown") }
    XCTAssertTrue(draft.resettable)
    // A face picked after takes the picture's place.
    draft.shuffle(gender: "female", agents: [], voices: [])
    XCTAssertNil(draft.picture)
    XCTAssertNotNil(AgentFaces.worn(draft.agent(agents: [])))
    draft.reset(agents: [], voices: [])
    XCTAssertFalse(draft.resettable)
    XCTAssertEqual(draft.shownFace(agents: []), AgentFaces.preview(name: "Nora", agents: []))
  }

  func testShuffleSkipsTheFacesTheTeamWears() throws {
    let women = AgentFaces.pool.filter { $0.gender == "female" }
    var team = women.dropLast().enumerated().map { index, face -> Agent in
      var row = Agent(id: "w\(index)", name: "Agent")
      row.avatarVersion = face.version
      return row
    }
    team.append(Agent(id: "theo", name: "Theo"))
    // The name alone already gets the face no one wears; Shuffle from a worn one lands on it too.
    var draft = AgentDraft(name: "Ava")
    XCTAssertEqual(draft.shownFace(agents: team), women.last)
    draft.wear(women[0], agents: team, voices: [])
    draft.shuffle(gender: "female", agents: team, voices: [])
    XCTAssertEqual(draft.shownFace(agents: team), women.last)
  }

  func testCreatingKeepsThePictureAndTheFaceAndNoFaceGoesOverThePicture() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil))
    await store.assignMissingFaces()
    var draft = AgentDraft(name: "Nora")
    let man = try XCTUnwrap(AgentFaces.pool.first { $0.gender == "male" })
    draft.wear(man, agents: store.agents, voices: [])
    draft.setPicture(Self.png)
    let created = await store.createAgent(name: "Nora", draft: draft)
    let id = try XCTUnwrap(created)
    await store.assignMissingFaces()
    let made = try XCTUnwrap(store.agent(id))
    XCTAssertEqual(made.avatarShape, man.id)
    XCTAssertNil(AgentFaces.worn(made), "the picture stays; no face is put on over it")
    XCTAssertTrue(made.hasPicture)

    // Nothing chosen: the face its name gets, as before.
    let made2 = await store.createAgent(name: "Ava", draft: AgentDraft(name: "Ava"))
    let plain = try XCTUnwrap(made2)
    XCTAssertEqual(store.agent(plain)?.avatarShape, AgentFaces.preview(name: "Ava", agents: store.agents.filter { $0.id != plain })?.id)
  }

  func testATitleGivenAtNewAgentIsTheAgentsTitle() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil))
    // Nothing else chosen, and with a face picked: the title goes with the agent either way.
    var plain = AgentDraft(name: "Ada")
    plain.title = "Personal Shopper"
    let madeFirst = await store.createAgent(name: "Ada", draft: plain)
    let first = try XCTUnwrap(madeFirst)
    XCTAssertEqual(store.agent(first)?.title, "Personal Shopper")
    var picked = AgentDraft(name: "Leo")
    picked.title = "Travel"
    picked.wear(try XCTUnwrap(AgentFaces.pool.first { $0.gender == "male" }), agents: store.agents, voices: [])
    let madeSecond = await store.createAgent(name: "Leo", draft: picked)
    let second = try XCTUnwrap(madeSecond)
    XCTAssertEqual(store.agent(second)?.title, "Travel")
  }
}
