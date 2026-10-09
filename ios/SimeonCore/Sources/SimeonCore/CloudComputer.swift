import Foundation

/**
 * An agent's screen on the cloud computer, as the shipped window reads and
 * words it (`TTn`, `NTn`, `qoe`, `$1t`, `CTn`, `fbn`, `Abn` in the main
 * bundle; `preload-vnc.ts` and `computer-stream.ts` in the Electron app). The
 * views only draw it.
 */
public struct BoxStatus: Equatable, Sendable {
  /** The agent it is for, as the host stamps it (a push says whose it is only by this). */
  public let agentId: String?
  /** The host's state: "running", "hibernated", "absent"… */
  public let state: String
  /** The screen's page, when the host has one. */
  public let vncUrl: String?
  /** The image being pulled: how far, 0–100. */
  public let pullPercent: Double?
  /** The agent waiting on the person at the computer. */
  public let handoff: Handoff?
  public let raw: JSON

  public struct Handoff: Equatable, Sendable {
    public let requestId: String
    public let instruction: String
    /** A picture of the screen when the agent asked (`data:image/webp;base64,…`). */
    public let snapshotDataUrl: String?
  }

  public init(agentId: String? = nil, state: String, vncUrl: String? = nil, pullPercent: Double? = nil, handoff: Handoff? = nil, raw: JSON = .null) {
    self.agentId = agentId; self.state = state; self.vncUrl = vncUrl; self.pullPercent = pullPercent; self.handoff = handoff; self.raw = raw
  }

  public init?(json: JSON) {
    guard json.object != nil else { return nil }
    let handoff = json["handoff"].flatMap { h -> Handoff? in
      guard let id = h["requestId"]?.text else { return nil }
      return Handoff(requestId: id, instruction: h["instruction"]?.string ?? "", snapshotDataUrl: h["snapshotDataUrl"]?.text)
    }
    self.init(agentId: json["agentId"]?.text, state: json["state"]?.string ?? "absent", vncUrl: json["vncUrl"]?.string,
              pullPercent: json["pull"]?["percent"]?.double, handoff: handoff, raw: json)
  }

  /** The page to show: only while the computer runs and has one (`N2e`). */
  public var screenURL: String? {
    guard state == "running", let vncUrl, !vncUrl.isEmpty else { return nil }
    return vncUrl
  }

  /** A pull under way, even with no percent yet (`pull != null`). */
  public var isPulling: Bool { raw["pull"].map { !$0.isNull } ?? false }
}

/** Where the computer is (`qoe`). */
public enum ComputerPhase: String, Sendable {
  case pulling, running, local, starting, sleeping, off

  public static func of(_ status: BoxStatus?, ensuring: Bool) -> ComputerPhase {
    if let status, status.isPulling { return .pulling }
    if status?.state == "running" { return status?.screenURL != nil ? .running : .local }
    if ensuring { return .starting }
    return status?.state == "hibernated" ? .sleeping : .off
  }
}

/** Whether the status has been read: never yet, read, or failed before any was (`readState`). */
public enum ComputerReadState: String, Sendable { case unknown, known, error }

/**
 * The words over a screen that isn't there yet (`$1t`): what it says, a bar
 * (with a percent, or moving), and Retry.
 */
public struct ComputerPlaceholder: Equatable, Sendable {
  public let message: String
  public let percent: Double?
  public let isBusy: Bool
  public let hasRetry: Bool

  public static let local = "This agent runs on your machine. There's no separate desktop to stream."
  public static let booting = "Booting up the computer"
  public static let settingUp = "Setting up the computer"

  /** The shipped function, as it is. */
  public static func copy(screenLoading: Bool, unavailable: Bool, name: String, emptyMessage: String?, emptyLoading: Bool, pullPercent: Double?) -> ComputerPlaceholder {
    if screenLoading { return .init(message: "Switching to \(name)'s screen\u{2026}", percent: nil, isBusy: true, hasRetry: false) }
    if unavailable { return .init(message: "Can't reach \(name)'s screen", percent: nil, isBusy: false, hasRetry: true) }
    if let pullPercent { return .init(message: settingUp, percent: pullPercent, isBusy: true, hasRetry: false) }
    return .init(message: emptyMessage ?? booting, percent: nil, isBusy: emptyLoading, hasRetry: false)
  }

