import Foundation
import XCTest
@testable import SimeonCore

/** Booking a flight (13 October 2026): the offer id on the search card, the traveller form, its checks, and the flight on the checkout card. */
final class FlightBookingTests: XCTestCase {
  private static let flight: JSON = [
    "offerId": "off_0000AxyzTestOffer01", "route": "Seattle to Los Angeles", "airline": "Duffel Airways", "logo": "https://assets.duffel.com/ZZ.svg",
    "date": "Thu, Nov 12", "from": "SEA", "to": "LAX", "depart": "6:49 AM", "arrive": "9:34 AM", "duration": "2h 45m", "stops": "Nonstop",
    "priceNote": "1 adult · Economy · One way", "total": "$361.20", "documentsRequired": false, "conditionsUrl": "https://duffel.com/conditions",
    "passengers": [["id": "pas_0000Ada", "type": "adult"], ["id": "pas_0000Kid", "type": "child"]], "test": true,
  ]

  private func entry(_ message: JSON, _ fields: [String: JSON] = [:]) -> Entry {
    var raw: JSON = ["id": "t2s1", "kind": "send-message", "timestampMs": 1, "message": message]
    for (key, value) in fields { raw = raw.setting(key, value) }
    return Entry(raw)!
  }

  private func form(_ fields: [String: JSON] = [:]) throws -> FlightPassengersCard {
    let message: JSON = ["type": "flight-passengers", "content": "Traveller details for Seattle to Los Angeles · Thu, Nov 12 · $361.20", "flight": Self.flight, "prefill": [["given_name": "Ada", "family_name": "Lovelace", "email": "ada@example.com", "phone_number": "+12065550100"]]]
    guard case .flightPassengers(_, let card) = try XCTUnwrap(Chat.row(for: entry(message, fields))) else { XCTFail("not the traveller form"); throw CancellationError() }
    return card
  }

  func testTheSearchCardCarriesTheOfferToBook() throws {
    let card = try XCTUnwrap(FlightsCard.parse("```simeon-flights\n{\"title\":\"Seattle to Los Angeles\",\"offers\":[{\"offerId\":\"off_0000AxyzTestOffer01\",\"airline\":\"Duffel Airways\",\"price\":\"$361.20\"},{\"airline\":\"Older\",\"price\":\"$1\"}]}\n```"))
    XCTAssertEqual(card.offers[0].offerId, "off_0000AxyzTestOffer01")
    XCTAssertEqual(card.offers[1].offerId, "", "a card from before booking books nothing")
  }

  func testTheFormStartsWithWhatLinkKnowsForTheFirstTraveller() throws {
    let card = try form()
    XCTAssertEqual(card.state, .open)
    XCTAssertEqual(card.flight.route, "Seattle to Los Angeles")
    XCTAssertEqual(card.flight.whenLine, "Thu, Nov 12 · 6:49am – 9:34am · Nonstop")
    XCTAssertTrue(card.flight.isTest)
    let travellers = card.startingTravellers
    XCTAssertEqual(travellers.map(\.id), ["pas_0000Ada", "pas_0000Kid"])
    XCTAssertEqual(travellers[0].name, "Ada Lovelace")
    XCTAssertEqual(travellers[0].email, "ada@example.com")
    XCTAssertEqual(travellers[1].name, "", "the others start empty")
    XCTAssertEqual(card.seatLabel(0), "Traveller 1 · Adult")
    XCTAssertEqual(card.seatLabel(1), "Traveller 2 · Child")
    XCTAssertNil(card.status)
    XCTAssertEqual(card.listLine, "Traveller details · Seattle to Los Angeles")
    XCTAssertEqual(Chat.cardText(["type": "flight-passengers", "content": "Traveller details for Seattle to Los Angeles", "flight": Self.flight]), "Traveller details for Seattle to Los Angeles")

    let saved = try form(["passengersState": "saved", "passengersNames": ["Ada Lovelace", "Byron Lovelace"], "passengersCheckoutId": "t2s2"])
    XCTAssertEqual(saved.state, .saved)
    XCTAssertEqual(saved.status, "Ada Lovelace, Byron Lovelace")
    XCTAssertEqual(saved.checkoutId, "t2s2")
    XCTAssertEqual(try form(["passengersNote": "Link isn't connected."]).note, "Link isn't connected.")
    XCTAssertEqual(try form(["passengersState": "canceled"]).status, "Canceled")
  }

