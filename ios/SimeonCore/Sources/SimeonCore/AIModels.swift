import Foundation
import Observation

/**
 * AI Models (8 November 2026; the founder: "allow people to bring their own
 * subscriptions and charge only for the computer", then "use codex sign
 * in"). The person connects their own ChatGPT account and chooses one of its
 * models; their agents then think, search and draw on it, not on Simeon's
 * credits (voice calls, dictation and video stay on Simeon's). Simeon Labs'
 * server keeps the sign-in, sealed, and makes the calls
 * (server/simeon/desktop/model_accounts.py, own_models.py); the apps only
 * show the accounts, run the sign-in and say which model is chosen.
 *
 * The sign-in is OpenAI's device code, under Codex's own sign-in until
 * OpenAI approves Simeon's: the app shows a code, the person enters it on
 * OpenAI's page (which names Codex) and approves, and the app asks the
 * server every few seconds until it says connected. Shared by the Mac
 * (mac/Simeon/SettingsModels.swift), the iPhone (ios/Simeon/AIModels.swift)
 * and, translated, the web and Windows app
 * (clients/apps/app/src/core/aiModels.ts).
 */
public struct ModelAccount: Identifiable, Equatable, Sendable {
  public enum Status: String, Sendable {
    case available
    /** The plan's limit was reached; calls go to the next account, then Simeon's, until `limitedUntil`. */
    case limited
    /** The provider ended the sign-in: the person connects again. */
    case signedOut = "signed_out"
  }

  public let id: String
  /** `chatgpt` for now. */
  public let provider: String
  /** `subscription` (a sign-in) or, later, `api_key`. */
  public let kind: String
  /** The account's e-mail, or the person's own name for it. */
  public let label: String
  /** The provider's plan as it names it (`plus`, `pro`), when it does. */
  public let plan: String?
  public let status: Status
  public let limitedUntil: Date?

  public init(id: String, provider: String, kind: String, label: String, plan: String?, status: Status, limitedUntil: Date? = nil) {
    self.id = id; self.provider = provider; self.kind = kind; self.label = label
    self.plan = plan; self.status = status; self.limitedUntil = limitedUntil
  }

  public init?(json: JSON?) {
    guard let json, let id = json["id"]?.text, let provider = json["provider"]?.text else { return nil }
    self.init(
      id: id,
      provider: provider,
      kind: json["kind"]?.text ?? "subscription",
      label: json["label"]?.text ?? AIModels.providerName(provider),
      plan: json["plan"]?.text,
      status: json["status"]?.string.flatMap(Status.init(rawValue:)) ?? .available,
      limitedUntil: json["limitedUntil"]?.double.map { Date(timeIntervalSince1970: $0 / 1000) }
    )
  }

  /** "ChatGPT". */
  public var providerName: String { AIModels.providerName(provider) }

  /** The line under its name: "Subscription · Plus". */
  public var detail: String {
    let kindWords = kind == "api_key" ? L10n.text("API key") : L10n.text("Subscription")
    guard let plan, !plan.isEmpty else { return kindWords }
    return "\(kindWords) · \(AIModels.planName(plan))"
  }

  /** How it stands, in a few words: "Usage available", "Limit reached until 4:00 PM", "Signed out". */
  public func statusWords(now: Date = Date(), timeZone: TimeZone = .current) -> String {
    switch status {
    case .available: return L10n.text("Usage available")
    case .signedOut: return L10n.text("Signed out. Connect again.")
    case .limited:
      guard let limitedUntil, limitedUntil > now else { return L10n.text("Usage available") }
      return L10n.text("Limit reached until \(AIModels.time(limitedUntil, now: now, timeZone: timeZone))")
    }
  }

  /** The status in green: usage there to use. */
  public func usable(now: Date = Date()) -> Bool {
    switch status {
    case .available: return true
    case .signedOut: return false
    case .limited: return (limitedUntil ?? .distantFuture) <= now
    }
  }
}

/** One of the person's accounts' models, as `GET models/own` lists them. */
public struct OwnModelChoice: Identifiable, Equatable, Sendable {
  /** `own:chatgpt:gpt-6.1-sol`, what the server and the engine name it. */
  public let id: String
  public let name: String
  public let provider: String

  public init(id: String, name: String, provider: String) {
    self.id = id; self.name = name; self.provider = provider
  }

  init?(json: JSON) {
    guard let id = json["modelId"]?.text else { return nil }
    self.init(id: id, name: json["modelName"]?.text ?? id, provider: json["provider"]?.text ?? "")
  }
}

