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
    try await backend.send("theo", text: "Hi", attachments: [], replyTo: nil)
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
      case .listenerConnect(_, let platform, let reason): return "listener:\(platform):\(reason ?? "")"
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
    XCTAssertEqual(kinds, ["me", "them", "question", "question-answered", "question-dismissed", "draft:email:Ready to send", "draft:slack:Ready to send", "flights:4", "flights:2", "connector:Linear:To read the launch tickets.", "listener:slack:so this routine can fire", "approval:Delete 3 files in ~/Downloads:pending", "secret:Stripe API key", "computer:waiting", "notice", "file:Payouts September.pdf"])
    guard case .flights(_, let flights) = rows.first(where: { if case .flights = $0 { return true }; return false })! else { return XCTFail() }
    XCTAssertEqual(flights.title, "Seattle to Los Angeles")
    XCTAssertEqual(flights.offers[3].legs.count, 2)
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

  /**
   * The founder's bug (8 October 2026): the agent answered, the list showed
   * it, the chat never did. The host streams lines only for the chat it has
   * open, and the app kept its first copy of a chat. Opening a chat now
   * opens it on the host and fetches it again; a newest line the app lacks
   * fetches it again too.
   */
  func testAPreviewReadsTheChatWithoutOpeningIt() async throws {
    let backend = QuietBackend()
    let store = AppStore()
    await store.attach(backend)
    await store.peek("theo")
    XCTAssertEqual(backend.tailed, ["theo"])
    XCTAssertEqual(backend.opened, [], "a preview must not open the chat on the host (it would be read)")
    XCTAssertEqual(store.rows(for: "theo").compactMap(Self.text), ["Hi Theo"])
    await store.peek("theo")
    XCTAssertEqual(backend.tailed, ["theo"], "read once")
    await store.open("theo")
    XCTAssertEqual(backend.opened, ["theo"])
  }

  /** What came while the chat was on screen was read: going back does not show it unread (9 October 2026). */
  func testAChatOnScreenStaysRead() async throws {
    let backend = QuietBackend()
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertEqual(backend.read, ["theo"])
    // An answer comes in while the chat is open: the host's roster says unread.
    var theo = Agent(id: "theo", name: "Theo", hasUnread: true, unreadCount: 1)
    theo.lastActivityAt = 2_000
    store.apply(.agentUpserted(theo))
    XCTAssertEqual(store.agent("theo")?.hasUnread, false, "the chat on screen is read")
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertEqual(backend.read.count, 2, "and the host is told")
    // Going back: read too, and an answer that lands after it is unread again.
    store.close("theo")
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertEqual(backend.read.count, 3)
    theo.lastActivityAt = 3_000
    store.apply(.agentUpserted(theo))
    XCTAssertEqual(store.agent("theo")?.hasUnread, true, "a chat not on screen keeps the host's word")
  }

  func testAnAnswerThatDidNotStreamStillShows() async throws {
    let backend = QuietBackend()
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertEqual(backend.opened, ["theo"])
    XCTAssertEqual(store.rows(for: "theo").compactMap(Self.text), ["Hi Theo"])

    // The answer is written on the host, and only the roster says so.
    backend.lines.append(["kind": "message", "id": "a2", "role": "assistant", "content": "Here it is.", "timestampMs": 2_000])
    var theo = Agent(id: "theo", name: "Theo")
    theo.lastMessageId = "a2"
    store.apply(.agentUpserted(theo))
    try await Task.sleep(nanoseconds: 100_000_000)
    XCTAssertEqual(store.rows(for: "theo").compactMap(Self.text), ["Hi Theo", "Here it is."])

    // Leaving and opening it again fetches it again.
    store.close("theo")
    backend.lines.append(["kind": "message", "id": "a3", "role": "assistant", "content": "And this.", "timestampMs": 3_000])
    await store.open("theo")
    XCTAssertEqual(store.rows(for: "theo").compactMap(Self.text), ["Hi Theo", "Here it is.", "And this."])
    XCTAssertEqual(backend.opened, ["theo", "theo", "theo"])
  }

  static func text(_ row: ChatRow) -> String? { if case .bubble(let b) = row { return b.text }; return nil }

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

  func testAvasChatIsQuickInTheCore() {
    // The chat that froze on the founder's iPhone (8 October 2026), as he pasted it: the core's part is a few milliseconds.
    let lines = [
      "Hi Bass, I\u{2019}m Ava. I\u{2019}ll find where customer feedback actually lives, then pull out the strongest themes with source links and flag what\u{2019}s only a one-off comment.",
      "I don\u{2019}t have Simeon customer feedback yet. The connected Gmail account is for Prime Seattle, and I found no Simeon-related messages or feedback labels there, so I won\u{2019}t treat that mail as product evidence.",
      "My avatar is now a violet customer-voice icon, distinct from the others. I\u{2019}m still waiting on the location of Simeon\u{2019}s feedback before I can give Leo or you evidence-backed themes.",
    ]
    let agents = [Mentions.AgentName(name: "Simeon", id: "simeon", colour: "blue"), Mentions.AgentName(name: "Ava", id: "ava", colour: "violet"), Mentions.AgentName(name: "Leo", id: "leo", colour: "red")]
    let start = Date()
    let found = lines.map { line in
      XCTAssertEqual(Markdown.blocks(line).count, 1)
      return Mentions.find(in: line, agents: agents, personName: "Bass Fall").map { (line as NSString).substring(with: NSRange(location: $0.location, length: $0.length)) }
    }
    XCTAssertEqual(found, [["Ava"], ["Simeon", "Gmail"], ["Simeon", "Leo"]])
    XCTAssertLessThan(Date().timeIntervalSince(start), 0.1)
  }
  // MARK: The butterfly's motion (the window's mark engine, measured 8 October 2026)

  func testTheLaunchTurnTurnsOnceAndSettles() {
    let engine = MarkEngine(random: { 0.5 })
    var now = 1_000.0
    _ = engine.frame(at: now, state: .idle, sizePoints: 64)
    engine.turnNow()
    XCTAssertTrue(engine.isTurning)
    var turned = false
    for _ in 0..<240 {
      now += 1.0 / 60
      if engine.frame(at: now, state: .idle, sizePoints: 64).outline != nil { turned = true }
    }
    XCTAssertTrue(turned, "the outline turns while it spins")
    XCTAssertFalse(engine.isTurning, "one turn, then still")
  }

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
  func testAReplyQuotesWhatItAnswers() {
    let now = 1_760_000_000_000.0
    let entries: [Entry] = [
      ["kind": "message", "id": "a1", "role": "assistant", "content": "Thursday is on track:\n12 of 15   tickets are done.", "timestampMs": .number(now - 60_000)],
      ["kind": "message", "id": "u1", "role": "user", "content": "Which three are left?", "replyTo": "a1", "timestampMs": .number(now)],
      ["kind": "message", "id": "u2", "role": "user", "content": "And this?", "replyTo": "gone", "timestampMs": .number(now + 1000)],
    ].compactMap(Entry.init)
    let bubbles = Chat.rows(entries).compactMap { row -> Bubble? in if case .bubble(let b) = row { return b }; return nil }
    XCTAssertEqual(bubbles.count, 3)
    XCTAssertNil(bubbles[0].quote)
    XCTAssertEqual(bubbles[1].replyTo, "a1")
    XCTAssertEqual(bubbles[1].quote, "Thursday is on track: 12 of 15 tickets are done.")
    XCTAssertEqual(bubbles[1].timestampMs, now)
    XCTAssertEqual(bubbles[2].quote, "(deleted)")
    XCTAssertEqual(Chat.quoteLine(entries[0], limit: 10), "Thursday i…")
  }
  /** The row menu's commands, as the Mac's sidebar sends them: pins shared through the host's settings, read, hide, duplicate, delete. */
  @MainActor
  func testTheListDoesWhatTheMacsMenuDoes() async throws {
    let store = AppStore()
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    await store.attach(backend)
    XCTAssertTrue(store.pinned.isEmpty)
    let all = store.listed.count

    await store.setPinned("theo", true)
    await store.setPinned("iris", true)
    XCTAssertEqual(store.pinned.map(\.id), ["theo", "iris"])
    XCTAssertFalse(store.listed.contains { $0.id == "theo" })
    XCTAssertEqual(store.listed.count, all - 2)
    let settings = try await backend.command("getHostSettings", [:])
    XCTAssertEqual(settings["pinnedAgentIds"]?.array?.compactMap(\.text), ["theo", "iris"])
    try await settle()
    await store.movePin("iris", to: 0)
    try await settle()
    XCTAssertEqual(store.pinned.map(\.id), ["iris", "theo"])
    await store.setPinned("theo", false)
    XCTAssertEqual(store.pinned.map(\.id), ["iris"])

    await store.setUnread("scout", true)
    try await settle()
    XCTAssertTrue(store.agent("scout")?.hasUnread ?? false)
    await store.setUnread("scout", false)
    try await settle()
    XCTAssertFalse(store.agent("scout")?.hasUnread ?? true)

    await store.setHidden("scout", true)
    try await settle()
    XCTAssertEqual(store.hiddenAgents.map(\.id), ["scout"])
    XCTAssertFalse(store.listed.contains { $0.id == "scout" })
    XCTAssertNotNil(store.agent("scout"), "a hidden agent stays in the roster: groups and mentions still need it")
    await store.setHidden("scout", false)
    try await settle()
    XCTAssertTrue(store.hiddenAgents.isEmpty)

    let copy = await store.duplicate("theo")
    XCTAssertNotNil(copy)
    try await settle()
    XCTAssertEqual(store.agent(copy)?.name, "Theo copy")

    let deleted = await store.delete(["iris"])
    XCTAssertTrue(deleted)
    XCTAssertNil(store.agent("iris"))
    XCTAssertTrue(store.pinned.isEmpty, "a deleted agent leaves the pins")
  }

  /** The demo answers a command, then sends its event, as the host does: give the event its turn. */
  private func settle() async throws { try await Task.sleep(nanoseconds: 60_000_000) }

  func testALongMessageIsCutForDrawing() {
    let short = Chat.clipped("Hello", limit: 3_000)
    XCTAssertEqual(short.text, "Hello"); XCTAssertFalse(short.clipped)
    let lines = (1...400).map { "Line \($0) of the report." }.joined(separator: "\n")
    let cut = Chat.clipped(lines, limit: 3_000)
    XCTAssertTrue(cut.clipped)
    XCTAssertLessThanOrEqual(cut.text.count, 3_001)
    XCTAssertTrue(cut.text.hasSuffix("of the report."), "cut at a line break near the limit")
    let blob = String(repeating: "A", count: 2_000_000)
    XCTAssertEqual(Chat.clipped(blob, limit: 3_000).text.count, 3_001)
    let code = Chat.clippedCode((1...500).map { _ in String(repeating: "x", count: 5_000) }.joined(separator: "\n"), lines: 200, width: 1_000)
    XCTAssertTrue(code.clipped)
    XCTAssertEqual(code.text.split(separator: "\n").count, 200)
    XCTAssertEqual(code.text.split(separator: "\n").first?.count, 1_001)
  }

  func testARepeatedLineIsDrawnOnce() {
    let line: JSON = ["kind": "message", "id": "m1", "role": "assistant", "content": "Hello", "timestampMs": 1_000]
    let rows = Chat.rows([line, line].compactMap(Entry.init))
    XCTAssertEqual(rows.filter { $0.id == "m1" }.count, 1, "two rows with one id can stall a lazy list")
  }

  func testTheComposerOffersNamesAfterAnAt() {
    XCTAssertEqual(Mentions.query("Ask @"), "")
    XCTAssertEqual(Mentions.query("Ask @Th"), "Th")
    XCTAssertEqual(Mentions.query("@Iris"), "Iris")
    XCTAssertNil(Mentions.query("mail me at bass@simeonlabs"), "an address is not a mention")
    XCTAssertNil(Mentions.query("Ask @Theo now"))
    XCTAssertEqual(Mentions.inserting("Theo", into: "Ask @Th"), "Ask @Theo ")
  }

  func testTheListLineIsTheMacs() {
    XCTAssertEqual(Preview.plain("See [the doc](https://simeonlabs.com/doc) and **Stripe**: `refund` done.\n\n- one\n- two"), "See the doc and Stripe: refund done. one two")
    XCTAssertEqual(Preview.plain("## Heading\n> quoted ~~old~~ _new_"), "Heading quoted old new")
    XCTAssertEqual(Preview.line(["kind": "link", "url": "https://x.com"]), "Sent a link · https://x.com")
    XCTAssertEqual(Preview.line(["kind": "attachment", "count": 2, "kinds": ["image": 2]]), "Sent 2 images")
    XCTAssertEqual(Preview.line(["kind": "attachment", "count": 3, "kinds": ["image": 2, "pdf": 1]]), "Sent 3 files · 2 images, 1 PDF")
    var agent = Agent(id: "a", name: "A", lastMessagePreview: "Here is [the link](https://x.com)")
    XCTAssertEqual(agent.previewLine, "Here is the link")
    agent.awaitingUserResponse = true; agent.waitingReason = "Approve the refund"
    XCTAssertEqual(agent.previewLine, "Waiting for you: Approve the refund")
  }
}

