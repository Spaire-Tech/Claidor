import Foundation

/**
 * Booking a flight (13 October 2026, the founder: "we can book thru duffel.
 * all we need is a form. when they enter their info then we take care of
 * checkouts thru link"). The host's `shared/node/flight-booking/` has the
 * whole path; the apps' part is:
 *
 *   1. "Book with Simeon" on a flight (`startFlightBooking`), which puts the
 *      traveller form in the chat.
 *   2. The form (`flight-passengers`): one traveller per seat, names as on
 *      their ID, title, gender, date of birth, email and phone, the passport
 *      only when the airline needs it. Continue (`submitFlightPassengers`)
 *      keeps the details on the computer and brings the flight's checkout
 *      card (the purchase card with a flight on it, `PurchaseCard.flight`).
 *   3. Allow, then Link's approval; Simeon pays the airline and the card
 *      shows the booking reference.
 */
public struct FlightPassengersCard: Hashable, Sendable {
  public enum State: String, Sendable { case open, saved, canceled }

  public let flight: BookedFlight
  /** What Link knows of the person, for the first traveller (cleared once the form is sent). */
  public let prefill: [Traveller]
  public let state: State
  /** The travellers' names once saved: all the chat keeps. */
  public let names: [String]
  /** Why Continue didn't go through: Link not connected, a limit. */
  public let note: String?
  /** The checkout card the form led to. */
  public let checkoutId: String?

  public init(flight: BookedFlight, prefill: [Traveller], state: State, names: [String] = [], note: String? = nil, checkoutId: String? = nil) {
    self.flight = flight; self.prefill = prefill; self.state = state; self.names = names; self.note = note; self.checkoutId = checkoutId
  }

  init?(message: JSON, entry: Entry) {
    guard let flight = message["flight"].flatMap(BookedFlight.init(json:)) else { return nil }
    self.flight = flight
    self.prefill = (message["prefill"]?.array ?? []).enumerated().map { index, item in
      Traveller(id: flight.passengers.indices.contains(index) ? flight.passengers[index].id : "", json: item)
    }
    self.state = State(rawValue: entry["passengersState"]?.text ?? "") ?? .open
    self.names = (entry["passengersNames"]?.array ?? []).compactMap(\.text)
    let note = entry["passengersNote"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    self.note = note.isEmpty ? nil : note
    self.checkoutId = entry["passengersCheckoutId"]?.text
  }

  /** The form to fill in: one traveller per seat, the first with what Link knows. */
  public var startingTravellers: [Traveller] {
    flight.passengers.enumerated().map { index, seat in
      var traveller = prefill.indices.contains(index) ? prefill[index] : Traveller(id: seat.id)
      traveller.id = seat.id
      return traveller
    }
  }

  // MARK: Words

  public static let title = "Travellers"
  public static let fillIn = "Add traveller details"
  public static let asOnID = "Names exactly as on the ID used to travel."
  public static let privacy = "Used only for this booking. Simeon keeps it on your computer until the flight is booked."
  public static let next = "Continue"
  public static let cancel = "Cancel"

  /** "Ada wants to book a flight" */
  public static func headline(agent: String) -> String {
    let who = agent.trimmingCharacters(in: .whitespacesAndNewlines)
    return "\(who.isEmpty ? "Your agent" : who) wants to book a flight"
  }

  /** "Traveller 1 · Adult", or just "Adult" for one. */
  public func seatLabel(_ index: Int) -> String {
    let type = flight.passengers.indices.contains(index) ? flight.passengers[index].type : "adult"
    let kind = type == "child" ? "Child" : type.hasPrefix("infant") ? "Infant" : "Adult"
    return flight.passengers.count > 1 ? "Traveller \(index + 1) · \(kind)" : kind
  }

  /** Where it stands once answered, for the line under the card. */
  public var status: String? {
    switch state {
    case .open: return nil
    case .saved: return names.isEmpty ? "Details saved" : names.joined(separator: ", ")
    case .canceled: return "Canceled"
    }
  }

  /** In the chat list and a quote. */
  public var listLine: String { "Traveller details · \(flight.route)" }
}

/** The flight on the form and the checkout card (the host's `FlightBlock`). */
public struct BookedFlight: Hashable, Sendable {
  public struct Seat: Hashable, Sendable {
    public let id: String
    /** adult, child, infant_without_seat */
    public let type: String
  }

