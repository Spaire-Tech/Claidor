import Foundation
import XCTest
@testable import SimeonCore

final class EmojiTests: XCTestCase {
  func testTheWindowsListInItsGroups() {
    XCTAssertEqual(EmojiCatalog.categories.map(\.label), ["Smileys & emotion", "People & body", "Animals & nature", "Food & drink", "Travel & places", "Activities", "Objects", "Symbols", "Flags"])
    XCTAssertEqual(EmojiCatalog.all.count, 3_944, "each emoji and its skin tones, as the window lists them")
    XCTAssertEqual(EmojiCatalog.all.first?.character, "😀")
    XCTAssertEqual(Set(EmojiCatalog.all.map(\.id)).count, EmojiCatalog.all.count)
    let tada = EmojiCatalog.all.first { $0.character == "🎉" }
    XCTAssertEqual(tada?.id, "tada")
    XCTAssertEqual(tada?.name, "Party popper")
    for reaction in ["👍", "👎", "❤️", "😂", "🎉", "😮"] { XCTAssertTrue(EmojiCatalog.all.contains { $0.character == reaction }, reaction) }
  }

  func testSearchAsTheWindowMatches() {
    XCTAssertEqual(EmojiCatalog.search("tada").first?.character, "🎉")
    XCTAssertEqual(EmojiCatalog.search("+1").first?.character, "👍")
    XCTAssertEqual(EmojiCatalog.search("joy").first?.character, "😂")
    XCTAssertTrue(EmojiCatalog.search("rocket").map(\.character).contains("🚀"))
    XCTAssertEqual(EmojiCatalog.search("").count, 96, "nothing typed gives the list from its start, 96 at most")
    XCTAssertTrue(EmojiCatalog.search("zzzzqqq").isEmpty)
    // Starting matches come before ones only holding the words; recents first within each.
    let plain = EmojiCatalog.search("smile", limit: 400)
    let firstNonStarting = plain.firstIndex { e in !(e.id.hasPrefix("smile") || e.shortcodes.contains { $0.hasPrefix("smile") } || e.name.lowercased().hasPrefix("smile") || e.name.lowercased().contains(" smile")) }
    let lastStarting = plain.lastIndex { e in e.id.hasPrefix("smile") || e.shortcodes.contains { $0.hasPrefix("smile") } || e.name.lowercased().hasPrefix("smile") || e.name.lowercased().contains(" smile") }
    if let firstNonStarting, let lastStarting { XCTAssertLessThan(lastStarting, firstNonStarting) }
    let recentFirst = EmojiCatalog.suggestions("smile", recent: [plain[3].id])
    XCTAssertEqual(recentFirst.first?.id, plain[3].id)
    XCTAssertLessThanOrEqual(recentFirst.count, 12)
  }

  func testTheColonBeingTyped() {
    XCTAssertEqual(EmojiCatalog.query("well done :ta"), "ta")
    XCTAssertEqual(EmojiCatalog.query(":+1"), "+1")
    XCTAssertEqual(EmojiCatalog.query("(:smile"), "smile")
    XCTAssertNil(EmojiCatalog.query("well done :t"))
    XCTAssertNil(EmojiCatalog.query("at 10:30"))
    XCTAssertNil(EmojiCatalog.query("well :tada done"))
    XCTAssertNil(EmojiCatalog.query("see https://x"))
    XCTAssertNil(EmojiCatalog.query("well::ta"))
    XCTAssertNil(EmojiCatalog.query("well done :Ta"), "the window's rule is lowercase")
    XCTAssertNil(EmojiCatalog.query(":" + String(repeating: "a", count: 51)))
    XCTAssertEqual(EmojiCatalog.inserting("🎉", into: "well done :ta"), "well done 🎉 ")
  }

  func testRecentPicksAreIdsFiftyAtMost() {
    let recent = EmojiCatalog.remembering("smile", in: EmojiCatalog.remembering("tada", in: []))
    XCTAssertEqual(recent, ["smile", "tada"])
    XCTAssertEqual(EmojiCatalog.remembering("tada", in: recent), ["tada", "smile"])
    XCTAssertEqual(EmojiCatalog.remembering("x", in: (0..<80).map(String.init)).count, 50)
  }
}

final class ChatFindTests: XCTestCase {
  private func line(_ id: String, _ text: String, role: String = "assistant") -> Entry {
    Entry(["kind": "message", "id": .string(id), "role": .string(role), "content": .string(text)])!
  }

  func testCountsEveryTimeTheWordsAppearAsTheWindowsFindReads() {
    let entries: [Entry] = [
      line("a", "Send me your RESUME, the resume"),
      line("b", "the résumé is attached", role: "user"),
      Entry(["kind": "user-attachment", "id": "f", "file_name": "resume.pdf", "file_path": "/x/resume.pdf"])!,
      Entry(["kind": "notice", "id": "n", "text": "Resume saved"])!,
      Entry(["kind": "send-message", "id": "d", "message": ["type": "email-draft", "draft": ["subject": "Resume", "body": "Attached: resume"]]])!,
      Entry(["kind": "message", "id": "t", "role": "assistant", "content": "resume for Iris", "toAgent": ["id": "iris", "name": "Iris"]])!,
    ]
    XCTAssertEqual(ChatFind.matches("resume", in: entries), [
      .init(rowId: "a", occurrence: 0), .init(rowId: "a", occurrence: 1),
      .init(rowId: "n", occurrence: 0), .init(rowId: "d", occurrence: 0), .init(rowId: "d", occurrence: 1),
    ], "capitals don't count, accents do; a file's name and agents talking to each other are not read")
    XCTAssertEqual(ChatFind.matches("  ", in: entries), [])
    XCTAssertEqual(ChatFind.matches("aa", in: [line("x", "aaaa")]).count, 2, "matches do not overlap")
  }

