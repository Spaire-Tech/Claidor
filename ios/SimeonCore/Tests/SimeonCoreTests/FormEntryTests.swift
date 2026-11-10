import Foundation
import XCTest
@testable import SimeonCore

/** The store's forms make sense of what is typed (10 November 2026): a card's number, expiry and code; a phone with its country. */
final class FormEntryTests: XCTestCase {
  func testACardNumberIsDigitsGroupedAsTheCardPrintsThem() {
    XCTAssertEqual(CardNumber.grouped("4242424242424242"), "4242 4242 4242 4242")
    XCTAssertEqual(CardNumber.grouped("4242 4242-42a4"), "4242 4242 424")
    XCTAssertEqual(CardNumber.grouped("378282246310005"), "3782 822463 10005")
    XCTAssertEqual(CardNumber.grouped("30569309025904"), "3056 930902 5904")
    // No longer than the network's.
    XCTAssertEqual(CardNumber.typed("42424242424242429999"), "4242424242424242")
    XCTAssertEqual(CardNumber.typed("3782822463100059"), "378282246310005")
    XCTAssertEqual(CardNumber.grouped(""), "")
  }

  func testTheSecurityCodeIsDigitsAsLongAsTheCardsCode() {
    XCTAssertEqual(CardNumber.typedCode("12a34", brand: "visa"), "123")
    XCTAssertEqual(CardNumber.typedCode("12345", brand: "amex"), "1234")
    XCTAssertEqual(CardNumber.typedCode("12345", brand: ""), "1234")
    XCTAssertEqual(CardNumber.codeLength("mastercard"), 3)
  }

  func testTheExpiryWritesItsOwnSlash() {
    XCTAssertEqual(CardNumber.typedExpiry(old: "", new: "0"), "0")
    XCTAssertEqual(CardNumber.typedExpiry(old: "0", new: "08"), "08/")
    XCTAssertEqual(CardNumber.typedExpiry(old: "08/", new: "08/2"), "08/2")
    XCTAssertEqual(CardNumber.typedExpiry(old: "08/2", new: "08/28"), "08/28")
    XCTAssertEqual(CardNumber.typedExpiry(old: "08/28", new: "08/281"), "08/28")
    // A month that can only be one: 4 is April.
    XCTAssertEqual(CardNumber.typedExpiry(old: "", new: "4"), "04/")
    XCTAssertEqual(CardNumber.typedExpiry(old: "1", new: "12"), "12/")
    // No 13th month, no month 00.
    XCTAssertEqual(CardNumber.typedExpiry(old: "1", new: "13"), "1")
    XCTAssertEqual(CardNumber.typedExpiry(old: "0", new: "00"), "0")
    // The slash deleted takes the month's last digit, so it can be typed again.
    XCTAssertEqual(CardNumber.typedExpiry(old: "08/", new: "08"), "0")
    XCTAssertEqual(CardNumber.typedExpiry(old: "08/2", new: "08/"), "08")
    // Pasted, whole.
    XCTAssertEqual(CardNumber.typedExpiry(old: "", new: "0828"), "08/28")
    XCTAssertEqual(CardNumber.typedExpiry(old: "", new: "8/28"), "08/28")
    XCTAssertEqual(CardNumber.expiry(CardNumber.typedExpiry(old: "", new: "1229")), "12/29")
  }

  func testAnExpiredCardIsSaidToBe() {
    var parts = DateComponents()
    parts.year = 2026
    parts.month = 11
    parts.day = 10
    let now = Calendar(identifier: .gregorian).date(from: parts)!
    XCTAssertTrue(CardNumber.isExpired("10/26", now: now))
    XCTAssertFalse(CardNumber.isExpired("11/26", now: now))
    XCTAssertFalse(CardNumber.isExpired("01/27", now: now))
    XCTAssertTrue(CardNumber.isExpired("08/25", now: now))
    XCTAssertFalse(CardNumber.isExpired("13/26", now: now))
  }