/** A ChatGPT sign-in waiting for the person: the code, where to enter it, how often to ask. */
public struct ChatGPTSignIn: Equatable, Sendable {
  public let connectId: String
  public let userCode: String
  public let verificationURL: URL
  /** Seconds between two questions to the server. */
  public let interval: Int
  /** Seconds the code lasts (OpenAI's 15 minutes). */
  public let expiresIn: Int

  public init(connectId: String, userCode: String, verificationURL: URL, interval: Int, expiresIn: Int) {
    self.connectId = connectId; self.userCode = userCode; self.verificationURL = verificationURL
    self.interval = interval; self.expiresIn = expiresIn
  }

  init?(json: JSON) {
    guard let connectId = json["connectId"]?.text, let code = json["userCode"]?.text,
          let url = json["verificationUrl"]?.text.flatMap(URL.init(string:)) else { return nil }
    self.init(connectId: connectId, userCode: code, verificationURL: url,
              interval: max(1, json["interval"]?.int ?? 5), expiresIn: max(60, json["expiresIn"]?.int ?? 900))
  }

  /** The page's address without its scheme, as the sheet writes it: "auth.openai.com/codex/device". */
  public var shownAddress: String {
    let host = verificationURL.host ?? verificationURL.absoluteString
    let path = verificationURL.path
    return path.isEmpty || path == "/" ? host : host + path
  }
}

/** One answer of the server while the person approves. */
public enum ChatGPTPoll: Equatable, Sendable {
  case waiting
  case connected(ModelAccount)
  /** The code ran out, or was used already: the person starts again. */
  case expired
  /** OpenAI refused the sign-in. */
  case failed
}

public enum AIModels {
  public static let chatGPT = "chatgpt"

  /** A provider's name as people know it. */
  public static func providerName(_ provider: String) -> String {
    switch provider {
    case chatGPT: return "ChatGPT"
    default: return provider.prefix(1).uppercased() + provider.dropFirst()
    }
  }

  /** ChatGPT's plan as people know it: "plus" is Plus, "prolite" is Pro Lite. */
  public static func planName(_ plan: String) -> String {
    switch plan.lowercased() {
    case "prolite": return "Pro Lite"
    case "promax": return "Pro Max"
    case "edu": return "Edu"
    default:
      return plan.split(separator: "_").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }
  }

  /** "4:00 PM" today, else "Thu 4:00 PM", in the app's language. */
  static func time(_ date: Date, now: Date, timeZone: TimeZone) -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone
    let format = DateFormatter()
    format.locale = L10n.locale()
    format.timeZone = timeZone
    format.setLocalizedDateFormatFromTemplate(calendar.isDate(date, inSameDayAs: now) ? "jmm" : "EEEjmm")
    return format.string(from: date)
  }

  /** What the server's refusal of a sign-in means, in the person's words (`error.code` of `models/accounts/chatgpt/start`). */
  public static func startProblem(code: String?) -> String {
    switch code {
    case "device_code_off": return L10n.text("ChatGPT didn't allow signing in with a code. Check your ChatGPT security settings, then try again.")
    default: return L10n.text("Couldn't reach ChatGPT. Try again in a moment.")
    }
  }
}

@MainActor
@Observable
public final class AIModelsModel {
  public typealias Call = @MainActor (String, String?, JSON?) async throws -> JSON

  public private(set) var accounts: [ModelAccount] = []
  /** The models the person may choose (their accounts' signed-in providers'). */
  public private(set) var models: [OwnModelChoice] = []
  /** The model their agents use; nil for Simeon's. */
  public private(set) var chosen: String?
  public private(set) var loaded = false
  public private(set) var loading = false
  /** A change to the choice on its way. */
  public private(set) var choosing = false
  /** What went wrong, in the person's words; the page shows it. */
  public var problem: String?

  @ObservationIgnored private let call: Call
  @ObservationIgnored private let sleep: @Sendable (Int) async throws -> Void

  public init(call: @escaping Call, sleep: @escaping @Sendable (Int) async throws -> Void = { try await Task.sleep(nanoseconds: UInt64($0) * 1_000_000_000) }) {
    self.call = call
    self.sleep = sleep
  }

  public convenience init(store: AppStore) {
    self.init { [weak store] path, method, body in
      guard let backend = store?.backend else { throw SimeonAPIError(message: L10n.text("Sign in to Simeon first."), status: 401) }
      return try await backend.server(path, method: method, body: body)
    }
  }

  /** The chosen model's name, "Simeon's models" when none is. */
  public var chosenName: String {
    guard let chosen else { return AIModels.simeonsModels }
    return models.first { $0.id == chosen }?.name ?? AIModels.simeonsModels
  }

