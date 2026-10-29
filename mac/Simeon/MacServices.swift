import AppKit
import SwiftUI
import UserNotifications
import SimeonCore
import SimeonMacCore

/**
 * What the Electron app's main process does around the window (step 14),
 * done here by the app itself, for the app's whole life (the window may be
 * closed): the Mac's notifications and the Dock's number
 * (`notifications/`), telling the computer whether the window is in front
 * (`setWindowFocused`, which decides what counts as read), what connecting
 * sets on the computer (`coordinator-resync.ts`), links into the app
 * (`deep-link-controller.ts`), and the menus' last touches.
 */
@MainActor
@Observable
final class MacServices {
  static let shared = MacServices()

  /** The Deep Links dialog (`uLn`), while it shows: where the link came from. */
  var deepLinkInfo: DeepLink.Source?
  /** A starter pack's sheet (`…/v1/pack/add?id=`, StarterPackSheet.swift), while it shows. */
  var packAsk: PackAsk?

  @ObservationIgnored private weak var session: MacSession?
  @ObservationIgnored private weak var window: WindowState?
  @ObservationIgnored private weak var plugins: PluginsState?
  /** The main window, once it is up (`WindowAccessor`); closed, it is gone. */
  @ObservationIgnored weak var mainWindow: NSWindow? {
    didSet { if mainWindow !== oldValue { watch(mainWindow) } }
  }
  @ObservationIgnored private let feed = NotificationFeed()
  @ObservationIgnored private let badge = DockBadge()
  /** This run's notifications, taken back when the account goes. */
  @ObservationIgnored private var posted: [String] = []
  @ObservationIgnored private var account: String?
  @ObservationIgnored private var backendId: ObjectIdentifier?
  @ObservationIgnored private var wasLive = false
  @ObservationIgnored private var askedPermission = false
  /** One `setWindowFocused` at a time, each reading the window when it goes (`createWindowFocusSync`). */
  @ObservationIgnored private var focusChain: Task<Void, Never>?
  @ObservationIgnored private var windowWatch: [NSObjectProtocol] = []
  @ObservationIgnored private var appWatch: [NSObjectProtocol] = []
  /** A plugin's link that came before the sign-in finished: opened once it has (decision 10; Electron queues it for the page). */
  @ObservationIgnored private var pendingPlugin: String?
  /** A starter pack's link that came before the sign-in finished (or the first run): shown once signed in. */
  @ObservationIgnored private var pendingPack: String?
  /** A notification's agent clicked before the agents were read (one that launched Simeon): opened with the first list. */
  @ObservationIgnored private var pendingAgent: String?
  /** The last link taken, and when: the same one again within 2 s is dropped (`deep-link-controller.ts`). */
  @ObservationIgnored private var lastLink: (link: String, at: Date)?
  /** Set when the app starts (`SimeonMacApp.init`), before launch ends, so a click that launched Simeon is heard. */
  let notificationDelegate = MacNotificationDelegate()

  private init() {}

