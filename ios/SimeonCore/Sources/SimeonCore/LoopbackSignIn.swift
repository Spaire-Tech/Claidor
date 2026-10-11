import Foundation
#if canImport(Network)
import Network
#endif

/**
 * A connected app whose vendor sends a sign-in back only to
 * `http://localhost:8787/callback` (11 October 2026, the founder: "the
 * canva authentification link isnt working"). Canva, Square, Vercel and
 * Dropbox refuse Simeon Labs' hosted return address
 * (`https://api.simeonlabs.com/desktop/mcp-oauth/callback`), so the cloud
 * computer asks them for the loopback instead (`loopbackOnly` in
 * desktop/source/shared/node/vendor-mcp/catalog.ts), and the app that
 * opened the sign-in sheet listens there while the sheet is open: the
 * vendor's page lands on this iPhone's (or this Mac's) own loopback, the app
 * hands the code to the computer (`completeMcpOAuth`, what the web's
 * `/app/connected.html` does) and sends the sheet on to the app's own
 * address, which closes it. The Electron Mac app has listened there since
 * the start (desktop/source/shared/node/mcp/mcp-oauth-loopback.ts).
 */
public enum LoopbackSignIn {
  public static let port: UInt16 = 8787
  public static let path = "/callback"
  public static let address = "http://localhost:8787/callback"

  /** What the vendor sent back: the code, or its refusal, with the sign-in's state. */
  public struct Answer: Equatable, Sendable {
    public let state: String
    public let code: String?
    public let error: String?
    public let errorDescription: String?

    public init(state: String, code: String?, error: String?, errorDescription: String?) {
      self.state = state; self.code = code; self.error = error; self.errorDescription = errorDescription
    }
  }

  /** The sign-in's state when its page returns to the loopback (its `redirect_uri`); nil for every other sign-in. */
  public static func state(returningHere url: URL) -> String? {
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    guard let redirect = items.first(where: { $0.name == "redirect_uri" })?.value, isLoopback(redirect) else { return nil }
    guard let state = items.first(where: { $0.name == "state" })?.value, !state.isEmpty else { return nil }
    return state
  }