  public let offerId, route, airline, logo, date, from, to, depart, arrive, duration, stops, priceNote, returnTimes, total: String
  public let documentsRequired: Bool
  public let conditionsURL: URL?
  public let passengers: [Seat]
  /** Duffel's test mode: a pretend airline, nothing charged. */
  public let isTest: Bool
  /** On the checkout card: who flies. */
  public let travellers: [String]

  public init(offerId: String, route: String, airline: String, logo: String = "", date: String = "", from: String = "", to: String = "", depart: String = "", arrive: String = "", duration: String = "", stops: String = "", priceNote: String = "", returnTimes: String = "", total: String, documentsRequired: Bool = false, conditionsURL: URL? = nil, passengers: [Seat], isTest: Bool, travellers: [String] = []) {
    self.offerId = offerId; self.route = route; self.airline = airline; self.logo = logo; self.date = date; self.from = from; self.to = to
    self.depart = depart; self.arrive = arrive; self.duration = duration; self.stops = stops; self.priceNote = priceNote; self.returnTimes = returnTimes
    self.total = total; self.documentsRequired = documentsRequired; self.conditionsURL = conditionsURL; self.passengers = passengers; self.isTest = isTest; self.travellers = travellers
  }

  init?(json: JSON) {
    let s = { (key: String) -> String in json[key]?.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    guard s("offerId").hasPrefix("off_"), !s("route").isEmpty else { return nil }
    self.offerId = s("offerId"); self.route = s("route"); self.airline = s("airline"); self.logo = s("logo"); self.date = s("date")
    self.from = s("from"); self.to = s("to"); self.depart = s("depart"); self.arrive = s("arrive"); self.duration = s("duration")
    self.stops = s("stops"); self.priceNote = s("priceNote"); self.returnTimes = s("returnTimes"); self.total = s("total")
    self.documentsRequired = json["documentsRequired"]?.bool ?? false
    self.conditionsURL = URL(string: s("conditionsUrl")).flatMap { $0.scheme == "https" ? $0 : nil }
    let seats = (json["passengers"]?.array ?? []).compactMap { seat -> Seat? in
      guard let id = seat["id"]?.text else { return nil }
      return Seat(id: id, type: seat["type"]?.text ?? "adult")
    }
    self.passengers = seats.isEmpty ? [Seat(id: "", type: "adult")] : seats
    self.isTest = json["test"]?.bool ?? false
    self.travellers = (json["travellers"]?.array ?? []).compactMap(\.text)
  }

  /** "Thu, Nov 12 · 6:49am – 9:34am · Nonstop" */
  public var whenLine: String {
    let times = [FlightText.clock(depart), FlightText.clock(arrive)].filter { !$0.isEmpty }.joined(separator: " – ")
    return [date, times, FlightText.stops(stops)].filter { !$0.isEmpty }.joined(separator: " · ")
  }
}

/** One traveller as the form holds them, and as the host's `checkTravellers` wants them. */
public struct Traveller: Hashable, Sendable {
  public enum Title: String, CaseIterable, Sendable {
    case mr, ms, mrs, miss, dr
    public var label: String { self == .miss ? "Miss" : rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
  }

  public enum Gender: String, CaseIterable, Sendable {
    case f, m
    public var label: String { self == .f ? "Female" : "Male" }
  }

  public var id: String
  public var title: Title?
  public var gender: Gender?
  public var givenName = ""
  public var familyName = ""
  /** YYYY-MM-DD */
  public var bornOn = ""
  public var email = ""
  public var phone = ""
  public var passportNumber = ""
  /** Two letters, "US". */
  public var passportCountry = ""
  /** YYYY-MM-DD */
  public var passportExpires = ""

  public init(id: String) { self.id = id }

  init(id: String, json: JSON) {
    self.id = id
    givenName = json["given_name"]?.string ?? ""
    familyName = json["family_name"]?.string ?? ""
    email = json["email"]?.string ?? ""
    phone = json["phone_number"]?.string ?? ""
  }

  public var name: String { "\(givenName) \(familyName)".trimmingCharacters(in: .whitespaces) }

