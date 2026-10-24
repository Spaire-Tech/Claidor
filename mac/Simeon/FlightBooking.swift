import AppKit
import SwiftUI
import SimeonCore

/**
 * Booking a flight on the Mac (13 October 2026; the path is in SimeonCore's
 * FlightBooking.swift): the traveller form as a card in the chat, its
 * details on a sheet in the app's own parts (Settings' cards and rows, 24
 * October 2026), and the flight on its checkout card. The colours are the
 * checkout card's (Cards.swift). The card is a Mac's (21 October 2026): at
 * most 520 wide, Fill in at its right, as wide as its words; no privacy
 * line under the flight (the founder, 24 October 2026: "we speak way too
 * much").
 */
struct FlightPassengersCardView: View {
  let entryId: String
  let agentId: String
  let card: FlightPassengersCard
  let look: Look
  @State private var filling = false

  private var ink: Color { look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f) }
  private var grey: Color { look.dark ? Color(hex: 0x98989d) : Color(hex: 0x6e6e73) }
  private var blue: Color { look.dark ? Color(hex: 0x2f6db0) : Color(hex: 0x255a93) }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(spacing: 12) {
        AirlineMark(name: card.flight.airline, logo: card.flight.logo, side: 44)
        VStack(alignment: .leading, spacing: 1) {
          HStack(spacing: 6) {
            Text(FlightPassengersCard.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(ink)
            if card.flight.isTest { StatusPill(text: String(localized: "Test"), look: look) }
          }
          Text(card.flight.route).font(.system(size: 13)).foregroundStyle(grey)
        }
      }
      MacFlightLines(flight: card.flight, ink: ink, grey: grey, alert: look.danger)
      switch card.state {
      case .open:
        VStack(alignment: .leading, spacing: 8) {
          if let note = card.note {
            Text(note).font(.system(size: 12)).foregroundStyle(look.danger).fixedSize(horizontal: false, vertical: true)
          }
          HStack(spacing: 12) {
            Spacer(minLength: 0)
            Button { filling = true } label: {
              Text(FlightPassengersCard.fillIn)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(1)
                .padding(.horizontal, 16)
                .frame(minWidth: 88)
                .frame(height: 32)
                .background(blue, in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(.hand)
            .fixedSize()
          }
        }
      case .saved, .canceled:
        HStack(alignment: .top, spacing: 10) {
          Image(systemName: card.state == .saved ? "checkmark.circle.fill" : "minus.circle.fill")
            .font(.system(size: 15))
            .foregroundStyle(card.state == .saved ? Color(hex: 0x00c972) : grey)
          Text(card.status ?? "").font(.system(size: 14, weight: .medium)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
        }
      }
    }
    .tracking(-0.15)
    .padding(16)
    .frame(maxWidth: 520, alignment: .leading)
    .background(look.dark ? Color(hex: 0x2c2c2e) : look.theirs, in: RoundedRectangle(cornerRadius: 20))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("\(FlightPassengersCard.title), \(card.flight.route)")
    .sheet(isPresented: $filling) {
      MacTravellersSheet(entryId: entryId, agentId: agentId, card: card)
    }
  }
}

/** The flight's date and times, then its fare and total, and what changed since the search (in `alert`). */
struct MacFlightLines: View {
  let flight: BookedFlight
  let ink: Color
  let grey: Color
  var alert: Color = .red

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      if !flight.whenLine.isEmpty {
        Text(flight.whenLine).font(.system(size: 14)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
      }
      let fare = [flight.priceNote, flight.total].filter { !$0.isEmpty }.joined(separator: " · ")
      if !fare.isEmpty {
        Text(fare).font(.system(size: 12)).foregroundStyle(grey).fixedSize(horizontal: false, vertical: true)
      }
      if !flight.changed.isEmpty {
        Text(flight.changed).font(.system(size: 12, weight: .medium)).foregroundStyle(alert).fixedSize(horizontal: false, vertical: true)
      }
    }
  }
}

/**
 * The travellers' details on a sheet, in the app's own parts (the founder,
 * 24 October 2026: "this isnt the apple style at all … the buttons are
 * squared nothing matches … bigger and apple style. the pickers as well"):
 * the glass disc that closes it and the title at its top; the flight on a
 * card; each traveller a group of 56-high rows, the label on the left and
 * the field or the menu ("Choose ⌄") on the right, as Settings' rows are;
 * a day as the iPhone's, its date in a grey pill opening a calendar; Add
 * passport an action in the link blue; Continue the sheet's one wide button in the blue. The first
 * thing to fix shows in red under its traveller.
 */
