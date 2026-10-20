import Foundation
import XCTest
@testable import SimeonCore

/**
 * The core's sentences (`L10n`, 20 October 2026): the English as written where
 * no translation is (Linux, and any key the catalog lacks), and dates, times
 * and money in the app's language, the English ones unchanged.
 */
final class L10nTests: XCTestCase {
  override func tearDown() {
    AppLanguage.override = nil
    super.tearDown()
  }

  func testASentenceWithoutATranslationIsItsEnglishWithItsValues() {
    let name = "Ada"
    XCTAssertEqual(L10n.text("A sentence no catalog has, for \(name) and \(3) agents, at 100%."), "A sentence no catalog has, for Ada and 3 agents, at 100%.")
    XCTAssertEqual(L10n.text("tests.unknown", default: "Open \(name)"), "Open Ada")
  }

  func testLinuxReadsTheEnglishWhateverTheLanguage() {
    #if !canImport(Darwin)
    AppLanguage.override = "fr"
    XCTAssertEqual(L10n.text("Settings"), "Settings")
    XCTAssertEqual(L10n.text("\(2) agents"), "2 agents")
    #endif
  }

  func testDatesAndMoneyAreShownInTheAppsLanguageAndTheEnglishOnesAsBefore() {
    XCTAssertEqual(L10n.locale().identifier, "en_US")
    XCTAssertEqual(L10n.locale(english: Locale(identifier: "en_US_POSIX")).identifier, "en_US_POSIX")
    AppLanguage.override = "fr"
    XCTAssertEqual(L10n.locale().language.languageCode?.identifier, "fr")
    AppLanguage.override = "pt-BR"
    XCTAssertEqual(L10n.locale().identifier, "pt_BR", "a language that names its region keeps it")
  }
}
