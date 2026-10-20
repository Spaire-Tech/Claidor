import Foundation

/**
 * What the iPhone says when this account can't send (the founder, 12
 * October 2026: "we have the usage banner saying they're out of usage and
 * that they should upgrade"), and where it sends the person: the App
 * Store's plans, or Stripe's own page for a plan bought on the web
 * (`route`).
 *
 * - The banner over the composer: the free month's credits used, a paid
 *   week's credits used, or no plan: the free month over, or never had, or
 *   the first charge after the trial failed (`banner`). Since 14 October
 *   2026 (the founder: "still access to the app. just cant send message.
 *   and explain the reason below") the app stays open with no plan: the
 *   server lets the account reach its computer, Send waits, and this line
 *   says why.
 * - The cover over the app, only when the computer refuses the account
 *   (the server's `DESKTOP_COMPUTER_WITHOUT_PLAN` off), in the same words
 *   (`cover`).
 *
 * The server's 402 for spent credits (code 40200, `proxy_common.py`) also
 * reaches the chat as a red "Agent failed to respond" card; the iPhone draws
 * the banner in its place (`isOutOfCredits`). The Mac keeps the window's own
 * words (`SandAccess`).
 */
public enum PhoneUpgrade {
  public static let seePlans = L10n.text("See plans")
  public static let upgrade = L10n.text("Upgrade")
  public static let paymentFailedTitle = L10n.text("Your payment didn’t go through")
  public static let updateCard = L10n.text("Update card")
  public static let updatePayment = L10n.text("Update payment")
  /** Under the title of a failed payment: why Send waits. */
  public static let paymentFailedCard = L10n.text("You can’t send messages until your card is updated.")
  public static let paymentFailedApple = L10n.text("You can’t send messages until your Apple payment method is updated.")
  /** Apple's own page for the Apple Account's payment method (Apple's advice for a failed renewal). */
  public static let appleBilling = URL(string: "https://apps.apple.com/account/billing")!

  /** The cover's words when the computer refuses the account. */
  public static func cover(access: SandAccess, usage: UsageSummary?) -> SandAccess.Words {
    guard access.state == .paymentRequired else { return access.cover }
    // The trial's first charge failed (14 October 2026): the plan is there, the card is not; no plan to choose.
    if let usage, usage.paymentFailed {
      // An Apple plan goes to the plans (the founder, 14 October 2026), which say the payment failed and link to Apple's page.
      if usage.billedByApple {
        return SandAccess.Words(title: paymentFailedTitle, body: paymentFailedApple, action: seePlans)
      }
      return SandAccess.Words(title: paymentFailedTitle, body: paymentFailedCard, action: updateCard)
    }
    if usage?.hasEndedTrial == true {
      return SandAccess.Words(title: L10n.text("Your free month has ended"), body: L10n.text("Choose a plan to send messages again."), action: seePlans)
    }
    return SandAccess.Words(title: L10n.text("Choose a plan to start"), body: L10n.text("You can send messages once this account has a plan."), action: seePlans)
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
      return SandAccess.Words(title: L10n.text("You’ve used your free credits"), body: L10n.text("Choose a plan to keep your agents working."), action: upgrade)
    }
    if let usage, usage.hasNonZeroIncludedLimit, !usage.isTrial {
      return SandAccess.Words(title: weekUsedTitle, body: L10n.text("They reset on Monday. Upgrade to keep going now."), action: upgrade)
    }
    return SandAccess.Words(title: L10n.text("You’re out of credits"), body: L10n.text("Choose a plan to keep your agents working."), action: upgrade)
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

  public static let approachingTitle = L10n.text("You’re approaching your usage limit")
  /** The banner's title once a paid week's credits are spent. */
  static let weekUsedTitle = L10n.text("This week’s credits are used")
  public static let approachingSteps = [80, 95]

  public static func approaching(access: SandAccess, usage: UsageSummary?, now: Date = Date(), timeZone: TimeZone = .current) -> Approaching? {
    guard banner(access: access, usage: usage) == nil, let usage, usage.hasNonZeroIncludedLimit, usage.hasAvailableUsage,
          let percent = usage.usagePercent, percent < 100,
          let step = approachingSteps.last(where: { percent >= Double($0) }) else { return nil }
    let used = Int(percent.rounded(.down))
    let body: String
    if usage.isTrial {
      body = L10n.text("You’ve used \(used)% of your free credits.")
    } else if let reset = usage.resetMs.map({ Date(timeIntervalSince1970: $0 / 1000) }), reset > now {
      body = L10n.text("You’ve used \(used)% of this week’s credits. They reset \(day(reset, now: now, timeZone: timeZone)).")
    } else {
      body = L10n.text("You’ve used \(used)% of this week’s credits.")
    }
    return Approaching(words: SandAccess.Words(title: approachingTitle, body: body, action: upgrade), step: step, key: "\(Int(usage.resetMs ?? 0))|\(step)")
  }

