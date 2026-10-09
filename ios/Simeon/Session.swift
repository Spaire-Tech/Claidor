import AuthenticationServices
import Foundation
import Security
import SwiftUI
#if os(iOS)
import UIKit
#endif
import SimeonCore

/** The pair in the Keychain, this device only, readable after the first unlock (so a notification's tap finds it). */
final class KeychainVault: TokenVault, @unchecked Sendable {
  private let service = AppPlatform.keychainService
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
  /** The demo as a new account: no agents, the first run (`--onboarding`). */
  let onboarding: Bool
  /** The sign-in screen whatever the Keychain holds (`--sign-in`), for the screenshots. */
  let signInScreen: Bool
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
    let onboarding = arguments.contains("--onboarding")
    return Launch(demo: gallery || onboarding || arguments.contains("--demo") || environment["SIMEON_DEMO"] == "1", gallery: gallery, onboarding: onboarding, signInScreen: arguments.contains("--sign-in"), screen: value("screen"), theme: value("theme"), api: api)
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
  /** The sign-in screen's button whose sign-in is under way (it shows the spinner). */
  private(set) var signingInWith: SignIn.Provider?
  /**
   * Signed in, the app still loading (the agents, whether this is a first
   * run, the account): the sign-in screen stays and says so, rather than an
   * empty list (the founder, 9 October 2026: "it stays in a empty screen
   * waiting").
   */
  private(set) var finishing = false
  /** The first run (Onboarding.swift): being looked up, to do, or done. Only a new account does it. */
  enum FirstRunGate: Equatable { case checking, needed, done }
  private(set) var firstRun: FirstRunGate = .done
  /** The name the server suggests for the person (`user/profile`), for the onboarding's name step. */
  private(set) var suggestedName: String?
  /**
   * The person has not given a name yet (`user/profile` has no
   * `preferredName`): the Mac asks again after the first run (the window's
   * name sheet, `namePromptFromSimeon`).
   */
  var nameNeeded = false
  @ObservationIgnored private var askedForNotifications = false
  let store = AppStore()
  private let vault = KeychainVault()
  @ObservationIgnored private var api: SimeonAPI?
  @ObservationIgnored private var sheet: ASWebAuthenticationSession?
  /** The sign-in's poll, closed by Settings' Cancel (the sheet's own cancel calls nothing back). */
  @ObservationIgnored private var sheetState: SheetState?
  private let presenter = SheetPresenter()
  let launch = Launch.current

