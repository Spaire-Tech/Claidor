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
 * it, with the date as a field over it to type a year at once (the founder,
 * 24 October 2026: the three menus looked nothing like the iPhone's).
 * Opened empty, it starts at `start`, as the iPhone's Choose does.
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
        VStack(alignment: .leading, spacing: 12) {
          DatePicker(label, selection: picked, in: range, displayedComponents: .date)
            .datePickerStyle(.field)
            .labelsHidden()
          DatePicker(label, selection: picked, in: range, displayedComponents: .date)
            .datePickerStyle(.graphical)
            .labelsHidden()
        }
        .padding(16)
        .onAppear { if Traveller.date(day) == nil { day = Traveller.day(start) } }
      }
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
