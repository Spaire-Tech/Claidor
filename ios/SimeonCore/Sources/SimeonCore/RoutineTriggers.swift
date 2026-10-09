import Foundation

/**
 * When a routine runs, as the shipped window reads, writes and words it:
 * its schedules (`pmt`, `sTe`, `fae`, `dgn`, `h2n`) and its events (Slack,
 * Git, Teams, Linear, Sentry, PagerDuty: `Hgn`, `Vgn`, `Ggn`, `tQ`, the
 * rows' words). Each function is a port of the window's own, checked
 * against it in Node (`RoutineTriggerTests`).
 */
public enum RoutineSchedule {
  // MARK: Reading a schedule (`h5e`, `tAe`, `pmt`)

  /** Spaces run together and trimmed (`h5e`). */
  public static func normalized(_ text: String) -> String {
    text.trimmingCharacters(in: .whitespacesAndNewlines).split(whereSeparator: \.isWhitespace).joined(separator: " ")
  }

  static let aliases = ["@hourly": "0 * * * *", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@weekly": "0 0 * * 0", "@monthly": "0 0 1 * *", "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *"]
  static let intervalUnits: [String: (seconds: Double, word: String)] = ["s": (1, "second"), "m": (60, "minute"), "h": (3600, "hour"), "d": (86400, "day")]

  /** "@every 30m": its amount and unit letter (`eAe`). */
  static func every(_ text: String) -> (amount: Int, unit: String)? {
    guard let regex = try? NSRegularExpression(pattern: #"^@every\s+(\d+)\s*(s|m|h|d)$"#, options: .caseInsensitive),
          let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
          let amount = Range(match.range(at: 1), in: text), let unit = Range(match.range(at: 2), in: text),
          let n = Int(text[amount]), n > 0 else { return nil }
    return (n, text[unit].lowercased())
  }

  /** A cron line read into its sets (`tgn`). */
  public struct Cron: Equatable, Sendable {
    public var minute: Set<Int>, hour: Set<Int>, dayOfMonth: Set<Int>, month: Set<Int>, dayOfWeek: Set<Int>
    public var isDayOfMonthRestricted: Bool, isDayOfWeekRestricted: Bool
    public var timeZone: String?
  }

  static func field(_ text: String, _ low: Int, _ high: Int) -> Set<Int>? {
    var out = Set<Int>()
    for part in text.split(separator: ",", omittingEmptySubsequences: false).map(String.init) {
      let pieces = part.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
      if pieces.count > 2 { return nil }
      let base = pieces[0]
      let step: Int
      if pieces.count == 2 { guard let value = jsInteger(pieces[1]), value > 0 else { return nil }; step = value } else { step = 1 }
      var from: Int, to: Int
      if base == "*" || base.isEmpty { from = low; to = high }
      else if base.contains("-") {
        let ends = base.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
        guard let a = jsInteger(ends[0]), let b = jsInteger(ends.count > 1 ? ends[1] : "") else { return nil }
        from = a; to = b
      } else {
        guard let a = jsInteger(base) else { return nil }
        from = a; to = pieces.count == 2 ? high : a
      }
      if from < low || to > high || from > to { return nil }
      var value = from
      while value <= to { out.insert(value); value += step }
    }
    return out.isEmpty ? nil : out
  }

  /** `Number(text)` that must be a whole number (JavaScript reads "" as 0). */
  static func jsInteger(_ text: String) -> Int? {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return 0 }
    guard let value = Double(trimmed), value.rounded() == value, abs(value) < 1e15 else { return nil }
    return Int(value)
  }

  /** A cron line, an alias, with or without "CRON_TZ=zone " (`tAe`); nil when it is not one. */
  public static func cron(_ text: String) -> Cron? {
    var line = normalized(text)
    var zone: String?
    if let regex = try? NSRegularExpression(pattern: #"^(?:CRON_TZ|TZ)=(\S+)\s+"#),
       let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
       let whole = Range(match.range, in: line), let name = Range(match.range(at: 1), in: line) {
      zone = String(line[name])
      line = String(line[whole.upperBound...])
    }
    line = aliases[line.lowercased()] ?? line
    let parts = line.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
    guard parts.count == 5, let m = field(parts[0], 0, 59), let h = field(parts[1], 0, 23), let dom = field(parts[2], 1, 31),
          let mon = field(parts[3], 1, 12), let dow = field(parts[4], 0, 7) else { return nil }
    if let zone, TimeZone(identifier: zone) == nil { return nil }
    return Cron(minute: m, hour: h, dayOfMonth: dom, month: mon, dayOfWeek: Set(dow.map { $0 == 7 ? 0 : $0 }),
                isDayOfMonthRestricted: parts[2] != "*", isDayOfWeekRestricted: parts[4] != "*", timeZone: zone)
  }

  /** A schedule the host can run (`pmt`): "@every 30m", a cron line or an alias, with a valid zone if it names one. */
  public static func isValid(_ text: String) -> Bool {
    let line = normalized(text)
    return every(line) != nil || cron(line) != nil
  }

  // MARK: Words (`dgn`)

  public static let weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  static let shortWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  public static let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

  /** "9:05 AM" (`Mu`). */
  public static func clock(_ hour: Int, _ minute: Int) -> String {
    "\(hour % 12 == 0 ? 12 : hour % 12):\(String(format: "%02d", minute)) \(hour < 12 ? "AM" : "PM")"
  }

  /** "1st", "22nd" (`Sme`). */
  public static func ordinal(_ n: Int) -> String {
    var suffix = "th"
    if n % 100 < 11 || n % 100 > 13 {
      if n % 10 == 1 { suffix = "st" } else if n % 10 == 2 { suffix = "nd" } else if n % 10 == 3 { suffix = "rd" }
    }
    return "\(n)\(suffix)"
  }

  /** "a and b", "a, b, and c" (`Fge`). */
  static func andList(_ items: [String]) -> String {
    if items.count <= 1 { return items.first ?? "" }
    if items.count == 2 { return "\(items[0]) and \(items[1])" }
    return items.dropLast().joined(separator: ", ") + ", and " + items[items.count - 1]
  }

  /** "a or b", "a, b, or c" (`L1`). */
  static func orList(_ items: [String]) -> String {
    if items.count <= 1 { return items.first ?? "" }
    if items.count == 2 { return "\(items[0]) or \(items[1])" }
    return items.dropLast().joined(separator: ", ") + ", or " + items[items.count - 1]
  }

  /** The step of an evenly spaced list, from its first two (`$ge`). */
  static func step(_ sorted: [Int]) -> Int? {
    guard sorted.count >= 2 else { return nil }
    let delta = sorted[1] - sorted[0]
    guard delta > 0 else { return nil }
    var last = sorted[1]
    for value in sorted.dropFirst(2) {
      if value - last != delta { return nil }
      last = value
    }
    return delta
  }

  static func days(_ cron: Cron) -> (lead: String, on: String?)? {
    let allMonths = cron.month.count == 12
    let domLimited = cron.isDayOfMonthRestricted && cron.dayOfMonth.count < 31
    let dowLimited = cron.isDayOfWeekRestricted && cron.dayOfWeek.count < 7
    if domLimited && dowLimited { return nil }
    if dowLimited {
      guard allMonths else { return nil }
      if cron.dayOfWeek == [1, 2, 3, 4, 5] { return ("Weekdays", " on weekdays") }
      if cron.dayOfWeek == [0, 6] { return ("Weekends", " on weekends") }
      let sorted = cron.dayOfWeek.sorted()
      guard let first = sorted.first, let last = sorted.last else { return nil }
      if sorted.count > 3 {
        guard step(sorted) == 1 else { return nil }
        let span = "\(shortWeekdays[first])\u{2013}\(shortWeekdays[last])"
        return (span, ", \(span)")
      }
      let names = andList(sorted.map { weekdays[$0] })
      return ("Every \(names)", " on \(names)")
    }
    if domLimited {
      let sorted = cron.dayOfMonth.sorted()
      if allMonths {
        guard sorted.count <= 3 else { return nil }
        let names = andList(sorted.map(ordinal))
        return ("On the \(names) of every month", " on the \(names) of every month")
      }
      if cron.month.count == 1, sorted.count == 1, let month = cron.month.first, let day = sorted.first {
        let date = "\(months[month - 1]) \(day)"
        return ("Every \(date)", " on \(date)")
      }
      return nil
    }
    return allMonths ? ("Every day", nil) : nil
  }

  static func minuteMark(_ minute: Int) -> String { ":" + String(format: "%02d", minute) }

  enum Times { case interval(base: String, window: String?), times([String]) }

  static func times(_ cron: Cron) -> Times? {
    let minutes = cron.minute.sorted(), hours = cron.hour.sorted()
    guard let firstMinute = minutes.first, let lastMinute = minutes.last, let firstHour = hours.first, let lastHour = hours.last else { return nil }
    let everyHour = hours.count == 24
    if minutes.count == 1 {
      let suffix = firstMinute == 0 ? "" : " at \(minuteMark(firstMinute))"
      if everyHour { return .interval(base: "Every hour\(suffix)", window: nil) }
      if hours.count == 1 { return .times([clock(firstHour, firstMinute)]) }
      if let gap = step(hours) {
        let base = gap == 1 ? "Every hour" : "Every \(gap) hours"
        if firstHour == 0 && lastHour + gap > 23 { return .interval(base: "\(base)\(suffix)", window: nil) }
        if gap == 1 || hours.count > 3 { return .interval(base: base, window: "\(clock(firstHour, firstMinute)) \u{2013} \(clock(lastHour, firstMinute))") }
      }
      return hours.count <= 3 ? .times(hours.map { clock($0, firstMinute) }) : nil
    }
    let base: String
    if minutes.first == 0, let gap = step(minutes), lastMinute + gap > 59 {
      base = gap == 1 ? "Every minute" : "Every \(gap) minutes"
    } else {
      if minutes.count > 3 { return nil }
      if !everyHour && hours.count == 1 { return .times(minutes.map { clock(firstHour, $0) }) }
      base = "Every hour at \(andList(minutes.map(minuteMark)))"
    }
    if everyHour { return .interval(base: base, window: nil) }
    if hours.count == 1 || step(hours) == 1 { return .interval(base: base, window: "\(clock(firstHour, firstMinute)) \u{2013} \(clock(lastHour, lastMinute))") }
    return nil
  }

  /** A schedule in words (`dgn`): "Every day at 8:00 AM", "Every 15 minutes on weekdays, 9:00 AM – 5:45 PM"; the line as it is when it can't be said. */
  public static func describe(_ text: String) -> String {
    let line = normalized(text)
    if let interval = every(line) {
      let word = intervalUnits[interval.unit]?.word ?? ""
      return interval.amount == 1 ? "Every \(word)" : "Every \(interval.amount) \(word)s"
    }
    guard let cron = cron(line), let days = days(cron), let times = times(cron) else { return line }
    let words: String
    switch times {
    case .times(let list): words = "\(days.lead) at \(andList(list))"
    case .interval(let base, let window): words = base + (days.on ?? "") + (window.map { ", \($0)" } ?? "")
    }
    return cron.timeZone.map { "\(words) (\($0))" } ?? words
  }

  // MARK: The picker's shapes (`sTe`, `Sgn`, `fae`)

  public struct Time: Hashable, Sendable {
    public var hour: Int, minute: Int
    public init(hour: Int, minute: Int) { self.hour = hour; self.minute = minute }
  }

  public enum Days: Hashable, Sendable {
    case everyDay
    case daysOfWeek([Int])
    case daysOfMonth([Int])
  }

  public enum TimeOfDay: Hashable, Sendable {
    case atTimes(minute: Int, hours: [Int])
    /** "minutes" or "hours", between two hours. */
    case interval(unit: String, amount: Int, fromHour: Int, toHour: Int)
  }

  /** What the Frequency picker shows for a schedule. */
  public enum Shape: Hashable, Sendable {
    case hourly(minute: Int)
    case daily(Time)
    case weekdays(Time)
    case weekly(dayOfWeek: Int, Time)
    case monthly(dayOfMonth: Int, Time)
    /** `unit` "minutes", "hours" or "days". */
    case interval(amount: Int, unit: String)
    case advanced(months: [Int]?, days: Days, time: TimeOfDay)

    /** The Frequency picker's value ("hourly", "daily"…). */
    public var mode: String {
      switch self {
      case .hourly: return "hourly"
      case .daily: return "daily"
      case .weekdays: return "weekdays"
      case .weekly: return "weekly"
      case .monthly: return "monthly"
      case .interval: return "interval"
      case .advanced: return "advanced"
      }
    }
  }

  /** The Frequency picker's choices, in its order (`Ign`). */
  public static let frequencies: [(value: String, label: String)] = [
    ("hourly", "Every hour"), ("daily", "Every day"), ("weekdays", "Weekdays"), ("weekly", "Every week"),
    ("monthly", "Every month"), ("interval", "Interval"), ("advanced", "Advanced"), ("custom", "Custom"),
  ]

  /** The shape the picker shows for a schedule (`sTe`); nil for one it can only show as Custom. */
  public static func shape(_ text: String) -> Shape? {
    let line = normalized(text)
    if let regex = try? NSRegularExpression(pattern: #"^@every\s+(\d+)\s*(s|m|h|d)$"#, options: .caseInsensitive),
       let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
       let amount = Range(match.range(at: 1), in: line), let unit = Range(match.range(at: 2), in: line) {
      let n = Int(line[amount]) ?? 0
      let units = ["m": "minutes", "h": "hours", "d": "days"]
      guard n > 0, let name = units[line[unit].lowercased()] else { return nil }
      return .interval(amount: n, unit: name)
    }
    guard let cron = cron(line), cron.timeZone == nil else { return nil }
    return structured(cron)
  }

  static func evenStep(_ sorted: [Int]) -> Int? {
    guard sorted.count >= 2 else { return nil }
    let delta = sorted[1] - sorted[0]
    guard delta > 0 else { return nil }
    for index in 2..<max(2, sorted.count) where sorted[index] - sorted[index - 1] != delta { return nil }
    return delta
  }

  static func timeOfDay(_ minutes: [Int], _ hours: [Int]) -> TimeOfDay? {
    guard let firstMinute = minutes.first, let firstHour = hours.first, let lastHour = hours.last else { return nil }
    if minutes.count == 1 {
      if firstMinute == 0, let gap = evenStep(hours), gap >= 2, hours.count > 2 {
        return firstHour == 0 && lastHour + gap > 23 ? .interval(unit: "hours", amount: gap, fromHour: 0, toHour: 23) : .interval(unit: "hours", amount: gap, fromHour: firstHour, toHour: lastHour)
      }
      return .atTimes(minute: firstMinute, hours: hours)
    }
    let lastMinute = minutes[minutes.count - 1]
    guard firstMinute == 0, let gap = minutes.count == 60 ? 1 : evenStep(minutes), lastMinute + gap > 59 else { return nil }
    if hours.count == 24 { return .interval(unit: "minutes", amount: gap, fromHour: 0, toHour: 23) }
    if hours.count > 1 && evenStep(hours) != 1 { return nil }
    return .interval(unit: "minutes", amount: gap, fromHour: firstHour, toHour: lastHour)
  }

  static func structured(_ cron: Cron) -> Shape? {
    let minutes = cron.minute.sorted(), hours = cron.hour.sorted()
    let allMonths = cron.month.count == 12
    let domLimited = cron.isDayOfMonthRestricted && cron.dayOfMonth.count < 31
    let dowLimited = cron.isDayOfWeekRestricted && cron.dayOfWeek.count < 7
    if domLimited && dowLimited { return nil }
    let limited = !allMonths || domLimited || dowLimited
    let time: TimeOfDay
    if minutes.count == 1 && hours.count == 24, let minute = minutes.first {
      if !limited { return .hourly(minute: minute) }
      if minute != 0 { return nil }
      time = .interval(unit: "hours", amount: 1, fromHour: 0, toHour: 23)
    } else {
      guard let found = timeOfDay(minutes, hours) else { return nil }
      time = found
    }
    let days: Days = dowLimited ? .daysOfWeek(cron.dayOfWeek.sorted()) : domLimited ? .daysOfMonth(cron.dayOfMonth.sorted()) : .everyDay
    if allMonths, case .atTimes(let minute, let hrs) = time, hrs.count == 1 {
      let at = Time(hour: hrs[0], minute: minute)
      switch days {
      case .everyDay: return .daily(at)
      case .daysOfWeek(let list):
        if list == [1, 2, 3, 4, 5] { return .weekdays(at) }
        if list.count == 1 { return .weekly(dayOfWeek: list[0], at) }
      case .daysOfMonth(let list):
        if list.count == 1 { return .monthly(dayOfMonth: list[0], at) }
      }
    }
    return .advanced(months: allMonths ? nil : cron.month.sorted(), days: days, time: time)
  }

  static func joined(_ values: [Int]) -> String { Array(Set(values)).sorted().map(String.init).joined(separator: ",") }

  /** The schedule a shape is written as (`fae`). */
  public static func line(_ shape: Shape) -> String {
    switch shape {
    case .hourly(let minute): return "\(minute) * * * *"
    case .daily(let t): return "\(t.minute) \(t.hour) * * *"
    case .weekdays(let t): return "\(t.minute) \(t.hour) * * 1-5"
    case .weekly(let day, let t): return "\(t.minute) \(t.hour) * * \(day)"
    case .monthly(let day, let t): return "\(t.minute) \(t.hour) \(day) * *"
    case .interval(let amount, let unit): return "@every \(amount)\(["minutes": "m", "hours": "h", "days": "d"][unit] ?? "m")"
    case .advanced(let months, let days, let time):
      let minute: String, hour: String
      switch time {
      case .atTimes(let m, let hours):
        minute = String(m)
        hour = Set(hours).count >= 24 ? "*" : joined(hours)
      case .interval(let unit, let amount, let from, let to):
        let whole = from <= 0 && to >= 23
        let window = whole ? "*" : "\(from)-\(to)"
        if unit == "minutes" { minute = amount == 1 ? "*" : "*/\(amount)"; hour = window }
        else if amount == 1 { minute = "0"; hour = window }
        else { minute = "0"; hour = whole ? "*/\(amount)" : "\(window)/\(amount)" }
      }
      let dom: String, dow: String
      switch days {
      case .everyDay: dom = "*"; dow = "*"
      case .daysOfWeek(let list): dom = "*"; dow = Set(list).count >= 7 ? "*" : joined(list)
      case .daysOfMonth(let list): dom = Set(list).count >= 31 ? "*" : joined(list); dow = "*"
      }
      let month = months.map { Set($0).count >= 12 ? "*" : joined($0) } ?? "*"
      return "\(minute) \(hour) \(dom) \(month) \(dow)"
    }
  }

  /** The time a shape starts a new one at (`ymt`): its own, else 8:00 AM. */
  static func startTime(_ shape: Shape?) -> Time {
    let eight = Time(hour: 8, minute: 0)
    switch shape {
    case .daily(let t), .weekdays(let t), .weekly(_, let t), .monthly(_, let t): return t
    case .hourly(let minute): return Time(hour: 8, minute: minute)
    case .advanced(_, _, .atTimes(let minute, let hours)): return hours.first.map { Time(hour: $0, minute: minute) } ?? eight
    default: return eight
    }
  }

  /** Advanced, from the shape before it (`rTe`). */
  public static func advanced(from shape: Shape?) -> Shape {
    let t = startTime(shape)
    let at = TimeOfDay.atTimes(minute: t.minute, hours: [t.hour])
    guard let shape else { return .advanced(months: nil, days: .everyDay, time: at) }
    switch shape {
    case .advanced: return shape
    case .weekdays: return .advanced(months: nil, days: .daysOfWeek([1, 2, 3, 4, 5]), time: at)
    case .weekly(let day, _): return .advanced(months: nil, days: .daysOfWeek([day]), time: at)
    case .monthly(let day, _): return .advanced(months: nil, days: .daysOfMonth([day]), time: at)
    case .hourly(let minute): return minute == 0 ? .advanced(months: nil, days: .everyDay, time: .interval(unit: "hours", amount: 1, fromHour: 0, toHour: 23)) : .advanced(months: nil, days: .everyDay, time: at)
    case .interval(let amount, let unit): return unit != "days" ? .advanced(months: nil, days: .everyDay, time: .interval(unit: unit, amount: amount, fromHour: 0, toHour: 23)) : .advanced(months: nil, days: .everyDay, time: at)
    case .daily: return .advanced(months: nil, days: .everyDay, time: at)
    }
  }

  /** The shape a Frequency choice starts with, from the one before it (`mne`). */
  public static func start(_ mode: String, from shape: Shape?) -> Shape {
    let t = startTime(shape)
    switch mode {
    case "hourly": if case .hourly(let m) = shape { return .hourly(minute: m) }; return .hourly(minute: 0)
    case "daily": return .daily(t)
    case "weekdays": return .weekdays(t)
    case "weekly": if case .weekly(let d, _) = shape { return .weekly(dayOfWeek: d, t) }; return .weekly(dayOfWeek: 1, t)
    case "monthly": if case .monthly(let d, _) = shape { return .monthly(dayOfMonth: d, t) }; return .monthly(dayOfMonth: 1, t)
    case "interval": if case .interval = shape, let shape { return shape }; return .interval(amount: 30, unit: "minutes")
    default: return advanced(from: shape)
    }
  }

  /** A schedule's row in the editor (`h2n`): "Every" "day at 8:00 AM", "On" "weekdays at 8:00 AM", "Cron" "…". */
  public static func row(_ text: String) -> (lead: String, rest: String) {
    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return ("Cron", "\u{2026}") }
    switch shape(text) {
    case .hourly(let m): return ("Every", m == 0 ? "hour" : "hour at \(minuteMark(m))")
    case .daily(let t): return ("Every", "day at \(clock(t.hour, t.minute))")
    case .weekdays(let t): return ("On", "weekdays at \(clock(t.hour, t.minute))")
    case .weekly(let d, let t): return ("Every", "\(weekdays[d]) at \(clock(t.hour, t.minute))")
    case .monthly(let d, let t): return ("Monthly", "on the \(ordinal(d)) at \(clock(t.hour, t.minute))")
    default:
      let words = describe(text)
      guard let space = words.firstIndex(of: " "), words != text.trimmingCharacters(in: .whitespacesAndNewlines) else { return ("Cron", words) }
      return (String(words[..<space]), String(words[words.index(after: space)...]))
    }
  }

  /** The add menu's 96 times, 15 minutes apart ("12:00 AM" … "11:45 PM"), each its hour and minute (`A2n`). */
  public static let quarterHours: [Time] = stride(from: 0, to: 1440, by: 15).map { Time(hour: $0 / 60, minute: $0 % 60) }

  /** The minute choices ":00" … ":55", and the current one (`Bgn`). */
  public static func minuteChoices(_ current: Int) -> [Int] { Array(Set(stride(from: 0, to: 60, by: 5)).union([current])).sorted() }

  /** The time choices 15 minutes apart, and the current one (`Lgn`), as minutes of the day. */
  public static func timeChoices(_ current: Int) -> [Int] { Array(Set(stride(from: 0, to: 1440, by: 15)).union([current])).sorted() }

  /** The interval amounts for each unit, and the current one (`Hge`). */
  public static func intervalChoices(_ unit: String, current: Int) -> [Int] {
    let base = ["minutes": [1, 2, 5, 10, 15, 20, 30, 45], "hours": [1, 2, 3, 4, 6, 8, 12], "days": [1, 2, 3, 7, 14, 30]][unit] ?? []
    return Array(Set(base).union([current])).sorted()
  }

  /** The amount a unit falls back to when the amount doesn't fit it (`vmt`). */
  public static let intervalFallback = ["minutes": 30, "hours": 1, "days": 1]

  // MARK: When a run was (`pgn`)

  /**
   * A run's time as the window's history words it, in `zone`: "Just now",
   * "4 min ago", "Today at 9:05 AM", "Yesterday at…", "Last Monday at…",
   * "Oct 3 at…", "Oct 3, 2025 at…" (the first letter capitalised, `M2n`).
   */
  public static func when(_ ms: Double, now: Double, zone: TimeZone) -> String {
    let words = relative(ms, now: now, zone: zone)
    return words.prefix(1).uppercased() + words.dropFirst()
  }

  static func relative(_ ms: Double, now: Double, zone: TimeZone) -> String {
    let minute = 60_000.0, hour = 3_600_000.0
    let delta = ms - now
    if delta > 0 && delta < hour { return "in \(Int((delta / minute).rounded(.up))) min" }
    if delta <= 0 && -delta < minute { return "just now" }
    if delta <= 0 && -delta < hour { return "\(Int((-delta / minute).rounded(.down))) min ago" }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    let date = Date(timeIntervalSince1970: ms / 1000), today = Date(timeIntervalSince1970: now / 1000)
    let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .weekday], from: date)
    let nowParts = calendar.dateComponents([.year, .month, .day], from: today)
    let at = clock(parts.hour ?? 0, parts.minute ?? 0)
    func dayNumber(_ p: DateComponents) -> Int {
      var utc = Calendar(identifier: .gregorian)
      utc.timeZone = TimeZone(identifier: "UTC")!
      let d = utc.date(from: DateComponents(year: p.year, month: p.month, day: p.day)) ?? Date()
      return Int((d.timeIntervalSince1970 / 86_400).rounded())
    }
    let days = dayNumber(parts) - dayNumber(nowParts)
    let weekday = weekdays[(parts.weekday ?? 1) - 1]
    if days == 0 { return "today at \(at)" }
    if days == 1 { return "tomorrow at \(at)" }
    if days == -1 { return "yesterday at \(at)" }
    if days > 1 && days < 7 { return "\(weekday) at \(at)" }
    if days < -1 && days > -7 { return "last \(weekday) at \(at)" }
    let shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    let date2 = "\(shortMonths[(parts.month ?? 1) - 1]) \(parts.day ?? 1)"
    return parts.year == nowParts.year ? "\(date2) at \(at)" : "\(date2), \(parts.year ?? 0) at \(at)"
  }
}

