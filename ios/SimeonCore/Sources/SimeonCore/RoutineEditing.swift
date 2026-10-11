import Foundation
import Observation

/**
 * A routine's editor as the Mac's pane runs it (mac/Simeon/RoutinesPage.swift,
 * `RoutineEditorModel`; the window's `_2n` and `P2n`), without its drawing:
 * the iPhone's editor (ios/Simeon/RoutineEditor.swift) draws it. Nothing is
 * sent while typing: a field is saved when it lets go of the keys, a trigger
 * when it is picked or its editor closes, and a new routine is made only
 * once it has a name, an instruction and a trigger that is right.
 */
@MainActor
@Observable
public final class RoutineEditing {
  public let agentId: String
  /** Nil for a new routine until its create comes back; then the same editor goes on with the record (`onCreated`). */
  public private(set) var routineId: String?
  /** Opened from New Routine or Create Routine: the name field takes the keys. */
  public let isNew: Bool

  /** The fields as typed. */
  public var name: String
  public var prompt: String
  /** The stored name, instruction and trigger as last seen (`W`, `G`, `te`): a field still showing them follows a change. */
  @ObservationIgnored private var seenName: String
  @ObservationIgnored private var seenPrompt: String
  @ObservationIgnored private var seenTrigger: JSON

  /** When to run, as edited (`draft.rows`), and the card's last rows that were right (`N`). */
  public private(set) var rows: [TriggerRow]
  @ObservationIgnored private var lastValid: [TriggerRow]
  /** The only row was removed: the Add menu opened by itself, and closing it leaves the card empty (`k`). */
  @ObservationIgnored private var removedLast = false

  /** A new routine's Active switch, on at first (`h`, `k`). */
  public private(set) var activeDraft = true
  /** The Active switch's call is on its way: the switch waits (`I.isPending`). */
  public private(set) var toggling = false
  /** The create is on its way (`A.isPending`); what was changed meanwhile (`Q`) and whether Delete was pressed (`ae`). */
  public private(set) var creating = false
  @ObservationIgnored private var queued: (name: String?, prompt: String?, trigger: JSON?)?
  @ObservationIgnored private var deleteAfterCreate = false
  /** Test run's call is on its way (`J.isPending`). */
  public private(set) var testing = false
  /** "Couldn't save this routine.", until the next save is tried (`v`). */
  public var saveFailed = false

  /** The row whose editor is open (the Mac's popover), one at a time. */
  public var openRow: Int?
  /** Bumped to open the Add menu by itself (the only row removed). */
  public private(set) var addMenuRequests = 0
  /** Bumped by Test run: Run history comes into view. */
  public private(set) var historyRequests = 0

  /** The calls under way, for `settled()`. */
  @ObservationIgnored private var work: [Task<Void, Never>] = []

  public init(agentId: String, routine: Routine?) {
    self.agentId = agentId
    routineId = routine?.id
    isNew = routine == nil
    name = routine?.name ?? ""
    prompt = routine?.prompt ?? ""
    seenName = routine?.name ?? ""
    seenPrompt = routine?.prompt ?? ""
    seenTrigger = routine?.trigger ?? .null
    let rows = TriggerRow.rows(routine?.trigger)
    self.rows = rows
    lastValid = rows
  }

  public func stored(_ store: AppStore) -> Routine? {
    guard let routineId else { return nil }
    return store.routinesByAgent[agentId]?.first { $0.id == routineId }
  }

  /** Waits for every call the editor started, and the ones those started (the tests). */
  func settled() async {
    while !work.isEmpty {
      let next = work.removeFirst()
      await next.value
    }
  }

  private func run(_ body: @escaping @MainActor () async -> Void) {
    // Long done ones are let go: an editor left open saves many times.
    if work.count > 32 { work.removeFirst(work.count - 32) }
    work.append(Task { await body() })
  }

  // MARK: The stored record changed

  /** A field still showing the stored words follows them; the rows follow the stored trigger while they equal the one before (`W`, `G`, `te`). */
  public func follow(_ routine: Routine?) {
    guard let routine else { return }
    if routine.name != seenName {
      if name == seenName { name = routine.name }
      seenName = routine.name
    }
    if routine.prompt != seenPrompt {
      if prompt == seenPrompt { prompt = routine.prompt }
      seenPrompt = routine.prompt
    }
    let trigger = routine.trigger ?? .null
    if trigger != seenTrigger {
      if let current = TriggerRow.trigger(rows), current == seenTrigger { rows = TriggerRow.rows(routine.trigger) }
      seenTrigger = trigger
    }
  }

