import Foundation
import XCTest
@testable import SimeonCore

/** The Credentials Store (CredentialsStore.swift): entries as the server lists them, the editor's checks and bodies, and the page's model against the demo. */
final class CredentialsStoreTests: XCTestCase {
  func testAnEntryAsTheServerListsIt() throws {
    let login = try XCTUnwrap(StoredCredential(json: ["id": "a1", "kind": "login", "name": "", "website": "https://www.acme.com/login", "site": "acme.com", "username": "theo@example.com", "hasPassword": true, "hints": "Use for work", "savedBy": "Nora"]))
    XCTAssertEqual(login.title, "acme.com", "a login without a name is its site")
    XCTAssertEqual(login.subtitle, "theo@example.com")
    XCTAssertEqual(login.iconSite, "acme.com")
    XCTAssertEqual(login.savedBy, "Nora")
    XCTAssertTrue(login.hasPassword)

    let contact = try XCTUnwrap(StoredCredential(json: ["id": "c1", "kind": "contact", "name": "", "fullName": "", "email": "theo@example.com", "phone": "+1 206 555 0100"]))
    XCTAssertEqual(contact.title, "theo@example.com")
    XCTAssertEqual(contact.subtitle, "theo@example.com")
    XCTAssertNil(contact.iconSite)
    XCTAssertNil(StoredCredential(json: ["id": "x", "kind": "card"]), "cards are never kept here")
    XCTAssertNil(StoredCredential(json: ["kind": "login"]))
  }

  func testTheSiteIsAHostWithoutWww() {
    XCTAssertEqual(CredentialSite.site("https://www.Acme.com/login?next=/"), "acme.com")
    XCTAssertEqual(CredentialSite.site("login.acme.com"), "login.acme.com")
    XCTAssertEqual(CredentialSite.site("acme"), "")
    XCTAssertEqual(CredentialSite.site("not a site"), "")
  }

  func testTheEditorSaysWhatToFixAsTheServerWould() {
    var draft = CredentialDraft(kind: .login)
    XCTAssertTrue(draft.isEmpty)
    XCTAssertEqual(draft.problem, "Add the website.")
    draft.website = "acme"
    XCTAssertEqual(draft.problem, "Write the website like acme.com.")
    draft.website = "acme.com"
    XCTAssertEqual(draft.problem, "Add the username or the password.")
    draft.password = " spaced "
    XCTAssertNil(draft.problem)
    XCTAssertEqual(draft.body["password"]?.string, " spaced ", "a password is sent exactly as typed")
    XCTAssertEqual(draft.body["kind"]?.string, "login")

    var contact = CredentialDraft(kind: .contact)
    contact.name = "Home"
    XCTAssertEqual(contact.problem, "Add at least one detail.")
    contact.city = "Seattle"
    XCTAssertNil(contact.problem)
    XCTAssertNil(contact.body["password"], "contact info has no password")
  }

  func testAChangeSendsOnlyWhatChanged() throws {
    let entry = try XCTUnwrap(StoredCredential(json: ["id": "a1", "kind": "login", "name": "Acme", "website": "acme.com", "username": "theo", "hasPassword": true]))
    let opened = CredentialDraft(entry)
    var edited = opened
    edited.hints = "Personal"
    // Opened without Face ID: the password field is empty and stays the entry's own.
    XCTAssertEqual(edited.changes(from: opened, passwordRead: false), ["hints": "Personal"])
    edited.password = "new one"
    XCTAssertEqual(edited.changes(from: opened, passwordRead: false), ["hints": "Personal", "password": "new one"])
    // Read with Face ID, then emptied: the password is cleared.
    let read = CredentialDraft(entry, password: "old")
    var cleared = read
    cleared.password = ""
    XCTAssertEqual(cleared.changes(from: read, passwordRead: true), ["password": ""])
    XCTAssertEqual(read.changes(from: read, passwordRead: true), [:])
  }

  /** The page against the demo's store: listed without passwords, a password read once asked for, saved, changed, deleted. */
  @MainActor
  func testThePageSavesChangesAndDeletes() async throws {
    let store = AppStore()
    await store.attach(DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil))
    let model = CredentialsStoreModel(store: store)
    await model.load()
    XCTAssertTrue(model.loaded)
    XCTAssertNil(model.problem)
    XCTAssertEqual(model.logins.map(\.title), ["GitHub"])
    XCTAssertEqual(model.contacts.map(\.title), ["Home"])
    let github = try XCTUnwrap(model.logins.first)
    XCTAssertTrue(github.hasPassword)
    let password = try await model.password(of: github)
    XCTAssertEqual(password, "demo-Passw0rd-github")

    var draft = CredentialDraft(kind: .login)
    draft.website = "https://www.acme.com"
    draft.username = "bass@example.com"
    draft.password = "s3cret"
    let added = await model.save(draft)
    let saved = try XCTUnwrap(added)
    XCTAssertEqual(saved.site, "acme.com")
    XCTAssertEqual(model.logins.map(\.title), ["acme.com", "GitHub"])

    var renamed = CredentialDraft(saved)
    renamed.name = "Acme"
    let edited = await model.save(renamed, editing: (saved, CredentialDraft(saved), false))
    let changed = try XCTUnwrap(edited)
    XCTAssertEqual(changed.title, "Acme")
    let kept = try await model.password(of: changed)
    XCTAssertEqual(kept, "s3cret", "a name changed keeps the password")

    let refused = await model.save(CredentialDraft(kind: .login))
    XCTAssertNil(refused)
    XCTAssertEqual(model.problem, "Add the website.")

    let deleted = await model.delete(changed)
    XCTAssertTrue(deleted)
    XCTAssertEqual(model.logins.map(\.title), ["GitHub"])
  }
}
