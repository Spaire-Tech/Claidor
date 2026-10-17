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
    let weekSpent = usage(["subscriptionStatus": "active", "tier": "standard", "creditsLimit": 5_000_000, "creditsUsed": 5_000_000, "creditsRemaining": 0])
    XCTAssertEqual(PhoneUpgrade.banner(access: granted, usage: weekSpent)?.title, "This week’s credits are used")
    // The server's 402 in the chat, before there is a summary.
    XCTAssertEqual(PhoneUpgrade.banner(access: granted, usage: nil, outOfCredits: true)?.title, "You’re out of credits")
    // A summary with credits left wins over a card from before a purchase.
    XCTAssertNil(PhoneUpgrade.banner(access: granted, usage: trialLeft, outOfCredits: true))
    // A plan with no included credits, its spend used up: only the 402 says so.
    let noIncluded = usage(["subscriptionStatus": "active", "tier": "standard", "creditsLimit": 0, "creditsUsed": 0, "creditsRemaining": 0])
    XCTAssertNil(PhoneUpgrade.banner(access: granted, usage: noIncluded))
    XCTAssertEqual(PhoneUpgrade.banner(access: granted, usage: noIncluded, outOfCredits: true)?.title, "You’re out of credits")
    // No plan: the cover's words over the composer too.
    XCTAssertEqual(PhoneUpgrade.banner(access: paymentRequired, usage: nil)?.action, "See plans")
  }

  func testTheButtonGoesWhereThePlanWasBought() {
    let unavailable = SandAccess(state: .unavailable, reason: .unspecified)
    XCTAssertEqual(PhoneUpgrade.route(access: unavailable, usage: nil, webLinkAllowed: false), .web(SandAccess.page))
    // No plan: the App Store's plans.
    XCTAssertEqual(PhoneUpgrade.route(access: paymentRequired, usage: nil, webLinkAllowed: true), .plans(tier: nil))
    let free = usage(["subscriptionStatus": "trialing", "planName": "Free trial", "creditsLimit": 5_000_000, "creditsUsed": 5_000_000, "creditsRemaining": 0])
    XCTAssertEqual(PhoneUpgrade.route(access: granted, usage: free, webLinkAllowed: true), .plans(tier: nil), "the free month has no tier")
    // An Apple plan: the plans, on the one above.
    let apple = usage(["subscriptionStatus": "active", "tier": "standard", "billedBy": "apple", "creditsLimit": 1, "creditsUsed": 1, "creditsRemaining": 0, "upgradeUrl": "https://app.simeonlabs.com/billing?from=app"])
    XCTAssertEqual(PhoneUpgrade.route(access: granted, usage: apple, webLinkAllowed: false), .plans(tier: "pro"))
    // A plan bought on the web: Stripe's confirmation of the plan above, in the app (14 October 2026: the web's page
    // asked to sign in), where Apple allows the link, else no button (never a second plan from the App Store).
    let web = usage(["subscriptionStatus": "active", "tier": "pro", "billedBy": "stripe", "creditsLimit": 1, "creditsUsed": 1, "creditsRemaining": 0, "upgradeUrl": "https://app.simeonlabs.com/billing?from=app"])
    XCTAssertEqual(PhoneUpgrade.route(access: granted, usage: web, webLinkAllowed: true), .portal(flow: "update_confirm", tier: "max"))
    XCTAssertEqual(PhoneUpgrade.route(access: granted, usage: web, webLinkAllowed: false), .none)
    // The top plan has none above: Stripe's front page.
    let top = usage(["subscriptionStatus": "active", "tier": "max", "billedBy": "stripe", "creditsLimit": 1, "creditsUsed": 1, "creditsRemaining": 0])
    XCTAssertEqual(PhoneUpgrade.route(access: granted, usage: top, webLinkAllowed: true), .portal(flow: nil, tier: nil))
    let words = PhoneUpgrade.withoutUpgrade(PhoneUpgrade.banner(access: granted, usage: web)!)
    XCTAssertEqual(words.title, "This week’s credits are used")
    XCTAssertEqual(words.body, "They reset on Monday.")
    XCTAssertNil(words.action)
  }

  /**
   * The trial's first charge failed (14 October 2026): the app stays open
   * and the line over the composer says why Send waits; a card bought on
   * the web goes to Stripe's card page in the app (not the web's billing
   * page, which asked to sign in), an Apple plan to the plans.
   */
  func testAFailedPaymentAsksForTheCardNotAPlan() throws {
    let stripe = usage(["subscriptionStatus": "none", "creditsLimit": 0, "creditsUsed": 0, "creditsRemaining": 0, "paymentFailed": true, "billedBy": "stripe", "upgradeUrl": "https://app.simeonlabs.com/billing?from=app"])
    XCTAssertTrue(stripe.paymentFailed)
    XCTAssertEqual(stripe.upgrade?.label, "Update card")
    let words = PhoneUpgrade.cover(access: paymentRequired, usage: stripe)
    XCTAssertEqual(words.title, "Your payment didn’t go through")
    XCTAssertEqual(words.body, "You can’t send messages until your card is updated.")
    XCTAssertEqual(words.action, "Update card")
    XCTAssertEqual(PhoneUpgrade.banner(access: paymentRequired, usage: stripe), words)
    XCTAssertTrue(paymentRequired.pausesSending, "Send waits while the line says why")
    XCTAssertEqual(PhoneUpgrade.route(access: paymentRequired, usage: stripe, webLinkAllowed: true), .portal(flow: "payment_method", tier: nil))
    XCTAssertEqual(PhoneUpgrade.route(access: paymentRequired, usage: stripe, webLinkAllowed: false), .none)
    let quiet = PhoneUpgrade.withoutUpgrade(words)
    XCTAssertEqual(quiet.body, words.body, "no link, but still the reason")
    XCTAssertNil(quiet.action)

    let apple = usage(["subscriptionStatus": "none", "creditsLimit": 0, "paymentFailed": true, "billedBy": "apple", "upgradeUrl": "https://app.simeonlabs.com/billing?from=app"])
    XCTAssertEqual(PhoneUpgrade.cover(access: paymentRequired, usage: apple).action, "See plans")
    XCTAssertEqual(PhoneUpgrade.cover(access: paymentRequired, usage: apple).body, "You can’t send messages until your Apple payment method is updated.")
    XCTAssertEqual(PhoneUpgrade.route(access: paymentRequired, usage: apple, webLinkAllowed: false), .plans(tier: nil))
    XCTAssertTrue(PhoneUpgrade.applePaymentFailed(apple), "the plans then link to Apple's payment page")
    XCTAssertFalse(PhoneUpgrade.applePaymentFailed(stripe))

    // Without the flag, as before: the plans.
    let none = usage(["subscriptionStatus": "none", "creditsLimit": 0, "upgradeUrl": "https://app.simeonlabs.com/billing?from=app"])
    XCTAssertFalse(none.paymentFailed)
    XCTAssertEqual(none.upgrade?.label, "Choose a plan")
    XCTAssertEqual(PhoneUpgrade.cover(access: paymentRequired, usage: none).action, "See plans")
    XCTAssertEqual(PhoneUpgrade.route(access: paymentRequired, usage: none, webLinkAllowed: true), .plans(tier: nil))
  }

  /** The Mac (14 October 2026): the web's 30-day trial with a card, not the homepage. */
  func testTheMacSendsANewAccountToTheWebsTrial() {
    let fresh = SandAccess(state: .paymentRequired, reason: .freeTrialAvailable)
    let none = usage(["subscriptionStatus": "none", "creditsLimit": 0, "upgradeUrl": "https://app.simeonlabs.com/billing?from=app"])
    let words = MacUpgrade.cover(access: fresh, usage: none)
    XCTAssertEqual(words.title, "Start your free trial to send messages")
    XCTAssertEqual(words.action, "Start Free Trial")
    XCTAssertEqual(MacUpgrade.route(access: fresh, usage: none), .web(URL(string: "https://app.simeonlabs.com/billing?from=app")!))
    XCTAssertEqual(MacUpgrade.route(access: fresh, usage: nil), .web(MacUpgrade.billing), "before the quota is read")
    XCTAssertNotEqual(MacUpgrade.route(access: fresh, usage: nil), .web(SandAccess.page))

    let hadOne = SandAccess(state: .paymentRequired, reason: .none)
    XCTAssertEqual(MacUpgrade.cover(access: hadOne, usage: none).title, "Simeon needs a plan")
    let over = usage(["subscriptionStatus": "none", "creditsLimit": 0, "trialEndsAt": "2026-10-01T00:00:00+00:00"])
    XCTAssertEqual(MacUpgrade.cover(access: hadOne, usage: over).title, "Your free month has ended")

    let failed = usage(["subscriptionStatus": "none", "creditsLimit": 0, "paymentFailed": true, "billedBy": "stripe", "upgradeUrl": "https://app.simeonlabs.com/billing?from=app"])
    XCTAssertEqual(MacUpgrade.cover(access: hadOne, usage: failed).action, "Update card")
    // A card that failed: Stripe's card page in the app, not the web's billing page (which asked to sign in).
    XCTAssertEqual(MacUpgrade.route(access: hadOne, usage: failed), .portal(flow: "payment_method", tier: nil))
    let appleFailed = usage(["subscriptionStatus": "none", "creditsLimit": 0, "paymentFailed": true, "billedBy": "apple"])
    XCTAssertEqual(MacUpgrade.route(access: hadOne, usage: appleFailed), .web(PhoneUpgrade.appleBilling))
    XCTAssertEqual(MacUpgrade.cover(access: hadOne, usage: appleFailed).action, "Update payment")

    // An account no plan can help keeps the window's words and Simeon Labs' page.
    let unavailable = SandAccess(state: .unavailable, reason: .notOffered)
    XCTAssertEqual(MacUpgrade.cover(access: unavailable, usage: nil), unavailable.cover)
    XCTAssertEqual(MacUpgrade.route(access: unavailable, usage: nil), .web(SandAccess.page))
  }

  /** Stripe's page from the app (14 October 2026): the card form, back in the app when done, then the plan charged and read again. */
  @MainActor
  func testTheCardPageIsAskedForWithTheWayBack() async throws {
    let box = PluginsBox()
    box.answers["server:billing/portal"] = ["portalUrl": "https://billing.stripe.com/p/1"]
    let store = AppStore()
    await store.attach(box)
    let answer = await store.billingPortal(flow: PhoneUpgrade.paymentMethodFlow, tier: nil, back: "simeon-ios")
    XCTAssertEqual(answer.url, URL(string: "https://billing.stripe.com/p/1"))
    XCTAssertEqual(box.sent("server:billing/portal"), ["flow": "payment_method", "back": "simeon-ios"])
    _ = await store.billingPortal(flow: PhoneUpgrade.upgradeFlow, tier: "max", back: "simeon")
    XCTAssertEqual(box.sent("server:billing/portal"), ["flow": "update_confirm", "tier": "max", "back": "simeon"])
    // Settings' Manage Plan front page, as before: nothing sent.
    _ = await store.billingPortal(flow: nil, tier: nil)
    XCTAssertEqual(box.sent("server:billing/portal"), [:])

    await store.settleAfterCardPage(paymentFailed: true)
    XCTAssertEqual(box.all("server:billing/settle").count, 1)
    await store.settleAfterCardPage(paymentFailed: false)
    XCTAssertEqual(box.all("server:billing/settle").count, 1, "nothing to charge when no payment failed")
  }

  func testTheServersSentenceForSpentCreditsIsRecognised() throws {
    let card = try XCTUnwrap(Tray(["id": "t1", "kind": "error", "agentId": "a", "title": "Agent failed to respond", "detail": "Your trial credits are used up (code 40200). Choose a plan at https://app.simeonlabs.com/billing?from=app to keep going."]))
    XCTAssertTrue(PhoneUpgrade.isOutOfCredits(card))
    let other = try XCTUnwrap(Tray(["id": "t2", "kind": "error", "agentId": "a", "title": "Agent failed to respond", "detail": "Hourly spending budget reached (code 40201)."]))
    XCTAssertFalse(PhoneUpgrade.isOutOfCredits(other), "the hourly brake is not a plan matter")
  }

  /** Near the limit (13 October 2026): a quiet line at 80% and again at 95%, never with the spent banner, closed per step and period. */
  func testTheLineNearTheLimit() throws {
    let reset = now.addingTimeInterval(3 * 86_400)
    let resetIso = ISO8601DateFormatter().string(from: reset)
    func week(_ used: Int) -> UsageSummary {
      usage(["subscriptionStatus": "active", "tier": "standard", "creditsLimit": 1_000, "creditsUsed": .number(Double(used)), "creditsRemaining": .number(Double(1_000 - used)), "periodEnd": .string(resetIso)])
    }
    let utc = TimeZone(identifier: "UTC")!
    XCTAssertNil(PhoneUpgrade.approaching(access: granted, usage: week(500), now: now, timeZone: utc))
    let at80 = try XCTUnwrap(PhoneUpgrade.approaching(access: granted, usage: week(812), now: now, timeZone: utc))
    XCTAssertEqual(at80.words.title, "You’re approaching your usage limit")
    XCTAssertEqual(at80.words.body, "You’ve used 81% of this week’s credits. They reset \(PhoneUpgrade.day(reset, now: now, timeZone: utc)).")
    XCTAssertTrue(at80.words.body.contains("They reset on "))
    XCTAssertEqual(at80.words.action, "Upgrade")
    XCTAssertEqual(at80.step, 80)
    let at95 = try XCTUnwrap(PhoneUpgrade.approaching(access: granted, usage: week(960), now: now, timeZone: utc))
    XCTAssertEqual(at95.step, 95)
    XCTAssertNotEqual(at80.key, at95.key)
    // Spent: the banner says so, not this line.
    XCTAssertNil(PhoneUpgrade.approaching(access: granted, usage: week(1_000), now: now, timeZone: utc))
    XCTAssertNil(PhoneUpgrade.approaching(access: paymentRequired, usage: week(900), now: now, timeZone: utc))
    // The free month: its own words, no reset.
    let trial = usage(["subscriptionStatus": "trialing", "creditsLimit": 1_000, "creditsUsed": 900, "creditsRemaining": 100])
    XCTAssertEqual(PhoneUpgrade.approaching(access: granted, usage: trial, now: now, timeZone: utc)?.words.body, "You’ve used 90% of your free credits.")
    // Where the button goes nowhere, only the words.
    XCTAssertNil(PhoneUpgrade.withoutUpgrade(at80.words).action)
    XCTAssertEqual(PhoneUpgrade.withoutUpgrade(at80.words).body, at80.words.body)
    // Closed at 80%, it comes back at 95%.
    let kept = ApproachingClosed.adding(at80.key, to: "")
    XCTAssertTrue(ApproachingClosed.contains(at80.key, in: kept))
    XCTAssertFalse(ApproachingClosed.contains(at95.key, in: kept))
    XCTAssertEqual(PhoneUpgrade.day(now.addingTimeInterval(3_600), now: now, timeZone: utc) == "today" || PhoneUpgrade.day(now.addingTimeInterval(3_600), now: now, timeZone: utc) == "tomorrow", true)
  }
}
