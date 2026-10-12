import Foundation
import XCTest
@testable import SimeonCore

/** What the iPhone says when the account can't send (12 October 2026), and that it always leads to the plans. */
final class UpgradeTests: XCTestCase {
  private let now = Date(timeIntervalSince1970: 1_792_000_000)
  private let paymentRequired = SandAccess(state: .paymentRequired, reason: .none)
  private let granted = SandAccess(state: .granted, reason: .unspecified)

  private func usage(_ json: JSON) -> UsageSummary { UsageSummary(quota: json, now: now) }

  func testTheCoverSaysTheFreeMonthIsOverOrThatAPlanIsNeeded() {
    let over = usage(["subscriptionStatus": "none", "creditsLimit": 0, "creditsUsed": 0, "creditsRemaining": 0, "trialEndsAt": "2026-10-01T00:00:00+00:00"])
    XCTAssertEqual(PhoneUpgrade.cover(access: paymentRequired, usage: over).title, "Your free month has ended")
    XCTAssertEqual(PhoneUpgrade.cover(access: paymentRequired, usage: over).action, "See plans")
    let never = usage(["subscriptionStatus": "none", "creditsLimit": 0, "creditsUsed": 0, "creditsRemaining": 0])
    XCTAssertEqual(PhoneUpgrade.cover(access: paymentRequired, usage: never).title, "Choose a plan to start")
    XCTAssertEqual(PhoneUpgrade.cover(access: paymentRequired, usage: nil).title, "Choose a plan to start")
  }

  func testTheBannerOnlyWhenTheCreditsAreSpent() {
    let trialLeft = usage(["subscriptionStatus": "trialing", "creditsLimit": 5_000_000, "creditsUsed": 1_000, "creditsRemaining": 4_999_000])
    XCTAssertNil(PhoneUpgrade.banner(access: granted, usage: trialLeft))
    let trialSpent = usage(["subscriptionStatus": "trialing", "creditsLimit": 5_000_000, "creditsUsed": 5_000_000, "creditsRemaining": 0])
    XCTAssertEqual(PhoneUpgrade.banner(access: granted, usage: trialSpent)?.title, "You’ve used your free credits")
    XCTAssertEqual(PhoneUpgrade.banner(access: granted, usage: trialSpent)?.action, "Upgrade")
    let weekSpent = usage(["subscriptionStatus": "active", "tier": "standard", "creditsLimit": 3_750_000, "creditsUsed": 3_750_000, "creditsRemaining": 0])
    XCTAssertEqual(PhoneUpgrade.banner(access: granted, usage: weekSpent)?.title, "This week’s credits are used")
    // The server's 402 in the chat, before the summary is read again.
    XCTAssertEqual(PhoneUpgrade.banner(access: granted, usage: trialLeft, outOfCredits: true)?.title, "You’ve used your free credits")
    XCTAssertEqual(PhoneUpgrade.banner(access: granted, usage: nil, outOfCredits: true)?.title, "You’re out of credits")
    // No plan: the cover's words over the composer too.
    XCTAssertEqual(PhoneUpgrade.banner(access: paymentRequired, usage: nil)?.action, "See plans")
  }

  func testTheServersSentenceForSpentCreditsIsRecognised() throws {
    let card = try XCTUnwrap(Tray(["id": "t1", "kind": "error", "agentId": "a", "title": "Agent failed to respond", "detail": "Your trial credits are used up (code 40200). Choose a plan at https://app.simeonlabs.com/billing?from=app to keep going."]))
    XCTAssertTrue(PhoneUpgrade.isOutOfCredits(card))
    let other = try XCTUnwrap(Tray(["id": "t2", "kind": "error", "agentId": "a", "title": "Agent failed to respond", "detail": "Hourly spending budget reached (code 40201)."]))
    XCTAssertFalse(PhoneUpgrade.isOutOfCredits(other), "the hourly brake is not a plan matter")
  }
}
