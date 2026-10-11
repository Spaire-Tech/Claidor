import XCTest
@testable import SimeonCore

/** The account menu's reading, words and About's version info (step 10's spec, §§2.8, 3.4, 3.5, 4.4), against what the window showed. */
final class AccountMenuTests: XCTestCase {
  private let readAt = Date(timeIntervalSince1970: 1_791_000_000)

  private func iso(_ date: Date) -> JSON {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return .string(formatter.string(from: date))
  }

  private func reading(limit: Double = 100, used: Double, resetIn seconds: TimeInterval? = 4 * 86_400, onDemand: JSON = nil) -> AccountMenu.Reading? {
    var quota: [String: JSON] = ["creditsLimit": .number(limit), "creditsUsed": .number(used), "onDemand": onDemand]
    if let seconds { quota["periodEnd"] = iso(readAt.addingTimeInterval(seconds)) }
    return AccountMenu.reading(.ready(UsageSummary(quota: .object(quota), now: readAt)), readAt: readAt)
  }

  func testTheShare() {
    XCTAssertEqual(reading(used: 38)?.percent, "38%")
    XCTAssertEqual(reading(used: 0.4)?.percent, "1%")
    XCTAssertEqual(reading(used: 38.5)?.percent, "39%")
    XCTAssertEqual(reading(used: 99.5)?.percent, "100%")
    XCTAssertEqual(reading(used: 150)?.percent, "100%")
    XCTAssertEqual(reading(used: -5)?.percent, "0%")
    XCTAssertEqual(reading(used: 0)?.percent, "0%")
  }

  func testWhenItResets() {
    XCTAssertEqual(reading(used: 38)?.reset, "Resets in 4 days")
    XCTAssertEqual(reading(used: 38, resetIn: 3_600)?.reset, "Resets in 1 day")
    XCTAssertEqual(reading(used: 38, resetIn: 86_400)?.reset, "Resets in 1 day")
    XCTAssertEqual(reading(used: 38, resetIn: 86_400 + 120)?.reset, "Resets in 2 days")
    XCTAssertEqual(reading(used: 38, resetIn: -1)?.reset, "Resets today")
    XCTAssertEqual(reading(used: 38, resetIn: nil)?.reset, "Resets in 7 days")
    XCTAssertNil(reading(limit: 0, used: 0, resetIn: nil)?.reset)
    XCTAssertEqual(reading(limit: 0, used: 0, resetIn: nil)?.percent, "0%")
  }

  func testNoRowWithoutAReading() {
    XCTAssertNil(AccountMenu.reading(.empty, readAt: nil))
    XCTAssertNil(AccountMenu.reading(.loading(previous: nil), readAt: nil))
    let summary = UsageSummary(quota: ["creditsLimit": 100, "creditsUsed": 38], now: readAt)
    XCTAssertNil(AccountMenu.reading(.failed(previous: summary), readAt: readAt))
    XCTAssertEqual(AccountMenu.reading(.loading(previous: summary), readAt: readAt)?.percent, "38%")
    XCTAssertNil(AccountMenu.reading(.ready(UsageSummary(quota: ["creditsUsed": 3], now: readAt)), readAt: readAt))
  }

  func testTheSpend() {
    func spend(_ used: Double, _ limit: Double) -> String? {
      reading(used: 38, onDemand: ["usedCents": .number(used), "limitCents": .number(limit)])?.spend
    }
    XCTAssertEqual(spend(1240, 5000), "$12.4/$50")
    XCTAssertEqual(spend(0, 5000), "$0/$50")
    XCTAssertEqual(spend(1250, 2500), "$12.5/$25")
    XCTAssertEqual(spend(10, 2500), "$0.1/$25")
    XCTAssertEqual(spend(5, 2550), "$0.05/$25.5")
    XCTAssertEqual(spend(1, 10), "$0.01/$0.1")
    XCTAssertEqual(spend(99_999, 100_000), "$999.99/$1k")
    XCTAssertEqual(spend(100_050, 1_999_999), "$1k/$20k")
    XCTAssertEqual(spend(123_456, 500_000), "$1.2k/$5k")
    XCTAssertEqual(spend(125_000, 325_000), "$1.3k/$3.3k")
    XCTAssertEqual(spend(12.5, 99_999_999), "$0.13/$1000k")
    XCTAssertEqual(spend(123_456_789, 987_654_321), "$1234.6k/$9876.5k")
    XCTAssertNil(spend(100, 0))
    XCTAssertNil(reading(used: 38)?.spend)
  }

  func testJavaScriptsRounding() {
    XCTAssertEqual(UsageMeters.toFixed(1.25, 1), "1.3")
    XCTAssertEqual(UsageMeters.toFixed(1.005, 2), "1.00")
    XCTAssertEqual(UsageMeters.toFixed(0.125, 2), "0.13")
    XCTAssertEqual(UsageMeters.toFixed(9.99, 1), "10.0")
    XCTAssertEqual(UsageMeters.toFixed(999.999, 2), "1000.00")
    XCTAssertEqual(UsageMeters.toFixed(0, 2), "0.00")
    XCTAssertEqual(UsageMeters.compactMoney(125_000), "$1.3k")
    XCTAssertEqual(UsageMeters.compactMoney(325_000), "$3.3k")
  }

  func testAboutsVersionInfo() {
    XCTAssertEqual(AboutSimeon.versionInfo(version: "0.1.2"), "Version: 0.1.2\nRelease Track: stable\nOS: darwin")
    XCTAssertEqual(AboutSimeon.versionLine("0.1.0"), "Version 0.1.0")
  }
}
