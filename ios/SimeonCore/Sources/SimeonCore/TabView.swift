import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/**
 * The agent's own Chrome tab on the phone (15 October 2026), as the engine
 * streams it on `GET {gateway}/tab-view` (`host/box/tab-view.ts`): its
 * address, its pictures (JPEG, with the page's own size in CSS pixels, which
 * a tap is mapped with), and why it closed. The person's taps, scrolls,
 * typing and keys go back one at a time on `tabViewInput`.
 */
public enum TabViewEvent: Sendable, Equatable {
  case tab(url: String, title: String)
  case frame(jpeg: Data, width: Double, height: Double)
  case closed(reason: String)
}

/** The stream's server-sent events, line by line: a block of `data:` lines ends at a blank line and is one JSON event. */
public struct TabViewStreamParser: Sendable {
  private var dataLines: [String] = []
  private var pending: [UInt8] = []

  public init() {}

  public mutating func feed(line: String) -> TabViewEvent? {
    let clean = line.hasSuffix("\r") ? String(line.dropLast()) : line
    if clean.isEmpty {
      defer { dataLines.removeAll() }
      guard !dataLines.isEmpty, let json = try? JSON.parse(dataLines.joined(separator: "\n")) else { return nil }
      return Self.event(json)
    }
    if clean.hasPrefix("data:") { dataLines.append(String(clean.dropFirst(5)).trimmingCharacters(in: .whitespaces)) }
    return nil
  }

  public mutating func feed(bytes: some Sequence<UInt8>) -> [TabViewEvent] {
    var events: [TabViewEvent] = []
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

  static func event(_ json: JSON) -> TabViewEvent? {
    switch json["type"]?.string {
    case "tab":
      guard let url = json["url"]?.string else { return nil }
      return .tab(url: url, title: json["title"]?.string ?? "")
    case "frame":
      guard let encoded = json["jpeg"]?.string, let jpeg = Data(base64Encoded: encoded),
            let width = json["width"]?.double, let height = json["height"]?.double, width > 0, height > 0 else { return nil }
      return .frame(jpeg: jpeg, width: width, height: height)
    case "closed":
      return .closed(reason: json["reason"]?.string ?? "closed")
    default:
      return nil
    }
  }
}

/**
 * Where a touch on the phone's picture of the page falls on the page. The
 * picture is fitted into the view keeping the page's shape (`fitted`); a
 * touch outside it falls nowhere.
 */
public enum TabViewGeometry {
  public static func fitted(view: CGSize, page: CGSize) -> CGRect {
    guard view.width > 0, view.height > 0, page.width > 0, page.height > 0 else { return .zero }
    let scale = min(view.width / page.width, view.height / page.height)
    let size = CGSize(width: page.width * scale, height: page.height * scale)
    return CGRect(x: (view.width - size.width) / 2, y: (view.height - size.height) / 2, width: size.width, height: size.height)
  }

  public static func pagePoint(_ point: CGPoint, view: CGSize, page: CGSize) -> CGPoint? {
    let picture = fitted(view: view, page: page)
    guard picture.width > 0, picture.contains(point) else { return nil }
    let x = (point.x - picture.minX) / picture.width * page.width
    let y = (point.y - picture.minY) / picture.height * page.height
    return CGPoint(x: (x * 10).rounded() / 10, y: (y * 10).rounded() / 10)
  }

  /** A drag on the picture as the page scrolls it: the other way, in the page's pixels. */
  public static func scrollDelta(_ drag: CGSize, view: CGSize, page: CGSize) -> CGSize {
    let picture = fitted(view: view, page: page)
    guard picture.width > 0 else { return .zero }
    let scale = page.width / picture.width
    return CGSize(width: -drag.width * scale, height: -drag.height * scale)
  }
}

/** One thing the person does on the page. */
public enum TabInput: Sendable, Equatable {
  case tap(x: Double, y: Double)
  case scroll(x: Double, y: Double, dx: Double, dy: Double)
  case text(String)
  /** "Enter", "Backspace", "Tab" or "Escape". */
  case key(String)
  case control(Bool)

  public var json: JSON {
    switch self {
    case .tap(let x, let y): return ["kind": "tap", "x": .number(x), "y": .number(y)]
    case .scroll(let x, let y, let dx, let dy): return ["kind": "scroll", "x": .number(x), "y": .number(y), "dx": .number(dx), "dy": .number(dy)]
    case .text(let text): return ["kind": "text", "text": .string(text)]
    case .key(let key): return ["kind": "key", "key": .string(key)]
    case .control(let on): return ["kind": "control", "on": .bool(on)]
    }
  }

