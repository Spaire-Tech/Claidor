import Foundation
import Observation

/** One connected app, as the box's manager lists it (`McpServerSummary`). */
public struct ConnectedApp: Identifiable, Hashable, Sendable {
  /** The box lists one row per account, all under the app's server id. */
  public let serverId: String
  public let name: String
  public let pluginId: String?
  public let accountKey: String
  /** `connected`, or what stops it (`error`, a sign-in still to do). */
  public let status: String
  public let toolCount: Int

  public init(serverId: String, name: String, pluginId: String?, accountKey: String, status: String, toolCount: Int) {
    self.serverId = serverId; self.name = name; self.pluginId = pluginId; self.accountKey = accountKey; self.status = status; self.toolCount = toolCount
  }

  init?(_ json: JSON) {
    guard let id = json["id"]?.text else { return nil }
    self.init(serverId: id, name: json["name"]?.string ?? id, pluginId: json["pluginId"]?.text, accountKey: json["accountKey"]?.text ?? "default", status: json["status"]?.string ?? "", toolCount: json["toolCount"]?.int ?? 0)
  }

  /** One account of one app. */
  public var id: String { "\(serverId)\u{1F}\(accountKey)" }
  /** The account's name as the Mac shows it: "Default" for the first. */
  public var accountName: String { accountKey == "default" ? "Default" : accountKey }
}

/** One tool a connected app gives the agents, and whether the person switched it off (`listServerTools`). */
public struct AppTool: Identifiable, Hashable, Sendable {
  public let name: String
  public let title: String?
  public let summary: String?
  public let isDisabled: Bool
  public var id: String { name }

  init?(_ json: JSON) {
    guard let name = json["name"]?.text else { return nil }
    self.name = name; title = json["title"]?.text; summary = json["description"]?.text; isDisabled = json["isDisabled"]?.bool ?? false
  }
}

/** One app the catalog offers (`CatalogPlugin`). */
public struct CatalogApp: Identifiable, Hashable, Sendable {
  public let id: String
  public let name: String
  public let title: String
  public let summary: String
  public let category: String
  public let comingSoon: Bool

  init?(_ json: JSON) {
    guard let id = json["id"]?.text ?? json["pluginId"]?.text else { return nil }
    self.id = id
    name = json["name"]?.string ?? id
    title = json["displayName"]?.text ?? json["name"]?.text ?? id
    summary = json["description"]?.string ?? ""
    category = json["category"]?.string ?? ""
    comingSoon = json["comingSoon"]?.bool ?? false
  }

  public init(id: String, name: String, title: String, summary: String, category: String = "", comingSoon: Bool = false) {
    self.id = id; self.name = name; self.title = title; self.summary = summary; self.category = category; self.comingSoon = comingSoon
  }

  /** The logo's name in the app's images (`Connectors/<slug>`). */
  public var logoKey: String { Self.slug(title) }

  public static func slug(_ name: String) -> String {
    name.lowercased().replacingOccurrences(of: ".", with: "-").split(whereSeparator: { !$0.isLetter && !$0.isNumber }).joined(separator: "-")
  }
}

/** The signed-in person, from `user/profile`. */
public struct Account: Sendable, Equatable {
  public let name: String
  public let email: String

  public init(name: String, email: String) { self.name = name; self.email = email }

  public init?(profile: JSON) {
    let email = profile["email"]?.string ?? ""
    let name = profile["preferredName"]?.text ?? profile["name"]?.text ?? profile["nickname"]?.text ?? email.split(separator: "@").first.map(String.init) ?? ""
    if name.isEmpty && email.isEmpty { return nil }
    self.init(name: name, email: email)
  }

  /** "BF" for Bass Fall: the account button's letters. */
  public var initials: String {
    let words = name.split(whereSeparator: { $0 == " " || $0 == "." || $0 == "_" || $0 == "-" })
    let letters = words.prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
    return letters.isEmpty ? String(email.prefix(1)).uppercased() : letters
  }
}

/**
 * What every screen reads: the roster, the chats, the call, the account.
 * One store for the app; the screens only draw it and call its actions.
 */
