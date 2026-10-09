import Foundation

/**
 * Every sentence a call puts in front of the voice or the person, word for
 * word as the Mac has them (desktop/source/shared/voice-call/voice-call-prompt.ts):
 * the per-call prompt, the greeting, what the two client tools answer, the
 * note that makes the voice say what its work came back with, the status
 * line while the agent works, and the banner's own sentences.
 */
public enum VoiceCallText {
  public static let transcriptLines = 6
  public static let lineMaxChars = 600
  public static let relayMaxChars = 2_000
  public static let teammatesMax = 20
  public static let language = "en"

  public static let calling = "Calling…"
  public static let ended = "Call ended"
  public static let couldNotConnect = "Couldn't connect"
  public static let notSwitchedOn = "Calls aren't switched on yet"
  public static let noMicrophone = "Simeon can't use the microphone"
  public static let noCredit = "Out of credit for calls"

  public static let sendTaskAccepted = "Sent. If you have not acknowledged it yet, do so in a few words, then carry on with them. What it turns up comes back to you here."
  public static let relaySoftFail = "That did not come back. Say you could not get to it, and offer to try again."
  public static let workCameBackNudge = "(Your work just came back.)"

  /** The nudge is nobody's words: kept out of what the call shows and records, as the Mac's banner keeps it out. */
  static func isNudge(_ text: String) -> Bool {
    text == workCameBackNudge || text == "(Your work just came back. Tell me what it found.)"
  }

  static func collapse(_ text: String) -> String {
    text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
  }

  static func clamp(_ text: String, _ max: Int) -> String {
    text.count > max ? String(text.prefix(max - 1)).trimmingCharacters(in: .whitespaces) + "…" : text
  }

  public struct Line: Equatable, Sendable {
    public let fromPerson: Bool
    public let text: String
  }

  /** The latest `limit` messages of a chat page, oldest first: what the person wrote and what the agent sent (cards and tools left out). */
  public static func lines(_ entries: [JSON], limit: Int = transcriptLines) -> [Line] {
    var out: [Line] = []
    for entry in entries {
      if entry["kind"]?.string == "message", entry["role"]?.string == "user", let text = entry["content"]?.string {
        let t = collapse(text)
        if !t.isEmpty { out.append(Line(fromPerson: true, text: clamp(t, lineMaxChars))) }
        continue
      }
      if entry["kind"]?.string == "send-message", entry["message"]?["type"]?.string == "text", let text = entry["message"]?["content"]?.string {
        let t = collapse(text)
        if !t.isEmpty { out.append(Line(fromPerson: false, text: clamp(t, lineMaxChars))) }
      }
    }
    return Array(out.suffix(max(0, limit)))
  }