/**
 * One of a routine's triggers as the editor holds it while it is changed
 * (the window's rows): a schedule, or an event on Slack, Git, Teams,
 * Linear, Sentry or PagerDuty. Text fields stay as typed; `member`
 * reads them into what is saved, nil while one is not right.
 */
public enum TriggerRow: Hashable, Sendable {
  case schedule(String)
  /** `match` "message", "keyword", "mention" or "reaction". */
  case slack(channel: String, match: String, keyword: String, emoji: String, bySelf: Bool)
  case github(repo: String, events: [String], userAllowlist: String, ciBranch: String)
  case teams(tenantId: String, teamIds: String, channelIds: String, messageContains: String, isRegex: Bool, linkedOnly: Bool)
  /** `event` "issueCreated", "statusChanged" or "endOfCycle". */
  case linear(event: String, statusIds: String, cycleIds: String, projectIds: String, teamIds: String)
  case sentry(event: String, projectIds: String)
  case pagerduty(event: String, serviceIds: String)

  /** The most a routine has (`NUe`). */
  public static let limit = 8

  /** The add menu's sources after "On a schedule", in its order, with their words. */
  public static let sources: [(platform: String, label: String)] = [
    ("slack", "Slack message"), ("github", "Git event"), ("microsoftTeams", "Teams message"),
    ("linear", "Linear issue"), ("sentry", "Sentry alert"), ("pagerduty", "PagerDuty incident"),
  ]

