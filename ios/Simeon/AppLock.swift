import LocalAuthentication
import SwiftUI
import UIKit
import SimeonCore

/**
 * Face ID for Simeon (the founder, 12 October 2026: ChatGPT's "unlocking
 * Simeon with Face ID when the app opens"). Offered once in the first run,
 * switched in Settings. When it is on, the app asks for Face ID when it
 * opens on a saved sign-in and when the person comes back after a quarter
 * of an hour away (the launch cover's rule); the iPhone's passcode does
 * when Face ID can't. On this phone only (it is the phone's own lock, not
 * the account's).
 *
 * The cover is a window of its own above the app's, so a sheet left open
 * (Settings, an agent's page, the plans) is under it too, and VoiceOver
 * reaches nothing behind it.
 */
@MainActor
@Observable
final class AppLock {
  static let shared = AppLock()
  static let key = "simeon.faceIDLock"
  /** Away this long, it asks again. */
  static let after: TimeInterval = 15 * 60

  private(set) var locked = false
  @ObservationIgnored private var leftAt: Date?
  /** Only a signed-in app locks: the sign-in screen has nothing to hide. */
  @ObservationIgnored private var signedIn = false
  /** Face ID is being asked now (the prompt makes the app inactive, then active again: not a reason to ask twice). */
  @ObservationIgnored private var asking = false
  /** Asked once by itself for this lock; after that only the button asks. */
  @ObservationIgnored private var askedThisLock = false
  @ObservationIgnored private var window: UIWindow?

  static var isOn: Bool { UserDefaults.standard.bool(forKey: key) }

  /** What the phone unlocks with: Face ID, Touch ID, or nothing (the first run then skips the step, Settings hides the switch). */
  static var biometry: LABiometryType {
    let context = LAContext()
    var error: NSError?
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else { return .none }
    return context.biometryType
  }

  static var available: Bool { biometry == .faceID || biometry == .touchID }
  /** "Face ID", or "Touch ID" on a phone with a button. */
  static var name: String { biometry == .touchID ? "Touch ID" : "Face ID" }

  /** On, once Face ID says it is the owner (the first time, iOS asks whether Simeon may use it). True when on. */
  func enable() async -> Bool {
    guard await Self.authenticate(reason: String(localized: "Unlock Simeon with \(Self.name)")) else { return false }
    UserDefaults.standard.set(true, forKey: Self.key)
    return true
  }

  func disable() {
    UserDefaults.standard.set(false, forKey: Self.key)
    set(locked: false)
  }

  /** The app opened on a saved sign-in: locked until Face ID, when it is on. */
  func appOpened() {
    signedIn = true
    guard Self.isOn else { return }
    set(locked: true)
    // Already in front (a cold start): ask now, as coming back to the app would.
    if UIApplication.shared.applicationState == .active {
      askedThisLock = true
      Task { await unlock() }
    }
  }

  /** Signed in (a fresh sign-in, or the saved one at launch): from now on coming back after a while locks. Never locks by itself. */
  func markSignedIn() {
    signedIn = true
  }

  /** Signed out: nothing to lock. */
  func signedOut() {
    signedIn = false
    leftAt = nil
    set(locked: false)
  }

  func scenePhase(_ phase: ScenePhase) {
    switch phase {
    case .background:
      if leftAt == nil { leftAt = Date() }
    case .active:
      if let left = leftAt, signedIn, Self.isOn, Date().timeIntervalSince(left) > Self.after { set(locked: true) }
      leftAt = nil
      // Locked at launch before the app's window existed: the cover now it does.
      if locked { showCover() }
      if locked && !askedThisLock {
        askedThisLock = true
        Task { await unlock() }
      }
    default:
      break
    }
  }

  func unlock() async {
    guard locked, !asking else { return }
    // A phone whose passcode was turned off can't be asked any more: nothing to unlock with, so nothing is locked.
    guard LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else {
      set(locked: false)
      return
    }
    asking = true
    defer { asking = false }
    if await Self.authenticate(reason: String(localized: "Unlock Simeon")) { set(locked: false) }
  }

  private func set(locked value: Bool) {
    if value && !locked { askedThisLock = false }
    locked = value
    if value { showCover() } else { hideCover() }
  }

  /** The cover's own window, over the app's and its sheets, in the app's light or dark. */
  private func showCover() {
    guard window == nil else { return }
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else { return }
    let cover = UIWindow(windowScene: scene)
    cover.windowLevel = .alert + 1
    cover.overrideUserInterfaceStyle = scene.windows.first?.overrideUserInterfaceStyle ?? .unspecified
    let host = UIHostingController(rootView: AppLockScreen())
    host.view.backgroundColor = Ink.groundUIColor
    cover.rootViewController = host
    cover.isHidden = false
    window = cover
  }

  private func hideCover() {
    window?.isHidden = true
    window = nil
  }

  private static func authenticate(reason: String) async -> Bool {
    let context = LAContext()
    do {
      return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
    } catch {
      return false
    }
  }
}

/** The cover: the SimeonLabs mark and one button (the first prompt comes by itself as the app comes forward). */
private struct AppLockScreen: View {
  var body: some View {
    VStack(spacing: 0) {
      Spacer()
      Image("SignIn/Mark").resizable().renderingMode(.template).scaledToFit().frame(width: 46, height: 46)
        .foregroundStyle(Ink.primary)
        .accessibilityHidden(true)
      Text("Simeon is locked")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(Ink.primary)
        .padding(.top, 24)
      Spacer()
      Button {
        Task { await AppLock.shared.unlock() }
      } label: {
        Label("Unlock with \(AppLock.name)", systemImage: AppLock.biometry == .touchID ? "touchid" : "faceid")
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(Ink.ground)
          .frame(maxWidth: .infinity)
          .frame(height: 52)
      }
      .buttonStyle(.glassProminent)
      .tint(Ink.primary)
      .frame(maxWidth: 420)
      .padding(.horizontal, 24)
      .padding(.bottom, 24)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground.ignoresSafeArea())
    .dynamicTypeSize(.large)
  }
}
