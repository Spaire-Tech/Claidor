import Foundation

/** One of an agent's routines, as the host lists them (`AutomationRecord`, host/automations/automation.ts). */
public struct Routine: Identifiable, Hashable, Sendable {
  public let id: String
  public var name: String
  public var prompt: String
  /** The first cron line of its trigger, when it runs on a schedule. */
  public var schedule: String
  /** The host's own words for when it runs (`triggerDescription`: "Every Monday at 9:00 AM"). */
  public var summary: String
  /** What wakes it, as stored: one member, or `{type:"group", listeners}`. */
  public var trigger: JSON?
  public var isEnabled: Bool
  /** Milliseconds since the epoch. */
  public var createdAt: Double?
  public var lastRunAt: Double?
  public var nextRunAt: Double?
  /** Its last runs, newest first (the host keeps 20). */
  public var runs: [RoutineRun]

  public init?(json: JSON) {
    guard let id = json["id"]?.text else { return nil }
    self.id = id
    name = json["name"]?.string ?? "Routine"
    prompt = json["prompt"]?.string ?? ""
    trigger = json["trigger"]?.present ?? json["schedule"]?.text.map { ["type": "cron", "schedule": .string($0)] }
    let firstCron = TriggerRow.rows(trigger).lazy.compactMap { row -> String? in if case .schedule(let line) = row { return line } else { return nil } }.first
    schedule = json["schedule"]?.string ?? firstCron ?? ""
    summary = json["triggerDescription"]?.text ?? Schedule(cron: schedule).summary
    isEnabled = json["isEnabled"]?.bool ?? true
    createdAt = json["createdAt"]?.double
    lastRunAt = json["lastRunAt"]?.double
    nextRunAt = json["nextRunAt"]?.double
    runs = (json["runs"]?.array ?? []).compactMap(RoutineRun.init)
  }

  public init(id: String, name: String, prompt: String, schedule: String, isEnabled: Bool = true) {
    self.id = id; self.name = name; self.prompt = prompt; self.schedule = schedule
    trigger = ["type": "cron", "schedule": .string(schedule)]
    summary = Schedule(cron: schedule).summary; self.isEnabled = isEnabled; createdAt = nil; lastRunAt = nil; nextRunAt = nil; runs = []
  }

  /** What `createAgentAutomation` and `updateAgentAutomation` take (`AutomationSpec`). */
  public var spec: JSON {
    ["name": .string(name), "prompt": .string(prompt), "trigger": trigger ?? ["type": "cron", "schedule": .string(schedule)], "isEnabled": .bool(isEnabled)]
  }

  /** The list's order: active ones first, then paused, each in the host's order (`V2n`). */
  public static func listed(_ routines: [Routine]) -> [Routine] {
    routines.filter(\.isEnabled) + routines.filter { !$0.isEnabled }
  }

  /** Whether its newest run is still going. */
  public var isRunning: Bool { runs.first?.status == "running" }

  /** A row's second line: the host's words, or "Paused" (`G2n`). */
  public var rowDetail: String { isEnabled ? summary : "Paused" }
}

/** One run of a routine, for its history (`AutomationRun`). */
public struct RoutineRun: Identifiable, Hashable, Sendable {
  public let id: String
  /** "schedule", "manual" or "event". */
  public let trigger: String
  public let at: Double?
  public let finishedAt: Double?
  /** "running", "ok" or "error". */
  public let status: String
  /** The error, at most 300 characters. */
  public let detail: String?
  /** What woke it, for an event. */
  public let event: String?

  /** The history row's tooltip (`detail ?? event`). */
  public var summary: String { detail ?? event ?? "" }
  public var startedAt: Double? { at }

  init?(_ json: JSON) {
    at = json["startedAt"]?.double ?? json["at"]?.double ?? json["timestampMs"]?.double ?? json["finishedAt"]?.double
    finishedAt = json["finishedAt"]?.double
    status = json["status"]?.string ?? json["outcome"]?.string ?? ""
    detail = json["detail"]?.text ?? json["error"]?.text
    event = json["event"]?.text
    trigger = json["trigger"]?.string ?? ""
    id = json["id"]?.text ?? "\(at ?? 0)-\(status)"
    if at == nil && status.isEmpty { return nil }
  }
}

