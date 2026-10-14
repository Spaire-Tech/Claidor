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

  /** The founder's six Link cards (14 October 2026): picked on the card with each one's mark and name, never in a typed question. */
  func testThePersonPicksTheCardOnTheCard() throws {
    let cards: JSON = [["id": "csmrpd_chime", "brand": "Visa", "last4": "0995", "name": "Chime Credit Builder"], ["id": "csmrpd_mc", "brand": "Mastercard", "last4": "1005", "name": "Mastercard Debit"], ["id": "csmrpd_rh", "brand": "Visa", "last4": "2862", "name": "Robinhood Cash"]]
    let none = Self.message.setting("purchase", Self.message["purchase"]!.setting("card", nil).setting("cards", cards).setting("icon", ["url": "file:///home/box/sand-data/agents/a1/assets/icon.png"]))
    guard case .purchase(_, let open) = try XCTUnwrap(Chat.row(for: entry(message: none))) else { return XCTFail("not a checkout card") }
    XCTAssertNil(open.cardLine)
    XCTAssertTrue(open.needsCard, "Allow waits for a pick")
    XCTAssertTrue(open.canChooseCard)
    XCTAssertEqual(open.cards.map(\.line), ["Chime Credit Builder •••• 0995", "Mastercard Debit •••• 1005", "Robinhood Cash •••• 2862"])
    XCTAssertEqual(open.icon?.url, "file:///home/box/sand-data/agents/a1/assets/icon.png", "the shop's icon for Review order")

    // Picked here: shown at once, and no longer waiting for a pick.
    let picked = open.shown(answered: nil, picked: "csmrpd_mc")
    XCTAssertEqual(picked.cardLine, "Mastercard Debit •••• 1005")
    XCTAssertEqual(picked.cardBrand, "Mastercard")
    XCTAssertEqual(picked.cardId, "csmrpd_mc")
    XCTAssertFalse(picked.needsCard)
    XCTAssertEqual(open.shown(answered: nil, picked: "not-offered"), open, "only a card the card offered")

    // Taken by the computer: its stamp wins on every device.
    guard case .purchase(_, let taken) = try XCTUnwrap(Chat.row(for: entry(["purchaseState": "approving", "purchasePaymentMethodId": "csmrpd_rh", "purchaseCard": ["brand": "Visa", "last4": "2862", "name": "Robinhood Cash"]], message: none))) else { return XCTFail() }
    XCTAssertEqual(taken.cardLine, "Robinhood Cash •••• 2862")
    XCTAssertEqual(taken.cardId, "csmrpd_rh")
    XCTAssertFalse(taken.canChooseCard, "no switching once allowed")

    // Link refused the pick: the card still waits, with its line.
    guard case .purchase(_, let refused) = try XCTUnwrap(Chat.row(for: entry(["purchaseNote": "Link won't let an agent pay with the Chime Credit Builder ending 0995. Choose another card."], message: none))) else { return XCTFail() }
    XCTAssertTrue(refused.waitsOnPerson)
    XCTAssertEqual(refused.reviewNote, "Link won't let an agent pay with the Chime Credit Builder ending 0995. Choose another card.")
    XCTAssertNil(refused.shown(answered: nil, picked: "csmrpd_mc").reviewNote, "a new pick clears it")

    // A name that already says the last four, and no name at all.
    XCTAssertEqual(PurchaseCard.Choice(id: "a", brand: "Visa", last4: "4242", name: "Visa 4242").line, "Visa 4242")
    XCTAssertEqual(PurchaseCard.Choice(id: "b", brand: "Amex", last4: "0005").line, "Amex •••• 0005")
  }

  func testEachStateSaysWhereItStands() throws {
    let approving = try card(["purchaseState": "approving", "purchaseActionUrl": "https://app.link.com/activity/approve/lsrq_1"])
    XCTAssertEqual(approving.status?.label, "Approve it in the Link app")
    XCTAssertEqual(approving.detail, PurchaseCard.approvingDetail)
    XCTAssertTrue(approving.detail?.contains("Get it and sign in once") == true, "says the Link app is needed, before Link's own page does")
    XCTAssertEqual(PurchaseCard.linkAppURL.absoluteString, "https://link.com/download")
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

  /** Allow confirmed on the device (14 October 2026): who, when and how, for Link to take as the approval. */
  @MainActor
  func testAllowCarriesTheApprovalGivenInSimeon() async throws {
    let card = try card()
    XCTAssertEqual(PurchaseApproval.reason(for: card), "Approve $80.00 at ncvss.com")
    let store = AppStore()
    let faceID = PurchaseApproval.Confirmed(method: "biometric_face", deviceType: "mobile")
    XCTAssertNil(store.purchaseApproval(faceID), "nobody signed in: Link asks in its app")
    // An account known by its e-mail only (remembered from an older launch): it still approves, as that e-mail.
    store.account = Account(name: "Bass Fall", email: "bass@simeonlabs.com")
    XCTAssertEqual(store.purchaseApproval(faceID)?.userId, "bass@simeonlabs.com")
    store.account = Account(name: "Bass Fall", email: "bass@simeonlabs.com", id: "8a6b0b0e-user")
    let at = Date(timeIntervalSince1970: 1_760_430_000)
    let approval = try XCTUnwrap(store.purchaseApproval(faceID, at: at))
    XCTAssertEqual(approval.json, ["approvedAt": 1_760_430_000, "userId": "8a6b0b0e-user", "authenticationMethod": "biometric_face", "deviceType": "mobile", "userName": "Bass Fall"])
    let passcode = try XCTUnwrap(store.purchaseApproval(PurchaseApproval.Confirmed(method: nil, deviceType: nil), at: at))
    XCTAssertEqual(passcode.json, ["approvedAt": 1_760_430_000, "userId": "8a6b0b0e-user", "userName": "Bass Fall"], "a passcode or a Mac: no how, no device")

    // The demo's computer, as Link taking it: approved at once, no Link app step, then ordered.
    await store.attach(DemoBackend(seed: DemoData.seed(gallery: true), pace: 0.01, call: nil))
    store.account = Account(name: "Bass Fall", email: "bass@simeonlabs.com", id: "8a6b0b0e-user")
    await store.open("cards")
    func shown(_ id: String) -> PurchaseCard? {
      for row in store.rows(for: "cards") { if case .purchase(let rowId, let card) = row, rowId == id { return card.shown(answered: store.answeredPurchases[id]) } }
      return nil
    }
    await store.answerPurchase("x12p", allow: true, confirmed: faceID, in: "cards")
    var states: [PurchaseCard.State] = []
    for _ in 0..<400 where shown("x12p")?.state != .ordered {
      if let state = shown("x12p")?.state, states.last != state { states.append(state) }
      try await Task.sleep(nanoseconds: 5_000_000)
    }
    XCTAssertEqual(shown("x12p")?.order, "1044", "the approval in Simeon path")
    XCTAssertFalse(states.contains(.approving), "never waits on the Link app")
  }

  /** A name saved in the app keeps who the account is (its id dropped, Allow went out without the approval, 14 October 2026). */
  @MainActor
  func testSavingANameKeepsTheAccountsId() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(gallery: true), pace: 0.01, call: nil))
    store.account = Account(name: "Bass Fall", email: "bass@simeonlabs.com", id: "8a6b0b0e-user")
    await store.saveName("Bass")
    XCTAssertEqual(store.account?.name, "Bass")
    XCTAssertEqual(store.account?.id, "8a6b0b0e-user")
    _ = await store.saveNameReporting("Bassirou")
    XCTAssertEqual(store.account?.id, "8a6b0b0e-user")
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
    XCTAssertEqual(shown("x12p")?.cardLine, "Visa Signature •••• 1234")
    // Another of the person's cards, picked on the card: it rides with Allow.
    store.pickPurchaseCard("x12p", cardId: "csmrpd_demo_mc")
    await store.answerPurchase("x12p", allow: true, in: "cards")
    for _ in 0..<200 where shown("x12p")?.state != .ordered { try await Task.sleep(nanoseconds: 5_000_000) }
    XCTAssertEqual(shown("x12p")?.state, .ordered, "Link asked, approved, the order placed (the demo's box)")
    XCTAssertEqual(shown("x12p")?.cardLine, "Mastercard Debit •••• 1005", "the card picked paid")
    XCTAssertNil(store.answeredPurchases["x12p"], "the computer's own copy took over")
  }
}
