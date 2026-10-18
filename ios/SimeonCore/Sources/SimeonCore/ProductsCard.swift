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
    public let detail: String?

    public init(index: Int, title: String, url: URL, domain: String, price: String? = nil, seller: String? = nil, imageURL: URL? = nil, detail: String? = nil) {
      self.index = index; self.title = title; self.url = url; self.domain = domain
      self.price = price; self.seller = seller; self.imageURL = imageURL; self.detail = detail
    }

    /** The line under the name: the seller, else the shop. */
    public var byline: String { seller ?? domain }
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
      let price = text(row["price"]), seller = text(row["seller"]), detail = text(row["description"])
      return Product(index: index, title: title, url: url, domain: domain, price: price.isEmpty ? nil : price, seller: seller.isEmpty ? nil : seller, imageURL: image, detail: detail.isEmpty ? nil : detail)
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
  public static let buyingLabel = "Buying"
  public static let boughtLabel = "Bought"
}
