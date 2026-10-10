import AppKit
import Darwin
import Foundation
import ImageIO
import UniformTypeIdentifiers
import SimeonCore
import SimeonMacCore

/**
 * The agent's hands on this Mac (the Electron app's local-exec daemon,
 * `local-exec-daemon/`, `host/local-exec/`): while Simeon is open and
 * signed in, the box's requests come in on `GET {gateway}/local-exec/requests`
 * and are answered on `POST {gateway}/local-exec/responses`. A command runs
 * in the person's zsh, its state carried from one to the next; a file is
 * read or moved. Each request passes the places that hold keys, then the
 * setting (Never, Always allow, or what the person allowed once).
 *
 * Inside the app, not a second process: the hands stop when Simeon quits or
 * signs out, where the Electron daemon kept serving after both.
 */
actor MacLocalHands {
  static let shared = MacLocalHands()

  private var loop: Task<Void, Never>?
  private var gateway: Gateway?

  /** Start serving this box (signed in); a second start for the same gateway does nothing. */
  func start(_ gateway: Gateway) {
    if self.gateway === gateway, loop != nil { return }
    stop()
    self.gateway = gateway
    let provider = LocalHandsProvider(gateway: gateway)
    LocalHandsLog.write("[sand-local-exec-daemon] started (pid \(getpid())); serving local exec over the gateway")
    loop = Task.detached { await provider.run() }
  }

  /** Signed out, or another account: the stream closes and running commands are stopped. */
  func stop() {
    loop?.cancel()
    loop = nil
    gateway = nil
  }
}

/** `~/.simeon/local-exec-daemon.log`, the Electron daemon's log, appended to. */
enum LocalHandsLog {
  private static let queue = DispatchQueue(label: "simeon.local-exec.log")

  static func write(_ line: String) {
    queue.async {
      let folder = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".simeon", isDirectory: true)
      let url = folder.appendingPathComponent("local-exec-daemon.log")
      try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
      guard let handle = try? FileHandle(forWritingTo: url) else { return }
      defer { try? handle.close() }
      _ = try? handle.seekToEnd()
      try? handle.write(contentsOf: Data((line + "\n").utf8))
    }
  }
}