  static var clientVersion: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    return "\(AppPlatform.clientPrefix)-\(version)+\(build)"
  }

  func start() async {
    if launch.signInScreen { phase = .signedOut(message: nil); return }
    if launch.demo {
      store.account = Account(name: "Bass Fall", email: "bass@simeonlabs.com")
      await store.attach(DemoBackend(seed: launch.onboarding ? .empty : DemoData.seed(gallery: launch.gallery), pace: 0.6))
      suggestedName = "Bass"
      firstRun = launch.onboarding ? .needed : .done
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

  /**
   * Into the app. At launch (under the launch cover) the list shows at once;
   * straight after a sign-in (`holding`) the sign-in screen stays, saying
   * so, until the agents are in, the first run is decided and the account
   * is known (a moment at most for that), so the list never shows empty and
   * the account button never shows a "?" (the founder, 9 October 2026).
   */
  private func enter(holding: Bool = false) async {
    let api = makeAPI()
    self.api = api
    firstRun = .checking
    // The last account seen on this phone, so its initials are there before the profile answers.
    if store.account == nil, let known = Self.rememberedAccount() { store.account = known; personName.value = known.name }
    if !holding { phase = .signedIn }
    // The voice call: ElevenLabs' kit on the phone, the Mac's call protocol in SimeonCore (LiveCall).
    let backend = LiveBackend(gateway: Gateway(api: api), api: api)
    let names = personName
    let store = store
    #if os(macOS)
    // The Mac's: none while `SIMEON_VOICE_CALLS` switches calls off; a failed call stays on the banner until it is closed (or its 20 s); each step in `voice-call.log`.
    if voiceCallsEnabled() {
      backend.call = LiveCall(backend: backend, transport: ElevenLabsVoice(), personName: { names.value }, voiceFor: { agentId in await store.ensureVoice(agentId) }, tones: CallTonePlayer(), failedStays: nil, log: { VoiceCallLog.shared.write($0) })
    }
    #else
    backend.call = LiveCall(backend: backend, transport: ElevenLabsVoice(), personName: { names.value }, voiceFor: { agentId in await store.ensureVoice(agentId) }, tones: CallTonePlayer())
    #endif
    // The profile is asked for first and applied the moment it answers, beside the roster.
    Task { [weak self] in
      guard let profile = try? await api.profile(), let self, self.api === api else { return }
      self.apply(profile: profile)
    }
    await store.attach(backend)
    await checkFirstRun()
    guard holding, self.api === api else { return }
    let deadline = Date().addingTimeInterval(3)
    while store.account == nil && Date() < deadline { try? await Task.sleep(nanoseconds: 100_000_000) }
    phase = .signedIn
  }

  private func apply(profile: JSON) {
    guard let account = Account(profile: profile) else { return }
    store.account = account
    personName.value = account.name
    suggestedName = profile["preferredName"]?.text ?? profile["suggestedName"]?.text
    nameNeeded = profile["preferredName"]?.text == nil
    Self.remember(account)
  }

  private static let accountKey = "simeon.account"

  /** The account's name and e-mail on this phone (not a secret: what Settings shows), for its initials at the next launch. */
  private static func remember(_ account: Account?) {
    if let account { UserDefaults.standard.set(["name": account.name, "email": account.email], forKey: accountKey) } else { UserDefaults.standard.removeObject(forKey: accountKey) }
  }

  private static func rememberedAccount() -> Account? {
    guard let saved = UserDefaults.standard.dictionary(forKey: accountKey) as? [String: String], let name = saved["name"], let email = saved["email"] else { return nil }
    return Account(name: name, email: email)
  }

  /**
   * The Mac's start-up gate: a new account (never onboarded, no agents) gets
   * the first run. A computer that does not answer is asked once more after
   * 2.5 s; then the first run shows, as on the Mac, and steps aside if the
   * agents turn up (its hand-off checks again before making anything).
   */
  private func checkFirstRun() async {
    // Still signed in (the phase is still `signingIn` while a sign-in holds its screen): `api` goes on signing out.
    let entered = api
    var answer = await store.firstRun()
    if answer == .unknown && entered != nil && api === entered {
      try? await Task.sleep(nanoseconds: 2_500_000_000)
      if store.agents.isEmpty { answer = await store.firstRun() } else { answer = .seen }
    }
    guard entered != nil, api === entered else { return }
    firstRun = answer == .seen ? .done : .needed
    if firstRun == .done { askForNotifications() }
  }

  /** The first run is over: Simeon's chat opens (when he was just made), and only now does the phone ask about notifications. */
  func finishOnboarding(opening agentId: String?) {
    if let agentId { Notifications.shared.openAgent = agentId }
    firstRun = .done
    askForNotifications()
  }

  /** Ask for notifications once signed in, and register this phone with Apple and Simeon Labs. */
  private func askForNotifications() {
    // The Mac shows its own notifications later (mac/PARITY.md §9); until then it asks for nothing.
    guard let api, !askedForNotifications, !AppPlatform.isMac else { return }
    askedForNotifications = true
    Task { await Notifications.shared.start(api: api) }
  }

  private func ended() {
    store.detach()
    Notifications.shared.forget()
    Self.remember(nil)
    api = nil
    askedForNotifications = false
    firstRun = .done
    phase = .signedOut(message: "Your Simeon sign-in ended. Sign in again.")
  }

  /** The sign-in screen's Continue with Apple or Google: the sheet goes straight to that sign-in (`provider` on `/loginDeepControl`). */
  func signIn(with provider: SignIn.Provider) async {
    guard phase != .signingIn else { return }
    phase = .signingIn
    signingInWith = provider
    defer { signingInWith = nil }
    let metadata = SignIn.freshMetadata()
    let state = SheetState()
    sheetState = state
    defer { sheetState = nil }
    let session = ASWebAuthenticationSession(url: SignIn.loginURL(api: launch.api, metadata: metadata, provider: provider, redirectTarget: AppPlatform.urlScheme), callback: .customScheme(AppPlatform.urlScheme)) { url, _ in
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
      finishing = true
      await enter(holding: true)
      finishing = false
    case .stopped:
      phase = .signedOut(message: nil)
    case .refused:
      phase = .signedOut(message: "This account can't sign in to Simeon here.")
    case .gaveUp:
      phase = .signedOut(message: "Sign-in did not finish. Try again.")
    }
  }

  /** Settings' Cancel while signing in: the sign-in sheet closed, as its own Cancel does. */
  func cancelSignIn() {
    sheetState?.close(confirmed: false)
    sheet?.cancel()
  }

  /** The first run decided again (after the access cover: the computer could not be asked before). */
  func recheckFirstRun() async {
    guard firstRun != .done else { return }
    await checkFirstRun()
  }

  func signOut() async {
    store.detach()
    await Notifications.shared.stop()
    await api?.signOut()
    Self.remember(nil)
    api = nil
    askedForNotifications = false
    firstRun = .done
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
    let session = ASWebAuthenticationSession(url: url, callback: .customScheme(AppPlatform.urlScheme)) { _, error in
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
    #if os(iOS)
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.flatMap(\.windows).first { return window }
    // A sign-in is only ever started from the app's own window, so there is a scene to make one in.
    return UIWindow(windowScene: scenes[0])
    #else
    // The Mac: the window the sign-in was started from.
    return NSApp.keyWindow ?? NSApp.mainWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
    #endif
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

  /**
   * The poll's pause, cut short when the sheet closes. The pause grows to
   * 10 s while the person is on Google's or Apple's page, and one begun
   * before the sheet closed used to run to its end: up to ten seconds on
   * the sign-in screen after the person had confirmed (the founder, 9
   * October 2026: "its lagging terrible"). Once closed, half a second
   * between asks (the pair is written as the page answers the confirm).
   */
  func wait(_ seconds: Double) async {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline {
      if !lock.withLock({ open }) {
        try? await Task.sleep(nanoseconds: 500_000_000)
        return
      }
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
  }
}
