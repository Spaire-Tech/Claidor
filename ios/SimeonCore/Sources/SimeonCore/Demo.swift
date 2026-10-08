import Foundation

/**
 * The demo's agents and chats, word for word from the review link
 * (desktop/demo/scenario.ts): Simeon, Theo, Iris, Scout and the Launch
 * squad, a founder's small company. Simeon's chat is the morning brief as
 * it stands once it has played.
 */
public enum DemoData {
  static func at(_ minutesAgo: Double, now: Double) -> JSON { .number(now - minutesAgo * 60_000) }

  static func you(_ id: String, _ minutesAgo: Double, _ content: String, now: Double) -> JSON {
    ["kind": "message", "id": .string(id), "role": "user", "content": .string(content), "isStreaming": false, "timestampMs": at(minutesAgo, now: now)]
  }

  static func says(_ id: String, _ minutesAgo: Double, _ content: String, now: Double) -> JSON {
    ["kind": "send-message", "id": .string(id), "message": ["type": "text", "content": .string(content)], "timestampMs": at(minutesAgo, now: now)]
  }

  static func card(_ id: String, _ minutesAgo: Double, _ message: JSON, now: Double) -> JSON {
    ["kind": "send-message", "id": .string(id), "message": message, "timestampMs": at(minutesAgo, now: now)]
  }

  static func file(_ id: String, _ minutesAgo: Double, _ path: String, now: Double) -> JSON {
    let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? path
    return card(id, minutesAgo, ["type": "attachment", "url": .string("file:///home/box/\(encoded)")], now: now)
  }

  static func toTeammate(_ id: String, _ minutesAgo: Double, _ peer: Party, _ content: String, now: Double) -> JSON {
    ["kind": "message", "id": .string(id), "role": "assistant", "content": .string(content), "isStreaming": false, "timestampMs": at(minutesAgo, now: now), "toAgent": ["id": .string(peer.id), "name": .string(peer.name), "kind": "agent"]]
  }

  static func fromTeammate(_ id: String, _ minutesAgo: Double, _ peer: Party, _ content: String, now: Double) -> JSON {
    ["kind": "message", "id": .string(id), "role": "user", "content": .string(content), "isStreaming": false, "timestampMs": at(minutesAgo, now: now), "fromAgent": ["id": .string(peer.id), "name": .string(peer.name)]]
  }

  static func routineChanged(_ id: String, _ minutesAgo: Double, _ name: String, now: Double) -> JSON {
    ["kind": "event", "id": .string(id), "timestampMs": at(minutesAgo, now: now), "event": ["type": "automation-changed", "action": "created", "automationId": "demo-monday-launch-check", "automationName": .string(name)]]
  }

  /** A call as the host wrote it before calls were one line: messages with the peer `voice-call:<call>:<seconds>`. */
  static func earlierCall(_ prefix: String, _ minutesAgo: Double, _ callId: String, _ seconds: Int, _ lines: [(Bool, String)], now: Double) -> [JSON] {
    let peer = Party(id: "voice-call:\(callId):\(seconds)", name: "Bass")
    return lines.enumerated().map { index, line in
      line.0 ? fromTeammate("\(prefix)\(index)", minutesAgo, peer, line.1, now: now) : toTeammate("\(prefix)\(index)", minutesAgo, peer, line.1, now: now)
    }
  }

  public struct Seed: Sendable {
    public let agents: [Agent]
    public let transcripts: [String: [Entry]]
  }

