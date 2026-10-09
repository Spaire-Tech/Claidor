import Foundation

/**
 * Simeon's computer rebuilt, as the shipped window follows it: an update,
 * a reset or a recovery the person asked for (or the computer started by
 * itself), the stream dropping and coming back ("Reconnecting"), and the
 * steps between (`H$n`, `Kae`, `yft`, `e6n`, `J1t`, `R$n`, `B$n` in the
 * main bundle; `box-migration-watcher.ts` in the Electron app). Only state
 * and words here; the store feeds it and the views draw it.
 */

/** A step of the server's replacement of the computer (`SandBoxMigrationPhase`). */
public enum MigrationPhase: String, Sendable, CaseIterable {
  case backingUp = "backing-up", creating, moving, cleaningUp = "cleaning-up", wiping, done, failed

  /** The server's number for it (`server/simeon/sand/box_service.py`, 1 to 7). */
  public init?(number: Int) {
    switch number {
    case 1: self = .backingUp
    case 2: self = .creating
    case 3: self = .moving
    case 4: self = .cleaningUp
    case 5: self = .wiping
    case 6: self = .done
    case 7: self = .failed
    default: return nil
    }
  }

  public var isTerminal: Bool { self == .done || self == .failed }
}

/** One step the server reported, for an operation (`box-migration`). */
public struct MigrationEvent: Equatable, Sendable {
  public let operationId: String?
  public let phase: MigrationPhase
  public let detail: String

  public init(operationId: String?, phase: MigrationPhase, detail: String = "") {
    self.operationId = operationId; self.phase = phase; self.detail = detail
  }

  /** One of the server's stream messages (`{operationId, phase, detail, offsetKey}`). */
  public init?(server json: JSON) {
    let phase = json["phase"]?.int.flatMap(MigrationPhase.init(number:)) ?? json["phase"]?.string.flatMap(MigrationPhase.init(rawValue:))
    guard let phase else { return nil }
    self.init(operationId: json["operationId"]?.text, phase: phase, detail: json["detail"]?.string ?? "")
  }
}

/** The same operation: both named, and the same (`Om`). */
func sameOperation(_ a: String?, _ b: String?) -> Bool { a != nil && b != nil && a == b }

/**
 * The steps the window has seen for the current operation (`FPt`): the
 * last event, and the operation's steps in order, terminal ones left out.
 */
public struct MigrationRecord: Equatable, Sendable {
  /** The last event (`getRawEvent`). */
  public private(set) var last: MigrationEvent?
  /** The operation the steps belong to. */
  public private(set) var operationId: String?
  public private(set) var phases: [MigrationPhase] = []

  public init() {}

  /** The phase shown: the last one while it is not terminal (`jPt`). */
  public var phase: MigrationPhase? { last?.phase }

  /** An event, or none (the status read back empty). The same event twice changes nothing. */
  public mutating func ingest(_ event: MigrationEvent?) {
    if last == nil && event == nil { return }
    if let last, let event, last.phase == event.phase, last.detail == event.detail, sameOperation(last.operationId, event.operationId) { return }
    if let event {
      let keepsOperation = operationId == nil && event.operationId == nil && last.map { !$0.phase.isTerminal } == true
      if !keepsOperation && !sameOperation(operationId, event.operationId) {
        operationId = event.operationId
        phases = []
      }
      if !event.phase.isTerminal && phases.last != event.phase { phases.append(event.phase) }
    }
    last = event
  }

  /** The phase, when it belongs to this operation and is not terminal (`DPt`). */
  public func phase(for operation: String?) -> MigrationPhase? {
    guard sameOperation(operationId, operation), let phase = last?.phase, !phase.isTerminal else { return nil }
    return phase
  }

  /** The steps, when they belong to this operation (`RPt`). */
  public func phases(for operation: String?) -> [MigrationPhase] { sameOperation(operationId, operation) ? phases : [] }
}

