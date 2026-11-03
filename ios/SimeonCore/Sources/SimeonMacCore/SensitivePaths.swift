import Foundation

/**
 * The places on the person's Mac that Simeon does not touch, whatever the
 * local-computer setting says (`shared/sensitive-local-paths.ts`): keys and
 * sign-ins. Matched as the Electron app matches them, but with no regard to
 * letter case, as the Mac's disk reads a name (APFS ignores it: `~/.SSH` is
 * `~/.ssh`; upstream's sandbox takes darwin's file system as case-insensitive,
 * `_caseInsensitiveFs` in `packages/shell-exec/sandbox/hardcoded-policy.ts`),
 * and, as the Windows app's guard reads them
 * (windows/src/main/hands/sensitivePaths.ts): `;`, `|`, `&`, `<`, `>` and `,`
 * start or end a name in a command, and `${HOME}` is the home folder in a path.
 */
public enum SensitivePaths {
  /** Relative to the home folder unless absolute (`SENSITIVE_LOCAL_PATHS`). */
  public static let entries: [String] = [
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    ".config/gcloud",
    ".kube",
    ".docker/config.json",
    ".netrc",
    ".npmrc",
    ".pypirc",
    // Sign-ins kept as plain text: git's (`credential.helper store`), GitHub's command-line tool's, 1Password's.
    ".git-credentials",
    ".config/gh/hosts.yml",
    ".config/op",
    ".simeon",
    // The data folder's earlier name.
    ".caisra",
    ".cursor",
    "Library/Keychains",
    "Library/Cookies",
    "Library/Application Support/Simeon",
    "Library/Application Support/Google/Chrome",
    "Library/Application Support/BraveSoftware",
    "Library/Application Support/Arc",
    "Library/Application Support/Firefox",
    "Library/Application Support/Microsoft Edge",
    "/etc/shadow",
    "/etc/master.passwd",
    "/private/etc/master.passwd",
  ]

  static func normalizeSeparators(_ path: String) -> String {
    path.replacingOccurrences(of: "\\", with: "/").replacingOccurrences(of: "/+", with: "/", options: .regularExpression)
  }

  static func stripTrailingSlash(_ path: String) -> String {
    path.count > 1 && path.hasSuffix("/") ? String(path.dropLast()) : path
  }

  static func absolute(_ entry: String, home: String) -> String {
    entry.hasPrefix("/") ? entry : "\(stripTrailingSlash(normalizeSeparators(home)))/\(entry)"
  }

  /** `~/x`, `$HOME/x`, `${HOME}/x` and `x` (relative to home) all become `<home>/x` (`expandLocalPath`). */
  public static func expand(_ target: String, home: String) -> String {
    var unquoted = target.trimmingCharacters(in: .whitespacesAndNewlines)
    if let first = unquoted.first, first == "\"" || first == "'" { unquoted.removeFirst() }
    if let last = unquoted.last, last == "\"" || last == "'" { unquoted.removeLast() }
    let trimmed = normalizeSeparators(unquoted)
    let base = stripTrailingSlash(normalizeSeparators(home))
    if trimmed == "~" { return base }
    if trimmed.hasPrefix("~/") { return "\(base)/\(trimmed.dropFirst(2))" }
    if trimmed == "$HOME" || trimmed == "${HOME}" { return base }
    if trimmed.hasPrefix("$HOME/") { return "\(base)/\(trimmed.dropFirst(6))" }
    if trimmed.hasPrefix("${HOME}/") { return "\(base)/\(trimmed.dropFirst(8))" }
    if trimmed.hasPrefix("/") { return trimmed }
    return "\(base)/\(trimmed)"
  }

  /** Under `root` or `root` itself, letter case aside (APFS). */
  static func isUnder(_ path: String, _ root: String) -> Bool {
    let normalized = stripTrailingSlash(path).lowercased()
    let root = root.lowercased()
    return normalized == root || normalized.hasPrefix(root + "/")
  }

  static func segments(_ path: String) -> [String] {
    var out: [String] = []
    for segment in path.split(separator: "/", omittingEmptySubsequences: false).map(String.init) {
      if segment.isEmpty || segment == "." { continue }
      if segment == ".." { if !out.isEmpty { out.removeLast() }; continue }
      out.append(segment)
    }
    return out
  }

  /** The entry a path lands in, `..` resolved first (`sensitiveLocalPathEntry`). */
  public static func entry(forPath target: String, home: String) -> String? {
    let resolved = "/" + segments(expand(target, home: home)).joined(separator: "/")
    return entries.first { isUnder(resolved, absolute($0, home: home)) }
  }

  /** What may come just before a path in a command's words, and just after a name (the Windows app's `edge` and `after`, less Windows' own `:`). */
  static let before = "(?:^|[\\s\"'=(,;|&<>\\{])"
  static let after = "(?:[/\\s\"'),;|&<>*?\\}]|$)"

  /** The entry a shell command names as a path (`sensitiveLocalPathInCommand`); the names, the home folder's too, in any letter case. */
  public static func entry(inCommand command: String, home: String) -> String? {
    let text = normalizeSeparators(command)
    let base = stripTrailingSlash(normalizeSeparators(home))
    for entry in entries {
      let escaped = NSRegularExpression.escapedPattern(for: entry)
      let pattern = entry.hasPrefix("/")
        ? "\(before)(?i:\(escaped))\(after)"
        : "\(before)(?:~|\\$HOME|\\$\\{HOME\\}|(?i:\(NSRegularExpression.escapedPattern(for: base))))?/?(?i:\(escaped))\(after)"
      if text.range(of: pattern, options: .regularExpression) != nil { return entry }
    }
    return nil
  }

  /** Why Simeon will not do it, for a run, a read, a write or a listing (`sensitiveLocalPathReason`). */
  public static func refusal(action: String, target: String, home: String) -> String? {
    let found: String?
    switch action {
    case "run-command": found = entry(inCommand: target, home: home)
    case "read-file", "write-file", "list-directory": found = entry(forPath: target, home: home)
    default: found = nil
    }
    guard let found else { return nil }
    let shown = found.hasPrefix("/") ? found : "~/\(found)"
    return "Simeon does not read, write or run anything under \(shown) on this Mac: it holds keys or sign-ins. Ask the person to do that part themselves."
  }
}
