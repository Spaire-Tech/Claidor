import Foundation

/**
 * The checkout card (13 October 2026): one for each purchase an agent wants
 * to make, before any money is asked for (the host's
 * `shared/node/link-wallet/purchase-card.ts`). The person checks the shop,
 * the picture of its checkout, the Link card that pays and the total, and
 * presses Allow or Deny. Allow sends it to Link, which asks them to approve
 * it in the Link app; the card follows it there and to the order.
 *
 * The message (`send-message` of type `purchase`) carries what is bought;
 * the entry carries where it stands (`purchaseState` and the fields beside
 * it), which the host stamps.
 */
public struct PurchaseCard: Hashable, Sendable {
  public enum State: String, Sendable {
    /** Waiting for the person's Allow or Deny. */
    case review
    /** Allow pressed: Simeon is asking Link. */
    case sending
    /** Link asked the person to approve it (in the Link app, or at `actionURL`). */
    case approving
    /** Link approved: the agent is placing the order. */
    case approved
    case ordered, failed, denied, expired, canceled
  }

  public struct Item: Hashable, Sendable {
    public let name: String
    public let quantity: Int
    public let detail: String?
  }

  public let merchant: String
  /** The checkout's site, "ncvss.com". */
  public let domain: String
  /** The checkout page: Review order opens it. */
  public let url: URL?
  /** "$80.00" */
  public let total: String
  public let items: [Item]
  /** "Visa", "1234": the Link card that pays. */
  public let cardBrand: String?
  public let cardLast4: String?
  /** The checkout as it looked when the agent asked. */
  public let preview: ChatImage?
  /** Link's test mode: a test card, nothing charged. */
  public let isTest: Bool
  public let state: State
  /** Link's words, why it failed, or the delivery estimate. */
  public let note: String?
  /** Link's approval page, or what Link asks the person to do first. */
  public let actionURL: URL?
  public let order: String?

  public init(merchant: String, domain: String, url: URL?, total: String, items: [Item], cardBrand: String?, cardLast4: String?, preview: ChatImage?, isTest: Bool, state: State, note: String? = nil, actionURL: URL? = nil, order: String? = nil) {
    self.merchant = merchant; self.domain = domain; self.url = url; self.total = total; self.items = items
    self.cardBrand = cardBrand; self.cardLast4 = cardLast4; self.preview = preview; self.isTest = isTest
    self.state = state; self.note = note; self.actionURL = actionURL; self.order = order
  }

  init?(message: JSON, entry: Entry) {
    guard let purchase = message["purchase"], purchase.object != nil else { return nil }
    let text = { (value: JSON?) -> String in value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let domain = text(purchase["domain"])
    let total = text(purchase["total"])
    guard !domain.isEmpty, !total.isEmpty else { return nil }
    self.merchant = text(purchase["merchant"]).isEmpty ? domain : text(purchase["merchant"])
    self.domain = domain
    self.url = URL(string: text(purchase["url"])).flatMap { $0.scheme == "https" ? $0 : nil }
    self.total = total
    self.items = (purchase["items"]?.array ?? []).compactMap { item in
      let name = text(item["name"])
      guard !name.isEmpty else { return nil }
      let detail = text(item["description"])
      return Item(name: name, quantity: max(1, item["quantity"]?.int ?? 1), detail: detail.isEmpty ? nil : detail)
    }
    let brand = text(purchase["card"]?["brand"])
    let last4 = text(purchase["card"]?["last4"])
    self.cardBrand = brand.isEmpty ? nil : brand
    self.cardLast4 = last4.isEmpty ? nil : last4
    self.preview = purchase["preview"].flatMap(ChatImage.init)
    self.isTest = purchase["test"]?.bool ?? false
    self.state = State(rawValue: entry["purchaseState"]?.text ?? "") ?? .review
    let note = entry["purchaseNote"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    self.note = note.isEmpty ? nil : note
    self.actionURL = (entry["purchaseActionUrl"]?.text).flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
    let order = entry["purchaseOrder"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    self.order = order.isEmpty ? nil : order
  }

  /** The card as the person sees it now: their own answer shows at once, before the computer echoes it. */
  public func shown(answered: State?) -> PurchaseCard {
    guard state == .review, let answered else { return self }
    return PurchaseCard(merchant: merchant, domain: domain, url: url, total: total, items: items, cardBrand: cardBrand, cardLast4: cardLast4, preview: preview, isTest: isTest, state: answered, note: note, actionURL: actionURL, order: order)
  }

  // MARK: Words

  public static let title = "Checkout"
  public static let check = "Check the items, delivery and terms on the shop's page before you allow it."
  public static let reviewOrder = "Review order"
  public static let payWithLink = "Pay with Link"
  public static let totalLabel = "Total"
  public static let deny = "Deny"
  public static let allow = "Allow"
  public static let openLink = "Open Link"
  public static let testNote = "Link's test mode: nothing is charged."

  /** "Ada wants to place an order at ncvss.com" */
  public static func headline(agent: String, domain: String) -> String {
    let who = agent.trimmingCharacters(in: .whitespacesAndNewlines)
    return "\(who.isEmpty ? "Your agent" : who) wants to place an order at \(domain)"
  }

  /** "Visa •••• 1234"; the brand alone, or nil, when Link gave less. */
  public var cardLine: String? {
    switch (cardBrand, cardLast4) {
    case let (brand?, last4?): return "\(brand) •••• \(last4)"
    case let (brand?, nil): return brand
    case let (nil, last4?): return "Card •••• \(last4)"
    default: return nil
    }
  }

  /** "Linen shirt ×2, Case": what is bought, for a card without a picture. */
  public var itemsLine: String {
    items.map { $0.quantity > 1 ? "\($0.name) ×\($0.quantity)" : $0.name }.joined(separator: ", ")
  }

  /** The person can answer (Allow, Deny). */
  public var waitsOnPerson: Bool { state == .review }

  /** Where it stands, once answered: the line under the card, and whether it went well. */
  public var status: (label: String, kind: StatusKind)? {
    switch state {
    case .review: return nil
    case .sending: return ("Asking Link…", .working)
    case .approving: return ("Approve it in the Link app", .working)
    case .approved: return ("Approved · placing your order", .working)
    case .ordered: return ("Ordered", .success)
    case .failed: return ("Didn't go through", .danger)
    case .denied: return ("Denied", .neutral)
    case .expired: return ("Expired", .neutral)
    case .canceled: return ("Canceled", .neutral)
    }
  }

  public enum StatusKind: Sendable { case working, success, danger, neutral }

  /** The line under the status: the order's number, Link's words, or how long Link waits. */
  public var detail: String? {
    switch state {
    case .approving:
      return note ?? "Link sent it to your Link app. It waits 30 minutes."
    case .ordered:
      let number = order.map { "Order \($0.hasPrefix("#") ? $0 : "#\($0)")" }
      return [number, note].compactMap { $0 }.joined(separator: " · ").nilIfEmpty
    case .failed:
      return note ?? "Nothing was paid."
    case .denied, .expired, .canceled:
      return "Nothing was paid."
    default:
      return nil
    }
  }

  /** In the chat list and a quote: "Checkout at ncvss.com · $80.00". */
  public var listLine: String { "Checkout at \(domain) · \(total)" }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
