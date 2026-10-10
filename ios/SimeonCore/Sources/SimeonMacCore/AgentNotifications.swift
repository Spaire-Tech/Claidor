import Foundation
import SimeonCore

/**
 * The Mac's own notifications (`shared/os-notification.ts`, main's
 * `os-notification-manager.ts`): "Iris needs you" when an agent starts
 * waiting on the person, with a sound; the agent's name and its new
 * message when a turn ends with one, silent. Never for what was there at
 * launch, a hidden agent, an agent whose notifications are off, while the
 * main window is focused, or twice for one agent and kind within 5 s.
 */
public enum AgentNotifications {
  public static let throttleMs: Double = 5_000
  public static let maxBodyLength = 140

  public enum Kind: String, Sendable {
    case needsInput = "agent-needs-input"
    case done = "agent-done"
  }

  /** What one roster row says, for this (`toNotificationSnapshot`). */
  public struct Snapshot: Equatable, Sendable {
    public var id: String
    public var name: String
    public var isRunning: Bool
    public var awaitingReason: String?
    public var notifyEnabled: Bool
    public var isHidden: Bool
    public var lastMessageId: String?
    public var lastMessagePreview: String?

    public init(id: String, name: String, isRunning: Bool, awaitingReason: String?, notifyEnabled: Bool, isHidden: Bool, lastMessageId: String?, lastMessagePreview: String?) {
      self.id = id; self.name = name; self.isRunning = isRunning; self.awaitingReason = awaitingReason
      self.notifyEnabled = notifyEnabled; self.isHidden = isHidden; self.lastMessageId = lastMessageId; self.lastMessagePreview = lastMessagePreview
    }

    public init(_ agent: Agent) {
      self.init(id: agent.id, name: agent.name, isRunning: agent.isRunning, awaitingReason: agent.waitingReason, notifyEnabled: agent.notifyOnUpdates, isHidden: agent.isHidden, lastMessageId: agent.lastMessageId, lastMessagePreview: agent.lastMessagePreview)
    }
  }

  /** An agent that started waiting, or finished a turn (`NotificationTransition`). */
  public struct Transition: Equatable, Sendable {
    public var agentId: String
    public var agentName: String
    public var kind: Kind
    public var reason: String?
    public var notifyEnabled: Bool
    public var isHidden: Bool
    public var lastMessageId: String?
    public var lastMessagePreview: String?
  }

  /**
   * Each agent seen before that started waiting (a reason where there was
   * none) or stopped running without waiting (`diffAgentNotificationTransitions`).
   * Waiting wins when both happen.
   */
  public static func transitions(from previous: [String: Snapshot], to next: [Snapshot]) -> [Transition] {
    next.compactMap { agent in
      guard let before = previous[agent.id] else { return nil }
      let becameAwaiting = agent.awaitingReason != nil && before.awaitingReason == nil
      let finishedTurn = before.isRunning && !agent.isRunning && agent.awaitingReason == nil
      guard becameAwaiting || finishedTurn else { return nil }
      return Transition(agentId: agent.id, agentName: agent.name, kind: becameAwaiting ? .needsInput : .done, reason: becameAwaiting ? agent.awaitingReason : nil, notifyEnabled: agent.notifyEnabled, isHidden: agent.isHidden, lastMessageId: agent.lastMessageId, lastMessagePreview: agent.lastMessagePreview)
    }
  }

  public static func shouldNotify(isHidden: Bool, notifyEnabled: Bool, isWindowFocused: Bool, lastNotifiedAtMs: Double?, nowMs: Double, throttleWindowMs: Double = throttleMs) -> Bool {
    !isHidden && notifyEnabled && !isWindowFocused && (lastNotifiedAtMs == nil || nowMs - lastNotifiedAtMs! >= throttleWindowMs)
  }

