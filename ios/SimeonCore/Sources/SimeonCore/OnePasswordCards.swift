import Foundation

/**
 * The 1Password fill card (28 October 2026, `credential-request`, the host's
 * `shared/node/onepassword/onepassword-cards.ts`): at a sign-in on a page open
 * on the agent's computer, a login the person keeps in their 1Password vault
 * shared with Simeon. Fill, confirmed with Face ID or Touch ID on this device,
 * lets the computer type it into the page (`answerCredentialRequest`); the
 * card then says which went in. Not now is a decline. The username, password
 * and code never come here.
 */
public struct CredentialRequestCard: Hashable, Sendable {
  public enum State: String, Sendable { case open, filling, filled, failed, declined }
  public enum Outcome: String, Sendable { case filled, fillFailed, notFound }

  /** The login's name in 1Password: "Acme". */
  public let title: String
  /** The site the page is on: "acme.com". */
  public let site: String
  /** The agent's one sentence on why. */
  public let purpose: String
  public let state: State
  public let outcomes: [String: Outcome]
  public let note: String?

  public init(title: String, site: String, purpose: String, state: State = .open, outcomes: [String: Outcome] = [:], note: String? = nil) {
    self.title = title; self.site = site; self.purpose = purpose; self.state = state; self.outcomes = outcomes; self.note = note
  }

  init?(message: JSON, entry: Entry) {
    guard let credential = message["credential"], credential.object != nil else { return nil }
    let text = { (value: JSON?) -> String in value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let title = text(credential["title"]), site = text(credential["site"])
    guard !title.isEmpty, !site.isEmpty else { return nil }
    self.title = title
    self.site = site
    self.purpose = text(credential["purpose"])
    self.state = State(rawValue: text(entry["credentialState"])) ?? .open
    var outcomes: [String: Outcome] = [:]
    for (key, value) in entry["credentialOutcomes"]?.object ?? [:] { if let outcome = value.text.flatMap(Outcome.init(rawValue:)) { outcomes[key] = outcome } }
    self.outcomes = outcomes
    let note = text(entry["credentialNote"])
    self.note = note.isEmpty ? nil : note
  }

  /** The words under Face ID: "Fill your Acme login on acme.com". */
  public var confirmReason: String { L10n.text("Fill your \(title) login on \(site)") }

  /** The pill once answered. */
  public var statusLine: String? {
    switch state {
    case .open: return nil
    case .filling: return L10n.text("Filling in…")
    case .filled: return L10n.text("Filled")
    case .failed: return L10n.text("Not filled")
    case .declined: return L10n.text("Declined")
    }
  }

  /** "Username and password filled", what went in, in a line. */
  public var outcomeLine: String? {
    guard state == .filled else { return nil }
    let filled = ["username", "password", "otp"].filter { outcomes[$0] == .filled }
    switch (filled.contains("username"), filled.contains("password"), filled.contains("otp")) {
    case (true, true, true): return L10n.text("Username, password and code filled")
    case (true, true, false): return L10n.text("Username and password filled")
    case (false, true, true): return L10n.text("Password and code filled")
    case (false, true, false): return L10n.text("Password filled")
    case (true, false, _): return L10n.text("Username filled")
    case (false, false, true): return L10n.text("Code filled")
    case (false, false, false): return nil
    }
  }
}

/**
 * The 1Password connect card (28 October 2026, `onepassword-connect`): the
 * agent needs a login and 1Password isn't connected. On the Mac, Connect asks
 * the person's 1Password app (Touch ID) for a vault named "Shared with Simeon"
 * and a read-only key for it, and sends the key to the agent's computer
 * (`connectOnePassword`). On the iPhone it says to connect from the Mac. The
 * X is a decline (`dismissOnePasswordConnect`).
 */
public struct OnePasswordConnectCard: Hashable, Sendable {
  public enum State: String, Sendable { case open, connected, dismissed }

  public let reason: String?
  public let state: State
  /** The 1Password account it was connected with. */
  public let account: String?

  public init(reason: String?, state: State = .open, account: String? = nil) {
    self.reason = reason; self.state = state; self.account = account
  }

  init(message: JSON, entry: Entry) {
    let text = { (value: JSON?) -> String in value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let reason = text(message["reason"])
    self.reason = reason.isEmpty ? nil : reason
    self.state = State(rawValue: text(entry["connectState"])) ?? .open
    let account = text(entry["connectAccount"])
    self.account = account.isEmpty ? nil : account
  }

  public var statusLine: String? {
    switch state {
    case .open: return nil
    case .connected: return L10n.text("Connected")
    case .dismissed: return L10n.text("Dismissed")
    }
  }
}
