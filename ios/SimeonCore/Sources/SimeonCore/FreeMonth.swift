import Foundation

/**
 * The free month (12 October 2026): thirty days of Simeon with no card,
 * started by the iPhone at the first sign-in (`POST billing/free-month`,
 * `server/simeon/plans/free_month.py`). One per person, by account and
 * e-mail; never by device (19 October 2026): every account on one iPhone
 * has its own, so the app sends nothing about the phone.
 *
 * Asked before the agents are loaded, so a new account's computer opens
 * on the month rather than on the plans. An answer that settles it
 * (started, running, a plan, or a trial had before) is remembered and not
 * asked again until the next sign-in; one that does not (an answer this
 * app does not know, no server) is asked again at the next launch.
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
    /** An answer this app does not know. */
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
      default: self = .unavailable
      }
    }
  }

  /** Ask for the free month. `server` is the backend's call to Simeon Labs' `desktop/api` (`AgentBackend.server`). */
  public static func start(server: (String, String?, JSON?) async throws -> JSON) async -> Outcome {
    do {
      return Outcome(json: try await server(path, "POST", .object([:])))
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