  /** The notification's words (`buildNotificationContent`). */
  public static func content(_ transition: Transition) -> (title: String, body: String) {
    let trimmed = jsTrim(transition.agentName)
    let name = trimmed.isEmpty ? "Your agent" : trimmed
    switch transition.kind {
    case .needsInput:
      let reason = jsTrim(transition.reason ?? "")
      return ("\(name) needs you", reason.isEmpty ? "Waiting for your input." : truncate(reason))
    case .done:
      let summary = jsTrim(transition.lastMessagePreview ?? "")
      return (name, summary.isEmpty ? "Open Simeon to see what it did." : truncate(summary))
    }
  }

  /**
   * Runs of spaces as one, then at most 140 (counted as the window's
   * JavaScript counts, in UTF-16 units): 139, trailing spaces dropped, and
   * "…". A cut through an emoji drops its first half, where JavaScript
   * keeps it alone.
   */
  public static func truncate(_ text: String) -> String {
    var collapsed: [UInt16] = []
    var inSpace = false
    for unit in text.utf16 {
      if isJSWhitespace(unit) {
        if !inSpace { collapsed.append(0x20); inSpace = true }
      } else {
        collapsed.append(unit)
        inSpace = false
      }
    }
    while collapsed.first == 0x20 { collapsed.removeFirst() }
    while collapsed.last == 0x20 { collapsed.removeLast() }
    if collapsed.count <= maxBodyLength { return String(decoding: collapsed, as: UTF16.self) }
    var cut = Array(collapsed.prefix(maxBodyLength - 1))
    while let last = cut.last, isJSWhitespace(last) { cut.removeLast() }
    if let last = cut.last, UTF16.isLeadSurrogate(last) { cut.removeLast() }
    return String(decoding: cut, as: UTF16.self) + "…"
  }

  /** JavaScript's `\s` and what `trim()` drops: all of it in the Basic Multilingual Plane. */
  static func isJSWhitespace(_ unit: UInt16) -> Bool {
    switch unit {
    case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
    default: false
    }
  }

  static func jsTrim(_ text: String) -> String {
    var units = Array(text.utf16)
    while let first = units.first, isJSWhitespace(first) { units.removeFirst() }
    while let last = units.last, isJSWhitespace(last) { units.removeLast() }
    return String(decoding: units, as: UTF16.self)
  }
}

/**
 * Which transitions become notifications (`SandOsNotificationDecider`):
 * each agent's last row, the message each agent's news was last counted
 * for, and when each agent and kind last notified. A finished turn
 * notifies only for a message not counted yet; counting happens before the
 * other checks, so a turn that ends while the window is focused is never
 * told later.
 */
public final class NotificationDecider {
  private var previous: [String: AgentNotifications.Snapshot] = [:]
  private var lastNotifiedAtMs: [String: Double] = [:]
  /** Present once an agent was seen; its value may be nil (no message yet), as the window's map holds `undefined`. */
  private var accountedMessageId: [String: String?] = [:]
  public let throttleWindowMs: Double

  public init(throttleWindowMs: Double = AgentNotifications.throttleMs) {
    self.throttleWindowMs = throttleWindowMs
  }

  private func account(_ agent: AgentNotifications.Snapshot) {
    if accountedMessageId[agent.id] == nil { accountedMessageId[agent.id] = .some(agent.lastMessageId) }
  }

  /** A whole roster: what changed since the last one, which then becomes the last one (agents not in it forgotten). */
  public func decide(_ agents: [AgentNotifications.Snapshot], isWindowFocused: Bool, nowMs: Double) -> [AgentNotifications.Transition] {
    let out = gate(AgentNotifications.transitions(from: previous, to: agents), isWindowFocused: isWindowFocused, nowMs: nowMs)
    var next: [String: AgentNotifications.Snapshot] = [:]
    for agent in agents {
      account(agent)
      next[agent.id] = agent
    }
    previous = next
    return out
  }

  /** The roster read at a connect: agents not known yet become known, nothing notifies, nothing known is replaced. */
  public func seedBaseline(_ agents: [AgentNotifications.Snapshot]) {
    for agent in agents {
      if previous[agent.id] == nil { previous[agent.id] = agent }
      account(agent)
    }
  }