@MainActor
@Observable
public final class AppStore {
  public private(set) var agents: [Agent] = []
  public private(set) var transcripts: [String: [Entry]] = [:]
  /** Each open chat laid out (Chat.rows), kept with its entries so a redraw does not lay it out again. */
  public private(set) var chatRows: [String: [ChatRow]] = [:]
  /** The step an agent is on right now ("Checking Linear"), by agent. */
  public private(set) var steps: [String: String] = [:]
  public private(set) var call: CallState?
  public private(set) var isLive = false
  public private(set) var isLoading = false
  public var account: Account?
  /** Something went wrong that the person should hear about, once. */
  public var problem: String?
  /** An answer the person gave that the host has not echoed yet: the card shows it at once (the window's optimistic answer). */
  public private(set) var pendingAnswers: [String: String] = [:]
  /** Where the "New" line goes in each chat: after this time (ms), set when a chat with unread messages opens. */
  public private(set) var unreadAfter: [String: Double] = [:]
  /** Connected apps, as the box's manager lists them (`desktopMcp listServers`), and the catalog to add more from. */
  public private(set) var apps: [ConnectedApp] = []
  public private(set) var catalog: [CatalogApp] = []

  public private(set) var backend: AgentBackend?
  @ObservationIgnored private var listening: Task<Void, Never>?
  @ObservationIgnored private var running: [String: String] = [:]

  public init() {}

  /** Starts on a backend: the roster, then the live events. */
  public func attach(_ backend: AgentBackend) async {
    detach()
    self.backend = backend
    isLoading = true
    defer { isLoading = false }
    let events = backend.events()
    listening = Task { [weak self] in
      for await event in events {
        guard let self else { return }
        self.apply(event)
      }
    }
    backend.call?.observe { [weak self] state in
      Task { @MainActor in self?.call = state }
    }
    await reloadRoster()
  }

  public func detach() {
    listening?.cancel()
    listening = nil
    backend = nil
    agents = []; transcripts = [:]; chatRows = [:]; steps = [:]; call = nil; isLive = false; account = nil
    pendingAnswers = [:]; unreadAfter = [:]; apps = []; catalog = []
  }

  public func reloadRoster() async {
    guard let backend else { return }
    do {
      agents = sortRoster(try await backend.listAgents())
    } catch {
      problem = "Couldn't reach your agents: \(error.localizedDescription)"
    }
  }

  public func apply(_ event: BackendEvent) {
    switch event {
    case .agents(let list):
      agents = sortRoster(list)
    case .agentUpserted(let agent):
      var next = agents.filter { $0.id != agent.id }
      next.append(agent)
      agents = sortRoster(next)
    case .transcript(let change):
      guard let current = transcripts[change.agentId] else { return }
      setTranscript(change.agentId, change.applied(to: current))
    case .step(let agentId, let id, let summary, let isRunning):
      if isRunning { running[agentId] = id; steps[agentId] = summary }
      else if running[agentId] == id { running[agentId] = nil; steps[agentId] = nil }
    case .connection(let live):
      isLive = live
    case .appsChanged:
      Task { await loadApps() }
    }
  }

  public func agent(_ id: String?) -> Agent? { agents.first { $0.id == id } }

  /** The members of a group, as agents. */
  public func members(of group: Agent) -> [Agent] { group.memberIds.compactMap { id in agents.first { $0.id == id } } }

  public func rows(for agentId: String) -> [ChatRow] { chatRows[agentId] ?? [] }

  private func setTranscript(_ agentId: String, _ entries: [Entry]) {
    transcripts[agentId] = entries
    for entry in entries where pendingAnswers[entry.id] != nil && (entry["respondedValue"]?.text != nil || entry["widgetDismissed"]?.bool == true) { pendingAnswers[entry.id] = nil }
    chatRows[agentId] = Chat.rows(entries, isGroup: agent(agentId)?.isGroup ?? false, unreadAfter: unreadAfter[agentId])
  }

  /** A chat comes on screen: its entries, and it is read; the "New" line marks what came since it was last read. */
  public func open(_ agentId: String) async {
    guard let backend else { return }
    let unread = agent(agentId).map { $0.hasUnread ? max($0.unreadCount, 1) : 0 } ?? 0
    if transcripts[agentId] == nil {
      do { transcripts[agentId] = try await backend.transcript(agentId) } catch {
        transcripts[agentId] = []
        problem = "Couldn't open this chat: \(error.localizedDescription)"
      }
    }
    let entries = transcripts[agentId] ?? []
    unreadAfter[agentId] = Self.unreadBoundary(entries, unread: unread)
    setTranscript(agentId, entries)
    if let index = agents.firstIndex(where: { $0.id == agentId }) { agents[index].hasUnread = false; agents[index].unreadCount = 0 }
    await backend.markRead(agentId)
  }

