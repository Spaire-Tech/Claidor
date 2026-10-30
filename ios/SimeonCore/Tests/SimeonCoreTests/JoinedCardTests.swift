import XCTest
@testable import SimeonCore

/** "Iris just joined your team" (30 October 2026): the card, its words, and the face it stands with (JoinedCard.swift). */
final class JoinedCardTests: XCTestCase {
  private func joined(_ message: JSON, id: String = "t1s1") -> Entry {
    Entry(["id": .string(id), "kind": "send-message", "timestampMs": 1_000, "message": message])!
  }

  func testTheCardIsReadFromItsMessage() {
    let rows = Chat.rows([joined(["type": "agent-joined", "agentId": "a2", "name": "Iris", "line": " Sorts your inbox. ", "content": "Iris just joined your team. Sorts your inbox."])])
    guard case .joined(let id, let card)? = rows.last else { return XCTFail("\(rows)") }
    XCTAssertEqual(id, "t1s1")
    XCTAssertEqual(card, JoinedCard(agentId: "a2", name: "Iris", line: "Sorts your inbox."))
    XCTAssertEqual(rows.last?.kind, "joined")
    XCTAssertEqual(rows.last?.side, .agent(nil))
    // No line: the card still shows, with its title alone.
    guard case .joined(_, let bare)? = Chat.rows([joined(["type": "agent-joined", "agentId": "a2", "name": "Iris"])]).last else { return XCTFail() }
    XCTAssertEqual(bare.line, "")
  }

  func testACardMissingItsAgentSaysItsWords() {
    let rows = Chat.rows([joined(["type": "agent-joined", "name": "Iris", "content": "Iris just joined your team."])])
    guard case .notice(_, let text)? = rows.last else { return XCTFail("\(rows)") }
    XCTAssertEqual(text, "Iris just joined your team.")
  }

  func testTheTitleFollowsTheRosterAndTheButtonsTheirWords() {
    let card = JoinedCard(agentId: "a2", name: "Iris", line: "Sorts your inbox.")
    XCTAssertEqual(card.title(in: []), "Iris just joined your team", "gone from the roster: the name it was hired with")
    XCTAssertEqual(card.title(in: [Agent(id: "a2", name: "Ivy")]), "Ivy just joined your team", "renamed since: the roster's")
    XCTAssertNil(card.agent(in: [Agent(id: "a3", name: "Max")]))
    XCTAssertEqual(JoinedCard.goToChat, "Go to Chat")
    XCTAssertEqual(JoinedCard.viewProfile, "View Profile")
    // Quoted or named as a thread's first message: its title.
    XCTAssertEqual(Chat.cardText(["type": "agent-joined", "agentId": "a2", "name": "Iris"]), "Iris just joined your team")
  }

  func testEveryFaceStandsOnItsOwn() throws {
    XCTAssertEqual(AgentFaces.all.count, 31)
    for face in AgentFaces.all {
      let data = try XCTUnwrap(AgentFaces.standingData(face), face.id)
      // WebP: "RIFF", its size, "WEBP".
      XCTAssertEqual(String(decoding: data.prefix(4), as: UTF8.self), "RIFF", face.id)
      XCTAssertEqual(String(decoding: data.dropFirst(8).prefix(4), as: UTF8.self), "WEBP", face.id)
    }
  }

  func testTheFaceTheCardStandsIsTheOneTheAgentWears() throws {
    let face = try XCTUnwrap(AgentFaces.face(id: "clay-03"))
    let other = try XCTUnwrap(AgentFaces.face(id: "clay-07"))
    var wearing = Agent(id: "a2", name: "Iris")
    wearing.avatarVersion = face.version
    wearing.avatarShape = other.id
    XCTAssertEqual(AgentFaces.standing(wearing), face, "the face it wears, whatever it was given")
    var waiting = Agent(id: "a2", name: "Iris")
    waiting.avatarShape = face.id
    XCTAssertEqual(AgentFaces.standing(waiting), face, "no picture yet: the face it was given")
    var ownPicture = Agent(id: "a2", name: "Iris")
    ownPicture.avatarVersion = "0123456789abcdef"
    ownPicture.avatarShape = face.id
    XCTAssertNil(AgentFaces.standing(ownPicture), "a picture of its own: no face stands for it")
    XCTAssertNil(AgentFaces.standing(Agent(id: "a2", name: "Iris")), "nothing given yet")
  }

  // The card in its face's colour (the founder, 30 October 2026: design B).

  func testEveryFaceHasItsBackdrop() {
    for face in AgentFaces.all { XCTAssertNotNil(face.backdrop, face.id) }
    XCTAssertEqual(AgentFaces.face(id: "clay-23")?.backdrop?.hex, "#618283", "Iris's teal")
  }

  func testTheCardIsInItsFacesColourWithWhiteWords() throws {
    let teal = try XCTUnwrap(JoinedCard.Colours(face: AgentFaces.face(id: "clay-23")))
    XCTAssertEqual(teal.top.hex, "#7a9697", "16% lighter")
    XCTAssertEqual(teal.bottom.hex, "#4a6364", "24% darker")
    XCTAssertLessThan(teal.deep.luminance, teal.bottom.luminance, "Go to Chat's words, darker still")
    // White words on every face, the cream one too (the founder, 30 October 2026: "make em all white").
    for face in AgentFaces.all {
      let colours = try XCTUnwrap(JoinedCard.Colours(face: face), face.id)
      XCTAssertEqual(colours.ink, RGB(1, 1, 1), face.id)
      XCTAssertEqual(colours.secondaryInk, RGB(1, 1, 1, 0.8), face.id)
    }
    XCTAssertNil(JoinedCard.Colours(face: AgentFace(id: "x", gender: "female", file: "x.webp", version: "0")), "no backdrop: no colour")
  }

  func testTheCardsColourIsTheFaceItsAgentStandsAs() throws {
    let face = try XCTUnwrap(AgentFaces.face(id: "clay-23"))
    let card = JoinedCard(agentId: "a2", name: "Iris", line: "")
    var wearing = Agent(id: "a2", name: "Iris")
    wearing.avatarVersion = face.version
    XCTAssertEqual(card.colours(in: [wearing]), JoinedCard.Colours(face: face))
    var ownPicture = Agent(id: "a2", name: "Iris")
    ownPicture.avatarVersion = "0123456789abcdef"
    ownPicture.avatarShape = face.id
    XCTAssertNil(card.colours(in: [ownPicture]), "a picture of its own: the chat's grey")
    XCTAssertNil(card.colours(in: []), "gone from the roster: the chat's grey")
  }
}
