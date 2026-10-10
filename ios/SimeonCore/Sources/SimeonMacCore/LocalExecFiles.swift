import Foundation
import SimeonCore

/**
 * Reading a file for the agent (`packages/local-exec/read.ts`,
 * `packages/utils/encoding.ts`): what kind of file it is from its first
 * bytes, its text decoded and cut to the lines asked for, or its bytes for
 * an image, a PDF or a video.
 */
public enum LocalRead {
  public enum Kind: Equatable, Sendable {
    case text
    case image
    /** Binary, and not one the agent can be given. */
    case binary
  }

  static let videoExtensions: Set<String> = ["mp4", "webm", "mov", "avi", "mkv", "wmv", "flv", "m4v"]

  public static func isVideo(_ path: String) -> Bool { videoExtensions.contains((path as NSString).pathExtension.lowercased()) }
  public static func isPDF(_ path: String) -> Bool { (path as NSString).pathExtension.lowercased() == "pdf" }

  /** From the first 8,192 bytes (`getFormatForBuffer`): UTF-16 and UTF-32 are text; a NUL or one byte in twenty a control character is binary. */
  public static func kind(header: [UInt8]) -> Kind {
    if header.isEmpty { return .text }
    if utf16(header) != nil || utf32(header) != nil { return .text }
    if isText(header) { return .text }
    return isImage(header) ? .image : .binary
  }

  static func isPrintable(_ byte: UInt8) -> Bool { (32...126).contains(byte) || byte == 9 || byte == 10 || byte == 13 }

  static func isText(_ bytes: [UInt8]) -> Bool {
    let length = min(4096, bytes.count)
    if length == 0 { return true }
    let head = bytes.prefix(length)
    if head.contains(0) { return false }
    let control = head.filter { $0 < 32 && $0 != 9 && $0 != 10 && $0 != 13 }.count
    return Double(control) / Double(length) * 100 < 5
  }

  static func isImage(_ b: [UInt8]) -> Bool {
    guard b.count >= 4 else { return false }
    if b.count >= 8 && Array(b[0..<8]) == [137, 80, 78, 71, 13, 10, 26, 10] { return true }
    if b[0] == 255 && b[1] == 216 && b[2] == 255 { return true }
    if b.count >= 12 && Array(b[0..<4]) == Array("RIFF".utf8) && Array(b[8..<12]) == Array("WEBP".utf8) { return true }
    return b.count >= 6 && Array(b[0..<4]) == Array("GIF8".utf8) && (b[4] == 55 || b[4] == 57) && b[5] == 97
  }

  static func utf16(_ b: [UInt8]) -> String.Encoding? {
    guard b.count >= 4 else { return nil }
    if b[0] == 255 && b[1] == 254 && !(b[2] == 0 && b[3] == 0) { return .utf16LittleEndian }
    if b[0] == 254 && b[1] == 255 { return .utf16BigEndian }
    let samples = min(50, b.count / 2)
    var little = 0, big = 0
    var index = 0
    while index < samples * 2 && index + 1 < b.count {
      if b[index + 1] == 0 && isPrintable(b[index]) { little += 1 }
      if b[index] == 0 && isPrintable(b[index + 1]) { big += 1 }
      index += 2
    }
    if Double(little) > Double(samples) * 0.8 { return .utf16LittleEndian }
    if Double(big) > Double(samples) * 0.8 { return .utf16BigEndian }
    return nil
  }

  static func utf32(_ b: [UInt8]) -> String.Encoding? {
    guard b.count >= 8 else { return nil }
    if b[0] == 0 && b[1] == 0 && b[2] == 254 && b[3] == 255 { return .utf32BigEndian }
    if b[0] == 255 && b[1] == 254 && b[2] == 0 && b[3] == 0 { return .utf32LittleEndian }
    let samples = min(50, b.count / 4)
    var big = 0, little = 0
    var index = 0
    while index < samples * 4 && index + 3 < b.count {
      if b[index] == 0 && b[index + 1] == 0 && b[index + 2] == 0 && isPrintable(b[index + 3]) { big += 1 }
      if b[index + 1] == 0 && b[index + 2] == 0 && b[index + 3] == 0 && isPrintable(b[index]) { little += 1 }
      index += 4
    }
    if Double(big) > Double(samples) * 0.8 { return .utf32BigEndian }
    if Double(little) > Double(samples) * 0.8 { return .utf32LittleEndian }
    return nil
  }