/**
 * The lock (`Kae`): while it is held, the computer is being rebuilt or
 * the window waits for it to come back. Its fields as the bundle's, so
 * each rule reads as the original does.
 */
public struct RebuildLock: Equatable, Sendable {
  public enum Kind: String, Sendable { case update, reset, recover, reconnecting }
  public enum Source: String, Sendable { case request, auto, migration }
  public enum Teardown: String, Sendable { case none, box, transport }
  public enum Resolution: String, Sendable { case settled, failed, cancelled }
  /** The lock's coarse phase (`e6n`). */
  public enum Stage: String, Sendable { case preparing, tearingDown, downloading, starting, finishing }

  public enum Event: Sendable {
    case request(Kind, operationId: String? = nil, source: Source? = nil, at: Double)
    case pending(Bool, at: Double)
    case acknowledged(at: Double)
    case imageUpdate(Bool?, at: Double)
    case box(id: String?, phase: ComputerPhase, at: Double)
    case migration(MigrationPhase, operationId: String?, at: Double)
    case connection(Bool, at: Double)
    case error(at: Double)
    case deactivate(at: Double)
    case tick(at: Double)

    public var at: Double {
      switch self {
      case .request(_, _, _, let at), .pending(_, let at), .acknowledged(let at), .imageUpdate(_, let at), .box(_, _, let at),
           .migration(_, _, let at), .connection(_, let at), .error(let at), .deactivate(let at), .tick(let at): return at
      }
    }
  }

  /** After the stream is back, this long before the lock lets go (`tve`). */
  public static let settleDelay = 1000.0
  /** After an update's computer is ready again with no reconnect seen (`Kyn`). */
  public static let updateSettleDelay = 2500.0
  /** The stream down this long before "Reconnecting" (`Yyn`). */
  public static let reconnectDelay = 2500.0

  public var kind: Kind?
  public var operationId: String?
  public var updateSource: Source?
  public var lockBoxId: String?
  public var isPending = false
  public var hasRequestAcknowledgement = false
  public var imageUpdateAvailable: Bool?
  public var expectsImageUpgrade = false
  public var boxPhase: ComputerPhase
  public var observedBoxId: String?
  public var lastHealthyBoxId: String?
  public var hasLeftHealthy = false
  public var teardownObserved: Teardown = .none
  public var reconnectedSinceLeft = false
  public var readySince: Double?
  public var isConnected = true
  public var connectedSince: Double?
  public var resetOperationId: String?
  public var hasTerminalMigration = false
  public var lastResolution: Resolution?
  public var lastResolutionKind: Kind?

  /** Unlocked, on this phase (`xHe`). */
  public init(phase: ComputerPhase, imageUpdateAvailable: Bool? = nil) {
    boxPhase = phase
    self.imageUpdateAvailable = imageUpdateAvailable
  }

  public var isLocked: Bool { kind != nil }

  static func isReady(_ phase: ComputerPhase) -> Bool { phase == .running || phase == .local }
  static func isRebuild(_ kind: Kind?) -> Bool { kind == .reset || kind == .recover }

  /** The box seen is the box locked (`ype`). */
  var onLockedBox: Bool { lockBoxId == nil || observedBoxId == nil || observedBoxId == lockBoxId }

  /** The lock's own fields cleared (`Kte`). */
  mutating func clearLock() {
    kind = nil; operationId = nil; updateSource = nil; lockBoxId = nil; hasLeftHealthy = false; teardownObserved = .none
    reconnectedSinceLeft = false; readySince = nil; resetOperationId = nil; hasTerminalMigration = false
    hasRequestAcknowledgement = false; expectsImageUpgrade = false
  }

  /** The lock let go: cleared, and why. */
  func ended(_ resolution: Resolution) -> RebuildLock {
    var next = self
    next.clearLock()
    next.lastResolution = resolution
    next.lastResolutionKind = kind
    return next
  }

