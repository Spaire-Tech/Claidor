import Foundation

/**
 * The flight card's words, laid out as Muse lays out its results (the
 * founder, 9 October 2026: "i found an absolute better design from muse and
 * i want that for all flights suggestions. everything should fit"): a row
 * reads "Delta Air Lines · $233.40" over "2:30pm ---- 2h40m ---- 5:10pm",
 * and the flight opens on its route, the total, a card per flight and the
 * fare's terms. The server's card (`server/simeon/desktop/flights.py`) is
 * unchanged; this only rewrites what it says to fit.
 */
public enum FlightText {
  /** "2:30 PM" is "2:30pm" and "10:46 PM +1" is "10:46pm+1" (without the day when `days` is false); anything else stays as it is. */
  public static func clock(_ text: String, days: Bool = true) -> String {
    let parts = text.split(separator: " ").map(String.init)
    guard parts.count >= 2, parts[0].contains(":"), ["AM", "PM"].contains(parts[1].uppercased()) else { return text }
    let later = days && parts.count > 2 && parts[2].hasPrefix("+") ? parts[2] : ""
    return parts[0] + parts[1].lowercased() + later
  }

  /** Minutes in "2h 40m", "2h40m", "3h" or "45m". */
  public static func minutes(_ text: String) -> Int? {
    var rest = Substring(text.replacingOccurrences(of: " ", with: ""))
    var total = 0, found = false
    if let h = rest.firstIndex(of: "h") {
      guard let hours = Int(rest[..<h]) else { return nil }
      total += hours * 60
      found = true
      rest = rest[rest.index(after: h)...]
    }
    if let m = rest.firstIndex(of: "m") {
      guard let minutes = Int(rest[..<m]) else { return nil }
      total += minutes
      found = true
      rest = rest[rest.index(after: m)...]
    }
    return found && rest.isEmpty ? total : nil
  }

  /** "2h40m", "8h05m", "3h", "45m". */
  public static func span(minutes total: Int) -> String {
    let hours = total / 60, minutes = total % 60
    if hours > 0 && minutes > 0 { return "\(hours)h\(minutes < 10 ? "0" : "")\(minutes)m" }
    return hours > 0 ? "\(hours)h" : "\(minutes)m"
  }

  /** "2h 40m" as "2h40m"; anything that isn't a span stays as it is. */
  public static func span(_ text: String) -> String {
    minutes(text).map { span(minutes: $0) } ?? text
  }

  /** The stops a row shows: none for a nonstop ("Nonstop" is the plain case), "1 stop" for "1 stop · PHX 1h 38m". */
  public static func stopCount(_ stops: String) -> String {
    let first = stops.components(separatedBy: " · ").first ?? ""
    return first == "Nonstop" ? "" : first
  }

  /** "Nonstop" or "1 stop": the first part of the server's stops line. */
  public static func stops(_ stops: String) -> String {
    stops.components(separatedBy: " · ").first ?? ""
  }
}

/** One line of times on a row: departs, the time in the air (and the stops), arrives. */
public struct FlightTimes: Hashable, Sendable {
  public let depart: String
  public let label: String
  public let arrive: String
}

/** The flights one way (out, or back on a round trip), each in its own card. */
public struct FlightWay: Hashable, Sendable {
  /** Empty for a one-way trip. */
  public let title: String
  public let legs: [FlightLeg]
}

extension FlightsCard {
  private var subtitleParts: [String] { subtitle.components(separatedBy: " · ").filter { !$0.isEmpty } }

  private static func isDay(_ part: String) -> Bool {
    ["Mon, ", "Tue, ", "Wed, ", "Thu, ", "Fri, ", "Sat, ", "Sun, "].contains { part.hasPrefix($0) }
  }

  /** "Seattle to Los Angeles — Sat, Oct 10": the route with its date, as the card's one heading. */
  public var heading: String {
    let day = subtitleParts.first(where: Self.isDay) ?? ""
    return [title, day].filter { !$0.isEmpty }.joined(separator: " — ")
  }

  /** What else the subtitle says, under the heading: "Test results · Refundable · 2 adults" (one adult, the usual, is left unsaid). */
  public var aside: String {
    subtitleParts.filter { !Self.isDay($0) && $0 != "1 adult" }.joined(separator: " · ")
  }
}

extension FlightOffer {
  /** The way out's line: "2:30pm", "2h40m" (with "· 1 stop" when it stops), "5:10pm". */
  public var outbound: FlightTimes {
    FlightTimes(
      depart: FlightText.clock(depart),
      label: [FlightText.span(duration), FlightText.stopCount(stops)].filter { !$0.isEmpty }.joined(separator: " · "),
      arrive: FlightText.clock(arrive))
  }

  /** The legs of the way back, on a round trip: from the first leg the server heads "Return". */
  public var returnLegs: [FlightLeg] {
    guard let start = legs.firstIndex(where: { $0.heading.hasPrefix("Return") }) else { return [] }
    return Array(legs[start...])
  }