  func testStartsAtTheNewestAndStepsAsTheWindowDoes() {
    let found = ["a", "b", "f"].map { ChatFind.Match(rowId: $0, occurrence: 0) }
    XCTAssertEqual(ChatFind.first(found)?.rowId, "f")
    XCTAssertEqual(ChatFind.next(found, from: found[1], step: 1)?.rowId, "f")
    XCTAssertEqual(ChatFind.next(found, from: found[2], step: 1)?.rowId, "a")
    XCTAssertEqual(ChatFind.next(found, from: found[0], step: -1)?.rowId, "f")
    XCTAssertEqual(ChatFind.next(found, from: nil, step: 1)?.rowId, "a", "nothing chosen counts as the newest")
    XCTAssertEqual(ChatFind.next(found, from: nil, step: -1)?.rowId, "b")
    XCTAssertNil(ChatFind.next([], from: nil, step: 1))
    XCTAssertEqual(ChatFind.ordinal(found, found[1]), 2)
    XCTAssertEqual(ChatFind.ordinal(found, nil), 0)
  }
}

/** Threads, notices, an agent's pictures and a lone link, as the window lays them out. */
final class ChatThreadTests: XCTestCase {
  private func line(_ id: String, _ text: String, role: String = "user", replyTo: String? = nil, branched: Bool = false, at: Double) -> Entry {
    var json: JSON = ["kind": "message", "id": .string(id), "role": .string(role), "content": .string(text), "timestampMs": .number(at)]
    if let replyTo { json = json.setting("replyTo", .string(replyTo)) }
    if branched { json = json.setting("branched", true) }
    return Entry(json)!
  }

  private var chat: [Entry] {
    [
      line("m1", "Draft the brief", at: 1_000),
      line("r1", "On it", role: "assistant", replyTo: "m1", branched: true, at: 2_000),
      line("r2", "Shorter please", replyTo: "r1", branched: true, at: 3_000),
      line("m2", "Also book the flight", at: 4_000),
      line("q1", "Which one?", role: "assistant", replyTo: "m1", at: 5_000),
    ]
  }

  func testRepliesInAThreadStayOutOfTheChatAndAreCountedUnderTheirMessage() {
    let rows = Chat.rows(chat)
    XCTAssertFalse(rows.contains { $0.id == "r1" || $0.id == "r2" })
    guard let at = rows.firstIndex(where: { $0.id == "m1" }), case .thread(_, let root, let count, let side) = rows[at + 1] else { return XCTFail("\(rows.map(\.id))") }
    XCTAssertEqual(root, "m1")
    XCTAssertEqual(count, 2, "a reply to a reply counts for the thread it is in")
    XCTAssertEqual(side, .person)
    XCTAssertEqual(Chat.threadCounts(chat), ["m1": 2])
    // A plain reply (not branched) stays in the chat with its quote.
    guard case .bubble(let quoted)? = rows.first(where: { $0.id == "q1" }) else { return XCTFail() }
    XCTAssertEqual(quoted.quote, "Draft the brief")
    // A chat message answering a reply in a thread quotes it, not "(deleted)".
    let answering = chat + [line("a1", "About that", replyTo: "r2", at: 6_000)]
    guard case .bubble(let about)? = Chat.rows(answering).first(where: { $0.id == "a1" }) else { return XCTFail() }
    XCTAssertEqual(about.quote, "Shorter please")
  }

  func testAReplyWhoseFirstMessageIsNotLoadedStaysInTheChatUnlessOlderLinesMayHoldIt() {
    let orphan = [line("r9", "A reply to something older", replyTo: "gone", branched: true, at: 1_000)]
    XCTAssertTrue(Chat.rows(orphan).contains { $0.id == "r9" }, "the window shows it when nothing older is left to load")
    XCTAssertFalse(Chat.rows(orphan, mayHoldOlderHistory: true).contains { $0.id == "r9" }, "and waits for the older lines when there are some")
    XCTAssertEqual(Chat.threadCounts(orphan), [:])
    // Only messages, cards, files and notices can be thread replies (the window's `D2e`).
    let event = Entry(["kind": "event", "id": "e1", "branched": true, "replyTo": "m1", "event": ["type": "name-changed", "to": "Theo"]])!
    XCTAssertFalse(event.isBranched)
  }

  func testAThreadIsItsFirstMessageThenItsReplies() {
    XCTAssertEqual(Chat.threadEntries("m1", in: chat).map(\.id), ["m1", "r1", "r2"])
    let rows = Chat.threadRows("m1", in: chat)
    XCTAssertEqual(rows.compactMap { row -> String? in if case .bubble(let b) = row { return b.id }; return nil }, ["m1", "r1", "r2"])
    XCTAssertFalse(rows.contains { if case .thread = $0 { return true }; return false })
    XCTAssertEqual(Chat.threadEntries("m2", in: chat).map(\.id), ["m2"])
  }

