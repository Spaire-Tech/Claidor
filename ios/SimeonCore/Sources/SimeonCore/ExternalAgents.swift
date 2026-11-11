import Foundation
import Observation

/**
 * Settings › External Agents (11 November 2026, the founder, with another
 * app's Bots as the reference: "i want the bots to have their own setting
 * called External Agents… in the menu as External Agents - and the agents
 * icons"; "as you see there is a setting and a last used. we dont have any
 * of that and grok bot did connect and work. have that. the setting is just
 * disconnect").
 *
 * The page: a card that says in a line what it is, with Learn more (the
 * docs) and Simeon among the bots on the website's grey; then the bots,
 * each with its mascot, a connected one with "Last used …" and a gear whose
 * one item is Disconnect, one not connected yet with its line and +; then
 * Add, for any other bot. What the server says is connected:
 * `GET /desktop/api/external-agents` (`server/simeon/desktop/external_agents.py`).
 */
public enum ExternalAgents {
  /**
   * One of the bots the page always lists: the server's kind, its mascot
   * (`Mascots/<icon>`), its name (theirs, never translated), its row's line
   * and its sheet's words. A bot in its maker's cloud is given an address;
   * a coding agent on the person's computer is shown the ways to connect it
   * (`ways`).
   */
  public struct Known: Identifiable, Sendable {
    public let kind: String
    public let icon: String
    public let name: String
    public let line: String
    public let give: String
    public var ways: [Way] = []
    public var id: String { kind }
  }

  /**
   * One way to connect a coding agent, as its sheet shows it: what it is, a
   * line under it, and what to copy (11 November 2026, the founder: "can we
   * add claude code - and i'm guessing codex can do that as well… we need
   * to show the many ways to do it for both").
   */
  public struct Way: Identifiable, Sendable, Equatable {
    public let title: String
    public let line: String
    /** What is copied: words for the agent, or a command for Terminal; never translated. */
    public let text: String
    public var id: String { text }
  }

  /**
   * Dots, Muse and Grok Bot, in the order the Bots section had them; then
   * Claude Code and Codex, the coding agents (11 November 2026), each with
   * the founder's mascot.
   */
  public static var known: [Known] {
    [
      Known(kind: "dots", icon: "dots", name: "Dots", line: L10n.text("Connect Simeon to ChatGPT Dots."), give: L10n.text("Give this to your Dot.")),
      Known(kind: "muse", icon: "muse", name: "Muse", line: L10n.text("Connect Simeon to Meta Muse."), give: L10n.text("Give this to your Muse.")),
      Known(kind: "grok-bot", icon: "grokbot", name: "Grok Bot", line: L10n.text("Connect Simeon to Grok."), give: L10n.text("Give this to your Bot.")),
      Known(kind: "claude-code", icon: "claudecode", name: "Claude Code", line: L10n.text("Connect Simeon to Claude Code."), give: waysIntro, ways: ways(for: "Claude Code", command: claudeCodeCommand)),
      Known(kind: "codex", icon: "codex", name: "Codex", line: L10n.text("Connect Simeon to Codex."), give: waysIntro, ways: ways(for: "Codex", command: codexCommand)),
    ]
  }

  /** Over a coding agent's ways: any one does it, and each signs in once in the browser. */
  public static var waysIntro: String { L10n.text("Pick one. Your browser opens once, to sign in to Simeon.") }

  /** What a coding agent is asked: the Simeon Network's skill, which has it connect itself (simeonlabs.com/network/skill.md). */
  public static let askLine = "Follow the instructions at https://simeonlabs.com/network/skill.md"
  /**
   * Claude Code alone, in Terminal: the server added for every project, then
   * its sign-in (`claude mcp login`, Claude Code 2.1.322). `;`, not `&&`: the
   * sign-in still runs when the server was added before, and Windows'
   * PowerShell 5 knows no `&&`.
   */
  public static let claudeCodeCommand = "claude mcp add --transport http --scope user simeon https://api.simeonlabs.com/mcp; claude mcp login simeon"
  /** Codex alone, in Terminal: it signs in as it adds the server ("Detected OAuth support. Starting OAuth flow", Codex 0.167.1). */
  public static let codexCommand = "codex mcp add simeon --url https://api.simeonlabs.com/mcp"
  /** Every coding agent on the computer at once: the network's installer adds the server and the skill to each it finds. */
  public static let installCommand = "curl -fsSL https://simeonlabs.com/network/install.sh | bash"

