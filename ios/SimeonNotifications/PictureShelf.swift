import Foundation

/**
 * Agents' pictures shared by the app and its notification extension (12
 * October 2026): the app writes each agent's picture here as it draws the
 * agents (NotificationPictures), the extension reads it to show a push as a
 * message from that agent (NotificationService). One small PNG per agent in
 * the App Group's `Pictures` folder; gone at sign-out.
 *
 * Built into both targets (ios/project.yml), so it uses Foundation alone.
 */
enum PictureShelf {
  static let group = "group.com.simeonlabs.simeon"

  static var folder: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("Pictures", isDirectory: true)
  }

  /** The agent's file: its id with anything but letters, digits, "-" and "_" made "_". */
  static func url(for agentId: String) -> URL? {
    let safe = String(agentId.unicodeScalars.map { scalar -> Character in
      CharacterSet.alphanumerics.contains(scalar) || scalar == "-" || scalar == "_" ? Character(scalar) : "_"
    })
    guard !safe.isEmpty else { return nil }
    return folder?.appendingPathComponent("\(safe).png")
  }

  static func read(_ agentId: String) -> Data? {
    url(for: agentId).flatMap { try? Data(contentsOf: $0) }
  }

  static func write(_ data: Data, for agentId: String) {
    guard let folder, let url = url(for: agentId) else { return }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    try? data.write(to: url, options: .atomic)
  }

  /** Signed out: no picture of this account's agents stays on the phone. */
  static func clear() {
    guard let folder else { return }
    try? FileManager.default.removeItem(at: folder)
  }
}
