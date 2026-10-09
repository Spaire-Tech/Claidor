import Foundation
import XCTest
@testable import SimeonCore

final class EmojiTests: XCTestCase {
  func testTheListStartsWithFacesAndHoldsTheWindowsSix() {
    let all = EmojiCatalog.all.map(\.character)
    XCTAssertEqual(all.first, "😀")
    for reaction in ["👍", "👎", "❤️", "😂", "🎉", "😮"] { XCTAssertTrue(all.contains(reaction), reaction) }
    XCTAssertGreaterThan(all.count, 1_000)
    XCTAssertEqual(Set(all).count, all.count)
    // No letters of a flag, no digits or "#".
    XCTAssertFalse(all.contains("🇦"))
    XCTAssertFalse(all.contains { $0.hasPrefix("#") || $0.first?.isNumber == true })
  }

  func testSearchByShortNameThenName() {
    XCTAssertEqual(EmojiCatalog.search("tada").first?.character, "🎉")
    XCTAssertEqual(EmojiCatalog.search(":+1").first?.character, "👍")
    XCTAssertEqual(EmojiCatalog.search("joy").first?.character, "😂")
    XCTAssertTrue(EmojiCatalog.search("rocket").map(\.character).contains("🚀"))
    XCTAssertTrue(EmojiCatalog.search("thumbs down").map(\.character).contains("👎"))
    XCTAssertEqual(EmojiCatalog.search("").count, 60)
    XCTAssertTrue(EmojiCatalog.search("zzzzqqq").isEmpty)
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

  func testRecentPicksComeFirstAndTwelveAtMost() {
    let recent = EmojiCatalog.remembering("😄", in: EmojiCatalog.remembering("🙂", in: []))
    XCTAssertEqual(recent, ["😄", "🙂"])
    XCTAssertEqual(EmojiCatalog.remembering("🙂", in: recent), ["🙂", "😄"])
    XCTAssertEqual(EmojiCatalog.remembering("x", in: (0..<30).map(String.init)).count, 24)
    let offered = EmojiCatalog.suggestions("smil", recent: ["😄"])
    XCTAssertEqual(offered.first?.character, "😄")
    XCTAssertLessThanOrEqual(offered.count, 12)
    XCTAssertEqual(Set(offered.map(\.character)).count, offered.count)
  }
}

final class ChatFindTests: XCTestCase {
  private func bubble(_ id: String, _ text: String, mine: Bool = false) -> ChatRow {
    .bubble(Bubble(id: id, text: text, fromPerson: mine, author: nil, showsName: false, showsAvatar: false, reactions: [], isStreaming: false))
  }

  func testCountsEveryTimeTheWordsAppearWhateverTheirCaseAndAccents() {
    let rows: [ChatRow] = [
      bubble("a", "Send me your Résumé, the resume"),
      .stamp(id: "s", date: Date()),
      bubble("b", "the resume is attached", mine: true),
      .file(id: "f", name: "resume.pdf", url: "/x/resume.pdf", fromPerson: false),
      .notice(id: "n", text: "Resume saved"),
      bubble("c", "nothing here"),
    ]
    let found = ChatFind.matches("RESUME", in: rows)
    XCTAssertEqual(found, [
      .init(rowId: "a", occurrence: 0), .init(rowId: "a", occurrence: 1),
      .init(rowId: "b", occurrence: 0), .init(rowId: "n", occurrence: 0),
    ], "a file's name is not searched, as in the window")
    XCTAssertEqual(ChatFind.matches("  ", in: rows), [])
    XCTAssertEqual(ChatFind.matches("zebra", in: rows), [])
    XCTAssertEqual(ChatFind.matches("aa", in: [bubble("x", "aaaa")]).count, 2, "matches do not overlap")
  }

  func testStartsAtTheNewestAndGoesRound() {
    let found = ["a", "b", "f"].map { ChatFind.Match(rowId: $0, occurrence: 0) }
    XCTAssertEqual(ChatFind.first(found)?.rowId, "f")
    XCTAssertEqual(ChatFind.next(found, from: found[1], step: 1)?.rowId, "f")
    XCTAssertEqual(ChatFind.next(found, from: found[2], step: 1)?.rowId, "a")
    XCTAssertEqual(ChatFind.next(found, from: found[0], step: -1)?.rowId, "f")
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
  }

  func testAThreadIsItsFirstMessageThenItsReplies() {
    XCTAssertEqual(Chat.threadEntries("m1", in: chat).map(\.id), ["m1", "r1", "r2"])
    let rows = Chat.threadRows("m1", in: chat)
    XCTAssertEqual(rows.compactMap { row -> String? in if case .bubble(let b) = row { return b.id }; return nil }, ["m1", "r1", "r2"])
    XCTAssertFalse(rows.contains { if case .thread = $0 { return true }; return false })
    XCTAssertTrue(Chat.threadEntries("m2", in: chat).map(\.id) == ["m2"])
  }

