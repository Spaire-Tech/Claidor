import Foundation

/**
 * What dictation writes into a message (the founder, 25 October 2026: "when
 * you talk, and you click on stop recording, the message disappears"): the
 * words the field held before, then what was heard. Apple's recognizer
 * starts its text afresh after a pause, and may end with nothing at all;
 * each was written over the whole message until then, so a pause or Stop
 * wiped what came before. Here the stretches heard are kept, and nothing
 * heard takes nothing away.
 */
public struct DictatedText: Equatable, Sendable {
  /** What the field held when dictation started: Cancel goes back to it. */
  public let before: String
  /** The stretches of speech already ended by a pause. */
  public private(set) var settled = ""
  /** The stretch being heard now, as the recognizer has it so far. */
  public private(set) var hearing = ""

  public init(before: String = "") {
    self.before = before
  }

  /**
   * A result from the recognizer: its text, and whether a pause ended that
   * stretch (`isFinal`, or the metadata a stretch ends with). A text that
   * starts again, shorter and with another first word, is a new stretch even
   * unannounced; one that repeats every stretch so far is the whole.
   */
  public mutating func heard(_ text: String, ended: Bool) {
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if !words.isEmpty {
      if !settled.isEmpty && Self.key(words).hasPrefix(Self.key(settled)) {
        settled = ""
      } else if !hearing.isEmpty && words.count < hearing.count && Self.firstWord(words) != Self.firstWord(hearing) {
        settle()
      }
      hearing = words
    }
    if ended { settle() }
  }

  /** The message: what was there, then every stretch heard, a space between each. */
  public var draft: String {
    let heard = [settled, hearing].filter { !$0.isEmpty }.joined(separator: " ")
    guard !heard.isEmpty else { return before }
    if before.isEmpty { return heard }
    return before.last?.isWhitespace == true ? before + heard : before + " " + heard
  }

  private mutating func settle() {
    guard !hearing.isEmpty else { return }
    settled = settled.isEmpty ? hearing : settled + " " + hearing
    hearing = ""
  }

  private static func key(_ text: String) -> String {
    text.lowercased().filter { $0.isLetter || $0.isNumber }
  }

  private static func firstWord(_ text: String) -> String {
    key(String(text.split(whereSeparator: \.isWhitespace).first ?? ""))
  }
}
