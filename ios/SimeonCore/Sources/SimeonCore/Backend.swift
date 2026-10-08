import Foundation

/** A file the composer put on the agent's computer, by its path there and its name. */
public struct AttachmentRef: Sendable, Hashable {
  public let path: String
  public let name: String

  public init(path: String, name: String) { self.path = path; self.name = name }
}

/** What changes while the app is open, from the host's event stream. */
public enum BackendEvent: Sendable {
  case agents([Agent])
  case agentUpserted(Agent)
  case transcript(TranscriptChange)
  /** A step the agent is on ("Checking Linear"), or done with. */
  case step(agentId: String, id: String, summary: String, running: Bool)
  case connection(live: Bool)
  /** A connected app changed: a sign-in finished, one was added or removed (`mcp-auth`, `mcp-servers`). */
  case appsChanged
  /** The host's settings changed on some device (`host-settings`: the names of the fields), e.g. the pins. */
  case settingsChanged([String])
}

/** One change to a chat (`roster.emit` in host/extensions/transcript/roster-projection.ts). */
public enum TranscriptChange: Sendable, Equatable {
  case upsert(agentId: String, entry: Entry)
  case remove(agentId: String, entryId: String)
  case replace(agentId: String, entries: [Entry])

  public init?(_ payload: JSON) {
    switch payload["type"]?.string {
    case "appended", "updated":
      guard let agentId = payload["agentId"]?.text, let raw = payload["entry"], let entry = Entry(raw) else { return nil }
      self = .upsert(agentId: agentId, entry: entry)
    case "removed":
      guard let agentId = payload["agentId"]?.text, let id = payload["id"]?.text ?? payload["entryId"]?.text else { return nil }
      self = .remove(agentId: agentId, entryId: id)
    case "cleared":
      guard let agentId = payload["agentId"]?.text else { return nil }
      self = .replace(agentId: agentId, entries: [])
    case "snapshot":
      guard let agentId = payload["activeAgentId"]?.text, let entries = payload["entries"]?.array else { return nil }
      self = .replace(agentId: agentId, entries: entries.compactMap(Entry.init))
    default:
      return nil
    }
  }

  public var agentId: String {
    switch self {
    case .upsert(let id, _), .remove(let id, _), .replace(let id, _): return id
    }
  }

  /** The chat after this change: an entry is swapped in by its id, or added at the end (store.ts `#applyTranscriptEvent`). */
  public func applied(to entries: [Entry]) -> [Entry] {
    switch self {
    case .upsert(_, let entry):
      if let index = entries.firstIndex(where: { $0.id == entry.id }) {
        var next = entries
        next[index] = entry
        return next
      }
      return entries + [entry]
    case .remove(_, let id):
      return entries.filter { $0.id != id }
    case .replace(_, let fresh):
      return fresh
    }
  }
}

/**
 * Everything the screens ask of Simeon. Two answer it: the person's cloud
 * computer (LiveBackend) and the demo's agents (DemoBackend), so every
 * screen can be seen, and photographed, without an account.
 */
/** Lines of a chat, newest last, and where the lines before them start (`nextBeforeSeq`), when there are more. */
public struct TranscriptPage: Sendable {
  public let entries: [Entry]
  public let olderBefore: Int?
  public init(entries: [Entry], olderBefore: Int?) { self.entries = entries; self.olderBefore = olderBefore }
}

public protocol AgentBackend: AnyObject, Sendable {
  func listAgents() async throws -> [Agent]
  func transcript(_ agentId: String) async throws -> [Entry]
  /** The newest lines (`before` nil), or the hundred before `before` (`getAgentTranscriptTail` with `beforeSeq`, as the Mac's chat loads more on scrolling up). */
  func transcriptPage(_ agentId: String, before: Int?) async throws -> TranscriptPage
  /** A message, with the files already on the agent's computer (`uploadAttachment`). */
  /** A message, with the files already on the agent's computer, answering `replyTo` when set (`sendPrompt`'s `replyToId`). */
  func send(_ agentId: String, text: String, attachments: [AttachmentRef], replyTo: String?, nonce: String?) async throws
  func markRead(_ agentId: String) async
  /** A new agent in a palette; its id. */
  func createAgent(name: String, colour: String) async throws -> String
  /** A new group of agents; its id. */
  func createGroup(name: String, memberIds: [String]) async throws -> String
  /** The answer to a question card. */
  func answer(_ agentId: String, entryId: String, value: String) async throws
  func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws
  /** The agent's routines, as the host lists them (`getAgentAutomations`). */
  func routines(_ agentId: String) async throws -> [JSON]
  func events() -> AsyncStream<BackendEvent>
  /** The voice call, where there is one (the demo's, for now). */
  var call: CallEngine? { get }
  /** Any of the host's gateway commands (host/gateway-protocol.ts): the cards, Settings and the agent's page use them as the Mac's window does. */
  func command(_ method: String, _ args: JSON) async throws -> JSON
  /** One `/desktop/api/…` call on Simeon Labs' server (usage, billing, calls), in the app's envelope. */
  func server(_ path: String, method: String?, body: JSON?) async throws -> JSON
  /** The agent's own screen on the cloud computer (`ensureForeverBox`): starting, or its stream. */
  func screen(_ agentId: String) async throws -> ScreenState
}