  public static func seed(now: Double = Date().timeIntervalSince1970 * 1000) -> Seed {
    let scout = Party(id: "scout", name: "Scout"), iris = Party(id: "iris", name: "Iris")
    let rows: [(String, String, String, String, String, Double)] = [
      ("simeon", "Simeon", "Chief of Staff", "Runs your day and hands work to the rest of the team.", "blue", 0),
      ("theo", "Theo", "Bookkeeping", "Keeps the books, the runway and the invoices straight.", "green", 70),
      ("iris", "Iris", "Customer support", "Answers tickets from your help docs and flags the hard ones.", "violet", 60 * 3),
      ("scout", "Scout", "Customer research", "Reads what customers say and brings back what matters.", "orange", 60 * 26),
    ]
    var transcripts: [String: [JSON]] = [
      "simeon": [
        you("m0u", 0, "Morning. Where are we on Thursday's launch?", now: now),
        says("m0a", 0, "Thursday is on track: 12 of 15 launch tickets are done in **Linear**, and the review is Thursday at 2 pm.", now: now),
        toTeammate("m4t", 0, scout, "Can you pull three customer quotes for Thursday's review?", now: now),
        fromTeammate("m4f", 0, scout, "Here are three, all about the new setup flow. They're in the review doc.", now: now),
        toTeammate("m5t", 0, iris, "Where are the last launch tickets?", now: now),
        fromTeammate("m5f", 0, iris, "Both closed this morning. 14 of 15 are done; the last one is the pricing page, after launch.", now: now),
        says("m1a", 0, "Scout pulled three customer quotes and Iris closed the last two tickets. The review doc is ready.", now: now),
        file("m1f", 0, "docs/Launch review.docx", now: now),
        you("m2u", 0, "Looks great. Send the agenda to Dana and Marcus, and check in like this every Monday.", now: now).setting("reactions", [["emoji": "\u{1F44D}", "by": "simeon"]]),
        routineChanged("m7r", 0, "Monday launch check", now: now),
        says("m2a", 0, "Done. The agenda went out from **Gmail**.", now: now),
      ],
      "iris": [
        you("i0u", 60 * 48, "Answer the support tickets you're sure about. Send me anything with a refund or an unhappy customer.", now: now),
        says("i0a", 60 * 48 - 1, "I'll answer from your help docs, so I need your support inbox in **Gmail** and the docs in **Notion**.", now: now),
        card("i0c", 60 * 48 - 1, ["type": "connectors", "connectors": ["Gmail", "Notion"]], now: now),
        says("i0b", 60 * 48 - 3, "Both connected. I'll leave refunds and anything unhappy for you.", now: now),
        says("i1a", 70, "Yesterday: 23 tickets answered, a median of 4 minutes to reply. One is yours: **Brightline** is asking for a $960 refund for September.", now: now),
      ],
      "theo": [
        you("t0u", 60 * 5, "What's our runway?", now: now),
        says("t0a", 60 * 5 - 1, "**19 months** at September's spend of $41,200. Revenue was **$48,200**, up 12% on August. That's from **Stripe** and **QuickBooks**, closed through 30 September.", now: now),
        file("t0f", 60 * 5 - 1, "finance/September close.xlsx", now: now),
      ] + earlierCall("t1c", 60 * 4, "call-demo-theo", 71, [
        (true, "Theo, are any invoices late?"),
        (false, "Two. Acme Health owes $4,200, 34 days late, and Halden & Co $1,800."),
        (true, "Send them both a polite reminder."),
        (false, "Will do, from your Gmail."),
      ], now: now) + [
        says("t1a", 60 * 3, "Both reminders went out from **Gmail**. I'll tell you when they pay.", now: now),
      ],
      "scout": [
        you("s0u", 60 * 27, "What are customers saying about onboarding since the redesign?", now: now),
        says("s0a", 60 * 26 + 30, "I read the 14 interview notes in **Notion** and 212 **Intercom** conversations from the last 30 days. Three things stand out:\n\n1. **Setup takes too long.** 9 of 14 people stalled at the workspace step.\n2. **Templates work.** People who picked one were twice as likely to invite a teammate.\n3. **The words confuse.** \"Workspace\" and \"project\" get mixed up in 31 tickets.", now: now),
        file("s0f", 60 * 26 + 29, "research/Onboarding research, September.pdf", now: now),
        says("s0b", 60 * 26 + 29, "The quotes behind each theme are on page 3.", now: now),
      ] + earlierCall("s1c", 60 * 20, "call-demo-scout", 109, [
        (true, "Hey Scout, what's the one thing customers complain about most?"),
        (false, "Setup. Nine of fourteen people stalled at the workspace step."),
        (true, "Okay. Put that at the top of the review doc."),
        (false, "Done, it's the first slide now."),
      ], now: now),
    ]
    let byAuthor = { (author: String, entry: JSON) -> JSON in entry.setting("author", ["id": .string(author), "name": .string(rows.first { $0.0 == author }?.1 ?? author)]) }
    transcripts["launch-squad"] = [
      you("g0u", 58, "Honest check: can we still ship Thursday?", now: now),
      byAuthor("iris", says("g0y", 56, "Engineering says yes if **LIN-482** merges by Wednesday noon. It's in review now.", now: now)),
      byAuthor("scout", says("g0s", 55, "From the research, what customers care about is the new setup flow. The pricing page change can wait.", now: now)),
      byAuthor("simeon", says("g0m", 54, "Then keep Thursday. I'll move the pricing page to the fast-follow list and let Dana and Marcus know.", now: now)),
      you("g1u", 45, "Do it.", now: now),
      byAuthor("simeon", says("g1m", 40, "Done. Moved in **Linear** and posted in #launch on **Slack**.", now: now)),
    ]
    var entries: [String: [Entry]] = [:]
    for (id, list) in transcripts { entries[id] = list.compactMap(Entry.init) }
    var agents = rows.map { row in
      Agent(id: row.0, name: row.1, title: row.2, description: row.3, colour: row.4, lastActivityAt: now - row.5 * 60_000)
    }
    agents.append(Agent(id: "launch-squad", name: "Launch squad", description: "Thursday's launch, with Simeon, Scout and Iris.", colour: "blue", isGroup: true, memberIds: ["simeon", "scout", "iris"], lastActivityAt: now - 40 * 60_000, hasUnread: true, unreadCount: 1))
    for index in agents.indices {
      let list = entries[agents[index].id] ?? []
      agents[index].lastMessagePreview = list.reversed().lazy.compactMap(\.preview).first
    }
    return Seed(agents: agents, transcripts: entries)
  }
}

