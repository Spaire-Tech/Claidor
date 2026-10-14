import Foundation
import XCTest
@testable import SimeonCore

/** The products card (14 October 2026): what the agent found to buy, each with Buy and View website, as Muse shows it. */
final class ProductsCardTests: XCTestCase {
  private static let message: JSON = ["type": "products", "content": "Practice Book \"The Ways Of Water\" · $2.23", "products": [
    ["title": "Practice Book \"The Ways Of Water\": Draw Water Features And Improve Your Skills", "url": "https://daribodrawing.gumroad.com/l/water", "domain": "daribodrawing.gumroad.com", "price": "$2.23", "seller": "Daria Bogdanova", "imageUrl": "https://public-files.gumroad.com/water.png"],
    ["title": "Sketch pack", "url": "https://gumroad.com/l/sketch", "domain": "gumroad.com", "imageUrl": "http://insecure.example/x.png"],
    ["title": "No page", "url": "http://insecure.example/x"],
  ]]

  private func card(_ fields: [String: JSON] = [:]) throws -> ProductsCard {
    var raw: JSON = ["id": "t3s1", "kind": "send-message", "timestampMs": 1, "message": Self.message]
    for (key, value) in fields { raw = raw.setting(key, value) }
    guard case .products(let id, let card) = try XCTUnwrap(Chat.row(for: Entry(raw)!)) else { XCTFail("not a products card"); throw CancellationError() }
    XCTAssertEqual(id, "t3s1")
    return card
  }

  func testTheCardReadsEachProductAsTheShopShowsIt() throws {
    let card = try card()
    XCTAssertEqual(card.products.count, 2, "a product without its own https page is left out")
    let book = card.products[0]
    XCTAssertEqual(book.index, 0)
    XCTAssertEqual(book.price, "$2.23")
    XCTAssertEqual(book.byline, "Daria Bogdanova")
    XCTAssertEqual(book.imageURL?.absoluteString, "https://public-files.gumroad.com/water.png")
    XCTAssertNil(card.products[1].imageURL, "never a plain http picture")
    XCTAssertEqual(card.products[1].byline, "gumroad.com", "the shop when no seller is named")
    XCTAssertNil(card.buying)
    XCTAssertEqual(ProductsCard.buyLabel(agent: "Muse"), "Buy with Muse")
    XCTAssertEqual(ProductsCard.buyLabel(agent: " "), "Buy")
    XCTAssertEqual(Chat.cardText(Self.message), "Practice Book \"The Ways Of Water\" · $2.23")
  }

  func testBuyShowsAtOnceAndTheComputersCopyWins() throws {
    let card = try card()
    XCTAssertEqual(card.shown(pressed: 0).buying, 0, "Buy shows at once")
    XCTAssertEqual(card.shown(pressed: 9), card, "only a product on the card")
    XCTAssertEqual(try self.card(["productsBuying": 1]).buying, 1)
  }

  @MainActor
  func testBuyGoesToTheComputerWithTheProductsPlace() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(gallery: true), pace: 0.01, call: nil))
    await store.open("cards")
    func shown(_ id: String) -> ProductsCard? {
      for row in store.rows(for: "cards") { if case .products(let rowId, let card) = row, rowId == id { return card.shown(pressed: store.pressedProducts[id]) } }
      return nil
    }
    XCTAssertNil(shown("x12o")?.buying)
    await store.buyProduct("x12o", index: 1, in: "cards")
    XCTAssertEqual(shown("x12o")?.buying, 1, "shown at once")
    for _ in 0..<200 where store.pressedProducts["x12o"] != nil { try await Task.sleep(nanoseconds: 5_000_000) }
    XCTAssertEqual(shown("x12o")?.buying, 1)
    XCTAssertNil(store.pressedProducts["x12o"], "the computer's own copy took over")
  }
}
