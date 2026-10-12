import XCTest
@testable import SimeonCore

/** The first run (12 October 2026: the name, Face ID, the notifications prompt; Simeon made out of sight). */
final class FirstRunTests: XCTestCase {
  func testTheStepsADeviceShows() {
    XCTAssertEqual(OnboardingStep.steps(faceID: true, notifications: true), [.name, .faceID, .notifications])
    XCTAssertEqual(OnboardingStep.steps(faceID: false, notifications: true), [.name, .notifications], "a phone without Face ID")
    XCTAssertEqual(OnboardingStep.steps(faceID: false, notifications: false), [.name], "the Mac, or notifications already decided")
    XCTAssertEqual(OnboardingStep.name.title, "What should Simeon call you?")
    XCTAssertNil(OnboardingStep.name.detail)
    XCTAssertNotNil(OnboardingStep.faceID.detail)
    XCTAssertEqual(OnboardingStep.faceID.title(unlockingWith: "Touch ID"), "Unlock Simeon with Touch ID", "an iPhone with a button")
    XCTAssertEqual(OnboardingStep.name.title(unlockingWith: "Touch ID"), "What should Simeon call you?")
  }

  func testTheNameStepSuggestsAChosenNameThenGooglesNeverTheMail() {
    XCTAssertEqual(Onboarding.suggestedName(profile: ["preferredName": " Bass ", "suggestedName": "Bastian"]), "Bass")
    XCTAssertEqual(Onboarding.suggestedName(profile: ["preferredName": "", "suggestedName": "Bastian"]), "Bastian")
    XCTAssertNil(Onboarding.suggestedName(profile: ["email": "bxss.fall@example.com"]))
    XCTAssertEqual(Onboarding.normalizedName("  Bass   Fall "), "Bass Fall")
  }

  func testSimeonWearsHisOwnFace() {
    XCTAssertEqual(Onboarding.chiefOfStaff(nonce: "n")["avatarShape"], .string(AgentFaces.simeonId))
  }

  func testTheHandOffLine() {
    XCTAssertEqual(Onboarding.handOffLine(ready: false, percent: 42), "Setting up your Simeon… 42%")
    XCTAssertEqual(Onboarding.handOffLine(ready: false, sleeping: true), "Waking your computer…")
    XCTAssertEqual(Onboarding.handOffLine(ready: true, percent: 42), "Getting your team ready…")
  }
}

/** The routine editor's save rules the Mac's view leans on (step 7c). */
final class RoutineEditorRulesTests: XCTestCase {
  private let stored = Routine(json: ["id": "r1", "name": "Monday check", "prompt": "Check the launch.", "trigger": ["type": "cron", "schedule": "0 9 * * 1"], "isEnabled": true])!

  func testUpdateKeepsStoredFieldsAndSendsThePendingSwitch() {
    let spec = RoutineDraft.updateSpec(stored, name: "  ", prompt: "New words", trigger: nil, isEnabled: false)
    XCTAssertEqual(spec["name"]?.string, "Monday check")
    XCTAssertEqual(spec["prompt"]?.string, "New words")
    XCTAssertEqual(spec["trigger"]?["schedule"]?.string, "0 9 * * 1")
    XCTAssertEqual(spec["isEnabled"]?.bool, false)
  }

  func testUnchangedSkipsTheUpdate() {
    let same = RoutineDraft.updateSpec(stored, name: "Monday check", prompt: "Check the launch.", trigger: TriggerRow.trigger([.schedule("0 9 * * 1")]))
    XCTAssertTrue(RoutineDraft.unchanged(stored, spec: same))
    let other = RoutineDraft.updateSpec(stored, name: "Monday check", prompt: "Check the launch.", trigger: TriggerRow.trigger([.schedule("0 10 * * 1")]))
    XCTAssertFalse(RoutineDraft.unchanged(stored, spec: other))
  }

  func testANewRoutineWaitsForAllThree() {
    XCTAssertNil(RoutineDraft.newSpec(name: "x", prompt: "", trigger: ["type": "cron", "schedule": "0 9 * * *"], isEnabled: true))
    XCTAssertNil(RoutineDraft.newSpec(name: "x", prompt: "y", trigger: TriggerRow.trigger([TriggerRow.new("slack")]), isEnabled: true))
    XCTAssertNotNil(RoutineDraft.newSpec(name: "x", prompt: "y", trigger: TriggerRow.trigger([TriggerRow.new("linear")]), isEnabled: true))
  }
}

/** Test run's wait (step 7c), as the window's flights move. */
final class RoutineRunFlightTests: XCTestCase {
  private func routine(_ runs: [JSON]) -> Routine {
    Routine(json: ["id": "r1", "name": "Check", "prompt": "p", "trigger": ["type": "cron", "schedule": "0 9 * * 1"], "runs": .array(runs)])!
  }

  func testItWaitsForANewManualRunThenCoolsDown() {
    let before = routine([["id": "old", "trigger": "manual", "status": "ok", "startedAt": 1]])
    var flight = RoutineRunFlight(before: before)
    XCTAssertEqual(flight.phase, .awaiting(previous: "old"))
    XCTAssertTrue(flight.take(before))
    XCTAssertEqual(flight.phase, .awaiting(previous: "old"))
    XCTAssertTrue(flight.take(routine([["id": "new", "trigger": "manual", "status": "running", "startedAt": 2]])))
    XCTAssertEqual(flight.phase, .running("new"))
    XCTAssertTrue(flight.take(routine([["id": "new", "trigger": "manual", "status": "ok", "startedAt": 2]])))
    XCTAssertEqual(flight.phase, .cooldown)
  }

  func testNoRunAfterTheReadCoolsDownAndAGoneRoutineEndsIt() {
    var flight = RoutineRunFlight(before: routine([]))
    flight.afterRead()
    XCTAssertEqual(flight.phase, .cooldown)
    var other = RoutineRunFlight(before: nil)
    XCTAssertFalse(other.take(nil))
  }

  func testTheMenusTogglesKeepTheirOrder() {
    XCTAssertEqual(TriggerRow.toggled(["ci-failed"], "pr-opened"), ["pr-opened", "ci-failed"])
    XCTAssertEqual(TriggerRow.toggled(["pr-opened"], "pr-opened"), [])
    XCTAssertEqual(RoutineWords.toggled([3, 1], 2), [1, 2, 3])
    XCTAssertEqual(RoutineWords.nextHour(after: 22, taken: [22, 23, 0]), 1)
  }
}
