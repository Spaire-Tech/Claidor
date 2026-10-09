import Foundation
import Observation

/** Waiting, for the driver: the app's real clock, or a test's. */
@MainActor
public protocol RebuildClock: AnyObject {
  /** Now, in milliseconds. */
  func now() -> Double
  /** `work` after `ms`; the returned function cancels it. */
  func schedule(after ms: Double, _ work: @escaping @MainActor () -> Void) -> () -> Void
}

@MainActor
public final class SystemRebuildClock: RebuildClock {
  public init() {}
  public func now() -> Double { Date().timeIntervalSince1970 * 1000 }
  public func schedule(after ms: Double, _ work: @escaping @MainActor () -> Void) -> () -> Void {
    let task = Task { @MainActor in
      try? await Task.sleep(nanoseconds: UInt64(max(0, ms) * 1_000_000))
      guard !Task.isCancelled else { return }
      work()
    }
    return { task.cancel() }
  }
}

/**
 * The rebuild as the window runs it (`H$n`, `B$n`, `R$n`): the person's
 * update, reset and recovery, the "update when done" queue, a failure to
 * show until dismissed, "Reconnecting" 2.5 s after the stream drops, and
 * "taking longer" or "couldn't reach" after two minutes. The store tells it
 * what changed; the views read it.
 */
@MainActor
@Observable
public final class RebuildDriver {
  /** What the window looks at (the selected agent, its computer, the roster, the stream). */
  public struct Inputs: Equatable, Sendable {
    /** The selected agent, when it is not a group (`boxId`). */
    public var boxId: String?
    public var isCurrentGroup = false
    public var phase: ComputerPhase = .off
    public var imageUpdateAvailable: Bool?
    /** Some agent is at work (`isRunning`). */
    public var anyRunning = false
    public var transportConnected = false

    public init(boxId: String? = nil, isCurrentGroup: Bool = false, phase: ComputerPhase = .off, imageUpdateAvailable: Bool? = nil, anyRunning: Bool = false, transportConnected: Bool = false) {
      self.boxId = boxId; self.isCurrentGroup = isCurrentGroup; self.phase = phase; self.imageUpdateAvailable = imageUpdateAvailable
      self.anyRunning = anyRunning; self.transportConnected = transportConnected
    }
  }

  public enum Request: Equatable, Sendable {
    case update(force: Bool), reset, recover
    public var kind: RebuildLock.Kind {
      switch self {
      case .update: return .update
      case .reset: return .reset
      case .recover: return .recover
      }
    }
  }

  /** A rebuild that did not finish, until dismissed or retried. */
  public struct Failure: Equatable, Sendable {
    public let episodeId: Int
    public let request: Request
  }

  /** "Couldn't reach" for the stream, "taking longer" for the rest, after two minutes (`QWe`). */
  public enum Escalation: String, Sendable { case unreachable, takingLonger = "taking-longer" }
  public static let escalationDelay = 120_000.0

  /** The calls that rebuild the computer (`updateComputer`, `forceRecreateComputer`). */
  public struct Calls: Sendable {
    public var update: @Sendable (_ agentId: String, _ force: Bool) async throws -> RecreateAnswer
    public var reset: @Sendable () async throws -> RecreateAnswer
    public init(update: @escaping @Sendable (String, Bool) async throws -> RecreateAnswer, reset: @escaping @Sendable () async throws -> RecreateAnswer) {
      self.update = update; self.reset = reset
    }
  }

  // What the views read.
  public private(set) var lock: RebuildLock
  public private(set) var pendingKind: RebuildLock.Kind?
  public private(set) var isUpdateQueued = false
  public private(set) var isBlocked = false
  /** Only the Settings card showed it in the window, and Settings has none today. */
  public private(set) var error: String?
  public private(set) var failure: Failure?
  public private(set) var surface = RebuildSurface()
  public private(set) var escalation: Escalation?
  public private(set) var migration = MigrationRecord()
  public private(set) var inputs = Inputs()

