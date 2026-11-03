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
 * spellings. Known to pass it: another spelling of the home folder (`~bass/`,
 * `/System/Volumes/Data/Users/…`, `/Volumes/<disk>/Users/…`, `$PWD`); a
 * wildcard (`~/.ss*`); a name built while the command runs (`$(…)`, a
 * variable set by an earlier command); and what is typed into a command
 * already running (send-input).
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

  /** What may come just before a path in a command's words, and just after a name (the Windows app's `edge` and `after`, less Windows' own `:`; zsh's backtick, and a glob qualifier's `(` after a name: `~/.netrc(.)`). */
  static let before = "(?:^|[\\s\"'=(,;|&<>\\{`])"
  static let after = "(?:[/\\s\"'),;|&<>*?\\}(`]|$)"

  /**
   * A command's words in the versions the matching reads (the Windows app's
   * `commandTexts`): as zsh reads them, each escape taken out (`\s` is `s`,
   * `\ ` a space), and again without quotes, which join words (`.s'sh'`);
   * `~`, `$HOME` and `${HOME}` written as the home folder, repeated slashes
   * as one, `/./` and `x/../` worked out (`~/../bass/.ssh`, `Documents/../.ssh`).
   */
  static func texts(_ command: String, home: String) -> [String] {
    let unescaped = command.replacingOccurrences(of: #"\\(.)"#, with: "$1", options: .regularExpression)
    let unquoted = unescaped.replacingOccurrences(of: #"["']"#, with: "", options: .regularExpression)
    let base = NSRegularExpression.escapedTemplate(for: stripTrailingSlash(normalizeSeparators(home)))
    return [unescaped, unquoted].map { text in
      let homed = text
        .replacingOccurrences(of: #"(^|[\s"'=(,;|&<>{])~(?=$|[/\s"'),;|&<>}])"#, with: "$1" + base, options: .regularExpression)
        .replacingOccurrences(of: #"\$\{HOME\}|\$HOME(?![A-Za-z0-9_])"#, with: base, options: .regularExpression)
      return workedOut(homed.replacingOccurrences(of: "/+", with: "/", options: .regularExpression))
    }
  }

  /** `x/..` worked out in a command's words, as often as it comes, also at a word's start (`x/../y` is `y`), and `/./` as `/` (the Windows app's `workedOut`). */
  static func workedOut(_ text: String) -> String {
    var out = text.replacingOccurrences(of: #"/\.(?=/)"#, with: "", options: .regularExpression)
    let inside = try? NSRegularExpression(pattern: #"/(?!\.\.(?:/|$))[^/\s"'(),;|&<>]+/\.\.(?=[/\s"'(),;|&<>]|$)"#)
    // At a word's start, `.` is no folder to come back out of (`./../x` is `../x`).
    let first = try? NSRegularExpression(pattern: #"(^|[\s"'=(,;|&<>{`])(?!\.{1,2}(?:/|$))[^/\s"'(),;|&<>`]+/\.\./"#)
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

  /** A `cd` (or `chdir`, `pushd`) a command makes: where to, where its command word starts, and, for `cd X &&`, where what follows the `&&` starts (UTF-16 offsets). */
  struct Move {
    let folder: String
    let start: Int
    let and: Int?
  }

  /** Which of the command's characters (UTF-16) are inside zsh's quotes: `'…'`, or `"…"` where a `\` escapes the next one, as outside. */
  static func quotedMask(_ command: NSString) -> [Bool] {
    var mask = [Bool](repeating: false, count: command.length)
    var quote: unichar?
    var escaped = false
    for index in 0..<command.length {
      let unit = command.character(at: index)
      mask[index] = quote != nil
      if escaped { escaped = false; continue }
      if unit == 92, quote != 39 { escaped = true; continue }
      if let open = quote { if unit == open { quote = nil } } else if unit == 34 || unit == 39 { quote = unit; mask[index] = true }
    }
    return mask
  }

  /**
   * The folders a command moves to with `cd`, `chdir` or `pushd`
   * (`builtin cd`, `command cd`, `if cd …; then`, `cd -- …` and a `cd` after
   * a quote or a backtick too), read from `from` on (the Windows app's
   * `foldersMovedTo`): each one a shell word, its quotes and escapes taken
   * out; `~`, `$HOME` and `${HOME}` the home folder, anything else from the
   * folder before. A `cd X &&` outside quotes says where its `&&` ends.
   */
  static func moves(_ command: String, from: String, home: String) -> [Move] {
    let word = #"(?:"[^"]*"|'[^']*'|\$\{[^}]*\}|\\.|[^\s;|&)}"'\\])+"#
    let verb = #"(?:^|[;&|\n{(`"'])\s*(?:(?:if|then|else|elif|do|while|until|!|builtin|command)\s+)*(cd|chdir|pushd)\s+(?:(?:-[A-Za-z]+|--)\s+)*("#
    guard let pattern = try? NSRegularExpression(pattern: verb + word + ")") else { return [] }
    let text = command as NSString
    let quoted = quotedMask(text)
    var at = from
    var out: [Move] = []
    for match in pattern.matches(in: command, range: NSRange(location: 0, length: text.length)) {
      let target = text.substring(with: match.range(at: 2))
        .replacingOccurrences(of: #"\\(.)"#, with: "$1", options: .regularExpression)
        .replacingOccurrences(of: #"["']"#, with: "", options: .regularExpression)
      if target.isEmpty || target.range(of: #"^[-+][0-9]*$"#, options: .regularExpression) != nil { continue }
      let anchored = target.hasPrefix("/") || ["~", "$HOME", "${HOME}"].contains { target == $0 || target.hasPrefix($0 + "/") }
      at = "/" + segments(anchored ? expand(target, home: home) : at + "/" + target).joined(separator: "/")
      // `&&` straight after it, both outside quotes: what follows runs only once the shell is there.
      let verbStart = match.range(at: 1).location
      var index = match.range(at: 2).location + match.range(at: 2).length
      while index < text.length, [32, 9].contains(text.character(at: index)) { index += 1 }
      let and = index + 1 < text.length && text.character(at: index) == 38 && text.character(at: index + 1) == 38 && !quoted[verbStart] && !quoted[index]
      out.append(Move(folder: at, start: verbStart, and: and ? index + 2 : nil))
    }
    return out
  }

  /**
   * The command in pieces, each with the folders its names are read from:
   * the folders it runs in (`starts`) and every one it moves to, as a `cd`
   * that fails leaves the shell where it was (`cd /x; cat y` is read from
   * both); but after `cd X &&`, until its list ends (`;`, `||`, `&`, a new
   * line, `)`, `}` or a backtick), only `X`, where `&&` makes sure the shell
   * is (`cd ~/project && cat config.json` in `~/.docker`).
   */
  static func pieces(_ command: String, starts: [String], home: String) -> [(text: String, folders: [String])] {
    let text = command as NSString
    let made = moves(command, from: starts.first ?? stripTrailingSlash(normalizeSeparators(home)), home: home)
    let everywhere = starts + made.map(\.folder)
    guard let ends = try? NSRegularExpression(pattern: #";|\n|\)|\}|`|\|\||(?<!&)&(?!&)"#) else { return [(command, everywhere)] }
    var regions: [(start: Int, end: Int, folder: String)] = []
    for move in made {
      guard let start = move.and else { continue }
      let end = ends.firstMatch(in: command, range: NSRange(location: start, length: text.length - start))?.range.location ?? text.length
      regions.append((start, end, move.folder))
    }
    let cuts = Set([0, text.length] + regions.flatMap { [$0.start, $0.end] }).sorted()
    return zip(cuts, cuts.dropFirst()).compactMap { from, to in
      guard to > from else { return nil }
      let folders = regions.last { $0.start <= from && from < $0.end }.map { [$0.folder] } ?? everywhere
      return (text.substring(with: NSRange(location: from, length: to - from)), folders)
    }
  }

  /** Words before a command's own name: zsh's keywords and the commands that run the next one. */
  static let leadingWords: Set<String> = ["if", "then", "else", "elif", "do", "while", "until", "!", "time", "nohup", "sudo", "exec", "command", "builtin", "env", "noglob", "nice"]

  /** Commands whose words are names, messages or packages, not this folder's files (`brew install --cask arc`, `git commit -m "no op"`). */
  static let namingCommands: Set<String> = ["echo", "print", "printf", "brew", "git", "npm", "npx", "pnpm", "yarn", "pip", "pip3", "gh", "op"]

  /**
   * Whether a name written bare (no `/`, as `hosts.yml` from `~/.config/gh`)
   * at the end of `prefix` is a path: after a redirection always; else only
   * as a word of a command, not the command itself (zsh never looks for a
   * command in the folder by a bare name), and not of one whose words are
   * names (`namingCommands`).
   */
  static func bareNameIsPath(after prefix: String) -> Bool {
    let trimmed = prefix.trimmingCharacters(in: .whitespaces)
    if trimmed.hasSuffix("<") || trimmed.hasSuffix(">") { return true }
    let start = prefix.lastIndex { ";&|\n({`".contains($0) }.map { prefix.index(after: $0) } ?? prefix.startIndex
    var words = prefix[start...].split(whereSeparator: \.isWhitespace).map(String.init)
    while let first = words.first, leadingWords.contains(first) || first.range(of: #"^[A-Za-z_][A-Za-z0-9_]*="#, options: .regularExpression) != nil {
      words.removeFirst()
    }
    guard let command = words.first?.replacingOccurrences(of: #"["']"#, with: "", options: .regularExpression) else { return false }
    return !namingCommands.contains((command as NSString).lastPathComponent.lowercased())
  }

  /**
   * The entry a shell command names as a path (`sensitiveLocalPathInCommand`);
   * the names, the home folder's too, in any letter case: written whole, from
   * the home folder, or from a folder the command runs in (`folders`: where
   * the shell is, or the one asked for) or moves to (`pieces`), or from a
   * folder above one of those (`../`, any number of them once at `/`), as the
   * Windows app's `placeInCommand`. A name written bare from one of those
   * folders counts as the Mac's `bareNameIsPath` says.
   */
  public static func entry(inCommand command: String, home: String, folders: [String] = []) -> String? {
    let base = stripTrailingSlash(normalizeSeparators(home))
    let starts = folders.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }.map { "/" + segments(expand($0, home: home)).joined(separator: "/") }
    let split = pieces(command, starts: starts, home: home).map { (versions: texts($0.text, home: home), folders: $0.folders) }
    for entry in entries {
      let escaped = NSRegularExpression.escapedPattern(for: entry)
      let whole = entry.hasPrefix("/")
        ? "\(before)(?i:\(escaped))\(after)"
        : "\(before)(?:~|\\$HOME|\\$\\{HOME\\}|(?i:\(NSRegularExpression.escapedPattern(for: base))))?/?(?i:\(escaped))\(after)"
      let place = absolute(entry, home: home).lowercased()
      for piece in split {
        var patterns = [whole]
        var bare: [String] = []
        // From each folder it runs in or moves to, the place's rest of the way (`./` before it or not), and from each folder
        // above that one, `../` as many times as it is above (`cd ~/Documents; cat ../.ssh/id_rsa`), any number from `/`.
        for context in piece.folders {
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
        if piece.versions.contains(where: { $0.range(of: pattern, options: .regularExpression) != nil }) { return entry }
        if !bare.isEmpty, let named = try? NSRegularExpression(pattern: "(?:^|[\\s\"'=(,;|&<>\\{`])(\(bare.joined(separator: "|")))(?=[/\\s\"'),;|&<>*?\\}(`]|$)") {
          for version in piece.versions {
            let text = version as NSString
            for match in named.matches(in: version, range: NSRange(location: 0, length: text.length)) where bareNameIsPath(after: text.substring(to: match.range(at: 1).location)) {
              return entry
            }
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
