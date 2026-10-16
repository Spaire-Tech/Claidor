import Foundation

/**
 * Whether this account may use Simeon (`sandAccess`, from Simeon Labs'
 * `GetSandAccessStatus`), and the words the window has for each answer:
 * the composer's notice and its paused Send (`Qvn`, `T1t`, `gft`), and the
 * cover over the whole window when the computer refuses the account before
 * it was ever reached (`mzn`, `dzn`). Checked against those functions run
 * over every state and reason (Fixtures/access.json).
 */
public struct SandAccess: Equatable, Sendable {
  public enum State: String, Sendable, CaseIterable { case checking, unknown, granted, unavailable, paymentRequired }
  public enum Reason: String, Sendable, CaseIterable {
    case unspecified, none, teamPrivacyMode, teamSetupRequired, teamAccessRequired, notOffered, freeTrialAvailable, paywallIndividual, paywallTeamMember, paywallTeamAdmin
  }

  public struct Words: Equatable, Sendable {
    public let title: String
    public let body: String
    /** The button's word; none for an account nothing can be done for. */
    public let action: String?
  }

  public let state: State
  public let reason: Reason

  public static let checking = SandAccess(state: .checking, reason: .unspecified)
  public static let unknown = SandAccess(state: .unknown, reason: .unspecified)
  /** Where every button of the cover and the notice goes (`pft`): the patch's replacement won over the billing page. */
  public static let page = URL(string: "https://simeonlabs.com")!
  public static let tagline = "Your team of always-on agents that finish the work."

  public init(state: State, reason: Reason) { self.state = state; self.reason = reason }

  /** The server's numbers (`sandAccessStateFromWire`, `sandAccessBlockReasonFromWire`). */
  public init(json: JSON) {
    switch json["state"]?.int {
    case 1: state = .granted
    case 2: state = .unavailable
    case 3: state = .paymentRequired
    default: state = .unknown
    }
    let reasons: [Int: Reason] = [1: .none, 2: .teamPrivacyMode, 3: .teamSetupRequired, 4: .teamAccessRequired, 5: .notOffered, 6: .freeTrialAvailable, 7: .paywallIndividual, 8: .paywallTeamMember, 9: .paywallTeamAdmin]
    reason = json["blockReason"]?.int.flatMap { reasons[$0] } ?? .unspecified
  }

  private static let byReason: [Reason: Words] = [
    // In Simeon's own words: none of the plans or settings of the app it was built from (PlainWords, 13 October 2026).
    .teamPrivacyMode: Words(title: "Simeon isn’t available on this account", body: "Ask your team’s admin to turn it on.", action: "Check Access"),
    .teamSetupRequired: Words(title: "Simeon isn’t set up for your team yet", body: "Ask your team’s admin to finish setting it up.", action: "Check Access"),
    .teamAccessRequired: Words(title: "Simeon isn’t available on this account", body: "Ask your team’s admin to turn it on.", action: "Check Access"),
    .notOffered: Words(title: "Simeon isn’t available on this account", body: "There's nothing to set up or purchase here.", action: nil),
    .freeTrialAvailable: Words(title: "Start your free month to send messages", body: "This account can try Simeon now.", action: "Start Trial"),
    .paywallIndividual: Words(title: "Simeon needs a plan", body: "Choose a plan to send messages.", action: "See plans"),
    .paywallTeamMember: Words(title: "Simeon needs a plan", body: "Ask your team’s admin to add this account.", action: "Check Access"),
    .paywallTeamAdmin: Words(title: "Simeon needs a plan", body: "Choose a plan for this account to send messages.", action: "See plans"),
  ]

  /** The composer's notice (`T1t`): only while sending is off. */
  public var notice: Words? {
    switch state {
    case .checking, .unknown, .granted:
      return nil
    case .unavailable:
      return reasonWords ?? Words(title: "Simeon is not available for this account", body: "Sending is off until this account is given access. Check what it needs on the web.", action: "Check Access")
    case .paymentRequired:
      return reasonWords ?? Words(title: "Simeon is not included in this plan", body: "Sending is off until this account has Simeon. Check the options on the web.", action: "Check Access")
    }
  }

  private var reasonWords: Words? { reason == .unspecified || reason == .none ? nil : Self.byReason[reason] }

  /** The cover's words (`dzn`): the notice's, else that this account isn't set up for Simeon yet. */
  public var cover: Words {
    notice ?? Words(title: "Simeon isn’t available on this account yet", body: "Check what this account needs on the web.", action: "Check Access")
  }

  /** Send waits while this account has no Simeon (`gft`). */
  public var pausesSending: Bool { state == .unavailable || state == .paymentRequired }
}
