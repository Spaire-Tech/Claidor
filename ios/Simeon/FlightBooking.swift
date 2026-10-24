import SwiftUI
import SimeonCore

/**
 * Booking a flight on the iPhone (13 October 2026; the path is in
 * SimeonCore's FlightBooking.swift). The traveller form comes into the chat
 * as a card (the flight, who has to be named, "Add traveller details");
 * the details are filled in on a sheet in the system's own form, one
 * section per traveller, the names as on their ID; Continue sends them to
 * the computer, which keeps them there and brings the flight's checkout
 * card. The checkout card shows the flight (`FlightCheckoutBlock`) where a
 * shop's card shows its checkout.
 */
struct FlightPassengersCardView: View {
  let entryId: String
  let agentId: String
  let card: FlightPassengersCard
  @Environment(AppStore.self) private var store
  @Environment(\.chatWidth) private var width
  @State private var filling = false

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .center, spacing: 12) {
        AirlineMark(name: card.flight.airline, logo: card.flight.logo, size: 44)
        VStack(alignment: .leading, spacing: 2) {
          HStack(spacing: 6) {
            Text(FlightPassengersCard.title).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.theirsText)
            if card.flight.isTest { StatusPill(text: String(localized: "Test"), size: 12) }
          }
          Text(card.flight.route).font(.system(size: 13)).foregroundStyle(Ink.fineGrey).fixedSize(horizontal: false, vertical: true)
        }
        Spacer(minLength: 0)
      }
      FlightSummaryLines(flight: card.flight)
      switch card.state {
      case .open:
        VStack(alignment: .leading, spacing: 8) {
          if let note = card.note {
            Text(note).font(.system(size: 13)).foregroundStyle(Ink.danger).fixedSize(horizontal: false, vertical: true)
          }
          Button(FlightPassengersCard.fillIn) {
            Haptics.press()
            filling = true
          }
          .buttonStyle(Tactile(look: PillButtonStyle(primary: true)))
          Text(FlightPassengersCard.privacy).font(.system(size: 12)).foregroundStyle(Ink.fineGrey).fixedSize(horizontal: false, vertical: true)
        }
      case .saved, .canceled:
        HStack(alignment: .top, spacing: 10) {
          PurchaseStatusMark(kind: card.state == .saved ? .success : .neutral).padding(.top, 2)
          Text(card.status ?? "").font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.theirsText).fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 0)
        }
      }
    }
    .padding(16)
    .frame(width: FlightsCardView.cardWidth(width), alignment: .leading)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    .modifier(CardEdge(radius: 22))
    .sheet(isPresented: $filling) {
      TravellersSheet(entryId: entryId, agentId: agentId, card: card)
    }
  }
}

/** The flight in a card: the date and times, then its fare and the total, and what changed since the search. */
struct FlightSummaryLines: View {
  let flight: BookedFlight

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if !flight.whenLine.isEmpty {
        Text(flight.whenLine).font(.system(size: 15)).foregroundStyle(Ink.theirsText).fixedSize(horizontal: false, vertical: true)
      }
      let fare = [flight.priceNote, flight.total].filter { !$0.isEmpty }.joined(separator: " · ")
      if !fare.isEmpty {
        Text(fare).font(.system(size: 13)).foregroundStyle(Ink.fineGrey).fixedSize(horizontal: false, vertical: true)
      }
      FlightChangedLine(flight: flight)
    }
    .accessibilityElement(children: .combine)
  }
}

/** What changed since the person last saw the flight (its price, times or fare terms), in the danger colour: a fresh decision (19 October 2026, Muse's rule). */
struct FlightChangedLine: View {
  let flight: BookedFlight

  var body: some View {
    if !flight.changed.isEmpty {
      Text(flight.changed).font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.danger).fixedSize(horizontal: false, vertical: true)
    }
  }
}