  func follow(_ session: MacSession, window: WindowState, plugins: PluginsState) {
    self.window = window
    self.plugins = plugins
    guard self.session !== session else { return }
    self.session = session
    UNUserNotificationCenter.current().delegate = notificationDelegate
    session.store.rosterNews = { [weak self] news in self?.take(news) }
    // Each message the computer takes lets go of the "Allow once" answers (`clearLocalToolApprovals` after `sendPrompt`).
    session.store.promptSent = { _ in MacLocalPermission.approvals.clear() }
    // The window's tabs are not the Electron app's: no Show Tab Bar in View.
    NSWindow.allowsAutomaticWindowTabbing = false
    if appWatch.isEmpty {
      for name in [NSApplication.didBecomeActiveNotification, NSApplication.didResignActiveNotification] {
        appWatch.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
          MainActor.assumeIsolated { self?.focusChanged() }
        })
      }
      // SwiftUI builds the menus again as they change (the Agent menu's name): the Help menu goes each time.
      appWatch.append(NotificationCenter.default.addObserver(forName: NSMenu.didAddItemNotification, object: nil, queue: .main) { note in
        MainActor.assumeIsolated {
          guard let menu = note.object as? NSMenu, menu === NSApp.mainMenu else { return }
          DispatchQueue.main.async { MacServices.shared.removeHelpMenu() }
        }
      })
      DispatchQueue.main.async { MacServices.shared.removeHelpMenu() }
      // Quitting stops the hands (decision 3: they live in the app, where the Electron daemon kept serving), and keeps on this Mac
      // what changed in the agents and chats (SavedChats), written before the app goes.
      appWatch.append(NotificationCenter.default.addObserver(forName: NSApplication.willTerminateNotification, object: nil, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated {
          guard let store = self?.session?.store else { return }
          store.saveNow()
          store.saved?.waitForWrites()
        }
        let done = DispatchSemaphore(value: 0)
        Task.detached {
          await MacLocalHands.shared.stopAndWait()
          done.signal()
        }
        _ = done.wait(timeout: .now() + 1)
      })
    }
    track()
  }

  private func track() {
    guard let session else { return }
    let store = session.store
    let state = withObservationTracking {
      (account: store.account?.email.lowercased(), backend: store.backend.map { ObjectIdentifier($0 as AnyObject) },
       live: store.isLive, signedIn: session.phase == .signedIn)
    } onChange: { [weak self] in
      Task { @MainActor in self?.track() }
    }
    // The account is known after its computer (the profile answers later), and Reload clears it while the computer stays:
    // an account gone while a computer is attached is the same one still. Only no computer at all is signed out.
    let next = state.account ?? (state.backend != nil ? account : nil)
    if next != account || state.backend != backendId {
      let previous = account
      account = next
      backendId = state.backend
      // Another account, or none (`resetAccountState`): forget what was told, take this run's back, the Dock shows nothing.
      if previous != nil && next != previous {
        feed.reset()
        setBadge(badge.reset())
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: posted)
        posted = []
      }
      if let backend = store.backend {
        // "Execution on Local Computer" (kept for this account once its profile names it) and the team's ceiling; the hands
        // for this computer (not the demo's). Neither waits on the profile, which is read once: the computer is this account's.
        Task { await MacLocalPermission.shared.signedIn(next, store: store) }
        if let live = backend as? LiveBackend { Task { await MacLocalHands.shared.start(live.gateway) } }
      } else if next == nil {
        MacLocalPermission.shared.signedOut()
        Task { await MacLocalHands.shared.stop() }
      }
    }
    if state.live && !wasLive, let backend = store.backend { connected(backend) }
    wasLive = state.live
    if state.signedIn {
      if !askedPermission {
        // Asked once signed in and past the first run; the Mac shows what the decider lets through.
        askedPermission = true
        Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) }
      }
      if let id = pendingPlugin {
        pendingPlugin = nil
        plugins?.open(.plugin(id))
      }
      if let id = pendingPack {
        pendingPack = nil
        askPack(id)
      }
    }
  }

  /** The computer reached, at start and after each drop: the parts of the Electron app's resync the Mac keeps. */
  private func connected(_ backend: AgentBackend) {
    Task {
      // The computer's own notifications off: the Mac says them (`notifications`).
      _ = try? await backend.command("setHostSettings", ["notifications": ["isEnabled": false]])
      // The zone this Mac is in; the person's own pick stays the computer's (Settings).
      _ = try? await backend.command("setHostSettings", ["userTimeZone": .string(TimeZone.current.identifier)])
      // "Execution on Local Computer" squared with the computer's, and the security key's switch (Settings › General).
      await MacLocalPermission.shared.connected(backend)
      _ = try? await backend.command("setHostSettings", ["webauthnProxyEnabled": .bool(SecurityKeySetting.enabled)])
      sendFocus()
    }
  }

  // MARK: Notifications and the Dock

  /** The main window is the key window of the app in front (`BrowserWindow.isFocused()`). */
  private var isMainWindowFocused: Bool { NSApp.isActive && mainWindow?.isKeyWindow == true }

  private func take(_ news: AppStore.RosterNews) {
    let focused = isMainWindowFocused
    let now = Date().timeIntervalSince1970 * 1000
    switch news {
    case .seed(let list):
      post(feed.seed(list, isWindowFocused: focused, nowMs: now))
      setBadge(badge.roster(list))
      openPendingAgent()
    case .roster(let list):
      post(feed.roster(list, isWindowFocused: focused, nowMs: now))
      setBadge(badge.roster(list))
      openPendingAgent()
    case .update(let agent):
      post(feed.update(agent, isWindowFocused: focused, nowMs: now))
      setBadge(badge.update(agent))
    }
  }

  /** "Iris needs you" with the Mac's sound; a finished turn without one (`silent`). */
  private func post(_ transitions: [AgentNotifications.Transition]) {
    for transition in transitions {
      let words = AgentNotifications.content(transition)
      let content = UNMutableNotificationContent()
      content.title = words.title
      content.body = words.body
      content.sound = transition.kind == .needsInput ? .default : nil
      content.userInfo = ["agentId": transition.agentId]
      let id = UUID().uuidString
      posted.append(id)
      UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
  }

  /** The number of unread messages, hidden agents aside (`computeDockBadgeTotal`); none at 0. */
  private func setBadge(_ total: Int?) {
    guard let total else { return }
    NSApp.dockTile.badgeLabel = DockBadge.label(total)
  }

  /**
   * A notification clicked: Simeon forward, the main window shown (made
   * again when it was closed: decision 1; the Electron app shows nothing
   * then), and that agent opened, Settings left as it is. An agent that is
   * gone only brings the window forward (decision 2).
   */
  func open(agent agentId: String?) {
    NSApp.activate()
    if let mainWindow {
      if mainWindow.isMiniaturized { mainWindow.deminiaturize(nil) }
      mainWindow.makeKeyAndOrderFront(nil)
    } else if let url = URL(string: "\(SimeonConfig.macURLScheme)://app/v1/open") {
      NSWorkspace.shared.open(url)
    }
    guard let agentId else { return }
    // Before the agents are read (a click that launched Simeon), it waits for them.
    guard let session, let window, !session.store.agents.isEmpty else {
      pendingAgent = agentId
      return
    }
    guard session.store.agents.contains(where: { $0.id == agentId }) else { return }
    window.choose(agentId, store: session.store)
  }

  /** The signed-in account's store (the starter pack's sheet). */
  var currentStore: AppStore? { session?.store }

  /** The agents are read: a notification's agent clicked before then is opened, if it is there (decision 2: else nothing). */
  private func openPendingAgent() {
    guard let agentId = pendingAgent, let session, let window else { return }
    pendingAgent = nil
    guard session.store.agents.contains(where: { $0.id == agentId }) else { return }
    window.choose(agentId, store: session.store)
  }

  // MARK: The window in front

  private func watch(_ window: NSWindow?) {
    windowWatch.forEach(NotificationCenter.default.removeObserver)
    windowWatch = []
    if let window {
      for name in [NSWindow.didBecomeKeyNotification, NSWindow.didResignKeyNotification] {
        windowWatch.append(NotificationCenter.default.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in
          MainActor.assumeIsolated { self?.focusChanged() }
        })
      }
      // Closed, it is gone (the object can outlive it): a notification clicked then makes the window again.
      windowWatch.append(NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: window, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated { self?.mainWindow = nil }
      })
    }
    focusChanged()
  }

  /**
   * The window came in front or went behind (decision 3): the computer is
   * told, and the open chat counts as read only while it is in front, so
   * the Dock's number, the sidebar's dots and the notifications agree.
   */
  private func focusChanged() {
    guard let store = session?.store else { return }
    let focused = isMainWindowFocused
    store.isForeground = focused
    if focused, let open = store.openChat, let agent = store.agent(open), agent.hasUnread || agent.unreadCount > 0 {
      store.markChatRead(open)
    }
    sendFocus()
  }

  /** `setWindowFocused`: whether the main window is the one in front, as it is when the call goes. */
  private func sendFocus() {
    let previous = focusChain
    focusChain = Task { [weak self] in
      await previous?.value
      guard let self, let backend = self.session?.store.backend else { return }
      // Not to a computer that rests (step 4): it is told again when it is back (`connected`).
      _ = try? await backend.commandIfAwake("setWindowFocused", ["isFocused": .bool(self.isMainWindowFocused)])
    }
  }

  // MARK: Links into the app

  /**
   * A link to the app (`simeon://app/v1/…`): the window is brought
   * forward (made again if closed, by the scene); the same link again
   * within 2 s is dropped; `open` does nothing more, `info` shows the Deep
   * Links dialog (signed out too), a plugin's link opens Plugins on its
   * page and a starter pack's shows its sheet, each after the sign-in when
   * it came before.
   */
  func handle(_ url: URL) {
    // A connected app's sign-in the browser finished (the sheet could not
    // open): the app hands it to its computer (`AppReturnSignIn`).
    if url.scheme == SimeonConfig.macURLScheme, let answer = AppReturnSignIn.answer(url) {
      NSApp.activate()
      if let store = session?.store { Task { await store.finishLoopbackSignIn(answer, name: String(localized: "the app")) } }
      return
    }
    guard let link = DeepLink.parse(url.absoluteString, schemes: [SimeonConfig.macURLScheme]) else { return }
    let canonical = link.canonical(scheme: SimeonConfig.macURLScheme)
    if let last = lastLink, last.link == canonical, Date().timeIntervalSince(last.at) < 2 { return }
    lastLink = (canonical, Date())
    NSApp.activate()
    switch link.route {
    case .open:
      break
    case .info:
      deepLinkInfo = link.source
    case .pluginAdd(let id):
      if session?.phase == .signedIn { plugins?.open(.plugin(id)) } else { pendingPlugin = id }
    case .packAdd(let id):
      if session?.phase == .signedIn { askPack(id) } else { pendingPack = id }
    }
  }

  // MARK: The menus

  /** No Help menu (4 October 2026: "hide help center"): SwiftUI always adds one, so it is taken out each time the menus are built. */
  func removeHelpMenu() {
    guard let menu = NSApp.mainMenu else { return }
    if let help = NSApp.helpMenu, let item = menu.items.first(where: { $0.submenu === help }) {
      menu.removeItem(item)
    } else if let item = menu.items.last(where: { $0.title == String(localized: "Help") }) {
      menu.removeItem(item)
    }
  }
}