/** A host that answers without streaming anything: only fetches show what it holds. */
final class QuietBackend: AgentBackend, @unchecked Sendable {
  var lines: [JSON] = [["kind": "message", "id": "u1", "role": "user", "content": "Hi Theo", "timestampMs": 1_000]]
  var opened: [String] = []
  var tailed: [String] = []
  func tail(_ agentId: String, limit: Int) async throws -> [Entry] { tailed.append(agentId); return Array(lines.compactMap(Entry.init).suffix(limit)) }
  func listAgents() async throws -> [Agent] { [Agent(id: "theo", name: "Theo")] }
  func transcript(_ agentId: String) async throws -> [Entry] { opened.append(agentId); return lines.compactMap(Entry.init) }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], replyTo: String?, nonce: String?) async throws {}
  var read: [String] = []
  func markRead(_ agentId: String) async { read.append(agentId) }
  func createAgent(name: String, colour: String) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { _ in } }
  var call: CallEngine? { nil }
  func command(_ method: String, _ args: JSON) async throws -> JSON { [:] }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}

/** The chat's Mac behaviours: a message shows at once and says when it failed; older lines load on scrolling up; a streamed answer redraws only itself. */
@MainActor
final class ChatDeliveryTests: XCTestCase {
  func testASentMessageShowsAtOnceAndSaysWhenItFailed() async throws {
    let backend = ScriptedBackend()
    backend.failSends = true
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    await store.send("Book the flight", to: "theo")
    let rows = store.rows(for: "theo")
    guard case .bubble(let mine)? = rows.dropLast().last, case .failedSend(_, let nonce)? = rows.last else { return XCTFail("\(rows.map(\.id))") }
    XCTAssertEqual(mine.text, "Book the flight")
    XCTAssertTrue(mine.fromPerson)
    XCTAssertEqual(nonce, mine.id)

    // Resend: it goes, and the host's copy takes its place.
    backend.failSends = false
    await store.resend(nonce, in: "theo")
    XCTAssertFalse(store.rows(for: "theo").contains { if case .failedSend = $0 { return true }; return false })
    backend.push(.transcript(.upsert(agentId: "theo", entry: Entry(["kind": "message", "id": "u2", "role": "user", "content": "Book the flight", "timestampMs": 2_000])!)))
    try await Task.sleep(nanoseconds: 50_000_000)
    let ids = store.rows(for: "theo").compactMap { row -> String? in if case .bubble(let b) = row { return b.id }; return nil }
    XCTAssertEqual(ids, ["u1", "u2"], "the waiting copy left when the host's arrived")
    XCTAssertFalse(store.arrived.contains("u2"), "the host's copy replaces the waiting one in place, without coming in again")

    // The host's copy is known by the nonce it was sent with, even when the host wrote its text differently.
    await store.send("Thanks", to: "theo")
    guard case .bubble(let waiting)? = store.rows(for: "theo").last else { return XCTFail() }
    XCTAssertTrue(waiting.id.hasPrefix("ios-"))
    backend.push(.transcript(.upsert(agentId: "theo", entry: Entry(["kind": "message", "id": "u3", "role": "user", "content": "Thanks!", "clientNonce": .string(waiting.id), "timestampMs": 3_000])!)))
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertEqual(store.rows(for: "theo").compactMap { row -> String? in if case .bubble(let b) = row { return b.id }; return nil }, ["u1", "u2", "u3"])

    // Delete on a failed one: it only leaves the screen.
    backend.failSends = true
    await store.send("Second try", to: "theo")
    guard case .failedSend(_, let second)? = store.rows(for: "theo").last else { return XCTFail() }
    store.discardFailed(second, in: "theo")
    XCTAssertFalse(store.rows(for: "theo").contains { $0.id == second })
  }

