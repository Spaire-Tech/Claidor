import DeviceCheck
import Foundation
import SimeonCore

/**
 * The free month at a sign-in (SimeonCore's `FreeMonth`, 12 October 2026):
 * this iPhone's DeviceCheck token to Simeon Labs' server, which starts the
 * person's thirty free days unless they or this phone had them. Asked
 * before the agents load, six seconds at most: past that the app goes on,
 * and an answer that comes later still opens the computer (`whenStarted`).
 * Once the answer settles it, not again until the next sign-in.
 */
@MainActor
enum FreeMonthAsk {
  private static let askedKey = "simeon.freeMonthAsked"
  private static let longest: UInt64 = 6_000_000_000

  /** Waits for the answer or six seconds, whichever comes first; the request itself is never cut short. */
  static func ask(_ backend: AgentBackend, whenStarted: @escaping @MainActor () async -> Void) async {
    guard !UserDefaults.standard.bool(forKey: askedKey) else { return }
    let work = Task { @MainActor in await askNow(backend) }
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      let once = ResumeFlag()
      Task { @MainActor in
        let started = await work.value
        let late = !once.claim()
        if !late { continuation.resume() }
        // Answered after the app went on: the agents were read without the month; read them again now it is there.
        if late && started { await whenStarted() }
      }
      Task {
        try? await Task.sleep(nanoseconds: longest)
        if once.claim() { continuation.resume() }
      }
    }
  }

  /** Signed out, or the account deleted: the next sign-in asks again. */
  static func forget() {
    UserDefaults.standard.removeObject(forKey: askedKey)
  }

  /** True when the month started or was already running. */
  private static func askNow(_ backend: AgentBackend) async -> Bool {
    // The Simulator has no DeviceCheck: no free month there (the plans show instead).
    guard DCDevice.current.isSupported else {
      Trace.log("[simeon] free month: no DeviceCheck on this device")
      return false
    }
    let token: Data
    do {
      token = try await DCDevice.current.generateToken()
    } catch {
      Trace.log("[simeon] free month: no device token (\(error.localizedDescription))")
      return false
    }
    // A build signed for development (run from Xcode, whatever its configuration) has a token only Apple's development
    // DeviceCheck knows; the signing profile says which (as for push notifications).
    let development = Notifications.sandbox
    let outcome = await FreeMonth.start(deviceToken: token.base64EncodedString(), development: development) { path, method, body in
      try await backend.server(path, method: method, body: body)
    }
    Trace.log("[simeon] free month: \(outcome)")
    if outcome.settled { UserDefaults.standard.set(true, forKey: askedKey) }
    switch outcome {
    case .started, .running: return true
    default: return false
    }
  }
}

/** Claimed once: the first of two racers resumes the continuation, the other does nothing. */
final class ResumeFlag: @unchecked Sendable {
  private let lock = NSLock()
  private var claimed = false

  func claim() -> Bool {
    lock.withLock {
      if claimed { return false }
      claimed = true
      return true
    }
  }
}