  // MARK: Saving (`X`, `xe`, `fe`)

  /** What a save sends: for a stored routine an empty field keeps what is stored and the switch's pending value goes (`X`). */
  private func spec(_ trigger: JSON, store: AppStore) -> JSON? {
    if let stored = stored(store) {
      return RoutineDraft.updateSpec(stored, name: name, prompt: prompt, trigger: trigger, isEnabled: stored.isEnabled)
    }
    return RoutineDraft.newSpec(name: name, prompt: prompt, trigger: trigger, isEnabled: activeDraft)
  }

  /** The current trigger: the rows when they are right, else the stored one (`be`). */
  private func currentTrigger(_ store: AppStore) -> JSON? {
    TriggerRow.trigger(rows) ?? stored(store)?.trigger
  }

  /** A new routine made once it is whole (`xe`); edits while it is made go after it as one update, if they change anything. */
  private func create(_ trigger: JSON?, store: AppStore) {
    guard routineId == nil, !creating, let trigger, let spec = spec(trigger, store: store) else { return }
    creating = true
    let agentId = agentId
    run {
      let made = await store.createRoutine(agentId, spec: spec)
      self.creating = false
      guard let made else {
        self.queued = nil
        self.deleteAfterCreate = false
        self.saveFailed = true
        return
      }
      if self.deleteAfterCreate {
        self.deleteAfterCreate = false
        self.queued = nil
        await store.removeRoutine(agentId, made.id)
        return
      }
      if made.isEnabled != self.activeDraft { self.setEnabled(made.id, self.activeDraft, store: store) }
      let pending = self.queued
      self.queued = nil
      self.routineId = made.id
      self.seenName = made.name
      self.seenPrompt = made.prompt
      self.seenTrigger = made.trigger ?? .null
      if let pending {
        let next: JSON = ["name": .string(pending.name ?? made.name), "prompt": .string(pending.prompt ?? made.prompt),
                          "trigger": pending.trigger ?? made.trigger ?? .null, "isEnabled": .bool(self.activeDraft)]
        if !RoutineDraft.unchanged(made, spec: next), !(await store.updateRoutine(agentId, made.id, spec: next)) { self.saveFailed = true }
      }
    }
  }

  /** A stored routine changed (`fe`). */
  private func update(_ trigger: JSON?, store: AppStore) {
    guard let routineId, let trigger, let spec = spec(trigger, store: store) else { return }
    let agentId = agentId
    run {
      if !(await store.updateRoutine(agentId, routineId, spec: spec)) { self.saveFailed = true }
    }
  }

  /** Name let go of the keys (`Ae`): empty or unchanged puts the stored name back; else it is saved. */
  public func nameDone(store: AppStore) {
    saveFailed = false
    let value = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if let stored = stored(store) {
      if value.isEmpty || value == stored.name { name = stored.name; return }
      update(currentTrigger(store) ?? stored.trigger, store: store)
      return
    }
    if creating {
      if !value.isEmpty { queued = (value, queued?.prompt, queued?.trigger) }
      return
    }
    create(currentTrigger(store), store: store)
  }

  /** Instruction let go of the keys (`ve`), as Name. */
  public func promptDone(store: AppStore) {
    saveFailed = false
    let value = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    if let stored = stored(store) {
      if value.isEmpty || value == stored.prompt { prompt = stored.prompt; return }
      update(currentTrigger(store) ?? stored.trigger, store: store)
      return
    }
    if creating {
      if !value.isEmpty { queued = (queued?.name, value, queued?.trigger) }
      return
    }
    create(currentTrigger(store), store: store)
  }

  /** The rows committed (`ye`): saved when right and not what is stored. */
  private func save(rows next: [TriggerRow], store: AppStore) {
    saveFailed = false
    rows = next
    guard let trigger = TriggerRow.trigger(next) else { return }
    if let stored = stored(store) {
      if trigger == (stored.trigger ?? .null) { return }
      update(trigger, store: store)
      return
    }
    if creating {
      queued = (queued?.name, queued?.prompt, trigger)
      return
    }
    create(trigger, store: store)
  }

  // MARK: The card's rows (`P2n`: `J`, `O`, `L`, `V`, `W`, `B`)

  /** A commit: the rows, if right, become the last right ones; then saved (`J`). */
  public func commit(_ next: [TriggerRow], store: AppStore) {
    if TriggerRow.trigger(next) != nil { lastValid = next }
    save(rows: next, store: store)
  }