  func testOlderLinesLoadWhenScrolledUp() async throws {
    let backend = ScriptedBackend()
    backend.lines = (1...650).map { ["kind": "message", "id": .string("m\($0)"), "role": $0 % 2 == 0 ? "user" : "assistant", "content": .string("Line \($0)"), "timestampMs": .number(Double($0) * 1_000)] }
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertEqual(store.transcripts["theo"]?.count, 500)
    XCTAssertEqual(store.olderBefore["theo"], 150)
    await store.loadOlder("theo")
    XCTAssertEqual(store.transcripts["theo"]?.count, 600)
    XCTAssertEqual(store.transcripts["theo"]?.first?.id, "m51")
    await store.loadOlder("theo")
    XCTAssertEqual(store.transcripts["theo"]?.first?.id, "m1")
    XCTAssertNil(store.olderBefore["theo"])
    // A fetch of the newest lines keeps what was scrolled in.
    await store.refresh("theo")
    XCTAssertEqual(store.transcripts["theo"]?.count, 650)
  }

  func testAStreamedAnswerChangesOnlyItsRowAndMatchesAFullLayout() async throws {
    let backend = ScriptedBackend()
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    func answer(_ text: String, streaming: Bool) -> Entry { Entry(["kind": "message", "id": "a1", "role": "assistant", "content": .string(text), "isStreaming": .bool(streaming), "timestampMs": 3_000])! }
    backend.push(.transcript(.upsert(agentId: "theo", entry: answer("The", streaming: true))))
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertTrue(store.arrived.contains("a1"), "a line that arrives on screen comes in with the motion")
    for text in ["The flight", "The flight is", "The flight is booked."] {
      backend.push(.transcript(.upsert(agentId: "theo", entry: answer(text, streaming: true))))
    }
    try await Task.sleep(nanoseconds: 150_000_000)
    guard case .bubble(let last)? = store.rows(for: "theo").last else { return XCTFail() }
    XCTAssertEqual(last.text, "The flight is booked.")
    XCTAssertEqual(store.rows(for: "theo"), Chat.rows(store.transcripts["theo"] ?? []), "the quick path draws what a full layout draws")
  }
}

