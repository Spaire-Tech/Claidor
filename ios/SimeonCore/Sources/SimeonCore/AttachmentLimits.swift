import Foundation

/**
 * What the composer takes (the window's staging, `j9n`, `q9n`,
 * `attachment-limits.ts`): six files at most, each up to 25 MB (200 MB for
 * a video), none empty; and the line it shows for five seconds when some
 * are left out.
 */
public enum AttachmentLimits {
  public static let maxStaged = 6
  public static let byteLimit = 25 * 1024 * 1024
  public static let videoByteLimit = 200 * 1024 * 1024
  static let videoExtensions: Set<String> = ["m4v", "mov", "mp4", "ogv", "webm"]
  /** How long the composer shows the line (`chat-attachment-notice`). */
  public static let noticeSeconds: Double = 5

  public enum Refusal: Equatable, Sendable { case tooLarge, empty, failed }

  public static func isVideo(_ name: String) -> Bool { videoExtensions.contains((name as NSString).pathExtension.lowercased()) }

  public static func limit(for name: String) -> Int { isVideo(name) ? videoByteLimit : byteLimit }

  /** Why a file of `size` bytes can't be attached, if it can't. */
  public static func refusal(name: String, size: Int) -> Refusal? {
    if size == 0 { return .empty }
    return size > limit(for: name) ? .tooLarge : nil
  }

  /** How many of `incoming` fit beside `staged`, and the line for the rest ("Only 6 attachments allowed — 2 weren't added."). */
  public static func admit(_ incoming: Int, staged: Int) -> (accepted: Int, notice: String?) {
    let accepted = min(incoming, max(0, maxStaged - staged))
    let left = incoming - accepted
    return (accepted, left > 0 ? "Only \(maxStaged) attachments allowed — \(left) \(left == 1 ? "wasn't" : "weren't") added." : nil)
  }

  /** The line for the files that could not be attached: one by name, else how many. */
  public static func notice(_ refused: [(name: String, reason: Refusal)]) -> String? {
    guard let first = refused.first else { return nil }
    if refused.count == 1 {
      switch first.reason {
      case .tooLarge: return "\"\(first.name)\" is too large to attach (max \(isVideo(first.name) ? "200 MB for video" : "25 MB"))."
      case .empty: return "\"\(first.name)\" is empty, so it wasn't attached."
      case .failed: return "Couldn't attach \"\(first.name)\"."
      }
    }
    if refused.allSatisfy({ $0.reason == .tooLarge }) { return "\(refused.count) files are too large to attach (max 25 MB, or 200 MB for video)." }
    return "\(refused.count) files couldn't be attached."
  }
}