/** The stream, the outbox and the requests in flight (`SandLocalExecProvider`). */
actor LocalHandsProvider {
  let gateway: Gateway
  let root: String
  let home: String
  let terminalsFolder: String
  private let session: URLSession
  private var providerId: String?
  private var outbox: [JSON] = []
  private var flushing = false
  private var execIds = 0
  private var inFlight: [String: Task<Void, Never>] = [:]
  private var cancelled: Set<String> = []
  private var lastChunk = Date()
  let shell: ZshHost
  let background: BackgroundShells

  init(gateway: Gateway) {
    self.gateway = gateway
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    // `SAND_LOCAL_EXEC_ROOT`, else `SAND_AGENT_PROJECT_DIR`, else the home folder (`resolveLocalExecRoot`); the app sets neither.
    let environment = ProcessInfo.processInfo.environment
    let configured = [environment["SIMEON_LOCAL_EXEC_ROOT"], environment["SAND_LOCAL_EXEC_ROOT"], environment["SIMEON_AGENT_PROJECT_DIR"], environment["SAND_AGENT_PROJECT_DIR"]]
      .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
    self.home = home
    root = configured ?? home
    terminalsFolder = (configured ?? home) + "/terminals"
    let configuration = URLSessionConfiguration.default
    configuration.timeoutIntervalForRequest = 24 * 60 * 60
    configuration.timeoutIntervalForResource = 7 * 24 * 60 * 60
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    session = URLSession(configuration: configuration)
    shell = ZshHost(root: configured ?? home)
    background = BackgroundShells(terminalsFolder: (configured ?? home) + "/terminals")
  }

  /** Dial, read, and dial again: 1, 2, 4, 8, then every 10 s; after three failures in a row the box's address is asked for again. */
  func run() async {
    var attempt = 1
    var failures = 0
    while !Task.isCancelled {
      do {
        try await stream { attempt = 1; failures = 0 }
      } catch {
        if Task.isCancelled { break }
        failures += 1
        if failures >= 3 {
          await gateway.invalidate()
          failures = 0
        }
      }
      providerId = nil
      if Task.isCancelled { break }
      try? await Task.sleep(nanoseconds: UInt64(LocalExec.backoffSeconds(attempt: attempt) * 1_000_000_000))
      attempt += 1
    }
    // Stopped: the commands still holding a stream are stopped as a cancel stops them.
    cancelled.formUnion(inFlight.keys)
    background.stopAll()
  }

  struct Stalled: Error {}
  struct Moved: Error {}

  private func stream(connected: () -> Void) async throws {
    let connection = try await gateway.currentConnection()
    var request = URLRequest(url: URL(string: connection.baseURL + LocalExecWire.requestsPath)!)
    for (name, value) in connection.headers(["accept": "text/event-stream", "accept-encoding": "identity"]) { request.setValue(value, forHTTPHeaderField: name) }
    let (bytes, response) = try await session.bytes(for: request)
    guard let status = (response as? HTTPURLResponse)?.statusCode, (200..<300).contains(status) else {
      throw GatewayError(message: "local-exec requests stream failed: \((response as? HTTPURLResponse)?.statusCode ?? 0)", refused: false)
    }
    connected()
    lastChunk = Date()
    await post([helloFrame()], deadline: LocalExec.controlPostSeconds)
    // The stream's bytes are read in this task (they cannot be handed to another); the ping's task ends them by cancelling their request.
    let dataTask = bytes.task
    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask { [self] in
        // The ping every 10 s, the first at once; the box's address checked each time; 35 s without a byte ends the stream.
        while true {
          await self.post([LocalExecWire.ping(supervised: true)], deadline: LocalExec.controlPostSeconds)
          if await self.silentFor() > LocalExec.stallSeconds { dataTask.cancel(); throw Stalled() }
          if let fresh = try? await self.gateway.currentConnection(), fresh.baseURL != connection.baseURL || fresh.token != connection.token || fresh.networkToken != connection.networkToken { dataTask.cancel(); throw Moved() }
          try await Task.sleep(nanoseconds: UInt64(LocalExec.pingSeconds * 1_000_000_000))
        }
      }
      // The hands stopped: the stream's request is cancelled, so the read ends at once.
      try await withTaskCancellationHandler {
        var parser = LocalExecEventParser()
        var pending: [UInt8] = []
        pending.reserveCapacity(64 * 1024)
        for try await byte in bytes {
          pending.append(byte)
          if byte == 0x0A || pending.count >= 64 * 1024 {
            let events = parser.feed(pending)
            pending.removeAll(keepingCapacity: true)
            await self.touched()
            for event in events { await self.take(event) }
          }
        }
      } onCancel: {
        dataTask.cancel()
      }
      // The box closed the stream: the ping stops with it.
      group.cancelAll()
    }
  }

  private func touched() { lastChunk = Date() }
  private func silentFor() -> Double { Date().timeIntervalSince(lastChunk) }

  private func helloFrame() -> JSON {
    let name = Self.hostName()
    return LocalExecWire.hello(localRoot: root, terminalsFolder: terminalsFolder, computerId: name.isEmpty ? "this-computer" : name, label: name.isEmpty ? "this computer" : name, supervised: true, variant: "sand")
  }

  /** `os.hostname()`: `gethostname`, as Node reads it. */
  static func hostName() -> String {
    var buffer = [CChar](repeating: 0, count: 256)
    guard gethostname(&buffer, buffer.count) == 0 else { return "" }
    return String(cString: buffer).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  // MARK: Requests

  private func take(_ event: LocalExecEventParser.Event) {
    switch event {
    case .unreadable:
      LocalHandsLog.write("[local-exec-provider] dropping unparseable request frame: SyntaxError")
    case .tooLarge(let requestId):
      if let requestId { enqueue(LocalExecWire.fileError(requestId, LocalExec.uploadTooLarge)) }
    case .frame(let json):
      guard let request = LocalExecWire.Request(json: json) else { return }
      switch request.kind {
      case "welcome":
        providerId = request.providerId
      case "exec", "upload", "download":
        let id = request.requestId
        inFlight[id] = Task { [self] in
          await self.handle(request)
          await self.finished(id)
        }
      case "cancel":
        // Seen by the command waiting to end; one gone to the background goes on (`!bg.backgroundRequested`).
        if inFlight[request.requestId] != nil { cancelled.insert(request.requestId) }
      case "retire-approval":
        if let approvalId = request.approvalId { MacLocalPermission.approvals.retire(approvalId) }
      default:
        break
      }
    }
  }

  private func finished(_ requestId: String) {
    inFlight[requestId] = nil
    cancelled.remove(requestId)
  }

  func isCancelled(_ requestId: String) -> Bool { cancelled.contains(requestId) }

  private func handle(_ request: LocalExecWire.Request) async {
    switch request.kind {
    case "exec": await exec(request)
    case "download": await download(request)
    case "upload": await upload(request)
    default: break
    }
  }

  /** The places that hold keys, then the setting (`isLocalUseBlocked`). */
  private func refusal(for described: LocalToolRequest?, approvalId: String?) -> String? {
    LocalToolRules.refusal(request: described, approvalId: approvalId, permission: LocalToolSettings().effective, live: MacLocalPermission.approvals.live(), terminalsFolder: terminalsFolder, home: home)
  }

  private func exec(_ request: LocalExecWire.Request) async {
    guard let message = request.serverMessage, message.object != nil else {
      enqueue(LocalExecWire.control(request.requestId, LocalExecWire.thrown(id: 0, error: "local-exec exec request carried no server message")))
      return
    }
    let (kind, value) = LocalExecWire.command(message)
    if let reason = refusal(for: LocalToolRules.describe(kind: kind, value: value, terminalsFolder: terminalsFolder), approvalId: request.approvalId) {
      enqueue(LocalExecWire.control(request.requestId, LocalExecWire.thrown(id: 0, error: reason)))
      return
    }
    execIds += 1
    let id = execIds
    let started = Date()
    let requestId = request.requestId
    let beat = Task { [self] in
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: UInt64(LocalExec.execHeartbeatSeconds * 1_000_000_000))
        if Task.isCancelled { break }
        await self.enqueue(LocalExecWire.control(requestId, LocalExecWire.heartbeat(id: id)))
      }
    }
    defer { beat.cancel() }
    let send: @Sendable (String, JSON) async -> Void = { [self] kind, value in
      let ms = Int(Date().timeIntervalSince(started) * 1000)
      await self.enqueue(LocalExecWire.client(requestId, LocalExecWire.clientMessage(id: id, kind, value, localMs: ms)))
    }
    do {
      switch kind {
      case "shellStreamArgs":
        try await ShellStreamRun(args: value, root: root, shell: shell, background: background, requestId: requestId, provider: self, started: started, send: { event in await send("shellStream", event) }).run()
      case "backgroundShellSpawnArgs":
        await send("backgroundShellSpawnResult", await spawnInBackground(value))
      case "readArgs":
        await send("readResult", try await read(value))
      case "lsArgs":
        try await list(value)
      default:
        LocalHandsLog.write(LocalExec.noHandler(kind))
        enqueue(LocalExecWire.control(requestId, LocalExecWire.thrown(id: id, error: LocalExec.noHandler(kind))))
      }
      enqueue(LocalExecWire.control(requestId, LocalExecWire.streamClose(id: id)))
    } catch {
      enqueue(LocalExecWire.control(requestId, LocalExecWire.thrown(id: id, error: (error as? LocalHandsError)?.message ?? error.localizedDescription, stackTrace: "Error: \((error as? LocalHandsError)?.message ?? error.localizedDescription)")))
    }
  }

  // MARK: Files

  /** Inside the root, also once links are followed (`containPath`); the path as the root sees it. */
  func contain(_ path: String) throws -> String {
    let resolved = LocalToolRules.resolve(path, against: root)
    if LocalToolRules.escapesRoot(root, resolved) { throw LocalHandsError(LocalExec.outsideRoot(path)) }
    let realRoot = Self.realpathNearestExisting(root)
    let realResolved = Self.realpathNearestExisting(resolved)
    if LocalToolRules.escapesRoot(realRoot, realResolved) { throw LocalHandsError(LocalExec.throughSymlink(path)) }
    return resolved
  }

  /** The nearest folder that exists, links followed, with the rest put back (`realpathNearestExisting`). */
  static func realpathNearestExisting(_ path: String) -> String {
    var head = path
    var tail: [String] = []
    while true {
      if let real = realpath(head, nil) {
        defer { free(real) }
        let base = String(cString: real)
        return tail.isEmpty ? base : (base == "/" ? "" : base) + "/" + tail.reversed().joined(separator: "/")
      }
      let parent = (head as NSString).deletingLastPathComponent
      if parent == head || parent.isEmpty { return path }
      tail.append((head as NSString).lastPathComponent)
      head = parent
    }
  }

  static func regularFileSize(_ path: String) -> Int? {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: path), attributes[.type] as? FileAttributeType == .typeRegular else { return nil }
    return (attributes[.size] as? NSNumber)?.intValue
  }

  /** A read (`readArgs`): too large, then the read executor's answers. */
  private func read(_ args: JSON) async throws -> JSON {
    let contained = try contain(args["path"]?.string ?? "")
    if let size = Self.regularFileSize(contained), size > LocalExec.maxFileBytes {
      return LocalExecWire.readFailure("error", path: contained, detail: ("error", LocalExec.fileTooLarge(size)))
    }
    return LocalReader.read(path: LocalRead.resolve(args["path"]?.string ?? "", root: root, home: home), offset: args["offset"]?.int, limit: args["limit"]?.int)
  }

  /** A folder's listing (`lsArgs`): the shipped one answers for a missing path or a file, and fails on a real folder. */
  private func list(_ args: JSON) async throws {
    let contained = try contain(args["path"]?.string ?? "")
    var isDirectory: ObjCBool = false
    if !FileManager.default.fileExists(atPath: contained, isDirectory: &isDirectory) {
      throw LocalHandsError("Path does not exist: \(contained)")
    }
    if !isDirectory.boolValue { throw LocalHandsError("Path is not a directory: \(contained)") }
    throw LocalHandsError("")
  }

  /** CopyToBox (`download`): the file whole, or why not. */
  private func download(_ request: LocalExecWire.Request) async {
    let path = request.path ?? ""
    let described = LocalToolRequest(action: "read-file", target: path, attachToResourcePath: path)
    if let reason = refusal(for: described, approvalId: request.approvalId) { enqueue(LocalExecWire.fileError(request.requestId, reason)); return }
    do {
      let contained = try contain(path)
      if let size = Self.regularFileSize(contained), size > LocalExec.maxFileBytes { throw LocalHandsError(LocalExec.fileTooLarge(size)) }
      guard FileManager.default.fileExists(atPath: contained) else { throw LocalHandsError("ENOENT: no such file or directory, open '\(contained)'") }
      let data = try Data(contentsOf: URL(fileURLWithPath: contained))
      enqueue(LocalExecWire.file(request.requestId, bytesBase64: data.base64EncodedString()))
    } catch {
      enqueue(LocalExecWire.fileError(request.requestId, (error as? LocalHandsError)?.message ?? error.localizedDescription))
    }
  }

  /** CopyFromBox (`upload`): written beside the target and moved over it. */
  private func upload(_ request: LocalExecWire.Request) async {
    let path = request.path ?? ""
    if let reason = refusal(for: LocalToolRequest(action: "write-file", target: path), approvalId: request.approvalId) { enqueue(LocalExecWire.fileError(request.requestId, reason)); return }
    let base64 = request.bytesBase64 ?? ""
    // The size it would be, in the read's words (`localExecFileTooLargeMessage`); the frame's own cap is the parser's.
    let approximate = base64.utf8.count * 3 / 4
    if approximate > LocalExec.maxFileBytes { enqueue(LocalExecWire.fileError(request.requestId, LocalExec.fileTooLarge(approximate))); return }
    do {
      let contained = try contain(path)
      guard let data = Data(base64Encoded: base64) else { throw LocalHandsError("The upload was not valid base64.") }
      try Self.writeAtomically(data, to: contained)
      enqueue(LocalExecWire.file(request.requestId))
    } catch {
      enqueue(LocalExecWire.fileError(request.requestId, (error as? LocalHandsError)?.message ?? error.localizedDescription))
    }
  }

  /** `.name.<16 hex>.part` made new beside it, flushed to disk, then renamed over it (`writeFileAtomic`). */
  static func writeAtomically(_ data: Data, to path: String) throws {
    let folder = (path as NSString).deletingLastPathComponent
    try FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
    let hex = (0..<8).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    let temp = folder + "/." + (path as NSString).lastPathComponent + "." + hex + ".part"
    let fd = open(temp, O_WRONLY | O_CREAT | O_EXCL, 0o666)
    guard fd >= 0 else { throw LocalHandsError(String(cString: strerror(errno))) }
    let written = data.withUnsafeBytes { buffer -> Int in
      var offset = 0
      while offset < buffer.count {
        let count = Darwin.write(fd, buffer.baseAddress!.advanced(by: offset), buffer.count - offset)
        if count <= 0 { return -1 }
        offset += count
      }
      return offset
    }
    fsync(fd)
    close(fd)
    guard written == data.count || data.isEmpty else { unlink(temp); throw LocalHandsError(String(cString: strerror(errno))) }
    guard rename(temp, path) == 0 else { let message = String(cString: strerror(errno)); unlink(temp); throw LocalHandsError(message) }
  }

  /** `backgroundShellSpawnArgs`: started straight into the background, its terminal file from the start. */
  private func spawnInBackground(_ args: JSON) async -> JSON {
    let command = args["command"]?.string ?? ""
    let folder = LocalToolRules.workingDirectory(requested: args["workingDirectory"]?.string ?? "", root: root) { Self.isDirectory($0) }
    let cwd = folder.path.isEmpty ? shell.cwd : folder.path
    do {
      let process = try await shell.spawn(command: command, cwd: cwd, pipeStdin: false)
      let shellId = background.adopt(process, command: command, cwd: cwd, title: args["description"]?.string, shell: shell)
      return LocalExecWire.spawnSuccess(shellId: shellId, command: command, workingDirectory: cwd, pid: Int(process.pid))
    } catch {
      return LocalExecWire.spawnError(command: command, workingDirectory: cwd, error: (error as? LocalHandsError)?.message ?? error.localizedDescription)
    }
  }

  static func isDirectory(_ path: String) -> Bool {
    var isDirectory: ObjCBool = false
    return FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) && isDirectory.boolValue
  }

  // MARK: The outbox

  /** Queued in order; one flusher posts what is queued as one batch, then the next. */
  func enqueue(_ frame: JSON) {
    outbox.append(frame)
    guard !flushing else { return }
    flushing = true
    Task { await self.flush() }
  }

  private func flush() async {
    while !outbox.isEmpty {
      let batch = outbox
      outbox = []
      await post(batch, deadline: LocalExec.dataPostSeconds)
    }
    flushing = false
  }

  /** Three tries, 200 ms apart; a batch that still fails is dropped and said so in the log. */
  private func post(_ frames: [JSON], deadline: Double) async {
    guard let connection = try? await gateway.currentConnection(), let url = URL(string: connection.baseURL + LocalExecWire.responsesPath) else { return }
    let body = LocalExecWire.batch(providerId: providerId, frames: frames)
    var request = URLRequest.post(url, json: body, headers: connection.headers())
    request.timeoutInterval = deadline
    var last = ""
    for attempt in 0..<3 {
      do {
        let (_, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) { return }
        last = "Error (http_\(status))"
      } catch {
        last = String(describing: type(of: error))
      }
      if attempt < 2 { try? await Task.sleep(nanoseconds: 200_000_000) }
    }
    LocalHandsLog.write("[local-exec-provider] dropping \(frames.count)-frame response batch after 3 failed POSTs: \(last)")
  }
}

