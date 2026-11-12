import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/** One HTTP answer, read whole. */
public struct HTTPAnswer: Sendable {
  public let status: Int
  public let headers: [String: String]
  public let body: Data

  public init(status: Int, headers: [String: String] = [:], body: Data = Data()) {
    self.status = status; self.headers = headers; self.body = body
  }

  public var ok: Bool { (200..<300).contains(status) }
  public var json: JSON? { try? JSON.parse(body) }

  public func header(_ name: String) -> String? {
    headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
  }
}

/** How the app talks HTTP: URLSession in the app, a script in the tests. */
public protocol HTTPClient: Sendable {
  func send(_ request: URLRequest) async throws -> HTTPAnswer
}

public struct URLSessionClient: HTTPClient {
  public let session: URLSession

  public init(session: URLSession = .shared) { self.session = session }

  /** `request` sent, and once more in base64 when the edge in front of Simeon Labs' server refuses its body (`EdgeFirewall`). */
  public func send(_ request: URLRequest) async throws -> HTTPAnswer {
    try await EdgeFirewall.send(request, via: sendOnce)
  }

  private func sendOnce(_ request: URLRequest) async throws -> HTTPAnswer {
    try await withCheckedThrowingContinuation { continuation in
      let task = session.dataTask(with: request) { data, response, error in
        if let error { continuation.resume(throwing: error); return }
        let http = response as? HTTPURLResponse
        var headers: [String: String] = [:]
        for (key, value) in http?.allHeaderFields ?? [:] { headers[String(describing: key)] = String(describing: value) }
        continuation.resume(returning: HTTPAnswer(status: http?.statusCode ?? 0, headers: headers, body: data ?? Data()))
      }
      task.resume()
    }
  }
}

/**
 * Render's edge firewall, in front of Simeon Labs' server, reads the start of
 * each request's body and refuses words that look like an attack (shell
 * commands, code) with its own HTML page, a 403 titled "Blocked", before the
 * request reaches the server. Measured from the founder's Mac on 12 November
 * 2026: a long message with commands in it was refused, and it said "Failed
 * to send" again on every resend; "hello" passed, and so did the same message
 * in base64. The server reads a body sent in base64 as it was written
 * (`EncodedBodyMiddleware` in server/simeon/middlewares.py), so a body the
 * edge refused is sent once more that way. Every other answer is kept as it
 * came. The engine does the same for its model calls, with gzip
 * (`isEdgeRefusal` in provider-session.ts).
 */
public enum EdgeFirewall {
  /** The body's encoding, for the server: "base64". */
  public static let encodingHeader = "x-simeon-body"
  /** The body's own type, which the server puts back. */
  public static let typeHeader = "x-simeon-content-type"
  /** The largest body sent again: the server reads 16 MB of base64 at most, which is 12 MB before. */
  public static let largestResent = 12 << 20

  /** The edge's refusal: a 403 with an HTML page, by its type or its first words. The server and the computers behind it answer JSON. */
  public static func refused(_ answer: HTTPAnswer) -> Bool {
    guard answer.status == 403 else { return false }
    if (answer.header("content-type") ?? "").lowercased().contains("text/html") { return true }
    let start = String(decoding: answer.body.prefix(64), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return start.hasPrefix("<!doctype html") || start.hasPrefix("<html")
  }

  /** `request` with its body in base64 and its own type named; nil when it has no body, one too large, or is encoded already. */
  public static func encoded(_ request: URLRequest) -> URLRequest? {
    guard let body = request.httpBody, !body.isEmpty, body.count <= largestResent,
          request.value(forHTTPHeaderField: encodingHeader) == nil else { return nil }
    var again = request
    again.httpBody = Data(body.base64EncodedString().utf8)
    again.setValue(request.value(forHTTPHeaderField: "content-type") ?? "application/json", forHTTPHeaderField: typeHeader)
    again.setValue("base64", forHTTPHeaderField: encodingHeader)
    again.setValue("text/plain", forHTTPHeaderField: "content-type")
    return again
  }

  /** `request` sent by `send`, and once more in base64 when the edge refused its body: the edge stopped it, so it was never done. */
  public static func send(_ request: URLRequest, via send: (URLRequest) async throws -> HTTPAnswer) async throws -> HTTPAnswer {
    let answer = try await send(request)
    guard refused(answer), let again = encoded(request) else { return answer }
    let second = try await send(again)
    RecentActivity.note("edge refused \(request.httpMethod ?? "POST") \(request.url?.path ?? ""): sent again in base64, answered \(second.status)")
    return second
  }
}

extension URLRequest {
  /** A request with a JSON body. */
  public static func post(_ url: URL, json: JSON, headers: [String: String] = [:]) -> URLRequest {
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = try? json.data()
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    request.setValue("application/json", forHTTPHeaderField: "accept")
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    return request
  }
}
