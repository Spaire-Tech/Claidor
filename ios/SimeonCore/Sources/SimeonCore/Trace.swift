import Foundation

/**
 * What the app is doing, for finding what makes it hang: the last step it
 * started ("opening ava", "laying out ava, 512 rows"), read by the app's
 * hang watch when the screen stops answering, and slow steps written to the
 * console (Xcode's, when the app runs from it).
 */
public enum Trace {
  private static let step = LockedBox<(what: String, at: UInt64)>(("starting", 0))
  /** Where the lines go: the console by default. */
  nonisolated(unsafe) public static var log: (String) -> Void = { print($0) }

  public static var now: String { step.withLock { $0.what } }

  /** The last step and when it began (`DispatchTime`'s nanoseconds), read together: a step begun long before a freeze is not what froze. */
  public static var current: (what: String, at: UInt64) { step.withLock { $0 } }

  public static func mark(_ what: String) {
    let at = DispatchTime.now().uptimeNanoseconds
    step.withLock { $0 = (what, at) }
  }

  private static let tallies = LockedBox<[String: Int]>([:])

  /** One more of `what` (a view drawn, a callback run): during a freeze the hang watch writes what kept happening, so a loop shows as the counts that keep climbing. */
  public static func tally(_ what: String) { tallies.withLock { $0[what, default: 0] += 1 } }

  public static var tallied: [String: Int] { tallies.withLock { $0 } }

  /** Runs `work` and writes its time when it took longer than a frame (16 ms). */
  @discardableResult
  public static func timed<T>(_ what: @autoclosure () -> String, _ work: () throws -> T) rethrows -> T {
    let start = DispatchTime.now().uptimeNanoseconds
    let result = try work()
    let ms = Double(DispatchTime.now().uptimeNanoseconds - start) / 1e6
    if ms > 16 { log(String(format: "[simeon] slow: %@ took %.0f ms", what(), ms)) }
    return result
  }
}