  /** Just before the oldest of the last `unread` lines an agent wrote; nil when nothing is unread. */
  static func unreadBoundary(_ entries: [Entry], unread: Int) -> Double? {
    guard unread > 0 else { return nil }
    let theirs = entries.filter { !$0.isFromPerson && $0.timestampMs != nil && ($0.kind == "message" || $0.kind == "send-message") && $0.teammate == nil }
    guard let first = theirs.suffix(unread).first?.timestampMs else { return nil }
    return first - 1
  }

  /** A message, and the composer's files: each put on the agent's computer first (`uploadAttachment`), as the Mac does. */
  public func send(_ text: String, to agentId: String, attachments files: [(name: String, data: Data)] = []) async {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let backend, !trimmed.isEmpty || !files.isEmpty else { return }
    var refs: [AttachmentRef] = []
    for file in files {
      do {
        let answer = try await backend.command("uploadAttachment", ["filename": .string(file.name), "bytesBase64": .string(file.data.base64EncodedString()), "agentId": .string(agentId)])
        guard let path = answer["path"]?.text else { throw GatewayError(message: "the computer kept no copy", refused: true) }
        refs.append(AttachmentRef(path: path, name: file.name))
      } catch {
        problem = "\(file.name) didn't upload: \(error.localizedDescription)"
        return
      }
    }
    do { try await backend.send(agentId, text: trimmed, attachments: refs) } catch { problem = "Your message didn't send: \(error.localizedDescription)" }
  }

  public func answer(_ value: String, card entryId: String, in agentId: String) async {
    guard let backend else { return }
    pendingAnswers[entryId] = value
    do { try await backend.answer(agentId, entryId: entryId, value: value) } catch {
      pendingAnswers[entryId] = nil
      problem = "Your answer didn't reach \(agent(agentId)?.name ?? "the agent"): \(error.localizedDescription)"
    }
  }

  // MARK: The cards' buttons, as the Mac's window calls them (host/gateway-protocol.ts)

  /** Runs one gateway command; a refusal becomes the problem line and nil. */
  @discardableResult
  public func command(_ method: String, _ args: JSON, failure: String? = nil) async -> JSON? {
    guard let backend else { return nil }
    do { return try await backend.command(method, args) } catch {
      problem = "\(failure ?? "That didn't work"): \(error.localizedDescription)"
      return nil
    }
  }

  /** The question card's X (`dismissWidget`). */
  public func dismissQuestion(_ entryId: String, in agentId: String) async {
    pendingAnswers[entryId] = ""
    if await command("dismissWidget", ["entryId": .string(entryId), "agentId": .string(agentId)], failure: "Couldn't dismiss the question") == nil { pendingAnswers[entryId] = nil }
  }

  /** Send on an email or Slack draft, with what the person changed in it (`sendDraft`). */
  public func sendDraft(_ entryId: String, in agentId: String, draft: JSON) async {
    await command("sendDraft", ["agentId": .string(agentId), "entryId": .string(entryId), "draft": draft], failure: "The draft didn't send")
  }

  public func discardDraft(_ entryId: String, in agentId: String) async {
    await command("discardDraft", ["agentId": .string(agentId), "entryId": .string(entryId)], failure: "Couldn't discard the draft")
  }

  /** A reaction on a message (`reactToMessage`); the same emoji again takes it back. */
  public func react(_ emoji: String, to entryId: String, in agentId: String) async {
    await command("reactToMessage", ["entryId": .string(entryId), "emoji": .string(emoji), "agentId": .string(agentId)], failure: "Couldn't react")
  }

  /** Allow once (`approved`), Always allow (`always`) or Deny (`denied`) on an auto-review approval. */
  public func resolveApproval(_ requestId: String, resolution: String, entryId: String, in agentId: String) async {
    await command("resolveAutoReviewApproval", ["requestId": .string(requestId), "resolution": .string(resolution), "entryId": .string(entryId), "agentId": .string(agentId)], failure: "Couldn't answer the approval")
  }