  /** A row's editor or the Add menu closed with no pick (`O`, `de`): rows that are right are saved; else they go back (the stored trigger, or a new routine's last right rows). */
  public func commitOrRevert(store: AppStore) {
    if TriggerRow.trigger(rows) != nil {
      lastValid = rows
      save(rows: rows, store: store)
    } else if let stored = stored(store) {
      rows = TriggerRow.rows(stored.trigger)
    } else {
      rows = lastValid
    }
  }

  /** A row typed into or chosen, saved now when `commits` (a pick, a field letting go of the keys). */
  public func set(_ index: Int, _ row: TriggerRow, commits: Bool, store: AppStore) {
    guard rows.indices.contains(index) else { return }
    var next = rows
    next[index] = row
    if commits { commit(next, store: store) } else { rows = next }
  }

  /** A row added from the Add menu (`L`): committed now when it is right alone. Its index. */
  @discardableResult
  private func add(_ row: TriggerRow, store: AppStore) -> Int {
    removedLast = false
    let next = rows + [row]
    if TriggerRow.trigger([row]) != nil { commit(next, store: store) } else { rows = next }
    return next.count - 1
  }

  /** A schedule from the Add menu (`D`): saved at once; its editor opens for Every week, Every month, Interval and Advanced. */
  public func addSchedule(_ line: String, opens: Bool, store: AppStore) {
    guard rows.count < TriggerRow.limit else { return }
    let index = add(.schedule(line), store: store)
    openRow = opens ? index : nil
  }

  /** An event source from the Add menu (`F`): its row, and its editor open. */
  public func addSource(_ platform: String, store: AppStore) {
    guard rows.count < TriggerRow.limit else { return }
    openRow = add(TriggerRow.new(platform), store: store)
  }

  /** Removing a row (`V`): with others left it goes and the rest is saved; the only row empties the card (nothing is saved) and the Add menu opens. */
  public func remove(_ index: Int, store: AppStore) {
    openRow = nil
    if rows.count <= 1 {
      lastValid = []
      rows = []
      removedLast = true
      addMenuRequests += 1
      return
    }
    guard rows.indices.contains(index) else { return }
    var next = rows
    next.remove(at: index)
    commit(next, store: store)
  }

  /** The Add menu closed (`W`): with no pick the rows are kept or go back, unless the only row was just removed. */
  public func addMenuClosed(picked: Bool, store: AppStore) {
    guard !picked, !removedLast else { return }
    commitOrRevert(store: store)
  }

  /** The row's editor closed (`B`): back, or another way out. */
  public func closeRow(store: AppStore) {
    guard openRow != nil else { return }
    openRow = nil
    commitOrRevert(store: store)
  }

  // MARK: The control bar

  /** The switch's value: a new routine's own, else the stored one (changed at once while its call is on its way). */
  public func isActive(_ store: AppStore) -> Bool { stored(store)?.isEnabled ?? activeDraft }

  /** The Active switch (`Je`): a new routine keeps it for its create; a stored one is changed now, and goes back if refused. */
  public func toggleActive(_ on: Bool, store: AppStore) {
    guard let routineId else {
      activeDraft = on
      return
    }
    setEnabled(routineId, on, store: store)
  }

  private func setEnabled(_ id: String, _ on: Bool, store: AppStore) {
    toggling = true
    let agentId = agentId
    run {
      _ = await store.enableRoutine(agentId, id, on)
      self.toggling = false
    }
  }

  /** Delete (`Ie`): no question; a routine being made is deleted when its create comes back. The editor goes back to the list at once. */
  public func delete(store: AppStore) {
    if let routineId {
      let agentId = agentId
      run { await store.removeRoutine(agentId, routineId) }
    } else if creating {
      deleteAfterCreate = true
    }
  }

  /** Test run (`we`): the run asked for, the list read again, Run history brought into view. */
  public func testRun(store: AppStore, runs: RoutineTestRuns) {
    guard let routineId else { return }
    historyRequests += 1
    testing = true
    let agentId = agentId
    run {
      await runs.run(agentId, routineId, store: store)
      self.testing = false
    }
  }

  /** "Running…" and not pressable: its call on its way, the wait after it (`rJt`), or its newest run still going (`Le`). */
  public func isRunning(_ store: AppStore, runs: RoutineTestRuns) -> Bool {
    guard let routineId else { return false }
    return testing || runs.isBlocked(agentId, routineId) || stored(store)?.isRunning == true
  }
}

/**
 * Test run's waits, for every routine (the Mac's `RoutineRunBlocks`, the
 * window's `runNowBlockedFor`): set on the tap, held while the run it
 * started is awaited and while it runs, lifted 3 seconds after it ends, or
 * at once when the routine goes or the run is refused.
 */