  /** One event (`Kae`). */
  public func reduced(_ event: Event) -> RebuildLock {
    switch event {
    case .request(let requested, let requestedOperation, let source, let at):
      let isReconnect = requested == .reconnecting
      let operation = Self.isRebuild(requested) ? requestedOperation : nil
      let updateFrom = requested == .update ? source : nil
      let leaves = isReconnect || Self.isRebuild(requested)
      let continuing = requested == .update && kind == nil && isPending
      if let held = kind {
        var next = self
        if requested == .reset && held != .reset || requested == .recover && held != .recover && held != .reset {
          next.kind = requested; next.operationId = operation; next.updateSource = updateFrom; next.lockBoxId = observedBoxId
          next.resetOperationId = operation; next.hasLeftHealthy = true; next.reconnectedSinceLeft = false; next.readySince = nil
          next.hasTerminalMigration = false; next.hasRequestAcknowledgement = false; next.expectsImageUpgrade = false
          return next
        }
        if Self.isRebuild(requested) {
          if requested == .recover && held == .reset || sameOperation(resetOperationId, requestedOperation) { return self }
          next.operationId = requestedOperation; next.updateSource = nil; next.lockBoxId = observedBoxId; next.resetOperationId = requestedOperation
          next.readySince = nil; next.hasTerminalMigration = false; next.hasRequestAcknowledgement = false; next.expectsImageUpgrade = false
          return next
        }
        if held == .reconnecting && !isReconnect {
          next.kind = requested; next.updateSource = updateFrom; next.lockBoxId = observedBoxId
          next.expectsImageUpgrade = requested == .update && imageUpdateAvailable == true
          return next
        }
        if held == .update && requested == .update && updateSource == .auto && source != .auto {
          next.updateSource = source
          return next
        }
        return self
      }
      var next = self
      var ready: Double?
      if continuing { ready = readySince } else if !leaves && Self.isReady(boxPhase) { ready = at }
      next.kind = requested; next.operationId = operation; next.updateSource = updateFrom; next.lockBoxId = observedBoxId
      next.hasLeftHealthy = leaves || continuing && hasLeftHealthy
      next.connectedSince = isConnected ? connectedSince ?? at : nil
      next.reconnectedSinceLeft = continuing && reconnectedSinceLeft
      next.resetOperationId = operation; next.hasTerminalMigration = false
      next.hasRequestAcknowledgement = continuing && hasRequestAcknowledgement
      next.expectsImageUpgrade = requested == .update && (expectsImageUpgrade || imageUpdateAvailable == true)
      next.readySince = ready; next.lastResolution = nil; next.lastResolutionKind = nil
      return next

    case .pending(let pending, _):
      var next = self
      if !pending && kind == nil { next.clearLock() }
      next.isPending = pending
      return next

    case .acknowledged:
      guard kind == .update || Self.isRebuild(kind) else { return self }
      var next = self
      next.hasRequestAcknowledgement = true
      return next

    case .imageUpdate(let available, _):
      var next = self
      next.imageUpdateAvailable = available
      return next

    case .box(let boxId, let phase, let at):
      if boxId == observedBoxId && phase == boxPhase { return self }
      let switched = kind == .update && updateSource == .auto && observedBoxId != nil && boxId != nil && boxId != observedBoxId
      var seen = switched ? reduced(.deactivate(at: at)) : self
      seen.observedBoxId = boxId
      seen.lastHealthyBoxId = Self.isReady(phase) ? boxId : seen.lastHealthyBoxId
      let autoUpdate = kind == nil && !isPending && phase == .pulling && lastHealthyBoxId != nil && lastHealthyBoxId == boxId
      var locked = autoUpdate ? seen.reduced(.request(.update, source: .auto, at: at)) : seen
      if locked.kind == nil {
        locked.boxPhase = phase
        return locked
      }
      if locked.lockBoxId == nil, let boxId { locked.lockBoxId = boxId }
      locked.boxPhase = phase
      if locked.onLockedBox {
        if Self.isReady(phase) {
          locked.readySince = locked.readySince ?? at
        } else {
          locked.hasLeftHealthy = true; locked.teardownObserved = .box; locked.readySince = nil
        }
      } else {
        locked.readySince = nil
      }
      return locked

    case .migration(let phase, let migrationOperation, let at):
      if phase == .failed {
        if kind == nil || kind == .update && isPending || Self.isRebuild(kind) && !sameOperation(resetOperationId, migrationOperation) { return self }
        return ended(.failed)
      }
      if phase == .done {
        let fromMigration = kind == .update && updateSource == .migration
        if !Self.isRebuild(kind) && !fromMigration { return self }
        let own = Self.isRebuild(kind) ? resetOperationId : operationId
        if !sameOperation(own, migrationOperation) || hasTerminalMigration { return self }
        var next = self
        next.hasTerminalMigration = true; next.hasLeftHealthy = true
        next.readySince = isConnected && Self.isReady(boxPhase) && onLockedBox ? at : nil
        return next
      }
      var next = phase == .wiping
        ? reduced(.request(.reset, operationId: migrationOperation, at: at))
        : reduced(.request(.update, source: .migration, at: at))
      if migrationOperation == nil || next.kind == nil || sameOperation(next.operationId, migrationOperation) { return next }
      next.operationId = migrationOperation
      return next

    case .connection(let connected, let at):
      var next = self
      if kind == nil && !(isPending && expectsImageUpgrade) {
        next.isConnected = connected
        next.connectedSince = connected ? connectedSince ?? at : nil
        return next
      }
      if connected {
        next.isConnected = true
        next.connectedSince = connectedSince ?? at
        next.reconnectedSinceLeft = hasLeftHealthy || reconnectedSinceLeft
        next.readySince = hasLeftHealthy && Self.isReady(boxPhase) && onLockedBox ? readySince ?? at : readySince
      } else {
        next.isConnected = false; next.connectedSince = nil; next.hasLeftHealthy = true
        next.teardownObserved = teardownObserved == .none ? .transport : teardownObserved
        next.readySince = nil
      }
      return next

    case .error:
      return kind == nil ? self : ended(.failed)

    case .deactivate:
      guard kind != nil else { return self }
      if kind == .update && isPending {
        var next = self
        next.kind = nil; next.operationId = nil; next.updateSource = nil; next.lockBoxId = nil
        next.resetOperationId = nil; next.hasTerminalMigration = false
        next.lastResolution = .cancelled; next.lastResolutionKind = kind
        return next
      }
      return ended(hasTerminalMigration ? .settled : .cancelled)

    case .tick:
      return self
    }
  }

