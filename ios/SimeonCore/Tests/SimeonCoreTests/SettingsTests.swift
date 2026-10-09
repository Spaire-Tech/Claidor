import XCTest
@testable import SimeonCore

/**
 * Slice 6's ports against what the shipped code itself answered:
 * `Fixtures/settings.json` was made by running the settings chunk's rule
 * editor (`Ce`, `Ke`, `Ks`, `Hs` in `index-BlqerJhg.js`) on random lists and
 * edits, the main bundle's `zon` and `uct` on names, the Electron app's
 * `usageSummaryFromSimeonQuota` (account-profile.ts) on random quotas and the
 * main bundle's `NKn`, `yDn`, `kDn`, `Xve`, `qct` and `jct` on its answers,
 * and the patch's Manage Plan line, at 15:30 UTC on 9 October 2026, in en-US.
 */
final class SettingsTests: XCTestCase {
  private static let fixture: JSON = {
    let url = Bundle.module.url(forResource: "settings", withExtension: "json", subdirectory: "Fixtures")!
    return try! JSON.parse(Data(contentsOf: url))
  }()

  private var now: Date { Date(timeIntervalSince1970: (Self.fixture["now"]?.double ?? 0) / 1000) }

  func testInitialsAreTheWindowsFirstAndLastLetters() {
    for row in Self.fixture["initials"]?.array ?? [] {
      XCTAssertEqual(AccountInitials.of(row["name"]?.string ?? ""), row["initials"]?.string, row["name"]?.string ?? "")
    }
    XCTAssertEqual(Account(name: "Bass Fall", email: "b@x.co").initials, "BF")
  }

  func testAccountCardLines() {
    for row in Self.fixture["accounts"]?.array ?? [] {
      let display = AccountDisplay(displayName: row["displayName"]?.string, email: row["email"]?.string)
      XCTAssertEqual(display.name, row["name"]?.string)
      XCTAssertEqual(display.secondary, row["secondary"]?.string)
    }
    XCTAssertEqual(AccountDisplay(displayName: nil, email: nil).title, "Simeon")
  }

  private func instructions(_ json: JSON?) -> AutoReviewInstructions { AutoReviewInstructions(json: json) }

  private func rule(_ json: JSON?) -> AutoReviewInstructions.Rule {
    AutoReviewInstructions.Rule(behavior: AutoReviewInstructions.Behavior(rawValue: json?["behavior"]?.string ?? "allow")!, text: json?["text"]?.string ?? "", listIndex: json?["listIndex"]?.int ?? -1)
  }

  func testRulesEditorAnswersAsTheWindow() {
    let cases = Self.fixture["rules"]?.array ?? []
    XCTAssertGreaterThan(cases.count, 300)
    for (index, row) in cases.enumerated() {
      let start = instructions(row["instructions"])
      let op = row["op"]
      let result = row["result"]
      let label = "case \(index): \(op?["kind"]?.string ?? "")"
      switch op?["kind"]?.string {
      case "add", "edit":
        let behavior = AutoReviewInstructions.Behavior(rawValue: op?["behavior"]?.string ?? "allow")!
        let editing = op?["kind"]?.string == "edit" ? rule(op?["rule"]) : nil
        let saved = start.saving(op?["text"]?.string ?? "", as: behavior, editing: editing)
        if result == nil || result?.isNull == true { XCTAssertNil(saved, label) } else { XCTAssertEqual(saved, instructions(result), label) }
      case "remove":
        XCTAssertEqual(start.removing(rule(op?["rule"])), instructions(result), label)
      case "relocate":
        let found = start.relocate(rule(op?["rule"]))
        if result == nil || result?.isNull == true { XCTAssertNil(found, label) } else { XCTAssertEqual(found, rule(result), label) }
      default:
        XCTFail(label)
      }
    }
  }

  func testRulesKeepTheirOrderAndLimits() {
    var rules = AutoReviewInstructions()
    XCTAssertEqual(rules.json["isEnabled"]?.bool, true)
    rules = rules.saving("reply to emails", as: .allow, editing: nil)!
    rules = rules.saving("pay invoices", as: .ask, editing: nil)!
    XCTAssertEqual(rules.rules.map(\.text), ["reply to emails", "pay invoices"])
    XCTAssertNil(rules.saving("reply to emails", as: .allow, editing: nil))
    let full = AutoReviewInstructions(allow: (0..<20).map { "rule \($0)" })
    XCTAssertTrue(AutoReviewInstructions.isFull(full.allow))
    XCTAssertNil(full.saving("one more", as: .allow, editing: nil))
    XCTAssertEqual(AutoReviewInstructions.clip(String(repeating: "a", count: 1_200)).count, 1_000)
    XCTAssertEqual(AutoReviewInstructions.label(.ask), "Ask first")
  }

