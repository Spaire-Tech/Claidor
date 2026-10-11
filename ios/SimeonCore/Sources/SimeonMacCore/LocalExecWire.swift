import Foundation
import SimeonCore

/**
 * What the box and this Mac say to each other for the agent's hands
 * (`host/local-exec/local-exec-provider.ts`): the box's requests come as one
 * JSON per server-sent event on `GET {gateway}/local-exec/requests`; the
 * Mac's answers go in batches to `POST {gateway}/local-exec/responses`. A
 * command's own messages are the agent protocol's, in protobuf's JSON
 * (lowerCamelCase names, defaults left out, enums by name).
 */
public enum LocalExecWire {
  public static let requestsPath = "/local-exec/requests"
  public static let responsesPath = "/local-exec/responses"

  /** One request from the box. */
  public struct Request: Equatable, Sendable {
    /** `welcome`, `exec`, `upload`, `download`, `cancel`, `retire-approval`. */
    public let kind: String
    public let requestId: String
    public let raw: JSON

    public init?(json: JSON) {
      guard let kind = json["kind"]?.string else { return nil }
      self.kind = kind
      requestId = json["requestId"]?.string ?? ""
      raw = json
    }

    public var providerId: String? { raw["providerId"]?.string }
    public var serverMessage: JSON? { raw["serverMessage"] }
    public var approvalId: String? { raw["approvalId"]?.string }
    public var path: String? { raw["path"]?.string }
    public var bytesBase64: String? { raw["bytesBase64"]?.string }
  }

  /** The kind of command a server message carries (its one field besides the bookkeeping ones) and what it says. */
  public static func command(_ serverMessage: JSON) -> (kind: String, value: JSON) {
    let skipped: Set<String> = ["id", "execId", "spanContext", "acceptHookAdditionalContexts"]
    for (key, value) in serverMessage.object ?? [:] where !skipped.contains(key) {
      return (key, value)
    }
    return ("undefined", [:])
  }

  // MARK: Answers

  public static func hello(localRoot: String, terminalsFolder: String, computerId: String, label: String, supervised: Bool, variant: String) -> JSON {
    ["kind": "hello", "localRoot": .string(localRoot), "terminalsFolder": .string(terminalsFolder), "computerId": .string(computerId), "label": .string(label), "supervised": .bool(supervised), "variant": .string(variant)]
  }

  public static func ping(supervised: Bool) -> JSON { ["kind": "ping", "supervised": .bool(supervised)] }
  public static func client(_ requestId: String, _ message: JSON) -> JSON { ["kind": "client", "requestId": .string(requestId), "message": message] }
  public static func control(_ requestId: String, _ message: JSON) -> JSON { ["kind": "control", "requestId": .string(requestId), "message": message] }

  public static func file(_ requestId: String, bytesBase64: String? = nil) -> JSON {
    var fields: [String: JSON] = ["kind": "file", "requestId": .string(requestId)]
    if let bytesBase64 { fields["bytesBase64"] = .string(bytesBase64) }
    return .object(fields)
  }

  public static func fileError(_ requestId: String, _ error: String) -> JSON {
    ["kind": "file-error", "requestId": .string(requestId), "error": .string(error)]
  }

  /** The batch posted to the box: `providerId` once the box has welcomed this Mac. */
  public static func batch(providerId: String?, frames: [JSON]) -> JSON {
    var fields: [String: JSON] = ["frames": .array(frames)]
    if let providerId { fields["providerId"] = .string(providerId) }
    return .object(fields)
  }

  // MARK: The agent protocol's messages, as protobuf writes them

  /** `ExecClientMessage{id, <kind>: value, localExecutionTimeMs}`. */
  public static func clientMessage(id: Int, _ kind: String, _ value: JSON, localMs: Int?) -> JSON {
    var fields: [String: JSON] = [kind: value]
    if id != 0 { fields["id"] = .number(Double(id)) }
    if let localMs { fields["localExecutionTimeMs"] = .number(Double(localMs)) }
    return .object(fields)
  }