/**
 * The travellers' details, in the system's own form: one section per seat
 * (first and last name as on the ID, title, gender, date of birth, email,
 * phone; the passport when the airline needs it), the first filled from
 * Link. Every row keeps its label on the left once it is filled (the
 * founder, 24 October 2026: "its so confusing … add passport is a button
 * but looks like an option"): Add passport is the blue plus and its words,
 * and Continue the sheet's blue button. Continue checks each field first,
 * as the computer will, and says the first thing to fix under its
 * traveller.
 */
struct TravellersSheet: View {
  let entryId: String
  let agentId: String
  let card: FlightPassengersCard
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var travellers: [Traveller] = []
  @State private var problem: (index: Int, message: String)?
  @State private var sending = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          VStack(alignment: .leading, spacing: 4) {
            Text(card.flight.route).font(.system(size: 17, weight: .medium)).foregroundStyle(Ink.primary)
            FlightSummaryLines(flight: card.flight)
          }
          .padding(.vertical, 4)
        }
        .listRowBackground(Ink.groupedRow)
        ForEach(travellers.indices, id: \.self) { index in
          TravellerSection(
            traveller: $travellers[index],
            heading: card.seatLabel(index),
            passportNeeded: card.flight.documentsRequired,
            problem: problem?.index == index ? problem?.message : nil
          )
        }
        Section {
          Button {
            Task { await send() }
          } label: {
            if sending { ProgressView().tint(.white) } else { Text(FlightPassengersCard.next) }
          }
          .buttonStyle(Tactile(look: PillButtonStyle(primary: true)))
          .disabled(sending)
          .listRowInsets(EdgeInsets())
        } footer: {
          Text("\(FlightPassengersCard.asOnID) \(FlightPassengersCard.privacy)")
            .padding(.top, 8)
        }
        .listRowBackground(Color.clear)
      }
      .groupedGround()
      .scrollDismissesKeyboard(.interactively)
      .navigationTitle(FlightPassengersCard.title)
      .inlineBarTitle()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(FlightPassengersCard.cancel) { dismiss() }
        }
      }
    }
    .onAppear { if travellers.isEmpty { travellers = card.startingTravellers } }
    .interactiveDismissDisabled(sending)
  }

  private func send() async {
    for (index, traveller) in travellers.enumerated() {
      if let found = traveller.problem(passportNeeded: card.flight.documentsRequired, adultOn: card.adultOn(index)) {
        problem = (index, found.message)
        Haptics.tap()
        return
      }
    }
    problem = nil
    sending = true
    let answer = await store.submitFlightPassengers(entryId, travellers: travellers, in: agentId)
    sending = false
    if answer.ok {
      Haptics.press()
      dismiss()
    } else {
      problem = (answer.index ?? 0, answer.message ?? String(localized: "That didn't work."))
    }
  }
}

/** One traveller's section. */
private struct TravellerSection: View {
  @Binding var traveller: Traveller
  let heading: String
  let passportNeeded: Bool
  let problem: String?
  @State private var showsPassport = false