  public func submitSecret(_ value: String, entryId: String, in agentId: String) async {
    await command("submitSecret", ["entryId": .string(entryId), "value": .string(value), "agentId": .string(agentId)], failure: "The secret wasn't saved")
  }

  /** "I'm done" on the computer hand-off; `skip` cancels the step instead. */
  public func handBackComputer(_ agentId: String, skip: Bool = false) async {
    let trigger: JSON = skip ? ["resolution": "cancelled", "trigger": "skip"] : "button"
    await command("handBackForeverBox", ["id": .string(agentId), "trigger": trigger], failure: "Couldn't hand the computer back")
  }

  // MARK: The computer

  /** The agent's screen on the cloud computer (`ensureForeverBox`): starting, or live. */
  public func screen(_ agentId: String) async throws -> ScreenState {
    guard let backend else { throw GatewayError(message: "Not signed in.", refused: true) }
    return try await backend.screen(agentId)
  }

  // MARK: Files

  /**
   * A file an agent sent or the person attached, read from the box in 4 MiB
   * pieces (`readAttachmentChunk`), as the Mac's preview reads it; nil when
   * the box will not hand it over.
   */
  public func readFile(_ url: String, agentId: String, limit: Int = 60 << 20) async -> Data? {
    guard let backend else { return nil }
    let path = url.hasPrefix("file://") ? (URL(string: url)?.path ?? String(url.dropFirst(7))) : url
    var data = Data()
    var total = Int.max
    while data.count < min(total, limit) {
      guard let piece = try? await backend.command("readAttachmentChunk", ["path": .string(path), "agentId": .string(agentId), "offset": .number(Double(data.count)), "length": .number(Double(4 << 20))]) else { return data.isEmpty ? nil : data }
      total = piece["totalSize"]?.int ?? data.count
      guard let base64 = piece["bytesBase64"]?.string, let bytes = Data(base64Encoded: base64), !bytes.isEmpty else { break }
      data.append(bytes)
    }
    if data.isEmpty, let image = try? await backend.command("readAttachmentImage", ["path": .string(path)]) {
      let url = image["dataUrl"]?.string ?? image["url"]?.string ?? image.string ?? ""
      if let comma = url.firstIndex(of: ","), let bytes = Data(base64Encoded: String(url[url.index(after: comma)...])) { return bytes }
    }
    return data.isEmpty ? nil : data
  }

  // MARK: Connected apps (the Mac's Plugins, through `desktopMcp`)

  public func loadApps() async {
    guard let backend else { return }
    if let state = try? await backend.command("desktopMcp", ["action": "listServers", "args": []]) {
      apps = (state["servers"]?.array ?? state.array ?? []).compactMap(ConnectedApp.init)
    }
    if catalog.isEmpty, let list = try? await backend.command("desktopMcp", ["action": "getCatalog", "args": []]) {
      catalog = (list.array ?? list["plugins"]?.array ?? []).compactMap(CatalogApp.init)
    }
  }

  /** The app a card names ("Gmail"), from the catalog. */
  public func catalogApp(named name: String) -> CatalogApp? {
    let key = name.lowercased()
    return catalog.first { $0.title.lowercased() == key || $0.name.lowercased() == key || $0.id.lowercased() == key }
  }

  /** Whether an app the card names is connected. */
  public func isConnected(_ name: String) -> Bool {
    let key = name.lowercased()
    let plugin = catalogApp(named: name)?.id
    return apps.contains { $0.status == "connected" && ($0.name.lowercased() == key || ($0.pluginId != nil && $0.pluginId == plugin)) }
  }

