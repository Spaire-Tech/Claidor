import Foundation

/** A voice call as the screens draw it (desktop/demo/call.ts, the Mac's banner states). */
public struct CallState: Sendable, Equatable {
  public enum Phase: String, Sendable { case ringing, live, ended }

  public var phase: Phase
  /** "Calling…", "Call ended", or empty while live. */
  public var status: String
  public var agentId: String
  public var agentName: String
  public var agentColour: String
  public var isMuted: Bool
  public var agentSpeaking: Bool
  /** The waveform: 24 bars, 0 to 1. */
  public var levels: [Double]
  public var lines: [CallLine]
  public var connectedAt: Date?
  public var endedAt: Date?

  /** Seconds since the call connected (or until it ended). */
  public func seconds(now: Date = Date()) -> Int {
    guard let connectedAt else { return 0 }
    return max(0, Int((endedAt ?? now).timeIntervalSince(connectedAt)))
  }
}

/** Places the call, mutes it, ends it; tells the screens each change. */
public protocol CallEngine: AnyObject, Sendable {
  func start(agentId: String, agentName: String, colour: String)
  func mute(_ muted: Bool)
  func hangUp()
  /** Every change, from now on; nil when the call is gone. */
  func observe(_ listener: @escaping @Sendable (CallState?) -> Void)
}

/**
 * The review link's scripted call (desktop/demo/call.ts), beat for beat:
 * it rings for 2.4 s, Theo-style lines arrive, the waveform moves louder
 * while the agent speaks, and an ended call leaves after 1.2 s, as the
 * Mac's banner does (ENDED_DISMISS_MS).
 */
public final class DemoCall: CallEngine, @unchecked Sendable {
  private enum Beat { case live, speak, listen, line(CallLine) }

  private static let script: [(Double, Beat)] = [
    (2.4, .live),
    (3.0, .speak),
    (3.2, .line(CallLine(fromPerson: false, text: "Hey Bass. What can I do for you?"))),
    (5.2, .listen),
    (7.6, .line(CallLine(fromPerson: true, text: "Can you move the launch review to Friday?"))),
    (8.4, .speak),
    (8.6, .line(CallLine(fromPerson: false, text: "Done. It's Friday at 2 pm, and Dana and Marcus have the new time."))),
    (11.8, .listen),
    (14.2, .line(CallLine(fromPerson: true, text: "Perfect, thanks."))),
    (14.8, .speak),
    (15.0, .line(CallLine(fromPerson: false, text: "Anytime. Anything else?"))),
    (16.8, .listen),
  ]

  private let lock = NSLock()
  private var state: CallState?
  private var listeners: [@Sendable (CallState?) -> Void] = []
  private var tasks: [Task<Void, Never>] = []
  private let speed: Double

  /** `speed` above 1 plays the script faster (the screenshots use it). */
  public init(speed: Double = 1) { self.speed = speed }

  public func observe(_ listener: @escaping @Sendable (CallState?) -> Void) {
    lock.lock(); listeners.append(listener); let current = state; lock.unlock()
    listener(current)
  }

  private func update(_ change: (inout CallState) -> Void) {
    lock.lock()
    guard var next = state else { lock.unlock(); return }
    change(&next)
    state = next
    let all = listeners
    lock.unlock()
    for listener in all { listener(next) }
  }

  private func set(_ value: CallState?) {
    lock.lock(); state = value; let all = listeners; lock.unlock()
    for listener in all { listener(value) }
  }

  public func start(agentId: String, agentName: String, colour: String) {
    lock.lock(); let busy = state != nil; lock.unlock()
    if busy { return }
    set(CallState(phase: .ringing, status: "Calling…", agentId: agentId, agentName: agentName, agentColour: colour, isMuted: false, agentSpeaking: false, levels: [], lines: [], connectedAt: nil, endedAt: nil))
    var started: [Task<Void, Never>] = []
    for (at, beat) in Self.script {
      started.append(Task { [weak self] in
        try? await Task.sleep(nanoseconds: UInt64(at / (self?.speed ?? 1) * 1_000_000_000))
        guard !Task.isCancelled, let self else { return }
        switch beat {
        case .live: self.update { $0.phase = .live; $0.status = ""; $0.connectedAt = Date() }
        case .speak: self.update { $0.agentSpeaking = true }
        case .listen: self.update { $0.agentSpeaking = false }
        case .line(let line): self.update { $0.lines.append(line) }
        }
      })
    }
    // The waveform: a voice's loudness, bar by bar, louder while the agent speaks.
    started.append(Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 90_000_000)
        guard let self else { return }
        self.update { call in
          guard call.phase == .live else { return }
          let loud = call.agentSpeaking ? 1 : call.isMuted ? 0 : 0.35
          call.levels = (0..<24).map { _ in loud * (0.25 + Double.random(in: 0...0.75)) }
        }
      }
    })
    lock.lock(); tasks = started; lock.unlock()
  }

  public func mute(_ muted: Bool) { update { $0.isMuted = muted } }

  public func hangUp() {
    lock.lock(); let current = state; let running = tasks; tasks = []; lock.unlock()
    guard let current, current.phase != .ended else { return }
    for task in running { task.cancel() }
    update { $0.phase = .ended; $0.status = "Call ended"; $0.agentSpeaking = false; $0.levels = []; $0.endedAt = Date() }
    let leave = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 1_200_000_000)
      guard !Task.isCancelled else { return }
      self?.set(nil)
    }
    lock.lock(); tasks.append(leave); lock.unlock()
  }
}
