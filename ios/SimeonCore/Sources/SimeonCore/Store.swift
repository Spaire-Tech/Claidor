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
  /** The name tools are called under (`serverIdentifier`), the id "@" keys its row by. */
  public var serverIdentifier: String
  public var url: String?
  /** One the person's team added, not the person. */
  public var isTeamServer = false

  public init(serverId: String, name: String, pluginId: String?, accountKey: String, status: String, toolCount: Int, serverIdentifier: String? = nil, url: String? = nil, isTeamServer: Bool = false) {
    self.serverId = serverId; self.name = name; self.pluginId = pluginId; self.accountKey = accountKey; self.status = status; self.toolCount = toolCount
    self.serverIdentifier = serverIdentifier ?? name; self.url = url; self.isTeamServer = isTeamServer
  }

  init?(_ json: JSON) {
    guard let id = json["id"]?.text else { return nil }
    self.init(serverId: id, name: json["name"]?.string ?? id, pluginId: json["pluginId"]?.text, accountKey: json["accountKey"]?.text ?? "default", status: json["status"]?.string ?? "", toolCount: json["toolCount"]?.int ?? 0,
              serverIdentifier: json["serverIdentifier"]?.text, url: json["url"]?.text, isTeamServer: json["isTeamServer"]?.bool ?? false)
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
  /** The picture the sign-in gave (`avatarUrl`, Google's), which Settings' account card shows. */
  public let pictureURL: URL?

  public init(name: String, email: String, pictureURL: URL? = nil) { self.name = name; self.email = email; self.pictureURL = pictureURL }

  public init?(profile: JSON) {
    let email = profile["email"]?.string ?? ""
    let name = profile["preferredName"]?.text ?? profile["name"]?.text ?? profile["nickname"]?.text ?? email.split(separator: "@").first.map(String.init) ?? ""
    if name.isEmpty && email.isEmpty { return nil }
    let picture = profile["avatarUrl"]?.text.flatMap(URL.init(string:)).flatMap { $0.scheme == "https" ? $0 : nil }
    self.init(name: name, email: email, pictureURL: picture)
  }

  /** "BF" for Bass Fall: the first and last words' letters, as the window's account card has them (`AccountInitials`). */
  public var initials: String { AccountInitials.of(name.isEmpty ? email : name) }
}

/**
 * What every screen reads: the roster, the chats, the call, the account.
 * One store for the app; the screens only draw it and call its actions.
 */
@MainActor
@Observable
public final class AppStore {
  public private(set) var agents: [Agent] = [] {
    didSet { noteNames(); rebuild.selectionChanged(rebuildInputs) }
  }
  /** The agents' names and colours for the chat's text, changed only when one of them does, so a roster update (an agent's status) does not redraw every message. */
  public private(set) var mentionNames: [Mentions.AgentName] = []
  /** Each chat's entries; the screens draw `chatRows`, so a change here alone redraws nothing. */
  @ObservationIgnored public private(set) var transcripts: [String: [Entry]] = [:]
  /** The chat on screen, if one is: it is the one fetched again after a reconnect or a missed line. */
  public private(set) var openChat: String? {
    didSet { if openChat != oldValue { rebuild.selectionChanged(rebuildInputs) } }
  }
  /** Each open chat laid out (Chat.rows), kept with its entries so a redraw does not lay it out again. */
  public private(set) var chatRows: [String: [ChatRow]] = [:]
  /** Each chat's runs (`Chat.runFlags`), the messages still sending among them, by row id: where the Mac sets a row 12 lower and where it rounds a bubble's corner to 6. */
  public private(set) var runFlags: [String: [String: RunFlags]] = [:]
  /** The step an agent is on right now ("Checking Linear"), by agent. */
  public private(set) var steps: [String: String] = [:]
  public private(set) var call: CallState?
  public private(set) var isLive = false {
    didSet { if isLive != oldValue { rebuild.transportChanged(rebuildInputs) } }
  }
  public private(set) var isLoading = false
  public var account: Account?
  /** Whether this account may use Simeon (`GetSandAccessStatus`): the composer's notice and its paused Send. */
  public internal(set) var access: SandAccess = .checking
  /** The computer refused this account before the agents were ever read (`sand-access-blocked`). */
  public private(set) var accessBlocked = false
  /** The agents were read once since signing in (`hasReachedBox`): the access cover never comes back after. */
  public private(set) var hasReachedBox = false
  /** Settings' Usage & Billing (`usageSummary`): read when Settings opens, at most every 30 s. */
  public internal(set) var usage: UsageLoad = .empty
  @ObservationIgnored public internal(set) var usageReadAt: Date?
  /** Something went wrong that the person should hear about, once. */
  public var problem: String?
  /** Each chat's first ask to use this Mac still waiting (`entries.find(NNe)`): the Mac's dock above the composer. */
  public private(set) var localAsks: [String: LocalAsk] = [:]
  /** Auto-review approvals answered here, by entry, until the box's own copy says so (the window's `QWn`). */
  public private(set) var answeredApprovals: [String: String] = [:]
  /** The computer's notices ("Agent failed to respond"…), an open agent's drawn over its composer (`hVn`). */
  public private(set) var trayList = TrayList()
  /** Each file card's line once read (`readAttachmentText`, kept for the session as the window keeps it). */
  @ObservationIgnored private var fileLines: [String: String] = [:]
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

