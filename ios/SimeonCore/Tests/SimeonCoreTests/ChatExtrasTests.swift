import Foundation
import XCTest
@testable import SimeonCore

final class EmojiTests: XCTestCase {
  func testTheListStartsWithFacesAndHoldsTheWindowsSix() {
    let all = EmojiCatalog.all.map(\.character)
    XCTAssertEqual(all.first, "😀")
    for reaction in ["👍", "👎", "❤️", "😂", "🎉", "😮"] { XCTAssertTrue(all.contains(reaction), reaction) }
    XCTAssertGreaterThan(all.count, 1_000)
    XCTAssertEqual(Set(all).count, all.count)
    // No letters of a flag, no digits or "#".
    XCTAssertFalse(all.contains("🇦"))
    XCTAssertFalse(all.contains { $0.hasPrefix("#") || $0.first?.isNumber == true })
  }

  func testSearchByShortNameThenName() {
    XCTAssertEqual(EmojiCatalog.search("tada").first?.character, "🎉")
    XCTAssertEqual(EmojiCatalog.search(":+1").first?.character, "👍")
    XCTAssertEqual(EmojiCatalog.search("joy").first?.character, "😂")
    XCTAssertTrue(EmojiCatalog.search("rocket").map(\.character).contains("🚀"))
    XCTAssertTrue(EmojiCatalog.search("thumbs down").map(\.character).contains("👎"))
    XCTAssertEqual(EmojiCatalog.search("").count, 60)
    XCTAssertTrue(EmojiCatalog.search("zzzzqqq").isEmpty)
  }

  func testTheColonBeingTyped() {
    XCTAssertEqual(EmojiCatalog.query("well done :ta"), "ta")
    XCTAssertEqual(EmojiCatalog.query(":+1"), "+1")
    XCTAssertNil(EmojiCatalog.query("well done :t"))
    XCTAssertNil(EmojiCatalog.query("at 10:30"))
    XCTAssertNil(EmojiCatalog.query("well :tada done"))
    XCTAssertEqual(EmojiCatalog.inserting("🎉", into: "well done :ta"), "well done 🎉 ")
  }
}

final class ChatFindTests: XCTestCase {
  private func bubble(_ id: String, _ text: String, mine: Bool = false) -> ChatRow {
    .bubble(Bubble(id: id, text: text, fromPerson: mine, author: nil, showsName: false, showsAvatar: false, reactions: [], isStreaming: false))
  }

  func testFindsWordsWhateverTheirCaseAndAccents() {
    let rows: [ChatRow] = [
      bubble("a", "Send me your Résumé"),
      .stamp(id: "s", date: Date()),
      bubble("b", "the resume is attached", mine: true),
      .file(id: "f", name: "resume.pdf", url: "/x/resume.pdf", fromPerson: false),
      bubble("c", "nothing here"),
    ]
    XCTAssertEqual(ChatFind.matches("RESUME", in: rows), ["a", "b", "f"])
    XCTAssertEqual(ChatFind.matches("  ", in: rows), [])
    XCTAssertEqual(ChatFind.matches("zebra", in: rows), [])
  }

  func testNextGoesRound() {
    let found = ["a", "b", "f"]
    XCTAssertEqual(ChatFind.next(found, from: nil, step: 1), "a")
    XCTAssertEqual(ChatFind.next(found, from: nil, step: -1), "f")
    XCTAssertEqual(ChatFind.next(found, from: "b", step: 1), "f")
    XCTAssertEqual(ChatFind.next(found, from: "f", step: 1), "a")
    XCTAssertEqual(ChatFind.next(found, from: "a", step: -1), "f")
    XCTAssertNil(ChatFind.next([], from: "a", step: 1))
  }
}