  public var canUpdate: Bool { inputs.boxId != nil }
  public var canReset: Bool { !inputs.isCurrentGroup }
  public var canRecover: Bool { !inputs.isCurrentGroup }
  /** A rebuild under way (not just the stream away): sending waits, the agents' list holds still, the keys go only to the dialog. */
  public var isHardLocked: Bool { lock.kind != nil && lock.kind != .reconnecting }

  /** A rebuild began or ended (not the stream's coming and going): the store holds the agents' list still meanwhile. */
  @ObservationIgnored public var onHardLockChanged: ((Bool) -> Void)?
  @ObservationIgnored private let clock: RebuildClock
  @ObservationIgnored private var calls: Calls?
  @ObservationIgnored private var disposed = false
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var requestCount = 0
  @ObservationIgnored private var inFlight = false
  @ObservationIgnored private var queueFired = false
  @ObservationIgnored private var episodes = 0
  @ObservationIgnored private var settleTimer: (() -> Void)?
  @ObservationIgnored private var reconnectTimer: (() -> Void)?
  @ObservationIgnored private var escalationTimer: (() -> Void)?
  @ObservationIgnored private var escalationKind: RebuildLock.Kind?
  @ObservationIgnored private var waiter: Waiter?
  @ObservationIgnored private var wasActive = false
  @ObservationIgnored private var lastTransport: Bool?
  @ObservationIgnored private var connectedOnce = false
  @ObservationIgnored private var connectedSinceConnect = false

  /** The end of a request's operation, as the server reports it (`$$n`). */
  private final class Waiter {
    let failure: String
    var operationId: String?
    var continuation: CheckedContinuation<Void, Error>?
    var done = false
    init(failure: String) { self.failure = failure }

    func check(_ event: MigrationEvent?) {
      guard let event, let operationId, sameOperation(event.operationId, operationId) else { return }
      if event.phase == .failed { finish(RebuildFailure(message: failure)) } else if event.phase == .done { finish(nil) }
    }

    func finish(_ error: Error?) {
      guard !done else { return }
      done = true
      let waiting = continuation
      continuation = nil
      if let error { waiting?.resume(throwing: error) } else { waiting?.resume() }
    }
  }

  /** A failure with its own words (`F$n`, or the operation reported failed). */
  public struct RebuildFailure: Error, Equatable { public let message: String }
  /** The call never got through (the window's desktop error): "Check your connection". */
  public struct CallFailure: Error {}

  public init(clock: RebuildClock? = nil) {
    self.clock = clock ?? SystemRebuildClock()
    lock = RebuildLock(phase: .off)
    transportChanged()
  }

  // MARK: What the store reports

  /** The window starts with an account (`connect`). */
  public func connect(calls: Calls, inputs: Inputs) {
    guard !disposed else { return }
    self.calls = calls
    self.inputs = inputs
    connectedOnce = true
    connectedSinceConnect = inputs.transportConnected
    transportChanged()
    activityChanged()
    statusChanged()
  }

  /** The selection or the roster changed. */
  public func selectionChanged(_ next: Inputs) {
    inputs = next
    activityChanged()
    statusChanged()
    checkQueue()
  }

  /** A computer's status changed. */
  public func statusChanged(_ next: Inputs) {
    inputs = next
    statusChanged()
  }

  /** The stream went down or came back. */
  public func transportChanged(_ next: Inputs) {
    inputs = next
    transportChanged()
  }

  /** A step of the server's replacement of the computer (`box-migration`). */
  public func migrationEvent(_ event: MigrationEvent?) {
    guard !disposed else { return }
    let before = migration
    migration.ingest(event)
    guard migration != before else { return }
    waiter?.check(migration.last)
    if let raw = migration.last, isActive { dispatch(.migration(raw.phase, operationId: raw.operationId, at: clock.now())) }
  }

  /** The status read back on connecting (`getBoxMigrationStatus`): nothing read keeps a finished one. */
  public func migrationReadBack(_ event: MigrationEvent?) {
    if event == nil, migration.last?.phase.isTerminal == true { return }
    migrationEvent(event)
  }

