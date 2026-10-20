import Intents
import UserNotifications

/**
 * Each push as a message from the agent who sent it (the founder, 12
 * October 2026: "the notification icon should be whatever agent sent it.
 * with a little simeonlabs logo on the bottom corner"): Apple's
 * communication notification, the agent's picture where the app's icon
 * would be and the app's icon small in its corner (iOS draws that part).
 *
 * The server marks every push `mutable-content` (server/simeon/desktop/
 * apns.py) with the agent's id and, from engines since 12 October 2026, its
 * name. The picture is the app's own copy of it (PictureShelf); an agent the
 * app has not drawn yet shows its initials. "X needs you" becomes a message
 * from X that says so. A push this cannot read, or one Apple's time runs out
 * on, shows as it came.
 */
final class NotificationService: UNNotificationServiceExtension {
  private var handler: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    handler = contentHandler
    original = request.content
    let shown = Self.message(from: request.content) ?? request.content
    handler = nil
    contentHandler(shown)
  }

  override func serviceExtensionTimeWillExpire() {
    if let handler, let original { handler(original) }
    handler = nil
  }

  static func message(from content: UNNotificationContent) -> UNNotificationContent? {
    guard let agentId = content.userInfo["agentId"] as? String, !agentId.isEmpty else { return nil }
    let given = (content.userInfo["agentName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let name = given.isEmpty ? senderName(fromTitle: content.title) : given
    let needsYou = content.userInfo["kind"] as? String == "agent-needs-input"
    let image = PictureShelf.read(agentId).map { INImage(imageData: $0) }
    let sender = INPerson(
      personHandle: INPersonHandle(value: agentId, type: .unknown),
      nameComponents: nil,
      displayName: name,
      image: image,
      contactIdentifier: nil,
      customIdentifier: agentId
    )
    let words = needsYou ? needsYouLine(content.body) : content.body
    let intent = INSendMessageIntent(
      recipients: nil,
      outgoingMessageType: .outgoingMessageText,
      content: words,
      speakableGroupName: nil,
      conversationIdentifier: agentId,
      serviceName: nil,
      sender: sender,
      attachments: nil
    )
    if let image { intent.setImage(image, forParameterNamed: \.sender) }
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    interaction.donate(completion: nil)
    guard let mutable = content.mutableCopy() as? UNMutableNotificationContent else { return nil }
    mutable.body = words
    return try? mutable.updating(from: intent)
  }

  /** The agent's name from a title the engine wrote before it sent the name: "Ada needs you" is Ada's. */
  static func senderName(fromTitle title: String) -> String {
    let suffix = " needs you"
    let name = title.hasSuffix(suffix) ? String(title.dropLast(suffix.count)) : title
    return name.isEmpty ? "Simeon" : name
  }

  /** The title said "needs you"; the message from the agent says it now. */
  static func needsYouLine(_ reason: String) -> String {
    let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty || trimmed == "Waiting for your input." { return String(localized: "Needs your input.") }
    return String(localized: "Needs you: \(trimmed)")
  }
}
