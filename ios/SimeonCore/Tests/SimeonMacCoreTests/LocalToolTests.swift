import Foundation
import XCTest
import SimeonCore
@testable import SimeonMacCore

/** Settings › "Execution on Local Computer", as `shared/local-tool-permission.ts`, the settings store and the window's `XGn`/`MPt` have it. */
final class LocalToolPermissionTests: XCTestCase {
  func testTheMenu() {
    XCTAssertEqual(LocalToolPermission.choices.map(\.label), ["Always allow", "Ask every time", "Never allow"])
    XCTAssertEqual(LocalToolPermission.default, .ask)
    XCTAssertEqual(LocalToolPermission(normalizing: "always"), .always)
    XCTAssertEqual(LocalToolPermission(normalizing: "Always"), .ask)
    XCTAssertEqual(LocalToolPermission(normalizing: nil), .ask)
    XCTAssertEqual(LocalToolPermission.ceilingLine(.ask), "Your team's admin allows at most \"Ask every time\"")
  }

  func testTheCeilingLowersAndGreys() {
    for choice in LocalToolPermission.allCases {
      XCTAssertEqual(choice.capped(by: nil), choice)
      XCTAssertFalse(choice.isAbove(nil))
      for ceiling in LocalToolPermission.allCases {
        XCTAssertEqual(choice.capped(by: ceiling), choice.rank <= ceiling.rank ? choice : ceiling)
        XCTAssertEqual(choice.isAbove(ceiling), choice.rank > ceiling.rank)
      }
    }
    XCTAssertEqual(LocalToolPermission.always.capped(by: .never), .never)
  }

  func testTheTeamAnswer() {
    XCTAssertNil(LocalToolPermission.ceiling(teamAdminSettings: [:]))
    XCTAssertNil(LocalToolPermission.ceiling(teamAdminSettings: nil))
    XCTAssertEqual(LocalToolPermission.ceiling(teamAdminSettings: ["localToolControls": ["permissionCeiling": 1]]), .never)
    XCTAssertEqual(LocalToolPermission.ceiling(teamAdminSettings: ["localToolControls": ["permissionCeiling": 2]]), .ask)
    XCTAssertEqual(LocalToolPermission.ceiling(teamAdminSettings: ["localToolControls": ["permissionCeiling": 3]]), .always)
    XCTAssertNil(LocalToolPermission.ceiling(teamAdminSettings: ["localToolControls": ["permissionCeiling": 0]]))
  }

  func testConnectingTakesTheBoxsWordOnlyOverTheDefault() {
    XCTAssertEqual(LocalToolPermission.reconcile(box: "always", mac: .ask), .adopt(.always))
    XCTAssertEqual(LocalToolPermission.reconcile(box: "never", mac: .ask), .adopt(.never))
    XCTAssertEqual(LocalToolPermission.reconcile(box: "ask", mac: .ask), .push(.ask))
    XCTAssertEqual(LocalToolPermission.reconcile(box: nil, mac: .ask), .push(.ask))
    XCTAssertEqual(LocalToolPermission.reconcile(box: "always", mac: .never), .push(.never))
    XCTAssertEqual(LocalToolPermission.reconcile(box: "never", mac: .always), .push(.always))
    XCTAssertEqual(LocalToolPermission.reconcile(box: "sometimes", mac: .ask), .push(.ask))
  }

  func testEachAccountKeepsItsOwn() {
    let suite = "simeon.tests.localTool.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: suite)!
    defer { defaults.removePersistentDomain(forName: suite) }
    let settings = LocalToolSettings(defaults: defaults)
    XCTAssertEqual(settings.effective, .ask)
    settings.scope(to: "a@x.co")
    settings.choice = .always
    settings.ceiling = .ask
    XCTAssertEqual(settings.effective, .ask)
    settings.ceiling = nil
    XCTAssertEqual(settings.effective, .always)
    settings.scope(to: "a@x.co")
    XCTAssertEqual(settings.choice, .always)
    settings.ceiling = .never
    settings.scope(to: "b@x.co")
    XCTAssertEqual(settings.choice, .ask)
    XCTAssertNil(settings.ceiling)
    settings.choice = .never
    settings.clearScope()
    XCTAssertEqual(settings.choice, .ask)
  }
}