/** The notifications' delegate, for what only it hears: one shown while Simeon is in front, and one clicked. */
final class MacNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
  /** Shown even with Simeon in front (another of its windows, say): the decider already left out what the main window shows. */
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
    notification.request.content.sound == nil ? [.banner, .list] : [.banner, .list, .sound]
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let agentId = response.notification.request.content.userInfo["agentId"] as? String
    await MainActor.run { MacServices.shared.open(agent: agentId) }
  }
}

// MARK: - The Deep Links dialog

/** The Deep Links dialog over whatever the window shows, the sign-in too. */
struct DeepLinksLayer: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let services = MacServices.shared
    if let source = services.deepLinkInfo {
      let look = Look(scheme)
      ZStack {
        Color(hex: 0x141414).opacity(look.dark ? 0.698 : 0.5)
          .contentShape(Rectangle())
          // A click outside closes it, as Done does (21 October 2026).
          .onTapGesture { services.deepLinkInfo = nil }
        DeepLinksDialog(source: source, look: look) { services.deepLinkInfo = nil }
          // A click on the dialog is the dialog's, not the dark's.
          .contentShape(Rectangle())
          .onTapGesture {}
      }
      .ignoresSafeArea()
    }
  }
}

/**
 * Deep Links (`uLn`, 420 wide, 14 round, a one-point edge): "Deep Links"
 * over "Simeon deep links are working", × at the top right; the route in a
 * code chip and where the link came from; Done at the right of the foot.
 * Done, × and Escape close it. The route and source name this app's own
 * scheme (decision 8; the window prints its old `sand://`).
 */