  /** The pane's preview: never "Switching to…", and drawn only when busy or with Retry (`_bn`); nil draws the bare desktop icon. */
  public static func preview(name: String, read: ComputerReadState, phase: ComputerPhase, pullPercent: Double?) -> ComputerPlaceholder? {
    let busy = read == .error ? false : read != .known || phase == .pulling || phase == .starting
    let copy = copy(screenLoading: false, unavailable: read == .error, name: name, emptyMessage: nil, emptyLoading: busy, pullPercent: pullPercent)
    return copy.isBusy || copy.hasRetry ? copy : nil
  }

  /** The full view's stage (`XOn` `U`): with helpers on screen, only the plain wording. */
  public static func full(name: String, read: ComputerReadState, phase: ComputerPhase, pullPercent: Double?, hasHelpers: Bool) -> ComputerPlaceholder {
    copy(screenLoading: !hasHelpers && read == .unknown, unavailable: !hasHelpers && read == .error, name: name,
         emptyMessage: phase == .local ? local : nil, emptyLoading: phase != .local, pullPercent: hasHelpers ? nil : pullPercent)
  }
}

/** A helper's screen in the full view's strip: a running computer-use subagent (`CTn`). */
public struct ComputerHelper: Identifiable, Equatable, Sendable {
  public let subagentId: String
  public let title: String
  public var id: String { subagentId }

