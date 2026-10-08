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
    try await backend.send("theo", text: "Hi", attachments: [])
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

  func testAnAgentsScreenGoesThroughTheProxy() throws {
    let connection = try GatewayConnection(box: ["gatewayUrl": "https://api.simeonlabs.com/sand-box/b1/p/8790", "networkToken": "NT", "vncUrl": "https://api.simeonlabs.com/sand-box/b1/p/6080/vnc.html?network_token=NT&resume_lower_s=900&resume_upper_s=18000&path=websockify%3Fnetwork_token%3DNT%26resume_lower_s%3D900%26resume_upper_s%3D18000", "forkVncBaseUrl": "https://api.simeonlabs.com/sand-box/b1/p/6081/"])
    XCTAssertEqual(connection.screenSocket(for: "http://127.0.0.1:6081/vnc.html?autoconnect=1&path=websockify%3Ftoken%3D3")?.absoluteString,
                   "wss://api.simeonlabs.com/sand-box/b1/p/6081/websockify?token=3&network_token=NT&resume_lower_s=900&resume_upper_s=18000")
    XCTAssertEqual(connection.screenSocket(for: "http://127.0.0.1:6080/vnc.html")?.absoluteString,
                   "wss://api.simeonlabs.com/sand-box/b1/p/6080/websockify?network_token=NT&resume_lower_s=900&resume_upper_s=18000")
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
      case .teammates(_, let exchange, _): return "teammates:\(exchange.label):\(exchange.peers.map(\.name).joined(separator: "+"))"
      case .routines(_, let action, let list): return "routine:\(action):\(list.map(\.name).joined(separator: "+"))"
      default: return "other"
      }
    }
    XCTAssertEqual(kinds, ["stamp", "me", "them", "teammates:4 messages with:Scout+Iris", "them", "file:Launch review.docx", "me", "routine:created:Monday launch check", "them"])
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
    XCTAssertEqual(card.labels, ["Inbox", "Calendar"])
    XCTAssertEqual(card.answer, "Inbox")
    XCTAssertFalse(card.isOpen)
    guard case .connectors(_, let names, let connected, _) = rows[1] else { return XCTFail() }
    XCTAssertEqual(names, ["Gmail", "Notion"])
    XCTAssertFalse(connected)
    XCTAssertEqual(rows.count, 2)
  }

  func testEveryCardTheMacDraws() {
    let rows = Chat.rows(DemoData.seed(now: now, gallery: true).transcripts["cards"]!)
    let kinds = rows.compactMap { row -> String? in
      switch row {
      case .stamp: return nil
      case .bubble(let b): return b.fromPerson ? "me" : "them"
      case .question(_, let card): return card.isOpen ? "question" : card.isDismissed ? "question-dismissed" : "question-answered"
      case .draft(_, let card): return "draft:\(card.kind.rawValue):\(card.status)"
      case .flights(_, let card): return "flights:\(card.offers.count)"
      case .connectors(_, let names, _, let reason): return "connector:\(names.joined()):\(reason ?? "")"
      case .request(_, let card):
        switch card {
        case .approval(_, let summary, _, _, let status): return "approval:\(summary):\(status)"
        case .secret(let label, _, _): return "secret:\(label)"
        case .computer(_, _, let resolution): return "computer:\(resolution ?? "waiting")"
        }
      case .notice(_, let text): return text == Chat.notShown ? "notice" : text
      case .file(_, let name, _, _): return "file:\(name)"
      default: return "other"
      }
    }
    XCTAssertEqual(kinds, ["me", "them", "question", "question-answered", "question-dismissed", "draft:email:Ready to send", "draft:slack:Ready to send", "flights:2", "connector:Linear:To read the launch tickets.", "approval:Delete 3 files in ~/Downloads:pending", "secret:Stripe API key", "computer:waiting", "notice", "file:Payouts September.pdf"])
    guard case .flights(_, let flights) = rows.first(where: { if case .flights = $0 { return true }; return false })! else { return XCTFail() }
    XCTAssertEqual(flights.title, "Seattle to Los Angeles")
    XCTAssertEqual(flights.offers[0].legs.count, 2)
    XCTAssertEqual(FlightsCard.initials("American Airlines"), "AM")
    XCTAssertEqual(FlightsCard.initials("Alaska Airlines"), "AL")
    XCTAssertEqual(FlightsCard.initials("Delta Air Lines"), "DL")
    guard case .question(_, let question) = rows.first(where: { if case .question = $0 { return true }; return false })! else { return XCTFail() }
    XCTAssertEqual(question.options[0], QuestionOption(label: "Pro", description: "$20 a month"))
  }

  func testExchangesAndRoutinesAreWordedLikeTheWindow() {
    let scout = Party(id: "scout", name: "Scout"), iris = Party(id: "iris", name: "Iris")
    let to = { (id: String, peer: Party) in Entry(["kind": "message", "id": .string(id), "role": "assistant", "content": "hi", "toAgent": ["id": .string(peer.id), "name": .string(peer.name)]])! }
    let from = { (id: String, peer: Party) in Entry(["kind": "message", "id": .string(id), "role": "user", "content": "hi", "fromAgent": ["id": .string(peer.id), "name": .string(peer.name)]])! }
    XCTAssertEqual(Chat.exchange([to("a", scout)]).label, "Messaged")
    XCTAssertEqual(Chat.exchange([from("a", scout)]).label, "Message from")
    XCTAssertEqual(Chat.exchange([to("a", scout), to("b", iris)]), .fanout(peers: [scout, iris]))
    XCTAssertEqual(Chat.exchange([to("a", scout), from("b", scout)]).label, "2 messages with")
    let routine = { (id: String, action: String, name: String) in Entry(["kind": "event", "id": .string(id), "event": ["type": "automation-changed", "action": .string(action), "automationId": .string(name), "automationName": .string(name)]])! }
    let rows = Chat.rows([routine("r1", "created", "Daily brief"), routine("r2", "created", "Monday check"), routine("r3", "updated", "Daily brief"), routine("r4", "deleted", "Old one")])
    let lines = rows.compactMap { row -> String? in if case .routines(_, let action, let list) = row { return "\(Chat.routineVerb(action)) \(list.map(\.name).joined(separator: "+"))" }; return nil }
    XCTAssertEqual(lines, ["Created Daily brief+Monday check", "Deleted Old one"])
  }

  func testTheNewLineGoesBeforeTheFirstUnreadAgentLine() {
    let entries = [
      Entry(["kind": "message", "id": "u", "role": "user", "content": "hi", "timestampMs": 1000])!,
      Entry(["kind": "send-message", "id": "a", "message": ["type": "text", "content": "one"], "timestampMs": 2000])!,
      Entry(["kind": "send-message", "id": "b", "message": ["type": "text", "content": "two"], "timestampMs": 3000])!,
    ]
    let rows = Chat.rows(entries, unreadAfter: 2500)
    XCTAssertEqual(rows.map(\.id).filter { !$0.hasPrefix("stamp") }, ["u", "a", "unread-divider", "b"])
  }

  func testSchedulesReadAndWriteTheMacsChoices() {
    XCTAssertEqual(Schedule(cron: "0 9 * * 1"), .weekly(weekday: 1, hour: 9, minute: 0))
    XCTAssertEqual(Schedule(cron: "0 9 * * 1").summary, "Every Monday at 9:00 AM")
    XCTAssertEqual(Schedule(cron: "30 8 * * 1-5").summary, "Weekdays at 8:30 AM")
    XCTAssertEqual(Schedule(cron: "0 18 * * *").summary, "Every day at 6:00 PM")
    XCTAssertEqual(Schedule(cron: "15 * * * *").summary, "Every hour at :15")
    XCTAssertEqual(Schedule(cron: "0 9 1 * *").summary, "Every month on the 1st at 9:00 AM")
    XCTAssertEqual(Schedule(cron: "*/30 * * * *").summary, "Every 30 minutes")
    XCTAssertEqual(Schedule(cron: "0 */4 * * *"), .everyHours(4))
    XCTAssertEqual(Schedule(cron: "0 9 * 6 *"), .custom("0 9 * 6 *"))
    for schedule in [Schedule.daily(hour: 7, minute: 5), .weekdays(hour: 17, minute: 45), .weekly(weekday: 5, hour: 12, minute: 0), .monthly(day: 15, hour: 9, minute: 30), .hourly(minute: 0), .everyMinutes(10)] {
      XCTAssertEqual(Schedule(cron: schedule.cron), schedule)
    }
    let routine = Routine(json: ["id": "r1", "name": "Brief", "prompt": "Brief me", "trigger": ["type": "cron", "schedule": "0 8 * * 1-5"], "isEnabled": false])!
    XCTAssertEqual(routine.summary, "Weekdays at 8:00 AM")
    XCTAssertEqual(routine.spec["trigger"]?["schedule"], "0 8 * * 1-5")
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

  func testTheWingsAreTheWindowsOwn() {
    // node: the window's own Ztt/Yse/p_t (index-UbX-y3il.js) on the same reach: first point and box after normalising.
    XCTAssertEqual(Butterfly.wings.count, 200)
    XCTAssertEqual(Butterfly.wings[0].from, Butterfly.Point(184.34, 117.37))
    XCTAssertEqual(Butterfly.wings[0].c1, Butterfly.Point(182.92, 118.1))
    let box = Butterfly.wingsBox
    XCTAssertEqual(box.minX, 0.048, accuracy: 0.06)
    XCTAssertEqual(box.maxX, 228.493, accuracy: 0.06)
    XCTAssertEqual(box.minY, 31.982, accuracy: 0.06)
    XCTAssertEqual(box.maxY, 196.559, accuracy: 0.06)
  }

  func testDefaultColourIsTheWindowsHash() {
    // node: unt(cnt(id)) from the window, into the patched palette order.
    XCTAssertEqual(AgentPalette.defaultColour(forAgentId: "simeon"), "cyan")
    XCTAssertEqual(AgentPalette.defaultColour(forAgentId: "theo"), "gray")
    XCTAssertEqual(AgentPalette.defaultColour(forAgentId: "agent-1"), "cyan")
    XCTAssertEqual(AgentPalette.defaultColour(forAgentId: "3f2a9c1e-0000-4abc-9def-1234567890ab"), "gray")
    XCTAssertEqual(Agent(id: "theo", name: "Theo").palette.id, "gray")
  }

  func testGroupLayoutIsTheWindows() {
    let three = Butterfly.groupLayout(count: 3, frame: 36)
    XCTAssertEqual(three.map(\.size), [20, 20, 20])
    XCTAssertEqual(three[0].x, 8, accuracy: 1e-9)
    XCTAssertEqual(three[2].y, 16, accuracy: 1e-9)
    XCTAssertEqual(Butterfly.groupLayout(count: 2, frame: 36)[1].x, 12, accuracy: 1e-9)
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

final class FakeVoice: VoiceTransport, @unchecked Sendable {
  let lock = NSLock()
  var events: (@Sendable (VoiceEvent) -> Void)?
  var started: (token: String, prompt: String, first: String, voice: String?)?
  var said: [String] = []
  var results: [String: String] = [:]
  var ended = false

  func start(token: String, prompt: String, firstMessage: String, voiceId: String?, language: String, events: @escaping @Sendable (VoiceEvent) -> Void) async throws {
    lock.withLock { started = (token, prompt, firstMessage, voiceId); self.events = events }
    events(.connected(conversationId: nil))
  }
  func setMuted(_ muted: Bool) async {}
  func say(context: String, nudge: String) async { lock.withLock { said.append(context) } }
  func toolResult(id: String, result: String) async { lock.withLock { results[id] = result } }
  func end() async { lock.withLock { ended = true } }
  func emit(_ event: VoiceEvent) { lock.withLock { events }?(event) }
}

final class VoiceCallTests: XCTestCase {
  func testTheVoiceSpeaksAsTheAgentWithTheMacsWords() {
    let prompt = VoiceCallText.prompt(name: "Theo", title: "Bookkeeping", description: "Keeps the books.", transcript: [.init(fromPerson: true, text: "What's our runway?")], personName: "Bass", teammates: [("Iris", "Customer support"), ("Theo", "")])
    XCTAssertTrue(prompt.hasPrefix("You are Theo, Bookkeeping, one of Bass's Simeon agents, on a live phone call with Bass."))
    XCTAssertTrue(prompt.contains("Your teammates, other agents on Bass's team that you can message, ask and hand work to: Iris (Customer support)."))
    XCTAssertTrue(prompt.contains("Bass: What's our runway?"))
    XCTAssertEqual(VoiceCallText.firstMessage(name: "Theo", pick: 0, personName: "Bass"), "Hey Bass, it's Theo. What's up?")
    XCTAssertEqual(VoiceCallText.firstMessage(name: "Theo", pick: 0.99, personName: nil), "Theo here. What's on your mind?")
    XCTAssertEqual(VoiceCallText.workingLabel("Please send the agenda to Dana and Marcus."), "Sending the agenda to Dana and Marcus…")
    XCTAssertEqual(VoiceCallText.workingLabel("Make a slide"), "Making a slide…")
    XCTAssertEqual(VoiceCallText.workingLabel("The usual"), "Working on it…")
  }

  func testACallRelaysTheTaskSaysTheAnswerAndLeavesItsRecord() async throws {
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let voice = FakeVoice()
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = StateLog()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 100_000_000)
    XCTAssertEqual(voice.lock.withLock { voice.started?.token }, "demo-token")
    XCTAssertTrue(voice.lock.withLock { voice.started?.prompt ?? "" }.contains("You are Theo, Bookkeeping"))
    XCTAssertEqual(states.last??.phase, .live)
    voice.emit(.tool(name: "send_task", id: "t1", parameters: ["task": "Send the reminders"]))
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertEqual(voice.lock.withLock { voice.results["t1"] }, VoiceCallText.sendTaskAccepted)
    XCTAssertEqual(voice.lock.withLock { voice.said.first }, VoiceCallText.workCameBack(["Done: Send the reminders"]))
    voice.emit(.line(fromPerson: true, text: "Thanks"))
    voice.emit(.ended)
    try await Task.sleep(nanoseconds: 200_000_000)
    XCTAssertEqual(backend.voiceRecords.last?["recap"], "Bass asked to move the review; it's done.")
    XCTAssertNil(states.last ?? nil)
  }
}

final class StateLog: @unchecked Sendable {
  private let lock = NSLock()
  private var all: [CallState?] = []
  func add(_ state: CallState?) { lock.withLock { all.append(state) } }
  var last: CallState?? { lock.withLock { all.last } }
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

  func testTheCardsButtonsReachTheHost() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(gallery: true), pace: 0.01, call: nil))
    await store.open("cards")
    await store.dismissQuestion("x2", in: "cards")
    try await Task.sleep(nanoseconds: 50_000_000)
    guard case .question(_, let card)? = store.rows(for: "cards").first(where: { $0.id == "x2" }) else { return XCTFail() }
    XCTAssertTrue(card.isDismissed)
    await store.sendDraft("x5", in: "cards", draft: ["subject": "Your refund is on its way"])
    try await Task.sleep(nanoseconds: 100_000_000)
    guard case .draft(_, let draft)? = store.rows(for: "cards").first(where: { $0.id == "x5" }) else { return XCTFail() }
    XCTAssertEqual(draft.subject, "Your refund is on its way")
    XCTAssertEqual(draft.status, "Sent")
    await store.loadApps()
    XCTAssertTrue(store.isConnected("Gmail"))
    XCTAssertFalse(store.isConnected("Linear"))
    _ = await store.connectApp(named: "Linear")
    XCTAssertTrue(store.isConnected("Linear"))
    await store.open("launch-squad")
    XCTAssertTrue(store.rows(for: "launch-squad").contains { $0.id == "unread-divider" })
  }
}