  /** The account went (`reset`). */
  public func reset() {
    generation += 1
    waiter?.finish(nil); waiter = nil
    settleTimer?(); settleTimer = nil
    reconnectTimer?(); reconnectTimer = nil
    inFlight = false; isBlocked = false; pendingKind = nil; isUpdateQueued = false; queueFired = false
    error = nil; failure = nil; resetOperationIdHeld = nil
    lock = RebuildLock(phase: .off)
    lastTransport = nil; connectedOnce = false; connectedSinceConnect = false; wasActive = false
    migration = MigrationRecord()
    calls = nil
    surface.reset(pending: nil)
    surface.lockChanged(.init(lock))
    escalationKindChanged()
  }

  // MARK: What the person does

  /** "Update Simeon's Computer", "Update anyway" (`force`), or "Retry Update" (the failed one's `force`). */
  public func update(force: Bool? = nil) {
    var again = false
    if case .update(let previous)? = failure?.request { again = previous }
    start(.update(force: force ?? again))
  }

  /** The sidebar's "Recover computer" and "Retry Reset" (`resetComputer`). */
  public func resetComputer() { start(.reset) }

  /** "Recover Simeon's Computer" (`recoverComputer`). */
  public func recoverComputer() { start(.recover) }

  /** "Update when done": the update starts once no agent is at work. */
  public func queueUpdateWhenIdle() {
    guard !disposed, !isBlocked, !isUpdateQueued else { return }
    isUpdateQueued = true
    queueFired = false
    checkQueue()
  }

  /** The "Queued" pill. */
  public func cancelQueuedUpdate() { if isUpdateQueued { isUpdateQueued = false } }

  /** "Dismiss" on a failure. */
  public func dismissFailure() {
    guard failure != nil else { return }
    failure = nil
    checkQueue()
  }

  public func continueInBackground() { surface.continueInBackground() }
  public func restoreForeground() { surface.restoreForeground() }

  /** "Keep waiting", and "Retry" under "Couldn't reach": the two minutes start again; nothing reconnects. */
  public func keepWaiting() {
    guard lock.kind != nil else { return }
    armEscalation()
  }

  // MARK: The store's machinery (`H$n`)

  @ObservationIgnored private var resetOperationIdHeld: String?

  /** Whether the lock may be held: an agent selected that is not a group, or a reset or recovery asked for (`I`). */
  private var isActive: Bool {
    !inputs.isCurrentGroup && (inputs.boxId != nil || pendingKind == .reset || pendingKind == .recover)
  }

  /** One event, then whatever follows from it (`W`). */
  private func dispatch(_ event: RebuildLock.Event) {
    guard !disposed else { return }
    let before = lock
    let after = lock.step(event)
    guard after != before else { return }
    let wasHard = isHardLocked
    lock = after
    if isHardLocked != wasHard { onHardLockChanged?(isHardLocked) }
    if before.kind == nil || before.kind == .reconnecting, let kind = after.kind, kind != .reconnecting {
      failure = nil
      if pendingKind == nil { isUpdateQueued = false }
    }
    if let kind = before.kind, kind != .reconnecting, after.kind == nil, after.lastResolution == .failed, failure == nil {
      episodes += 1
      failure = Failure(episodeId: episodes, request: kind == .update ? .update(force: false) : kind == .reset ? .reset : .recover)
    }
    // The surface hears the lock only when what it publishes changed (`q`).
    if RebuildSurface.LockView(before) != RebuildSurface.LockView(after) || before.stage != after.stage || before.lastResolutionKind != after.lastResolutionKind {
      surface.lockChanged(.init(lock))
    }
    if before.kind != after.kind { escalationKindChanged() }
    scheduleSettle()
    if before.kind != nil, after.kind == nil, after.lastResolution == .settled, pendingKind != nil {
      requestCount += 1
      waiter?.finish(nil); waiter = nil
      inFlight = false
      setPending(nil)
      activityChanged()
      dispatch(.pending(false, at: clock.now()))
    }
    if before.kind != nil, lock.kind == nil, isBlocked, pendingKind == nil {
      isBlocked = false; inFlight = false; error = nil
    }
    if before.kind != nil, lock.kind == nil { checkQueue() }
  }

