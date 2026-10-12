import Foundation

/**
 * What the iPhone says when this account can't send (the founder, 12
 * October 2026: "we have the usage banner saying they're out of usage and
 * that they should upgrade"), and where it sends the person: always the
 * plans sheet.
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
   * credits are read from the usage summary, or from the server's 402 in a
   * chat's card (`outOfCredits`) before the summary has been read again.
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
    let spent = outOfCredits || usage.map { !$0.hasAvailableUsage && $0.hasNonZeroIncludedLimit } == true
    guard spent else { return nil }
    if usage?.isTrial == true {
      return SandAccess.Words(title: "You’ve used your free credits", body: "Choose a plan to keep your agents working.", action: upgrade)
    }
    if let usage, usage.hasNonZeroIncludedLimit, !usage.isTrial {
      return SandAccess.Words(title: "This week’s credits are used", body: "They reset on Monday. Upgrade to keep going now.", action: upgrade)
    }
    return SandAccess.Words(title: "You’re out of credits", body: "Choose a plan to keep your agents working.", action: upgrade)
  }

  /** The server's sentence for spent credits (402, code 40200), as the chat's card carries it. */
  public static func isOutOfCredits(_ tray: Tray) -> Bool {
    tray.detail.contains("(code 40200)") || tray.title.contains("(code 40200)")
  }
}