/** A host with one agent, Theo: pages its lines by `seq` (the index), fails sends on demand, and streams what a test pushes. */
final class ScriptedBackend: AgentBackend, @unchecked Sendable {
  var lines: [JSON] = [["kind": "message", "id": "u1", "role": "user", "content": "Hi Theo", "timestampMs": 1_000]]
  var failSends = false
  private var continuation: AsyncStream<BackendEvent>.Continuation?
  func push(_ event: BackendEvent) { continuation?.yield(event) }
  func listAgents() async throws -> [Agent] { [Agent(id: "theo", name: "Theo")] }
  func transcript(_ agentId: String) async throws -> [Entry] { try await transcriptPage(agentId, before: nil).entries }
  func transcriptPage(_ agentId: String, before: Int?) async throws -> TranscriptPage {
    let end = before ?? lines.count
    let size = before == nil ? 500 : 100
    let start = max(0, end - size)
    return TranscriptPage(entries: lines[start..<end].compactMap(Entry.init), olderBefore: start > 0 ? start : nil)
  }
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], replyTo: String?, nonce: String?) async throws {
    if failSends { throw GatewayError(message: "offline", refused: false) }
  }
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, colour: String) async throws -> String { "x" }
  func createGroup(name: String, memberIds: [String]) async throws -> String { "g" }
  func answer(_ agentId: String, entryId: String, value: String) async throws {}
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {}
  func routines(_ agentId: String) async throws -> [JSON] { [] }
  func events() -> AsyncStream<BackendEvent> { AsyncStream { self.continuation = $0 } }
  var call: CallEngine? { nil }
  func command(_ method: String, _ args: JSON) async throws -> JSON { [:] }
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON { [:] }
  func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "starting") }
}

/** The first run, the Mac's (Onboarding.swift): the gate, the hand-off, the scene's arithmetic. */
@MainActor
final class OnboardingTests: XCTestCase {
  func testOnlyANewAccountGetsTheFirstRun() async throws {
    let fresh = AppStore()
    await fresh.attach(DemoBackend(seed: .empty, pace: 0.01, call: nil))
    let first = await fresh.firstRun()
    XCTAssertEqual(first, .needed)

    let known = AppStore()
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    await known.attach(backend)
    let second = await known.firstRun()
    XCTAssertEqual(second, .seen, "an account with agents has been onboarded")
    let settings = try await backend.command("getHostSettings", [:])
    XCTAssertEqual(settings["hasSeenOnboarding"]?.bool, true, "and the host is told, as the Mac tells it")
  }

  func testTheHandOffMakesSimeonOnce() async throws {
    let backend = DemoBackend(seed: .empty, pace: 0.01, call: nil)
    let store = AppStore()
    await store.attach(backend)
    var waited = 0.0
    var readyCalls = 0
    let id = try await store.handOff(ready: { readyCalls += 1 }, wait: { waited += $0 })
    XCTAssertNotNil(id)
    XCTAssertEqual(readyCalls, 1)
    XCTAssertGreaterThan(waited, 1.4, "the line shows a second and a half at the least")
    let simeon = try XCTUnwrap(store.agent(id))
    XCTAssertEqual(simeon.name, "Simeon")
    XCTAssertEqual(simeon.title, "Chief of Staff")
    XCTAssertEqual(simeon.colour, "blue")
    let settings = try await backend.command("getHostSettings", [:])
    XCTAssertEqual(settings["hasSeenOnboarding"]?.bool, true)
    let again = await store.firstRun()
    XCTAssertEqual(again, .seen)

    // Another phone, or a second try on this one, on an account already onboarded: nothing more is made.
    let other = AppStore()
    await other.attach(backend)
    let second = try await other.handOff(ready: {}, wait: { _ in })
    XCTAssertNil(second)
    XCTAssertEqual(store.agents.count, 1)
    let count = try await backend.command("countAgents", [:])
    XCTAssertEqual(count.int, 1)
  }

  func testTheNameIsSavedAsTheMacSavesIt() {
    XCTAssertEqual(Onboarding.normalizedName("  Bass \n  Fall "), "Bass Fall")
    XCTAssertEqual(Onboarding.normalizedName(String(repeating: "a", count: 80)).count, 60)
    XCTAssertEqual(Onboarding.normalizedName("   "), "")
  }

  func testTheStepsInTheMacsOrder() {
    XCTAssertEqual(OnboardingStep.allCases.map(\.title).filter { !$0.isEmpty }, [
      "Meet Simeon", "Simeon is your personal Chief of Staff", "Your agents connect to the apps you already use",
      "They have their own computer and work just like you", "How should Simeon & Co call you?",
    ])
    XCTAssertFalse(OnboardingStep.meet.hasBack)
    XCTAssertEqual(OnboardingStep.chiefOfStaff.previous, .meet)
    XCTAssertEqual(OnboardingStep.name.next, .handOff)
    XCTAssertEqual(Onboarding.handOffLine(ready: false), "Setting up your Simeon…")
    XCTAssertEqual(Onboarding.handOffLine(ready: true), "Getting your team ready…")
  }

