import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/** One event from the host: `{channel, payload}` on the gateway's event stream. */
public struct GatewayEvent: Sendable, Equatable {
  public let channel: String
  public let payload: JSON
  public init(channel: String, payload: JSON) { self.channel = channel; self.payload = payload }
}

/**
 * The gateway's event stream, line by line (`gateway-client.ts`): a block of
 * `data:` lines ends at a blank line, and its data is one JSON
 * `{channel, payload}`. Anything else (comments, `event:` and `id:` lines,
 * a block that is not JSON) is skipped, as the Mac skips it.
 */
public struct EventStreamParser: Sendable {
  private var dataLines: [String] = []
  private var pending: [UInt8] = []

  public init() {}

  /** One line, without its newline. A blank line ends the block. */
  public mutating func feed(line: String) -> GatewayEvent? {
    let clean = line.hasSuffix("\r") ? String(line.dropLast()) : line
    if clean.isEmpty {
      defer { dataLines.removeAll() }
      guard !dataLines.isEmpty, let event = try? JSON.parse(dataLines.joined(separator: "\n")),
            let channel = event["channel"]?.text else { return nil }
      return GatewayEvent(channel: channel, payload: event["payload"] ?? .null)
    }
    if clean.hasPrefix("data:") {
      dataLines.append(String(clean.dropFirst(5)).trimmingCharacters(in: .whitespaces))
    }
    return nil
  }

  /** Raw bytes as they arrive; returns the events they finished. */
  public mutating func feed(bytes: some Sequence<UInt8>) -> [GatewayEvent] {
    var events: [GatewayEvent] = []
    for byte in bytes {
      if byte == 0x0A {
        let line = String(decoding: pending, as: UTF8.self)
        pending.removeAll(keepingCapacity: true)
        if let event = feed(line: line) { events.append(event) }
      } else {
        pending.append(byte)
      }
    }
    return events
  }
}

/** Where the person's cloud computer answers: `EnsureSandBox`'s answer (`server/simeon/sand/box_broker.py`), as `connectionFromBox` reads it. */
public struct GatewayConnection: Sendable, Equatable {
  public static let apiPrefix = "/api"
  public static let eventsPath = "/events"
  public static let networkTokenHeader = "x-anyrun-network-token"
  /** Said on every request when the server lets the box sleep while the app is open (`letsSleep`). */
  public static let letsSleepHeader = "x-simeon-lets-sleep"

  public let baseURL: String
  public let token: String?
  public let networkToken: String?
  /** The cloud computer's screen through the proxy, when it has one. */
  public let screenURL: String?
  /** Where each agent's own screen answers through the proxy (`forkVncBaseUrl`, the box's port 6081). */
  public let forkScreenBase: String?
  /**
   * The server lets the box sleep while the app is open (26 October 2026,
   * `SIMEON_BOX_SLEEPS_WITH_APP_OPEN`, the computer used only for runs): the
   * app says so on its requests (`letsSleepHeader`), so being open does not
   * keep the box awake, and does not wake a sleeping box until something
   * needs it (`Gateway.waitWhileAsleep`). An address kept from an earlier
   * launch does not say it: the broker's next answer does.
   */
  public let letsSleep: Bool

  public init(baseURL: String, token: String?, networkToken: String?, screenURL: String? = nil, forkScreenBase: String? = nil, letsSleep: Bool = false) {
    self.baseURL = baseURL; self.token = token; self.networkToken = networkToken; self.screenURL = screenURL; self.forkScreenBase = forkScreenBase; self.letsSleep = letsSleep
  }

  public init(box: JSON) throws {
    guard let base = box["gatewayUrl"]?.text else {
      throw SimeonAPIError(message: L10n.text("Simeon's cloud computer has no gateway address yet. Try again in a moment."), status: 0)
    }
    self.init(baseURL: base.trimmingTrailingSlashes, token: box["gatewayToken"]?.text, networkToken: box["networkToken"]?.text, screenURL: box["vncUrl"]?.text, forkScreenBase: box["forkVncBaseUrl"]?.text?.trimmingTrailingSlashes, letsSleep: box["letsSleep"]?.bool == true)
  }

