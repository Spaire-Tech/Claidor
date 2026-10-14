import Foundation

/**
 * What the iPhone says when this account can't send (the founder, 12
 * October 2026: "we have the usage banner saying they're out of usage and
 * that they should upgrade"), and where it sends the person: the App
 * Store's plans, or the web for a plan bought there (`route`).
 *
 * - The cover over the app, when the computer refuses the account (no plan):
 *   the free month over, or never had, or the first charge after the trial
 *   failed (`cover`).
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
  public static let paymentFailedTitle = "Your payment didn’t go through"
  public static let updateCard = "Update card"
  public static let updatePayment = "Update payment"
  /** Apple's own page for the Apple Account's payment method (Apple's advice for a failed renewal). */
  public static let appleBilling = URL(string: "https://apps.apple.com/account/billing")!

  /** The cover's words when the computer refuses the account. */
  public static func cover(access: SandAccess, usage: UsageSummary?) -> SandAccess.Words {
    guard access.state == .paymentRequired else { return access.cover }
    // The trial's first charge failed (14 October 2026): the plan is there, the card is not; no plan to choose.
    if let usage, usage.paymentFailed {
      if usage.billedByApple {
        return SandAccess.Words(title: paymentFailedTitle, body: "Update your payment method with Apple to keep your agents working.", action: updatePayment)
      }
      return SandAccess.Words(title: paymentFailedTitle, body: "Update your card to keep your agents working.", action: updateCard)
    }
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

  /**
   * Near the limit (the founder, 13 October 2026, as Claude says "You’re
   * approaching your usage limit"; the Electron window never had one): a
   * quiet line over the composer, not red, once 80% of the credits are used
   * and again at 95%, while there are credits left and nothing else is said
   * there (`banner`). Closed, it stays closed for that step of that period.
   */
  public struct Approaching: Equatable, Sendable {
    public let words: SandAccess.Words
    /** The step crossed: 80, then 95. */
    public let step: Int
    /** What closing it remembers: the period's end and the step. */
    public let key: String
  }

  public static let approachingTitle = "You’re approaching your usage limit"
  public static let approachingSteps = [80, 95]

  public static func approaching(access: SandAccess, usage: UsageSummary?, now: Date = Date(), timeZone: TimeZone = .current) -> Approaching? {
    guard banner(access: access, usage: usage) == nil, let usage, usage.hasNonZeroIncludedLimit, usage.hasAvailableUsage,
          let percent = usage.usagePercent, percent < 100,
          let step = approachingSteps.last(where: { percent >= Double($0) }) else { return nil }
    let used = Int(percent.rounded(.down))
    let body: String
    if usage.isTrial {
      body = "You’ve used \(used)% of your free credits."
    } else if let reset = usage.resetMs.map({ Date(timeIntervalSince1970: $0 / 1000) }), reset > now {
      body = "You’ve used \(used)% of this week’s credits. They reset \(day(reset, now: now, timeZone: timeZone))."
    } else {
      body = "You’ve used \(used)% of this week’s credits."
    }
    return Approaching(words: SandAccess.Words(title: approachingTitle, body: body, action: upgrade), step: step, key: "\(Int(usage.resetMs ?? 0))|\(step)")
  }

  /** "today", "tomorrow", else "on Monday", in the person's time zone. */
  static func day(_ date: Date, now: Date, timeZone: TimeZone) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
    if days <= 0 { return "today" }
    if days == 1 { return "tomorrow" }
    let format = DateFormatter()
    format.locale = Locale(identifier: "en_US_POSIX")
    format.timeZone = timeZone
    format.dateFormat = "EEEE"
    return "on " + format.string(from: date)
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
    // A failed payment is mended where the card is: Apple's payment page, or the web's billing page where Apple
    // allows the link (never the App Store's plans, which would sell a second plan).
    if let usage, usage.paymentFailed {
      if usage.billedByApple { return .web(appleBilling) }
      guard webLinkAllowed, let url = usage.upgrade?.url else { return .none }
      return .web(url)
    }
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
    // Near the limit, the line says only how much is used; a failed payment, only that the card needs updating.
    if words.title == approachingTitle || words.title == paymentFailedTitle { return SandAccess.Words(title: words.title, body: words.body, action: nil) }
    let body = words.title == "This week’s credits are used" ? "They reset on Monday." : "Your agents wait until your plan has credits again."
    return SandAccess.Words(title: words.title, body: body, action: nil)
  }

  /** The server's sentence for spent credits (402, code 40200), as the chat's card carries it. */
  public static func isOutOfCredits(_ tray: Tray) -> Bool {
    tray.detail.contains("(code 40200)") || tray.title.contains("(code 40200)")
  }
}

/**
 * What the Mac says when this account has no plan (the cover over the
 * window, and the line over the composer), and where its button goes (14
 * October 2026). The founder chose the web for the Mac: the plans page,
 * where the 30-day trial starts with a card (the iPhone starts its free
 * month itself, no card). Until then the Mac showed the window's own
 * "Start your free month" and its button opened simeonlabs.com, where
 * nothing starts a trial.
 */
public enum MacUpgrade {
  /** The web's plans page, from the app: it sends the person back to the app afterwards. The quota's `upgradeUrl` when there is one. */
  public static let billing = URL(string: "https://app.simeonlabs.com/billing?from=app")!

  public static func cover(access: SandAccess, usage: UsageSummary?) -> SandAccess.Words {
    guard access.state == .paymentRequired else { return access.cover }
    if let usage, usage.paymentFailed {
      if usage.billedByApple {
        return SandAccess.Words(title: PhoneUpgrade.paymentFailedTitle, body: "Update your payment method with Apple to keep your agents working.", action: PhoneUpgrade.updatePayment)
      }
      return SandAccess.Words(title: PhoneUpgrade.paymentFailedTitle, body: "Update your card to keep your agents working.", action: PhoneUpgrade.updateCard)
    }
    if access.reason == .freeTrialAvailable {
      return SandAccess.Words(title: "Start your free trial to send messages", body: "30 days free, then your plan. Add a card on the web; cancel anytime.", action: "Start Free Trial")
    }
    if usage?.hasEndedTrial == true {
      return SandAccess.Words(title: "Your free month has ended", body: "Choose a plan to keep your agents working.", action: PhoneUpgrade.seePlans)
    }
    return SandAccess.Words(title: "Simeon needs a plan", body: "Choose a plan on the web to send messages.", action: PhoneUpgrade.seePlans)
  }

  /** Where the button goes: the web's plans page (Apple's payment page for a failed charge Apple bills); Simeon Labs' page for an account no plan can help. */
  public static func destination(access: SandAccess, usage: UsageSummary?) -> URL {
    guard access.state == .paymentRequired else { return SandAccess.page }
    if let usage, usage.paymentFailed, usage.billedByApple { return PhoneUpgrade.appleBilling }
    return usage?.upgrade?.url ?? billing
  }
}

/**
 * The approaching-limit lines the person closed (`PhoneUpgrade.Approaching`),
 * one key per period and step, kept as one line of text in the app's
 * settings; the last twelve are enough.
 */
public enum ApproachingClosed {
  public static let key = "simeon.usage.approachingClosed"

  public static func contains(_ near: String, in kept: String) -> Bool {
    kept.split(separator: ",").contains { $0 == near }
  }

  public static func adding(_ near: String, to kept: String) -> String {
    let keys = kept.split(separator: ",").map(String.init).filter { $0 != near } + [near]
    return keys.suffix(12).joined(separator: ",")
  }
}