  /** The per-call system prompt (`buildVoiceCallPrompt`): the voice IS the agent, in the first person. */
  public static func prompt(name rawName: String, title rawTitle: String, description rawDescription: String, transcript: [Line], personName: String?, teammates: [(name: String, title: String)]) -> String {
    let name = collapse(rawName).isEmpty ? "your agent" : collapse(rawName)
    let person = clamp(collapse(personName ?? ""), 60)
    let them = person.isEmpty ? "the person" : person
    let title = collapse(rawTitle)
    let description = collapse(rawDescription)
    var who = ["You are \(name)\(title.isEmpty ? "" : ", \(title)"), one of \(person.isEmpty ? "the person's" : "\(person)'s") Simeon agents, on a live phone call with \(them).",
               "Simeon is a team of always-on agents that work for them on their Mac and on a computer of their own."]
    if !description.isEmpty { who.append("What you are for, in their words: \(clamp(description, 800))") }
    if !person.isEmpty { who.append("Call them \(person) now and then, the way a colleague would, never in every sentence.") }
    who.append("You are \(name) yourself. Speak in the first person (\"I'll do that\", \"I've sent it\"). The work you set going is your own: never talk about a hand-off, a second voice or a system behind you.")
    let team = teammates
      .map { (name: clamp(collapse($0.name), 60), title: clamp(collapse($0.title), 60)) }
      .filter { !$0.name.isEmpty && $0.name != name }
      .prefix(teammatesMax)
    let teammatesText: String
    if team.isEmpty {
      teammatesText = "You have no teammates yet. When they ask for one, you can create one with send_task, and then message it."
    } else {
      teammatesText = [
        "Your teammates, other agents on \(person.isEmpty ? "their" : "\(person)'s") team that you can message, ask and hand work to: \(team.map { $0.title.isEmpty ? $0.name : "\($0.name) (\($0.title))" }.joined(separator: ", ")).",
        "When they ask you to talk to, ask, tell or get something from a teammate, you can: set it going with send_task, naming the teammate. It works like texting: you message them now and their answer comes back to you a little later. Never say you can't reach, message or talk to a teammate.",
      ].joined(separator: " ")
    }
    let recent: String
    if transcript.isEmpty {
      recent = "You and they have not written to each other yet."
    } else {
      recent = (["Your latest text messages with them, oldest first, so you know what you are both talking about:"]
        + transcript.map { "\($0.fromPerson ? (person.isEmpty ? "Them" : person) : "You"): \($0.text)" }).joined(separator: "\n")
    }
    let rules = [
      "How you talk:",
      "- This is a phone call. Speak briefly and naturally, like a person: one or two short sentences, contractions, plain words.",
      "- Speak calmly and evenly, at an unhurried pace, the same steady tone throughout. Never use exclamation marks.",
      "- Never use lists, headings, markdown, emoji, or read out links. Say numbers, dates and times the way people say them.",
      "- If you did not catch something, say so and ask again. Never guess what they said.",
      "How you get things done:",
      "- Your work runs behind the call while you talk. For anything that needs doing or finding out (looking something up, writing, sending, scheduling, changing a file, checking on something you are doing), call send_task with what is needed in one clear sentence that carries every detail they gave. When their exact wording matters, put their words in quote. Acknowledge it once, in a few words that fit what they asked, never the same phrase twice in a call, then carry on with them.",
      "- Set each thing going once. If they ask how it is going, say it is still in progress; do not send it again.",
      "- Never say something is done, sent, booked or found until a note tells you your work came back with it. Until then it is still in progress.",
      "- When a note says your work came back: if it answers something they asked, or something went wrong, tell them once, briefly, in your own words, as yours. If it only confirms something you already told them you were doing, they can see it done: do not announce it; stay silent with skip_turn, unless they ask. If it repeats something you already told them, say nothing about it and carry on.",
      "- When they refer to something you wrote to each other, call recall_text_messages.",
      "- When there is nothing for you to say (they are thinking, or talking to someone else), stay silent with skip_turn.",
      "Ending:",
      "- When they wrap up (thanks, that's all, bye), say a short, natural goodbye in your own words and call end_call.",
      "- If the line goes quiet, check in lightly once, like a person would.",
    ].joined(separator: "\n")
    return "\(who.joined(separator: " "))\n\n\(teammatesText)\n\n\(recent)\n\n\(rules)"
  }

  /** A short greeting with the agent's name (`buildFirstMessage`); `pick` in [0, 1) chooses which. */
  public static func firstMessage(name rawName: String, pick: Double, personName: String?) -> String {
    let name = collapse(rawName).isEmpty ? "your agent" : collapse(rawName)
    let person = clamp(collapse(personName ?? ""), 60)
    let p = person.isEmpty ? "" : " \(person)"
    let greetings = [
      "Hey\(p), it's \(name). What's up?",
      "Hi\(p), \(name) here. What can I do for you?",
      "Hey\(p), \(name) speaking. What do you need?",
      "Hi\(p), it's \(name). How can I help?",
      "\(name) here. What's on your mind?",
    ]
    let index = min(greetings.count - 1, max(0, Int((pick.isFinite ? pick : 0) * Double(greetings.count))))
    return greetings[index]
  }

  /** What `recall_text_messages` answers. */
  public static func recallAnswer(_ lines: [Line]) -> String {
    if lines.isEmpty { return "There are no text messages between you yet." }
    return (["Your latest text messages, oldest first:"] + lines.map { "\($0.fromPerson ? "Them" : "You"): \($0.text)" }).joined(separator: "\n")
  }

