import Foundation

/**
 * The first run, the Mac's (desktop/scripts/lib/router-renderer-patch.mjs,
 * MEET_*, COO_*, CONNECT_*, COMPUTER_*, NAME_*, and the window's own
 * hand-off): Meet Simeon, the Chief of Staff, the apps, the computer, the
 * person's name, then the hand-off that makes Simeon, their first agent.
 * Done once per account on any device: the host remembers it
 * (`hasSeenOnboarding` in the box's settings, as the Mac and the web window
 * read and write it).
 */
public enum OnboardingStep: Int, CaseIterable, Sendable {
  case meet, chiefOfStaff, connect, computer, name, handOff

  public var title: String {
    switch self {
    case .meet: return "Meet Simeon"
    case .chiefOfStaff: return "Simeon is your personal Chief of Staff"
    case .connect: return "Your agents connect to the apps you already use"
    case .computer: return "They have their own computer and work just like you"
    case .name: return "How should Simeon & Co call you?"
    case .handOff: return ""
    }
  }

  /** The window has no Back on its first two steps (the sign-in and Meet), and the hand-off has none. */
  public var hasBack: Bool { self != .meet && self != .handOff }
  public var next: OnboardingStep? { OnboardingStep(rawValue: rawValue + 1) }
  public var previous: OnboardingStep? { hasBack ? OnboardingStep(rawValue: rawValue - 1) : nil }
}

public enum Onboarding {
  public static let cooCopy = "He hires an agent for every job you hand off."
  public static let namePlaceholder = "Your name"
  public static let nameNote = "They’ll use it in chat and on calls. You can change it later."
  public static let failed = "Simeon couldn’t finish setting up"
  public static let unreachable = "Can't reach your computer right now. Check your connection and try again."

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

  /** The name as it is saved: spaces run together, trimmed, at most 60 characters (`__simeonNameStep`). */
  public static func normalizedName(_ typed: String) -> String {
    String(typed.split(whereSeparator: \.isWhitespace).joined(separator: " ").prefix(60))
  }

  // MARK: The scene, in points about the screen's centre (the window's stage), Simeon an 80 pt avatar scaled.

  /** Where Simeon sits on Meet and on the Chief of Staff step, so Next moves nothing but the words. */
  public static let heroY = -40.0

  public struct Seat: Sendable, Equatable {
    public let id: String
    public let label: String
    public let colour: String
    public let x: Double
    public let y: Double
    public let scale: Double
  }

  /** The Chief of Staff's six agents (`COO_CREW`), at their Mac distance; `crew(width:)` brings them in on a phone. */
  public static let crew: [Seat] = [
    Seat(id: "inbox", label: "Inbox", colour: "violet", x: -300, y: -140, scale: 0.7),
    Seat(id: "research", label: "Research", colour: "red", x: -300, y: -40, scale: 0.7),
    Seat(id: "travel", label: "Travel", colour: "green", x: -300, y: 60, scale: 0.7),
    Seat(id: "finance", label: "Finance", colour: "magenta", x: 300, y: -140, scale: 0.7),
    Seat(id: "sales", label: "Sales", colour: "orange", x: 300, y: -40, scale: 0.7),
    Seat(id: "content", label: "Content", colour: "mint", x: 300, y: 60, scale: 0.7),
  ]

  /** On a screen narrower than 600 pt the agents' centres sit 50 pt from its edge, never nearer Simeon than 104 (`__simeonCooAt`). */
  public static func crew(width: Double) -> [Seat] {
    guard width < 600 else { return crew }
    let side = max(104, min(300, width / 2 - 50))
    return crew.map { Seat(id: $0.id, label: $0.label, colour: $0.colour, x: $0.x < 0 ? -side : side, y: $0.y, scale: $0.scale) }
  }

  /** The blue curve from Simeon's side to an agent's inner edge (`cooLine`), in Simeon's frame: an S of two level tangents. */
  public static func curve(to seat: Seat) -> (start: (x: Double, y: Double), control1: (x: Double, y: Double), control2: (x: Double, y: Double), end: (x: Double, y: Double)) {
    let side: Double = seat.x < 0 ? -1 : 1
    let x1 = side * 60, x2 = seat.x - side * 40, y2 = seat.y - heroY
    let mid = ((x1 + x2) / 2).rounded()
    return ((x1, 0), (mid, 0), (mid, y2), (x2, y2))
  }

  /** Each curve starts drawing 0.7 s in, 0.18 s after the one before; its agent brightens 0.52 s after its curve starts. */
  public static func lineDelay(_ index: Int) -> Double { 0.7 + Double(index) * 0.18 }

  /** The apps that slide behind the glass, in the site's order (`CONNECT_LOGO_SOURCES`). */
  public static let connectApps = ["slack", "gmail", "notion", "figma", "linear", "google-drive", "hubspot", "zoom", "linkedin", "google-calendar", "stripe", "salesforce"]
  public static let connectY = -20.0
  public static let connectTile = 150.0

  public struct Orb: Sendable, Equatable {
    /** From the row's centre. */
    public let x: Double
    public let size: Double
    public let blur: Double
    public let opacity: Double
  }

