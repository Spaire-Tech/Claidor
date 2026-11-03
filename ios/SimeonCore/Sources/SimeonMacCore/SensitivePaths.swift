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
 * in or `cd`s into, and from the folders above them (`../`).
 *
 * No guard on a command's words can be complete: it stops the plain
 * spellings, and when in doubt it refuses. Known to pass it: another
 * spelling of the home folder (`~bass/`, `/System/Volumes/Data/Users/…`,
 * `/Volumes/<disk>/Users/…`, `$PWD`); the folder before (`~-`, `$OLDPWD`,
 * `${OLDPWD}`: read as the shell's folder, which is what they are after a
 * first `cd`, not what an earlier command left); a wildcard (`~/.ss*`); a
 * name built while the command runs (`$(…)`, a variable set by an earlier
 * command); a folder change the words don't show (an alias or function
 * defined earlier, `AUTO_CD`, `CDPATH`, a link made earlier); and what is
 * typed into a command already running (send-input).
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

  /** What may come just before a path in a command's words, and just after a name (the Windows app's `edge` and `after`, less Windows' own `:`; zsh's backtick, an `@` before a file curl sends, and a glob qualifier's `(` after a name: `~/.netrc(.)`). */
  static let before = "(?:^|[\\s\"'=(,;|&<>\\{`@])"
  static let after = "(?:[/\\s\"'),;|&<>*?\\}(`]|$)"

  /**
   * A command's words in the versions the matching reads (the Windows app's
   * `commandTexts`): as zsh reads them, each escape taken out (`\s` is `s`,
   * `\ ` a space), and again without quotes, which join words (`.s'sh'`);
   * `~`, `$HOME` and `${HOME}` written as the home folder, and `~-`,
   * `$OLDPWD` and `${OLDPWD}` as the shell's folder (`carried`), repeated
   * slashes as one, `/./` and `x/../` worked out (`~/../bass/.ssh`,
   * `Documents/../.ssh`).
   */
  static func texts(_ command: String, home: String, carried: String?) -> [String] {
    let unescaped = command.replacingOccurrences(of: #"\\(.)"#, with: "$1", options: .regularExpression)
    let unquoted = unescaped.replacingOccurrences(of: #"["']"#, with: "", options: .regularExpression)
    let base = NSRegularExpression.escapedTemplate(for: stripTrailingSlash(normalizeSeparators(home)))
    return [unescaped, unquoted].map { text in
      var named = text
      if let carried {
        let folder = NSRegularExpression.escapedTemplate(for: carried)
        named = named
          .replacingOccurrences(of: #"(^|[\s"'=(,;|&<>{@])~-(?=$|[/\s"'),;|&<>}])"#, with: "$1" + folder, options: .regularExpression)
          .replacingOccurrences(of: #"\$\{OLDPWD\}|\$OLDPWD(?![A-Za-z0-9_])"#, with: folder, options: .regularExpression)
      }
      named = named
        .replacingOccurrences(of: #"(^|[\s"'=(,;|&<>{@])~(?=$|[/\s"'),;|&<>}])"#, with: "$1" + base, options: .regularExpression)
        .replacingOccurrences(of: #"\$\{HOME\}|\$HOME(?![A-Za-z0-9_])"#, with: base, options: .regularExpression)
      return workedOut(named.replacingOccurrences(of: "/+", with: "/", options: .regularExpression))
    }
  }

  /** `x/..` worked out in a command's words, as often as it comes, also at a word's start (`x/../y` is `y`), and `/./` as `/` (the Windows app's `workedOut`). */
  static func workedOut(_ text: String) -> String {
    var out = text.replacingOccurrences(of: #"/\.(?=/)"#, with: "", options: .regularExpression)
    let inside = try? NSRegularExpression(pattern: #"/(?!\.\.(?:/|$))[^/\s"'(),;|&<>]+/\.\.(?=[/\s"'(),;|&<>]|$)"#)
    // At a word's start, `.` is no folder to come back out of (`./../x` is `../x`).
    let first = try? NSRegularExpression(pattern: #"(^|[\s"'=(,;|&<>{`@])(?!\.{1,2}(?:/|$))[^/\s"'(),;|&<>`]+/\.\./"#)
    for _ in 0..<64 {
      let whole = NSRange(out.startIndex..., in: out)
      if let step = inside?.firstMatch(in: out, range: whole), let range = Range(step.range, in: out) {
        out.replaceSubrange(range, with: "")
      } else if let step = first?.firstMatch(in: out, range: whole), let range = Range(step.range, in: out), let edge = Range(step.range(at: 1), in: out) {
        out.replaceSubrange(range, with: String(out[edge]))
      } else {
        break
      }
    }
    return out
  }

  /**
   * The folders a command moves to with `cd`, `chdir` or `pushd`
   * (`builtin cd`, `command cd`, `if cd …; then`, `cd -- …` and a `cd` after
   * a quote or a backtick too), read from `from` on (the Windows app's
   * `foldersMovedTo`): each one a shell word, its quotes and escapes taken
   * out; `~`, `$HOME` and `${HOME}` the home folder, anything else from the
   * folder before.
   */
  static func foldersMovedTo(_ command: String, from: String, home: String) -> [String] {
    let word = #"(?:"[^"]*"|'[^']*'|\$\{[^}]*\}|\\.|[^\s;|&)}"'\\])+"#
    let verb = #"(?:^|[;&|\n{(`"'])\s*(?:(?:if|then|else|elif|do|while|until|!|builtin|command)\s+)*(?:cd|chdir|pushd)\s+(?:(?:-[A-Za-z]+|--)\s+)*("#
    guard let moves = try? NSRegularExpression(pattern: verb + word + ")") else { return [] }
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
   * Where a command goes before anything else, when nothing it then does can
   * be where the shell was: its first step is `cd X &&` or `pushd X &&`, `X`
   * written plainly (no `$`, quote, escape, wildcard, `-`, `±N`, `~-`, `~+`
   * or `~name`); no other `cd`, `chdir`, `pushd` or `popd` anywhere, quoted
   * or not; no `~-`, `~+`, `OLDPWD`, `eval` or `-c`; and nothing runs after
   * a failed `cd` (no `;`, `||`, `&` to the background or new line outside
   * quotes). Then the folders it was in are not read from: only `X` (and
   * those above it), as `cd ~/project && npm test 2>&1 | grep x && cat
   * config.json` from `~/.docker`. Else nil, and every folder is.
   */
  static func onlyFolder(_ command: String, from: String, home: String) -> String? {
    guard let first = command.range(of: #"^\s*(?:cd|pushd)\s+[A-Za-z0-9._/+@%,:=~-]+\s*&&"#, options: .regularExpression) else { return nil }
    let target = String(command[first]).replacingOccurrences(of: #"^\s*(?:cd|pushd)\s+|\s*&&$"#, with: "", options: .regularExpression)
    guard target.range(of: #"^(?:[-+][0-9]*|~[-+].*|~[^/].*)$"#, options: .regularExpression) == nil else { return nil }
    let moves = (try? NSRegularExpression(pattern: #"\b(?:cd|chdir|pushd|popd)\b"#, options: .caseInsensitive))?.numberOfMatches(in: command, range: NSRange(command.startIndex..., in: command)) ?? 0
    guard moves == 1, !["~-", "~+", "OLDPWD", "eval", "-c"].contains(where: { command.range(of: $0, options: .caseInsensitive) != nil }) else { return nil }
    // Quotes are taken out only when they are plain (no escape, `$'…'`, `$(…)` or backtick that could nest them, and balanced).
    var outside = command
    if command.range(of: #"[\\`]|\$'|\$\("#, options: .regularExpression) == nil {
      let stripped = command.replacingOccurrences(of: #"'[^']*'|"[^"]*""#, with: "''", options: .regularExpression)
      if !stripped.replacingOccurrences(of: "''", with: "").contains(where: { $0 == "\"" || $0 == "'" }) { outside = stripped }
    }
    guard outside.range(of: #";|\n|\|\||(?<![&>|])&(?![&>])"#, options: .regularExpression) == nil else { return nil }
    let anchored = target.hasPrefix("/") || target == "~" || target.hasPrefix("~/")
    return "/" + segments(anchored ? expand(target, home: home) : from + "/" + target).joined(separator: "/")
  }

  /** Words before a command's own name: zsh's keywords and the commands that run the next one. */
  static let leadingWords: Set<String> = ["if", "then", "else", "elif", "do", "while", "until", "!", "time", "nohup", "sudo", "exec", "command", "builtin", "env", "noglob", "nice"]

  /**
   * Whether a name written bare (no `/` in it, as `hosts.yml` from
   * `~/.config/gh`) is a path where it is, `prefix` before it and `next`
   * after it: always but as a command's own name (zsh never looks for a
   * command in the folder by a bare name), and that too when a `/` follows
   * (`gcloud/x`). A name glued to what comes before (`f=hosts.yml`,
   * `--file=hosts.yml`, `@hosts.yml`, `<hosts.yml`, `"hosts.yml"`) is one.
   */
  static func bareNameIsPath(after prefix: String, next: Character?) -> Bool {
    if next == "/" { return true }
    guard let edge = prefix.last, edge.isWhitespace || ";&|\n`".contains(edge) || (edge == "(" && prefix.dropLast().last != "=") else { return prefix.isEmpty ? false : true }
    let start = prefix.lastIndex { ";&|\n({`".contains($0) }.map { prefix.index(after: $0) } ?? prefix.startIndex
    var words = prefix[start...].split(whereSeparator: \.isWhitespace).map(String.init)
    while let word = words.first, leadingWords.contains(word) || word.range(of: #"^[A-Za-z_][A-Za-z0-9_]*="#, options: .regularExpression) != nil {
      words.removeFirst()
    }
    return !words.isEmpty
  }

  /**
   * The entry a shell command names as a path (`sensitiveLocalPathInCommand`);
   * the names, the home folder's too, in any letter case: written whole, from
   * the home folder, or from a folder the command runs in (`folders`: where
   * the shell is, or the one asked for) or moves to, or from a folder above
   * one of those (`../`, any number of them once at `/`), as the Windows
   * app's `placeInCommand`; the folders it runs in left out only as
   * `onlyFolder` says. A name written bare from one of those folders counts
   * as `bareNameIsPath` says.
   */
  public static func entry(inCommand command: String, home: String, folders: [String] = []) -> String? {
    let base = stripTrailingSlash(normalizeSeparators(home))
    let starts = folders.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.map { "/" + segments(expand($0, home: home)).joined(separator: "/") }
    let from = starts.first ?? base
    let contexts = onlyFolder(command, from: from, home: home).map { [$0] } ?? starts + foldersMovedTo(command, from: from, home: home)
    let versions = texts(command, home: home, carried: starts.first)
    for entry in entries {
      let escaped = NSRegularExpression.escapedPattern(for: entry)
      var patterns = [entry.hasPrefix("/")
        ? "\(before)(?i:\(escaped))\(after)"
        : "\(before)(?:~|\\$HOME|\\$\\{HOME\\}|(?i:\(NSRegularExpression.escapedPattern(for: base))))?/?(?i:\(escaped))\(after)"]
      var bare: [String] = []
      // From each folder it runs in or moves to, the place's rest of the way (`./` before it or not), and from each folder
      // above that one, `../` as many times as it is above (`cd ~/Documents; cat ../.ssh/id_rsa`), any number from `/`.
      let place = absolute(entry, home: home).lowercased()
      for context in contexts {
        let names = segments(context.lowercased())
        for up in 0...names.count {
          let prefix = "/" + names.dropLast(up).map { $0 + "/" }.joined()
          guard place.hasPrefix(prefix), place.count > prefix.count else { continue }
          let rest = String(place.dropFirst(prefix.count))
          let name = "(?i:\(NSRegularExpression.escapedPattern(for: rest)))"
          if up == 0 && !rest.contains("/") {
            patterns.append("\(before)(?:\\./+)+\(name)\(after)")
            bare.append(name)
            continue
          }
          let step = "\\.\\./+(?:\\./+)*"
          let climb = up == names.count ? "(?:\(step)){\(up),}" : String(repeating: step, count: up)
          patterns.append("\(before)(?:\\./+)*\(climb)\(name)\(after)")
        }
      }
      let pattern = patterns.map { "(?:\($0))" }.joined(separator: "|")
      if versions.contains(where: { $0.range(of: pattern, options: .regularExpression) != nil }) { return entry }
      if !bare.isEmpty, let named = try? NSRegularExpression(pattern: "(?:^|[\\s\"'=(,;|&<>\\{`@])(\(bare.joined(separator: "|")))(?=[/\\s\"'),;|&<>*?\\}(`]|$)") {
        for version in versions {
          let text = version as NSString
          for match in named.matches(in: version, range: NSRange(location: 0, length: text.length)) {
            let end = match.range(at: 1).location + match.range(at: 1).length
            let next = end < text.length ? Character(text.substring(with: NSRange(location: end, length: 1))) : nil
            if bareNameIsPath(after: text.substring(to: match.range(at: 1).location), next: next) { return entry }
          }
        }
      }
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
