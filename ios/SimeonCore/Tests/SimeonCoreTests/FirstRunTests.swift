import XCTest
@testable import SimeonCore

/** The Mac's first run (step 6), checked against the window's own numbers. */
final class FirstRunTests: XCTestCase {
  func testMeetBeatsFollowTheSceneClock() {
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 0), 0)
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 0.034), 0)
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 0.036), 1)
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 0.55), 1)
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 0.561), 2)
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 1.95), 2)
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 1.961), 3)
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 60), 3)
    XCTAssertEqual(Onboarding.meetBeat(elapsed: 0, reduceMotion: true), 3)
  }

  func testComputerBeatsAndWindows() {
    XCTAssertEqual(Onboarding.computerBeat(elapsed: 0), -1)
    XCTAssertEqual(Onboarding.computerBeat(elapsed: 0.91), 0)
    XCTAssertEqual(Onboarding.computerBeat(elapsed: 6.31), 6)
    XCTAssertEqual(Onboarding.computerBeat(elapsed: 100), 7)
    XCTAssertEqual(Onboarding.computerBeat(elapsed: 0, reduceMotion: true), 7)
    XCTAssertTrue(Onboarding.computerWindows(beat: -1) == (false, false))
    XCTAssertTrue(Onboarding.computerWindows(beat: 0) == (true, false))
    XCTAssertTrue(Onboarding.computerWindows(beat: 3) == (true, true))
    XCTAssertTrue(Onboarding.computerWindows(beat: 6) == (false, true))
    XCTAssertEqual(Onboarding.computerFrame(5).pressed, "a-close")
  }

  func testTheCursorWalksTheScaledScreen() {
    // The window at its usual size: (62.8, -62.3) on a 1.45 screen, Simeon at 0.66 below and right of his point.
    let place = Onboarding.cursorPlace(beat: 2, width: 1280)
    XCTAssertEqual(place.x, 130.528, accuracy: 0.001)
    XCTAssertEqual(place.y, -51.659, accuracy: 0.001)
    XCTAssertEqual(place.scale, 0.66, accuracy: 1e-9)
  }

  func testTheNameStepSuggestsAChosenNameThenGooglesNeverTheMail() {
    XCTAssertEqual(Onboarding.suggestedName(profile: ["preferredName": " Bass ", "suggestedName": "Bastian"]), "Bass")
    XCTAssertEqual(Onboarding.suggestedName(profile: ["preferredName": "", "suggestedName": "Bastian"]), "Bastian")
    XCTAssertNil(Onboarding.suggestedName(profile: ["email": "bxss.fall@example.com"]))
    XCTAssertEqual(Onboarding.normalizedName("  Bass   Fall "), "Bass Fall")
  }

  func testHappyAndProudKeepTheWingsAndMove() {
    XCTAssertNil(MarkState.happy.glyph)
    XCTAssertNil(MarkState.proud.glyph)
    let engine = MarkEngine(random: { 0.5 })
    var last = engine.frame(at: 1000, state: .happy, sizePoints: 80)
    var moved = false
    for step in 1...60 {
      let frame = engine.frame(at: 1000 + Double(step) / 60, state: .happy, sizePoints: 80)
      if frame != last { moved = true }
      last = frame
    }
    XCTAssertTrue(moved)
    XCTAssertEqual(last.fold, 0, accuracy: 1e-9)
  }

  func testTheHandOffLine() {
    XCTAssertEqual(Onboarding.handOffLine(ready: false, percent: 42), "Setting up your Simeon… 42%")
    XCTAssertEqual(Onboarding.handOffLine(ready: false, sleeping: true), "Waking your computer…")
    XCTAssertEqual(Onboarding.handOffLine(ready: true, percent: 42), "Getting your team ready…")
  }
}