  func testAThreadsTitle() {
    XCTAssertEqual(Chat.threadTitle(line("a", "Draft   the\nbrief", at: 0)), "Draft the brief")
    XCTAssertEqual(Chat.threadTitle(line("a", "Please find the three cheapest flights, then book one", at: 0)), "Please find the three cheapest flights…")
    XCTAssertEqual(Chat.threadTitle(line("a", "https://www.example.com/a/b", at: 0)), "www.example.com")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "user-attachment", "id": "f", "file_name": "photo.png", "file_path": "/x/photo.png"])!), "Photo")
    XCTAssertEqual(Chat.threadTitle(Entry(["kind": "user-attachment", "id": "f", "file_name": "brief.pdf", "file_path": "/x/brief.pdf"])!), "brief.pdf")
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
    XCTAssertEqual(Chat.quoteLine(entries[1], limit: 96), "Photo")
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
    let streaming = Bubble(id: "b", text: "https://x.com", fromPerson: false, author: nil, showsName: false, showsAvatar: false, reactions: [], isStreaming: true)
    XCTAssertNil(streaming.loneLink)
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

    backend.push(.connection(live: true))
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertFalse(store.isDown)
    XCTAssertEqual(backend.sent.map(\.text), ["Book it"])
    XCTAssertNotNil(backend.sent.first?.options.composedAtMs)
    XCTAssertFalse(store.rows(for: "theo").contains { if case .queuedSend = $0 { return true }; return false })

    // Online, nothing says it was written offline; Cancel on one already gone does nothing.
    await store.send("Thanks", to: "theo")
    XCTAssertNil(backend.sent.last?.options.composedAtMs)
    XCTAssertFalse(store.cancelQueued("nope", in: "theo"))
  }

  func testAThreadOpensWithItsRepliesAndAReplyStaysInIt() async throws {
    let backend = ScriptedBackend()
    backend.lines = [
      ["kind": "message", "id": "m1", "role": "user", "content": "Draft the brief", "timestampMs": 1_000],
      ["kind": "message", "id": "r1", "role": "assistant", "content": "On it", "replyTo": "m1", "branched": true, "timestampMs": 2_000],
    ]
    backend.thread = ["entries": [
      ["kind": "message", "id": "m1", "role": "user", "content": "Draft the brief", "timestampMs": 1_000],
      ["kind": "message", "id": "r0", "role": "assistant", "content": "An older reply", "replyTo": "m1", "branched": true, "timestampMs": 1_500],
      ["kind": "message", "id": "r1", "role": "assistant", "content": "On it", "replyTo": "m1", "branched": true, "timestampMs": 2_000],
    ]]
    let store = AppStore()
    await store.attach(backend)
    await store.open("theo")
    XCTAssertEqual(store.rows(for: "theo").map(\.id), ["stamp-m1", "m1", "thread-m1"])
    await store.openThread("m1", in: "theo")
    let bubbles = { store.threadRows["theo"]?.compactMap { row -> String? in if case .bubble(let b) = row { return b.id }; return nil } ?? [] }
    XCTAssertEqual(bubbles(), ["m1", "r0", "r1"])
    XCTAssertEqual(store.threadTitle("m1", in: "theo"), "Draft the brief")
    XCTAssertEqual(store.threadRoot(of: "r1", in: "theo"), "m1")
    XCTAssertNil(store.threadRoot(of: "m1", in: "theo"))

    await store.send("Shorter", to: "theo", replyTo: "m1", inThread: true)
    XCTAssertEqual(backend.sent.last?.options, SendOptions(replyTo: "m1", isFork: true))
    XCTAssertEqual(bubbles().count, 4, "the reply waits in the thread")
    XCTAssertFalse(store.rows(for: "theo").contains { if case .bubble(let b) = $0 { return b.text == "Shorter" }; return false }, "not in the chat")
    store.closeThread(in: "theo")
    XCTAssertNil(store.threadRows["theo"])
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
      ["id": "w1", "name": "Weekly report", "trigger": nil, "isEnabledForAgent": true],
      ["id": "w2", "name": "Morning brief", "trigger": ["schedule": "0 9 * * *", "isEnabled": true]],
      ["id": "w3", "name": "Off for this agent", "isEnabledForAgent": false],
      ["id": "w4", "name": "A routine's own", "isEnabledForAgent": false, "source": "automation"],
      ["id": "w1", "name": "Weekly report again"],
      ["id": "", "name": "No id"],
    ]]
    let skills = ComposerMenus.skills(from: answer)
    XCTAssertEqual(skills.map(\.id), ["w1", "w4"])
    XCTAssertEqual(ComposerMenus.skills(from: answer, scheduled: true).map(\.id), ["w2"], "a routine is offered by @, not /")
    XCTAssertEqual(ComposerMenus.filter(skills, "rep").map(\.id), ["w1"])
    XCTAssertEqual(ComposerMenus.filter(skills, "").count, 2)
    XCTAssertEqual(ComposerMenus.query("run /wee", after: "/"), "wee")
    XCTAssertEqual(ComposerMenus.query("/", after: "/"), "")
    XCTAssertNil(ComposerMenus.query("and/or", after: "/"))
    XCTAssertNil(ComposerMenus.query("/a b", after: "/"))
    XCTAssertEqual(ComposerMenus.replacing(after: "/", in: "run /wee", with: "@Weekly report"), "run @Weekly report ")
  }

  func testTheDocumentCarriesWhatWasPicked() throws {
    let skill = ComposerMenus.Skill(id: "w1", name: "Weekly report")
    XCTAssertNil(ComposerMenus.richText("no skill here", skills: [skill]))
    let text = try XCTUnwrap(ComposerMenus.richText("Run @Weekly report now\nthanks", skills: [skill]))
    let doc = try JSON.parse(text)
    XCTAssertEqual(doc["type"], "doc")
    let first = doc["content"]?[0]?["content"]
    XCTAssertEqual(first?[0], ["type": "text", "text": "Run "])
    XCTAssertEqual(first?[1]?["type"], "workflowReference")
    XCTAssertEqual(first?[1]?["attrs"]?["id"], "w1")
    XCTAssertEqual(first?[1]?["attrs"]?["label"], "Weekly report")
    XCTAssertEqual(first?[2], ["type": "text", "text": " now"])
    XCTAssertEqual(doc["content"]?[1]?["content"]?[0], ["type": "text", "text": "thanks"])
    XCTAssertNil(ComposerMenus.richText("@Weekly reports", skills: [skill]), "a longer word is not the skill")
  }

  func testHashOffersThePullRequestsTheChatLinked() {
    let entries: [Entry] = [
      Entry(["kind": "message", "id": "a", "role": "user", "content": "See https://github.com/acme/app/pull/12."])!,
      Entry(["kind": "send-message", "id": "b", "message": ["type": "text", "content": "Opened https://github.com/acme/app/pull/40/files and https://gitlab.com/x/y/pull/3"]])!,
      Entry(["kind": "message", "id": "c", "role": "user", "content": "again https://github.com/acme/app/pull/12"])!,
    ]
    let pulls = ComposerMenus.pullRequests(in: entries)
    XCTAssertEqual(pulls.map(\.number), [12, 40], "newest first, each once")
    XCTAssertEqual(pulls[0].url, "https://github.com/acme/app/pull/12")
    XCTAssertEqual(ComposerMenus.filter(pulls, "4").map(\.number), [40])
    let doc = ComposerMenus.richText("Review #40", skills: [], pullRequests: [pulls[1]])
    XCTAssertTrue(doc?.contains(#""type":"prReference""#) == true)
  }
}

/** Maths as the window's remark-math reads it: `$$` lines and ```math for display, `$$…$$` within a line, a lone `$` a dollar. */
final class MathTests: XCTestCase {
  func testDisplayMathOnItsOwnLines() {
    XCTAssertEqual(Markdown.blocks("Before\n\n$$\nE = mc^2\n$$\n\nAfter"), [.paragraph("Before"), .math("E = mc^2"), .paragraph("After")])
    XCTAssertEqual(Markdown.blocks("```math\n\\frac{a}{b}\n```"), [.math("\\frac{a}{b}")])
    XCTAssertEqual(Markdown.blocks("$$\na\nb$$"), [.math("a\nb")])
  }

  func testMathWithinALine() {
    let parts = Markdown.inlineMath("The area is $$\\pi r^2$$ for $5")
    XCTAssertEqual(parts?.map(\.math), [false, true, false])
    XCTAssertEqual(parts?.map(\.text), ["The area is ", "\\pi r^2", " for $5"])
    XCTAssertNil(Markdown.inlineMath("It costs $5 or $6"))
    XCTAssertNil(Markdown.inlineMath("An unclosed $$x"))
    XCTAssertNil(Markdown.inlineMath("Empty $$$$ here"))
    XCTAssertEqual(Markdown.blocks("A line with $$x$$ in it"), [.paragraph("A line with $$x$$ in it")])
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
  }
}