final class MarkdownTests: XCTestCase {
  func testBlocks() {
    let text = """
    # Plan
    Here is **the** list:

    - one
    - two
      - nested
    1. first
    2. second
    - [ ] todo
    - [x] done

    > quoted
    > more

    ```swift
    let a = 1
    ```

    | Name | Price |
    |:-----|------:|
    | Tea  | 3     |

    ---
    """
    let blocks = Markdown.blocks(text)
    XCTAssertEqual(blocks.first, .heading(level: 1, text: "Plan"))
    XCTAssertEqual(blocks[1], .paragraph("Here is **the** list:"))
    guard case .list(false, _, let items) = blocks[2] else { return XCTFail("\(blocks[2])") }
    XCTAssertEqual(items.count, 2)
    XCTAssertEqual(items[1].blocks.count, 2)
    guard case .list(true, 1, let numbered) = blocks[3] else { return XCTFail("\(blocks[3])") }
    XCTAssertEqual(numbered.count, 2)
    guard case .list(false, _, let tasks) = blocks[4] else { return XCTFail("\(blocks[4])") }
    XCTAssertEqual(tasks.map(\.checked), [false, true])
    XCTAssertEqual(blocks[5], .quote([.paragraph("quoted\nmore")]))
    XCTAssertEqual(blocks[6], .code(language: "swift", text: "let a = 1"))
    XCTAssertEqual(blocks[7], .table(header: ["Name", "Price"], alignments: [.leading, .trailing], rows: [["Tea", "3"]]))
    XCTAssertEqual(blocks[8], .rule)
    XCTAssertEqual(blocks.count, 9)
  }