  /** A new row for a source, as the window starts one (`Hgn`). */
  public static func new(_ platform: String) -> TriggerRow {
    switch platform {
    case "slack": return .slack(channel: "", match: "message", keyword: "", emoji: "", bySelf: false)
    case "github": return .github(repo: "", events: ["pr-opened"], userAllowlist: "", ciBranch: "")
    case "microsoftTeams": return .teams(tenantId: "", teamIds: "", channelIds: "", messageContains: "", isRegex: false, linkedOnly: false)
    case "linear": return .linear(event: "issueCreated", statusIds: "", cycleIds: "", projectIds: "", teamIds: "")
    case "sentry": return .sentry(event: "issueCreated", projectIds: "")
    default: return .pagerduty(event: "incidentTriggered", serviceIds: "")
    }
  }

  // MARK: Saved and read (`Vgn`, `Ggn`, `tQ`, `K0n`)

  /** The rows of a saved trigger (one member, or a group's). */
  public static func rows(_ trigger: JSON?) -> [TriggerRow] {
    guard let trigger else { return [] }
    let members = trigger["type"]?.string == "group" ? (trigger["listeners"]?.array ?? []) : [trigger]
    return members.compactMap(row)
  }

  static func row(_ member: JSON) -> TriggerRow? {
    func list(_ key: String) -> String { (member[key]?.array ?? []).compactMap(\.string).joined(separator: ", ") }
    switch member["type"]?.string {
    case "cron": return .schedule(member["schedule"]?.string ?? "")
    case "slack":
      let match = member["match"]
      let kind = match?["kind"]?.string ?? "message"
      return .slack(channel: member["channel"]?.string ?? "", match: kind, keyword: kind == "keyword" ? match?["keyword"]?.string ?? "" : "",
                    emoji: kind == "reaction" ? (match?["emoji"]?.array ?? []).compactMap(\.string).joined(separator: ", ") : "",
                    bySelf: kind == "reaction" && match?["bySelf"]?.bool == true)
    case "github":
      return .github(repo: member["repo"]?.string ?? "", events: (member["events"]?.array ?? []).compactMap(\.string), userAllowlist: list("userAllowlist"), ciBranch: member["ciBranch"]?.string ?? "")
    case "microsoftTeams":
      let teams = (member["teamIds"]?.array ?? []).compactMap(\.string)
      let ids = (teams.isEmpty ? [member["teamId"]?.string ?? ""] : teams).filter { !$0.isEmpty }
      return .teams(tenantId: member["tenantId"]?.string ?? "", teamIds: ids.joined(separator: ", "), channelIds: list("channelIds"), messageContains: member["messageContains"]?.string ?? "",
                    isRegex: member["messageContainsIsRegex"]?.bool ?? false, linkedOnly: member["blockUnauthenticatedTeamsUsers"]?.bool ?? false)
    case "linear":
      let event = member["event"]
      let kind = event?["case"]?.string ?? "issueCreated"
      func ids(_ key: String) -> String { (event?[key]?.array ?? []).compactMap(\.string).joined(separator: ", ") }
      return .linear(event: kind, statusIds: kind == "statusChanged" ? ids("statusIds") : "", cycleIds: kind == "endOfCycle" ? ids("cycleIds") : "", projectIds: list("projectIds"), teamIds: list("teamIds"))
    case "sentry": return .sentry(event: member["event"]?["case"]?.string ?? "issueCreated", projectIds: list("projectIds"))
    case "pagerduty": return .pagerduty(event: member["event"]?["case"]?.string ?? "incidentTriggered", serviceIds: list("serviceIds"))
    default: return nil
    }
  }

