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

  /** Settings › Account › Password: whether the account has one (`GET /desktop/api/account/password`); nil when it can't be asked. */
  public func hasPassword() async -> Bool? {
    guard let backend else { return nil }
    return try? await backend.server(EmailSignIn.accountPasswordPath, method: "GET", body: nil)["set"]?.bool
  }

  /** Set or change the account's password (`PUT`, signed in): nil once it is saved, else the sentence to show ("Use at least 8 characters."). */
  public func setPassword(_ password: String) async -> String? {
    guard let backend else { return L10n.text("Sign in to Simeon first.") }
    do {
      _ = try await backend.server(EmailSignIn.accountPasswordPath, method: "PUT", body: ["password": .string(password)])
      return nil
    } catch let error as SimeonAPIError where !error.message.isEmpty {
      return error.message
    } catch {
      return L10n.text("The password wasn't saved. Try again.")
    }
  }

  /**
   * The name changed in Settings › Account (the founder, 22 October 2026:
   * "theres name there, but uneditable"): what the agents call the person,
   * as the first run's name step saves it (`POST user/name`); they take it
   * at their next turn after a few minutes at most. nil once saved, the
   * account showing it; else why not, the server's sentence when it says
   * one ("A name of 1 to 60 characters.").
   */
  public func changeName(_ typed: String) async -> String? {
    guard let backend else { return L10n.text("Sign in to Simeon first.") }
    let name = Onboarding.normalizedName(typed)
    do {
      _ = try await backend.server("user/name", method: "POST", body: ["name": .string(name)])
    } catch let error as SimeonAPIError where !error.message.isEmpty {
      return error.message
    } catch {
      return L10n.text("Couldn't change it")
    }
    if let account { self.account = Account(name: name, email: account.email, pictureURL: account.pictureURL, id: account.id) }
    return nil
  }

  /** Cancel Trial (`CancelSandTrial`): nil once it is done and the usage read again, else what to say in the dialog. */
  public func cancelTrial() async -> String? {
    guard let backend else { return L10n.text("Sign in to Simeon to continue") }
    do {
      _ = try await backend.dashboard("CancelSandTrial", [:])
    } catch let error as SimeonAPIError where (400..<500).contains(error.status) && !error.message.isEmpty {
      return error.message
    } catch {
      return L10n.text("Couldn’t cancel the trial. Try again.")
    }
    // The trial's end changes what this account may do (`onTrialCanceled`).
    await refreshAccess()
    await refreshUsage()
    return nil
  }

  // MARK: In-app purchase (the iPhone's; server/simeon/plans/app_store.py)

  /** The plans as the App Store sells them (`billing/apple/products`): nil when they can't be read. */
  public func applePlans() async -> ApplePlans? {
    guard let backend, let json = try? await backend.server("billing/apple/products", method: nil, body: nil) else { return nil }
    let plans = ApplePlans(json: json)
    return plans.plans.isEmpty ? nil : plans
  }

  /** What Simeon Labs' server said about purchases sent to it. */
  public struct ApplePurchaseAnswer: Equatable, Sendable {
    /** Nil once applied, else what to say. */
    public let message: String?
    /** Whether StoreKit may forget the transactions: applied, or refused for good (signed for another account). A failure to reach the server keeps them for the next launch. */
    public let finish: Bool
  }

  /**
   * StoreKit's signed transactions (and their renewal info) after a
   * purchase, a restore, or at launch, to Simeon Labs' server, which checks
   * Apple's signatures and starts the plan; the access and the usage are
   * read again once it has.
   */
  public func sendApplePurchases(_ signed: [String], renewals: [String]) async -> ApplePurchaseAnswer {
    guard let backend else { return ApplePurchaseAnswer(message: L10n.text("Sign in to Simeon to continue"), finish: false) }
    let body: JSON = ["signedTransactions": .array(signed.map { .string($0) }), "signedRenewalInfo": .array(renewals.map { .string($0) })]
    do {
      _ = try await backend.server("billing/apple/transactions", method: "POST", body: body)
    } catch let error as SimeonAPIError where (400..<500).contains(error.status) && !error.message.isEmpty {
      return ApplePurchaseAnswer(message: error.message, finish: true)
    } catch {
      return ApplePurchaseAnswer(message: L10n.text("Couldn’t reach Simeon to confirm the purchase. It’s confirmed the next time the app opens."), finish: false)
    }
    await refreshAccess()
    await refreshUsage()
    return ApplePurchaseAnswer(message: nil, finish: true)
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

  /**
   * The app's language (`AppLanguage`), told where text is written outside the app: the person's computer as the host
   * setting `userLanguage`, beside `userTimeZone` (the agents write in it, a call speaks it), and the account
   * (`POST user/profile`, for emails sent without a request). After every sign-in (`attach`); changing the language
   * relaunches the app, which tells it again. Quietly: a refusal is told again at the next launch.
   */
  public func tellLanguage(_ language: String = AppLanguage.current) async {
    guard let backend else { return }
    _ = try? await backend.command("setHostSettings", ["userLanguage": .string(language)])
    _ = try? await backend.server("user/profile", method: "POST", body: ["language": .string(language)])
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
   * Stripe's portal for the Manage Plan card and the banner over the
   * composer: the confirmation of the next plan up (`flow` "update_confirm"
   * with its `tier`), the card form for a payment that failed
   * (`payment_method`), or its front page. `back` is the app's URL scheme:
   * the page then ends on the app's own link, so the app's sheet closes
   * (14 October 2026; it ended on the web's billing page, which asks to sign
   * in). The page's address, or the words to show.
   */
  public func billingPortal(flow: String?, tier: String?, back: String? = nil) async -> (url: URL?, message: String?) {
    let fallback = L10n.text("Couldn’t open billing. Try again.")
    guard let backend else { return (nil, L10n.text("Sign in to Simeon to continue")) }
    var fields: [String: JSON] = [:]
    if flow == PhoneUpgrade.upgradeFlow, let tier {
      fields["flow"] = .string(PhoneUpgrade.upgradeFlow)
      fields["tier"] = .string(tier)
    } else if flow == PhoneUpgrade.paymentMethodFlow {
      fields["flow"] = .string(PhoneUpgrade.paymentMethodFlow)
    }
    if let back { fields["back"] = .string(back) }
    let body = JSON.object(fields)
    do {
      let answer = try await backend.server("billing/portal", method: "POST", body: body)
      guard let text = answer["portalUrl"]?.string, text.hasPrefix("https://"), let url = URL(string: text) else { return (nil, fallback) }
      return (url, nil)
    } catch {
      let message = PlainWords.error(error.localizedDescription, fallback: fallback)
      return (nil, message.isEmpty ? fallback : message)
    }
  }

  /**
   * Stripe's card page closed after a failed payment: the plan charged now
   * on the card just saved (`/desktop/api/billing/settle`), then the plan and
   * the access read again, so the line over the composer goes and Send comes
   * back at once when it went through.
   */
  public func settleAfterCardPage(paymentFailed: Bool) async {
    if paymentFailed, let backend {
      _ = try? await backend.server("billing/settle", method: "POST", body: [:])
    }
    await refreshAccess()
    await refreshUsage()
  }
}