  func testSoleFence() {
    XCTAssertEqual(Markdown.soleFence("```simeon-flights\n{\"a\":1}\n```", language: "simeon-flights"), "{\"a\":1}")
    XCTAssertNil(Markdown.soleFence("Look:\n```simeon-flights\n{}\n```", language: "simeon-flights"))
  }

  func testMentions() {
    let agents = [Mentions.AgentName(name: "Theo", id: "theo", colour: "gray"), Mentions.AgentName(name: "Bass", id: "bass", colour: "cyan")]
    let text = "Theo sent it to Google Calendar and Stripe, not @Stripe or Theodore. Bass"
    let found = Mentions.find(in: text, agents: agents, personName: "Bass")
    let names = found.map { (text as NSString).substring(with: NSRange(location: $0.location, length: $0.length)) }
    XCTAssertEqual(names, ["Theo", "Google Calendar", "Stripe"])
    guard case .brand(let calendar) = found[1].kind else { return XCTFail() }
    XCTAssertEqual(calendar.key, "google-calendar")
    guard case .agent(let id, let colour) = found[0].kind else { return XCTFail() }
    XCTAssertEqual(id, "theo"); XCTAssertEqual(colour, "gray")
  }
  // MARK: The butterfly's motion (the window's mark engine, measured 8 October 2026)

