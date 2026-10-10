import Foundation
import SimeonCore

/**
 * "Allow once" answers for the agent's hands on this Mac
 * (`host/local-exec/local-tool-approvals.ts`): each one names the request,
 * the action and its target, kept in `~/.simeon/local-tool-approvals.json`
 * (`{"approvals":[{"id","action","target","resourcePath"?}]}`), the file the
 * Electron app keeps, so one Mac answers the same whichever app asked.
 * Everything goes when the person sends a message; a used one is retired
 * in `local-tool-retirements.json` (`{"retiredIds":[…]}`).
 */
public struct LocalToolApproval: Equatable, Sendable {
  /** `run-command`, `send-input`, `read-file`, `list-directory`, `write-file` (`SAND_LOCAL_TOOL_ACTIONS`). */
  public static let actions: Set<String> = ["run-command", "send-input", "read-file", "list-directory", "write-file"]

  public let id: String
  public let action: String
  public let target: String
  public var resourcePath: String?

  public init(id: String, action: String, target: String, resourcePath: String? = nil) {
    self.id = id; self.action = action; self.target = target; self.resourcePath = resourcePath
  }

  /** One row of the file, or nil for anything else (`parseApproval`). */
  public init?(json: JSON) {
    guard let id = json["id"]?.string, !id.isEmpty, let action = json["action"]?.string, Self.actions.contains(action), let target = json["target"]?.string else { return nil }
    self.init(id: id, action: action, target: target, resourcePath: json["resourcePath"]?.string)
  }

  public var json: JSON {
    var fields: [String: JSON] = ["id": .string(id), "action": .string(action), "target": .string(target)]
    if let resourcePath { fields["resourcePath"] = .string(resourcePath) }
    return .object(fields)
  }
}

public final class LocalToolApprovals: @unchecked Sendable {
  public let approvalsURL: URL
  public let retirementsURL: URL
  private let lock = NSLock()

  /** The data folder's files (`~/.simeon`). */
  public init(folder: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".simeon", isDirectory: true)) {
    approvalsURL = folder.appendingPathComponent("local-tool-approvals.json")
    retirementsURL = folder.appendingPathComponent("local-tool-retirements.json")
  }

  /** Every approval in the file, by id; none when it is missing or unreadable. */
  public func all() -> [String: LocalToolApproval] {
    lock.lock(); defer { lock.unlock() }
    return read()
  }

  private func read() -> [String: LocalToolApproval] {
    guard let data = try? Data(contentsOf: approvalsURL), let parsed = try? JSON.parse(data), let rows = parsed["approvals"]?.array else { return [:] }
    var out: [String: LocalToolApproval] = [:]
    for row in rows { if let approval = LocalToolApproval(json: row) { out[approval.id] = approval } }
    return out
  }

  /** "Allow once" recorded before the answer goes to the box (`recordLocalToolApproval`). */
  public func record(_ approval: LocalToolApproval) {
    lock.lock(); defer { lock.unlock() }
    var approvals = read()
    approvals[approval.id] = approval
    persist(approvals)
  }

  /** The person sent a message: every approval goes (`clearLocalToolApprovals`). */
  public func clear() {
    lock.lock(); defer { lock.unlock() }
    try? FileManager.default.removeItem(at: approvalsURL)
  }

  /** The approvals still good: recorded and not used up (`readLiveLocalToolApprovals`). */
  public func live() -> [String: LocalToolApproval] {
    lock.lock(); defer { lock.unlock() }
    var approvals = read()
    for id in readRetired() { approvals[id] = nil }
    return approvals
  }

  /** An approval used once, so it covers nothing more (`retireLocalToolApproval`). */
  public func retire(_ id: String) {
    lock.lock(); defer { lock.unlock() }
    let approvals = read()
    var retired = readRetired()
    if retired.contains(id) { return }
    retired.append(id)
    retired = retired.filter { approvals[$0] != nil }
    if retired.isEmpty { try? FileManager.default.removeItem(at: retirementsURL); return }
    write(.object(["retiredIds": .array(retired.map(JSON.string))]), to: retirementsURL)
  }

  private func readRetired() -> [String] {
    guard let data = try? Data(contentsOf: retirementsURL), let parsed = try? JSON.parse(data) else { return [] }
    return parsed["retiredIds"]?.array?.compactMap(\.string) ?? []
  }

  private func persist(_ approvals: [String: LocalToolApproval]) {
    if approvals.isEmpty { try? FileManager.default.removeItem(at: approvalsURL); return }
    write(.object(["approvals": .array(approvals.values.sorted { $0.id < $1.id }.map(\.json))]), to: approvalsURL)
  }

  /** Written whole to a file beside it, then moved over it, as the Electron app writes. */
  private func write(_ json: JSON, to url: URL) {
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let temp = url.appendingPathExtension("\(ProcessInfo.processInfo.processIdentifier).tmp")
    guard let data = try? json.data() else { return }
    do {
      try data.write(to: temp)
      if FileManager.default.fileExists(atPath: url.path) { _ = try FileManager.default.replaceItemAt(url, withItemAt: temp) } else { try FileManager.default.moveItem(at: temp, to: url) }
    } catch {
      try? FileManager.default.removeItem(at: temp)
    }
  }
}
