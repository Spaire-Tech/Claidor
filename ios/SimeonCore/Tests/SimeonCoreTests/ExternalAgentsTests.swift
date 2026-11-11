import Foundation
import XCTest
@testable import SimeonCore

/** Settings › External Agents (ExternalAgents.swift): the bots as the server lists them, the page's rows, and the model against a stand-in for the server. */
final class ExternalAgentsTests: XCTestCase {
  /** `GET /desktop/api/external-agents` (`server/simeon/desktop/external_agents.py`): Grok Bot used yesterday, Claude Code last week. */
  static let answer: JSON = [
    "agents": [
      ["id": "grok-bot", "kind": "grok-bot", "name": "Grok Bot", "lastUsedAt": 1_794_355_200_000, "connectedAt": 1_794_300_000_000],
      ["id": "claude-code", "kind": "claude-code", "name": "Claude Code", "lastUsedAt": 1_793_800_000_000],
      ["kind": "dots", "name": "No id"],
    ],
  ]

  func testTheRowsPutTheConnectedFirst() throws {
    let agents = (Self.answer["agents"]?.array ?? []).compactMap(ExternalAgent.init(json:))
    XCTAssertEqual(agents.map(\.id), ["grok-bot", "claude-code"], "a row without an id is dropped")
    let rows = ExternalAgents.rows(agents)
    XCTAssertEqual(rows.map(\.id), ["grok-bot", "claude-code", "dots", "muse", "codex"], "Claude Code connected isn't offered again; Codex is")
    XCTAssertEqual(rows.map(\.icon), ["grokbot", "claudecode", "dots", "muse", "codex"])
    XCTAssertNotNil(rows[0].connected)
    XCTAssertNil(rows[0].line, "a connected bot shows when it was last used instead")
    XCTAssertEqual(rows[2].line, "Connect Simeon to ChatGPT Dots.")
    XCTAssertNil(rows[2].connected)
    XCTAssertEqual(ExternalAgents.rows([]).map(\.name), ["Dots", "Muse", "Grok Bot", "Claude Code", "Codex"])
  }

  func testLastUsedIsADate() throws {
    let bot = try XCTUnwrap(ExternalAgent(json: ["id": "grok-bot", "kind": "grok-bot", "name": "Grok Bot", "lastUsedAt": 1_794_355_200_000]))
    let words = try XCTUnwrap(bot.lastUsedWords(timeZone: TimeZone(identifier: "America/Los_Angeles")!))
    XCTAssertTrue(words.hasPrefix("Last used "), words)
    XCTAssertTrue(words.contains("2026"), words)
    XCTAssertNil(ExternalAgent(id: "x", kind: "agent", name: "X", lastUsedAt: nil).lastUsedWords())
  }

  func testEachBotsAddress() {
    XCTAssertEqual(ExternalAgents.address(for: "grok-bot"), "https://api.simeonlabs.com/mcp/grok-bot")
    XCTAssertEqual(ExternalAgents.address(for: "dots"), "https://api.simeonlabs.com/mcp/dots")
    XCTAssertEqual(ExternalAgents.address(for: nil), "https://api.simeonlabs.com/mcp")
    XCTAssertEqual(ExternalAgents.icon(for: "codex"), "codex")
    XCTAssertEqual(ExternalAgents.icon(for: "claude-code"), "claudecode", "the founder's mascot, not the Claude app's")
    XCTAssertEqual(ExternalAgents.icon(for: "claude"), "claude", "Claude in its own app keeps the app's icon")
    XCTAssertNil(ExternalAgents.icon(for: "cursor"))
  }

  /** Claude Code and Codex: their sheets show the ways to connect them, each a thing to copy; the bots in a maker's cloud are given an address instead. */
  func testACodingAgentIsShownTheWaysToConnectIt() throws {
    let claude = try XCTUnwrap(ExternalAgents.known.first { $0.kind == "claude-code" })
    XCTAssertEqual(claude.ways.map(\.title), ["Ask Claude Code", "In Terminal", "Every coding agent on your computer"])
    XCTAssertEqual(claude.ways.map(\.text), [
      "Follow the instructions at https://simeonlabs.com/network/skill.md",
      "claude mcp add --transport http --scope user simeon https://api.simeonlabs.com/mcp; claude mcp login simeon",
      "curl -fsSL https://simeonlabs.com/network/install.sh | bash",
    ])
    XCTAssertEqual(claude.give, "Pick one. Your browser opens once, to sign in to Simeon.")
    let codex = try XCTUnwrap(ExternalAgents.known.first { $0.kind == "codex" })
    XCTAssertEqual(codex.ways[0].line, "Paste this into Codex. It does the rest.")
    XCTAssertEqual(codex.ways[1].text, "codex mcp add simeon --url https://api.simeonlabs.com/mcp", "Codex signs in as it adds the server")
    XCTAssertEqual(codex.ways[1].line, "Connects Codex alone.")
    XCTAssertTrue(ExternalAgents.known.filter { ["dots", "muse", "grok-bot"].contains($0.kind) }.allSatisfy(\.ways.isEmpty))
    XCTAssertTrue(ExternalAgents.known.allSatisfy { ExternalAgents.mascots.contains($0.icon) }, "every known bot is drawn as a mascot on its tile")
  }

  @MainActor
  func testTheModelReadsAndDisconnects() async {
    var calls: [(String, String?)] = []
    var connected: JSON = Self.answer
    let model = ExternalAgentsModel { path, method, body in
      calls.append((path, method))
      if path == "external-agents/disconnect" {
        XCTAssertEqual(body?["id"]?.text, "grok-bot")
        connected = ["agents": [["id": "claude-code", "kind": "claude-code", "name": "Claude Code", "lastUsedAt": 1]]]
      }
      return connected
    }
    await model.load()
    XCTAssertTrue(model.loaded)
    XCTAssertEqual(model.connected.map(\.id), ["grok-bot", "claude-code"])
    await model.disconnect("grok-bot")
    XCTAssertEqual(model.connected.map(\.id), ["claude-code"])
    XCTAssertEqual(model.rows.map(\.id), ["claude-code", "dots", "muse", "grok-bot", "codex"])
    XCTAssertEqual(calls.map(\.0), ["external-agents", "external-agents/disconnect"])
    XCTAssertEqual(calls.map(\.1), [nil, "POST"])
  }

  @MainActor
  func testAFailureIsSaid() async {
    let model = ExternalAgentsModel { _, _, _ in throw SimeonAPIError(message: "Simeon Labs’ server didn’t answer.", status: 502) }
    await model.load()
    XCTAssertEqual(model.problem, "Simeon Labs’ server didn’t answer.")
    XCTAssertTrue(model.loaded)
  }
}