  /** Each agent's routines as the host lists them (`getAgentAutomations`, and its `agents-automation` pushes); absent until read. */
  public internal(set) var routinesByAgent: [String: [Routine]] = [:]
  /** The sidebar's sections as the host keeps them (`sidebarSections`); nil until the computer has answered, when nothing can be moved. */
  public internal(set) var sidebarSections: [SidebarSection]?
  /** Bumped by each sections write, so a read begun before it is dropped (as the pins do). */
  @ObservationIgnored var sectionWrites = 0
  /** Counts the sections made here, for their ids (the window's `idSeed`). */
  @ObservationIgnored var sectionSeed = 0

  /** Each agent's computer: its status, read and pushed, and who is looking (CloudComputer.swift, StoreComputer.swift). */
  public internal(set) var computer = ComputerBook() {
    didSet {
      if computer.status(rebuildBox) != oldValue.status(rebuildBox) || computer.isEnsuring(rebuildBox) != oldValue.isEnsuring(rebuildBox) { rebuild.statusChanged(rebuildInputs) }
      if computer.diskPressure != oldValue.diskPressure { diskPressureChanged() }
    }
  }
  /** The agents could not be read the last time they were asked for (the sidebar's "Can't reach your computer"). */
  public private(set) var rosterFailed = false
  /** Retry is reading them again ("Retrying…"). */
  public private(set) var rosterRetrying = false
  /** What the box says of the agents, as it says it, before the list's own handling: the Mac's notifications and Dock badge (`agents-control-feed.ts`). */
  public enum RosterNews {
    /** The agents read at a connect (`listAgents`). */
    case seed([Agent])
    case roster([Agent])
    case update(Agent)
  }
  @ObservationIgnored public var rosterNews: ((RosterNews) -> Void)?
  /** A message the box took (`sendPrompt` answered): the Mac lets go of its "Allow once" answers then (`clearLocalToolApprovals`). */
  @ObservationIgnored public var promptSent: ((String) -> Void)?
  /** The phone says so in an alert; the Mac's sidebar says it in place, as the window does. */
  @ObservationIgnored public var reportsRosterFailure = true
  /** The app shows the computer's rebuild (the Mac): sending waits through it, the list holds still, Disk Saver is set to work. */
  @ObservationIgnored public var followsRebuild = false
  /** The agent the window has selected, when the app says (the Mac's sidebar); see `computerSelection`. */
  public var windowSelection: String? {
    didSet { if windowSelection != oldValue { rebuild.selectionChanged(rebuildInputs) } }
  }
  /** Simeon's computer being rebuilt, or the stream away (RebuildDriver.swift). */
  public let rebuild = RebuildDriver()
  /** Roster pushes skipped while the computer was rebuilt: the list is read again after. */
  @ObservationIgnored var rosterHeld = false
  /** A Disk Saver being made, so a second click waits for it. */
  @ObservationIgnored var diskSaverCreation: Task<String?, Never>?
  /** Disk Saver was set to work for this time the disk ran low. */
  @ObservationIgnored var diskAuditDone = false
  /** Each agent's subagents as the host lists them (`getSubagents`, `subagents`): its helpers' screens. */
  public internal(set) var subagentsByAgent: [String: [JSON]] = [:]
  /** The agent's pointer on its computer, the last place it moved or clicked (`computer-action`). */
  public internal(set) var pointers: [String: AgentPointer] = [:]
  /** When the computer was last read again for the window coming forward or the stream coming back. */
  @ObservationIgnored var lastComputerCatchUp = Date.distantPast

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
  /** The thread open in each chat (agent → the id of its first message), laid out in `threadRows`. */
  public private(set) var openThreads: [String: String] = [:]
  /** Each open thread laid out (Chat.threadRows): its first message and its replies. */
  public private(set) var threadRows: [String: [ChatRow]] = [:]
  /** Each chat's thread replies and the first message of their thread, made with its layout (a quote asks on every draw). */
  @ObservationIgnored private var threadRoots: [String: [String: String]] = [:]
  /** Chats that could not be fetched and have nothing to show: "Couldn't load this conversation" and Retry. */
  public private(set) var loadFailed: Set<String> = []
  /**
   * The computer out of reach: the event stream dropped and has not come
   * back (the Mac's coordinator says "down" the moment it drops, and the
   * window queues from then). A message waits ("Will send when
   * reconnected") and goes when it does, marked as written offline.
   * Unknown is not down.
   */
  public private(set) var isDown = false
  /** Simeon, once the first run's hand-off made him: a second try does not make another (Onboarding.swift). */
  @ObservationIgnored var firstRunAgentId: String?