  func testTheScenesFitAPhone() {
    // The Chief of Staff's agents: 300 pt out on a Mac, 50 pt from a 393 pt phone's edge, never nearer Simeon than 104.
    XCTAssertEqual(Onboarding.crew(width: 1280).map(\.x), [-300, -300, -300, 300, 300, 300])
    XCTAssertEqual(Onboarding.crew(width: 393)[0].x, -146.5)
    XCTAssertEqual(Onboarding.crew(width: 180)[3].x, 104)
    let curve = Onboarding.curve(to: Onboarding.crew[0])
    XCTAssertEqual(curve.start.x, -60); XCTAssertEqual(curve.end.x, -260); XCTAssertEqual(curve.end.y, -100); XCTAssertEqual(curve.control1.x, -160)
    // The apps: the one behind the glass swells 1.6 times; the row moves one place each 1.6 s.
    let resting = Onboarding.orb(0, count: 12, elapsed: 0, width: 393)
    XCTAssertEqual(resting.x, 0); XCTAssertEqual(resting.size, 120, accuracy: 0.001); XCTAssertEqual(resting.opacity, 1)
    let moved = Onboarding.orb(1, count: 12, elapsed: 1.6, width: 393)
    XCTAssertEqual(moved.x, 0, accuracy: 0.001)
    let far = Onboarding.orb(2, count: 12, elapsed: 0, width: 393)
    XCTAssertEqual(far.x, 315, accuracy: 0.001); XCTAssertEqual(far.opacity, 0.297, accuracy: 0.01)
    // The computer: as wide as the phone less 16 pt a side, never past 1.45.
    XCTAssertEqual(Onboarding.screenScale(width: 393), 361.0 / 441, accuracy: 0.0001)
    XCTAssertEqual(Onboarding.screenScale(width: 1280), 1.45)
    let place = Onboarding.cursorPlace(beat: 0, width: 1280)
    XCTAssertEqual(place.x, -78.3 * 1.45 + 59.8 * 0.66, accuracy: 0.001)
    XCTAssertEqual(Onboarding.computerFrame(-1).y, 30)
    XCTAssertEqual(Onboarding.computerFrame(99).pressed, "b-button")
    XCTAssertEqual(Onboarding.nameSeats(width: 393).map(\.x), [-152.5, 0, 152.5])
  }
}

/** The spin's light trails (LightTrails.swift, the window's `E_t`). */
final class LightTrailsTests: XCTestCase {
  func run(_ state: MarkState, seconds: Double, turn: Bool, trails: LightTrails, engine: MarkEngine, from start: Double = 1000) -> (most: Int, end: Double) {
    var now = start, most = 0
    _ = engine.frame(at: now, state: state, sizePoints: 28)
    if turn { engine.turnNow() }
    for _ in 0..<Int(seconds * 60) {
      now += 1.0 / 60
      let frame = engine.frame(at: now, state: state, sizePoints: 28)
      trails.update(nowMs: now * 1000, spinAngle: frame.spinAngle, sizeScale: LightTrails.sizeScale(points: 28), sustain: frame.whirling, palette: .named("blue"))
      most = max(most, trails.drawn.count)
    }
    return (most, now)
  }

  func testATurnThrowsTrailsThatDrawInAfterIt() {
    var seed: UInt64 = 7
    let random = { () -> Double in seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Double(seed >> 11) / Double(1 << 53) }
    let engine = MarkEngine(random: random), trails = LightTrails(random: random)
    let turn = run(.idle, seconds: 2, turn: true, trails: trails, engine: engine)
    XCTAssertGreaterThanOrEqual(turn.most, 3, "three to five ribbons")
    XCTAssertLessThanOrEqual(turn.most, 5)
    let after = run(.idle, seconds: 3, turn: false, trails: trails, engine: engine, from: turn.end)
    XCTAssertFalse(trails.hasLife, "they draw in and go once the turn is over")
    XCTAssertEqual(after.most <= 5, true)
  }

  func testTheWhirlKeepsThrowingThem() {
    let engine = MarkEngine(random: { 0.5 }), trails = LightTrails(random: { 0.5 })
    let early = run(.loading, seconds: 3, turn: false, trails: trails, engine: engine)
    XCTAssertGreaterThan(early.most, 0)
    _ = run(.loading, seconds: 9, turn: false, trails: trails, engine: engine, from: early.end)
    XCTAssertTrue(trails.hasLife, "a new set once the last has drawn in")
  }

  func testATrailRunsBetweenTwoStopsOfThePalette() {
    let ocean = AgentPalette.named("blue")
    let inks = [ocean.top, ocean.mid, ocean.bottom].map(TrailColour.init)
    for ink in inks {
      XCTAssertLessThanOrEqual(ink.saturation, 88)
      XCTAssertGreaterThanOrEqual(ink.lightness, 52); XCTAssertLessThanOrEqual(ink.lightness, 74)
    }
    let back = TrailColour(hue: 210, saturation: 60, lightness: 50).rgb
    XCTAssertEqual(back.r, 0.2, accuracy: 0.01); XCTAssertEqual(back.g, 0.5, accuracy: 0.01); XCTAssertEqual(back.b, 0.8, accuracy: 0.01)
  }
}

/** The words beside a working butterfly (Activity.swift, the window's `dse`). */
final class ActivityLineTests: XCTestCase {
  func testTheMacsWords() {
    XCTAssertEqual(ActivityLine.of(kind: "thinking", tool: nil, detail: nil).text, "Thinking")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "Shell", detail: nil).text, "Running commands")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "Shell", detail: "notes.md").text, "Drafting the file")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "ExternalShell", detail: nil).text, "On your computer")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "WebSearch", detail: "flights").text, "Searching the web")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "WebFetch", detail: nil).text, "Reading the web")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "GenerateImage", detail: nil).text, "Generating a photo")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "SendToAgent", detail: nil, target: "iris", targetName: "Iris").text, "Messaging Iris")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "SendToAgent", detail: nil, target: "iris", targetName: "Iris").icon, .agent("iris"))
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "SendToAgent", detail: nil).text, "Messaging another assistant")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "CallMcpTool", detail: "linear").text, "Connecting to Linear")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "CallMcpTool", detail: nil).text, "Connecting to a third party app")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "browser_click", detail: nil).text, "Browsing the web")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "CheckSubagent", detail: nil).text, "Waiting on another agent")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "Mystery", detail: nil).text, "Working")
    XCTAssertEqual(ActivityLine.of(kind: nil, tool: nil, detail: nil).text, "Working")
    // The label comes in again only when the verb or the picture changes.
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "Shell", detail: nil).key, ActivityLine.of(kind: "tool", tool: "BoxShell", detail: nil).key)
  }

  func testTheAgentsLine() {
    var agent = Agent(id: "theo", name: "Theo", isRunningTurn: true)
    agent.activityKind = "tool"; agent.activityTool = "Shell"
    XCTAssertEqual(agent.activityLine()?.text, "Running commands")
    agent.isComposing = true
    XCTAssertEqual(agent.activityLine()?.text, "Typing…")
    agent.isComposing = false; agent.awaitingUserResponse = true
    XCTAssertNil(agent.activityLine(), "waiting on you is not working")
    let json: JSON = ["id": "scout", "name": "Scout", "isRunning": true, "currentActivity": ["kind": "tool", "tool": "SendToAgent", "target": "iris"]]
    let parsed = try! XCTUnwrap(Agent(json: json))
    XCTAssertEqual(parsed.activityLine(named: { $0 == "iris" ? "Iris" : nil })?.text, "Messaging Iris")
  }

  func testTheTimeItHasBeenAtIt() {
    XCTAssertNil(ActivityLine.elapsed(59))
    XCTAssertEqual(ActivityLine.elapsed(61), "1m")
    XCTAssertEqual(ActivityLine.elapsed(3 * 60 + 20), "3m")
    XCTAssertEqual(ActivityLine.elapsed(3600), "1h")
    XCTAssertEqual(ActivityLine.elapsed(3900), "1h 5m")
    XCTAssertEqual(ActivityLine.of(kind: "tool", tool: "Task", detail: String(repeating: "x", count: 90)).text.count <= 60, true)
  }
}

