import Foundation
import XCTest
import SimeonCore
@testable import SimeonMacCore

/**
 * The org chart against the shipped chunk's own functions:
 * `Fixtures/network.json` was made by copying `se`, `ne`, `os`/`ae`/`ke`,
 * `Ce`, `pe` and the view's maths out of `view-D0otXpJy.js`, and the main
 * bundle's `Uan`, unchanged, and running them in Node (scratchpad
 * `s7/network-fixtures.mjs`).
 */
final class NetworkTests: XCTestCase {
  private static let fixture: JSON = {
    let url = Bundle.module.url(forResource: "network", withExtension: "json", subdirectory: "Fixtures")!
    return try! JSON.parse(Data(contentsOf: url))
  }()

  private func agents(_ rows: JSON?) -> [Agent] { (rows?.array ?? []).compactMap(Agent.init(json:)) }

  func testTheLinks() {
    let found = AgentNetwork.edges(agents(Self.fixture["edges"]?["input"]))
    let shipped = Self.fixture["edges"]?["output"]?.array ?? []
    XCTAssertEqual(found.map(\.key), shipped.compactMap { $0["key"]?.string })
    XCTAssertEqual(found.map(\.kind.rawValue), shipped.compactMap { $0["kind"]?.string })
    XCTAssertEqual(found.map(\.sourceId), shipped.compactMap { $0["sourceId"]?.string })
    let roster = agents(Self.fixture["edges"]?["input"])
    XCTAssertEqual(AgentNetwork.subtitle(roster, edges: found), "4 agents · 1 group · 2 message links")
    XCTAssertEqual(AgentNetwork.subtitle([], edges: []), "0 agents · 0 groups · 0 message links")
  }

  func testTheOrderAndTheLight() {
    let order = Self.fixture["nodeOrder"]
    XCTAssertEqual(AgentNetwork.order(agents(order?["input"])), order?["output"]?.array?.compactMap(\.string))
    for row in Self.fixture["activity"]?.array ?? [] {
      guard let source = Agent(json: row["source"] ?? [:]), let target = Agent(json: row["target"] ?? [:]) else { continue }
      let edge = AgentNetwork.Edge(key: "k", sourceId: source.id, targetId: target.id, kind: .message)
      XCTAssertEqual(AgentNetwork.activity(edge, byId: [source.id: source, target.id: target], nowMs: row["now"]?.double ?? 0).rawValue, row["activity"]?.string, row["name"]?.string ?? "")
    }
  }

  func testTheWords() {
    for row in Self.fixture["states"]?.array ?? [] {
      guard let agent = Agent(json: row["input"] ?? [:]) else { XCTFail("row"); continue }
      let name = row["name"]?.string ?? ""
      XCTAssertEqual(AgentNetwork.state(agent).rawValue, row["state"]?.string, name)
      XCTAssertEqual(AgentNetwork.cardWord(agent).text, row["inspectorStatus"]?["text"]?.string, name)
      XCTAssertEqual(AgentNetwork.cardWord(agent).live, row["inspectorStatus"]?["color"]?.string == "green", name)
      XCTAssertEqual(AgentNetwork.caption(agent).text, row["nodeCaption"]?["text"]?.string, name)
      XCTAssertEqual(AgentNetwork.caption(agent).live, row["nodeCaption"]?["isLive"]?.bool, name)
    }
  }

  func testTheChartsOtherWords() {
    XCTAssertEqual(AgentNetwork.edgeLabel(.message, source: "Scout", target: "Simeon"), "Conversation between Scout and Simeon")
    XCTAssertEqual(AgentNetwork.edgeLabel(.membership, source: "Launch squad", target: "Simeon"), "Simeon is a member of Launch squad")
    XCTAssertEqual(AgentNetwork.pair("Launch squad", "Simeon"), "Launch squad ⇄ Simeon")
    XCTAssertEqual(AgentNetwork.exchangeCaption(.talking).text, "Talking now")
    XCTAssertTrue(AgentNetwork.exchangeCaption(.talking).live)
    XCTAssertEqual(AgentNetwork.exchangeCaption(.recent).text, "Active recently")
    XCTAssertEqual(AgentNetwork.exchangeCaption(.idle).text, "Agent-to-agent conversation")
    XCTAssertFalse(AgentNetwork.exchangeCaption(.idle).live)
    XCTAssertNil(AgentNetwork.moreMembers(12))
    XCTAssertEqual(AgentNetwork.moreMembers(15), "+3")
  }