  /** The note pushed into the call when the agent sent something on it. */
  public static func workCameBack(_ texts: [String]) -> String {
    "Your work came back: \(texts.map { clamp(collapse($0), 2_000) }.joined(separator: " ")) If it answers something they asked, or something went wrong, tell them briefly, in your own words, as yours. If it only confirms something you already told them you were doing, they can see it done: say nothing about it and stay silent with skip_turn."
  }

  static let gerundExceptions: [String: String] = [
    "be": "Being", "see": "Seeing", "free": "Freeing", "agree": "Agreeing", "lie": "Lying", "die": "Dying", "tie": "Tying",
    "set": "Setting", "get": "Getting", "put": "Putting", "run": "Running", "plan": "Planning", "stop": "Stopping", "ship": "Shipping", "shop": "Shopping", "chat": "Chatting", "drop": "Dropping", "pin": "Pinning", "tag": "Tagging", "log": "Logging", "map": "Mapping", "jot": "Jotting", "zip": "Zipping", "cut": "Cutting", "dig": "Digging", "sit": "Sitting", "swap": "Swapping", "skim": "Skimming", "text": "Texting", "email": "Emailing",
  ]

  static let taskVerbs: Set<String> = ["add", "answer", "archive", "ask", "book", "build", "buy", "call", "cancel", "change", "check", "clean", "compare", "compile", "confirm", "copy", "create", "delete", "design", "draft", "email", "edit", "file", "fill", "find", "fix", "follow", "forward", "gather", "generate", "get", "invite", "list", "look", "make", "message", "move", "note", "order", "organize", "organise", "plan", "post", "prepare", "print", "pull", "put", "read", "record", "remind", "remove", "rename", "reply", "research", "reschedule", "respond", "review", "run", "save", "schedule", "search", "send", "set", "share", "sort", "start", "summarize", "summarise", "text", "track", "translate", "update", "upload", "write"]

  static func gerund(_ verb: String) -> String {
    let lower = verb.lowercased()
    if let known = gerundExceptions[lower] { return known }
    var base = lower
    if base.hasSuffix("ie") { base = String(base.dropLast(2)) + "y" }
    else if base.hasSuffix("e") && !base.hasSuffix("ee") && !base.hasSuffix("ye") && !base.hasSuffix("oe") { base = String(base.dropLast()) }
    let word = base + "ing"
    return word.prefix(1).uppercased() + word.dropFirst()
  }

  /** "Send the agenda to Dana" reads "Sending the agenda to Dana…"; anything else "Working on it…". */
  public static func workingLabel(_ task: String) -> String {
    var text = collapse(task)
    if let range = text.range(of: #"^(please|can you|could you|would you)\s+"#, options: [.regularExpression, .caseInsensitive]) { text.removeSubrange(range) }
    while let last = text.last, ".!?".contains(last) { text.removeLast() }
    let words = text.split(separator: " ").map(String.init)
    guard let first = words.first?.lowercased().filter({ $0.isLetter && $0.isASCII }), taskVerbs.contains(first) else { return "Working on it…" }
    return ([gerund(first)] + words.dropFirst().prefix(7)).joined(separator: " ") + "…"
  }
}

/** What the voice's kit reports during a call. */
public enum VoiceEvent: Sendable {
  case connected(conversationId: String?)
  case agentSpeaking(Bool)
  /** The person's voice activity, 0 to 1 (the waveform while they talk). */
  case activity(Double)
  case line(fromPerson: Bool, text: String)
  /** The whole transcript so far, as the kit keeps it (lines get corrected as the voice goes). */
  case transcript([CallLine])
  /** A client tool the voice called (`send_task`, `recall_text_messages`). */
  case tool(name: String, id: String, parameters: JSON)
  case ended
  case failed(String)
}

/** The voice itself (ElevenLabs' kit in the app, a fake in the tests). */
public protocol VoiceTransport: AnyObject, Sendable {
  func start(token: String, prompt: String, firstMessage: String, voiceId: String?, language: String, events: @escaping @Sendable (VoiceEvent) -> Void) async throws
  func setMuted(_ muted: Bool) async
  /** A note into the call, then a nudge so the voice speaks now (`sendContextualUpdate`, `sendUserMessage`). */
  func say(context: String, nudge: String) async
  func toolResult(id: String, result: String) async
  func end() async
}

/**
 * A real call, the Mac's way (electron-main/voice/voice-call-service.ts and
 * shared/voice-call/handoff.ts): Simeon Labs' server hands a token
 * (`voice/calls`), the voice speaks as the agent with the agent's profile and
 * recent chat, its `send_task` goes to the agent over `voice:<call>`
 * (`voiceCall` request), the agent's answers are read from the call's outbox
 * every 1.2 s and said, and at the end the call's record goes to the agent,
 * which writes its line in the chat.
 */
public final class LiveCall: CallEngine, @unchecked Sendable {
  public static let pollSeconds = 1.2
  public static let summaryRetryWaits: [Double] = [5, 10]
  /** The person's voice is taken as talking from this voice-activity score up. */
  static let personTalking = 0.5

