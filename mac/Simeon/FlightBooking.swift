import AppKit
import SwiftUI
import SimeonCore

/**
 * Booking a flight on the Mac (13 October 2026; the path is in SimeonCore's
 * FlightBooking.swift): the traveller form as a card in the chat, its
 * details on a sheet in the system's grouped form, and the flight on its
 * checkout card. The colours are the checkout card's (Cards.swift).
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
            if card.flight.isTest { StatusPill(text: "Test", look: look) }
          }
          Text(card.flight.route).font(.system(size: 13)).foregroundStyle(grey)
        }
      }
      MacFlightLines(flight: card.flight, ink: ink, grey: grey)
      switch card.state {
      case .open:
        VStack(alignment: .leading, spacing: 8) {
          if let note = card.note {
            Text(note).font(.system(size: 12)).foregroundStyle(look.danger).fixedSize(horizontal: false, vertical: true)
          }
          Button { filling = true } label: {
            Text(FlightPassengersCard.fillIn)
              .font(.system(size: 15, weight: .medium))
              .foregroundStyle(.white)
              .frame(maxWidth: .infinity)
              .frame(height: 36)
              .background(blue, in: Capsule())
              .contentShape(Capsule())
          }
          .buttonStyle(.hand)
          Text(FlightPassengersCard.privacy).font(.system(size: 12)).foregroundStyle(grey).fixedSize(horizontal: false, vertical: true)
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
    .frame(maxWidth: 420, alignment: .leading)
    .background(look.dark ? Color(hex: 0x2c2c2e) : look.theirs, in: RoundedRectangle(cornerRadius: 20))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("\(FlightPassengersCard.title), \(card.flight.route)")
    .sheet(isPresented: $filling) {
      MacTravellersSheet(entryId: entryId, agentId: agentId, card: card)
    }
  }
}

/** The flight's date and times, then its fare and total. */
struct MacFlightLines: View {
  let flight: BookedFlight
  let ink: Color
  let grey: Color

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      if !flight.whenLine.isEmpty {
        Text(flight.whenLine).font(.system(size: 14)).foregroundStyle(ink).fixedSize(horizontal: false, vertical: true)
      }
      let fare = [flight.priceNote, flight.total].filter { !$0.isEmpty }.joined(separator: " · ")
      if !fare.isEmpty {
        Text(fare).font(.system(size: 12)).foregroundStyle(grey).fixedSize(horizontal: false, vertical: true)
      }
    }
  }
}

/** The travellers' details on a sheet: the grouped form, one section per seat, Continue and Cancel at its foot. */
struct MacTravellersSheet: View {
  let entryId: String
  let agentId: String
  let card: FlightPassengersCard
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var travellers: [Traveller] = []
  @State private var problem: (index: Int, message: String)?
  @State private var sending = false

  var body: some View {
    VStack(spacing: 0) {
      Form {
        Section {
          VStack(alignment: .leading, spacing: 2) {
            Text(card.flight.route).font(.system(size: 15, weight: .semibold))
            Text([card.flight.whenLine, card.flight.total].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 12)).foregroundStyle(.secondary)
          }
        } footer: {
          Text(FlightPassengersCard.asOnID).font(.system(size: 11)).foregroundStyle(.secondary)
        }
        ForEach(travellers.indices, id: \.self) { index in
          MacTravellerSection(traveller: $travellers[index], heading: card.seatLabel(index), passportNeeded: card.flight.documentsRequired, problem: problem?.index == index ? problem?.message : nil)
        }
      }
      .formStyle(.grouped)
      HStack(spacing: 10) {
        Text(FlightPassengersCard.privacy).font(.system(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 12)
        Button(FlightPassengersCard.cancel) { dismiss() }.keyboardShortcut(.cancelAction)
        Button {
          Task { await send() }
        } label: {
          if sending { ProgressView().controlSize(.small) } else { Text(FlightPassengersCard.next) }
        }
        .keyboardShortcut(.defaultAction)
        .disabled(sending)
      }
      .padding(16)
    }
    .frame(width: 460, height: 620)
    .onAppear { if travellers.isEmpty { travellers = card.startingTravellers } }
    .interactiveDismissDisabled(sending)
  }

  private func send() async {
    for (index, traveller) in travellers.enumerated() {
      if let found = traveller.problem(passportNeeded: card.flight.documentsRequired) {
        problem = (index, found.message)
        NSSound.beep()
        return
      }
    }
    problem = nil
    sending = true
    let answer = await store.submitFlightPassengers(entryId, travellers: travellers, in: agentId)
    sending = false
    if answer.ok { dismiss() } else { problem = (answer.index ?? 0, answer.message ?? "That didn't work.") }
  }
}

private struct MacTravellerSection: View {
  @Binding var traveller: Traveller
  let heading: String
  let passportNeeded: Bool
  let problem: String?
  @State private var showsPassport = false

  var body: some View {
    Section(heading) {
      TextField("First name", text: $traveller.givenName)
      TextField("Last name", text: $traveller.familyName)
      Picker("Title", selection: $traveller.title) {
        Text("Choose").tag(Traveller.Title?.none)
        ForEach(Traveller.Title.allCases, id: \.self) { title in Text(title.label).tag(Traveller.Title?.some(title)) }
      }
      Picker("Gender on ID", selection: $traveller.gender) {
        Text("Choose").tag(Traveller.Gender?.none)
        ForEach(Traveller.Gender.allCases, id: \.self) { gender in Text(gender.label).tag(Traveller.Gender?.some(gender)) }
      }
      MacDayField(label: "Date of birth", day: $traveller.bornOn, range: Calendar.current.date(byAdding: .year, value: -120, to: Date())!...Date(), start: Calendar.current.date(byAdding: .year, value: -30, to: Date())!)
      TextField("Email", text: $traveller.email)
      TextField("Phone, with country code", text: $traveller.phone)
      if passportNeeded || showsPassport {
        TextField("Passport number", text: $traveller.passportNumber)
        Picker("Issued by", selection: $traveller.passportCountry) {
          Text("Choose").tag("")
          ForEach(MacCountryName.all) { country in Text(country.name).tag(country.code) }
        }
        MacDayField(label: "Passport expires", day: $traveller.passportExpires, range: Date()...Calendar.current.date(byAdding: .year, value: 20, to: Date())!, start: Calendar.current.date(byAdding: .year, value: 1, to: Date())!)
      } else {
        Button("Add passport") { showsPassport = true }
      }
      if let problem {
        Text(problem).foregroundStyle(Color(hex: 0xc21d2e))
      }
    }
  }
}

/** A day as "YYYY-MM-DD": empty until picked, then the system's date field. */
private struct MacDayField: View {
  let label: String
  @Binding var day: String
  let range: ClosedRange<Date>
  let start: Date

  var body: some View {
    if let date = Traveller.date(day) {
      DatePicker(label, selection: Binding(get: { date }, set: { day = Traveller.day($0) }), in: range, displayedComponents: .date)
    } else {
      LabeledContent(label) { Button("Choose") { day = Traveller.day(start) } }
    }
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