  var body: some View {
    Section {
      FieldRow(label: String(localized: "First name"), text: $traveller.givenName).textContentType(.givenName)
      FieldRow(label: String(localized: "Last name"), text: $traveller.familyName).textContentType(.familyName)
      Picker(String(localized: "traveller.title", defaultValue: "Title"), selection: $traveller.title) {
        Text("Choose").tag(Traveller.Title?.none)
        ForEach(Traveller.Title.allCases, id: \.self) { title in Text(title.label).tag(Traveller.Title?.some(title)) }
      }
      Picker("Gender on ID", selection: $traveller.gender) {
        Text("Choose").tag(Traveller.Gender?.none)
        ForEach(Traveller.Gender.allCases, id: \.self) { gender in Text(gender.label).tag(Traveller.Gender?.some(gender)) }
      }
      DayField(label: String(localized: "Date of birth"), day: $traveller.bornOn, range: Calendar.current.date(byAdding: .year, value: -120, to: Date())!...Date(), start: Calendar.current.date(byAdding: .year, value: -30, to: Date())!)
      FieldRow(label: String(localized: "Email"), text: $traveller.email).textContentType(.emailAddress).keyboardType(.emailAddress).typedAsIs()
      FieldRow(label: String(localized: "Phone, with country code"), text: $traveller.phone).textContentType(.telephoneNumber).keyboardType(.phonePad)
      if passportNeeded || showsPassport {
        FieldRow(label: String(localized: "Passport number"), text: $traveller.passportNumber).typedAsIs()
        Picker("Issued by", selection: $traveller.passportCountry) {
          Text("Choose").tag("")
          ForEach(CountryName.all) { country in Text(country.name).tag(country.code) }
        }
        DayField(label: String(localized: "Passport expires"), day: $traveller.passportExpires, range: Date()...Calendar.current.date(byAdding: .year, value: 20, to: Date())!, start: Calendar.current.date(byAdding: .year, value: 1, to: Date())!)
      } else {
        Button { showsPassport = true } label: {
          HStack(spacing: 10) {
            Image(systemName: "plus.circle.fill").font(.system(size: 20)).foregroundStyle(Ink.blue)
            Text("Add passport").foregroundStyle(Ink.blue)
          }
        }
      }
      if let problem {
        Text(problem).font(.system(size: 15)).foregroundStyle(Ink.danger)
      }
    } header: {
      Text(heading)
    }
    .listRowBackground(Ink.groupedRow)
    .font(.system(size: 17))
  }
}

/** A row with a field: its label on the left, kept once it is filled, and what is typed on the right ("Required" until then). */
private struct FieldRow: View {
  let label: String
  @Binding var text: String

  var body: some View {
    LabeledContent(label) {
      TextField(label, text: $text, prompt: Text("Required"))
        .multilineTextAlignment(.trailing)
    }
  }
}

/** A day on the form, as "YYYY-MM-DD": empty until picked (Choose starts the picker at `start`), then the system's date picker. */
private struct DayField: View {
  let label: String
  @Binding var day: String
  let range: ClosedRange<Date>
  let start: Date

  var body: some View {
    if let date = Traveller.date(day) {
      DatePicker(label, selection: Binding(get: { date }, set: { day = Traveller.day($0) }), in: range, displayedComponents: .date)
    } else {
      HStack {
        Text(label)
        Spacer(minLength: 8)
        Button("Choose") { day = Traveller.day(start) }
      }
    }
  }
}

/** Every country by its two letters and its name in English, sorted by name. */
struct CountryName: Hashable, Identifiable {
  let code: String
  let name: String
  var id: String { code }

  static let all: [CountryName] = Locale.Region.isoRegions
    .filter { $0.identifier.count == 2 && $0.identifier.allSatisfy(\.isLetter) }
    .compactMap { region in Locale(identifier: "en").localizedString(forRegionCode: region.identifier).map { CountryName(code: region.identifier, name: $0) } }
    .sorted { $0.name < $1.name }
}

/** The flight on its checkout card, where a shop's card shows its checkout: the airline, the route and times, who flies. */
struct FlightCheckoutBlock: View {
  let flight: BookedFlight

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      AirlineMark(name: flight.airline, logo: flight.logo, size: 40)
      VStack(alignment: .leading, spacing: 3) {
        Text(flight.route).font(.system(size: 15, weight: .medium)).foregroundStyle(Ink.theirsText).fixedSize(horizontal: false, vertical: true)
        if !flight.whenLine.isEmpty {
          Text(flight.whenLine).font(.system(size: 13)).foregroundStyle(Ink.fineGrey).fixedSize(horizontal: false, vertical: true)
        }
        if !flight.travellers.isEmpty {
          Label(flight.travellers.joined(separator: ", "), systemImage: "person.fill")
            .font(.system(size: 13)).foregroundStyle(Ink.fineGrey)
            .fixedSize(horizontal: false, vertical: true)
        }
        FlightChangedLine(flight: flight)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
    .background(Ink.field, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityElement(children: .combine)
  }
}