  /**
   * The way back's line on a round trip, from the server's "Return 7:46 PM
   * – 10:40 PM +1 · 1 stop · PHX 1h 38m"; its time in the air is its
   * flights and layovers added up, left out when one isn't stated.
   */
  public var inbound: FlightTimes? {
    guard returnTimes.hasPrefix("Return ") else { return nil }
    let parts = returnTimes.dropFirst("Return ".count).components(separatedBy: " · ")
    let times = parts[0].components(separatedBy: " – ")
    guard times.count == 2 else { return nil }
    var total: Int? = returnLegs.isEmpty ? nil : 0
    for (index, leg) in returnLegs.enumerated() {
      guard let flying = FlightText.minutes(leg.duration) else { total = nil; break }
      total? += flying
      if index < returnLegs.count - 1 {
        guard let wait = FlightText.minutes(leg.layover.components(separatedBy: " in ").first ?? "") else { total = nil; break }
        total? += wait
      }
    }
    let stops = parts.count > 1 ? FlightText.stopCount(parts[1]) : ""
    return FlightTimes(
      depart: FlightText.clock(times[0]),
      label: [total.map { FlightText.span(minutes: $0) } ?? "", stops].filter { !$0.isEmpty }.joined(separator: " · "),
      arrive: FlightText.clock(times[1]))
  }

  /** The flights, one way after the other; the two ways of a round trip carry titles ("Outbound · Sat, Oct 10", "Return · Sun, Oct 12"). */
  public var ways: [FlightWay] {
    let back = returnLegs
    guard !back.isEmpty, back.count < legs.count else { return legs.isEmpty ? [] : [FlightWay(title: "", legs: legs)] }
    let out = Array(legs.prefix(legs.count - back.count))
    return [
      FlightWay(title: ["Outbound", date].filter { !$0.isEmpty }.joined(separator: " · "), legs: out),
      FlightWay(title: back[0].heading, legs: back),
    ]
  }

  /** The details sheet's subtitle: "Nonstop · 2h40m". */
  public var shape: String {
    [FlightText.stops(stops), FlightText.span(duration)].filter { !$0.isEmpty }.joined(separator: " · ")
  }

  /** The fare's terms in a line each: cancelling, changing, bags. */
  public var terms: [String] {
    var lines: [String] = []
    switch refundable {
    case "": break
    case "Full refund", "No refund": lines.append("\(refundable) if you cancel")
    case "Not stated": lines.append("Refund rules not stated")
    default: lines.append(refundable.hasPrefix("Refund minus ") ? "\(refundable) if you cancel" : "Cancellation: \(refundable)")
    }
    switch changeable {
    case "": break
    case "Free": lines.append("Free changes")
    case "Not allowed": lines.append("No changes allowed")
    case "Not stated": lines.append("Change rules not stated")
    default: lines.append(changeable.hasSuffix(" fee") ? "Changes for a \(changeable)" : "Changes: \(changeable)")
    }
    switch bags {
    case "": break
    case "Not stated": lines.append("Bags not stated")
    default: lines.append(bags)
    }
    return lines
  }
}

extension FlightLeg {
  /** "Sat, Oct 10 at 2:30pm" (the day says when it lands a day later, so no "+1"). */
  public var departing: String { Self.when(departDay, depart) }
  public var arriving: String { Self.when(arriveDay, arrive) }

  private static func when(_ day: String, _ time: String) -> String {
    let clock = FlightText.clock(time, days: day.isEmpty)
    return [day, clock].filter { !$0.isEmpty }.joined(separator: " at ")
  }

  /** "DL 2830 · Delta Air Lines", then "Operated by SkyWest" when another airline flies it. */
  public var flightLines: [String] {
    let parts = flight.components(separatedBy: " · operated by ")
    let number = [parts[0], carrier].filter { !$0.isEmpty }.joined(separator: " · ")
    return [number] + (parts.count > 1 ? ["Operated by \(parts[1])"] : [])
  }

  /** "1h 38m layover in Phoenix", between this flight and the next. */
  public var layoverLine: String {
    guard !layover.isEmpty, !layover.hasPrefix("Layover") else { return layover }
    guard let place = layover.range(of: " in ") else { return "\(layover) layover" }
    return layover.replacingCharacters(in: place, with: " layover in ")
  }
}

public enum AirlineLogo {
  /**
   * The size of an airline's logo inside its round mark: the largest box of
   * the logo's own shape the circle holds, a little inside it. A square
   * symbol fills about two thirds of the circle; a long wordmark (Alaska's,
   * JetBlue's, Spirit's) runs nearly across it instead of shrinking to a
   * sliver in a square.
   */
  public static func box(width: Double, height: Double, diameter: Double) -> (width: Double, height: Double) {
    guard width > 0, height > 0 else { return (0, 0) }
    let aspect = width / height
    let across = diameter * 0.92 / (1 + aspect * aspect).squareRoot()
    return (across * aspect, across)
  }
}