/** The demo's agents behind the same questions the cloud computer answers. */
public final class DemoBackend: AgentBackend, @unchecked Sendable {
  private let lock = NSLock()
  private var agents: [Agent]
  private var transcripts: [String: [Entry]]
  private var continuations: [UUID: AsyncStream<BackendEvent>.Continuation] = [:]
  private let pace: Double
  public let call: CallEngine?

  /** `pace` below 1 plays the agents' replies faster (the screenshots use it). */
  public init(seed: DemoData.Seed = DemoData.seed(), pace: Double = 1, call: CallEngine? = DemoCall()) {
    agents = seed.agents; transcripts = seed.transcripts; self.pace = pace; self.call = call
  }

  private func emit(_ event: BackendEvent) {
    lock.lock(); let all = Array(continuations.values); lock.unlock()
    for continuation in all { continuation.yield(event) }
  }

  private func touch(_ agentId: String, _ change: (inout Agent) -> Void) {
    lock.lock()
    guard let index = agents.firstIndex(where: { $0.id == agentId }) else { lock.unlock(); return }
    change(&agents[index])
    let agent = agents[index]
    lock.unlock()
    emit(.agentUpserted(agent))
  }

  private func append(_ agentId: String, _ json: JSON) {
    guard let entry = Entry(json) else { return }
    lock.lock(); transcripts[agentId, default: []].append(entry); lock.unlock()
    emit(.transcript(.upsert(agentId: agentId, entry: entry)))
    touch(agentId) { agent in
      agent.lastActivityAt = Date().timeIntervalSince1970 * 1000
      if let preview = entry.preview { agent.lastMessagePreview = preview }
    }
  }

  private func later(_ seconds: Double, _ work: @escaping @Sendable () -> Void) {
    Task { try? await Task.sleep(nanoseconds: UInt64(seconds * pace * 1_000_000_000)); work() }
  }

  public func listAgents() async throws -> [Agent] { lock.withLock { agents } }

  public func transcript(_ agentId: String) async throws -> [Entry] { lock.withLock { transcripts[agentId] ?? [] } }

  public func send(_ agentId: String, text: String) async throws {
    let now = Date().timeIntervalSince1970 * 1000
    append(agentId, DemoData.you("u-\(UUID().uuidString.prefix(8))", 0, text, now: now))
  }

