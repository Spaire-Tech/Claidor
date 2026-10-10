import Foundation

/** How a call under a deadline ended: answered, failed, or still out when the time was up (it may answer later). */
public enum DeadlineOutcome<Value: Sendable>: Sendable {
  case answered(Value)
  case failed
  case timedOut
}

/** The first of two things to happen, once. */
private final class FirstOf<Value: Sendable>: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<DeadlineOutcome<Value>, Never>?
  init(_ continuation: CheckedContinuation<DeadlineOutcome<Value>, Never>) { self.continuation = continuation }
  func resume(_ outcome: DeadlineOutcome<Value>) {
    lock.lock()
    let waiting = continuation
    continuation = nil
    lock.unlock()
    waiting?.resume(returning: outcome)
  }
}

/**
 * A call given so long (the window's `deadline.run`): the outcome at the
 * deadline at the latest. The call itself goes on, so a late answer can
 * still be awaited on `call`.
 */
public func withDeadline<Value: Sendable>(_ seconds: TimeInterval, _ call: Task<Value, Error>) async -> DeadlineOutcome<Value> {
  await withCheckedContinuation { continuation in
    let first = FirstOf(continuation)
    Task {
      do { first.resume(.answered(try await call.value)) } catch { first.resume(.failed) }
    }
    Task {
      try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
      first.resume(.timedOut)
    }
  }
}

/**
 * Each agent's computer as the window keeps it (`TTn`, `NTn`, `MTn`,
 * `yJt`): its status read under 15 s and kept, started when its full view
 * opens, read again when the stream comes back or the window comes
 * forward, and pushed by the host (`forever-box`); the helpers working on
 * it (`subagents`) and the agent's pointer on it (`computer-action`).
 */
extension AppStore {
  // MARK: Watching

  /** A view shows this agent's computer: its status is read now, and kept fresh while it shows (`retain`). */
  public func watchComputer(_ agentId: String) {
    computer.watch(agentId)
    if isLive { readComputer(agentId) }
    if subagentsByAgent[agentId] == nil { Task { await loadSubagents(agentId) } }
  }

  public func unwatchComputer(_ agentId: String) { computer.unwatch(agentId) }

  // MARK: Reads and starts

  /** `getForeverBoxStatus`, given 15 s; a later answer is still taken if nothing newer came. */
  public func readComputer(_ agentId: String) {
    guard let backend, let attempt = computer.beginRead(agentId) else { return }
    let call = Task { try await backend.command("getForeverBoxStatus", ["id": .string(agentId)]) }
    Task { [weak self] in
      let outcome = await withDeadline(ComputerScreen.deadline, call)
      guard let self, self.backend === backend else { return }
      switch outcome {
      case .answered(let answer):
        self.computer.readAnswered(agentId, attempt: attempt, BoxStatus(json: answer))
      case .failed:
        self.computer.readFailed(agentId, attempt: attempt)
      case .timedOut:
        self.computer.readFailed(agentId, attempt: attempt)
        do {
          let late = try await call.value
          guard self.backend === backend else { return }
          self.computer.lateRead(agentId, attempt: attempt, BoxStatus(json: late))
        } catch {
          self.computer.readFailed(agentId, attempt: attempt)
        }
      }
    }
  }

  /** `ensureForeverBox`: wakes or starts the computer and waits for its screen, given 15 s; the agent is "demanded" from now on. */
  public func ensureComputer(_ agentId: String) {
    guard let backend, let generation = computer.beginEnsure(agentId) else { return }
    let call = Task { try await backend.command("ensureForeverBox", ["id": .string(agentId)]) }
    Task { [weak self] in
      let outcome = await withDeadline(ComputerScreen.deadline, call)
      guard let self, self.backend === backend else { return }
      switch outcome {
      case .answered(let answer):
        self.computer.ensureSettled(agentId, generation: generation, BoxStatus(json: answer), failed: false)
      case .failed:
        self.computer.ensureSettled(agentId, generation: generation, nil, failed: true)
      case .timedOut:
        self.computer.ensureSettled(agentId, generation: generation, nil, failed: true)
        guard let late = try? await call.value, self.backend === backend else { return }
        self.computer.lateEnsure(agentId, generation: generation, BoxStatus(json: late))
      }
    }
  }