  func testEachTravellerIsCheckedAsTheComputerChecksThem() throws {
    let today = Traveller.date("2026-10-13")!
    var ada = Traveller(id: "pas_0000Ada")
    ada.givenName = "Ada"; ada.familyName = "Lovelace"; ada.title = .ms; ada.gender = .f
    ada.bornOn = "1987-07-24"; ada.email = "ada@example.com"; ada.phone = "+1 (206) 555-0100"
    XCTAssertNil(ada.problem(passportNeeded: false, today: today))
    XCTAssertEqual(ada.problem(passportNeeded: true, today: today)?.field, "passport")
    var fixes: [(WritableKeyPath<Traveller, String>, String, String)] = [
      (\.givenName, "4da", "given_name"), (\.familyName, "", "family_name"), (\.bornOn, "2030-01-01", "born_on"), (\.bornOn, "1987-02-30", "born_on"),
      (\.email, "ada", "email"), (\.phone, "206 555 0100", "phone_number"),
    ]
    fixes.append((\.passportNumber, "!!", "passport"))
    for (path, value, field) in fixes {
      var wrong = ada
      wrong[keyPath: path] = value
      XCTAssertEqual(wrong.problem(passportNeeded: false, today: today)?.field, field, value)
    }
    var noTitle = ada; noTitle.title = nil
    XCTAssertEqual(noTitle.problem(passportNeeded: false, today: today)?.field, "title")
    var withPassport = ada
    withPassport.passportNumber = "533 401 372"; withPassport.passportCountry = "us"; withPassport.passportExpires = "2030-01-01"
    XCTAssertNil(withPassport.problem(passportNeeded: true, today: today))
    XCTAssertEqual(withPassport.json["passport"]?["issuing_country_code"]?.string, "US")
    XCTAssertEqual(ada.json["title"]?.string, "ms")
    XCTAssertEqual(ada.json["gender"]?.string, "f")
    XCTAssertNil(ada.json["passport"], "no passport, none sent")
    XCTAssertEqual(Traveller.day(Traveller.date("1987-07-24")!), "1987-07-24")
    XCTAssertEqual(Traveller.Title.miss.label, "Miss")
    XCTAssertEqual(Traveller.Title.dr.label, "Dr")
  }

  func testTheFlightOnTheCheckoutCardSaysWhereSimeonIs() throws {
    let message: JSON = ["type": "purchase", "content": "Flight Seattle to Los Angeles · $361.20", "purchase": [
      "merchant": "Duffel Airways", "domain": "duffel.com", "url": "https://duffel.com/conditions", "amount": 36120, "currency": "usd", "total": "$361.20",
      "items": [["name": "Flight Seattle to Los Angeles, Thu, Nov 12", "quantity": 1]], "card": ["brand": "Visa", "last4": "4242"], "test": true,
      "flight": Self.flight.setting("travellers", ["Ada Lovelace"]).setting("formEntryId", "t2s1"),
    ]]
    func card(_ fields: [String: JSON] = [:]) throws -> PurchaseCard {
      guard case .purchase(_, let card) = try XCTUnwrap(Chat.row(for: entry(message, fields))) else { XCTFail("not a checkout card"); throw CancellationError() }
      return card
    }
    let review = try card()
    XCTAssertEqual(review.flight?.travellers, ["Ada Lovelace"])
    XCTAssertEqual(review.heading, "Flight")
    XCTAssertEqual(review.listLine, "Flight Seattle to Los Angeles · $361.20")
    XCTAssertEqual(PurchaseCard.flightHeadline(agent: "Ada", airline: "Duffel Airways"), "Ada wants to book a flight with Duffel Airways")
    XCTAssertTrue(review.waitsOnPerson)
    XCTAssertEqual(try card(["purchaseState": "approved", "purchaseStep": "paying"]).status?.label, "Approved · paying the airline")
    let verify = try card(["purchaseState": "approved", "purchaseStep": "verify"])
    XCTAssertTrue(verify.waitsOnBank)
    XCTAssertEqual(verify.status?.label, "Your bank wants to confirm it's you")
    XCTAssertEqual(try card(["purchaseState": "approved", "purchaseStep": "booking"]).status?.label, "Booking with the airline…")
    let booked = try card(["purchaseState": "ordered", "purchaseOrder": "RZPNX8"])
    XCTAssertEqual(booked.status?.label, "Booked")
    XCTAssertEqual(booked.detail, "Booking reference RZPNX8 · The airline emails the ticket.")
    let refused = try card(["purchaseState": "failed", "purchaseNote": "The price changed to $380.00 after it was approved, so nothing was paid."])
    XCTAssertEqual(refused.status?.label, "Not booked")
    XCTAssertEqual(refused.detail, "The price changed to $380.00 after it was approved, so nothing was paid.")
    let uncertain = try card(["purchaseState": "failed", "purchaseStep": "uncertain", "purchaseNote": "Check for the airline's email."])
    XCTAssertEqual(uncertain.status?.label, "Not confirmed")
    XCTAssertEqual(uncertain.status?.kind, .neutral)
  }

  func testAnAnswerFromTheComputerSaysWhereToGoOrWhatToFix() {
    XCTAssertEqual(FlightBookingAnswer(reply: ["ok": true, "entryId": "t2s2"]).entryId, "t2s2")
    XCTAssertTrue(FlightBookingAnswer(reply: ["ok": true, "entryId": "t2s2"]).ok)
    let fix = FlightBookingAnswer(reply: ["ok": false, "message": "Traveller 2: the email address isn't right.", "index": 1, "field": "email"])
    XCTAssertFalse(fix.ok)
    XCTAssertEqual(fix.index, 1)
    XCTAssertEqual(fix.field, "email")
    XCTAssertNotNil(FlightBookingAnswer(reply: nil).message)
  }
}