  public static func heartbeat(id: Int) -> JSON { ["heartbeat": id == 0 ? [:] : ["id": .number(Double(id))]] }
  public static func streamClose(id: Int) -> JSON { ["streamClose": id == 0 ? [:] : ["id": .number(Double(id))]] }

  /** A failure (`ExecClientThrow`); a refusal goes with id 0, so without one. */
  public static func thrown(id: Int, error: String, stackTrace: String? = nil) -> JSON {
    var fields: [String: JSON] = ["error": .string(error)]
    if id != 0 { fields["id"] = .number(Double(id)) }
    if let stackTrace { fields["stackTrace"] = .string(stackTrace) }
    return ["throw": .object(fields)]
  }

  /** `ShellStream.start`: no sandbox on the Mac. */
  public static let shellStart: JSON = ["start": ["sandboxPolicy": ["type": "TYPE_INSECURE_NONE"]]]

  public static func shellOutput(_ stream: String, _ data: String) -> JSON {
    [stream: data.isEmpty ? [:] : ["data": .string(data)]]
  }

  /** `ShellStream.exit`: the code as an unsigned 32-bit number, the folder the shell is in after. */
  public static func shellExit(code: Int, cwd: String, aborted: Bool, abortReason: String?, localMs: Int?) -> JSON {
    var fields: [String: JSON] = [:]
    let unsigned = UInt32(truncatingIfNeeded: code)
    if unsigned != 0 { fields["code"] = .number(Double(unsigned)) }
    if !cwd.isEmpty { fields["cwd"] = .string(cwd) }
    if aborted { fields["aborted"] = true }
    if let abortReason { fields["abortReason"] = .string(abortReason) }
    if let localMs { fields["localExecutionTimeMs"] = .number(Double(localMs)) }
    return ["exit": .object(fields)]
  }

  /** `ShellStream.backgrounded`: the command went on in the background after the time it may hold the stream. */
  public static func shellBackgrounded(shellId: Int, command: String, workingDirectory: String, pid: Int?, msToWait: Int) -> JSON {
    var fields: [String: JSON] = ["msToWait": .number(Double(msToWait)), "reason": "SHELL_BACKGROUND_REASON_TIMEOUT"]
    if shellId != 0 { fields["shellId"] = .number(Double(shellId)) }
    if !command.isEmpty { fields["command"] = .string(command) }
    if !workingDirectory.isEmpty { fields["workingDirectory"] = .string(workingDirectory) }
    if let pid { fields["pid"] = .number(Double(pid)) }
    return ["backgrounded": .object(fields)]
  }

  /** `BackgroundShellSpawnResult`. */
  public static func spawnSuccess(shellId: Int, command: String, workingDirectory: String, pid: Int?) -> JSON {
    var fields: [String: JSON] = [:]
    if shellId != 0 { fields["shellId"] = .number(Double(shellId)) }
    if !command.isEmpty { fields["command"] = .string(command) }
    if !workingDirectory.isEmpty { fields["workingDirectory"] = .string(workingDirectory) }
    if let pid { fields["pid"] = .number(Double(pid)) }
    return ["success": .object(fields)]
  }

  public static func spawnError(command: String, workingDirectory: String, error: String) -> JSON {
    ["error": ["command": .string(command), "workingDirectory": .string(workingDirectory), "error": .string(error)]]
  }

  /** `ReadResult.success` with text. */
  public static func readText(path: String, content: String, totalLines: Int, fileSize: Int, truncated: Bool, rangeApplied: Bool) -> JSON {
    var fields: [String: JSON] = ["path": .string(path)]
    if !content.isEmpty { fields["content"] = .string(content) }
    if totalLines != 0 { fields["totalLines"] = .number(Double(totalLines)) }
    if fileSize != 0 { fields["fileSize"] = .string(String(fileSize)) }
    if truncated { fields["truncated"] = true }
    if rangeApplied { fields["rangeApplied"] = true }
    return ["success": .object(fields)]
  }

