import Foundation

/**
 * The products card (14 October 2026, the host's
 * `shared/node/link-wallet/product-card.ts`): what an agent found to buy,
 * before any checkout, each with its picture, name, seller and price as the
 * shop shows them. The person opens one and presses "Buy with <agent>" (the
 * agent is woken to buy exactly that one, through the checkout card) or
 * "View at <store>". As Muse shows a product before buying it.
 *
 * The message (`send-message` of type `products`) carries the products; the
 * entry carries which one the person pressed Buy on while it is being bought
 * (`productsBuying`) and those bought (`productsBought`, set by the computer
 * once that purchase is ordered; 18 October 2026, the founder: "make it blue,
 * and on the right, like the take over computer card. then bought … in
 * green").
 *
 * Redrawn as a shop's own cards (10 November 2026, after the founder's
 * reference): each product a tall card of its own, side by side, its picture
 * on white over its name, "price · take" and its store; a badge ("Top
 * rated") on one at most. The agent compares the set: each product's `take`
 * (one line, how it stands against the others) and `reasons` (under "Why it
 * fits" once opened). The card's `replies` are next steps in the person's own
 * words, chips under the row while the person has sent nothing after it
 * (`repliesOpen`); one tapped is sent as their own message. Opened, a product
 * covers the chat (the Mac's and the web's) or the screen (the iPhone's):
 * the picture on white, the store, the title, the price and its stars, the
 * take, "Buy with <agent>", "View at <store>", "Sold by", and "Why it fits";
 * ‹ › go to the card's other products. A card from before the take shows its
 * description's first sentence as the take, and no "Why it fits".
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
    /** What it is, in a few sentences; `**bold**` marks the key facts. Its first sentence is the take of a card from before takes. */
    public let detail: String?
    /** The price before a sale, as the shop shows it struck through: "$119.99". */
    public let listPrice: String?
    /** Stars out of five: 4.5. */
    public let rating: Double?
    /** How many reviews the stars are from: 153. */
    public let reviewCount: Int?
    /** The store as the agent named it: "Canada Flowers". */
    public let store: String?
    /** The agent's own line on it against the others: "Soft pink and white, cheapest of the four". */
    public let take: String?
    /** Why it fits, one to three lines, under "Why it fits" once opened. */
    public let reasons: [String]
    /** "Top rated", on one product of a card at most. */
    public let badge: String?

    public init(index: Int, title: String, url: URL, domain: String, price: String? = nil, seller: String? = nil, imageURL: URL? = nil, detail: String? = nil, listPrice: String? = nil, rating: Double? = nil, reviewCount: Int? = nil, store: String? = nil, take: String? = nil, reasons: [String] = [], badge: String? = nil) {
      self.index = index; self.title = title; self.url = url; self.domain = domain
      self.price = price; self.seller = seller; self.imageURL = imageURL; self.detail = detail
      self.listPrice = listPrice.flatMap { $0 == price ? nil : $0 }
      self.rating = rating.flatMap { $0 > 0 && $0 <= 5 ? $0 : nil }
      self.reviewCount = self.rating == nil ? nil : reviewCount.flatMap { $0 > 0 ? $0 : nil }
      self.store = store; self.take = take; self.reasons = Array(reasons.prefix(3)); self.badge = badge
    }

    /** The store's name: as the agent named it, else its site. */
    public var storeName: String { store ?? domain }

    /** Who sells it, "Sold by"'s value: the seller, else the store. */
    public var byline: String { seller ?? storeName }

    /** The line after the price: the agent's take, else (a card from before takes) its description's first sentence. */
    public var shownTake: String? { take ?? detail.flatMap(ProductsCard.firstSentence) }

    /** "CA$53.00 · Soft pink and white, cheapest of the four", under the name on the card. */
    public var priceLine: String? {
      let parts = [price, shownTake].compactMap { $0 }
      return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /** "View at Canada Flowers", the opened product's plain button. */
    public var viewAt: String { L10n.text("View at \(storeName)") }

    /** "4.5" (or "4.0"), after the star. */
    public var ratingText: String? { rating.map { String(format: "%.1f", locale: L10n.locale(), $0) } }

    /** "(153)", after the rating. */
    public var reviewsText: String? { reviewCount.map { "(\($0))" } }

    /** "★ 5.0 (12)", after the price on the opened product: one star, the rating, the reviews. */
    public var ratingLine: String? {
      guard let rating = ratingText else { return nil }
      return reviewsText.map { "★ \(rating) \($0)" } ?? "★ \(rating)"
    }
  }

  public let products: [Product]
  /** The product the person pressed Buy on, while it is being bought. */
  public let buying: Int?
  /** The products bought from this card. */
  public let bought: Set<Int>
  /** The agent's next steps in the person's words, chips under the card: "Get Love Blossoms", "Show me roses". */
  public let replies: [String]
  /** Whether the person has sent nothing since the card: its replies show only until then (set by the chat's rows). */
  public internal(set) var repliesOpen: Bool

  public init(products: [Product], buying: Int? = nil, bought: Set<Int> = [], replies: [String] = [], repliesOpen: Bool = true) {
    self.products = products; self.buying = buying; self.bought = bought
    self.replies = Array(replies.prefix(3)); self.repliesOpen = repliesOpen
  }

  init?(message: JSON, entry: Entry) {
    let text = { (value: JSON?) -> String in value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let lines = { (value: JSON?) -> [String] in (value?.array ?? []).map(text).filter { !$0.isEmpty } }
    let present = { (words: String) -> String? in words.isEmpty ? nil : words }
    let rows = message["products"]?.array ?? []
    var badged = false
    let products: [Product] = rows.enumerated().compactMap { index, row in
      let title = text(row["title"])
      guard !title.isEmpty, let url = URL(string: text(row["url"])), url.scheme == "https" else { return nil }
      let domain = text(row["domain"]).isEmpty ? (url.host ?? "") : text(row["domain"])
      let image = URL(string: text(row["imageUrl"])).flatMap { $0.scheme == "https" ? $0 : nil }
      // One badge on a card: the first.
      let badge = badged ? nil : present(text(row["badge"]))
      if badge != nil { badged = true }
      return Product(index: index, title: title, url: url, domain: domain, price: present(text(row["price"])), seller: present(text(row["seller"])), imageURL: image,
                     detail: present(text(row["description"])), listPrice: present(text(row["listPrice"])), rating: row["rating"]?.double, reviewCount: row["reviewCount"]?.int,
                     store: present(text(row["store"])), take: present(text(row["take"])), reasons: lines(row["reasons"]), badge: badge)
    }
    guard !products.isEmpty else { return nil }
    self.products = products
    let bought = Set((entry["productsBought"]?.array ?? []).compactMap { $0.int })
    let buying = entry["productsBuying"]?.int
    self.bought = bought
    self.buying = buying.flatMap { bought.contains($0) ? nil : $0 }
    self.replies = Array(lines(message["replies"]).prefix(3))
    self.repliesOpen = true
  }

  /** The card as the person sees it now: their own Buy shows at once, before the computer echoes it. */
  public func shown(pressed: Int?) -> ProductsCard {
    guard let pressed, buying != pressed, !bought.contains(pressed), products.contains(where: { $0.index == pressed }) else { return self }
    return ProductsCard(products: products, buying: pressed, bought: bought, replies: replies, repliesOpen: repliesOpen)
  }

  /** The replies under the card now: none once the person has sent anything after it. */
  public var shownReplies: [String] { repliesOpen ? replies : [] }

  /** The product before (-1) or after (1) this one on the card, for the opened product's ‹ and ›; nil at either end. */
  public func neighbour(of product: Product, by step: Int) -> Product? {
    guard let at = products.firstIndex(where: { $0.index == product.index }), products.indices.contains(at + step) else { return nil }
    return products[at + step]
  }

  /** Where one product is: being bought, bought, or neither. */
  public func status(of product: Product) -> Status? {
    if bought.contains(product.index) { return .bought }
    return buying == product.index ? .buying : nil
  }

  /** A product's mark once Buy was pressed: blue while it is being bought, green once it is (as the computer card's ending). */
  public enum Status: Hashable, Sendable {
    case buying, bought

    public var label: String {
      switch self {
      case .buying: return ProductsCard.buyingLabel
      case .bought: return ProductsCard.boughtLabel
      }
    }
  }

  /**
   * The chat's rows with each products card's replies open only while
   * nothing of the person's comes after it: a message, a file, one waiting
   * to go (10 November 2026, the founder: the chips are the card's next
   * steps, gone once used or moved past).
   */
  static func settlingReplies(_ rows: [ChatRow]) -> [ChatRow] {
    guard rows.contains(where: { if case .products(_, let card) = $0 { return !card.replies.isEmpty }; return false }) else { return rows }
    var out = rows
    var personAfter = false
    for at in out.indices.reversed() {
      if case .products(let id, var card) = out[at], !card.replies.isEmpty {
        card.repliesOpen = !personAfter
        out[at] = .products(id: id, card: card)
      } else if out[at].side == .person {
        personAfter = true
      }
    }
    return out
  }

  /**
   * A description's first sentence, its bold marks taken out and its last
   * full stop left off: "A reliable choice" of "A reliable choice. It has a
   * **100Hz refresh rate**." A sentence ends at a full stop, "!" or "?"
   * before a space or the end, or at a line's end; nil for no words.
   */
  static func firstSentence(_ text: String) -> String? {
    let plain = Array(text.replacingOccurrences(of: "**", with: ""))
    var end = plain.count
    for at in plain.indices {
      if plain[at] == "\n" { end = at; break }
      if ".!?".contains(plain[at]), at + 1 == plain.count || plain[at + 1].isWhitespace { end = at + 1; break }
    }
    var sentence = String(plain[..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
    if sentence.hasSuffix("."), !sentence.hasSuffix("..") { sentence.removeLast() }
    return sentence.isEmpty ? nil : sentence
  }

  // MARK: Words

  /** "Buy with Ada" */
  public static func buyLabel(agent: String) -> String {
    let who = agent.trimmingCharacters(in: .whitespacesAndNewlines)
    return who.isEmpty ? L10n.text("Buy") : L10n.text("Buy with \(who)")
  }

  /** The opened product's heading over the agent's reasons. */
  public static let whyItFits = L10n.text("Why it fits")
  /** The opened product's last row: "Sold by", the seller at its right. */
  public static let soldBy = L10n.text("Sold by")
  public static let buyingLabel = L10n.text("Buying")
  public static let boughtLabel = L10n.text("Bought")
}
