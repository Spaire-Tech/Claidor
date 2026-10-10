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

  // MARK: General (the box's host settings; a refused write keeps the old value and says nothing)

  /** The box's host settings, quietly: nil when they can't be read. */
  public func readHostSettings() async -> JSON? {
    try? await backend?.command("getHostSettings", [:])
  }

  /** A host setting written, quietly: false when refused. */
  public func writeHostSettings(_ update: JSON) async -> Bool {
    guard let backend else { return false }
    return (try? await backend.command("setHostSettings", update)) != nil
  }

  /** Timezone (`setTimeZoneOverride`): the zone the agents and routines use, or nil for the one this Mac is in. */
  public func setTimeZone(_ zone: String?, detected: String = TimeZone.current.identifier) async -> Bool {
    await writeHostSettings(["userTimeZone": .string(detected), "userTimeZoneOverride": .string(zone ?? "")])
  }

  /** Auto-review (`setAutoReviewInstructions`): its switch and its two lists of rules, as the host keeps them. */
  public func setAutoReview(_ instructions: AutoReviewInstructions) async -> Bool {
    await writeHostSettings(["autoReviewInstructions": AutoReviewInstructions.normalized(json: instructions.json).json])
  }

  /** The team admin's settings (`GetTeamAdminSettingsOrEmptyIfNotInTeam`); nil when they can't be read. */
  public func teamAdminSettings() async -> JSON? {
    try? await backend?.dashboard("GetTeamAdminSettingsOrEmptyIfNotInTeam", [:])
  }

  /**
   * A host setting the box must take (`localToolPermission`): written, then
   * read back, up to three times (250 and 500 ms apart) until the box says it.
   */
  public func pushHostSetting(_ key: String, _ value: JSON) async -> Bool {
    let waits: [UInt64] = [0, 250, 500]
    for wait in waits {
      if wait > 0 { try? await Task.sleep(nanoseconds: wait * 1_000_000) }
      guard await writeHostSettings([key: value]) else { continue }
      if await readHostSettings()?[key] == value { return true }
    }
    return false
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