  /** When the lock lets go by itself, or nil while it waits on something (`yft`). */
  public var settleAt: Double? {
    guard let kind, isConnected else { return nil }
    if kind == .reconnecting { return isPending ? nil : connectedSince.map { $0 + Self.settleDelay } }
    if !hasLeftHealthy { return nil }
    let rebuilding = Self.isRebuild(kind) && !hasTerminalMigration
    let cameBack = rebuilding && teardownObserved == .box && reconnectedSinceLeft && hasRequestAcknowledgement
    if rebuilding && !cameBack || isPending && !cameBack && (!reconnectedSinceLeft || !expectsImageUpgrade || imageUpdateAvailable != false) { return nil }
    guard onLockedBox, Self.isReady(boxPhase), let readySince else {
      let finished = Self.isRebuild(kind) || updateSource == .migration ? hasTerminalMigration : hasRequestAcknowledgement && !isPending && reconnectedSinceLeft
      return finished ? connectedSince.map { $0 + Self.settleDelay } : nil
    }
    return readySince + (!cameBack && (Self.isRebuild(kind) || reconnectedSinceLeft) ? Self.settleDelay : Self.updateSettleDelay)
  }

  /** Let go if its time has come (`Xyn`). */
  public func settled(at now: Double) -> RebuildLock {
    guard let at = settleAt, now >= at else { return self }
    return ended(.settled)
  }

  /** An event, then the settling check at its time (`Qyn`). */
  public func step(_ event: Event) -> RebuildLock { reduced(event).settled(at: event.at) }