  /** A message the person sent, shown at once and kept until the host's own copy arrives (the Mac's outbox). */
  struct Outgoing {
    /** Held while the computer is out of reach, on its way, with the host, or refused. */
    enum State { case queued, sending, sent, failed }
    let id: String
    let text: String
    let files: [(name: String, data: Data)]
    let replyTo: String?
    /** A reply in the thread of `replyTo` (`isFork`). */
    var thread = false
    /** The composer's document, when a skill was picked with "/" (`richText`). */
    var richText: String?
    let at: Double
    /** The chat's lines when it was sent: the host's copy is a line not among them. */
    let known: Set<String>
    var state: State
    /** Held while the computer was out of reach: when it was written, sent with it (`composedAtMs`). */
    var composedOffline = false
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
    connectRebuild(backend)
    // Whether this account may use Simeon, beside the agents (`sandAccess.connect`).
    Task { await refreshAccess() }
    Task { await loadTrays() }
    await reloadRoster()
    await loadPins()
    await loadSections()
    // Every agent its own voice from the start, not at its first call (the Mac does the same on opening).
    Task { await assignMissingVoices() }
  }

  public func detach() {
    listening?.cancel()
    listening = nil
    backend = nil
    agents = []; transcripts = [:]; chatRows = [:]; runFlags = [:]; steps = [:]; call = nil; callLevels = []; isLive = false; account = nil; usage = .empty; usageReadAt = nil; access = .checking; accessBlocked = false; hasReachedBox = false; openChat = nil
    layoutTask?.cancel(); layoutTask = nil; pendingLayout = []; refreshing = []; caughtUp = [:]
    pendingAnswers = [:]; answeredApprovals = [:]; localAsks = [:]; trayList = TrayList(); fileLines = [:]; unreadAfter = [:]; apps = []; catalog = []; pinnedIds = []; routinesByAgent = [:]; sidebarSections = nil
    streamingOnly = [:]; outbox = [:]; arrived = []; olderBefore = [:]; loadingOlder = []; paged = []; firstRunAgentId = nil; revealing = [:]
    openThreads = [:]; threadRows = [:]; threadRoots = [:]; loadFailed = []; isDown = false
    computer = ComputerBook(); subagentsByAgent = [:]; pointers = [:]; lastComputerCatchUp = .distantPast
    rebuild.reset(); rosterHeld = false; diskSaverCreation = nil; diskAuditDone = false; rosterFailed = false; windowSelection = nil
    voiceList = nil
    sentFiles = []
  }

  public func reloadRoster() async {
    guard let backend else { return }
    do {
      let list = try await backend.listAgents()
      rosterNews?(.seed(list))
      agents = readingOpenChat(sortRoster(list))
      rosterFailed = false
      accessBlocked = false
      hasReachedBox = true
    } catch {
      rosterFailed = true
      // The computer refused this account (`EnsureSandBox`'s permission_denied: no plan): the window's access cover, not a failure to report.
      accessBlocked = (error as? SimeonAPIError)?.status == 403
      if reportsRosterFailure && !accessBlocked { problem = "Couldn't reach your agents: \(error.localizedDescription)" }
    }
  }