struct MacTravellersSheet: View {
  let entryId: String
  let agentId: String
  let card: FlightPassengersCard
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @Environment(\.colorScheme) private var scheme
  @State private var travellers: [Traveller] = []
  @State private var problem: (index: Int, message: String)?
  @State private var sending = false

  private var look: Look { Look(scheme) }

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Text(FlightPassengersCard.title)
          .font(PanelType.title)
          .foregroundStyle(look.ink)
          .accessibilityAddTraits(.isHeader)
        HStack {
          GlassDiscButton(symbol: "xmark", help: FlightPassengersCard.cancel, size: 32) { dismiss() }
            .keyboardShortcut(.cancelAction)
            .disabled(sending)
          Spacer(minLength: 0)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 16)
      .padding(.bottom, 8)
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          flight
          ForEach(travellers.indices, id: \.self) { index in
            MacTravellerGroup(
              traveller: $travellers[index],
              heading: card.seatLabel(index),
              passportNeeded: card.flight.documentsRequired,
              problem: problem?.index == index ? problem?.message : nil,
              look: look
            )
          }
        }
        .padding(.horizontal, 32)
        .padding(.top, 8)
        .padding(.bottom, 24)
      }
      VStack(spacing: 0) {
        Button {
          Task { await send() }
        } label: {
          HStack(spacing: 8) {
            if sending { ProgressView().controlSize(.small).tint(.white) }
            Text(FlightPassengersCard.next)
          }
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Color.white)
          .frame(maxWidth: .infinity)
          .frame(height: 36)
        }
        .prominentGlassButton()
        .controlSize(.large)
        .tint(look.yours)
        .keyboardShortcut(.defaultAction)
        .handCursor()
        .disabled(sending)
      }
      .padding(.horizontal, 32)
      .padding(.top, 12)
      .padding(.bottom, 24)
    }
    .frame(width: 640, height: 720)
    .background(look.groupedGround)
    .onAppear { if travellers.isEmpty { travellers = card.startingTravellers } }
    .interactiveDismissDisabled(sending)
    .closesOnClickOutside { if !sending { dismiss() } }
  }

  /** The flight on a card: the airline's mark, the route, the day and times, the fare and its total; under it, names as on the ID. */
  private var flight: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 14) {
        AirlineMark(name: card.flight.airline, logo: card.flight.logo, side: 44)
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 6) {
            Text(card.flight.route).font(.system(size: 15, weight: .medium)).foregroundStyle(look.ink)
            if card.flight.isTest { StatusPill(text: String(localized: "Test"), look: look) }
          }
          if !card.flight.whenLine.isEmpty {
            Text(card.flight.whenLine).font(PanelType.row).foregroundStyle(look.inkSecondary)
          }
          let fare = [card.flight.priceNote, card.flight.total].filter { !$0.isEmpty }.joined(separator: " · ")
          if !fare.isEmpty {
            Text(fare).font(PanelType.detail).foregroundStyle(look.inkSecondary)
          }
          if !card.flight.changed.isEmpty {
            Text(card.flight.changed).font(.system(size: 12, weight: .medium)).foregroundStyle(look.danger).fixedSize(horizontal: false, vertical: true)
          }
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, 16)
      .background(RoundedRectangle(cornerRadius: SettingsRowSize.radius, style: .continuous).fill(look.groupedRow))
      Text(FlightPassengersCard.asOnID)
        .font(PanelType.detail)
        .foregroundStyle(look.inkSecondary)
        .padding(.horizontal, 8)
    }
  }

  private func send() async {
    for (index, traveller) in travellers.enumerated() {
      if let found = traveller.problem(passportNeeded: card.flight.documentsRequired, adultOn: card.adultOn(index)) {
        problem = (index, found.message)
        NSSound.beep()
        return
      }
    }
    problem = nil
    sending = true
    let answer = await store.submitFlightPassengers(entryId, travellers: travellers, in: agentId)
    sending = false
    if answer.ok { dismiss() } else { problem = (answer.index ?? 0, answer.message ?? String(localized: "That didn't work.")) }
  }
}

