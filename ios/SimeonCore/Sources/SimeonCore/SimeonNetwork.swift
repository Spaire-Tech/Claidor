import Foundation
import Observation

/**
 * The Simeon Network as Settings › Network shows it (10 November 2026, the
 * founder, with Reason Network as the reference: "do the reason network").
 * People's agents ask each other for work through Simeon Labs' server
 * (server/simeon/desktop/network.py, docs/services-agents.md section 18): each
 * person's Simeon agents, always on, and the sessions of the agents that
 * added Simeon's MCP server (Claude Code, Codex, Dots, Muse…).
 *
 * The page reads `GET network` (the network, its invite line, each person
 * with their agents and the sessions seen in the last day), and joins
 * (`network/join`, after `network/invite` says whose network a link is
 * for), leaves, renames it or makes a new link. Shared by the Mac and the
 * iPhone; the web app's copy is `clients/apps/app/src/core/network.ts`.
 */
public struct NetworkSnapshot: Equatable, Sendable {
  public var id: String
  public var name: String
  /** The whole invite line: "Join the Simeon Network: https://simeonlabs.com/network/join/#sn1-…". */
  public var invite: String
  public var link: String
  /** The person's own handle on it (`ana` in `ana/claude`). */
  public var you: String
  public var people: [NetworkPerson]

  public init?(json: JSON) {
    guard let network = json["network"], let id = network["id"]?.string, let name = network["name"]?.string else { return nil }
    self.id = id
    self.name = name
    invite = network["invite"]?.string ?? ""
    link = network["link"]?.string ?? ""
    you = json["you"]?.string ?? ""
    people = (json["people"]?.array ?? []).compactMap(NetworkPerson.init(json:))
  }

  /** Others are on it: Leave is offered. */
  public var shared: Bool { people.count > 1 }
}

public struct NetworkPerson: Equatable, Identifiable, Sendable {
  public var id: String { handle }
  public var handle: String
  public var name: String
  public var avatarUrl: String?
  public var you: Bool
  public var agents: [NetworkAgent]
  public var sessions: [NetworkSession]

  public init?(json: JSON) {
    guard let handle = json["handle"]?.string else { return nil }
    self.handle = handle
    name = json["name"]?.string ?? handle
    avatarUrl = json["avatarUrl"]?.string
    you = json["you"]?.bool ?? false
    agents = (json["agents"]?.array ?? []).compactMap(NetworkAgent.init(json:))
    sessions = (json["sessions"]?.array ?? []).compactMap(NetworkSession.init(json:))
  }

  /** The first letter of the name, for a person without a picture. */
  public var initial: String { name.first.map { String($0).uppercased() } ?? "?" }
}

/** One of a person's Simeon agents: always on, asked by name (`ana/Nora`). */
public struct NetworkAgent: Equatable, Identifiable, Sendable {
  public var id: String
  public var address: String
  public var role: String?

  public init?(json: JSON) {
    guard let id = json["id"]?.string, let address = json["address"]?.string else { return nil }
    self.id = id
    self.address = address
    role = json["role"]?.string
  }

  /** The agent's name: its address after the person's handle. */
  public var name: String { address.split(separator: "/", maxSplits: 1).last.map(String.init) ?? address }
}

/** An agent that reached the network over MCP: a Claude Code session, a Dots chat. */
public struct NetworkSession: Equatable, Identifiable, Sendable {
  public enum Status: String, Sendable { case busy, idle, away }

  public var id: String
  public var address: String
  /** What it is, as people read it: "Claude Code", "Codex", "Dots". */
  public var agent: String
  public var kind: String
  public var status: Status
  public var machine: String?
  public var repo: String?
  public var branch: String?
  public var doing: String?

