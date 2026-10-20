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
 * Signing in, staying signed in, signing out. Apple's own sheet
 * (`AppleSignIn`) and Google's own page (`GoogleSignIn`), each answered
 * with the pair by Simeon Labs' server; the web sign-in (`SignIn`, the
 * Mac's) while the server has no Google client for the iPhone. The pair in
 * the Keychain.
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
   * run, the account): "Setting up Simeon's computer" shows
   * (`SettingUpScreen`, 19 October 2026, as on the Mac), rather than an
   * empty list (the founder, 9 October 2026: "it stays in a empty screen
   * waiting") or the sign-in screen with a spinner.
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
  /**
   * The hand-off (Simeon made, his introduction begun), out of sight while
   * the first run shows and after it if the computer is slow: running,
   * done, or failed with why.
   */
  enum HandOff: Equatable { case idle, running, done, failed(String) }
  private(set) var handOff: HandOff = .idle
  @ObservationIgnored private var simeonId: String?
  let store = AppStore()
  private let vault = KeychainVault()
  @ObservationIgnored private var api: SimeonAPI?
  @ObservationIgnored private var sheet: ASWebAuthenticationSession?
  /** The sign-in's poll, closed by Settings' Cancel (the sheet's own cancel calls nothing back). */
  @ObservationIgnored private var sheetState: SheetState?
  private let presenter = SheetPresenter()
  let launch = Launch.current

  /** The version as an update names it ("0.1.0"): the app's own (`MARKETING_VERSION`), without the platform or the build. */
  static var displayVersion: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
  }

  static var clientVersion: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    return "\(AppPlatform.clientPrefix)-\(version)+\(build)"
  }

  func start() async {
    // The phone shows the computer's rebuild (ComputerStates.swift): sending waits through it and the list holds still, as on
    // the Mac. Low disk is shown, but the automatic Disk Saver is left to the Mac, so two apps open do not each make one.
    store.followsRebuild = true
    store.startsDiskSaver = false
    if launch.signInScreen { phase = .signedOut(message: nil); return }
    if launch.demo {
      store.account = Account(name: "Bass Fall", email: "bass@simeonlabs.com")
      await store.attach(DemoBackend(seed: launch.onboarding ? .empty : DemoData.seed(gallery: launch.gallery), pace: 0.6))
      suggestedName = "Bass"
      firstRun = launch.onboarding ? .needed : .done
      phase = .signedIn
      return
    }
    if vault.read() != nil {
      // Face ID first, when the person turned it on (AppLock.swift).
      AppLock.shared.appOpened()
      await enter()
    } else {
      phase = .signedOut(message: nil)
    }
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
   * straight after a sign-in (`holding`) "Setting up Simeon's computer" stays, saying
   * so, until the agents are in, the first run is decided and the account
   * is known (a moment at most for that), so the list never shows empty and
   * the account button never shows a "?" (the founder, 9 October 2026).
   */
  private func enter(holding: Bool = false) async {
    let api = makeAPI()
    self.api = api
    // Signed in from here: the lock may close when the app comes back (AppLock.swift), never on this sign-in itself.
    AppLock.shared.markSignedIn()
    // A push for the chat on screen is not shown (Notifications.presentation).
    Notifications.shared.store = store
    firstRun = .checking
    // The last account seen on this phone, so its initials are there before the profile answers.
    if store.account == nil, let known = Self.rememberedAccount() { store.account = known; personName.value = known.name }
    if !holding { phase = .signedIn }
    // The voice call: ElevenLabs' kit on the phone, the Mac's call protocol in SimeonCore (LiveCall).
    // The computer's address kept from the last launch is used at once while the broker is asked (the Electron app's fast path).
    let backend = LiveBackend(gateway: Gateway(api: api, saved: Self.savedGateway), api: api)
    let names = personName
    let store = store
    #if os(macOS)
    // The Mac's: none while `SIMEON_VOICE_CALLS` switches calls off; a failed call stays on the banner until it is closed (or its 20 s); each step in `voice-call.log`.
    if voiceCallsEnabled() {
      backend.call = LiveCall(backend: backend, transport: ElevenLabsVoice(), personName: { names.value }, voiceFor: { agentId in await store.ensureVoice(agentId) }, tones: CallTonePlayer(), failedStays: nil, log: { VoiceCallLog.shared.write($0) })
    }
    #else
    // Each step of a call in the console (Xcode's, when the app runs from it), as the Mac's `voice-call.log` has them.
    backend.call = LiveCall(backend: backend, transport: ElevenLabsVoice(), personName: { names.value }, voiceFor: { agentId in await store.ensureVoice(agentId) }, tones: CallTonePlayer(), log: { line in Trace.log("[simeon] voice-call \(line)") })
    #endif
    // The profile is asked for first and applied the moment it answers, beside the roster.
    Task { [weak self] in
      guard let profile = try? await api.profile(), let self, self.api === api else { return }
      self.apply(profile: profile)
    }
    // The free month before the agents: a new account's computer opens on its thirty days, not on the plans.
    await FreeMonthAsk.ask(backend) { [weak self] in
      // The month began after the six seconds: the agents and the access, read again with it.
      guard let self, self.api === api else { return }
      await self.store.refreshAccess()
      await self.store.reloadRoster()
      await self.recheckFirstRun()
    }
    await store.attach(backend)
    // In-app purchase: renewals and approvals StoreKit delivers, and what this Apple ID already holds, to the server.
    Purchases.shared.start(store: store)
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

  /** Where the computer answered last time, beside the session in the Keychain (the Electron app's kept address); forgotten with the session. */
  private static let savedGateway = KeychainSavedGateway(service: AppPlatform.keychainService)

  /** The account's name, e-mail and id on this phone (not a secret: what Settings shows, and who approves a purchase), for the next launch before the profile answers. */
  private static func remember(_ account: Account?) {
    if let account { UserDefaults.standard.set(["name": account.name, "email": account.email, "id": account.id ?? ""], forKey: accountKey) } else { UserDefaults.standard.removeObject(forKey: accountKey) }
  }

  private static func rememberedAccount() -> Account? {
    guard let saved = UserDefaults.standard.dictionary(forKey: accountKey) as? [String: String], let name = saved["name"], let email = saved["email"] else { return nil }
    return Account(name: name, email: email, id: saved["id"].flatMap { $0.isEmpty ? nil : $0 })
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

  /**
   * Started as the first run shows: the computer, then Simeon made and his
   * introduction begun (`AppStore.handOff`), while the person gives a name
   * and answers the two questions. Once the first run is over his chat
   * opens, now or when he is made. Again after a failure, with no second
   * Simeon.
   */
  func beginHandOff() {
    switch handOff {
    case .running, .done: return
    default: break
    }
    handOff = .running
    let store = store
    // This sign-in's: an answer that comes after a sign-out is not the next account's.
    let signedIn = api
    Task { [weak self] in
      do {
        let id = try await store.handOff(ready: {})
        guard let self, self.api === signedIn else { return }
        self.simeonId = id
        self.handOff = .done
        if self.firstRun == .done, let id { Notifications.shared.openAgent = id }
      } catch {
        guard let self, self.api === signedIn else { return }
        let unreachable = GatewayError.neverArrived(error) || error is URLError
        self.handOff = .failed(unreachable ? Onboarding.unreachable : PlainWords.error(error.localizedDescription))
      }
    }
  }

  /** The first run is over: the list, with Simeon's chat open as soon as he is made. */
  func finishOnboarding() {
    firstRun = .done
    if handOff == .done, let simeonId { Notifications.shared.openAgent = simeonId }
    // Failed while the computer refused (no plan yet): tried again now.
    if case .failed = handOff { beginHandOff() }
    askForNotifications()
  }

  /** The first run's notifications screen: Apple's prompt now, then this phone registered; done once the person answers. */
  func askForNotificationsNow() async {
    guard let api, !askedForNotifications else { return }
    askedForNotifications = true
    await Notifications.shared.start(api: api)
  }

  /** Ask for notifications once signed in, and register this phone with Apple and Simeon Labs. */
  private func askForNotifications() {
    // The Mac shows its own notifications later (mac/PARITY.md §9); until then it asks for nothing.
    guard let api, !askedForNotifications, !AppPlatform.isMac else { return }
    askedForNotifications = true
    Task { await Notifications.shared.start(api: api) }
  }

  /** Signed out, or the account gone: nothing of this sign-in's first run is kept. */
  private func forgetFirstRun() {
    firstRun = .done
    handOff = .idle
    simeonId = nil
    AppLock.shared.signedOut()
  }

  private func ended() {
    // Already signed out here (Delete Account, Sign Out): a call made before, refused after, changes nothing and
    // does not replace what the sign-in screen says (14 October 2026: "Your account was deleted" became "sign-in ended").
    guard api != nil else { return }
    store.detach()
    Purchases.shared.stop()
    Notifications.shared.forget()
    FreeMonthAsk.forget()
    NotificationPictures.forget()
    Self.remember(nil)
    Self.savedGateway.write(nil)
    api = nil
    askedForNotifications = false
    forgetFirstRun()
    phase = .signedOut(message: String(localized: "Your Simeon sign-in ended. Sign in again."))
  }

  /**
   * The sign-in screen's Continue with Apple or Google. Apple: Apple's own
   * sheet (Face ID), then the pair straight from the server
   * (`signInWithApple`, 12 October 2026). Google: Google's own page, then
   * the pair straight from the server (`signInWithGoogle`, 12 October
   * 2026: the web page's "Continue as …" after Google's picker was a
   * duplicate); the web sign-in while the server has no Google client for
   * the iPhone.
   */
  func signIn(with provider: SignIn.Provider) async {
    if provider == .apple {
      await signInWithApple()
      return
    }
    guard phase != .signingIn else { return }
    phase = .signingIn
    signingInWith = provider
    defer { signingInWith = nil }
    if let google = await GoogleSignIn.config(api: launch.api, http: URLSessionClient()) {
      await signInWithGoogle(google)
      return
    }
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
      phase = .signedOut(message: String(localized: "This account can't sign in to Simeon here."))
    case .gaveUp:
      phase = .signedOut(message: String(localized: "Sign-in did not finish. Try again."))
    }
  }

  /**
   * Continue with Apple: Apple's sheet with a nonce made for this sign-in,
   * then what it gave to `POST /auth/apple` (`AppleSignIn`), which answers
   * the pair. Closing the sheet goes back to the sign-in screen quietly;
   * a refusal says the server's sentence.
   */
  private func signInWithApple() async {
    guard phase != .signingIn else { return }
    phase = .signingIn
    signingInWith = .apple
    defer { signingInWith = nil }
    let nonce = AppleSignIn.freshNonce()
    let credential: ASAuthorizationAppleIDCredential
    do {
      credential = try await AppleSignInSheet().run(hashedNonce: nonce.hashed)
    } catch let error as ASAuthorizationError where error.code == .canceled {
      phase = .signedOut(message: nil)
      return
    } catch {
      phase = .signedOut(message: AppleSignIn.failed)
      return
    }
    guard let identity = credential.identityToken.flatMap({ String(data: $0, encoding: .utf8) }) else {
      phase = .signedOut(message: AppleSignIn.failed)
      return
    }
    let code = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
    let outcome = await AppleSignIn.signIn(
      api: launch.api, identityToken: identity, authorizationCode: code, nonce: nonce,
      givenName: credential.fullName?.givenName, familyName: credential.fullName?.familyName,
      clientVersion: Self.clientVersion, http: URLSessionClient()
    )
    switch outcome {
    case .tokens(let pair):
      vault.write(SessionTokens(pair: pair, nowMs: Date().timeIntervalSince1970 * 1000))
      finishing = true
      await enter(holding: true)
      finishing = false
    case .refused(let message), .failed(let message):
      phase = .signedOut(message: message)
    }
  }

  /**
   * Continue with Google: Google's page in the system's sign-in sheet,
   * the account picker every time, the code back on the iPhone client's
   * own scheme, then the code and this sign-in's verifier to
   * `POST /auth/google`, which answers the pair. Closing the page goes
   * back to the sign-in screen quietly; a refusal says the server's
   * sentence.
   */
  private func signInWithGoogle(_ config: GoogleSignIn.Config) async {
    let attempt = GoogleSignIn.freshAttempt()
    guard let url = GoogleSignIn.authorizeURL(config, attempt: attempt), let scheme = config.callbackScheme else {
      phase = .signedOut(message: GoogleSignIn.failed)
      return
    }
    let callback: URL
    do {
      callback = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
        let once = ResumeOnce(continuation)
        let session = ASWebAuthenticationSession(url: url, callback: .customScheme(scheme)) { url, error in
          if let url { once.resume(returning: url) } else { once.resume(throwing: error ?? ASWebAuthenticationSessionError(.canceledLogin)) }
        }
        session.presentationContextProvider = presenter
        // Safari's cookies: Google knows the person's accounts, and its picker shows them.
        session.prefersEphemeralWebBrowserSession = false
        sheet = session
        if !session.start() { once.resume(throwing: URLError(.cannotLoadFromNetwork)) }
      }
    } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
      sheet = nil
      phase = .signedOut(message: nil)
      return
    } catch {
      sheet = nil
      phase = .signedOut(message: GoogleSignIn.failed)
      return
    }
    sheet = nil
    switch GoogleSignIn.code(from: callback, attempt: attempt) {
    case .cancelled:
      phase = .signedOut(message: nil)
    case .failed:
      phase = .signedOut(message: GoogleSignIn.failed)
    case .code(let code):
      let outcome = await GoogleSignIn.signIn(api: launch.api, code: code, attempt: attempt, clientVersion: Self.clientVersion, http: URLSessionClient())
      switch outcome {
      case .tokens(let pair):
        vault.write(SessionTokens(pair: pair, nowMs: Date().timeIntervalSince1970 * 1000))
        finishing = true
        await enter(holding: true)
        finishing = false
      case .refused(let message), .failed(let message):
        phase = .signedOut(message: message)
      }
    }
  }

  /** Log in or sign up (EmailSignInSheet) under way: its button on the sign-in screen shows the spinner. */
  private(set) var signingInWithEmail = false

  /** Log in or sign up's code to the email (`EmailSignIn`). */
  func emailCode(_ email: String) async -> EmailSignIn.Sent {
    await EmailSignIn.requestCode(api: launch.api, email: email, clientVersion: Self.clientVersion, http: URLSessionClient())
  }

  /** The code from the email, for the pair; not yet signed in (`signIn(with:)` enters). */
  func emailVerify(_ email: String, code: String) async -> EmailSignIn.Outcome {
    await EmailSignIn.verify(api: launch.api, email: email, code: code, clientVersion: Self.clientVersion, http: URLSessionClient())
  }

  /** The account's password, for the pair; not yet signed in (`signIn(with:)` enters). */
  func emailPassword(_ email: String, password: String) async -> EmailSignIn.Outcome {
    await EmailSignIn.password(api: launch.api, email: email, password: password, clientVersion: Self.clientVersion, http: URLSessionClient())
  }

  /** Log in or sign up's pair (a code or a password, 19 October 2026): kept as Apple's is, and the app entered. */
  func signIn(with pair: TokenPair) async {
    guard phase != .signingIn else { return }
    phase = .signingIn
    signingInWithEmail = true
    defer { signingInWithEmail = false }
    vault.write(SessionTokens(pair: pair, nowMs: Date().timeIntervalSince1970 * 1000))
    finishing = true
    await enter(holding: true)
    finishing = false
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

  /** Settings › Delete Account: nil once the account is gone (and the app signed out), else why not. */
  func deleteAccount() async -> String? {
    guard let api else { return String(localized: "Sign in to Simeon first.") }
    // When the answer never came but the account went (`SimeonAPI.deleteAccount`), the plan read before says whether Apple bills one.
    let applePlan = store.usage.summary?.billedByApple == true
    let appleRunsOn: Bool
    do {
      appleRunsOn = try await api.deleteAccount() || applePlan
    } catch {
      return PlainWords.error(error.localizedDescription, fallback: "Try again in a little while.")
    }
    // First, before anything waits: a late refusal of a call made before the delete is not a sign-out (`ended`).
    self.api = nil
    store.detach()
    Purchases.shared.stop()
    await Notifications.shared.stop()
    FreeMonthAsk.forget()
    NotificationPictures.forget()
    Self.remember(nil)
    Self.savedGateway.write(nil)
    askedForNotifications = false
    forgetFirstRun()
    // A plan bought through Apple keeps charging until the person cancels it there.
    phase = .signedOut(message: appleRunsOn ? AccountMenu.deletedApple : AccountMenu.deleted)
    return nil
  }

  func signOut() async {
    store.detach()
    Purchases.shared.stop()
    await Notifications.shared.stop()
    await api?.signOut()
    FreeMonthAsk.forget()
    NotificationPictures.forget()
    Self.remember(nil)
    Self.savedGateway.write(nil)
    api = nil
    askedForNotifications = false
    forgetFirstRun()
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

  /**
   * Connect (`Connecting`): the app added on the computer and its sign-in
   * opened at once, in one go; how the sign-in ended, or nil when none
   * opened (`store.problem` says why). One the person cancelled takes back
   * the app it added, so nothing is left added and not signed in; the
   * spinner stays until that is done, so a second Connect can't meet it.
   */
  @discardableResult
  func connect(_ name: String, store: AppStore) async -> SignInEnd? {
    guard connecting == nil else { return nil }
    connecting = name
    defer { connecting = nil; session = nil }
    guard let start = await store.beginConnect(named: name) else { return store.isConnected(name) ? SignInEnd.connected : nil }
    let end = await signIn(start.url, name: name, store: store) { store.isConnected(name) }
    if Connecting.undoes(end, start: start) { await store.undoConnect(start, name: name) }
    return end
  }

  /** One account of an app already added: its sign-in again (an account that needs it, from the app's page or Your plugins); how it ended. */
  @discardableResult
  func signIn(_ account: ConnectedApp, store: AppStore) async -> SignInEnd? {
    guard connecting == nil else { return nil }
    connecting = account.name
    defer { connecting = nil; session = nil }
    guard let url = await store.signInURL(account) else { return nil }
    return await signIn(url, name: account.name, store: store) { store.accounts(of: account.serverId).contains { $0.accountKey == account.accountKey && $0.status == "connected" } }
  }

  /**
   * The vendor's page in the system's sign-in sheet, closed by itself once
   * the box says the app is connected. A vendor that only sends sign-ins
   * back to `localhost:8787` (Canva, Square, Vercel, Dropbox) lands on this
   * iPhone's own loopback while the sheet is open (`LoopbackSignIn`).
   */
  private func signIn(_ url: URL, name: String, store: AppStore, done: @escaping () -> Bool) async -> SignInEnd {
    let url = Connecting.returning(url, to: AppPlatform.urlScheme)
    var catcher: LoopbackCatcher?
    if let signInState = LoopbackSignIn.state(returningHere: url) {
      guard let listening = await LoopbackCatcher.start(state: signInState, finish: "\(AppPlatform.urlScheme)://connected") else {
        store.problem = LoopbackSignIn.busyMessage(name)
        return .cancelled
      }
      catcher = listening
      Task { @MainActor in
        if let answer = await listening.answer() {
          listening.stop()
          await store.finishLoopbackSignIn(answer, name: name)
        }
      }
    }
    defer { catcher?.stop() }
    // A sign-in that returns through Simeon Labs' server comes back to this
    // app, which finishes it on its own computer: never the web page, which
    // used whichever account the browser held (`AppReturnSignIn`).
    if let returning = AppReturnSignIn.state(returningViaServer: url) {
      await store.sendSignInBack(state: returning, scheme: AppPlatform.urlScheme)
    }
    let state = SheetState()
    // Closed on the vendor's confirm page, or back on our address: look a little longer. Cancelled, or back saying it didn't work: two looks, then the buttons are free again (Cancel used to hold every Add for 20 s).
    let session = ASWebAuthenticationSession(url: url, callback: .customScheme(AppPlatform.urlScheme)) { callback, error in
      if let answer = AppReturnSignIn.answer(callback) {
        Task { @MainActor in await store.finishLoopbackSignIn(answer, name: name) }
        state.close(confirmed: answer.error == nil)
        return
      }
      state.close(confirmed: (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin && !Connecting.failed(callback))
    }
    session.presentationContextProvider = presenter
    session.prefersEphemeralWebBrowserSession = false
    self.session = session
    guard session.start() else {
      store.problem = String(localized: "The sign-in page didn't open. Try again.")
      return .cancelled
    }
    for _ in 0..<150 {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      await store.loadApps()
      if done() { session.cancel(); return .connected }
      if !state.keepGoing() { return state.ending }
    }
    session.cancel()
    return .unconfirmed
  }
}

/**
 * Stripe's own page for a plan bought on the web (14 October 2026, the
 * founder: Update card "takes me to the sign in page of simeon. not good"):
 * asked for with the app's sign-in (`AppStore.billingPortal`) and shown in
 * the system's sign-in sheet over the app, not the web's billing page. The
 * page ends on the app's own link (`/desktop/billing/back`), which closes
 * the sheet; after a failed payment the plan is then charged on the card
 * just saved, and the plan and the access read again, so Send comes back.
 * Safari when the sheet can't open.
 */
@MainActor
final class BillingPage {
  static let shared = BillingPage()
  private var session: ASWebAuthenticationSession?
  private let presenter = SheetPresenter()

  /** Opens the page; nil when it opened, else why not. */
  func open(flow: String?, tier: String?, store: AppStore, openURL: OpenURLAction) async -> String? {
    guard session == nil else { return nil }
    let paymentFailed = store.usage.summary?.paymentFailed == true
    let answer = await store.billingPortal(flow: flow, tier: tier, back: AppPlatform.urlScheme)
    guard let url = answer.url else { return answer.message ?? String(localized: "Couldn’t open billing. Try again.") }
    let finished: Bool
    do {
      _ = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
        let once = ResumeOnce(continuation)
        let sheet = ASWebAuthenticationSession(url: url, callback: .customScheme(AppPlatform.urlScheme)) { url, error in
          if let url { once.resume(returning: url) } else { once.resume(throwing: error ?? ASWebAuthenticationSessionError(.canceledLogin)) }
        }
        sheet.presentationContextProvider = presenter
        sheet.prefersEphemeralWebBrowserSession = false
        session = sheet
        if !sheet.start() {
          openURL(url)
          once.resume(throwing: URLError(.cannotLoadFromNetwork))
        }
      }
      finished = true
    } catch {
      // Closed before the end: nothing to charge; the plan is read again all the same.
      finished = false
    }
    session = nil
    await store.settleAfterCardPage(paymentFailed: paymentFailed && finished)
    return nil
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
  private var confirmed = false

  func close(confirmed: Bool) {
    lock.withLock { open = false; pollsLeft = confirmed ? 10 : 2; self.confirmed = confirmed }
  }

  /** How a sheet that closed before the app was connected ended: the person's Cancel, or closed on the vendor's page (it may still finish). */
  var ending: SignInEnd {
    lock.withLock { confirmed ? SignInEnd.unconfirmed : SignInEnd.cancelled }
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

/** A continuation resumed at most once: the sign-in sheet's own answer, or its failure to open, whichever comes first. */
final class ResumeOnce<T: Sendable>: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<T, Error>?

  init(_ continuation: CheckedContinuation<T, Error>) { self.continuation = continuation }

  func resume(returning value: T) {
    lock.withLock { () -> CheckedContinuation<T, Error>? in defer { continuation = nil }; return continuation }?.resume(returning: value)
  }

  func resume(throwing error: Error) {
    lock.withLock { () -> CheckedContinuation<T, Error>? in defer { continuation = nil }; return continuation }?.resume(throwing: error)
  }
}