  /** The coarse phase (`e6n`). */
  public var stage: Stage? {
    guard let kind else { return nil }
    if kind != .reconnecting && teardownObserved == .none { return .preparing }
    switch boxPhase {
    case .pulling: return .downloading
    case .starting: return .starting
    case .running, .local: return .finishing
    default: return .tearingDown
    }
  }
}

/** The steps of a rebuild and how far it is (`J1t`). */
public struct RebuildSteps: Equatable, Sendable {
  public enum State: String, Sendable { case done, active, pending }
  public struct Step: Equatable, Sendable {
    public let label: String
    public let state: State
  }

  public let steps: [Step]
  public let activeIndex: Int
  /** 0 to 1. */
  public let progress: Double

  public static let updateLabels = ["Getting ready", "Backing up your data", "Recreating Simeon's computer", "Starting Simeon's computer", "Cleaning up", "Reconnecting"]
  public static let resetLabels = ["Getting ready", "Wiping your data", "Creating Simeon's computer", "Starting Simeon's computer", "Cleaning up", "Reconnecting"]
  public static let recoverLabels = ["Getting ready", "Recreating Simeon's computer", "Starting Simeon's computer", "Reconnecting"]

  /** The step a stage or a server phase stands for, by kind (`e8n`, `t8n`, `n8n`); `afterOthers` is a cleaning-up seen after another phase. */
  static func index(_ kind: RebuildLock.Kind, stage: RebuildLock.Stage?, phase: MigrationPhase?, afterOthers: Bool = true) -> Int? {
    if let phase, !phase.isTerminal {
      switch kind {
      case .reset:
        switch phase {
        case .wiping: return 1
        case .creating: return 2
        case .moving: return 3
        case .cleaningUp: return afterOthers ? 4 : 1
        default: return 0
        }
      case .recover:
        switch phase {
        case .moving: return 2
        case .cleaningUp: return afterOthers ? 3 : 1
        default: return 1
        }
      default:
        switch phase {
        case .backingUp: return 1
        case .moving: return 3
        case .cleaningUp: return afterOthers ? 4 : 2
        default: return 2
        }
      }
    }
    guard let stage else { return nil }
    switch (kind, stage) {
    case (_, .preparing): return 0
    case (.reset, .tearingDown), (.recover, .tearingDown): return 1
    case (.reset, .downloading), (.reset, .starting): return 3
    case (.recover, .downloading), (.recover, .starting): return 2
    case (.recover, .finishing): return 3
    case (_, .tearingDown), (_, .downloading): return 2
    case (_, .starting): return 3
    case (_, .finishing): return 5
    }
  }

  /** The furthest step the server's phases reach (`r8n`), counting the current one when it is not terminal. */
  static func furthest(_ kind: RebuildLock.Kind, stage: RebuildLock.Stage?, status: MigrationPhase?, phases: [MigrationPhase]) -> Int? {
    var list = phases
    if let status, !status.isTerminal, list.last != status { list.append(status) }
    var seenOther = false
    var best: Int?
    for phase in list {
      let at = index(kind, stage: stage, phase: phase, afterOthers: phase == .cleaningUp && seenOther)
      if let at { best = best.map { max($0, at) } ?? at }
      if phase != .cleaningUp { seenOther = true }
    }
    return best
  }

  /** The image's download counts inside the step it belongs to, for an update only (`s8n`). */
  static func pullShare(_ kind: RebuildLock.Kind, stage: RebuildLock.Stage?, percent: Double?) -> Double {
    guard kind == .update, stage == .downloading, let percent, percent > 0 else { return 0 }
    return min(percent, 100) / 100
  }