  /** CRLF read as LF when one line end in twenty is CRLF (`determineLineEndingsForBuffer`). */
  static func mostlyCRLF(_ b: [UInt8]) -> Bool {
    var crlf = 0, lf = 0
    for index in b.indices where b[index] == 10 {
      if index > 0 && b[index - 1] == 13 { crlf += 1 } else { lf += 1 }
    }
    if crlf == 0 && lf == 0 { return false }
    return Double(crlf) / Double(crlf + lf) * 100 >= 5
  }

  /**
   * A text file's words (`readText`): UTF-16 or UTF-32 by their marks or
   * their zeros, else UTF-8, else Latin-1; a UTF-8 mark dropped. The window's
   * guess at older encodings (jschardet) is not carried over: what is not
   * UTF-8 is read as Latin-1, its own fallback.
   */
  public static func decode(_ data: Data) -> String {
    let bytes = [UInt8](data)
    var text: String
    if let encoding = utf16(bytes) ?? utf32(bytes), let decoded = String(data: data, encoding: encoding) {
      text = decoded
    } else if let utf8 = String(validating: bytes, as: UTF8.self) {
      text = utf8
    } else {
      text = String(data: data, encoding: .isoLatin1) ?? String(decoding: bytes, as: UTF8.self)
    }
    if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
    return mostlyCRLF(bytes) ? text.replacingOccurrences(of: "\r\n", with: "\n") : text
  }

  /** Lines in the text: one more than its newlines, and one for nothing (`countLines`). */
  public static func countLines(_ text: String) -> Int {
    text.isEmpty ? 1 : text.utf16.reduce(1) { $0 + ($1 == 10 ? 1 : 0) }
  }

  /** The lines asked for (`applyRange`): from `offset` (1 first, below 0 from the end), `limit` of them. */
  public static func range(_ content: String, totalLines: Int, offset: Int?, limit: Int?) -> (content: String, applied: Bool) {
    if offset == nil && limit == nil { return (content, false) }
    if content.isEmpty { return (content, false) }
    let from = offset ?? 1
    let count = limit ?? (from < 0 ? abs(from) : totalLines)
    let start = from < 0 ? max(0, totalLines + from) : max(0, from - 1)
    if start >= totalLines { return (content, false) }
    let lines = content.components(separatedBy: "\n")
    let end = min(totalLines, start + count, lines.count)
    guard start < end else { return ("", true) }
    return (lines[start..<end].joined(separator: "\n"), true)
  }

  /** Text past 8 MiB characters is cut, and said to be (`MAX_TEXT_SIZE`). */
  public static func cap(_ content: String) -> (content: String, truncated: Bool) {
    let units = Array(content.utf16)
    guard units.count > LocalExec.textCap else { return (content, false) }
    return (String(decoding: units.prefix(LocalExec.textCap), as: UTF16.self), true)
  }

  /** Why a binary file is not read (`binaryRejection`). */
  public static func binaryRefusal(_ path: String) -> String {
    let ext = (path as NSString).pathExtension.lowercased()
    return ext.isEmpty ? "Binary files without an extension are not supported by the read executor" : "Binary files of type .\(ext) are not supported by the read executor"
  }

  /** `file://` taken off and a leading `~` made the home folder, then relative to the root (`resolvePath`). */
  public static func resolve(_ path: String, root: String, home: String) -> String {
    var target = path
    if target.hasPrefix("file://") { target = String(target.dropFirst(7)) }
    if target == "~" { target = home } else if target.hasPrefix("~/") { target = home + String(target.dropFirst(1)) }
    return LocalToolRules.resolve(target, against: root)
  }
}