/** One traveller: their seat's name over a card of rows; the first thing to fix in red under it. */
private struct MacTravellerGroup: View {
  @Binding var traveller: Traveller
  let heading: String
  let passportNeeded: Bool
  let problem: String?
  let look: Look
  @State private var showsPassport = false

  var body: some View {
    SettingsGroup(title: heading, footer: problem, footerTint: look.danger, look: look) {
      MacTextRow(label: String(localized: "First name"), text: $traveller.givenName, content: .givenName, divided: false, look: look)
      MacTextRow(label: String(localized: "Last name"), text: $traveller.familyName, content: .familyName, look: look)
      SettingsMenu(
        label: String(localized: "traveller.title", defaultValue: "Title"),
        divided: true,
        options: Traveller.Title.allCases.map { (value: Traveller.Title?.some($0), label: $0.label) },
        value: traveller.title,
        shown: traveller.title == nil ? String(localized: "Choose") : nil,
        look: look
      ) { traveller.title = $0 }
      SettingsMenu(
        label: String(localized: "Gender on ID"),
        divided: true,
        options: Traveller.Gender.allCases.map { (value: Traveller.Gender?.some($0), label: $0.label) },
        value: traveller.gender,
        shown: traveller.gender == nil ? String(localized: "Choose") : nil,
        look: look
      ) { traveller.gender = $0 }
      MacDayRow(label: String(localized: "Date of birth"), day: $traveller.bornOn, range: Calendar.current.date(byAdding: .year, value: -120, to: Date())!...Date(), start: Calendar.current.date(byAdding: .year, value: -30, to: Date())!, look: look)
      MacTextRow(label: String(localized: "Email"), text: $traveller.email, content: .emailAddress, look: look)
      MacTextRow(label: String(localized: "Phone, with country code"), text: $traveller.phone, content: .telephoneNumber, look: look)
      if passportNeeded || showsPassport {
        MacTextRow(label: String(localized: "Passport number"), text: $traveller.passportNumber, look: look)
        SettingsMenu(
          label: String(localized: "Issued by"),
          divided: true,
          options: MacCountryName.all.map { (value: $0.code, label: $0.name) },
          value: traveller.passportCountry,
          shown: traveller.passportCountry.isEmpty ? String(localized: "Choose") : nil,
          look: look
        ) { traveller.passportCountry = $0 }
        MacDayRow(label: String(localized: "Passport expires"), day: $traveller.passportExpires, range: Date()...Calendar.current.date(byAdding: .year, value: 20, to: Date())!, start: Calendar.current.date(byAdding: .year, value: 1, to: Date())!, look: look)
      } else {
        MacAddRow(title: String(localized: "Add passport"), look: look) { showsPassport = true }
      }
    }
  }
}

/** A row with a field: the label on the left, what is typed on the right ("Required" until then), in the row's own type. */
private struct MacTextRow: View {
  let label: String
  @Binding var text: String
  var content: NSTextContentType? = nil
  var divided = true
  let look: Look

  var body: some View {
    SettingsLine(label: label, divided: divided, look: look) {
      TextField(label, text: $text, prompt: Text("Required").foregroundStyle(look.inkTertiary))
        .textFieldStyle(.plain)
        .labelsHidden()
        .multilineTextAlignment(.trailing)
        .font(PanelType.row)
        .foregroundStyle(look.ink)
        .textContentType(content)
        .frame(width: 300)
    }
  }
}

/**
 * A day ("YYYY-MM-DD") as the iPhone's: "Choose" until there is one, then
 * the date in a grey pill ("Oct 23, 1996"); either opens the calendar under
 * it (the founder, 24 October 2026: the three menus looked nothing like the
 * iPhone's, and AppKit's calendar "opens really weirdly. small"). Opened
 * empty, it starts at `start`, as the iPhone's Choose does.
 */
private struct MacDayRow: View {
  let label: String
  @Binding var day: String
  let range: ClosedRange<Date>
  let start: Date
  let look: Look
  @State private var open = false

  var body: some View {
    let date = Traveller.date(day)
    SettingsLine(label: label, divided: true, look: look) {
      Button { open = true } label: {
        Text(date.map { $0.formatted(date: .abbreviated, time: .omitted) } ?? String(localized: "Choose"))
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .padding(.horizontal, 12)
          .frame(height: 30)
          .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.ink.opacity(look.dark ? 0.1 : 0.06)))
          .contentShape(Rectangle())
      }
      .buttonStyle(.hand)
      .accessibilityLabel(label)
      .popover(isPresented: $open, arrowEdge: .bottom) {
        let picked = Binding(get: { Traveller.date(day) ?? start }, set: { day = Traveller.day($0) })
        MacCalendar(day: picked, range: range, look: look)
          .padding(.horizontal, 14)
          .padding(.vertical, 16)
          .onAppear { if Traveller.date(day) == nil { day = Traveller.day(start) } }
      }
    }
  }
}