extension AgentBackend {
  /** A message with a nonce of its own (the call's requests, which nothing waits to see). */
  public func send(_ agentId: String, text: String, attachments: [AttachmentRef], replyTo: String?) async throws {
    try await send(agentId, text: text, attachments: attachments, replyTo: replyTo, nonce: nil)
  }

  /** A backend that keeps whole chats has no older page. */
  public func transcriptPage(_ agentId: String, before: Int?) async throws -> TranscriptPage {
    before == nil ? TranscriptPage(entries: try await transcript(agentId), olderBefore: nil) : TranscriptPage(entries: [], olderBefore: nil)
  }
}

/** An agent's screen: still starting (with how far the image has come), or live at a WebSocket. */
public struct ScreenState: Sendable, Equatable {
  public let socket: URL?
  public let state: String
  public let percent: Int?

  public init(socket: URL?, state: String, percent: Int? = nil) { self.socket = socket; self.state = state; self.percent = percent }
}

/** The person's cloud computer, through Simeon Labs' proxy. */
public final class LiveBackend: AgentBackend, @unchecked Sendable {
  public let gateway: Gateway
  public let api: SimeonAPI?

  /** The voice call (`LiveCall`), set by the app once it has its voice kit. */
  public var call: CallEngine?

  public init(gateway: Gateway, api: SimeonAPI? = nil) { self.gateway = gateway; self.api = api }

  public func command(_ method: String, _ args: JSON) async throws -> JSON { try await gateway.command(method, args) }

  public func server(_ path: String, method: String?, body: JSON?) async throws -> JSON {
    guard let api else { throw SimeonAPIError(message: "Sign in to Simeon first.", status: 401) }
    return try await api.data(path, method: method, json: body)
  }

  public func screen(_ agentId: String) async throws -> ScreenState {
    let status = try await gateway.command("ensureForeverBox", ["id": .string(agentId)])
    let state = status["state"]?.string ?? "starting"
    let percent = status["pull"]?["percent"]?.int
    guard let vnc = status["vncUrl"]?.text else { return ScreenState(socket: nil, state: state, percent: percent) }
    let connection = try await gateway.currentConnection()
    return ScreenState(socket: connection.screenSocket(for: vnc), state: state, percent: percent)
  }


  public func listAgents() async throws -> [Agent] {
    let answer = try await gateway.command("listAgents")
    return (answer.array ?? answer["agents"]?.array ?? []).compactMap(Agent.init(json:))
  }

  /**
   * A chat opened as the window opens one (`openAgentTail`, the last 500
   * lines): the host makes it the chat on screen, so its new lines stream
   * to the app as they are written (the host sends live lines only for that
   * chat), and an agent waiting to introduce itself does so.
   */
  public func transcript(_ agentId: String) async throws -> [Entry] {
    try await transcriptPage(agentId, before: nil).entries
  }

  public func transcriptPage(_ agentId: String, before: Int?) async throws -> TranscriptPage {
    let page: JSON
    if let before {
      page = try await gateway.command("getAgentTranscriptTail", ["id": .string(agentId), "limit": 100, "beforeSeq": .number(Double(before))])
    } else {
      do { page = try await gateway.command("openAgentTail", ["id": .string(agentId), "limit": 500]) }
      catch { page = try await gateway.command("getAgentTranscriptTail", ["id": .string(agentId), "limit": 500]) }
    }
    return TranscriptPage(entries: (page["entries"]?.array ?? page.array ?? []).compactMap(Entry.init), olderBefore: page["nextBeforeSeq"]?.int)
  }