  /**
   * The sidebar's Retry under "Can't reach your computer" and "Reconnecting
   * to your computer…": the computer asked for again (the window restarts
   * its connection), then the agents read again.
   */
  public func retryRoster() async {
    rosterRetrying = true
    defer { rosterRetrying = false }
    if let live = backend as? LiveBackend { await live.gateway.invalidate() }
    await reloadRoster()
  }

  public func apply(_ event: BackendEvent) {
    Trace.mark("handling \(event.name)")
    switch event {
    case .agents(let list): rosterNews?(.roster(list))
    case .agentUpserted(let agent): rosterNews?(.update(agent))
    default: break
    }
    switch event {
    case .agents where followsRebuild && rebuild.isHardLocked, .agentUpserted where followsRebuild && rebuild.isHardLocked:
      // The agents' list holds still while the computer is rebuilt, and is read again after (`roster.setFrozen`).
      rosterHeld = true
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
      if isDown == live { setDown(!live) }
      if recovered, let backend {
        computerReconnected()
        Task { await loadTrays() }
        Task { rebuild.migrationReadBack(await backend.migrationStatus()) }
        Task {
          await reloadRoster()
          if let chat = openChat { await refresh(chat) }
        }
      }
    case .appsChanged:
      Task { await loadApps() }
    case .settingsChanged(let fields):
      if fields.isEmpty || fields.contains("pinnedAgentIds") { Task { await loadPins() } }
      if fields.isEmpty || fields.contains("sidebarSections") { Task { await loadSections() } }
    case .automations(let agentId, let rows):
      let list = rows.compactMap(Routine.init(json:))
      if routinesByAgent[agentId] != list { routinesByAgent[agentId] = list }
    case .computer, .diskPressure, .computerAction, .subagents:
      applyComputer(event)
    case .migration(let step):
      rebuild.migrationEvent(step)
    case .tray(let payload):
      trayList.take(payload)
    }
  }

  // MARK: The computer's notices (trays)

  /** `getTrays`, with what comes meanwhile applied over its answer. */
  public func loadTrays() async {
    guard let backend else { return }
    let seq = trayList.beginRead()
    let answer = try? await backend.command("getTrays", [:])
    guard backend === self.backend else { return }
    trayList.finishRead(seq, answer: answer)
  }

  /** The tray's X (`dismissTray`): it goes when the computer says so. No failure is shown, as in the window. */
  public func dismissTray(_ id: String) async {
    _ = try? await backend?.command("dismissTray", ["id": .string(id)])
  }

  /** "Clear all" (`clearTrays`): every notice on the computer, not only this agent's, as the window does. */
  public func clearTrays() async {
    _ = try? await backend?.command("clearTrays", [:])
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
    forgetAgents(agentIds)
    return true
  }

  /** Agents deleted: out of the roster, the pins and the chats kept. */
  func forgetAgents(_ agentIds: [String]) {
    let gone = Set(agentIds)
    agents.removeAll { gone.contains($0.id) }
    if pinnedIds.contains(where: gone.contains) { pinnedIds.removeAll(where: gone.contains) }
    for id in agentIds { transcripts[id] = nil; chatRows[id] = nil; runFlags[id] = nil; routinesByAgent[id] = nil; localAsks[id] = nil }
  }

  /** An agent changed here before the host says so (an optimistic edit). */
  func updateAgentLocally(_ index: Int, _ change: (inout Agent) -> Void) {
    guard agents.indices.contains(index) else { return }
    var agent = agents[index]
    change(&agent)
    if agent != agents[index] { agents[index] = agent }
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
    let ask = LocalAsk.waiting(in: entries)
    if localAsks[agentId] != ask { localAsks[agentId] = ask }
    for entry in entries where pendingAnswers[entry.id] != nil && (entry["respondedValue"]?.text != nil || entry["widgetDismissed"]?.bool == true) { pendingAnswers[entry.id] = nil }
    settleOutbox(agentId, entries)
    if soon { scheduleLayout(agentId) } else { layOut(agentId) }
  }

