import AppKit
import Foundation
import Security
import SimeonCore

/** The token pair in the Keychain, this Mac only (the same item the earlier Swift build used, so it stays signed in). */
final class MacKeychain: TokenVault, @unchecked Sendable {
  private let service = "com.simeonlabs.simeon.mac"
  private let account = "session"

  func read() -> SessionTokens? {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
    return try? JSONDecoder().decode(SessionTokens.self, from: data)
  }

  func write(_ tokens: SessionTokens?) {
    let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    SecItemDelete(base as CFDictionary)
    guard let tokens, let data = try? JSONEncoder().encode(tokens) else { return }
    var add = base
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(add as CFDictionary, nil)
  }
}

/**
 * Signing in as the Electron app does (`account-auth.ts`, `login.ts`): Sign
 * in opens `/loginDeepControl` in the person's own browser, the app polls
 * `/auth/poll` meanwhile, "Reopen link" opens the same page again and
 * Cancel stops. Signed in, the app reaches the person's computer ("Setting
 * up Simeon's computer") and then shows the window.
 */
@MainActor
@Observable
final class MacSession {
  enum Phase: Equatable {
    /** Reading the Keychain at launch. */
    case starting
    /** The sign-in screen, with a line under Sign in when the last one failed. */
    case signedOut(message: String?)
    /** "Continue in your browser". */
    case waitingForBrowser
    /** "Setting up Simeon's computer". */
    case settingUp
    case signedIn
  }

  private(set) var phase: Phase = .starting
  let store = AppStore()
  private let vault = MacKeychain()
  @ObservationIgnored private var api: SimeonAPI?
  @ObservationIgnored private var signing: Task<Void, Never>?
  @ObservationIgnored private var loginURL: URL?

  /** Simeon Labs' server, or a stand-in named by `SIMEON_API` (or `--api=`). */
  let server: URL = {
    let arguments = ProcessInfo.processInfo.arguments
    let named = arguments.first { $0.hasPrefix("--api=") }.map { String($0.dropFirst(6)) } ?? ProcessInfo.processInfo.environment["SIMEON_API"]
    return named.flatMap(URL.init(string:)) ?? SimeonConfig.defaultAPI
  }()

  /** How the app names itself to the server (`x-simeon-client-version`). */
  static var clientVersion: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    return "mac-\(version)+\(build)"
  }

  func start() async {
    guard phase == .starting else { return }
    if vault.read() != nil { await enter() } else { phase = .signedOut(message: nil) }
  }

  // MARK: Signing in

  /** Sign in: the login page in the browser, and the poll. */
  func signIn() {
    guard signing == nil else { return }
    let metadata = SignIn.freshMetadata()
    let url = SignIn.loginURL(api: server, metadata: metadata, redirectTarget: SimeonConfig.macURLScheme)
    loginURL = url
    phase = .waitingForBrowser
    NSWorkspace.shared.open(url)
    let server = server
    signing = Task { [weak self] in
      let outcome = await SignIn.poll(api: server, metadata: metadata, clientVersion: MacSession.clientVersion, http: URLSessionClient())
      guard let self, !Task.isCancelled else { return }
      self.signing = nil
      self.loginURL = nil
      switch outcome {
      case .tokens(let pair):
        self.vault.write(SessionTokens(pair: pair, nowMs: Date().timeIntervalSince1970 * 1000))
        await self.enter()
      case .stopped:
        self.phase = .signedOut(message: nil)
      case .refused:
        self.phase = .signedOut(message: "Sign-in on this device is restricted by your organization's device policy. Sign in with an allowed account to continue.")
      case .gaveUp:
        self.phase = .signedOut(message: "Sign-in did not finish. Try again.")
      }
    }
  }

  /** "Reopen link": the same login page again. */
  func reopenLink() {
    if let loginURL { NSWorkspace.shared.open(loginURL) }
  }

  /** Cancel: the poll stops and the sign-in screen comes back. */
  func cancelSignIn() {
    signing?.cancel()
    signing = nil
    loginURL = nil
    phase = .signedOut(message: nil)
  }

  // MARK: Signed in

  /** Reaches the person's computer with the pair in the Keychain: "Setting up Simeon's computer" until the agents are in. */
  private func enter() async {
    phase = .settingUp
    let api = SimeonAPI(base: server, clientVersion: Self.clientVersion, vault: vault)
    self.api = api
    let ended: @Sendable () -> Void = { [weak self] in Task { @MainActor in self?.ended() } }
    await api.onSessionEnded(ended)
    Task { [weak self] in
      guard let profile = try? await api.profile(), let self, self.api === api, let account = Account(profile: profile) else { return }
      self.store.account = account
    }
    await store.attach(LiveBackend(gateway: Gateway(api: api), api: api))
    guard self.api === api else { return }
    phase = .signedIn
  }

  /** View › Reload (⌘R): the window reads everything again from the computer, as the Electron window's reload does. */
  func reload() {
    guard phase == .signedIn, let backend = store.backend else { return }
    let account = store.account
    Task { [weak self] in
      guard let self else { return }
      await self.store.attach(backend)
      if self.store.account == nil { self.store.account = account }
    }
  }

  /** The server ended the sign-in (its refresh was refused): back to the sign-in screen (`SandAuthSignInExpiredError`). */
  private func ended() {
    store.detach()
    api = nil
    phase = .signedOut(message: "Your Simeon sign-in expired. Sign in again.")
  }

  /** Log out (the account menu's, a later step): the pair forgotten, the sign-in screen. */
  func signOut() async {
    store.detach()
    await api?.signOut()
    api = nil
    phase = .signedOut(message: nil)
  }
}