/** Search as the Mac's (Search.swift). */
@MainActor
final class SearchTests: XCTestCase {
  func testTheMacsMatching() {
    // Every word in order, near together; accents and case do not count.
    XCTAssertNotNil(Search.match("lnch", label: "Monday launch check"))
    XCTAssertNotNil(Search.match("cafe", label: "Café plans"))
    XCTAssertEqual(Search.match("cafe", label: "Café plans")?.hits, [0, 1, 2, 3])
    XCTAssertNil(Search.match("theo xyz", label: "Theo"), "every word must be found")
    XCTAssertNil(Search.match("tc", label: "t" + String(repeating: "x", count: 20) + "c"), "too far apart")
    // A word's start scores more than its middle, so "Theo" ranks over "Kathe" for "th".
    XCTAssertGreaterThan(Search.match("th", label: "Theo")!.score, Search.match("th", label: "Kathe")!.score)
    // The title is a keyword: found, but not drawn bold.
    let byTitle = Search.match("bookkeeping", label: "Theo", keywords: ["Bookkeeping"])
    XCTAssertNotNil(byTitle); XCTAssertEqual(byTitle?.hits, [])
    XCTAssertEqual(Search.match("", label: "Theo")?.score, 0)
  }

  func testTheWords() {
    let now = Date(timeIntervalSince1970: 1_000_000)
    let ms = { (seconds: Double) in (1_000_000 - seconds) * 1000 }
    XCTAssertEqual(Search.ago(ms(20), now: now), "now")
    XCTAssertEqual(Search.ago(ms(5 * 60), now: now), "5m ago")
    XCTAssertEqual(Search.ago(ms(3 * 3600), now: now), "3h ago")
    XCTAssertEqual(Search.ago(ms(2 * 86_400), now: now), "2d ago")
    XCTAssertEqual(Search.ago(ms(70 * 86_400), now: now), "2mo ago")
    XCTAssertEqual(Search.ago(ms(400 * 86_400), now: now), "1y ago")
    let mine = MessageHit(["agentId": "theo", "entryId": "e1", "role": "user", "snippet": "the runway", "timestampMs": .number(ms(300))])!
    let theirs = MessageHit(["agentId": "theo", "entryId": "e2", "role": "assistant", "snippet": "the runway", "timestampMs": .number(ms(300))])!
    let theo = Agent(id: "theo", name: "Theo"), squad = Agent(id: "squad", name: "Launch", isGroup: true)
    XCTAssertEqual(Search.messageLine(mine, chat: theo, now: now), "You to Theo · 5m ago")
    XCTAssertEqual(Search.messageLine(theirs, chat: theo, now: now), "Theo to you · 5m ago")
    XCTAssertEqual(Search.messageLine(mine, chat: squad, now: now), "You in Launch · 5m ago")
    XCTAssertEqual(Search.messageLine(theirs, chat: squad, now: now), "In Launch · 5m ago")
    let picture = FileHit(["agentId": "theo", "entryId": "e3", "fileName": "a.png", "kind": "image", "width": 1280, "height": 800, "timestampMs": .number(ms(300))])!
    XCTAssertEqual(Search.fileLine(picture, chat: theo, now: now), "Theo · 1280×800 · 5m ago")
    XCTAssertEqual(SearchTab.allCases.map(\.title), ["All", "Messages", "Agents", "Groups", "Files", "Links", "Routines", "Actions"])
  }

  func testTheLinksInAChat() {
    let entries = [
      Entry(["kind": "message", "id": "1", "role": "assistant", "content": "See [the plan](https://example.com/plan) and [again](https://example.com/plan)", "timestampMs": 1])!,
      Entry(["kind": "message", "id": "2", "role": "user", "content": "https://www.apple.com/", "timestampMs": 2])!,
      Entry(["kind": "send-message", "id": "3", "message": ["type": "attachment", "url": "https://files.example.com/deck.pdf"], "timestampMs": 3])!,
      Entry(["kind": "message", "id": "4", "role": "assistant", "content": "[inside](sand://agent/theo) and file:///x", "timestampMs": 4])!,
    ]
    let links = Search.links(entries, agentId: "theo")
    XCTAssertEqual(links.map(\.url), ["https://files.example.com/deck.pdf", "https://www.apple.com/", "https://example.com/plan"], "newest first, each once, only the web's")
    XCTAssertEqual(links[1].title, "apple.com")
    XCTAssertEqual(links[2].title, "the plan")
    XCTAssertEqual(links[2].shortAddress, "example.com/plan")
  }

  func testTheHostsAnswers() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil))
    let enabled = await store.globalSearchEnabled()
    XCTAssertTrue(enabled)
    let messages = try await store.searchMessages("launch")
    XCTAssertFalse(messages.isEmpty)
    XCTAssertTrue(messages.allSatisfy { !$0.snippet.isEmpty })
    let routines = await store.allRoutines()
    XCTAssertEqual(routines.map(\.routine.name), ["Monday launch check"])
    XCTAssertEqual(routines.first?.agentId, "simeon")
  }

  func testAFoundLineFarBackIsLoaded() async throws {
    let backend = ScriptedBackend()
    backend.lines = (0..<1200).map { ["kind": "message", "id": .string("m\($0)"), "role": "assistant", "content": .string("Line \($0)"), "timestampMs": .number(Double($0) * 1000)] }
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertNil(store.transcripts["theo"]?.first { $0.id == "m100" }, "not among the newest 500")
    let found = await store.loadUntil("m100", in: "theo")
    XCTAssertTrue(found)
    let rows = store.rows(for: "theo")
    XCTAssertEqual(Chat.rowId(for: "m100", in: rows), "m100")
  }
}