  static func isLoopback(_ redirect: String) -> Bool {
    guard let url = URLComponents(string: redirect) else { return false }
    return url.scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host ?? "") && url.port == Int(port) && url.path == path
  }

  /** The callback in a request's head (`GET /callback?code=…&state=… HTTP/1.1`); nil for anything else (the favicon). */
  public static func answer(requestHead: String) -> Answer? {
    guard let line = requestHead.split(whereSeparator: \.isNewline).first else { return nil }
    let parts = line.split(separator: " ")
    guard parts.count >= 2, parts[0] == "GET", let target = URLComponents(string: "http://localhost\(parts[1])"), target.path == path else { return nil }
    let items = target.queryItems ?? []
    func value(_ name: String) -> String? {
      guard let found = items.first(where: { $0.name == name })?.value, !found.isEmpty else { return nil }
      return found
    }
    guard let state = value("state") else { return nil }
    // The sentence comes form-encoded ("An+unexpected+error", Miro's); the code is left as sent.
    return Answer(state: state, code: value("code"), error: value("error"), errorDescription: value("error_description")?.replacingOccurrences(of: "+", with: " "))
  }

  /** The answer to the sheet: on to `location`, the app's own address, which closes it. */
  public static func redirect(to location: String) -> Data {
    Data("HTTP/1.1 302 Found\r\nLocation: \(location)\r\nCache-Control: no-store\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8)
  }

  /** The answer to anything that is not this sign-in's callback. */
  public static let notFound = Data("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8)

  /** Why the listener could not start: another app holds the address (on a Mac, the Electron app's own sign-in). */
  public static func busyMessage(_ name: String) -> String {
    "\(name)'s sign-in comes back to localhost:8787, and another app is using it. Quit the other Simeon app and try again."
  }
}

extension AppStore {
  /**
   * A loopback sign-in's answer, handed to the computer that started it:
   * the code for the credential (`completeMcpOAuth`), or the vendor's
   * refusal said. The list is read again after, so the sheet's own wait
   * sees the app connected.
   */
  public func finishLoopbackSignIn(_ answer: LoopbackSignIn.Answer, name: String) async {
    if let refused = answer.error {
      problem = answer.errorDescription ?? "\(name) refused the sign-in (\(refused))."
      return
    }
    guard let code = answer.code, let backend else { return }
    do {
      _ = try await backend.command("completeMcpOAuth", ["stateId": .string(answer.state), "code": .string(code)])
      await loadApps()
    } catch {
      problem = "Couldn't finish connecting \(name): \(error.localizedDescription)"
    }
  }
}

#if canImport(Network)
/**
 * The loopback listener for one sign-in: it answers this sign-in's
 * callback once (on to `finish`), refuses everything else, and stops when
 * the sheet does.
 */
public final class LoopbackCatcher: @unchecked Sendable {
  private let listener: NWListener
  private let queue = DispatchQueue(label: "com.simeonlabs.simeon.loopback-sign-in")
  private let state: String
  private let finish: String
  // Read and written on `queue` only.
  private var started: CheckedContinuation<Bool, Never>?
  private var waiting: CheckedContinuation<LoopbackSignIn.Answer?, Never>?
  private var caught: LoopbackSignIn.Answer?
  private var stopped = false

  /**
   * Listening for the sign-in whose state is `state`; nil when the address
   * stays taken. Tried five times over about a second: the listener of a
   * sign-in this one replaced may still be letting go of it.
   */
  public static func start(state: String, finish: String) async -> LoopbackCatcher? {
    for attempt in 0..<5 {
      if attempt > 0 { try? await Task.sleep(nanoseconds: 250_000_000) }
      guard let catcher = try? LoopbackCatcher(state: state, finish: finish) else { continue }
      if await catcher.ready() { return catcher }
      catcher.stop()
    }
    return nil
  }

  private init(state: String, finish: String) throws {
    self.state = state
    self.finish = finish
    let parameters = NWParameters.tcp
    // This device's own loopback only (localhost is ::1 and 127.0.0.1): nothing on the network reaches it.
    parameters.requiredInterfaceType = .loopback
    parameters.acceptLocalOnly = true
    parameters.allowLocalEndpointReuse = true
    listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: LoopbackSignIn.port)!)
  }

  private func ready() async -> Bool {
    await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
      queue.async { [self] in
        self.started = continuation
        self.listener.stateUpdateHandler = { [weak self] state in
          guard let self else { return }
          switch state {
          case .ready: self.resumeStart(true)
          case .failed, .waiting, .cancelled: self.resumeStart(false)
          default: break
          }
        }
        self.listener.newConnectionHandler = { [weak self] connection in self?.serve(connection) }
        self.listener.start(queue: self.queue)
        // A listener that never says ready or failed does not hold the sheet back.
        self.queue.asyncAfter(deadline: .now() + 3) { [weak self] in self?.resumeStart(false) }
      }
    }
  }

  private func resumeStart(_ ok: Bool) {
    started?.resume(returning: ok)
    started = nil
  }

  /** The sign-in's answer once the vendor sends it; nil when the listener stops first. */
  public func answer() async -> LoopbackSignIn.Answer? {
    await withCheckedContinuation { (continuation: CheckedContinuation<LoopbackSignIn.Answer?, Never>) in
      queue.async {
        if let caught = self.caught { continuation.resume(returning: caught); return }
        if self.stopped { continuation.resume(returning: nil); return }
        self.waiting = continuation
      }
    }
  }

  /** Stop listening (the sheet closed, or the answer came). */
  public func stop() {
    queue.async {
      guard !self.stopped else { return }
      self.stopped = true
      self.listener.cancel()
      self.resumeStart(false)
      self.waiting?.resume(returning: nil)
      self.waiting = nil
    }
  }

  private func serve(_ connection: NWConnection) {
    connection.start(queue: queue)
    read(connection, head: Data())
  }

  /** The request's head, read until its first line is whole (the callback is a GET with no body). */
  private func read(_ connection: NWConnection, head: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, complete, error in
      guard let self else { connection.cancel(); return }
      var head = head
      if let data { head.append(data) }
      let text = String(decoding: head, as: UTF8.self)
      if !text.contains("\n"), !complete, error == nil, head.count < 16_384 {
        self.read(connection, head: head)
        return
      }
      guard let answer = LoopbackSignIn.answer(requestHead: text), answer.state == self.state, self.caught == nil else {
        self.reply(connection, LoopbackSignIn.notFound)
        return
      }
      self.caught = answer
      self.reply(connection, LoopbackSignIn.redirect(to: self.finish))
      self.waiting?.resume(returning: answer)
      self.waiting = nil
    }
  }

  private func reply(_ connection: NWConnection, _ data: Data) {
    connection.send(content: data, completion: .contentProcessed { _ in connection.cancel() })
  }
}
#endif