/**
 The routine editor's rules for saving, as the shipped window has them (`_2n`):
 nothing is saved until a new routine has a name, an instruction and a trigger;
 an existing one keeps its stored values for any field left empty.
 */
public enum RoutineDraft {
  /** A new routine's spec, or nil while it is not whole yet. */
  public static func newSpec(name: String, prompt: String, trigger: JSON?, isEnabled: Bool) -> JSON? {
    let n = name.trimmingCharacters(in: .whitespacesAndNewlines), p = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !n.isEmpty, !p.isEmpty, let trigger else { return nil }
    return ["name": .string(n), "prompt": .string(p), "trigger": trigger, "isEnabled": .bool(isEnabled)]
  }

  /** A stored routine's spec after an edit: an empty name or instruction, or a trigger not yet right, keeps what is stored. */
  public static func updateSpec(_ stored: Routine, name: String, prompt: String, trigger: JSON?) -> JSON {
    let n = name.trimmingCharacters(in: .whitespacesAndNewlines), p = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    return ["name": .string(n.isEmpty ? stored.name : n), "prompt": .string(p.isEmpty ? stored.prompt : p),
            "trigger": trigger ?? stored.trigger ?? .null, "isEnabled": .bool(stored.isEnabled)]
  }

  /** As `updateSpec`, with the Active switch's value while its change is on its way (the window sends the pending one). */
  public static func updateSpec(_ stored: Routine, name: String, prompt: String, trigger: JSON?, isEnabled: Bool) -> JSON {
    updateSpec(stored, name: name, prompt: prompt, trigger: trigger).setting("isEnabled", .bool(isEnabled))
  }

  /** Whether an update would change nothing the routine has (`Ate`): its name, instruction and trigger as stored. */
  public static func unchanged(_ stored: Routine, spec: JSON) -> Bool {
    spec["name"]?.string == stored.name && spec["prompt"]?.string == stored.prompt && spec["trigger"] == (stored.trigger ?? .null)
  }

  /** The record a create made: the newest one whose id was not there before, one of the same name first (`v$n`). */
  public static func created(_ after: [Routine], before: Set<String>, name: String) -> Routine? {
    let fresh = after.filter { !before.contains($0.id) }
    let named = fresh.filter { $0.name == name }
    var best: Routine?
    for routine in named.isEmpty ? fresh : named where best == nil || (routine.createdAt ?? 0) > (best?.createdAt ?? 0) { best = routine }
    return best
  }

  public static let saveError = "Couldn't save this routine."
  public static let empty = "Routines are recurring tasks this agent runs on a schedule."
}

/**
 The Test run's wait (`b$n`'s flights): from the click until the manual run
 it started has ended, then 3 seconds more (`automation-manual-run-rearm`),
 so Test run reads "Running…" and cannot be pressed again meanwhile.
 */
public struct RoutineRunFlight: Equatable, Sendable {
  public enum Phase: Equatable, Sendable {
    /** Waiting for a manual run other than the one there before the click. */
    case awaiting(previous: String?)
    case running(String)
    /** The 3 seconds after the run ended; then the wait is over. */
    case cooldown
  }

  /** Seconds the wait holds after the run ended (`k$n`). */
  public static let cooldownSeconds = 3.0

  public private(set) var phase: Phase

  /** Clicked: the routine's newest manual run before it, if any. */
  public init(before routine: Routine?) {
    phase = .awaiting(previous: routine?.runs.first { $0.trigger == "manual" }?.id)
  }

  /** A list came (`y`): false when the routine is not in it, and the wait ends at once. */
  public mutating func take(_ routine: Routine?) -> Bool {
    guard let routine else { return false }
    let manual = routine.runs.first { $0.trigger == "manual" }
    switch phase {
    case .awaiting(let previous):
      guard let manual, manual.id != previous else { return true }
      phase = manual.status == "running" ? .running(manual.id) : .cooldown
    case .running(let id):
      if let run = routine.runs.first(where: { $0.id == id }), run.status != "running" { phase = .cooldown }
    case .cooldown:
      break
    }
    return true
  }

  /** The run was asked for and the list read again: no new run in it yet means the wait is cooling down (`runNow`'s `h`). */
  public mutating func afterRead() {
    if case .awaiting = phase { phase = .cooldown }
  }
}