  /** A coding agent's three ways: ask it, its own command, or the installer for all of them. */
  public static func ways(for name: String, command: String) -> [Way] {
    [
      Way(title: L10n.text("Ask \(name)"), line: L10n.text("Paste this into \(name). It does the rest."), text: askLine),
      Way(title: L10n.text("In Terminal"), line: L10n.text("Connects \(name) alone."), text: command),
      Way(title: L10n.text("Every coding agent on your computer"), line: L10n.text("Claude Code, Codex and the others it finds, at once."), text: installCommand),
    ]
  }

  /** The icons drawn as mascots, cut out on Connect apps' tile (`Mascots/<icon>`): white, or #2c2c2e on dark. */
  public static let mascots: Set<String> = ["grokbot", "muse", "dots", "claudecode", "codex"]

  /**
   * The card's picture, the same on every app (11 November 2026, the
   * founder: "use simeon avatar if anything and by all means make it
   * proportionate"): 320 by 200, Simeon's own face (64, round) at its
   * middle, Grok Bot, Muse and Dots the same size (40) on a circle of 70
   * around him, 120° apart, each joined to him by a line. He sits 118 down,
   * so the four of them sit in the picture's middle.
   */
  public enum Picture {
    public static let width = 320.0
    public static let height = 200.0
    public static let centerX = 160.0
    public static let centerY = 118.0
    public static let radius = 70.0
    public static let simeon = 64.0
    public static let bot = 40.0
    /**
     * Simeon's portrait in his circle: his whole head and his collar, the
     * hair clear of the edge (11 November 2026, the founder: "way too
     * zoomed. back it up. make it proportionate for it not to cut"). A
     * square of 390 of the portrait's 512 around (257, 200): drawn 1.31
     * times the circle and lowered by 0.144 of it, so his head is in its
     * middle.
     */
    public static let simeonZoom = 1.31
    public static let simeonLower = 0.144
    /** Each bot's mascot and where its middle is. */
    public static let bots: [(icon: String, x: Double, y: Double)] = [("grokbot", 90.0), ("muse", 210.0), ("dots", 330.0)].map { icon, angle in
      let radians = angle * .pi / 180
      return (icon, centerX + radius * cos(radians), centerY - radius * sin(radians))
    }
  }

  /** The mascots the account menu's row shows at its right (the reference's "Reason with" and its icons). */
  public static let menuIcons = ["grokbot", "muse", "dots"]

  /** Where Learn more goes: the Simeon Network's page, which says what each bot can do. */
  public static let learnMore = URL(string: "https://simeonlabs.com/docs/network")!

  /** The address a bot is given: its own for the three (`/mcp/grok-bot`: the server knows which bot it is whatever its sign-in says), the plain one for any other. */
  public static func address(for kind: String?) -> String {
    let base = "https://api.simeonlabs.com/mcp"
    switch kind {
    case "dots": return base + "/dots"
    case "muse": return base + "/muse"
    case "grok-bot", "grokbot": return base + "/grok-bot"
    default: return base
    }
  }

  /** The icon for a kind the server names (`network.KINDS`): a known bot's mascot (Claude Code's and Codex's the founder's), its maker's mark for another coding agent, nil for one there is none of. */
  public static func icon(for kind: String) -> String? {
    switch kind {
    case "dots", "muse", "codex": return kind
    case "grok-bot": return "grokbot"
    case "claude-code": return "claudecode"
    case "claude": return "claude"
    case "copilot": return "copilot"
    case "gemini": return "google"
    default: return nil
    }
  }

  /** A row of the page. */
  public struct Row: Identifiable, Equatable, Sendable {
    /** The server's row id for a connected bot (its kind, or `client:…`), else the known bot's kind. */
    public let id: String
    public let name: String
    public let icon: String?
    /** What the server says of it, when it is connected. */
    public let connected: ExternalAgent?
    /** A known bot's line, while it isn't connected. */
    public let line: String?
  }

