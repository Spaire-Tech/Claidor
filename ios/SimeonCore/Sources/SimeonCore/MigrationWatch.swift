import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/**
 * A Connect server stream's body (`server/simeon/sand/connect.py`): each
 * message an envelope of one flags byte, a four-byte big-endian length and
 * the JSON; the last has flags 0x02 and carries `{}` or `{error}`.
 */
public struct ConnectEnvelopes: Sendable {
  public enum Frame: Equatable, Sendable {
    case message(JSON)
    /** The end of the stream: its error's message, if it ended on one. */
    case end(error: String?)
  }

  private var buffer: [UInt8] = []

  public init() {}

  /** Bytes as they arrive; the frames they finished. */
  public mutating func feed(_ bytes: some Sequence<UInt8>) -> [Frame] {
    buffer.append(contentsOf: bytes)
    var frames: [Frame] = []
    while buffer.count >= 5 {
      let flags = buffer[0]
      let length = Int(buffer[1]) << 24 | Int(buffer[2]) << 16 | Int(buffer[3]) << 8 | Int(buffer[4])
      guard buffer.count >= 5 + length else { break }
      let body = Data(buffer[5..<(5 + length)])
      buffer.removeFirst(5 + length)
      let json = (try? JSON.parse(String(decoding: body, as: UTF8.self))) ?? [:]
      if flags & 0x02 != 0 {
        frames.append(.end(error: json["error"].map { $0["message"]?.text ?? $0["code"]?.text ?? "the stream failed" }))
      } else {
        frames.append(.message(json))
      }
    }
    return frames
  }

  /** One message as an envelope, for the request's body. */
  public static func envelope(_ message: JSON) -> Data {
    let body = (try? message.data()) ?? Data("{}".utf8)
    var data = Data([0, UInt8(body.count >> 24 & 0xff), UInt8(body.count >> 16 & 0xff), UInt8(body.count >> 8 & 0xff), UInt8(body.count & 0xff)])
    data.append(body)
    return data
  }
}

/**
 * What a recreate the person asked for answered (`box-host-connector.ts`):
 * started, with the operation to follow; started with nothing to follow it
 * by; or refused, with the words to show.
 */
public enum RecreateAnswer: Equatable, Sendable {
  case started(operationId: String)
  case untrackable
  case rejected(String)

  /** `RecreateSandBox` / `ForceRecreateSandBox`'s `{started, reason, operationId}`. */
  static func read(_ answer: JSON, preserveData: Bool) -> RecreateAnswer {
    guard answer["started"]?.bool == true else {
      let reason = answer["reason"]?.string ?? ""
      switch (preserveData, reason.isEmpty) {
      case (true, true): return .rejected(L10n.text("Couldn't update the computer. It is unchanged."))
      case (true, false): return .rejected(L10n.text("Couldn't update the computer (\(reason)). It is unchanged."))
      case (false, true): return .rejected(L10n.text("Couldn't reset the computer. It is unchanged."))
      case (false, false): return .rejected(L10n.text("Couldn't reset the computer (\(reason)). It is unchanged."))
      }
    }
    return answer["operationId"]?.text.map { .started(operationId: $0) } ?? .untrackable
  }
}

/**
 * The server's record of the computer being replaced, followed while the
 * app runs (`createSandBoxMigrationRelay`): the stream read again 3 s after
 * it ends, from where it stopped; a stream silent for 30 s while a step is
 * under way is dropped and read again, twenty times at most; and the last
 * event (or the last finished one) kept for the window to read back. While
 * the server says the account has no computer, it is asked less and less
 * often (`reattachWait`; the upstream app asks every 3 s whatever it says).
 */
public final class MigrationRelay: @unchecked Sendable {
  public static let reattach: TimeInterval = 3
  public static let stall: TimeInterval = 30
  public static let maxStallReattaches = 20
  /** The longest wait between two reads while the server says there is no computer. */
  public static let maxReattach: TimeInterval = 60
  /**
   * A stream the server ends this soon with nothing in it says the account has no computer: it ends at once for one
   * with none (`watch_sand_box_migration`, server/simeon/sand/box_broker.py), and holds a computer's open 25 s while
   * nothing happens (`MigrationLog.idle`, box_service.py).
   */
  public static let noComputerWithin: TimeInterval = 5

