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

  public func send(_ request: URLRequest) async throws -> HTTPAnswer {
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