@MainActor
@Observable
public final class RoutineTestRuns {
  public private(set) var blocked: Set<String> = []
  @ObservationIgnored private var flights: [String: RoutineRunFlight] = [:]
  @ObservationIgnored private var expiries: [String: Task<Void, Never>] = [:]
  @ObservationIgnored private var watching: Set<String> = []

  public init() {}

  private static func key(_ agentId: String, _ routineId: String) -> String { agentId + "\u{1f}" + routineId }

  public func isBlocked(_ agentId: String, _ routineId: String) -> Bool { blocked.contains(Self.key(agentId, routineId)) }

  /** Test run (`runNow`): once at a time per routine. */
  public func run(_ agentId: String, _ routineId: String, store: AppStore) async {
    let key = Self.key(agentId, routineId)
    guard flights[key] == nil else { return }
    flights[key] = RoutineRunFlight(before: store.routinesByAgent[agentId]?.first { $0.id == routineId })
    blocked.insert(key)
    watch(agentId, store: store)
    guard await store.testRoutine(agentId, routineId) else {
      if flights[key]?.phase != .cooldown { end(key) }
      return
    }
    take(agentId, store: store)
    if var flight = flights[key] {
      flight.afterRead()
      place(key, flight)
    }
  }

  /** The agent's list changed: each of its waits moves on. */
  private func take(_ agentId: String, store: AppStore) {
    let prefix = agentId + "\u{1f}"
    for (key, var flight) in flights where key.hasPrefix(prefix) {
      let routineId = String(key.dropFirst(prefix.count))
      if flight.take(store.routinesByAgent[agentId]?.first { $0.id == routineId }) { place(key, flight) } else { end(key) }
    }
  }

  private func place(_ key: String, _ flight: RoutineRunFlight) {
    flights[key] = flight
    guard flight.phase == .cooldown, expiries[key] == nil else { return }
    expiries[key] = Task { [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(RoutineRunFlight.cooldownSeconds * 1_000_000_000))
      guard !Task.isCancelled else { return }
      self?.end(key)
    }
  }

  private func end(_ key: String) {
    flights[key] = nil
    expiries[key]?.cancel()
    expiries[key] = nil
    blocked.remove(key)
  }

  /** Watches the agent's list while one of its routines waits. */
  private func watch(_ agentId: String, store: AppStore) {
    guard !watching.contains(agentId) else { return }
    watching.insert(agentId)
    observe(agentId, store: store)
  }

  private func observe(_ agentId: String, store: AppStore) {
    withObservationTracking {
      _ = store.routinesByAgent[agentId]
    } onChange: { [weak self] in
      Task { @MainActor [weak self] in
        guard let self else { return }
        self.take(agentId, store: store)
        if self.flights.keys.contains(where: { $0.hasPrefix(agentId + "\u{1f}") }) {
          self.observe(agentId, store: store)
        } else {
          self.watching.remove(agentId)
        }
      }
    }
  }
}

/** A trigger source's name, as the Mac's Add menu words it ("On a schedule", "Slack message"…): the title of its editor on the iPhone. */
extension TriggerRow {
  public static func sourceLabel(_ platform: String) -> String {
    platform == "schedule" ? "On a schedule" : (sources.first { $0.platform == platform }?.label ?? platform)
  }

  /** The Add menu's Cadence (`A2n`): each choice's words, and its line or the days its times run on; `opens` says whether its editor opens once it is added. */
  public static let cadences: [(label: String, line: String?, days: String?, opens: Bool)] = [
    ("Every hour", "0 * * * *", nil, false),
    ("Every day", nil, "*", false),
    ("Weekdays", nil, "1-5", false),
    ("Every week", RoutineSchedule.line(RoutineSchedule.start("weekly", from: nil)), nil, true),
    ("Every month", RoutineSchedule.line(RoutineSchedule.start("monthly", from: nil)), nil, true),
    ("Interval", RoutineSchedule.line(RoutineSchedule.start("interval", from: nil)), nil, true),
    // Advanced… saves "0 8 * * *" and its editor shows Every day (the window's own quirk).
    ("Advanced\u{2026}", RoutineSchedule.line(RoutineSchedule.start("advanced", from: nil)), nil, true),
  ]

  /** A Cadence time's line: "minute hour * * days" (`A2n`). */
  public static func timeLine(_ time: RoutineSchedule.Time, days: String) -> String {
    "\(time.minute) \(time.hour) * * \(days)"
  }
}
