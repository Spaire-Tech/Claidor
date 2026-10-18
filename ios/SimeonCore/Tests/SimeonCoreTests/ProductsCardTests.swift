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

  func testTheOpenedProductReadsAsAStorePage() throws {
    let message: JSON = ["type": "products", "content": "Element 24\" · $99.99", "products": [
      ["title": "Element 24\" 1080P FHD IPS Display Computer Monitor", "url": "https://officedepot.com/a/element-24", "domain": "officedepot.com", "price": "$99.99", "listPrice": "$119.99", "seller": "Office Depot", "rating": 4.46, "reviewCount": 153, "description": "A reliable choice. It has a **100Hz refresh rate**."],
      ["title": "Element 27\" 1080P", "url": "https://element.com/27", "price": "$123.84", "listPrice": "$123.84", "seller": "Element", "reviewCount": 12],
      ["title": "Element 24\" 100Hz", "url": "https://element.com/24", "price": "$100.26", "rating": 4, "reviewCount": 0],
    ]]
    let raw: JSON = ["id": "t9s1", "kind": "send-message", "timestampMs": 1, "message": message]
    guard case .products(_, let card) = try XCTUnwrap(Chat.row(for: Entry(raw)!)) else { return XCTFail("not a products card") }
    let monitor = card.products[0]
    XCTAssertEqual(monitor.soldBy, "Sold by: Office Depot")
    XCTAssertEqual(monitor.listPrice, "$119.99")
    XCTAssertEqual(monitor.ratingText, "4.5")
    XCTAssertEqual(monitor.reviewsText, "(153)")
    XCTAssertEqual(monitor.stars, [.full, .full, .full, .full, .half])
    XCTAssertEqual(monitor.detail, "A reliable choice. It has a **100Hz refresh rate**.", "the bold stays for the page to draw")
    XCTAssertNil(card.products[1].listPrice, "no struck price equal to the price")
    XCTAssertNil(card.products[1].rating)
    XCTAssertNil(card.products[1].reviewsText, "no review count without stars")
    XCTAssertEqual(card.products[1].soldBy, "Sold by: Element")
    XCTAssertEqual(card.products[2].ratingText, "4.0")
    XCTAssertNil(card.products[2].reviewsText)
    XCTAssertEqual(card.products[2].stars, [.full, .full, .full, .full, .empty])
    XCTAssertEqual(ProductsCard.Product(index: 0, title: "x", url: URL(string: "https://a.com")!, domain: "a.com", rating: 4.2).stars, [.full, .full, .full, .full, .empty])
    XCTAssertEqual(ProductsCard.Product(index: 0, title: "x", url: URL(string: "https://a.com")!, domain: "a.com", rating: 0.7).stars, [.half, .empty, .empty, .empty, .empty])
    XCTAssertEqual(card.others(than: monitor).map(\.index), [1, 2], "More like this: the card's other products")
    XCTAssertEqual(ProductsCard.moreLikeThis, "More like this")
    XCTAssertEqual(ProductsCard.reviews, "Reviews")
    XCTAssertEqual(ProductsCard.seeMore, "See more")
  }

  func testBuyShowsAtOnceAndTheComputersCopyWins() throws {
    let card = try card()
    XCTAssertEqual(card.shown(pressed: 0).buying, 0, "Buy shows at once")
    XCTAssertEqual(card.shown(pressed: 9), card, "only a product on the card")
    XCTAssertEqual(try self.card(["productsBuying": 1]).buying, 1)
  }

  func testBuyingIsBlueUntilTheComputerSaysBought() throws {
    let buying = try card(["productsBuying": 1])
    XCTAssertEqual(buying.status(of: buying.products[1]), .buying)
    XCTAssertNil(buying.status(of: buying.products[0]))
    XCTAssertEqual(ProductsCard.Status.buying.label, "Buying")
    let bought = try card(["productsBought": [1]])
    XCTAssertEqual(bought.bought, [1])
    XCTAssertNil(bought.buying)
    XCTAssertEqual(bought.status(of: bought.products[1]), .bought)
    XCTAssertEqual(ProductsCard.Status.bought.label, "Bought")
    XCTAssertEqual(bought.shown(pressed: 1), bought, "a bought product isn't bought again")
    XCTAssertEqual(bought.shown(pressed: 0).status(of: bought.products[0]), .buying, "another one still can be")
    XCTAssertEqual(bought.shown(pressed: 0).bought, [1])
    XCTAssertNil(try card(["productsBuying": 1, "productsBought": [1]]).buying, "Bought wins")
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
    for _ in 0..<400 where shown("x12o")?.bought.contains(1) != true { try await Task.sleep(nanoseconds: 5_000_000) }
    XCTAssertEqual(shown("x12o")?.bought, [1], "the demo's purchase was ordered")
    XCTAssertNil(shown("x12o")?.buying)
    XCTAssertNil(store.pressedProducts["x12o"], "the computer's own copy took over")
  }
}