struct LocalHandsError: Error {
  let message: String
  init(_ message: String) { self.message = message }
}

// MARK: - Reading a file

/** The read executor (`LocalReadExecutor`): text with its lines, or the bytes of an image, a PDF or a video. */
enum LocalReader {
  static func read(path: String, offset: Int?, limit: Int?) -> JSON {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: path, isDirectory: &isDirectory) else {
      return LocalExecWire.readFailure("fileNotFound", path: path)
    }
    if isDirectory.boolValue { return LocalExecWire.readFailure("invalidFile", path: path, detail: ("reason", "Path is a directory, not a file")) }
    guard LocalHandsProvider.regularFileSize(path) != nil else { return LocalExecWire.readFailure("invalidFile", path: path, detail: ("reason", "Path is neither a file nor a directory")) }
    guard FileManager.default.isReadableFile(atPath: path) else { return LocalExecWire.readFailure("permissionDenied", path: path) }
    do {
      let data = try Data(contentsOf: URL(fileURLWithPath: path))
      let size = data.count
      let header = [UInt8](data.prefix(8192))
      switch LocalRead.kind(header: header) {
      case .image:
        return LocalExecWire.readData(path: path, data: ImageShrinker.shrink(data), fileSize: size)
      case .binary where LocalRead.isPDF(path) || LocalRead.isVideo(path):
        return LocalExecWire.readData(path: path, data: data, fileSize: size)
      case .binary:
        return LocalExecWire.readFailure("invalidFile", path: path, detail: ("reason", LocalRead.binaryRefusal(path)))
      case .text:
        if LocalRead.isPDF(path) { return LocalExecWire.readData(path: path, data: data, fileSize: size) }
        let text = LocalRead.decode(data)
        let total = LocalRead.countLines(text)
        let ranged = LocalRead.range(text, totalLines: total, offset: offset, limit: limit)
        let capped = LocalRead.cap(ranged.content)
        return LocalExecWire.readText(path: path, content: capped.content, totalLines: total, fileSize: size, truncated: capped.truncated, rangeApplied: ranged.applied)
      }
    } catch let error as CocoaError where error.code == .fileReadNoPermission {
      return LocalExecWire.readFailure("permissionDenied", path: path)
    } catch {
      return LocalExecWire.readFailure("error", path: path, detail: ("error", error.localizedDescription))
    }
  }
}

