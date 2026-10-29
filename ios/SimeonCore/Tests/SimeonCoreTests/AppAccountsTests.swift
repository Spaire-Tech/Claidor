import XCTest
@testable import SimeonCore

/** Add Another Account (29 October 2026): an app's accounts as Simeon Labs' server keeps them. */
final class AppAccountsTests: XCTestCase {
  private let listed: JSON = ["toolkit": "gmail", "max": 5, "accounts": [
    ["id": "ca_h", "name": "Home", "identity": "jo@gmail.com", "label": "Home"],
    ["id": "ca_w", "name": .null, "identity": "jo@acme.com", "label": "jo@acme.com"],
    ["id": "ca_p", "name": .null, "identity": .null, "label": "Account 3"],
  ]]

  func testEachRowSaysTheNameGivenElseWhoItSignsInAsElseItsPlace() throws {
    let read = try XCTUnwrap(AppAccounts(json: listed))
    XCTAssertEqual(read.accounts.map(\.id), ["ca_h", "ca_w", "ca_p"])
    XCTAssertEqual(read.accounts.enumerated().map { $0.element.title(place: $0.offset + 1) }, ["Home", "jo@acme.com", "Account 3"])
    XCTAssertEqual(read.accounts.map(\.detail), ["jo@gmail.com", nil, nil], "who it signs in as, under a name the person gave it")
    XCTAssertTrue(read.canAddAnother)
    XCTAssertFalse(AppAccounts(accounts: read.accounts, max: 3).canAddAnother, "full")
    XCTAssertFalse(AppAccounts(accounts: [], max: 5).canAddAnother, "the first account is Connect's, not Add Another Account's")
    XCTAssertNil(AppAccounts(json: ["error": ["message": "x"]]))
  }

  func testOnlyAnAppSimeonsServerServesHasItsAccountsThere() {
    XCTAssertEqual(AppAccounts.toolkit(serverURL: "https://api.simeonlabs.com/desktop/api/apps/mcp/gmail"), "gmail")
    XCTAssertEqual(AppAccounts.toolkit(serverURL: "https://api.simeonlabs.com/desktop/api/apps/mcp/clio_manage/"), "clio_manage")
    XCTAssertNil(AppAccounts.toolkit(serverURL: "https://mcp.notion.com/mcp"), "a maker's own server")
    XCTAssertNil(AppAccounts.toolkit(serverURL: "https://api.simeonlabs.com/desktop/api/apps/mcp/"))
    XCTAssertNil(AppAccounts.toolkit(serverURL: "https://api.simeonlabs.com/desktop/api/apps/mcp/Gmail%2F..%2Fx"))
    XCTAssertNil(AppAccounts.toolkit(serverURL: nil))
  }

  @MainActor
  func testTheStoreReadsAddsRenamesAndRemoves() async throws {
    let box = PluginsBox()
    box.answers["server:apps/gmail/accounts"] = listed
    box.answers["server:apps/gmail/connect"] = ["toolkit": "gmail", "connected": false, "url": "https://api.simeonlabs.com/desktop/apps/start?t=x"]
    let store = AppStore()
    await store.attach(box)

    let readOK = await store.loadAppAccounts("gmail")
    XCTAssertTrue(readOK)
    XCTAssertEqual(store.appAccounts["gmail"]?.accounts.count, 3)

    let url = await store.anotherAccountURL("gmail", name: "Gmail")
    XCTAssertEqual(url?.absoluteString, "https://api.simeonlabs.com/desktop/apps/start?t=x")
    XCTAssertEqual(box.sent("server:apps/gmail/connect"), ["another": true])

    let home = try XCTUnwrap(store.appAccounts["gmail"]?.accounts.first)
    box.answers["server:apps/gmail/accounts/ca_h"] = ["toolkit": "gmail", "max": 5, "accounts": [["id": "ca_w", "identity": "jo@acme.com", "label": "jo@acme.com"]]]
    await store.renameAppAccount("gmail", home, to: "  Home  ")
    XCTAssertNil(box.sent("server:apps/gmail/accounts/ca_h"), "the same name again changes nothing")
    await store.renameAppAccount("gmail", home, to: " Family  photos ")
    XCTAssertEqual(box.sent("server:apps/gmail/accounts/ca_h"), ["name": "Family photos"])
    XCTAssertEqual(store.appAccounts["gmail"]?.accounts.map(\.id), ["ca_w"], "the list the server answers with")

    await store.removeAppAccount("gmail", home)
    XCTAssertEqual(box.all("server:apps/gmail/accounts/ca_h").last, .null)
  }

  @MainActor
  func testAnAddThatOpensNoPageSaysWhy() async {
    let box = PluginsBox()
    box.answers["server:apps/gmail/connect"] = ["toolkit": "gmail", "connected": true]
    let store = AppStore()
    await store.attach(box)
    let url = await store.anotherAccountURL("gmail", name: "Gmail")
    XCTAssertNil(url)
    XCTAssertEqual(store.problem, Connecting.didntConnect("Gmail", why: nil))
  }
}
