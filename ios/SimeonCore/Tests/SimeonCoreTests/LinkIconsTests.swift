import Foundation
import XCTest
@testable import SimeonCore

/** The site's icon before a link (LinkIcons.swift; the founder, 29 October 2026: "for each link sent in chat, put next to it the favicon"). */
final class LinkIconsTests: XCTestCase {
  func testALinkGoesToItsSiteAndAnEmailsPageToNone() {
    XCTAssertEqual(LinkIcons.site(of: URL(string: "https://tv.youtube.com/settings/membership")!), "tv.youtube.com")
    XCTAssertEqual(LinkIcons.site(of: URL(string: "https://www.GitHub.com/simeon")!), "github.com")
    XCTAssertEqual(LinkIcons.site(of: URL(string: "http://example.org")!), "example.org")
    // An email's page has no icon (22 October 2026: "remove that gmail logo").
    XCTAssertNil(LinkIcons.site(of: URL(string: "https://mail.google.com/mail/u/0/#inbox/1890")!))
    XCTAssertNil(LinkIcons.site(of: URL(string: "https://outlook.office.com/mail/id/AAQk")!))
    XCTAssertNil(LinkIcons.site(of: URL(string: "https://outlook.live.com/mail/0/inbox")!))
    // No website: nothing to read.
    XCTAssertNil(LinkIcons.site(of: URL(string: "mailto:theo@example.com")!))
    XCTAssertNil(LinkIcons.site(of: URL(string: "simeon://agent/a1")!))
    XCTAssertNil(LinkIcons.site(of: URL(string: "https://localhost/x")!))
  }

  @MainActor
  func testAnIconIsAskedForOncePerSiteAndRedrawsTheWordsWhenItComes() async {
    let asked = Asked()
    let icons = LinkIcons { site in
      await asked.add(site)
      return site == "github.com" ? Data([1, 2, 3]) : nil
    }
    let github = URL(string: "https://github.com/simeon")!
    XCTAssertNil(icons.icon(for: github), "not read yet")
    XCTAssertNil(icons.icon(for: URL(string: "https://www.github.com/other")!), "the same site, asked for once")
    XCTAssertNil(icons.icon(for: URL(string: "https://example.org")!))
    await waitUntil { icons.generation == 1 }
    XCTAssertEqual(icons.icon(for: github)?.data, Data([1, 2, 3]))
    XCTAssertEqual(icons.icon(for: github)?.site, "github.com")
    await waitUntil { await asked.sites.count == 2 }
    XCTAssertNil(icons.icon(for: URL(string: "https://example.org/a")!), "a site without one has none")
    XCTAssertEqual(icons.generation, 1, "a site without an icon draws nothing again")
    let sites = await asked.sites
    XCTAssertEqual(sites.sorted(), ["example.org", "github.com"])
  }

  @MainActor
  private func waitUntil(_ condition: @MainActor () async -> Bool) async {
    for _ in 0..<200 {
      if await condition() { return }
      try? await Task.sleep(nanoseconds: 5_000_000)
    }
    XCTFail("never happened")
  }
}

private actor Asked {
  var sites: [String] = []
  func add(_ site: String) { sites.append(site) }
}
