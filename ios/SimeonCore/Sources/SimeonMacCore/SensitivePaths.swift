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
 * start or end a name in a command, and `${HOME}` is the home folder in a path;
 * a command's words are read as zsh reads them (escapes and quotes taken out,
 * `/./` and `x/../` worked out), and its names also from the folders it runs
 * in or `cd`s into. No guard on a command's words can be complete (a name
 * built while it runs, a wildcard, `$(…)`): it stops the plain spellings.
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
    // Sign-ins kept as plain text: git's (`credential.helper store`, in either of its places), GitHub's command-line tool's, 1Password's.
    ".git-credentials",
    ".config/git/credentials",
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

  /**
   * A command's words in the versions the matching reads (the Windows app's
   * `commandTexts`): as zsh reads them, each escape taken out (`\s` is `s`,
   * `\ ` a space), and again without quotes, which join words (`.s'sh'`);
   * repeated slashes as one, `/./` and `x/../` worked out.
   */
  static func texts(_ command: String) -> [String] {
    let unescaped = command.replacingOccurrences(of: #"\\(.)"#, with: "$1", options: .regularExpression)
    let unquoted = unescaped.replacingOccurrences(of: #"["']"#, with: "", options: .regularExpression)
    return [unescaped, unquoted].map { workedOut($0.replacingOccurrences(of: "/+", with: "/", options: .regularExpression)) }
  }

  /** `x/..` worked out in a command's words, as often as it comes, and `/./` as `/` (the Windows app's `workedOut`). */
  static func workedOut(_ text: String) -> String {
    var out = text.replacingOccurrences(of: #"/\.(?=/)"#, with: "", options: .regularExpression)
    for _ in 0..<64 {
      guard let step = out.range(of: #"/(?!\.\.(?:/|$))[^/\s"'(),;|&<>]+/\.\.(?=[/\s"'(),;|&<>]|$)"#, options: .regularExpression) else { break }
      out.replaceSubrange(step, with: "")
    }
    return out
  }

  /**
   * The folders a command moves to with `cd`, `chdir` or `pushd`, read from
   * `from` on (the Windows app's `foldersMovedTo`): each one a shell word,
   * its quotes and escapes taken out; `~`, `$HOME` and `${HOME}` the home
   * folder, anything else from the folder before.
   */
  static func foldersMovedTo(_ command: String, from: String, home: String) -> [String] {
    let word = #"(?:"[^"]*"|'[^']*'|\\.|[^\s;|&)}"'\\])+"#
    guard let moves = try? NSRegularExpression(pattern: #"(?:^|[;&|\n{(])\s*(?:cd|chdir|pushd)\s+(?:-[A-Za-z]+\s+)*("# + word + ")") else { return [] }
    var at = from
    var out: [String] = []
    for match in moves.matches(in: command, range: NSRange(command.startIndex..., in: command)) {
      guard let range = Range(match.range(at: 1), in: command) else { continue }
      let target = String(command[range])
        .replacingOccurrences(of: #"\\(.)"#, with: "$1", options: .regularExpression)
        .replacingOccurrences(of: #"["']"#, with: "", options: .regularExpression)
      if target.isEmpty || target.range(of: #"^[-+][0-9]*$"#, options: .regularExpression) != nil { continue }
      let anchored = target.hasPrefix("/") || ["~", "$HOME", "${HOME}"].contains { target == $0 || target.hasPrefix($0 + "/") }
      at = "/" + segments(anchored ? expand(target, home: home) : at + "/" + target).joined(separator: "/")
      out.append(at)
    }
    return out
  }

  /**
   * The entry a shell command names as a path (`sensitiveLocalPathInCommand`);
   * the names, the home folder's too, in any letter case: written whole, from
   * the home folder, or from a folder the command runs in (`folders`: where
   * the shell is, or the one asked for) or moves to (the Windows app's
   * `placeInCommand`).
   */
  public static func entry(inCommand command: String, home: String, folders: [String] = []) -> String? {
    let versions = texts(command)
    let base = stripTrailingSlash(normalizeSeparators(home))
    let starts = folders.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.map { "/" + segments(expand($0, home: home)).joined(separator: "/") }
    let contexts = starts + foldersMovedTo(command, from: starts.first ?? base, home: home)
    for entry in entries {
      let escaped = NSRegularExpression.escapedPattern(for: entry)
      var patterns = [entry.hasPrefix("/")
        ? "\(before)(?i:\(escaped))\(after)"
        : "\(before)(?:~|\\$HOME|\\$\\{HOME\\}|(?i:\(NSRegularExpression.escapedPattern(for: base))))?/?(?i:\(escaped))\(after)"]
      // From each folder it runs in or moves to, the place's rest of the way (`./` before it or not).
      let place = absolute(entry, home: home).lowercased()
      for context in contexts {
        let prefix = context == "/" ? "/" : context.lowercased() + "/"
        guard place.hasPrefix(prefix), place.count > prefix.count else { continue }
        patterns.append("\(before)(?:\\./)?(?i:\(NSRegularExpression.escapedPattern(for: String(place.dropFirst(prefix.count)))))\(after)")
      }
      let pattern = patterns.map { "(?:\($0))" }.joined(separator: "|")
      if versions.contains(where: { $0.range(of: pattern, options: .regularExpression) != nil }) { return entry }
    }
    return nil
  }

  /** Why Simeon will not do it, for a run (`folders`: where it runs), a read, a write or a listing (`sensitiveLocalPathReason`). */
  public static func refusal(action: String, target: String, home: String, folders: [String] = []) -> String? {
    let found: String?
    switch action {
    case "run-command": found = entry(inCommand: target, home: home, folders: folders)
    case "read-file", "write-file", "list-directory": found = entry(forPath: target, home: home)
    default: found = nil
    }
    guard let found else { return nil }
    let shown = found.hasPrefix("/") ? found : "~/\(found)"
    return "Simeon does not read, write or run anything under \(shown) on this Mac: it holds keys or sign-ins. Ask the person to do that part themselves."
  }
}
