import Foundation

/**
 * The first run (the founder, 12 October 2026: "simple onboarding … asked
 * the necessary. no bloated screen", ChatGPT's way): the person's name,
 * Face ID on the iPhone, then the notifications prompt, each one screen;
 * meanwhile, out of sight, the hand-off makes Simeon, their first agent
 * (`AppStore.handOff`). The Mac shows the name alone (its notifications are
 * asked as the window opens). Done once per account on any device: the host
 * remembers it (`hasSeenOnboarding` in the box's settings, as the Mac and
 * the web window read and write it).
 *
 * Until 12 October 2026 it was the Mac's six scenes (Meet Simeon, the Chief
 * of Staff, the apps, the computer, the name, the hand-off).
 */
public enum OnboardingStep: Int, CaseIterable, Sendable {
  case name, faceID, notifications

  public var title: String {
    switch self {
    case .name: return "What should we call you?"
    case .faceID: return "Unlock Simeon with Face ID"
    case .notifications: return "Let Simeon tell you when work is done"
    }
  }

  /** The title as the phone unlocks: "Unlock Simeon with Touch ID" on an iPhone with a button. */
  public func title(unlockingWith biometry: String) -> String {
    self == .faceID ? "Unlock Simeon with \(biometry)" : title
  }

  /** The line under the title. */
  public var detail: String? {
    switch self {
    case .name: return nil
    case .faceID: return "Keep your agents private on this iPhone."
    case .notifications: return "Get notified when an agent finishes a task or needs you."
    }
  }

  /** The steps a device shows: Face ID only where the phone has it, notifications where the device shows them (the iPhone). */
  public static func steps(faceID: Bool, notifications: Bool) -> [OnboardingStep] {
    var steps: [OnboardingStep] = [.name]
    if faceID { steps.append(.faceID) }
    if notifications { steps.append(.notifications) }
    return steps
  }
}

public enum Onboarding {
  public static let nameLabel = "Name"
  /** The notifications step's switch, in a card as the founder's reference has its own (12 October 2026). */
  public static let notificationsSwitch = "Notifications"
  public static let notificationsSwitchLine = "You can turn them off anytime in Settings."
  public static let failed = "Simeon couldn’t finish setting up"
  public static let unreachable = "Can't reach your computer right now. Check your connection and try again."
  /** While the hand-off is still going once the first run is over (the list, before Simeon is there). */
  public static let gettingReady = "Getting Simeon ready…"

  /**
   * The hand-off's one line (the window's `jqn`, `Xqn`), from the newest
   * status of any agent's computer: its image's percentage while it is
   * pulled, "Waking your computer…" while it sleeps.
   */
  public static func handOffLine(ready: Bool, percent: Int? = nil, sleeping: Bool = false) -> String {
    if ready { return "Getting your team ready…" }
    if let percent { return "Setting up your Simeon… \(percent)%" }
    if sleeping { return "Waking your computer…" }
    return "Setting up your Simeon…"
  }

  /**
   * The name step's field before the person types (`getNamePrompt`): the
   * name they chose, else Google's or Apple's first name; never one made
   * from the e-mail (`namePromptFromSimeon`).
   */
  public static func suggestedName(profile: JSON) -> String? {
    for key in ["preferredName", "suggestedName"] {
      if let name = profile[key]?.string?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty { return name }
    }
    return nil
  }

  /** The name as it is saved: spaces run together, trimmed, at most 60 characters (`__simeonNameStep`). */
  public static func normalizedName(_ typed: String) -> String {
    String(typed.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(60))
  }

  /** Simeon, the person's first agent: the Chief of Staff (`SIMEON_COO_PROFILE`), introduced at once. */
  public static func chiefOfStaff(nonce: String) -> JSON {
    [
      "name": "Simeon", "title": "Chief of Staff", "description": "Your Chief of Staff: manages your other Agents and pulls you in for decisions.",
      "templateId": "chief-of-staff", "avatarShape": .string(AgentFaces.simeonId), "avatarColor": "blue", "avatarPngBase64": nil,
      "origin": "user", "isKickstartRequested": true, "clientNonce": .string(nonce),
    ]
  }

  /** How long the hand-off shows at the least, and how long it waits for the computer (`ONBOARDING_HAND_OFF_DWELL_MS`, `ONBOARDING_BOX_WAIT_TIMEOUT_MS`, the probe every `ONBOARDING_BOX_PROBE_MS`). */
  public static let dwell = 1.5
  public static let computerWait = 60.0
  public static let probeEvery = 2.5
}