/**
 * A command's terminal file, `~/terminals/<id>.txt`, which the box's
 * AwaitExternalShell reads every 250 ms (`background-shell-observability.ts`):
 * the head between `---` lines, rewritten in place, so its padding keeps it
 * one length; the output as it comes; the foot once it ends.
 */
public enum TerminalFile {
  public static let statusWidth = 9
  public static let runningWidth = 9

  /** `"…"` with `\`, `"`, newlines, returns and tabs escaped (`escapeYamlString`). */
  public static func escape(_ value: String) -> String {
    var out = "\""
    for character in value {
      switch character {
      case "\\": out += "\\\\"
      case "\"": out += "\\\""
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      default: out.append(character)
      }
    }
    return out + "\""
  }

  static func pad(_ value: String, _ width: Int) -> String {
    value.count >= width ? value : value + String(repeating: " ", count: width - value.count)
  }

  public static func iso(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    formatter.timeZone = TimeZone(identifier: "UTC")
    return formatter.string(from: date)
  }

  /** The head: `running`, `succeeded`, `failed` or `aborted`. */
  public static func head(pid: Int?, cwd: String, command: String, title: String?, status: String, startedAt: Date, runningForMs: Int) -> String {
    var lines = ["---"]
    if let pid, pid != 0 { lines.append("pid: \(pid)") }
    lines.append("cwd: \(escape(cwd))")
    lines.append("command: \(escape(command))")
    if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { lines.append("title: \(escape(title))") }
    lines.append("status: \(pad(status, statusWidth))")
    lines.append("started_at: \(iso(startedAt))")
    lines.append("running_for_ms: \(pad(String(runningForMs), runningWidth))")
    lines.append("---")
    return lines.joined(separator: "\n") + "\n"
  }

  /** The foot once it ended: its code (or the error), how long, when. */
  public static func foot(exitCode: Int?, error: String? = nil, elapsedMs: Int, endedAt: Date) -> String {
    let first = error.map { "error: \(escape($0))" } ?? "exit_code: \(exitCode.map(String.init) ?? "unknown")"
    return "\n---\n\(first)\nelapsed_ms: \(elapsedMs)\nended_at: \(iso(endedAt))\n---\n"
  }
}

/**
 * The shell the agent's commands run in (`packages/shell-exec/zsh.ts`): one
 * zsh whose state (exports, options, functions, aliases, folder) is carried
 * from each command to the next, read back through descriptor 4 and given
 * through descriptor 3.
 */
public enum ZshShell {
  public static let startMarker = "__SIMEON_ZSH_STATE_START__"
  public static let endMarker = "__SIMEON_ZSH_STATE_END__"
  public static let stateMarker = "__SIMEON_STATE_MARKER__"

  /** Each command's script (`ZshState.execute`); `< /dev/null` when nothing is piped to it. */
  public static func commandScript(pipeStdin: Bool) -> String {
    let core = "builtin eval \"$1\"" + (pipeStdin ? "" : " < /dev/null")
    return "builtin export PATH=\"/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}\"; snap=$(command cat <&3); builtin unsetopt aliases 2>/dev/null; builtin unalias -m '*' 2>/dev/null || true; builtin eval \"$snap\" && { builtin unsetopt nounset 2>/dev/null || true; builtin eval \"${__SIMEON_SANDBOX_ENV_RESTORE:-}\" 2>/dev/null; builtin export PWD=\"$(builtin pwd)\"; builtin setopt aliases 2>/dev/null; \(core); }; COMMAND_EXIT_CODE=$?; dump_zsh_state >&4; builtin exit $COMMAND_EXIT_CODE"
  }

  /** The login shell's first state (`initZshState`). */
  public static var initScript: String { "\(dumpScript) builtin printf '\(stateMarker)\\n'; dump_zsh_state" }