private struct DeepLinksDialog: View {
  let source: DeepLink.Source
  let look: Look
  let close: () -> Void
  @State private var closeHover = false

  var body: some View {
    let scheme = SimeonConfig.macURLScheme
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 8) {
        VStack(alignment: .leading, spacing: 0) {
          Text("Deep Links")
            .font(.system(size: 14))
            .tracking(-0.15)
            .cssLineHeight(22, size: 14)
            .foregroundStyle(look.ink)
          Text("Simeon deep links are working")
            .font(.system(size: 14))
            .cssLineHeight(22, size: 14)
            .foregroundStyle(look.inkTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        Button(action: close) {
          Image(systemName: "xmark")
            .font(.system(size: 8, weight: .semibold))
            .foregroundStyle(look.inkTertiary)
            .frame(width: 18, height: 18)
            .background(closeHover ? look.rowHover : .clear, in: Circle())
            .contentShape(Circle())
        }
        .buttonStyle(.hand)
        .onHover { closeHover = $0 }
        .accessibilityLabel("Close")
      }
      .padding(EdgeInsets(top: 12, leading: 16, bottom: 0, trailing: 16))
      VStack(alignment: .leading, spacing: 10) {
        field(String(localized: "Route"), "\(scheme)://app/v1/info?topic=deep-links")
        field(String(localized: "Source"), source == .https ? String(localized: "HTTPS link") : String(localized: "Custom protocol (\(scheme)://)"))
      }
      .padding(EdgeInsets(top: 12, leading: 16, bottom: 16, trailing: 16))
      Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1)
      HStack {
        Spacer(minLength: 0)
        Button(action: close) {
          Text("Done")
            .font(.system(size: 13))
            .foregroundStyle(look.onPrimary)
            .padding(.horizontal, 13)
            .frame(height: 30)
            .background(look.primaryFill, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.hand)
      }
      .padding(10)
    }
    .frame(width: 420)
    .background(look.elevated, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.panelEdge(), lineWidth: 1))
    .background(ViewerKeys(aboveLocks: true) { event in
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      guard mods.isEmpty, event.keyCode == 53 || event.keyCode == 36 || event.keyCode == 76 else { return false }
      close()
      return true
    })
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Deep Links")
    .accessibilityAddTraits(.isModal)
  }

  private func field(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label)
        .font(.system(size: 12))
        .cssLineHeight(16, size: 12)
        .foregroundStyle(look.inkSecondary)
      Text(value)
        .font(.system(size: 12, design: .monospaced))
        .foregroundStyle(look.inkSecondary)
        .textSelection(.enabled)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(look.ground, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
    }
  }
}

