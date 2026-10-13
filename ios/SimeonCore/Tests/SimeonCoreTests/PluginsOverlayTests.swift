import XCTest
@testable import SimeonCore

/** The Plugins overlay's words and small rules (step 9's spec, §10.3), against the window's. */
final class PluginsOverlayTests: XCTestCase {
  func testTheEmptyLines() {
    XCTAssertEqual(Plugins.marketplaceEmpty(loaded: false, catalogEmpty: true, filterSet: true, query: "x"), "Loading the marketplace…")
    XCTAssertEqual(Plugins.marketplaceEmpty(loaded: true, catalogEmpty: false, filterSet: true, query: "x"), "No plugins match the current filters")
    XCTAssertEqual(Plugins.marketplaceEmpty(loaded: true, catalogEmpty: false, filterSet: false, query: " zzzz "), "No plugins match \"zzzz\"")
    XCTAssertEqual(Plugins.marketplaceEmpty(loaded: true, catalogEmpty: true, filterSet: false, query: ""), "The marketplace isn't available right now. Check back later.")
    XCTAssertEqual(Plugins.installedEmpty(query: ""), "Nothing installed yet. Find plugins in the Marketplace tab.")
    XCTAssertEqual(Plugins.installedEmpty(query: "lin"), "No installed plugins match \"lin\"")
    XCTAssertEqual(Plugins.privateEmpty(agentOpen: false, query: "x"), "Open an agent to see its private skills")
    XCTAssertEqual(Plugins.privateEmpty(agentOpen: true, query: ""), "No private skills yet. Ask your Agent to create one for you.")
    XCTAssertEqual(Plugins.privateEmpty(agentOpen: true, query: "q"), "No private skills match \"q\"")
  }

  func testTheTeamsLabelsAndThePagesAction() {
    XCTAssertEqual(Plugins.pageAction(installed: false, mode: .user), .add)
    XCTAssertEqual(Plugins.pageAction(installed: true, mode: nil), .add)
    XCTAssertEqual(Plugins.pageAction(installed: true, mode: .user), .uninstall)
    XCTAssertEqual(Plugins.pageAction(installed: true, mode: .teamDefault), .remove(label: "Added by your team"))
    XCTAssertEqual(Plugins.pageAction(installed: true, mode: .teamRequired), .managed(label: "Managed by your team"))
    XCTAssertNil(Plugins.modeLabel(.user))
    let team = PluginEntry(json: ["id": "a", "name": "a", "marketplace": ["name": "acme", "displayName": "Acme Team", "ownership": "team"]])!
    let mine = PluginEntry(json: ["id": "b", "name": "b", "marketplace": ["name": "me", "displayName": "Mine"], "publisher": ["name": "me", "displayName": "Me", "isUserOwned": true]])!
    let plain = PluginEntry(json: ["id": "c", "name": "c"])!
    XCTAssertEqual(Plugins.teamMark(team), "Acme Team")
    XCTAssertNil(Plugins.teamMark(mine))
    XCTAssertNil(Plugins.teamMark(plain))
    let fielded = PluginEntry(json: ["id": "d", "name": "d", "fields": [["key": "token", "isRequired": true]]])!
    XCTAssertTrue(Plugins.needsSetupPage(fielded, teamConfigured: false))
    XCTAssertFalse(Plugins.needsSetupPage(fielded, teamConfigured: true))
    XCTAssertFalse(Plugins.needsSetupPage(plain, teamConfigured: false))
  }

  func testStatusTonesAndSignIn() {
    XCTAssertEqual(Plugins.tone("connected"), .success)
    XCTAssertEqual(Plugins.tone("needsAuth"), .warning)
    XCTAssertEqual(Plugins.tone("error"), .danger)
    XCTAssertEqual(Plugins.tone("initializing"), .tertiary)
    XCTAssertEqual(Plugins.signInKey("Google_Calendar-2"), "googlecalendar2")
    XCTAssertEqual(Plugins.signInKey("gmail--Work"), "gmail--Work")
    XCTAssertEqual(Plugins.signInButton(.none), "Connect")
    XCTAssertEqual(Plugins.signInButton(.waiting), "Reopen")
    XCTAssertEqual(Plugins.signInButton(.timedOut), "Retry")
  }

  func testTheSetupForm() {
    let entry = PluginEntry(json: ["id": "acme", "name": "acme", "displayName": "Acme", "fields": [
      ["key": "token", "label": "API token", "isRequired": true, "isSecret": true],
      ["key": "region", "label": "Region", "defaultValue": "eu"],
    ]])!
    let fields = entry.fields ?? []
    var values = Plugins.setupStart(fields)
    XCTAssertEqual(values, ["token": "", "region": "eu"])
    XCTAssertEqual(Plugins.setupMissing(fields, values).map(\.key), ["token"])
    values["token"] = "  abc  "
    values["region"] = "   "
    XCTAssertTrue(Plugins.setupMissing(fields, values).isEmpty)
    XCTAssertEqual(Plugins.setupValues(values), ["token": "abc"])
    XCTAssertEqual(Plugins.setupIntro("Acme", editing: false), "Acme needs a few values before it can be added")
    XCTAssertEqual(Plugins.setupSubmit("Acme", editing: false), "Add Acme")
    XCTAssertEqual(Plugins.setupSubmit("Acme", editing: true), "Save Values")
    XCTAssertEqual(Plugins.requiredLine("API token"), "API token is required")
    XCTAssertEqual(Plugins.fillInLine(missing: 1), "Fill in the required field to continue")
    XCTAssertEqual(Plugins.fillInLine(missing: 2), "Fill in the required fields to continue")
  }

  func testAServersDetails() {
    XCTAssertEqual(Plugins.transportWord("http"), "HTTP")
    XCTAssertEqual(Plugins.transportWord("stdio"), "Command")
    XCTAssertEqual(Plugins.sourceWord(isTeamServer: false), "Added manually")
    XCTAssertEqual(Plugins.hostLine("https://mcp.acme.dev/sse"), "mcp.acme.dev")
    XCTAssertNil(Plugins.hostLine(nil))
    let tools = [PluginTool(json: ["name": "a"])!, PluginTool(json: ["name": "b", "isDisabled": true])!]
    XCTAssertEqual(Plugins.toolsValue(tools, count: 9), "1 of 2 enabled")
    XCTAssertEqual(Plugins.toolsValue(nil, count: 9), "9")
    XCTAssertEqual(Plugins.detailValue(""), "—")
  }

  func testTheSkillPagesSave() {
    XCTAssertTrue(Plugins.canSaveSkill(agentOpen: true, changed: true, name: "a", description: "b", body: "c", saving: false))
    XCTAssertFalse(Plugins.canSaveSkill(agentOpen: false, changed: true, name: "a", description: "b", body: "c", saving: false))
    XCTAssertFalse(Plugins.canSaveSkill(agentOpen: true, changed: false, name: "a", description: "b", body: "c", saving: false))
    XCTAssertFalse(Plugins.canSaveSkill(agentOpen: true, changed: true, name: "a", description: "  ", body: "c", saving: false))
    XCTAssertFalse(Plugins.canSaveSkill(agentOpen: true, changed: true, name: "a", description: "b", body: "c", saving: true))
  }
}
