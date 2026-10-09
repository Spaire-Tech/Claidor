import SwiftUI
import UIKit
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
  @ObservationIgnored private var api: SimeonAPI?
  @ObservationIgnored private var token: String?

  #if DEBUG
  /** A build run from Xcode is served by Apple's sandbox. */
  static let sandbox = true
  #else
  static let sandbox = false
  #endif

  /** After sign-in: asks once, then registers this phone with Apple and, through it, with Simeon. */
  func start(api: SimeonAPI) async {
    self.api = api
    let center = UNUserNotificationCenter.current()
    let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
    guard granted else { return }
    UIApplication.shared.registerForRemoteNotifications()
    if let token { await send(token) }
  }

  /** Apple's token for this phone (`didRegisterForRemoteNotificationsWithDeviceToken`). */
  func received(_ deviceToken: Data) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    token = hex
    Task { await send(hex) }
  }

  private func send(_ hex: String) async {
    guard let api else { return }
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

  /** In the app: still shown, as a banner. */
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound]
  }

  /** A tap: open that agent's chat. */
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let agentId = response.notification.request.content.userInfo["agentId"] as? String
    await MainActor.run { Notifications.shared.openAgent = agentId }
  }
}
