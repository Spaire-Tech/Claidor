import AppKit
import Foundation
import SimeonCore

/**
 * The Mac's browser (step 4b of docs/app-browser/README.md, decision 1):
 * `Simeon Browser.app` in Contents/Helpers, the Windows app's browser run
 * as a helper with no window (windows/src/helper/macBrowser.ts). This
 * starts it, starts it again when it dies, and speaks its JSON lines
 * (docs/app-browser/protocol.md, "The Mac's helper"):
 *
 * - `engine` (the gateway's address and its three headers) while the hands'
 *   line is open (MacLocalHands), `engineClosed` when it closes;
 * - `signedOut`, `visible` (the window shown or not) and `quit`;
 * - the Computer tab's `watch`, `state`, `control`, `bar` and `input`, and
 *   `browsing` for the quit alert.
 *
 * Nothing it is told or tells is written down: the engine's keys stay in
 * memory, only to be given again to a helper started again.
 */
@MainActor
@Observable
final class MacBrowserHelper {
  static let shared = MacBrowserHelper()

  struct Tab: Equatable {
    let id: String
    let title: String
    let url: String
    let loading: Bool
  }

  /** The watched agent's browser here (`BrowserShown` of the web app's contract). */
  struct Shown: Equatable {
    let agentId: String
    let enabled: Bool
    let tabs: [Tab]
    let current: String?
    let canGoBack: Bool
    let canGoForward: Bool
    let person: Bool
    let working: Bool
    let pointer: AgentPointer?
    let cursor: String

    var currentTab: Tab? { tabs.first { $0.id == current } ?? tabs.last }

    init?(_ value: Any?) {
      guard let json = value as? [String: Any], let agentId = json["agentId"] as? String else { return nil }
      self.agentId = agentId
      enabled = json["enabled"] as? Bool ?? false
      tabs = (json["tabs"] as? [[String: Any]] ?? []).compactMap { one in
        guard let id = one["id"] as? String else { return nil }
        return Tab(id: id, title: one["title"] as? String ?? "", url: one["url"] as? String ?? "", loading: one["loading"] as? Bool ?? false)
      }
      current = json["current"] as? String
      canGoBack = json["canGoBack"] as? Bool ?? false
      canGoForward = json["canGoForward"] as? Bool ?? false
      person = json["person"] as? Bool ?? false
      working = json["working"] as? Bool ?? false
      if let point = json["pointer"] as? [String: Any], let x = point["x"] as? Double, let y = point["y"] as? Double {
        let at = (point["at"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        pointer = AgentPointer(x: x, y: y, type: point["type"] as? String ?? "move", at: at)
      } else {
        pointer = nil
      }
      cursor = json["cursor"] as? String ?? "default"
    }
  }

  /** The watched agent's browser, as the helper last said. */
  private(set) var shown: Shown?
  /** The watched agent's tab, as last drawn, and its size in the page's pixels. */
  private(set) var picture: NSImage?
  private(set) var pictureSize = CGSize(width: 1280, height: 800)
  /** Whether the server's switch is on for this person (the last state heard): the grey line shows only then. */
  private(set) var enabled = false

  /** The store, for the quit alert's names (MacServices). */
  @ObservationIgnored weak var store: AppStore?

  @ObservationIgnored private var process: Process?
  @ObservationIgnored private var input: FileHandle?
  @ObservationIgnored private var server: URL?
  @ObservationIgnored private var ready = false
  @ObservationIgnored private var quitting = false
  @ObservationIgnored private var restarts = 0
  @ObservationIgnored private var engine: [String: Any]?
  @ObservationIgnored private var visible = true
  @ObservationIgnored private var nextId = 1
  @ObservationIgnored private var waiting: [Int: CheckedContinuation<Any?, Never>] = [:]
  /** Who wants an agent's browser watched (the pane, the full view): the newest is watched. */
  @ObservationIgnored private var wanted: [(token: Int, agentId: String)] = []
  @ObservationIgnored private var watched: String?
  @ObservationIgnored private var windowWatch: [NSObjectProtocol] = []

  static var bundled: URL? {
    let url = Bundle.main.bundleURL.appendingPathComponent("Contents/Helpers/Simeon Browser.app/Contents/MacOS/Simeon Browser")
    return FileManager.default.isExecutableFile(atPath: url.path) ? url : nil
  }

  static var dataFolder: URL {
    FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Simeon/Browser", isDirectory: true)
  }

  var running: Bool { process?.isRunning == true }

  // MARK: The helper's life

  /** Signed in with a computer: the helper runs (once), for this server. */
  func start(server: URL) {
    self.server = server
    quitting = false
    followWindow()
    if process == nil { launch() }
  }

  private func launch() {
    guard !quitting, let server, let executable = Self.bundled else { return }
    try? FileManager.default.createDirectory(at: Self.dataFolder, withIntermediateDirectories: true)
    let child = Process()
    child.executableURL = executable
    child.arguments = ["--data=\(Self.dataFolder.path)", "--api=\(server.absoluteString)"]
    var environment = ProcessInfo.processInfo.environment
    environment.removeValue(forKey: "ELECTRON_RUN_AS_NODE")
    environment.removeValue(forKey: "NODE_OPTIONS")
    child.environment = environment
    let stdin = Pipe()
    let stdout = Pipe()
    child.standardInput = stdin
    child.standardOutput = stdout
    // Its own errors stay its own (they could name a page): nothing of them is kept.
    child.standardError = FileHandle.nullDevice
    let reader = LineReader { [weak self] said in
      Task { @MainActor in self?.hear(said) }
    }
    stdout.fileHandleForReading.readabilityHandler = { handle in
      let data = handle.availableData
      if data.isEmpty { handle.readabilityHandler = nil; return }
      reader.take(data)
    }
    child.terminationHandler = { [weak self] _ in
      Task { @MainActor in self?.ended(child) }
    }
    do {
      try child.run()
    } catch {
      LocalHandsLog.write("[simeon-browser] could not start: \(error.localizedDescription)")
      return
    }
    process = child
    input = stdin.fileHandleForWriting
    ready = false
    LocalHandsLog.write("[simeon-browser] started (pid \(child.processIdentifier))")
  }

  /** It died (or quit): its replies end empty, and it starts again unless the app quits, 1, 2, 4… 30 seconds after. */
  private func ended(_ child: Process) {
    guard process === child else { return }
    LocalHandsLog.write("[simeon-browser] ended (status \(child.terminationStatus))")
    process = nil
    input = nil
    ready = false
    for (_, wait) in waiting { wait.resume(returning: nil) }
    waiting = [:]
    watched = nil
    shown = nil
    picture = nil
    guard !quitting else { return }
    restarts += 1
    let delay = min(30.0, pow(2.0, Double(min(restarts, 5) - 1)))
    Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
      guard let self, self.process == nil, !self.quitting else { return }
      self.launch()
    }
  }

