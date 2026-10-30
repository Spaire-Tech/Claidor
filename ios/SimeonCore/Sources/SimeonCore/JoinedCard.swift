import Foundation

/**
 * "Iris just joined your team" (the founder, 30 October 2026): the card in
 * the chat of the agent who hired another (`agent-joined`, which the engine
 * writes once CreateAgent has made the agent and sent its brief,
 * `sand-agent-management-tools.ts`). The new agent's face standing on its
 * own (`AgentFaces.standing`), what it does in one short line, and Go to
 * Chat and View Profile at the bottom, on the colour of the face's own
 * background (`Colours`).
 */
public struct JoinedCard: Hashable, Sendable {
  public let agentId: String
  /** Its name as it was hired: the roster's is shown while it has the agent (a rename since shows). */
  public let name: String
  /** What it does, one short sentence: the engine keeps it short (`joinedLine`), the apps to two lines at most. */
  public let line: String

  public init(agentId: String, name: String, line: String) {
    self.agentId = agentId
    self.name = name
    self.line = line
  }

  /** The card from its message; none without the agent's id and name. */
  init?(message: JSON) {
    guard let agentId = message["agentId"]?.text,
          let name = message["name"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else { return nil }
    self.init(agentId: agentId, name: name, line: message["line"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "")
  }

  /** The agent while the roster has it: gone (deleted since), the card keeps its words and loses its buttons. */
  public func agent(in agents: [Agent]) -> Agent? {
    agents.first { $0.id == agentId }
  }

  /** "Iris just joined your team", by the name the roster has now, else the one it was hired with. */
  public func title(in agents: [Agent]) -> String {
    Self.title(name: agent(in: agents)?.name ?? name)
  }

  public static func title(name: String) -> String { L10n.text("\(name) just joined your team") }
  public static let goToChat = L10n.text("Go to Chat")
  public static let viewProfile = L10n.text("View Profile")

  /** The card's colours for this agent: its face's, when it stands as one with a backdrop; nil for a picture of its own, or an agent gone, which keep the chat's grey. */
  public func colours(in agents: [Agent]) -> Colours? {
    agent(in: agents).flatMap { Colours(face: AgentFaces.standing($0)) }
  }

  /**
   * The card in the colour of its face's own background (the founder, 30
   * October 2026, choosing design B of ten: "i like B a lot"), so each new
   * teammate's card is theirs: a gradient from the colour 16% lighter at the
   * top leading corner to 24% darker at the bottom trailing one, a soft light
   * behind the face, Go to Chat white with its words in the colour 55%
   * darker, and View Profile a white pane over it. The words are white on
   * every face: shown all 30 with near-black words on the light ones and
   * all 30 in white, the founder chose white ("make em all white").
   */
  public struct Colours: Hashable, Sendable {
    public let top: RGB
    public let bottom: RGB
    /** Go to Chat's words, on its white. */
    public let deep: RGB

    public init(_ backdrop: RGB) {
      let white = RGB(1, 1, 1), black = RGB(0, 0, 0)
      top = backdrop.blended(toward: white, 0.16)
      bottom = backdrop.blended(toward: black, 0.24)
      deep = backdrop.blended(toward: black, 0.55)
    }

    public init?(face: AgentFace?) {
      guard let backdrop = face?.backdrop else { return nil }
      self.init(backdrop)
    }

    /** The title. */
    public var ink: RGB { RGB(1, 1, 1) }
    /** What it does. */
    public var secondaryInk: RGB { RGB(1, 1, 1, 0.8) }
    /** View Profile's pane and its edge. */
    public var pane: RGB { RGB(1, 1, 1, 0.18) }
    public var paneEdge: RGB { RGB(1, 1, 1, 0.4) }
    /** The light behind the face. */
    public static let glow = RGB(1, 1, 1, 0.22)
  }
}