  func testUsageSummaryAndMetersAsTheElectronAppAndWindow() {
    let cases = Self.fixture["usage"]?.array ?? []
    XCTAssertEqual(cases.count, 500)
    for (index, row) in cases.enumerated() {
      let quota = row["quota"] ?? [:]
      let summary = UsageSummary(quota: quota, now: now)
      let shipped = row["summary"]
      let label = "case \(index): \(quota)"
      XCTAssertEqual(summary.usagePercent, shipped?["sandUsagePercent"]?.double, label)
      XCTAssertEqual(summary.resetMs, shipped?["sandUsageResetTimestampMs"]?.double, label)
      XCTAssertEqual(summary.hasAvailableUsage, shipped?["hasAvailableUsage"]?.bool, label)
      XCTAssertEqual(summary.isTrial, shipped?["isSandTrial"]?.bool, label)
      XCTAssertEqual(summary.hasEndedTrial, shipped?["hasEndedSandTrial"]?.bool, label)
      XCTAssertEqual(summary.hasNonZeroIncludedLimit, shipped?["hasNonZeroIncludedLimit"]?.bool, label)
      XCTAssertEqual(summary.canCancelTrial, shipped?["canCancelSandTrial"]?.bool, label)
      XCTAssertEqual(summary.onDemand?.usedCents, shipped?["onDemand"]?["usedCents"]?.double, label)
      XCTAssertEqual(summary.onDemand?.limitCents, shipped?["onDemand"]?["limitCents"]?.double, label)
      XCTAssertEqual(summary.upgrade?.label, shipped?["upgradeCta"]?["label"]?.string, label)
      XCTAssertEqual(summary.upgrade?.url.absoluteString, shipped?["upgradeCta"]?["action"]?["url"]?.string, label)
      XCTAssertEqual(summary.managePlan?.planName, shipped?["managePlan"]?["planName"]?.string, label)
      XCTAssertEqual(summary.managePlan?.nextTier?.label, shipped?["managePlan"]?["nextTier"]?["label"]?.string, label)
      XCTAssertEqual(summary.managePlan?.periodEndMs, shipped?["managePlan"]?["periodEndMs"]?.double, label)
      if let line = row["planLine"]?.string {
        XCTAssertEqual(summary.managePlan?.line(locale: Locale(identifier: "en_US"), timeZone: TimeZone(identifier: "UTC")!), line, label)
      } else {
        XCTAssertNil(summary.managePlan, label)
      }

      let meters = UsageMeters(summary, now: now)
      let view = row["view"]
      XCTAssertEqual(meters.includedUsageTitle, view?["includedUsageTitle"]?.string, label)
      XCTAssertEqual(meters.weekly?.valueLabel, view?["weekly"]?["valueLabel"]?.string, label)
      XCTAssertEqual(meters.weekly?.barPercent, view?["weekly"]?["barPercent"]?.double, label)
      XCTAssertEqual(meters.weekly?.resetLabel, view?["weekly"]?["resetLabel"]?.string, label)
      XCTAssertEqual(meters.onDemand?.valueLabel, view?["onDemand"]?["valueLabel"]?.string, label)
      XCTAssertEqual(meters.onDemand?.barPercent, view?["onDemand"]?["barPercent"]?.double, label)
      XCTAssertEqual(meters.onDemand?.resetLabel, view?["onDemand"]?["resetLabel"]?.string, label)
      XCTAssertEqual(meters.canCancelTrial, view?["canCancelTrial"]?.bool, label)
      XCTAssertEqual(meters.upgradeSupportingText, row["supporting"]?.string, label)
      XCTAssertEqual(UsageLoad.ready(summary).showsSection, row["visible"]?.bool, label)
    }
  }

  func testUsageLabels() {
    for row in Self.fixture["money"]?.array ?? [] {
      XCTAssertEqual(UsageMeters.money(row["cents"]?.double ?? -1), row["text"]?.string)
    }
    for row in Self.fixture["percent"]?.array ?? [] {
      XCTAssertEqual(UsageMeters.percent(row["value"]?.double ?? -1), row["text"]?.string)
    }
    let nowMs = now.timeIntervalSince1970 * 1000
    for row in Self.fixture["resets"]?.array ?? [] {
      XCTAssertEqual(UsageMeters.countdown(row["nextResetMs"]?.double, now: nowMs, verb: "Resets"), row["resets"]?.string)
      XCTAssertEqual(UsageMeters.countdown(row["nextResetMs"]?.double, now: nowMs, verb: "Ends"), row["ends"]?.string)
    }
  }

  /** `wze`, read off the bundle: dollars to two places with trailing zeros dropped; thousands as "k" to one place. */
  func testAccountMenuMoney() {
    XCTAssertEqual(UsageMeters.compactMoney(1250), "$12.5")
    XCTAssertEqual(UsageMeters.compactMoney(10_000), "$100")
    XCTAssertEqual(UsageMeters.compactMoney(1234), "$12.34")
    XCTAssertEqual(UsageMeters.compactMoney(0), "$0")
    XCTAssertEqual(UsageMeters.compactMoney(120_000), "$1.2k")
    XCTAssertEqual(UsageMeters.compactMoney(100_000), "$1k")
    XCTAssertEqual(UsageMeters.compactMoney(-5), "$0")
    XCTAssertEqual(UsageMeters.compactMoney(.nan), "$0")
  }

  func testUsageSectionShowsOnceASummaryIsIn() {
    let summary = UsageSummary(quota: ["creditsLimit": 100, "creditsUsed": 5])
    XCTAssertFalse(UsageLoad.empty.showsSection)
    XCTAssertFalse(UsageLoad.loading(previous: nil).showsSection)
    XCTAssertTrue(UsageLoad.loading(previous: summary).showsSection)
    XCTAssertTrue(UsageLoad.failed(previous: summary).showsSection)
    XCTAssertFalse(UsageLoad.failed(previous: nil).showsSection)
  }

  func testTimeZoneChoices() {
    XCTAssertEqual(TimeZoneChoices.automaticLabel(detected: "America/New_York"), "Auto-detect (America/New York)")
    XCTAssertEqual(TimeZoneChoices.automaticLabel(detected: nil), "Auto-detect")
    XCTAssertEqual(TimeZoneChoices.values(override: "Mars/Olympus", known: ["Europe/Paris"]), ["auto", "Mars/Olympus", "Europe/Paris"])
    XCTAssertEqual(TimeZoneChoices.values(override: "Europe/Paris", known: ["Europe/Paris"]), ["auto", "Europe/Paris"])
  }
}
