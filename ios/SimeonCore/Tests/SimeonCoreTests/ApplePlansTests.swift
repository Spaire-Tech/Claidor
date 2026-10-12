import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/** In-app purchase's shared parts (12 October 2026): the plans the server names, the US-only web link, who bills the plan, the account's id, and what the server says when it refuses. */
final class ApplePlansTests: XCTestCase {
  private let products: JSON = [
    "products": [
      ["productId": "com.simeonlabs.simeon.standard.monthly", "tier": "standard", "interval": "month", "name": "Standard", "weeklyCredits": 3_750_000],
      ["productId": "com.simeonlabs.simeon.standard.yearly", "tier": "standard", "interval": "year", "name": "Standard", "weeklyCredits": 3_750_000],
      ["productId": "com.simeonlabs.simeon.pro.monthly", "tier": "pro", "interval": "month", "name": "Pro", "weeklyCredits": 12_500_000],
      ["productId": "com.simeonlabs.simeon.pro.yearly", "tier": "pro", "interval": "year", "name": "Pro", "weeklyCredits": 12_500_000],
      ["productId": "bad", "tier": "pro", "interval": "week"],
    ],
    "webSubscribeUrl": "https://app.simeonlabs.com/billing?from=app",
  ]

  func testThePlansAreTheServersInItsOrder() {
    let plans = ApplePlans(json: products)
    XCTAssertEqual(plans.productIds.count, 4, "an interval that is not monthly or yearly is dropped")
    XCTAssertEqual(plans.plans(yearly: false).map(\.tier), ["standard", "pro"])
    XCTAssertEqual(plans.plan(tier: "pro", yearly: true)?.productId, "com.simeonlabs.simeon.pro.yearly")
    XCTAssertNil(plans.plan(tier: "max", yearly: false))
    XCTAssertEqual(plans.webSubscribeURL?.absoluteString, "https://app.simeonlabs.com/billing?from=app")
    XCTAssertNil(ApplePlans(json: ["products": [], "webSubscribeUrl": "http://insecure.example"]).webSubscribeURL)
  }

  func testTheWebLinkIsOfferedInTheUnitedStatesOnly() {
    XCTAssertTrue(ApplePlans.webLinkAllowed(storefrontCountry: "USA"))
    XCTAssertTrue(ApplePlans.webLinkAllowed(storefrontCountry: "usa"))
    for other in ["GBR", "FRA", "CAN", "US", nil] as [String?] {
      XCTAssertFalse(ApplePlans.webLinkAllowed(storefrontCountry: other), "\(other ?? "nil")")
    }
  }

  func testTheSheetSaysPricePeriodRenewalAndHowToCancel() {
    XCTAssertEqual(PlansCopy.price("$20.00"), "$20.00 per month")
    XCTAssertEqual(PlansCopy.price("$192.00", yearly: true), "$192.00 per year")
    XCTAssertTrue(PlansCopy.renewal.contains("Auto-renews monthly"))
    XCTAssertTrue(PlansCopy.renewal.contains("until you cancel in Settings"))
    XCTAssertFalse(PlansCopy.renewal.contains("Free"), "no free week: the free month starts at sign-in")
  }

  func testTheQuotaSaysWhoBillsThePlan() {
    XCTAssertTrue(UsageSummary(quota: ["subscriptionStatus": "active", "tier": "pro", "billedBy": "apple"]).billedByApple)
    XCTAssertFalse(UsageSummary(quota: ["subscriptionStatus": "active", "tier": "pro", "billedBy": "stripe"]).billedByApple)
    XCTAssertFalse(UsageSummary(quota: ["subscriptionStatus": "none"]).billedByApple)
  }

  func testTheAccountKeepsItsIdForThePurchaseTag() {
    let id = "8a1f6a5e-3b7f-4d2c-9a7e-2f0c9a1b2c3d"
    XCTAssertEqual(Account(profile: ["id": .string(id), "email": "a@b.co"])?.id, id)
    XCTAssertNil(Account(profile: ["email": "a@b.co"])?.id)
  }

  func testARefusalInTheAppsEnvelopeSaysTheServersSentence() async {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 409, body: json(#"{"code":409,"message":"Your plan is billed through Apple. Change or cancel it on your iPhone in Settings › your name › Subscriptions."}"#)) }])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    do {
      _ = try await api.data("billing/portal", json: [:])
      XCTFail("refused")
    } catch {
      XCTAssertTrue(error.localizedDescription.hasPrefix("Your plan is billed through Apple."))
    }
  }

  func testDeletingAnAccountSaysWhenAnApplePlanRunsOn() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([{ _ in HTTPAnswer(status: 200, body: json(#"{"deleted":true,"appleSubscription":true,"incomplete":[]}"#)) }])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http)
    let appleRunsOn = try await api.deleteAccount()
    XCTAssertTrue(appleRunsOn)
    XCTAssertNil(vault.read())
  }
}