  /**
   * Connect an app as the card's Add does on the Mac: install it from the
   * catalog when it is not there, then start its sign-in; the sign-in's web
   * address, for the system's sign-in sheet.
   */
  public func connectApp(named name: String) async -> URL? {
    guard let backend else { return nil }
    await loadApps()
    let key = name.lowercased()
    var server = apps.first { $0.name.lowercased() == key || ($0.pluginId != nil && $0.pluginId == catalogApp(named: name)?.id) }
    if server == nil, let plugin = catalogApp(named: name) {
      do {
        let state = try await backend.command("desktopMcp", ["action": "installEntry", "args": [["entryId": .string(plugin.id)]]])
        apps = (state["servers"]?.array ?? []).compactMap(ConnectedApp.init)
        if let vendor = try? await backend.command("desktopMcp", ["action": "vendorServerIdForPlugin", "args": [.string(plugin.id)]]), let id = vendor.text {
          server = ConnectedApp(serverId: id, name: plugin.title, pluginId: plugin.id, accountKey: "default", status: "needs-auth", toolCount: 0)
        } else {
          server = apps.first { $0.pluginId == plugin.id }
        }
      } catch {
        problem = "Couldn't add \(name): \(error.localizedDescription)"
        return nil
      }
    }
    guard let server else { problem = "\(name) isn't in Simeon's apps yet."; return nil }
    if server.status == "connected" { return nil }
    do {
      let started = try await backend.command("desktopMcp", ["action": "authenticateServer", "args": [.string(server.serverId), .string(server.accountKey), "connector_card"]])
      return started["authorizationUrl"]?.text.flatMap(URL.init(string:))
    } catch {
      problem = "Couldn't connect \(name): \(error.localizedDescription)"
      return nil
    }
  }

  public func removeApp(_ app: ConnectedApp) async {
    await command("desktopMcp", ["action": "removeServer", "args": [.string(app.serverId)]], failure: "Couldn't remove \(app.name)")
    await loadApps()
  }

  /** Whether Slack or GitHub is linked for routines to wake on (`getListenerIntegrations`); nil while it is not known. */
  public func listenerConnected(_ platform: String) async -> Bool? {
    guard let answer = try? await backend?.command("getListenerIntegrations", [:]) else { return nil }
    return (answer["integrations"]?.array ?? []).first { $0["platform"]?.string == platform }?["isConnected"]?.bool ?? false
  }

  /** The page that links Slack or GitHub (`getListenerConnectUrl`), opened outside the app as the Mac opens it. */
  public func listenerConnectURL(_ platform: String) async -> URL? {
    do {
      let answer = try await backend?.command("getListenerConnectUrl", ["platform": .string(platform)])
      return answer?["url"]?.text.flatMap(URL.init(string:))
    } catch {
      problem = "Couldn't open the link: \(error.localizedDescription)"
      return nil
    }
  }

  /** Each app once, in the box's order (its accounts are on its page). */
  public var appsOnce: [ConnectedApp] {
    var seen = Set<String>()
    return apps.filter { seen.insert($0.serverId).inserted }
  }

  public func accounts(of serverId: String) -> [ConnectedApp] { apps.filter { $0.serverId == serverId } }

  /** The app's tools, each with its switch (`listServerTools`). */
  public func tools(of serverId: String) async -> [AppTool] {
    guard let list = try? await backend?.command("desktopMcp", ["action": "listServerTools", "args": [.string(serverId)]]) else { return [] }
    return (list.array ?? []).compactMap(AppTool.init)
  }

  /** Switch one tool off or back on for every agent (`toggleMcpToolDisabled`); the tools as they are now. */
  public func toggleTool(_ serverId: String, _ toolName: String) async -> [AppTool]? {
    do {
      let list = try await backend?.command("desktopMcp", ["action": "toggleMcpToolDisabled", "args": [["serverId": .string(serverId), "toolName": .string(toolName)]]])
      await loadApps()
      return (list?.array ?? []).compactMap(AppTool.init)
    } catch {
      problem = "Couldn't change \(toolName): \(error.localizedDescription)"
      return nil
    }
  }

  public func renameAccount(_ app: ConnectedApp, to name: String) async {
    let next = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !next.isEmpty, next != app.accountKey else { return }
    await command("desktopMcp", ["action": "renameAccount", "args": [["serverId": .string(app.serverId), "accountKey": .string(app.accountKey), "newAccountKey": .string(next)]]], failure: "Couldn't rename the account")
    await loadApps()
  }

  public func removeAccount(_ app: ConnectedApp) async {
    await command("desktopMcp", ["action": "removeAccount", "args": [["serverId": .string(app.serverId), "accountKey": .string(app.accountKey)]]], failure: "Couldn't remove the account")
    await loadApps()
  }

