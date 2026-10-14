import Foundation
import XCTest
@testable import SimeonCore

/** Every connector has its app icon, found by any of its names (14 October 2026: "i want all logo. some are missing"). */
final class ConnectorIconsTests: XCTestCase {
  func testEveryConnectorHasItsIconInTheApp() throws {
    let assets = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
      .appendingPathComponent("Simeon/Assets.xcassets/AppIcons")
    XCTAssertEqual(GeneratedAppIcons.connectors.count, 87)
    for (id, _) in GeneratedAppIcons.connectors {
      let png = assets.appendingPathComponent("\(id).imageset/\(id).png")
      XCTAssertTrue(FileManager.default.fileExists(atPath: png.path), "no app icon for \(id)")
    }
  }

  func testEveryTitleAndIdFindsItsConnector() {
    for (id, name) in GeneratedAppIcons.connectors {
      XCTAssertEqual(ConnectorIcons.id(for: id), id)
      XCTAssertEqual(ConnectorIcons.id(for: name), id, name)
      XCTAssertEqual(ConnectorIcons.id(for: name.uppercased()), id, name)
    }
  }

  /** The five whose title's slug is not their id drew a letter until now. */
  func testTheFiveThatWereMissing() {
    XCTAssertEqual(ConnectorIcons.id(for: "monday.com"), "monday")
    XCTAssertEqual(ConnectorIcons.id(for: "Facebook Pages"), "facebook")
    XCTAssertEqual(ConnectorIcons.id(for: "Bigin by Zoho"), "zoho-bigin")
    XCTAssertEqual(ConnectorIcons.id(for: "Capsule"), "capsule-crm")
    XCTAssertEqual(ConnectorIcons.id(for: "Excel"), "microsoft-excel")
  }

  func testOtherNamesTheAppsGoBy() {
    XCTAssertEqual(ConnectorIcons.id(for: "Facebook"), "facebook")
    XCTAssertEqual(ConnectorIcons.id(for: "Microsoft Excel"), "microsoft-excel")
    XCTAssertEqual(ConnectorIcons.id(for: "Microsoft Outlook"), "outlook")
    XCTAssertEqual(ConnectorIcons.id(for: "Capsule CRM"), "capsule-crm")
    XCTAssertEqual(ConnectorIcons.id(for: " Cal.com "), "cal-com")
    XCTAssertEqual(ConnectorIcons.id(for: "google_drive"), "google-drive")
    XCTAssertNil(ConnectorIcons.id(for: "Photoshop"))
    XCTAssertNil(ConnectorIcons.id(for: ""))
  }
}