  public func markRead(_ agentId: String) async { touch(agentId) { $0.hasUnread = false; $0.unreadCount = 0 } }

  public func createAgent(name: String, colour: String) async throws -> String {
    let id = "agent-\(UUID().uuidString.prefix(6).lowercased())"
    let agent = Agent(id: id, name: name, colour: colour, lastActivityAt: Date().timeIntervalSince1970 * 1000)
    lock.withLock { agents.append(agent); transcripts[id] = [] }
    emit(.agentUpserted(agent))
    playOnboarding(id)
    return id
  }

  public func createGroup(name: String, memberIds: [String]) async throws -> String {
    let id = "group-\(UUID().uuidString.prefix(6).lowercased())"
    let group: Agent = lock.withLock {
      let members = memberIds.filter { member in agents.contains { $0.id == member && !$0.isGroup } }
      let group = Agent(id: id, name: name, colour: "blue", isGroup: true, memberIds: members, lastActivityAt: Date().timeIntervalSince1970 * 1000)
      agents.append(group); transcripts[id] = []
      return group
    }
    emit(.agentUpserted(group))
    return id
  }

  public func answer(_ agentId: String, entryId: String, value: String) async throws {
    let answered: Entry? = lock.withLock {
      guard let index = transcripts[agentId]?.firstIndex(where: { $0.id == entryId }), let entry = transcripts[agentId]?[index], let updated = Entry(entry.raw.setting("respondedValue", .string(value))) else { return nil }
      transcripts[agentId]?[index] = updated
      return updated
    }
    guard let updated = answered else { return }
    emit(.transcript(.upsert(agentId: agentId, entry: updated)))
    let now = Date().timeIntervalSince1970 * 1000
    touch(agentId) { $0.isComposing = true }
    later(1.6) { [weak self] in
      self?.append(agentId, DemoData.says("a-\(UUID().uuidString.prefix(8))", 0, "Good call. Hiring someone for your inbox now.", now: now))
      self?.touch(agentId) { $0.isComposing = false }
    }
  }

  /** A new agent's first words and question, word for word as the review link plays them (`onboardingScript`, stage 0). */
  private func playOnboarding(_ agentId: String) {
    touch(agentId) { $0.isComposing = true }
    later(1.9) { [weak self] in
      let now = Date().timeIntervalSince1970 * 1000
      self?.append(agentId, DemoData.says("o0a-\(agentId)", 0, "Hi Bass, I'm Simeon, your Chief of Staff. I don't do the work myself: I hire the agents who do, brief them, and keep you out of the weeds. Let's hire your first one.", now: now))
    }
    later(2.9) { [weak self] in
      let now = Date().timeIntervalSince1970 * 1000
      self?.append(agentId, DemoData.card("o0q-\(agentId)", 0, ["type": "widget", "widget": [
        "prompt": "What's the first thing you'd hand to a person if you hired one today?",
        "helpText": "Pick one, or type your own. Not sure? Say so and I'll recommend.",
        "options": [["label": "My inbox: sort it, draft the replies"], ["label": "My calendar and meeting prep"], ["label": "Research and writing"], ["label": "The books: invoices and expenses"]],
        "allowCustom": true,
      ]], now: now))
      self?.touch(agentId) { $0.isComposing = false }
    }
  }

  public func updateAgent(_ agentId: String, name: String, title: String, description: String) async throws {
    touch(agentId) { $0.name = name; $0.title = title; $0.description = description }
  }

  public func routines(_ agentId: String) async throws -> [JSON] {
    agentId == "simeon" ? [["id": "demo-monday-launch-check", "name": "Monday launch check", "schedule": "Every Monday at 9:00 AM"]] : []
  }

  public func events() -> AsyncStream<BackendEvent> {
    let id = UUID()
    let (stream, continuation) = AsyncStream<BackendEvent>.makeStream()
    lock.lock(); continuations[id] = continuation; lock.unlock()
    continuation.onTermination = { [weak self] _ in
      guard let self else { return }
      self.lock.lock(); self.continuations[id] = nil; self.lock.unlock()
    }
    continuation.yield(.connection(live: true))
    return stream
  }
}