  private func setPending(_ kind: RebuildLock.Kind?) {
    pendingKind = kind
    surface.pendingChanged(kind)
  }

  /** The lock's own time to let go (`V`). */
  private func scheduleSettle() {
    settleTimer?(); settleTimer = nil
    guard !disposed, lock.kind != nil, let at = lock.settleAt else { return }
    settleTimer = clock.schedule(after: max(0, at - clock.now())) { [weak self] in
      guard let self else { return }
      self.settleTimer = nil
      self.dispatch(.tick(at: self.clock.now()))
      if self.settleTimer == nil { self.scheduleSettle() }
    }
  }

  /** The selected agent's computer (`te`). */
  private func statusChanged() {
    if inputs.imageUpdateAvailable != lock.imageUpdateAvailable { dispatch(.imageUpdate(inputs.imageUpdateAvailable, at: clock.now())) }
    if inputs.imageUpdateAvailable == false { cancelQueuedUpdate() }
    dispatch(.box(id: inputs.boxId, phase: inputs.phase, at: clock.now()))
  }

  /** Whether the lock may be held changed (`ne`). */
  private func activityChanged() {
    let active = isActive
    guard active != wasActive else { return }
    wasActive = active
    guard active else {
      reconnectTimer?(); reconnectTimer = nil
      dispatch(.deactivate(at: clock.now()))
      return
    }
    if pendingKind == .reset || pendingKind == .recover {
      dispatch(.request(pendingKind!, operationId: resetOperationIdHeld, at: clock.now()))
    } else if pendingKind == .update {
      dispatch(.request(.update, source: .request, at: clock.now()))
    }
    if let raw = migration.last { dispatch(.migration(raw.phase, operationId: raw.operationId, at: clock.now())) }
  }

  /** The stream (`j`): "Reconnecting" once it has been down 2.5 s, if it was up since the window connected. */
  private func transportChanged() {
    let connected = inputs.transportConnected
    guard connected != lastTransport else { return }
    lastTransport = connected
    dispatch(.connection(connected, at: clock.now()))
    reconnectTimer?(); reconnectTimer = nil
    if connected {
      if connectedOnce { connectedSinceConnect = true }
      return
    }
    guard connectedOnce, connectedSinceConnect, isActive else { return }
    reconnectTimer = clock.schedule(after: RebuildLock.reconnectDelay) { [weak self] in
      guard let self else { return }
      self.reconnectTimer = nil
      if self.lock.kind == nil && self.isActive { self.dispatch(.request(.reconnecting, at: self.clock.now())) }
    }
  }

  /** The queued update, once nobody is at work (`le`). */
  private func checkQueue() {
    guard !disposed else { return }
    if inputs.anyRunning { queueFired = false; return }
    guard isUpdateQueued, !queueFired, !inFlight, pendingKind == nil, lock.kind == nil, inputs.boxId != nil else { return }
    queueFired = true
    start(.update(force: false))
  }

  /** A request (`se`). */
  private func start(_ request: Request) {
    guard !disposed, !inFlight else { return }
    if case .update = request, inputs.boxId == nil { return }
    if request.kind != .update && inputs.isCurrentGroup { return }
    failure = nil
    let gen = generation
    requestCount += 1
    let count = requestCount
    inFlight = true
    setPending(request.kind)
    error = nil
    if request.kind != .update { resetOperationIdHeld = nil }
    dispatch(.pending(true, at: clock.now()))
    if isActive {
      if request.kind == .update {
        dispatch(.request(.update, source: .request, at: clock.now()))
      } else {
        dispatch(.request(request.kind, operationId: nil, at: clock.now()))
        if let raw = migration.last { dispatch(.migration(raw.phase, operationId: raw.operationId, at: clock.now())) }
      }
    }
    activityChanged()
    Task { [weak self] in
      guard let self else { return }
      let stale = { self.disposed || gen != self.generation || count != self.requestCount }
      do {
        let untrackable = try await self.run(request, stale: stale)
        if !stale() {
          if let untrackable { self.isBlocked = true; self.error = untrackable } else { self.inFlight = false }
        }
      } catch {
        if !stale() {
          self.inFlight = false
          let held = self.lock.kind != nil && self.lock.kind != .reconnecting
          if held || self.lock.lastResolution == .failed {
            if let failure = self.failure { self.failure = Failure(episodeId: failure.episodeId, request: request) } else {
              self.episodes += 1
              self.failure = Failure(episodeId: self.episodes, request: request)
            }
            switch error {
            case let failure as RebuildFailure: self.error = failure.message
            case is CallFailure: self.error = "Couldn't \(request.kind.rawValue) the computer. Check your connection and try again."
            default: self.error = "Something went wrong with the computer. Try again."
            }
          }
          if held { self.dispatch(.error(at: self.clock.now())) }
        }
      }
      guard !stale() else { return }
      self.setPending(nil)
      self.activityChanged()
      self.dispatch(.pending(false, at: self.clock.now()))
      if self.failure == nil { self.checkQueue() }
    }
  }

