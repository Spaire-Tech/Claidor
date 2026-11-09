import Foundation
import XCTest
@testable import SimeonCore

/** AI Models (AIModels.swift): accounts as the server lists them, their words, the code sign-in, Claude through Claude Code on the computer, and the page's model against a stand-in server. */
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

    let started = await model.startChatGPT()
    let signIn = try XCTUnwrap(started)
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

  /** The page and the composer (9 November 2026, the founder: "do not duplicate the subscription", "the model chosen is on the composer"): a connected provider only under Connected, the composer's menu by provider, its name and the words under an account. */
  @MainActor
  func testAConnectedProviderLeavesSubscriptionsAndTheComposerNamesTheModel() async throws {
    var chosen: String? = nil
    let model = AIModelsModel(call: { path, method, body in
      switch (method ?? "GET", path) {
      case ("GET", "models/accounts"):
        return ["accounts": [["id": "c1", "provider": "claude", "kind": "subscription", "label": "ada@example.com", "plan": "max", "status": "available"]]]
      case ("PUT", "models/own"):
        chosen = body?["model"]?.text
        fallthrough
      default:
        return ["model": chosen.map(JSON.string) ?? .null, "models": [
          ["modelId": "own:claude:sonnet", "modelName": "Claude Sonnet", "provider": "claude"],
          ["modelId": "own:claude:opus", "modelName": "Claude Opus", "provider": "claude"],
        ]]
      }
    }, sleep: { _ in })
    await model.load()
    XCTAssertEqual(model.unconnected, ["chatgpt"], "Claude only under Connected")
    XCTAssertTrue(model.hasAccount("claude"))
    XCTAssertEqual(model.choices.map(\.provider), ["claude"])
    XCTAssertEqual(model.choices.first?.models.map(\.name), ["Claude Sonnet", "Claude Opus"], "the server's order")
    XCTAssertEqual(model.composerName, "Simeon")
    XCTAssertNil(model.chosenChoice)
    await model.choose("own:claude:opus")
    XCTAssertEqual(model.composerName, "Claude Opus")
    XCTAssertEqual(model.chosenChoice?.provider, "claude")
    let account = try XCTUnwrap(model.accounts.first)
    XCTAssertEqual(account.kindName, "Subscription", "no plan, no usage under its name")
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

  /** Claude in Claude Code on the computer (9 November 2026): the link from the computer, the code typed there, the server told only the account. */
  @MainActor
  func testClaudeSignsInOnTheComputerAndTheServerKeepsOnlyTheAccount() async throws {
    var commands: [String] = []
    var typed: [String] = []
    var told: [JSON] = []
    var accounts: [JSON] = []
    var chosen: String?
    let claudeModels: [JSON] = [
      ["modelId": "own:claude:opus", "modelName": "Claude Opus", "provider": "claude"],
      ["modelId": "own:claude:sonnet", "modelName": "Claude Sonnet", "provider": "claude"],
    ]
    let model = AIModelsModel(
      call: { path, method, body in
        switch (method ?? "GET", path) {
        case ("GET", "models/accounts"): return ["accounts": .array(accounts)]
        case ("GET", "models/own"): return ["model": chosen.map(JSON.string) ?? .null, "models": .array(accounts.isEmpty ? [] : claudeModels)]
        case ("PUT", "models/own"):
          chosen = body?["model"]?.text
          return ["model": chosen.map(JSON.string) ?? .null, "models": .array(claudeModels)]
        case ("POST", "models/accounts/claude"):
          told.append(body ?? .null)
          let account: JSON = ["id": "c1", "provider": "claude", "kind": "subscription", "label": body?["label"] ?? .null, "plan": body?["plan"] ?? .null, "status": "available"]
          accounts = [account]
          return ["account": account]
        case ("DELETE", "models/accounts/c1"):
          accounts = []
          chosen = nil
          return ["disconnected": true, "revoked": false]
        default: throw SimeonAPIError(message: "not found", status: 404)
        }
      },
      command: { method, args in
        commands.append(method)
        switch method {
        case "claudeCodeSignInStart": return ["url": "https://claude.com/cai/oauth/authorize?code=true&state=s1"]
        case "claudeCodeSignInFinish":
          let code = args["code"]?.text ?? ""
          typed.append(code)
          return code == "good#s1"
            ? ["status": "connected", "account": ["signedIn": true, "email": "ada@example.com", "plan": "max"]]
            : ["status": "failed", "reason": "refused"]
        default: return ["ok": true]
        }
      },
      sleep: { _ in }
    )
    let started = await model.startClaude()
    let signIn = try XCTUnwrap(started)
    XCTAssertEqual(signIn.shownAddress, "claude.com")
    let wrong = await model.finishClaude(code: "nope")
    XCTAssertEqual(wrong, .refused)
    let done = await model.finishClaude(code: "  good#s1 ")
    guard case .connected(let account) = done else { return XCTFail("connected, not \(done)") }
    XCTAssertEqual(account.providerName, "Claude")
    XCTAssertEqual(account.detail, "Subscription · Max")
    XCTAssertEqual(typed, ["nope", "good#s1"], "the code goes to the computer, trimmed")
    XCTAssertEqual(told.count, 1)
    XCTAssertEqual(told.first?["label"]?.text, "ada@example.com")
    XCTAssertNil(told.first?["code"], "the server never gets the code")
    XCTAssertEqual(model.chosen, "own:claude:opus", "connecting is using: Claude's best model chosen")
    XCTAssertTrue(model.connected(AIModels.claude))

    let gone = await model.disconnect(account)
    XCTAssertTrue(gone)
    XCTAssertTrue(commands.contains("claudeCodeSignOut"), "Claude Code signs out on the computer")
    XCTAssertNil(model.chosen)
  }

  @MainActor
  func testAComputerWithoutClaudeCodeSaysItNeedsAnUpdate() async {
    let model = AIModelsModel(
      call: { _, _, _ in [:] },
      command: { method, _ in throw GatewayError(message: "unknown gateway method: \(method)", refused: true, status: 404, method: method) },
      sleep: { _ in }
    )
    let none = await model.startClaude()
    XCTAssertNil(none)
    XCTAssertEqual(model.problem, "Your computer needs an update before it can run Claude Code.")
    XCTAssertNil(ClaudeSignIn(json: ["url": "https://evil.example/oauth/authorize"]), "only Anthropic's own page")
    XCTAssertNil(ClaudeSignIn(json: ["url": "http://claude.com/oauth/authorize"]))
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