  public func send(_ agentId: String, text: String, attachments: [AttachmentRef], replyTo: String?, nonce: String?) async throws {
    // The host's argument names (host-gateway-api.ts, sendPrompt). The nonce lets a resent message land once, and the host keeps it on the line it writes (`clientNonce`), so the app knows its own message when it comes back.
    var args: JSON = [
      "agentId": .string(agentId), "prompt": .string(text), "attachmentPaths": JSON(attachments.map(\.path)), "attachmentNames": JSON(attachments.map(\.name)),
      "clientNonce": .string(nonce ?? "ios-\(UUID().uuidString.lowercased())"), "directAddressedAcceptance": true,
      "composedAtMs": .number(Date().timeIntervalSince1970 * 1000),
    ]
    if let replyTo { args = args.setting("replyToId", .string(replyTo)) }
    _ = try await gateway.command("sendPrompt", args)
  }

  public func markRead(_ agentId: String) async {
    _ = try? await gateway.command("setAgentUnread", ["id": .string(agentId), "isUnread": false, "atMs": .number(Date().timeIntervalSince1970 * 1000)])
  }

  public func createAgent(name: String, colour: String) async throws -> String {
    // The window's New Agent (router-renderer-patch.mjs, phone-create-sheets): a butterfly in the palette picked, introduced at once.
    let answer = try await gateway.command("createAgent", [
      "name": .string(name), "description": "", "avatarShape": "cloud", "avatarColor": .string(colour),
      "isKickstartRequested": true, "origin": "user", "clientNonce": .string("ios-\(UUID().uuidString.lowercased())"),
    ])
    guard let id = answer["agent"]?["id"]?.text else { throw GatewayError(message: "createAgent: no agent in the answer", refused: true) }
    return id
  }

  public func createGroup(name: String, memberIds: [String]) async throws -> String {
    let answer = try await gateway.command("createGroup", ["name": .string(name), "description": "", "memberAgentIds": JSON(memberIds)])
    guard let id = answer["agent"]?["id"]?.text ?? answer["id"]?.text else { throw GatewayError(message: "createGroup: no group in the answer", refused: true) }
    return id
  }

  public func answer(_ agentId: String, entryId: String, value: String) async throws {
    _ = try await gateway.command("respondToWidget", ["agentId": .string(agentId), "entryId": .string(entryId), "value": .string(value)])
  }

  public func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {
    _ = try await gateway.command("updateAgent", ["id": .string(agentId), "profile": ["name": .string(name), "title": .string(title), "description": .string(description)]])
  }

  public func routines(_ agentId: String) async throws -> [JSON] {
    let answer = try await gateway.command("getAgentAutomations", ["id": .string(agentId)])
    return answer.array ?? answer["automations"]?.array ?? []
  }

  public func events() -> AsyncStream<BackendEvent> {
    #if canImport(Darwin)
    let (stream, continuation) = AsyncStream<BackendEvent>.makeStream()
    let source = gateway.events(onState: { live in continuation.yield(.connection(live: live)) })
    let task = Task {
      for await event in source {
        for mapped in LiveBackend.map(event) { continuation.yield(mapped) }
      }
      continuation.finish()
    }
    continuation.onTermination = { _ in task.cancel() }
    return stream
    #else
    return AsyncStream { $0.finish() }
    #endif
  }

  /** The host's events, as the screens want them. */
  public static func map(_ event: GatewayEvent) -> [BackendEvent] {
    let payload = event.payload
    switch event.channel {
    case "agents":
      let rows = payload.array ?? payload["agents"]?.array ?? []
      return [.agents(rows.compactMap(Agent.init(json:)))]
    case "agent-upserted":
      return (payload["agent"]).flatMap(Agent.init(json:)).map { [.agentUpserted($0)] } ?? []
    case "transcript":
      return TranscriptChange(payload).map { [.transcript($0)] } ?? []
    case "mcp-auth", "mcp-servers", "sand:mcp-auth-event":
      return [.appsChanged]
    case "host-settings":
      return [.settingsChanged(payload["fields"]?.array?.compactMap(\.text) ?? [])]
    case "outline":
      guard let agentId = payload["agentId"]?.text else { return [] }
      let items = payload["item"].map { [$0] } ?? payload["items"]?.array ?? []
      return items.compactMap { item in
        guard item["kind"]?.string == "tool-call", let id = item["id"]?.text else { return nil }
        return .step(agentId: agentId, id: id, summary: item["summary"]?.text ?? item["name"]?.text ?? "", running: item["status"]?.string == "running")
      }
    default:
      return []
    }
  }
}