  /**
   * The WebSocket of an agent's screen, from the address the box gives
   * (`ensureForeverBox`: noVNC's page on loopback port 6080 or 6081, with
   * the display's `token` inside its `path`), through the proxy, the way
   * `proxifyBoxVncUrl` and `buildSandBoxNoVncUrl` build the page's: only the
   * stream, which the app's own noVNC opens (noVNC's page would load its
   * files without the network token, and the proxy refuses those).
   */
  public func screenSocket(for vncUrl: String) -> URL? {
    guard let page = URLComponents(string: vncUrl) else { return nil }
    let wake = "resume_lower_s=900&resume_upper_s=18000"
    let host = page.host ?? ""
    if host == "127.0.0.1" || host == "localhost" {
      guard let networkToken else { return nil }
      if page.port == 6081, let base = forkScreenBase {
        let inner = page.queryItems?.first { $0.name == "path" }?.value ?? ""
        let token = inner.split(separator: "?", maxSplits: 1).dropFirst().first.flatMap { URLComponents(string: "x:?\($0)")?.queryItems?.first { $0.name == "token" }?.value }
        let tokenParam = token.map { "token=\($0)&" } ?? ""
        return Self.socket(base + "/websockify?\(tokenParam)network_token=\(networkToken)&\(wake)")
      }
      if page.port == 6080, let primary = screenURL { return screenSocket(for: primary) }
      return nil
    }
    // A page already through the proxy: its folder, then its `path`.
    guard let path = page.queryItems?.first(where: { $0.name == "path" })?.value else { return nil }
    var folder = page
    folder.query = nil
    folder.fragment = nil
    folder.path = (folder.path as NSString).deletingLastPathComponent
    guard let base = folder.string else { return nil }
    return Self.socket(base.trimmingTrailingSlashes + "/" + path)
  }

  static func socket(_ http: String) -> URL? {
    if http.hasPrefix("https://") { return URL(string: "wss://" + http.dropFirst(8)) }
    if http.hasPrefix("http://") { return URL(string: "ws://" + http.dropFirst(7)) }
    return URL(string: http)
  }

  public func headers(_ extra: [String: String] = [:]) -> [String: String] {
    var headers = extra
    if let networkToken { headers[Self.networkTokenHeader] = networkToken }
    if let token { headers["authorization"] = "Bearer \(token)" }
    if letsSleep { headers[Self.letsSleepHeader] = "1" }
    return headers
  }

  public func commandRequest(_ method: String, _ args: JSON) -> URLRequest {
    var request = URLRequest.post(URL(string: baseURL + Self.apiPrefix + "/" + method)!, json: args, headers: headers())
    request.timeoutInterval = 60
    return request
  }

  public func eventsRequest() -> URLRequest {
    var request = URLRequest(url: URL(string: baseURL + Self.eventsPath)!)
    for (name, value) in headers(["accept": "text/event-stream"]) { request.setValue(value, forHTTPHeaderField: name) }
    // The host pings every 15 s (`SSE_HEARTBEAT_MS`); a stream silent for 35 s is dead (a phone that slept), so it errors and the loop
    // reconnects: the Electron app's stall watchdog (`SSE_STALL_TIMEOUT_MS`), 45 s here until 16 October 2026.
    request.timeoutInterval = Gateway.stallSeconds
    return request
  }
}

public struct GatewayError: Error, LocalizedError, Sendable {
  public let message: String
  /** The host answered and refused (a 4xx): retrying the same call will not help. */
  public let refused: Bool
  /** The HTTP status, when the box answered at all. */
  public let status: Int?
  public var errorDescription: String? { message }

  /** The box rests where the server lets it sleep, and this read did not wake it (`Gateway.command(_:_:wakes:)`). */
  public var resting = false

  public init(message: String, refused: Bool, status: Int? = nil) {
    self.message = message; self.refused = refused; self.status = status
  }

