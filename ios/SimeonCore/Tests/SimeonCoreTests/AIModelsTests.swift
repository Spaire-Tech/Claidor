import Foundation
import XCTest
@testable import SimeonCore

/** AI Models (AIModels.swift): accounts as the server lists them, their words, the code sign-in, and the page's model against a stand-in server. */
final class AIModelsTests: XCTestCase {
  func testAnAccountAsTheServerListsIt() throws {
    let plus = try XCTUnwrap(ModelAccount(json: ["id": "a1", "provider": "chatgpt", "kind": "subscription", "label": "ada@example.com", "plan": "plus", "status": "available", "limitedUntil": .null, "createdAt": 1_700_000_000_000]))
    XCTAssertEqual(plus.providerName, "ChatGPT")
    XCTAssertEqual(plus.detail, "Subscription · Plus")
    XCTAssertEqual(plus.statusWords(), "Usage available")
    XCTAssertTrue(plus.usable())

    let gone = try XCTUnwrap(ModelAccount(json: ["id": "a2", "provider": "chatgpt", "label": "Work", "status": "signed_out"]))
    XCTAssertEqual(gone.status, .signedOut)
    XCTAssertEqual(gone.detail, "Subscription", "no plan named, none shown")
    XCTAssertEqual(gone.statusWords(), "Signed out. Connect again.")
    XCTAssertFalse(gone.usable())

    XCTAssertNil(ModelAccount(json: ["provider": "chatgpt"]), "an account has an id")
    XCTAssertNil(ModelAccount(json: nil))
  }

  func testALimitSaysUntilWhenAndEndsOnItsOwn() throws {
    let now = Date(timeIntervalSince1970: 1_794_146_400)  // 8 November 2026, 14:00 UTC
    let until = now.addingTimeInterval(2 * 3600)
    let limited = try XCTUnwrap(ModelAccount(json: ["id": "a1", "provider": "chatgpt", "status": "limited", "limitedUntil": .number(until.timeIntervalSince1970 * 1000)]))
    let words = limited.statusWords(now: now, timeZone: TimeZone(identifier: "UTC")!)
    XCTAssertTrue(words.hasPrefix("Limit reached until "), words)
    XCTAssertTrue(words.contains("4:00"), "the time, today: \(words)")
    XCTAssertFalse(limited.usable(now: now))
    XCTAssertTrue(limited.usable(now: until.addingTimeInterval(1)), "the limit ends at its time")
    XCTAssertEqual(limited.statusWords(now: until.addingTimeInterval(1)), "Usage available")
  }

  func testPlanNamesAsPeopleKnowThem() {
    XCTAssertEqual(AIModels.planName("plus"), "Plus")
    XCTAssertEqual(AIModels.planName("pro"), "Pro")
    XCTAssertEqual(AIModels.planName("prolite"), "Pro Lite")
    XCTAssertEqual(AIModels.planName("free_workspace"), "Free Workspace")
  }

  func testTheCodeAndWhereToEnterIt() throws {
    let signIn = try XCTUnwrap(ChatGPTSignIn(json: ["connectId": "c1", "userCode": "ABCD-1234", "verificationUrl": "https://auth.openai.com/codex/device", "interval": 3, "expiresIn": 900]))
    XCTAssertEqual(signIn.userCode, "ABCD-1234")
    XCTAssertEqual(signIn.shownAddress, "auth.openai.com/codex/device")
    XCTAssertEqual(signIn.interval, 3)
    XCTAssertNil(ChatGPTSignIn(json: ["connectId": "c1"]))
    XCTAssertEqual(AIModels.startProblem(code: "device_code_off"), "ChatGPT didn't allow signing in with a code. Check your ChatGPT security settings, then try again.")
    XCTAssertEqual(AIModels.startProblem(code: nil), "Couldn't reach ChatGPT. Try again in a moment.")
  }

  /** The server as the routes answer (server/simeon/desktop/model_accounts.py, own_models.py). */
  @MainActor
  final class StandIn {
    var accounts: [JSON] = []
    var chosen: String?
    var polls = 0
    var asked: [String] = []

    let models: [JSON] = [
      ["modelId": "own:chatgpt:gpt-6.1-sol", "modelName": "GPT-6.1 Sol", "provider": "chatgpt"],
      ["modelId": "own:chatgpt:gpt-6-luna", "modelName": "GPT-6 Luna", "provider": "chatgpt"],
    ]

    func own() -> JSON {
      ["model": chosen.map(JSON.string) ?? .null, "models": .array(accounts.isEmpty ? [] : models)]
    }