  /** `ReadResult.success` with the bytes (an image, a PDF, a video). */
  public static func readData(path: String, data: Data, fileSize: Int) -> JSON {
    var fields: [String: JSON] = ["path": .string(path), "data": .string(data.base64EncodedString())]
    if fileSize != 0 { fields["fileSize"] = .string(String(fileSize)) }
    return ["success": .object(fields)]
  }

  public static func readFailure(_ kind: String, path: String, detail: (key: String, value: String)? = nil) -> JSON {
    var fields: [String: JSON] = ["path": .string(path)]
    if let detail { fields[detail.key] = .string(detail.value) }
    return [kind: .object(fields)]
  }
}

/**
 * The box's server-sent events, as the provider reads them: blocks end at a
 * blank line; a block's `data:` lines, each trimmed, joined by newlines, are
 * one JSON. A block longer than the upload cap is skipped, its request
 * answered "too large" when its id can be found near the start.
 */
public struct LocalExecEventParser: Sendable {
  public enum Event: Equatable, Sendable {
    case frame(JSON)
    /** A block that is not JSON: logged and dropped. */
    case unreadable
    /** A block over the cap: its request id, when the first 4,096 characters name one. */
    case tooLarge(requestId: String?)
  }

  private var buffer: [UInt8] = []
  /** Where to look for the next blank line from. */
  private var scanFrom = 0
  private var discarding = false
  public let cap: Int

  public init(cap: Int = LocalExec.uploadFrameCap) { self.cap = cap }

  public mutating func feed(_ bytes: some Sequence<UInt8>) -> [Event] {
    buffer.append(contentsOf: bytes)
    var events: [Event] = []
    while true {
      guard let end = blankLine() else {
        if !discarding && buffer.count > cap {
          events.append(.tooLarge(requestId: Self.requestId(in: buffer)))
          discarding = true
          buffer.removeAll(keepingCapacity: false)
          scanFrom = 0
        } else if discarding {
          // Keep only a trailing newline: the blank line may straddle two reads.
          let keep = buffer.last == 0x0A ? 1 : 0
          buffer = Array(buffer.suffix(keep))
          scanFrom = 0
        }
        return events
      }
      let block = Array(buffer[..<end])
      buffer.removeFirst(end + 2)
      scanFrom = 0
      if discarding { discarding = false; continue }
      if block.count > cap {
        events.append(.tooLarge(requestId: Self.requestId(in: block)))
        continue
      }
      if let event = Self.parse(block) { events.append(event) }
    }
  }

  private mutating func blankLine() -> Int? {
    guard buffer.count >= 2 else { return nil }
    var index = max(scanFrom, 0)
    while index + 1 < buffer.count {
      if buffer[index] == 0x0A && buffer[index + 1] == 0x0A { return index }
      index += 1
    }
    scanFrom = max(0, buffer.count - 1)
    return nil
  }

  static func parse(_ block: [UInt8]) -> Event? {
    let text = String(decoding: block, as: UTF8.self)
    let data = text.split(separator: "\n", omittingEmptySubsequences: false)
      .filter { $0.hasPrefix("data:") }
      .map { String($0.dropFirst(5)).trimmingCharacters(in: .whitespacesAndNewlines) }
    guard !data.isEmpty else { return nil }
    guard let json = try? JSON.parse(data.joined(separator: "\n")) else { return .unreadable }
    return .frame(json)
  }

  static func requestId(in bytes: [UInt8]) -> String? {
    let head = String(decoding: bytes.prefix(4096), as: UTF8.self)
    guard let range = head.range(of: "\"requestId\"\\s*:\\s*\"([^\"]+)\"", options: .regularExpression) else { return nil }
    let match = String(head[range])
    guard let open = match.range(of: ":") else { return nil }
    return match[open.upperBound...].trimmingCharacters(in: CharacterSet(charactersIn: " \t\""))
  }
}