  /** Ids split on spaces and commas, each once (`Pl`). */
  static func ids(_ text: String) -> [String] {
    var out: [String] = []
    for piece in text.split(whereSeparator: { $0.isWhitespace || $0 == "," }).map(String.init) where !out.contains(piece) { out.append(piece) }
    return out
  }

  /** Reaction emoji as Slack names them, eight at most (`Smt`). */
  public static func emojiNames(_ text: String) -> [String] {
    var out: [String] = []
    for piece in text.split(whereSeparator: { $0.isWhitespace || $0 == "," }).map(String.init) {
      var name = piece.trimmingCharacters(in: .whitespaces)
      while name.hasPrefix(":") { name.removeFirst() }
      while name.hasSuffix(":") { name.removeLast() }
      name = (name.components(separatedBy: "::").first ?? name).trimmingCharacters(in: .whitespaces).lowercased()
      guard !name.isEmpty, name.range(of: #"^[a-z0-9_+-]+$"#, options: .regularExpression) != nil, !out.contains(name) else { continue }
      out.append(name)
      if out.count >= 8 { break }
    }
    return out
  }

  static func isCI(_ event: String) -> Bool { event == "ci-passed" || event == "ci-failed" }

  /** A branch name Git allows (`V0n`). */
  static func isBranch(_ text: String) -> Bool {
    !text.isEmpty && text.range(of: #"[\s~^:?*\[\\]|^[-/]|/$|\.\.|@\{"#, options: .regularExpression) == nil
  }

  /** What this row saves as, nil while it is not right (`Wgn`). */
  public var member: JSON? {
    switch self {
    case .schedule(let text):
      let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
      return line.isEmpty || !RoutineSchedule.isValid(line) ? nil : ["type": "cron", "schedule": .string(line)]
    case .slack(let channel, let match, let keyword, let emoji, let bySelf):
      let place = channel.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !place.isEmpty else { return nil }
      if match == "keyword" {
        let word = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        return word.isEmpty ? nil : ["type": "slack", "channel": .string(place), "match": ["kind": "keyword", "keyword": .string(word)]]
      }
      if match == "reaction" {
        var kind: JSON = ["kind": "reaction"]
        let names = Self.emojiNames(emoji)
        if !names.isEmpty { kind = kind.setting("emoji", JSON(names)) }
        if bySelf { kind = kind.setting("bySelf", true) }
        return ["type": "slack", "channel": .string(place), "match": kind]
      }
      return ["type": "slack", "channel": .string(place), "match": ["kind": .string(match)]]
    case .teams(let tenant, let teams, let channels, let contains, let isRegex, let linkedOnly):
      let t = tenant.trimmingCharacters(in: .whitespacesAndNewlines), teamIds = Self.ids(teams)
      guard !t.isEmpty, !teamIds.isEmpty else { return nil }
      return ["type": "microsoftTeams", "tenantId": .string(t), "teamId": "", "teamIds": JSON(teamIds), "channelIds": JSON(Self.ids(channels)),
              "messageContains": .string(contains.trimmingCharacters(in: .whitespacesAndNewlines)), "messageContainsIsRegex": .bool(isRegex), "blockUnauthenticatedTeamsUsers": .bool(linkedOnly)]
    case .linear(let event, let statuses, let cycles, let projects, let teams):
      var kind: JSON = ["case": .string(event)]
      if event == "statusChanged" { kind = kind.setting("statusIds", JSON(Self.ids(statuses))) }
      if event == "endOfCycle" { kind = kind.setting("cycleIds", JSON(Self.ids(cycles))) }
      return ["type": "linear", "event": kind, "projectIds": JSON(Self.ids(projects)), "teamIds": JSON(Self.ids(teams))]
    case .sentry(let event, let projects):
      return ["type": "sentry", "event": ["case": .string(event)], "projectIds": JSON(Self.ids(projects))]
    case .pagerduty(let event, let services):
      return ["type": "pagerduty", "event": ["case": .string(event)], "serviceIds": JSON(Self.ids(services))]
    case .github(let repo, let events, let allowlist, let branch):
      let r = repo.trimmingCharacters(in: .whitespacesAndNewlines)
      guard r.range(of: #"^[^\s/]+/[^\s/]+$"#, options: .regularExpression) != nil, !events.isEmpty else { return nil }
      let ci = events.contains(where: Self.isCI)
      let b = branch.trimmingCharacters(in: .whitespacesAndNewlines)
      if ci && !Self.isBranch(b) { return nil }
      var people: [String] = []
      for piece in allowlist.split(whereSeparator: { $0.isWhitespace || $0 == "," }).map(String.init) {
        var login = piece.trimmingCharacters(in: .whitespaces)
        while login.hasPrefix("@") { login.removeFirst() }
        if !login.isEmpty && !people.contains(where: { $0.lowercased() == login.lowercased() }) { people.append(login) }
      }
      var out: JSON = ["type": "github", "repo": .string(r), "events": JSON(events)]
      if !people.isEmpty { out = out.setting("userAllowlist", JSON(people)) }
      if ci { out = out.setting("ciBranch", .string(b)) }
      return out
    }
  }

  /** The routine's trigger from its rows: one, or a group of them; nil while any is not right, or there are none (`tQ`). */
  public static func trigger(_ rows: [TriggerRow]) -> JSON? {
    guard !rows.isEmpty else { return nil }
    var members: [JSON] = []
    for row in rows {
      guard let member = row.member else { return nil }
      members.append(member)
    }
    return members.count == 1 ? members[0] : ["type": "group", "listeners": .array(members)]
  }

  // MARK: Words (`g2n`…`S2n`)

  static let gitWords = ["pr-opened": "a PR opens", "pr-pushed": "a PR is updated", "pr-merged": "a PR merges", "review-requested": "a review is requested",
                         "review-approved": "a review approves a PR", "review-changes-requested": "a review requests changes", "review-commented": "a review comments on a PR",
                         "pr-comment": "a PR comment lands", "inline-review-comment": "an inline review comment lands", "review-thread-resolved": "a review thread is resolved",
                         "review-thread-unresolved": "a review thread is reopened", "issue-assigned": "an issue is assigned", "ci-passed": "CI passes", "ci-failed": "CI fails"]

  /** The Git events in the window's order, under their headings (`xmt`). */
  public static let gitSections: [(title: String, events: [(kind: String, label: String)])] = [
    ("Pull request", [("pr-opened", "Opened"), ("pr-pushed", "Updated"), ("pr-merged", "Merged")]),
    ("Review", [("review-requested", "Requested"), ("review-approved", "Approved"), ("review-changes-requested", "Changes requested"), ("review-commented", "Commented"), ("review-thread-resolved", "Thread resolved"), ("review-thread-unresolved", "Thread reopened")]),
    ("Comment", [("pr-comment", "PR comment"), ("inline-review-comment", "Inline review comment")]),
    ("Checks", [("ci-passed", "CI passed"), ("ci-failed", "CI failed")]),
    ("Issue", [("issue-assigned", "Assigned")]),
  ]

  /** Every Git event in the order the window keeps them (`D0n`). */
  public static let gitOrder = ["pr-opened", "pr-pushed", "pr-merged", "review-requested", "review-approved", "review-changes-requested", "review-commented", "pr-comment", "inline-review-comment", "review-thread-resolved", "review-thread-unresolved", "issue-assigned", "ci-passed", "ci-failed"]

  /** The row's sentence in the editor, its first word apart. */
  public var words: (lead: String, rest: String) {
    let more = "\u{2026}"
    func place(_ channel: String) -> String {
      let c = channel.trimmingCharacters(in: .whitespacesAndNewlines)
      return c.isEmpty ? "in \(more)" : c == "*" ? "anywhere on Slack" : "in \(c)"
    }
    switch self {
    case .schedule(let text): return RoutineSchedule.row(text)
    case .slack(let channel, let match, let keyword, let emoji, let bySelf):
      switch match {
      case "keyword":
        let word = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        return ("New", "messages containing \(word.isEmpty ? more : "\"\(word)\"") \(place(channel))")
      case "mention": return ("When", "@mentioned \(place(channel))")
      case "reaction":
        let names = Self.emojiNames(emoji).map { ":\($0):" }
        return ("Reaction", "\(names.isEmpty ? "added" : "\(RoutineSchedule.orList(names)) added")\(bySelf ? " by me" : "") \(place(channel))")
      default: return ("New", "messages \(place(channel))")
      }
    case .github(let repo, let events, _, let branch):
      let r = repo.trimmingCharacters(in: .whitespacesAndNewlines), b = branch.trimmingCharacters(in: .whitespacesAndNewlines)
      let phrases = events.map { Self.isCI($0) && !b.isEmpty ? "\(Self.gitWords[$0] ?? $0) on \(b)" : (Self.gitWords[$0] ?? $0) }
      return ("When", "\(phrases.isEmpty ? more : RoutineSchedule.orList(phrases)) in \(r.isEmpty ? more : r)")
    case .teams(let tenant, let teams, let channels, let contains, _, _):
      let t = RoutineSchedule.orList(Self.ids(teams)), c = RoutineSchedule.orList(Self.ids(channels))
      let s = contains.trimmingCharacters(in: .whitespacesAndNewlines)
      let missing = tenant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? " (tenant \(more))" : ""
      return ("New", "messages\(s.isEmpty ? "" : " containing \"\(s)\"") in \(t.isEmpty ? more : t)\(c.isEmpty ? "" : " (in \(c))")\(missing)")
    case .linear(let event, let statuses, _, let projects, let teams):
      let t = RoutineSchedule.orList(Self.ids(teams)), forTeams = t.isEmpty ? "" : " for \(t)"
      let p = RoutineSchedule.orList(Self.ids(projects))
      switch event {
      case "statusChanged":
        let s = RoutineSchedule.orList(Self.ids(statuses))
        return ("Issue", "status \u{2192} \(s.isEmpty ? "any status" : s) in \(p.isEmpty ? "all projects" : p)\(forTeams)")
      case "endOfCycle": return ("At", "end of cycle for \(t.isEmpty ? "all teams" : t)")
      default: return ("Issue", "created in \(p.isEmpty ? "all projects" : p)\(forTeams)")
      }
    case .sentry(let event, let projects):
      let words = ["issueCreated": "created", "issueResolved": "resolved", "issueAssigned": "assigned", "issueArchived": "archived", "issueUnresolved": "unresolved", "issueAny": "any event"]
      let p = RoutineSchedule.orList(Self.ids(projects))
      return ("Issue", "\(words[event] ?? event) in \(p.isEmpty ? "all projects" : p)")
    case .pagerduty(let event, let services):
      let words = ["incidentTriggered": "triggered", "incidentAcknowledged": "acknowledged", "incidentResolved": "resolved", "incidentEscalated": "escalated", "incidentAny": "any event"]
      let s = RoutineSchedule.orList(Self.ids(services))
      return ("Incident", "\(words[event] ?? event) on \(s.isEmpty ? "all services" : s)")
    }
  }

  /** The source a row came from ("schedule", "slack"…). */
  public var platform: String {
    switch self {
    case .schedule: return "schedule"
    case .slack: return "slack"
    case .github: return "github"
    case .teams: return "microsoftTeams"
    case .linear: return "linear"
    case .sentry: return "sentry"
    case .pagerduty: return "pagerduty"
    }
  }
}

/** The routine editor's choices and their words, in the shipped window's order. */
public enum RoutineWords {
  /** Slack's event menu (`Ygn`), and what its button reads (`Zgn`). */
  public static let slackEvents: [(value: String, label: String)] = [("message", "New message in channel"), ("reaction", "Reaction added to message"), ("mention", "Agent is mentioned")]
  public static let slackButton = ["message": "New messages", "reaction": "Reaction added", "mention": "Agent is mentioned"]
  public static let reactors: [(value: Bool, label: String)] = [(false, "Anyone"), (true, "Only me")]
  public static let linearEvents: [(value: String, label: String)] = [("issueCreated", "Issue created"), ("statusChanged", "Issue status changed"), ("endOfCycle", "End of cycle")]
  public static let sentryEvents: [(value: String, label: String)] = [("issueCreated", "Created"), ("issueResolved", "Resolved"), ("issueAssigned", "Assigned"), ("issueArchived", "Archived"), ("issueUnresolved", "Unresolved"), ("issueAny", "Any issue event")]
  public static let pagerdutyEvents: [(value: String, label: String)] = [("incidentTriggered", "Triggered"), ("incidentAcknowledged", "Acknowledged"), ("incidentResolved", "Resolved"), ("incidentEscalated", "Escalated"), ("incidentAny", "Any incident event")]
  public static let teamsMatch: [(value: Bool, label: String)] = [(false, "Text"), (true, "Regex")]
  public static let teamsAudience: [(value: Bool, label: String)] = [(false, "Anyone"), (true, "Only linked users")]
  /** The Advanced grid's Days (`_gn`) and Time mode (`Ogn`). */
  public static let dayKinds: [(value: String, label: String)] = [("every-day", "Every day"), ("days-of-week", "Days of the week"), ("days-of-month", "Days of the month")]
  public static let timeKinds: [(value: String, label: String)] = [("at-times", "At times"), ("interval", "Every")]
  /** Days of the week as the Every week picker lists them: Monday first, Sunday last (`wmt`). */
  public static let weekOrder = [1, 2, 3, 4, 5, 6, 0]
  public static let units = ["minutes", "hours", "days"]
  /** The Advanced grid's Every takes minutes or hours only (`Jgn`). */
  public static let windowUnits = ["minutes", "hours"]

  /** "Any month", or the months picked, short and in order ("Jan, Mar") (`Ngn`). */
  public static func monthsLabel(_ months: [Int]?) -> String {
    guard let months, !months.isEmpty else { return "Any month" }
    return Array(Set(months)).sorted().map { (1...12).contains($0) ? String(RoutineSchedule.months[$0 - 1].prefix(3)) : String($0) }.joined(separator: ", ")
  }

  /** "Mon, Tue" (`Egn`). */
  public static func weekdaysLabel(_ days: [Int]) -> String {
    Array(Set(days)).sorted().map { (0...6).contains($0) ? RoutineSchedule.shortWeekdays[$0] : String($0) }.joined(separator: ", ")
  }

  /** "1st, 15th" (`Cgn`). */
  public static func monthDaysLabel(_ days: [Int]) -> String {
    Array(Set(days)).sorted().map(RoutineSchedule.ordinal).joined(separator: ", ")
  }

  /** The Git events button: the first chosen one's label and "+N", or "Pick events" (`a2n`). */
  public static func gitButton(_ events: [String]) -> String {
    guard let first = events.first else { return "Pick events" }
    let label = TriggerRow.gitSections.flatMap(\.events).first { $0.kind == first }?.label ?? first
    return events.count > 1 ? "\(label) +\(events.count - 1)" : label
  }

  /** The add menu's words: "Add trigger" with none yet, "Add another" after. */
  public static func addLabel(rows: Int) -> String { rows == 0 ? "Add trigger" : "Add another" }

  /** A run's status for its icon's label (`J2n`). */
  public static func runStatus(_ status: String) -> String {
    switch status {
    case "running": return "Running"
    case "ok": return "Succeeded"
    default: return "Failed"
    }
  }
}