  /** The force layout, point for point, within a hundredth (the maths library may differ in its last digit, 300 times over). */
  func testTheLayout() {
    let cases = Self.fixture["layout"]?.array ?? []
    XCTAssertEqual(cases.count, 11)
    for row in cases {
      let name = row["name"]?.string ?? ""
      let ids = row["nodeIds"]?.array?.compactMap(\.string) ?? []
      let edges = (row["edges"]?.array ?? []).enumerated().map { AgentNetwork.Edge(key: "e\($0.offset)", sourceId: $0.element["sourceId"]?.string ?? "", targetId: $0.element["targetId"]?.string ?? "", kind: .message) }
      let points = AgentNetwork.layout(nodeIds: ids, edges: edges, width: row["width"]?.double ?? 0, height: row["height"]?.double ?? 0, iterations: row["iterations"]?.int ?? 300)
      let shipped = row["points"]?.object ?? [:]
      XCTAssertEqual(Set(points.keys), Set(shipped.keys), name)
      for (id, point) in shipped {
        XCTAssertEqual(points[id]?.x ?? .nan, point["x"]?.double ?? 0, accuracy: 0.01, "\(name) \(id).x")
        XCTAssertEqual(points[id]?.y ?? .nan, point["y"]?.double ?? 0, accuracy: 0.01, "\(name) \(id).y")
      }
    }
  }

  func testZoomAndPan() {
    func view(_ json: JSON?) -> AgentNetwork.View { AgentNetwork.View(scale: json?["scale"]?.double ?? 0, x: json?["x"]?.double ?? 0, y: json?["y"]?.double ?? 0) }
    let shipped = Self.fixture["view"]
    for row in shipped?["clamp"]?.array ?? [] {
      XCTAssertEqual(AgentNetwork.clamp(view(row["view"]), width: row["size"]?["width"]?.double ?? 0, height: row["size"]?["height"]?.double ?? 0, margin: row["margin"]?.double ?? 0), view(row["out"]))
    }
    for row in shipped?["pan"]?.array ?? [] {
      XCTAssertEqual(AgentNetwork.pan(view(row["view"]), dx: row["delta"]?["x"]?.double ?? 0, dy: row["delta"]?["y"]?.double ?? 0, width: row["size"]?["width"]?.double ?? 0, height: row["size"]?["height"]?.double ?? 0, margin: row["margin"]?.double ?? 0), view(row["out"]))
    }
    for row in shipped?["zoom"]?.array ?? [] {
      let out = AgentNetwork.zoom(view(row["view"]), factor: row["factor"]?.double ?? 1, atX: row["point"]?["x"]?.double ?? 0, y: row["point"]?["y"]?.double ?? 0, width: row["size"]?["width"]?.double ?? 0, height: row["size"]?["height"]?.double ?? 0)
      XCTAssertEqual(out.scale, view(row["out"]).scale, accuracy: 1e-9)
      XCTAssertEqual(out.x, view(row["out"]).x, accuracy: 1e-9)
      XCTAssertEqual(out.y, view(row["out"]).y, accuracy: 1e-9)
    }
    XCTAssertEqual(AgentNetwork.wheelFactor(deltaY: 100, isPinch: false), 0.81873, accuracy: 1e-5)
    XCTAssertEqual(AgentNetwork.wheelFactor(deltaY: 10, isPinch: true), 0.90484, accuracy: 1e-5)
    XCTAssertFalse(AgentNetwork.isDrag(dx: 3, dy: 2))
    XCTAssertTrue(AgentNetwork.isDrag(dx: 4, dy: 1))
  }

  func testTheConversation() {
    let exchange = Self.fixture["exchange"]
    let entries = (exchange?["transcript"]?.array ?? []).compactMap(Entry.init)
    let rows = AgentNetwork.exchange(entries, source: (id: "a1", name: "Ada"), targetId: exchange?["targetId"]?.string ?? "")
    let shipped = exchange?["rows"]?.array ?? []
    XCTAssertEqual(rows.map(\.id), shipped.compactMap { $0["id"]?.string })
    XCTAssertEqual(rows.map(\.authorName), shipped.map { $0["author"]?["name"]?.string })
    XCTAssertEqual(rows.map(\.timestampMs), shipped.map { $0["timestampMs"]?.double })
    // Only the last 30.
    let many = (0..<35).compactMap { Entry(["id": .string("m\($0)"), "kind": "message", "content": "x", "toAgent": ["id": "b2"]]) }
    XCTAssertEqual(AgentNetwork.exchange(many, source: (id: "a1", name: "Ada"), targetId: "b2").map(\.id), Self.fixture["exchangeLast30Ids"]?.array?.compactMap(\.string))
  }
}

/** An agent's channels as the window's Channels view reads the box's answer (`A0n`, `P0n`, `O0n`, `mmt`, `C0n`). */
final class ChannelsTests: XCTestCase {
  private let answer: JSON = [
    "manifests": [
      ["platform": "discord", "displayName": "Discord", "blurb": "Message in Discord servers and DMs through a bot the user owns.", "credentialLabel": "bot token", "availability": "available", "connectGuide": "…"],
      ["platform": "slack", "displayName": "Slack", "blurb": "Message in Slack channels and DMs through a Socket Mode app the user owns.", "credentialLabel": "app token and bot token", "availability": "available", "connectGuide": "…"],
    ],
    "connections": [["platform": "slack", "label": "Slack", "status": "pending", "detail": "Waiting for the bot token (xoxb-…)"]],
  ]

