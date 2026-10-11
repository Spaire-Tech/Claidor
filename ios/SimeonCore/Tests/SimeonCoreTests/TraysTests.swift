import XCTest
@testable import SimeonCore

/**
 * The computer's notices as the window keeps them (`EKe`, `hVn`) and draws
 * an open agent's (`pzn`, `yzn`, `kzn`), and the channel tag on a message
 * (`eTe`, `E0n`).
 */
final class TraysTests: XCTestCase {
  private func tray(_ id: String, agent: String? = "a", title: String = "Agent failed to respond", count: Int? = nil) -> JSON {
    var json: JSON = ["kind": "error", "id": .string(id), "title": .string(title), "detail": "The model stopped.", "createdAt": 1]
    if let agent { json = json.setting("agentId", .string(agent)) }
    if let count { json = json.setting("count", .number(Double(count))) }
    return json
  }

  func testEvents() {
    var list = TrayList()
    // Before the first read, a change has nothing to apply to.
    list.take(["type": "pushed", "tray": tray("t0")])
    XCTAssertTrue(list.trays.isEmpty)
    list.take(["type": "snapshot", "trays": [tray("t1"), tray("t2", agent: "b")]])
    XCTAssertEqual(list.trays.map(\.id), ["t1", "t2"])
    // A repeat replaces the tray in its place; a new one goes last.
    list.take(["type": "pushed", "tray": tray("t1", title: "Model provider is overloaded", count: 3)])
    list.take(["type": "pushed", "tray": tray("t3", agent: nil)])
    XCTAssertEqual(list.trays.map(\.id), ["t1", "t2", "t3"])
    XCTAssertEqual(list.trays[0].title, "Model provider is overloaded")
    XCTAssertEqual(list.trays[0].countLabel, "×3")
    XCTAssertNil(list.trays[1].countLabel)
    // Only the open agent's show; one with no agent never does.
    XCTAssertEqual(list.shown(for: "a").map(\.id), ["t1"])
    XCTAssertEqual(list.shown(for: nil).map(\.id), [])
    list.take(["type": "dismissed", "id": "t1"])
    XCTAssertEqual(list.trays.map(\.id), ["t2", "t3"])
    list.take(["type": "cleared"])
    XCTAssertTrue(list.trays.isEmpty)
  }

  /** What comes while `getTrays` is on its way is applied over its answer; an earlier read's answer is dropped. */
  func testARead() {
    var list = TrayList()
    let first = list.beginRead()
    let second = list.beginRead()
    list.take(["type": "pushed", "tray": tray("late")])
    list.take(["type": "dismissed", "id": "gone"])
    list.finishRead(first, answer: [tray("old")])
    XCTAssertTrue(list.trays.isEmpty)
    list.finishRead(second, answer: [tray("gone"), tray("kept")])
    XCTAssertEqual(list.trays.map(\.id), ["kept", "late"])
    // A failed read keeps what was shown.
    let third = list.beginRead()
    list.finishRead(third, answer: nil)
    XCTAssertEqual(list.trays.map(\.id), ["kept", "late"])
  }

  func testActions() throws {
    var json = tray("t")
    json = json.setting("requestId", "req_1").setting("actions", [
      ["kind": "open-url", "label": "Open billing", "url": "https://simeonlabs.com"],
      ["kind": "switch-model", "label": "Use another model", "modelId": "m"],
      ["kind": "dashboard-action", "label": "Upgrade", "action": "upgrade", "args": ["tier": "pro"], "successMessage": "Upgraded"],
    ])
    let parsed = try XCTUnwrap(Tray(json))
    XCTAssertEqual(parsed.actions.map(\.label), ["Open billing", "Upgrade"])
    XCTAssertEqual(parsed.actions.last, .dashboard(label: "Upgrade", action: "upgrade", args: ["tier": "pro"], successMessage: "Upgraded"))
    XCTAssertEqual(parsed.copyableRequestId, "req_1")
    XCTAssertNil(Tray(tray("u").setting("requestId", ""))?.copyableRequestId)
  }

  func testTheChannelTag() {
    XCTAssertEqual(ChannelTag(channel: "discord:123", inbound: true, sender: "Ada")?.title, "From Ada on Discord")
    XCTAssertEqual(ChannelTag(channel: " slack : C01 ", inbound: true, sender: "")?.title, "From Slack")
    XCTAssertEqual(ChannelTag(channel: "telegram:9", inbound: false)?.title, "Sent to telegram")
    XCTAssertNil(ChannelTag(channel: ":123", inbound: true))
    XCTAssertNil(ChannelTag(channel: "discord:", inbound: true))
    XCTAssertNil(ChannelTag(channel: "discord", inbound: true))
    XCTAssertNil(ChannelTag(channel: nil, inbound: true))

    let inbound = Entry(["kind": "message", "id": "m1", "role": "user", "content": "hi", "channel": "discord:42", "channelSender": "Ada"])!
    let outbound = Entry(["kind": "send-message", "id": "m2", "message": ["type": "text", "content": "On it.", "channel": "slack:C01"]])!
    let plain = Entry(["kind": "message", "id": "m3", "role": "user", "content": "hello"])!
    let tags = Chat.rows([inbound, outbound, plain]).compactMap { row -> String? in
      if case .bubble(let bubble) = row { return bubble.channel?.title ?? "none" }
      return nil
    }
    XCTAssertEqual(tags, ["From Ada on Discord", "Sent to Slack", "none"])
  }
}

/** The file card's line (`Eft`, `xvn`). */
final class FileLineTests: XCTestCase {
  func testSizes() {
    XCTAssertEqual(FileLine.size(0), "0 B")
    XCTAssertEqual(FileLine.size(1023), "1023 B")
    XCTAssertEqual(FileLine.size(1024), "1.0 KB")
    // A tie goes up, as `toFixed` rounds: 1.25 → 1.3.
    XCTAssertEqual(FileLine.size(1280), "1.3 KB")
    XCTAssertEqual(FileLine.size(10239), "10.0 KB")
    XCTAssertEqual(FileLine.size(10240), "10 KB")
    XCTAssertEqual(FileLine.size(1_048_575), "1024 KB")
    XCTAssertEqual(FileLine.size(1_048_576), "1.0 MB")
    XCTAssertEqual(FileLine.size(1_572_864), "1.5 MB")
    XCTAssertEqual(FileLine.size(26_214_400), "25.0 MB")
  }

  func testAnswers() {
    XCTAssertEqual(FileLine.line(.null), "Couldn't read file")
    XCTAssertEqual(FileLine.line(["kind": "binary", "bytes": 2048]), "2.0 KB")
    XCTAssertEqual(FileLine.line(["kind": "text", "text": "hi", "truncated": false, "bytes": 2]), "2 B")
  }
}
