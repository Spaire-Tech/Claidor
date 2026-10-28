import Foundation

/**
 * The account menu at the sidebar's foot (`Xln`, its Weekly usage submenu
 * `Qln`), as the window words it: Weekly usage with its share, Settings,
 * About, Log out; the submenu's two figures and Usage & Billing; the sign-out
 * question it shares with Settings (`qon`). Step 10's spec.
 */
public enum AccountMenu {
  /** The initials' label (`aria-label`); the window gives the button no tooltip. */
  public static let opener = L10n.text("Open account menu")
  public static let title = L10n.text("Account")
  public static let weeklyUsage = L10n.text("Weekly usage")
  public static let settings = L10n.text("Settings")
  public static let about = L10n.text("About")
  public static let logOut = L10n.text("Log out")
  public static let onDemand = L10n.text("On-demand")
  public static let spendThisCycle = L10n.text("Spend this cycle")

  /** The sign-out question (`qon`): the menu's Log out and Settings' Sign Out ask the same. */
  public static let signOutTitle = L10n.text("Sign out?")
  public static let signOutLine = L10n.text("You’ll need to sign in again to use Simeon.")
  public static let signOutConfirm = L10n.text("Sign out")
  public static let signOutCancel = L10n.text("Cancel")

  /**
   * Settings' Delete Account, on the phone and the Mac alike: the question
   * before it, the line under the button, the sign-in screen's line after
   * it and the title over a refusal (the server's own sentence under it).
   * What goes is `server/simeon/desktop/account_deletion.py`'s list.
   */
  public static let deleteAccount = L10n.text("Delete Account")
  public static let deleteTitle = L10n.text("Delete your account?")
  public static let deleteLine = L10n.text("Your agents, their computers and files, your chats, memory and routines will be deleted, your apps disconnected and your subscription ended. This can’t be undone.")
  /** Under Delete Account, as short as the founder's reference has it (12 October 2026); the question that follows says what goes. */
  public static let deleteFooter = L10n.text("Permanently deletes your Simeon account. This can’t be undone.")
  public static let deleted = L10n.text("Your account was deleted.")
  /** Before and after deleting an account whose plan Apple bills: Apple keeps charging until the person cancels there. */
  public static let deleteAppleLine = L10n.text("Your subscription through Apple isn’t cancelled by this. Cancel it in Settings › your name › Subscriptions.")
  public static let deletedApple = L10n.text("Your account was deleted. Your subscription through Apple keeps running until you cancel it in Settings › your name › Subscriptions.")
  public static let deleteRefused = L10n.text("Couldn’t delete your account")

  /** What the menu shows of the usage: the share, when it resets, the on-demand spend against its limit. */
  public struct Reading: Equatable, Sendable {
    /** "38%" (`qct`). */
    public let percent: String
    /** "Resets in 4 days", "Resets today"; nil with no reset and no included limit (the row is then 30 high). */
    public let reset: String?
    /** "$12.4/$50" (`Kln`); nil without metered on-demand spend. */
    public let spend: String?
  }

  /**
   * The menu's reading, or nil for no Weekly usage row: nothing read yet,
   * no share in the quota, or a failed read (the window drops the last
   * reading then). While it is read again the last one stays. It always says
   * "Weekly usage" and "Resets", trial or not (`Qln`'s words), and counts
   * from when it was read, not from now.
   */
  public static func reading(_ load: UsageLoad, readAt: Date?) -> Reading? {
    let summary: UsageSummary?
    switch load {
    case .ready(let read): summary = read
    case .loading(let previous): summary = previous
    case .empty, .failed: summary = nil
    }
    guard let summary, let percent = summary.usagePercent else { return nil }
    let readMs = (readAt ?? Date()).timeIntervalSince1970 * 1000
    let reset = UsageMeters.countdown(summary.resetMs, now: readMs, verb: "Resets") ?? (summary.hasNonZeroIncludedLimit ? L10n.text("Resets in 7 days") : nil)
    var spend: String?
    if let onDemand = summary.onDemand, let limit = onDemand.limitCents, limit > 0 {
      spend = "\(UsageMeters.compactMoney(onDemand.usedCents))/\(UsageMeters.compactMoney(limit))"
    }
    return Reading(percent: UsageMeters.percent(percent), reset: reset, spend: spend)
  }
}

/**
 * About (`AVn`, `PVn`): the window's own dialog, from the account menu and
 * Simeon › About Simeon. Copy version info writes the window's three lines.
 */
public enum AboutSimeon {
  public static let name = "Simeon"
  public static let copyright = "Copyright © 2026 Spaire, Inc."
  public static let copy = L10n.text("Copy version info")
  public static let copied = L10n.text("Copied")
  /** How long "Copied" stays (`Grn`). */
  public static let copiedSeconds: TimeInterval = 1.2

  public static func versionLine(_ version: String) -> String { L10n.text("Version \(version)") }

  /** What Copy version info writes: the window's lines, word for word ("darwin" is the Mac's name there). */
  public static func versionInfo(version: String, track: String = "stable", os: String = "darwin") -> String {
    ["Version: \(version)", "Release Track: \(track)", "OS: \(os)"].joined(separator: "\n")
  }
}