  private let lock = NSLock()
  private var lastUpdate: MigrationEvent?
  private var lastTerminal: MigrationEvent?
  private var resumeOffset = ""
  private var listeners: [UUID: (MigrationEvent) -> Void] = [:]
  private var running: Task<Void, Never>?
  private var attempt: Task<Bool, Never>?
  private var watching = false
  private var watchdog: Task<Void, Never>?
  private var remainingStalls = 0
  private var owed: String?
  /** How many reads running the server said there is no computer. */
  private var noComputer = 0
  /** The wait before the next read, while it lasts. */
  private var pausing: Task<Void, Never>?
  private let open: @Sendable (String) -> AsyncThrowingStream<JSON, Error>
  private let pause: @Sendable (TimeInterval) async -> Void
  private let now: @Sendable () -> Date

  /** `open` reads the stream from an offset (`WatchSandBoxMigration {fromOffsetKey, includeFinished: true}`); `pause` and `now` are the tests'. */
  public init(open: @escaping @Sendable (String) -> AsyncThrowingStream<JSON, Error>,
              pause: @escaping @Sendable (TimeInterval) async -> Void = { try? await Task.sleep(nanoseconds: UInt64($0 * 1_000_000_000)) },
              now: @escaping @Sendable () -> Date = { Date() }) {
    self.open = open; self.pause = pause; self.now = now
  }

  /**
   * The wait before the stream is read again after the server said `streak` times running that there is no computer:
   * 3 s, then doubled each time, 60 s at most; 3 s again once it says anything else (an event, a computer's quiet
   * stream, a failure), at a new sign-in (a new relay) and when the stream is followed again (`start`).
   */
  public static func reattachWait(noComputerStreak streak: Int) -> TimeInterval {
    guard streak > 1 else { return reattach }
    return min(reattach * Double(1 << min(streak - 1, 5)), maxReattach)
  }

  /** What the window reads back on connecting (`getBoxMigrationStatus`). */
  public var status: MigrationEvent? { lock.withLock { lastUpdate ?? lastTerminal } }

  /** Each event as it comes, until the returned function is called. */
  public func listen(_ handler: @escaping (MigrationEvent) -> Void) -> () -> Void {
    let id = UUID()
    lock.withLock { listeners[id] = handler }
    return { [weak self] in self?.lock.withLock { self?.listeners[id] = nil } }
  }

  public func start() {
    lock.lock()
    guard running == nil else { lock.unlock(); return }
    noComputer = 0
    running = Task { [weak self] in await self?.loop() }
    lock.unlock()
  }

  public func stop() {
    lock.lock()
    running?.cancel(); running = nil; attempt?.cancel(); attempt = nil; watchdog?.cancel(); watchdog = nil; owed = nil
    lock.unlock()
  }

  /** A recreate was accepted: watch for its steps (`noteRecreateAccepted`). */
  public func recreateAccepted(_ operationId: String?) {
    lock.withLock {
      owed = operationId
      // There is a computer now (a recreate is refused without one): read again at once if it was being asked less often.
      if noComputer > 1 { pausing?.cancel() }
      noComputer = 0
    }
    arm(operationId)
  }

  private func loop() async {
    while !Task.isCancelled {
      let from = lock.withLock { resumeOffset }
      let began = now()
      let stream = open(from)
      // Whether the server ended it with nothing in it (not a failure, nor cut by the watchdog).
      let task = Task { [weak self] () -> Bool in
        var received = false
        do {
          for try await message in stream {
            received = true
            self?.take(message)
          }
        } catch {
          // A stream that failed before anything came starts over from the beginning (the offset may be gone).
          if !received, !from.isEmpty, !Task.isCancelled { self?.lock.withLock { self?.resumeOffset = "" } }
          return false
        }
        return !received && !Task.isCancelled
      }
      lock.withLock { attempt = task }
      let empty = await task.value
      let saysNoComputer = empty && now().timeIntervalSince(began) < Self.noComputerWithin
      let wait: TimeInterval = lock.withLock {
        lastUpdate = nil; if attempt == task { attempt = nil }
        noComputer = saysNoComputer ? noComputer + 1 : 0
        return Self.reattachWait(noComputerStreak: noComputer)
      }
      if Task.isCancelled { break }
      let pause = self.pause
      let waiting = Task { await pause(wait) }
      lock.withLock { pausing = waiting }
      // A stop ends the wait too.
      await withTaskCancellationHandler { await waiting.value } onCancel: { waiting.cancel() }
      lock.withLock { if pausing == waiting { pausing = nil } }
    }
  }

