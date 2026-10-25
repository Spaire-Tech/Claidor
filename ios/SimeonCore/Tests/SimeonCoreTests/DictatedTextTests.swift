import XCTest
@testable import SimeonCore

/** Dictation's words in the message: a pause or Stop never takes away what was said or typed. */
final class DictatedTextTests: XCTestCase {
  func testWordsGrowIntoWhatWasTyped() {
    var text = DictatedText(before: "Hi Simeon,")
    text.heard("can you", ended: false)
    text.heard("can you check the ledger", ended: false)
    XCTAssertEqual(text.draft, "Hi Simeon, can you check the ledger")
  }

  func testAPauseKeepsTheStretchBeforeIt() {
    var text = DictatedText()
    text.heard("Book the flight", ended: false)
    text.heard("Book the flight to Dakar", ended: true)
    text.heard("Then", ended: false)
    text.heard("Then email Julie", ended: false)
    XCTAssertEqual(text.draft, "Book the flight to Dakar Then email Julie")
  }

  func testAStretchThatStartsAgainUnannouncedIsKept() {
    var text = DictatedText()
    text.heard("Check the rent payment for October", ended: false)
    // The recognizer starts afresh after a pause, with no word of it.
    text.heard("And", ended: false)
    text.heard("And reply to Julie", ended: false)
    XCTAssertEqual(text.draft, "Check the rent payment for October And reply to Julie")
  }

  func testStopWithNothingHeardKeepsTheMessage() {
    var text = DictatedText(before: "Draft")
    text.heard("one more thing", ended: false)
    text.heard("", ended: true)
    XCTAssertEqual(text.draft, "Draft one more thing")
    XCTAssertEqual(DictatedText(before: "Typed").draft, "Typed")
  }

  func testAWholeRepeatedAtTheEndIsNotWrittenTwice() {
    var text = DictatedText()
    text.heard("Hello there", ended: true)
    text.heard("How are", ended: false)
    text.heard("Hello there how are you", ended: true)
    XCTAssertEqual(text.draft, "Hello there how are you")
  }

  func testCorrectionsWithinAStretchReplaceIt() {
    var text = DictatedText()
    text.heard("I want to", ended: false)
    text.heard("I wanted to go", ended: false)
    XCTAssertEqual(text.draft, "I wanted to go")
  }
}
