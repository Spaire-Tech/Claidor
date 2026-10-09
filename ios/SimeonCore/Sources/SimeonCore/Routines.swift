import Foundation

/** One of an agent's routines, as the host lists them (`AutomationProjection`, shared/workflow-model.ts). */
public struct Routine: Identifiable, Hashable, Sendable {
  public let id: String
  public var name: String
  public var prompt: String
  /** The cron line, when the routine runs on a schedule. */
  public var schedule: String
  /** The host's own words for when it runs ("Every Monday at 9:00 AM"). */
  public var summary: String
  public var isEnabled: Bool
  /** Milliseconds since the epoch. */
  public var lastRunAt: Double?
  public var nextRunAt: Double?
  public var runs: [RoutineRun]

  public init?(json: JSON) {
    guard let id = json["id"]?.text else { return nil }
    self.id = id
    name = json["name"]?.string ?? "Routine"
    prompt = json["prompt"]?.string ?? ""
    schedule = json["schedule"]?.string ?? json["trigger"]?["schedule"]?.string ?? ""
    summary = json["triggerDescription"]?.text ?? Schedule(cron: json["schedule"]?.string ?? json["trigger"]?["schedule"]?.string ?? "").summary
    isEnabled = json["isEnabled"]?.bool ?? true
    lastRunAt = json["lastRunAt"]?.double
    nextRunAt = json["nextRunAt"]?.double
    runs = (json["runs"]?.array ?? []).compactMap(RoutineRun.init)
  }

  public init(id: String, name: String, prompt: String, schedule: String, isEnabled: Bool = true) {
    self.id = id; self.name = name; self.prompt = prompt; self.schedule = schedule
    summary = Schedule(cron: schedule).summary; self.isEnabled = isEnabled; lastRunAt = nil; nextRunAt = nil; runs = []
  }

  /** What `createAgentAutomation` and `updateAgentAutomation` take (`AutomationSpec`). */
  public var spec: JSON {
    ["name": .string(name), "prompt": .string(prompt), "trigger": ["type": "cron", "schedule": .string(schedule)], "isEnabled": .bool(isEnabled)]
  }
}

/** One run of a routine, for its history. */
public struct RoutineRun: Hashable, Sendable {
  public let at: Double?
  public let status: String
  public let summary: String

  init?(_ json: JSON) {
    at = json["startedAt"]?.double ?? json["at"]?.double ?? json["timestampMs"]?.double ?? json["finishedAt"]?.double
    status = json["status"]?.string ?? json["outcome"]?.string ?? ""
    summary = json["summary"]?.string ?? json["error"]?.string ?? ""
    if at == nil && status.isEmpty { return nil }
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