  public static func project(kind: RebuildLock.Kind, stage: RebuildLock.Stage?, status: MigrationPhase?, phases: [MigrationPhase], pullPercent: Double?) -> RebuildSteps {
    let labels = kind == .reset ? resetLabels : kind == .recover ? recoverLabels : updateLabels
    let fromStage = index(kind, stage: stage, phase: nil) ?? 0
    let fromServer = furthest(kind, stage: stage, status: status, phases: phases)
    let active: Int
    if let fromServer {
      active = status.map { !$0.isTerminal } == true ? fromServer : max(fromServer, fromStage)
    } else {
      active = fromStage
    }
    let share = active == fromStage ? pullShare(kind, stage: stage, percent: pullPercent) : 0
    let steps = labels.enumerated().map { Step(label: $1, state: $0 < active ? .done : $0 == active ? .active : .pending) }
    return RebuildSteps(steps: steps, activeIndex: active, progress: (Double(active) + share) / Double(labels.count))
  }
}

/**
 * The dialog or the banner (`R$n`): an update goes to the background
 * banner, a reset or a recovery to the dialog, until the person moves it
 * ("Continue in Background", or a click on the banner); "Reconnecting" is
 * always the banner.
 */
public struct RebuildSurface: Equatable, Sendable {
  public enum Surface: String, Sendable { case foreground, background }

  /** What the lock shows the surface (`lockSnapshots`). */
  public struct LockView: Equatable, Sendable {
    public var kind: RebuildLock.Kind?
    public var operationId: String?
    public var boxId: String?
    public var lastResolution: RebuildLock.Resolution?
    public var isLocked: Bool { kind != nil }

    public init(kind: RebuildLock.Kind? = nil, operationId: String? = nil, boxId: String? = nil, lastResolution: RebuildLock.Resolution? = nil) {
      self.kind = kind; self.operationId = operationId; self.boxId = boxId; self.lastResolution = lastResolution
    }

    public init(_ lock: RebuildLock) {
      self.init(kind: lock.kind, operationId: lock.operationId, boxId: lock.lockBoxId, lastResolution: lock.lastResolution)
    }
  }

  private var chosen: Surface?
  private var chosenOperation: String?
  private var chosenKind: RebuildLock.Kind?
  private var chosenBox: String?
  private var lastPending: RebuildLock.Kind?
  private var wasLocked = false
  private var lastKind: RebuildLock.Kind?
  public private(set) var lock = LockView()

  public init(lock: LockView = LockView(), pending: RebuildLock.Kind? = nil) {
    self.lock = lock; lastPending = pending; wasLocked = lock.isLocked; lastKind = lock.kind
  }

  /** Where the lock shows now, or nil when there is none (`h`). */
  public var surface: Surface? {
    guard let kind = lock.kind else { return nil }
    return kind == .reconnecting ? .foreground : chosen ?? (kind == .update ? .background : .foreground)
  }

  private mutating func forget() { chosen = nil; chosenOperation = nil; chosenKind = nil; chosenBox = nil }

  private mutating func choose(_ surface: Surface) {
    chosen = surface; chosenOperation = lock.operationId; chosenKind = lock.kind; chosenBox = lock.boxId
  }

  private func isChosen(_ kind: RebuildLock.Kind?, _ operation: String?, _ box: String?) -> Bool {
    if chosenOperation != nil && operation != nil { return sameOperation(chosenOperation, operation) }
    if let chosenBox, let box, chosenBox != box { return false }
    return kind == chosenKind
  }

  public mutating func lockChanged(_ next: LockView) {
    lock = next
    let began = !wasLocked && next.isLocked
    let leftReconnect = wasLocked && lastKind == .reconnecting && next.isLocked && next.kind != .reconnecting
    if chosen != nil && chosenOperation == nil && next.operationId != nil && next.kind == chosenKind && wasLocked && next.isLocked { chosenOperation = next.operationId }
    if chosen != nil && chosenBox == nil && next.boxId != nil && next.kind == chosenKind && wasLocked && next.isLocked { chosenBox = next.boxId }
    if chosen != nil && chosenOperation != nil && next.operationId != nil && next.kind != .reconnecting && wasLocked && next.isLocked && sameOperation(chosenOperation, next.operationId) { chosenKind = next.kind }
    if chosen != nil && next.kind != .reconnecting && (began || leftReconnect) && !isChosen(next.kind, next.operationId, next.boxId) { forget() }
    if wasLocked && !next.isLocked && next.lastResolution != .cancelled { forget() }
    wasLocked = next.isLocked
    lastKind = next.kind
  }