  /** Sign in to one account of an app (`authenticateServer`), for the system's sign-in sheet. */
  public func signInURL(_ app: ConnectedApp) async -> URL? {
    do {
      let started = try await backend?.command("desktopMcp", ["action": "authenticateServer", "args": [.string(app.serverId), .string(app.accountKey), "connector_card"]])
      return started?["authorizationUrl"]?.text.flatMap(URL.init(string:))
    } catch {
      problem = "Couldn't sign in to \(app.name): \(error.localizedDescription)"
      return nil
    }
  }

  /** New Agent: the agent's id, to open its chat. */
  public func createAgent(name: String, colour: String) async -> String? {
    guard let backend else { return nil }
    do {
      let id = try await backend.createAgent(name: name, colour: colour)
      await reloadRoster()
      return id
    } catch {
      problem = "Couldn't create \(name): \(error.localizedDescription)"
      return nil
    }
  }

  /** New Group Chat: named for its members, "Simeon, Iris", as the window names it. */
  public func createGroup(memberIds: [String]) async -> String? {
    guard let backend, memberIds.count >= 2 else { return nil }
    let name = String(memberIds.compactMap { id in agents.first { $0.id == id }?.name }.joined(separator: ", ").prefix(60))
    do {
      let id = try await backend.createGroup(name: name, memberIds: memberIds)
      await reloadRoster()
      return id
    } catch {
      problem = "Couldn't start the group: \(error.localizedDescription)"
      return nil
    }
  }

  public func updateProfile(_ agentId: String, name: String, title: String, description: String) async {
    guard let backend else { return }
    do { try await backend.updateAgent(agentId, name: name, title: title, description: description); await reloadRoster() } catch { problem = error.localizedDescription }
  }

  public func routines(_ agentId: String) async -> [JSON] {
    (try? await backend?.routines(agentId)) ?? []
  }

  // MARK: The agent's page

  /** Name, title and description, saved as the Mac saves them on leaving a field (`updateAgent` always carries name and description). */
  public func saveProfile(_ agentId: String, name: String, title: String, description: String, colour: String? = nil, voiceId: String? = nil) async {
    guard let agent = agent(agentId) else { return }
    var profile: JSON = ["name": .string(name.isEmpty ? agent.name : name), "description": .string(description), "title": .string(title)]
    if let colour { profile = profile.setting("avatarColor", .string(colour)) }
    if let voiceId { profile = profile.setting("voiceId", .string(voiceId)) }
    if let index = agents.firstIndex(where: { $0.id == agentId }) {
      agents[index].name = name.isEmpty ? agent.name : name; agents[index].title = title; agents[index].description = description
      if let colour { agents[index].colour = colour }
      if let voiceId { agents[index].voiceId = voiceId }
    }
    await command("updateAgent", ["id": .string(agentId), "profile": profile], failure: "Couldn't save \(agent.name)")
  }