/** Pictures at most 1,024 points on their long side (WebP 1,280) and 1 MiB, shrunk by a fifth until they fit (`resizeImageBufferIfNeeded`). */
enum ImageShrinker {
  static let maxBytes = 1024 * 1024

  static func shrink(_ data: Data) -> Data {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil), let type = CGImageSourceGetType(source),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int else { return data }
    let isWebP = (type as String) == UTType.webP.identifier
    let limit = isWebP ? 1280 : 1024
    var side = min(max(width, height), limit)
    if max(width, height) <= limit && data.count <= maxBytes { return data }
    // ImageIO writes no WebP: a shrunk WebP comes back as PNG.
    let output = isWebP ? (UTType.png.identifier as CFString) : type
    var result = encode(source, side: side, as: output) ?? data
    while result.count > maxBytes && side > 1 {
      side = max(1, Int((Double(side) * 0.8).rounded()))
      guard let smaller = encode(source, side: side, as: output) else { break }
      result = smaller
    }
    return result
  }

  static func encode(_ source: CGImageSource, side: Int, as type: CFString) -> Data? {
    let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: side, kCGImageSourceCreateThumbnailWithTransform: true]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
    let out = NSMutableData()
    guard let destination = CGImageDestinationCreateWithData(out as CFMutableData, type, 1, nil) else { return nil }
    CGImageDestinationAddImage(destination, image, nil)
    return CGImageDestinationFinalize(destination) ? out as Data : nil
  }
}