  /** "today", "tomorrow", else "on Monday", in the person's time zone (French "aujourd'hui", "demain", "lundi"). */
  static func day(_ date: Date, now: Date, timeZone: TimeZone) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
    if days <= 0 { return L10n.text("reset.today", default: "today") }
    if days == 1 { return L10n.text("reset.tomorrow", default: "tomorrow") }
    let format = DateFormatter()
    format.locale = L10n.locale(english: Locale(identifier: "en_US_POSIX"))
    format.timeZone = timeZone
    format.dateFormat = "EEEE"
    return L10n.text("reset.weekday", default: "on \(format.string(from: date))")
  }

  /** Where the banner's button goes (as Settings' Usage & Billing routes its own). */
  public enum Route: Equatable, Sendable {
    /** The App Store's plans, on the plan above when there is one (an Apple plan's upgrade). */
    case plans(tier: String?)
    /**
     * Stripe's own page for a plan bought on the web, asked for with the
     * app's sign-in (`/desktop/api/billing/portal`) and shown in the app,
     * back in it when done (14 October 2026): the web's billing page asked
     * the person to sign in again first, which the founder found confusing.
     * `payment_method` for a card that failed, `update_confirm` with the
     * plan above for an upgrade, else its front page.
     */
    case portal(flow: String?, tier: String?)
    /** simeonlabs.com for an account no plan can help; Apple's payment page; the web's plans page (the Mac). */
    case web(URL)
    /** A plan bought on the web, where Apple allows no link to it: no button (the App Store would sell a second plan). */
    case none
  }

  public static let paymentMethodFlow = "payment_method"
  public static let upgradeFlow = "update_confirm"

  public static func route(access: SandAccess, usage: UsageSummary?, webLinkAllowed: Bool) -> Route {
    if access.state == .unavailable { return .web(SandAccess.page) }
    // A failed payment: Stripe's card page for a plan bought on the web where Apple allows the link (never the App
    // Store's plans, which would sell a second plan); the plans for an Apple plan, which link to Apple's payment page.
    if let usage, usage.paymentFailed {
      if usage.billedByApple { return .plans(tier: nil) }
      return webLinkAllowed ? .portal(flow: paymentMethodFlow, tier: nil) : .none
    }
    guard let usage, let plan = usage.managePlan else { return .plans(tier: nil) }
    if usage.billedByApple { return .plans(tier: plan.nextTier?.tier) }
    guard webLinkAllowed else { return .none }
    // A plan bought on the web: Stripe's confirmation of the plan above, else its front page.
    if let next = plan.nextTier { return .portal(flow: upgradeFlow, tier: next.tier) }
    return .portal(flow: nil, tier: nil)
  }

  /** The plans say this above the plans when an Apple plan's payment failed (`appleBilling`). */
  public static func applePaymentFailed(_ usage: UsageSummary?) -> Bool {
    usage?.paymentFailed == true && usage?.billedByApple == true
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
    let body = words.title == weekUsedTitle ? L10n.text("They reset on Monday.") : L10n.text("Your agents wait until your plan has credits again.")
    return SandAccess.Words(title: words.title, body: body, action: nil)
  }

  /** The server's sentence for spent credits (402, code 40200), as the chat's card carries it. */
  public static func isOutOfCredits(_ tray: Tray) -> Bool {
    tray.detail.contains("(code 40200)") || tray.title.contains("(code 40200)")
  }
}

/**
 * What the Mac says when this account has no plan (the line over the
 * composer, and the cover over the window when the computer refuses the
 * account), and where its button goes (14 October 2026). The founder chose
 * the web for the Mac: the plans page, where the 30-day trial starts with
 * a card (the iPhone starts its free month itself, no card). Until then the
 * Mac showed the window's own "Start your free month" and its button opened
 * simeonlabs.com, where nothing starts a trial. A card that failed goes to
 * Stripe's card page in the app (`PhoneUpgrade.Route.portal`), not the
 * web's billing page, which asked to sign in first.
 */
public enum MacUpgrade {
  /** The web's plans page, from the app: it sends the person back to the app afterwards. The quota's `upgradeUrl` when there is one. */
  public static let billing = URL(string: "https://app.simeonlabs.com/billing?from=app")!

  public static func cover(access: SandAccess, usage: UsageSummary?) -> SandAccess.Words {
    guard access.state == .paymentRequired else { return access.cover }
    if let usage, usage.paymentFailed {
      if usage.billedByApple {
        return SandAccess.Words(title: PhoneUpgrade.paymentFailedTitle, body: PhoneUpgrade.paymentFailedApple, action: PhoneUpgrade.updatePayment)
      }
      return SandAccess.Words(title: PhoneUpgrade.paymentFailedTitle, body: PhoneUpgrade.paymentFailedCard, action: PhoneUpgrade.updateCard)
    }
    if access.reason == .freeTrialAvailable {
      return SandAccess.Words(title: L10n.text("Start your free trial to send messages"), body: L10n.text("30 days free, then your plan. Add a card on the web; cancel anytime."), action: L10n.text("Start Free Trial"))
    }
    if usage?.hasEndedTrial == true {
      return SandAccess.Words(title: L10n.text("Your free month has ended"), body: L10n.text("Choose a plan to send messages again."), action: PhoneUpgrade.seePlans)
    }
    return SandAccess.Words(title: L10n.text("Simeon needs a plan"), body: L10n.text("Choose a plan on the web to send messages."), action: PhoneUpgrade.seePlans)
  }

  /**
   * Where the button goes: Stripe's card page in the app for a card that
   * failed, Apple's payment page for a charge Apple bills, else the web's
   * plans page; Simeon Labs' page for an account no plan can help.
   */
  public static func route(access: SandAccess, usage: UsageSummary?) -> PhoneUpgrade.Route {
    guard access.state == .paymentRequired else { return .web(SandAccess.page) }
    if let usage, usage.paymentFailed {
      return usage.billedByApple ? .web(PhoneUpgrade.appleBilling) : .portal(flow: PhoneUpgrade.paymentMethodFlow, tier: nil)
    }
    return .web(usage?.upgrade?.url ?? billing)
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
