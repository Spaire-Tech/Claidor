import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/** A body Render's edge refuses is sent once more in base64; everything else is the answer as it came (12 November 2026). */
final class EdgeFirewallTests: XCTestCase {
  /** What the edge refused from the founder's Mac, in part: shell commands and a line of Python inside one. */
  static let refusedWords = "umask 077; az ad sp create-for-rbac --name simeon-server > ~/s.json\nAPP=$(python3 -c \"import json;print(json.load(open('$HOME/s.json'))['appId'])\")"

  static let blocked = HTTPAnswer(status: 403, headers: ["Content-Type": "text/html; charset=utf-8"], body: Data("<!DOCTYPE html><title>Blocked</title>".utf8))

  /** A send that answers each request in turn and keeps what it was sent. */
  final class Sends: @unchecked Sendable {
    private let lock = NSLock()
    private var answers: [HTTPAnswer]
    private(set) var requests: [URLRequest] = []
    init(_ answers: [HTTPAnswer]) { self.answers = answers }
    func send(_ request: URLRequest) async throws -> HTTPAnswer {
      lock.withLock {
        requests.append(request)
        return answers.isEmpty ? HTTPAnswer(status: 500) : answers.removeFirst()
      }
    }
  }

  func message() -> URLRequest {
    URLRequest.post(URL(string: "https://api.simeonlabs.com/sand-box/b1/p/1340/api/sendMessage")!, json: ["agentId": "theo", "text": .string(Self.refusedWords)], headers: ["authorization": "Bearer gw"])
  }

  func testARefusedBodyIsSentAgainInBase64WithItsOwnType() async throws {
    let sends = Sends([Self.blocked, HTTPAnswer(status: 200, headers: ["content-type": "application/json"], body: Data("{}".utf8))])
    let request = message()
    let answer = try await EdgeFirewall.send(request, via: sends.send)
    XCTAssertEqual(answer.status, 200)
    XCTAssertEqual(sends.requests.count, 2)
    let again = sends.requests[1]
    XCTAssertEqual(again.value(forHTTPHeaderField: "x-simeon-body"), "base64")
    XCTAssertEqual(again.value(forHTTPHeaderField: "x-simeon-content-type"), "application/json")
    XCTAssertEqual(again.value(forHTTPHeaderField: "content-type"), "text/plain")
    XCTAssertEqual(again.value(forHTTPHeaderField: "authorization"), "Bearer gw", "the rest of the request is the same")
    XCTAssertEqual(again.url, request.url)
    XCTAssertEqual(again.httpMethod, "POST")
    let decoded = try XCTUnwrap(Data(base64Encoded: try XCTUnwrap(again.httpBody)))
    XCTAssertEqual(decoded, request.httpBody, "the server reads the message exactly as it was written")
    XCTAssertFalse(String(decoding: try XCTUnwrap(again.httpBody), as: UTF8.self).contains("python3"), "the edge sees none of the words")
    XCTAssertTrue(RecentActivity.all.contains { $0.contains("edge refused POST /sand-box/b1/p/1340/api/sendMessage: sent again in base64, answered 200") })
  }

  func testEveryOtherAnswerIsKeptAsItCame() async throws {
    // The server's and the computer's own refusals are JSON: they are answers, not the edge.
    let refusedByUs = HTTPAnswer(status: 403, headers: ["content-type": "application/json"], body: Data(#"{"error":"Not allowed"}"#.utf8))
    for answer in [refusedByUs, HTTPAnswer(status: 200), HTTPAnswer(status: 502, headers: ["content-type": "text/html"])] {
      let sends = Sends([answer])
      let got = try await EdgeFirewall.send(message(), via: sends.send)
      XCTAssertEqual(got.status, answer.status)
      XCTAssertEqual(sends.requests.count, 1)
    }
  }

  func testTheEdgesPageIsKnownByItsTypeOrItsFirstWords() {
    XCTAssertTrue(EdgeFirewall.refused(Self.blocked))
    XCTAssertTrue(EdgeFirewall.refused(HTTPAnswer(status: 403, body: Data("  <!DOCTYPE html><title>Blocked</title>".utf8))))
    XCTAssertFalse(EdgeFirewall.refused(HTTPAnswer(status: 403, headers: ["content-type": "application/json"], body: Data(#"{"error":"no"}"#.utf8))))
    XCTAssertFalse(EdgeFirewall.refused(HTTPAnswer(status: 502, headers: ["content-type": "text/html"])))
  }

  func testOnlyOnceAndNeverWithoutABody() async throws {
    // Refused again in base64: that answer is the answer, with no third try.
    let twice = Sends([Self.blocked, Self.blocked])
    let answer = try await EdgeFirewall.send(message(), via: twice.send)
    XCTAssertTrue(EdgeFirewall.refused(answer))
    XCTAssertEqual(twice.requests.count, 2)

    var read = URLRequest(url: URL(string: "https://api.simeonlabs.com/desktop/api/user/profile")!)
    read.httpMethod = "GET"
    let empty = Sends([Self.blocked])
    _ = try await EdgeFirewall.send(read, via: empty.send)
    XCTAssertEqual(empty.requests.count, 1, "nothing to encode")

    var huge = message()
    huge.httpBody = Data(count: EdgeFirewall.largestResent + 1)
    XCTAssertNil(EdgeFirewall.encoded(huge), "past what the server reads encoded")
  }
}