  private let lock = NSLock()
  private weak var backend: AgentBackend?
  private let transport: VoiceTransport
  private let personName: @Sendable () -> String?
  /** The agent's voice for the call, given now if it has none on the list (`AppStore.ensureVoice`); without it, the roster's. */
  private let voiceFor: (@Sendable (String) async -> String?)?
  private let pause: @Sendable (Double) async -> Void
  /** The ring and the hang-up (`CallTones`); none in tests unless given. */
  private let tones: CallTonePlaying?
  /** How long the line must be quiet before work that came back is said (`replyLoop`). */
  private let quiet: Double
  /** How long a call that could not start stays up: the phone's 2.4 s, or until dismissed (nil, the Mac's banner, which keeps it 20 s unless the pointer is on it). */
  private let failedStays: Double?
  /** One line per step of the call (the Mac's `voice-call.log`). */
  private let log: @Sendable (String) -> Void
  private var state: CallState?
  private var listeners: [@Sendable (CallState?) -> Void] = []
  private var callId = ""
  private var conversationId: String?
  private var opened = false
  private var viaChat = false
  private var after = 0.0
  private var seenChat: Set<String> = []
  private var lastTask: String?
  private var tasks: [Task<Void, Never>] = []
  private var finished = false
  private var speaking = false
  private var activity = 0.0
  /** What the agent sent on the call, waiting for the line to be quiet. */
  private var pendingReplies: [String] = []
  /** The call is ready to start its voice: the ring stops after the cycle it is in. */
  private var prepared = false
  private var ringing: Task<Void, Never>?

  public init(backend: AgentBackend, transport: VoiceTransport, personName: @escaping @Sendable () -> String?, voiceFor: (@Sendable (String) async -> String?)? = nil, tones: CallTonePlaying? = nil, quiet: Double = 1.0, failedStays: Double? = 2.4, log: @escaping @Sendable (String) -> Void = { _ in }, pause: @escaping @Sendable (Double) async -> Void = { try? await Task.sleep(nanoseconds: UInt64($0 * 1_000_000_000)) }) {
    self.backend = backend; self.transport = transport; self.personName = personName; self.voiceFor = voiceFor; self.tones = tones; self.quiet = quiet; self.failedStays = failedStays; self.log = log; self.pause = pause
  }

  /** A failed call put away (the banner's Close, or its 20 s). */
  public func dismiss() {
    let over = lock.withLock { state?.phase == .ended }
    if over { set(nil) }
  }

  public func observe(_ listener: @escaping @Sendable (CallState?) -> Void) {
    let current: CallState? = lock.withLock { listeners.append(listener); return state }
    listener(current)
  }

  private func set(_ value: CallState?) {
    let all: [@Sendable (CallState?) -> Void] = lock.withLock { state = value; return listeners }
    for listener in all { listener(value) }
  }

  private func update(_ change: (inout CallState) -> Void) {
    let (next, all): (CallState?, [@Sendable (CallState?) -> Void]) = lock.withLock {
      guard var next = state else { return (nil, []) }
      change(&next)
      state = next
      return (next, listeners)
    }
    guard let next else { return }
    for listener in all { listener(next) }
  }

  private func keep(_ task: Task<Void, Never>) { lock.withLock { tasks.append(task) } }