  private func layOut(_ agentId: String) {
    pendingLayout.remove(agentId)
    // Only the streamed row redrawn, unless a thread is open: its rows are laid out with the chat's.
    let streamed = streamingOnly.removeValue(forKey: agentId)
    if openThreads[agentId] == nil, let entry = streamed, let rows = chatRows[agentId], let swapped = Self.replacingLast(rows, with: entry) {
      if swapped != rows { chatRows[agentId] = swapped }
      return
    }
    var entries = transcripts[agentId] ?? []
    let waiting = outbox[agentId] ?? []
    entries += waiting.flatMap(Self.entries(for:))
    Trace.mark("laying out \(agentId), \(entries.count) lines")
    let isGroup = agent(agentId)?.isGroup ?? false
    let after = unreadAfter[agentId]
    // Older lines still to load may hold a reply's first message: such a reply waits for them (the window's `mayHoldOlderHistory`).
    let older = olderBefore[agentId] != nil
    var rows = Trace.timed("laying out \(agentId), \(entries.count) lines") { Chat.rows(entries, isGroup: isGroup, unreadAfter: after, mayHoldOlderHistory: older) }
    rows = Self.withSendStates(rows, waiting)
    let split = Chat.threadSplit(entries, mayHoldOlderHistory: older)
    let flags = Chat.runFlags(split.visible, unreadAfter: after, threads: Set(split.counts.keys))
    if runFlags[agentId] != flags { runFlags[agentId] = flags }
    if chatRows[agentId] != rows { chatRows[agentId] = rows }
    threadRoots[agentId] = Self.threadRoots(entries)
    if let root = openThreads[agentId] {
      let thread = Self.withSendStates(Chat.threadRows(root, in: entries, isGroup: isGroup), waiting)
      if threadRows[agentId] != thread { threadRows[agentId] = thread }
    }
  }

  /** Each thread reply's first message, by the reply's id. */
  static func threadRoots(_ entries: [Entry]) -> [String: String] {
    guard entries.contains(where: \.isBranched) else { return [:] }
    let byId = Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    var out: [String: String] = [:]
    for entry in entries where entry.isBranched { out[entry.id] = Chat.threadRoot(of: entry, in: byId) }
    return out
  }

  /** "Failed to send" or "Waiting to send…" under each waiting message that has a row here (the chat or its thread). */
  static func withSendStates(_ rows: [ChatRow], _ waiting: [Outgoing]) -> [ChatRow] {
    var rows = rows
    for item in waiting where item.state == .failed || item.state == .queued {
      guard let last = rows.lastIndex(where: { row in row.id == item.id || row.id.hasPrefix(item.id + "-file") }) else { continue }
      rows.insert(item.state == .failed ? .failedSend(id: "failed-\(item.id)", nonce: item.id) : .queuedSend(id: "queued-\(item.id)", nonce: item.id), at: last + 1)
    }
    return rows
  }

  /** The streamed answer's row with its new text, when it is the chat's last row; nil when the chat must be laid out again. */
  static func replacingLast(_ rows: [ChatRow], with entry: Entry) -> [ChatRow]? {
    guard case .bubble(let old)? = rows.last, old.id == entry.id, case .bubble(let new)? = Chat.row(for: entry) else { return nil }
    var next = rows
    next[next.count - 1] = .bubble(new.with(showsName: old.showsName, showsAvatar: old.showsAvatar, author: .some(old.author), quote: .some(old.quote)))
    return next
  }

  /** Where a waiting message's file is: on this phone, under the message's own id (`sentFile`). */
  public static func outboxFileURL(_ messageId: String, _ index: Int) -> String { "outbox:\(messageId)-file\(index)" }

  /** A waiting message as the host would write it: its text, and a line per file. */
  static func entries(for item: Outgoing) -> [Entry] {
    var lines: [JSON] = item.files.enumerated().map { index, file in
      ["kind": "user-attachment", "id": .string("\(item.id)-file\(index)"), "file_name": .string(file.name), "file_path": .string(outboxFileURL(item.id, index)), "timestampMs": .number(item.at)]
    }
    if !item.text.isEmpty {
      var message: JSON = ["kind": "message", "id": .string(item.id), "role": "user", "content": .string(item.text), "timestampMs": .number(item.at)]
      if let reply = item.replyTo { message = message.setting("replyTo", .string(reply)) }
      lines.append(message)
    }
    // A reply in a thread waits in the thread, as the host will keep it.
    if item.thread, let root = item.replyTo {
      lines = lines.map { line in line.setting("branched", true).setting("replyTo", line["replyTo"] ?? .string(root)) }
    }
    return lines.compactMap(Entry.init)
  }

