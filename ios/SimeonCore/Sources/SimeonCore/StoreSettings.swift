import Foundation

/**
 * Settings' Usage & Billing as the window keeps it (`kVn`, the usage
 * summary's store): read when Settings opens unless it was read in the last
 * 30 seconds, read again with Retry and after a trial is cancelled; a
 * failure keeps the last summary on screen. The Manage Plan card's two
 * buttons open Stripe's portal (`openSimeonBillingPortal`).
 */
extension AppStore {
  /** How long a summary is fresh enough not to be read again (`yVn`). */
  public static let usageFreshSeconds: TimeInterval = 30

  /** Settings opening: the summary read again unless it is fresh. */
  public func loadUsage(now: Date = Date()) async {
    if usage.isLoading { return }
    if let usageReadAt, now.timeIntervalSince(usageReadAt) < Self.usageFreshSeconds, case .ready = usage { return }
    await refreshUsage()
  }

  /** Retry, and after Cancel Trial: the server's quota as the Electron app summarises it. */
  public func refreshUsage() async {
    guard let backend else { usage = .empty; return }
    let previous = usage.summary
    usage = .loading(previous: previous)
    do {
      let quota = try await backend.server("user/quota", method: nil, body: nil)
      usage = .ready(UsageSummary(quota: quota))
      usageReadAt = Date()
    } catch {
      usage = .failed(previous: previous)
    }
  }

  /** Cancel Trial (`CancelSandTrial`): nil once it is done and the usage read again, else what to say in the dialog. */
  public func cancelTrial() async -> String? {
    guard let backend else { return "Sign in to Simeon to continue" }
    do {
      _ = try await backend.dashboard("CancelSandTrial", [:])
    } catch let error as SimeonAPIError where (400..<500).contains(error.status) && !error.message.isEmpty {
      return error.message
    } catch {
      return "Couldn’t cancel the trial. Try again."
    }
    // The trial's end changes what this account may do (`onTrialCanceled`).
    await refreshAccess()
    await refreshUsage()
    return nil
  }

  /** Whether this account may use Simeon (`GetSandAccessStatus`); "unknown" when it can't be read. */
  public func refreshAccess() async {
    guard let backend else { access = .checking; return }
    do {
      access = SandAccess(json: try await backend.dashboard("GetSandAccessStatus", [:]))
    } catch {
      access = .unknown
    }
  }

  /** The window's access cover (`czn`): the computer refused this account, the agents were never read, and no rebuild is under way. */
  public var showsAccessCover: Bool { accessBlocked && !hasReachedBox && !rebuild.isHardLocked }

  /**
   * Stripe's portal for the Manage Plan card: the confirmation of the next
   * plan up (`flow` "update_confirm" with its `tier`), or its front page. The
   * page's address, or the words to show under the card.
   */
  public func billingPortal(flow: String?, tier: String?) async -> (url: URL?, message: String?) {
    let fallback = "Couldn’t open billing. Try again."
    guard let backend else { return (nil, "Sign in to Simeon to continue") }
    var body: JSON = [:]
    if flow == "update_confirm", let tier { body = ["flow": "update_confirm", "tier": .string(tier)] }
    do {
      let answer = try await backend.server("billing/portal", method: "POST", body: body)
      guard let text = answer["portalUrl"]?.string, text.hasPrefix("https://"), let url = URL(string: text) else { return (nil, fallback) }
      return (url, nil)
    } catch {
      let message = error.localizedDescription
      return (nil, message.isEmpty ? fallback : message)
    }
  }
}