  /**
   * One app of the row at a moment (simeonlabs.com's connector scene, as the
   * window's `__simeonConnectStep` draws it): the row moves one place every
   * 1.6 s, in 0.55 s on a cubic ease; the app behind the glass swells, the
   * far ones blur and thin out.
   */
  public static func orb(_ index: Int, count: Int, elapsed: Double, width: Double, tile: Double = connectTile) -> Orb {
    let size = tile * 0.5, gap = tile * 1.05, lane = gap * Double(count)
    let period = 1.6, move = 0.55
    let k = max(0, elapsed) / period
    let step = k.rounded(.down)
    let f = min(1, (k - step) * period / move)
    let ease = f < 0.5 ? 4 * f * f * f : 1 - pow(-2 * f + 2, 3) / 2
    let shift = (step + ease) * gap
    var x = (Double(index) * gap - shift).truncatingRemainder(dividingBy: lane)
    if x < -lane / 2 { x += lane }
    if x > lane / 2 { x -= lane }
    let distance = abs(x) / (width / 2)
    let grow = 1 + 0.6 * max(0, 1 - abs(x) / (gap * 0.6))
    return Orb(x: x, size: size * grow, blur: max(0, (distance - 0.8) * 22, (grow - 1) * 30), opacity: max(0, min(1, 1.9 - distance)))
  }

  /** The computer's screen (`ComputerDemo`): a 441 by 300 drawing, 1.45 times on a Mac, as wide as a phone less 16 pt a side. */
  public static let screenSize = (width: 441.0, height: 300.0)
  public static func screenScale(width: Double) -> Double { width >= 600 ? 1.45 : min(1.45, (width - 32) / 441) }
  /** Simeon as the cursor: 0.66 on a Mac's 1.45 screen, in proportion on a phone (`__simeonComputerCursor`). */
  public static func cursorScale(width: Double) -> Double { screenScale(width: width) * 0.66 / 1.45 }

  /** The demo's beats, 0.9 s apart: where the cursor goes and what it presses (`COMPUTER_DEMO_FRAMES`). */
  public static let computerFrames: [(x: Double, y: Double, pressed: String?)] = [
    (-78.3, -62.3, nil), (-78.3, -62.3, "a-tile-2"), (62.8, -62.3, nil), (62.8, -62.3, "a-tile-4"),
    (-178.4, -105.5, nil), (-178.4, -105.5, "a-close"), (77.4, 71.8, nil), (77.4, 71.8, "b-button"),
  ]

  /** Before the first beat the cursor waits under the screen's middle, thinking. */
  public static func computerFrame(_ beat: Int) -> (x: Double, y: Double, pressed: String?) {
    beat < 0 ? (0, 30, nil) : computerFrames[min(beat, computerFrames.count - 1)]
  }

  /** Simeon's centre on the computer step: the cursor's point on the scaled screen, his body below and right of it (`U2e`). */
  public static func cursorPlace(beat: Int, width: Double) -> (x: Double, y: Double, scale: Double) {
    let frame = computerFrame(beat), k = screenScale(width: width), s = cursorScale(width: width)
    return (frame.x * k + 59.8 * s, frame.y * k + 58.6 * s, s)
  }

  /** The name step's three agents over the field (`NAME_SEATS`); on a phone the side ones keep 44 pt from the edge. */
  public static func nameSeats(width: Double) -> [Seat] {
    let seats = [
      Seat(id: "weekly-standup", label: "", colour: "cyan", x: -168, y: -64, scale: 0.62),
      Seat(id: "invoice-chaser", label: "", colour: "red", x: 0, y: -96, scale: 0.72),
      Seat(id: "sales-forecast", label: "", colour: "blue", x: 168, y: -64, scale: 0.62),
    ]
    guard width < 600 else { return seats }
    return seats.map { seat in
      seat.x == 0 ? seat : Seat(id: seat.id, label: seat.label, colour: seat.colour, x: (seat.x < 0 ? -1 : 1) * min(abs(seat.x), width / 2 - 44), y: seat.y, scale: seat.scale)
    }
  }

  /** Simeon, the person's first agent: the Chief of Staff (`SIMEON_COO_PROFILE`), introduced at once. */
  public static func chiefOfStaff(nonce: String) -> JSON {
    [
      "name": "Simeon", "title": "Chief of Staff", "description": "Your Chief of Staff: manages your other Agents and pulls you in for decisions.",
      "templateId": "chief-of-staff", "avatarShape": "cloud", "avatarColor": "blue", "avatarPngBase64": nil,
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
   * unless the account is onboarded already, Simeon is made and starts his
   * introduction, and the first run is marked done. His id, to open his
   * chat; nil when the account already had agents (nothing is made). A
   * second try after a failure does not make a second Simeon.
   */
  public func handOff(ready: @MainActor () -> Void, wait: (Double) async -> Void = { seconds in _ = try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000)) }, now: () -> Date = Date.init) async throws -> String? {
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
      let made = try await backend.command("createAgent", Onboarding.chiefOfStaff(nonce: "ios-onboarding-\(UUID().uuidString.lowercased())"))
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

  /** The name the agents call the person (`POST user/name`), as the Mac's name step saves it; an empty one is not sent. */
  public func saveName(_ typed: String) async {
    let name = Onboarding.normalizedName(typed)
    guard !name.isEmpty, let backend else { return }
    _ = try? await backend.server("user/name", method: "POST", body: ["name": .string(name)])
    if let account { self.account = Account(name: name, email: account.email) }
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