  /** The host's copy of a waiting message arrived: the waiting one goes, and the host's takes its place without moving in again. */
  private func settleOutbox(_ agentId: String, _ entries: [Entry]) {
    guard var waiting = outbox[agentId], !waiting.isEmpty else { return }
    var claimed: Set<String> = []
    waiting.removeAll { item in
      guard item.state != .failed, item.state != .queued else { return false }
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
      loadFailed.remove(agentId)
      setTranscript(agentId, merged)
    } catch {
      // Nothing to show: the chat says it could not load, with Retry (the window's "Couldn't load this conversation").
      guard transcripts[agentId] == nil || transcripts[agentId]?.isEmpty == true else { return }
      loadFailed.insert(agentId)
      setTranscript(agentId, [])
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
  public func send(_ text: String, to agentId: String, attachments files: [(name: String, data: Data)] = [], replyTo: String? = nil, inThread: Bool = false, richText: String? = nil, id: String? = nil) async {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard backend != nil, !trimmed.isEmpty || !files.isEmpty else { return }
    // It waits while the computer is out of reach, or behind another of this chat's messages still on its way (the window's
    // send queue); only one held while out of reach says when it was written (`queuedAtMs`, sent as `composedAtMs`).
    let behind = outbox[agentId]?.contains { $0.state == .sending || $0.state == .queued } == true
    let waits = isDown || behind
    var item = Outgoing(id: id ?? Self.newMessageId(), text: trimmed, files: files, replyTo: replyTo, at: Date().timeIntervalSince1970 * 1000, known: Set((transcripts[agentId] ?? []).map(\.id)), state: waits ? .queued : .sending)
    item.thread = inThread && replyTo != nil
    item.richText = richText
    item.composedOffline = waits && isDown
    for (index, file) in files.enumerated() { keepSent(file.data, under: Self.outboxFileURL(item.id, index)) }
    outbox[agentId, default: []].append(item)
    arrived.insert(item.id)
    for index in files.indices { arrived.insert("\(item.id)-file\(index)") }
    layOut(agentId)
    // Held: it goes when the computer is back (`flushQueued`), or when the one before it has gone (`sendNextQueued`).
    guard !waits else { return }
    await deliver(item.id, in: agentId)
  }

  /**
   * Cancel on a held message: it never left, so it leaves the screen and
   * what was written goes back to its composer. False, with the window's
   * "This message is already sending and can't be canceled." in the
   * composer, when it is no longer held.
   */
  @discardableResult
  public func cancelQueued(_ id: String, in agentId: String) -> Bool {
    guard let item = outbox[agentId]?.first(where: { $0.id == id && $0.state == .queued }) else {
      showComposerNotice("This message is already sending and can't be canceled.", in: agentId)
      return false
    }
    discardFailed(id, in: agentId)
    // What was written goes back to the composer it came from, if that one is empty (the window's cancel).
    let scope = Self.draftScope(agentId, thread: item.thread ? item.replyTo : nil)
    canceledDraft = CanceledDraft(scope: scope, text: item.text, files: item.files, replyTo: item.thread ? nil : item.replyTo, richText: item.richText)
    return true
  }

  /** Where a composer's draft is kept: the chat's id, or its thread's ("<chat>#thread-<first message>"). */
  public static func draftScope(_ agentId: String, thread: String?) -> String {
    thread.map { "\(agentId)#thread-\($0)" } ?? agentId
  }

  /** A message canceled before it went: what goes back into its composer. */
  public struct CanceledDraft: Identifiable {
    public let id = UUID()
    /** The composer it came from (`draftScope`). */
    public let scope: String
    public let text: String
    public let files: [(name: String, data: Data)]
    /** The message it answered, outside a thread. */
    public let replyTo: String?
    public let richText: String?
  }

  /** The last message canceled, until its composer takes it back. */
  public private(set) var canceledDraft: CanceledDraft?

  /**
   * A message handed to another composer to finish (the new chat puts what
   * was written into the new agent's composer, the window's `setDraft`):
   * that composer takes it back as a canceled one, files and all.
   */
  public func handDraft(to scope: String, text: String, richText: String?, files: [(name: String, data: Data)]) {
    canceledDraft = CanceledDraft(scope: scope, text: text, files: files, replyTo: nil, richText: richText)
  }

  /** The composer took the canceled message back, or had words of its own. */
  public func takeCanceledDraft(_ id: UUID) {
    if canceledDraft?.id == id { canceledDraft = nil }
  }

  /** A line in the composer for six seconds (the window's `sand-prompt-error-notice`), as "This message is already sending and can't be canceled." */
  public struct ComposerNotice: Equatable {
    public let id = UUID()
    public let agentId: String
    public let text: String
  }

  public private(set) var composerNotice: ComposerNotice?

  public func showComposerNotice(_ text: String, in agentId: String, seconds: Double = 6) {
    let notice = ComposerNotice(agentId: agentId, text: text)
    composerNotice = notice
    Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
      if self?.composerNotice?.id == notice.id { self?.composerNotice = nil }
    }
  }

  /** Out of reach, or back: held messages say which; back, they go. */
  private func setDown(_ down: Bool) {
    isDown = down
    for chat in outbox.keys where outbox[chat]?.contains(where: { $0.state == .queued }) == true { layOut(chat) }
    if !down { flushQueued() }
  }

  /** The computer is back: each chat's held messages go, one after another, in the order they were written. */
  private func flushQueued() {
    for chat in outbox.keys { Task { await sendNextQueued(chat) } }
  }

  /** The chat's next held message, when none of its messages is on its way and the computer is in reach (the window's `flushAgent`). */
  private func sendNextQueued(_ agentId: String) async {
    guard !isDown, outbox[agentId]?.contains(where: { $0.state == .sending }) != true,
          let next = outbox[agentId]?.first(where: { $0.state == .queued }) else { return }
    await deliver(next.id, in: agentId)
  }

  // MARK: The composer's lists

  /** The agent's skills and routines (`getAgentWorkflows`), for "/" and "@"; empty, quietly, when they can't be read. */
  public func workflows(_ agentId: String) async -> JSON {
    guard let backend else { return [] }
    return (try? await backend.command("getAgentWorkflows", ["id": .string(agentId)])) ?? []
  }

  /** A cloud agent's state (`getCloudAgentInfo`): what it is, nothing (final), or that it couldn't be asked. */
  public func cloudAgent(_ bcId: String) async -> CloudAgentInfo.Read {
    guard let backend else { return .failed }
    guard let answer = try? await backend.command("getCloudAgentInfo", ["bcId": .string(bcId), "includeFiles": false]) else { return .failed }
    return CloudAgentInfo(answer).map(CloudAgentInfo.Read.info) ?? .empty
  }

  // MARK: Threads (the window's thread view)

  /**
   * A thread comes on screen in its chat, made from the chat's own lines as
   * the window makes it: its first message and the replies that lead back
   * to it. Its new replies stream with the chat's.
   */
  public func openThread(_ rootId: String, in agentId: String) {
    openThreads[agentId] = rootId
    layOut(agentId)
  }

  /** Back to the chat (the agent's name in the thread's header). */
  public func closeThread(in agentId: String) {
    guard openThreads[agentId] != nil else { return }
    openThreads[agentId] = nil
    threadRows[agentId] = nil
  }

  /** The first message of the thread a line is in, when it is a reply in one (a quote that answers a line out of the chat opens its thread). */
  public func threadRoot(of entryId: String, in agentId: String) -> String? {
    threadRoots[agentId]?[entryId]
  }

  /** The thread's first message, for its header ("Back to Theo › Draft the brief"). */
  public func threadTitle(_ rootId: String, in agentId: String) -> String {
    Chat.threadTitle((transcripts[agentId] ?? []).first { $0.id == rootId })
  }

  /**
   * The lines find searches (the window's find over the lines on screen):
   * the open thread's, else the chat's own (a thread's replies are not in
   * it), with the messages waiting to go.
   */
  public func findableEntries(_ agentId: String) -> [Entry] {
    let entries = (transcripts[agentId] ?? []) + (outbox[agentId] ?? []).flatMap(Self.entries(for:))
    if let root = openThreads[agentId] { return Chat.threadEntries(root, in: entries) }
    return Chat.threadSplit(entries, mayHoldOlderHistory: olderBefore[agentId] != nil).visible
  }

  /** A message's id before it is sent, so the composer can name its files' places (`outboxFileURL`) first. */
  public static func newMessageId() -> String { "ios-\(UUID().uuidString.lowercased())" }

  /**
   * Files the person sent from this phone, by every address the chat shows
   * them under: the waiting line's (`outboxFileURL`), then the path the
   * computer keeps them at. Read from here, never fetched back: a sent
   * picture showed as a file card for a second while it came back from the
   * computer (the founder, 9 October 2026). The last 24.
   */
  @ObservationIgnored private var sentFiles: [(keys: [String], data: Data)] = []

  private func keepSent(_ data: Data, under key: String) {
    sentFiles.append(([key], data))
    if sentFiles.count > 24 { sentFiles.removeFirst(sentFiles.count - 24) }
  }

  /** A file sent from this phone, by any address it is shown under, with all of them (the first is its waiting line's). */
  public func sentFile(_ url: String) -> (keys: [String], data: Data)? {
    sentFiles.last { $0.keys.contains(url) }
  }

  /** Resend on a message that failed. */
  public func resend(_ id: String, in agentId: String) async {
    // Not while the computer is rebuilt (`rebuild-locked`).
    if isSendingPaused { return }
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
      for (index, file) in item.files.enumerated() {
        let answer = try await backend.command("uploadAttachment", ["filename": .string(file.name), "bytesBase64": .string(file.data.base64EncodedString()), "agentId": .string(agentId)])
        guard let path = answer["path"]?.text else { throw GatewayError(message: "the computer kept no copy", refused: true) }
        refs.append(AttachmentRef(path: path, name: file.name))
        // The host's line for the file names this path: the phone's copy answers for it too.
        let key = Self.outboxFileURL(item.id, index)
        if let kept = sentFiles.lastIndex(where: { $0.keys.contains(key) }), !sentFiles[kept].keys.contains(path) { sentFiles[kept].keys.append(path) }
      }
      let options = SendOptions(replyTo: item.replyTo, isFork: item.thread, richText: item.richText, composedAtMs: item.composedOffline ? item.at : nil)
      try await backend.send(agentId, text: item.text, attachments: refs, options: options, nonce: item.id)
    } catch {
      mark(id, in: agentId, .failed)
      await sendNextQueued(agentId)
      return
    }
    mark(id, in: agentId, .sent)
    promptSent?(agentId)
    Task { await sendNextQueued(agentId) }
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

  /**
   * Allow once (`approved`), Always allow (`always`) or Deny (`denied`) on an
   * auto-review approval, as the window's card answers (`pe`): Always allow
   * first adds the proposed rule to Auto-review, and counts as Allow once
   * when there is none or it cannot be saved (`de`). The answer shows at
   * once, "Expired" when the box says the request is stale; any other
   * failure quietly takes it back, as the card says nothing.
   */
  public func resolveApproval(_ requestId: String, resolution: String, proposedRule: String? = nil, entryId: String, in agentId: String) async {
    guard let backend else { return }
    let sent = resolution == "always" ? await alwaysAllow(rule: AutoReviewCard.rule(proposed: proposedRule)) : resolution
    do {
      _ = try await backend.command("resolveAutoReviewApproval", ["requestId": .string(requestId), "resolution": .string(sent), "entryId": .string(entryId), "agentId": .string(agentId)])
      answeredApprovals[entryId] = sent
    } catch {
      answeredApprovals[entryId] = error.localizedDescription.contains("auto-review/stale") ? "expired" : nil
    }
  }

  /** The rule saved to Auto-review's allowed list: `always`, or `approved` when there is none or it could not be saved. */
  private func alwaysAllow(rule: String?) async -> String {
    guard let rule, let backend else { return "approved" }
    guard let settings = try? await backend.command("getHostSettings", [:]) else { return "approved" }
    let next = AutoReviewInstructions(json: settings["autoReviewInstructions"]).addingAllowRule(rule)
    guard (try? await backend.command("setHostSettings", ["autoReviewInstructions": next.json])) != nil else { return "approved" }
    return "always"
  }

  public func submitSecret(_ value: String, entryId: String, in agentId: String) async {
    await command("submitSecret", ["entryId": .string(entryId), "value": .string(value), "agentId": .string(agentId)], failure: "The secret wasn't saved")
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
    if let sent = sentFile(url) { return sent.data }
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

  /**
   * A file card's line under its name (`skn`, `xvn`): the size, or
   * "Couldn't read file"; "" until the computer answers, and again after a
   * failed read, which is tried next time.
   */
  public func fileLine(_ url: String) async -> String {
    if let known = fileLines[url] { return known }
    if let sent = sentFile(url) { return FileLine.size(sent.data.count) }
    guard let backend else { return "" }
    let path = url.hasPrefix("file://") ? (URL(string: url)?.path ?? String(url.dropFirst(7))) : url
    guard let answer = try? await backend.command("readAttachmentText", ["path": .string(path)]) else { return "" }
    let line = FileLine.line(answer)
    fileLines[url] = line
    return line
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
  /** A finished or failed call put away (the banner's Close). */
  public func dismissCall() { backend?.call?.dismiss() }
}