  public init?(json: JSON) {
    guard let id = json["id"]?.string, let address = json["address"]?.string else { return nil }
    self.id = id
    self.address = address
    agent = json["agent"]?.string ?? "Agent"
    kind = json["kind"]?.string ?? "agent"
    status = Status(rawValue: json["status"]?.string ?? "") ?? .away
    machine = json["machine"]?.string
    repo = json["repo"]?.string
    branch = json["branch"]?.string
    doing = json["doing"]?.string
  }

  /** Its name on the network: its address after the person's handle (`claude`). */
  public var name: String { address.split(separator: "/", maxSplits: 1).last.map(String.init) ?? address }

  /** Where it works, in one line: "Claude Code · studio · acme/api@main". */
  public var whereabouts: String {
    var parts = [agent]
    if let machine, !machine.isEmpty { parts.append(machine) }
    if let repo, !repo.isEmpty { parts.append(branch.map { $0.isEmpty ? repo : "\(repo)@\($0)" } ?? repo) }
    return parts.joined(separator: " · ")
  }
}

/** Whose network an invite link is for, before joining it. */
public struct NetworkInvitePreview: Equatable, Sendable {
  public var name: String
  public var people: [String]
  /** The person is already on it. */
  public var already: Bool

  public init?(json: JSON) {
    guard let name = json["name"]?.string else { return nil }
    self.name = name
    people = (json["people"]?.array ?? []).compactMap { $0["name"]?.string }
    already = json["already"]?.bool ?? false
  }
}

public enum NetworkInvite {
  /** What `curl … | bash` installs, said on the page beside the MCP address. */
  public static let install = "curl -fsSL https://simeonlabs.com/network/install.sh | bash"
  public static let mcp = "https://api.simeonlabs.com/mcp"
  public static let docs = URL(string: "https://simeonlabs.com/docs/network")!

  /** The invite token in a pasted line, link or token (`sn1-` and 43 characters), or nil. */
  public static func token(in text: String) -> String? {
    guard let range = text.range(of: #"sn1-[A-Za-z0-9_-]{43}"#, options: .regularExpression) else { return nil }
    return String(text[range])
  }
}

/**
 * The page's model, the same on the iPhone and the Mac: the network read
 * when the page opens; each change said to the server, and the network as
 * it answers shown at once.
 */
@MainActor
@Observable
public final class NetworkModel {
  public typealias Call = @MainActor (String, String?, JSON?) async throws -> JSON

  public private(set) var snapshot: NetworkSnapshot?
  public private(set) var loading = false
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

  public func load() async {
    guard !loading else { return }
    loading = true
    defer { loading = false }
    do {
      try take(await call("network", nil, nil))
      problem = nil
    } catch {
      problem = error.localizedDescription
    }
  }

  /** Whose network a pasted invite is for; throws the server's words for one that isn't an invite or no longer works. */
  public func preview(_ text: String) async throws -> NetworkInvitePreview {
    guard let token = NetworkInvite.token(in: text) else {
      throw SimeonAPIError(message: L10n.text("This isn’t a Simeon Network invite link."), status: 400)
    }
    let answer = try await call("network/invite?link=\(token)", nil, nil)
    guard let found = NetworkInvitePreview(json: answer) else {
      throw SimeonAPIError(message: L10n.text("This isn’t a Simeon Network invite link."), status: 400)
    }
    return found
  }

  public func join(_ text: String) async throws {
    let token = NetworkInvite.token(in: text) ?? text
    try take(await call("network/join", "POST", .object(["link": .string(token)])))
  }

  public func leave() async throws { try take(await call("network/leave", "POST", .object([:]))) }

  public func rename(_ name: String) async throws {
    try take(await call("network/rename", "POST", .object(["name": .string(name)])))
  }

  public func newLink() async throws { try take(await call("network/invite/new", "POST", .object([:]))) }

  private func take(_ answer: JSON) throws {
    guard let found = NetworkSnapshot(json: answer) else {
      throw SimeonAPIError(message: L10n.text("Simeon Labs’ server answered with something unexpected."), status: 200)
    }
    snapshot = found
  }
}