  public func start(agentId: String, agentName: String, colour: String) {
    let busy = lock.withLock { state != nil }
    if busy { return }
    log("call started for agent \(agentId)")
    lock.withLock {
      callId = UUID().uuidString.lowercased(); conversationId = nil; opened = false; viaChat = false
      after = 0; seenChat = []; lastTask = nil; finished = false; speaking = false; activity = 0
      pendingReplies = []; prepared = false
    }
    set(CallState(phase: .ringing, status: VoiceCallText.calling, agentId: agentId, agentName: agentName, agentColour: colour, isMuted: false, agentSpeaking: false, levels: [], lines: [], connectedAt: nil, endedAt: nil))
    // The ring, as the Mac's banner rings, while the call gets ready.
    let ring = Task { [weak self] () -> Void in await self?.ring() }
    lock.withLock { ringing = ring }
    keep(ring)
    keep(Task { [weak self] in await self?.connect(agentId: agentId, agentName: agentName) })
  }

  /** Twice, then once more at a time while the call is still getting ready, seven at most (the Mac's `RINGS_BEFORE_CONNECT`, `MAX_RINGS`). */
  private func ring() async {
    guard let tones else { return }
    await tones.ring(cycles: CallTones.ringsBeforeConnect)
    var rings = CallTones.ringsBeforeConnect
    while !Task.isCancelled, !isFinished, !lock.withLock({ prepared }), rings < CallTones.maxRings {
      await tones.ring(cycles: 1)
      rings += 1
    }
  }