/**
 * The calendar a day row opens, drawn as the iPhone's: the month and year
 * with a blue chevron that turns them into a month list and a year list (a
 * birthday is decades back), ‹ › for the months either side, then the days;
 * the chosen one blue on a pale blue disc (white on a blue one when it is
 * today), today in blue, a day outside the range grey and still. Six weeks
 * tall whatever the month, so it never jumps.
 */
private struct MacCalendar: View {
  @Binding var day: Date
  let range: ClosedRange<Date>
  let look: Look
  /** The month shown: its first day, at noon. */
  @State private var month: Date
  @State private var choosing = false

  private static let cell = CGSize(width: 42, height: 40)
  /** The weekdays' line and the gap under it, over the six weeks. */
  private static let height = 20 + 6 * cell.height
  /** The traveller's days are Gregorian, in the Mac's time zone (`Traveller.day`); the week starts as the Mac's region starts it. */
  private static let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = .current
    calendar.timeZone = .current
    return calendar
  }()

  init(day: Binding<Date>, range: ClosedRange<Date>, look: Look) {
    _day = day
    self.range = range
    self.look = look
    _month = State(initialValue: Self.first(of: day.wrappedValue))
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      head
      if choosing { lists } else { days }
    }
    .frame(width: Self.cell.width * 7)
  }

  private var head: some View {
    HStack(spacing: 0) {
      Button {
        withAnimation(.easeInOut(duration: 0.2)) { choosing.toggle() }
      } label: {
        HStack(spacing: 6) {
          Text(Self.title(month))
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(look.ink)
          Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(look.appleBlue)
            .rotationEffect(.degrees(choosing ? 90 : 0))
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.hand)
      Spacer(minLength: 0)
      if !choosing {
        step("chevron.left", by: -1, label: String(localized: "Previous month"))
        step("chevron.right", by: 1, label: String(localized: "Next month"))
      }
    }
    .padding(.leading, 10)
    .frame(height: 32)
  }

  private func step(_ symbol: String, by months: Int, label: String) -> some View {
    let target = Self.calendar.date(byAdding: .month, value: months, to: month) ?? month
    let allowed = Self.meets(Self.calendar.dateInterval(of: .month, for: target), range)
    return Button { month = target } label: {
      Image(systemName: symbol)
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(allowed ? look.appleBlue : look.inkTertiary)
        .frame(width: 36, height: 32)
        .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .disabled(!allowed)
    .accessibilityLabel(label)
  }

  private var days: some View {
    let calendar = Self.calendar
    let symbols = calendar.shortStandaloneWeekdaySymbols
    let shift = calendar.firstWeekday - 1
    let weekdays = Array(symbols[shift...]) + Array(symbols[..<shift])
    let lead = (calendar.component(.weekday, from: month) - calendar.firstWeekday + 7) % 7
    let count = calendar.range(of: .day, in: .month, for: month)?.count ?? 30
    var cells: [Int?] = Array(repeating: nil, count: lead)
    cells += (1...count).map { Optional($0) }
    cells += Array(repeating: nil, count: max(0, 42 - cells.count))
    return VStack(spacing: 4) {
      HStack(spacing: 0) {
        ForEach(Array(weekdays.enumerated()), id: \.offset) { _, name in
          Text(name.uppercased())
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(look.inkTertiary)
            .frame(width: Self.cell.width, height: 16)
        }
      }
      LazyVGrid(columns: Array(repeating: GridItem(.fixed(Self.cell.width), spacing: 0), count: 7), spacing: 0) {
        ForEach(Array(cells.enumerated()), id: \.offset) { _, number in
          if let number, let date = Self.date(in: month, day: number) {
            MacCalendarDay(
              number: number,
              chosen: calendar.isDate(date, inSameDayAs: day),
              today: calendar.isDateInToday(date),
              allowed: Self.meets(calendar.dateInterval(of: .day, for: date), range),
              label: date.formatted(date: .complete, time: .omitted),
              size: Self.cell,
              look: look
            ) { day = date }
          } else {
            Color.clear.frame(width: Self.cell.width, height: Self.cell.height)
          }
        }
      }
    }
    .frame(height: Self.height, alignment: .top)
  }

  /** The months and the years in the range, side by side, each scrolled to the one shown. */
  private var lists: some View {
    let calendar = Self.calendar
    let shown = calendar.dateComponents([.year, .month], from: month)
    let year = shown.year ?? 2000
    let years = Array(calendar.component(.year, from: range.lowerBound)...calendar.component(.year, from: range.upperBound))
    return HStack(spacing: 8) {
      MacCalendarList(
        values: Array(1...12),
        chosen: shown.month ?? 1,
        name: { calendar.standaloneMonthSymbols[$0 - 1] },
        allowed: { number in Self.meets(Self.date(year: year, month: number, day: 1).flatMap { calendar.dateInterval(of: .month, for: $0) }, range) },
        look: look
      ) { pick(year: year, month: $0) }
      MacCalendarList(values: years, chosen: year, name: { String($0) }, allowed: { _ in true }, look: look) {
        pick(year: $0, month: shown.month ?? 1)
      }
      .frame(width: 96)
    }
    .frame(height: Self.height)
  }

  /** A month or a year from the lists: the calendar shows it, and the chosen day moves there (its day of the month kept where the month has it), within the range. */
  private func pick(year: Int, month number: Int) {
    let calendar = Self.calendar
    guard let first = Self.date(year: year, month: number, day: 1) else { return }
    month = first
    let length = calendar.range(of: .day, in: .month, for: first)?.count ?? 28
    if let moved = Self.date(year: year, month: number, day: min(calendar.component(.day, from: day), length)) {
      day = min(max(moved, range.lowerBound), range.upperBound)
    }
  }

  private static func date(year: Int, month: Int, day: Int) -> Date? {
    calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))
  }

  private static func date(in month: Date, day: Int) -> Date? {
    let parts = calendar.dateComponents([.year, .month], from: month)
    return date(year: parts.year ?? 2000, month: parts.month ?? 1, day: day)
  }

  private static func first(of date: Date) -> Date {
    Self.date(in: date, day: 1) ?? date
  }

  /** Whether a day or a month has any of the range in it. */
  private static func meets(_ span: DateInterval?, _ range: ClosedRange<Date>) -> Bool {
    guard let span else { return false }
    return span.end > range.lowerBound && span.start <= range.upperBound
  }

  /** "October 1996", in the Mac's language. */
  private static func title(_ month: Date) -> String {
    let format = DateFormatter()
    format.calendar = calendar
    format.locale = .current
    format.setLocalizedDateFormatFromTemplate("LLLLyyyy")
    return format.string(from: month)
  }
}