  func testAThreadsTitleAsTheWindowWritesIt() {
    XCTAssertEqual(Chat.threadTitle(line("a", "Draft   the\n**brief**", at: 0)), "Draft the brief", "Markdown taken out, spaces run together")
    XCTAssertEqual(Chat.threadTitle(line("a", "Please find the three cheapest flights, then book one", at: 0)), "Please find the three cheapest flights…")
    XCTAssertEqual(Chat.threadTitle(line("a", "See [the brief](https://x.com/b) now", at: 0)), "See the brief now")
    XCTAssertEqual(Chat.threadTitle(line("a", "https://www.example.com/a/b", at: 0)), "https://www.example.com/a/b", "a link written in a message is its words")
    XCTAssertEqual(Chat.threadTitle(line("a", "   ", at: 0)), "Thread")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "user-attachment", "id": "f", "file_name": "photo.png", "file_path": "/x/photo.png"])!), "Photo")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "user-attachment", "id": "f", "file_name": "photo.heic", "file_path": "/x/photo.heic"])!), "photo.heic", "the window's pictures are avif, bmp, gif, ico, jpeg, jpg, png, svg, webp")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "user-attachment", "id": "f", "file_name": "brief.pdf", "file_path": "/x/brief.pdf"])!), "brief.pdf")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "send-message", "id": "s", "message": ["type": "attachment", "url": "https://example.com/report"]])!), "example.com")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "send-message", "id": "s", "message": ["type": "attachment", "url": "file:///home/box/out/Q3%20plan.pdf"]])!), "Q3 plan.pdf")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "send-message", "id": "s", "message": ["type": "widget", "widget": ["prompt": "Which plan?"]]])!), "Which plan?")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "send-message", "id": "s", "message": ["type": "cloud-agent", "bcId": "b"]])!), "Cloud agent")
    XCTAssertEqual(Chat.threadTitle(nil), "Thread")
  }

  func testNoticesPicturesAndSentOffline() {
    let entries: [Entry] = [
      Entry(["kind": "notice", "id": "n1", "text": "Simeon joined the group", "timestampMs": 1_000])!,
      Entry(["kind": "send-message", "id": "s1", "timestampMs": 2_000, "message": ["type": "text", "content": "", "images": [["url": "file:///tmp/a.png", "alt": "A chart", "width": 800, "height": 600], ["url": "https://x.com/b.jpg"], ["url": "ftp://nope"]]]])!,
      Entry(["kind": "message", "id": "u1", "role": "user", "content": "Sent from the plane", "sentWhileOfflineAtMs": 1_500, "timestampMs": 3_000])!,
    ]
    let rows = Chat.rows(entries)
    XCTAssertTrue(rows.contains { if case .notice("n1", "Simeon joined the group") = $0 { return true }; return false })
    guard case .bubble(let pictures)? = rows.first(where: { $0.id == "s1" }) else { return XCTFail("a message of pictures alone is drawn") }
    XCTAssertEqual(pictures.images.map(\.url), ["file:///tmp/a.png", "https://x.com/b.jpg"])
    XCTAssertEqual(pictures.images[0].alt, "A chart")
    XCTAssertEqual(pictures.images[0].aspect, 800.0 / 600.0, accuracy: 0.001)
    XCTAssertEqual(pictures.images[1].aspect, 4.0 / 3.0, accuracy: 0.001)
    XCTAssertFalse(pictures.isLoneEmoji)
    XCTAssertEqual(Chat.quoteLine(entries[1], limit: 96), "(empty)", "an agent's message of pictures alone quotes as its words, which are none")
    guard case .bubble(let offline)? = rows.first(where: { $0.id == "u1" }) else { return XCTFail() }
    XCTAssertEqual(offline.sentOfflineAtMs, 1_500)
  }

  func testALoneLink() {
    XCTAssertEqual(Chat.loneLink("  https://github.com/a/b/pull/3 ")?.host, "github.com")
    XCTAssertEqual(Chat.loneLink("[The brief](https://docs.example.com/x)")?.absoluteString, "https://docs.example.com/x")
    XCTAssertNil(Chat.loneLink("see https://github.com"))
    XCTAssertNil(Chat.loneLink("http://plain.example.com"))
    XCTAssertNil(Chat.loneLink("[a] b](https://x.com)"))
    XCTAssertNil(Chat.loneLink("[a](https://x.com) and more"))
    // The composer's document decides when the message carries one.
    let linked = #"{"type":"doc","content":[{"type":"paragraph"},{"type":"paragraph","content":[{"type":"text","text":"the brief","marks":[{"type":"link","attrs":{"href":"https://docs.example.com/x"}}]},{"type":"hardBreak"}]}]}"#
    XCTAssertEqual(Chat.loneLink("the brief", richText: linked)?.absoluteString, "https://docs.example.com/x")
    let code = #"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"https://x.com","marks":[{"type":"code"}]}]}]}"#
    XCTAssertNil(Chat.loneLink("https://x.com", richText: code))
    let skill = #"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"workflowReference","attrs":{"id":"w"}},{"type":"text","text":" https://x.com"}]}]}"#
    XCTAssertNil(Chat.loneLink("https://x.com", richText: skill))
  }

  /** Which messages may be a card: an agent's finished `send-message` text with no pictures, and the person's own message. */
  func testWhichMessagesAreLinkCards() {
    let entries = [
      Entry(["kind": "send-message", "id": "s1", "message": ["type": "text", "content": "https://x.com/a"]])!,
      Entry(["kind": "send-message", "id": "s2", "streaming": true, "message": ["type": "text", "content": "https://x.com/a"]])!,
      Entry(["kind": "send-message", "id": "s3", "message": ["type": "text", "content": "https://x.com/a", "images": [["url": "https://x.com/b.jpg"]]]])!,
      Entry(["kind": "message", "id": "u1", "role": "user", "content": "https://x.com/a"])!,
      Entry(["kind": "message", "id": "u2", "role": "user", "content": "https://x.com/a", "channel": "slack"])!,
      Entry(["kind": "message", "id": "a1", "role": "assistant", "content": "https://x.com/a"])!,
    ]
    var links: [String: URL?] = [:]
    for row in Chat.rows(entries) { if case .bubble(let b) = row { links[b.id] = b.loneLink } }
    XCTAssertNotNil(links["s1"] ?? nil)
    XCTAssertNil(links["s2"] ?? nil, "not while it streams")
    XCTAssertNil(links["s3"] ?? nil, "not with pictures")
    XCTAssertNotNil(links["u1"] ?? nil)
    XCTAssertNil(links["u2"] ?? nil, "not one from a channel")
    XCTAssertNil(links["a1"] ?? nil, "an agent's reply is drawn as words")
  }
}

/** The pictures under an agent's message, laid out as the window's planner lays them (numbers from its own code, run in Node). */
final class GalleryPlanTests: XCTestCase {
  private func plan(_ sizes: [(Double, Double)?], _ width: Double) -> GalleryPlan.Plan {
    GalleryPlan.plan(sizes: sizes.map { $0.map { (width: $0.0, height: $0.1) } }, availableWidth: width)
  }