  private func connect(agentId: String, agentName: String) async {
    guard let backend else { return fail(VoiceCallText.couldNotConnect) }
    let roster = (try? await backend.listAgents()) ?? []
    let row = roster.first { $0.id == agentId }
    let page = try? await backend.command("getAgentTranscriptTail", ["id": .string(agentId), "limit": 80])
    let entries = page?["entries"]?.array ?? page?.array ?? []
    let ticket: JSON
    do {
      ticket = try await backend.server("proxy/v1/voice/calls", method: "POST", body: [:])
    } catch let error as SimeonAPIError {
      log("connect: the server refused the call: \(error.message)")
      return fail(error.status == 503 ? VoiceCallText.notSwitchedOn : error.status == 402 ? VoiceCallText.noCredit : VoiceCallText.couldNotConnect)
    } catch {
      log("connect: the server refused the call: \(error.localizedDescription)")
      return fail(VoiceCallText.couldNotConnect)
    }
    guard let token = ticket["token"]?.text, !isFinished else { return fail(VoiceCallText.couldNotConnect) }
    lock.withLock { conversationId = ticket["conversation_id"]?.text }
    let person = personName()
    let teammates = roster.filter { $0.id != agentId && !$0.isGroup && !$0.isHidden && !$0.name.isEmpty }.map { (name: $0.name, title: $0.title) }
    let name = row?.name ?? agentName
    let prompt = VoiceCallText.prompt(name: name, title: row?.title ?? "", description: row?.description ?? "", transcript: VoiceCallText.lines(entries), personName: person, teammates: teammates)
    let greeting = VoiceCallText.firstMessage(name: name, pick: Double.random(in: 0..<1), personName: person)
    // The voice its picker shows, never one taken off the list (9 October 2026); nil is the agent's own, Michael.
    let voiceId: String?
    if let voiceFor { voiceId = await voiceFor(agentId) } else { voiceId = row?.voiceId }
    guard !isFinished else { return fail(VoiceCallText.couldNotConnect) }
    // The voice starts once the ring is over, so the two never sound together.
    let ring: Task<Void, Never>? = lock.withLock { prepared = true; return ringing }
    await ring?.value
    tones?.stopRinging()
    guard !isFinished else { return }
    await open(agentId: agentId)
    log("connect: token issued for agent \(agentId) (voice \(voiceId ?? "the agent's own"), \(entries.count) chat entries read)")
    do {
      try await transport.start(token: token, prompt: prompt, firstMessage: greeting, voiceId: voiceId, language: VoiceCallText.language) { [weak self] event in
        self?.handle(event, agentId: agentId)
      }
    } catch {
      log("starting the conversation failed: \(error)")
      let text = "\(error)".lowercased()
      fail(text.contains("microphone") || text.contains("permission") ? VoiceCallText.noMicrophone : VoiceCallText.couldNotConnect)
    }
  }

  private var isFinished: Bool { lock.withLock { finished } }

  /** Opens `voice:<call>` on the agent; a host without the channel gets the call through its chat. */
  private func open(agentId: String) async {
    guard let backend else { return }
    let id = lock.withLock { callId }
    do {
      _ = try await backend.command("voiceCall", ["agentId": .string(agentId), "callId": .string(id), "kind": "open"])
      lock.withLock { opened = true }
    } catch {
      let page = try? await backend.command("getAgentTranscriptTail", ["id": .string(agentId), "limit": 30])
      let ids = (page?["entries"]?.array ?? []).compactMap { $0["kind"]?.string == "send-message" ? $0["id"]?.text : nil }
      lock.withLock { seenChat = Set(ids); viaChat = true; opened = true }
    }
    keep(Task { [weak self] in await self?.pollLoop(agentId: agentId) })
    keep(Task { [weak self] in await self?.waveLoop() })
    keep(Task { [weak self] in await self?.replyLoop() })
  }

  private func handle(_ event: VoiceEvent, agentId: String) {
    switch event {
    case .connected(let id):
      if let id { lock.withLock { conversationId = id } }
      log("connected: conversation \(lock.withLock { conversationId } ?? "unknown")")
      update { $0.phase = .live; $0.status = ""; $0.connectedAt = $0.connectedAt ?? Date() }
    case .agentSpeaking(let on):
      lock.withLock { speaking = on }
      update { $0.agentSpeaking = on }
    case .activity(let level):
      lock.withLock { activity = level }
    case .line(let fromPerson, let text):
      let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty, !VoiceCallText.isNudge(trimmed) else { return }
      update { $0.lines.append(CallLine(fromPerson: fromPerson, text: trimmed)) }
    case .transcript(let lines):
      update { $0.lines = lines.filter { let text = $0.text.trimmingCharacters(in: .whitespacesAndNewlines); return !text.isEmpty && !VoiceCallText.isNudge(text) } }
    case .tool(let name, let id, let parameters):
      keep(Task { [weak self] in
        guard let self else { return }
        let answer: String
        switch name {
        case "send_task": answer = await self.sendTask(agentId: agentId, parameters: parameters)
        case "recall_text_messages": answer = await self.recall(agentId: agentId)
        default: answer = "That tool isn't here."
        }
        await self.transport.toolResult(id: id, result: answer)
      })
    case .ended:
      finish(agentId: agentId)
    case .failed(let message):
      fail(message.isEmpty ? VoiceCallText.couldNotConnect : message)
    }
  }

  /** The voice's `send_task`: the request (2,000 characters at most) and the caller's words, to the agent. */
  func sendTask(agentId: String, parameters: JSON) async -> String {
    guard let backend, lock.withLock({ opened && !finished }) else { return VoiceCallText.relaySoftFail }
    let task = String((parameters["task"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(VoiceCallText.relayMaxChars))
    let quote = String((parameters["quote"]?.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(VoiceCallText.relayMaxChars))
    let (id, chat) = lock.withLock { (callId, viaChat) }
    do {
      if chat {
        let prompt = (["(On our call) \(task.isEmpty ? "Are you there?" : task)"] + (quote.isEmpty ? [] : ["My words: \"\(quote)\""]) + ["Answer here in a sentence or two of plain text; it is read out to me on the call."]).joined(separator: "\n")
        try await backend.send(agentId, text: prompt, attachments: [], replyTo: nil)
      } else {
        var args: JSON = ["agentId": .string(agentId), "callId": .string(id), "kind": "request", "request": .string(task)]
        if !quote.isEmpty { args = args.setting("quotes", [.string(quote)]) }
        _ = try await backend.command("voiceCall", args)
      }
    } catch {
      return VoiceCallText.relaySoftFail
    }
    if !task.isEmpty { lock.withLock { lastTask = task } }
    if !task.isEmpty { update { $0.activity = VoiceCallText.workingLabel(task) } }
    return VoiceCallText.sendTaskAccepted
  }

  /** The voice's `recall_text_messages`: the latest texts between the person and the agent. */
  func recall(agentId: String) async -> String {
    guard let backend, let page = try? await backend.command("getAgentTranscriptTail", ["id": .string(agentId), "limit": 60]) else {
      return "The text messages could not be read just now."
    }
    return VoiceCallText.recallAnswer(VoiceCallText.lines(page["entries"]?.array ?? page.array ?? [], limit: 20))
  }

  /** The call's outbox (or the chat, without a channel) every 1.2 s: what the agent sent is said; its activity is the status line. */
  private func pollLoop(agentId: String) async {
    var failures = 0
    while !Task.isCancelled, lock.withLock({ opened && !finished }), let backend {
      await pause(Self.pollSeconds)
      guard lock.withLock({ opened && !finished }) else { return }
      do {
        let (id, chat, since) = lock.withLock { (callId, viaChat, after) }
        var fresh: [String] = []
        if chat {
          let page = try await backend.command("getAgentTranscriptTail", ["id": .string(agentId), "limit": 30])
          for entry in page["entries"]?.array ?? [] where entry["kind"]?.string == "send-message" && entry["message"]?["type"]?.string == "text" {
            guard let entryId = entry["id"]?.text, let text = entry["message"]?["content"]?.text else { continue }
            let isNew = lock.withLock { seenChat.insert(entryId).inserted }
            if isNew { fresh.append(String(text.prefix(VoiceCallText.relayMaxChars))) }
          }
        } else {
          let outbox = try await backend.command("voiceCall", ["agentId": .string(agentId), "callId": .string(id), "kind": "outbox", "after": .number(since)])
          for message in outbox["messages"]?.array ?? [] {
            let seq = message["seq"]?.double ?? 0
            guard seq > lock.withLock({ after }) else { continue }
            lock.withLock { after = seq }
            if let text = message["text"]?.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty { fresh.append(text) }
          }
        }
        failures = 0
        let row = (try? await backend.listAgents())?.first { $0.id == agentId }
        let label: String? = row?.isRunningTurn == true ? (row?.activityLabel ?? lock.withLock { lastTask }.map(VoiceCallText.workingLabel)) : nil
        update { $0.activity = label }
        // Said by `replyLoop` once the line is quiet, never over the voice.
        if !fresh.isEmpty { lock.withLock { pendingReplies += fresh } }
      } catch {
        failures += 1
        if failures >= 10 { update { $0.activity = nil }; return }
      }
    }
  }

  /**
   * Work that came back is said only once the line is quiet: the voice has
   * finished speaking and the person is not talking, for `quiet` seconds
   * (the founder, 9 October 2026, of a reply that cut the voice off in the
   * middle of a sentence: "he cant cut himself like this, wait of turn").
   * Before this it went in the moment it arrived. Several that arrive
   * while the voice talks are said together.
   */
  private func replyLoop() async {
    var quietSince: Date?
    while !Task.isCancelled, !isFinished {
      await pause(0.1)
      let (talking, level) = lock.withLock { (speaking, activity) }
      if talking || level >= Self.personTalking { quietSince = nil; continue }
      let since = quietSince ?? Date()
      quietSince = since
      guard Date().timeIntervalSince(since) >= quiet else { continue }
      let replies: [String] = lock.withLock { let all = pendingReplies; pendingReplies = []; return all }
      guard !replies.isEmpty else { continue }
      quietSince = nil
      await transport.say(context: VoiceCallText.workCameBack(replies), nudge: VoiceCallText.workCameBackNudge)
    }
  }

  /** The waveform: louder while the agent speaks, the person's own voice otherwise. */
  private func waveLoop() async {
    while !Task.isCancelled, !isFinished {
      await pause(0.09)
      let (talk, level, muted) = lock.withLock { (speaking, activity, state?.isMuted ?? false) }
      update { call in
        guard call.phase == .live else { return }
        let loud = talk ? 1 : muted ? 0 : max(0.15, min(1, level))
        call.levels = (0..<24).map { _ in loud * (0.25 + Double.random(in: 0...0.75)) }
      }
    }
  }

  public func mute(_ muted: Bool) {
    update { $0.isMuted = muted }
    keep(Task { [weak self] in await self?.transport.setMuted(muted) })
  }

  public func hangUp() {
    let agentId: String? = lock.withLock { state?.agentId }
    guard let agentId else { return }
    keep(Task { [weak self] in
      await self?.transport.end()
      self?.finish(agentId: agentId)
    })
  }

  private func fail(_ message: String) {
    let wasOpen: (Bool, String, String?) = lock.withLock { (opened, callId, state?.agentId) }
    lock.withLock { finished = true }
    tones?.stopRinging()
    log("call failed: \(message)")
    update { $0.phase = .ended; $0.status = message; $0.failed = true; $0.activity = nil; $0.levels = []; $0.endedAt = Date() }
    if wasOpen.0, let agentId = wasOpen.2, let backend {
      Task { _ = try? await backend.command("voiceCall", ["agentId": .string(agentId), "callId": .string(wasOpen.1), "kind": "ended", "record": ["seconds": 0, "recap": nil, "transcript": []]]) }
    }
    if let failedStays { leaveSoon(after: failedStays) }
  }

  /** The end: the server's summary and transcript (asked again after 5 and 10 s), then the record to the agent. */
  private func finish(agentId: String) {
    let already: Bool = lock.withLock { let was = finished; finished = true; return was }
    guard !already else { return }
    let snapshot = lock.withLock { state }
    let seconds = snapshot?.seconds() ?? 0
    tones?.stopRinging()
    // The Mac's tone when a call that was live ends.
    if snapshot?.phase == .live { tones?.hangUp() }
    update { $0.phase = .ended; $0.status = VoiceCallText.ended; $0.agentSpeaking = false; $0.activity = nil; $0.levels = []; $0.endedAt = Date() }
    log(snapshot?.connectedAt == nil ? "call ended before it connected (agent \(agentId))" : "call ended: \(seconds)s")
    let running: [Task<Void, Never>] = lock.withLock { let all = tasks; tasks = []; return all }
    for task in running { task.cancel() }
    leaveSoon(after: 1.2)
    let (conversation, id, wasOpen, chat) = lock.withLock { (conversationId, callId, opened, viaChat) }
    let heard = snapshot?.lines ?? []
    let person = personName()
    Task { [weak self, backend, pause] in
      guard let backend else { return }
      var summary: JSON = nil
      var transcript: [JSON] = heard.map { ["speaker": .string($0.fromPerson ? "user" : "agent"), "text": .string($0.text)] }
      if let conversation, snapshot?.connectedAt != nil {
        var ending = try? await backend.server("proxy/v1/voice/calls/\(conversation)/end", method: "POST", body: ["seconds": .number(Double(seconds))])
        for wait in Self.summaryRetryWaits where ending?["summary"]?.text == nil || (ending?["transcript"]?.array ?? []).isEmpty {
          await pause(wait)
          ending = (try? await backend.server("proxy/v1/voice/calls/\(conversation)/end", method: "POST", body: ["seconds": .number(Double(seconds))])) ?? ending
        }
        summary = ending?["summary"]?.text.map { JSON.string($0) } ?? .null
        if let lines = ending?["transcript"]?.array, !lines.isEmpty { transcript = lines }
      }
      guard wasOpen, !chat else { return }
      let record: JSON = ["seconds": .number(Double(seconds)), "personName": person.map { JSON.string($0) } ?? .null, "recap": summary, "transcript": .array(transcript)]
      let answer = try? await backend.command("voiceCall", ["agentId": .string(agentId), "callId": .string(id), "kind": "ended", "record": record])
      if (answer?["exchange"]?.int ?? 0) == 0 && snapshot?.connectedAt != nil {
        let head = "Voice call · \(Chat.callClock(seconds))"
        let text = summary.text.map { "\(head)\n\n\($0)" } ?? head
        _ = try? await backend.command("appendSendMessage", ["agentId": .string(agentId), "message": ["type": "text", "content": .string(text)]])
      }
      _ = self
    }
  }

  private func leaveSoon(after seconds: Double) {
    Task { [weak self, pause] in
      await pause(seconds)
      guard let self else { return }
      let ended = self.lock.withLock { self.state?.phase == .ended }
      if ended { self.set(nil) }
    }
  }
}
