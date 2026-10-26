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

/** A server whose first answer never comes (the request times out); the next requests get the scripted answers. */
final class Unanswered: HTTPClient, @unchecked Sendable {
  private let rest: ScriptedHTTP
  private let lock = NSLock()
  private var first = true
  private var timedOut: [URLRequest] = []

  init(then answers: [(URLRequest) -> HTTPAnswer]) { rest = ScriptedHTTP(answers) }

  func send(_ request: URLRequest) async throws -> HTTPAnswer {
    let isFirst: Bool = lock.withLock {
      defer { first = false }
      if first { timedOut.append(request) }
      return first
    }
    if isFirst { throw URLError(.timedOut) }
    return try await rest.send(request)
  }

  var sent: [URLRequest] { lock.withLock { timedOut } + rest.sent }
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
    // The sign-in screen's buttons name their way in; the server sends the sheet straight to it.
    XCTAssertEqual(SignIn.loginURL(api: URL(string: "https://api.simeonlabs.com")!, metadata: metadata, provider: .apple).absoluteString,
                   "https://api.simeonlabs.com/loginDeepControl?challenge=c&uuid=u-1&mode=login&redirectTarget=simeon-ios&provider=apple")
    XCTAssertEqual(SignIn.loginURL(api: URL(string: "https://api.simeonlabs.com")!, metadata: metadata, provider: .google).query?.hasSuffix("&provider=google"), true)
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

