import Foundation

/**
 * What the iPhone says when this account can't send (the founder, 12
 * October 2026: "we have the usage banner saying they're out of usage and
 * that they should upgrade"), and where it sends the person: the App
 * Store's plans, or the web for a plan bought there (`route`).
 *
 * - The cover over the app, when the computer refuses the account (no plan):
 *   the free month over, or never had (`cover`).
 * - The banner over the composer: the free month's credits used, a paid
 *   week's credits used, or no plan (`banner`).
 *
 * The server's 402 for spent credits (code 40200, `proxy_common.py`) also
 * reaches the chat as a red "Agent failed to respond" card; the iPhone draws
 * the banner in its place (`isOutOfCredits`). The Mac keeps the window's own
 * words (`SandAccess`).
 */
public enum PhoneUpgrade {
  public static let seePlans = "See plans"
  public static let upgrade = "Upgrade"

  /** The cover's words when the computer refuses the account. */
  public static func cover(access: SandAccess, usage: UsageSummary?) -> SandAccess.Words {
    guard access.state == .paymentRequired else { return access.cover }
    if usage?.hasEndedTrial == true {
      return SandAccess.Words(title: "Your free month has ended", body: "Choose a plan to keep your agents working.", action: seePlans)
    }
    return SandAccess.Words(title: "Choose a plan to start", body: "Simeon needs a plan on this account.", action: seePlans)
  }

  /**
   * The banner over the composer: nil while this account can send. Spent
   * credits are read from the usage summary once there is one (the chat reads
   * it again when the server's 402 reaches a card, and the plans read it
   * again as they close, so a card left from before a purchase stops
   * counting); before that, from the 402 in a chat's card (`outOfCredits`).
   */
  public static func banner(access: SandAccess, usage: UsageSummary?, outOfCredits: Bool = false) -> SandAccess.Words? {
    switch access.state {
    case .paymentRequired:
      return cover(access: access, usage: usage)
    case .unavailable:
      return access.notice
    case .checking, .unknown, .granted:
      break
    }
    let spent = usage.map { !$0.hasAvailableUsage && ($0.hasNonZeroIncludedLimit || outOfCredits) } ?? outOfCredits
    guard spent else { return nil }
    if usage?.isTrial == true {
      return SandAccess.Words(title: "You’ve used your free credits", body: "Choose a plan to keep your agents working.", action: upgrade)
    }
    if let usage, usage.hasNonZeroIncludedLimit, !usage.isTrial {
      return SandAccess.Words(title: "This week’s credits are used", body: "They reset on Monday. Upgrade to keep going now.", action: upgrade)
    }
    return SandAccess.Words(title: "You’re out of credits", body: "Choose a plan to keep your agents working.", action: upgrade)
  }

  /** Where the banner's button goes (as Settings' Usage & Billing routes its own). */
  public enum Route: Equatable, Sendable {
    /** The App Store's plans, on the plan above when there is one (an Apple plan's upgrade). */
    case plans(tier: String?)
    /** A plan bought on the web is changed there (where Apple allows the link); simeonlabs.com for an account no plan can help. */
    case web(URL)
    /** A plan bought on the web, where Apple allows no link to it: no button (the App Store would sell a second plan). */
    case none
  }

  public static func route(access: SandAccess, usage: UsageSummary?, webLinkAllowed: Bool) -> Route {
    if access.state == .unavailable { return .web(SandAccess.page) }
    guard let usage, let plan = usage.managePlan else { return .plans(tier: nil) }
    if usage.billedByApple { return .plans(tier: plan.nextTier?.tier) }
    guard webLinkAllowed, let url = usage.upgrade?.url else { return .none }
    return .web(url)
  }

  /**
   * The banner's words when its button goes nowhere (`Route.none`): no
   * "Upgrade", and nothing pointing to another way to pay (outside the
   * United States Apple allows no such line).
   */
  public static func withoutUpgrade(_ words: SandAccess.Words) -> SandAccess.Words {
    guard words.action != nil else { return words }
    let body = words.title == "This week’s credits are used" ? "They reset on Monday." : "Your agents wait until your plan has credits again."
    return SandAccess.Words(title: words.title, body: body, action: nil)
  }

  /** The server's sentence for spent credits (402, code 40200), as the chat's card carries it. */
  public static func isOutOfCredits(_ tray: Tray) -> Bool {
    tray.detail.contains("(code 40200)") || tray.title.contains("(code 40200)")
  }
}
