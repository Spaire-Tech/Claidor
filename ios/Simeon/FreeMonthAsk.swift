import DeviceCheck
import Foundation
import SimeonCore

/**
 * The free month at a sign-in (SimeonCore's `FreeMonth`, 12 October 2026):
 * this iPhone's DeviceCheck token to Simeon Labs' server, which starts the
 * person's thirty free days unless they or this phone had them. Asked
 * before the agents load, a few seconds at most, so a new account's
 * computer opens on the month; once the answer settles it, not again until
 * the next sign-in.
 */
@MainActor
enum FreeMonthAsk {
  private static let askedKey = "simeon.freeMonthAsked"
  private static let longest: UInt64 = 6_000_000_000

  static func ask(_ backend: AgentBackend) async {
    guard !UserDefaults.standard.bool(forKey: askedKey) else { return }
    await withTaskGroup(of: Void.self) { group in
      group.addTask { await askNow(backend) }
      group.addTask { try? await Task.sleep(nanoseconds: longest) }
      await group.next()
      group.cancelAll()
    }
  }

  /** Signed out, or the account deleted: the next sign-in asks again. */
  static func forget() {
    UserDefaults.standard.removeObject(forKey: askedKey)
  }

  private static func askNow(_ backend: AgentBackend) async {
    // The Simulator has no DeviceCheck: no free month there (the plans show instead).
    guard DCDevice.current.isSupported else {
      Trace.log("[simeon] free month: no DeviceCheck on this device")
      return
    }
    let token: Data
    do {
      token = try await DCDevice.current.generateToken()
    } catch {
      Trace.log("[simeon] free month: no device token (\(error.localizedDescription))")
      return
    }
    #if DEBUG
    // A build run from Xcode is signed for development: only Apple's development DeviceCheck knows its token.
    let development = true
    #else
    let development = false
    #endif
    let outcome = await FreeMonth.start(deviceToken: token.base64EncodedString(), development: development) { path, method, body in
      try await backend.server(path, method: method, body: body)
    }
    Trace.log("[simeon] free month: \(outcome)")
    if outcome.settled { UserDefaults.standard.set(true, forKey: askedKey) }
  }
}
