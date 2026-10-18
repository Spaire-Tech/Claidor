import Foundation

/**
 * The products card (14 October 2026, the host's
 * `shared/node/link-wallet/product-card.ts`): what an agent found to buy,
 * before any checkout, each with its picture, name, seller and price as the
 * shop shows them. The person opens one and presses "Buy with <agent>" (the
 * agent is woken to buy exactly that one, through the checkout card) or
 * "View website". As Muse shows a product before buying it.
 *
 * The message (`send-message` of type `products`) carries the products; the
 * entry carries which one the person pressed Buy on while it is being bought
 * (`productsBuying`) and those bought (`productsBought`, set by the computer
 * once that purchase is ordered; 18 October 2026, the founder: "make it blue,
 * and on the right, like the take over computer card. then bought … in
 * green").
 *
 * Opened, a product is a store's page (18 October 2026, the founder after
 * Muse: "inside i want it to be like this. like a store"): its picture
 * large, "Sold by", its name, Buy in a light blue capsule and View website,
 * what it is with See more, its stars under Reviews, and the card's other
 * products under More like this.
 */
public struct ProductsCard: Hashable, Sendable {
  public struct Product: Hashable, Sendable, Identifiable {
    /** Its place on the card: what Buy sends back. */
    public let index: Int
    public var id: Int { index }
    public let title: String
    /** The product's own page on the shop. */
    public let url: URL
    /** "gumroad.com" */
    public let domain: String
    /** "$2.23", as the shop writes it. */
    public let price: String?
    public let seller: String?
    public let imageURL: URL?
    /** What it is, in a few sentences; `**bold**` marks the key facts. */
    public let detail: String?
    /** The price before a sale, struck through after the price: "$119.99". */
    public let listPrice: String?
    /** Stars out of five: 4.5. */
    public let rating: Double?
    /** How many reviews the stars are from: 153. */
    public let reviewCount: Int?

    public init(index: Int, title: String, url: URL, domain: String, price: String? = nil, seller: String? = nil, imageURL: URL? = nil, detail: String? = nil, listPrice: String? = nil, rating: Double? = nil, reviewCount: Int? = nil) {
      self.index = index; self.title = title; self.url = url; self.domain = domain
      self.price = price; self.seller = seller; self.imageURL = imageURL; self.detail = detail
      self.listPrice = listPrice.flatMap { $0 == price ? nil : $0 }
      self.rating = rating.flatMap { $0 > 0 && $0 <= 5 ? $0 : nil }
      self.reviewCount = self.rating == nil ? nil : reviewCount.flatMap { $0 > 0 ? $0 : nil }
    }

    /** The line under the name: the seller, else the shop. */
    public var byline: String { seller ?? domain }

    // MARK: The opened product's page, in a store's layout

    /** "Sold by: Office Depot", over the name. */
    public var soldBy: String { "Sold by: \(byline)" }

    /** "4.5" (or "4.0"), by the stars. */
    public var ratingText: String? { rating.map { String(format: "%.1f", $0) } }

    /** "(153)", after the rating. */
    public var reviewsText: String? { reviewCount.map { "(\($0))" } }

    /** The five stars, to the nearest half: 4.5 is four full and a half. */
    public var stars: [Star] {
      guard let rating else { return [] }
      let halves = Int((rating * 2).rounded())
      return (0..<5).map { place in halves >= (place + 1) * 2 ? .full : halves == place * 2 + 1 ? .half : .empty }
    }

    public enum Star: Hashable, Sendable { case full, half, empty }
  }

  public let products: [Product]
  /** The product the person pressed Buy on, while it is being bought. */
  public let buying: Int?
  /** The products bought from this card. */
  public let bought: Set<Int>

  public init(products: [Product], buying: Int? = nil, bought: Set<Int> = []) {
    self.products = products; self.buying = buying; self.bought = bought
  }

  init?(message: JSON, entry: Entry) {
    let text = { (value: JSON?) -> String in value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let rows = message["products"]?.array ?? []
    let products: [Product] = rows.enumerated().compactMap { index, row in
      let title = text(row["title"])
      guard !title.isEmpty, let url = URL(string: text(row["url"])), url.scheme == "https" else { return nil }
      let domain = text(row["domain"]).isEmpty ? (url.host ?? "") : text(row["domain"])
      let image = URL(string: text(row["imageUrl"])).flatMap { $0.scheme == "https" ? $0 : nil }
      let price = text(row["price"]), seller = text(row["seller"]), detail = text(row["description"]), listPrice = text(row["listPrice"])
      return Product(index: index, title: title, url: url, domain: domain, price: price.isEmpty ? nil : price, seller: seller.isEmpty ? nil : seller, imageURL: image, detail: detail.isEmpty ? nil : detail, listPrice: listPrice.isEmpty ? nil : listPrice, rating: row["rating"]?.double, reviewCount: row["reviewCount"]?.int)
    }
    guard !products.isEmpty else { return nil }
    self.products = products
    let bought = Set((entry["productsBought"]?.array ?? []).compactMap { $0.int })
    let buying = entry["productsBuying"]?.int
    self.bought = bought
    self.buying = buying.flatMap { bought.contains($0) ? nil : $0 }
  }

  /** The card as the person sees it now: their own Buy shows at once, before the computer echoes it. */
  public func shown(pressed: Int?) -> ProductsCard {
    guard let pressed, buying != pressed, !bought.contains(pressed), products.contains(where: { $0.index == pressed }) else { return self }
    return ProductsCard(products: products, buying: pressed, bought: bought)
  }

  /** "More like this" under an opened product: the card's other products, in the card's order. */
  public func others(than product: Product) -> [Product] {
    products.filter { $0.index != product.index }
  }

  /** Where one product is: being bought, bought, or neither. */
  public func status(of product: Product) -> Status? {
    if bought.contains(product.index) { return .bought }
    return buying == product.index ? .buying : nil
  }

  /** A product's pill on the right of its row: blue while it is being bought, green once it is (as the computer card's ending). */
  public enum Status: Hashable, Sendable {
    case buying, bought

    public var label: String {
      switch self {
      case .buying: return ProductsCard.buyingLabel
      case .bought: return ProductsCard.boughtLabel
      }
    }
  }

  // MARK: Words

  /** "Buy with Ada" */
  public static func buyLabel(agent: String) -> String {
    let who = agent.trimmingCharacters(in: .whitespacesAndNewlines)
    return who.isEmpty ? "Buy" : "Buy with \(who)"
  }

  public static let viewWebsite = "View website"
  public static let seeMore = "See more"
  public static let seeLess = "See less"
  public static let reviews = "Reviews"
  public static let moreLikeThis = "More like this"
  public static let buyingLabel = "Buying"
  public static let boughtLabel = "Bought"
}