/** A day in the calendar: 17, a faint disc under the pointer. */
private struct MacCalendarDay: View {
  let number: Int
  let chosen: Bool
  let today: Bool
  let allowed: Bool
  let label: String
  let size: CGSize
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      ZStack {
        Circle().fill(disc).frame(width: 36, height: 36)
        Text(number.formatted())
          .font(.system(size: 17, weight: chosen || today ? .semibold : .regular))
          .foregroundStyle(ink)
      }
      .frame(width: size.width, height: size.height)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .disabled(!allowed)
    .onHover { hovering = $0 }
    .accessibilityLabel(label)
    .accessibilityAddTraits(chosen ? .isSelected : [])
  }

  private var disc: Color {
    if chosen { return today ? look.appleBlue : look.appleBlue.opacity(look.dark ? 0.24 : 0.14) }
    return hovering && allowed ? look.ink.opacity(0.07) : .clear
  }

  private var ink: Color {
    if !allowed { return look.inkTertiary }
    if chosen && today { return .white }
    return chosen || today ? look.appleBlue : look.ink
  }
}

/** The month or the year list: 17 each, the one shown blue on a pale blue band, scrolled to the middle when it opens. */
private struct MacCalendarList: View {
  let values: [Int]
  let chosen: Int
  let name: (Int) -> String
  let allowed: (Int) -> Bool
  let look: Look
  let pick: (Int) -> Void