  func testDictationSendsTheRecordingAsTheMacDoes() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { request in
        XCTAssertEqual(request.url?.path, "/desktop/api/proxy/v1/audio/transcriptions")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "authorization"), "Bearer t")
        XCTAssertTrue(request.value(forHTTPHeaderField: "content-type")?.hasPrefix("multipart/form-data; boundary=") == true)
        let body = String(decoding: request.httpBody ?? Data(), as: UTF8.self)
        XCTAssertTrue(body.contains("Content-Disposition: form-data; name=\"file\"; filename=\"audio.mp4\"\r\nContent-Type: audio/mp4\r\n\r\nRIFF"))
        XCTAssertFalse(body.contains("language"), "no language: OpenAI finds it")
        return HTTPAnswer(status: 200, body: json(#"{"text":"Move the review to Friday.","seconds":2.4}"#))
      },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    let said = try await api.transcribe(audio: Data("RIFF".utf8), mimeType: "audio/mp4;codecs=mp4a.40.2")
    XCTAssertEqual(said, "Move the review to Friday.")
    XCTAssertEqual(SimeonAPI.audioFilename("audio/webm"), "audio.webm")
  }

  /** A picture turned down: OpenAI's sentence and code reach the app (they were dropped for "answered … with 400"), and the editor says it plainly. */
  @MainActor
  func testARefusedPictureSaysWhy() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { _ in HTTPAnswer(status: 400, body: json(#"{"error":{"message":"Your request was rejected by the safety system.","type":"image_generation_user_error","code":"moderation_blocked"}}"#)) },
      { _ in HTTPAnswer(status: 502, body: json(#"{"error":{"type":"api_error","message":"The image service could not be reached."}}"#)) },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    do {
      _ = try await api.data("proxy/v1/images/generations", json: ["prompt": "Lilo from Lilo and Stitch"])
      XCTFail("refused")
    } catch let error as SimeonAPIError {
      XCTAssertEqual(error.status, 400)
      XCTAssertEqual(error.code, "moderation_blocked")
      XCTAssertEqual(error.message, "Your request was rejected by the safety system.")
      XCTAssertTrue(AppStore.drawingRefusal(error).hasPrefix("The picture maker won't draw that."))
    }
    do {
      _ = try await api.data("proxy/v1/images/generations", json: ["prompt": "a kid playing soccer"])
      XCTFail("unreachable")
    } catch {
      XCTAssertEqual(AppStore.drawingRefusal(error), "Couldn't draw the picture: The image service could not be reached.")
    }
  }

  func testDeletingTheAccountForgetsThePairAndARefusalSaysWhy() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { _ in HTTPAnswer(status: 503, body: json(#"{"error":{"type":"account_deletion_blocked","message":"Your agents' computer couldn't be deleted right now. Try again in a few minutes."}}"#)) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"deleted":true,"subscription":"none","computers":1,"appsDisconnected":0,"transcriptsDeleted":0,"incomplete":[]}"#)) },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    do {
      try await api.deleteAccount()
      XCTFail("refused")
    } catch {
      XCTAssertEqual(error.localizedDescription, "Your agents' computer couldn't be deleted right now. Try again in a few minutes.")
    }
    // Refused: still signed in, so trying again works.
    XCTAssertNotNil(vault.read())
    try await api.deleteAccount()
    XCTAssertNil(vault.read())
    let sent = http.sent
    XCTAssertEqual(sent.count, 2)
    XCTAssertEqual(sent[1].httpMethod, "DELETE")
    XCTAssertEqual(sent[1].url?.path, "/desktop/api/account")
    XCTAssertEqual(sent[1].value(forHTTPHeaderField: "authorization"), "Bearer t")
  }

  /**
   * 14 October 2026: the delete outlasted URLSession's minute, the app said it failed, and the server went on and
   * deleted the account. Now the delete waits five minutes, and when no answer comes the server is asked.
   */
  func testADeleteWhoseAnswerNeverCameIsCheckedWithTheServer() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = Unanswered(then: [
      { _ in HTTPAnswer(status: 200, body: json(#"{"email":"a@b.c"}"#)) },
      { _ in HTTPAnswer(status: 401) },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    let ended = Flag()
    await api.onSessionEnded { ended.set() }
    let appleRunsOn = try await api.deleteAccount(checkEvery: 0)
    XCTAssertFalse(appleRunsOn)
    XCTAssertNil(vault.read())
    XCTAssertFalse(ended.value, "the account's end is the delete's answer, not a sign-out")
    let sent = http.sent
    XCTAssertEqual(sent.map(\.httpMethod), ["DELETE", "GET", "GET"])
    XCTAssertEqual(sent[0].timeoutInterval, SimeonAPI.deleteTimeout)
    XCTAssertEqual(sent[1].url?.path, "/desktop/api/user/profile")
  }

  func testADeleteWhoseAnswerNeverCameAndTheAccountIsStillThereSaysSo() async {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let present: (URLRequest) -> HTTPAnswer = { _ in HTTPAnswer(status: 200, body: json(#"{"email":"a@b.c"}"#)) }
    let http = Unanswered(then: Array(repeating: present, count: 6))
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    do {
      try await api.deleteAccount(checkEvery: 0)
      XCTFail("still there")
    } catch {
      XCTAssertTrue(error is URLError)
    }
    XCTAssertNotNil(vault.read(), "still signed in, so trying again works")
    XCTAssertEqual(http.sent.count, 7)
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
      // The launch's one question, with nothing kept (step 4): the record, which says the server keeps it awake.
      { request in
        XCTAssertEqual(request.url?.path, "/simeon.v1.ComputerService/GetSandBoxRunState")
        return HTTPAnswer(status: 200, body: json(#"{"state":3,"letsSleep":false}"#))
      },
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
    XCTAssertEqual(http.sent.count, 5)
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
      // No event stream here: the next call asks the box's /health first, and trusts it for 5 s (the Electron app's `ensureConnection`).
      { request in
        XCTAssertEqual(request.url?.absoluteString, "https://box/health")
        return HTTPAnswer(status: 200, body: json(#"{"ok":true}"#))
      },
      { _ in HTTPAnswer(status: 200, body: json(#"{"agent":{"id":"agent-9","name":"Nora"}}"#)) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"agent":{"id":"group-1"}}"#)) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"agent":{"id":"agent-10","name":"Leo"}}"#)) },
      { _ in HTTPAnswer(status: 200, body: json(#"{"agent":{"id":"agent-11","name":"Ada"}}"#)) },
    ])
    let api = SimeonAPI(base: URL(string: "https://x")!, clientVersion: "1", vault: vault, http: http)
    let backend = LiveBackend(gateway: Gateway(api: api, http: http))
    try await backend.send("theo", text: "Hi", attachments: [], replyTo: nil)
    let id = try await backend.createAgent(name: "Nora", face: "clay-03")
    let group = try await backend.createGroup(name: "Simeon, Iris", memberIds: ["simeon", "iris"])
    XCTAssertEqual(id, "agent-9")
    XCTAssertEqual(group, "group-1")
    let send = try JSON.parse(http.sent[1].httpBody!)
    XCTAssertEqual(send["agentId"], "theo")
    XCTAssertEqual(send["prompt"], "Hi")
    XCTAssertEqual(send["attachmentPaths"], [])
    XCTAssertTrue(send["clientNonce"]?.string?.hasPrefix("ios-") ?? false)
    XCTAssertEqual(http.sent.count, 5, "one /health, then trusted")
    let create = try JSON.parse(http.sent[3].httpBody!)
    // The face the sheet showed is kept on it; the host picks its colour.
    XCTAssertNil(create["avatarColor"])
    XCTAssertEqual(create["avatarShape"], "clay-03")
    XCTAssertNil(create["voiceId"])
    // The voice picked with the pencil goes with the agent (AgentDraft).
    _ = try await backend.createAgent(name: "Leo", face: "clay-04", voiceId: "s3TPKV1kjDlVtZbl4Ksh")
    let voiced = try JSON.parse(http.sent[5].httpBody!)
    XCTAssertEqual(voiced["voiceId"], "s3TPKV1kjDlVtZbl4Ksh")
    XCTAssertEqual(voiced["avatarShape"], "clay-04")
    XCTAssertEqual(create["isKickstartRequested"], true)
    XCTAssertEqual(try JSON.parse(http.sent[4].httpBody!)["memberAgentIds"], ["simeon", "iris"])
    // No title given, none sent; the title New Agent asks for goes with the agent, trimmed.
    XCTAssertNil(create["title"])
    XCTAssertNil(voiced["title"])
    _ = try await backend.createAgent(name: "Ada", title: "  Personal Shopper ", face: "clay-05", voiceId: nil)
    let titled = try JSON.parse(http.sent[6].httpBody!)
    XCTAssertEqual(titled["title"], "Personal Shopper")
    XCTAssertEqual(titled["name"], "Ada")
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
    XCTAssertTrue(LiveBackend.map(GatewayEvent(channel: "teach-recording", payload: [:])).isEmpty)
    guard case .tray(let tray)? = LiveBackend.map(GatewayEvent(channel: "tray", payload: ["type": "cleared"])).first else { return XCTFail() }
    XCTAssertEqual(tray["type"]?.string, "cleared")
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
      case .thread(_, let root, let count, _): return "thread:\(root):\(count)"
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
      if case .voiceCall(_, let seconds, let lines, _) = row { return (seconds, lines.count) }
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
        case .approval(_, let summary, _, _, let status, _, _): return "approval:\(summary):\(status)"
        case .secret(let label, _, _): return "secret:\(label)"
        case .computer(_, _, let resolution): return "computer:\(resolution ?? "waiting")"
        }
      case .notice(_, let text): return text == Chat.notShown ? "notice" : text
      case .cloudAgent(_, let bcId): return "cloud-agent:\(bcId)"
      case .products(_, let card): return "products:\(card.products.count)"
      case .purchase(_, let card): return card.flight == nil ? "purchase:\(card.domain):\(card.state.rawValue)" : "flight-checkout:\(card.flight?.route ?? ""):\(card.state.rawValue)"
      case .flightPassengers(_, let card): return "travellers:\(card.flight.route):\(card.state.rawValue)"
      case .file(_, let name, _, _): return "file:\(name)"
      default: return "other"
      }
    }
    XCTAssertEqual(kinds, ["me", "them", "question", "question-answered", "question-dismissed", "draft:email:Ready to send", "draft:slack:Ready to send", "flights:4", "flights:2", "connector:Linear:To read the launch tickets.", "listener:slack:so this routine can fire", "approval:Delete 3 files in ~/Downloads:pending", "secret:Stripe API key", "computer:waiting", "cloud-agent:bc-1", "products:2", "purchase:ncvss.com:review", "purchase:ncvss.com:ordered", "travellers:Seattle to Los Angeles:open", "flight-checkout:Seattle to Los Angeles:ordered", "file:Payouts September.pdf"])
    guard case .flights(_, let flights) = rows.first(where: { if case .flights = $0 { return true }; return false })! else { return XCTFail() }
    XCTAssertEqual(flights.title, "Seattle to Los Angeles")
    XCTAssertEqual(flights.offers[3].legs.count, 2)
    XCTAssertEqual(FlightsCard.initials("American Airlines"), "AM")
    XCTAssertEqual(FlightsCard.initials("Alaska Airlines"), "AL")
    XCTAssertEqual(FlightsCard.initials("Delta Air Lines"), "DL")
    guard case .question(_, let question) = rows.first(where: { if case .question = $0 { return true }; return false })! else { return XCTFail() }
    XCTAssertEqual(question.options[0], QuestionOption(label: "Pro", description: "$100 a month"))
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

  /** A chat with no activity yet came as 0 and was shown as "12/31/69" (16 October 2026). */
  func testNoTimeIsNotNineteenSixtyNine() {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
    let locale = Locale(identifier: "en_US")
    let today = Date(timeIntervalSince1970: 1_791_400_000)
    XCTAssertNil(Chat.listTime(ms: 0, now: today, calendar: calendar, locale: locale))
    XCTAssertNil(Chat.listTime(ms: nil, now: today, calendar: calendar, locale: locale))
    XCTAssertNil(Chat.listTime(ms: -1, now: today, calendar: calendar, locale: locale))
    XCTAssertNil(Chat.listTime(ms: Double.nan, now: today, calendar: calendar, locale: locale))
    XCTAssertEqual(Chat.listTime(ms: (today.timeIntervalSince1970 - 86_400) * 1000, now: today, calendar: calendar, locale: locale), "Yesterday")

    // The row goes by when the chat was made, as the window's does.
    XCTAssertEqual(Agent(json: ["id": "a", "name": "A", "lastActivityAt": 0, "updatedAt": 5_000])!.lastActivityAt, 5_000)
    XCTAssertNil(Agent(json: ["id": "a", "name": "A", "lastActivityAt": 0, "updatedAt": 0])!.lastActivityAt)
    XCTAssertEqual(Agent(json: ["id": "a", "name": "A", "lastActivityAt": 7_000, "updatedAt": 5_000])!.lastActivityAt, 7_000)
  }
}

final class ButterflyAndPaletteTests: XCTestCase {
  func testGroupLayoutIsTheWindows() {
    let three = GroupLayout.slots(count: 3, frame: 36)
    XCTAssertEqual(three.map(\.size), [20, 20, 20])
    XCTAssertEqual(three[0].x, 8, accuracy: 1e-9)
    XCTAssertEqual(three[2].y, 16, accuracy: 1e-9)
    XCTAssertEqual(GroupLayout.slots(count: 2, frame: 36)[1].x, 12, accuracy: 1e-9)
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
  var language: String?
  var said: [String] = []
  var results: [String: String] = [:]
  var ended = false

  func start(token: String, prompt: String, firstMessage: String, voiceId: String?, language: String, events: @escaping @Sendable (VoiceEvent) -> Void) async throws {
    lock.withLock { started = (token, prompt, firstMessage, voiceId); self.language = language; self.events = events }
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
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, quiet: 0.02, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
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

/** A picture sent from the phone is shown from the phone's own copy, never fetched back (9 October 2026). */
@MainActor
final class SentPictureTests: XCTestCase {
  func testASentPictureIsReadFromThePhoneUnderBothItsAddresses() async throws {
    let store = AppStore()
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    await store.attach(backend)
    await store.open("theo")
    let id = AppStore.newMessageId()
    let photo = Data([0x89, 0x50, 0x4E, 0x47, 1, 2, 3])
    await store.send("", to: "theo", attachments: [("Photo 1.png", photo)], id: id)
    // The waiting line names the phone's copy, and the computer's path answers for it once uploaded.
    let waiting = AppStore.outboxFileURL(id, 0)
    XCTAssertEqual(store.sentFile(waiting)?.data, photo)
    let path = "/home/box/attachments/Photo 1.png"
    XCTAssertEqual(store.sentFile(path)?.keys, [waiting, path])
    let read = await store.readFile(path, agentId: "theo")
    XCTAssertEqual(read, photo, "read from the phone, not the computer (the demo's computer has no such file)")
    // The host's line for it names that path, and it is drawn as the picture it is (the window's `IZ`), on the person's side.
    try await Task.sleep(nanoseconds: 200_000_000)
    let pictures = store.rows(for: "theo").flatMap { row -> [String] in
      if case .bubble(let bubble) = row, bubble.fromPerson { return bubble.images.map(\.url) }
      return []
    }
    XCTAssertTrue(pictures.contains(path) || pictures.contains(waiting), "\(pictures)")
  }
}

/** The call's tones as a test hears them: when each ring started and ended, and the hang-ups. */
final class FakeTones: CallTonePlaying, @unchecked Sendable {
  let lock = NSLock()
  var rings: [Int] = []
  var ringsOver: Date?
  var stops = 0
  var hangUps = 0
  func ring(cycles: Int) async {
    lock.withLock { rings.append(cycles) }
    try? await Task.sleep(nanoseconds: UInt64(cycles) * 40_000_000)
    lock.withLock { ringsOver = Date() }
  }
  func stopRinging() { lock.withLock { stops += 1 } }
  func hangUp() { lock.withLock { hangUps += 1 } }
}

/** The ring and the hang-up as the Mac's banner makes them, and returned work said only on a quiet line (9 October 2026). */
final class CallSoundAndTurnTests: XCTestCase {
  func testTheTonesAreTheMacs() {
    let ring = CallTones.ringSamples(cycles: 2)
    XCTAssertEqual(ring.count, 2 * Int(1.2 * 44_100))
    // 0.8 s of tone, 0.4 s of quiet, a cycle; soft edges; never louder than its peak.
    XCTAssertEqual(ring[0], 0)
    XCTAssertGreaterThan(ring[Int(0.4 * 44_100)...Int(0.41 * 44_100)].map(abs).max() ?? 0, 0.05)
    XCTAssertEqual(ring[Int(0.9 * 44_100)..<Int(1.2 * 44_100)].map(abs).max(), 0)
    XCTAssertLessThanOrEqual(ring.map(abs).max() ?? 0, 0.3001)
    let hangUp = CallTones.hangUpSamples()
    XCTAssertEqual(hangUp.count, 2 * (Int(0.13 * 44_100) + Int(0.04 * 44_100)))
    XCTAssertEqual(CallTones.hangUpNotes, [784, 523.25])
    let wav = CallTones.wav([0, 1, -1])
    XCTAssertEqual(String(decoding: wav.prefix(4), as: UTF8.self), "RIFF")
    XCTAssertEqual(wav.count, 44 + 6)
    XCTAssertEqual(Array(wav.suffix(4)), [0xFF, 0x7F, 0x01, 0x80])
  }

  func testTheCallRingsTwiceBeforeTheVoiceAndEndsWithTheHangUp() async throws {
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let voice = FakeVoice()
    let tones = FakeTones()
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, tones: tones, quiet: 0.02, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 300_000_000)
    let (rings, over) = tones.lock.withLock { (tones.rings, tones.ringsOver) }
    XCTAssertEqual(rings.first, 2, "two rings first, as the Mac")
    XCTAssertNotNil(voice.lock.withLock { voice.started }, "the voice starts once the ring is over")
    XCTAssertNotNil(over)
    XCTAssertEqual(tones.lock.withLock { tones.hangUps }, 0)
    call.hangUp()
    try await Task.sleep(nanoseconds: 100_000_000)
    XCTAssertEqual(tones.lock.withLock { tones.hangUps }, 1, "a live call ends with the hang-up tone")
  }

  func testWorkThatCameBackWaitsForTheVoiceToFinish() async throws {
    // The founder: "is there anything i c--- (it cuts itself because the routine was updated successfully as it was talking)".
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let voice = FakeVoice()
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, quiet: 0.05, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    let states = StateLog()
    call.observe { states.add($0) }
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 100_000_000)
    voice.emit(.agentSpeaking(true))
    voice.emit(.tool(name: "send_task", id: "t1", parameters: ["task": "Update the routine"]))
    try await Task.sleep(nanoseconds: 400_000_000)
    XCTAssertEqual(voice.lock.withLock { voice.said }, [], "nothing is pushed in while the voice talks")
    voice.emit(.agentSpeaking(false))
    try await Task.sleep(nanoseconds: 300_000_000)
    XCTAssertEqual(voice.lock.withLock { voice.said.count }, 1, "said once the line is quiet")
    XCTAssertTrue(voice.lock.withLock { voice.said.first ?? "" }.contains("they can see it done"))
    // The nudge that makes the voice speak is not shown as the person's words.
    voice.emit(.transcript([CallLine(fromPerson: false, text: "On it."), CallLine(fromPerson: true, text: VoiceCallText.workCameBackNudge)]))
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertEqual(states.last??.lines.map(\.text), ["On it."])
    call.hangUp()
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

    let id = await store.createAgent(name: "Nora", face: AgentFaces.preview(name: "Nora", agents: store.agents))
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
    let agents = [Mentions.AgentName(name: "Theo", id: "theo"), Mentions.AgentName(name: "Bass", id: "bass")]
    let text = "Theo sent it to Google Calendar and Stripe, not @Stripe or Theodore. Bass"
    let found = Mentions.find(in: text, agents: agents, personName: "Bass")
    let names = found.map { (text as NSString).substring(with: NSRange(location: $0.location, length: $0.length)) }
    XCTAssertEqual(names, ["Theo", "Google Calendar", "Stripe"])
    guard case .brand(let calendar) = found[1].kind else { return XCTFail() }
    XCTAssertEqual(calendar.key, "google-calendar")
    guard case .agent(let id) = found[0].kind else { return XCTFail() }
    XCTAssertEqual(id, "theo")
  }

  /** The connectors added after the Mac window's list (14 October 2026): Link coloured mid-sentence, never as a sentence's first word; LinkedIn stays LinkedIn; another spelling of an app keeps its logo. */
  func testConnectorNamesAndEverydayWords() {
    func named(_ text: String) -> [String] {
      Mentions.find(in: text, agents: []).compactMap { match in
        guard case .brand(let brand) = match.kind else { return nil }
        return "\((text as NSString).substring(with: NSRange(location: match.location, length: match.length)))=\(brand.key)"
      }
    }
    XCTAssertEqual(named("Your Link wallet checks out; re-add it in the Link app."), ["Link=link", "Link=link"])
    XCTAssertEqual(named("Link your Google Calendar first. Then Square and Ramp."), ["Google Calendar=google-calendar", "Square=square", "Ramp=ramp"])
    XCTAssertEqual(named("1. Link the card\n- **Square** is next\n\"Kit\" sends it"), [])
    XCTAssertEqual(named("Post on LinkedIn, Facebook Pages and TikTok Ads, then OneDrive and monday.com."), ["LinkedIn=linkedin", "Facebook Pages=facebook", "TikTok Ads=tiktok", "OneDrive=onedrive", "monday.com=monday"])
    XCTAssertEqual(named("Granola, Resend and Microsoft To Do."), ["Granola=granola", "Resend=resend", "Microsoft To Do=microsoft-to-do"])
    // An app whose name is not an everyday word is marked anywhere, first word included.
    XCTAssertEqual(named("Stripe charged it."), ["Stripe=stripe"])
    // 17 October 2026: the 53 added that day, the longer name first, everyday words only mid-sentence.
    XCTAssertEqual(named("Put it in Box, then Confluence and Lucidchart; GitLab, Otter.ai and BigQuery too."), ["Box=box", "Confluence=confluence", "Lucidchart=lucid", "GitLab=gitlab", "Otter.ai=otter", "BigQuery=google-bigquery"])
    XCTAssertEqual(named("Run Pinterest Ads and Reddit Ads, not Pinterest."), ["Pinterest Ads=pinterest-ads", "Reddit Ads=reddit-ads", "Pinterest=pinterest"])
    XCTAssertEqual(named("Clay first. Neon after."), [])
    XCTAssertEqual(named("Excalidraw drew it; HeyGen voiced it."), ["Excalidraw=excalidraw", "HeyGen=heygen"])
    // The 52 on their makers' servers, later that day: FLUX by its maker's name too, names with dots and semicolons.
    XCTAssertEqual(named("Black Forest Labs makes FLUX; fal.ai and tl;dv too."), ["Black Forest Labs=black-forest-labs", "FLUX=black-forest-labs", "fal.ai=fal", "tl;dv=tldv"])
    XCTAssertEqual(named("Make sure Close is open. Hunter found it in Customer.io and lemlist."), ["Customer.io=customer-io", "lemlist=lemlist"])
    XCTAssertEqual(named("Log the call in Close, then open your Hunter account."), ["Close=close", "Hunter=hunter"])
  }

  /**
   * An everyday word is an app only where its sentence makes it one (the
   * founder, 19 October 2026: "yes we can Shop here" wore Shop's logo, "the
   * Link is here" Link's).
   */
  func testEverydayWordsAreAppsOnlyInAnAppsPlace() {
    func named(_ text: String) -> [String] {
      Mentions.find(in: text, agents: []).compactMap { match in
        guard case .brand = match.kind else { return nil }
        return (text as NSString).substring(with: NSRange(location: match.location, length: match.length))
      }
    }
    // As a verb, after "the", in a title: plain.
    XCTAssertEqual(named("Yes, we can Shop here."), [])
    XCTAssertEqual(named("Sure, the Link is here: https://example.com"), [])
    XCTAssertEqual(named("Here's the Payment Link for the Coffee Shop app."), [])
    XCTAssertEqual(named("I'll Close the deal and let's Square it up."), [])
    XCTAssertEqual(named("Click to Link your card."), [])
    // A cue before it, an app's word after it, or another app beside it: the app.
    XCTAssertEqual(named("You can pay with Link or check out via **Shop**."), ["Link", "Shop"])
    XCTAssertEqual(named("Your Shop account and the Link wallet are ready; Link's checkout too."), ["Shop", "Link", "Link"])
    XCTAssertEqual(named("I signed in to Link, then connected Square."), ["Link", "Square"])
    XCTAssertEqual(named("Connected: Gmail, Link and Shop."), ["Gmail", "Link", "Shop"])
    XCTAssertEqual(named("Link and Shop are in your Wallet."), ["Link", "Shop"])
    XCTAssertEqual(named("Pay with Stripe Link."), ["Stripe", "Link"])
    // A name that is not an everyday word stays marked wherever it is.
    XCTAssertEqual(named("Yes, the Stripe charge and the Gmail draft are here."), ["Stripe", "Gmail"])
  }

  /** An agent's name used as a product's or a name being given is plain; the speaker's own name too (the founder, 19 October 2026: "my app name is Simeon" wore the agent Simeon's pill). */
  func testAnAgentsNameUsedAsAThingsIsPlain() {
    let agents = [Mentions.AgentName(name: "Simeon", id: "simeon"), Mentions.AgentName(name: "Theo", id: "theo")]
    func named(_ text: String, speaker: String? = nil) -> [String] {
      Mentions.find(in: text, agents: agents, speaker: speaker).compactMap { match in
        guard case .agent(let id) = match.kind else { return nil }
        return id
      }
    }
    XCTAssertEqual(named("Got it: your app is called Simeon, and the Simeon app is on the App Store."), [])
    XCTAssertEqual(named("So your app name is Simeon. I'll read Simeon's website and the Simeon customer feedback."), [])
    XCTAssertEqual(named("I'll look at the onboarding in Simeon and at your startup, Simeon, after Simeon Labs."), [])
    // The agents themselves.
    XCTAssertEqual(named("Ask Simeon, or let Theo plan it; Simeon will check Theo's draft."), ["simeon", "theo", "simeon", "theo"])
    XCTAssertEqual(named("I left a note in Theo's chat for Simeon."), ["theo", "simeon"])
    // Simeon writing about Simeon: its own name is never its pill.
    XCTAssertEqual(named("I'm Simeon. Simeon helps founders, and Theo helps me.", speaker: "simeon"), ["theo"])
  }

  /** A Mac line's run is read in its whole line: the names inside it, at the line's offsets. */
  func testMentionsWithinARun() {
    // "Pay with **Link** or ask Theo.": the bold run alone is "Link", a sentence's first word were it read by itself.
    let line = "Pay with Link or ask Theo."
    let agents = [Mentions.AgentName(name: "Theo", id: "theo")]
    let run = (line as NSString).range(of: "Link")
    XCTAssertEqual(Mentions.find(in: line, within: run, agents: agents).map(\.location), [run.location])
    XCTAssertEqual(Mentions.find(in: "Link", agents: agents).count, 0)
    let rest = NSRange(location: NSMaxRange(run), length: (line as NSString).length - NSMaxRange(run))
    XCTAssertEqual(Mentions.find(in: line, within: rest, agents: agents).map(\.kind), [.agent(id: "theo")])
  }

  func testAvasChatIsQuickInTheCore() {
    // The chat that froze on the founder's iPhone (8 October 2026), as he pasted it: the core's part is a few milliseconds.
    let lines = [
      "Hi Bass, I\u{2019}m Ava. I\u{2019}ll find where customer feedback actually lives, then pull out the strongest themes with source links and flag what\u{2019}s only a one-off comment.",
      "I don\u{2019}t have Simeon customer feedback yet. The connected Gmail account is for Prime Seattle, and I found no Simeon-related messages or feedback labels there, so I won\u{2019}t treat that mail as product evidence.",
      "My avatar is now a violet customer-voice icon, distinct from the others. I\u{2019}m still waiting on the location of Simeon\u{2019}s feedback before I can give Leo or you evidence-backed themes.",
    ]
    let agents = [Mentions.AgentName(name: "Simeon", id: "simeon"), Mentions.AgentName(name: "Ava", id: "ava"), Mentions.AgentName(name: "Leo", id: "leo")]
    let start = Date()
    let found = lines.map { line in
      XCTAssertEqual(Markdown.blocks(line).count, 1)
      return Mentions.find(in: line, agents: agents, personName: "Bass Fall").map { (line as NSString).substring(with: NSRange(location: $0.location, length: $0.length)) }
    }
    // "Simeon customer feedback" is the product's; "Simeon's feedback" could be the agent's.
    XCTAssertEqual(found, [["Ava"], ["Gmail"], ["Simeon", "Leo"]])
    XCTAssertLessThan(Date().timeIntervalSince(start), 0.1)
  }

  /** A picture counts for the working lines with its data or only its version (`QCe`); an empty one does not. */
  func testAnAgentsPicture() {
    XCTAssertFalse(Agent(json: ["id": "a", "name": "A"])!.hasPicture)
    XCTAssertFalse(Agent(json: ["id": "a", "name": "A", "avatarDataUrl": "", "avatarVersion": ""])!.hasPicture)
    let pictured = Agent(json: ["id": "a", "name": "A", "avatarDataUrl": "data:image/png;base64,AAAA", "avatarVersion": "v2"])!
    XCTAssertTrue(pictured.hasPicture)
    XCTAssertEqual(pictured.avatarVersion, "v2")
    XCTAssertTrue(Agent(json: ["id": "a", "name": "A", "avatarVersion": "v1"])!.hasPicture)
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
    XCTAssertEqual(Chat.quoteLine(entries[0], limit: 10), "Thursday…", "cut at nine, its trailing space dropped, then the ellipsis")
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
    XCTAssertEqual(ComposerLists.trigger("@", in: "Ask @")?.query, "")
    XCTAssertEqual(ComposerLists.trigger("@", in: "Ask @Th")?.query, "Th")
    XCTAssertEqual(ComposerLists.trigger("@", in: "@Iris")?.query, "Iris")
    XCTAssertNil(ComposerLists.trigger("@", in: "mail me at bass@simeonlabs"), "an address is not a mention")
    XCTAssertEqual(ComposerLists.trigger("@", in: "Ask @Theo now")?.query, "Theo now", "the window's list reads on across one space at a time")
    XCTAssertEqual(ComposerDocument.picking(.mention(id: "t", label: "Theo"), from: 4, in: "Ask @Th", chips: []).draft, "Ask @Theo ")
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
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws {}
  var read: [String] = []
  func markRead(_ agentId: String) async { read.append(agentId) }
  func createAgent(name: String, face: String?) async throws -> String { "x" }
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
    if failLoads { throw GatewayError(message: "offline", refused: false) }
    let end = before ?? lines.count
    let size = before == nil ? 500 : 100
    let start = max(0, end - size)
    return TranscriptPage(entries: lines[start..<end].compactMap(Entry.init), olderBefore: start > 0 ? start : nil)
  }
  /** What was sent, with what went with it. */
  var sent: [(text: String, options: SendOptions)] = []
  /** The fetch of the chat fails (`transcriptPage`). */
  var failLoads = false
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], options: SendOptions, nonce: String?) async throws {
    if failSends { throw GatewayError(message: "offline", refused: false) }
    sent.append((text, options))
  }
  func markRead(_ agentId: String) async {}
  func createAgent(name: String, face: String?) async throws -> String { "x" }
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

  func testTheAccountReadBeforeTheAgentsIsKept() async {
    // The profile answers while the iPhone asks about the free month, before the agents are attached (12 October 2026: "?" in Settings).
    let store = AppStore()
    store.account = Account(name: "Bass Fall", email: "bass@simeonlabs.com")
    await store.attach(DemoBackend(seed: .empty, pace: 0.01, call: nil))
    XCTAssertEqual(store.account?.name, "Bass Fall")
    store.detach()
    XCTAssertNil(store.account, "signed out: gone")
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

  func testTheStepsInOrder() {
    XCTAssertEqual(OnboardingStep.allCases.map(\.title), [
      "What should we call you?", "Unlock Simeon with Face ID", "Allow notifications",
    ])
    XCTAssertEqual(Onboarding.handOffLine(ready: false), "Setting up your Simeon…")
    XCTAssertEqual(Onboarding.handOffLine(ready: true), "Getting your team ready…")
    XCTAssertEqual(Onboarding.handOffLine(ready: false, percent: 42, sleeping: true), "Setting up your Simeon… 42%")
    XCTAssertEqual(Onboarding.handOffLine(ready: false, sleeping: true), "Waking your computer…")
  }
}

/** The words beside an agent at work (Activity.swift, the window's `dse`). */
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
    var theo = Agent(id: "t", name: "Theo")
    theo.isRunning = true
    XCTAssertEqual(theo.activityLine()?.text, "Theo is working", "running before it says what (`gJn`)")
  }

  func testTheWorkingLineHoldsEachActivityForAMoment() {
    let search = ActivityLine.of(kind: "tool", tool: "WebSearch", detail: nil)
    let read = ActivityLine.of(kind: "tool", tool: "Read", detail: nil)
    let shell = ActivityLine.of(kind: "tool", tool: "Shell", detail: nil)
    var hold = ActivityHold(search, at: 10)
    hold.want(read, at: 10.3)
    XCTAssertEqual(hold.shown, search, "Searching keeps its 0.8 s")
    XCTAssertEqual(hold.due ?? 0, 10.8, accuracy: 0.0001)
    hold.want(read, at: 10.8)
    XCTAssertEqual(hold.shown, read)
    XCTAssertNil(hold.due)
    hold.want(shell, at: 12)
    XCTAssertEqual(hold.shown, shell, "after its 0.8 s a new one takes over at once")
    XCTAssertNil(hold.elapsed(at: 71))
    XCTAssertEqual(hold.elapsed(at: 72.5), "1m")
    XCTAssertEqual(hold.nextMinute(after: 72.5) ?? 0, 132, accuracy: 0.0001)
    XCTAssertEqual(hold.elapsed(at: 12 + 3_900), "1h 5m")
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
    XCTAssertFalse(consent.smallPrint.joined().contains("Composio"), "no consent names the sign-in partner")
    XCTAssertEqual(consent.note, "Anything that moves money in Stripe is real. Ask your agents to check with you before they move any.")
  }

  func testTheSignInPartnerIsNeverNamed() {
    let gmail = CatalogApp(id: "gmail", name: "gmail", title: "Gmail", summary: "Search, read, draft, and manage email.", serverURL: "https://api.simeonlabs.com/desktop/api/apps/mcp/gmail")
    let consent = ConnectConsent(app: gmail, name: "Gmail")
    XCTAssertEqual(consent.route, .composio)
    // White label (13 October 2026): the partner is said, not named.
    XCTAssertTrue(consent.smallPrint[0].hasPrefix("Simeon connects Gmail through a secure sign-in partner"))
    XCTAssertFalse(([consent.title, consent.summary, consent.note ?? ""] + consent.smallPrint + consent.points.map(\.body)).joined().lowercased().contains("composio"))
    XCTAssertEqual(consent.note, "Emails your agents send go out from your own address.")
    let byToolkit = CatalogApp(id: "notion", name: "notion", title: "Notion", summary: "", composioToolkit: "notion")
    XCTAssertEqual(ConnectConsent(app: byToolkit, name: "Notion").route, .composio)
  }

  /** Link (13 October 2026): approval in the Link app, a one-time card, no card number seen. */
  func testLinkSaysEveryPurchaseWaitsForTheLinkApp() {
    let link = ConnectConsent(app: CatalogApp(id: "link", name: "link", title: "Link", summary: "Buy what you ask for.", serverURL: "https://link.com/agents"), name: "Link")
    XCTAssertTrue(link.points[0].body.contains("one-time card"))
    XCTAssertTrue(link.smallPrint[0].hasPrefix("You'll approve the connection on link.com or in the Link app"))
    XCTAssertTrue(link.smallPrint[0].contains("never sees your password or your card numbers"))
    XCTAssertTrue(link.note?.hasPrefix("Nothing is paid until you approve the purchase in the Link app") == true)
  }

  /** Shop (14 October 2026): Shop's own page to connect, Allow before anything is paid, a one-time card elsewhere. */
  func testShopSaysHowItPays() {
    let shop = ConnectConsent(app: CatalogApp(id: "shop", name: "shop", title: "Shop", summary: "Find products across Shopify stores.", serverURL: "https://shop.app"), name: "Shop")
    XCTAssertTrue(shop.points[0].body.contains("pay for what you asked them to buy with your Shop card"))
    XCTAssertTrue(shop.smallPrint[0].hasPrefix("You'll approve the connection on Shop's own page"))
    XCTAssertTrue(shop.note?.hasPrefix("Nothing is paid until you press Allow") == true)
    XCTAssertEqual(ConnectorIcons.id(for: "Shop"), "shop")
    XCTAssertEqual(ConnectorIcons.id(for: "Shopify"), "shopify", "Shop and Shopify stay apart")
  }

  /** Apps on their makers' own servers (13 October 2026): the maker's page and server are named. */
  func testAnAppOnItsMakersServerSaysSo() {
    let granola = ConnectConsent(app: CatalogApp(id: "granola", name: "granola", title: "Granola", summary: "", serverURL: "https://mcp.granola.ai/mcp"), name: "Granola")
    XCTAssertEqual(granola.route, .vendor(host: "mcp.granola.ai"))
    XCTAssertEqual(granola.points[0].body, "Your agents can read and use your meeting notes, transcripts and folders in Granola.")
    XCTAssertTrue(granola.smallPrint[0].contains("Granola runs this connection from its own server (mcp.granola.ai)"))
    let resend = ConnectConsent(app: CatalogApp(id: "resend", name: "resend", title: "Resend", summary: "", serverURL: "https://mcp.resend.com"), name: "Resend")
    XCTAssertEqual(resend.note, "Emails your agents send go out from your own domains.")
    // Shopify's own server takes only the clients it has approved (13 October 2026): still "Coming soon".
    XCTAssertTrue(AppsComingSoon.builtIn.contains("shopify"))
    // The server names an app by Composio's name, the catalog by its own: either finds it.
    XCTAssertTrue(AppsComingSoon.names(AppsComingSoon.builtIn, "microsoft-to-do"))
    XCTAssertTrue(AppsComingSoon.names(AppsComingSoon.builtIn, "Microsoft To Do"))
    XCTAssertTrue(AppsComingSoon.names(["Microsoft_ToDo"], "microsoft-to-do"))
    XCTAssertFalse(AppsComingSoon.names(AppsComingSoon.builtIn, "Microsoft Teams"))
    XCTAssertFalse(AppsComingSoon.names(AppsComingSoon.builtIn, ""))
    let lovable = ConnectConsent(app: CatalogApp(id: "lovable", name: "lovable", title: "Lovable", summary: "", serverURL: "https://mcp.lovable.dev"), name: "Lovable")
    XCTAssertEqual(lovable.points[0].body, "Your agents can read and use your projects, workspaces and their code in Lovable.")
    XCTAssertEqual(lovable.route, .vendor(host: "mcp.lovable.dev"))
    // 17 October 2026: Excalidraw's server signs nobody in, so the sheet says so; Otter.ai's is read-only.
    let excalidraw = ConnectConsent(app: CatalogApp(id: "excalidraw", name: "excalidraw", title: "Excalidraw", summary: "", serverURL: "https://mcp.excalidraw.com/mcp"), name: "Excalidraw")
    XCTAssertEqual(excalidraw.route, .vendor(host: "mcp.excalidraw.com"))
    XCTAssertTrue(excalidraw.smallPrint[0].hasPrefix("There's nothing to sign in to"))
    XCTAssertTrue(excalidraw.note?.contains("excalidraw.com") == true)
    let otter = ConnectConsent(app: CatalogApp(id: "otter", name: "otter", title: "Otter.ai", summary: "", serverURL: "https://mcp.otter.ai/mcp"), name: "Otter.ai")
    XCTAssertEqual(otter.points[0].body, "Your agents can read your meeting transcripts and summaries in Otter.ai.")
    let freshbooks = ConnectConsent(app: CatalogApp(id: "freshbooks", name: "freshbooks", title: "FreshBooks", summary: ""), name: "FreshBooks")
    XCTAssertEqual(freshbooks.note, "Anything that moves money in FreshBooks is real. Ask your agents to check with you before they move any.")
    // The 52 on their makers' servers: a model maker said by what it makes, tl;dv read-only, Coinbase's money and approval.
    let elevenlabs = ConnectConsent(app: CatalogApp(id: "elevenlabs", name: "elevenlabs", title: "ElevenLabs", summary: "", serverURL: "https://api.us.elevenlabs.io/v1/mcp"), name: "ElevenLabs")
    XCTAssertEqual(elevenlabs.route, .vendor(host: "api.us.elevenlabs.io"))
    XCTAssertEqual(elevenlabs.points[0].body, "Your agents can make speech, sound effects and music with ElevenLabs, and use your voices.")
    XCTAssertEqual(elevenlabs.note, "Making speech, sound effects and music uses your ElevenLabs credits.")
    let tldv = ConnectConsent(app: CatalogApp(id: "tldv", name: "tldv", title: "tl;dv", summary: "", serverURL: "https://mcp.tldv.io/mcp"), name: "tl;dv")
    XCTAssertEqual(tldv.points[0].body, "Your agents can read your meeting recordings, transcripts and notes in tl;dv.")
    let coinbase = ConnectConsent(app: CatalogApp(id: "coinbase", name: "coinbase", title: "Coinbase", summary: "", serverURL: "https://agents.coinbase.com/mcp"), name: "Coinbase")
    XCTAssertTrue(coinbase.note?.hasPrefix("Anything that moves money or crypto in Coinbase is real.") == true)
    let razorpay = ConnectConsent(app: CatalogApp(id: "razorpay", name: "razorpay", title: "Razorpay", summary: ""), name: "Razorpay")
    XCTAssertEqual(razorpay.note, "Anything that moves money in Razorpay is real. Ask your agents to check with you before they move any.")
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

/**
 * Each agent's own voice on the phone, the Mac's way (9 October 2026, the
 * founder: "you brought back voices like jessica that i deleted. theres no
 * smart attribution of voices … both on mac and on the phone"). The expected
 * values are what the Mac's own code gives (agent-voices.ts and
 * `assignMissingVoices`, run under node on the same input).
 */
@MainActor
final class AgentVoiceTests: XCTestCase {
  static let curated: [(String, String)] = [("ljX1ZrXuDIIRVcmiVSyR", "Michael"), ("1t1EeRixsJrKbiF1zwM6", "Jerry"), ("XcXEQzuLXRU9RcfWzEJt", "Veda"), ("s3TPKV1kjDlVtZbl4Ksh", "Adam"), ("UgBBYS2sOqTuMpoF3BR0", "Mark"), ("6OzrBCQf8cjERkYgzSg8", "Jamal"), ("Cz0K1kOv9tD8l0b5Qu53", "Simeon"), ("WI5pMmcGGS32yI7yttoP", "Amanda"), ("snyKKuaGYk1VUEh42zbW", "Chris"), ("gfRt6Z3Z8aTbpLfexQ7N", "Boyd"), ("NHRgOEwqx5WZNClv5sat", "Chelsea"), ("5u41aNhyCU6hXOcjPPv0", "Hope")]
  static var listed: [AppStore.VoiceChoice] { curated.map { AppStore.VoiceChoice(id: $0.0, name: $0.1, sample: nil) } }

  func testANamesGenderIsTheMacs() {
    let mac: [(String, String?)] = [("Maya", "female"), ("Nina", "female"), ("Ava", "female"), ("Zoë", "female"), ("Ana Lucía", "female"), ("Fatou", "female"), ("Isla", "female"), ("Ms Taylor", "female"), ("Dr. Amara", "female"), ("Leo", "male"), ("Simeon", "male"), ("Jon", "male"), ("Mark", "male"), ("Bassirou", "male"), ("Theo", "male"), ("Mr. Kim", "male"), ("Sir Elton", "male"), ("Jordan", nil), ("Taylor", nil), ("Riley", nil), ("Sage", nil), ("Atlas", nil), ("", nil), ("  ", nil), ("Chloé-Anne", "female"), ("MAYA", "female"), ("Dr Jordan Lee", nil), ("Jessica", "female")]
    for (name, gender) in mac { XCTAssertEqual(AgentVoices.nameGender(name), gender, name) }
  }

  func testTheTieBetweenFreeVoicesIsTheMacsHash() {
    let seven = (1...7).map { AppStore.VoiceChoice(id: "v\($0)", name: "v\($0)", sample: nil) }
    let mac = [("a", "v6"), ("b", "v7"), ("coo", "v1"), ("maya", "v5"), ("agent-12", "v7"), ("0f6b7c1e-3c2a-4b8e-9d1f-1234567890ab", "v3"), ("é", "v1"), ("日本", "v5")]
    for (id, voice) in mac { XCTAssertEqual(AgentVoices.pick(agentId: id, name: "Jordan", isChiefOfStaff: false, voices: seven, taken: []), voice, id) }
  }

  func testOnePassGivesTheVoicesTheMacGives() {
    func agent(_ id: String, _ name: String, _ title: String, voice: String? = nil, group: Bool = false, room: Bool = false) -> Agent {
      var row = Agent(id: id, name: name, title: title, isGroup: group)
      row.voiceId = voice; row.isRemoteRoom = room
      return row
    }
    let roster = [
      agent("7d1c", "Simeon", "Chief of Staff"),
      agent("a91f", "Maya", "Inbox", voice: "cgSgspJ2msm6clMCkdW9"), // Jessica, taken off the list
      agent("b22e", "Leo", "Growth"),
      agent("c3", "Nina", "Finance", voice: "WI5pMmcGGS32yI7yttoP"),
      agent("d4", "Jordan", "Research"),
      agent("e5", "Ava", ""),
      agent("f6", "Team", "", group: true),
      agent("g7", "Theo", "Books", voice: ""),
      agent("h8", "Shared", "", room: true),
    ]
    let plan = AgentVoices.plan(agents: roster, voices: Self.listed)
    let mac = [("7d1c", "Cz0K1kOv9tD8l0b5Qu53"), ("a91f", "5u41aNhyCU6hXOcjPPv0"), ("b22e", "6OzrBCQf8cjERkYgzSg8"), ("d4", "snyKKuaGYk1VUEh42zbW"), ("e5", "NHRgOEwqx5WZNClv5sat"), ("g7", "UgBBYS2sOqTuMpoF3BR0")]
    XCTAssertEqual(plan.given.map { "\($0.agentId)=\($0.voiceId)" }, mac.map { "\($0.0)=\($0.1)" })
    XCTAssertEqual(plan.voices["c3"], "WI5pMmcGGS32yI7yttoP", "a listed voice stays")
    XCTAssertNil(plan.voices["f6"]); XCTAssertNil(plan.voices["h8"])
    XCTAssertFalse(plan.voices.values.contains("cgSgspJ2msm6clMCkdW9"), "nobody keeps Jessica")
    // Nothing listed: nothing judged, nothing given.
    XCTAssertTrue(AgentVoices.plan(agents: roster, voices: []).given.isEmpty)
    XCTAssertEqual(AgentVoices.kept("cgSgspJ2msm6clMCkdW9", listed: []), "cgSgspJ2msm6clMCkdW9")
    XCTAssertNil(AgentVoices.kept("cgSgspJ2msm6clMCkdW9", listed: Self.listed))
    XCTAssertNil(AgentVoices.kept("../x", listed: []))
  }

  func testTheNameListsAreTheMacs() throws {
    let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let source = try String(contentsOf: repo.appendingPathComponent("desktop/source/shared/voice-call/name-genders.ts"), encoding: .utf8)
    func words(_ name: String) -> [String] {
      let start = source.range(of: "export const \(name) =")!.upperBound
      let end = source[start...].firstIndex(of: ";")!
      var joined = ""
      var inside = false
      for character in source[start..<end] {
        if character == "\"" { inside.toggle() } else if inside { joined.append(character) }
      }
      return joined.split(separator: " ").map(String.init)
    }
    XCTAssertEqual(GeneratedNameGenders.women.split(whereSeparator: \.isWhitespace).map(String.init), words("WOMEN_NAMES"), "run: node ios/scripts/make-name-genders.mjs")
    XCTAssertEqual(GeneratedNameGenders.men.split(whereSeparator: \.isWhitespace).map(String.init), words("MEN_NAMES"), "run: node ios/scripts/make-name-genders.mjs")
    let mac = try String(contentsOf: repo.appendingPathComponent("desktop/source/shared/voice-call/agent-voices.ts"), encoding: .utf8)
    for (id, gender) in AgentVoices.curatedGenders { XCTAssertTrue(mac.contains("\(id)\": \"\(gender)\"") || mac.contains("\(id): \"\(gender)\""), id) }
    XCTAssertTrue(mac.contains("SIMEON_VOICE_ID = \"\(AgentVoices.simeonVoiceId)\""))
  }

  func testThePickerAndTheCallShowAndSpeakTheSameVoice() async throws {
    let store = AppStore()
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    await store.attach(backend)
    let all = await store.assignMissingVoices()
    // The demo lists six voices, Veda the only woman's; Simeon's own is not among them.
    for agent in store.agents where !agent.isGroup {
      XCTAssertNotNil(all[agent.id], agent.name)
      XCTAssertEqual(store.agent(agent.id)?.voiceId, all[agent.id], agent.name)
    }
    XCTAssertEqual(all["iris"], "XcXEQzuLXRU9RcfWzEJt", "Iris: a woman's name, a woman's voice")
    let theo = await store.ensureVoice("theo")
    XCTAssertEqual(theo, all["theo"])
    // Saved on the agent, so the Mac and the next launch read it too.
    let rows = try await backend.listAgents()
    XCTAssertEqual(rows.first { $0.id == "theo" }?.voiceId, theo)
    let voice = FakeVoice()
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, voiceFor: { id in await store.ensureVoice(id) }, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertEqual(voice.lock.withLock { voice.started?.voice }, theo)
    call.hangUp()
  }
}
