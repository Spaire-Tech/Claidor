import Foundation

/**
 * What the composer's lists are made of: the agent's skills and routines
 * (`getAgentWorkflows`) and the pull requests a chat names. The lists
 * themselves are `ComposerLists`; the message's document is
 * `ComposerDocument`.
 */
public enum ComposerMenus {
  /** A skill "/" offers (`getAgentWorkflows`): one the agent can be asked to use now, not a routine that runs on its own. */
  public struct Skill: Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    /** When it runs, for a routine ("Every weekday at 9"). */
    public let subtitle: String?
    /** What it does, for a skill: the line under it after "/". */
    public let summary: String?
    public let iconId: String?
    public let iconURL: String?

    public init(id: String, name: String, subtitle: String? = nil, summary: String? = nil, iconId: String? = nil, iconURL: String? = nil) {
      self.id = id; self.name = name; self.subtitle = subtitle; self.summary = summary; self.iconId = iconId; self.iconURL = iconURL
    }
  }

  /** A pull request "#" offers: one a message in the chat linked (`github.com/…/pull/N`). */
  public struct PullRequest: Hashable, Sendable, Identifiable {
    public let number: Int
    public let url: String
    /** Its title, when the chat gave one (a cloud agent's name, a reference's title). */
    public var title: String?
    public var id: Int { number }

    public init(number: Int, url: String, title: String? = nil) {
      self.number = number; self.url = url; self.title = title
    }
  }

  /**
   * The skills in `getAgentWorkflows`' answer that "/" offers: no schedule
   * of their own (`trigger` null), and on for this agent or a routine's own
   * (`isEnabledForAgent`, `source == "automation"`), each once. With
   * `scheduled`, the routines instead (a `trigger`), which "@" offers.
   */
  public static func skills(from answer: JSON, scheduled: Bool = false) -> [Skill] {
    var seen = Set<String>()
    return (answer.array ?? answer["workflows"]?.array ?? []).compactMap { item -> Skill? in
      guard let id = item["id"]?.text?.trimmingCharacters(in: .whitespaces), !id.isEmpty,
            let name = item["name"]?.text?.trimmingCharacters(in: .whitespaces), !name.isEmpty else { return nil }
      // "/" offers the skills with no schedule; "@" offers the routines, the ones with one (`scheduled`).
      let hasTrigger = item["trigger"].map { $0 != .null } ?? false
      if hasTrigger != scheduled { return nil }
      guard item["isEnabledForAgent"]?.bool == true || item["source"]?.string == "automation" else { return nil }
      guard seen.insert(id).inserted else { return nil }
      // A routine's line is when it runs (`scheduleDescription`, else its schedule); a skill's is what it does.
      let when = item["scheduleDescription"]?.text ?? item["trigger"]?["schedule"]?.text
      return Skill(id: id, name: name, subtitle: when, summary: item["description"]?.text, iconId: item["iconId"]?.text, iconURL: item["iconUrl"]?.text)
    }
  }

  /**
   * The pull requests named in a text (`Fpt`, `Rpt`): http(s) addresses,
   * trailing punctuation off; GitHub's "/owner/repo/pull/N", or Simeon's
   * review page "review.simeonlabs.com/github/pr/owner/repo/N".
   */
  static func pullRequestLinks(in text: String) -> [PullRequest] {
    guard let pattern = try? NSRegularExpression(pattern: #"https?://[^\s<>()\[\]]+"#) else { return [] }
    let range = NSRange(text.startIndex..., in: text)
    return pattern.matches(in: text, range: range).compactMap { match -> PullRequest? in
      guard let found = Range(match.range, in: text) else { return nil }
      var raw = String(text[found])
      while let last = raw.last, ".,;:!?".contains(last) { raw.removeLast() }
      guard let url = URL(string: raw), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
            let host = url.host?.lowercased() else { return nil }
      let parts = url.path.split(separator: "/", omittingEmptySubsequences: false)
      let number: Int?
      if host == "github.com" || host == "www.github.com" {
        // "", owner, repo, "pull", number[, …]
        number = parts.count >= 5 && parts[0].isEmpty && !parts[1].isEmpty && !parts[2].isEmpty && parts[3] == "pull" ? Int(parts[4]) : nil
      } else if host == "review.simeonlabs.com" {
        // "", "github", "pr", owner, repo, number[, …]
        number = parts.count >= 6 && parts[0].isEmpty && parts[1] == "github" && parts[2] == "pr" && !parts[3].isEmpty && !parts[4].isEmpty ? Int(parts[5]) : nil
      } else {
        number = nil
      }
      guard let number, number > 0 else { return nil }
      return PullRequest(number: number, url: raw)
    }
  }
}
