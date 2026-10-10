import Foundation
import XCTest
@testable import SimeonCore

/**
 * A chat's runs against the window's own functions run on the same lines:
 * who each line is from (`Fixtures/sender-keys.json`, the window's `Tpe`),
 * and the display list with each item's group start and corners
 * (`Fixtures/chat-runs.json`, the window's `npt` and `REn`).
 */
final class ChatRunsTests: XCTestCase {
  private func fixture(_ name: String) throws -> JSON {
    let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")!
    return try JSON.parse(Data(contentsOf: url))
  }

  func testSenderKeysAsTheWindowReadsThem() throws {
    let doc = try fixture("sender-keys")
    let entries = (doc["entries"]?.array ?? []).compactMap(Entry.init)
    let keys = (doc["keys"]?.array ?? []).compactMap { pair -> (String, String)? in
      guard let id = pair.array?.first?.text, let key = pair.array?.last?.text else { return nil }
      return (id, key)
    }
    XCTAssertEqual(entries.count, keys.count)
    for (entry, (id, key)) in zip(entries, keys) {
      XCTAssertEqual(entry.id, id)
      XCTAssertEqual(Chat.senderKey(entry), key, entry.id)
    }
  }

  func testTheDisplayListAsTheWindowMakesIt() throws {
    let doc = try fixture("chat-runs")
    let entries = (doc["entries"]?.array ?? []).compactMap(Entry.init)
    let items = Chat.displayItems(entries, unreadAfter: doc["unreadAfter"]?.double)
    let expected = (doc["items"]?.array ?? []).map { item in
      "\(item["kind"]?.text ?? ""):\((item["ids"]?.array ?? []).compactMap(\.text).joined(separator: ","))"
    }
    XCTAssertEqual(items.map { "\($0.kind.rawValue):\($0.entries.map(\.id).joined(separator: ","))" }, expected)
  }

  func testRunsAsTheWindowDrawsThem() throws {
    let doc = try fixture("chat-runs")
    let entries = (doc["entries"]?.array ?? []).compactMap(Entry.init)
    let threads = Set((doc["threads"]?.array ?? []).compactMap(\.text))
    let flags = Chat.runFlags(entries, unreadAfter: doc["unreadAfter"]?.double, threads: threads)
    var checked = 0
    for item in doc["items"]?.array ?? [] {
      guard let starts = item["startsGroup"]?.bool, let id = item["ids"]?.array?.first?.text else { continue }
      let expected = RunFlags(startsGroup: starts, continuesPrevious: item["continuesPrevious"]?.bool ?? false, continuesNext: item["continuesNext"]?.bool ?? false, aboveThreadChip: item["aboveThreadChip"]?.bool ?? false)
      XCTAssertEqual(flags[id], expected, id)
      checked += 1
    }
    XCTAssertGreaterThan(checked, 30)
  }

  /** A message still on its way (held while the computer is out of reach) counts, as the window counts it. */
  @MainActor
  func testTheStoreCountsAMessageStillSending() async throws {
    let backend = ScriptedBackend()
    // A minute ago, so no time stamp comes between it and what is sent now (a stamp ends a run).
    let now = Date().timeIntervalSince1970 * 1000
    backend.lines = [["kind": "send-message", "id": "a1", "message": ["type": "text", "content": "Morning"], "timestampMs": .number(now - 60_000)]]
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertEqual(store.runFlags["theo"]?["a1"], RunFlags())
    backend.push(.connection(live: false))
    try await Task.sleep(nanoseconds: 50_000_000)
    await store.send("Hi", to: "theo")
    await store.send("Still there?", to: "theo")
    let mine = store.rows(for: "theo").compactMap { row -> String? in
      if case .bubble(let bubble) = row, bubble.fromPerson { return bubble.id }
      return nil
    }
    XCTAssertEqual(mine.count, 2)
    XCTAssertEqual(store.runFlags["theo"]?[mine[0]], RunFlags(startsGroup: true, continuesNext: true))
    XCTAssertEqual(store.runFlags["theo"]?[mine[1]], RunFlags(continuesPrevious: true))
  }

  /** A thread's replies are not in the chat, so they neither start nor continue a run there. */
  @MainActor
  func testThreadRepliesAreLeftOut() async throws {
    let backend = ScriptedBackend()
    backend.lines = [
      ["kind": "send-message", "id": "a1", "message": ["type": "text", "content": "Draft?"], "timestampMs": 1_000],
      ["kind": "message", "id": "r1", "role": "user", "content": "in a thread", "branched": true, "replyTo": "a1", "timestampMs": 2_000],
      ["kind": "send-message", "id": "a2", "message": ["type": "text", "content": "Done"], "timestampMs": 3_000],
    ]
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertNil(store.runFlags["theo"]?["r1"])
    XCTAssertEqual(store.runFlags["theo"]?["a1"], RunFlags(continuesNext: true, aboveThreadChip: true))
    XCTAssertEqual(store.runFlags["theo"]?["a2"], RunFlags(continuesPrevious: false))
  }
}
