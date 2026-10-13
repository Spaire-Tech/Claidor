import XCTest
@testable import SimeonCore

/** What the person reads when something fails (PlainWords, the founder, 13 October 2026): nothing behind Simeon named. */
final class PlainWordsTests: XCTestCase {
  func testTheModelCompaniesCreditsAreNeverNamed() {
    let engine = "Simeon could not reach the model because OpenAI has no credits left on Simeon Labs' account. This is not your OpenAI billing page."
    XCTAssertEqual(PlainWords.error(engine), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("You exceeded your current quota, please check your plan and billing details."), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("Your credit balance is too low to access the Anthropic API."), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("Gemini request failed (429: RESOURCE_EXHAUSTED)."), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("Hourly spending budget reached (code 40201): 1,000,000 of 1,000,000 credits."), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("claude-sonnet is served by anthropic and is not reached through the OpenAI API."), PlainWords.unavailable)
  }

  func testThePlumbingIsNeverNamed() {
    XCTAssertEqual(PlainWords.error("Simeon Labs' server answered user/quota with 502."), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("The step budget ran out (SAND_AGENT_MAX_STEPS)."), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("noVNC cannot reach the desktop's socket."), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("The box did not answer on port 8790: connection refused"), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("createAgent: no agent in the answer"), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error("Error inside the screen page: TypeError at vnc.js:12"), PlainWords.unavailable)
    XCTAssertEqual(PlainWords.error(String(repeating: "word ", count: 60)), PlainWords.unavailable)
  }

  func testPlainWordsAreKept() {
    for plain in ["The Internet connection appears to be offline.", "Your agent is busy. Try again in a minute.", "Couldn't sign in to Stripe.", "Canva refused the sign-in.", "Choose a plan to keep your agents working."] {
      XCTAssertEqual(PlainWords.error(plain), plain)
    }
    XCTAssertEqual(PlainWords.error("  "), "")
    XCTAssertEqual(PlainWords.error("Simeon Labs' server answered 500.", fallback: PlainWords.noAnswer), PlainWords.noAnswer)
  }

  func testAProblemKeepsWhatFailedAndDropsAnInternalWhy() {
    XCTAssertEqual(PlainWords.problem("Couldn't create Nora: createAgent: Simeon's cloud computer answered createAgent with 503."), "Couldn't create Nora. Try again in a little while.")
    XCTAssertEqual(PlainWords.problem("Couldn't draw the picture: Your request was rejected by OpenAI's safety system."), "Couldn't draw the picture. Try again in a little while.")
    XCTAssertEqual(PlainWords.problem("Couldn't reach your agents: The Internet connection appears to be offline."), "Couldn't reach your agents: The Internet connection appears to be offline.")
    XCTAssertEqual(PlainWords.problem("Redis is down"), PlainWords.unavailable)
  }
}
