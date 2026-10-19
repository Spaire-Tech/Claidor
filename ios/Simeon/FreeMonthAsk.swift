import Foundation
import SimeonCore

/**
 * The free month at a sign-in (SimeonCore's `FreeMonth`, 12 October 2026):
 * Simeon Labs' server starts the person's thirty free days unless they had
 * a trial. Nothing about the phone is sent (19 October 2026: every account
 * on one iPhone has its own month). Asked before the agents load, six
 * seconds at most: past that the app goes on, and an answer that comes
 * later still opens the computer (`whenStarted`). Once the answer settles
 * it, not again until the next sign-in.
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
    let outcome = await FreeMonth.start { path, method, body in
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