  /** A read that did not wake the resting box: the app shows what it kept instead, and says nothing went wrong. */
  public static var resting: GatewayError {
    var error = GatewayError(message: "Simeon's computer is asleep.", refused: false)
    error.resting = true
    return error
  }

  /** Whether an error is a read that let the box rest. */
  public static func isResting(_ error: Error) -> Bool { (error as? GatewayError)?.resting == true }

  /**
   * Whether the call surely never reached the host: no connection, or the
   * box's front door answering for a box that moved (502, 503, 504). Only
   * then is it sent again; a call that timed out may have been done, and a
   * second one would switch a tool back or run a routine twice.
   */
  public static func neverArrived(_ error: Error) -> Bool {
    if let gateway = error as? GatewayError { return [502, 503, 504].contains(gateway.status ?? 0) }
    if let url = error as? URLError {
      return [.notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .secureConnectionFailed].contains(url.code)
    }
    return false
  }
}

/**
 * The person's cloud computer, as the window reaches it
 * (desktop/web/gateway.ts): ask the broker where the box is
 * (`EnsureSandBox`), POST each command to `{gateway}/api/{method}`, read
 * events from `{gateway}/events`. Everything else the window does with the
 * agents happens in the host there; the app only asks and listens.
 *
 * Found and kept as the Electron app finds and keeps it (16 October 2026):
 * - At launch, the address kept from the last launch (`SavedGateway`) at
 *   once, while the broker is asked again in the background
 *   (`createGatewayConnectFastPath`); once this run has a live answer, the
 *   broker's answers only. A kept address is tried once: if it fails, the
 *   live answer is waited for.
 * - A known address is used as it is while the event stream is up, or
 *   while the box answered `/health` in the last 5 s; otherwise `/health`
 *   is asked first (1.5 s), and only when it does not answer is the broker
 *   asked again (`SandHostSupervisor.ensureConnection`). A dropped stream
 *   makes the next call ask `/health` (`invalidateHealthCache`).
 * - The broker saying the box server is full (`SAND_BOX_BLOCKED`) is not
 *   asked again until its `retry-after` (a minute without one, 15 minutes at
 *   most), as `BrokeredHostConnector.connect` holds it.
 * - The event stream dials again after 1, 2, 4, 8, then every 10 s
 *   (`SSE_RECONNECT_MIN_MS`, `SSE_RECONNECT_MAX_MS`), and a stream silent
 *   for 35 s is dead (`SSE_STALL_TIMEOUT_MS`).
 */