  /** The running computer-use subagents, in the host's order; an empty title reads "Subagent". */
  public static func screens(_ subagents: [JSON]) -> [ComputerHelper] {
    subagents.compactMap { row in
      guard row["status"]?.string == "running", row["subagentType"]?.string == "computerUse", let id = row["subagentId"]?.text else { return nil }
      let title = (row["title"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
      return ComputerHelper(subagentId: id, title: title.isEmpty ? "Subagent" : title)
    }
  }

  /** The screen in focus: the one asked for while it is there, else the first (`wbn`; a helper never carries a hand-off). */
  public static func focused(_ helpers: [ComputerHelper], asked: String?) -> String? {
    if let asked, helpers.contains(where: { $0.subagentId == asked }) { return asked }
    return helpers.first?.subagentId
  }

  /** The strip shows the others: all of them up to four, else three and "and N more" (`fbn`, `kve` 3). */
  public static func strip(_ others: Int) -> (shown: Int, more: Int?) {
    others > 4 ? (3, others - 3) : (others, nil)
  }

  /** ↑← and ↓→ move between two or more screens, round (`bbn`). */
  public static func step(_ helpers: [ComputerHelper], from current: String?, by delta: Int) -> String? {
    guard helpers.count >= 2 else { return nil }
    let index = helpers.firstIndex { $0.subagentId == current } ?? -1
    let n = helpers.count
    return helpers[((index == -1 ? 0 : index) + delta + n) % n].subagentId
  }
}

/** The agent's pointer on the pane's preview (`Abn`, from `computer-action`). */
public struct AgentPointer: Equatable, Sendable {
  public let x: Double
  public let y: Double
  /** "move", "click", "drag" or "scroll". */
  public let type: String
  public let at: Date

  public init(x: Double, y: Double, type: String, at: Date = Date()) { self.x = x; self.y = y; self.type = type; self.at = at }

  public init?(json: JSON, at: Date = Date()) {
    guard let x = json["x"]?.double, let y = json["y"]?.double else { return nil }
    self.init(x: x, y: y, type: json["type"]?.string ?? "move", at: at)
  }

  /** Where it sits on a frame of this width and height (the screen is 1280 × 800). */
  public func place(width: Double, height: Double) -> (x: Double, y: Double) { (x / ComputerScreen.width * width, y / ComputerScreen.height * height) }

  /** Its size on a frame this wide (`Tbn`, `Sbn`, `xbn`). */
  public static func scale(frameWidth: Double) -> Double { min(1.8, max(0.75, frameWidth / ComputerScreen.width * 2.85)) }

  /** A click presses only once the pointer has had 0.5 s to get there (`Ebn`). */
  public static func pressDelay(sinceMove: TimeInterval) -> TimeInterval { max(0, 0.5 - sinceMove) }
}

/** The computer's screen and its rules (1280 × 800, `W8n`, `K8n`). */
public enum ComputerScreen {
  public static let width = 1280.0
  public static let height = 800.0
  /** A status read or a start waits this long (`wTn`). */
  public static let deadline: TimeInterval = 15
  /** A window coming forward reads again at most this often (`SVn`). */
  public static let focusCatchUp: TimeInterval = 60
  /** A spinner up this long gets its notice (`COMPUTER_STREAM_NOTICE_DELAY_MS`). */
  public static let noticeDelay: TimeInterval = 20

  /** The box's clipboard checked this often while the full view is open (`VNC_CLIPBOARD_POLL_MS`). */
  public static let clipboardPoll: TimeInterval = 0.5
  /** This Mac's clipboard sent at most this often (`VNC_CLIPBOARD_GESTURE_THROTTLE_MS`). */
  public static let clipboardThrottle: TimeInterval = 0.2

  /** ⌘A ⌘C ⌘V ⌘X ⌘Z (with ⇧ or not) go to the computer as Ctrl, by the key's place (`SHORTCUTS`): their keysyms. */
  public static let commandKeys: [String: Int] = ["KeyA": 0x61, "KeyC": 0x63, "KeyV": 0x76, "KeyX": 0x78, "KeyZ": 0x7a]
}

/**
 * A crashed screen page is loaded again, until it has crashed more than
 * three times, each within a minute of the one before (`sbn`, `rbn`); then
 * "Screen preview unavailable", until the full view shows it again.
 */
public struct ScreenCrashes: Equatable, Sendable {
  public private(set) var count = 0
  public private(set) var last: Date?
  public private(set) var gaveUp = false

  public init() {}

  /** One more crash: true when the page should be loaded again. */
  public mutating func crashed(at now: Date = Date()) -> Bool {
    if let last, now.timeIntervalSince(last) < 60 { count += 1 } else { count = 1 }
    last = now
    if count > 3 { gaveUp = true }
    return !gaveUp
  }

  /** The full view shows it again: start over. */
  public mutating func reset() { count = 0; last = nil; gaveUp = false }

  public static let unavailable = "Screen preview unavailable"
}

/**
 * The clipboard between this Mac and the computer while the full view is
 * open (`installVncClipboardBridge`): the computer's copied text comes here
 * unless it is what was just sent either way; this Mac's goes there on a
 * click, the window coming forward or the view showing, 0.2 s apart at most.
 */
public struct ClipboardBridge: Equatable, Sendable {
  public private(set) var sentToBox: String?
  public private(set) var sentToMac: String?
  public private(set) var lastGesture: Date?

  public init() {}

  /** The computer's text: what to put on this Mac's clipboard, or nil. */
  public mutating func fromBox(_ text: String) -> String? {
    guard !text.isEmpty, text != sentToBox, text != sentToMac else { return nil }
    sentToMac = text
    return text
  }

  /** Whether this Mac's clipboard may be read and sent now (0.2 s since the last try, sent or not). */
  public mutating func mayRead(at now: Date = Date()) -> Bool {
    if let lastGesture, now.timeIntervalSince(lastGesture) < ComputerScreen.clipboardThrottle { return false }
    lastGesture = now
    return true
  }

  /** This Mac's text went to the computer. */
  public mutating func sent(_ text: String) { sentToBox = text }
}

/**
 * The log of the screen's connection (`computer-stream.log`) and the reason
 * a stuck screen shows (`computerStreamReason`): each line may set the
 * reason, clear it (connected) or leave it.
 */
public enum ComputerStreamReason {
  public enum Change: Equatable { case keep, clear, set(String) }

  public static func change(for line: String) -> Change {
    func match(_ pattern: String) -> [String]? {
      guard let regex = try? NSRegularExpression(pattern: pattern), let m = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) else { return nil }
      return (0..<m.numberOfRanges).map { i in Range(m.range(at: i), in: line).map { String(line[$0]) } ?? "" }
    }
    if match(#"\bstate=connected\b"#) != nil || match(#"\bguest connected\b"#) != nil { return .clear }
    if line.contains("local docker: gateway ready") { return .keep }
    if line.contains("attach rewrite partition") { return .set("The screen webview used the wrong session partition; it was corrected.") }
    if let m = match(#"box reachability outcome=(\S+) method=(\S+) cause=(\S+)"#) {
      switch m[1] {
      case "timeout": return .set("The computer's gateway did not answer \"\(m[2])\" within the deadline.")
      case "network": return .set("The computer's gateway could not be reached for \"\(m[2])\" (\(m[3])).")
      case "box_blocked": return .set("The computer is blocked or paused.")
      default: return .set("The computer's gateway failed \"\(m[2])\": \(m[1]) (\(m[3])).")
      }
    }
    if let m = match(#"local docker FAILED: (.+)$"#) { return .set(m[1]) }
    if let m = match(#"guest load FAILED code=(-?\d+) \(([^)]*)\)"#) { return .set("The screen page did not load (\(m[2]), \(m[1])).") }
    if line.contains("guest preload FAILED") { return .set("The screen page's helper script failed to load.") }
    if line.contains("renderer gone") { return .set("The screen page crashed.") }
    if line.contains("[SimeonScreen]") {
      if line.contains("noVNC did not start") { return .set("noVNC never started inside the screen page.") }
      if line.contains("dialog=noVNC_credentials_dlg") { return .set("The desktop is asking for a password.") }
      if line.contains("dialog=noVNC_connect_dlg") { return .set("noVNC is waiting for a Connect click: autoconnect did not fire.") }
      if line.contains("status=\"Failed to connect to server\"") { return .set("noVNC cannot reach the desktop's socket.") }
      if line.contains("status=\"Something went wrong, connection is closed\"") { return .set("The desktop closed the connection.") }
      if line.contains("status=\"Disconnected\"") { return .set("noVNC disconnected.") }
      if let m = match(#"page error: (.+)$"#) { return .set("Error inside the screen page: \(m[1])") }
    }
    if let m = match(#"guest console\[error\] (.+)$"#) { return .set("Error inside the screen page: \(m[1])") }
    return .keep
  }

  /** The notice's words (`noticeText`). */
  public static func notice(lead: String, reason: String?, filePath: String?) -> String {
    [lead, (reason?.isEmpty == false ? reason! : "No reason was reported yet."), filePath.map { "Details: \($0)" }].compactMap { $0 }.joined(separator: " ")
  }

  /** Under a spinner up 20 s, and in "Can't reach…" at once. */
  public static let notConnecting = "The computer's screen isn't connecting."
  public static let statusUnreadable = "The computer's status could not be read."
}

/**
 * What the window knows of each agent's computer (`TTn`): the last status,
 * whether it has been read, the reads and starts under way, and who is
 * looking. Only state: the store runs the calls and reports back here, so
 * every rule is checked without a computer. A status, once had, stays until
 * a newer one: "Can't reach…" shows only before the first.
 */
public struct ComputerBook: Equatable, Sendable {
  public struct Entry: Equatable, Sendable {
    public internal(set) var status: BoxStatus?
    /** A read settled with nothing to show: read and empty, or failed (`settledReadState`). */
    var settled: ComputerReadState?
    /** Bumped by each read and push, so an older read's answer is dropped. */
    var readAttempt = 0
    /** The read under way, by its attempt (`pendingRead`). */
    var reading: Int?
    /** A start under way (`pendingEnsure`, `isEnsureStarting`). */
    public internal(set) var ensuring = false
    /** The views showing it (the pane's preview, the computer's window). */
    var watchers = 0
  }

  /** At most this many are kept; ones nobody watches go first (`IVe`). */
  public static let kept = 32

  public private(set) var entries: [String: Entry] = [:]
  /** Oldest first: a status coming in moves its agent to the end (the Map's order). */
  private(set) var order: [String] = []
  /** Agents whose computer was started here once: a retry, a reconnect or the window coming forward starts it again (`hasDemanded`). */
  public private(set) var demanded: Set<String> = []
  /** Bumped when the account goes: a start begun before is not applied (`d`). */
  private(set) var generation = 0
  /** The disk's state, from the last status or push (`diskPressureSnapshots`). */
  public private(set) var diskPressure: JSON?

  public init() {}

  public func status(_ id: String?) -> BoxStatus? { id.flatMap { entries[$0]?.status } }

  /** Never read, read, or failed before any status came (`h`). */
  public func readState(_ id: String?) -> ComputerReadState {
    guard let id, let entry = entries[id] else { return .unknown }
    return entry.status != nil ? .known : entry.settled ?? .unknown
  }

  public func isEnsuring(_ id: String?) -> Bool { id.flatMap { entries[$0]?.ensuring } ?? false }
  /** The newest status of any agent's (`getMostRecentStatus`). */
  public var mostRecent: BoxStatus? { order.reversed().lazy.compactMap { entries[$0]?.status }.first }
  public func phase(_ id: String?) -> ComputerPhase { .of(status(id), ensuring: isEnsuring(id)) }
  public func isWatched(_ id: String) -> Bool { (entries[id]?.watchers ?? 0) > 0 }
  public var watched: [String] { order.filter { (entries[$0]?.watchers ?? 0) > 0 } }

  /** The entry, made if new (`m`), keeping at most 32. */
  private mutating func touch(_ id: String) {
    guard entries[id] == nil else { return }
    entries[id] = Entry()
    order.append(id)
    evict()
  }

  /** Beyond 32, the oldest that nobody watches and nothing is reading or starting go (`f`). */
  private mutating func evict() {
    guard entries.count > Self.kept else { return }
    for id in order {
      guard let entry = entries[id], entry.watchers == 0, entry.reading == nil, !entry.ensuring else { continue }
      entries[id] = nil
      order.removeAll { $0 == id }
      if entries.count <= Self.kept { return }
    }
  }

  /** A status from the host, for the agent it names (`k`): it is the one shown, and the agent the newest. */
  mutating func take(_ status: BoxStatus, asked: String) {
    let id = status.agentId ?? asked
    touch(id)
    entries[id]?.status = status
    entries[id]?.settled = nil
    diskPressure = status.raw["diskPressure"]?.present
    order.removeAll { $0 == id }
    order.append(id)
  }

  /** A read settled with nothing new, only while no status is had (`v`). */
  private mutating func settle(_ id: String, attempt: Int, as state: ComputerReadState) {
    guard let entry = entries[id], entry.readAttempt == attempt, entry.status == nil, entry.settled != state else { return }
    entries[id]?.settled = state
  }

  // MARK: Watching

  /** A view shows it: true when it should be read now (the first look, or any look while connected: `A`). */
  public mutating func watch(_ id: String) {
    touch(id)
    entries[id]?.watchers += 1
  }

  public mutating func unwatch(_ id: String) {
    guard let entry = entries[id], entry.watchers > 0 else { return }
    entries[id]?.watchers -= 1
    evict()
  }

  // MARK: Reads (`getForeverBoxStatus`)

  /** A read begins: its attempt, or nil when one is already under way. A failed state is cleared first, so Retry shows the wait. */
  public mutating func beginRead(_ id: String) -> Int? {
    touch(id)
    guard let entry = entries[id], entry.reading == nil else { return nil }
    let attempt = entry.readAttempt + 1
    entries[id]?.readAttempt = attempt
    if entry.status == nil && entry.settled == .error { entries[id]?.settled = nil }
    entries[id]?.reading = attempt
    return attempt
  }

  private mutating func endRead(_ id: String, _ attempt: Int) {
    if entries[id]?.reading == attempt { entries[id]?.reading = nil }
  }

  /** The read answered: a status is taken if no newer read or push came; an empty answer counts as read. */
  public mutating func readAnswered(_ id: String, attempt: Int, _ status: BoxStatus?) {
    endRead(id, attempt)
    if let status, entries[id]?.readAttempt == attempt { take(status, asked: id); return }
    settle(id, attempt: attempt, as: .known)
  }

  /** The read failed or passed its 15 s: "Can't reach…" while no status is had. A late answer may still come (`lateRead`). */
  public mutating func readFailed(_ id: String, attempt: Int) {
    endRead(id, attempt)
    settle(id, attempt: attempt, as: .error)
  }

  /** The answer to a read that had passed its deadline, taken if nothing newer came. */
  public mutating func lateRead(_ id: String, attempt: Int, _ status: BoxStatus?) {
    guard let status, entries[id]?.readAttempt == attempt else { return }
    take(status, asked: id)
  }

  // MARK: Starts (`ensureForeverBox`)

  /** A start begins: the account's generation, or nil when one is under way. The agent is now demanded either way. */
  public mutating func beginEnsure(_ id: String) -> Int? {
    touch(id)
    demanded.insert(id)
    guard entries[id]?.ensuring == false else { return nil }
    entries[id]?.ensuring = true
    return generation
  }

  /** The start answered, failed or passed its 15 s; `status` is its answer when it had one. A failure shows "Can't reach…" only while no status is had (`b`). */
  public mutating func ensureSettled(_ id: String, generation: Int, _ status: BoxStatus?, failed: Bool) {
    entries[id]?.ensuring = false
    guard generation == self.generation else { return }
    if let status { take(status, asked: id); return }
    if failed, let entry = entries[id], entry.status == nil, entry.settled != .error { entries[id]?.settled = .error }
  }

  /** A start's answer after its 15 s, taken if the account is the same. */
  public mutating func lateEnsure(_ id: String, generation: Int, _ status: BoxStatus?) {
    guard let status, generation == self.generation else { return }
    take(status, asked: id)
  }

  // MARK: Pushes and the connection

  /** A `forever-box` push: newer than any read under way (`ingestForeverBox`). */
  public mutating func ingest(_ status: BoxStatus, asked: String? = nil) {
    guard let id = status.agentId ?? asked else { return }
    touch(id)
    entries[id]?.readAttempt += 1
    entries[id]?.reading = nil
    take(status, asked: id)
  }

  /** A `box-disk-pressure` push. */
  public mutating func ingestDiskPressure(_ value: JSON?) { diskPressure = value?.present }

  /** The event stream back after a drop (`noteReconnect`): what to read and what to start again. Reads under way are dropped. */
  public mutating func reconnected() -> (read: [String], ensure: [String]) {
    let ids = watched
    for id in ids {
      entries[id]?.readAttempt += 1
      entries[id]?.reading = nil
    }
    return (ids, ids.filter { demanded.contains($0) })
  }

  /** The window came forward (`noteWindowFocus`): read what is watched, start again what was demanded. */
  public func focused() -> (read: [String], ensure: [String]) {
    let ids = watched
    return (ids, ids.filter { demanded.contains($0) })
  }

  /** The account went (`reset`): everything forgotten but who is watching. */
  public mutating func reset() {
    generation += 1
    for id in order {
      guard let entry = entries[id] else { continue }
      if entry.watchers == 0 { entries[id] = nil; continue }
      entries[id] = Entry(status: nil, settled: nil, readAttempt: entry.readAttempt + 1, reading: nil, ensuring: false, watchers: entry.watchers)
    }
    order = order.filter { entries[$0] != nil }
    demanded = []
    diskPressure = nil
  }
}