  private func take(_ message: JSON) {
    if let offset = message["offsetKey"]?.text { lock.withLock { resumeOffset = offset } }
    guard let event = MigrationEvent(server: message) else { return }
    let handlers: [(MigrationEvent) -> Void] = lock.withLock {
      lastUpdate = event
      if event.phase.isTerminal { lastTerminal = event }
      else if let terminal = lastTerminal, event.operationId != nil, !sameOperation(terminal.operationId, event.operationId) { lastTerminal = nil }
      return Array(listeners.values)
    }
    if event.phase.isTerminal {
      let answersOwed = lock.withLock { owed == nil || sameOperation(owed, event.operationId) }
      if answersOwed { disarm() } else { kick() }
    } else {
      arm(event.operationId)
      kick()
    }
    for handler in handlers { handler(event) }
  }

  // MARK: The stall watchdog

  private func arm(_ operationId: String?) {
    lock.lock()
    remainingStalls = Self.maxStallReattaches
    guard watchdog == nil, running != nil else { lock.unlock(); return }
    owed = operationId
    lock.unlock()
    kick()
  }

  private func kick() {
    lock.lock()
    guard running != nil else { lock.unlock(); return }
    watchdog?.cancel()
    watchdog = Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(Self.stall * 1_000_000_000))
      guard !Task.isCancelled else { return }
      self?.stalled()
    }
    lock.unlock()
  }

  private func stalled() {
    lock.lock()
    if remainingStalls <= 0 { lock.unlock(); disarm(); return }
    remainingStalls -= 1
    attempt?.cancel()
    lock.unlock()
    kick()
  }

  private func disarm() {
    lock.withLock { watchdog?.cancel(); watchdog = nil; owed = nil }
  }
}

#if canImport(Darwin)
extension SimeonAPI {
  /** A server stream on the box broker, Connect JSON enveloped, message by message, until it ends or the task is cancelled. */
  public nonisolated func connectStream(_ method: String, _ message: JSON = [:]) -> AsyncThrowingStream<JSON, Error> {
    AsyncThrowingStream { continuation in
      let task = Task {
        do {
          var request = URLRequest(url: URL(string: self.base.absoluteString.trimmingTrailingSlashes + "/\(SimeonAPI.connectService)/\(method)")!)
          request.httpMethod = "POST"
          request.httpBody = ConnectEnvelopes.envelope(message)
          request.setValue("application/connect+json", forHTTPHeaderField: "content-type")
          request.setValue("1", forHTTPHeaderField: "connect-protocol-version")
          guard let token = await self.accessToken() else { throw SimeonAPIError(message: L10n.text("Sign in to Simeon first."), status: 401) }
          request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
          for (name, value) in self.clientHeaders { request.setValue(value, forHTTPHeaderField: name) }
          request.timeoutInterval = 60
          let (bytes, response) = try await URLSession.shared.bytes(for: request)
          guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw SimeonAPIError(message: "Simeon's cloud computer answered \(method) with \((response as? HTTPURLResponse)?.statusCode ?? 0).", status: (response as? HTTPURLResponse)?.statusCode ?? 0)
          }
          var reader = ConnectEnvelopes()
          for try await byte in bytes {
            for frame in reader.feed(CollectionOfOne(byte)) {
              switch frame {
              case .message(let json): continuation.yield(json)
              case .end(let error):
                if let error { throw SimeonAPIError(message: error, status: 0) }
                continuation.finish()
                return
              }
            }
          }
          continuation.finish()
        } catch {
          continuation.finish(throwing: error)
        }
      }
      continuation.onTermination = { _ in task.cancel() }
    }
  }
}
#endif
