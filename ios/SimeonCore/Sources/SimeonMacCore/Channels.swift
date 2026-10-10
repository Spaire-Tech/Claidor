import Foundation
import SimeonCore

/**
 * An agent's messaging channels (Discord, Slack: a bot the person owns,
 * run from the box), as the host's `getAgentChannels` answers and the
 * window's Channels view draws them (`_0n`, `B0n`, `A0n`, `P0n`, `O0n`).
 */
public struct ChannelsView: Equatable, Sendable {
  public struct Manifest: Equatable, Sendable {
    public let platform: String
    public let displayName: String
    public let blurb: String
    public let credentialLabel: String
    public let availability: String
  }

  public struct Connection: Equatable, Sendable {
    public let platform: String
    public let label: String
    /** `configured`, `connecting`, `connected`, `pending`, `error`. */
    public let status: String
    public let detail: String?
  }

  public var manifests: [Manifest]
  public var connections: [Connection]

  public static let empty = ChannelsView(manifests: [], connections: [])

  public init(manifests: [Manifest], connections: [Connection]) {
    self.manifests = manifests
    self.connections = connections
  }

  public init?(json: JSON?) {
    guard let manifests = json?["manifests"]?.array, let connections = json?["connections"]?.array else { return nil }
    self.manifests = manifests.compactMap { row in
      guard let platform = row["platform"]?.string else { return nil }
      return Manifest(platform: platform, displayName: row["displayName"]?.string ?? platform, blurb: row["blurb"]?.string ?? "", credentialLabel: row["credentialLabel"]?.string ?? "", availability: row["availability"]?.string ?? "coming-soon")
    }
    self.connections = connections.compactMap { row in
      guard let platform = row["platform"]?.string else { return nil }
      return Connection(platform: platform, label: row["label"]?.string ?? "", status: row["status"]?.string ?? "", detail: row["detail"]?.string)
    }
  }

  /** "Channels" is offered when a platform is open or a connection exists (`mmt`). */
  public var hasChannels: Bool { manifests.contains { $0.availability == "available" } || !connections.isEmpty }

  public func connection(_ manifest: Manifest) -> Connection? { connections.first { $0.platform == manifest.platform } }

  public enum RowState: Equatable, Sendable { case comingSoon, available, connected, error(String?), connecting }

  /** A row's state (`A0n`): pending and configured read as Connecting. */
  public func state(_ manifest: Manifest) -> RowState {
    if manifest.availability == "coming-soon" { return .comingSoon }
    guard let connection = connection(manifest) else { return .available }
    switch connection.status {
    case "connected": return .connected
    case "error": return .error(connection.detail)
    default: return .connecting
    }
  }

  /** The line under the name (`P0n`). */
  public func subtitle(_ manifest: Manifest) -> String {
    switch state(manifest) {
    case .connected:
      if let connection = connection(manifest) { return "Connected as \(connection.label)" }
      return manifest.blurb
    case .error(let detail): return detail ?? "The platform rejected this connection."
    default: return manifest.blurb
    }
  }

  /** The chip beside it (`O0n`); none to connect. */
  public static func chip(_ state: RowState) -> String? {
    switch state {
    case .comingSoon: "Soon"
    case .connected: "Connected"
    case .error: "Needs attention"
    case .connecting: "Connecting"
    case .available: nil
    }
  }

  public static let intro = "Connect this agent to a messaging platform so it can talk to people there. You can also just ask it in chat, like \"connect me to a messaging platform\"."
  public static let none = "No connectors available."
  public static let storedSecurely = "Stored securely, never shown to your agent."

  public static func placeholder(_ manifest: Manifest) -> String { "Paste your \(manifest.credentialLabel)" }

  /**
   * "How to connect" (`C0n`): it reads the window's own table, which still
   * calls both platforms coming soon, so it always says so, whatever the
   * row offers.
   */
  public static func guide(_ manifest: Manifest) -> (title: String, description: String, blurb: String) {
    let blurb = manifest.platform == "slack" ? "Message in Slack channels and DMs (coming soon)." : manifest.platform == "discord" ? "Message in Discord servers and DMs (coming soon)." : manifest.blurb
    return ("Connect \(manifest.displayName)", "Connecting \(manifest.displayName) is not available yet.", blurb)
  }
}