  /** One agent's new row. */
  public func decideAgent(_ agent: AgentNotifications.Snapshot, isWindowFocused: Bool, nowMs: Double) -> [AgentNotifications.Transition] {
    let out = gate(AgentNotifications.transitions(from: previous, to: [agent]), isWindowFocused: isWindowFocused, nowMs: nowMs)
    account(agent)
    previous[agent.id] = agent
    return out
  }

  /** Kept without deciding. */
  public func observeAgent(_ agent: AgentNotifications.Snapshot) {
    account(agent)
    previous[agent.id] = agent
  }

  public func forget(_ agentId: String) {
    previous[agentId] = nil
    accountedMessageId[agentId] = nil
    lastNotifiedAtMs[key(agentId, .done)] = nil
    lastNotifiedAtMs[key(agentId, .needsInput)] = nil
  }

  private func key(_ agentId: String, _ kind: AgentNotifications.Kind) -> String { "\(agentId):\(kind.rawValue)" }

  private func gate(_ transitions: [AgentNotifications.Transition], isWindowFocused: Bool, nowMs: Double) -> [AgentNotifications.Transition] {
    var out: [AgentNotifications.Transition] = []
    for transition in transitions {
      let accounted = accountedMessageId[transition.agentId] ?? nil
      if transition.kind == .done && (transition.lastMessageId == nil || transition.lastMessageId == accounted) { continue }
      accountedMessageId[transition.agentId] = .some(transition.lastMessageId)
      let key = key(transition.agentId, transition.kind)
      if AgentNotifications.shouldNotify(isHidden: transition.isHidden, notifyEnabled: transition.notifyEnabled, isWindowFocused: isWindowFocused, lastNotifiedAtMs: lastNotifiedAtMs[key], nowMs: nowMs, throttleWindowMs: throttleWindowMs) {
        lastNotifiedAtMs[key] = nowMs
        out.append(transition)
      }
    }
    return out
  }
}

/**
 * The notifications' order of events (`SandOsNotificationManager`): an
 * agent's update that arrives before the first roster waits for it; the
 * first roster, or the roster read at connecting, is the starting point.
 * The app shows what this returns.
 */
public final class NotificationFeed {
  private var decider = NotificationDecider()
  private var seeded = false
  private var waiting: [Agent] = []

  public init() {}

  /** A whole roster from the box (`agents`). */
  public func roster(_ agents: [Agent], isWindowFocused: Bool, nowMs: Double) -> [AgentNotifications.Transition] {
    var shown = decider.decide(agents.map(AgentNotifications.Snapshot.init), isWindowFocused: isWindowFocused, nowMs: nowMs)
    shown += flush(isWindowFocused: isWindowFocused, nowMs: nowMs)
    return shown
  }

  /** One agent's update (`agent-upserted`); held until the first roster. */
  public func update(_ agent: Agent, isWindowFocused: Bool, nowMs: Double) -> [AgentNotifications.Transition] {
    guard seeded else { waiting.append(agent); return [] }
    return decider.decideAgent(AgentNotifications.Snapshot(agent), isWindowFocused: isWindowFocused, nowMs: nowMs)
  }

  /** The roster read at each connect (`listAgents`): the starting point, then what waited. */
  public func seed(_ agents: [Agent], isWindowFocused: Bool, nowMs: Double) -> [AgentNotifications.Transition] {
    decider.seedBaseline(agents.map(AgentNotifications.Snapshot.init))
    return flush(isWindowFocused: isWindowFocused, nowMs: nowMs)
  }

  /** Another account, or none: everything forgotten. */
  public func reset() {
    decider = NotificationDecider()
    seeded = false
    waiting = []
  }

  private func flush(isWindowFocused: Bool, nowMs: Double) -> [AgentNotifications.Transition] {
    guard !seeded else { return [] }
    seeded = true
    let held = waiting
    waiting = []
    return held.flatMap { decider.decideAgent(AgentNotifications.Snapshot($0), isWindowFocused: isWindowFocused, nowMs: nowMs) }
  }
}
