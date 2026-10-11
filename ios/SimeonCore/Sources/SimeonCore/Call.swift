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
  /** What the agent is doing for the call ("Sending the agenda to Dana…"), the banner's status line. */
  public var activity: String? = nil
  /** The call could not start: `status` says why ("Couldn't connect", "Calls aren't switched on yet"…). */
  public var failed = false

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
  /** A finished or failed call put away now (the banner's Close, or its time up). */
  func dismiss()
}

extension CallEngine {
  public func dismiss() {}
}

/**
 * What the Mac's call banner shows for each moment of a call
 * (desktop/source/shared/voice-call/call-state.ts `bannerView`, the banner's
 * stylesheet): its look, its status line, the waveform or not, and its
 * buttons.
 */
public enum CallBanner {
  /** The banner's `data-state`. */
  public enum Look: String, Sendable { case ringing, speaking, listening, working, ended, failed }

  /** 360 pt wide, 12 pt under the menu bar and 16 pt from the screen's right edge (`voice-call-window.ts`). */
  public static let width = 360.0
  public static let insetTop = 12.0
  public static let insetRight = 16.0
  /** A finished call goes after this; a failed one after this unless the pointer is on it (`call-controller.ts`). */
  public static let endedStays = 1.2
  public static let failedStays = 20.0
  /** The waveform: 46 bars, at most 16 pt above their 2 pt floor while the agent speaks, 12 while it listens. */
  public static let bars = 46
  static let speakingHeight = 16.0
  static let listeningHeight = 12.0
  public static let emptyTranscript = "What you both say shows up here."

  public static func look(_ call: CallState) -> Look {
    if call.failed { return .failed }
    switch call.phase {
    case .ringing: return .ringing
    case .ended: return .ended
    case .live: return call.activity != nil ? .working : call.agentSpeaking ? .speaking : .listening
    }
  }

  /** The line under the name: "Calling…", the time, what the agent is doing, "Call ended · 2:48", or why it failed. */
  public static func status(_ call: CallState, now: Date = Date()) -> String {
    switch look(call) {
    case .ringing: return VoiceCallText.calling
    case .working: return call.activity ?? ""
    case .speaking, .listening: return Chat.callClock(call.seconds(now: now))
    case .ended: return call.connectedAt == nil ? VoiceCallText.ended : "\(VoiceCallText.ended) · \(Chat.callClock(call.seconds(now: now)))"
    case .failed: return call.status.isEmpty ? VoiceCallText.couldNotConnect : call.status
    }
  }

  /** The waveform shows while the call is live and the agent is not working on something. */
  public static func hasWave(_ call: CallState) -> Bool { [.speaking, .listening].contains(look(call)) }

  /** Each bar's height in points, from the call's levels: highest in the middle, falling off to the edges (`setLevels`). */
  public static func barHeights(_ levels: [Double], speaking: Bool, bars: Int = bars) -> [Double] {
    let amplitude = speaking ? speakingHeight : listeningHeight
    return (0..<bars).map { index in
      let window = sin(Double.pi * (Double(index) + 0.5) / Double(bars))
      let level = levels.isEmpty ? 0 : max(0, min(1, levels[index * levels.count / bars]))
      return 2 + level * amplitude * window
    }
  }
}

/**
 * A call written into the chat by a host from before 2 October 2026: one
 * agent message, "Voice call · 2:48" and its recap under a blank line
 * (`callRecordText`); the window draws it as a row that opens on its recap
 * (`__simeonCallRecordParse`).
 */
public struct CallRecord: Equatable, Sendable {
  public let duration: String
  public let recap: String?

  public static func parse(_ text: String) -> CallRecord? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    // Every agent message is asked: most are not, and need no pattern.
    guard trimmed.hasPrefix("Voice call · "), let regex = try? NSRegularExpression(pattern: #"^Voice call · (\d{1,2}:\d{2}(?::\d{2})?)(?:\n\n([\s\S]+))?$"#),
          let match = regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
          let duration = Range(match.range(at: 1), in: trimmed) else { return nil }
    let recap = Range(match.range(at: 2), in: trimmed).map { String(trimmed[$0]).trimmingCharacters(in: .whitespacesAndNewlines) }
    return CallRecord(duration: String(trimmed[duration]), recap: recap?.isEmpty == false ? recap : nil)
  }
}

/** `SIMEON_VOICE_CALLS`: calls are on unless it says `0`, `off`, `false` or `no` (`voiceCallsEnabled`). */
public func voiceCallsEnabled(_ environment: [String: String] = ProcessInfo.processInfo.environment) -> Bool {
  let value = environment["SIMEON_VOICE_CALLS"]?.trimmingCharacters(in: .whitespaces).lowercased()
  return !["0", "off", "false", "no"].contains(value ?? "")
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
