import Foundation

/**
 * The number on the app's icon: how many chats wait to be read (5 November
 * 2026, the founder: "apple shows notifications 1 even when there is no").
 * Every push used to set it to 1, and nothing took it off again. Now the app
 * writes here the chats its list shows as unread and sets the icon to their
 * count (NotificationBadge); the notification extension adds the chat a push
 * comes from and shows the new count (NotificationService). The server's
 * pushes carry no number of their own (server/simeon/desktop/apns.py).
 *
 * Built into both targets (ios/project.yml), so it uses Foundation alone.
 */
enum BadgeShelf {
  private static let key = "simeon.unreadChats"

  private static var defaults: UserDefaults? { UserDefaults(suiteName: PictureShelf.group) }

  static func read() -> Set<String> {
    Set(defaults?.stringArray(forKey: key) ?? [])
  }

  static func write(_ ids: Set<String>) {
    defaults?.set(ids.sorted(), forKey: key)
  }

  /** A push from this chat: it waits too now. The number to show. */
  static func adding(_ agentId: String) -> Int {
    var ids = read()
    ids.insert(agentId)
    write(ids)
    return ids.count
  }

  /** Signed out: nothing kept for the next account. */
  static func clear() {
    defaults?.removeObject(forKey: key)
  }
}
