import Foundation

/**
 * One choice on a question card: its label and, when the agent gave one, a
 * line under it. Picking it sends `value`, the reply the agent wrote for it
 * (the label when it wrote none), as the upstream app's card does; until 28
 * October 2026 both apps sent the label. `style` marks the recommended path
 * (`primary`) or a destructive one (`danger`).
 */
public struct QuestionOption: Hashable, Sendable {
  public enum Style: String, Sendable { case plain = "default", primary, danger }
  public let label: String
  public let description: String?
  public let value: String
  public let style: Style

  public init(label: String, description: String? = nil, value: String? = nil, style: Style = .plain) {
    self.label = label; self.description = description; self.value = value ?? label; self.style = style
  }
}

/**
 * A question card (`send-message` of type `widget`), with the answer once given.
 *
 * It may ask several questions (10 November 2026, the founder: "have the
 * thing swipe when there's many questions instead of having the agent send
 * one by one"): `questions` holds two to four, which the person goes through
 * one at a time and sends together, a line each (`reply(_:)`, the engine's
 * `formatQuestionsReply`). The card's own prompt and options are its first
 * question's, as the engine writes them.
 */
public struct QuestionCard: Hashable, Sendable {
  /** One question of the card. */
  public struct Question: Hashable, Sendable {
    public let prompt: String
    public let help: String?
    public let options: [QuestionOption]
    public let allowsOwnAnswer: Bool
    /** Several options may be picked (`multiSelect`). */
    public let multiSelect: Bool

    public init(prompt: String, help: String? = nil, options: [QuestionOption], allowsOwnAnswer: Bool = false, multiSelect: Bool = false) {
      self.prompt = prompt; self.help = help; self.options = options; self.allowsOwnAnswer = allowsOwnAnswer; self.multiSelect = multiSelect
    }

