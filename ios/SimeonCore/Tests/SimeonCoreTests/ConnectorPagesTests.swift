import Foundation
import XCTest
@testable import SimeonCore

/** The connector pages' words and links (ConnectorPages.swift). */
final class ConnectorPagesTests: XCTestCase {
  func testEveryWrittenPageHasThreeExamplesNamingItsConnectorAndSafeLinks() throws {
    for id in ConnectorPage.written {
      let page = try XCTUnwrap(ConnectorPage.page(for: id), id)
      XCTAssertFalse(page.maker.isEmpty, id)
      XCTAssertFalse(page.about.isEmpty, id)
      XCTAssertEqual(page.examples.count, 3, id)
      // Each example names an app the chat dresses with its logo (an everyday-word name, as Square, only after "in", "on", "from"…), so the card shows it as a message would.
      for example in page.examples {
        let apps = Mentions.find(in: example, agents: []).filter { if case .brand = $0.kind { return true }; return false }
        XCTAssertFalse(apps.isEmpty, "\(id): \(example)")
      }
      for link in [page.website, page.privacy, page.terms] {
        let url = try XCTUnwrap(link, id)
        XCTAssertEqual(url.scheme, "https", id)
      }
    }
    XCTAssertNil(ConnectorPage.page(for: "not-a-connector"))
  }

  func testALinkShowsItsHost() {
    XCTAssertEqual(ConnectorPage.shown(URL(string: "https://www.dropbox.com/privacy")!), "dropbox.com")
    XCTAssertEqual(ConnectorPage.shown(URL(string: "https://policies.google.com/terms")!), "policies.google.com")
  }
}