  func testEveryCountryHasItsFlagAndCode() {
    XCTAssertEqual(Countries.flag("FR"), "🇫🇷")
    XCTAssertEqual(Countries.flag("us"), "🇺🇸")
    XCTAssertEqual(Countries.flag("F"), "")
    XCTAssertEqual(Countries.country("SN")?.dialLabel, "+221")
    let all = Countries.all(locale: Locale(identifier: "en"))
    XCTAssertGreaterThan(all.count, 230)
    XCTAssertEqual(Set(all.map(\.code)).count, all.count)
    XCTAssertTrue(all.allSatisfy { $0.flag.unicodeScalars.count == 2 && !$0.dial.isEmpty && $0.dial.allSatisfy(\.isNumber) })
    XCTAssertEqual(all.first { $0.code == "DE" }?.name, "Germany")
  }

  func testAPhoneIsGroupedAsItsCountryWritesIt() {
    XCTAssertEqual(PhoneEntry.formatted("4155550132", country: "US"), "(415) 555-0132")
    XCTAssertEqual(PhoneEntry.formatted("415", country: "US"), "(415")
    XCTAssertEqual(PhoneEntry.formatted("4155", country: "US"), "(415) 5")
    XCTAssertEqual(PhoneEntry.formatted("612345678", country: "FR"), "6 12 34 56 78")
    XCTAssertEqual(PhoneEntry.formatted("771234567", country: "SN"), "77 123 45 67")
    XCTAssertEqual(PhoneEntry.formatted("7911123456", country: "GB"), "7911 123456")
    // Elsewhere, in threes.
    XCTAssertEqual(PhoneEntry.formatted("912345678", country: "UY"), "912 345 678")
    XCTAssertEqual(PhoneEntry.formatted("9123456789", country: "UY"), "912 345 6789")
    // A home 0 is left out after the country's code.
    XCTAssertEqual(PhoneEntry.national("06 12 34 56 78", country: "FR"), "612345678")
    XCTAssertEqual(PhoneEntry.national("0612", country: "IT"), "0612")
  }

  func testAPhoneIsKeptWithItsCodeAndReadBack() {
    XCTAssertEqual(PhoneEntry.joined(country: "FR", national: "612345678"), "+33 6 12 34 56 78")
    XCTAssertEqual(PhoneEntry.joined(country: "US", national: "4155550132"), "+1 (415) 555-0132")
    XCTAssertEqual(PhoneEntry.joined(country: "FR", national: ""), "")
    XCTAssertTrue(PhoneEntry.split("+33 6 12 34 56 78", preferring: "US") == ("FR", "612345678"))
    XCTAssertTrue(PhoneEntry.split("+1 (415) 555-0132", preferring: "FR") == ("US", "4155550132"))
    // A shared code is the country asked for when it has it.
    XCTAssertTrue(PhoneEntry.split("+1 416 555 0132", preferring: "CA") == ("CA", "4165550132"))
    XCTAssertTrue(PhoneEntry.split("+44 7911 123456", preferring: "US") == ("GB", "7911123456"))
    XCTAssertTrue(PhoneEntry.split("00221 77 123 45 67", preferring: "FR") == ("SN", "771234567"))
    // No code: the country asked for, its home 0 left out.
    XCTAssertTrue(PhoneEntry.split("06 12 34 56 78", preferring: "FR") == ("FR", "612345678"))
    XCTAssertTrue(PhoneEntry.split("", preferring: "US") == ("US", ""))
  }

  func testDeletingASymbolTheFieldWritesTakesTheDigitBeforeIt() {
    XCTAssertEqual(TypedDigits.of(before: "(415) 5", after: "(415 5"), "415")
    XCTAssertEqual(TypedDigits.of(before: "4242 4", after: "4242 "), "4242")
    XCTAssertEqual(TypedDigits.of(before: "4242", after: "4242 4a"), "42424")
  }

  func testAFormSaysWhatToFixBeforeItsSaved() {
    var contact = CredentialDraft(kind: .contact)
    contact.country = "FR"
    XCTAssertTrue(contact.isEmpty, "a country chosen for the person is nothing written")
    XCTAssertEqual(contact.problem, "Add at least one detail.")
    contact.email = "ada@example"
    XCTAssertEqual(contact.problem, "Check the email.")
    contact.email = "ada@example.com"
    XCTAssertNil(contact.problem)
    var card = CredentialDraft(kind: .card)
    card.number = "4242424242424242"
    card.expiry = "01/20"
    XCTAssertEqual(card.problem, "This card has expired.")
    card.expiry = "08/49"
    XCTAssertNil(card.problem)
  }
}
