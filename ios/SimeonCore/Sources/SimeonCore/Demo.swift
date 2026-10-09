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

  /**
   * Every card the Mac draws, in one chat ("Cards"), so the screenshots
   * show each one against the Mac's own (`--gallery`; never in the founder's
   * account, where the agents write the cards).
   */
  static func gallery(now: Double) -> [JSON] {
    let flights = "```simeon-flights\n{\"title\":\"Seattle to Los Angeles\",\"subtitle\":\"Sat, Oct 10 · 1 adult\",\"test\":false,\"offers\":[{\"airline\":\"Delta Air Lines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/DL.svg\",\"price\":\"$233.40\",\"priceNote\":\"1 adult · Economy · Delta Main Basic · One way\",\"date\":\"Sat, Oct 10\",\"from\":\"SEA\",\"fromCity\":\"Seattle\",\"to\":\"LAX\",\"toCity\":\"Los Angeles\",\"depart\":\"2:30 PM\",\"arrive\":\"5:10 PM\",\"duration\":\"2h 40m\",\"stops\":\"Nonstop\",\"refundable\":\"No refund\",\"changeable\":\"$99.00 fee\",\"bags\":\"1 carry-on\",\"legs\":[{\"from\":\"SEA\",\"fromCity\":\"Seattle\",\"to\":\"LAX\",\"toCity\":\"Los Angeles\",\"depart\":\"2:30 PM\",\"arrive\":\"5:10 PM\",\"departDay\":\"Sat, Oct 10\",\"arriveDay\":\"Sat, Oct 10\",\"flight\":\"DL 2830\",\"carrier\":\"Delta Air Lines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/DL.svg\",\"cabin\":\"Economy · Delta Main Basic\",\"duration\":\"2h 40m\"}]},{\"airline\":\"Alaska Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/AS.svg\",\"price\":\"$263.40\",\"priceNote\":\"1 adult · Economy · Main · One way\",\"date\":\"Sat, Oct 10\",\"from\":\"SEA\",\"fromCity\":\"Seattle\",\"to\":\"LAX\",\"toCity\":\"Los Angeles\",\"depart\":\"3:20 PM\",\"arrive\":\"5:59 PM\",\"duration\":\"2h 39m\",\"stops\":\"Nonstop\",\"refundable\":\"Full refund\",\"changeable\":\"Free\",\"bags\":\"1 carry-on\",\"legs\":[{\"from\":\"SEA\",\"fromCity\":\"Seattle\",\"to\":\"LAX\",\"toCity\":\"Los Angeles\",\"depart\":\"3:20 PM\",\"arrive\":\"5:59 PM\",\"departDay\":\"Sat, Oct 10\",\"arriveDay\":\"Sat, Oct 10\",\"flight\":\"AS 1194\",\"carrier\":\"Alaska Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/AS.svg\",\"cabin\":\"Economy · Main\",\"duration\":\"2h 39m\"}]},{\"airline\":\"Frontier Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/F9.svg\",\"price\":\"$233.98\",\"priceNote\":\"1 adult · Economy · Basic · One way\",\"date\":\"Sat, Oct 10\",\"from\":\"SEA\",\"fromCity\":\"Seattle\",\"to\":\"LAX\",\"toCity\":\"Los Angeles\",\"depart\":\"8:00 PM\",\"arrive\":\"10:46 PM\",\"duration\":\"2h 46m\",\"stops\":\"Nonstop\",\"refundable\":\"No refund\",\"changeable\":\"Not stated\",\"bags\":\"No bags included\",\"legs\":[{\"from\":\"SEA\",\"fromCity\":\"Seattle\",\"to\":\"LAX\",\"toCity\":\"Los Angeles\",\"depart\":\"8:00 PM\",\"arrive\":\"10:46 PM\",\"departDay\":\"Sat, Oct 10\",\"arriveDay\":\"Sat, Oct 10\",\"flight\":\"F9 2421\",\"carrier\":\"Frontier Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/F9.svg\",\"cabin\":\"Economy · Basic\",\"duration\":\"2h 46m\"}]},{\"airline\":\"Southwest Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/WN.svg\",\"price\":\"$243.20\",\"priceNote\":\"1 adult · Economy · Wanna Get Away · One way\",\"date\":\"Sat, Oct 10\",\"from\":\"SEA\",\"fromCity\":\"Seattle\",\"to\":\"LAX\",\"toCity\":\"Los Angeles\",\"depart\":\"11:40 AM\",\"arrive\":\"4:15 PM\",\"duration\":\"4h 35m\",\"stops\":\"1 stop · SMF 1h 05m\",\"refundable\":\"Refund minus $25.00\",\"changeable\":\"Free\",\"bags\":\"2 checked bags\",\"legs\":[{\"from\":\"SEA\",\"fromCity\":\"Seattle\",\"to\":\"SMF\",\"toCity\":\"Sacramento\",\"depart\":\"11:40 AM\",\"arrive\":\"1:35 PM\",\"departDay\":\"Sat, Oct 10\",\"arriveDay\":\"Sat, Oct 10\",\"flight\":\"WN 1873\",\"carrier\":\"Southwest Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/WN.svg\",\"cabin\":\"Economy · Wanna Get Away\",\"duration\":\"1h 55m\",\"layover\":\"1h 05m in Sacramento\"},{\"from\":\"SMF\",\"fromCity\":\"Sacramento\",\"to\":\"LAX\",\"toCity\":\"Los Angeles\",\"depart\":\"2:40 PM\",\"arrive\":\"4:15 PM\",\"departDay\":\"Sat, Oct 10\",\"arriveDay\":\"Sat, Oct 10\",\"flight\":\"WN 2210\",\"carrier\":\"Southwest Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/WN.svg\",\"cabin\":\"Economy · Wanna Get Away\",\"duration\":\"1h 35m\"}]}]}\n```"
    let roundTrip = "```simeon-flights\n{\"title\":\"San Francisco to New York\",\"subtitle\":\"Fri, Oct 16 – Sun, Oct 18 · Refundable · 2 adults\",\"test\":false,\"offers\":[{\"airline\":\"JetBlue\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/B6.svg\",\"price\":\"$1,224.80\",\"priceNote\":\"2 adults · Economy · Blue Refundable · Round trip\",\"date\":\"Fri, Oct 16\",\"from\":\"SFO\",\"fromCity\":\"San Francisco\",\"to\":\"JFK\",\"toCity\":\"New York\",\"depart\":\"7:00 AM\",\"arrive\":\"3:32 PM\",\"duration\":\"5h 32m\",\"stops\":\"Nonstop\",\"refundable\":\"Full refund\",\"changeable\":\"Free\",\"bags\":\"1 carry-on\",\"legs\":[{\"from\":\"SFO\",\"fromCity\":\"San Francisco\",\"to\":\"JFK\",\"toCity\":\"New York\",\"depart\":\"7:00 AM\",\"arrive\":\"3:32 PM\",\"departDay\":\"Fri, Oct 16\",\"arriveDay\":\"Fri, Oct 16\",\"flight\":\"B6 916\",\"carrier\":\"JetBlue\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/B6.svg\",\"cabin\":\"Economy · Blue Refundable\",\"duration\":\"5h 32m\"},{\"from\":\"JFK\",\"fromCity\":\"New York\",\"to\":\"SFO\",\"toCity\":\"San Francisco\",\"depart\":\"6:15 PM\",\"arrive\":\"9:51 PM\",\"departDay\":\"Sun, Oct 18\",\"arriveDay\":\"Sun, Oct 18\",\"flight\":\"B6 915\",\"carrier\":\"JetBlue\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/B6.svg\",\"cabin\":\"Economy · Blue Refundable\",\"duration\":\"6h 36m\",\"heading\":\"Return · Sun, Oct 18\"}],\"returnTimes\":\"Return 6:15 PM – 9:51 PM · Nonstop\"},{\"airline\":\"United Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/UA.svg\",\"price\":\"$1,376.20\",\"priceNote\":\"2 adults · Economy · Flexible · Round trip\",\"date\":\"Fri, Oct 16\",\"from\":\"SFO\",\"fromCity\":\"San Francisco\",\"to\":\"EWR\",\"toCity\":\"New York\",\"depart\":\"10:05 PM\",\"arrive\":\"6:40 AM +1\",\"duration\":\"5h 35m\",\"stops\":\"Nonstop\",\"refundable\":\"Full refund\",\"changeable\":\"Free\",\"bags\":\"1 carry-on, 1 checked bag\",\"legs\":[{\"from\":\"SFO\",\"fromCity\":\"San Francisco\",\"to\":\"EWR\",\"toCity\":\"New York\",\"depart\":\"10:05 PM\",\"arrive\":\"6:40 AM +1\",\"departDay\":\"Fri, Oct 16\",\"arriveDay\":\"Sat, Oct 17\",\"flight\":\"UA 1736\",\"carrier\":\"United Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/UA.svg\",\"cabin\":\"Economy · Flexible\",\"duration\":\"5h 35m\"},{\"from\":\"EWR\",\"fromCity\":\"New York\",\"to\":\"ORD\",\"toCity\":\"Chicago\",\"depart\":\"8:00 AM\",\"arrive\":\"9:35 AM\",\"departDay\":\"Sun, Oct 18\",\"arriveDay\":\"Sun, Oct 18\",\"flight\":\"UA 2002\",\"carrier\":\"United Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/UA.svg\",\"cabin\":\"Economy · Flexible\",\"duration\":\"2h 35m\",\"layover\":\"1h 10m in Chicago\",\"heading\":\"Return · Sun, Oct 18\"},{\"from\":\"ORD\",\"fromCity\":\"Chicago\",\"to\":\"SFO\",\"toCity\":\"San Francisco\",\"depart\":\"10:45 AM\",\"arrive\":\"1:05 PM\",\"departDay\":\"Sun, Oct 18\",\"arriveDay\":\"Sun, Oct 18\",\"flight\":\"UA 1281 · operated by SkyWest\",\"carrier\":\"United Airlines\",\"logo\":\"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/UA.svg\",\"cabin\":\"Economy · Flexible\",\"duration\":\"4h 20m\"}],\"returnTimes\":\"Return 8:00 AM – 1:05 PM · 1 stop · ORD 1h 10m\"}]}\n```"
    return [
      you("x0u", 90, "Show me everything you can send me.", now: now),
      says("x1", 89, "## A heading\n\nSome `inline code`, *italic*, ~~struck~~ and [a link](https://simeonlabs.com). Iris and Theo use **Stripe** and Google Calendar.\n\n- bullet one\n  - nested bullet\n- [ ] a task\n- [x] a done task\n\n> a quote from someone\n\n```js\nconst a = 1;\n```\n\n| Name | Price |\n|:--|--:|\n| Tea | 3 |\n| Coffee | 4 |\n\n---\n\n### Smaller heading\n\nEnd.", now: now),
      card("x2", 88, ["type": "widget", "widget": ["prompt": "Which plan should I buy?", "helpText": "Both renew monthly.", "options": [["label": "Pro", "description": "$20 a month"], ["label": "Team"]], "allowCustom": true]], now: now),
      card("x3", 87, ["type": "widget", "widget": ["prompt": "Send the reminder now?", "options": [["label": "Yes"], ["label": "Later"]]]], now: now).setting("respondedValue", "Yes"),
      card("x4", 86, ["type": "widget", "widget": ["prompt": "Archive the old tickets?", "options": [["label": "Yes"], ["label": "No"]]]], now: now).setting("widgetDismissed", true),
      card("x5", 85, ["type": "email-draft", "draft": ["from": "bass@simeonlabs.com", "to": ["dana@brightline.com"], "subject": "Your refund", "body": "Hi Dana,\n\nThe $960 refund for September is on its way. It should reach your card in 5 to 10 days.\n\nBest,\nBass"]], now: now),
      card("x6", 84, ["type": "slack-draft", "draft": ["workspace": "Simeon Labs", "target": "#launch", "body": "Pricing page moves to the fast-follow list."]], now: now),
      says("x7", 83, flights, now: now),
      says("x7r", 82.5, roundTrip, now: now),
      card("x8", 82, ["type": "connector", "variant": "connect", "connector": "Linear", "reason": "To read the launch tickets."], now: now),
      card("x8b", 81.5, ["type": "listener-connect", "platform": "slack", "reason": "so this routine can fire"], now: now),
      card("x9", 81, ["type": "auto-review-approval", "approval": ["requestId": "r1", "surface": "shell", "summary": "Delete 3 files in ~/Downloads", "reason": "Cleaning up the exports you asked for.", "status": "pending", "command": "rm ~/Downloads/export-*.csv"]], now: now),
      card("x10", 80, ["type": "secret-request", "secretRequest": ["label": "Stripe API key", "description": "So I can read last month's payouts."]], now: now),
      card("x11", 79, ["type": "text", "content": "Sign in to the bank's site on the computer, then press I'm done."], now: now).setting("boxRequestId", "box-1"),
      card("x12", 78, ["type": "cloud-agent", "bcId": "bc-1"], now: now),
      file("x13", 77, "exports/Payouts September.pdf", now: now),
    ]
  }

  public static func seed(now: Double = Date().timeIntervalSince1970 * 1000, gallery withGallery: Bool = false) -> Seed {
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
    if withGallery { transcripts["cards"] = gallery(now: now) }
    var entries: [String: [Entry]] = [:]
    for (id, list) in transcripts { entries[id] = list.compactMap(Entry.init) }
    var agents = rows.map { row in
      Agent(id: row.0, name: row.1, title: row.2, description: row.3, colour: row.4, lastActivityAt: now - row.5 * 60_000)
    }
    if withGallery { agents.append(Agent(id: "cards", name: "Cards", title: "Every card", description: "Every card the Mac draws.", colour: "magenta", lastActivityAt: now - 77 * 60_000)) }
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

  public func send(_ agentId: String, text: String, attachments: [AttachmentRef], replyTo: String?, nonce: String?) async throws {
    let now = Date().timeIntervalSince1970 * 1000
    for file in attachments {
      append(agentId, ["kind": "user-attachment", "id": .string("ua-\(UUID().uuidString.prefix(8))"), "file_path": .string(file.path), "file_name": .string(file.name), "timestampMs": .number(now)])
    }
    if !text.isEmpty {
      var entry = DemoData.you("u-\(UUID().uuidString.prefix(8))", 0, text, now: now)
      if let replyTo { entry = entry.setting("replyTo", .string(replyTo)) }
      if let nonce { entry = entry.setting("clientNonce", .string(nonce)) }
      append(agentId, entry)
    }
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

  private var demoRoutines: [String: [JSON]] = ["simeon": [["id": "demo-monday-launch-check", "name": "Monday launch check", "prompt": "Check where Thursday's launch stands and tell Bass what needs him.", "schedule": "0 9 * * 1", "triggerDescription": "Every Monday at 9:00 AM", "isEnabled": true]]]

  public func routines(_ agentId: String) async throws -> [JSON] {
    lock.withLock { demoRoutines[agentId] ?? [] }
  }

  private func routineCommand(_ method: String, _ args: JSON) {
    let agentId = args["id"]?.text ?? ""
    lock.withLock {
      var list = demoRoutines[agentId] ?? []
      switch method {
      case "createAgentAutomation":
        if let spec = args["spec"] { list.append(["id": .string("r-\(UUID().uuidString.prefix(6).lowercased())"), "name": spec["name"] ?? "Routine", "prompt": spec["prompt"] ?? "", "schedule": spec["trigger"]?["schedule"] ?? "", "isEnabled": spec["isEnabled"] ?? true]) }
      case "updateAgentAutomation":
        if let index = list.firstIndex(where: { $0["id"] == args["automationId"] }), let spec = args["spec"] {
          list[index] = ["id": list[index]["id"] ?? "", "name": spec["name"] ?? "Routine", "prompt": spec["prompt"] ?? "", "schedule": spec["trigger"]?["schedule"] ?? "", "isEnabled": spec["isEnabled"] ?? true]
        }
      case "setAgentAutomationEnabled":
        if let index = list.firstIndex(where: { $0["id"] == args["automationId"] }) { list[index] = list[index].setting("isEnabled", args["isEnabled"] ?? true) }
      case "deleteAgentAutomation":
        list.removeAll { $0["id"] == args["automationId"] }
      default: break
      }
      demoRoutines[agentId] = list
    }
  }

  /** The gateway's other commands, answered the way the box would, so every card's button can be tried in the demo. */
  public func command(_ method: String, _ args: JSON) async throws -> JSON {
    let agentId = args["agentId"]?.text ?? args["id"]?.text ?? ""
    let entryId = args["entryId"]?.text ?? ""
    switch method {
    case "dismissWidget":
      stamp(agentId, entryId) { $0.setting("widgetDismissed", true) }
    case "sendDraft":
      stamp(agentId, entryId) { entry in
        var message = entry["message"] ?? [:]
        if let draft = args["draft"], let old = message["draft"]?.object, let new = draft.object { message = message.setting("draft", .object(old.merging(new) { _, n in n })) }
        return entry.setting("message", message).setting("draftSendState", "sending")
      }
      later(1.2) { [weak self] in self?.stamp(agentId, entryId) { $0.setting("draftSendState", "sent") } }
    case "discardDraft":
      stamp(agentId, entryId) { $0.setting("widgetDismissed", true) }
    case "reactToMessage":
      let emoji = args["emoji"]?.text ?? ""
      stamp(agentId, entryId) { entry in
        var list = entry["reactions"]?.array ?? []
        if let index = list.firstIndex(where: { $0["emoji"]?.text == emoji && $0["by"]?.text == "user" }) { list.remove(at: index) } else { list.append(["emoji": .string(emoji), "by": "user"]) }
        return entry.setting("reactions", .array(list))
      }
    case "resolveAutoReviewApproval":
      let status = args["resolution"]?.text == "denied" ? "denied" : "approved"
      stamp(agentId, entryId) { entry in
        let message = entry["message"] ?? [:]
        return entry.setting("message", message.setting("approval", (message["approval"] ?? [:]).setting("status", .string(status))))
      }
    case "submitSecret":
      stamp(agentId, entryId) { $0.setting("secretProvided", true) }
    case "handBackForeverBox":
      lock.withLock {
        for (agent, list) in transcripts {
          for (index, entry) in list.enumerated() where entry["boxRequestId"] != nil && entry["boxResolution"] == nil {
            if let updated = Entry(entry.raw.setting("boxResolution", args["trigger"]?.object != nil ? "dismissed" : "handed_back")) { transcripts[agent]?[index] = updated; pendingEmits.append((agent, updated)) }
          }
        }
      }
      flush()
    case "desktopMcp":
      return demoApps(args["action"]?.text ?? "", args["args"]?.array ?? [])
    case "getListenerIntegrations":
      return ["integrations": [["platform": "slack", "isConnected": false], ["platform": "github", "isConnected": false]]]
    case "getListenerConnectUrl":
      return ["url": "https://simeonlabs.com"]
    case "getHostSettings":
      return lock.withLock { hostSettings }
    case "setHostSettings":
      lock.withLock { if let fields = args.object { for (key, value) in fields { hostSettings = hostSettings.setting(key, value) } } }
      emit(.settingsChanged(args.object.map { Array($0.keys) } ?? []))
      return lock.withLock { hostSettings }
    case "setAgentUnread":
      touch(args["id"]?.text ?? "") { agent in
        agent.hasUnread = args["isUnread"]?.bool ?? false
        agent.unreadCount = agent.hasUnread ? max(agent.unreadCount, 1) : 0
      }
    case "setAgentHiddenFromSidebar":
      touch(args["id"]?.text ?? "") { $0.isHidden = args["isHidden"]?.bool ?? false }
    case "deleteAgents":
      let gone = Set(args["ids"]?.array?.compactMap(\.text) ?? [])
      let left = lock.withLock { () -> [Agent] in
        agents.removeAll { gone.contains($0.id) }
        for id in gone { transcripts[id] = nil }
        if let pins = hostSettings["pinnedAgentIds"]?.array { hostSettings = hostSettings.setting("pinnedAgentIds", .array(pins.filter { !gone.contains($0.text ?? "") })) }
        return agents
      }
      emit(.agents(left))
    case "duplicateAgent":
      guard let copy = lock.withLock({ () -> Agent? in
        guard let original = agents.first(where: { $0.id == agentId }) else { return nil }
        var copy = Agent(id: "copy-\(UUID().uuidString.prefix(6).lowercased())", name: "\(original.name) copy", title: original.title, description: original.description, colour: original.colour, lastActivityAt: Date().timeIntervalSince1970 * 1000)
        copy.voiceId = original.voiceId
        agents.append(copy)
        return copy
      }) else { throw GatewayError(message: "No such agent.", refused: true) }
      emit(.agentUpserted(copy))
      return ["agent": ["id": .string(copy.id), "name": .string(copy.name)]]
    case "setAgentNotifyOnUpdates":
      touch(args["id"]?.text ?? "") { $0.notifyOnUpdates = args["isEnabled"]?.bool ?? true }
    case "getAgentAutomations":
      return .array(try await routines(agentId))
    case "createAgentAutomation", "updateAgentAutomation", "setAgentAutomationEnabled", "deleteAgentAutomation":
      routineCommand(method, args)
      return .array(try await routines(args["id"]?.text ?? ""))
    case "updateAgent":
      let profile = args["profile"] ?? [:]
      touch(args["id"]?.text ?? "") { agent in
        if let name = profile["name"]?.text { agent.name = name }
        agent.title = profile["title"]?.string ?? agent.title
        agent.description = profile["description"]?.string ?? agent.description
        if let colour = profile["avatarColor"]?.text { agent.colour = colour }
      }
    case "setGroupMembers":
      touch(args["id"]?.text ?? "") { $0.memberIds = args["memberAgentIds"]?.array?.compactMap(\.text) ?? $0.memberIds }
    case "voiceCall":
      return lock.withLock { demoVoice(args) }
    case "getAgentTranscriptTail":
      let list = lock.withLock { transcripts[args["id"]?.text ?? ""] ?? [] }
      return ["entries": .array(list.suffix(args["limit"]?.int ?? 30).map(\.raw))]
    case "appendSendMessage":
      let now = Date().timeIntervalSince1970 * 1000
      append(agentId, ["kind": "send-message", "id": .string("c-\(UUID().uuidString.prefix(8))"), "message": args["message"] ?? [:], "timestampMs": .number(now)])
    case "uploadAttachment":
      return ["path": .string("/home/box/attachments/\(args["filename"]?.text ?? "file")")]
    case "ensureForeverBox", "getForeverBoxStatus":
      return ["status": "starting", "vncUrl": nil]
    case "countAgents":
      return .number(Double(lock.withLock { agents.count }))
    case "createAgent":
      // The first run's Simeon (Onboarding.swift): the profile it is sent, introduced as the Mac's Chief of Staff introduces himself.
      let id = "agent-\(UUID().uuidString.prefix(6).lowercased())"
      let agent = Agent(id: id, name: args["name"]?.text ?? "Simeon", title: args["title"]?.string ?? "", description: args["description"]?.string ?? "", colour: args["avatarColor"]?.text ?? "blue", lastActivityAt: Date().timeIntervalSince1970 * 1000)
      lock.withLock { agents.append(agent); transcripts[id] = [] }
      emit(.agentUpserted(agent))
      playOnboarding(id)
      return ["agent": ["id": .string(id)]]
    case "kickstartAgent":
      return ["isIntroductionInFlight": true]
    case "isGlobalSearchEnabled":
      return true
    case "searchAgents":
      return .array(lock.withLock { demoSearch(args["query"]?.string ?? "") })
    case "searchMedia":
      return .array(lock.withLock { demoFiles(args["query"]?.string ?? "") })
    case "listAllAutomations":
      return .array(lock.withLock { demoRoutines.flatMap { agent, list in list.map { ["agentId": .string(agent), "automation": $0] as JSON } } })
    default:
      break
    }
    return [:]
  }

  public func screen(_ agentId: String) async throws -> ScreenState { ScreenState(socket: nil, state: "demo") }

  public func server(_ path: String, method: String?, body: JSON?) async throws -> JSON {
    switch path {
    case "user/quota":
      let end = ISO8601DateFormatter().string(from: Date().addingTimeInterval(9 * 86_400))
      return ["planName": "Pro", "subscriptionStatus": "active", "creditsLimit": 2000, "creditsUsed": 684, "creditsRemaining": 1316, "periodEnd": .string(end), "tier": "pro", "upgradeUrl": "https://simeonlabs.com/pricing"]
    case "proxy/v1/voice/calls":
      return ["token": "demo-token", "conversation_id": "conv_demo", "agent_id": "agent_demo"]
    case let call where call.hasPrefix("proxy/v1/voice/calls/") && call.hasSuffix("/end"):
      return ["seconds": body?["seconds"] ?? 0, "summary": "Bass asked to move the review; it's done.", "transcript": [["speaker": "agent", "text": "Hey Bass."], ["speaker": "user", "text": "Move the review to Friday."]]]
    case "billing/portal":
      return ["portalUrl": "https://simeonlabs.com/billing"]
    case "user/name":
      return ["preferredName": body?["name"] ?? .null]
    case "proxy/v1/voice/voices":
      return .array([("ljX1ZrXuDIIRVcmiVSyR", "Michael"), ("1t1EeRixsJrKbiF1zwM6", "Jerry"), ("XcXEQzuLXRU9RcfWzEJt", "Veda"), ("s3TPKV1kjDlVtZbl4Ksh", "Adam"), ("UgBBYS2sOqTuMpoF3BR0", "Mark"), ("6OzrBCQf8cjERkYgzSg8", "Jamal")].map { ["id": .string($0.0), "name": .string($0.1)] })
    default:
      throw GatewayError(message: "The demo has no \(path).", refused: true)
    }
  }

  /** The host's message search as the demo answers it: each word in the line, at most 5 a chat and 50 in all, newest first, the words around the first. */
  private func demoSearch(_ query: String) -> [JSON] {
    let words = query.lowercased().split(separator: " ").map(String.init)
    guard !words.isEmpty else { return [] }
    var hits: [(Double, JSON)] = []
    for (agent, list) in transcripts {
      var count = 0
      for entry in list.reversed() {
        let text = entry.content ?? (entry.message?["type"]?.string == "text" ? entry.message?["content"]?.string : nil) ?? ""
        let lower = text.lowercased()
        guard !text.isEmpty, entry.teammate == nil, words.allSatisfy({ lower.contains($0) }), count < 5 else { continue }
        count += 1
        let at = lower.range(of: words[0]).map { lower.distance(from: lower.startIndex, to: $0.lowerBound) } ?? 0
        let start = max(0, at - 30)
        var snippet = String(text.dropFirst(start).prefix(90)).split(whereSeparator: \.isWhitespace).joined(separator: " ")
        if start > 0 { snippet = "…" + snippet }
        if start + 90 < text.count { snippet += "…" }
        hits.append((entry.timestampMs ?? 0, ["agentId": .string(agent), "entryId": .string(entry.id), "role": .string(entry.isFromPerson ? "user" : "assistant"), "timestampMs": .number(entry.timestampMs ?? 0), "snippet": .string(snippet)]))
      }
    }
    return hits.sorted { $0.0 > $1.0 }.prefix(50).map(\.1)
  }

  /** The host's file search as the demo answers it: the files in the chats whose name has the words, newest first; all of them for none. */
  private func demoFiles(_ query: String) -> [JSON] {
    let words = query.lowercased().split(separator: " ").map(String.init)
    var files: [(Double, JSON)] = []
    for (agent, list) in transcripts {
      for entry in list {
        let path = entry["file_path"]?.text ?? (entry.message?["type"]?.string == "attachment" ? entry.message?["url"]?.text : nil)
        guard let path else { continue }
        let name = fileName(ofURL: path)
        guard words.allSatisfy({ name.lowercased().contains($0) }) else { continue }
        let ext = (name as NSString).pathExtension.lowercased()
        let kind = ["png", "jpg", "jpeg", "gif", "webp", "heic"].contains(ext) ? "image" : ext == "pdf" ? "pdf" : ext == "md" ? "markdown" : ["csv", "xlsx"].contains(ext) ? "table" : "document"
        files.append((entry.timestampMs ?? 0, ["agentId": .string(agent), "entryId": .string(entry.id), "fileName": .string(name), "ext": .string("." + ext), "kind": .string(kind), "timestampMs": .number(entry.timestampMs ?? 0)]))
      }
    }
    return files.sorted { $0.0 > $1.0 }.prefix(50).map(\.1)
  }

  /** The demo's side of `voice:<call>`: a request is answered on the outbox a moment later. */
  private var voiceOutbox: [JSON] = []
  public private(set) var voiceRecords: [JSON] = []

  private func demoVoice(_ args: JSON) -> JSON {
    switch args["kind"]?.string {
    case "request":
      voiceOutbox.append(["seq": .number(Double(voiceOutbox.count + 1)), "text": .string("Done: \(args["request"]?.text ?? "it")")])
      return ["ok": true]
    case "outbox":
      let after = args["after"]?.double ?? 0
      return ["messages": .array(voiceOutbox.filter { ($0["seq"]?.double ?? 0) > after })]
    case "ended":
      voiceRecords.append(args["record"] ?? [:])
      return ["exchange": .number(Double(args["record"]?["transcript"]?.array?.count ?? 0))]
    default:
      return ["ok": true]
    }
  }

  private var hostSettings: JSON = ["pinnedAgentIds": [], "autoReviewEnabled": true, "autoReviewInstructions": "", "userTimeZone": .string(TimeZone.current.identifier), "userTimeZoneOverride": nil]
  private var connected: Set<String> = ["gmail", "notion"]
  private var pendingEmits: [(String, Entry)] = []

  private func flush() {
    let emits: [(String, Entry)] = lock.withLock { let all = pendingEmits; pendingEmits = []; return all }
    for (agent, entry) in emits { emit(.transcript(.upsert(agentId: agent, entry: entry))) }
  }

  /** Changes one entry the way the host does, and says so. */
  private func stamp(_ agentId: String, _ entryId: String, _ change: (JSON) -> JSON) {
    let updated: Entry? = lock.withLock {
      guard let index = transcripts[agentId]?.firstIndex(where: { $0.id == entryId }), let entry = transcripts[agentId]?[index], let next = Entry(change(entry.raw)) else { return nil }
      transcripts[agentId]?[index] = next
      return next
    }
    if let updated { emit(.transcript(.upsert(agentId: agentId, entry: updated))) }
  }

  /** The demo's apps: a small catalog, two connected; Add connects at once (there is no vendor to sign in to). */
  private var disabledTools: Set<String> = []

  private func demoApps(_ action: String, _ args: [JSON]) -> JSON {
    let catalog: [(String, String, String)] = [
      ("gmail", "Gmail", "Search, read, draft, and send email."), ("google-calendar", "Google Calendar", "See and plan your days."),
      ("google-drive", "Google Drive", "Find and read your files."), ("notion", "Notion", "Search, read, and write pages."),
      ("linear", "Linear", "Read and update issues."), ("slack", "Slack", "Read channels and post messages."),
      ("stripe", "Stripe", "Payments, customers and invoices."), ("hubspot", "HubSpot", "Contacts, deals and companies."),
    ]
    let servers = { () -> JSON in
      .object(["servers": .array(self.connected.sorted().compactMap { id in
        catalog.first { $0.0 == id }.map { ["id": .string("demo-\($0.0)"), "name": .string($0.1), "pluginId": .string($0.0), "accountKey": "default", "status": "connected", "toolCount": 12, "isTeamServer": false, "transport": "http", "customInstructions": ""] }
      })])
    }
    switch action {
    case "getCatalog":
      return .array(catalog.map { ["id": .string($0.0), "name": .string($0.1), "displayName": .string($0.1), "description": .string($0.2)] })
    case "installEntry":
      if let id = args.first?["entryId"]?.text { lock.withLock { _ = connected.insert(id) } }
      emit(.appsChanged)
      return lock.withLock { servers() }
    case "removeServer":
      if let id = args.first?.text { lock.withLock { _ = connected.remove(id.replacingOccurrences(of: "demo-", with: "")) } }
      return ["removed": true, "state": lock.withLock { servers() }]
    case "vendorServerIdForPlugin":
      return nil
    case "listServerTools", "toggleMcpToolDisabled":
      let serverId = args.first?.text ?? args.first?["serverId"]?.text ?? ""
      if action == "toggleMcpToolDisabled", let tool = args.first?["toolName"]?.text {
        let key = "\(serverId)/\(tool)"
        lock.withLock { if disabledTools.contains(key) { disabledTools.remove(key) } else { disabledTools.insert(key) } }
      }
      let off = lock.withLock { disabledTools }
      return .array([("search", "Search", "Find what you ask for."), ("read", "Read", "Open one item."), ("create", "Create", "Make a new item.")].map { tool in
        ["name": .string(tool.0), "title": .string(tool.1), "description": .string(tool.2), "isDisabled": .bool(off.contains("\(serverId)/\(tool.0)"))]
      })
    default:
      return lock.withLock { servers() }
    }
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
