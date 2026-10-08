import AuthenticationServices
import Foundation
import Security
import SwiftUI
import UIKit
import SimeonCore

/** The pair in the Keychain, this device only, readable after the first unlock (so a notification's tap finds it). */
final class KeychainVault: TokenVault, @unchecked Sendable {
  private let service = "com.simeonlabs.simeon.ios"
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

/** What the app was started with: the demo, a screen to open, a theme (the screenshots), another server (a stand-in on a Mac). */
struct Launch {
  let demo: Bool
  /** The demo with a chat of every card the Mac draws ("Cards"), for the screenshots. */
  let gallery: Bool
  let screen: String?
  let theme: String?
  let api: URL

  static let current: Launch = {
    let arguments = ProcessInfo.processInfo.arguments
    let environment = ProcessInfo.processInfo.environment
    let value = { (name: String) -> String? in
      arguments.first { $0.hasPrefix("--\(name)=") }.map { String($0.dropFirst(name.count + 3)) } ?? environment["SIMEON_\(name.uppercased())"]
    }
    let api = value("api").flatMap(URL.init(string:)) ?? SimeonConfig.defaultAPI
    let gallery = arguments.contains("--gallery")
    return Launch(demo: gallery || arguments.contains("--demo") || environment["SIMEON_DEMO"] == "1", gallery: gallery, screen: value("screen"), theme: value("theme"), api: api)
  }()
}

/**
 * Signing in, staying signed in, signing out. The sign-in is the Mac's:
 * the system's sign-in sheet on `/loginDeepControl`, `/auth/poll` meanwhile
 * (SimeonCore's SignIn), the pair in the Keychain.
 */
@MainActor
@Observable
final class SessionController {
  enum Phase: Equatable {
    case starting
    case signedOut(message: String?)
    case signingIn
    case signedIn
  }

  private(set) var phase: Phase = .starting
  let store = AppStore()
  private let vault = KeychainVault()
  @ObservationIgnored private var api: SimeonAPI?
  @ObservationIgnored private var sheet: ASWebAuthenticationSession?
  private let presenter = SheetPresenter()
  let launch = Launch.current

  static var clientVersion: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    return "ios-\(version)+\(build)"
  }

  func start() async {
    if launch.demo {
      store.account = Account(name: "Bass Fall", email: "bass@simeonlabs.com")
      await store.attach(DemoBackend(seed: DemoData.seed(gallery: launch.gallery), pace: 0.6))
      phase = .signedIn
      return
    }
    if vault.read() != nil { await enter() } else { phase = .signedOut(message: nil) }
  }

  private func makeAPI() -> SimeonAPI {
    let api = SimeonAPI(base: launch.api, clientVersion: Self.clientVersion, vault: vault)
    let ended: @Sendable () -> Void = { [weak self] in Task { @MainActor in self?.ended() } }
    Task { await api.onSessionEnded(ended) }
    return api
  }

  private let personName = PersonNameBox()

  private func enter() async {
    let api = makeAPI()
    self.api = api
    phase = .signedIn
    // The voice call: ElevenLabs' kit on the phone, the Mac's call protocol in SimeonCore (LiveCall).
    let backend = LiveBackend(gateway: Gateway(api: api), api: api)
    let names = personName
    backend.call = LiveCall(backend: backend, transport: ElevenLabsVoice(), personName: { names.value })
    await store.attach(backend)
    // Ask for notifications once signed in, and register this phone with Apple and Simeon Labs.
    Task { await Notifications.shared.start(api: api) }
    if let profile = try? await api.profile() {
      store.account = Account(profile: profile)
      names.value = store.account?.name
    }
  }

  private func ended() {
    store.detach()
    Notifications.shared.forget()
    api = nil
    phase = .signedOut(message: "Your Simeon sign-in ended. Sign in again.")
  }

