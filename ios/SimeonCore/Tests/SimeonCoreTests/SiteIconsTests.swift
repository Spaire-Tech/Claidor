import Foundation
import XCTest
@testable import SimeonCore

/**
 * A saved login's site icon (`SiteIcons`, CredentialsStore.swift; the
 * founder, 13 November 2026: "theres an issue with the favicon of the saved
 * logins in the mac and iphone. they dont all appear. some do others dont. in
 * windows they all appear"). Every site here is a stand-in: nothing is read
 * from the network.
 */
final class SiteIconsTests: XCTestCase {
  private static let png = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4])

  /** What a stand-in site was asked, in order. */
  private actor Asked {
    private(set) var pages: [String] = []
    private(set) var icons: [String] = []
    func page(_ site: String) { pages.append(site) }
    func icon(_ address: String) { icons.append(address) }
  }

  private func folder() -> URL {
    let made = FileManager.default.temporaryDirectory.appendingPathComponent("site-icons-test-\(UUID().uuidString)", isDirectory: true)
    addTeardownBlock { try? FileManager.default.removeItem(at: made) }
    return made
  }

  /** A stand-in site: its page's head, and what each address gives. */
  private func source(_ asked: Asked, html: String?, pageUnreachable: Bool = false, draws: Bool = true,
                      answers: [String: LinkMetadataReader.IconAnswer]) -> SiteIcons.Source {
    SiteIcons.Source(
      page: { site in
        await asked.page(site)
        if pageUnreachable { return .unreachable }
        guard let html else { return .none }
        return .page(html: html, finalURL: URL(string: "https://www.\(site)/")!)
      },
      icon: { address in
        await asked.icon(address)
        return answers[address] ?? .none("status 404")
      },
      draw: { draws ? $0 : nil })
  }

  func testAnIPv4AddressCarriedInAnIPv6OneIsJudgedAsTheIPv4One() {
    // What a phone network without IPv4 gives for a site that has only IPv4 (NAT64): 140.82.121.3 here.
    XCTAssertFalse(LinkPreviewPolicy.isBlockedIP("64:ff9b::8c52:7903"))
    XCTAssertFalse(LinkPreviewPolicy.isBlockedIP("64:ff9b::140.82.121.3"))
    // The private addresses stay refused, however they are written.
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("64:ff9b::a00:1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("64:ff9b::192.168.1.1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("64:ff9b::7f00:1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("::ffff:192.168.0.1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("::ffff:10.0.0.1"))
    XCTAssertFalse(LinkPreviewPolicy.isBlockedIP("::ffff:8.8.8.8"))
    // The range kept for a network's own use stays refused whole.
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("64:ff9b:1::8c52:7903"))
    // An address written in a link is judged the same way.
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://[::ffff:192.168.0.1]/"))
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://[64:ff9b::a00:1]/"))
  }

  func testEveryIconAPageNamesIsReadTouchIconsFirst() {
    let html = """
      <head>
      <link rel="mask-icon" href="/mask.svg" color="#000">
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <link rel="alternate icon" type="image/png" href="/favicon.png?v=1&amp;s=32">
      <LINK REL='Shortcut Icon' HREF='/old.ico'>
      <link rel="icon" href="/fourth.png">
      <link rel="stylesheet" href="/site.css">
      <link rel="apple-touch-icon" sizes="180x180" href=/touch.png>
      <link rel="apple-touch-icon-precomposed" href="/touch-pre.png">
      <link rel="icon" href="">
      </head>
      """
    XCTAssertEqual(LinkPreviewPolicy.iconHrefs(html), ["/touch.png", "/touch-pre.png", "/favicon.svg", "/favicon.png?v=1&s=32", "/old.ico"])
    XCTAssertEqual(LinkPreviewPolicy.iconHrefs(html, perKind: 1), ["/touch.png", "/favicon.svg"])
    XCTAssertEqual(LinkPreviewPolicy.iconHrefs("<p>no head</p>"), [])
  }

  func testAPictureIsJudgedByItsFirstBytes() {
    XCTAssertEqual(LinkPreviewPolicy.pictureKind(Self.png), "png")
    XCTAssertEqual(LinkPreviewPolicy.pictureKind(Data([0xFF, 0xD8, 0xFF, 0xE0, 0, 0])), "jpeg")
    XCTAssertEqual(LinkPreviewPolicy.pictureKind(Data("GIF89a....".utf8)), "gif")
    XCTAssertEqual(LinkPreviewPolicy.pictureKind(Data("RIFF".utf8) + Data([1, 2, 3, 4]) + Data("WEBPVP8 ".utf8)), "webp")
    XCTAssertEqual(LinkPreviewPolicy.pictureKind(Data([0, 0, 1, 0, 1, 0, 16, 16])), "ico")
    XCTAssertEqual(LinkPreviewPolicy.pictureKind(Data([0, 0, 2, 0, 1, 0, 16, 16])), "ico")
    XCTAssertEqual(LinkPreviewPolicy.pictureKind(Data([0, 0, 0, 0x1C]) + Data("ftypavif".utf8) + Data([0, 0])), "avif")
    // An SVG and a page of words are none this device draws.
    XCTAssertNil(LinkPreviewPolicy.pictureKind(Data("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>".utf8)))
    XCTAssertNil(LinkPreviewPolicy.pictureKind(Data("<!doctype html><html></html>".utf8)))
    XCTAssertNil(LinkPreviewPolicy.pictureKind(Data("RIFF".utf8) + Data([1, 2, 3, 4]) + Data("WAVEfmt ".utf8)))
    XCTAssertNil(LinkPreviewPolicy.pictureKind(Data()))
  }

  func testTheNextIconIsTriedWhenTheFirstIsNoneThisDeviceDraws() async {
    let asked = Asked()
    let html = #"<link rel="icon" href="/icon.svg"><link rel="alternate icon" href="/icon.png">"#
    let place = folder()
    let icons = SiteIcons(cacheDir: place, source: source(asked, html: html, answers: [
      "https://www.acme.com/icon.svg": .none("svg"),
      "https://www.acme.com/icon.png": .picture(Self.png),
    ]))
    let found = await icons.icon(for: "https://www.acme.com/login")
    XCTAssertEqual(found, Self.png)
    let pages = await asked.pages
    let addresses = await asked.icons
    XCTAssertEqual(pages, ["acme.com"])
    XCTAssertEqual(addresses, ["https://www.acme.com/icon.svg", "https://www.acme.com/icon.png"])
    // Asked again: the answer of this run, nothing read.
    let again = await icons.icon(for: "acme.com")
    XCTAssertEqual(again, Self.png)
    let after = await asked.icons
    XCTAssertEqual(after.count, 2)
    // Another run: the copy on disk, the site not asked.
    let later = Asked()
    let kept = await SiteIcons(cacheDir: place, source: source(later, html: nil, answers: [:])).icon(for: "acme.com")
    XCTAssertEqual(kept, Self.png)
    let laterPages = await later.pages
    XCTAssertEqual(laterPages, [])
  }

  func testAPictureThisDeviceCannotDrawIsPassedOver() async {
    let asked = Asked()
    let icons = SiteIcons(cacheDir: folder(), source: source(asked, html: #"<link rel="icon" href="/odd.png">"#, draws: false, answers: [
      "https://www.acme.com/odd.png": .picture(Self.png),
      "https://www.acme.com/favicon.ico": .picture(Self.png),
    ]))
    let found = await icons.icon(for: "acme.com")
    XCTAssertNil(found)
    let addresses = await asked.icons
    XCTAssertEqual(addresses, ["https://www.acme.com/odd.png", "https://www.acme.com/favicon.ico", "https://acme.com/favicon.ico"])
  }

  func testTheSitesOwnFaviconIsAskedWhenItsPageNamesNone() async {
    let asked = Asked()
    let icons = SiteIcons(cacheDir: folder(), source: source(asked, html: "<title>Acme</title>", answers: [
      "https://acme.com/favicon.ico": .picture(Self.png),
    ]))
    let found = await icons.icon(for: "acme.com")
    XCTAssertEqual(found, Self.png)
    let addresses = await asked.icons
    XCTAssertEqual(addresses, ["https://www.acme.com/favicon.ico", "https://acme.com/favicon.ico"])
  }

  func testNoneIsKeptADayWhenTheSiteAnsweredEveryRequest() async throws {
    let place = folder()
    let clock = LockedBox(Date())
    let asked = Asked()
    RecentActivity.clear()
    let icons = SiteIcons(cacheDir: place, source: source(asked, html: nil, answers: [:]), now: { clock.withLock { $0 } })
    let first = await icons.icon(for: "acme.com")
    XCTAssertNil(first)
    // The reason is written, never the site.
    let line = try XCTUnwrap(RecentActivity.all.last)
    XCTAssertTrue(line.contains("site icon: none (no page, status 404)"), line)
    XCTAssertFalse(line.contains("acme"), line)
    // The same run, and another run within the day: not asked again.
    _ = await icons.icon(for: "acme.com")
    let another = Asked()
    _ = await SiteIcons(cacheDir: place, source: source(another, html: nil, answers: [:]), now: { clock.withLock { $0 } }).icon(for: "acme.com")
    let once = await asked.pages
    let none = await another.pages
    XCTAssertEqual(once, ["acme.com"])
    XCTAssertEqual(none, [])
    // A day later the site has an icon: it is asked again, in the same run and in a new one.
    clock.withLock { $0 = $0.addingTimeInterval(SiteIcons.noneTTL + 60) }
    _ = await icons.icon(for: "acme.com")
    let twice = await asked.pages
    XCTAssertEqual(twice, ["acme.com", "acme.com"])
    let fresh = Asked()
    let found = await SiteIcons(cacheDir: place, source: source(fresh, html: nil, answers: ["https://acme.com/favicon.ico": .picture(Self.png)]),
                                now: { clock.withLock { $0 } }).icon(for: "acme.com")
    XCTAssertEqual(found, Self.png)
  }

  func testAReadWithoutAnAnswerIsNotKeptAndIsTriedAgainFiveMinutesLater() async throws {
    let place = folder()
    let clock = LockedBox(Date())
    let asked = Asked()
    RecentActivity.clear()
    // The page had no answer (no connection); /favicon.ico was refused: not the site's last word.
    let icons = SiteIcons(cacheDir: place, source: source(asked, html: nil, pageUnreachable: true, answers: [:]), now: { clock.withLock { $0 } })
    let first = await icons.icon(for: "acme.com")
    XCTAssertNil(first)
    XCTAssertTrue(try XCTUnwrap(RecentActivity.all.last).contains("none for now"))
    let files = (try? FileManager.default.contentsOfDirectory(atPath: place.path)) ?? []
    XCTAssertEqual(files, [], "nothing is written for a read that had no answer")
    // Within five minutes the row is drawn again: not asked.
    clock.withLock { $0 = $0.addingTimeInterval(60) }
    _ = await icons.icon(for: "acme.com")
    let once = await asked.pages
    XCTAssertEqual(once, ["acme.com"])
    // After five minutes it is.
    clock.withLock { $0 = $0.addingTimeInterval(SiteIcons.retryAfter) }
    _ = await icons.icon(for: "acme.com")
    let twice = await asked.pages
    XCTAssertEqual(twice, ["acme.com", "acme.com"])
    // Another run (the connection is back): asked at once, and the icon kept.
    let back = Asked()
    let found = await SiteIcons(cacheDir: place, source: source(back, html: #"<link rel="apple-touch-icon" href="/touch.png">"#,
                                                               answers: ["https://www.acme.com/touch.png": .picture(Self.png)])).icon(for: "acme.com")
    XCTAssertEqual(found, Self.png)
  }

  func testAnUnansweredIconAmongAnsweredOnesIsNotKeptAsNone() async {
    let place = folder()
    let asked = Asked()
    let icons = SiteIcons(cacheDir: place, source: source(asked, html: #"<link rel="icon" href="/slow.png">"#, answers: [
      "https://www.acme.com/slow.png": .unreachable,
    ]))
    let found = await icons.icon(for: "acme.com")
    XCTAssertNil(found)
    let files = (try? FileManager.default.contentsOfDirectory(atPath: place.path)) ?? []
    XCTAssertEqual(files, [])
  }

  func testASiteAskedForTwiceAtOnceIsReadOnce() async {
    let asked = Asked()
    let icons = SiteIcons(cacheDir: folder(), source: source(asked, html: nil, answers: ["https://acme.com/favicon.ico": .picture(Self.png)]))
    async let one = icons.icon(for: "acme.com")
    async let two = icons.icon(for: "www.acme.com")
    let both = await [one, two]
    XCTAssertEqual(both, [Self.png, Self.png])
    let pages = await asked.pages
    XCTAssertEqual(pages, ["acme.com"])
    let nothing = await icons.icon(for: "not a site")
    XCTAssertNil(nothing)
  }
}