    /** An answer as the person reads it: each picked option by its label (several joined with commas), else the words they typed. */
    public func shown(_ answer: String) -> String {
      let lines = answer.split(whereSeparator: { $0 == "\n" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
      let named = lines.map { line in options.first(where: { $0.value == line })?.label ?? line }
      return named.joined(separator: ", ")
    }
  }

  public let prompt: String
  public let help: String?
  public let options: [QuestionOption]
  public let allowsOwnAnswer: Bool
  /** Several options may be picked (`multiSelect`); their values go back one per line. */
  public let multiSelect: Bool
  /** Every question of the card, its own first; one for a card that asks one. */
  public let questions: [Question]
  /** What the person answered (`respondedValue`); nil while it waits. */
  public let answer: String?
  public let isDismissed: Bool
  /** Skipped: the person wrote instead of answering (`widgetSkipped`); the card is closed. */
  public let isSkipped: Bool

  public var labels: [String] { options.map(\.label) }
  public var isOpen: Bool { answer == nil && !isDismissed && !isSkipped }
  /** The card asks several questions, one at a time. */
  public var asksSeveral: Bool { questions.count > 1 }

  public init(prompt: String, help: String?, options: [QuestionOption], allowsOwnAnswer: Bool, multiSelect: Bool = false, questions: [Question] = [], answer: String?, isDismissed: Bool, isSkipped: Bool) {
    self.prompt = prompt; self.help = help; self.options = options; self.allowsOwnAnswer = allowsOwnAnswer
    self.multiSelect = multiSelect; self.answer = answer; self.isDismissed = isDismissed; self.isSkipped = isSkipped
    let own = Question(prompt: prompt, help: help, options: options, allowsOwnAnswer: allowsOwnAnswer, multiSelect: multiSelect)
    self.questions = questions.count > 1 ? questions : [own]
  }

  /** An answer as the person reads it: each picked option by its label (one per line for several), else the words they typed. */
  public func shown(_ answer: String) -> String {
    questions[0].shown(answer)
  }

  /** What a skipped question of a several-question card says in the reply (the engine's `SKIPPED_ANSWER`). */
  public static let skippedAnswer = "(skipped)"

  /**
   * The reply a card sends: for one question, its answer as it is; for
   * several, a line each, the question then its answer ("Budget? Under $75
   * CAD"), `(skipped)` for one skipped. Nil when nothing was answered.
   */
  public func reply(_ answers: [String?]) -> String? {
    let given = questions.indices.map { index -> String? in
      let answer = index < answers.count ? answers[index]?.trimmingCharacters(in: .whitespacesAndNewlines) : nil
      return answer?.isEmpty == false ? answer : nil
    }
    guard given.contains(where: { $0 != nil }) else { return nil }
    guard asksSeveral else { return given[0] }
    return zip(questions, given).map { question, answer in
      let words = answer.map { $0.split(whereSeparator: { $0 == "\n" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: ", ") } ?? Self.skippedAnswer
      let head = question.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
      let joint = head.last.map { "?:？：".contains($0) } == true ? " " : ": "
      return head + joint + words
    }.joined(separator: "\n")
  }

  /** Each question's answer read back from the reply, as the person reads it (nil when skipped, or not there: an older app answers the first only). */
  public func answers(_ reply: String) -> [String?] {
    guard asksSeveral else { return [shown(reply)] }
    let lines = reply.split(whereSeparator: { $0 == "\n" }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    return questions.indices.map { index -> String? in
      guard index < lines.count else { return nil }
      let line = lines[index]
      let head = questions[index].prompt.trimmingCharacters(in: .whitespacesAndNewlines)
      var answer = line.hasPrefix(head) ? String(line.dropFirst(head.count)) : line
      answer = answer.trimmingCharacters(in: .whitespaces)
      if answer.first == ":" || answer.first == "：" { answer = String(answer.dropFirst()).trimmingCharacters(in: .whitespaces) }
      guard !answer.isEmpty, answer != Self.skippedAnswer else { return nil }
      return questions[index].shown(answer)
    }
  }
}

/** An email or a Slack message the agent drafted, for the person to send or discard (host/extensions/transcript/draft-cards.ts). */
public struct DraftCard: Hashable, Sendable {
  public enum Kind: String, Sendable { case email, slack }
  public let kind: Kind
  public let from: String
  public let to: [String]
  public let cc: [String]
  public let subject: String
  public let body: String
  public let workspace: String
  public let target: String
  public let thread: String
  /** Files attached on Send: paths on the computer (`attachments`). */
  public let attachments: [String]
  /** It answers an email the person received (`replyTo`): the card says Reply. */
  public let isReply: Bool
  /** `editable`, `sending` or `sent` (`draftSendState`). */
  public let state: String
  public let isDismissed: Bool

  init?(message: JSON, entry: Entry) {
    guard let draft = message["draft"] else { return nil }
    kind = message["type"]?.string == "slack-draft" ? .slack : .email
    let list = { (value: JSON?) -> [String] in value?.array?.compactMap(\.text) ?? value?.text.map { [$0] } ?? [] }
    from = draft["from"]?.string ?? ""
    to = list(draft["to"])
    cc = list(draft["cc"])
    subject = draft["subject"]?.string ?? ""
    body = draft["body"]?.string ?? ""
    workspace = draft["workspace"]?.string ?? ""
    target = draft["target"]?.string ?? ""
    thread = draft["thread"]?.string ?? ""
    attachments = list(draft["attachments"])
    isReply = !(draft["replyTo"]?.object?.isEmpty ?? true)
    state = entry["draftSendState"]?.string ?? "editable"
    isDismissed = entry["widgetDismissed"]?.bool ?? false
  }

  /** The attached files' own names, the last part of each path. */
  public var attachmentNames: [String] {
    attachments.map { path in path.split(separator: "/").last.map(String.init) ?? path }
  }

  /** What the card says beside its title ("Ready to send", "Sending…", "Sent", "Discarded"). */
  public var status: String {
    if isDismissed { return L10n.text("Discarded") }
    switch state {
    case "sending": return L10n.text("Sending…")
    case "sent": return L10n.text("Sent")
    default: return L10n.text("Ready to send")
    }
  }
}

/** One airline offer on a flights card (the patch's `__simeonFlightsParse`). */
public struct FlightOffer: Hashable, Sendable {
  public let airline, logo, price, priceNote, date: String
  public let from, fromCity, to, toCity, depart, arrive, duration, stops: String
  public let refundable, changeable, bags, returnTimes: String
  public let legs: [FlightLeg]
  /** Duffel's offer id: what "Book with Simeon" books (13 October 2026); empty on a card from before booking. */
  public var offerId = ""
  /** Who sells the ticket when it is not the airline flown ("Hahn Air" on an Air Senegal flight, 24 October 2026); empty otherwise. */
  public var soldBy = ""
}

public struct FlightLeg: Hashable, Sendable {
  public let from, fromCity, to, toCity, depart, arrive, flight, carrier, logo, cabin, duration, layover, heading, departDay, arriveDay: String
}

/**
 * Flight results: an agent's message that is exactly one ```` ```simeon-flights ````
 * block of JSON (patch: FLIGHTS_SOURCE), up to eight offers.
 */
public struct FlightsCard: Hashable, Sendable {
  public let title: String
  public let subtitle: String
  public let offers: [FlightOffer]
  /** Duffel's test mode: pretend fares (the server's `test`, or "Test results" in the subtitle of a card from before it sent one). */
  public var isTest = false

  public static func parse(_ text: String) -> FlightsCard? {
    guard let body = Markdown.soleFence(text, language: "simeon-flights"), let json = try? JSON.parse(Data(body.utf8)) else { return nil }
    let s = { (value: JSON?) -> String in value?.string?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    let offers = (json["offers"]?.array ?? []).filter { $0.object != nil }.prefix(8).map { o -> FlightOffer in
      let legs = (o["legs"]?.array ?? []).filter { $0.object != nil }.map { l in
        FlightLeg(from: s(l["from"]), fromCity: s(l["fromCity"]), to: s(l["to"]), toCity: s(l["toCity"]), depart: s(l["depart"]), arrive: s(l["arrive"]), flight: s(l["flight"]), carrier: s(l["carrier"]), logo: s(l["logo"]), cabin: s(l["cabin"]), duration: s(l["duration"]), layover: s(l["layover"]), heading: s(l["heading"]), departDay: s(l["departDay"]), arriveDay: s(l["arriveDay"]))
      }
      var offer = FlightOffer(airline: s(o["airline"]), logo: s(o["logo"]), price: s(o["price"]), priceNote: s(o["priceNote"]), date: s(o["date"]), from: s(o["from"]), fromCity: s(o["fromCity"]), to: s(o["to"]), toCity: s(o["toCity"]), depart: s(o["depart"]), arrive: s(o["arrive"]), duration: s(o["duration"]), stops: s(o["stops"]), refundable: s(o["refundable"]), changeable: s(o["changeable"]), bags: s(o["bags"]), returnTimes: s(o["returnTimes"]), legs: legs)
      offer.offerId = s(o["offerId"])
      offer.soldBy = s(o["soldBy"])
      return offer
    }
    guard !offers.isEmpty else { return nil }
    let subtitle = s(json["subtitle"])
    let test = json["test"]?.bool == true || subtitle.components(separatedBy: " · ").contains("Test results")
    return FlightsCard(title: s(json["title"]), subtitle: subtitle, offers: Array(offers), isTest: test)
  }

  /** "AA" for American Airlines: the mark when the airline has no logo (`__simeonInitials`). */
  public static func initials(_ name: String) -> String {
    let words = name.split(whereSeparator: \.isWhitespace).map(String.init).filter { !$0.isEmpty && !["airline", "airlines", "airways", "air"].contains($0.lowercased()) }
    if words.count > 1 { return (String(words[0].prefix(1)) + String(words[1].prefix(1))).uppercased() }
    return String((words.first ?? "?").prefix(2)).uppercased()
  }
}

/** Agents talking to each other, folded (the window's `JIn`/`WPn`): one message, a fan-out, or a thread. */
public enum Exchange: Hashable, Sendable {
  case single(inbound: Bool, peer: Party)
  case fanout(peers: [Party])
  case thread(count: Int, peers: [Party])

  /** The words before the agents' chip: "Message from", "Messaged", "4 messages with". */
  public var label: String {
    switch self {
    case .single(let inbound, _): return inbound ? L10n.text("Message from") : L10n.text("Messaged")
    case .fanout: return L10n.text("Messaged")
    case .thread(let count, _): return L10n.text("\(count) messages with")
    }
  }

  public var peers: [Party] {
    switch self {
    case .single(_, let peer): return [peer]
    case .fanout(let peers), .thread(_, let peers): return peers
    }
  }
}

/** A routine named in a "Created routine" line. */
public struct RoutineRef: Hashable, Sendable {
  public let id: String
  public let name: String
}

/** The cards that wait on the person: an auto-review approval, a secret, or the computer handed over. */
public enum RequestCard: Hashable, Sendable {
  /** `auto-review-approval`: Allow once, Always allow, Deny (`resolveAutoReviewApproval`); what it is about (`surface`) and the rule Always allow would add (`proposedRule`). */
  case approval(requestId: String, summary: String, reason: String, command: String?, status: String, surface: String?, proposedRule: String?)
  /** `secret-request`: a password field and Save securely (`submitSecret`), or the X (`dismissWidget`), a decline. */
  /** `variable`: the environment variable it is kept under on the computer ("AWS_ACCESS_KEY_ID"), when the agent named one; shown over its field (10 November 2026). */
  case secret(label: String, description: String, variable: String?, provided: Bool, dismissed: Bool)
  /** A message with `boxRequestId`: "Your turn on the computer" (`handBackForeverBox`). */
  case computer(requestId: String, instruction: String, resolution: String?)
  /** `user-form`: fields the page needs the person to type, typed in by the computer (`submitUserForm`), or the X (`dismissUserForm`), a decline. */
  case form(UserFormCard)
  /** `credential-request`: a login from the person's 1Password, filled into the page once they allow it (`answerCredentialRequest`). */
  case credential(CredentialRequestCard)
  /** `onepassword-connect`: connect 1Password from the Mac (`connectOnePassword`), or the X (`dismissOnePasswordConnect`). */
  case onePasswordConnect(OnePasswordConnectCard)
  /** `store-entry`: keep a login, a card or contact info in the Credentials Store (`answerStoreEntry`), or a note of one used or saved. */
  case storeEntry(StoreEntryCard)
}

/** The call a chat line stands for: how long, and what was said. */
public struct CallLine: Hashable, Sendable {
  public let fromPerson: Bool
  public let text: String

  public init(fromPerson: Bool, text: String) { self.fromPerson = fromPerson; self.text = text }
}

/**
 * One row of a chat as the phone draws it, in the window's own order and
 * folding (`npt`, `WIn`): a time stamp after a quarter of an hour, the
 * "New" line before the first unread message, the person's bubbles on the
 * right, an agent's on the left, and every card the Mac draws.
 */
public enum ChatRow: Identifiable, Hashable, Sendable {
  case stamp(id: String, date: Date)
  case unread(id: String)
  case bubble(Bubble)
  case flights(id: String, card: FlightsCard)
  case file(id: String, name: String, url: String, fromPerson: Bool)
  case question(id: String, card: QuestionCard)
  case draft(id: String, card: DraftCard)
  case connectors(id: String, names: [String], connected: Bool, reason: String?)
  /** "Connect Slack so this routine can fire" (`listener-connect`): Slack or GitHub, for routines that wake on them. */
  case listenerConnect(id: String, platform: String, reason: String?)
  case request(id: String, card: RequestCard)
  case teammates(id: String, exchange: Exchange, entries: [Entry])
  /** A call with the agent (`voice-call` event): its length and what both said; `live` while the call is still on ("Voice chat · now"). */
  case voiceCall(id: String, seconds: Int, lines: [CallLine], live: Bool)
  case routines(id: String, action: String, routines: [RoutineRef])
  /** A card this version cannot draw: said so, as the Mac does. */
  case notice(id: String, text: String)
  /** Under a message of yours that did not reach the agent: "Failed to send", Resend, Delete (the Mac's `sand-failed-send-actions`). */
  case failedSend(id: String, nonce: String)
  /** Under a message held while the computer was out of reach: "Waiting to send…" or "Will send when reconnected", and Cancel (`sand-queued-send-notice`). */
  case queuedSend(id: String, nonce: String)
  /** Under a message that has a thread: "1 reply", "3 replies", which opens it (`sand-thread-affordance`), on the message's side. */
  case thread(id: String, rootId: String, count: Int, side: Side)
  /** A cloud agent the agent started (`cloud-agent`, its `bcId`): its state read from the host (`getCloudAgentInfo`). */
  case cloudAgent(id: String, bcId: String)
  /** "Connect GitHub" with a one-time code (`github-sign-in`): GitHub signed in on the computer for a cloud agent's coding (GitHubSignInCard). */
  case gitHubSignIn(id: String, card: GitHubSignInCard)
  /** "Connect Claude Code" and "Connect Codex" in one card (`model-connect`): what a cloud agent's coding runs on, when neither is connected (ModelConnectCard). */
  case modelConnect(id: String, card: ModelConnectCard)
  /** A purchase waiting on the person, or how it went (`purchase`, the checkout card). */
  case purchase(id: String, card: PurchaseCard)
  /** What an agent found to buy, each with Buy and View website (`products`). */
  case products(id: String, card: ProductsCard)
  /** The traveller form for a flight being booked (`flight-passengers`). */
  case flightPassengers(id: String, card: FlightPassengersCard)
  /** "Iris just joined your team" (`agent-joined`): an agent this one hired, Go to Chat and View Profile (JoinedCard.swift). */
  case joined(id: String, card: JoinedCard)
  /** "Changed from ⌘ Simeon to ✳ Claude Opus 5.5" (`model-changed`): the agent's turn on another model than its last (ModelChange). */
  case modelChange(id: String, change: ModelChange)

  public var id: String {
    switch self {
    case .stamp(let id, _), .unread(let id), .flights(let id, _), .file(let id, _, _, _), .question(let id, _), .draft(let id, _),
         .connectors(let id, _, _, _), .listenerConnect(let id, _, _), .request(let id, _), .teammates(let id, _, _), .voiceCall(let id, _, _, _), .routines(let id, _, _),
         .notice(let id, _), .failedSend(let id, _), .queuedSend(let id, _), .thread(let id, _, _, _), .cloudAgent(let id, _), .gitHubSignIn(let id, _), .modelConnect(let id, _), .purchase(let id, _), .products(let id, _), .flightPassengers(let id, _), .joined(let id, _),
         .modelChange(let id, _): return id
    case .bubble(let bubble): return bubble.id
    }
  }

  /** The row's kind in a word, for the hang watch ("bubble", "flights", "table"…). */
  public var kind: String {
    switch self {
    case .stamp: return "stamp"
    case .unread: return "new-line"
    case .bubble(let bubble): return bubble.fromPerson ? "yours" : "bubble"
    case .flights: return "flights"
    case .file: return "file"
    case .question: return "question"
    case .draft: return "draft"
    case .connectors: return "connectors"
    case .listenerConnect: return "listener"
    case .request: return "request"
    case .teammates: return "teammates"
    case .voiceCall: return "call"
    case .routines: return "routines"
    case .notice: return "notice"
    case .failedSend: return "failed"
    case .queuedSend: return "queued"
    case .thread: return "thread"
    case .cloudAgent: return "cloud-agent"
    case .gitHubSignIn: return "github-sign-in"
    case .modelConnect: return "model-connect"
    case .purchase: return "purchase"
    case .products: return "products"
    case .flightPassengers: return "flight-passengers"
    case .joined: return "joined"
    case .modelChange: return "model-change"
    }
  }

  /** How much text the row carries (bytes): the hang watch names the longest. */
  public var size: Int {
    switch self {
    case .bubble(let bubble): return bubble.text.utf8.count
    case .draft(_, let card): return card.body.utf8.count
    case .notice(_, let text): return text.utf8.count
    default: return 0
    }
  }

  /** Whose side the row sits on, for spacing runs: the person, an agent, or the middle. */
  public var side: Side {
    switch self {
    case .bubble(let bubble): return bubble.fromPerson ? .person : .agent(bubble.author?.id)
    case .file(_, _, _, let fromPerson): return fromPerson ? .person : .agent(nil)
    case .failedSend, .queuedSend: return .person
    case .thread(_, _, _, let side): return side
    case .flights, .question, .draft, .connectors, .listenerConnect, .request, .notice, .cloudAgent, .gitHubSignIn, .modelConnect, .purchase, .products, .flightPassengers, .joined: return .agent(nil)
    default: return .middle
    }
  }

  public enum Side: Hashable, Sendable { case person, agent(String?), middle }
}

/**
 * "Changed from ⌘ Simeon to ✳ Claude Opus 5.5" (`model-changed`, 10
 * November 2026, the founder: "whenever a model is changed, i want this to
 * fire in the chat. that at least tells us that it's working"): the line the
 * engine writes in an agent's chat when its turn is on another model than its
 * last (`desktop/source/host/extensions/inference/turn-model.ts`), drawn in
 * the middle in grey, each model's provider mark before its name (Simeon's
 * own for Simeon's).
 */
public struct ModelChange: Hashable, Sendable {
  public struct Side: Hashable, Sendable {
    /** The provider's slug (`anthropic`, `claude`, `deepseek`…; its mark `Providers/<provider>-mark`), nil for Simeon's. */
    public let provider: String?
    public let name: String

    public init(provider: String?, name: String) {
      self.provider = provider; self.name = name
    }

    init?(json: JSON?) {
      guard let json, json.object != nil else { return nil }
      let provider = json["provider"]?.text.flatMap { $0.range(of: "^[a-z0-9]{1,20}$", options: .regularExpression) == nil ? nil : $0 }
      let named = json["name"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = named.flatMap { $0.isEmpty ? nil : String($0.prefix(80)) } ?? provider.map(AIModels.providerName) ?? AIModels.simeon
      self.init(provider: provider, name: name)
    }
  }

  /** A piece of the sentence as the app's language orders it: words, or one of the two models. */
  public enum Piece: Hashable, Sendable {
    case words(String)
    case model(Side)
  }

  public let from: Side
  public let to: Side

  public init(from: Side, to: Side) {
    self.from = from; self.to = to
  }

  /** The event's two sides; nil when one is missing or both are the same. */
  init?(event: JSON) {
    guard let from = Side(json: event["from"]), let to = Side(json: event["to"]), from != to else { return nil }
    self.init(from: from, to: to)
  }

  /** The sentence in words ("Changed from Simeon to Claude Opus 5.5"): copied, and what a screen reader says. */
  public var text: String { L10n.text("Changed from \(from.name) to \(to.name)") }

  /**
   * The same sentence in pieces, the two models where the app's language puts
   * them, so a mark can be drawn before each name. A translation that lost one
   * reads as plain words.
   */
  public var pieces: [Piece] {
    let first: Character = "\u{E000}", second: Character = "\u{E001}"
    let sentence = L10n.text("Changed from \(String(first)) to \(String(second))")
    var pieces: [Piece] = []
    var words = ""
    for character in sentence {
      guard character == first || character == second else { words.append(character); continue }
      if !words.isEmpty { pieces.append(.words(words)); words = "" }
      pieces.append(.model(character == first ? from : to))
    }
    if !words.isEmpty { pieces.append(.words(words)) }
    let models = pieces.filter { if case .model = $0 { return true }; return false }.count
    return models == 2 ? pieces : [.words(text)]
  }
}

public struct Bubble: Hashable, Sendable {
  public let id: String
  public let text: String
  public let fromPerson: Bool
  /** In a group, the member who spoke. */
  public let author: Party?
  /** In a group: the author's name above the first of their bubbles in a row, the picture beside the last. */
  public let showsName: Bool
  public let showsAvatar: Bool
  public let reactions: [String]
  /** The reactions that are the person's own (`by: "user"`): a pick of one takes it back. */
  public let myReactions: [String]
  public let isStreaming: Bool
  /** The message this one answers (`replyTo`), and its line as the window quotes it above the bubble. */
  public let replyTo: String?
  public let quote: String?
  /** Milliseconds since the epoch: the time a sideways swipe shows. */
  public let timestampMs: Double?
  /** An agent's pictures (`message.images`), drawn under its words. */
  public let images: [ChatImage]
  /** A message of yours held while the computer was out of reach, when it was written (`sentWhileOfflineAtMs`): "Sent while offline · Oct 9, 3:12 PM" under it. */
  public let sentOfflineAtMs: Double?
  /**
   * The one link the message is, drawn as a card instead of a bubble (the
   * window's `xEn`): an agent's finished `send-message` text with no
   * pictures, or the person's own message, whose words are an `https:`
   * address or exactly `[words](address)` (`Chat.loneLink`).
   */
  public let loneLink: URL?
  /** It came from a messaging channel, or the agent sent it to one: the tag under its words. */
  public let channel: ChannelTag?
  /**
   * The agent saying who it is (`message.introduction`, Simeon's "my name is
   * Simeon"): its own name in these words is drawn in its pill, which its
   * other messages never do (`Mentions.find`'s `introducing`, the founder,
   * 30 October 2026).
   */
  public let introduces: Bool

  public init(id: String, text: String, fromPerson: Bool, author: Party?, showsName: Bool, showsAvatar: Bool, reactions: [String], isStreaming: Bool, replyTo: String? = nil, quote: String? = nil, timestampMs: Double? = nil, images: [ChatImage] = [], sentOfflineAtMs: Double? = nil, loneLink: URL? = nil, myReactions: [String] = [], channel: ChannelTag? = nil, introduces: Bool = false) {
    self.id = id; self.text = text; self.fromPerson = fromPerson; self.author = author
    self.showsName = showsName; self.showsAvatar = showsAvatar; self.reactions = reactions; self.isStreaming = isStreaming
    self.replyTo = replyTo; self.quote = quote; self.timestampMs = timestampMs; self.images = images; self.sentOfflineAtMs = sentOfflineAtMs
    self.loneLink = loneLink; self.myReactions = myReactions; self.channel = channel; self.introduces = introduces
  }

  func with(showsName: Bool? = nil, showsAvatar: Bool? = nil, author: Party?? = nil, quote: String?? = nil) -> Bubble {
    Bubble(id: id, text: text, fromPerson: fromPerson, author: author ?? self.author, showsName: showsName ?? self.showsName, showsAvatar: showsAvatar ?? self.showsAvatar, reactions: reactions, isStreaming: isStreaming, replyTo: replyTo, quote: quote ?? self.quote, timestampMs: timestampMs, images: images, sentOfflineAtMs: sentOfflineAtMs, loneLink: loneLink, myReactions: myReactions, channel: channel, introduces: introduces)
  }
  /** Only emoji, three at most: drawn large with no bubble, as Messages does. */
  public var isLoneEmoji: Bool {
    guard images.isEmpty else { return false }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed.count <= 3 else { return false }
    return trimmed.allSatisfy { ch in ch.unicodeScalars.contains { $0.properties.isEmojiPresentation } || (ch.unicodeScalars.count > 1 && ch.unicodeScalars.first!.properties.isEmoji) }
  }
}

/**
 * A message that came in from a messaging channel or that the agent sent to
 * one (the window's `eTe`): the arrow and the platform's name in a small
 * pill, its whole sentence as the tooltip. The channel is
 * "<platform>:<chat>" (`E0n`); the name is the window's own for Discord and
 * Slack, else the platform as written.
 */
public struct ChannelTag: Hashable, Sendable {
  public let platform: String
  public let inbound: Bool
  public let sender: String?

  public init?(channel: String?, inbound: Bool, sender: String? = nil) {
    guard let channel else { return nil }
    let trimmed = channel.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let colon = trimmed.firstIndex(of: ":"), colon > trimmed.startIndex else { return nil }
    let platform = trimmed[..<colon].trimmingCharacters(in: .whitespacesAndNewlines)
    let chat = trimmed[trimmed.index(after: colon)...].trimmingCharacters(in: .whitespacesAndNewlines)
    guard !platform.isEmpty, !chat.isEmpty else { return nil }
    self.platform = ["discord": "Discord", "slack": "Slack"][platform] ?? platform
    self.inbound = inbound
    self.sender = sender
  }

  /** "From Ada on Discord", "From Discord", "Sent to Slack". */
  public var title: String {
    guard inbound else { return L10n.text("Sent to \(platform)") }
    if let sender, !sender.isEmpty { return L10n.text("From \(sender) on \(platform)") }
    return L10n.text("From \(platform)")
  }
}

/**
 * A cloud agent's state, as `getCloudAgentInfo` answers (the window's
 * `cloud-agent.tsx`): its name, what it was asked, how far it is, its
 * branch and pull request, and what it changed.
 */
public struct CloudAgentInfo: Hashable, Sendable {
  /** `paused`: the person's Claude plan reached its limit (11 November 2026); a reply carries on once it resets. */
  public enum Status: String, Sendable { case creating, running, finished, error, expired, paused, unknown }
  public let name: String
  public let prompt: String
  public let status: Status
  public let branch: String
  public let pullRequestURL: String
  public let pullRequestState: String
  public let pullRequestNumber: Int?
  public let filesChanged: Int
  public let linesAdded: Int
  public let linesRemoved: Int
  /** The program that codes for it, as the computer names it (`coder`: "claude-code", "codex"); empty from a computer that doesn't say. */
  public let coder: String

  public init?(_ json: JSON) {
    guard json.object != nil else { return nil }
    let text = { (key: String) in json[key]?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    name = text("name"); prompt = text("prompt"); branch = text("branchName"); coder = text("coder")
    status = Status(rawValue: text("status")) ?? .unknown
    pullRequestURL = text("prUrl"); pullRequestState = text("prState")
    pullRequestNumber = json["prNumber"]?.int.flatMap { $0 > 0 ? $0 : nil }
    filesChanged = json["filesChanged"]?.int ?? 0
    linesAdded = json["linesAdded"]?.int ?? 0
    linesRemoved = json["linesRemoved"]?.int ?? 0
  }

  /** The badge: "Creating", "Running", "Done", "Failed" ("Error" until 13 November 2026; the founder: "the done mark. or the failed if it did"), "Expired", "Paused", "Status unavailable". */
  public var statusLabel: String {
    switch status {
    case .creating: return L10n.text("Creating")
    case .running: return L10n.text("Running")
    case .finished: return L10n.text("Done")
    case .error: return L10n.text("Failed")
    case .expired: return L10n.text("Expired")
    case .paused: return L10n.text("Paused")
    case .unknown: return L10n.text("Status unavailable")
    }
  }

  /** Not finished, failed or expired: the card asks again every five seconds (the window's `XWe`, `A$n`). */
  public var isLive: Bool { status == .creating || status == .running || status == .unknown }

  /** The pull request's state as the card draws it: as told, else "unknown" with an address and "none" without. */
  public var pullState: String {
    !pullRequestState.isEmpty ? pullRequestState : (pullRequestURL.isEmpty ? "none" : "unknown")
  }

  /** The card when nothing could be read and nothing is coming: "Cloud agent", "Status unavailable". */
  public static let unavailable = CloudAgentInfo([:] as JSON)!

  /** What one read of `getCloudAgentInfo` gave. */
  public enum Read: Sendable {
    case info(CloudAgentInfo)
    /** The computer answered with nothing: final, not asked again. */
    case empty
    /** It could not be asked. */
    case failed
  }

  /**
   * Seconds until the card asks again, nil for never (the window's
   * `_$n`): five while it works, never once it is finished, failed or
   * expired or the answer was empty; after a failure, sixty when nothing
   * was ever read, else five.
   */
  public static func nextPoll(after read: Read, known: CloudAgentInfo?) -> Double? {
    switch read {
    case .info(let info): return info.isLive ? 5 : nil
    case .empty: return nil
    case .failed:
      guard let known else { return 60 }
      return known.isLive ? 5 : nil
    }
  }

  /** The cloud agent as a party of its conversation's page, with the program that codes for it. */
  public func party(_ bcId: String) -> Party {
    Party(id: bcId, name: name, cloudAgent: true, coder: coder.isEmpty ? nil : coder)
  }

  /** "3 files changed". */
  public var changedLabel: String? {
    guard filesChanged > 0 else { return nil }
    return filesChanged == 1 ? L10n.text("1 file changed") : L10n.text("\(filesChanged) files changed")
  }

  /** Where Open would have gone (`cloudAgentWebUrl`): Simeon's page for the run, never made; the cards open the pull request instead (View PR, 11 November 2026). */
  public static func webURL(_ bcId: String) -> URL? {
    URL(string: "https://app.simeonlabs.com/agents/" + (bcId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? bcId))
  }
}

/**
 * One line of a cloud agent's conversation, as `getCloudAgentConversation`
 * answers (13 November 2026; the founder: the agent "talks to the cloud
 * agent the same way it talks to another agent"): what the agent asked it
 * (`prompt`), what it said along the way (`update`) and each turn's answer.
 * The apps draw them on the page two agents' messages have
 * (`Chat.cloudAgentRows`).
 */
public struct CloudAgentLine: Hashable, Sendable, Identifiable {
  public enum Role: String, Sendable { case prompt, update, answer }
  public let id: String
  public let role: Role
  public let text: String
  public let date: Date?

  public init(id: String, role: Role, text: String, date: Date? = nil) {
    self.id = id; self.role = role; self.text = text; self.date = date
  }

  init?(_ json: JSON) {
    guard let id = json["id"]?.text, let role = Role(rawValue: json["role"]?.string ?? "") else { return nil }
    let text = (json["text"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return nil }
    let at = json["atMs"]?.double ?? 0
    self.init(id: id, role: role, text: text, date: at > 0 ? Date(timeIntervalSince1970: at / 1000) : nil)
  }

  /** The lines in `getCloudAgentConversation`'s answer (`{bcId, messages}`); nil when the computer answered with nothing. */
  public static func lines(_ answer: JSON?) -> [CloudAgentLine]? {
    guard let messages = answer?["messages"]?.array else { return nil }
    return messages.compactMap { CloudAgentLine($0) }
  }
}

/**
 * "Connect Claude" and "Connect ChatGPT" in one card (`model-connect`, 13
 * November 2026, the founder: "when neither of them is connected, the user
 * is given a choice of both cards to connect"). A cloud agent codes in
 * Claude Code on the person's Claude plan, or in Codex on their ChatGPT
 * plan; a launch that finds neither connected puts this card in the chat
 * (`desktop/source/host/extensions/cloud-agents/cloud-agents-service.ts`,
 * `codingReady`). Each row is one provider: Connect opens the sign-in AI
 * Models opens for it (the consent first), and a provider that is connected
 * reads as a connected app does. The card carries no state of its own: what
 * is connected is read from the person's accounts (`AIModelsModel`), which
 * the app reads again while the card waits. The agent goes on by itself once
 * one is connected.
 */
public struct ModelConnectCard: Hashable, Sendable {
  /** The providers offered, in the order shown (`claude`, `chatgpt`, `cursor`). */
  public let providers: [String]

  /**
   * Cursor, the third program a cloud agent can code in (13 November 2026,
   * the founder: "Cursor now"). It is no plan in AI Models: it is signed in
   * on the person's cloud computer with Cursor's own program, and its row
   * reads that computer (`CursorSignIn`).
   */
  public static let cursor = "cursor"

  /** The providers a cloud agent's coding can run on. */
  public static let offered = [AIModels.claude, AIModels.chatGPT, cursor]

  /** A provider whose sign-in is on the cloud computer and read from it, not from AI Models. */
  public static func onComputer(_ provider: String) -> Bool { provider == cursor }

  public init?(_ message: JSON) {
    let named = (message["providers"]?.array ?? []).compactMap { $0.text }.filter { ModelConnectCard.offered.contains($0) }
    var seen = Set<String>()
    let kept = named.filter { seen.insert($0).inserted }
    // A card that names none it knows (an engine newer than this app) still offers them all.
    providers = kept.isEmpty ? ModelConnectCard.offered : kept
  }

  /**
   * The program that codes on a provider's plan, by its own name. The card
   * names the programs, Claude Code and Codex; Settings › AI Models names the
   * plans, Claude and ChatGPT (the founder, 13 November 2026: "its connect
   * codex or connect claude code ... for the card specifically its that. but
   * settings is claude and chat gpt. they are two dif things").
   */
  public static func program(_ provider: String) -> String {
    provider == AIModels.chatGPT ? "Codex" : provider == cursor ? "Cursor" : "Claude Code"
  }

  /** Whose plan the program runs on, as the person knows it: Claude, ChatGPT, Cursor. */
  public static func plan(_ provider: String) -> String {
    provider == cursor ? "Cursor" : AIModels.providerName(provider)
  }

  /** The program's own logo (`Mascots/<name>`), drawn whole and bare: no tile, no white or dark ground (the founder: "its full logo no white or dark background"). */
  public static func logo(_ provider: String) -> String {
    provider == AIModels.chatGPT ? "codex" : provider == cursor ? "cursor" : "claudecode"
  }

  /** A row's title: "Connect Codex" while there is something to do, "Codex" once it is connected, as a connected app's card names the app. */
  public static func title(_ provider: String, connected: Bool) -> String {
    let name = program(provider)
    return connected ? name : L10n.text("Connect \(name)")
  }

  /** The line under a row's title: whose plan the program runs on, which is the account Connect signs in to; none once it is connected. */
  public static func line(_ provider: String, connected: Bool) -> String {
    if connected { return "" }
    return L10n.text("Runs on your \(plan(provider)) plan.")
  }

  public static var connectLabel: String { L10n.text("Connect") }

  /** The card in the list of chats: "Connect Claude Code, Codex, Cursor"; a card for one program, that one's name. */
  public static var preview: String { preview(offered) }
  public static func preview(_ providers: [String]) -> String { L10n.text("Connect \(providers.map(program).joined(separator: ", "))") }
  public var previewText: String { Self.preview(providers) }

  /** Seconds until the accounts are read again while a row still waits; never once one is connected. */
  public static func nextPoll(anyConnected: Bool) -> Double? { anyConnected ? nil : 4 }
}

/**
 * "Connect GitHub" (`github-sign-in`, 11 November 2026): the card a cloud
 * agent's launch puts in the chat when GitHub isn't connected on the
 * person's computer yet. GitHub's own device sign-in runs there (`gh auth
 * login`, `desktop/source/host/cloud-agents/coding-github.ts`): the person
 * opens github.com/login/device on any device, signs in to GitHub as usual
 * and types the code; the card asks the computer how it went
 * (`getGitHubSignIn`) every three seconds while it waits, and the agent goes
 * on by itself once it is connected.
 */
public struct GitHubSignInCard: Hashable, Sendable {
  /** The one-time code, `WXYZ-1234`. */
  public let code: String
  /** Where it is typed: GitHub's own page. */
  public let url: URL
  /** When the code stops working (ms since 1970), a quarter of an hour after it was made. */
  public let expiresAtMs: Double

  public init?(_ message: JSON) {
    guard let code = message["code"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines), code.range(of: "^[A-Z0-9]{4}-[A-Z0-9]{4}$", options: .regularExpression) != nil else { return nil }
    let address = message["url"]?.text ?? ""
    self.code = code
    url = address.hasPrefix("https://github.com/") ? (URL(string: address) ?? GitHubSignInCard.devicePage) : GitHubSignInCard.devicePage
    expiresAtMs = message["expiresAtMs"]?.double ?? 0
  }

  public static let devicePage = URL(string: "https://github.com/login/device")!

  /** How the sign-in stands, as the computer says it. */
  public enum State: Hashable, Sendable {
    case waiting
    case connected(login: String?)
    case expired
    case failed
  }

  /** The computer's answer (`{state, code?, login?}`) for this card: a sign-in waiting on another code means this one expired. */
  public func state(_ answer: JSON?, nowMs: Double) -> State? {
    guard let answer, let state = answer["state"]?.string else { return nil }
    switch state {
    case "connected": return .connected(login: answer["login"]?.text)
    case "waiting":
      if answer["code"]?.text != code || (expiresAtMs > 0 && nowMs >= expiresAtMs) { return .expired }
      return .waiting
    case "failed": return .failed
    default: return .expired
    }
  }

  /** Seconds until the card asks again: three while it waits (and when it couldn't be asked), never once it's settled. */
  public static func nextPoll(_ state: State?) -> Double? {
    switch state {
    case .none, .waiting: return 3
    default: return nil
    }
  }

  public static var title: String { L10n.text("Connect GitHub") }
  public static var prompt: String { L10n.text("Enter this code on GitHub to connect it to your computer.") }
  public static var openLabel: String { L10n.text("Open GitHub") }
  public static var copyLabel: String { L10n.text("Copy code") }
  public static var copiedLabel: String { L10n.text("Copied") }
  public static func connectedLabel(_ login: String?) -> String {
    guard let login, !login.isEmpty else { return L10n.text("Connected") }
    return L10n.text("Connected as \(login)")
  }
  public static var expiredLabel: String { L10n.text("This code expired. Ask your agent for a new one.") }
  public static var failedLabel: String { L10n.text("GitHub couldn't be connected.") }

  /** The card's title: "Connect GitHub" while there is something to do, "GitHub" once it is connected, as a connected app's card names the app (13 November 2026). */
  public static func title(_ state: State?) -> String {
    if case .connected = state { return "GitHub" }
    return title
  }

  /** The line under the title: what to do with the code, why there's nothing more to do, or the account once it is connected (none when its name isn't known). */
  public static func line(_ state: State?) -> String {
    switch state {
    case .connected(let login): return login ?? ""
    case .expired: return expiredLabel
    case .failed: return failedLabel
    case .none, .waiting: return prompt
    }
  }
}

/** A picture an agent sent with a message (`message.images`): a `file://` path on its computer or an `https` address, and its shape when known. */
public struct ChatImage: Hashable, Sendable {
  public let url: String
  public let alt: String
  public let width: Double?
  public let height: Double?
  /** The file's own name, for one the person sent ("IMG_0412.png"): the computer keeps it under one made from its contents. */
  public let name: String?

  public init(url: String, alt: String = "", width: Double? = nil, height: Double? = nil, name: String? = nil) {
    self.url = url; self.alt = alt; self.width = width; self.height = height; self.name = name
  }

  init?(_ json: JSON) {
    guard let url = json["url"]?.text ?? json.text, url.hasPrefix("file://") || url.hasPrefix("https://") || url.hasPrefix("/") else { return nil }
    self.url = url
    alt = json["alt"]?.string ?? ""
    width = json["width"]?.double.flatMap { $0 > 0 ? $0 : nil }
    height = json["height"]?.double.flatMap { $0 > 0 ? $0 : nil }
    name = nil
  }

  /** Width over height; 4:3 when the shape is not known (the window's gallery). */
  public var aspect: Double {
    guard let width, let height else { return 4.0 / 3.0 }
    return width / height
  }
}

public enum Chat {
  /**
   * A long text cut for drawing (the Mac folds a message past 664 pt behind
   * "Show more"): at most `limit` characters, at the last line break in its
   * final fifth when there is one; whether anything was left out.
   */
  public static func clipped(_ text: String, limit: Int) -> (text: String, clipped: Bool) {
    guard text.utf8.count > limit, text.count > limit else { return (text, false) }
    let end = text.index(text.startIndex, offsetBy: limit)
    let head = text[..<end]
    if let lineBreak = head.lastIndex(of: "\n"), text.distance(from: text.startIndex, to: lineBreak) > limit * 4 / 5 {
      return (String(text[..<lineBreak]), true)
    }
    return (String(head) + "…", true)
  }

  /** A code block as drawn: at most `lines` lines, each at most `width` characters (a code block does not wrap, so one long line is laid out whole). */
  public static func clippedCode(_ text: String, lines: Int, width: Int) -> (text: String, clipped: Bool) {
    var clipped = false
    var out: [Substring] = []
    for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
      if out.count == lines { clipped = true; break }
      if line.count > width { out.append(line.prefix(width) + "…"); clipped = true } else { out.append(line) }
    }
    return (out.joined(separator: "\n"), clipped)
  }

  /** A new stamp after a quarter of an hour without a line, or on a new day (the window's `zIn`, `OIn = 900 s`). */
  public static let stampGap: TimeInterval = 15 * 60
  public static let notShown = L10n.text("This message can't be shown in this version of Simeon.")

  /**
   * The chat's rows. `unreadAfter` (milliseconds) puts the "New" line before
   * the first agent's line written after it, as the window's
   * `unreadBoundaryAt` does. A thread's replies stay out of it, as the
   * window's `N_n` keeps them: a reply whose thread's first message is here
   * is counted under that message ("N replies"); one whose first message
   * isn't loaded stays in the chat, unless older lines may still hold it
   * (`mayHoldOlderHistory`), when it waits for them.
   */
  public static func rows(_ entries: [Entry], isGroup: Bool = false, unreadAfter: Double? = nil, mayHoldOlderHistory: Bool = false) -> [ChatRow] {
    guard entries.contains(where: \.isBranched) else { return layout(entries, isGroup: isGroup, unreadAfter: unreadAfter) }
    let split = threadSplit(entries, mayHoldOlderHistory: mayHoldOlderHistory)
    // Quotes read every line: a message in the chat can answer a reply in a thread.
    let rows = layout(split.visible, quoting: entries, isGroup: isGroup, unreadAfter: unreadAfter)
    guard !split.counts.isEmpty else { return rows }
    var out: [ChatRow] = []
    out.reserveCapacity(rows.count + split.counts.count)
    for row in rows {
      out.append(row)
      if let count = split.counts[row.id], !isSendState(row) {
        out.append(.thread(id: "thread-\(row.id)", rootId: row.id, count: count, side: row.side))
      }
    }
    return out
  }

  private static func isSendState(_ row: ChatRow) -> Bool {
    switch row {
    case .failedSend, .queuedSend, .thread, .stamp, .unread: return true
    default: return false
    }
  }

  /** The window's `N_n`: the lines the chat shows, and each thread's count of replies, by its first message's id. */
  public static func threadSplit(_ entries: [Entry], mayHoldOlderHistory: Bool = false) -> (visible: [Entry], counts: [String: Int]) {
    let byId = Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    var visible: [Entry] = []
    var counts: [String: Int] = [:]
    for entry in entries {
      guard entry.isBranched else { visible.append(entry); continue }
      guard let root = threadRoot(of: entry, in: byId) else {
        if !mayHoldOlderHistory { visible.append(entry) }
        continue
      }
      counts[root, default: 0] += 1
    }
    return (visible, counts)
  }

  /** A thread on its own (the window's thread view): the message it started from, then every reply in it, oldest first. */
  public static func threadRows(_ rootId: String, in entries: [Entry], isGroup: Bool = false) -> [ChatRow] {
    layout(threadEntries(rootId, in: entries), quoting: entries, isGroup: isGroup, unreadAfter: nil)
  }

  /** The thread's lines: its first message, then the replies that lead back to it. */
  public static func threadEntries(_ rootId: String, in entries: [Entry]) -> [Entry] {
    let byId = Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
    let replies = entries.filter { $0.isBranched && threadRoot(of: $0, in: byId) == rootId }
    guard let root = byId[rootId] else { return replies }
    return [root] + replies
  }

  /** How many replies each thread has, by the id of the message it started from. */
  public static func threadCounts(_ entries: [Entry]) -> [String: Int] { threadSplit(entries).counts }

  /**
   * The message a reply's thread started from (the window's `x_n`): up its
   * `replyTo`s through other replies to the first line that is not one.
   * Nil when a line on the way isn't loaded, for a line that answers
   * nothing, and for a loop.
   */
  public static func threadRoot(of entry: Entry, in byId: [String: Entry]) -> String? {
    var current = entry
    var seen: Set<String> = [entry.id]
    while true {
      guard let parent = current.threadParent, let next = byId[parent] else { return nil }
      if !next.isBranched { return parent }
      guard seen.insert(parent).inserted else { return nil }
      current = next
    }
  }

  /**
   * A thread's name in its header (the window's `jvn` over `ide`): its first
   * message's words without their Markdown, up to 40 characters (cut at 39,
   * its trailing punctuation dropped, and "…"), "Thread" when it has none;
   * "Photo" for a picture, a file's name, a link's host; "Thread" for a line
   * that is gone.
   */
  public static func threadTitle(_ root: Entry?) -> String {
    switch ReplyPreview(root) {
    case .text(let raw):
      let text = plainPreview(raw)
      if text.isEmpty { return L10n.text("Thread") }
      guard text.count > 40 else { return text }
      var head = String(text.prefix(39))
      while let last = head.last, last.isWhitespace || ":;,.!?\u{2013}\u{2014}-".contains(last) { head.removeLast() }
      return head + "…"
    case .image: return L10n.text("Photo")
    case .file(let url, let name): return fileTitle(name.flatMap { $0.isEmpty ? nil : $0 } ?? fileBaseName(url))
    case .link(let url): return URL(string: url)?.host ?? url
    case .missing: return L10n.text("Thread")
    }
  }

  /** What a line is, as a reply or a thread names it (the window's `ide`). */
  public enum ReplyPreview: Equatable {
    case text(String), image(String), file(url: String, name: String?), link(String), missing

    public init(_ entry: Entry?) {
      guard let entry else { self = .missing; return }
      switch entry.kind {
      case "message":
        self = .text(entry.content ?? "")
      case "send-message":
        guard let message = entry.message else { self = .missing; return }
        if message["type"]?.string == "attachment" {
          let url = message["url"]?.text ?? ""
          let name = message["file_name"]?.text
          let isWeb = url.lowercased().hasPrefix("https:") || url.lowercased().hasPrefix("http:")
          if isWeb && (name ?? "").isEmpty { self = .link(url) }
          else if Chat.isPicture(name ?? url) { self = .image(url) }
          else { self = .file(url: url, name: name) }
        } else {
          self = .text(Chat.cardText(message))
        }
      case "user-attachment":
        let path = entry["file_path"]?.text ?? ""
        let name = entry["file_name"]?.text
        self = Chat.isPicture(name ?? path) ? .image(path) : .file(url: path, name: name)
      default:
        self = .missing
      }
    }
  }

  /** The words a card stands for in a quote or a thread's name (the window's `PAe`). */
  static func cardText(_ message: JSON) -> String {
    let type = message["type"]?.string ?? ""
    switch type {
    case "text": return message["content"]?.string ?? ""
    case "attachment": return message["url"]?.string ?? ""
    case "widget": return message["widget"]?["prompt"]?.string ?? ""
    case "cloud-agent":
      let title = message["title"]?.string?.trimmingCharacters(in: .whitespaces) ?? ""
      return title.isEmpty ? L10n.text("Cloud agent") : L10n.text("Cloud agent: \(title)")
    case "secret-request": return message["secretRequest"]?["label"]?.string ?? ""
    case "user-form": return message["form"]?["title"]?.string ?? ""
    case "credential-request": return message["credential"]?["title"]?.string ?? ""
    case "onepassword-connect": return L10n.text("Connect 1Password")
    case "store-entry": return StoreEntryCard(message: message, entry: nil)?.title ?? ""
    case "email-draft":
      let subject = message["draft"]?["subject"]?.string ?? ""
      return subject.isEmpty ? (message["draft"]?["body"]?.string ?? "") : subject
    case "slack-draft": return message["draft"]?["body"]?.string ?? ""
    case "permission-request": return message["permission"]?["title"]?.string ?? ""
    case "auto-review-approval":
      let summary = message["approval"]?["summary"]?.string ?? ""
      return L10n.text("Approval required: \(summary)")
    case "local-tool-permission":
      let target = message["ask"]?["target"]?.string ?? ""
      return L10n.text("Permission required: \(target)")
    case "connector":
      let name = message["connector"]?.string ?? ""
      return message["variant"]?.string == "connected" ? L10n.text("\(name) connected") : L10n.text("Connect \(name)")
    case "connectors":
      let names = message["connectors"]?.array?.compactMap(\.text) ?? []
      return names.isEmpty ? L10n.text("Connect tools") : L10n.text("Connect \(names.joined(separator: ", "))")
    case "listener-connect": return message["platform"]?.string == "slack" ? L10n.text("Connect Slack") : L10n.text("Connect GitHub")
    case "github-sign-in": return L10n.text("Connect GitHub")
    case "model-connect": return ModelConnectCard(message)?.previewText ?? ModelConnectCard.preview
    case "purchase": return message["content"]?.string ?? L10n.text("Checkout")
    case "products": return message["content"]?.string ?? L10n.text("Products")
    case "flight-passengers": return message["content"]?.string ?? L10n.text("Traveller details")
    case "agent-joined": return message["name"]?.text.map { JoinedCard.title(name: $0) } ?? L10n.text("Message")
    default: return L10n.text("Message")
    }
  }

  /** The window's picture extensions (`kft`). */
  static let pictureExtensions: Set<String> = ["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]

  static func isPicture(_ nameOrPath: String) -> Bool {
    let last = nameOrPath.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? nameOrPath
    guard let dot = last.lastIndex(of: "."), dot > last.startIndex, last.index(after: dot) < last.endIndex else { return false }
    return pictureExtensions.contains(last[last.index(after: dot)...].lowercased())
  }

  /** A file's name from its address, as the window's `JAe` takes it: the last part of the path, decoded. */
  static func fileBaseName(_ url: String) -> String {
    var path = url
    if let parsed = URL(string: url), parsed.scheme != nil { path = parsed.path.removingPercentEncoding ?? parsed.path }
    while path.hasSuffix("/") { path.removeLast() }
    let last = path.split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? path
    return last.isEmpty ? url : last
  }

  /** A message's words without their Markdown, on one line (the window's `o5e` and its `Xun` rules). */
  public static func plainPreview(_ text: String) -> String {
    var out = text
    for (pattern, template) in previewRules {
      out = pattern.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out), withTemplate: template)
    }
    return out.split(whereSeparator: \.isWhitespace).joined(separator: " ")
  }

  private static let previewRules: [(NSRegularExpression, String)] = [
    (#"`+"#, ""), (#"!\[([^\]]*)\]\([^)]*\)"#, "$1"), (#"\[([^\]]+)\]\([^)]*\)"#, "$1"),
    (#"\$\$((?:[^$\\]|\\[\s\S])+)\$\$"#, "$1"), (#"\\\(([\s\S]+?)\\\)"#, "$1"), (#"\\\[([\s\S]+?)\\\]"#, "$1"), (#"\\\$"#, "\\$"),
    (#"(?m)^\s{0,3}#{1,6}\s+"#, ""), (#"(?m)^\s{0,3}>\s?"#, ""), (#"(?m)^\s{0,3}(?:[-*+]|\d+[.)])\s+"#, ""),
    (#"\*\*([^*]+)\*\*"#, "$1"), (#"__([^_]+)__"#, "$1"), (#"~~([^~]+)~~"#, "$1"), (#"\*([^*\n]+)\*"#, "$1"),
    (#"(?<!\w)_([^_\n]+)_(?!\w)"#, "$1"), (#"\|"#, " "),
  ].compactMap { pair in (try? NSRegularExpression(pattern: pair.0)).map { ($0, pair.1) } }

  /**
   * A message that is one link and nothing else (the window's `cGe`). When
   * it carries the composer's document (`richText`), that decides (`bEn`):
   * its blank paragraphs and the spaces and line breaks at its ends left
   * out, exactly one paragraph holding exactly one piece of text, not code;
   * the address is that text's link, else the text. Without one, the words,
   * trimmed, exactly `[words](address)` (`vEn`) or the address alone. The
   * address must be `http(s)://` with a host (`YAe`); only an `https:` one
   * is a card (`Lht`).
   */
  public static func loneLink(_ text: String, richText: String? = nil) -> URL? {
    if let doc = document(richText) { return documentLink(doc) }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    var address = trimmed
    let range = NSRange(trimmed.startIndex..., in: trimmed)
    if let match = markdownLink.firstMatch(in: trimmed, range: range), let inside = Range(match.range(at: 1), in: trimmed) {
      address = String(trimmed[inside])
    }
    return httpsLink(address)
  }

  static func httpsLink(_ text: String) -> URL? {
    let address = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let lower = address.lowercased()
    guard lower.hasPrefix("https://") || lower.hasPrefix("http://"), let url = URL(string: address),
          let scheme = url.scheme?.lowercased(), scheme == "https", let host = url.host, !host.isEmpty else { return nil }
    return url
  }

  /** The composer's document (TipTap's JSON) when `richText` is one (`KAe`). */
  static func document(_ richText: String?) -> [String: Any]? {
    guard let richText, !richText.isEmpty, let data = richText.data(using: .utf8),
          let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any], doc["type"] as? String == "doc" else { return nil }
    return doc
  }

  static func documentLink(_ doc: [String: Any]) -> URL? {
    func nodes(_ node: [String: Any]) -> [[String: Any]] { node["content"] as? [[String: Any]] ?? [] }
    func blankText(_ node: [String: Any]) -> Bool { ((node["text"] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    // A paragraph of nothing but spaces and line breaks (`iGe`).
    func blank(_ node: [String: Any]) -> Bool {
      node["type"] as? String == "paragraph" && nodes(node).allSatisfy { $0["type"] as? String == "hardBreak" || ($0["type"] as? String == "text" && blankText($0)) }
    }
    var blocks = nodes(doc)
    while let first = blocks.first, blank(first) { blocks.removeFirst() }
    while let last = blocks.last, blank(last) { blocks.removeLast() }
    guard blocks.count == 1, blocks[0]["type"] as? String == "paragraph" else { return nil }
    // The line breaks at the paragraph's ends go, and its blank pieces of text (`_ht`, `bEn`).
    var pieces = nodes(blocks[0])
    while let first = pieces.first, first["type"] as? String == "hardBreak" || (first["type"] as? String == "text" && blankText(first)) { pieces.removeFirst() }
    while let last = pieces.last, last["type"] as? String == "hardBreak" || (last["type"] as? String == "text" && blankText(last)) { pieces.removeLast() }
    pieces = pieces.filter { $0["type"] as? String != "text" || !blankText($0) }
    guard pieces.count == 1, pieces[0]["type"] as? String == "text" else { return nil }
    let marks = pieces[0]["marks"] as? [[String: Any]] ?? []
    guard !marks.contains(where: { $0["type"] as? String == "code" }) else { return nil }
    let href = marks.first(where: { $0["type"] as? String == "link" }).flatMap { ($0["attrs"] as? [String: Any])?["href"] as? String }
    return httpsLink(href ?? (pieces[0]["text"] as? String) ?? "")
  }

  private static let markdownLink = try! NSRegularExpression(pattern: #"^\[[^\]\n]*\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)\s*$"#)

  /** The rows of `entries`; a reply's quote is looked up in `quoting` (all the chat's lines), else in `entries`. */
  static func layout(_ entries: [Entry], quoting: [Entry]? = nil, isGroup: Bool, unreadAfter: Double?) -> [ChatRow] {
    var rows: [ChatRow] = []
    var lastShown: Date?
    var index = 0
    var dividerPlaced = unreadAfter == nil
    // A file the person sent carries no time of its own: it takes its message's, by the nonce they were sent with (`UIn`).
    let sentAt = nonceTimes(entries)
    // The rows of the untimed lines just before, and whose they are: a stamp goes above them, not between them and their message (`$In`).
    var untimed: (start: Int, role: String)?

    func stamp(before entry: Entry) {
      if !dividerPlaced, let after = unreadAfter, !entry.isFromPerson, let at = entry.timestampMs, at > after {
        rows.append(.unread(id: "unread-divider"))
        dividerPlaced = true
      }
      let role = side(entry)
      guard let at = entry.timestampMs ?? entry["clientNonce"]?.text.flatMap({ sentAt[$0] }) else {
        if untimed?.role != role { untimed = (rows.count, role) }
        return
      }
      let date = Date(timeIntervalSince1970: at / 1000)
      if lastShown == nil || abs(date.timeIntervalSince(lastShown!)) >= stampGap || !Calendar.current.isDate(date, inSameDayAs: lastShown!) {
        let place = untimed.flatMap { $0.role == role ? $0.start : nil } ?? rows.count
        rows.insert(.stamp(id: "stamp-\(entry.id)", date: date), at: place)
      }
      lastShown = date
      untimed = nil
    }

    while index < entries.count {
      let entry = entries[index]
      // Agents talking to each other, and calls written before calls were one line.
      if entry.kind == "message", let peer = entry.teammate {
        var run: [Entry] = [entry]
        var next = index + 1
        let call = peer.earlierCall
        while next < entries.count, entries[next].kind == "message", let other = entries[next].teammate {
          if let call {
            guard other.earlierCall?.callId == call.callId else { break }
          } else if other.earlierCall != nil {
            break
          }
          run.append(entries[next]); next += 1
        }
        stamp(before: entry)
        if let call {
          rows.append(.voiceCall(id: entry.id, seconds: call.seconds, lines: run.map { CallLine(fromPerson: $0.fromAgent != nil, text: $0.content ?? "") }, live: false))
        } else {
          rows.append(.teammates(id: entry.id, exchange: exchange(run), entries: run))
        }
        index = next
        continue
      }
      // Routines changed one after another fold into one line (`WIn`, `_In`).
      if entry.kind == "event", entry.event?["type"]?.string == "automation-changed" {
        var run: [Entry] = [entry]
        var next = index + 1
        while next < entries.count, entries[next].kind == "event", entries[next].event?["type"]?.string == "automation-changed" { run.append(entries[next]); next += 1 }
        stamp(before: entry)
        for (n, outcome) in routineOutcomes(run).enumerated() {
          rows.append(.routines(id: n == 0 ? entry.id : "\(entry.id)-\(outcome.action)", action: outcome.action, routines: outcome.routines))
        }
        index = next
        continue
      }
      // Pictures and videos sent one after another in one send are drawn together, as pictures (`aMn`, `j2e`); other files stay cards.
      if let first = mediaAttachment(entry) {
        var pictures = [first]
        var next = index + 1
        let key = attachmentBatch(entry)
        while next < entries.count, let more = mediaAttachment(entries[next]), attachmentBatch(entries[next]) == key {
          pictures.append(more); next += 1
        }
        stamp(before: entry)
        let fromPerson = entry.kind == "user-attachment"
        rows.append(.bubble(Bubble(id: entry.id, text: "", fromPerson: fromPerson, author: fromPerson ? nil : entry.author, showsName: false, showsAvatar: false,
                                   reactions: entry.reactions.map(\.emoji), isStreaming: false, replyTo: entry["replyTo"]?.text, timestampMs: entry.timestampMs,
                                   images: pictures, myReactions: entry.myReactions)))
        index = next
        continue
      }
      if let row = row(for: entry) {
        stamp(before: entry)
        rows.append(row)
      }
      index += 1
    }
    rows = quoted(rows, quoting ?? entries)
    rows = unique(rows)
    // A products card's replies, until the person sends anything after it.
    rows = ProductsCard.settlingReplies(rows)
    return isGroup ? markRuns(rows) : rows
  }

  /** The time of each message the person sent, by the nonce it was sent with: its files take it (`UIn`). */
  static func nonceTimes(_ entries: [Entry]) -> [String: Double] {
    var out: [String: Double] = [:]
    for entry in entries where entry.kind == "message" {
      if let nonce = entry["clientNonce"]?.text, let at = entry.timestampMs { out[nonce] = at }
    }
    return out
  }

  /**
   * A file that is a picture or a video, as a picture: the person's (by its
   * path, or its name while it waits to go) with the size the computer read,
   * or an agent's (`IZ`). Nil for anything else, which stays a file card.
   */
  static func mediaAttachment(_ entry: Entry) -> ChatImage? {
    if entry.kind == "user-attachment" {
      guard let path = entry["file_path"]?.text ?? entry["filePath"]?.text else { return nil }
      let name = entry["file_name"]?.text ?? entry["fileName"]?.text ?? ""
      guard isPictureOrVideo(path) || isPictureOrVideo(name) else { return nil }
      let positive: (Double?) -> Double? = { value in value.flatMap { $0 > 0 ? $0 : nil } }
      return ChatImage(url: path, alt: "", width: positive(entry["width"]?.double), height: positive(entry["height"]?.double), name: name.isEmpty ? nil : name)
    }
    if entry.kind == "send-message", let message = entry.message, message["type"]?.string == "attachment",
       let url = message["url"]?.text, isPictureOrVideo(url) {
      return ChatImage(url: url, alt: message["alt"]?.string ?? "")
    }
    return nil
  }

  /** Which send a file came in (`batchId`, or the old untold one), and an agent's pictures by their author: they are drawn together. */
  static func attachmentBatch(_ entry: Entry) -> String {
    if entry.kind == "user-attachment" { return entry["batchId"]?.text.map { "ua:\($0)" } ?? "ua:legacy" }
    return "ai:\(entry.author?.id ?? "")"
  }

  /** Each row once: the screen keys rows by id, and two with one id in a lazy list can stall its layout. A repeated line is the same line twice. */
  static func unique(_ rows: [ChatRow]) -> [ChatRow] {
    var seen = Set<String>()
    seen.reserveCapacity(rows.count)
    guard rows.contains(where: { !seen.insert($0.id).inserted }) else { return rows }
    seen.removeAll(keepingCapacity: true)
    return rows.filter { seen.insert($0.id).inserted }
  }

  /**
   * A reply's quote over its bubble (`pCn`): the answered line, one line,
   * cut at 96 characters; "(deleted)" when it is gone. An agent's answer to
   * a line whose writer has said nothing since has none (28 October 2026,
   * the founder: "the whole reply to makes sense when there's many
   * messages, not when its only one"): it can only be answering that line.
   * The person's own replies keep theirs, as they chose them.
   */
  static func quoted(_ rows: [ChatRow], _ entries: [Entry]) -> [ChatRow] {
    guard rows.contains(where: { if case .bubble(let b) = $0 { return b.replyTo != nil }; return false }) else { return rows }
    let byId = Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    var bubbleAt: [String: Int] = [:]
    for (index, row) in rows.enumerated() {
      if case .bubble(let bubble) = row, bubbleAt[bubble.id] == nil { bubbleAt[bubble.id] = index }
    }
    return rows.enumerated().map { index, row in
      guard case .bubble(let bubble) = row, let target = bubble.replyTo else { return row }
      if !bubble.fromPerson, let at = bubbleAt[target], at < index, case .bubble(let answered) = rows[at],
         !rows[(at + 1)..<index].contains(where: { if case .bubble(let between) = $0 { return speaker(between) == speaker(answered) }; return false }) {
        return row
      }
      return .bubble(bubble.with(quote: .some(quoteLine(byId[target], limit: 96))))
    }
  }

  /** Who said a line, for `quoted`: the person, or the agent by its id. */
  private static func speaker(_ bubble: Bubble) -> String {
    bubble.fromPerson ? "" : "agent:" + (bubble.author?.id ?? "")
  }

  /**
   * The line a reply quotes over its bubble (96 characters) and the
   * composer's reply line (72), as the window writes them (`OAe` over
   * `ide`): the words without their Markdown, cut at `limit` less one with
   * "…", "(empty)" when there are none; "Photo" for a picture, a file's
   * name, a link's host; "(deleted)" when the line is gone.
   */
  public static func quoteLine(_ entry: Entry?, limit: Int) -> String {
    switch ReplyPreview(entry) {
    case .text(let raw):
      let text = plainPreview(raw)
      return text.isEmpty ? L10n.text("(empty)") : clippedLine(text, limit)
    case .image: return L10n.text("Photo")
    case .file(let url, let name): return clippedLine(fileTitle(name?.isEmpty == false ? name! : fileBaseName(url)), limit)
    case .link(let url): return clippedLine(URL(string: url)?.host ?? url, limit)
    case .missing: return L10n.text("(deleted)")
    }
  }

  /** The composer's words while answering this (the window's `x9n`): "Reply…", or "Reply to attachment…", "Reply to file…", "Reply to link…". */
  public static func replyPlaceholder(_ entry: Entry?) -> String {
    switch ReplyPreview(entry) {
    case .image: return L10n.text("Reply to attachment…")
    case .file: return L10n.text("Reply to file…")
    case .link: return L10n.text("Reply to link…")
    case .text, .missing: return L10n.text("Reply…")
    }
  }

  /** A line cut the window's way: spaces run together; past `limit`, its first `limit - 1` characters and "…". */
  public static func clippedLine(_ text: String, _ limit: Int) -> String {
    let line = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    guard line.count > limit else { return line }
    var head = String(line.prefix(max(0, limit - 1)))
    while head.last?.isWhitespace == true { head.removeLast() }
    return head + "…"
  }

  /** The window's `JIn`: one message is "Messaged" or "Message from"; only outgoing to several is a fan-out; else a thread. */
  static func exchange(_ run: [Entry]) -> Exchange {
    var peers: [Party] = []
    for party in run.compactMap(\.teammate) where !peers.contains(where: { $0.id == party.id }) { peers.append(party) }
    if run.count == 1, let peer = peers.first { return .single(inbound: run[0].fromAgent != nil, peer: peer) }
    if run.allSatisfy({ $0.toAgent != nil }) && peers.count >= 2 { return .fanout(peers: peers) }
    return .thread(count: run.count, peers: peers)
  }

  /** The window's `_In`: per routine its last action ("deleted" wins, a creation stays a creation), grouped by action in first-seen order. */
  static func routineOutcomes(_ run: [Entry]) -> [(action: String, routines: [RoutineRef])] {
    var order: [String] = []
    var state: [String: (name: String, created: Bool, last: String)] = [:]
    for entry in run {
      guard let event = entry.event, let id = event["automationId"]?.text ?? event["automationName"]?.text else { continue }
      let action = event["action"]?.string ?? "updated"
      let name = event["automationName"]?.string ?? ""
      if let known = state[id] { state[id] = (name, known.created || action == "created", action) }
      else { order.append(id); state[id] = (name, action == "created", action) }
    }
    var out: [(action: String, routines: [RoutineRef])] = []
    for id in order {
      guard let s = state[id] else { continue }
      let action = s.last == "deleted" ? "deleted" : s.created ? "created" : s.last
      let ref = RoutineRef(id: id, name: s.name)
      if let i = out.firstIndex(where: { $0.action == action }) { out[i].routines.append(ref) } else { out.append((action, [ref])) }
    }
    return out
  }

  /** The words before a routines line's chips: "Created routine", "Created routines" (`XPn`); from three on, `routineVerb` before a "3 routines" chip. */
  public static func routineLabel(_ action: String, count: Int) -> String {
    let one = count == 1
    switch action {
    case "created": return one ? L10n.text("Created routine") : L10n.text("Created routines")
    case "updated": return one ? L10n.text("Updated routine") : L10n.text("Updated routines")
    case "enabled": return one ? L10n.text("Enabled routine") : L10n.text("Enabled routines")
    case "disabled": return one ? L10n.text("Disabled routine") : L10n.text("Disabled routines")
    case "deleted": return one ? L10n.text("Deleted routine") : L10n.text("Deleted routines")
    default: return one ? L10n.text("Changed routine") : L10n.text("Changed routines")
    }
  }

  /** "Created", "Updated", "Enabled", "Disabled", "Deleted", else "Changed" (`Y5e`), before a chip of three routines or more. */
  public static func routineVerb(_ action: String) -> String {
    switch action {
    case "created": return L10n.text("routine.created", default: "Created")
    case "updated": return L10n.text("routine.updated", default: "Updated")
    case "enabled": return L10n.text("routine.enabled", default: "Enabled")
    case "disabled": return L10n.text("routine.disabled", default: "Disabled")
    case "deleted": return L10n.text("routine.deleted", default: "Deleted")
    default: return L10n.text("routine.changed", default: "Changed")
    }
  }

  static func row(for entry: Entry) -> ChatRow? {
    let reactions = entry.reactions.map(\.emoji)
    let mine = entry.myReactions
    switch entry.kind {
    case "message", "user-message", "human-message":
      guard let text = entry.content, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
      let fromPerson = entry.isFromPerson || entry.role == "user"
      if !fromPerson, let flights = FlightsCard.parse(text) { return .flights(id: entry.id, card: flights) }
      // The person's own message (not another person's, not one from a channel, not between agents) can be a link card.
      let ownMessage = entry.role == "user" && entry["fromUser"] == nil && entry["channel"] == nil && entry.teammate == nil
      let link = ownMessage ? loneLink(text, richText: entry["richText"]?.string) : nil
      // A message that came in from a channel (the host writes it as the person's, with `channel` and `channelSender`).
      let channel = fromPerson ? ChannelTag(channel: entry["channel"]?.string, inbound: true, sender: entry["channelSender"]?.string) : nil
      return .bubble(Bubble(id: entry.id, text: text, fromPerson: fromPerson, author: fromPerson ? nil : entry.author, showsName: false, showsAvatar: false, reactions: reactions, isStreaming: entry.isStreaming, replyTo: entry["replyTo"]?.text, timestampMs: entry.timestampMs, sentOfflineAtMs: fromPerson ? entry["sentWhileOfflineAtMs"]?.double : nil, loneLink: link, myReactions: mine, channel: channel))
    case "notice":
      guard let text = entry["text"]?.text ?? entry.content, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
      // One the engine wrote for the person (`forPerson`: Claude's, in their language) is shown as it is;
      // one the computer wrote in its own terms reads plainly (PlainWords), which hides any line naming Claude.
      if entry["forPerson"]?.bool == true { return .notice(id: entry.id, text: text) }
      return .notice(id: entry.id, text: PlainWords.error(text, fallback: L10n.text("Something didn’t work here. Try again in a little while.")))
    case "user-attachment":
      let name = entry["file_name"]?.text ?? entry["fileName"]?.text ?? entry["file_path"]?.text.map(fileName(ofURL:)) ?? entry["filePath"]?.text.map(fileName(ofURL:)) ?? L10n.text("Attachment")
      return .file(id: entry.id, name: name, url: entry["file_path"]?.string ?? entry["filePath"]?.string ?? "", fromPerson: true)
    case "send-message":
      guard let message = entry.message else { return nil }
      if let requestId = entry["boxRequestId"]?.text {
        return .request(id: entry.id, card: .computer(requestId: requestId, instruction: message["content"]?.string ?? "", resolution: entry["boxResolution"]?.text))
      }
      switch message["type"]?.string {
      case "text":
        let text = message["content"]?.string ?? ""
        let images = (message["images"]?.array ?? []).compactMap(ChatImage.init)
        // A message may be pictures alone: the gallery without words.
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !images.isEmpty else { return nil }
        if images.isEmpty, let flights = FlightsCard.parse(text) { return .flights(id: entry.id, card: flights) }
        let streaming = entry["streaming"]?.bool ?? false
        let link = !streaming && images.isEmpty ? loneLink(text) : nil
        return .bubble(Bubble(id: entry.id, text: text, fromPerson: false, author: entry.author, showsName: false, showsAvatar: false, reactions: reactions, isStreaming: streaming, replyTo: entry["replyTo"]?.text, timestampMs: entry.timestampMs, images: images, loneLink: link, myReactions: mine, channel: ChannelTag(channel: message["channel"]?.string, inbound: false), introduces: message["introduction"]?.bool == true))
      case "attachment":
        guard let url = message["url"]?.text else { return nil }
        // The agent's own name for it (`file_name`); the computer keeps the file under one made from its contents.
        return .file(id: entry.id, name: message["file_name"]?.text ?? fileName(ofURL: url), url: url, fromPerson: false)
      case "widget":
        guard let widget = message["widget"], let prompt = widget["prompt"]?.text else { return nil }
        func options(of question: JSON) -> [QuestionOption] {
          (question["options"]?.array ?? []).compactMap { option -> QuestionOption? in
            guard let label = option["label"]?.text ?? option.text else { return nil }
            return QuestionOption(label: label, description: option["description"]?.text, value: option["value"]?.text,
                                  style: option["style"]?.string.flatMap(QuestionOption.Style.init(rawValue:)) ?? .plain)
          }
        }
        // Several questions in one card (`questions`, 10 November 2026): each with its prompt and options.
        let questions = (widget["questions"]?.array ?? []).compactMap { question -> QuestionCard.Question? in
          guard let words = question["prompt"]?.text else { return nil }
          let choices = options(of: question)
          guard !choices.isEmpty else { return nil }
          return QuestionCard.Question(prompt: words, help: question["helpText"]?.text, options: choices,
                                       allowsOwnAnswer: question["allowCustom"]?.bool ?? false, multiSelect: question["multiSelect"]?.bool ?? false)
        }
        return .question(id: entry.id, card: QuestionCard(
          prompt: prompt, help: widget["helpText"]?.text, options: options(of: widget),
          allowsOwnAnswer: widget["allowCustom"]?.bool ?? false,
          multiSelect: widget["multiSelect"]?.bool ?? false,
          questions: questions,
          answer: entry["respondedValue"]?.text, isDismissed: entry["widgetDismissed"]?.bool ?? false,
          isSkipped: entry["widgetSkipped"]?.bool ?? false))
      case "email-draft", "slack-draft":
        return DraftCard(message: message, entry: entry).map { .draft(id: entry.id, card: $0) }
      case "connectors":
        let names = message["connectors"]?.array?.compactMap(\.text) ?? []
        return names.isEmpty ? nil : .connectors(id: entry.id, names: names, connected: false, reason: nil)
      case "connector":
        guard let name = message["connector"]?.text else { return nil }
        return .connectors(id: entry.id, names: [name], connected: message["variant"]?.string == "connected", reason: message["reason"]?.text)
      case "listener-connect":
        guard let platform = message["platform"]?.text, platform == "slack" || platform == "github" else { return nil }
        return .listenerConnect(id: entry.id, platform: platform, reason: message["reason"]?.text)
      case "auto-review-approval":
        guard let approval = message["approval"] else { return nil }
        return .request(id: entry.id, card: .approval(requestId: approval["requestId"]?.string ?? "", summary: approval["summary"]?.string ?? "", reason: approval["reason"]?.string ?? "", command: approval["command"]?.string, status: approval["status"]?.string ?? "pending", surface: approval["surface"]?.string, proposedRule: approval["proposedRule"]?.string))
      case "secret-request":
        guard let secret = message["secretRequest"] else { return nil }
        let variable = secret["target"]?["kind"]?.string == "box-secret" ? secret["target"]?["name"]?.text : nil
        return .request(id: entry.id, card: .secret(label: secret["label"]?.string ?? L10n.text("A secret"), description: secret["description"]?.string ?? "", variable: variable, provided: entry["secretProvided"]?.bool ?? false, dismissed: entry["widgetDismissed"]?.bool ?? false))
      case "user-form":
        if let card = UserFormCard(message: message, entry: entry) { return .request(id: entry.id, card: .form(card)) }
        return .notice(id: entry.id, text: notShown)
      case "credential-request":
        if let card = CredentialRequestCard(message: message, entry: entry) { return .request(id: entry.id, card: .credential(card)) }
        return .notice(id: entry.id, text: notShown)
      case "onepassword-connect":
        return .request(id: entry.id, card: .onePasswordConnect(OnePasswordConnectCard(message: message, entry: entry)))
      case "store-entry":
        if let card = StoreEntryCard(message: message, entry: entry) { return .request(id: entry.id, card: .storeEntry(card)) }
        return .notice(id: entry.id, text: notShown)
      case "cloud-agent":
        guard let bcId = message["bcId"]?.text, !bcId.isEmpty else { return nil }
        return .cloudAgent(id: entry.id, bcId: bcId)
      case "github-sign-in":
        if let card = GitHubSignInCard(message) { return .gitHubSignIn(id: entry.id, card: card) }
        return .notice(id: entry.id, text: notShown)
      case "model-connect":
        if let card = ModelConnectCard(message) { return .modelConnect(id: entry.id, card: card) }
        return .notice(id: entry.id, text: notShown)
      case "purchase":
        if let card = PurchaseCard(message: message, entry: entry) { return .purchase(id: entry.id, card: card) }
        return .notice(id: entry.id, text: message["content"]?.text ?? notShown)
      case "products":
        if let card = ProductsCard(message: message, entry: entry) { return .products(id: entry.id, card: card) }
        return .notice(id: entry.id, text: message["content"]?.text ?? notShown)
      case "flight-passengers":
        if let card = FlightPassengersCard(message: message, entry: entry) { return .flightPassengers(id: entry.id, card: card) }
        return .notice(id: entry.id, text: message["content"]?.text ?? notShown)
      case "agent-joined":
        if let card = JoinedCard(message: message) { return .joined(id: entry.id, card: card) }
        return .notice(id: entry.id, text: message["content"]?.text ?? notShown)
      case "local-tool-permission":
        // Waiting, it is the Mac's dock above the composer, not a line; expired, it is gone; answered, one line says how (`_Ln`).
        guard let ask = LocalAsk(entry: entry), ask.status != "pending", ask.status != "expired" else { return nil }
        return .notice(id: entry.id, text: LocalToolAsk.outcome(status: ask.status))
      case "permission-request":
        // The older card, retired in the window (`yGe`, variant "retired").
        return .notice(id: entry.id, text: L10n.text("This message type is no longer supported in Simeon."))
      default:
        if let text = message["content"]?.text {
          return .bubble(Bubble(id: entry.id, text: text, fromPerson: false, author: entry.author, showsName: false, showsAvatar: false, reactions: reactions, isStreaming: false, replyTo: entry["replyTo"]?.text, timestampMs: entry.timestampMs))
        }
        return .notice(id: entry.id, text: notShown)
      }
    case "event":
      guard let event = entry.event else { return nil }
      switch event["type"]?.string {
      case "voice-call":
        let lines = (event["lines"]?.array ?? []).compactMap { line -> CallLine? in
          guard let text = line["text"]?.text else { return nil }
          return CallLine(fromPerson: line["speaker"]?.string == "user", text: text)
        }
        return .voiceCall(id: entry.id, seconds: event["seconds"]?.int ?? 0, lines: lines, live: event["status"]?.string == "live")
      case "name-changed":
        return event["to"]?.text.map { .notice(id: entry.id, text: L10n.text("Renamed to \($0)")) }
      case "channel-connected":
        return event["label"]?.text.map { .notice(id: entry.id, text: L10n.text("Connected to \($0)")) }
      case "channel-disconnected":
        return event["label"]?.text.map { .notice(id: entry.id, text: L10n.text("Disconnected from \($0)")) }
      case "model-changed":
        return ModelChange(event: event).map { .modelChange(id: entry.id, change: $0) }
      default:
        return nil
      }
    default:
      return nil
    }
  }

  /** In a group: a member's name over the first bubble of their run, their picture beside the last. */
  static func markRuns(_ rows: [ChatRow]) -> [ChatRow] {
    var out = rows
    for (i, row) in rows.enumerated() {
      guard case .bubble(let bubble) = row, !bubble.fromPerson, let author = bubble.author else { continue }
      let sameAuthor = { (other: ChatRow?) -> Bool in
        if case .bubble(let b)? = other, !b.fromPerson, b.author?.id == author.id { return true }
        return false
      }
      let previous = i > 0 ? rows[i - 1] : nil
      let next = i + 1 < rows.count ? rows[i + 1] : nil
      out[i] = .bubble(bubble.with(showsName: !sameAuthor(previous), showsAvatar: !sameAuthor(next)))
    }
    return out
  }

  /**
   * A stamp the window's way (`ept`): "Today 6:34 AM", "Yesterday 11:40 PM",
   * "Wed, Oct 7 3:12 PM" this year, "Oct 7, 2025 3:12 PM" before.
   */
  public static func stampText(_ date: Date, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
    let formatter = { (template: String) in Chat.formatter(template, calendar: calendar, locale: locale) }
    let clock = formatter("jmm").string(from: date)
    if calendar.isDate(date, inSameDayAs: now) { return L10n.text("Today \(clock)") }
    if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) { return L10n.text("Yesterday \(clock)") }
    if calendar.component(.year, from: date) == calendar.component(.year, from: now) { return "\(formatter("EEEMMMd").string(from: date)) \(clock)" }
    return "\(formatter("MMMdyyyy").string(from: date)) \(clock)"
  }

  /** The list's time the window's way (`l5e`): "6:34 AM" today, "Yesterday", the weekday this week, "10/7" this year, "10/7/25" before. */
  public static func listTime(_ date: Date, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
    let formatter = { (template: String) in Chat.formatter(template, calendar: calendar, locale: locale) }
    let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
    if days <= 0 { return formatter("jmm").string(from: date) }
    if days == 1 { return L10n.text("Yesterday") }
    if days < 7 { return formatter("EEEE").string(from: date) }
    if calendar.component(.year, from: date) == calendar.component(.year, from: now) { return formatter("Md").string(from: date) }
    return formatter("Mdyy").string(from: date)
  }

  /**
   * `listTime` from milliseconds, and nothing for a missing time, as `l5e`
   * returns "" for one (`n <= 0`). The host sends 0 for a chat with no
   * activity yet, which was shown as time zero: "12/31/69" in California
   * (the founder, 16 October 2026).
   */
  public static func listTime(ms: Double?, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String? {
    guard let ms, ms.isFinite, ms > 0 else { return nil }
    return listTime(Date(timeIntervalSince1970: ms / 1000), now: now, calendar: calendar, locale: locale)
  }

  /** A message's own time, shown when the chat is pulled sideways ("10:15 AM"). */
  public static func clockText(_ date: Date, calendar: Calendar = .current, locale: Locale = .current) -> String {
    formatter("jmm", calendar: calendar, locale: locale).string(from: date)
  }

  private static let formattersLock = NSLock()
  nonisolated(unsafe) private static var formatters: [String: DateFormatter] = [:]

  /** A date formatter per template, made once: making one is slow, and every row of the list and every stamp asks. */
  static func formatter(_ template: String, calendar: Calendar, locale: Locale) -> DateFormatter {
    let key = "\(template)|\(locale.identifier)|\(calendar.identifier)|\(calendar.timeZone.identifier)"
    return formattersLock.withLock {
      if let made = formatters[key] { return made }
      let made = DateFormatter()
      made.locale = locale; made.calendar = calendar; made.timeZone = calendar.timeZone
      made.setLocalizedDateFormatFromTemplate(template)
      formatters[key] = made
      return made
    }
  }

  /** A call's line in the chat (`__simeonVoiceEvent`): "Voice chat · now" while it is on, then "Voice chat · 02:48" ("1:02:05" past the hour). */
  public static func voiceChatLabel(seconds: Int, live: Bool) -> String {
    live ? L10n.text("Voice chat · now") : L10n.text("Voice chat · \(callLength(max(0, seconds)))")
  }

  /** A call's length the Mac's way: "01:11", or "1:02:05" past the hour. */
  public static func callLength(_ seconds: Int) -> String {
    let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
  }

  /** The running call's clock, the banner's way (`formatCallDuration`): "0:16", "12:04", "1:02:05". */
  public static func callClock(_ seconds: Int) -> String {
    let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
  }
}

extension Chat {
  /**
   * What a long press on a chat in the list shows of it, as the founder's
   * reference does (25 October 2026): the first paragraph of its newest
   * message, its Markdown taken out, and whether it is the person's.
   */
  public static func peek(_ rows: [ChatRow]) -> (text: String, fromPerson: Bool)? {
    for row in rows.reversed() {
      guard case .bubble(let bubble) = row, let first = firstParagraph(bubble.text) else { continue }
      return (first, bubble.fromPerson)
    }
    return nil
  }

  /** A message's first paragraph (up to its first blank line) with something in it, as plain words. */
  public static func firstParagraph(_ text: String) -> String? {
    var paragraph: [Substring] = []
    for line in text.split(separator: "\n", omittingEmptySubsequences: false) + [Substring("")] {
      if line.trimmingCharacters(in: .whitespaces).isEmpty {
        let plain = Preview.plain(paragraph.joined(separator: "\n"))
        if !plain.isEmpty { return plain }
        paragraph = []
      } else {
        paragraph.append(line)
      }
    }
    return nil
  }
}
