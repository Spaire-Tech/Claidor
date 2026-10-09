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
  public var isDisabled: Bool
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
  /** The app's own server, when it serves itself (`vendorMcpUrl`); ours, for the apps Composio serves (`/desktop/api/apps/mcp/…`). */
  public let serverURL: String?
  /** Composio's name for it, when the catalog gives one (`composioToolkit`). */
  public let composioToolkit: String?

  init?(_ json: JSON) {
    guard let id = json["id"]?.text ?? json["pluginId"]?.text else { return nil }
    self.id = id
    name = json["name"]?.string ?? id
    title = json["displayName"]?.text ?? json["name"]?.text ?? id
    summary = json["description"]?.string ?? ""
    category = json["category"]?.string ?? ""
    comingSoon = json["comingSoon"]?.bool ?? false
    serverURL = json["vendorMcpUrl"]?.text
    composioToolkit = json["composioToolkit"]?.text
  }

  public init(id: String, name: String, title: String, summary: String, category: String = "", comingSoon: Bool = false, serverURL: String? = nil, composioToolkit: String? = nil) {
    self.id = id; self.name = name; self.title = title; self.summary = summary; self.category = category; self.comingSoon = comingSoon
    self.serverURL = serverURL; self.composioToolkit = composioToolkit
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
  public private(set) var agents: [Agent] = [] {
    didSet { noteNames() }
  }
  /** The agents' names and colours for the chat's text, changed only when one of them does, so a roster update (an agent's status) does not redraw every message. */
  public private(set) var mentionNames: [Mentions.AgentName] = []
  /** Each chat's entries; the screens draw `chatRows`, so a change here alone redraws nothing. */
  @ObservationIgnored public private(set) var transcripts: [String: [Entry]] = [:]
  /** The chat on screen, if one is: it is the one fetched again after a reconnect or a missed line. */
  public private(set) var openChat: String?
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
  /** What the person has typed and not sent, by chat: kept on the phone, shown in the list as "Draft: …" (the Mac's `draftPrompt`). */
  public private(set) var drafts: [String: String] = (UserDefaults.standard.dictionary(forKey: AppStore.draftsKey) as? [String: String]) ?? [:]
  static let draftsKey = "simeon.drafts"

  public func setDraft(_ text: String, for agentId: String) {
    let kept = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text
    guard drafts[agentId] != kept else { return }
    Trace.mark("saving the draft of \(agentId)")
    drafts[agentId] = kept
    UserDefaults.standard.set(drafts, forKey: Self.draftsKey)
  }

  /** Connected apps, as the box's manager lists them (`desktopMcp listServers`), and the catalog to add more from. */
  public private(set) var apps: [ConnectedApp] = []
  public private(set) var catalog: [CatalogApp] = []

  public private(set) var backend: AgentBackend?
  @ObservationIgnored private var listening: Task<Void, Never>?
  @ObservationIgnored private var running: [String: String] = [:]
  /** Chats with streamed lines waiting to be laid out, at most every 90 ms, so a streaming answer does not lay the chat out per word. */
  @ObservationIgnored private var pendingLayout: Set<String> = []
  @ObservationIgnored private var layoutTask: Task<Void, Never>?
  @ObservationIgnored private var refreshing: Set<String> = []
  @ObservationIgnored private var peeking: Set<String> = []
  /** The newest line each chat was fetched again for, so a line the fetch does not carry (a thread's reply) is not fetched for twice. */
  @ObservationIgnored private var caughtUp: [String: String] = [:]
  /** A streamed answer's newest copy, when it is the only change waiting: just the last row is redrawn, not the whole chat laid out again. */
  @ObservationIgnored private var streamingOnly: [String: Entry] = [:]
  /** Messages on their way, by chat (see `send`). */
  @ObservationIgnored private var outbox: [String: [Outgoing]] = [:]
  /** Lines that arrived while their chat was on screen, and messages just sent: they come in with the Mac's motion, once. */
  @ObservationIgnored public private(set) var arrived: Set<String> = []
  /** Chats whose lines are on their way from the host: an empty chat shows it is loading, not frozen. */
  public private(set) var fetching: Set<String> = []
  /** Where each chat's older lines start (`nextBeforeSeq`); nil once the first line is here. */
  public private(set) var olderBefore: [String: Int] = [:]
  public private(set) var loadingOlder: Set<String> = []
  /** Chats with older pages loaded: a fetch of the newest lines keeps them. */
  @ObservationIgnored private var paged: Set<String> = []
  /** The voices last listed, and when (`voices()`). */
  @ObservationIgnored private var voiceList: (at: Date, list: [VoiceChoice])?
  /** The pass giving agents their voices, while one runs (`assignMissingVoices`). */
  @ObservationIgnored private var assigning: Task<[String: String], Never>?
  /** A line search found, to show once its chat is open (agent → entry; Search.swift). */
  public var revealing: [String: String] = [:]
  /** Simeon, once the first run's hand-off made him: a second try does not make another (Onboarding.swift). */
  @ObservationIgnored var firstRunAgentId: String?

  /** A message the person sent, shown at once and kept until the host's own copy arrives (the Mac's outbox). */
  struct Outgoing {
    enum State { case sending, sent, failed }
    let id: String
    let text: String
    let files: [(name: String, data: Data)]
    let replyTo: String?
    let at: Double
    /** The chat's lines when it was sent: the host's copy is a line not among them. */
    let known: Set<String>
    var state: State
  }

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
      Task { @MainActor in self?.take(state) }
    }
    await reloadRoster()
    await loadPins()
    // Every agent its own voice from the start, not at its first call (the Mac does the same on opening).
    Task { await assignMissingVoices() }
  }

  public func detach() {
    listening?.cancel()
    listening = nil
    backend = nil
    agents = []; transcripts = [:]; chatRows = [:]; steps = [:]; call = nil; callLevels = []; isLive = false; account = nil; openChat = nil
    layoutTask?.cancel(); layoutTask = nil; pendingLayout = []; refreshing = []; caughtUp = [:]
    pendingAnswers = [:]; unreadAfter = [:]; apps = []; catalog = []; pinnedIds = []
    streamingOnly = [:]; outbox = [:]; arrived = []; olderBefore = [:]; loadingOlder = []; paged = []; firstRunAgentId = nil; revealing = [:]
    voiceList = nil
  }

  public func reloadRoster() async {
    guard let backend else { return }
    do {
      agents = readingOpenChat(sortRoster(try await backend.listAgents()))
    } catch {
      problem = "Couldn't reach your agents: \(error.localizedDescription)"
    }
  }

  public func apply(_ event: BackendEvent) {
    Trace.mark("handling \(event.name)")
    switch event {
    case .agents(let list):
      let sorted = readingOpenChat(sortRoster(list))
      if sorted != agents { agents = sorted }
      catchUpOpenChat()
    case .agentUpserted(let agent):
      // The host sends the same agent again often (each step of a turn); only a change redraws the list.
      if agents.contains(agent) { return }
      var next = agents.filter { $0.id != agent.id }
      next.append(agent)
      agents = readingOpenChat(sortRoster(next))
      if agent.id == openChat { catchUpOpenChat() }
    case .transcript(let change):
      guard let current = transcripts[change.agentId] else { return }
      var streaming = false
      if case .upsert(let agentId, let entry) = change {
        streaming = entry.isStreaming
        let isNew = !current.contains { $0.id == entry.id }
        if isNew && agentId == openChat { arrived.insert(entry.id) }
        // The answer growing at the end of the chat: only its own row changes, unless a whole layout is already waiting.
        let growingLast = !isNew && streaming && current.last?.id == entry.id && outbox[agentId] == nil
        let wholeWaiting = pendingLayout.contains(agentId) && streamingOnly[agentId] == nil
        streamingOnly[agentId] = growingLast && !wholeWaiting ? entry : nil
      } else {
        streamingOnly[change.agentId] = nil
      }
      let next = change.applied(to: current)
      if streamingOnly[change.agentId] != nil {
        transcripts[change.agentId] = next
        scheduleLayout(change.agentId)
      } else {
        setTranscript(change.agentId, next, soon: streaming)
      }
    case .step(let agentId, let id, let summary, let isRunning):
      if isRunning { running[agentId] = id; steps[agentId] = summary }
      else if running[agentId] == id { running[agentId] = nil; steps[agentId] = nil }
    case .connection(let live):
      // Back after a drop (the phone slept, the network changed): what was said meanwhile never streamed, so fetch it.
      let recovered = live && !isLive
      isLive = live
      if recovered, backend != nil {
        Task {
          await reloadRoster()
          if let chat = openChat { await refresh(chat) }
        }
      }
    case .appsChanged:
      Task { await loadApps() }
    case .settingsChanged(let fields):
      if fields.isEmpty || fields.contains("pinnedAgentIds") { Task { await loadPins() } }
    }
  }

  public func agent(_ id: String?) -> Agent? { agents.first { $0.id == id } }

  // MARK: The list, as the Mac's sidebar (pins, read, hidden, delete, duplicate)

  /** The pinned agents, in their order (the host's `pinnedAgentIds`, shared with the Mac). */
  public private(set) var pinnedIds: [String] = []

  /** The pinned agents that still exist and are not hidden, in pin order. */
  public var pinned: [Agent] { pinnedIds.compactMap { id in agents.first { $0.id == id && !$0.isHidden } } }
  /** The list below the pins: every agent not pinned and not hidden, newest activity first. */
  public var listed: [Agent] { let pins = Set(pinnedIds); return agents.filter { !$0.isHidden && !pins.contains($0.id) } }
  public var hiddenAgents: [Agent] { agents.filter(\.isHidden) }

  /** Bumped by each pin written here: a read of the host's pins that started before it would undo it, so it is dropped. */
  @ObservationIgnored private var pinWrites = 0
  /**
   * Pin writes on their way. A read begun while one is (the host's echo of
   * the write before it, say) can come back without it and undo it, so none
   * begins then: the write's own echo reads afterwards. Two quick pins lost
   * the second this way, now and then.
   */
  @ObservationIgnored private var pinWritesInFlight = 0

  public func loadPins() async {
    guard pinWritesInFlight == 0 else { return }
    let started = pinWrites
    guard let settings = try? await backend?.command("getHostSettings", [:]), started == pinWrites, pinWritesInFlight == 0 else { return }
    let ids = settings["pinnedAgentIds"]?.array?.compactMap(\.text) ?? []
    if ids != pinnedIds { pinnedIds = ids }
  }

  /** Pin or unpin: the whole ordered list is written, as the Mac writes it (`setHostSettings({pinnedAgentIds})`); a new pin goes last. */
  public func setPinned(_ agentId: String, _ pinned: Bool) async {
    var next = pinnedIds.filter { $0 != agentId }
    if pinned { next.append(agentId) }
    await writePins(next, failure: pinned ? "Couldn't pin it" : "Couldn't unpin it")
  }

  /** Moves a pin to another pin's place (the Mac's drag in the pin grid). */
  public func movePin(_ agentId: String, to index: Int) async {
    guard let from = pinnedIds.firstIndex(of: agentId) else { return }
    var next = pinnedIds
    next.remove(at: from)
    next.insert(agentId, at: min(max(index, 0), next.count))
    await writePins(next, failure: "Couldn't move the pin")
  }

  /** Shown at once, then written; a refusal puts back what the host holds. */
  private func writePins(_ next: [String], failure: String) async {
    guard next != pinnedIds else { return }
    pinWrites += 1
    pinnedIds = next
    pinWritesInFlight += 1
    let written = await command("setHostSettings", ["pinnedAgentIds": JSON(next)], failure: failure)
    pinWritesInFlight -= 1
    if written == nil { await loadPins() }
  }

  /** Mark as Read / Mark as Unread (`setAgentUnread`), shown at once. */
  public func setUnread(_ agentId: String, _ unread: Bool) async {
    if let index = agents.firstIndex(where: { $0.id == agentId }) {
      agents[index].hasUnread = unread
      agents[index].unreadCount = unread ? max(agents[index].unreadCount, 1) : 0
    }
    await command("setAgentUnread", ["id": .string(agentId), "isUnread": .bool(unread), "atMs": .number(Date().timeIntervalSince1970 * 1000)], failure: "Couldn't change it")
  }

  /** Hide from the list, or show again (`setAgentHiddenFromSidebar`). A hidden agent keeps working and keeps its history. */
  public func setHidden(_ agentId: String, _ hidden: Bool) async {
    if let index = agents.firstIndex(where: { $0.id == agentId }) { agents[index].isHidden = hidden }
    if await command("setAgentHiddenFromSidebar", ["id": .string(agentId), "isHidden": .bool(hidden)], failure: hidden ? "Couldn't hide it" : "Couldn't show it again") == nil {
      await reloadRoster()
    }
  }

  /** Deletes agents or groups and their chats (`deleteAgents`); false when the host refused. */
  @discardableResult
  public func delete(_ agentIds: [String]) async -> Bool {
    guard let backend else { return false }
    do { _ = try await backend.command("deleteAgents", ["ids": JSON(agentIds)]) } catch {
      problem = "Deleting failed. Check your connection and try again."
      return false
    }
    let gone = Set(agentIds)
    agents.removeAll { gone.contains($0.id) }
    if pinnedIds.contains(where: gone.contains) { pinnedIds.removeAll(where: gone.contains) }
    for id in agentIds { transcripts[id] = nil; chatRows[id] = nil }
    return true
  }

  /** A copy of an agent (`duplicateAgent`); the copy's id, to open it. */
  @discardableResult
  public func duplicate(_ agentId: String) async -> String? {
    guard let answer = await command("duplicateAgent", ["id": .string(agentId)], failure: "Couldn't duplicate it") else { return nil }
    await reloadRoster()
    return answer["agent"]?["id"]?.text ?? answer["id"]?.text ?? answer["agentId"]?.text
  }

  private func noteNames() {
    let names = agents.filter { !$0.isGroup }.map { Mentions.AgentName(name: $0.name.trimmingCharacters(in: .whitespaces), id: $0.id, colour: $0.palette.id) }
    if names != mentionNames { mentionNames = names }
    let groups = Set(agents.filter(\.isGroup).map(\.id))
    if groups != groupIds { groupIds = groups }
  }

  /** Which chats are groups, changed only when one is made or deleted: a chat's rows read it instead of the whole roster. */
  public private(set) var groupIds: Set<String> = []

  /** The waveform's bars, kept apart from the call: they change every 90 ms, and only the waveform should redraw with them. */
  public private(set) var callLevels: [Double] = []

  private func take(_ state: CallState?) {
    guard var state else {
      if call != nil { call = nil }
      callLevels = []
      return
    }
    let levels = state.levels
    // The call keeps only whether there are bars, so its screens redraw when something else changes.
    state.levels = levels.isEmpty ? [] : [1]
    if state != call { call = state }
    if levels != callLevels { callLevels = levels }
  }

  /** The members of a group, as agents. */
  public func members(of group: Agent) -> [Agent] { group.memberIds.compactMap { id in agents.first { $0.id == id } } }

  public func rows(for agentId: String) -> [ChatRow] { chatRows[agentId] ?? [] }

  private func setTranscript(_ agentId: String, _ entries: [Entry], soon: Bool = false) {
    transcripts[agentId] = entries
    streamingOnly[agentId] = nil
    for entry in entries where pendingAnswers[entry.id] != nil && (entry["respondedValue"]?.text != nil || entry["widgetDismissed"]?.bool == true) { pendingAnswers[entry.id] = nil }
    settleOutbox(agentId, entries)
    if soon { scheduleLayout(agentId) } else { layOut(agentId) }
  }

  private func layOut(_ agentId: String) {
    pendingLayout.remove(agentId)
    if let entry = streamingOnly.removeValue(forKey: agentId), let rows = chatRows[agentId], let swapped = Self.replacingLast(rows, with: entry) {
      if swapped != rows { chatRows[agentId] = swapped }
      return
    }
    var entries = transcripts[agentId] ?? []
    let waiting = outbox[agentId] ?? []
    entries += waiting.flatMap(Self.entries(for:))
    Trace.mark("laying out \(agentId), \(entries.count) lines")
    let isGroup = agent(agentId)?.isGroup ?? false
    let after = unreadAfter[agentId]
    var rows = Trace.timed("laying out \(agentId), \(entries.count) lines") { Chat.rows(entries, isGroup: isGroup, unreadAfter: after) }
    for item in waiting where item.state == .failed {
      let last = rows.lastIndex { row in row.id == item.id || row.id.hasPrefix(item.id + "-file") } ?? rows.count - 1
      rows.insert(.failedSend(id: "failed-\(item.id)", nonce: item.id), at: min(last + 1, rows.count))
    }
    if chatRows[agentId] != rows { chatRows[agentId] = rows }
  }

  /** The streamed answer's row with its new text, when it is the chat's last row; nil when the chat must be laid out again. */
  static func replacingLast(_ rows: [ChatRow], with entry: Entry) -> [ChatRow]? {
    guard case .bubble(let old)? = rows.last, old.id == entry.id, case .bubble(let new)? = Chat.row(for: entry) else { return nil }
    var next = rows
    next[next.count - 1] = .bubble(new.with(showsName: old.showsName, showsAvatar: old.showsAvatar, author: .some(old.author), quote: .some(old.quote)))
    return next
  }

  /** A waiting message as the host would write it: its text, and a line per file. */
  static func entries(for item: Outgoing) -> [Entry] {
    var lines: [JSON] = item.files.enumerated().map { index, file in
      ["kind": "user-attachment", "id": .string("\(item.id)-file\(index)"), "file_name": .string(file.name), "timestampMs": .number(item.at)]
    }
    if !item.text.isEmpty {
      var message: JSON = ["kind": "message", "id": .string(item.id), "role": "user", "content": .string(item.text), "timestampMs": .number(item.at)]
      if let reply = item.replyTo { message = message.setting("replyTo", .string(reply)) }
      lines.append(message)
    }
    return lines.compactMap(Entry.init)
  }

  /** The host's copy of a waiting message arrived: the waiting one goes, and the host's takes its place without moving in again. */
  private func settleOutbox(_ agentId: String, _ entries: [Entry]) {
    guard var waiting = outbox[agentId], !waiting.isEmpty else { return }
    var claimed: Set<String> = []
    waiting.removeAll { item in
      guard item.state != .failed else { return false }
      let text = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
      let names = Set(item.files.map(\.name))
      let copy = entries.first { entry in
        guard !item.known.contains(entry.id), !claimed.contains(entry.id) else { return false }
        // The host keeps the nonce it was sent with: that is this message, whatever the host made of its text.
        if entry["clientNonce"]?.text == item.id { return true }
        if !text.isEmpty {
          return (entry.isFromPerson || entry.role == "user") && entry.content?.trimmingCharacters(in: .whitespacesAndNewlines) == text
        }
        return entry.kind == "user-attachment" && names.contains(entry["file_name"]?.text ?? entry["fileName"]?.text ?? "")
      }
      guard let copy else { return false }
      claimed.insert(copy.id)
      arrived.remove(copy.id)
      return true
    }
    outbox[agentId] = waiting.isEmpty ? nil : waiting
  }

  /** The motion was played: a row scrolled away and back comes in still. */
  public func settled(_ id: String) { arrived.remove(id) }

  private func scheduleLayout(_ agentId: String) {
    pendingLayout.insert(agentId)
    guard layoutTask == nil else { return }
    layoutTask = Task { [weak self] in
      try? await Task.sleep(nanoseconds: 90_000_000)
      guard let self, !Task.isCancelled else { return }
      self.layoutTask = nil
      for id in self.pendingLayout { self.layOut(id) }
    }
  }

  /**
   * A chat comes on screen: what the app already has at once, then the chat
   * opened on the host as the window opens it (its newest lines, and its
   * new ones streaming from now on); and it is read. The "New" line marks
   * what came since it was last read.
   */
  public func open(_ agentId: String) async {
    guard let backend else { return }
    Trace.mark("opening \(agentId)")
    openChat = agentId
    let unread = agent(agentId).map { $0.hasUnread ? max($0.unreadCount, 1) : 0 } ?? 0
    if let cached = transcripts[agentId] {
      unreadAfter[agentId] = Self.unreadBoundary(cached, unread: unread)
      setTranscript(agentId, cached)
    }
    await refresh(agentId, unread: unread)
    if let index = agents.firstIndex(where: { $0.id == agentId }) { agents[index].hasUnread = false; agents[index].unreadCount = 0 }
    await backend.markRead(agentId)
  }

  /**
   * A chat's newest lines for its preview (a long press on it in the list),
   * read without opening it on the host, so it stays unread. Kept: the chat
   * opens with them at once and fetches the rest.
   */
  public func peek(_ agentId: String) async {
    guard let backend, transcripts[agentId] == nil, !peeking.contains(agentId) else { return }
    peeking.insert(agentId)
    defer { peeking.remove(agentId) }
    guard let entries = try? await backend.tail(agentId, limit: 40), transcripts[agentId] == nil else { return }
    setTranscript(agentId, entries)
  }

  /** The chat left the screen: all of it was read, whatever came while it was open. */
  public func close(_ agentId: String) {
    if openChat == agentId { openChat = nil }
    markChatRead(agentId)
  }

  /**
   * Whether the app is in front (the app sets it from its scene): a chat left
   * open behind a locked phone is not being read.
   */
  @ObservationIgnored public var isForeground = true

  /** The chat on screen is read: here at once, and on the host. */
  public func markChatRead(_ agentId: String) {
    if let index = agents.firstIndex(where: { $0.id == agentId }), agents[index].hasUnread || agents[index].unreadCount > 0 {
      agents[index].hasUnread = false
      agents[index].unreadCount = 0
    }
    markReadSoon(agentId)
  }

  /**
   * The host counts a chat unread when anything in it is newer than its last
   * reading (`lastActivityAt > lastViewedAt`), so a line that comes into the
   * chat on screen makes it unread again, and going back showed it unread
   * (the founder, 9 October 2026). While it is on screen, the roster's word
   * for it is "read", and the host is told so.
   */
  private func readingOpenChat(_ list: [Agent]) -> [Agent] {
    guard isForeground, let open = openChat, let index = list.firstIndex(where: { $0.id == open }), list[index].hasUnread || list[index].unreadCount > 0 else { return list }
    var read = list
    read[index].hasUnread = false
    read[index].unreadCount = 0
    markReadSoon(open)
    return read
  }

  @ObservationIgnored private var marking: Set<String> = []
  @ObservationIgnored private var markAgain: Set<String> = []

  /** One `setAgentUnread` at a time per chat; one more after it if more came meanwhile. */
  private func markReadSoon(_ agentId: String) {
    guard let backend else { return }
    if marking.contains(agentId) { markAgain.insert(agentId); return }
    marking.insert(agentId)
    Task {
      await backend.markRead(agentId)
      marking.remove(agentId)
      if markAgain.remove(agentId) != nil { markReadSoon(agentId) }
    }
  }

  /** The chat fetched again: its newest lines, with any that streamed in meanwhile kept. */
  public func refresh(_ agentId: String, unread: Int? = nil) async {
    guard let backend, !refreshing.contains(agentId) else { return }
    refreshing.insert(agentId)
    fetching.insert(agentId)
    Trace.mark("waiting for \(agentId)'s lines")
    defer { refreshing.remove(agentId); fetching.remove(agentId) }
    do {
      let page = try await backend.transcriptPage(agentId, before: nil)
      let fresh = page.entries
      var merged = Self.merge(fresh, live: transcripts[agentId] ?? [])
      if paged.contains(agentId), let oldest = fresh.first?.timestampMs {
        // Older pages scrolled in stay: the fetch carries only the newest lines.
        let known = Set(merged.map(\.id))
        merged = (transcripts[agentId] ?? []).filter { !known.contains($0.id) && ($0.timestampMs ?? 0) < oldest } + merged
      } else {
        olderBefore[agentId] = page.olderBefore
      }
      if let unread { unreadAfter[agentId] = Self.unreadBoundary(merged, unread: unread) }
      setTranscript(agentId, merged)
    } catch {
      guard transcripts[agentId] == nil else { return }
      setTranscript(agentId, [])
      problem = "Couldn't open this chat: \(error.localizedDescription)"
    }
  }

  /** The open chat's newest line is one the app has not seen (a line that did not stream): fetch the chat again. */
  private func catchUpOpenChat() {
    guard let chat = openChat, let newest = agent(chat)?.lastMessageId, let have = transcripts[chat], !refreshing.contains(chat) else { return }
    guard !have.contains(where: { $0.id == newest }), caughtUp[chat] != newest else { return }
    caughtUp[chat] = newest
    Task { await refresh(chat) }
  }

  /** The fetched lines, and after them any live line the fetch had not seen yet. */
  static func merge(_ fresh: [Entry], live: [Entry]) -> [Entry] {
    guard !fresh.isEmpty else { return live }
    let known = Set(fresh.map(\.id))
    let newest = fresh.compactMap(\.timestampMs).max() ?? 0
    return fresh + live.filter { !known.contains($0.id) && ($0.timestampMs ?? .infinity) >= newest }
  }

  /** Just before the oldest of the last `unread` lines an agent wrote; nil when nothing is unread. */
  static func unreadBoundary(_ entries: [Entry], unread: Int) -> Double? {
    guard unread > 0 else { return nil }
    let theirs = entries.filter { !$0.isFromPerson && $0.timestampMs != nil && ($0.kind == "message" || $0.kind == "send-message") && $0.teammate == nil }
    guard let first = theirs.suffix(unread).first?.timestampMs else { return nil }
    return first - 1
  }

  /** The hundred lines before the oldest one here (the Mac's chat, scrolled near its top). */
  public func loadOlder(_ agentId: String) async {
    guard let backend, let before = olderBefore[agentId], !loadingOlder.contains(agentId) else { return }
    loadingOlder.insert(agentId)
    defer { loadingOlder.remove(agentId) }
    guard let page = try? await backend.transcriptPage(agentId, before: before) else { return }
    let have = transcripts[agentId] ?? []
    let known = Set(have.map(\.id))
    paged.insert(agentId)
    olderBefore[agentId] = page.olderBefore
    setTranscript(agentId, page.entries.filter { !known.contains($0.id) } + have)
  }

  /**
   * A message, and the composer's files (each put on the agent's computer
   * first, `uploadAttachment`, as the Mac does). It shows at once, as the
   * Mac's does, and stays until the host's copy arrives; if it cannot be
   * sent it says "Failed to send" under it, with Resend and Delete.
   */
  public func send(_ text: String, to agentId: String, attachments files: [(name: String, data: Data)] = [], replyTo: String? = nil) async {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard backend != nil, !trimmed.isEmpty || !files.isEmpty else { return }
    let item = Outgoing(id: "ios-\(UUID().uuidString.lowercased())", text: trimmed, files: files, replyTo: replyTo, at: Date().timeIntervalSince1970 * 1000, known: Set((transcripts[agentId] ?? []).map(\.id)), state: .sending)
    outbox[agentId, default: []].append(item)
    arrived.insert(item.id)
    for index in files.indices { arrived.insert("\(item.id)-file\(index)") }
    layOut(agentId)
    await deliver(item.id, in: agentId)
  }

  /** Resend on a message that failed. */
  public func resend(_ id: String, in agentId: String) async {
    guard outbox[agentId]?.contains(where: { $0.id == id && $0.state == .failed }) == true else { return }
    await deliver(id, in: agentId)
  }

  /** Delete on a message that failed: it was never sent, so it only leaves the screen. */
  public func discardFailed(_ id: String, in agentId: String) {
    outbox[agentId]?.removeAll { $0.id == id }
    if outbox[agentId]?.isEmpty == true { outbox[agentId] = nil }
    layOut(agentId)
  }

  private func mark(_ id: String, in agentId: String, _ state: Outgoing.State) {
    guard let index = outbox[agentId]?.firstIndex(where: { $0.id == id }) else { return }
    outbox[agentId]?[index].state = state
    layOut(agentId)
  }

  private func deliver(_ id: String, in agentId: String) async {
    guard let backend, let item = outbox[agentId]?.first(where: { $0.id == id }) else { return }
    mark(id, in: agentId, .sending)
    var refs: [AttachmentRef] = []
    do {
      for file in item.files {
        let answer = try await backend.command("uploadAttachment", ["filename": .string(file.name), "bytesBase64": .string(file.data.base64EncodedString()), "agentId": .string(agentId)])
        guard let path = answer["path"]?.text else { throw GatewayError(message: "the computer kept no copy", refused: true) }
        refs.append(AttachmentRef(path: path, name: file.name))
      }
      try await backend.send(agentId, text: item.text, attachments: refs, replyTo: item.replyTo, nonce: item.id)
    } catch {
      mark(id, in: agentId, .failed)
      return
    }
    mark(id, in: agentId, .sent)
    settleOutbox(agentId, transcripts[agentId] ?? [])
    layOut(agentId)
    // The host has it. If its copy did not stream (a dropped stream), fetch the chat; then the waiting one goes either way.
    Task { [weak self] in
      try? await Task.sleep(nanoseconds: 4_000_000_000)
      await self?.settleLate(id, in: agentId)
    }
  }

  private func settleLate(_ id: String, in agentId: String) async {
    guard outbox[agentId]?.contains(where: { $0.id == id }) == true else { return }
    await refresh(agentId)
    if outbox[agentId]?.contains(where: { $0.id == id && $0.state == .sent }) == true {
      outbox[agentId]?.removeAll { $0.id == id }
      if outbox[agentId]?.isEmpty == true { outbox[agentId] = nil }
      layOut(agentId)
    }
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

  /**
   * The connected apps, read again. One read at a time: a card, the Connect
   * apps sheet, an app event and the sign-in's poll often ask together, and
   * an older answer landing last turned an Added card back into Add.
   */
  public func loadApps() async {
    if let running = appsLoad { return await running.value }
    let load = Task { await readApps() }
    appsLoad = load
    await load.value
    appsLoad = nil
  }

  @ObservationIgnored private var appsLoad: Task<Void, Never>?

  private func readApps() async {
    guard let backend else { return }
    // Both at once: each is a round trip to the person's computer.
    let needsCatalog = catalog.isEmpty
    async let servers = try? backend.command("desktopMcp", ["action": "listServers", "args": []])
    async let list = needsCatalog ? try? backend.command("desktopMcp", ["action": "getCatalog", "args": []]) : nil
    if let state = await servers {
      let next = (state["servers"]?.array ?? state.array ?? []).compactMap(ConnectedApp.init)
      if next != apps { apps = next }
      appsLoadedAt = Date()
    }
    if let list = await list {
      let next = (list.array ?? list["plugins"]?.array ?? []).compactMap(CatalogApp.init)
      if next != catalog { catalog = next }
    }
  }

  /** When the connected apps were last read, so Add does not read them again a moment later. */
  @ObservationIgnored private var appsLoadedAt: Date?

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
    // The box's app events keep the list current, so it is read here only when it never was.
    if catalog.isEmpty || appsLoadedAt == nil { await loadApps() }
    let key = name.lowercased()
    var server = apps.first { $0.name.lowercased() == key || ($0.pluginId != nil && $0.pluginId == catalogApp(named: name)?.id) }
    if server == nil, let plugin = catalogApp(named: name) {
      do {
        // The install and the vendor's server id at once (the second only names the server the first makes).
        async let installed = backend.command("desktopMcp", ["action": "installEntry", "args": [["entryId": .string(plugin.id)]]])
        async let vendorId = try? backend.command("desktopMcp", ["action": "vendorServerIdForPlugin", "args": [.string(plugin.id)]])
        let state = try await installed
        apps = (state["servers"]?.array ?? []).compactMap(ConnectedApp.init)
        appsLoadedAt = Date()
        if let vendor = await vendorId, let id = vendor.text {
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
      return await signInStarted(started, name: name)
    } catch {
      problem = "Couldn't connect \(name): \(error.localizedDescription)"
      return nil
    }
  }

  /** The sign-in's page; or, when the box has none to offer, why (it was already signed in, or the app can't sign in here), said rather than silently dropped. */
  private func signInStarted(_ started: JSON, name: String) async -> URL? {
    if let url = started["authorizationUrl"]?.text.flatMap(URL.init(string:)) { return url }
    if started["status"]?.string == "already-authenticated" {
      await readApps()
      return nil
    }
    problem = started["message"]?.text ?? "\(name) didn't offer a sign-in."
    return nil
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
      Task { await loadApps() }
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
      guard let started = try await backend?.command("desktopMcp", ["action": "authenticateServer", "args": [.string(app.serverId), .string(app.accountKey), "connector_card"]]) else { return nil }
      return await signInStarted(started, name: app.name)
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

  /** A voice in the Mac's picker: its name only (the founder, 1 October 2026), a sample to play when it has one, and its gender ("female", "male") to match an agent's name. */
  public struct VoiceChoice: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let sample: URL?
    public let gender: String?
    public init(id: String, name: String, sample: URL?, gender: String? = nil) { self.id = id; self.name = name; self.sample = sample; self.gender = gender }
  }

  /** The voice an agent with none saved speaks with (`VOICE_CALL_DEFAULT_VOICE_ID`, Michael: the platform agent's own). */
  public static let defaultVoiceId = "ljX1ZrXuDIIRVcmiVSyR"

  /** The voices to pick from (`GET …/proxy/v1/voice/voices`: the founder's, never ElevenLabs' others); none when calls are not switched on. Kept ten minutes, as the Mac keeps them. */
  public func voices() async -> [VoiceChoice] {
    if let voiceList, Date().timeIntervalSince(voiceList.at) < 600 { return voiceList.list }
    guard let list = try? await backend?.server("proxy/v1/voice/voices", method: nil, body: nil) else { return [] }
    let rows: [VoiceChoice] = (list.array ?? []).compactMap { row in
      guard let id = row["id"]?.text, let name = row["name"]?.text else { return nil }
      let gender = row["gender"]?.text.map { $0.lowercased() }
      return VoiceChoice(id: id, name: name, sample: row["preview_url"]?.text.flatMap(URL.init(string:)), gender: gender == "female" || gender == "male" ? gender : nil)
    }
    if !rows.isEmpty { voiceList = (Date(), rows) }
    return rows
  }

  /**
   * The agent's voice for its picker and its call: its own while it is on the
   * list, else one given now by its name (`AgentVoices`), with every other
   * agent missing one. Nil is the agent's own voice, Michael.
   */
  public func ensureVoice(_ agentId: String) async -> String? {
    if agent(agentId) == nil { await reloadRoster() }
    let list = await voices()
    if let kept = AgentVoices.kept(agent(agentId)?.voiceId, listed: list) { return kept }
    guard !list.isEmpty, agent(agentId) != nil else { return nil }
    // A pass already under way may have started before this agent was hired: then one more.
    var all = await assignMissingVoices()
    if all[agentId] == nil { all = await assignMissingVoices() }
    return all[agentId]
  }

  /**
   * Gives each agent without a voice on the list its own, as the Mac does on
   * opening (`assignMissingVoices`), and saves it on the agent (`updateAgent`
   * with `voiceId`). One pass at a time; every agent's voice after it.
   */
  @discardableResult
  public func assignMissingVoices() async -> [String: String] {
    if let assigning { return await assigning.value }
    let task = Task { await self.giveMissingVoices() }
    assigning = task
    let all = await task.value
    assigning = nil
    return all
  }

  private func giveMissingVoices() async -> [String: String] {
    let list = await voices()
    let plan = AgentVoices.plan(agents: agents, voices: list)
    for (agentId, voiceId) in plan.given {
      guard let backend, let agent = agent(agentId) else { continue }
      let was = agent.voiceId
      if let index = agents.firstIndex(where: { $0.id == agentId }) { agents[index].voiceId = voiceId }
      let profile: JSON = ["name": .string(agent.name), "description": .string(agent.description), "title": .string(agent.title), "voiceId": .string(voiceId)]
      do {
        _ = try await backend.command("updateAgent", ["id": .string(agentId), "profile": profile])
        Trace.mark("voice for \(agentId): \(voiceId) (given by name\(was.map { ", \($0) is no longer listed" } ?? ""))")
      } catch {
        Trace.mark("voice \(voiceId) given to \(agentId) for now, not saved: \(error.localizedDescription)")
      }
    }
    return plan.voices
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

  /** The agent's own colour on the call: the one the app draws it in (its id's when it has none saved), not blue (the founder, 9 October 2026: the call showed another avatar). */
  public func startCall(_ agent: Agent) {
    backend?.call?.start(agentId: agent.id, agentName: agent.name, colour: agent.palette.id)
  }

  public func mute(_ muted: Bool) { backend?.call?.mute(muted) }
  public func hangUp() { backend?.call?.hangUp() }
}
