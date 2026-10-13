import Foundation
import XCTest
@testable import SimeonCore

/** The checkout card (13 October 2026): what it reads from the entry, its words, and Allow and Deny. */
final class PurchaseCardTests: XCTestCase {
  private static let message: JSON = ["type": "purchase", "content": "Checkout at ncvss.com · $80.00", "purchase": [
    "merchant": "NCVSS", "domain": "ncvss.com", "url": "https://ncvss.com/checkout/abc", "amount": 8000, "currency": "usd", "total": "$80.00",
    "items": [["name": "Linen shirt, white", "quantity": 2, "description": "Size M"]],
    "card": ["brand": "Visa", "last4": "1234"],
    "preview": ["url": "file:///home/box/sand-data/agents/a1/assets/abc.jpg", "width": 1280, "height": 800],
    "test": false,
  ]]

  private func entry(_ fields: [String: JSON] = [:], message: JSON = PurchaseCardTests.message) -> Entry {
    var raw: JSON = ["id": "t3s1", "kind": "send-message", "timestampMs": 1, "message": message]
    for (key, value) in fields { raw = raw.setting(key, value) }
    return Entry(raw)!
  }

  private func card(_ fields: [String: JSON] = [:]) throws -> PurchaseCard {
    guard case .purchase(let id, let card) = try XCTUnwrap(Chat.row(for: entry(fields))) else { XCTFail("not a checkout card"); throw CancellationError() }
    XCTAssertEqual(id, "t3s1")
    return card
  }

  func testTheCardReadsWhatIsBoughtAndWhoPays() throws {
    let card = try card()
    XCTAssertEqual(card.merchant, "NCVSS")
    XCTAssertEqual(card.domain, "ncvss.com")
    XCTAssertEqual(card.url?.absoluteString, "https://ncvss.com/checkout/abc")
    XCTAssertEqual(card.total, "$80.00")
    XCTAssertEqual(card.cardLine, "Visa •••• 1234")
    XCTAssertEqual(card.itemsLine, "Linen shirt, white ×2")
    XCTAssertEqual(card.preview?.url, "file:///home/box/sand-data/agents/a1/assets/abc.jpg")
    XCTAssertEqual(card.preview?.aspect ?? 0, 1.6, accuracy: 0.001)
    XCTAssertEqual(card.state, .review)
    XCTAssertTrue(card.waitsOnPerson)
    XCTAssertNil(card.status)
    XCTAssertEqual(PurchaseCard.headline(agent: "Ada", domain: card.domain), "Ada wants to place an order at ncvss.com")
    XCTAssertEqual(card.listLine, "Checkout at ncvss.com · $80.00")
    XCTAssertEqual(Chat.cardText(Self.message), "Checkout at ncvss.com · $80.00", "a quote or a thread's name")
  }

  func testEachStateSaysWhereItStands() throws {
    let approving = try card(["purchaseState": "approving", "purchaseActionUrl": "https://app.link.com/activity/approve/lsrq_1"])
    XCTAssertEqual(approving.status?.label, "Approve it in the Link app")
    XCTAssertEqual(approving.detail, "Link sent it to your Link app. It waits 30 minutes.")
    XCTAssertEqual(approving.actionURL?.absoluteString, "https://app.link.com/activity/approve/lsrq_1")
    XCTAssertFalse(approving.waitsOnPerson)

    let ordered = try card(["purchaseState": "ordered", "purchaseOrder": "1042", "purchaseNote": "Arrives Thu, Oct 18"])
    XCTAssertEqual(ordered.status?.label, "Ordered")
    XCTAssertEqual(ordered.detail, "Order #1042 · Arrives Thu, Oct 18")

    let failed = try card(["purchaseState": "failed", "purchaseNote": "Amount exceeds your daily limit."])
    XCTAssertEqual(failed.status?.label, "Didn't go through")
    XCTAssertEqual(failed.detail, "Amount exceeds your daily limit.")
    XCTAssertEqual(try card(["purchaseState": "denied"]).detail, "Nothing was paid.")
    XCTAssertEqual(try card(["purchaseState": "expired"]).status?.label, "Expired")
    // Only Link's own pages open from the card: no plain http, no other scheme.
    XCTAssertNil(try card(["purchaseState": "approving", "purchaseActionUrl": "javascript:alert(1)"]).actionURL)
    // An answer shows at once, and only on a card that still waited.
    XCTAssertEqual(try card().shown(answered: .sending).state, .sending)
    XCTAssertEqual(ordered.shown(answered: .denied).state, .ordered)
  }

  func testACardWithoutItsFactsIsSaidInWords() throws {
    let broken: JSON = ["type": "purchase", "content": "Checkout at ncvss.com · $80.00", "purchase": ["merchant": "NCVSS"]]
    guard case .notice(_, let text) = try XCTUnwrap(Chat.row(for: entry(message: broken))) else { return XCTFail("a notice") }
    XCTAssertEqual(text, "Checkout at ncvss.com · $80.00")
  }

  @MainActor
  func testDenyAndAllowGoToTheComputer() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(gallery: true), pace: 0.01, call: nil))
    await store.open("cards")
    func shown(_ id: String) -> PurchaseCard? {
      for row in store.rows(for: "cards") { if case .purchase(let rowId, let card) = row, rowId == id { return card.shown(answered: store.answeredPurchases[id]) } }
      return nil
    }
    XCTAssertEqual(shown("x12p")?.state, .review)
    XCTAssertEqual(shown("x12q")?.state, .ordered)
    await store.answerPurchase("x12p", allow: true, in: "cards")
    for _ in 0..<200 where shown("x12p")?.state != .ordered { try await Task.sleep(nanoseconds: 5_000_000) }
    XCTAssertEqual(shown("x12p")?.state, .ordered, "Link asked, approved, the order placed (the demo's box)")
    XCTAssertNil(store.answeredPurchases["x12p"], "the computer's own copy took over")
  }
}