// MARK: - Move to Applications

/**
 * "Move Simeon to the Applications folder?" at launch (Electron main's
 * `move-to-applications-folder.ts`): asked on every launch while the app
 * runs from anywhere else, with no "don't ask again". Move to Applications
 * moves it (a copy from a disk image), reopens it from there and quits; Not
 * Now carries on; a failure says so and carries on.
 *
 * Electron asks only in a packaged build. Here that is a release build
 * whose Info.plist says `SimeonAskToMoveToApplications`, set since this app
 * replaced the Electron one (11 October 2026): a move puts it in the
 * Electron app's place, which is now what is wanted.
 */
@MainActor
enum MacMoveToApplications {
  /** Once a launch: the window's task runs again when the window is made again. */
  private static var asked = false

  static func askAtLaunch() {
    #if DEBUG
    return
    #else
    guard !asked else { return }
    asked = true
    guard Bundle.main.object(forInfoDictionaryKey: "SimeonAskToMoveToApplications") as? Bool == true else { return }
    let here = Bundle.main.bundleURL.resolvingSymlinksInPath()
    guard !isInApplications(here) else { return }
    let question = NSAlert()
    question.alertStyle = .informational
    question.messageText = String(localized: "Move Simeon to the Applications folder?")
    question.informativeText = String(localized: "Simeon runs from the Applications folder. It will reopen after moving.")
    question.addButton(withTitle: String(localized: "Move to Applications"))
    question.addButton(withTitle: String(localized: "Not Now"))
    guard question.runModal() == .alertFirstButtonReturn else { return }
    do {
      try move(here)
    } catch {
      let failed = NSAlert()
      failed.alertStyle = .critical
      failed.messageText = String(localized: "Simeon couldn't move to Applications")
      failed.informativeText = String(localized: "Move Simeon to the Applications folder manually, then reopen Simeon")
      failed.addButton(withTitle: "OK")
      failed.runModal()
    }
    #endif
  }

  /** In /Applications or ~/Applications, at any depth (`app.isInApplicationsFolder`). */
  static func isInApplications(_ url: URL) -> Bool {
    let folders = FileManager.default.urls(for: .applicationDirectory, in: [.localDomainMask, .userDomainMask])
    let path = url.standardizedFileURL.path
    return folders.contains { path.hasPrefix($0.resolvingSymlinksInPath().standardizedFileURL.path + "/") }
  }

  /**
   * As Electron's move does it: a Simeon already in Applications and running
   * is brought forward and this copy quits; one not running goes to the
   * Trash and this one takes its place, moved (copied when it cannot be, as
   * from a disk image); then it is opened from there and this copy quits.
   */
  private static func move(_ here: URL) throws {
    let files = FileManager.default
    guard let applications = files.urls(for: .applicationDirectory, in: .localDomainMask).first else { throw CocoaError(.fileNoSuchFile) }
    let there = applications.appendingPathComponent(here.lastPathComponent)
    if files.fileExists(atPath: there.path) {
      if let running = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "").first(where: { $0.bundleURL?.resolvingSymlinksInPath().standardizedFileURL == there.resolvingSymlinksInPath().standardizedFileURL }) {
        running.activate()
        NSApp.terminate(nil)
        return
      }
      try files.trashItem(at: there, resultingItemURL: nil)
    }
    do { try files.moveItem(at: here, to: there) } catch { try files.copyItem(at: here, to: there) }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.createsNewApplicationInstance = true
    NSWorkspace.shared.openApplication(at: there, configuration: configuration) { _, _ in
      Task { @MainActor in NSApp.terminate(nil) }
    }
  }
}
