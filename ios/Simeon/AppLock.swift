import LocalAuthentication
import SwiftUI
import SimeonCore

/**
 * Face ID for Simeon (the founder, 12 October 2026: ChatGPT's "unlocking
 * Simeon with Face ID when the app opens"). Offered once in the first run,
 * switched in Settings. When it is on, the app asks for Face ID when it
 * opens and when the person comes back after a quarter of an hour away (the
 * launch cover's rule); the iPhone's passcode does when Face ID can't.
 * On this phone only (it is the phone's own lock, not the account's).
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
    guard await Self.authenticate(reason: "Unlock Simeon with \(Self.name)") else { return false }
    UserDefaults.standard.set(true, forKey: Self.key)
    return true
  }

  func disable() {
    UserDefaults.standard.set(false, forKey: Self.key)
    locked = false
  }

  /** The app opened on a saved sign-in: locked until Face ID, when it is on. */
  func appOpened() {
    if Self.isOn { locked = true }
  }

  /** Signed out: nothing to lock. */
  func signedOut() {
    locked = false
    leftAt = nil
  }

  func scenePhase(_ phase: ScenePhase) {
    switch phase {
    case .background:
      if leftAt == nil { leftAt = Date() }
    case .active:
      if let left = leftAt, Self.isOn, Date().timeIntervalSince(left) > Self.after { locked = true }
      leftAt = nil
    default:
      break
    }
  }

  func unlock() async {
    guard locked else { return }
    if await Self.authenticate(reason: "Unlock Simeon") { locked = false }
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

/** Over the app while it is locked: the SimeonLabs mark and one button; Face ID is asked at once. */
struct AppLockCover: View {
  @State private var lock = AppLock.shared
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    if lock.locked {
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
          Task { await lock.unlock() }
        } label: {
          Label("Unlock with \(AppLock.name)", systemImage: AppLock.biometry == .touchID ? "touchid" : "faceid")
            .font(.system(size: 17, weight: .semibold))
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
        .buttonStyle(.glassProminent)
        .frame(maxWidth: 420)
        .padding(.horizontal, 24)
        .padding(.bottom, 24)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Ink.ground.ignoresSafeArea())
      .transition(.opacity)
      // Asked as soon as the app is in front (not while it is still coming up from the background).
      .task(id: scenePhase) {
        guard scenePhase == .active else { return }
        await lock.unlock()
      }
    }
  }
}