  /** The rows: the connected ones first (the newest use first, as the server sends them), then the known bots not connected yet. */
  public static func rows(_ connected: [ExternalAgent]) -> [Row] {
    let on = connected.map { agent in
      Row(id: agent.id, name: agent.name, icon: icon(for: agent.kind), connected: agent, line: nil)
    }
    let off = known.filter { bot in !connected.contains { $0.kind == bot.kind } }.map { bot in
      Row(id: bot.kind, name: bot.name, icon: bot.icon, connected: nil, line: bot.line)
    }
    return on + off
  }

  /** The Disconnect question, the same on every app. */
  public static func disconnectTitle(_ name: String) -> String { L10n.text("Disconnect \(name)?") }
  public static let disconnectLine = L10n.text("It can’t reach your agents anymore. You can connect it again anytime.")

  /** The card's words: what the page is, in a line. */
  public static let headline = L10n.text("Connect other assistants to Simeon")
  public static let explanation = L10n.text("Connect Grok Bot, Muse, Dots, Claude Code or Codex. They can message your agents, follow their work and answer what they ask.")
}

/** One bot the person let in, as the server lists it. */
public struct ExternalAgent: Identifiable, Equatable, Sendable {
  public let id: String
  public let kind: String
  public let name: String
  public let lastUsedAt: Date?
  public let connectedAt: Date?

  public init(id: String, kind: String, name: String, lastUsedAt: Date?, connectedAt: Date? = nil) {
    self.id = id; self.kind = kind; self.name = name; self.lastUsedAt = lastUsedAt; self.connectedAt = connectedAt
  }

  public init?(json: JSON) {
    guard let id = json["id"]?.text, !id.isEmpty, let name = json["name"]?.text else { return nil }
    self.id = id
    kind = json["kind"]?.text ?? "agent"
    self.name = name
    lastUsedAt = json["lastUsedAt"]?.double.map { Date(timeIntervalSince1970: $0 / 1000) }
    connectedAt = json["connectedAt"]?.double.map { Date(timeIntervalSince1970: $0 / 1000) }
  }

  /** "Last used Nov 10, 2026", in the app's language. */
  public func lastUsedWords(timeZone: TimeZone = .current) -> String? {
    guard let at = lastUsedAt ?? connectedAt else { return nil }
    let format = DateFormatter()
    format.locale = L10n.locale()
    format.timeZone = timeZone
    format.setLocalizedDateFormatFromTemplate("yMMMd")
    return L10n.text("Last used \(format.string(from: at))")
  }
}

/**
 * The page's model, the same on the iPhone and the Mac: the connected bots
 * read as the page opens; Disconnect said to the server, and the list as it
 * answers shown at once.
 */
@MainActor
@Observable
public final class ExternalAgentsModel {
  public typealias Call = @MainActor (String, String?, JSON?) async throws -> JSON

  public private(set) var connected: [ExternalAgent] = []
  public private(set) var loaded = false
  /** What went wrong, in the person's words; the page shows it. */
  public var problem: String?

  @ObservationIgnored private let call: Call

  public init(call: @escaping Call) { self.call = call }

  public convenience init(store: AppStore) {
    self.init { [weak store] path, method, body in
      guard let backend = store?.backend else { throw SimeonAPIError(message: L10n.text("Sign in to Simeon first."), status: 401) }
      return try await backend.server(path, method: method, body: body)
    }
  }

  public var rows: [ExternalAgents.Row] { ExternalAgents.rows(connected) }

  public func load() async {
    do {
      take(try await call("external-agents", nil, nil))
      problem = nil
    } catch {
      problem = error.localizedDescription
    }
    loaded = true
  }

  public func disconnect(_ id: String) async {
    do {
      take(try await call("external-agents/disconnect", "POST", .object(["id": .string(id)])))
      problem = nil
    } catch {
      problem = error.localizedDescription
    }
  }

  private func take(_ answer: JSON) {
    connected = (answer["agents"]?.array ?? []).compactMap(ExternalAgent.init(json:))
  }
}