  /** Ready: what it must know, again (the engine, the window, the agent watched). */
  private func greeted() {
    ready = true
    if let engine { send(["kind": "engine", "target": engine]) }
    send(["kind": "visible", "visible": visible])
    watchNewest()
    // Up a minute: a crash after that starts again at once.
    Task { @MainActor [weak self] in
      try? await Task.sleep(nanoseconds: 60_000_000_000)
      if self?.ready == true { self?.restarts = 0 }
    }
  }

  // MARK: Lines

  private func send(_ line: [String: Any]) {
    guard let input, let data = try? JSONSerialization.data(withJSONObject: line) else { return }
    do {
      try input.write(contentsOf: data + Data([0x0A]))
    } catch {
      // Gone: its end starts it again.
    }
  }

  private func ask(_ line: [String: Any], within seconds: Double = 5) async -> Any? {
    guard running else { return nil }
    let id = nextId
    nextId += 1
    var line = line
    line["id"] = id
    return await withCheckedContinuation { wait in
      waiting[id] = wait
      send(line)
      Task { @MainActor [weak self] in
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
        self?.waiting.removeValue(forKey: id)?.resume(returning: nil)
      }
    }
  }

  private func hear(_ said: Said) {
    switch said {
    case .ready:
      greeted()
    case let .reply(id, value):
      waiting.removeValue(forKey: id)?.resume(returning: value)
    case let .shown(value):
      take(Shown(value))
    case let .frame(agentId, image, size):
      guard agentId == watched else { return }
      picture = image
      pictureSize = size
    case .problem:
      // An address refused: said in the log without what it held.
      LocalHandsLog.write("[simeon-browser] the engine's address was refused")
    }
  }

  private func take(_ state: Shown?) {
    guard let state else { return }
    enabled = state.enabled
    if state.agentId == watched, state != shown { shown = state }
  }

  // MARK: What the Mac app tells it

  /** The hands' line opened: the engine's address and its headers, for the helper's own line. */
  nonisolated func engineOpened(baseURL: String, headers: [String: String]) {
    // The main queue keeps the order of an open and a close (a line moving to another address).
    DispatchQueue.main.async { MainActor.assumeIsolated {
      let target: [String: Any] = ["baseURL": baseURL, "headers": headers]
      self.engine = target
      self.send(["kind": "engine", "target": target])
    } }
  }

  /** The hands' line closed. */
  nonisolated func engineClosed() {
    DispatchQueue.main.async { MainActor.assumeIsolated {
      guard self.engine != nil else { return }
      self.engine = nil
      self.send(["kind": "engineClosed"])
    } }
  }

  /** Signed out: its tabs closed and the sites' sign-ins forgotten, for the next account on this Mac. */
  func signedOut() {
    engine = nil
    send(["kind": "signedOut"])
    shown = nil
    picture = nil
  }

  /** Quitting: told, then gone with its tabs (its sign-ins kept); waited for a second at most. */
  func quit() {
    quitting = true
    guard let child = process else { return }
    send(["kind": "quit"])
    let until = Date().addingTimeInterval(1)
    while child.isRunning && Date() < until { usleep(20_000) }
    if child.isRunning { child.terminate() }
  }