  func testRows() throws {
    let view = try XCTUnwrap(ChannelsView(json: answer))
    XCTAssertTrue(view.hasChannels)
    let discord = view.manifests[0], slack = view.manifests[1]
    XCTAssertEqual(view.state(discord), .available)
    XCTAssertNil(ChannelsView.chip(.available))
    XCTAssertEqual(view.subtitle(discord), discord.blurb)
    // Pending reads as Connecting, its "Waiting for…" never shown.
    XCTAssertEqual(view.state(slack), .connecting)
    XCTAssertEqual(ChannelsView.chip(view.state(slack)), "Connecting")
    XCTAssertEqual(view.subtitle(slack), slack.blurb)
    XCTAssertEqual(ChannelsView.placeholder(slack), "Paste your app token and bot token")
    var connected = view
    connected.connections = [ChannelsView.Connection(platform: "slack", label: "Slack", status: "connected", detail: nil)]
    XCTAssertEqual(connected.subtitle(slack), "Connected as Slack")
    XCTAssertEqual(ChannelsView.chip(connected.state(slack)), "Connected")
    connected.connections = [ChannelsView.Connection(platform: "slack", label: "Slack", status: "error", detail: nil)]
    XCTAssertEqual(connected.subtitle(slack), "The platform rejected this connection.")
    XCTAssertEqual(ChannelsView.chip(connected.state(slack)), "Needs attention")
    // The guide still says coming soon (the window's own table).
    XCTAssertEqual(ChannelsView.guide(discord).description, "Connecting Discord is not available yet.")
    XCTAssertEqual(ChannelsView.guide(discord).blurb, "Message in Discord servers and DMs (coming soon).")
    XCTAssertFalse(ChannelsView(manifests: [ChannelsView.Manifest(platform: "slack", displayName: "Slack", blurb: "", credentialLabel: "", availability: "coming-soon")], connections: []).hasChannels)
    XCTAssertNil(ChannelsView(json: ["manifests": []]))
  }
}

/** The channel calls, as the window makes them: each answers the whole view. */
@MainActor
final class ChannelCallTests: XCTestCase {
  func testTheCallsAndTheirAnswers() async throws {
    let backend = ChannelBackend()
    let store = AppStore()
    await store.attach(backend)
    let first = await store.channels("simeon")
    let read = try XCTUnwrap(first)
    XCTAssertTrue(read.hasChannels)
    _ = await store.connectChannel("simeon", platform: "discord", token: "abc")
    _ = await store.refreshChannel("simeon", platform: "discord")
    let last = await store.disconnectChannel("simeon", platform: "discord")
    let after = try XCTUnwrap(last)
    XCTAssertEqual(after.manifests.count, 2)
    let calls = backend.lock.withLock { backend.calls }.filter { $0.0.hasSuffix("Channel") || $0.0 == "getAgentChannels" }
    XCTAssertEqual(calls.map(\.0), ["getAgentChannels", "connectChannel", "refreshChannel", "disconnectChannel"])
    XCTAssertEqual(calls[1].1["token"]?.string, "abc")
    XCTAssertEqual(calls[1].1["platform"]?.string, "discord")
    XCTAssertEqual(calls[3].1["id"]?.string, "simeon")
  }
}

final class ChannelBackend: AgentBackend, @unchecked Sendable {
  let lock = NSLock()
  var calls: [(String, JSON)] = []
  static let view: JSON = [
    "manifests": [
      ["platform": "discord", "displayName": "Discord", "blurb": "Message in Discord servers and DMs through a bot the user owns.", "credentialLabel": "bot token", "availability": "available"],
      ["platform": "slack", "displayName": "Slack", "blurb": "Message in Slack channels and DMs through a Socket Mode app the user owns.", "credentialLabel": "app token and bot token", "availability": "available"],
    ],
    "connections": [],
  ]
  func tail(_ agentId: String, limit: Int) async throws -> [Entry] { [] }
  func listAgents() async throws -> [Agent] { [Agent(id: "simeon", name: "Simeon")] }
  func transcript(_ agentId: String) async throws -> [Entry] { [] }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws {}
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, colour: String) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { _ in } }
  var call: CallEngine? { nil }
  func command(_ method: String, _ args: JSON) async throws -> JSON {
    lock.withLock { calls.append((method, args)) }
    return method.hasSuffix("Channel") || method == "getAgentChannels" ? Self.view : [:]
  }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}