  func testMarkRingAndTurnMatchTheWindow() {
    // The window's numbers for the butterfly (`Jo.cloud.ring`, `turnAt`), read by running its own code.
    func near(_ p: Butterfly.Point, _ x: Double, _ y: Double, file: StaticString = #filePath, line: UInt = #line) {
      XCTAssertEqual(p.x, x, accuracy: 0.05, file: file, line: line); XCTAssertEqual(p.y, y, accuracy: 0.05, file: file, line: line)
    }
    XCTAssertEqual(MarkShape.ring.count, 96)
    near(MarkShape.ring[0], 189.8823, 114.2705)
    near(MarkShape.ring[24], 114.2705, 156.0613)
    near(MarkShape.ring[50], 22.2798, 102.1597)
    near(MarkShape.ring[77], 134.7351, 53.9837)
    let quarter = MarkShape.turned(.pi / 2)
    near(quarter[0], 156.1828, 114.2705)
    near(quarter[24], 114.2705, 172.0632)
    near(quarter[60], 52.5051, 52.5051)
    near(MarkShape.turned(1)[0], 162.5328, 114.2705)
    near(MarkShape.turned(.pi)[60], 32.1354, 32.1354)
  }

  func testMarkStateFromTheRoster() {
    var agent = Agent(id: "a", name: "Theo")
    XCTAssertEqual(agent.markState, .idle)
    agent.isRunning = true
    XCTAssertEqual(agent.markState, .working)
    agent.activityKind = "thinking"
    XCTAssertEqual(agent.markState, .thinking)
    agent.activityKind = "tool"; agent.activityTool = "WebSearch"
    XCTAssertEqual(agent.markState, .searching)
    agent.activityTool = "SendToAgent"
    XCTAssertEqual(agent.markState, .sending)
    agent.activityTool = "Task"
    XCTAssertEqual(agent.markState, .orbit)
    agent.activityTool = "GenerateImage"
    XCTAssertEqual(agent.markState, .loading)
    agent.activityTool = "browser_click"
    XCTAssertEqual(agent.markState, .searching)
    agent.isComposing = true
    XCTAssertEqual(agent.markState, .thinking)
    agent.awaitingUserResponse = true
    XCTAssertEqual(agent.markState, .idle)
    let parsed = Agent(json: ["id": "b", "name": "B", "isRunning": true, "currentActivity": ["kind": "tool", "tool": "WebFetch"], "awaitingUserResponse": .null])
    XCTAssertEqual(parsed?.markState, .searching)
  }