  /** The call and the wait for its operation to finish (`X`): nil when finished, or the words for one that cannot be followed. */
  private func run(_ request: Request, stale: () -> Bool) async throws -> String? {
    guard let calls else { return nil }
    let failureWords: String
    switch request {
    case .update: failureWords = "The computer update failed. Try again."
    case .reset: failureWords = "The computer reset failed. Try again."
    case .recover: failureWords = "The computer recovery failed. Try again."
    }
    let waiting = Waiter(failure: failureWords)
    waiter = waiting
    defer { if waiter === waiting { waiter = nil }; waiting.finish(nil) }
    let answer: RecreateAnswer
    if case .update(let force) = request {
      guard let boxId = inputs.boxId else { return nil }
      do { answer = try await calls.update(boxId, force) } catch { throw CallFailure() }
      // A refused update reaches the window as a failed call (main throws `SandComputerRecreateRefusedError`).
      if case .rejected = answer { throw CallFailure() }
      if stale() { return nil }
      cancelQueuedUpdate()
      switch answer {
      case .untrackable, .rejected: return "The computer update started, but Simeon can't track its progress. Restart Simeon after the computer is available again."
      case .started(let operationId):
        dispatch(.acknowledged(at: clock.now()))
        try await wait(waiting, for: operationId)
        return nil
      }
    }
    do { answer = try await calls.reset() } catch { throw CallFailure() }
    if case .rejected(let reason) = answer {
      let prefix = "Couldn't reset the computer"
      throw RebuildFailure(message: request == .recover && reason.hasPrefix(prefix) ? "Couldn't recover the computer" + reason.dropFirst(prefix.count) : reason)
    }
    if stale() { return nil }
    cancelQueuedUpdate()
    guard case .started(let operationId) = answer else {
      return "The computer \(request == .recover ? "recovery" : "reset") started, but Simeon can't track its progress. Restart Simeon after the computer is available again."
    }
    resetOperationIdHeld = operationId
    if isActive {
      dispatch(.request(request.kind, operationId: operationId, at: clock.now()))
      dispatch(.acknowledged(at: clock.now()))
      if let raw = migration.last { dispatch(.migration(raw.phase, operationId: raw.operationId, at: clock.now())) }
    }
    try await wait(waiting, for: operationId)
    return nil
  }

  private func wait(_ waiting: Waiter, for operationId: String) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      waiting.operationId = operationId
      waiting.continuation = continuation
      if waiting.done { waiting.done = false; waiting.finish(nil); return }
      waiting.check(migration.last)
    }
  }

  // MARK: Two minutes (`B$n`)

  private func escalationKindChanged() {
    let kind = lock.kind
    guard kind != escalationKind else { return }
    escalationKind = kind
    armEscalation()
  }

  private func armEscalation() {
    escalationTimer?(); escalationTimer = nil
    escalation = nil
    guard !disposed, let kind = lock.kind else { return }
    escalationTimer = clock.schedule(after: Self.escalationDelay) { [weak self] in
      guard let self, let held = self.lock.kind else { return }
      self.escalationTimer = nil
      self.escalation = held == .reconnecting ? .unreachable : .takingLonger
    }
    _ = kind
  }
}
