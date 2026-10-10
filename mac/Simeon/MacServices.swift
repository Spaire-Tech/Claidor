import AppKit
import SwiftUI
import UserNotifications
import SimeonCore
import SimeonMacCore

/**
 * What the Electron app's main process does around the window, done here by
 * the app itself: the Mac's notifications and the Dock's number
 * (`notifications/`), telling the box whether the window is in front
 * (`setWindowFocused`), the local-computer setting kept per account, and
 * what connecting to the box sets there (`coordinator-resync.ts`).
 */
@MainActor
final class MacServices {
  static let shared = MacServices()

  private weak var session: SessionController?
  /** The main window, once it is up (MacRoot's WindowReader); closed, it is gone. */
  weak var mainWindow: NSWindow? {
    didSet { if mainWindow !== oldValue { watch(mainWindow) } }
  }
  private let feed = NotificationFeed()
  private let badge = DockBadge()
  /** This run's notifications, taken back when another account signs in. */
  private var posted: [String] = []
  private var account: String?
  private var wasLive = false
  private var askedPermission = false
  /** One `setWindowFocused` at a time, each reading the window when it goes (`createWindowFocusSync`). */
  private var focusChain: Task<Void, Never>?
  private var windowWatch: [NSObjectProtocol] = []
  private let delegate = MacNotificationDelegate()

  private init() {}

  func follow(_ session: SessionController) {
    guard self.session !== session else { return }
    self.session = session
    UNUserNotificationCenter.current().delegate = delegate
    session.store.rosterNews = { [weak self] news in self?.take(news) }
    // Each message the box takes lets go of the "Allow once" answers (`clearLocalToolApprovals` after `sendPrompt`).
    session.store.promptSent = { _ in MacLocalPermission.approvals.clear() }
    track()
  }

  private func track() {
    guard let session else { return }
    let store = session.store
    let state = withObservationTracking {
      (account: store.account?.email.lowercased(), live: store.isLive, ready: session.firstRun == .done && store.backend != nil)
    } onChange: { [weak self] in
      Task { @MainActor in self?.track() }
    }
    if state.account != account { accountChanged(to: state.account, store: store) }
    if state.live && !wasLive, let backend = store.backend { connected(backend) }
    wasLive = state.live
    if state.ready && state.account != nil && !askedPermission {
      // Asked once signed in and past the first run, as the iPhone asks; the Mac shows what the decider lets through.
      askedPermission = true
      Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) }
    }
  }

  /**
   * Another account, or none: the notifications forget what they knew and
   * this run's are taken back, the Dock shows none (`resetAccountState`);
   * the local-computer setting is this account's.
   */
  private func accountChanged(to next: String?, store: AppStore) {
    let previous = account
    account = next
    if previous != nil {
      feed.reset()
      setBadge(badge.reset())
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: posted)
      posted = []
    }
    if let next, let backend = store.backend {
      Task { await MacLocalPermission.shared.signedIn(next, backend: backend) }
    } else if next == nil {
      MacLocalPermission.shared.signedOut()
    }
  }

  /** The box reached, at start and after each drop: the steps of the Electron app's resync that the Mac keeps. */
  private func connected(_ backend: AgentBackend) {
    Task {
      // The zone this Mac is in (`timezone`); the person's own pick stays the box's (`userTimeZoneOverride`, Settings).
      _ = try? await backend.command("setHostSettings", ["userTimeZone": .string(TimeZone.current.identifier)])
      await MacLocalPermission.shared.connected(backend)
      sendFocus()
    }
  }

  // MARK: Notifications and the Dock

  private var isMainWindowFocused: Bool { NSApp.isActive && mainWindow?.isKeyWindow == true }

  private func take(_ news: AppStore.RosterNews) {
    let focused = isMainWindowFocused
    let now = Date().timeIntervalSince1970 * 1000
    switch news {
    case .seed(let list):
      post(feed.seed(list, isWindowFocused: focused, nowMs: now))
      setBadge(badge.roster(list))
    case .roster(let list):
      post(feed.roster(list, isWindowFocused: focused, nowMs: now))
      setBadge(badge.roster(list))
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

  private func setBadge(_ total: Int?) {
    guard let total else { return }
    NSApp.dockTile.badgeLabel = DockBadge.label(total)
  }

  /**
   * A notification clicked: Simeon forward, the main window shown (made
   * again through the app's own link when it was closed), and that agent
   * opened once the list has it.
   */
  func open(agent agentId: String?) {
    NSApp.activate()
    if let window = mainWindow {
      if window.isMiniaturized { window.deminiaturize(nil) }
      window.makeKeyAndOrderFront(nil)
    } else if let url = URL(string: "\(SimeonConfig.macURLScheme)://app/v1/open") {
      NSWorkspace.shared.open(url)
    }
    Notifications.shared.openAgent = agentId
  }

  // MARK: The window in front

  private func watch(_ window: NSWindow?) {
    windowWatch.forEach(NotificationCenter.default.removeObserver)
    windowWatch = []
    if let window {
      for name in [NSWindow.didBecomeKeyNotification, NSWindow.didResignKeyNotification, NSWindow.willCloseNotification] {
        windowWatch.append(NotificationCenter.default.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in
          MainActor.assumeIsolated { self?.sendFocus() }
        })
      }
    }
    sendFocus()
  }

  /** `setWindowFocused`: whether the main window is the one in front, as it is when the call goes. */
  func sendFocus() {
    let previous = focusChain
    focusChain = Task { [weak self] in
      await previous?.value
      guard let self, let backend = self.session?.store.backend else { return }
      _ = try? await backend.command("setWindowFocused", ["isFocused": .bool(self.isMainWindowFocused)])
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