// MARK: - The shell

/** One command started in the person's zsh: its pipes, its process group, its end. */
final class ShellProcess: @unchecked Sendable {
  let pid: pid_t
  private let lock = NSLock()
  private var outputHandlers: [(String, Data) -> Void] = []
  private var exitWaiters: [CheckedContinuation<(code: Int32?, signaled: Bool), Never>] = []
  /** Waiters that let go once their task is cancelled, by number (see `exitUnlessCancelled`). */
  private var cancellableWaiters: [Int: CheckedContinuation<(code: Int32?, signaled: Bool)?, Never>] = [:]
  private var waiterCount = 0
  private(set) var exit: (code: Int32?, signaled: Bool)?
  private var captured: [(String, Data)] = []
  private var bytes: [String: Int] = ["stdout": 0, "stderr": 0]
  let stdin: FileHandle?
  private var state = Data()

  /** What the shell wrote on descriptor 4 (or, for the first login, on its output): its state after. */
  var stateOutput: Data { lock.lock(); defer { lock.unlock() }; return state }
  func appendState(_ data: Data) { lock.lock(); state.append(data); lock.unlock() }

  init(pid: pid_t, stdin: FileHandle?) {
    self.pid = pid
    self.stdin = stdin
  }

  /**
   * Output as it comes, each stream cut at 1 MiB without a word
   * (`BaseShellCoreExecutor`); what came before is given first, under the
   * lock, so nothing newer from the pipes can reach the handler ahead of it.
   */
  func onOutput(_ handler: @escaping (String, Data) -> Void) {
    lock.lock()
    defer { lock.unlock() }
    outputHandlers.append(handler)
    for (stream, data) in captured { handler(stream, data) }
  }

  func received(_ stream: String, _ data: Data) {
    lock.lock()
    let used = bytes[stream] ?? 0
    let room = max(0, LocalExec.streamCap - used)
    let kept = data.prefix(room)
    bytes[stream] = used + kept.count
    if !kept.isEmpty { captured.append((stream, Data(kept))) }
    let handlers = outputHandlers
    lock.unlock()
    if !kept.isEmpty { for handler in handlers { handler(stream, Data(kept)) } }
  }

  func ended(code: Int32?, signaled: Bool) {
    lock.lock()
    exit = (code, signaled)
    let waiters = exitWaiters
    let cancellable = Array(cancellableWaiters.values)
    exitWaiters = []
    cancellableWaiters = [:]
    lock.unlock()
    for waiter in waiters { waiter.resume(returning: (code, signaled)) }
    for waiter in cancellable { waiter.resume(returning: (code, signaled)) }
  }

  /** Whether its end was seen (the pipes' threads set it, so it is read under the lock). */
  var hasEnded: Bool { lock.lock(); defer { lock.unlock() }; return exit != nil }

  func waitForExit() async -> (code: Int32?, signaled: Bool) {
    await withCheckedContinuation { continuation in
      lock.lock()
      if let exit { lock.unlock(); continuation.resume(returning: exit); return }
      exitWaiters.append(continuation)
      lock.unlock()
    }
  }

  /**
   * Its end, or nil once the waiting task is cancelled: for a task group's
   * child, which the group waits for even after another child has won (a
   * timeout, a cancel), so a plain wait there would hold the group until
   * the command ends.
   */
  func exitUnlessCancelled() async -> (code: Int32?, signaled: Bool)? {
    let number = lock.withLock { waiterCount += 1; return waiterCount }
    return await withTaskCancellationHandler {
      await withCheckedContinuation { (continuation: CheckedContinuation<(code: Int32?, signaled: Bool)?, Never>) in
        lock.lock()
        if let exit { lock.unlock(); continuation.resume(returning: exit); return }
        if Task.isCancelled { lock.unlock(); continuation.resume(returning: nil); return }
        cancellableWaiters[number] = continuation
        lock.unlock()
      }
    } onCancel: {
      lock.lock()
      let waiter = cancellableWaiters.removeValue(forKey: number)
      lock.unlock()
      waiter?.resume(returning: nil)
    }
  }

  /** SIGTERM to the group, SIGKILL a second later if it is still there (`killProcess`). */
  func terminate() {
    if kill(-pid, SIGTERM) != 0 { kill(pid, SIGTERM) }
    DispatchQueue.global().asyncAfter(deadline: .now() + 1) { [self] in
      if !hasEnded { kill(-pid, SIGKILL) }
    }
  }
}

/**
 * The person's zsh (`ZshState`): started once as a login shell for its
 * state, then each command run with that state and its own, carried on.
 */
final class ZshHost: @unchecked Sendable {
  private let lock = NSLock()
  private var state = ""
  private var folder: String
  private var starting: Task<Void, Never>?
  let root: String

  init(root: String) {
    self.root = root
    folder = root
  }

  var cwd: String { lock.lock(); defer { lock.unlock() }; return folder }

  static var zshPath: String {
    let shell = ProcessInfo.processInfo.environment["SHELL"] ?? ""
    return shell.contains("zsh") ? shell : "/bin/zsh"
  }

  static func environment(root: String) -> [String: String] {
    var base = ProcessInfo.processInfo.environment
    base["ELECTRON_RUN_AS_NODE"] = nil
    return ZshShell.environment(base: base, root: root)
  }

  /** The login shell's state, once, every command waiting for it (with a deadline the Electron app's had not: 20 s); the folder stays the root. */
  private func ensureInitialized() async {
    let task = lock.withLock { () -> Task<Void, Never> in
      if let starting { return starting }
      let task = Task.detached { [self] in await self.initialize() }
      starting = task
      return task
    }
    await task.value
  }