/** What the person reads before an app's sign-in (ConnectConsent.swift). */
final class ConnectConsentTests: XCTestCase {
  func testEachAppFillsTheTemplate() {
    let stripe = CatalogApp(id: "stripe", name: "stripe", title: "Stripe", summary: "Customers, payments, subscriptions, and invoices.", serverURL: "https://mcp.stripe.com")
    let consent = ConnectConsent(app: stripe, name: "Stripe")
    XCTAssertEqual(consent.title, "Stripe")
    XCTAssertEqual(consent.points.map(\.title), ["Put Stripe to work", "You stay in charge", "Check their work"])
    XCTAssertEqual(consent.points[0].body, "Your agents can read and use customers, payments, subscriptions and invoices in Stripe.")
    XCTAssertEqual(consent.route, .vendor(host: "mcp.stripe.com"))
    XCTAssertTrue(consent.smallPrint[0].contains("Stripe's own page"))
    XCTAssertFalse(consent.smallPrint.joined().contains("Composio"), "only the apps Composio serves name it")
    XCTAssertEqual(consent.note, "Anything that moves money in Stripe is real. Ask your agents to check with you before they move any.")
  }

  func testComposioIsNamedForTheAppsItServes() {
    let gmail = CatalogApp(id: "gmail", name: "gmail", title: "Gmail", summary: "Search, read, draft, and manage email.", serverURL: "https://api.simeonlabs.com/desktop/api/apps/mcp/gmail")
    let consent = ConnectConsent(app: gmail, name: "Gmail")
    XCTAssertEqual(consent.route, .composio)
    XCTAssertTrue(consent.smallPrint[0].hasPrefix("Composio, the service Simeon uses to connect apps"))
    XCTAssertEqual(consent.note, "Emails your agents send go out from your own address.")
    let byToolkit = CatalogApp(id: "notion", name: "notion", title: "Notion", summary: "", composioToolkit: "notion")
    XCTAssertEqual(ConnectConsent(app: byToolkit, name: "Notion").route, .composio)
  }

  func testTheExtraLayerAndTheUnknown() {
    let shopify = ConnectConsent(app: CatalogApp(id: "shopify", name: "shopify", title: "Shopify", summary: "Orders, products, customers, and your store."), name: "Shopify")
    XCTAssertTrue(shopify.note?.contains("live store") == true)
    let mercury = ConnectConsent(app: CatalogApp(id: "mercury", name: "mercury", title: "Mercury", summary: ""), name: "Mercury")
    XCTAssertEqual(mercury.points[0].body, "Your agents can read your accounts, balances and transactions in Mercury.")
    let linkedin = ConnectConsent(app: CatalogApp(id: "linkedin", name: "linkedin", title: "LinkedIn", summary: ""), name: "LinkedIn")
    XCTAssertEqual(linkedin.points[0].body, "Your agents can read your profile and publish posts on LinkedIn.")
    let unknown = ConnectConsent(app: nil, name: "Acme CRM")
    XCTAssertEqual(unknown.route, .unknown)
    XCTAssertEqual(unknown.points[0].body, "Your agents can read and use what's in your Acme CRM account.")
    XCTAssertNil(unknown.note)
    for consent in [shopify, mercury, linkedin, unknown] {
      XCTAssertFalse((consent.points.map(\.body) + consent.smallPrint).joined().contains("Muse"))
    }
  }
}

final class FlightCardTests: XCTestCase {
  private func gallery() -> [FlightsCard] {
    Chat.rows(DemoData.seed(now: 1_760_000_000_000, gallery: true).transcripts["cards"]!).compactMap { row in
      if case .flights(_, let card) = row { return card }
      return nil
    }
  }

  func testTheTextFitsTheRow() {
    XCTAssertEqual(FlightText.clock("2:30 PM"), "2:30pm")
    XCTAssertEqual(FlightText.clock("12:18 PM"), "12:18pm")
    XCTAssertEqual(FlightText.clock("6:40 AM +1"), "6:40am+1")
    XCTAssertEqual(FlightText.clock("6:40 AM +1", days: false), "6:40am")
    XCTAssertEqual(FlightText.clock("14:30"), "14:30")
    XCTAssertEqual(FlightText.clock(""), "")
    XCTAssertEqual(FlightText.minutes("2h 40m"), 160)
    XCTAssertEqual(FlightText.minutes("2h40m"), 160)
    XCTAssertEqual(FlightText.minutes("3h"), 180)
    XCTAssertEqual(FlightText.minutes("45m"), 45)
    XCTAssertNil(FlightText.minutes(""))
    XCTAssertNil(FlightText.minutes("layover length not stated"))
    XCTAssertEqual(FlightText.span("6h 05m"), "6h05m")
    XCTAssertEqual(FlightText.span("2h 40m"), "2h40m")
    XCTAssertEqual(FlightText.span("26h"), "26h")
    XCTAssertEqual(FlightText.stopCount("Nonstop"), "")
    XCTAssertEqual(FlightText.stopCount("1 stop · PHX 1h 38m"), "1 stop")
    XCTAssertEqual(FlightText.stops("2 stops · PHX 1h 38m, DEN 50m"), "2 stops")
  }

