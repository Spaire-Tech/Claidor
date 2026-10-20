import Foundation

/**
 * The plans as the App Store sells them in the iPhone app (12 October 2026;
 * `server/simeon/plans/app_store.py`, docs/services-billing.md §9): the web's
 * three, monthly or yearly, as subscriptions in one group (the sheet offers
 * the monthly ones). The server names the product ids (so they stay in one
 * place) and the credits each plan gives; StoreKit gives the prices, in the
 * person's own currency.
 */
public struct ApplePlan: Equatable, Sendable, Identifiable {
  public let productId: String
  /** `standard`, `pro` or `max`. */
  public let tier: String
  /** `month` or `year`. */
  public let interval: String
  /** "Standard", "Pro", "Max". */
  public let name: String
  public let weeklyCredits: Int

  public var id: String { productId }
  public var yearly: Bool { interval == "year" }

  public init(productId: String, tier: String, interval: String, name: String, weeklyCredits: Int) {
    self.productId = productId; self.tier = tier; self.interval = interval; self.name = name; self.weeklyCredits = weeklyCredits
  }
}

public struct ApplePlans: Equatable, Sendable {
  public let plans: [ApplePlan]
  /** The web's billing page, offered beside the App Store's only where Apple allows it (`webLinkAllowed`). */
  public let webSubscribeURL: URL?

  public init(plans: [ApplePlan], webSubscribeURL: URL?) { self.plans = plans; self.webSubscribeURL = webSubscribeURL }

  /** `billing/apple/products`. */
  public init(json: JSON) {
    plans = (json["products"]?.array ?? []).compactMap { item in
      guard let id = item["productId"]?.text, let tier = item["tier"]?.text, let interval = item["interval"]?.text,
            ["month", "year"].contains(interval) else { return nil }
      return ApplePlan(productId: id, tier: tier, interval: interval, name: item["name"]?.text ?? tier.capitalized, weeklyCredits: item["weeklyCredits"]?.int ?? 0)
    }
    webSubscribeURL = json["webSubscribeUrl"]?.text.flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
  }

  public var productIds: [String] { plans.map(\.productId) }

  /** One interval's plans, in the server's order (Standard, Pro, Max). */
  public func plans(yearly: Bool) -> [ApplePlan] { plans.filter { $0.yearly == yearly } }

  /** The plan a tier and interval name, if the server sells it. */
  public func plan(tier: String, yearly: Bool) -> ApplePlan? { plans.first { $0.tier == tier && $0.yearly == yearly } }

  /**
   * Whether the app may offer the web's billing page beside the App Store's:
   * in the United States only, where a court order lets an app link to
   * paying elsewhere (2025); elsewhere Apple's rules forbid pointing to
   * another way to pay. The App Store's storefront decides, not the phone's
   * region (StoreKit's `Storefront.countryCode`, ISO 3166 alpha-3).
   */
  public static func webLinkAllowed(storefrontCountry: String?) -> Bool { storefrontCountry?.uppercased() == "USA" }
}

/**
 * What the plans sheet says (the founder, 12 October 2026: as simple as a
 * reference app's sheet): a title and one line, each plan's name and monthly price,
 * the chosen price over Subscribe, Restore Purchases, the one sentence Apple
 * asks for (price, period, auto-renewal, how to cancel) and the Terms and
 * Privacy links. Monthly only on the iPhone; no free week (the free month
 * starts at the first sign-in, `FreeMonth`).
 */
public enum PlansCopy {
  public static let title = L10n.text("Choose a plan")
  public static let subtitle = L10n.text("Higher plans include more usage.")
  public static let subscribe = L10n.text("Subscribe")
  public static let restore = L10n.text("Restore Purchases")
  public static let webLink = L10n.text("Subscribe on the web instead")
  public static let unavailable = L10n.text("Plans can't be loaded right now. Check your connection and try again.")
  public static let pending = L10n.text("Your purchase is waiting for approval. Simeon starts as soon as it's approved.")
  public static let nothingToRestore = L10n.text("There's no Simeon subscription on this Apple ID to restore.")
  /** Apple's rule for an auto-renewing subscription, in one sentence. */
  public static let renewal = L10n.text("Auto-renews monthly. Your Apple ID is charged each month until you cancel in Settings › Apple Account › Subscriptions.")
  public static let termsURL = URL(string: "https://simeonlabs.com/terms")!
  public static let privacyURL = URL(string: "https://simeonlabs.com/privacy")!
  /** Where an Apple plan is changed or cancelled (also the server's words, `MANAGE_ON_IPHONE`). */
  public static let manageInSettings = L10n.text("Your plan is billed through Apple. Change or cancel it in Settings › your name › Subscriptions.")

  /** "$30.00 per month" from StoreKit's own price text. */
  public static func price(_ display: String, yearly: Bool = false) -> String { yearly ? L10n.text("\(display) per year") : L10n.text("\(display) per month") }
}