/**
 * When a routine runs, the choices of the Mac's schedule picker: every hour,
 * every day at a time, weekdays, a day of the week, a day of the month, an
 * interval, or a cron line of the person's own.
 */
public enum Schedule: Hashable, Sendable {
  case hourly(minute: Int)
  case daily(hour: Int, minute: Int)
  case weekdays(hour: Int, minute: Int)
  /** `weekday` 0 is Sunday, as cron counts. */
  case weekly(weekday: Int, hour: Int, minute: Int)
  case monthly(day: Int, hour: Int, minute: Int)
  case everyMinutes(Int)
  case everyHours(Int)
  case custom(String)

  public init(cron: String) {
    let f = cron.split(whereSeparator: \.isWhitespace).map(String.init)
    guard f.count == 5 else { self = .custom(cron); return }
    let (m, h, dom, mon, dow) = (f[0], f[1], f[2], f[3], f[4])
    let minute = Int(m), hour = Int(h)
    if mon != "*" { self = .custom(cron); return }
    if m.hasPrefix("*/"), let n = Int(m.dropFirst(2)), h == "*", dom == "*", dow == "*" { self = .everyMinutes(n); return }
    if let minute, h.hasPrefix("*/"), let n = Int(h.dropFirst(2)), dom == "*", dow == "*", minute == 0 { self = .everyHours(n); return }
    if let minute, h == "*", dom == "*", dow == "*" { self = .hourly(minute: minute); return }
    guard let minute, let hour else { self = .custom(cron); return }
    if dom == "*" && dow == "*" { self = .daily(hour: hour, minute: minute); return }
    if dom == "*" && dow == "1-5" { self = .weekdays(hour: hour, minute: minute); return }
    if dom == "*", let day = Int(dow), (0...7).contains(day) { self = .weekly(weekday: day % 7, hour: hour, minute: minute); return }
    if dow == "*", let day = Int(dom), (1...31).contains(day) { self = .monthly(day: day, hour: hour, minute: minute); return }
    self = .custom(cron)
  }

  public var cron: String {
    switch self {
    case .hourly(let m): return "\(m) * * * *"
    case .daily(let h, let m): return "\(m) \(h) * * *"
    case .weekdays(let h, let m): return "\(m) \(h) * * 1-5"
    case .weekly(let d, let h, let m): return "\(m) \(h) * * \(d)"
    case .monthly(let day, let h, let m): return "\(m) \(h) \(day) * *"
    case .everyMinutes(let n): return "*/\(max(1, n)) * * * *"
    case .everyHours(let n): return "0 */\(max(1, n)) * * *"
    case .custom(let line): return line
    }
  }

  public static let weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

  /** "Every Monday at 9:00 AM", "Every hour at :15", "Weekdays at 8:30 AM". */
  public var summary: String {
    switch self {
    case .hourly(let m): return m == 0 ? "Every hour" : String(format: "Every hour at :%02d", m)
    case .daily(let h, let m): return "Every day at \(Self.clock(h, m))"
    case .weekdays(let h, let m): return "Weekdays at \(Self.clock(h, m))"
    case .weekly(let d, let h, let m): return "Every \(Self.weekdayNames[d % 7]) at \(Self.clock(h, m))"
    case .monthly(let day, let h, let m): return "Every month on the \(Self.ordinal(day)) at \(Self.clock(h, m))"
    case .everyMinutes(let n): return n == 1 ? "Every minute" : "Every \(n) minutes"
    case .everyHours(let n): return n == 1 ? "Every hour" : "Every \(n) hours"
    case .custom(let line): return line.isEmpty ? "No schedule" : "Custom (\(line))"
    }
  }

  public static func clock(_ hour: Int, _ minute: Int) -> String {
    let h12 = hour % 12 == 0 ? 12 : hour % 12
    return String(format: "%d:%02d %@", h12, minute, hour < 12 ? "AM" : "PM")
  }

  static func ordinal(_ n: Int) -> String {
    let suffix = (11...13).contains(n % 100) ? "th" : ["th", "st", "nd", "rd", "th", "th", "th", "th", "th", "th"][n % 10]
    return "\(n)\(suffix)"
  }
}