  /** Whether an account of this provider is connected and signed in. */
  public func connected(_ provider: String) -> Bool {
    accounts.contains { $0.provider == provider && $0.status != .signedOut }
  }

  public func load() async {
    guard !loading else { return }
    loading = true
    defer { loading = false }
    do {
      let listed = try await call("models/accounts", nil, nil)
      let own = try await call("models/own", nil, nil)
      accounts = (listed["accounts"]?.array ?? []).compactMap(ModelAccount.init(json:))
      read(own)
      loaded = true
      problem = nil
    } catch {
      problem = error.localizedDescription
    }
  }

  private func read(_ own: JSON) {
    models = (own["models"]?.array ?? []).compactMap(OwnModelChoice.init(json:))
    chosen = own["model"]?.text
  }

  /** A ChatGPT sign-in started: the code to show; nil (and `problem`) when none could be had. */
  public func startChatGPT() async -> ChatGPTSignIn? {
    do {
      let answer = try await call("models/accounts/chatgpt/start", "POST", [:])
      guard let signIn = ChatGPTSignIn(json: answer) else { throw SimeonAPIError(message: AIModels.startProblem(code: nil), status: 0) }
      problem = nil
      return signIn
    } catch let error as SimeonAPIError {
      problem = AIModels.startProblem(code: error.code)
      return nil
    } catch {
      problem = AIModels.startProblem(code: nil)
      return nil
    }
  }

  /** One question to the server: has the person approved? */
  public func poll(_ signIn: ChatGPTSignIn) async -> ChatGPTPoll {
    guard let answer = try? await call("models/accounts/chatgpt/poll", "POST", ["connectId": .string(signIn.connectId)]) else {
      // The server not reached this time: asked again at the next turn.
      return .waiting
    }
    switch answer["status"]?.string {
    case "connected":
      guard let account = ModelAccount(json: answer["account"]) else { return .failed }
      return .connected(account)
    case "expired": return .expired
    case "failed": return .failed
    default: return .waiting
    }
  }

  /**
   * Asks every `interval` seconds until the person has approved, the code
   * ran out, or the task is cancelled (the sheet closed: `.waiting`).
   * Connected, the page is read again, and the account's best model
   * chosen when the person had none, so connecting is using.
   */
  public func waitForApproval(_ signIn: ChatGPTSignIn) async -> ChatGPTPoll {
    var waited = 0
    while waited < signIn.expiresIn {
      do { try await sleep(signIn.interval) } catch { return .waiting }
      if Task.isCancelled { return .waiting }
      waited += signIn.interval
      let answer = await poll(signIn)
      switch answer {
      case .waiting: continue
      case .connected:
        await load()
        if chosen == nil, let best = models.first(where: { $0.provider == AIModels.chatGPT }) {
          await choose(best.id)
        }
        return answer
      case .expired, .failed:
        return answer
      }
    }
    return .expired
  }

  /** The person's own name for an account; an empty one is not sent. */
  public func rename(_ account: ModelAccount, to name: String) async {
    let next = name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    guard !next.isEmpty, next != account.label else { return }
    do {
      let answer = try await call("models/accounts/\(account.id)", "PATCH", ["label": .string(next)])
      if let renamed = ModelAccount(json: answer["account"]) {
        accounts = accounts.map { $0.id == renamed.id ? renamed : $0 }
      }
      problem = nil
    } catch {
      problem = L10n.text("Couldn't rename the account: \(error.localizedDescription)")
    }
  }

  /** Signed out at the provider and forgotten; the choice falls back to Simeon's when it was this provider's last account. */
  @discardableResult
  public func disconnect(_ account: ModelAccount) async -> Bool {
    do {
      _ = try await call("models/accounts/\(account.id)", "DELETE", nil)
      accounts.removeAll { $0.id == account.id }
      if let own = try? await call("models/own", nil, nil) { read(own) }
      problem = nil
      return true
    } catch {
      problem = L10n.text("Couldn't disconnect the account: \(error.localizedDescription)")
      return false
    }
  }

  /** The model the agents use: one of `models`, or nil for Simeon's. The agents follow within five minutes. */
  public func choose(_ model: String?) async {
    guard model != chosen else { return }
    choosing = true
    defer { choosing = false }
    do {
      let answer = try await call("models/own", "PUT", ["model": model.map(JSON.string) ?? .null])
      read(answer)
      problem = nil
    } catch {
      problem = L10n.text("Couldn't change the model: \(error.localizedDescription)")
    }
  }
}

extension AIModels {
  /** The menu's first choice: the agents on Simeon's own models. */
  public static var simeonsModels: String { L10n.text("Simeon's models") }
}
