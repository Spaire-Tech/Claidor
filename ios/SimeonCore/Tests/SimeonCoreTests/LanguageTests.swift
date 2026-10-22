import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import XCTest
@testable import SimeonCore

/**
 * The app's language (20 October 2026): on every request to the server
 * (`Accept-Language`), to the person's computer (`userLanguage`) and the
 * account (`POST user/profile`) after every sign-in, in a call's voice and
 * first line, and in dictation. English reads as before.
 */
final class LanguageTests: XCTestCase {
  override func tearDown() {
    AppLanguage.override = nil
    super.tearDown()
  }

  func testTheAppsLanguageIsATagAndEnglishWhereNothingElseIsKnown() {
    #if !canImport(Darwin)
    XCTAssertEqual(AppLanguage.current, "en", "Linux and the tests: English")
    #endif
    AppLanguage.override = "fr"
    XCTAssertEqual(AppLanguage.current, "fr")
    XCTAssertEqual(AppLanguage.tag("pt_BR"), "pt-BR")
    XCTAssertEqual(AppLanguage.tag("Base"), "en")
    XCTAssertEqual(AppLanguage.code("fr-CA"), "fr")
    XCTAssertTrue(AppLanguage.isEnglish("en-GB"))
    XCTAssertFalse(AppLanguage.isEnglish("fr"))
    XCTAssertEqual(AppLanguage.ownName("fr"), "Français")
    XCTAssertEqual(AppLanguage.ownName("fr-CA"), "Français")
    XCTAssertEqual(AppLanguage.ownName("en"), "English")
    XCTAssertEqual(AppLanguage.englishName("pt-BR"), "Brazilian Portuguese")
    // The Mac's picker: English first, then by own name, Xcode's "Base" left out.
    XCTAssertEqual(AppLanguage.available(["Base", "fr", "en", "de"]), ["en", "de", "fr"])
  }

  func testThePickerKeepsTheAppsOwnLanguageApartFromTheDevices() {
    let name = "simeon.tests.language.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!
    defer { defaults.removePersistentDomain(forName: name) }
    XCTAssertEqual(AppLanguage.chosen(defaults, domain: name), AppLanguage.system, "nothing picked: the device's")
    AppLanguage.choose("fr", defaults)
    XCTAssertEqual(AppLanguage.chosen(defaults, domain: name), "fr")
    XCTAssertEqual(defaults.stringArray(forKey: "AppleLanguages"), ["fr"], "the key iOS's own Settings › Apps › Simeon › Language writes")
    AppLanguage.choose(AppLanguage.system, defaults)
    XCTAssertEqual(AppLanguage.chosen(defaults, domain: name), AppLanguage.system)
    // System, then English, then the others by their own name.
    XCTAssertEqual(AppLanguage.choices(["Base", "fr", "en"]).map(\.value), [AppLanguage.system, "en", "fr"])
    XCTAssertEqual(AppLanguage.choices(["en", "fr"]).map(\.label), ["System", "English", "Français"])
  }

  func testTheLanguageHeaderReachesTheServer() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { request in
        XCTAssertEqual(request.value(forHTTPHeaderField: "accept-language"), "fr")
        XCTAssertEqual(request.value(forHTTPHeaderField: "x-simeon-client-type"), "sand", "the other headers stay")
        return HTTPAnswer(status: 200, body: json(#"{"code":0,"data":{"email":"bass@simeonlabs.com"}}"#))
      },
      { request in
        XCTAssertEqual(request.url?.path, "/simeon.v1.ComputerService/EnsureSandBox")
        XCTAssertEqual(request.value(forHTTPHeaderField: "accept-language"), "fr", "the broker hears it too")
        return HTTPAnswer(status: 200, body: json("{}"))
      },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http, language: "fr")
    _ = try await api.profile()
    _ = try await api.connect("EnsureSandBox")
    XCTAssertEqual(http.sent.count, 2)
  }