  func testTheWindowsNumbers() {
    XCTAssertEqual(plan([(800, 600)], 600), .init(height: 192, widths: [256], foldedCount: 0))
    XCTAssertEqual(plan([(800, 600), (600, 800), nil], 500), .init(height: 142, widths: [189, 107, 189], foldedCount: 0))
    XCTAssertEqual(plan(Array(repeating: (1600, 900), count: 5), 400), .init(height: 72, widths: [128, 128, 128], foldedCount: 3))
    XCTAssertEqual(plan(Array(repeating: (3000, 500), count: 3), 300), .init(height: 192, widths: [300], foldedCount: 3))
    XCTAssertEqual(plan([(100, 50), (100, 120)], 560), .init(height: 64, widths: [128, 53], foldedCount: 0))
    XCTAssertEqual(plan([nil, nil, nil, nil], 0), .init(height: 192, widths: [], foldedCount: 4))
    XCTAssertEqual(plan([(4000, 1000), (4000, 1000)], 200), .init(height: 192, widths: [200], foldedCount: 2))
  }

  func testTheRowsWidth() {
    XCTAssertEqual(GalleryPlan.width(for: 0), 0)
    XCTAssertEqual(GalleryPlan.width(for: 50), 0)
    XCTAssertEqual(GalleryPlan.width(for: 300), 218)
    XCTAssertEqual(GalleryPlan.width(for: 640), 550.4, accuracy: 0.0001)
    XCTAssertEqual(GalleryPlan.width(for: 1200), 560)
  }
}

