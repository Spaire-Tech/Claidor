import Foundation

/**
 * The free month (12 October 2026): thirty days of Simeon with no card,
 * started by the iPhone at the first sign-in (`POST billing/free-month`,
 * `server/simeon/plans/free_month.py`). One per person and one per iPhone:
 * the app sends the phone's DeviceCheck token, the server asks Apple
 * whether this iPhone already had one.
 *
 * Asked before the agents are loaded, so a new account's computer opens
 * on the month rather than on the plans. An answer that settles it
 * (started, running, a plan, or no month for this person or phone) is
 * remembered and not asked again until the next sign-in; one that does not
 * (`unavailable`, no server) is asked again at the next launch.
 */
public enum FreeMonth {
  public static let path = "billing/free-month"

  public enum Outcome: Equatable, Sendable {
    /** Begun now: thirty days from here. */
    case started(endsAt: Date?)
    /** Already running. */
    case running(endsAt: Date?)
    /** A plan, or billing off: nothing to start. */
    case notNeeded
    /** This person had a trial already (the free month, a card trial, Apple's free week). */
    case hadTrial
    /** This iPhone had its free month already. */
    case deviceUsed
    /** The server could not check the phone with Apple, or has no DeviceCheck key yet. */
    case unavailable
    /** The server could not be reached. */
    case failed

    /** Whether the answer settles it until the next sign-in. */
    public var settled: Bool {
      switch self {
      case .unavailable, .failed: return false
      default: return true
      }
    }

    init(json: JSON) {
      let ends = json["endsAt"]?.text.flatMap(FreeMonth.date)
      switch json["outcome"]?.text {
      case "started": self = .started(endsAt: ends)
      case "running": self = .running(endsAt: ends)
      case "not_needed": self = .notNeeded
      case "had_trial": self = .hadTrial
      case "device_used": self = .deviceUsed
      default: self = .unavailable
      }
    }
  }

  /**
   * Ask for the free month with this iPhone's DeviceCheck token
   * (`development` for a build run from Xcode, whose token only Apple's
   * development service knows). `server` is the backend's call to Simeon
   * Labs' `desktop/api` (`AgentBackend.server`).
   */
  public static func start(
    deviceToken: String, development: Bool,
    server: (String, String?, JSON?) async throws -> JSON
  ) async -> Outcome {
    let body: JSON = ["deviceToken": .string(deviceToken), "development": .bool(development)]
    do {
      return Outcome(json: try await server(path, "POST", body))
    } catch {
      return .failed
    }
  }

  static func date(_ text: String) -> Date? {
    let precise = ISO8601DateFormatter()
    precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return precise.date(from: text) ?? ISO8601DateFormatter().date(from: text)
  }
}