  public mutating func pendingChanged(_ pending: RebuildLock.Kind?) {
    if pending != nil && lastPending == nil { forget() }
    lastPending = pending
  }

  /** "Continue in Background". */
  public mutating func continueInBackground() {
    guard surface == .foreground, lock.kind != .reconnecting else { return }
    choose(.background)
  }

  /** A click on the banner. */
  public mutating func restoreForeground() {
    guard lock.isLocked, lock.kind != .reconnecting else { forget(); return }
    choose(.foreground)
  }

  public mutating func reset(pending: RebuildLock.Kind?) { forget(); lastPending = pending }
}

/** The words of the rebuild, as the window has them (`_1t`, `K1t`, `FAe`, `Wbn`, `zAe`, `j8n`, `k8n`, `D8n`). */
public enum RebuildWords {
  public static func title(_ kind: RebuildLock.Kind) -> String {
    switch kind {
    case .update: return "Updating Simeon's Computer"
    case .reset: return "Resetting Simeon's Computer"
    case .recover, .reconnecting: return "Recovering Simeon's Computer"
    }
  }

  public static let continueInBackground = "Continue in Background"
  public static let bannerLabel = "View Simeon's Computer progress"

  /** The banner while the stream is away (`g8n`, `y8n`): its title and line under it. */
  public static func reconnecting(stage: RebuildLock.Stage?, connected: Bool) -> (title: String, subtitle: String?) {
    if stage == .downloading || stage == .starting { return ("Simeon's computer restarting", "Starting Simeon's computer") }
    return connected ? ("Checking connection", "Reconnecting") : ("Reconnecting", nil)
  }

  // MARK: Update

  /** What the palette and the pill can do (`RAe`). */
  public enum Availability: String, Sendable { case unavailable, queued, upToDate = "up-to-date", ready, busyOverride = "busy-override" }

  public static func availability(canUpdateBaseline: Bool, canUpdateBox: Bool, isBoxUpToDate: Bool, isUpdateQueued: Bool) -> Availability {
    guard canUpdateBaseline else { return .unavailable }
    if isUpdateQueued { return .queued }
    if isBoxUpToDate { return .upToDate }
    return canUpdateBox ? .ready : .busyOverride
  }

  /** A confirmation: its title, what it says, its buttons. */
  public struct Confirmation: Equatable, Sendable {
    public let title: String
    public let description: String
    public let confirm: String
    public let cancel: String
    /** A middle button ("Update anyway"), red. */
    public let secondary: String?
    public let warning: String?
    public let destructive: Bool
  }

  /** Nobody working (`K1t`). */
  public static let updateIdle = Confirmation(title: "Update Simeon's Computer?", description: "This updates the shared computer all your agents run on to the latest version. Their files and logins are kept.",
                                             confirm: "Update Simeon's Computer", cancel: "Not now", secondary: nil, warning: nil, destructive: false)

  /** One agent or more working (`FAe`). */
  public static func updateBusy(_ names: [String]) -> Confirmation {
    let several = names.count > 1
    return Confirmation(title: several ? "Update while agents are working?" : "An agent is working", description: busyDescription(names),
                        confirm: several ? "Update when agents are done" : "Update when done", cancel: "Cancel", secondary: "Update anyway", warning: nil, destructive: false)
  }