  /** The window shown, hidden or minimised: no pictures while nobody can see them. */
  private func followWindow() {
    guard windowWatch.isEmpty else { return }
    let names: [Notification.Name] = [
      NSWindow.didMiniaturizeNotification, NSWindow.didDeminiaturizeNotification, NSWindow.didChangeOcclusionStateNotification,
      NSWindow.willCloseNotification, NSWindow.didBecomeMainNotification, NSApplication.didHideNotification, NSApplication.didUnhideNotification,
    ]
    for name in names {
      windowWatch.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { _ in
        MainActor.assumeIsolated { MacBrowserHelper.shared.windowChanged() }
      })
    }
  }

  private func windowChanged() {
    // A window closing is still listed as it goes: read once it has.
    DispatchQueue.main.async {
      let now = !NSApp.isHidden && NSApp.windows.contains {
        $0.canBecomeMain && $0.isVisible && !$0.isMiniaturized && $0.occlusionState.contains(.visible)
      }
      guard now != self.visible else { return }
      self.visible = now
      self.send(["kind": "visible", "visible": now])
    }
  }

  // MARK: The Computer tab's

  /** A view wants the agent's browser watched; the newest wanted is. The answer ends the want. */
  func want(_ agentId: String) -> Int {
    let token = nextId
    nextId += 1
    wanted.append((token, agentId))
    watchNewest()
    return token
  }

  func unwant(_ token: Int) {
    wanted.removeAll { $0.token == token }
    watchNewest()
  }

  private func watchNewest() {
    let agentId = wanted.last?.agentId
    guard ready else { return }
    if agentId != watched {
      watched = agentId
      shown = nil
      picture = nil
    }
    Task {
      let value = await ask(["kind": "watch", "agentId": agentId as Any? ?? NSNull()])
      if agentId != nil, agentId == watched { take(Shown(value)) }
    }
  }

  /** The agent's browser here, read once without watching it (a card choosing where it opens). */
  func state(_ agentId: String) async -> Shown? {
    Shown(await ask(["kind": "state", "agentId": agentId], within: 2))
  }

  /** Whether the Computer tab shows this Mac's browser for the agent: tabs here, no computer-use helper on Simeon's computer's screen. */
  static func showsHere(_ shown: Shown?, helpers: Int) -> Bool {
    guard let shown else { return false }
    return !shown.tabs.isEmpty && helpers == 0
  }

  /** Take control (true) or give it back (false). */
  @discardableResult
  func control(_ agentId: String, person: Bool) async -> Shown? {
    let value = await ask(["kind": "control", "agentId": agentId, "person": person])
    let state = Shown(value)
    take(state)
    return state
  }

  /** Back, Forward, Reload, Stop, or a tab chosen. */
  func bar(_ agentId: String, _ act: String, tabId: String? = nil) {
    var payload: [String: Any] = ["act": act]
    if let tabId { payload["tabId"] = tabId }
    send(["kind": "bar", "agentId": agentId, "act": payload])
  }

  /** The person's pointer, wheel and keys, in the page's pixels. */
  func input(_ agentId: String, _ input: [String: Any]) {
    send(["kind": "input", "agentId": agentId, "input": input])
  }

  /** The agents with tabs here (the quit alert). */
  func browsing() async -> [String] {
    (await ask(["kind": "browsing"], within: 1) as? [String]) ?? []
  }
}

/** One line from the helper, read off the main thread (a picture is decoded there too). */
enum Said: @unchecked Sendable {
  case ready
  case reply(Int, Any?)
  case shown(Any?)
  case frame(String, NSImage, CGSize)
  case problem
}

/** The helper's output, cut into lines and read as they come. */
final class LineReader: @unchecked Sendable {
  private var pending = Data()
  private let lock = NSLock()
  private let heard: (Said) -> Void

  init(_ heard: @escaping (Said) -> Void) { self.heard = heard }

  func take(_ data: Data) {
    lock.lock()
    pending.append(data)
    var lines: [Data] = []
    while let end = pending.firstIndex(of: 0x0A) {
      lines.append(pending.subdata(in: pending.startIndex..<end))
      pending.removeSubrange(pending.startIndex...end)
    }
    // A line past 32 MB is not one of the helper's.
    if pending.count > 32 * 1024 * 1024 { pending.removeAll() }
    lock.unlock()
    for line in lines { if let said = Self.read(line) { heard(said) } }
  }

  static func read(_ line: Data) -> Said? {
    guard let json = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any], let kind = json["kind"] as? String else { return nil }
    switch kind {
    case "ready": return .ready
    case "reply":
      guard let id = json["id"] as? Int else { return nil }
      return .reply(id, json["error"] == nil ? json["value"] : nil)
    case "shown": return .shown(json["shown"])
    case "frame":
      guard let agentId = json["agentId"] as? String, let jpeg = json["jpeg"] as? String,
            let data = Data(base64Encoded: jpeg), let image = NSImage(data: data) else { return nil }
      let size = CGSize(width: json["width"] as? Double ?? 1280, height: json["height"] as? Double ?? 800)
      return .frame(agentId, image, size)
    case "problem": return .problem
    default: return nil
    }
  }
}
