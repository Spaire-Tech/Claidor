import Foundation
import XCTest
@testable import SimeonCore

/** The products card (14 October 2026): what the agent found to buy, each with Buy and View at its store, as Muse shows it; the agent's comparison on it (10 November 2026). */
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
    XCTAssertEqual(card.replies, [], "a card from before replies has none")
    XCTAssertNil(book.badge)
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
    XCTAssertEqual(monitor.byline, "Office Depot", "Sold by's value")
    XCTAssertEqual(monitor.listPrice, "$119.99")
    XCTAssertEqual(monitor.ratingText, "4.5")
    XCTAssertEqual(monitor.reviewsText, "(153)")
    XCTAssertEqual(monitor.ratingLine, "★ 4.5 (153)", "one star, no row of five")
    XCTAssertEqual(monitor.detail, "A reliable choice. It has a **100Hz refresh rate**.")
    XCTAssertNil(monitor.take)
    XCTAssertEqual(monitor.shownTake, "A reliable choice", "a card from before takes: its description's first sentence")
    XCTAssertEqual(monitor.priceLine, "$99.99 · A reliable choice")
    XCTAssertEqual(monitor.reasons, [], "no Why it fits")
    XCTAssertEqual(monitor.storeName, "officedepot.com", "the site, when the agent named no store")
    XCTAssertEqual(monitor.viewAt, "View at officedepot.com")
    XCTAssertNil(card.products[1].listPrice, "no struck price equal to the price")
    XCTAssertNil(card.products[1].rating)
    XCTAssertNil(card.products[1].ratingLine, "no review count without stars")
    XCTAssertEqual(card.products[1].priceLine, "$123.84")
    XCTAssertEqual(card.products[2].ratingLine, "★ 4.0")
    XCTAssertEqual(card.neighbour(of: monitor, by: 1)?.index, 1, "› goes to the next")
    XCTAssertNil(card.neighbour(of: monitor, by: -1), "‹ stops at the first")
    XCTAssertEqual(card.neighbour(of: card.products[2], by: -1)?.index, 1)
    XCTAssertNil(card.neighbour(of: card.products[2], by: 1), "› stops at the last")
    XCTAssertEqual(ProductsCard.whyItFits, "Why it fits")
    XCTAssertEqual(ProductsCard.soldBy, "Sold by")
  }

  func testTheAgentsComparisonOnTheCard() throws {
    let message: JSON = ["type": "products", "content": "Possibly Pink · CA$62.00; Love Blossoms · CA$53.00", "replies": ["Get Possibly Pink", " ", "Get Love Blossoms", "Show me roses", "A fourth"], "products": [
      ["title": "Possibly Pink (Teleflora)", "url": "https://www.canadaflowers.ca/p/pink", "domain": "canadaflowers.ca", "price": "CA$62.00", "store": "Canada Flowers", "take": "Pink, mauve, peach and lavender in a pink vase", "reasons": ["Best-reviewed of the four", ""], "badge": "Top rated", "rating": 5, "reviewCount": 33],
      ["title": "Love Blossoms", "url": "https://www.canadaflowers.ca/p/love", "domain": "canadaflowers.ca", "price": "CA$53.00", "store": "Canada Flowers", "take": "Soft pink and white, cheapest of the four", "reasons": ["Lowest price, still highly rated"], "badge": "Best value", "description": "Ignored. The take wins."],
    ]]
    let raw: JSON = ["id": "t9s2", "kind": "send-message", "timestampMs": 1, "message": message]
    guard case .products(_, let card) = try XCTUnwrap(Chat.row(for: Entry(raw)!)) else { return XCTFail("not a products card") }
    let pink = card.products[0], blossoms = card.products[1]
    XCTAssertEqual(pink.badge, "Top rated")
    XCTAssertNil(blossoms.badge, "one badge on a card: the first")
    XCTAssertEqual(pink.reasons, ["Best-reviewed of the four"], "an empty reason is left out")
    XCTAssertEqual(pink.storeName, "Canada Flowers")
    XCTAssertEqual(pink.viewAt, "View at Canada Flowers")
    XCTAssertEqual(pink.byline, "Canada Flowers", "Sold by: the store when no seller is named")
    XCTAssertEqual(pink.ratingLine, "★ 5.0 (33)")
    XCTAssertEqual(blossoms.priceLine, "CA$53.00 · Soft pink and white, cheapest of the four", "the take wins over the description")
    XCTAssertEqual(card.replies, ["Get Possibly Pink", "Get Love Blossoms", "Show me roses"], "three at most, none empty")
    XCTAssertEqual(card.shownReplies, card.replies)
    XCTAssertEqual(card.shown(pressed: 1).replies, card.replies, "Buy keeps the replies")
    XCTAssertEqual(ProductsCard.firstSentence("It costs $2.23 today! More."), "It costs $2.23 today!")
    XCTAssertEqual(ProductsCard.firstSentence("A **bold** start.\nThen more."), "A bold start")
    XCTAssertEqual(ProductsCard.firstSentence("No full stop"), "No full stop")
    XCTAssertNil(ProductsCard.firstSentence("  "))
  }

  func testRepliesGoOnceThePersonSendsAnythingAfterTheCard() throws {
    let card: JSON = ["type": "products", "content": "Love Blossoms", "replies": ["Get Love Blossoms"], "products": [["title": "Love Blossoms", "url": "https://www.canadaflowers.ca/p/love"]]]
    let entry = { (id: String, at: Double, message: JSON) -> Entry in Entry(["id": .string(id), "kind": "send-message", "timestampMs": .number(at), "message": message])! }
    let said = { (id: String, at: Double, role: String, text: String) -> Entry in Entry(["id": .string(id), "kind": "message", "role": .string(role), "content": .string(text), "timestampMs": .number(at)])! }
    func replies(_ entries: [Entry]) -> [String]? {
      for row in Chat.rows(entries) { if case .products(_, let shown) = row { return shown.shownReplies } }
      return nil
    }
    let products = entry("t1", 1000, card)
    XCTAssertEqual(replies([products]), ["Get Love Blossoms"], "under the card while nothing follows")
    XCTAssertEqual(replies([products, said("a2", 2000, "assistant", "I'd pick Love Blossoms.")]), ["Get Love Blossoms"], "the agent's own line after it keeps them")
    XCTAssertEqual(replies([products, said("u3", 3000, "user", "Get Love Blossoms")]), [], "a reply tapped, or anything the person sends: gone")
    XCTAssertEqual(replies([said("u0", 500, "user", "Find flowers"), products]), ["Get Love Blossoms"], "what came before doesn't count")
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