  private func initialize() async {
    guard let process = try? Self.launch(arguments: ["-o", "extendedglob", "-ilc", ZshShell.initScript], cwd: root, environment: Self.environment(root: root), pipeStdin: false, stateIn: nil, captureState: false, captureStdoutAsState: true) else { return }
    let ended = await withTaskGroup(of: Bool.self) { group in
      // The wait lets go when the deadline wins, or the group would wait for the shell it is about to stop.
      group.addTask { await process.exitUnlessCancelled() != nil }
      group.addTask { try? await Task.sleep(nanoseconds: 20_000_000_000); return false }
      let first = await group.next() ?? false
      group.cancelAll()
      return first
    }
    if !ended { process.terminate() }
    if let parsed = ZshShell.parseState(String(decoding: process.stateOutput, as: UTF8.self)) {
      lock.withLock { state = parsed.state }
    } else {
      LocalHandsLog.write("[shell-exec] zsh state init gave no state; falling back to empty state")
    }
  }

  /** One command with the current state (`zsh -c <script> -- <command>`). */
  func spawn(command: String, cwd: String, pipeStdin: Bool) async throws -> ShellProcess {
    await ensureInitialized()
    let snapshot = lock.withLock { state }
    return try Self.launch(arguments: ["-c", ZshShell.commandScript(pipeStdin: pipeStdin), "--", command], cwd: cwd, environment: Self.environment(root: root), pipeStdin: pipeStdin, stateIn: snapshot, captureState: true, captureStdoutAsState: false)
  }

  /** After a command that was not stopped: its state and folder become the shell's, when whole. */
  func adopt(stateOutput: Data) {
    guard let parsed = ZshShell.parseState(String(decoding: stateOutput, as: UTF8.self)) else { return }
    lock.lock()
    state = parsed.state
    folder = parsed.cwd
    lock.unlock()
  }

  /**
   * `posix_spawn` in a session of its own (Node's `detached`), descriptors
   * 0–2 and, for a command, 3 (the state in) and 4 (the state out); nothing
   * else of the app's is passed on. Its signals start as Node's children's
   * do: none blocked, each at its default (the thread spawning it is one of
   * the system's pool, which blocks most of them, and a child keeps that).
   */
  static func launch(arguments: [String], cwd: String, environment: [String: String], pipeStdin: Bool, stateIn: String?, captureState: Bool, captureStdoutAsState: Bool) throws -> ShellProcess {
    var outPipe: [Int32] = [0, 0], errPipe: [Int32] = [0, 0], inPipe: [Int32] = [-1, -1], statePipeIn: [Int32] = [-1, -1], statePipeOut: [Int32] = [-1, -1]
    guard pipe(&outPipe) == 0, pipe(&errPipe) == 0 else { throw LocalHandsError(String(cString: strerror(errno))) }
    if pipeStdin { _ = pipe(&inPipe) }
    if stateIn != nil { _ = pipe(&statePipeIn) }
    if captureState { _ = pipe(&statePipeOut) }

    var actions: posix_spawn_file_actions_t?
    posix_spawn_file_actions_init(&actions)
    defer { posix_spawn_file_actions_destroy(&actions) }
    if pipeStdin { posix_spawn_file_actions_adddup2(&actions, inPipe[0], 0) } else { posix_spawn_file_actions_addopen(&actions, 0, "/dev/null", O_RDONLY, 0) }
    posix_spawn_file_actions_adddup2(&actions, outPipe[1], 1)
    posix_spawn_file_actions_adddup2(&actions, errPipe[1], 2)
    if stateIn != nil { posix_spawn_file_actions_adddup2(&actions, statePipeIn[0], 3) }
    if captureState { posix_spawn_file_actions_adddup2(&actions, statePipeOut[1], 4) }
    if !cwd.isEmpty { posix_spawn_file_actions_addchdir_np(&actions, cwd) }

    var attributes: posix_spawnattr_t?
    posix_spawnattr_init(&attributes)
    defer { posix_spawnattr_destroy(&attributes) }
    var noSignals = sigset_t()
    sigemptyset(&noSignals)
    posix_spawnattr_setsigmask(&attributes, &noSignals)
    var allSignals = sigset_t()
    sigfillset(&allSignals)
    sigdelset(&allSignals, SIGKILL)
    sigdelset(&allSignals, SIGSTOP)
    posix_spawnattr_setsigdefault(&attributes, &allSignals)
    posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETSID | POSIX_SPAWN_CLOEXEC_DEFAULT | POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_SETSIGDEF))

    let path = zshPath
    let argv: [UnsafeMutablePointer<CChar>?] = ([path] + arguments).map { strdup($0) } + [nil]
    let envp: [UnsafeMutablePointer<CChar>?] = environment.map { strdup("\($0.key)=\($0.value)") } + [nil]
    defer { argv.forEach { free($0) }; envp.forEach { free($0) } }
    var spawned: pid_t = 0
    let status = posix_spawn(&spawned, path, &actions, &attributes, argv, envp)
    let pid = spawned
    // The child's ends, closed here.
    close(outPipe[1]); close(errPipe[1])
    if pipeStdin { close(inPipe[0]) }
    if stateIn != nil { close(statePipeIn[0]) }
    if captureState { close(statePipeOut[1]) }
    guard status == 0 else {
      close(outPipe[0]); close(errPipe[0])
      if pipeStdin { close(inPipe[1]) }
      if stateIn != nil { close(statePipeIn[1]) }
      if captureState { close(statePipeOut[0]) }
      throw LocalHandsError("spawn \(path) failed: \(String(cString: strerror(status)))")
    }

    let process = ShellProcess(pid: pid, stdin: pipeStdin ? FileHandle(fileDescriptor: inPipe[1], closeOnDealloc: true) : nil)
    let group = DispatchGroup()
    // Each pipe read, and the wait for the end, on a thread of its own: a command in the background holds them for as long as
    // it runs, and a few such commands would use up the threads Dispatch's shared queues have (64), stalling the app.
    func pump(_ fd: Int32, _ handler: @escaping (Data) -> Void) {
      group.enter()
      Thread.detachNewThread {
        var buffer = [UInt8](repeating: 0, count: 65_536)
        while true {
          let count = Darwin.read(fd, &buffer, buffer.count)
          if count < 0 && errno == EINTR { continue }
          if count <= 0 { break }
          handler(Data(buffer[0..<count]))
        }
        close(fd)
        group.leave()
      }
    }
    pump(outPipe[0]) { data in if captureStdoutAsState { process.appendState(data) } else { process.received("stdout", data) } }
    pump(errPipe[0]) { data in process.received("stderr", data) }
    if captureState { pump(statePipeOut[0]) { data in process.appendState(data) } }
    if let stateIn {
      let fd = statePipeIn[1]
      // A shell gone before it read its state makes the write fail, not stop the app with SIGPIPE.
      _ = fcntl(fd, F_SETNOSIGPIPE, 1)
      DispatchQueue.global().async {
        let bytes = Array(stateIn.utf8)
        var offset = 0
        while offset < bytes.count {
          let count = bytes[offset...].withUnsafeBytes { Darwin.write(fd, $0.baseAddress!, $0.count) }
          if count < 0 && errno == EINTR { continue }
          if count <= 0 { break }
          offset += count
        }
        close(fd)
      }
    }
    // The end: the exit, then the pipes closed, or the group killed 5 s after the exit (`closeTimeout`).
    Thread.detachNewThread {
      var status: Int32 = 0
      while waitpid(pid, &status, 0) == -1 && errno == EINTR {}
      let signaled = (status & 0x7f) != 0 && (status & 0x7f) != 0x7f
      let code: Int32? = signaled ? nil : (status >> 8) & 0xff
      if group.wait(timeout: .now() + 5) == .timedOut {
        LocalHandsLog.write("[shell-exec] Close event did not fire within 5000ms after exit. This may indicate a background process is holding file descriptors open. Killing detached process group.")
        kill(-pid, SIGKILL)
      }
      process.ended(code: code, signaled: signaled)
    }
    return process
  }
}

