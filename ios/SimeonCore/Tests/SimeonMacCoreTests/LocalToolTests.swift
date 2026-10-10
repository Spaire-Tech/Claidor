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

/** "Allow once" in the file the Electron app keeps (`local-tool-approvals.ts`). */
final class LocalToolApprovalsTests: XCTestCase {
  func testRecordRetireAndClear() throws {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("simeon-approvals-\(UUID().uuidString)", isDirectory: true)
    defer { try? FileManager.default.removeItem(at: folder) }
    let approvals = LocalToolApprovals(folder: folder)
    XCTAssertTrue(approvals.all().isEmpty)
    approvals.record(LocalToolApproval(id: "q1", action: "run-command", target: "ls -la"))
    approvals.record(LocalToolApproval(id: "q2", action: "read-file", target: "/tmp/a", resourcePath: "/private/tmp/a"))
    XCTAssertEqual(approvals.all()["q2"]?.resourcePath, "/private/tmp/a")
    let written = try JSON.parse(Data(contentsOf: approvals.approvalsURL))
    XCTAssertEqual(written["approvals"]?.array?.count, 2)
    approvals.retire("q1")
    XCTAssertEqual(Set(approvals.live().keys), ["q2"])
    XCTAssertEqual(Set(approvals.all().keys), ["q1", "q2"])
    approvals.clear()
    XCTAssertTrue(approvals.all().isEmpty)
    XCTAssertFalse(FileManager.default.fileExists(atPath: approvals.approvalsURL.path))
    // A row the Electron app would not read is not read here either.
    XCTAssertNil(LocalToolApproval(json: ["id": "x", "action": "delete-everything", "target": "/"]))
    XCTAssertNil(LocalToolApproval(json: ["id": "", "action": "run-command", "target": "ls"]))
  }
}
