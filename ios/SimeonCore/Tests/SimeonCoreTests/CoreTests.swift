import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/** A scripted server: each request gets the next answer, and is kept for the test to read. */
final class ScriptedHTTP: HTTPClient, @unchecked Sendable {
  private let lock = NSLock()
  private var answers: [(URLRequest) -> HTTPAnswer]
  private(set) var requests: [URLRequest] = []

  init(_ answers: [(URLRequest) -> HTTPAnswer]) { self.answers = answers }

  func send(_ request: URLRequest) async throws -> HTTPAnswer {
    let next: ((URLRequest) -> HTTPAnswer)? = lock.withLock {
      requests.append(request)
      return answers.isEmpty ? nil : answers.removeFirst()
    }
    return next?(request) ?? HTTPAnswer(status: 500)
  }

  var sent: [URLRequest] { lock.lock(); defer { lock.unlock() }; return requests }
}

func json(_ text: String) -> Data { Data(text.utf8) }

final class SignInTests: XCTestCase {
  func testHashMatchesNode() {
    // node -e 'crypto.createHash("sha256").update("abc").digest("hex")'
    XCTAssertEqual(PlainSHA256.hash(Array("abc".utf8)).map { String(format: "%02x", $0) }.joined(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    XCTAssertEqual(PlainSHA256.hash(Array(String(repeating: "a", count: 1000).utf8)).map { String(format: "%02x", $0) }.joined(), "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3")
  }

  func testChallengeIsTheMacs() {
    // The server's challenge_for, and Node's createHash("sha256").update(verifier, "ascii").digest("base64url").
    XCTAssertEqual(SignIn.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    XCTAssertEqual(base64URL([0, 1, 2, 250, 251, 252, 253]), "AAEC-vv8_Q")
    XCTAssertEqual(bytesFromBase64URL("AAEC-vv8_Q"), [0, 1, 2, 250, 251, 252, 253])
  }

  func testLoginURLInTheMacsOrder() {
    let metadata = SignIn.Metadata(uuid: "u-1", verifier: "v", challenge: "c")
    XCTAssertEqual(SignIn.loginURL(api: URL(string: "https://api.simeonlabs.com/")!, metadata: metadata).absoluteString,
                   "https://api.simeonlabs.com/loginDeepControl?challenge=c&uuid=u-1&mode=login&redirectTarget=simeon-ios")
  }

  func testPollWaitsThenTakesThePair() async throws {
    let http = ScriptedHTTP([
      { _ in HTTPAnswer(status: 404) },
      { _ in HTTPAnswer(status: 404) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"accessToken":"a","refreshToken":"r"}"#)) },
    ])
    let outcome = await SignIn.poll(api: URL(string: "https://api.example.com")!, metadata: SignIn.Metadata(uuid: "u", verifier: "v", challenge: "c"), clientVersion: "ios-1", http: http, wait: { _ in })
    XCTAssertEqual(outcome, .tokens(TokenPair(accessToken: "a", refreshToken: "r")))
    XCTAssertEqual(http.sent.count, 3)
    let first = http.sent[0]
    XCTAssertEqual(first.url?.absoluteString, "https://api.example.com/auth/poll")
    XCTAssertEqual(first.httpMethod, "POST")
    // The verifier goes in the body, never the query string.
    XCTAssertNil(first.url?.query)
    XCTAssertEqual(try JSON.parse(first.httpBody!), ["uuid": "u", "verifier": "v"])
    XCTAssertEqual(first.value(forHTTPHeaderField: "x-simeon-client-version"), "ios-1")
  }

  func testPollGivesUpAfterThreeErrorsAndHearsARefusal() async {
    let errors = ScriptedHTTP([{ _ in HTTPAnswer(status: 500) }, { _ in HTTPAnswer(status: 502) }, { _ in HTTPAnswer(status: 503) }])
    let gaveUp = await SignIn.poll(api: URL(string: "https://x")!, metadata: SignIn.Metadata(uuid: "u", verifier: "v", challenge: "c"), clientVersion: "1", http: errors, wait: { _ in })
    XCTAssertEqual(gaveUp, .gaveUp)
    let refused = ScriptedHTTP([{ _ in HTTPAnswer(status: 403, body: json(#"{"error":"sign_in_policy_violation"}"#)) }])
    let outcome = await SignIn.poll(api: URL(string: "https://x")!, metadata: SignIn.Metadata(uuid: "u", verifier: "v", challenge: "c"), clientVersion: "1", http: refused, wait: { _ in })
    XCTAssertEqual(outcome, .refused)
  }

  func testPollDelayIsTheMacs() {
    XCTAssertEqual(SignIn.pollDelay(attempt: 0), 1)
    XCTAssertEqual(SignIn.pollDelay(attempt: 1), 1.2, accuracy: 1e-9)
    XCTAssertEqual(SignIn.pollDelay(attempt: 40), 10)
  }
}

final class TokenTests: XCTestCase {
  func envelope(exp: Double) -> String {
    let claims = base64URL(Array(#"{"exp":\#(Int(exp))}"#.utf8))
    return "simeon_da_header.\(claims).sig"
  }

  func testExpiryComesFromTheEnvelope() {
    XCTAssertEqual(Tokens.expiry(ofAccessToken: envelope(exp: 1_800_000_000), nowMs: 0), 1_800_000_000_000)
    XCTAssertEqual(Tokens.expiry(ofAccessToken: "opaque", nowMs: 1000), 1000 + 3_600_000)
  }

  func testRefreshAnswers() {
    XCTAssertEqual(Tokens.readRefreshAnswer(status: nil, body: nil, nowMs: 0), .kept)
    XCTAssertEqual(Tokens.readRefreshAnswer(status: 503, body: nil, nowMs: 0), .kept)
    XCTAssertEqual(Tokens.readRefreshAnswer(status: 429, body: nil, nowMs: 0), .kept)
    XCTAssertEqual(Tokens.readRefreshAnswer(status: 400, body: nil, nowMs: 0), .ended)
    XCTAssertEqual(Tokens.readRefreshAnswer(status: 200, body: ["shouldLogout": true], nowMs: 0), .ended)
    XCTAssertEqual(Tokens.readRefreshAnswer(status: 200, body: ["access_token": "a", "refresh_token": "b"], nowMs: 0),
                   .refreshed(SessionTokens(accessToken: "a", refreshToken: "b", expiresAtMs: 3_600_000)))
  }

  func testTheAPIRefreshesWithFiveMinutesLeftAndKeepsTheNewPair() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "old", refreshToken: "r1", expiresAtMs: 1_000_000 + 4 * 60_000))
    let http = ScriptedHTTP([
      { request in
        XCTAssertEqual(request.url?.path, "/oauth/token")
        return HTTPAnswer(status: 200, body: json(#"{"access_token":"new","refresh_token":"r2"}"#))
      },
      { request in
        XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer new")
        XCTAssertEqual(request.value(forHTTPHeaderField: "x-simeon-client-type"), "sand")
        return HTTPAnswer(status: 200, body: json(#"{"code":0,"data":{"email":"bass@simeonlabs.com","name":"Bass Fall"}}"#))
      },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http, now: { 1_000_000 })
    let profile = try await api.profile()
    XCTAssertEqual(profile["email"], "bass@simeonlabs.com")
    XCTAssertEqual(vault.read()?.refreshToken, "r2")
    XCTAssertEqual(Account(profile: profile)?.initials, "BF")
  }

  func testASpentPairEndsTheSession() async {
    let vault = MemoryVault(SessionTokens(accessToken: "old", refreshToken: "spent", expiresAtMs: 0))
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json(#"{"shouldLogout":true}"#)) }])
    let api = SimeonAPI(base: URL(string: "https://x")!, clientVersion: "1", vault: vault, http: http, now: { 1_000_000 })
    let ended = Flag()
    await api.onSessionEnded { ended.set() }
    let token = await api.accessToken()
    XCTAssertNil(token)
    XCTAssertNil(vault.read())
    XCTAssertTrue(ended.value)
  }
}

final class Flag: @unchecked Sendable {
  private let lock = NSLock()
  private var raised = false
  func set() { lock.lock(); raised = true; lock.unlock() }
  var value: Bool { lock.lock(); defer { lock.unlock() }; return raised }
}

final class GatewayTests: XCTestCase {
  func testEventStreamParsesBlocksAndSkipsTheRest() {
    var parser = EventStreamParser()
    let text = ": hello\n\ndata: {\"channel\":\"agents\",\"payload\":[]}\n\nevent: x\ndata: {\"channel\":\"transcript\",\ndata: \"payload\":{\"type\":\"removed\",\"agentId\":\"a\",\"id\":\"e1\"}}\r\n\r\ndata: not json\n\n"
    var events: [GatewayEvent] = []
    // Byte by byte, as a network would split it at its worst.
    for byte in Array(text.utf8) { events += parser.feed(bytes: [byte]) }
    XCTAssertEqual(events.map(\.channel), ["agents", "transcript"])
    XCTAssertEqual(TranscriptChange(events[1].payload), .remove(agentId: "a", entryId: "e1"))
  }

  func testConnectionFromTheBroker() throws {
    let connection = try GatewayConnection(box: ["gatewayUrl": "https://api.simeonlabs.com/sand-box/b1/p/1340/", "gatewayToken": "g", "networkToken": "n", "vncUrl": "https://v"])
    XCTAssertEqual(connection.baseURL, "https://api.simeonlabs.com/sand-box/b1/p/1340")
    let request = connection.commandRequest("listAgents", [:])
    XCTAssertEqual(request.url?.absoluteString, "https://api.simeonlabs.com/sand-box/b1/p/1340/api/listAgents")
    XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer g")
    XCTAssertEqual(request.value(forHTTPHeaderField: "x-anyrun-network-token"), "n")
    XCTAssertEqual(connection.eventsRequest().value(forHTTPHeaderField: "accept"), "text/event-stream")
    XCTAssertThrowsError(try GatewayConnection(box: [:]))
  }

  func testCommandsAskTheBrokerOnceAndRetryOnAMovedBox() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { request in
        XCTAssertEqual(request.url?.path, "/simeon.v1.ComputerService/EnsureSandBox")
        return HTTPAnswer(status: 200, body: json(#"{"gatewayUrl":"https://box-1","gatewayToken":"g1"}"#))
      },
      { _ in HTTPAnswer(status: 502) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"gatewayUrl":"https://box-2","gatewayToken":"g2"}"#)) },
      { request in
        XCTAssertEqual(request.url?.absoluteString, "https://box-2/api/listAgents")
        return HTTPAnswer(status: 200, body: json(#"[{"id":"simeon","name":"Simeon","avatarColor":"blue","lastActivityAt":5}]"#))
      },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    let backend = LiveBackend(gateway: Gateway(api: api, http: http))
    let agents = try await backend.listAgents()
    XCTAssertEqual(agents.map(\.name), ["Simeon"])
    XCTAssertEqual(http.sent.count, 4)
  }

  func testAHostRefusalIsNotRetried() async {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { _ in HTTPAnswer(status: 200, body: json(#"{"gatewayUrl":"https://box-1"}"#)) },
      { _ in HTTPAnswer(status: 400, body: json(#"{"error":"Malformed getAgentTranscriptWindow request"}"#)) },
    ])
    let api = SimeonAPI(base: URL(string: "https://x")!, clientVersion: "1", vault: vault, http: http)
    do {
      _ = try await Gateway(api: api, http: http).command("getAgentTranscriptWindow", [:])
      XCTFail("expected a refusal")
    } catch {
      XCTAssertEqual(error.localizedDescription, "getAgentTranscriptWindow: Malformed getAgentTranscriptWindow request")
    }
    XCTAssertEqual(http.sent.count, 2)
  }

  func testSendCarriesTheHostsArgumentNames() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { _ in HTTPAnswer(status: 200, body: json(#"{"gatewayUrl":"https://box"}"#)) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"accepted":true}"#)) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"agent":{"id":"agent-9","name":"Nora"}}"#)) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"agent":{"id":"group-1"}}"#)) },
    ])
    let api = SimeonAPI(base: URL(string: "https://x")!, clientVersion: "1", vault: vault, http: http)
    let backend = LiveBackend(gateway: Gateway(api: api, http: http))
    try await backend.send("theo", text: "Hi")
    let id = try await backend.createAgent(name: "Nora", colour: "green")
    let group = try await backend.createGroup(name: "Simeon, Iris", memberIds: ["simeon", "iris"])
    XCTAssertEqual(id, "agent-9")
    XCTAssertEqual(group, "group-1")
    let send = try JSON.parse(http.sent[1].httpBody!)
    XCTAssertEqual(send["agentId"], "theo")
    XCTAssertEqual(send["prompt"], "Hi")
    XCTAssertEqual(send["attachmentPaths"], [])
    XCTAssertTrue(send["clientNonce"]?.string?.hasPrefix("ios-") ?? false)
    let create = try JSON.parse(http.sent[2].httpBody!)
    XCTAssertEqual(create["avatarColor"], "green")
    XCTAssertEqual(create["avatarShape"], "cloud")
    XCTAssertEqual(create["isKickstartRequested"], true)
    XCTAssertEqual(try JSON.parse(http.sent[3].httpBody!)["memberAgentIds"], ["simeon", "iris"])
  }

  func testHostEventsMapToTheScreens() {
    let upserted = LiveBackend.map(GatewayEvent(channel: "agent-upserted", payload: ["agent": ["id": "theo", "name": "Theo", "isComposingMessage": true]]))
    guard case .agentUpserted(let agent)? = upserted.first else { return XCTFail() }
    XCTAssertTrue(agent.isBusy)
    let step = LiveBackend.map(GatewayEvent(channel: "outline", payload: ["type": "appended", "agentId": "simeon", "item": ["kind": "tool-call", "id": "m1", "status": "running", "summary": "Checking Linear"]]))
    guard case .step(let agentId, _, let summary, let running)? = step.first else { return XCTFail() }
    XCTAssertEqual([agentId, summary], ["simeon", "Checking Linear"])
    XCTAssertTrue(running)
    XCTAssertTrue(LiveBackend.map(GatewayEvent(channel: "tray", payload: [:])).isEmpty)
  }
}

final class ChatTests: XCTestCase {
  let now = 1_791_400_000_000.0

  func testTheMorningBriefFoldsLikeTheWindow() {
    let seed = DemoData.seed(now: now)
    let rows = Chat.rows(seed.transcripts["simeon"]!)
    let kinds = rows.map { row -> String in
      switch row {
      case .stamp: return "stamp"
      case .bubble(let b): return b.fromPerson ? "me" : "them"
      case .file(_, let name, _, _): return "file:\(name)"
      case .teammates(_, let count, let peers, _): return "teammates:\(count):\(peers.map(\.name).joined(separator: "+"))"
      case .routine(_, _, let name): return "routine:\(name)"
      default: return "other"
      }
    }
    XCTAssertEqual(kinds, ["stamp", "me", "them", "teammates:4:Scout+Iris", "them", "file:Launch review.docx", "me", "routine:Monday launch check", "them"])
    guard case .bubble(let thumbs) = rows[6] else { return XCTFail() }
    XCTAssertEqual(thumbs.reactions, ["\u{1F44D}"])
  }

  func testAnEarlierCallIsOneVoiceChatLine() {
    let rows = Chat.rows(DemoData.seed(now: now).transcripts["theo"]!)
    let calls = rows.compactMap { row -> (Int, Int)? in
      if case .voiceCall(_, let seconds, let lines) = row { return (seconds, lines.count) }
      return nil
    }
    XCTAssertEqual(calls.map(\.0), [71])
    XCTAssertEqual(calls.map(\.1), [4])
    XCTAssertEqual(Chat.callLength(71), "01:11")
    XCTAssertEqual(Chat.callClock(16), "0:16")
    // Stamps: one at the start, one when the call came 59 minutes later, one an hour after that (the window stamps after 15 minutes).
    XCTAssertEqual(rows.filter { if case .stamp = $0 { return true }; return false }.count, 3)
  }

  func testAGroupNamesEachMemberOnceAndShowsTheirButterflyLast() {
    let rows = Chat.rows(DemoData.seed(now: now).transcripts["launch-squad"]!, isGroup: true)
    let bubbles = rows.compactMap { row -> Bubble? in if case .bubble(let b) = row, !b.fromPerson { return b }; return nil }
    XCTAssertEqual(bubbles.map { $0.author?.name ?? "" }, ["Iris", "Scout", "Simeon", "Simeon"])
    XCTAssertTrue(bubbles.allSatisfy { $0.showsName && $0.showsAvatar })
  }

  func testQuestionCardsAndConnectors() {
    let entries = [
      Entry(["kind": "send-message", "id": "q", "message": ["type": "widget", "widget": ["prompt": "What first?", "options": [["label": "Inbox"], ["label": "Calendar"]], "allowCustom": true]], "respondedValue": "Inbox"])!,
      Entry(["kind": "send-message", "id": "c", "message": ["type": "connectors", "connectors": ["Gmail", "Notion"]]])!,
      Entry(["kind": "tool-call", "id": "t"])!,
    ]
    let rows = Chat.rows(entries)
    guard case .question(_, let card) = rows[0] else { return XCTFail() }
    XCTAssertEqual(card.options, ["Inbox", "Calendar"])
    XCTAssertEqual(card.answer, "Inbox")
    guard case .connectors(_, let names, let connected, _) = rows[1] else { return XCTFail() }
    XCTAssertEqual(names, ["Gmail", "Notion"])
    XCTAssertTrue(connected)
    XCTAssertEqual(rows.count, 2)
  }

  func testTranscriptChangesSwapByIdOrAppend() {
    let a = Entry(["kind": "message", "id": "a", "role": "user", "content": "one"])!
    let b = Entry(["kind": "message", "id": "b", "role": "assistant", "content": "tw", "isStreaming": true])!
    let b2 = Entry(["kind": "message", "id": "b", "role": "assistant", "content": "two"])!
    var list = TranscriptChange.upsert(agentId: "x", entry: a).applied(to: [])
    list = TranscriptChange.upsert(agentId: "x", entry: b).applied(to: list)
    list = TranscriptChange(["type": "updated", "agentId": "x", "entry": b2.raw])!.applied(to: list)
    XCTAssertEqual(list.map { $0.content ?? "" }, ["one", "two"])
    XCTAssertEqual(TranscriptChange(["type": "removed", "agentId": "x", "id": "a"])!.applied(to: list).map(\.id), ["b"])
    XCTAssertEqual(TranscriptChange(["type": "cleared", "agentId": "x"])!.applied(to: list), [])
  }

  func testPreviewsAndTheRosterOrder() {
    let seed = DemoData.seed(now: now)
    let order = sortRoster(seed.agents).map(\.name)
    XCTAssertEqual(order, ["Simeon", "Launch squad", "Theo", "Iris", "Scout"])
    XCTAssertEqual(seed.agents.first { $0.id == "launch-squad" }?.lastMessagePreview, "Simeon: Done. Moved in Linear and posted in #launch on Slack.")
    XCTAssertEqual(seed.agents.first { $0.id == "theo" }?.lastMessagePreview, "Both reminders went out from Gmail. I'll tell you when they pay.")
  }

  func testStampTexts() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let locale = Locale(identifier: "en_US")
    let today = Date(timeIntervalSince1970: 1_791_400_000) // 2026-10-07 19:06 UTC
    XCTAssertTrue(Chat.stampText(today.addingTimeInterval(-60), now: today, calendar: calendar, locale: locale).hasPrefix("Today "))
    XCTAssertTrue(Chat.stampText(today.addingTimeInterval(-86_400), now: today, calendar: calendar, locale: locale).hasPrefix("Yesterday "))
    XCTAssertEqual(Chat.listTime(today.addingTimeInterval(-86_400), now: today, calendar: calendar, locale: locale), "Yesterday")
    // ICU puts a narrow no-break space before "PM".
    let spaced = { (text: String) in text.replacingOccurrences(of: "\u{202F}", with: " ") }
    XCTAssertEqual(spaced(Chat.listTime(today.addingTimeInterval(-60), now: today, calendar: calendar, locale: locale)), "7:05 PM")
    XCTAssertEqual(spaced(Chat.stampText(today.addingTimeInterval(-86_400 * 3), now: today, calendar: calendar, locale: locale)), "Sun, Oct 4 7:06 PM")
    XCTAssertEqual(Chat.listTime(today.addingTimeInterval(-86_400 * 30), now: today, calendar: calendar, locale: locale), "9/7")
  }
}

final class ButterflyAndPaletteTests: XCTestCase {
  func testReachMatchesTheWindow() {
    // node: butterflyReach(t) from desktop/scripts/lib/router-renderer-patch.mjs.
    let expected: [(Double, Double)] = [(0, 67.43497719968192), (Double.pi / 2, 37.24023842188095), (1, 90.50606529034812), (2.5, 94.19762103730409), (-1.2, 70.00994208197413)]
    for (t, reach) in expected { XCTAssertEqual(Butterfly.reach(t), reach, accuracy: 1e-9) }
    XCTAssertEqual(Butterfly.outline.count, 200)
    XCTAssertEqual(Butterfly.outline[0].x, 181.71, accuracy: 0.01)
    XCTAssertEqual(Butterfly.veins.count, 14)
  }

  func testPalettes() {
    XCTAssertEqual(AgentPalette.all.count, 12)
    XCTAssertEqual(AgentPalette.named("nope").id, "blue")
    XCTAssertEqual(AgentPalette.named("green").mid.hex, "#a8c58a")
    // color-mix(in oklab, white, black) is a mid grey near #636363.
    let grey = RGB(1, 1, 1).mixed(with: RGB(0, 0, 0))
    XCTAssertEqual(grey.r, 0.388, accuracy: 0.01)
  }

  func testJSONRoundTrips() throws {
    let value: JSON = ["a": [1, 2.5, "x", nil, true], "t": 1791400000000]
    XCTAssertEqual(try JSON.parse(try value.data()), value)
    XCTAssertEqual(String(decoding: try JSON(1791400000000).data(), as: UTF8.self), "1791400000000")
  }
}

@MainActor
final class StoreTests: XCTestCase {
  func testTheStoreFollowsTheDemo() async throws {
    let store = AppStore()
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    await store.attach(backend)
    XCTAssertEqual(store.agents.first?.name, "Simeon")
    await store.open("theo")
    XCTAssertFalse(store.rows(for: "theo").isEmpty)
    await store.send("Thanks Theo", to: "theo")
    try await Task.sleep(nanoseconds: 100_000_000)
    guard case .bubble(let last)? = store.rows(for: "theo").last else { return XCTFail() }
    XCTAssertEqual(last.text, "Thanks Theo")
    XCTAssertEqual(store.agents.first?.name, "Theo")

    let id = await store.createAgent(name: "Nora", colour: "green")
    XCTAssertNotNil(id)
    await store.open(id!)
    try await Task.sleep(nanoseconds: 300_000_000)
    let question = store.rows(for: id!).contains { if case .question = $0 { return true }; return false }
    XCTAssertTrue(question)

    let group = await store.createGroup(memberIds: ["simeon", "iris"])
    XCTAssertEqual(store.agent(group)?.name, "Simeon, Iris")
  }
}
