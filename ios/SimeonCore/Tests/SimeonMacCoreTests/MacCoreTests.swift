import Foundation
import XCTest
@testable import SimeonMacCore

final class DeepLinkTests: XCTestCase {
  private let schemes = ["simeon", "simeon-mac"]

  private func route(_ raw: String) -> DeepLink.Route? { DeepLink.parse(raw, schemes: schemes)?.route }

  func testTheElectronAppsRoutes() {
    XCTAssertEqual(DeepLink.parse("simeon://app/v1/open", schemes: schemes), DeepLink(route: .open, source: .scheme))
    XCTAssertEqual(route("simeon-mac://app/v1/open"), .open)
    XCTAssertEqual(route("SIMEON-MAC://app/v1/open"), .open)
    XCTAssertEqual(route("simeon://app/v1/info?topic=deep-links"), .info(topic: "deep-links"))
    XCTAssertEqual(route("simeon://app/v1/plugin/add?id=42"), .pluginAdd(id: "42"))
    XCTAssertEqual(route("simeon://app/v1/plugin/add?id=1234567890123456789"), .pluginAdd(id: "1234567890123456789"))
    XCTAssertEqual(DeepLink.parse("https://app.simeonlabs.com/sand/link/v1/open", schemes: schemes), DeepLink(route: .open, source: .https))
    XCTAssertEqual(route("https://app.simeonlabs.com/sand/link/v1/plugin/add?id=7"), .pluginAdd(id: "7"))
    XCTAssertEqual(route("https://app.simeonlabs.com/sand/link/v1/info?topic=deep-links"), .info(topic: "deep-links"))
    // An empty piece of the query is no key, as the browser reads it.
    XCTAssertEqual(route("simeon://app/v1/plugin/add?id=42&"), .pluginAdd(id: "42"))
  }

  func testWhatTheElectronAppRefuses() {
    for raw in [
      "", "sand://app/v1/open", "simeon-ios://app/v1/open", "http://app.simeonlabs.com/sand/link/v1/open",
      "simeon://app/v1/open#x", "simeon://app/v1/open\\", "simeon://app/v1/open?x=1", "simeon://app/v1/%6Fpen",
      "simeon://app/v1/./open", "simeon://app/v1/../open", "simeon://APP/v1/open", "simeon://other/v1/open",
      "simeon://user@app/v1/open", "simeon://app:80/v1/open", "simeon://app/v1/open?%zz",
      "simeon://app/v1/plugin/add", "simeon://app/v1/plugin/add?id=", "simeon://app/v1/plugin/add?id=abc",
      "simeon://app/v1/plugin/add?id=12345678901234567890", "simeon://app/v1/plugin/add?id=1&id=2",
      "simeon://app/v1/plugin/add?id=1&x=2", "simeon://app/v1/info", "simeon://app/v1/info?topic=other",
      "simeon://app/v1/info?topic=deep-links&topic=deep-links", "https://evil.example/sand/link/v1/open",
      "https://app.simeonlabs.com/v1/open", "simeon://app/v1/op en", "simeon://app/v1/opén",
      "simeon://app/v1/" + String(repeating: "a", count: 2_100),
    ] {
      XCTAssertNil(DeepLink.parse(raw, schemes: schemes), raw)
    }
  }

  func testCanonical() {
    XCTAssertEqual(DeepLink(route: .open, source: .https).canonical(scheme: "simeon"), "simeon://app/v1/open")
    XCTAssertEqual(DeepLink(route: .pluginAdd(id: "42"), source: .scheme).canonical(scheme: "simeon-mac"), "simeon-mac://app/v1/plugin/add?id=42")
    XCTAssertEqual(DeepLink(route: .info(topic: "deep-links"), source: .scheme).canonical(scheme: "simeon"), "simeon://app/v1/info?topic=deep-links")
  }
}

final class SidebarOrderTests: XCTestCase {
  private let order = ["simeon", "theo", "iris", "launch-squad"]

  func testNumbers() {
    XCTAssertEqual(SidebarOrder.agent(number: 1, in: order), "simeon")
    XCTAssertEqual(SidebarOrder.agent(number: 4, in: order), "launch-squad")
    XCTAssertNil(SidebarOrder.agent(number: 5, in: order))
    XCTAssertNil(SidebarOrder.agent(number: 0, in: order))
    XCTAssertNil(SidebarOrder.agent(number: 10, in: Array(repeating: "a", count: 12)))
  }

  func testNeighbours() {
    XCTAssertEqual(SidebarOrder.neighbour(of: "theo", in: order, step: 1), "iris")
    XCTAssertEqual(SidebarOrder.neighbour(of: "theo", in: order, step: -1), "simeon")
    XCTAssertNil(SidebarOrder.neighbour(of: "simeon", in: order, step: -1))
    XCTAssertNil(SidebarOrder.neighbour(of: "launch-squad", in: order, step: 1))
    XCTAssertEqual(SidebarOrder.neighbour(of: nil, in: order, step: 1), "simeon")
    XCTAssertEqual(SidebarOrder.neighbour(of: nil, in: order, step: -1), "launch-squad")
    XCTAssertEqual(SidebarOrder.neighbour(of: "hidden-one", in: order, step: 1), "simeon")
    XCTAssertNil(SidebarOrder.neighbour(of: "theo", in: [], step: 1))
  }
}
