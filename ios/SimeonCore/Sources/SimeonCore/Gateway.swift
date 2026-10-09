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

  public let baseURL: String
  public let token: String?
  public let networkToken: String?
  /** The cloud computer's screen through the proxy, when it has one. */
  public let screenURL: String?
  /** Where each agent's own screen answers through the proxy (`forkVncBaseUrl`, the box's port 6081). */
  public let forkScreenBase: String?

  public init(baseURL: String, token: String?, networkToken: String?, screenURL: String? = nil, forkScreenBase: String? = nil) {
    self.baseURL = baseURL; self.token = token; self.networkToken = networkToken; self.screenURL = screenURL; self.forkScreenBase = forkScreenBase
  }

  public init(box: JSON) throws {
    guard let base = box["gatewayUrl"]?.text else {
      throw SimeonAPIError(message: "Simeon's cloud computer has no gateway address yet. Try again in a moment.", status: 0)
    }
    self.init(baseURL: base.trimmingTrailingSlashes, token: box["gatewayToken"]?.text, networkToken: box["networkToken"]?.text, screenURL: box["vncUrl"]?.text, forkScreenBase: box["forkVncBaseUrl"]?.text?.trimmingTrailingSlashes)
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
    // The host pings every 15 s (`SSE_HEARTBEAT_MS`); a stream silent for 45 s is dead (a phone that slept), so it errors and the loop reconnects.
    request.timeoutInterval = 45
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

  public init(message: String, refused: Bool, status: Int? = nil) {
    self.message = message; self.refused = refused; self.status = status
  }

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
 */
public actor Gateway {
  private let api: SimeonAPI
  private let http: HTTPClient
  private var connection: GatewayConnection?
  private var resolving: Task<GatewayConnection, Error>?

  public init(api: SimeonAPI, http: HTTPClient = URLSessionClient()) {
    self.api = api; self.http = http
  }

  /** Where the box is now, asking the broker when we do not know. */
  public func currentConnection() async throws -> GatewayConnection {
    if let connection { return connection }
    if let resolving { return try await resolving.value }
    let task = Task { try GatewayConnection(box: try await api.connect("EnsureSandBox")) }
    resolving = task
    defer { resolving = nil }
    let resolved = try await task.value
    connection = resolved
    return resolved
  }

  /** Forget where the box was: the next call asks the broker again (a restarted box can move). */
  public func invalidate() { connection = nil }

  /** One command. A call that never reached the box (no connection, a moved box) asks the broker once more and is sent once more; any other failure is the caller's. */
  public func command(_ method: String, _ args: JSON = [:]) async throws -> JSON {
    do {
      return try await send(method, args)
    } catch where GatewayError.neverArrived(error) {
      invalidate()
      return try await send(method, args)
    }
  }

  private func send(_ method: String, _ args: JSON) async throws -> JSON {
    let connection = try await currentConnection()
    let answer = try await http.send(connection.commandRequest(method, args))
    guard answer.ok else {
      let detail = answer.json?["error"]?.text ?? answer.json?["message"]?.text ?? String(decoding: answer.body.prefix(300), as: UTF8.self)
      throw GatewayError(message: "\(method): \(detail)", refused: answer.status < 500, status: answer.status)
    }
    return answer.json ?? .null
  }

  #if canImport(Darwin)
  /**
   * The host's events until the task is cancelled, reconnecting with a
   * growing wait (1 s to 15 s) and asking the broker again after two
   * failures in a row. `onState` hears "connected" and "down".
   */
  public nonisolated func events(onState: @escaping @Sendable (Bool) -> Void = { _ in }) -> AsyncStream<GatewayEvent> {
    AsyncStream { continuation in
      let task = Task {
        var failures = 0
        while !Task.isCancelled {
          do {
            let connection = try await self.currentConnection()
            let (bytes, response) = try await URLSession.shared.bytes(for: connection.eventsRequest())
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
              throw GatewayError(message: "events answered \((response as? HTTPURLResponse)?.statusCode ?? 0)", refused: false)
            }
            failures = 0
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
            if Task.isCancelled { break }
          }
          onState(false)
          failures += 1
          if failures >= 2 { await self.invalidate() }
          try? await Task.sleep(nanoseconds: UInt64(min(pow(2, Double(failures - 1)), 15) * 1_000_000_000))
        }
        continuation.finish()
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
  #endif
}
