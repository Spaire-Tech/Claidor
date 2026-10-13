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
  /** A flight's checkout card (13 October 2026, `FlightBooking.swift`): the flight and who flies; Simeon pays it, not the agent. */
  public let flight: BookedFlight?
  /** Where Simeon is while paying an approved flight, or that the airline never answered. */
  public let step: Step?

  public enum Step: String, Sendable {
    case paying
    /** The bank wants the person: its check is on the computer. */
    case verify
    case booking
    /** The airline never answered: nobody can say whether it's booked. */
    case uncertain
  }

  public init(merchant: String, domain: String, url: URL?, total: String, items: [Item], cardBrand: String?, cardLast4: String?, preview: ChatImage?, isTest: Bool, state: State, note: String? = nil, actionURL: URL? = nil, order: String? = nil, flight: BookedFlight? = nil, step: Step? = nil) {
    self.merchant = merchant; self.domain = domain; self.url = url; self.total = total; self.items = items
    self.cardBrand = cardBrand; self.cardLast4 = cardLast4; self.preview = preview; self.isTest = isTest
    self.state = state; self.note = note; self.actionURL = actionURL; self.order = order; self.flight = flight; self.step = step
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
    self.flight = purchase["flight"].flatMap(BookedFlight.init(json:))
    self.step = (entry["purchaseStep"]?.text).flatMap(Step.init(rawValue:))
  }

  /** The card as the person sees it now: their own answer shows at once, before the computer echoes it. */
  public func shown(answered: State?) -> PurchaseCard {
    guard state == .review, let answered else { return self }
    return PurchaseCard(merchant: merchant, domain: domain, url: url, total: total, items: items, cardBrand: cardBrand, cardLast4: cardLast4, preview: preview, isTest: isTest, state: answered, note: note, actionURL: actionURL, order: order, flight: flight, step: step)
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

  /** A flight's card: "Flight". */
  public static let flightTitle = "Flight"
  public static let flightCheck = "Check the flight, the travellers' names and the total before you allow it."
  public static let flightTestNote = "Test mode: a pretend airline, nothing is charged."
  public static let openComputer = "Open the computer"

  /** "Ada wants to book a flight with Duffel Airways" */
  public static func flightHeadline(agent: String, airline: String) -> String {
    let who = agent.trimmingCharacters(in: .whitespacesAndNewlines)
    return "\(who.isEmpty ? "Your agent" : who) wants to book a flight\(airline.isEmpty ? "" : " with \(airline)")"
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

  /** A flight's own words once Link approved (Simeon pays it): paying, the bank's check, booking, booked, not booked. */
  private var flightStatus: (label: String, kind: StatusKind)? {
    switch state {
    case .approved:
      switch step {
      case .verify: return ("Your bank wants to confirm it's you", .working)
      case .booking: return ("Booking with the airline…", .working)
      default: return ("Approved · paying the airline", .working)
      }
    case .ordered: return ("Booked", .success)
    case .failed: return step == .uncertain ? ("Not confirmed", .neutral) : ("Not booked", .danger)
    default: return nil
    }
  }

  /** The line under the status: the order's number, Link's words, or how long Link waits. */
  public var detail: String? {
    if flight != nil {
      switch state {
      case .approved:
        return step == .verify ? "Open the computer to finish the check; the booking goes on by itself." : nil
      case .ordered:
        return [order.map { "Booking reference \($0)" }, "The airline emails the ticket."].compactMap { $0 }.joined(separator: " · ")
      case .failed:
        return note ?? "Nothing was booked."
      default:
        break
      }
    }
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

  /** In the chat list and a quote: "Checkout at ncvss.com · $80.00", "Flight Seattle to Los Angeles · $361.20". */
  public var listLine: String { flight.map { "Flight \($0.route) · \(total)" } ?? "Checkout at \(domain) · \(total)" }
}

private extension String {
  var nilIfEmpty: String? { isEmpty ? nil : self }
}