public actor Gateway {
  /** A box's `/health` answers within 1.5 s (`HEALTH_TIMEOUT_MS`)… */
  public static let healthTimeout: TimeInterval = 1.5
  /** …and is trusted for 5 s (`HEALTH_PROBE_TTL_MS`). */
  public static let healthTrusted: TimeInterval = 5
  /** A stream silent this long is dead (`SSE_STALL_TIMEOUT_MS`); the host pings every 15 s. */
  public static let stallSeconds: TimeInterval = 35
  /** A full box server is not asked again for its `retry-after`, else a minute, never more than 15 minutes (`BOX_BLOCKED_FALLBACK_HOLD_MS`, `BOX_BLOCKED_MAX_HOLD_MS`). */
  public static let blockedHold: TimeInterval = 60
  public static let blockedHoldMax: TimeInterval = 15 * 60
  /** The broker's refusal hints (`x-automation-failure-hint`). */
  static let hintHeader = "x-automation-failure-hint"
  static let blockedHint = "SAND_BOX_BLOCKED"
  static let noStorageHint = "CLOUD_AGENT_STORAGE_DISABLED"

  /** While the box sleeps, the broker's record of it is read again this often (`waitWhileAsleep`). */
  public static let asleepRecheck: TimeInterval = 15
  /** `GetSandBoxRunState`'s asleep (`SAND_BOX_RUN_STATE_HIBERNATED`). */
  static let runStateHibernated = 2
  /** `GetSandBoxRunState`'s none (`SAND_BOX_RUN_STATE_ABSENT`). */
  static let runStateAbsent = 1

  /** The wait before the event stream dials again after `failures` failures in a row: 1, 2, 4, 8, then 10 s. */
  public static func reconnectDelay(failures: Int) -> TimeInterval {
    min(10, pow(2, Double(max(failures, 1) - 1)))
  }

  private let api: SimeonAPI
  private let http: HTTPClient
  private let saved: SavedGatewayStore?
  /** Seconds that only go forward (the uptime), for the health and hold clocks. */
  private let clock: @Sendable () -> TimeInterval
  private let now: @Sendable () -> Date
  private var connection: GatewayConnection?
  private var resolving: Task<GatewayConnection, Error>?
  private var lastHealthyAt = -TimeInterval.infinity
  private var healthEpoch = 0
  private var streamLive = false
  /** This run has had a live answer from the broker: from then on the kept address is not used. */
  private var hasLiveConnection = false
  /** The kept address has been handed out once this run. */
  private var keptUsed = false
  private var deniedScopes: Set<String> = []
  private var blocked: (error: Error, until: TimeInterval)?
  /** The box rests where the server lets it (`waitWhileAsleep`, `checkedAtLaunch`); nil once it is known awake. */
  public private(set) var rest: Rest?
  /** The server's latest word this launch on whether the box may sleep (EnsureSandBox's, or the record's): nil until it says. */
  private var serverLetsSleep: Bool?
  /** The launch's question, asked once (`checkedAtLaunch`). */
  private var launchCheck: Task<Void, Never>?
  /** A second's wait (the tests' is at once). */
  private let pause: @Sendable (TimeInterval) async -> Void

  public init(api: SimeonAPI, http: HTTPClient = URLSessionClient(), saved: SavedGatewayStore? = nil, clock: @escaping @Sendable () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }, now: @escaping @Sendable () -> Date = { Date() }, pause: @escaping @Sendable (TimeInterval) async -> Void = { try? await Task.sleep(nanoseconds: UInt64($0 * 1_000_000_000)) }) {
    self.api = api; self.http = http; self.saved = saved; self.clock = clock; self.now = now; self.pause = pause
  }

  /**
   * Where the box is now: the known address while it answers, else the
   * broker's (`ensureConnection`). Not for a read that lets the box rest
   * (`wakes` false): where the server lets it sleep, a box the record says
   * rests is not asked for, which would wake it (or make it).
   */
  public func currentConnection(wakes: Bool = true) async throws -> GatewayConnection {
    if let cached = connection {
      if streamLive { return cached }
      if clock() - lastHealthyAt < Self.healthTrusted { return cached }
      let epoch = healthEpoch
      if await answersHealth(cached) {
        if epoch == healthEpoch { lastHealthyAt = clock() }
        // It answers: awake (woken for its work since the record was read).
        rest = nil
        return cached
      }
    }
    // A read waits for a wake already under way (an action's); otherwise it lets a resting box rest.
    if !wakes, resolving == nil { try await holdWhileResting(ask: true) }
    if !hasLiveConnection, !keptUsed, let kept = keptConnection() {
      // The Electron app's fast path: the kept address now, the broker asked meanwhile (its answer replaces it when it comes).
      keptUsed = true
      _ = live()
      connection = kept
      lastHealthyAt = -.infinity
      return kept
    }
    return try await live().value
  }

  /** Forget where the box was: the next call asks the broker again (a restarted box can move). */
  public func invalidate() {
    connection = nil
    keptUsed = true
    lastHealthyAt = -.infinity
  }

  /** A broker call is out (for the tests). */
  var isAskingBroker: Bool { resolving != nil }

  /** The stream is up: its address needs no `/health` while it lasts. */
  func streamConnected() { streamLive = true; rest = nil }

  /** The stream dropped (the Electron app's `transport-down`): the next call asks `/health` before it trusts the address. */
  func streamDropped() {
    streamLive = false
    healthEpoch += 1
    lastHealthyAt = -.infinity
  }

  /** The address kept from an earlier launch, for the account signed in now. */
  private func keptConnection() -> GatewayConnection? {
    guard let saved, let scope = api.accountScope, !deniedScopes.contains(scope) else { return nil }
    return SavedGateway.decode(saved.read(), accountScope: scope, now: now())
  }

  /** One `EnsureSandBox` at a time; its answer becomes the address and is kept for the next launch. */
  private func live() -> Task<GatewayConnection, Error> {
    if let resolving { return resolving }
    if let held = blocked, clock() < held.until {
      let error = held.error
      return Task { throw error }
    }
    let api = self.api
    let scope = api.accountScope
    let task = Task<GatewayConnection, Error> {
      do {
        let fresh = try GatewayConnection(box: try await api.connect("EnsureSandBox"))
        self.answered(fresh, scope: scope)
        return fresh
      } catch {
        self.refused(error, scope: scope)
        throw error
      }
    }
    resolving = task
    return task
  }

  private func answered(_ fresh: GatewayConnection, scope: String?) {
    resolving = nil
    blocked = nil
    // The broker answered: the box is awake (woken for an action here, or made).
    rest = nil
    // Signed out, or into another account, while the broker answered: nothing is kept (`scopeAtDispatch`).
    guard api.accountScope == scope else { return }
    hasLiveConnection = true
    connection = fresh
    serverLetsSleep = fresh.letsSleep
    lastHealthyAt = -.infinity
    if let scope {
      deniedScopes.remove(scope)
      saved?.write(SavedGateway.encode(fresh, accountScope: scope, savedAt: now()))
    }
  }

  private func refused(_ error: Error, scope: String?) {
    resolving = nil
    guard let refusal = error as? SimeonAPIError else { return }
    let hint = refusal.header(Self.hintHeader)
    if hint == Self.blockedHint {
      let retryAfter = refusal.header("retry-after").flatMap(Double.init).flatMap { $0 > 0 ? $0 : nil }
      blocked = (error, clock() + min(retryAfter ?? Self.blockedHold, Self.blockedHoldMax))
    }
    // Refused for this account (no access, no storage): its kept address goes (`isBrokerDenial`).
    let denied = hint == Self.noStorageHint || (hint == nil && (refusal.status == 401 || refusal.status == 403))
    if denied, let scope, api.accountScope == scope {
      deniedScopes.insert(scope)
      saved?.write(nil)
    }
  }

  /**
   * After the stream dropped, a box the server lets sleep (`letsSleep`) and
   * records as asleep, or not made yet, is not dialled: dialling would wake
   * it, or make it (26 October 2026, the computer used only for runs). This
   * waits, telling `onAsleep`, until the record says it runs (woken for its
   * work: a message, a routine), or until something here needed it and the
   * broker woke it (an action, which clears `rest`). True when it waited;
   * false when the box is not known to rest, and the stream dials as before.
   * With `ask` false it waits only for a rest already known (the launch's
   * question, `checkedAtLaunch`), without asking again. A record that says
   * it runs ends the asleep state (`onAsleep(false)`): a box that runs and
   * does not answer is a failure the app shows.
   */
  public func waitWhileAsleep(_ onAsleep: @Sendable (Bool) -> Void, ask: Bool = true) async -> Bool {
    await checkedAtLaunch()
    guard letsSleep else { return false }
    if rest == nil {
      guard ask, let record = await recordNow() else { return false }
      // Running, or the server no longer lets it sleep: dialled, and a failure to reach it shows.
      guard letsSleep, let resting = record.rest else {
        onAsleep(false)
        return false
      }
      rest = resting
    }
    onAsleep(true)
    var waited: TimeInterval = 0
    while !Task.isCancelled {
      await pause(1)
      if rest == nil { return true }
      waited += 1
      if waited >= Self.asleepRecheck {
        waited = 0
        guard let record = await recordNow() else { continue }
        rest = letsSleep ? record.rest : nil
        if rest == nil { return true }
      }
    }
    return true
  }

  /**
   * The server is waking the box (28 October 2026): a message handed to it
   * (`Store.handToServer`) wakes the box from the server's side, and the
   * event stream, resting, looked again only every `asleepRecheck` seconds,
   * so the answer showed up to fifteen seconds late. Resting no more, the
   * stream dials now: the broker is asked for the box, which waits for the
   * wake under way, and the answer streams as it is written.
   */
  public func waking() {
    rest = nil
  }

  /** A box that rests where the server lets it (step 4): asleep, or not made yet (a new account, before its first task). */
  public enum Rest: Sendable, Equatable { case asleep, absent }

  /** The broker's record of the box (`GetSandBoxRunState` with `fromRecord`): resting or not; nil when it could not be asked. Its word on sleep is kept (`letsSleep`). */
  struct Record: Equatable { let rest: Rest? }

  private func recordNow() async -> Record? {
    guard let answer = try? await api.connect("GetSandBoxRunState", ["fromRecord": true]) else { return nil }
    let state = answer["state"]?.int
    let named = answer["state"]?.text
    let rest: Rest? = state == Self.runStateHibernated || named == "SAND_BOX_RUN_STATE_HIBERNATED" ? .asleep
      : state == Self.runStateAbsent || named == "SAND_BOX_RUN_STATE_ABSENT" ? .absent : nil
    if let says = answer["letsSleep"]?.bool { serverLetsSleep = says }
    return Record(rest: rest)
  }

  /**
   * Whether the server lets the box sleep while the app is open, by its
   * latest word this launch (EnsureSandBox's answer, or the record's), else
   * the answer kept from the last launch: a switch turned off is heard at
   * once. False wherever it never said so: nothing here changes then.
   */
  var letsSleep: Bool { serverLetsSleep ?? keptConnection()?.letsSleep ?? false }

  /**
   * The launch's one question (step 4): before anything here would wake the
   * box (or make a new account's), the record is asked, where the server let
   * it sleep at the last launch or nothing was kept (a new device, a new
   * account). Asleep or not made, `rest` says so, and reads wait for it
   * (`command(_:_:wakes:)`). Once, and not after the broker has answered.
   */
  func checkedAtLaunch() async {
    if let launchCheck { return await launchCheck.value }
    let task = Task { await self.checkAtLaunch() }
    launchCheck = task
    await task.value
  }

  private func checkAtLaunch() async {
    guard !hasLiveConnection else { return }
    if let kept = keptConnection(), !kept.letsSleep { return }
    guard let record = await recordNow(), letsSleep, !hasLiveConnection else { return }
    rest = record.rest
  }

  /** Where the box rests, once the launch's question is answered (the first run's gate). */
  public func restAtLaunch() async -> Rest? {
    await checkedAtLaunch()
    return letsSleep ? rest : nil
  }

  /** Whether the box answers `/health` within 1.5 s with `ok` (`fetchHealth`). */
  private func answersHealth(_ connection: GatewayConnection) async -> Bool {
    guard let url = URL(string: connection.baseURL + "/health") else { return false }
    var request = URLRequest(url: url)
    for (name, value) in connection.headers() { request.setValue(value, forHTTPHeaderField: name) }
    request.timeoutInterval = Self.healthTimeout
    guard let answer = try? await http.send(request), answer.ok else { return false }
    return answer.json?["ok"]?.bool == true
  }

  /**
   * One command. A call that never reached the box (no connection, a moved
   * box) asks the broker once more and is sent once more; any other failure
   * is the caller's. A read that lets the box rest (`wakes` false: the list,
   * a chat's lines, what the app reads as it opens; 26 October 2026) does
   * not wake a box the server lets sleep, nor make a new account's: while it
   * rests, it fails at once (`GatewayError.resting`), and the app shows
   * what it kept and the server's copy. Everything else wakes it, as before.
   */
  public func command(_ method: String, _ args: JSON = [:], wakes: Bool = true) async throws -> JSON {
    if !wakes { try await holdWhileResting(ask: false) }
    do {
      return try await send(method, args, wakes: wakes)
    } catch where GatewayError.neverArrived(error) {
      // A read that found the box gone where it may sleep: asleep now, and not woken for it.
      if !wakes { try await holdWhileResting(ask: true) }
      invalidate()
      return try await send(method, args, wakes: wakes)
    }
  }

  /**
   * A read that waits for the box, without waking it (step 4): what a screen
   * reads once and keeps nothing of (a chat's "/" and "@", its pictures and
   * file cards). While the box rests where the server lets it, it waits until
   * the box is awake (woken for its work, or by an action here), then reads;
   * elsewhere it is the command itself. Ended with the screen (cancelled).
   */
  public func commandWhenAwake(_ method: String, _ args: JSON = [:]) async throws -> JSON {
    while true {
      do {
        return try await command(method, args, wakes: false)
      } catch where GatewayError.isResting(error) {
        while letsSleep, rest != nil {
          try Task.checkCancellation()
          await pause(1)
        }
        try Task.checkCancellation()
      }
    }
  }

  /** Throws `resting` while the box rests where the server lets it: as known (the launch's question), or, with `ask`, as the record says now. */
  private func holdWhileResting(ask: Bool) async throws {
    await checkedAtLaunch()
    guard letsSleep else { return }
    if rest == nil, ask, let record = await recordNow(), letsSleep { rest = record.rest }
    if rest != nil { throw GatewayError.resting }
  }

  private func send(_ method: String, _ args: JSON, wakes: Bool = true) async throws -> JSON {
    let connection = try await currentConnection(wakes: wakes)
    let answer = try await http.send(connection.commandRequest(method, args))
    guard answer.ok else {
      let detail = answer.json?["error"]?.text ?? answer.json?["message"]?.text ?? String(decoding: answer.body.prefix(300), as: UTF8.self)
      throw GatewayError(message: "\(method): \(detail)", refused: answer.status < 500, status: answer.status)
    }
    // The box answered: awake, and the stream need not wait for the record to say so.
    rest = nil
    return answer.json ?? .null
  }

  #if canImport(Darwin)
  /**
   * The host's events until the task is cancelled, dialling again after 1,
   * 2, 4, 8, then every 10 s, as the Electron app does (`runEventLoop`). A
   * stream that was up and dropped makes the next dial ask the box's
   * `/health` first, and the broker only when that does not answer
   * (`currentConnection`). `onState` hears "connected" and "down".
   */
  public nonisolated func events(onState: @escaping @Sendable (Bool) -> Void = { _ in }, onAsleep: @escaping @Sendable (Bool) -> Void = { _ in }) -> AsyncStream<GatewayEvent> {
    AsyncStream { continuation in
      let task = Task {
        var failures = 0
        while !Task.isCancelled {
          // Resting where the server lets it, as the launch's question found (asleep, or a new account's not made yet): not dialled.
          if await self.waitWhileAsleep(onAsleep, ask: false) { failures = 0 }
          var connected = false
          do {
            let connection = try await self.currentConnection()
            let (bytes, response) = try await URLSession.shared.bytes(for: connection.eventsRequest())
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
              throw GatewayError(message: "events answered \((response as? HTTPURLResponse)?.statusCode ?? 0)", refused: false)
            }
            failures = 0
            connected = true
            await self.streamConnected()
            onState(true)
            var parser = EventStreamParser()
            var buffer: [UInt8] = []
            buffer.reserveCapacity(4096)
            for try await byte in bytes {
              buffer.append(byte)
              if byte == 0x0A {
                for event in parser.feed(bytes: buffer) { continuation.yield(event) }
                buffer.removeAll(keepingCapacity: true)
              }
            }
          } catch {
            if Task.isCancelled {
              if connected { await self.streamDropped() }
              break
            }
          }
          if connected { await self.streamDropped() }
          onState(false)
          failures += 1
          // A box the server lets sleep, asleep: not dialled until it wakes for its work or something here needs it.
          if await self.waitWhileAsleep(onAsleep) {
            failures = 0
            continue
          }
          try? await Task.sleep(nanoseconds: UInt64(Gateway.reconnectDelay(failures: failures) * 1_000_000_000))
        }
        continuation.finish()
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
  #endif
}
