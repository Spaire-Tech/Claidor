import SwiftUI
#if os(iOS)
import UIKit
#endif
import UserNotifications
import SimeonCore

/**
 * Notifications from the agents (8 October 2026): the host in the person's
 * cloud computer decides, as the Mac does, when an agent finished or needs
 * them, and Simeon Labs' server sends it. The Expo app's pushes go through
 * Expo; this app registers Apple's own device token instead
 * (`/desktop/push-devices`, `apns_token`) and the server sends to Apple
 * (server/simeon/desktop/apns.py). A tap opens that agent's chat.
 */
@MainActor
@Observable
final class Notifications {
  static let shared = Notifications()

  /** The agent a tapped notification asked for; the list opens its chat and clears this. */
  var openAgent: String?
  /** A starter pack the website's Add to Simeon opened (`simeon-ios://app/v1/pack/add?id=`); the list shows its sheet and clears this. */
  var openPack: String?
  /** The signed-in app's store: which chat is on screen (`openChat`). */
  @ObservationIgnored weak var store: AppStore?
  @ObservationIgnored private var api: SimeonAPI?
  @ObservationIgnored private var token: String?

  /**
   * A notification while the app is in front (the founder, 12 October 2026:
   * a push for the chat being read "makes no sense"): nothing for the chat on
   * screen, whose message is already there; a banner for another chat.
   */
  func presentation(for agentId: String?) -> UNNotificationPresentationOptions {
    if let agentId, let store, store.isForeground, agentId == store.openChat { return [] }
    return [.banner, .list, .sound]
  }

  /** A chat opened: its notifications leave the Notification Centre (they have been read). */
  func clearDelivered(for agentId: String) async {
    let center = UNUserNotificationCenter.current()
    let ids = await center.deliveredNotifications()
      .filter { $0.request.content.userInfo["agentId"] as? String == agentId }
      .map(\.request.identifier)
    if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
  }

  /**
   * A build run from Xcode is served by Apple's sandbox: its signing profile
   * (`embedded.mobileprovision`, which App Store and TestFlight builds do not
   * carry) says `aps-environment` development. Read at run time, not from the
   * build configuration, since Run builds Release too (project.yml).
   */
  static let sandbox: Bool = {
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
          let data = try? Data(contentsOf: url) else { return false }
    let text = String(decoding: data, as: UTF8.self)
    guard let key = text.range(of: "<key>aps-environment</key>") else { return false }
    return text[key.upperBound...].prefix(80).contains("development")
  }()

  /** Settings › Notifications (`@AppStorage` key): on until turned off (the founder, 11 October 2026). */
  static let key = "simeon.notifications"

  static var isOn: Bool { UserDefaults.standard.object(forKey: key) as? Bool ?? true }

  /** Refused in the phone's own Settings: the switch shows off, and turning it on opens them. */
  static func refused() async -> Bool {
    await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .denied
  }

  /** Settings › Notifications turned: on registers this phone again (asking first if never asked); off takes it off the person's pushes. */
  func turn(_ on: Bool) async {
    if on {
      if let api { await start(api: api) }
    } else {
      if let api, let token { try? await api.registerPushDevice(apnsToken: token, sandbox: Self.sandbox, remove: true) }
      try? await UNUserNotificationCenter.current().setBadgeCount(0)
    }
  }

  /** After sign-in: asks once, then registers this phone with Apple and, through it, with Simeon; not while Settings has them off. */
  func start(api: SimeonAPI) async {
    self.api = api
    guard Self.isOn else { return }
    let center = UNUserNotificationCenter.current()
    let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    guard granted else { return }
    #if os(iOS)
    UIApplication.shared.registerForRemoteNotifications()
    #endif
    if let token { await send(token) }
  }

  /** Apple's token for this phone (`didRegisterForRemoteNotificationsWithDeviceToken`). */
  func received(_ deviceToken: Data) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    token = hex
    Task { await send(hex) }
  }

  private func send(_ hex: String) async {
    guard let api, Self.isOn else { return }
    try? await api.registerPushDevice(apnsToken: hex, sandbox: Self.sandbox)
  }

  /** The sign-in ended on its own: nothing to ask the server (it would refuse), just let go of it. */
  func forget() {
    api = nil
  }

  /** On sign-out: this phone stops getting the person's pushes. */
  func stop() async {
    if let api, let token { try? await api.registerPushDevice(apnsToken: token, sandbox: Self.sandbox, remove: true) }
    api = nil
    try? await UNUserNotificationCenter.current().setBadgeCount(0)
  }
}

#if os(iOS)
/**
 * Each agent's picture for its pushes (12 October 2026): the notification
 * extension (ios/SimeonNotifications) shows a push as a message from its
 * agent, with the picture the app draws for it, read from the App Group
 * (PictureShelf). Written when an agent's picture changes, 180 points
 * square; gone at sign-out.
 */
@MainActor
enum NotificationPictures {
  /** What was written this launch, by agent: the picture's key. */
  private static var saved: [String: String] = [:]

  /** The pictures' keys, for the list to notice when one changes. */
  static func keys(_ agents: [Agent]) -> String {
    agents.map { "\($0.id)=\(key(of: $0) ?? "")" }.joined(separator: ",")
  }

  private static func key(of agent: Agent) -> String? {
    agent.isGroup ? agent.avatarVersion ?? agent.avatarDataURL.map { "g\($0.utf8.count)" } : agent.picture?.key
  }

  static func save(_ agents: [Agent]) {
    for agent in agents {
      guard let key = key(of: agent), saved[agent.id] != key, let image = AgentPictures.image(of: agent) else { continue }
      saved[agent.id] = key
      let side: CGFloat = 180
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      let square = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
        // The whole picture, filling the square (iOS rounds it).
        let scale = max(side / max(image.size.width, 1), side / max(image.size.height, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        image.draw(in: CGRect(x: (side - size.width) / 2, y: (side - size.height) / 2, width: size.width, height: size.height))
      }
      guard let data = square.pngData() else { continue }
      let id = agent.id
      Task.detached(priority: .utility) { PictureShelf.write(data, for: id) }
    }
  }

  /** Signed out: the next account's agents are not shown with these. */
  static func forget() {
    saved = [:]
    Task.detached(priority: .utility) { PictureShelf.clear() }
  }
}

/** The app's delegate, for what only UIKit hears: Apple's token, and a notification shown or tapped. */
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return true
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Task { @MainActor in Notifications.shared.received(deviceToken) }
  }

  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}

  /** In the app: a banner, except for the chat on screen (`Notifications.presentation`). */
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
    let agentId = notification.request.content.userInfo["agentId"] as? String
    return await MainActor.run { Notifications.shared.presentation(for: agentId) }
  }

  /** A tap: open that agent's chat. */
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let agentId = response.notification.request.content.userInfo["agentId"] as? String
    await MainActor.run { Notifications.shared.openAgent = agentId }
  }
}
#endif