/**
 * Commands gone to the background (`background-shell-lifecycle.ts`): each
 * with an id from 1,000 to 999,999 (random first, then the next free one)
 * and its terminal file, kept until it ends.
 */
final class BackgroundShells: @unchecked Sendable {
  private let lock = NSLock()
  private var nextId = Int.random(in: 1000...999_999)
  private var running: [Int: ShellProcess] = [:]
  let terminalsFolder: String

  init(terminalsFolder: String) { self.terminalsFolder = terminalsFolder }

  private func takeId() -> Int {
    lock.lock(); defer { lock.unlock() }
    while running[nextId] != nil { nextId = nextId >= 999_999 ? 1000 : nextId + 1 }
    let id = nextId
    nextId = nextId >= 999_999 ? 1000 : nextId + 1
    return id
  }

  /**
   * A command taken into the background: its terminal file made with what
   * it printed so far, the rest appended as it comes, the head rewritten
   * every 5 s and at its end, the foot added unless it was stopped. Its
   * times, and its hard timeout, count from when it started
   * (`startTime`), not from when it went to the background.
   */
  func adopt(_ process: ShellProcess, command: String, cwd: String, title: String?, shell: ZshHost, startedAt started: Date = Date(), hardTimeoutMs: Int? = nil) -> Int {
    let shellId = takeId()
    lock.lock(); running[shellId] = process; lock.unlock()
    let path = terminalsFolder + "/\(shellId).txt"
    try? FileManager.default.createDirectory(atPath: terminalsFolder, withIntermediateDirectories: true)
    let pid = Int(process.pid)
    let head = { (status: String) in TerminalFile.head(pid: pid, cwd: cwd, command: command, title: title, status: status, startedAt: started, runningForMs: Int(Date().timeIntervalSince(started) * 1000)) }
    FileManager.default.createFile(atPath: path, contents: Data(head("running").utf8))
    let writer = DispatchQueue(label: "simeon.terminal.\(shellId)")
    let handle = FileHandle(forUpdatingAtPath: path)
    // What it printed so far first (given again on registering), then the rest as it comes, both streams in order.
    process.onOutput { _, data in
      writer.async {
        _ = try? handle?.seekToEnd()
        try? handle?.write(contentsOf: data)
      }
    }
    let rewrite = { (status: String) in
      writer.async {
        try? handle?.seek(toOffset: 0)
        try? handle?.write(contentsOf: Data(head(status).utf8))
      }
    }
    let ticker = Task {
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 5_000_000_000)
        if Task.isCancelled { break }
        rewrite("running")
      }
    }
    // Whether the hard timeout stopped it, as the killer's own answer (a flag shared by the two tasks would be a race).
    let killer = hardTimeoutMs.map { ms in
      Task { () -> Bool in
        let left = max(0, ms - Int(Date().timeIntervalSince(started) * 1000))
        try? await Task.sleep(nanoseconds: UInt64(left) * 1_000_000)
        if Task.isCancelled { return false }
        process.terminate()
        return true
      }
    }
    Task { [weak self] in
      let exit = await process.waitForExit()
      ticker.cancel()
      killer?.cancel()
      if await killer?.value == true {
        rewrite("aborted")
      } else {
        // Ended by a signal it has no code: "failed", and "unknown" at its foot, as Node's null code is written.
        let code = exit.code.map { Int($0) }
        rewrite(code == 0 ? "succeeded" : "failed")
        let foot = TerminalFile.foot(exitCode: code, elapsedMs: Int(Date().timeIntervalSince(started) * 1000), endedAt: Date())
        writer.async {
          _ = try? handle?.seekToEnd()
          try? handle?.write(contentsOf: Data(foot.utf8))
        }
        shell.adopt(stateOutput: process.stateOutput)
      }
      writer.async { try? handle?.close() }
      self?.ended(shellId)
    }
    return shellId
  }

  private func ended(_ shellId: Int) {
    lock.lock(); running[shellId] = nil; lock.unlock()
  }

  /** Simeon quit or signed out: the commands it holds are stopped (the Electron daemon left them running). */
  func stopAll() {
    lock.lock()
    let all = Array(running.values)
    running = [:]
    lock.unlock()
    for process in all { process.terminate() }
  }
}

