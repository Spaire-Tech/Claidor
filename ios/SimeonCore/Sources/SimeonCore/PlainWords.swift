import Foundation

/**
 * What the person reads when something goes wrong (the founder, 13 October
 * 2026: "the banners should not tell internal stuff … it should not say
 * Simeon is out of OpenAI credits, should just say not available for the
 * moment. Same for every other banner"). Errors reach the apps from the
 * engine, Simeon Labs' server and the model companies behind it, often word
 * for word: a company's name, a status code, a setting's name, an address.
 * Every banner, card, alert and notice that shows such words passes them
 * here first; words that name nothing behind Simeon are kept, the rest give
 * way to a plain sentence. The words themselves stay in the app's trace.
 */
public enum PlainWords {
  /** The sentence for anything the model service or Simeon's own servers refused or could not do. */
  public static let unavailable = L10n.text("Simeon isn’t available at the moment. Try again in a little while.")
  /** The same, for one agent's answer. */
  public static let noAnswer = L10n.text("Your agent couldn’t answer right now. Try again in a little while.")

  /**
   * The words of an error as the person may read them: `text` when it names
   * nothing internal, else `fallback`. Empty stays empty.
   */
  public static func error(_ text: String, fallback: String = unavailable) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "" }
    return isInternal(trimmed) ? fallback : trimmed
  }

  /**
   * A line made as "What failed: why" (the store's problems): the "why"
   * kept when it is plain, else only "What failed." with a word to try
   * again; a line that is internal from its start gives way to `fallback`.
   */
  public static func problem(_ text: String, fallback: String = unavailable) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "" }
    guard isInternal(trimmed) else { return trimmed }
    if let colon = trimmed.range(of: ": ") {
      let head = String(trimmed[..<colon.lowerBound]).trimmingCharacters(in: .whitespaces)
      if !head.isEmpty, head.count <= 80, !isInternal(head) {
        return L10n.text("\(head.trimmingCharacters(in: CharacterSet(charactersIn: "."))). Try again in a little while.")
      }
    }
    return fallback
  }

  /** Whether the words name something behind Simeon or are a machine's rather than a sentence for a person. */
  public static func isInternal(_ text: String) -> Bool {
    if text.count > 220 { return true }
    let range = NSRange(text.startIndex..., in: text)
    return internalMarks.contains { $0.firstMatch(in: text, range: range) != nil }
  }

  /**
   * The marks of words not meant for the person: the model and voice
   * companies and the services Simeon runs on, status codes and refusal
   * codes, setting names, addresses, files and the plumbing's own words.
   */
  static let internalMarks: [NSRegularExpression] = [
    // Companies and services behind Simeon.
    // (Not the apps a person connects, Stripe or Google among them: their names are the person's own words.)
    #"\b(open ?ai|anthropic|claude|gemini|google ai|vertex|x\.?ai|grok|eleven ?labs|composio|fal\.ai|duffel|render\.com|redis|postgres(ql)?|docker|novnc|websockify|livekit)\b"#,
    // Credits, keys and limits of those services.
    #"\b(insufficient_quota|quota|api[ _-]?key|credit balance|rate[ _-]?limit(ed)?|overloaded|tokens?|jetons?|max_tokens|context[ _-]?(length|window))\b"#,
    // Codes: HTTP statuses said as such, refusal codes, exit codes.
    #"\b(status|code|http|error)\s*:?\s*\d{3,5}\b"#,
    #"\(\s*\d{3,5}\s*[:)]"#,
    #"\banswered\b.*\b\d{3}\b"#,
    // Settings, files, addresses and the plumbing's words.
    #"\b(SAND|SIMEON|CLAIDOR)_[A-Z_]+\b"#,
    #"\b[\w-]+\.(ts|js|mjs|py|swift|json|log)\b"#,
    #"https?://|localhost|127\.0\.0\.1|\bport\b"#,
    #"\b(gateway|proxy|endpoint|host bundle|npm|socket|websocket|vnc|json|stack ?trace|exception|traceback|undefined|null pointer|nil)\b"#,
  ].map { try! NSRegularExpression(pattern: $0, options: [.caseInsensitive]) } + [
    // A gateway method named before its error ("createAgent: …"), in its own case.
    try! NSRegularExpression(pattern: #"^[a-z]+[A-Z][A-Za-z]*: "#),
  ]
}