  /** Retry under "Can't reach…": read again, and start again if it was started here (`retryStatus`). */
  public func retryComputer(_ agentId: String) {
    readComputer(agentId)
    if computer.demanded.contains(agentId) { ensureComputer(agentId) }
  }

  /** Opening the full view (`XOn` `_`): the computer is started. */
  public func openComputer(_ agentId: String) {
    ensureComputer(agentId)
  }

  /**
   * "I'm done, continue" (`button`) or "Skip this step" (`dismissed`) on a
   * hand-off (`handBackForeverBox`); the host takes it from there, and a
   * failure is not shown (the window's is an empty function).
   */
  public func handBackComputer(_ agentId: String, skip: Bool = false) async {
    _ = try? await backend?.command("handBackForeverBox", ["id": .string(agentId), "trigger": .string(skip ? "dismissed" : "button")])
  }

  /** The address of a screen the host gave (its loopback page), through Simeon Labs' proxy. */
  public func screenSocket(_ vncUrl: String) async -> URL? {
    await backend?.screenSocket(vncUrl)
  }

  // MARK: Helpers

  /** The agent's subagents, read once a view watches its computer (`getSubagents`), then kept by the host's pushes. */
  public func loadSubagents(_ agentId: String) async {
    guard let backend, let answer = try? await backend.command("getSubagents", ["id": .string(agentId)]) else { return }
    subagentsByAgent[agentId] = answer.array ?? answer["subagents"]?.array ?? []
  }

  /** The helpers' screens on this agent's computer, in the host's order (`MTn`). */
  public func computerHelpers(_ agentId: String) -> [ComputerHelper] {
    ComputerHelper.screens(subagentsByAgent[agentId] ?? [])
  }

  /** The most recent status of any agent's computer (`getMostRecentStatus`): the first run's "Waking your computer…". */
  public var latestComputerStatus: BoxStatus? { computer.mostRecent }

  // MARK: The connection and the window

  /** The event stream back (`noteReconnect`): read what is watched, start again what was started here, the helpers again. */
  func computerReconnected() {
    lastComputerCatchUp = Date()
    let (reads, ensures) = computer.reconnected()
    for id in reads { readComputer(id); Task { await loadSubagents(id) } }
    for id in ensures { ensureComputer(id) }
  }

  /**
   * The window came forward. A computer started here is started again at
   * once (`NTn`'s focus listener); at most once a minute, and not while the
   * computer is being rebuilt, everything watched is read again with the
   * agents, the open chat, the pins and the sections (`noteWindowFocus`,
   * `sand_focus_staleness_catch_up`).
   */
  public func windowCameForward(rebuilding: Bool = false) {
    guard isLive else { return }
    for id in computer.watched where computer.demanded.contains(id) { ensureComputer(id) }
    guard !rebuilding, Date().timeIntervalSince(lastComputerCatchUp) >= ComputerScreen.focusCatchUp else { return }
    lastComputerCatchUp = Date()
    let (reads, ensures) = computer.focused()
    for id in reads { readComputer(id) }
    for id in ensures { ensureComputer(id) }
    Task {
      await reloadRoster()
      if let chat = openChat { await refresh(chat) }
      await loadPins()
      await loadSections()
    }
  }

  /** A `forever-box`, `box-disk-pressure`, `computer-action` or `subagents` push. */
  func applyComputer(_ event: BackendEvent) {
    switch event {
    case .computer(let payload):
      if let status = BoxStatus(json: payload) { computer.ingest(status) }
    case .diskPressure(let payload):
      // The same level again (the computer says it often) changes nothing: set anyway, it redrew whatever reads the computers.
      var next = computer
      next.ingestDiskPressure(payload)
      if next != computer { computer = next }
    case .computerAction(let payload):
      guard let agentId = payload["agentId"]?.text, let pointer = AgentPointer(json: payload) else { return }
      pointers[agentId] = pointer
    case .subagents(let parentId, let rows):
      subagentsByAgent[parentId] = rows
    default:
      break
    }
  }
}
