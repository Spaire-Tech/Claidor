import Foundation

/**
 * "Iris just joined your team" (the founder, 30 October 2026): the card in
 * the chat of the agent who hired another (`agent-joined`, which the engine
 * writes once CreateAgent has made the agent and sent its brief,
 * `sand-agent-management-tools.ts`). The new agent's face standing on its
 * own (`AgentFaces.standing`), what it does in one short line, and Go to
 * Chat and View Profile at the bottom.
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
}