  /** What Continue sends (`submitFlightPassengers`). */
  public var json: JSON {
    var fields: [String: JSON] = [
      "id": .string(id),
      "title": .string(title?.rawValue ?? ""),
      "gender": .string(gender?.rawValue ?? ""),
      "given_name": .string(givenName.trimmingCharacters(in: .whitespaces)),
      "family_name": .string(familyName.trimmingCharacters(in: .whitespaces)),
      "born_on": .string(bornOn),
      "email": .string(email.trimmingCharacters(in: .whitespaces)),
      "phone_number": .string(phone.trimmingCharacters(in: .whitespaces)),
    ]
    if !passportNumber.trimmingCharacters(in: .whitespaces).isEmpty {
      fields["passport"] = .object(["number": .string(passportNumber), "issuing_country_code": .string(passportCountry.uppercased()), "expires_on": .string(passportExpires)])
    }
    return .object(fields)
  }

  /** The first thing to fix, as the host checks it (`checkTravellers`), so Continue says it at once: the field and the sentence. */
  public func problem(passportNeeded: Bool, today: Date = Date()) -> (field: String, message: String)? {
    let name = #/^[^\d!"#$%&()*+,./:;<=>?@\[\\\]^_`{|}~]{1,40}$/#
    let given = givenName.trimmingCharacters(in: .whitespaces), family = familyName.trimmingCharacters(in: .whitespaces)
    if given.wholeMatch(of: name) == nil { return ("given_name", "Write the first name as on the ID.") }
    if family.wholeMatch(of: name) == nil { return ("family_name", "Write the last name as on the ID.") }
    if title == nil { return ("title", "Choose a title.") }
    if gender == nil { return ("gender", "Choose the gender on the ID.") }
    let now = Self.day(today)
    guard let born = Self.date(bornOn), bornOn < now, Calendar(identifier: .gregorian).component(.year, from: born) >= 1900 else { return ("born_on", "The date of birth isn't right.") }
    if email.trimmingCharacters(in: .whitespaces).wholeMatch(of: #/^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/#) == nil { return ("email", "The email address isn't right.") }
    let digits = phone.replacingOccurrences(of: #"[\s().-]"#, with: "", options: .regularExpression)
    if digits.wholeMatch(of: #/^\+[1-9]\d{6,14}$/#) == nil { return ("phone_number", "The phone number needs its country code, like +1 206 555 0100.") }
    let passport = passportNumber.replacingOccurrences(of: " ", with: "")
    if !passport.isEmpty {
      if passport.wholeMatch(of: #/^[A-Za-z0-9]{5,20}$/#) == nil { return ("passport", "The passport number isn't right.") }
      if passportCountry.uppercased().wholeMatch(of: #/^[A-Z]{2}$/#) == nil { return ("passport", "Choose the passport's country.") }
      guard Self.date(passportExpires) != nil, passportExpires > now else { return ("passport", "That passport has expired.") }
    } else if passportNeeded {
      return ("passport", "This airline needs the passport.")
    }
    return nil
  }

  /** "1987-07-24" for a date picked on the form (the calendar day, wherever the person is). */
  public static func day(_ date: Date) -> String {
    let parts = Calendar(identifier: .gregorian).dateComponents(in: .current, from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
  }

  /** The day a "YYYY-MM-DD" names, at noon so no time zone moves it; nil when it isn't one. */
  public static func date(_ text: String) -> Date? {
    let parts = text.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3, text.count == 10 else { return nil }
    var components = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)
    components.calendar = Calendar(identifier: .gregorian)
    components.timeZone = .current
    guard let date = components.date, day(date) == text else { return nil }
    return date
  }
}

/** The answer to Continue or Book: the card it led to, or what to fix. */
public struct FlightBookingAnswer: Hashable, Sendable {
  public let entryId: String?
  public let message: String?
  /** The traveller and the field the message is about, when it is about one. */
  public let index: Int?
  public let field: String?

  public var ok: Bool { entryId != nil && message == nil }

  public init(entryId: String? = nil, message: String? = nil, index: Int? = nil, field: String? = nil) {
    self.entryId = entryId; self.message = message; self.index = index; self.field = field
  }

  init(reply: JSON?) {
    guard let reply else { self.init(message: "The computer didn't answer. Try again in a moment."); return }
    if reply["ok"]?.bool == true, let id = reply["entryId"]?.text {
      self.init(entryId: id)
    } else {
      self.init(message: reply["message"]?.text ?? "That didn't work.", index: reply["index"]?.int, field: reply["field"]?.text)
    }
  }
}
