import Foundation
import Observation

/** The signed-in person, from `user/profile`. */
public struct Account: Sendable, Equatable {
  public let name: String
  public let email: String

  public init(name: String, email: String) { self.name = name; self.email = email }

  public init?(profile: JSON) {
    let email = profile["email"]?.string ?? ""
    let name = profile["preferredName"]?.text ?? profile["name"]?.text ?? profile["nickname"]?.text ?? email.split(separator: "@").first.map(String.init) ?? ""
    if name.isEmpty && email.isEmpty { return nil }
    self.init(name: name, email: email)
  }

  /** "BF" for Bass Fall: the account button's letters. */
  public var initials: String {
    let words = name.split(whereSeparator: { $0 == " " || $0 == "." || $0 == "_" || $0 == "-" })
    let letters = words.prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
    return letters.isEmpty ? String(email.prefix(1)).uppercased() : letters
  }
}

/**
 * What every screen reads: the roster, the chats, the call, the account.
 * One store for the app; the screens only draw it and call its actions.
 */
@MainActor
@Observable
public final class AppStore {
  public private(set) var agents: [Agent] = []
  public private(set) var transcripts: [String: [Entry]] = [:]
  /** The step an agent is on right now ("Checking Linear"), by agent. */
  public private(set) var steps: [String: String] = [:]
  public private(set) var call: CallState?
  public private(set) var isLive = false
  public private(set) var isLoading = false
  public var account: Account?
  /** Something went wrong that the person should hear about, once. */
  public var problem: String?

  public private(set) var backend: AgentBackend?
  @ObservationIgnored private var listening: Task<Void, Never>?
  @ObservationIgnored private var running: [String: String] = [:]

  public init() {}

  /** Starts on a backend: the roster, then the live events. */
  public func attach(_ backend: AgentBackend) async {
    detach()
    self.backend = backend
    isLoading = true
    defer { isLoading = false }
    let events = backend.events()
    listening = Task { [weak self] in
      for await event in events {
        guard let self else { return }
        self.apply(event)
      }
    }
    backend.call?.observe { [weak self] state in
      Task { @MainActor in self?.call = state }
    }
    await reloadRoster()
  }

  public func detach() {
    listening?.cancel()
    listening = nil
    backend = nil
    agents = []; transcripts = [:]; steps = [:]; call = nil; isLive = false; account = nil
  }

  public func reloadRoster() async {
    guard let backend else { return }
    do {
      agents = sortRoster(try await backend.listAgents())
    } catch {
      problem = "Couldn't reach your agents: \(error.localizedDescription)"
    }
  }

  public func apply(_ event: BackendEvent) {
    switch event {
    case .agents(let list):
      agents = sortRoster(list)
    case .agentUpserted(let agent):
      var next = agents.filter { $0.id != agent.id }
      next.append(agent)
      agents = sortRoster(next)
    case .transcript(let change):
      guard let current = transcripts[change.agentId] else { return }
      transcripts[change.agentId] = change.applied(to: current)
    case .step(let agentId, let id, let summary, let isRunning):
      if isRunning { running[agentId] = id; steps[agentId] = summary }
      else if running[agentId] == id { running[agentId] = nil; steps[agentId] = nil }
    case .connection(let live):
      isLive = live
    }
  }

  public func agent(_ id: String?) -> Agent? { agents.first { $0.id == id } }

  /** The members of a group, as agents. */
  public func members(of group: Agent) -> [Agent] { group.memberIds.compactMap { id in agents.first { $0.id == id } } }

  public func rows(for agentId: String) -> [ChatRow] {
    Chat.rows(transcripts[agentId] ?? [], isGroup: agent(agentId)?.isGroup ?? false)
  }

  /** A chat comes on screen: its entries (once), and it is read. */
  public func open(_ agentId: String) async {
    guard let backend else { return }
    if transcripts[agentId] == nil {
      do { transcripts[agentId] = try await backend.transcript(agentId) } catch {
        transcripts[agentId] = []
        problem = "Couldn't open this chat: \(error.localizedDescription)"
      }
    }
    if let index = agents.firstIndex(where: { $0.id == agentId }) { agents[index].hasUnread = false; agents[index].unreadCount = 0 }
    await backend.markRead(agentId)
  }

  public func send(_ text: String, to agentId: String) async {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let backend, !trimmed.isEmpty else { return }
    do { try await backend.send(agentId, text: trimmed) } catch { problem = "Your message didn't send: \(error.localizedDescription)" }
  }

  public func answer(_ value: String, card entryId: String, in agentId: String) async {
    guard let backend else { return }
    do { try await backend.answer(agentId, entryId: entryId, value: value) } catch { problem = error.localizedDescription }
  }

  /** New Agent: the agent's id, to open its chat. */
  public func createAgent(name: String, colour: String) async -> String? {
    guard let backend else { return nil }
    do {
      let id = try await backend.createAgent(name: name, colour: colour)
      await reloadRoster()
      return id
    } catch {
      problem = "Couldn't create \(name): \(error.localizedDescription)"
      return nil
    }
  }

  /** New Group Chat: named for its members, "Simeon, Iris", as the window names it. */
  public func createGroup(memberIds: [String]) async -> String? {
    guard let backend, memberIds.count >= 2 else { return nil }
    let name = memberIds.compactMap { id in agents.first { $0.id == id }?.name }.joined(separator: ", ")
    do {
      let id = try await backend.createGroup(name: name, memberIds: memberIds)
      await reloadRoster()
      return id
    } catch {
      problem = "Couldn't start the group: \(error.localizedDescription)"
      return nil
    }
  }

  public func updateProfile(_ agentId: String, name: String, title: String, description: String) async {
    guard let backend else { return }
    do { try await backend.updateAgent(agentId, name: name, title: title, description: description); await reloadRoster() } catch { problem = error.localizedDescription }
  }

  public func routines(_ agentId: String) async -> [JSON] {
    (try? await backend?.routines(agentId)) ?? []
  }

  // MARK: The call

  public var canCall: Bool { backend?.call != nil }

  public func startCall(_ agent: Agent) {
    backend?.call?.start(agentId: agent.id, agentName: agent.name, colour: agent.colour ?? "blue")
  }

  public func mute(_ muted: Bool) { backend?.call?.mute(muted) }
  public func hangUp() { backend?.call?.hangUp() }
}