public enum FirstRun: Sendable, Equatable {
  /** Done on some device, or the account already has agents. */
  case seen
  /** A new account: no agents and never onboarded. */
  case needed
  /** The computer did not answer. */
  case unknown
}

extension AppStore {
  /**
   * The Mac's start-up gate (`hUn`): seen when the host says so; else the
   * agents are counted, and an account that has some is marked seen (the
   * host is told); none means the first run.
   */
  public func firstRun() async -> FirstRun {
    guard let backend else { return .unknown }
    if let settings = try? await backend.command("getHostSettings", [:]), settings["hasSeenOnboarding"]?.bool == true { return .seen }
    do {
      if try await countAgents(backend) > 0 {
        _ = try? await backend.command("setHostSettings", ["hasSeenOnboarding": true])
        return .seen
      }
      return .needed
    } catch {
      return agents.isEmpty ? .unknown : .seen
    }
  }

  /**
   * The hand-off (the window's create-and-finish, `Pe`): at least 1.5 s on
   * screen; the computer first (asked every 2.5 s, a minute at most); then,
   * unless the account is onboarded already, Simeon is made (his request
   * named for the device, `client`: "ios", "mac") and starts his
   * introduction, and the first run is marked done. His id, to open his
   * chat; nil when the account already had agents (nothing is made). A
   * second try after a failure does not make a second Simeon.
   */
  public func handOff(client: String = "ios", ready: @MainActor () -> Void, wait: (Double) async -> Void = { seconds in _ = try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) }, now: () -> Date = Date.init) async throws -> String? {
    guard let backend else { throw GatewayError(message: Onboarding.unreachable, refused: false) }
    let started = now()
    func dwell() async {
      let left = Onboarding.dwell - now().timeIntervalSince(started)
      if left > 0 { await wait(left) }
    }
    // The computer: any answer means it is up.
    var count: Int?
    while count == nil {
      if let answered = try? await countAgents(backend) { count = answered; break }
      if now().timeIntervalSince(started) >= Onboarding.computerWait { break }
      await wait(Onboarding.probeEvery)
    }
    if count != nil { ready() }
    if firstRunAgentId == nil {
      let seen = (try? await backend.command("getHostSettings", [:]))?["hasSeenOnboarding"]?.bool == true
      if seen || (count ?? 0) > 0 {
        _ = try? await backend.command("setHostSettings", ["hasSeenOnboarding": true])
        await dwell()
        await reloadRoster()
        return nil
      }
      let made = try await backend.command("createAgent", Onboarding.chiefOfStaff(nonce: "\(client)-onboarding-\(UUID().uuidString.lowercased())"))
      guard let id = made["agent"]?["id"]?.text ?? made["id"]?.text else { throw GatewayError(message: "createAgent: no agent in the answer", refused: true) }
      firstRunAgentId = id
    }
    guard let id = firstRunAgentId else { return nil }
    _ = try await backend.command("kickstartAgent", ["id": .string(id)])
    _ = try await backend.command("setHostSettings", ["hasSeenOnboarding": true])
    await dwell()
    await reloadRoster()
    return id
  }

  /** The name step's suggestion (`GET user/profile`), nil when there is none or the server did not answer. */
  public func namePrompt() async -> String? {
    guard let backend, let profile = try? await backend.server("user/profile", method: nil, body: nil) else { return nil }
    return Onboarding.suggestedName(profile: profile)
  }

  /** The name the agents call the person (`POST user/name`), as the Mac's name step saves it; an empty one is not sent. */
  public func saveName(_ typed: String) async {
    let name = Onboarding.normalizedName(typed)
    guard !name.isEmpty, let backend else { return }
    _ = try? await backend.server("user/name", method: "POST", body: ["name": .string(name)])
    if let account { self.account = Account(name: name, email: account.email, pictureURL: account.pictureURL) }
  }

  /** Whether the person's computer answers now: the first run asks from its start, every 2.5 s until it does (`onboarding-box-probe`), so the hand-off can say "Getting your team ready…". */
  public func computerAnswers() async -> Bool {
    guard let backend else { return false }
    return (try? await countAgents(backend)) != nil
  }

  private func countAgents(_ backend: AgentBackend) async throws -> Int {
    let answer = try await backend.command("countAgents", [:])
    return answer.int ?? answer["count"]?.int ?? 0
  }
}

extension DemoData.Seed {
  /** A new account: no agents, no chats (the first run, `--onboarding`). */
  public static let empty = DemoData.Seed(agents: [], transcripts: [:])
}