/** What `sendPrompt` carries: a thread's reply, a skill's document, and "written offline" only when it was. */
final class SendArgumentTests: XCTestCase {
  func testOnlyAHeldMessageSaysWhenItWasWritten() {
    let plain = LiveBackend.sendArguments("theo", text: "Hi", attachments: [], options: SendOptions(), nonce: "n1")
    XCTAssertNil(plain["composedAtMs"], "every message was being marked written offline")
    XCTAssertNil(plain["isFork"])
    XCTAssertNil(plain["replyToId"])
    XCTAssertEqual(plain["clientNonce"], "n1")
    let held = LiveBackend.sendArguments("theo", text: "Hi", attachments: [], options: SendOptions(composedAtMs: 1_234), nonce: nil)
    XCTAssertEqual(held["composedAtMs"], 1_234)
    let thread = LiveBackend.sendArguments("theo", text: "Hi", attachments: [], options: SendOptions(replyTo: "m1", isFork: true, richText: #"{"type":"doc"}"#), nonce: nil)
    XCTAssertEqual(thread["replyToId"], "m1")
    XCTAssertEqual(thread["isFork"], true)
    XCTAssertEqual(thread["richText"], #"{"type":"doc"}"#)
    XCTAssertNil(LiveBackend.sendArguments("theo", text: "Hi", attachments: [], options: SendOptions(isFork: true), nonce: nil)["isFork"], "a thread needs the message it answers")
  }
}

/** Sending while the computer is out of reach, a thread opened, and a chat that could not load. */
@MainActor
final class ChatQueueAndThreadTests: XCTestCase {
  func testAMessageWaitsWhileOfflineAndGoesWhenBackMarkedAsWrittenOffline() async throws {
    let backend = ScriptedBackend()
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    // Down the moment the stream drops, as the Mac's coordinator says it.
    backend.push(.connection(live: false))
    try await Task.sleep(nanoseconds: 50_000_000)
    XCTAssertTrue(store.isDown)
    await store.send("Book it", to: "theo")
    await store.send("Cancel me", to: "theo")
    let queued = store.rows(for: "theo").compactMap { row -> String? in if case .queuedSend(_, let nonce) = row { return nonce }; return nil }
    XCTAssertEqual(queued.count, 2)
    XCTAssertTrue(backend.sent.isEmpty)
    XCTAssertTrue(store.cancelQueued(queued[1], in: "theo"))
    XCTAssertFalse(store.rows(for: "theo").contains { $0.id == queued[1] })
    // What was written goes back to the chat's composer.
    XCTAssertEqual(store.canceledDraft?.scope, "theo")
    XCTAssertEqual(store.canceledDraft?.text, "Cancel me")

    backend.push(.connection(live: true))
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertFalse(store.isDown)
    XCTAssertEqual(backend.sent.map(\.text), ["Book it"])
    XCTAssertNotNil(backend.sent.first?.options.composedAtMs)
    XCTAssertFalse(store.rows(for: "theo").contains { if case .queuedSend = $0 { return true }; return false })

    // Online, nothing says it was written offline; Cancel on one no longer held says so in the composer.
    await store.send("Thanks", to: "theo")
    XCTAssertNil(backend.sent.last?.options.composedAtMs)
    XCTAssertFalse(store.cancelQueued("nope", in: "theo"))
    XCTAssertEqual(store.composerNotice?.text, "This message is already sending and can't be canceled.")
    XCTAssertEqual(store.composerNotice?.agentId, "theo")
  }

  func testAThreadIsMadeFromTheChatsLinesAndAReplyStaysInIt() async throws {
    let backend = ScriptedBackend()
    backend.lines = [
      ["kind": "message", "id": "m1", "role": "user", "content": "Draft the brief", "timestampMs": 1_000],
      ["kind": "message", "id": "r1", "role": "assistant", "content": "On it", "replyTo": "m1", "branched": true, "timestampMs": 2_000],
    ]
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertEqual(store.rows(for: "theo").map(\.id), ["stamp-m1", "m1", "thread-m1"])
    store.openThread("m1", in: "theo")
    let bubbles = { store.threadRows["theo"]?.compactMap { row -> String? in if case .bubble(let b) = row { return b.id }; return nil } ?? [] }
    XCTAssertEqual(bubbles(), ["m1", "r1"])
    XCTAssertEqual(store.threadTitle("m1", in: "theo"), "Draft the brief")
    XCTAssertEqual(store.threadRoot(of: "r1", in: "theo"), "m1")
    XCTAssertNil(store.threadRoot(of: "m1", in: "theo"))
    XCTAssertEqual(store.findableEntries("theo").map(\.id), ["m1", "r1"], "find reads the thread while it is open")

    await store.send("Shorter", to: "theo", replyTo: "m1", inThread: true)
    XCTAssertEqual(backend.sent.last?.options, SendOptions(replyTo: "m1", isFork: true))
    XCTAssertEqual(bubbles().count, 3, "the reply waits in the thread")
    XCTAssertFalse(store.rows(for: "theo").contains { if case .bubble(let b) = $0 { return b.text == "Shorter" }; return false }, "not in the chat")
    store.closeThread(in: "theo")
    XCTAssertNil(store.threadRows["theo"])
    XCTAssertEqual(store.findableEntries("theo").map(\.id).first, "m1")
    XCTAssertFalse(store.findableEntries("theo").contains { $0.id == "r1" }, "the chat's find leaves the thread's replies out")
  }

  func testAChatThatCouldNotLoadSaysSoAndRetries() async throws {
    let backend = ScriptedBackend()
    backend.failLoads = true
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertTrue(store.loadFailed.contains("theo"))
    XCTAssertNil(store.problem, "said in the chat, not as an alert")
    backend.failLoads = false
    await store.refresh("theo")
    XCTAssertFalse(store.loadFailed.contains("theo"))
    XCTAssertEqual(store.rows(for: "theo").last?.id, "u1")
  }
}

/** "/" skills, "#" pull requests and the document that carries them, as the window's editor writes it. */
final class ComposerMenuTests: XCTestCase {
  func testSlashOffersSkillsTheAgentCanBeAskedToUse() {
    let answer: JSON = ["workflows": [
      ["id": "w1", "name": "Weekly report", "trigger": nil, "isEnabledForAgent": true, "description": "Sums up the week"],
      ["id": "w2", "name": "Morning brief", "trigger": ["schedule": "0 9 * * *", "isEnabled": true], "isEnabledForAgent": true],
      ["id": "w3", "name": "Off for this agent", "isEnabledForAgent": false],
      ["id": "w4", "name": "A routine's own", "isEnabledForAgent": false, "source": "automation"],
      ["id": "w5", "name": "Not said", "trigger": nil],
      ["id": "w1", "name": "Weekly report again", "isEnabledForAgent": true],
      ["id": "", "name": "No id"],
    ]]
    let skills = ComposerMenus.skills(from: answer)
    XCTAssertEqual(skills.map(\.id), ["w1", "w4"], "on for this agent, or a routine's own")
    XCTAssertEqual(skills.first?.summary, "Sums up the week")
    let routines = ComposerMenus.skills(from: answer, scheduled: true)
    XCTAssertEqual(routines.map(\.id), ["w2"], "a routine is offered by @, not /")
    XCTAssertEqual(routines.first?.subtitle, "0 9 * * *", "its schedule when it has no description of it")
  }

  /** The window's scorer, its own numbers (run in Node from the bundle). */
  func testTheWindowsScorer() {
    XCTAssertEqual(ComposerLists.score(label: "Nora", query: "no")!, 17.84, accuracy: 0.0001)
    XCTAssertEqual(ComposerLists.score(label: "Nora", query: "nr")!, 11.84, accuracy: 0.0001)
    XCTAssertEqual(ComposerLists.score(label: "Nora", query: "ra")!, 9.44, accuracy: 0.0001)
    XCTAssertNil(ComposerLists.score(label: "Nora", query: "x"))
    XCTAssertEqual(ComposerLists.score(label: "Data Analyst", query: "an")!, 3.32, accuracy: 0.0001)
    XCTAssertNil(ComposerLists.score(label: "abcdefgh", query: "ah"))
    XCTAssertEqual(ComposerLists.score(label: "everyone", keywords: ["all"], query: "all")!, 12.94, accuracy: 0.0001)
    XCTAssertEqual(ComposerLists.tokens("Héllo, World!"), ["hello", "world"])
    XCTAssertEqual(ComposerLists.tokens("foo-bar_baz"), ["foo", "bar", "baz"])
    XCTAssertEqual(ComposerLists.tokens("it's"), ["it", "s"])
    XCTAssertEqual(ComposerLists.tokens("!!!"), [])
  }

  /** Where "@", "/" and "#" open: after a space, "(" or the start; names with one space at a time; 50 at most; not inside a pick. */
  func testWhereAListOpens() {
    XCTAssertEqual(ComposerLists.trigger("@", in: "hi @al"), .init(at: 3, query: "al"))
    XCTAssertNil(ComposerLists.trigger("@", in: "hi@al"))
    XCTAssertEqual(ComposerLists.trigger("@", in: "(@a")?.at, 1)
    XCTAssertEqual(ComposerLists.trigger("@", in: "@al ice")?.query, "al ice")
    XCTAssertNil(ComposerLists.trigger("@", in: "@al  ice"), "two spaces end it")
    XCTAssertEqual(ComposerLists.trigger("@", in: "@")?.query, "")
    XCTAssertNil(ComposerLists.trigger("@", in: "@" + String(repeating: "a", count: 51)))
    XCTAssertNil(ComposerLists.trigger("@", in: "@Nora hi", after: 5), "the words after a pick are where a list opens")
    XCTAssertEqual(ComposerLists.trigger("/", in: "run /wee")?.query, "wee")
    XCTAssertNil(ComposerLists.trigger("/", in: "and/or"))
    XCTAssertEqual(ComposerLists.trigger("#", in: "Review #4")?.query, "4")
    var dismissal = ComposerLists.Dismissal(character: "@")
    dismissal.at = 3
    XCTAssertFalse(dismissal.allows(3), "Esc keeps it shut there")
    dismissal.check("hi @al")
    XCTAssertEqual(dismissal.at, 3)
    dismissal.check("hi al")
    XCTAssertNil(dismissal.at, "its trigger gone, the dismissal goes")
  }

  func testWhatAtOffers() {
    func agent(_ id: String, _ name: String, group: [String]? = nil) -> Agent {
      Agent(json: JSON.object(["id": .string(id), "name": .string(name), "isGroup": .bool(group != nil), "memberIds": .array((group ?? []).map(JSON.string))]))!
    }
    let roster = [agent("a1", "Nora"), agent("a2", "Nova"), agent("g1", "Launch", group: ["a1", "a2"]), agent("g2", "Ops", group: ["a2", "a3"])]
    XCTAssertEqual(ComposerLists.mentionMembers(current: roster[0], roster: roster).map(\.id), ["a2", "g1"], "others, and the groups this one is in")
    XCTAssertEqual(ComposerLists.mentionMembers(current: roster[2], roster: roster).map(\.id), ["a1", "a2"], "a group's own members")
    let rows = ComposerLists.mentionRows(members: [roster[0], roster[1]], isGroupChat: true, routines: [ComposerMenus.Skill(id: "w2", name: "Morning brief", subtitle: "Every day at 9")],
                                         connectors: [ConnectedApp(serverId: "s1", name: "Gmail", pluginId: "gmail", accountKey: "work@x.com", status: "needsAuth", toolCount: 3, serverIdentifier: "gmail-work")])
    XCTAssertEqual(rows.map(\.label), ["everyone", "Nora", "Nova", "Morning brief", "Gmail (work@x.com)"])
    XCTAssertEqual(rows.map(\.tag), ["Agent", "Agent", "Agent", "Routine", "Plugin"])
    XCTAssertEqual(rows[4].subtitle, "needs auth")
    XCTAssertEqual(rows[4].key, "tools:mcp:gmail-work")
    XCTAssertEqual(rows[4].insert, .workflow(id: "mcp:s1", label: "Gmail (work@x.com)", iconId: nil, iconURL: nil))
    XCTAssertEqual(ComposerLists.filterMentions(rows, query: "", recents: ["assistants:a2"]).map(\.label), rows.map(\.label), "nothing typed: in order, recents or not")
    XCTAssertEqual(ComposerLists.filterMentions(rows, query: "no", recents: ["assistants:a2"]).map(\.label), ["Nova", "Nora"], "equal scores: the one picked lately first")
    XCTAssertEqual(ComposerLists.filterMentions(rows, query: "all", recents: []).map(\.label), ["everyone"])
    XCTAssertEqual(ComposerLists.mentionEmptyText("zz "), "No matches for \u{201C}zz\u{201D}")
    XCTAssertEqual(ComposerLists.rememberingMention("assistants:a1", in: ["assistants:a2", "assistants:a1"]), ["assistants:a1", "assistants:a2"])
  }

  func testWhatSlashOffers() {
    let skills = (1...7).map { ComposerMenus.Skill(id: "s\($0)", name: "Skill \($0)") }
    let actions = [
      ComposerLists.Action(id: "settings:general", label: "Settings: General", keywords: ["account", "theme"], detail: "Settings"),
      ComposerLists.Action(id: "overlay:plugins", label: "Plugins", keywords: ["connectors"]),
      ComposerLists.Action(id: "theme:dark", label: "Theme: Dark", keywords: ["appearance", "night", "mode"], detail: "Settings · Appearance"),
      ComposerLists.Action(id: "theme:light", label: "Theme: Light", keywords: ["appearance", "day", "bright"], detail: "Settings · Appearance"),
    ]
    let all = ComposerLists.slashItems(skills: skills, actions: actions, query: "")
    XCTAssertEqual(all.count, 8)
    XCTAssertEqual(all.filter { $0.tag == "Skill" }.count, 5, "three places kept for actions")
    XCTAssertEqual(ComposerLists.slashItems(skills: skills, actions: actions, query: "skill 3").map(\.id), ["s3"])
    XCTAssertEqual(ComposerLists.slashItems(skills: skills, actions: actions, query: "night").map(\.id), ["action:theme:dark"])
    XCTAssertEqual(ComposerLists.slashEmptyText("zz", hasAny: true), "No matches for \"zz\"")
    XCTAssertEqual(ComposerLists.slashEmptyText("", hasAny: false), "Nothing to reference yet")
  }

  func testWhatHashOffers() throws {
    let rich = try XCTUnwrap(ComposerDocument.richText("#12 again", chips: [ComposerChip(start: 0, node: .pullRequest(number: 12, title: "Fix login", url: "https://github.com/acme/app/pull/12"))]))
    let entries: [Entry] = [
      Entry(["kind": "message", "id": "a", "role": "user", "content": "See https://github.com/acme/app/pull/12."])!,
      Entry(["kind": "send-message", "id": "b", "message": ["type": "text", "content": "Opened https://github.com/acme/app/pull/40/files and https://gitlab.com/x/y/pull/3 and https://review.simeonlabs.com/github/pr/acme/app/41"]])!,
      Entry(["kind": "message", "id": "c", "role": "user", "content": "#12 again", "richText": .string(rich)])!,
    ]
    let pulls = ComposerLists.pullCandidates(entries)
    XCTAssertEqual(pulls.map(\.number), [12, 40, 41], "newest first, each once")
    XCTAssertEqual(pulls[0].title, "Fix login", "the document's reference wins")
    XCTAssertEqual(ComposerLists.filterPulls(pulls, query: "log").map(\.number), [12])
    XCTAssertEqual(ComposerLists.filterPulls(pulls, query: "4").map(\.number), [40, 41])
  }

  /** The message's document as the window's editor writes it, and the picks kept while the draft changes. */
  func testTheDocument() throws {
    var picked = ComposerDocument.picking(.mention(id: "a1", label: "Nora"), from: 3, in: "Hi @no", chips: [])
    XCTAssertEqual(picked.draft, "Hi @Nora ")
    picked = ComposerDocument.picking(.workflow(id: "w1", label: "Weekly report", iconId: nil, iconURL: nil), from: 13, in: picked.draft + "run /wee", chips: picked.chips)
    XCTAssertEqual(picked.draft, "Hi @Nora run @Weekly report ")
    XCTAssertEqual(ComposerDocument.textStart(picked.chips, in: picked.draft), 27)
    let draft = picked.draft + "now\nthanks"
    let text = try XCTUnwrap(ComposerDocument.richText(draft, chips: picked.chips))
    let doc = try JSON.parse(text)
    XCTAssertEqual(doc["type"], "doc")
    let pieces = doc["content"]?[0]?["content"]
    XCTAssertEqual(pieces?[0], ["type": "text", "text": "Hi "])
    XCTAssertEqual(pieces?[1], ["type": "mention", "attrs": ["id": "a1", "label": "Nora", "mentionSuggestionChar": "@"]])
    XCTAssertEqual(pieces?[2], ["type": "text", "text": " run "])
    XCTAssertEqual(pieces?[3]?["type"], "workflowReference")
    XCTAssertEqual(pieces?[3]?["attrs"]?["iconUrl"], .null)
    XCTAssertEqual(pieces?[4], ["type": "text", "text": " now"])
    XCTAssertEqual(pieces?[5], ["type": "hardBreak"])
    XCTAssertEqual(pieces?[6], ["type": "text", "text": "thanks"])
    XCTAssertNil(ComposerDocument.richText("", chips: []))
    // Words typed before a pick move it; a pick edited is gone.
    let moved = ComposerDocument.carry(picked.chips, from: picked.draft, to: "Oh " + picked.draft)
    XCTAssertEqual(moved.map(\.start), [6, 16])
    let broken = ComposerDocument.carry(picked.chips, from: picked.draft, to: "Hi @Nra run @Weekly report ")
    XCTAssertEqual(broken.map(\.text), ["@Weekly report"])
    // A canceled message comes back as it was.
    let back = try XCTUnwrap(ComposerDocument.draft(from: text))
    XCTAssertEqual(back.draft, draft)
    XCTAssertEqual(back.chips, picked.chips)
  }
}

/** Maths as the window's remark-math reads it: `$$` lines and ```math for display, `$$…$$` within a line, a lone `$` a dollar. */
final class MathTests: XCTestCase {
  func testDisplayMathOnItsOwnLines() {
    XCTAssertEqual(Markdown.blocks("Before\n\n$$\nE = mc^2\n$$\n\nAfter"), [.paragraph("Before"), .math("E = mc^2"), .paragraph("After")])
    XCTAssertEqual(Markdown.blocks("```math\n\\frac{a}{b}\n```"), [.math("\\frac{a}{b}")])
    // The closing line is "$$" alone (at least as many as opened); else the block runs to the end.
    XCTAssertEqual(Markdown.blocks("$$\na\n$$$\nafter"), [.math("a"), .paragraph("after")])
    XCTAssertEqual(Markdown.blocks("$$\na\nb$$"), [.math("a\nb$$")])
    // "$$x$$" alone on a line is a line's maths, not a block.
    XCTAssertEqual(Markdown.blocks("$$x$$"), [.paragraph("$$x$$")])
    // "\[" opening a line: a block, on one line or up to "\]".
    XCTAssertEqual(Markdown.blocks("\\[ x^2 \\]"), [.math("x^2")])
    XCTAssertEqual(Markdown.blocks("Text\n\\[\na + b\n\\]\nmore"), [.paragraph("Text"), .math("a + b"), .paragraph("more")])
  }

  func testMathWithinALine() {
    let parts = Markdown.inlineMath("The area is $$\\pi r^2$$ for $5")
    XCTAssertEqual(parts?.map(\.math), [false, true, false])
    XCTAssertEqual(parts?.map(\.text), ["The area is ", "\\pi r^2", " for $5"])
    XCTAssertNil(Markdown.inlineMath("It costs $5 or $6"))
    XCTAssertNil(Markdown.inlineMath("An unclosed $$x"))
    XCTAssertNil(Markdown.inlineMath("Empty $$$$ here"))
    XCTAssertEqual(Markdown.blocks("A line with $$x$$ in it"), [.paragraph("A line with $$x$$ in it")])
    // \( \) and \[ \] within a line, and the padding spaces left out.
    XCTAssertEqual(Markdown.inlineMath("So \\( a+b \\) and \\[c\\].")?.map(\.text), ["So ", "a+b", " and ", "c", "."])
    XCTAssertEqual(Markdown.inlineMath("Runs: $$$a$$b$$$ end")?.map(\.text), ["Runs: ", "a$$b", " end"])
    XCTAssertNil(Markdown.inlineMath("An unclosed \\(x"))
  }
}

/** A cloud agent's card: its line in the chat and its state as the host gives it. */
final class CloudAgentTests: XCTestCase {
  func testTheCardAndItsState() {
    let entry = Entry(["kind": "send-message", "id": "c1", "message": ["type": "cloud-agent", "bcId": "bc-42"]])!
    guard case .cloudAgent("c1", "bc-42")? = Chat.rows([entry]).last else { return XCTFail() }
    let info = CloudAgentInfo(["bcId": "bc-42", "status": "running", "name": "Fix the login", "branchName": "fix/login", "prUrl": "https://github.com/a/b/pull/7", "prState": "open", "prNumber": 7, "filesChanged": 3, "linesAdded": 40, "linesRemoved": 2])
    XCTAssertEqual(info?.statusLabel, "Running")
    XCTAssertEqual(info?.isLive, true)
    XCTAssertEqual(info?.changedLabel, "3 files changed")
    XCTAssertEqual(info?.pullRequestNumber, 7)
    XCTAssertEqual(CloudAgentInfo(["status": "finished", "filesChanged": 1])?.statusLabel, "Done")
    XCTAssertEqual(CloudAgentInfo(["status": "finished", "filesChanged": 1])?.changedLabel, "1 file changed")
    XCTAssertEqual(CloudAgentInfo(["status": "odd"])?.statusLabel, "Status unavailable")
    XCTAssertNil(CloudAgentInfo(nil))
    XCTAssertEqual(CloudAgentInfo.webURL("bc 42")?.absoluteString, "https://app.simeonlabs.com/agents/bc%2042")
    XCTAssertEqual(info?.pullState, "open")
    XCTAssertEqual(CloudAgentInfo(["prUrl": "https://github.com/a/b/pull/7"])?.pullState, "unknown")
    XCTAssertEqual(CloudAgentInfo(["status": "running"])?.pullState, "none")
    XCTAssertEqual(CloudAgentInfo.unavailable.statusLabel, "Status unavailable")
  }

  /** When the card asks again, as the window's poll: 5 s while it works, 60 s after a failure with nothing read, never once done or empty. */
  func testWhenTheCardAsksAgain() {
    let running = CloudAgentInfo(["status": "running"])!
    let done = CloudAgentInfo(["status": "finished"])!
    XCTAssertEqual(CloudAgentInfo.nextPoll(after: .info(running), known: nil), 5)
    XCTAssertNil(CloudAgentInfo.nextPoll(after: .info(done), known: running))
    XCTAssertNil(CloudAgentInfo.nextPoll(after: .empty, known: nil))
    XCTAssertEqual(CloudAgentInfo.nextPoll(after: .failed, known: nil), 60)
    XCTAssertEqual(CloudAgentInfo.nextPoll(after: .failed, known: running), 5)
  }
}

/** A link card's page, read by the Electron app's rules: which addresses, which redirects, what of the page. */
final class LinkMetadataTests: XCTestCase {
  func testWhichAddressesMayBeRead() {
    XCTAssertNotNil(LinkPreviewPolicy.safeURL("https://example.com/a?b=1"))
    XCTAssertNotNil(LinkPreviewPolicy.safeURL("https://example.com:443/"))
    XCTAssertNotNil(LinkPreviewPolicy.safeURL("https://8.8.8.8/"))
    XCTAssertNotNil(LinkPreviewPolicy.safeURL("https://[2606:4700::1111]/"))
    XCTAssertNil(LinkPreviewPolicy.safeURL("http://example.com"), "https only")
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://me:pw@example.com"), "no name or password")
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://example.com:8443/"), "no port but 443")
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://localhost/"))
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://intranet/"), "a host needs a dot")
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://printer.local/"))
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://svc.cluster/"))
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://10.1.2.3/"))
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://[::1]/"))
    XCTAssertNil(LinkPreviewPolicy.safeURL("https://example.com/" + String(repeating: "a", count: 2_100)))
  }

  func testPrivateAddresses() {
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("172.20.1.1"))
    XCTAssertFalse(LinkPreviewPolicy.isBlockedIP("172.32.0.1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("100.64.0.1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("198.19.255.255"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("239.1.1.1"))
    XCTAssertFalse(LinkPreviewPolicy.isBlockedIP("93.184.216.34"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("fe80::1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("fd12:3456::1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("2001:db8::1"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("::"))
    XCTAssertFalse(LinkPreviewPolicy.isBlockedIP("2606:4700::1111"))
    XCTAssertTrue(LinkPreviewPolicy.isBlockedIP("not an address"))
  }

  func testSignInPagesAreNoCard() {
    XCTAssertTrue(LinkPreviewPolicy.isSignInPage(URL(string: "https://accounts.google.com/v3/signin")!))
    XCTAssertTrue(LinkPreviewPolicy.isSignInPage(URL(string: "https://login.microsoftonline.com/common")!))
    XCTAssertTrue(LinkPreviewPolicy.isSignInPage(URL(string: "https://github.com/login")!))
    XCTAssertTrue(LinkPreviewPolicy.isSignInPage(URL(string: "https://example.com/u/sign-in/identifier/next")!))
    XCTAssertFalse(LinkPreviewPolicy.isSignInPage(URL(string: "https://example.com/blog/login-tips")!))
    XCTAssertFalse(LinkPreviewPolicy.isSignInPage(URL(string: "https://docs.example.com/guide")!))
  }

  func testWhatIsReadOfAPage() {
    let html = """
      <html><head><title>Plain title</title>
      <meta name="description" content="Tom &amp; Jerry&#39;s page">
      <meta property='og:title' content='The &quot;real&quot; title'>
      <link rel="shortcut icon" href="/favicon.png">
      <link rel=canonical href="https://example.com/canonical">
      <meta property="og:image" content="//cdn.example.com/p.jpg">
      </head></html>
      """
    let scraped = LinkPreviewPolicy.scrape(html, finalURL: URL(string: "https://example.com/a/b")!)
    XCTAssertEqual(scraped.title, "The \"real\" title")
    XCTAssertEqual(scraped.description, "Tom & Jerry's page")
    XCTAssertEqual(scraped.canonicalUrl, "https://example.com/canonical")
    XCTAssertEqual(scraped.faviconUrl, "https://example.com/favicon.png")
    XCTAssertEqual(scraped.imageUrl, "https://cdn.example.com/p.jpg")
    let bare = LinkPreviewPolicy.scrape("<title>\n  Hello\u{0007}  world </title>", finalURL: URL(string: "https://example.com")!)
    XCTAssertEqual(bare.title, "Hello world")
    XCTAssertNil(bare.faviconUrl)
    XCTAssertEqual(bare.canonicalUrl, "https://example.com")
  }
}

/** What the composer takes, and what it says of the rest, in the window's words. */
final class AttachmentLimitTests: XCTestCase {
  func testLimitsAndLines() {
    XCTAssertEqual(AttachmentLimits.admit(3, staged: 5).accepted, 1)
    XCTAssertEqual(AttachmentLimits.admit(3, staged: 5).notice, "Only 6 attachments allowed — 2 weren't added.")
    XCTAssertEqual(AttachmentLimits.admit(2, staged: 5).notice, "Only 6 attachments allowed — 1 wasn't added.")
    XCTAssertNil(AttachmentLimits.admit(2, staged: 0).notice)
    XCTAssertEqual(AttachmentLimits.refusal(name: "a.png", size: 0), .empty)
    XCTAssertEqual(AttachmentLimits.refusal(name: "a.png", size: 26 * 1024 * 1024), .tooLarge)
    XCTAssertNil(AttachmentLimits.refusal(name: "clip.MOV", size: 150 * 1024 * 1024))
    XCTAssertEqual(AttachmentLimits.notice([("big.pdf", .tooLarge)]), "\"big.pdf\" is too large to attach (max 25 MB).")
    XCTAssertEqual(AttachmentLimits.notice([("clip.mp4", .tooLarge)]), "\"clip.mp4\" is too large to attach (max 200 MB for video).")
    XCTAssertEqual(AttachmentLimits.notice([("e.txt", .empty)]), "\"e.txt\" is empty, so it wasn't attached.")
    XCTAssertEqual(AttachmentLimits.notice([("a", .tooLarge), ("b", .tooLarge)]), "2 files are too large to attach (max 25 MB, or 200 MB for video).")
    XCTAssertEqual(AttachmentLimits.notice([("a", .tooLarge), ("b", .failed)]), "2 files couldn't be attached.")
  }
}
