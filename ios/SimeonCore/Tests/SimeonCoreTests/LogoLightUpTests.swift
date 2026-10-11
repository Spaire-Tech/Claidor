import XCTest
@testable import SimeonCore

/** The logo lighting up, checked against the founder's video as measured (darkness 0 the ground, 1 the ink; five bands along the diagonal). */
final class LogoLightUpTests: XCTestCase {
  private func ink(_ place: Double, _ time: Double) -> Double { LogoLightUp.ink(at: place, time: time) }

  func testNothingThenTheFadeToFortyPercent() {
    XCTAssertEqual(ink(0.5, 0.1), 0)
    XCTAssertEqual(ink(0.5, 1.0), 0.4, accuracy: 0.01)
    XCTAssertEqual(ink(0.1, 1.05), 0.4, accuracy: 0.01)
    XCTAssertEqual(ink(0.9, 1.05), 0.4, accuracy: 0.01)
  }

  func testTheFirstBandCrossesTopLeftToBottomRight() {
    // The video at 1.25 s: 0.95 0.66 0.43 0.40 0.40; at 1.40 s: 0.61 0.79 0.92 0.84 0.45; at 1.50 s: … 0.80 0.96.
    XCTAssertEqual(ink(0.1, 1.25), 0.95, accuracy: 0.05)
    XCTAssertEqual(ink(0.9, 1.25), 0.40, accuracy: 0.03)
    XCTAssertEqual(ink(0.5, 1.40), 0.92, accuracy: 0.05)
    XCTAssertEqual(ink(0.1, 1.40), 0.61, accuracy: 0.05)
    XCTAssertEqual(ink(0.9, 1.50), 0.96, accuracy: 0.05)
    // Gone again before the second.
    XCTAssertEqual(ink(0.5, 1.78), 0.40, accuracy: 0.03)
  }

  func testTheSecondBandIsSlower() {
    // The video: the brightest at the top left about 1.92 s, at the bottom right about 2.27 s.
    XCTAssertGreaterThan(ink(0.1, 1.92), 0.85)
    XCTAssertGreaterThan(ink(0.9, 2.28), 0.85)
    XCTAssertLessThan(ink(0.9, 1.92), 0.45)
  }

  func testItEndsInItsTrueColour() {
    XCTAssertEqual(ink(0.5, 2.6), 0.67, accuracy: 0.1)
    for place in LogoLightUp.places {
      XCTAssertEqual(ink(place, 2.85), 1)
      XCTAssertEqual(ink(place, LogoLightUp.duration), 1)
    }
    XCTAssertEqual(LogoLightUp.places.count, 11)
  }
}