  func testTheCardReadsAsMuseLaysItOut() {
    let cards = gallery()
    XCTAssertEqual(cards.count, 2)
    let oneWay = cards[0], roundTrip = cards[1]
    XCTAssertEqual(oneWay.heading, "Seattle to Los Angeles — Sat, Oct 10")
    XCTAssertEqual(oneWay.aside, "")
    XCTAssertFalse(oneWay.isTest)
    XCTAssertEqual(oneWay.offers[0].outbound, FlightTimes(depart: "2:30pm", label: "2h40m", arrive: "5:10pm"))
    XCTAssertEqual(oneWay.offers[3].outbound, FlightTimes(depart: "11:40am", label: "4h35m · 1 stop", arrive: "4:15pm"))
    XCTAssertNil(oneWay.offers[0].inbound)
    XCTAssertEqual(oneWay.offers[0].shape, "Nonstop · 2h40m")
    XCTAssertEqual(oneWay.offers[0].ways.count, 1)
    XCTAssertEqual(oneWay.offers[0].ways[0].title, "")
    XCTAssertEqual(oneWay.offers[0].terms, ["No refund if you cancel", "Changes for a $99.00 fee", "1 carry-on"])
    XCTAssertEqual(oneWay.offers[3].terms, ["Refund minus $25.00 if you cancel", "Free changes", "2 checked bags"])
    XCTAssertEqual(oneWay.offers[2].terms, ["No refund if you cancel", "Change rules not stated", "No bags included"])
    let leg = oneWay.offers[0].legs[0]
    XCTAssertEqual(leg.departing, "Sat, Oct 10 at 2:30pm")
    XCTAssertEqual(leg.flightLines, ["DL 2830 · Delta Air Lines"])
    XCTAssertEqual(oneWay.offers[3].legs[0].layoverLine, "1h 05m layover in Sacramento")

    XCTAssertEqual(roundTrip.heading, "San Francisco to New York — Fri, Oct 16 – Sun, Oct 18")
    XCTAssertEqual(roundTrip.aside, "Refundable · 2 adults")
    let united = roundTrip.offers[1]
    XCTAssertEqual(united.outbound, FlightTimes(depart: "10:05pm", label: "5h35m", arrive: "6:40am+1"))
    // 2h 35m, 1h 10m in Chicago, 4h 20m.
    XCTAssertEqual(united.inbound, FlightTimes(depart: "8:00am", label: "8h05m · 1 stop", arrive: "1:05pm"))
    XCTAssertEqual(roundTrip.offers[0].inbound, FlightTimes(depart: "6:15pm", label: "6h36m", arrive: "9:51pm"))
    XCTAssertEqual(united.ways.map(\.title), ["Outbound · Fri, Oct 16", "Return · Sun, Oct 18"])
    XCTAssertEqual(united.ways.map(\.legs.count), [1, 2])
    // The day says it lands the next morning; the "+1" would say it twice.
    XCTAssertEqual(united.legs[0].arriving, "Sat, Oct 17 at 6:40am")
    XCTAssertEqual(united.legs[2].flightLines, ["UA 1281 · United Airlines", "Operated by SkyWest"])
  }

  func testATestSearchSaysSo() {
    let text = "```simeon-flights\n{\"title\":\"A to B\",\"subtitle\":\"Test results · Fri, Oct 2 · 1 adult\",\"offers\":[{\"airline\":\"Duffel Airways\",\"price\":\"$1.00\"}]}\n```"
    let card = FlightsCard.parse(text)!
    XCTAssertTrue(card.isTest)
    XCTAssertEqual(card.heading, "A to B — Fri, Oct 2")
    XCTAssertEqual(card.aside, "Test results")
    let flagged = FlightsCard.parse("```simeon-flights\n{\"title\":\"A to B\",\"subtitle\":\"Fri, Oct 2\",\"test\":true,\"offers\":[{\"airline\":\"X\"}]}\n```")!
    XCTAssertTrue(flagged.isTest)
  }

  func testALogoFitsItsCircleByItsShape() {
    let square = AirlineLogo.box(width: 80, height: 80, diameter: 40)
    XCTAssertEqual(square.width, 26.0, accuracy: 0.1)
    XCTAssertEqual(square.height, square.width, accuracy: 0.001)
    // Alaska's wordmark (269 × 80) runs nearly across the circle instead of shrinking into a square.
    let wordmark = AirlineLogo.box(width: 269, height: 80, diameter: 40)
    XCTAssertGreaterThan(wordmark.width, 34)
    XCTAssertLessThan(wordmark.width, 40)
    XCTAssertEqual(wordmark.width / wordmark.height, 269.0 / 80.0, accuracy: 0.001)
    // Its corners stay inside the circle.
    XCTAssertLessThanOrEqual((wordmark.width * wordmark.width + wordmark.height * wordmark.height).squareRoot(), 40)
    XCTAssertEqual(AirlineLogo.box(width: 0, height: 10, diameter: 40).width, 0)
  }
}

final class ExchangePageTests: XCTestCase {
  private func said(_ id: String, at seconds: Double, to peer: Party? = nil, from other: Party? = nil, _ text: String) -> Entry {
    var raw: [String: JSON] = ["kind": "message", "id": .string(id), "content": .string(text), "timestampMs": .number(1_760_000_000_000 + seconds * 1000)]
    if let peer { raw["role"] = "assistant"; raw["toAgent"] = ["id": .string(peer.id), "name": .string(peer.name)] }
    if let other { raw["role"] = "user"; raw["fromAgent"] = ["id": .string(other.id), "name": .string(other.name)] }
    return Entry(JSON.object(raw))!
  }

  func testEachPairHasItsOwnPage() {
    let scout = Party(id: "scout", name: "Scout"), sid = Party(id: "sid", name: "Sid"), iris = Party(id: "iris", name: "Iris")
    let call = Party(id: "voice-call:abc:30", name: "Call")
    let entries = [
      said("a", at: 0, to: sid, "Test from Scout. No reply needed."),
      said("b", at: 1, to: iris, "Test from Scout. No reply needed."),
      said("c", at: 60, to: sid, "Please reply with a one-line hello."),
      said("d", at: 90, from: sid, "Hello from Sid."),
      said("e", at: 95, to: call, "a call's line"),
      said("f", at: 20 * 60, to: sid, "Thanks."),
    ]
    let rows = Chat.exchangeRows(entries, agent: scout, peerId: "sid")
    let shape = rows.map { row -> String in
      switch row {
      case .stamp(let id, _): return "stamp:\(id)"
      case .message(let id, let sender, _, let first, let last): return "\(id):\(sender.name):\(first ? "first" : "-"):\(last ? "last" : "-")"
      }
    }
    XCTAssertEqual(shape, ["stamp:stamp-a", "a:Scout:first:-", "c:Scout:-:last", "d:Sid:first:last", "stamp:stamp-f", "f:Scout:first:last"])
    // Iris's page holds only what went to Iris.
    XCTAssertEqual(Chat.exchangeRows(entries, agent: scout, peerId: "iris").count, 2)
    XCTAssertEqual(Chat.exchangeRows(entries, agent: scout, peerId: "nobody"), [])
    XCTAssertEqual(Chat.menuOrder([sid, iris, Party(id: "d", name: "deploy")]).map(\.name), ["deploy", "Iris", "Sid"])
  }
}
