import Foundation

/**
 * The checkout card (13 October 2026): one for each purchase an agent wants
 * to make, before any money is asked for (the host's
 * `shared/node/link-wallet/purchase-card.ts`). The person checks the shop,
 * the picture of its checkout (Review order opens the agent's computer on
 * it), the Link card that pays (another of their cards can be picked on it)
 * and the total, and presses Allow or Deny. Allow sends it to Link, which
 * asks them to approve it in the Link app; the card follows it there and to
 * the order.
 *
 * The message (`send-message` of type `purchase`) carries what is bought;
 * the entry carries where it stands (`purchaseState` and the fields beside
 * it), which the host stamps.
 *
 * Since 14 October 2026 a card may be paid with Shop instead (`wallet`):
 * the same card, its card row saying "Shop", and Allow either asking Shop
 * for a one-time card the person approves in the Shop app (exactly as with
 * Link), or, for a Shopify store's checkout Simeon opened through Shop
 * (`isShopCheckout`), placing the order at once with their Shop Pay card.
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

  /** The wallet that pays: Link (every card before 14 October 2026) or Shop. */
  public enum Wallet: String, Sendable { case link, shop }

  public struct Item: Hashable, Sendable {
    public let name: String
    public let quantity: Int
    public let detail: String?
  }

  /** One of the person's Link cards an agent may pay with: the card's chooser (14 October 2026). */
  public struct Choice: Hashable, Sendable, Identifiable {
    /** Link's opaque payment method id (never a card number). */
    public let id: String
    public let brand: String
    public let last4: String
    /** Its name in Link: "Chime Credit Builder". */
    public let name: String?
    public let isDefault: Bool

    public init(id: String, brand: String, last4: String, name: String? = nil, isDefault: Bool = false) {
      self.id = id; self.brand = brand; self.last4 = last4; self.name = name; self.isDefault = isDefault
    }

    /** "Mastercard Debit •••• 1005": the name in Link (or the network) and the last four. */
    public var line: String { PurchaseCard.cardLine(brand: brand, last4: last4, name: name) ?? L10n.text("Card") }
  }

  public let merchant: String
  /** The checkout's site, "ncvss.com". */
  public let domain: String
  /** The checkout page: Review order opens it. */
  public let url: URL?
  /** "$80.00" */
  public let total: String
  public let items: [Item]
  /** "Visa", "1234", "Mastercard Debit": the Link card that pays; none while the person still picks one. */
  public let cardBrand: String?
  public let cardLast4: String?
  public let cardName: String?
  /** Which of `cards` pays (Link's id), when Link named one. */
  public let cardId: String?
  /** The person's Link cards an agent may pay with, when there are several: the card's chooser. */
  public let cards: [Choice]
  /** The checkout as it looked when the agent asked. */
  public let preview: ChatImage?
  /** The shop's own icon, which Review order wears. */
  public let icon: ChatImage?
  /** Link's test mode: a test card, nothing charged. */
  public let isTest: Bool
  public let state: State
  /** Link's words, why it failed, or the delivery estimate. */
  public let note: String?
  /** Link's approval page, or what Link asks the person to do first. */
  public let actionURL: URL?
  public let order: String?
  /** A flight's checkout card (13 October 2026, `FlightBooking.swift`): the flight and who flies; Simeon pays it, not the agent. */
  public let flight: BookedFlight?
  /** Where Simeon is while paying an approved flight, or that the airline never answered. */
  public let step: Step?
  public let wallet: Wallet
  /** A Shopify store's checkout Simeon opened through Shop: Allow places the order, no app to approve in, no browser. */
  public let isShopCheckout: Bool

  public enum Step: String, Sendable {
    case paying
    /** The bank wants the person: its check is on the computer. */
    case verify
    case booking
    /** The airline never answered: nobody can say whether it's booked. */
    case uncertain
  }

  public init(merchant: String, domain: String, url: URL?, total: String, items: [Item], cardBrand: String?, cardLast4: String?, cardName: String? = nil, cardId: String? = nil, cards: [Choice] = [], preview: ChatImage?, icon: ChatImage? = nil, isTest: Bool, state: State, note: String? = nil, actionURL: URL? = nil, order: String? = nil, flight: BookedFlight? = nil, step: Step? = nil, wallet: Wallet = .link, isShopCheckout: Bool = false) {
    self.merchant = merchant; self.domain = domain; self.url = url; self.total = total; self.items = items
    self.cardBrand = cardBrand; self.cardLast4 = cardLast4; self.cardName = cardName; self.cardId = cardId; self.cards = cards
    self.preview = preview; self.icon = icon; self.isTest = isTest
    self.state = state; self.note = note; self.actionURL = actionURL; self.order = order; self.flight = flight; self.step = step
    self.wallet = wallet; self.isShopCheckout = wallet == .shop && isShopCheckout
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
    // The card picked on the card at Allow (stamped by the host) wins over the one it was made with.
    let paying = entry["purchaseCard"]?.object != nil ? entry["purchaseCard"] : purchase["card"]
    let brand = text(paying?["brand"])
    let last4 = text(paying?["last4"])
    let name = text(paying?["name"])
    self.cardBrand = brand.isEmpty ? nil : brand
    self.cardLast4 = last4.isEmpty ? nil : last4
    self.cardName = name.isEmpty ? nil : name
    let chosen = text(entry["purchasePaymentMethodId"]).isEmpty ? text(purchase["link"]?["paymentMethodId"]) : text(entry["purchasePaymentMethodId"])
    self.cardId = chosen.isEmpty ? nil : chosen
    self.cards = (purchase["cards"]?.array ?? []).compactMap { card in
      let id = text(card["id"]), last4 = text(card["last4"]), name = text(card["name"])
      guard !id.isEmpty else { return nil }
      return Choice(id: id, brand: text(card["brand"]).isEmpty ? L10n.text("Card") : text(card["brand"]), last4: last4, name: name.isEmpty ? nil : name, isDefault: card["isDefault"]?.bool ?? false)
    }
    self.preview = purchase["preview"].flatMap(ChatImage.init)
    self.icon = purchase["icon"].flatMap(ChatImage.init)
    self.isTest = purchase["test"]?.bool ?? false
    self.state = State(rawValue: entry["purchaseState"]?.text ?? "") ?? .review
    let note = entry["purchaseNote"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    self.note = note.isEmpty ? nil : note
    self.actionURL = (entry["purchaseActionUrl"]?.text).flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
    let order = entry["purchaseOrder"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    self.order = order.isEmpty ? nil : order
    self.flight = purchase["flight"].flatMap(BookedFlight.init(json:))
    self.step = (entry["purchaseStep"]?.text).flatMap(Step.init(rawValue:))
    self.wallet = Wallet(rawValue: text(purchase["wallet"])) ?? .link
    self.isShopCheckout = self.wallet == .shop && !text(purchase["shopCheckout"]?["handle"]).isEmpty
  }

  /**
   * The card as the person sees it now: the card they picked on it (before
   * Allow, on this device), and their own answer at once, before the
   * computer echoes it.
   */
  public func shown(answered: State?, picked: String? = nil) -> PurchaseCard {
    let choice = state == .review ? picked.flatMap { id in cards.first { $0.id == id } } : nil
    guard choice != nil || (state == .review && answered != nil) else { return self }
    return PurchaseCard(merchant: merchant, domain: domain, url: url, total: total, items: items, cardBrand: choice?.brand ?? cardBrand, cardLast4: choice?.last4 ?? cardLast4, cardName: choice.map(\.name) ?? cardName, cardId: choice?.id ?? cardId, cards: cards, preview: preview, icon: icon, isTest: isTest, state: state == .review ? (answered ?? state) : state, note: choice == nil ? note : nil, actionURL: actionURL, order: order, flight: flight, step: step, wallet: wallet, isShopCheckout: isShopCheckout)
  }

  // MARK: Words

  public static let title = L10n.text("Checkout")
  public static let check = L10n.text("Check the items, delivery and terms on the shop's page before you allow it.")
  public static let reviewOrder = L10n.text("Review order")
  public static let payWithLink = "Link by Stripe"
  public static let chooseCard = L10n.text("Choose the card that pays")
  public static let cardsTitle = L10n.text("Pay with")
  public static let cardsFooter = L10n.text("Your cards in Link. Add or remove cards in the Link app or at link.com.")
  public static let totalLabel = L10n.text("Total")
  public static let deny = L10n.text("Deny")
  public static let allow = L10n.text("Allow")
  public static let openLink = L10n.text("Open Link")
  public static let getLinkApp = L10n.text("Get the Link app")
  /** Where Link sends people for its app (Link's own command-line tool shows the same address). */
  public static let linkAppURL = URL(string: "https://link.com/download")!
  public static let testNote = L10n.text("Link's test mode: nothing is charged.")

  // Shop's words (14 October 2026).
  public static let payWithShop = "Shop"
  public static let openShop = L10n.text("Open Shop")
  public static let getShopApp = L10n.text("Get the Shop app")
  public static let shopAppURL = URL(string: "https://shop.app")!
  public static let openStorePage = L10n.text("Open the store's page")
  public static let shopCardsFooter = L10n.text("Your cards in Shop. Add or remove cards in the Shop app.")
  public static let shopCheckoutCardsFooter = L10n.text("The ways to pay this store offers you through Shop.")

  /** What the card row names beside the card that pays: "Link by Stripe" or "Shop". */
  public var walletLabel: String { wallet == .shop ? Self.payWithShop : Self.payWithLink }
  /** The chooser's footer, by wallet. */
  public var cardsFooter: String { wallet == .link ? Self.cardsFooter : isShopCheckout ? Self.shopCheckoutCardsFooter : Self.shopCardsFooter }
  /** While the wallet waits on the person: the button that opens its page ("Open Link", "Open Shop", the store's page). */
  public var openWalletLabel: String { wallet == .link ? Self.openLink : isShopCheckout ? Self.openStorePage : Self.openShop }
  /** The wallet's app, for someone without it: none for a Shop checkout (the store's page is the step). */
  public var walletApp: (label: String, url: URL)? {
    if wallet == .link { return (Self.getLinkApp, Self.linkAppURL) }
    return isShopCheckout ? nil : (Self.getShopApp, Self.shopAppURL)
  }

  /** "Ada wants to place an order at ncvss.com" */
  public static func headline(agent: String, domain: String) -> String {
    let who = agent.trimmingCharacters(in: .whitespacesAndNewlines)
    return who.isEmpty ? L10n.text("Your agent wants to place an order at \(domain)") : L10n.text("\(who) wants to place an order at \(domain)")
  }

  /** "Mastercard Debit •••• 1005": the card's name in Link (else its network) and its last four; nil when Link gave nothing. */
  public var cardLine: String? { Self.cardLine(brand: cardBrand, last4: cardLast4, name: cardName) }

  static func cardLine(brand: String?, last4: String?, name: String?) -> String? {
    let named = name?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    // A name that already says the last four ("Visa 1234") is shown as it is.
    if let named, let last4, named.contains(last4) { return named }
    switch (named ?? brand, last4) {
    case let (title?, last4?): return "\(title) •••• \(last4)"
    case let (title?, nil): return title
    case let (nil, last4?): return L10n.text("Card •••• \(last4)")
    default: return nil
    }
  }

  /** The person can switch the card that pays, on the card, before Allow (a flight's card too). */
  public var canChooseCard: Bool { waitsOnPerson && cards.count > 1 }

  /** No card pays yet: Allow waits for the person to pick one. */
  public var needsCard: Bool { waitsOnPerson && cardLast4 == nil && cardBrand == nil && cards.count > 1 }

  /** A line for the person while the card waits on them (Link refused the card they picked, or none was picked). */
  public var reviewNote: String? { state == .review ? note : nil }

  /** "Linen shirt ×2, Case": what is bought, for a card without a picture. */
  public var itemsLine: String {
    items.map { $0.quantity > 1 ? "\($0.name) ×\($0.quantity)" : $0.name }.joined(separator: ", ")
  }

  /** The person can answer (Allow, Deny). */
  public var waitsOnPerson: Bool { state == .review }

  /** A flight's card: "Flight". */
  public static let flightTitle = L10n.text("Flight")
  public static let flightCheck = L10n.text("Check the flight, the travellers' names and the total before you allow it.")
  public static let flightTestNote = L10n.text("Test mode: a pretend airline, nothing is charged.")
  public static let openComputer = L10n.text("Open the computer")

  /** "Ada wants to book a flight with Duffel Airways" */
  public static func flightHeadline(agent: String, airline: String) -> String {
    let who = agent.trimmingCharacters(in: .whitespacesAndNewlines)
    switch (who.isEmpty, airline.isEmpty) {
    case (true, true): return L10n.text("Your agent wants to book a flight")
    case (true, false): return L10n.text("Your agent wants to book a flight with \(airline)")
    case (false, true): return L10n.text("\(who) wants to book a flight")
    case (false, false): return L10n.text("\(who) wants to book a flight with \(airline)")
    }
  }

  /** The heading: "Checkout", or "Flight" for a flight. */
  public var heading: String { flight == nil ? Self.title : Self.flightTitle }

  /** The bank's check waits on the person, on the computer. */
  public var waitsOnBank: Bool { flight != nil && state == .approved && step == .verify }

  /** Where it stands, once answered: the line under the card, and whether it went well. */
  public var status: (label: String, kind: StatusKind)? {
    if flight != nil, let flightStatus { return flightStatus }
    switch state {
    case .review: return nil
    // Link's in short (the founder, 24 October 2026: "no more Asking Link - say In progress … let it be Approve with link").
    case .sending: return (wallet == .link ? L10n.text("In progress") : isShopCheckout ? L10n.text("Placing your order with Shop…") : L10n.text("Asking Shop…"), .working)
    case .approving: return (wallet == .link ? L10n.text("Approve with Link") : isShopCheckout ? L10n.text("Finish on the store's page") : L10n.text("Approve it in the Shop app"), .working)
    case .approved: return (L10n.text("Approved · placing your order"), .working)
    case .ordered: return (L10n.text("Ordered"), .success)
    case .failed: return (L10n.text("Didn't go through"), .danger)
    case .denied: return (L10n.text("Denied"), .neutral)
    case .expired: return (L10n.text("Expired"), .neutral)
    case .canceled: return (L10n.text("Canceled"), .neutral)
    }
  }

  public enum StatusKind: Sendable { case working, success, danger, neutral }

  /** A flight's own words once Link approved (Simeon pays it): paying, the bank's check, booking, booked, not booked. */
  private var flightStatus: (label: String, kind: StatusKind)? {
    switch state {
    case .approved:
      switch step {
      case .verify: return (L10n.text("Your bank wants to confirm it's you"), .working)
      case .booking: return (L10n.text("Booking with the airline…"), .working)
      default: return (L10n.text("Approved · paying the airline"), .working)
      }
    case .ordered: return (L10n.text("Booked"), .success)
    case .failed: return step == .uncertain ? (L10n.text("Not confirmed"), .neutral) : (L10n.text("Not booked"), .danger)
    default: return nil
    }
  }

  /** The line under the status: the order's number, Link's words, or how long Link waits. */
  public var detail: String? {
    if flight != nil {
      switch state {
      case .approved:
        return step == .verify ? L10n.text("Open the computer to finish the check; the booking goes on by itself.") : nil
      case .ordered:
        return [order.map { L10n.text("Booking reference \($0)") }, L10n.text("The airline emails the ticket.")].compactMap { $0 }.joined(separator: " · ")
      case .failed:
        return note ?? L10n.text("Nothing was booked.")
      default:
        break
      }
    }
    switch state {
    case .approving:
      // Link's wait says nothing more than its status (the founder, 24 October 2026: "we speak way too much").
      return note ?? (wallet == .link ? nil : Self.shopApprovingDetail)
    case .ordered:
      let number = order.map { order in
        let numbered = order.hasPrefix("#") ? order : "#\(order)"
        return L10n.text("Order \(numbered)")
      }
      return [number, note].compactMap { $0 }.joined(separator: " · ").nilIfEmpty
    case .failed:
      return note ?? L10n.text("Nothing was paid.")
    case .denied, .expired, .canceled:
      return L10n.text("Nothing was paid.")
    default:
      return nil
    }
  }

  /** The same for Shop: it asks in the Shop app, with the account the person connected. */
  public static let shopApprovingDetail = L10n.text("Shop sent it to the Shop app on your phone. Approve it there; nothing is paid until you do. No Shop app yet? Get it and sign in with the account you connected.")

  /** In the chat list and a quote: "Checkout at ncvss.com · $80.00", "Flight Seattle to Los Angeles · $361.20". */
  public var listLine: String { flight.map { L10n.text("Flight \($0.route) · \(total)") } ?? L10n.text("Checkout at \(domain) · \(total)") }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