  /** What a command's state pipe or the first login gave back: the folder and the rest; nil unless it is whole and the folder absolute. */
  public static func parseState(_ output: String) -> (cwd: String, state: String)? {
    var text = output
    // The first state comes after the marker printed before it (and whatever the login files print).
    if let marker = text.range(of: stateMarker + "\n") { text = String(text[marker.upperBound...]) }
    let start = startMarker + "\n"
    let end = endMarker + "\n"
    guard text.hasPrefix(start), text.hasSuffix(end) else { return nil }
    let inner = String(text.dropFirst(start.count).dropLast(end.count))
    let newline = inner.firstIndex(of: "\n") ?? inner.endIndex
    let cwd = String(inner[..<newline])
    let rest = newline < inner.endIndex ? String(inner[inner.index(after: newline)...]) : ""
    return cwd.hasPrefix("/") ? (cwd, rest) : nil
  }

  /**
   * The state dump (`dump_zsh_state.ts`). The Electron app's copy closes its
   * here-documents with an earlier product's marker while opening them with
   * Simeon's, so its saved exports, options and functions do not read back;
   * here both ends are Simeon's.
   */
  public static let dumpScript = """
  function dump_zsh_state() {
    emulate -L zsh -o errreturn -o pipefail
    set -u
    _log_timing() { :; }
    builtin zmodload -F zsh/parameter p:parameters p:options p:functions p:aliases p:galiases p:saliases 2>/dev/null || true
    _emit() {
      builtin print -r -- "$1"
    }
    _emit_encoded() {
      local content="$1"
      local var_name="$2"
      if [[ -n "$content" ]]; then
        builtin printf 'simeon_snap_%s=$(command base64 -d <<'"'"'SIMEON_SNAP_EOF_%s'"'"'\\n' "$var_name" "$var_name"
        command base64 <<<"$content" | command tr -d '\\n'
        builtin printf '\\nSIMEON_SNAP_EOF_%s\\n' "$var_name"
        builtin printf ')\\n'
        builtin printf 'eval "$simeon_snap_%s"\\n' "$var_name"
      fi
    }
    _emit "__SIMEON_ZSH_STATE_START__"
    _emit "$PWD"
    _emit "# zsh state dump generated on $(command date +'%Y-%m-%d %H:%M:%S %z')"
    local env_vars
    env_vars=$(builtin typeset -xp 2>/dev/null | command grep -viE '_proxy=|SIMEON_SANDBOX|SUDO_ASKPASS|SIMEON_ASKPASS|SIMEON_CONVERSATION_ID|SIMEON_AGENT_STORE' || true)
    _emit_encoded "$env_vars" "ENV_VARS_B64"
    local zsh_opts
    zsh_opts=$(setopt 2>/dev/null | command grep -vE '^(errreturn|nounset|pipefail)$' | command awk '{printf "builtin setopt %s 2>/dev/null || true\\n", $0}' || true)
    _emit_encoded "$zsh_opts" "ZSH_OPTS_B64"
    local all_functions
    all_functions=$(builtin typeset -f 2>/dev/null || true)
    _emit_encoded "$all_functions" "FUNCTIONS_B64"
    {
      builtin alias -L 2>/dev/null || true
      builtin alias -gL 2>/dev/null || true
      builtin alias -sL 2>/dev/null || true
    }
    _emit "# end of zsh state dump"
    _emit "__SIMEON_ZSH_STATE_END__"
  }
  """

  /**
   * What every command runs with, over this app's own (`SHELL_ENV_OVERRIDES`,
   * `shell-core.ts`): no colours, a plain terminal, `SIMEON_AGENT=1`.
   */
  public static func environment(base: [String: String], root: String) -> [String: String] {
    var env = base
    env["TERM"] = "dumb"
    env["NO_COLOR"] = "1"
    env["FORCE_COLOR"] = "0"
    env["_ZO_DOCTOR"] = "0"
    env["SIMEON_AGENT"] = "1"
    env["SAND_AGENT"] = "1"
    env["AGENT_TRANSCRIPTS"] = root + "/agent-transcripts"
    env["__SIMEON_SANDBOX_ENV_RESTORE"] = "builtin unset SIMEON_CONVERSATION_ID SIMEON_AGENT_STORE_FILES_DIR SIMEON_AGENT_STORE_SHARED_PATHS 2>/dev/null || true"
    return env
  }
}
