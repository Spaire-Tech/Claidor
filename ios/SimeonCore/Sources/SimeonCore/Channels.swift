import Foundation

/**
 * An agent's messaging channels (Discord, Slack: a bot the person owns,
 * run from the box), as the host's `getAgentChannels` answers and the
 * window's Channels view draws them (`_0n`, `B0n`, `A0n`, `P0n`, `O0n`).
 * Shared by the Mac (mac/Simeon/ChannelsPage.swift) and the iPhone
 * (ios/Simeon/ChannelsPage.swift).
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

  /**
   * The line under the name, a few words (the founder, 28 October 2026: "too
   * many words"): what it reaches, the account once connected, what went
   * wrong.
   */
  public func subtitle(_ manifest: Manifest) -> String {
    switch state(manifest) {
    case .connected:
      if let label = connection(manifest)?.label, !label.isEmpty { return label }
      return Self.reach(manifest)
    case .error(let detail): return detail ?? L10n.text("Couldn't connect")
    default: return Self.reach(manifest)
    }
  }

  /** What a platform reaches; the box's own line for one the app does not know. */
  public static func reach(_ manifest: Manifest) -> String {
    switch manifest.platform {
    case "discord": L10n.text("Servers and DMs")
    case "slack": L10n.text("Channels and DMs")
    default: manifest.blurb
    }
  }

  /** The row's state in a word, for the ear and the pointer (the mark says it to the eye); none to connect. */
  public static func chip(_ state: RowState) -> String? {
    switch state {
    case .comingSoon: AppsComingSoon.label
    case .connected: L10n.text("Connected")
    case .error: L10n.text("Needs attention")
    case .connecting: L10n.text("channel.connecting", default: "Connecting")
    case .available: nil
    }
  }

  public static let none = L10n.text("No connectors available.")

  /** The field's words: the token it takes. */
  public static func placeholder(_ manifest: Manifest) -> String {
    switch manifest.platform {
    case "discord": L10n.text("Bot token")
    case "slack": L10n.text("App token and bot token")
    default: manifest.credentialLabel.prefix(1).uppercased() + manifest.credentialLabel.dropFirst()
    }
  }
}

/**
 * The channel calls the window makes (`I$n`): the view read, a token
 * stored, a connection refreshed or dropped; each answers the whole view,
 * and gives up after 15 seconds (a failure keeps the last answer on screen).
 */
extension AppStore {
  /** How long a channel call may take (`I$n`). */
  public static let channelDeadline: Double = 15

  public func channels(_ agentId: String) async -> ChannelsView? {
    await channelCall("getAgentChannels", ["id": .string(agentId)])
  }

  /** Store securely: the token for `platform` (Slack takes its app and bot tokens together, the computer sorts them). */
  public func connectChannel(_ agentId: String, platform: String, token: String) async -> ChannelsView? {
    await channelCall("connectChannel", ["id": .string(agentId), "platform": .string(platform), "token": .string(token)])
  }

  public func refreshChannel(_ agentId: String, platform: String) async -> ChannelsView? {
    await channelCall("refreshChannel", ["id": .string(agentId), "platform": .string(platform)])
  }

  public func disconnectChannel(_ agentId: String, platform: String) async -> ChannelsView? {
    await channelCall("disconnectChannel", ["id": .string(agentId), "platform": .string(platform)])
  }

  private func channelCall(_ method: String, _ args: JSON) async -> ChannelsView? {
    guard let backend else { return nil }
    let answer = try? await withThrowingTaskGroup(of: JSON.self) { group in
      group.addTask { try await backend.command(method, args) }
      group.addTask {
        try await Task.sleep(nanoseconds: UInt64(Self.channelDeadline * 1_000_000_000))
        throw CancellationError()
      }
      defer { group.cancelAll() }
      guard let first = try await group.next() else { throw CancellationError() }
      return first
    }
    return ChannelsView(json: answer)
  }
}
