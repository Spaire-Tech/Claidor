import Foundation
import SimeonCore

/**
 * The agent's hands on this Mac, the rules (the Electron app's local-exec
 * daemon: `shared/local-exec-gateway.ts`, `shared/local-tool-permission-machinery.ts`,
 * `host/local-exec/local-exec-machine.ts`): the limits, the words, what a
 * request is about, and whether it may run.
 */
public enum LocalExec {
  /** One file read or moved: 100 MiB (`DEFAULT_MAX_LOCAL_EXEC_FILE_BYTES`). */
  public static let maxFileBytes = 100 * 1024 * 1024
  /** The longest frame an upload may come in, in characters (`maxLocalExecUploadFrameBytes`). */
  public static let uploadFrameCap = Int((Double(maxFileBytes) * 4 / 3).rounded(.up)) + 64 * 1024
  /** Each command's output, per stream, then cut without a word (`MAX_SHELL_OUTPUT_BYTES`). */
  public static let streamCap = 1_048_576
  /** A read's text, in characters (`MAX_TEXT_SIZE`). */
  public static let textCap = 8 * 1024 * 1024
  public static let execHeartbeatSeconds: Double = 3
  public static let pingSeconds: Double = 10
  public static let stallSeconds: Double = 35
  public static let dataPostSeconds: Double = 120
  public static let controlPostSeconds: Double = 10

  /** `(bytes / MiB).toFixed(1)` and " MiB" (`describeLocalExecBytes`). */
  public static func describe(bytes: Int) -> String {
    String(format: "%.1f MiB", Double(bytes) / (1024 * 1024))
  }

  public static func fileTooLarge(_ bytes: Int) -> String {
    "File is \(describe(bytes: bytes)), which exceeds Simeon's \(describe(bytes: maxFileBytes)) limit for reading or transferring a single file over local-exec. Read a slice with offset/limit, or use a shell command (grep, head, tail) to extract just what you need."
  }

  public static let uploadTooLarge = "The upload exceeds Simeon's \(describe(bytes: maxFileBytes)) limit for transferring a single file over local-exec and was refused before being read into memory. Transfer a smaller file, or split it into parts."

  public static let disabled = "Local tools are turned off. The user has set local tool access to \"Never\", so ExternalShell, ExternalRead, AwaitExternalShell, CopyToBox, and CopyFromBox cannot run on their computer. Do not retry them while this setting remains \"Never\". Use your own computer instead (Shell, Read, AwaitShell), or ask the user to change the setting in the local tool access setting in Settings. If they change it away from \"Never\", you may try again."

  public static let unapproved = "That action was not approved on the user's computer, so nothing ran. Ask the user to approve it (or to set local tool access to \"Always allow\" in Settings), and use your own computer (Shell, Read, AwaitShell) in the meantime."

  public static func noHandler(_ kind: String) -> String { "No handler found for server message of type \(kind)" }

  public static func outsideRoot(_ path: String) -> String { "Path is outside the allowed local-exec root and was refused: \(path)" }
  public static func throughSymlink(_ path: String) -> String { "Path resolves through a symlink to outside the allowed local-exec root and was refused: \(path)" }

  public static func missingWorkingDirectory(requested: String, root: String) -> String {
    "working directory \(requested) does not exist on this machine; running in \(root) instead\n"
  }

  /** The wait before dialling again: 1, 2, 4, 8, then 10 s (`computeBackoffMs`). */
  public static func backoffSeconds(attempt: Int) -> Double {
    min(10, pow(2, Double(max(attempt, 1) - 1)))
  }

  /** How long a command may hold the stream before it goes to the background (`resolveShellTimeoutMs`). */
  public static func blockMs(timeout: Int, isBackground: Bool, timeoutBehaviorBackground: Bool, hardTimeout: Int?) -> Int {
    if timeout != 0 { return timeout }
    if isBackground || timeoutBehaviorBackground || hardTimeout != nil { return 0 }
    return 30_000
  }
}

/** What a request asks of this Mac (`SandLocalToolRequest`). */
public struct LocalToolRequest: Equatable, Sendable {
  public var action: String
  public var target: String
  public var resourcePath: String?
  public var attachToResourcePath: String?
  public var outlivesScope = false

  public init(action: String, target: String, resourcePath: String? = nil, attachToResourcePath: String? = nil, outlivesScope: Bool = false) {
    self.action = action; self.target = target; self.resourcePath = resourcePath; self.attachToResourcePath = attachToResourcePath; self.outlivesScope = outlivesScope
  }
}

public enum LocalToolRules {
  static func trimTrailingSlashes(_ path: String) -> String {
    var out = path.replacingOccurrences(of: "\\", with: "/")
    while out.hasSuffix("/") { out.removeLast() }
    return out
  }