  /** Two in a row that go as one while the first waits: scrolls add up, typing joins. */
  func merged(with next: TabInput) -> TabInput? {
    switch (self, next) {
    case (.scroll(_, _, let dx, let dy), .scroll(let x, let y, let dx2, let dy2)): return .scroll(x: x, y: y, dx: dx + dx2, dy: dy + dy2)
    case (.text(let a), .text(let b)): return .text(a + b)
    default: return nil
    }
  }
}

/**
 * The person's inputs on the page, sent in order, one at a time: a tap
 * never overtakes the typing before it. Scrolls and typing that pile up
 * while one input is on its way go as one. A tap's answer says what took
 * the keyboard (`focus`: an input's type, "text", "frame", or "").
 */
public actor TabInputQueue {
  private let send: @Sendable (JSON) async throws -> JSON
  private var queue: [(input: TabInput, done: CheckedContinuation<JSON?, Never>?)] = []
  private var draining = false

  public init(send: @escaping @Sendable (JSON) async throws -> JSON) { self.send = send }

  /** Queued, not waited for (scrolls, typing, keys). */
  public func push(_ input: TabInput) {
    if let last = queue.last, last.done == nil, let merged = last.input.merged(with: input) {
      queue[queue.count - 1] = (merged, nil)
    } else {
      queue.append((input, nil))
    }
    drain()
  }

  /** Queued and waited for: the engine's answer, nil when it failed. */
  public func submit(_ input: TabInput) async -> JSON? {
    await withCheckedContinuation { continuation in
      queue.append((input, continuation))
      drain()
    }
  }

  /** What a tap moved the keyboard to; nil when it failed. */
  public func tap(x: Double, y: Double) async -> String? {
    guard let answer = await submit(.tap(x: x, y: y)), answer["ok"]?.bool == true else { return nil }
    return answer["focus"]?.string ?? ""
  }

  private func drain() {
    guard !draining else { return }
    draining = true
    Task { await self.run() }
  }

  private func run() async {
    while !queue.isEmpty {
      let next = queue.removeFirst()
      let answer = try? await send(next.input.json)
      next.done?.resume(returning: answer)
    }
    draining = false
  }
}

extension GatewayConnection {
  public static let tabViewPath = "/tab-view"

  /** The agent's tab, as long as the request stays open (`GET /tab-view`); the host pings every 15 s. */
  public func tabViewRequest(agentId: String, width: Int, height: Int, control: Bool) -> URLRequest? {
    guard var components = URLComponents(string: baseURL + Self.tabViewPath) else { return nil }
    components.queryItems = [
      URLQueryItem(name: "agent", value: agentId),
      URLQueryItem(name: "width", value: String(width)),
      URLQueryItem(name: "height", value: String(height)),
      URLQueryItem(name: "control", value: control ? "1" : "0"),
    ]
    guard let url = components.url else { return nil }
    var request = URLRequest(url: url)
    for (name, value) in headers(["accept": "text/event-stream"]) { request.setValue(value, forHTTPHeaderField: name) }
    request.timeoutInterval = 45
    return request
  }
}

extension Gateway {
  #if canImport(Darwin)
  /**
   * The agent's tab until the stream ends or the task is cancelled; it ends
   * with `.closed` (the engine's reason, or "disconnected"). No reconnect
   * here: the view asks again.
   */
  public nonisolated func tabView(agentId: String, width: Int, height: Int, control: Bool) -> AsyncStream<TabViewEvent> {
    AsyncStream { continuation in
      let task = Task {
        var closed = false
        do {
          let connection = try await self.currentConnection()
          guard let request = connection.tabViewRequest(agentId: agentId, width: width, height: height, control: control) else { throw GatewayError(message: "tab view address", refused: true) }
          let (bytes, response) = try await URLSession.shared.bytes(for: request)
          guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            continuation.yield(.closed(reason: "unavailable"))
            continuation.finish()
            return
          }
          var parser = TabViewStreamParser()
          var line: [UInt8] = []
          line.reserveCapacity(256 * 1024)
          for try await byte in bytes {
            line.append(byte)
            guard byte == 0x0A else { continue }
            for event in parser.feed(bytes: line) {
              continuation.yield(event)
              if case .closed = event { closed = true }
            }
            line.removeAll(keepingCapacity: true)
            if closed { break }
          }
        } catch {}
        if !closed && !Task.isCancelled { continuation.yield(.closed(reason: "disconnected")) }
        continuation.finish()
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
  #endif
}