  func testTheLanguageHeaderIsTheAppsByDefaultAndOnTheRefreshToo() async throws {
    AppLanguage.override = "fr"
    let vault = MemoryVault(SessionTokens(accessToken: "old", refreshToken: "r", expiresAtMs: 1_000))
    let http = ScriptedHTTP([
      { request in
        XCTAssertEqual(request.url?.path, "/oauth/token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "accept-language"), "fr")
        return HTTPAnswer(status: 200, body: json(#"{"access_token":"new","refresh_token":"r2"}"#))
      },
      { request in
        XCTAssertEqual(request.value(forHTTPHeaderField: "accept-language"), "fr")
        return HTTPAnswer(status: 200, body: json(#"{"code":0,"data":{}}"#))
      },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http, now: { 1_000_000 })
    XCTAssertEqual(api.language, "fr")
    _ = try await api.profile()
    XCTAssertEqual(http.sent.count, 2)
  }

  func testSigningInSendsTheLanguageBeforeThereIsASession() async {
    AppLanguage.override = "fr"
    let http = ScriptedHTTP([
      { request in
        XCTAssertEqual(request.value(forHTTPHeaderField: "accept-language"), "fr")
        XCTAssertEqual(request.value(forHTTPHeaderField: SimeonConfig.clientVersionHeader), "1")
        return HTTPAnswer(status: 202, body: json("{}"))
      },
    ])
    let sent = await EmailSignIn.requestCode(api: URL(string: "https://api.example.com")!, email: "bass@example.com", clientVersion: "1", http: http)
    XCTAssertEqual(sent, .sent)
    XCTAssertEqual(http.sent.count, 1)
    XCTAssertEqual(SimeonConfig.serverHeaders(clientVersion: "2", language: "en"), [SimeonConfig.clientVersionHeader: "2", "accept-language": "en"])
  }

  func testDictationIsHeardInTheAppsLanguageAndEnglishAsBefore() async throws {
    let vault = MemoryVault(SessionTokens(accessToken: "t", refreshToken: "r", expiresAtMs: 9e15))
    let http = ScriptedHTTP([
      { request in
        let body = String(decoding: request.httpBody ?? Data(), as: UTF8.self)
        XCTAssertTrue(body.contains("Content-Disposition: form-data; name=\"language\"\r\n\r\nfr\r\n"))
        XCTAssertTrue(body.contains("Content-Disposition: form-data; name=\"file\"; filename=\"audio.mp4\"\r\nContent-Type: audio/mp4\r\n\r\nRIFF"))
        return HTTPAnswer(status: 200, body: json(#"{"text":"Décale la revue à vendredi.","seconds":2.4}"#))
      },
    ])
    let api = SimeonAPI(base: URL(string: "https://api.example.com")!, clientVersion: "1", vault: vault, http: http, language: "fr-CA")
    let said = try await api.transcribe(audio: Data("RIFF".utf8), mimeType: "audio/mp4")
    XCTAssertEqual(said, "Décale la revue à vendredi.")
    XCTAssertNil(SimeonAPI.dictationLanguage("en-US"), "English: no language, OpenAI finds it")
    XCTAssertEqual(SimeonAPI.dictationLanguage("pt-BR"), "pt")
  }

  @MainActor
  func testTheLanguageIsWrittenOnTheComputerAndTheAccountAfterSignIn() async throws {
    AppLanguage.override = "fr"
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let host = { try await backend.command("getHostSettings", [:])["userLanguage"]?.string }
    let account = { try await backend.server("user/profile", method: nil, body: nil)["language"]?.string }
    let before = try await host()
    XCTAssertNil(before)
    let store = AppStore()
    await store.attach(backend)
    try await Task.sleep(nanoseconds: 200_000_000)
    let hostAfter = try await host(), accountAfter = try await account()
    XCTAssertEqual(hostAfter, "fr", "the host setting userLanguage, beside userTimeZone")
    XCTAssertEqual(accountAfter, "fr", "the account, POST user/profile")

    await store.tellLanguage("en")
    let hostEnglish = try await host(), accountEnglish = try await account()
    XCTAssertEqual(hostEnglish, "en")
    XCTAssertEqual(accountEnglish, "en")
  }

  func testTheChiefOfStaffIsShownInTheAppsLanguageAndSavedInEnglish() {
    var simeon = Agent(id: "simeon", name: "Simeon")
    simeon.title = "Chief of Staff"
    simeon.description = Onboarding.chiefOfStaffDescription
    XCTAssertEqual(Onboarding.chiefOfStaff(nonce: "n")["title"]?.string, "Chief of Staff", "saved in English: the engine knows him by it")
    XCTAssertEqual(Onboarding.chiefOfStaff(nonce: "n")["description"]?.string, Onboarding.chiefOfStaffDescription)
    XCTAssertEqual(simeon.shownTitle, L10n.text("Chief of Staff"))
    XCTAssertEqual(simeon.shownDescription, L10n.text("Your Chief of Staff: manages your other Agents and pulls you in for decisions."))
    var ada = Agent(id: "ada", name: "Ada")
    ada.title = "Boîte mail"
    ada.description = "Trie la boîte mail."
    XCTAssertEqual(ada.shownTitle, "Boîte mail", "any other title as its agent wrote it")
    XCTAssertEqual(ada.shownDescription, "Trie la boîte mail.")
  }

  func testACallHearsAndSpeaksTheAppsLanguage() async throws {
    XCTAssertEqual(VoiceCallText.language(for: "en"), "en")
    XCTAssertEqual(VoiceCallText.language(for: "fr-CA"), "fr")
    XCTAssertEqual(VoiceCallText.language(for: "ja"), "en", "a language the server's voice agent was not given is English")
    XCTAssertEqual(VoiceCallText.language(for: "tlh"), "en")

    // English reads exactly as before.
    let english = VoiceCallText.prompt(name: "Theo", title: "", description: "", transcript: [], personName: "Bass", teammates: [])
    XCTAssertEqual(english, VoiceCallText.prompt(name: "Theo", title: "", description: "", transcript: [], personName: "Bass", teammates: [], language: "en"))
    XCTAssertFalse(english.contains("Language:"))
    XCTAssertEqual(VoiceCallText.firstMessage(name: "Theo", pick: 0, personName: "Bass", language: "en"), "Hey Bass, it's Theo. What's up?")

    // French, word for word as voice-call-prompt.ts.
    let french = VoiceCallText.prompt(name: "Theo", title: "", description: "", transcript: [], personName: "Bass", teammates: [], language: "fr")
    XCTAssertTrue(french.hasSuffix("Language:\n- Speak French for the whole call. If they speak another language to you, answer in theirs.\n- Say \"tu\" to them, warm and direct, never stiff, unless they ask for \"vous\" or their messages above say \"vous\".\n- Names stay as they are: Simeon, your name and your teammates' names, and the names of apps (Gmail, Slack, Shop)."))
    XCTAssertEqual(VoiceCallText.firstMessage(name: "Theo", pick: 0, personName: "Bass", language: "fr"), "Salut Bass, c’est Theo. Quoi de neuf\u{202F}?")
    XCTAssertEqual(VoiceCallText.firstMessage(name: "Theo", pick: 0.99, personName: nil, language: "fr"), "Theo à l’appareil. Qu’est-ce que tu as en tête\u{202F}?")
    let greetings = Set([0, 0.2, 0.4, 0.6, 0.8].map { VoiceCallText.firstMessage(name: "Theo", pick: $0, personName: nil, language: "fr") })
    XCTAssertEqual(greetings.count, 5)
    for greeting in greetings { XCTAssertFalse(greeting.contains("!")); XCTAssertFalse(greeting.contains(" ?")) }
    // Spanish, word for word as voice-call-prompt.ts: "tú", and "usted" when asked for.
    XCTAssertEqual(VoiceCallText.language(for: "es-MX"), "es")
    XCTAssertTrue(VoiceCallText.languageRule("es").contains("- Say \"tú\" to them, warm and direct, never stiff, unless they ask for \"usted\" or their messages above say \"usted\"."))
    XCTAssertEqual(VoiceCallText.firstMessage(name: "Theo", pick: 0, personName: "Bass", language: "es"), "Hola Bass, soy Theo. ¿Qué tal?")
    XCTAssertEqual(VoiceCallText.firstMessage(name: "Theo", pick: 0.99, personName: nil, language: "es"), "Theo al habla. ¿Qué tienes en mente?")
    XCTAssertTrue(VoiceCallText.languageRule("pt-BR").contains("- Speak Brazilian Portuguese for the whole call."), "the rule names the app's own language")
    XCTAssertEqual(VoiceCallText.prompt(name: "Theo", title: "", description: "", transcript: [], personName: "Bass", teammates: [], language: "ja"), english, "no Japanese call: English")
    // The later languages (21 October 2026): each its familiar "you", five calm greetings with the name.
    let englishGreetings = Set([0, 0.2, 0.4, 0.6, 0.8].map { VoiceCallText.firstMessage(name: "Theo", pick: $0, personName: "Bass", language: "en") })
    for (tag, code, familiar, formal) in [
      ("de-AT", "de", "du", "Sie"), ("nl", "nl", "je", "u"), ("it", "it", "tu", "Lei"), ("pt-BR", "pt", "você", "o senhor/a senhora"),
      ("sv", "sv", "du", "ni"), ("pl", "pl", "ty", "Pan/Pani"), ("tr", "tr", "sen", "siz"),
    ] {
      XCTAssertEqual(VoiceCallText.language(for: tag), code, tag)
      XCTAssertTrue(VoiceCallText.languageRule(tag).contains("- Say \"\(familiar)\" to them, warm and direct, never stiff, unless they ask for \"\(formal)\""), tag)
      let said = Set([0, 0.2, 0.4, 0.6, 0.8].map { VoiceCallText.firstMessage(name: "Theo", pick: $0, personName: "Bass", language: tag) })
      XCTAssertEqual(said.count, 5, tag)
      for greeting in said {
        XCTAssertTrue(greeting.contains("Theo"), greeting)
        XCTAssertFalse(greeting.contains("!"), greeting)
        XCTAssertFalse(englishGreetings.contains(greeting), "\(tag) is not English: \(greeting)")
      }
    }

    // A call started in French speaks French from its first word.
    AppLanguage.override = "fr"
    let backend = DemoBackend(seed: DemoData.seed(), pace: 0.01, call: nil)
    let voice = FakeVoice()
    let call = LiveCall(backend: backend, transport: voice, personName: { "Bass" }, tones: FakeTones(), quiet: 0.02, pause: { _ in try? await Task.sleep(nanoseconds: 2_000_000) })
    call.start(agentId: "theo", agentName: "Theo", colour: "green")
    try await Task.sleep(nanoseconds: 300_000_000)
    XCTAssertEqual(voice.lock.withLock { voice.language }, "fr")
    let first = try XCTUnwrap(voice.lock.withLock { voice.started?.first })
    XCTAssertTrue(first.contains("Theo") && first.hasSuffix("\u{202F}?"), first)
    XCTAssertTrue(voice.lock.withLock { voice.started?.prompt.contains("Speak French for the whole call.") } == true)
    call.hangUp()
  }
}