  /** A command's terminal file, `<terminals>/<id>.txt`, directly in the folder. */
  public static func isTerminalFile(_ path: String, terminalsFolder: String) -> Bool {
    let folder = trimTrailingSlashes(terminalsFolder)
    guard !folder.isEmpty else { return false }
    let normalized = trimTrailingSlashes(path)
    guard normalized.hasPrefix(folder + "/") else { return false }
    let rest = normalized.dropFirst(folder.count + 1)
    return !rest.isEmpty && !rest.contains("/") && rest.hasSuffix(".txt")
  }

  /** What the request is about, by its kind (`describeLocalExec`); nil for anything else. */
  public static func describe(kind: String, value: JSON, terminalsFolder: String) -> LocalToolRequest? {
    switch kind {
    case "shellStreamArgs", "backgroundShellSpawnArgs":
      return LocalToolRequest(action: "run-command", target: value["command"]?.string ?? "", resourcePath: terminalsFolder, outlivesScope: kind == "backgroundShellSpawnArgs" || value["isBackground"]?.bool == true)
    case "forceBackgroundShellArgs":
      return LocalToolRequest(action: "run-command", target: "a command already running", attachToResourcePath: terminalsFolder, outlivesScope: true)
    case "writeShellStdinArgs":
      return LocalToolRequest(action: "send-input", target: value["chars"]?.string ?? "")
    case "readArgs", "redactedReadArgs":
      let path = value["path"]?.string ?? ""
      return LocalToolRequest(action: "read-file", target: path, attachToResourcePath: isTerminalFile(path, terminalsFolder: terminalsFolder) ? terminalsFolder : nil)
    case "lsArgs":
      return LocalToolRequest(action: "list-directory", target: value["path"]?.string ?? "")
    default:
      return nil
    }
  }

  static func normalizeResource(_ path: String?) -> String? {
    guard let path, !path.isEmpty else { return nil }
    return path.replacingOccurrences(of: "\\", with: "/")
  }

  /** The same action on the same target, or the folder the approval owns (`localToolApprovalCovers`). */
  public static func covers(action: String, target: String, resourcePath: String?, request: LocalToolRequest) -> Bool {
    if action == request.action && target == request.target { return true }
    guard let owned = normalizeResource(resourcePath) else { return false }
    return owned == normalizeResource(request.attachToResourcePath)
  }

  /**
   * Why this Mac will not do it, or nil to go ahead (the daemon's
   * `isLocalUseBlocked`): a place that holds keys first, whatever the
   * setting; then Never; Always; and under Ask, only what the person allowed
   * once, exactly that (a command's approval also covers its terminal file).
   */
  public static func refusal(request: LocalToolRequest?, approvalId: String?, permission: LocalToolPermission, live: [String: LocalToolApproval], terminalsFolder: String, home: String) -> String? {
    if let request, let sensitive = SensitivePaths.refusal(action: request.action, target: request.target, home: home) { return sensitive }
    switch permission {
    case .never: return LocalExec.disabled
    case .always: return nil
    case .ask: break
    }
    guard let approvalId, !approvalId.isEmpty, let request, let approval = live[approvalId] else { return LocalExec.unapproved }
    let owned = approval.action == "run-command" ? terminalsFolder : approval.resourcePath
    return covers(action: approval.action, target: approval.target, resourcePath: owned, request: request) ? nil : LocalExec.unapproved
  }

  // MARK: Where things may be (`local-exec-machine.ts`)

  /** `path.resolve`: absolute, `.` and `..` worked out, no trailing slash. */
  public static func resolve(_ path: String, against root: String) -> String {
    let joined = path.hasPrefix("/") ? path : root + "/" + path
    return "/" + SensitivePaths.segments(joined).joined(separator: "/")
  }

  /** Outside the root (`escapesRoot`: Node's `relative` starting with "..", which also refuses a child named "..x"). */
  public static func escapesRoot(_ base: String, _ target: String) -> Bool {
    let from = SensitivePaths.segments(base)
    let to = SensitivePaths.segments(target)
    var shared = 0
    while shared < from.count && shared < to.count && from[shared] == to[shared] { shared += 1 }
    if shared == from.count && shared == to.count { return false }
    if shared < from.count { return true }
    return to[shared].hasPrefix("..")
  }

  /** The folder a command runs in: none given is the shell's own; one that is not there is the root, said first on stderr. */
  public static func workingDirectory(requested: String, root: String, isDirectory: (String) -> Bool) -> (path: String, notice: String?) {
    let trimmed = requested.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return ("", nil) }
    let resolved = resolve(trimmed, against: root)
    if isDirectory(resolved) { return (resolved, nil) }
    return (root, LocalExec.missingWorkingDirectory(requested: trimmed, root: root))
  }
}