/**
 * A command with its output streamed (`shellStreamArgs`): the folder
 * notice, `start`, the output, then its `exit`; or, once it has held the
 * stream as long as it may, `backgrounded` and its terminal file. A cancel
 * before that stops it; after, it goes on.
 */
struct ShellStreamRun {
  let args: JSON
  let root: String
  let shell: ZshHost
  let background: BackgroundShells
  let requestId: String
  let provider: LocalHandsProvider
  let started: Date
  let send: (JSON) async -> Void

  func run() async throws {
    let command = args["command"]?.string ?? ""
    let folder = LocalToolRules.workingDirectory(requested: args["workingDirectory"]?.string ?? "", root: root) { LocalHandsProvider.isDirectory($0) }
    if let notice = folder.notice { await send(LocalExecWire.shellOutput("stderr", notice)) }
    await send(LocalExecWire.shellStart)
    let backgroundBehavior = args["timeoutBehavior"]?.string == "TIMEOUT_BEHAVIOR_BACKGROUND"
    // Only a hard timeout above 0 is one (`args.hardTimeout > 0`).
    let hardTimeout = args["hardTimeout"]?.int.flatMap { $0 > 0 ? $0 : nil }
    let block = LocalExec.blockMs(timeout: args["timeout"]?.int ?? 0, isBackground: args["isBackground"]?.bool == true, timeoutBehaviorBackground: backgroundBehavior, hardTimeout: hardTimeout)
    let pipeStdin = backgroundBehavior && args["closeStdin"]?.bool != true
    let cwd = folder.path.isEmpty ? shell.cwd : folder.path
    let process = try await shell.spawn(command: command, cwd: cwd, pipeStdin: pipeStdin)

    // Output in order, each stream's bytes read as UTF-8 across the pipe's pieces.
    let output = AsyncStream<JSON> { continuation in
      var decoders = ["stdout": UTF8Pieces(), "stderr": UTF8Pieces()]
      let lock = NSLock()
      process.onOutput { stream, data in
        lock.lock()
        let text = decoders[stream]?.take(data) ?? ""
        lock.unlock()
        if !text.isEmpty { continuation.yield(LocalExecWire.shellOutput(stream, text)) }
      }
      Task { _ = await process.waitForExit(); continuation.finish() }
    }
    let forwarding = Task { for await event in output { await send(event) } }

    enum Ending: Sendable { case exited, timedOut, cancelled }
    let ending: Ending = await withTaskGroup(of: Ending.self) { group in
      // The group waits for every child once one has won, so this wait lets go when cancelled (a command gone to the background runs on).
      group.addTask { _ = await process.exitUnlessCancelled(); return .exited }
      if backgroundBehavior || block > 0 {
        group.addTask {
          if block > 0 { try? await Task.sleep(nanoseconds: UInt64(block) * 1_000_000) }
          return Task.isCancelled ? .exited : .timedOut
        }
      }
      group.addTask {
        while !Task.isCancelled {
          if await provider.isCancelled(requestId) { return .cancelled }
          try? await Task.sleep(nanoseconds: 100_000_000)
        }
        return .exited
      }
      let first = await group.next() ?? .exited
      group.cancelAll()
      return first
    }

    switch ending {
    case .exited:
      let exit = await process.waitForExit()
      await forwarding.value
      shell.adopt(stateOutput: process.stateOutput)
      await send(LocalExecWire.shellExit(code: Int(exit.code ?? 0), cwd: shell.cwd, aborted: false, abortReason: nil, localMs: Int(Date().timeIntervalSince(started) * 1000)))
    case .cancelled:
      process.terminate()
      _ = await process.waitForExit()
      await forwarding.value
      await send(LocalExecWire.shellExit(code: -1, cwd: shell.cwd, aborted: true, abortReason: "SHELL_ABORT_REASON_USER_ABORT", localMs: Int(Date().timeIntervalSince(started) * 1000)))
    case .timedOut where backgroundBehavior:
      // What was already on its way goes first, so no output follows `backgrounded`.
      forwarding.cancel()
      await forwarding.value
      // Its terminal file starts with what it printed so far (`initialOutput`), and goes on.
      let shellId = background.adopt(process, command: command, cwd: cwd, title: args["description"]?.string, shell: shell, startedAt: started, hardTimeoutMs: hardTimeout)
      await send(LocalExecWire.shellBackgrounded(shellId: shellId, command: command, workingDirectory: cwd, pid: Int(process.pid), msToWait: block))
    case .timedOut:
      process.terminate()
      _ = await process.waitForExit()
      await forwarding.value
      await send(LocalExecWire.shellExit(code: -1, cwd: shell.cwd, aborted: true, abortReason: "SHELL_ABORT_REASON_TIMEOUT", localMs: Int(Date().timeIntervalSince(started) * 1000)))
    }
  }
}

/** UTF-8 read across pieces: a character cut between two reads waits for its end. */
struct UTF8Pieces {
  private var carry: [UInt8] = []

  mutating func take(_ data: Data) -> String {
    var bytes = carry + [UInt8](data)
    carry = []
    // Keep a trailing incomplete sequence (at most 3 bytes) for the next piece.
    var cut = bytes.count
    var back = 0
    while back < 3 && cut - back - 1 >= 0 {
      let byte = bytes[cut - back - 1]
      if byte & 0xC0 == 0x80 { back += 1; continue }
      let need = byte & 0xE0 == 0xC0 ? 2 : byte & 0xF0 == 0xE0 ? 3 : byte & 0xF8 == 0xF0 ? 4 : 1
      if need > back + 1 { cut = cut - back - 1 }
      break
    }
    if cut < bytes.count {
      carry = Array(bytes[cut...])
      bytes.removeSubrange(cut...)
    }
    return String(decoding: bytes, as: UTF8.self)
  }
}