  func signIn() async {
    phase = .signingIn
    let metadata = SignIn.freshMetadata()
    let state = SheetState()
    let session = ASWebAuthenticationSession(url: SignIn.loginURL(api: launch.api, metadata: metadata), callback: .customScheme(SimeonConfig.urlScheme)) { url, _ in
      // Confirmed (the page opened simeon-ios://…) or closed: poll a little longer either way, as the Mac's pair is written as the page is answered.
      state.close(confirmed: url != nil)
    }
    session.presentationContextProvider = presenter
    session.prefersEphemeralWebBrowserSession = false
    sheet = session
    session.start()

    let outcome = await SignIn.poll(
      api: launch.api, metadata: metadata, clientVersion: Self.clientVersion, http: URLSessionClient(),
      wait: { seconds in await state.wait(seconds) },
      keepGoing: { state.keepGoing() }
    )
    sheet?.cancel()
    sheet = nil
    switch outcome {
    case .tokens(let pair):
      vault.write(SessionTokens(pair: pair, nowMs: Date().timeIntervalSince1970 * 1000))
      await enter()
    case .stopped:
      phase = .signedOut(message: nil)
    case .refused:
      phase = .signedOut(message: "This account can't sign in to Simeon here.")
    case .gaveUp:
      phase = .signedOut(message: "Sign-in did not finish. Try again.")
    }
  }

  func signOut() async {
    store.detach()
    await Notifications.shared.stop()
    await api?.signOut()
    api = nil
    phase = .signedOut(message: nil)
  }
}

/**
 * Connecting an app the way the Mac's card does (`authenticateServer` with
 * the trigger `connector_card`): the vendor's sign-in in the system's
 * sign-in sheet, which shares Safari's cookies. The vendor sends the person
 * back to Simeon Labs' page, which hands the code to the box; meanwhile the
 * app asks the box every two seconds, and closes the sheet itself the
 * moment the box says the app is connected.
 */
@MainActor
@Observable
final class AppConnector {
  static let shared = AppConnector()
  @ObservationIgnored private var session: ASWebAuthenticationSession?
  private let presenter = SheetPresenter()
  private(set) var connecting: String?

  func connect(_ name: String, store: AppStore) async {
    guard connecting == nil else { return }
    connecting = name
    defer { connecting = nil; session = nil }
    guard let url = await store.connectApp(named: name) else { return }
    await signIn(url, store: store) { store.isConnected(name) }
  }

  /** One account of an app already added: its sign-in again (an account that needs it, from the app's page). */
  func signIn(_ account: ConnectedApp, store: AppStore) async {
    guard connecting == nil else { return }
    connecting = account.name
    defer { connecting = nil; session = nil }
    guard let url = await store.signInURL(account) else { return }
    await signIn(url, store: store) { store.accounts(of: account.serverId).contains { $0.accountKey == account.accountKey && $0.status == "connected" } }
  }

  /** The vendor's page in the system's sign-in sheet, closed by itself once the box says the app is connected. */
  private func signIn(_ url: URL, store: AppStore, done: @escaping () -> Bool) async {
    let state = SheetState()
    // Closed on the vendor's confirm page: look a little longer. Cancelled: two looks, then the buttons are free again (Cancel used to hold every Add for 20 s).
    let session = ASWebAuthenticationSession(url: url, callback: .customScheme(SimeonConfig.urlScheme)) { _, error in
      state.close(confirmed: (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin)
    }
    session.presentationContextProvider = presenter
    session.prefersEphemeralWebBrowserSession = false
    self.session = session
    guard session.start() else {
      store.problem = "The sign-in page didn't open. Try again."
      return
    }
    for _ in 0..<150 {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      await store.loadApps()
      if done() { session.cancel(); return }
      if !state.keepGoing() { return }
    }
    session.cancel()
  }
}

/** Where the sign-in sheet shows: the app's window. */
final class SheetPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.flatMap(\.windows).first { return window }
    // A sign-in is only ever started from the app's own window, so there is a scene to make one in.
    return UIWindow(windowScene: scenes[0])
  }
}

/**
 * The sheet and the poll, together (mobile/src/native/session.ts): while the
 * sheet is open the poll keeps the Mac's backoff; once it closed on the
 * confirm page the poll looks each second ten more times, and twice more if
 * the person closed it themselves.
 */
final class SheetState: @unchecked Sendable {
  private let lock = NSLock()
  private var open = true
  private var pollsLeft = 0

  func close(confirmed: Bool) {
    lock.withLock { open = false; pollsLeft = confirmed ? 10 : 2 }
  }

  func keepGoing() -> Bool {
    lock.withLock {
      if open { return true }
      if pollsLeft <= 0 { return false }
      pollsLeft -= 1
      return true
    }
  }

  func wait(_ seconds: Double) async {
    let isOpen = lock.withLock { open }
    try? await Task.sleep(nanoseconds: UInt64((isOpen ? seconds : 1) * 1_000_000_000))
  }
}
