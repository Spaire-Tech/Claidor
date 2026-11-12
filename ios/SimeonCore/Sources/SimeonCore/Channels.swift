import Foundation
import Observation

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
    /** `token`: + opens a field for the bot's token. `app`: + opens Slack's own sign-in for Simeon's Slack app, no token (12 November 2026). */
    public let connect: String

    public init(platform: String, displayName: String, blurb: String, credentialLabel: String, availability: String, connect: String = "token") {
      self.platform = platform
      self.displayName = displayName
      self.blurb = blurb
      self.credentialLabel = credentialLabel
      self.availability = availability
      self.connect = connect
    }

    /** Connected through Slack's sign-in in the browser, not a token typed here. */
    public var connectsInBrowser: Bool { connect == "app" }
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
      return Manifest(platform: platform, displayName: row["displayName"]?.string ?? platform, blurb: row["blurb"]?.string ?? "", credentialLabel: row["credentialLabel"]?.string ?? "", availability: row["availability"]?.string ?? "coming-soon", connect: row["connect"]?.string ?? "token")
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

  /** How long a row waits, after its sign-in opened in the browser, for the computer to say it is connected; asked every `connectPollSeconds`. */
  public static let connectWaitSeconds: Double = 300
  public static let connectPollSeconds: Double = 3
  /** The row's line when the sign-in could not be opened. */
  public static var couldNotConnect: String { L10n.text("Couldn't connect") }

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
/**
 * Slack's row in an agent's profile, under Notifications (12 November 2026,
 * the founder: "slack to be there below notifications"), as Simeon Labs'
 * server answers (`POST /desktop/api/channels/slack/state`): whether Slack
 * can be connected, and whether this agent talks in a workspace and which.
 * Read from the server, so opening a profile never wakes the computer.
 */
public struct SlackState: Equatable, Sendable {
  public let available: Bool
  public let connected: Bool
  public let workspace: String?

  public init(available: Bool, connected: Bool, workspace: String?) {
    self.available = available
    self.connected = connected
    self.workspace = workspace
  }

  public init?(json: JSON?) {
    guard let json, let available = json["available"]?.bool else { return nil }
    self.init(available: available, connected: json["connected"]?.bool ?? false, workspace: json["workspace"]?.string)
  }

  /** The line under "Slack": the workspace's name once connected, else what it reaches. */
  public var subtitle: String {
    if connected, let workspace, !workspace.isEmpty { return workspace }
    return L10n.text("Channels and DMs")
  }
}

/**
 * Slack's row in a profile (the Mac's and the iPhone's): its state as the
 * server last answered; +, which opens Slack's sign-in (`open`, each app's
 * browser) and waits, asking the server every 3 s for five minutes at most,
 * until the agent is connected; and Disconnect. One call at a time.
 */
@MainActor
@Observable
public final class SlackRowModel {
  public private(set) var state: SlackState?
  /** A sign-in waited for, or Disconnect under way: the row shows its spinner. */
  public private(set) var busy = false
  /** What went wrong, in red under "Slack", until the next try. */
  public private(set) var problem: String?

  public init() {}

  /** Drawn while Slack can be connected here, or the agent talks there. */
  public var shown: Bool { state.map { $0.available || $0.connected } ?? false }

  public func load(_ agentId: String, store: AppStore) async {
    if let next = await store.slackState(agentId) { state = next }
  }

  public func connect(_ agentId: String, store: AppStore, open: @MainActor (URL) -> Void) async {
    guard !busy else { return }
    problem = nil
    busy = true
    defer { busy = false }
    guard let url = await store.channelConnectLink(agentId, platform: "slack") else {
      problem = ChannelsView.couldNotConnect
      return
    }
    open(url)
    let deadline = Date().addingTimeInterval(ChannelsView.connectWaitSeconds)
    while Date() < deadline, !Task.isCancelled {
      try? await Task.sleep(nanoseconds: UInt64(ChannelsView.connectPollSeconds * 1_000_000_000))
      await load(agentId, store: store)
      if state?.connected == true { return }
    }
  }

  public func disconnect(_ agentId: String, store: AppStore) async {
    guard !busy else { return }
    problem = nil
    busy = true
    defer { busy = false }
    if await store.disconnectSlack(agentId) {
      state = SlackState(available: state?.available ?? true, connected: false, workspace: nil)
    } else {
      problem = L10n.text("Something didn’t work here. Try again in a little while.")
    }
    await load(agentId, store: store)
  }
}

extension AppStore {
  /** Slack's row: nil when the server couldn't be asked (the row stays as it was, or isn't drawn). */
  public func slackState(_ agentId: String) async -> SlackState? {
    guard let backend else { return nil }
    return SlackState(json: try? await backend.server("channels/slack/state", method: "POST", body: .object(["agentId": .string(agentId)])))
  }

  /** Slack's row's Disconnect: the agent no longer talks in the workspace; its computer takes it off at its next sync. */
  public func disconnectSlack(_ agentId: String) async -> Bool {
    guard let backend else { return false }
    return (try? await backend.server("channels/slack/disconnect", method: "POST", body: .object(["agentId": .string(agentId)]))) != nil
  }
}

extension AppStore {
  /** How long a channel call may take (`I$n`). */
  public static let channelDeadline: Double = 15

  /**
   * The view. With `wakes` false (the page's reads every 4 s and as the window comes forward), a computer that rests is
   * let rest: the read fails at once and the page keeps what it shows (`commandIfAwake`, step 4), so a page left open
   * never keeps it awake; the read as the page opens, and the one after a change, wake it as before.
   */
  public func channels(_ agentId: String, wakes: Bool = true) async -> ChannelsView? {
    await channelCall("getAgentChannels", ["id": .string(agentId)], wakes: wakes)
  }

  /** Store securely: the token for `platform` (Slack takes its app and bot tokens together, the computer sorts them). */
  public func connectChannel(_ agentId: String, platform: String, token: String) async -> ChannelsView? {
    await channelCall("connectChannel", ["id": .string(agentId), "platform": .string(platform), "token": .string(token)])
  }

  public func refreshChannel(_ agentId: String, platform: String) async -> ChannelsView? {
    await channelCall("refreshChannel", ["id": .string(agentId), "platform": .string(platform)])
  }

  /**
   * Slack's own sign-in for Simeon's Slack app, for this agent (12 November
   * 2026, `POST /desktop/api/channels/slack/link`): a one-time address the
   * app opens in the browser; nil when it couldn't be had.
   */
  public func channelConnectLink(_ agentId: String, platform: String) async -> URL? {
    guard platform == "slack", let backend else { return nil }
    guard let answer = try? await backend.server("channels/slack/link", method: "POST", body: .object(["agentId": .string(agentId)])),
          let address = answer["url"]?.string, let url = URL(string: address), url.scheme == "https" || url.scheme == "http" else { return nil }
    return url
  }

  public func disconnectChannel(_ agentId: String, platform: String) async -> ChannelsView? {
    await channelCall("disconnectChannel", ["id": .string(agentId), "platform": .string(platform)])
  }

  private func channelCall(_ method: String, _ args: JSON, wakes: Bool = true) async -> ChannelsView? {
    guard let backend else { return nil }
    let answer = try? await withThrowingTaskGroup(of: JSON.self) { group in
      group.addTask {
        if wakes { return try await backend.command(method, args) }
        return try await backend.commandIfAwake(method, args)
      }
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