  /** A voice in the Mac's picker: its name only (the founder, 1 October 2026), and a sample to play when it has one. */
  public struct VoiceChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let sample: URL?
    public init(id: String, name: String, sample: URL?) { self.id = id; self.name = name; self.sample = sample }
  }

  /** The voice an agent with none saved speaks with (`VOICE_CALL_DEFAULT_VOICE_ID`, Michael). */
  public static let defaultVoiceId = "ljX1ZrXuDIIRVcmiVSyR"

  /** The voices to pick from (`GET …/proxy/v1/voice/voices`); none when calls are not switched on. */
  public func voices() async -> [VoiceChoice] {
    guard let list = try? await backend?.server("proxy/v1/voice/voices", method: nil, body: nil) else { return [] }
    return (list.array ?? []).compactMap { row in
      guard let id = row["id"]?.text, let name = row["name"]?.text else { return nil }
      return VoiceChoice(id: id, name: name, sample: row["preview_url"]?.text.flatMap(URL.init(string:)))
    }
  }

  /** The agent's voice, saved on the agent as the Mac saves it (`updateAgent` with `voiceId`). */
  public func setVoice(_ agentId: String, _ voiceId: String) async {
    guard let agent = agent(agentId) else { return }
    await saveProfile(agentId, name: agent.name, title: agent.title, description: agent.description, voiceId: voiceId)
  }

  /**
   * A picture drawn from a description, as the Mac's Generate tab draws one
   * (`POST …/proxy/v1/images/generations`, the cheapest quality: it is a
   * thumbnail). The PNG's bytes, or nil with `problem` set.
   */
  public func drawPicture(_ description: String) async -> Data? {
    let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, let backend else { return nil }
    do {
      let answer = try await backend.server("proxy/v1/images/generations", method: "POST", body: ["prompt": .string(text), "size": "1024x1024", "quality": "low"])
      guard let base64 = answer["data"]?[0]?["b64_json"]?.text, let bytes = Data(base64Encoded: base64) else {
        problem = "The picture didn't come back. Try again."
        return nil
      }
      return bytes
    } catch {
      problem = "Couldn't draw the picture: \(error.localizedDescription)"
      return nil
    }
  }

  public func setNotify(_ agentId: String, _ on: Bool) async {
    if let index = agents.firstIndex(where: { $0.id == agentId }) { agents[index].notifyOnUpdates = on }
    await command("setAgentNotifyOnUpdates", ["id": .string(agentId), "isEnabled": .bool(on)], failure: "Couldn't change notifications")
  }

  /** A picture for the agent (PNG), or nil to go back to its butterfly (`setAgentAvatarBytes`). */
  public func setAvatar(_ agentId: String, png: Data?) async {
    await command("setAgentAvatarBytes", ["id": .string(agentId), "pngBase64": png.map { .string($0.base64EncodedString()) } ?? .null], failure: "Couldn't change the picture")
    await reloadRoster()
  }

  public func setMembers(_ groupId: String, _ memberIds: [String]) async {
    if let index = agents.firstIndex(where: { $0.id == groupId }) { agents[index].memberIds = memberIds }
    await command("setGroupMembers", ["id": .string(groupId), "memberAgentIds": JSON(memberIds)], failure: "Couldn't change the group")
  }

  public func routineList(_ agentId: String) async -> [Routine] {
    await routines(agentId).compactMap(Routine.init(json:))
  }

  /** A new routine, or the same one changed; it saves itself, as on the Mac. */
  public func saveRoutine(_ routine: Routine, agentId: String, isNew: Bool) async {
    if isNew {
      await command("createAgentAutomation", ["id": .string(agentId), "spec": routine.spec], failure: "Couldn't create the routine")
    } else {
      await command("updateAgentAutomation", ["id": .string(agentId), "automationId": .string(routine.id), "spec": routine.spec], failure: "Couldn't save the routine")
    }
  }

  public func setRoutineEnabled(_ routineId: String, agentId: String, _ on: Bool) async {
    await command("setAgentAutomationEnabled", ["id": .string(agentId), "automationId": .string(routineId), "isEnabled": .bool(on)], failure: "Couldn't change the routine")
  }

  public func deleteRoutine(_ routineId: String, agentId: String) async {
    await command("deleteAgentAutomation", ["id": .string(agentId), "automationId": .string(routineId)], failure: "Couldn't delete the routine")
  }

  public func runRoutineNow(_ routineId: String, agentId: String) async {
    await command("runAgentAutomationNow", ["id": .string(agentId), "automationId": .string(routineId)], failure: "Couldn't run the routine")
  }

  // MARK: Settings

  /** The host's settings (`getHostSettings`): the time zone, Auto-review. */
  public func hostSettings() async -> JSON? { await command("getHostSettings", [:], failure: "Couldn't load your settings") }

  @discardableResult
  public func setHostSettings(_ update: JSON) async -> JSON? { await command("setHostSettings", update, failure: "Couldn't save the setting") }

  /** This period's usage (`/desktop/api/user/quota`). */
  public func quota() async -> JSON? { try? await backend?.server("user/quota", method: nil, body: nil) }

  /** Stripe's billing page for the account (`/desktop/api/billing/portal`). */
  public func billingPortal() async -> URL? {
    do {
      let answer = try await backend?.server("billing/portal", method: "POST", body: [:])
      return answer?["portalUrl"]?.text.flatMap(URL.init(string:))
    } catch {
      problem = "Couldn't open billing: \(error.localizedDescription)"
      return nil
    }
  }

  // MARK: The call

  public var canCall: Bool { backend?.call != nil }

  public func startCall(_ agent: Agent) {
    backend?.call?.start(agentId: agent.id, agentName: agent.name, colour: agent.colour ?? "blue")
  }

  public func mute(_ muted: Bool) { backend?.call?.mute(muted) }
  public func hangUp() { backend?.call?.hangUp() }
}