  var body: some View {
    ScrollViewReader { reader in
      ScrollView {
        VStack(spacing: 2) {
          ForEach(values, id: \.self) { value in
            let shown = value == chosen
            Button { pick(value) } label: {
              Text(name(value))
                .font(.system(size: 17, weight: shown ? .semibold : .regular))
                .foregroundStyle(shown ? look.appleBlue : allowed(value) ? look.ink : look.inkTertiary)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(shown ? look.appleBlue.opacity(look.dark ? 0.24 : 0.14) : .clear))
                .contentShape(Rectangle())
            }
            .buttonStyle(.hand)
            .disabled(!allowed(value))
            .id(value)
            .accessibilityAddTraits(shown ? .isSelected : [])
          }
        }
      }
      .scrollIndicators(.never)
      .onAppear { reader.scrollTo(chosen, anchor: .center) }
    }
  }
}

/** An action as a row (Add passport): the blue plus and the words in the link blue; a step darker under the pointer. */
private struct MacAddRow: View {
  let title: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: "plus.circle.fill")
          .font(.system(size: 16))
          .foregroundStyle(look.settingsAction)
        Text(title)
          .font(PanelType.row)
          .foregroundStyle(look.settingsAction)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, SettingsRowSize.vertical)
      .frame(minHeight: SettingsRowSize.minHeight)
      .background(hovering ? look.groupedRowHover : Color.clear)
      .overlay(alignment: .top) { SettingsDivider(look: look) }
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}

/** Every country by its two letters and its name in English, sorted by name. */
struct MacCountryName: Hashable, Identifiable {
  let code: String
  let name: String
  var id: String { code }

  static let all: [MacCountryName] = Locale.Region.isoRegions
    .filter { $0.identifier.count == 2 && $0.identifier.allSatisfy(\.isLetter) }
    .compactMap { region in Locale(identifier: "en").localizedString(forRegionCode: region.identifier).map { MacCountryName(code: region.identifier, name: $0) } }
    .sorted { $0.name < $1.name }
}

/** The flight on its checkout card: the airline, the route and times, who flies. */
struct MacFlightCheckoutBlock: View {
  let flight: BookedFlight
  let look: Look

  var body: some View {
    let ink = look.dark ? Color(hex: 0xf5f5f7) : Color(hex: 0x1d1d1f)
    let grey = look.dark ? Color(hex: 0x98989d) : Color(hex: 0x6e6e73)
    HStack(alignment: .top, spacing: 12) {
      AirlineMark(name: flight.airline, logo: flight.logo, side: 36)
      VStack(alignment: .leading, spacing: 2) {
        Text(flight.route).font(.system(size: 14, weight: .medium)).foregroundStyle(ink)
        if !flight.whenLine.isEmpty { Text(flight.whenLine).font(.system(size: 12)).foregroundStyle(grey) }
        if !flight.travellers.isEmpty {
          Label(flight.travellers.joined(separator: ", "), systemImage: "person.fill").font(.system(size: 12)).foregroundStyle(grey)
        }
        // What changed since the form (19 October 2026, Muse's rule): a fresh decision, before Allow.
        if !flight.changed.isEmpty {
          Text(flight.changed).font(.system(size: 12, weight: .medium)).foregroundStyle(look.danger).fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(12)
    .background(look.dark ? Color(hex: 0x3a3a3c) : Color.white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

/** "Book with Simeon" under a flight in the pane: the traveller form goes into the chat, or the reason it can't. */
struct BookFlightButton: View {
  let agentId: String
  let rowId: String
  let index: Int
  let look: Look
  var booked: () -> Void = {}
  @Environment(AppStore.self) private var store
  @State private var booking = false
  @State private var refused: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let refused {
        Text(refused).font(.system(size: 12)).foregroundStyle(look.danger).fixedSize(horizontal: false, vertical: true)
      }
      Button {
        booking = true
        refused = nil
        Task {
          let answer = await store.startFlightBooking(entryId: rowId, offerIndex: index, in: agentId)
          booking = false
          if answer.ok { booked() } else { refused = answer.message }
        }
      } label: {
        Group {
          if booking { ProgressView().controlSize(.small).tint(.white) } else { Text("Book with Simeon") }
        }
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .frame(height: 36)
        .background(look.dark ? Color(hex: 0x2f6db0) : Color(hex: 0x255a93), in: Capsule())
        .contentShape(Capsule())
      }
      .buttonStyle(.hand)
      .disabled(booking)
      .accessibilityHint("Shows the traveller form in the chat")
    }
  }
}