  static func busyDescription(_ names: [String]) -> String {
    if names.count > 1 { return "\(nameList(names)) are working on Simeon's computer right now. Updating recreates the computer and interrupts their current turns. Files and logins are kept." }
    let name = (names.first ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return "\(name.isEmpty ? "An agent is" : "\(name) is") working right now. Waiting lets its current turn finish. Updating now recreates the computer and interrupts it. Files and logins are kept either way."
  }

  /** "A and B", "A, B, and 3 other agents", "A and 1 other agent", "N agents" (`Gbn`). */
  public static func nameList(_ names: [String]) -> String {
    let kept = names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    guard let first = kept.first else { return "\(names.count) agents" }
    let second = kept.count > 1 ? kept[1] : nil
    let others = names.count - (second == nil ? 1 : 2)
    func otherAgents(_ n: Int) -> String { "\(n) other \(n == 1 ? "agent" : "agents")" }
    guard let second else { return "\(first) and \(otherAgents(others))" }
    return others == 0 ? "\(first) and \(second)" : "\(first), \(second), and \(otherAgents(others))"
  }

  /** Why a confirmed action is refused, kept in the dialog in red (`zAe`). */
  public static func refusal(update: Bool, isBlocked: Bool, pending: RebuildLock.Kind?, canReset: Bool, canUpdate: Bool) -> String? {
    if isBlocked { return "Further computer updates and resets are disabled for this session. Restart Simeon after the computer is available again." }
    if pending != nil { return "The computer is already being rebuilt." }
    if !update && !canReset { return "Open an agent to reset the shared computer." }
    if update && !canUpdate { return "Open an agent to update the shared computer." }
    return nil
  }

  // MARK: The lifecycle dialogs (`j8n`)

  public static let unreachableTitle = "Couldn't Reach Simeon's Computer"
  public static let unreachableBody = "Your agents, files, and logins are safe. If it doesn't reconnect on its own, recover Simeon's computer to keep the data."
  public static let recoverButton = "Recover Simeon's Computer"
  public static let recoverTitle = "Recover Simeon's Computer?"
  public static let recoverBody = "This recreates Simeon's computer and reconnects. Your agents, files, and logins are kept."
  public static let longerTitle = "Taking longer than expected"
  public static let keepWaiting = "Keep waiting"

  public static func longerBody(_ kind: RebuildLock.Kind) -> String {
    switch kind {
    case .reset: return "The reset is still running \u{2014} rebuilding Simeon's computer can take a few minutes. You can keep waiting, or continue in the background."
    case .recover, .reconnecting: return "The recovery is still running \u{2014} recreating Simeon's computer can take a few minutes. You can keep waiting, or continue in the background."
    case .update: return "The update is still running \u{2014} a large image download can take a few minutes. You can keep waiting, or continue in the background."
    }
  }

  public static func failedTitle(_ kind: RebuildLock.Kind) -> String {
    switch kind {
    case .update: return "Update failed"
    case .reset: return "Reset failed"
    default: return "Recover failed"
    }
  }

  public static func failedBody(_ kind: RebuildLock.Kind) -> String {
    switch kind {
    case .update: return "The update couldn't finish, so Simeon's computer is still on its previous image. Your agents, files, and logins are safe."
    case .reset: return "The reset couldn't finish. Simeon's computer may be in a partial state \u{2014} retry to run the reset again."
    default: return "The recovery couldn't finish, so Simeon's computer may still be unreachable. Your agents, files, and logins are safe."
    }
  }

  public static func retry(_ kind: RebuildLock.Kind) -> String {
    switch kind {
    case .update: return "Retry Update"
    case .reset: return "Retry Reset"
    default: return "Retry Recovery"
    }
  }

  // MARK: Low disk (`D8n`; Simeon keeps the automatic Disk Saver on)

  public static func diskTitle(hard: Bool) -> String { hard ? "Computer is critically low on disk space" : "Computer is low on disk space" }
  public static let diskBody = "Disk Saver is auditing usage and will propose safe cleanup. Nothing is deleted without confirmation."
  public static let diskButton = "Go to Disk Saver"
  public static let diskOpening = "Opening Disk Saver\u{2026}"
  /** The agent the button opens or makes (`z8n`). */
  public static let diskSaverName = "Disk Saver"
  public static let diskSaverDescription = "Audits disk usage on Simeon's computer and proposes safe cleanup for approval."
}