    func answer(_ path: String, _ method: String?, _ body: JSON?) throws -> JSON {
      asked.append("\(method ?? "GET") \(path)")
      switch (method ?? "GET", path) {
      case ("GET", "models/accounts"): return ["accounts": .array(accounts)]
      case ("GET", "models/own"): return own()
      case ("PUT", "models/own"):
        chosen = body?["model"]?.text
        return own()
      case ("POST", "models/accounts/chatgpt/start"):
        return ["connectId": "c1", "userCode": "ABCD-1234", "verificationUrl": "https://auth.openai.com/codex/device", "interval": 1, "expiresIn": 900]
      case ("POST", "models/accounts/chatgpt/poll"):
        polls += 1
        guard polls >= 2 else { return ["status": "waiting"] }
        let account: JSON = ["id": "a1", "provider": "chatgpt", "kind": "subscription", "label": "ada@example.com", "plan": "plus", "status": "available"]
        accounts = [account]
        return ["status": "connected", "account": account]
      case ("PATCH", "models/accounts/a1"):
        accounts = [accounts[0].setting("label", body?["label"])]
        return ["account": accounts[0]]
      case ("DELETE", "models/accounts/a1"):
        accounts = []
        chosen = nil
        return ["disconnected": true, "revoked": true]
      default:
        throw SimeonAPIError(message: "not found", status: 404)
      }
    }
  }

  @MainActor
  func testConnectingUsesTheBestModelAndDisconnectingGoesBackToSimeons() async throws {
    let server = StandIn()
    let model = AIModelsModel(call: { try server.answer($0, $1, $2) }, sleep: { _ in })
    await model.load()
    XCTAssertTrue(model.loaded)
    XCTAssertTrue(model.accounts.isEmpty)
    XCTAssertNil(model.chosen)
    XCTAssertEqual(model.chosenName, "Simeon's models")
    XCTAssertFalse(model.connected(AIModels.chatGPT))

    let signIn = try XCTUnwrap(await model.startChatGPT())
    XCTAssertEqual(signIn.userCode, "ABCD-1234")
    let outcome = await model.waitForApproval(signIn)
    guard case .connected(let account) = outcome else { return XCTFail("connected, not \(outcome)") }
    XCTAssertEqual(account.label, "ada@example.com")
    XCTAssertEqual(server.polls, 2, "asked until approved")
    XCTAssertEqual(model.accounts.map(\.id), ["a1"])
    XCTAssertTrue(model.connected(AIModels.chatGPT))
    XCTAssertEqual(model.chosen, "own:chatgpt:gpt-6.1-sol", "connecting is using: the best model chosen")
    XCTAssertEqual(model.chosenName, "GPT-6.1 Sol")

    await model.rename(account, to: "  Work   plan ")
    XCTAssertEqual(model.accounts.first?.label, "Work plan")
    await model.rename(try XCTUnwrap(model.accounts.first), to: "   ")
    XCTAssertEqual(server.asked.filter { $0.hasPrefix("PATCH") }.count, 1, "an empty name is not sent")

    await model.choose(nil)
    XCTAssertNil(model.chosen)
    await model.choose("own:chatgpt:gpt-6-luna")
    XCTAssertEqual(model.chosenName, "GPT-6 Luna")

    let gone = await model.disconnect(try XCTUnwrap(model.accounts.first))
    XCTAssertTrue(gone)
    XCTAssertTrue(model.accounts.isEmpty)
    XCTAssertNil(model.chosen, "back on Simeon's models")
    XCTAssertTrue(model.models.isEmpty)
  }

  @MainActor
  func testARefusedSignInSaysWhyInThePersonsWords() async {
    let model = AIModelsModel(call: { path, _, _ in
      if path == "models/accounts/chatgpt/start" {
        throw SimeonAPIError(message: "ChatGPT didn't allow signing in with a code.", status: 502, code: "device_code_off")
      }
      return ["status": "failed", "reason": "invalid_grant"]
    }, sleep: { _ in })
    let none = await model.startChatGPT()
    XCTAssertNil(none)
    XCTAssertEqual(model.problem, "ChatGPT didn't allow signing in with a code. Check your ChatGPT security settings, then try again.")

    let signIn = ChatGPTSignIn(connectId: "c1", userCode: "X", verificationURL: URL(string: "https://auth.openai.com/codex/device")!, interval: 1, expiresIn: 60)
    let outcome = await model.waitForApproval(signIn)
    XCTAssertEqual(outcome, .failed)
  }

  @MainActor
  func testACodeThatRunsOutEndsTheWait() async {
    var asked = 0
    let model = AIModelsModel(call: { _, _, _ in
      asked += 1
      return ["status": "waiting"]
    }, sleep: { _ in })
    let signIn = ChatGPTSignIn(connectId: "c1", userCode: "X", verificationURL: URL(string: "https://auth.openai.com/codex/device")!, interval: 5, expiresIn: 60)
    let outcome = await model.waitForApproval(signIn)
    XCTAssertEqual(outcome, .expired)
    XCTAssertEqual(asked, 12, "every 5 seconds for a minute")
  }
}