  func testMarkPoseFollowsTheState() {
    let engine = MarkEngine(random: { 0.5 })
    var frame = MarkFrame.rest
    for step in 0...240 { frame = engine.frame(at: Double(step) / 60, state: .idle, sizePoints: 52) }
    // Idle sways by about a unit and turns a fraction of a degree (turn x 0.17).
    XCTAssertLessThan(abs(frame.dx), 1.2)
    XCTAssertLessThan(abs(frame.rotation), 0.5)
    XCTAssertNil(frame.outline)
    XCTAssertTrue(engine.isSettled)
    // Working leans in (tilt 3, roll 1.5 to 4.5) and spins within its first 2.4 s.
    var spun = false
    for step in 241...600 {
      frame = engine.frame(at: Double(step) / 60, state: .working, sizePoints: 52)
      if frame.outline != nil { spun = true }
    }
    XCTAssertTrue(spun)
    XCTAssertEqual(frame.dx, 3, accuracy: 0.3)
    XCTAssertFalse(engine.isSettled)
  }

  func testMarkFoldsIntoThreeDotsWhileThinking() {
    let engine = MarkEngine(random: { 0.5 })
    var frame = MarkFrame.rest
    for step in 0...180 { frame = engine.frame(at: Double(step) / 60, state: .thinking, sizePoints: 30) }
    XCTAssertEqual(frame.outline, MarkShape.circle)
    XCTAssertEqual(frame.artOpacity, 0)
    XCTAssertEqual(frame.dots.count, 2)
    // The orb is the middle dot: about 22 units across a 114 radius.
    XCTAssertEqual(frame.scaleX, 22 / Butterfly.centre, accuracy: 0.06)
    // A 30 pt mark zooms in on its dots (1.5 / 1.131).
    XCTAssertEqual(frame.zoom, 1.5 / Butterfly.markScale, accuracy: 0.01)
    // Back to resting: the wings come back.
    for step in 181...420 { frame = engine.frame(at: Double(step) / 60, state: .idle, sizePoints: 30) }
    XCTAssertNil(frame.outline)
    XCTAssertEqual(frame.artOpacity, 1, accuracy: 0.001)
    XCTAssertTrue(frame.dots.isEmpty)
    XCTAssertTrue(engine.isSettled)
  }
}
