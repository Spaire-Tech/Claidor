import Foundation
import XCTest
@testable import SimeonCore

/** The Simeon Network's page (SimeonNetwork.swift): the network as the server answers it, an invite pasted, and the model against a stand-in for the server. */
final class SimeonNetworkTests: XCTestCase {
  /** The server's answer (`server/simeon/desktop/network.py`, `app_payload`), Ana and Maya on Ana's network. */
  static let answer: JSON = [
    "network": [
      "id": "n1", "name": "Ana's network",
      "invite": "Join the Simeon Network: https://simeonlabs.com/network/join/#sn1-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      "link": "https://simeonlabs.com/network/join/#sn1-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ],
    "you": "ana",
    "people": [
      [
        "handle": "ana", "name": "Ana", "you": true,
        "agents": [["id": "iris", "address": "ana/Iris", "kind": "simeon", "agent": "Simeon agent", "status": "always on", "role": "Travel"]],
        "sessions": [[
          "id": "s1", "address": "ana/claude", "kind": "claude-code", "agent": "Claude Code", "status": "busy",
          "lastSeenMs": 1, "machine": "studio", "repo": "acme/api", "branch": "main", "doing": "Edit billing webhook",
        ]],
      ],
      [
        "handle": "maya", "name": "Maya",
        "agents": [],
        "sessions": [["id": "s2", "address": "maya/dots", "kind": "dots", "agent": "Dots", "status": "away", "lastSeenMs": 1]],
      ],
    ],
  ]

  func testTheNetworkAsTheServerAnswersIt() throws {
    let snapshot = try XCTUnwrap(NetworkSnapshot(json: Self.answer))
    XCTAssertEqual(snapshot.name, "Ana's network")
    XCTAssertEqual(snapshot.you, "ana")
    XCTAssertTrue(snapshot.invite.hasPrefix("Join the Simeon Network: https://simeonlabs.com/network/join/#sn1-"))
    XCTAssertTrue(snapshot.shared, "Maya is on it too: Leave is offered")
    let ana = snapshot.people[0]
    XCTAssertTrue(ana.you)
    XCTAssertEqual(ana.initial, "A")
    XCTAssertEqual(ana.agents.first?.name, "Iris")
    XCTAssertEqual(ana.agents.first?.role, "Travel")
    let claude = try XCTUnwrap(ana.sessions.first)
    XCTAssertEqual(claude.name, "claude")
    XCTAssertEqual(claude.status, .busy)
    XCTAssertEqual(claude.whereabouts, "Claude Code · studio · acme/api@main")
    let dots = try XCTUnwrap(snapshot.people[1].sessions.first)
    XCTAssertEqual(dots.status, .away)
    XCTAssertEqual(dots.whereabouts, "Dots", "nothing more to say of a bot")
    XCTAssertFalse(snapshot.people[1].you)
    XCTAssertNil(NetworkSnapshot(json: ["people": []]), "no network, nothing shown")
  }

  func testAnInvitePasted() {
    let token = "sn1-" + String(repeating: "A", count: 43)
    XCTAssertEqual(NetworkInvite.token(in: "Join the Simeon Network: https://simeonlabs.com/network/join/#\(token)"), token)
    XCTAssertEqual(NetworkInvite.token(in: "  \(token)\n"), token)
    XCTAssertNil(NetworkInvite.token(in: "https://simeonlabs.com/network/join/"))
    XCTAssertNil(NetworkInvite.token(in: "sn1-tooshort"))
  }

  @MainActor
  func testTheModelReadsJoinsAndLeaves() async throws {
    var asked: [(String, String?, JSON?)] = []
    let joined: JSON = {
      guard case .object(var object) = Self.answer else { return Self.answer }
      object["you"] = "ana2"
      return .object(object)
    }()
    let model = NetworkModel { path, method, body in
      asked.append((path, method, body))
      if path.hasPrefix("network/invite?") { return ["name": "Maya's network", "people": [["handle": "maya", "name": "Maya"]], "already": false] }
      if path == "network/join" { return joined }
      return Self.answer
    }
    await model.load()
    XCTAssertEqual(model.snapshot?.name, "Ana's network")
    XCTAssertNil(model.problem)

    let token = "sn1-" + String(repeating: "B", count: 43)
    let preview = try await model.preview("Join the Simeon Network: https://simeonlabs.com/network/join/#\(token)")
    XCTAssertEqual(preview.name, "Maya's network")
    XCTAssertEqual(preview.people, ["Maya"])
    XCTAssertEqual(asked.last?.0, "network/invite?link=\(token)", "only the token goes to the server")

    do {
      _ = try await model.preview("hello")
      XCTFail("not an invite")
    } catch {
      XCTAssertEqual(asked.count, 2, "nothing asked of the server for words that aren't an invite")
    }

    try await model.join("Join the Simeon Network: https://simeonlabs.com/network/join/#\(token)")
    XCTAssertEqual(asked.last?.0, "network/join")
    XCTAssertEqual(asked.last?.1, "POST")
    XCTAssertEqual(asked.last?.2?["link"]?.string, token)
    XCTAssertEqual(model.snapshot?.you, "ana2", "the network as the server answers it, at once")

    try await model.leave()
    XCTAssertEqual(asked.last?.0, "network/leave")
    try await model.rename("Launch crew")
    XCTAssertEqual(asked.last?.2?["name"]?.string, "Launch crew")
    try await model.newLink()
    XCTAssertEqual(asked.last?.0, "network/invite/new")
  }
}
