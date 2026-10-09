import AVFoundation
import Combine
import ElevenLabs
import SimeonCore

/**
 * The call's voice on the iPhone: ElevenLabs' own kit (elevenlabs-swift-sdk,
 * WebRTC), started with the token Simeon Labs' server hands out and the
 * call's overrides (the agent's prompt, its greeting, English, its voice),
 * as the Mac's banner starts the same conversation with the web kit. The
 * kit's client tools (`send_task`, `recall_text_messages`) and its
 * transcript come back as `VoiceEvent`s; `LiveCall` (SimeonCore) does the
 * rest.
 */
final class ElevenLabsVoice: VoiceTransport, @unchecked Sendable {
  @MainActor private var conversation: Conversation?
  @MainActor private var watching: Set<AnyCancellable> = []

  struct MicrophoneRefused: LocalizedError {
    var errorDescription: String? { "Simeon can't use the microphone." }
  }

  func start(token: String, prompt: String, firstMessage: String, voiceId: String?, language: String, events: @escaping @Sendable (VoiceEvent) -> Void) async throws {
    guard await AVAudioApplication.requestRecordPermission() else { throw MicrophoneRefused() }
    let config = ConversationConfig(
      agentOverrides: AgentOverrides(prompt: prompt, firstMessage: firstMessage, language: Language(rawValue: language) ?? .english),
      ttsOverrides: voiceId.map { TTSOverrides(voiceId: $0) },
      onError: { error in events(.failed(error.localizedDescription)) },
      onConversationMetadata: { metadata in events(.connected(conversationId: metadata.conversationId)) },
      onVadScore: { score in events(.activity(score)) },
      onUnhandledClientToolCall: { call in
        let parameters = (try? JSON.parse(call.parametersData)) ?? [:]
        events(.tool(name: call.toolName, id: call.toolCallId, parameters: parameters))
      },
      // The kit reports the agent speaking only when told how to read it from the voice activity.
      agentStateConfiguration: .default,
      onAgentStateChange: { state in events(.agentSpeaking(state == .speaking)) }
    )
    let started = try await ElevenLabs.startConversation(
      conversationToken: token,
      config: config,
      onAgentReady: { events(.connected(conversationId: nil)) },
      onDisconnect: { _ in events(.ended) }
    )
    await hold(started, events: events)
  }

  @MainActor private func hold(_ started: Conversation, events: @escaping @Sendable (VoiceEvent) -> Void) {
    conversation = started
    watching = []
    started.$messages
      .receive(on: DispatchQueue.main)
      .sink { messages in
        events(.transcript(messages.map { CallLine(fromPerson: $0.role == .user, text: $0.content) }))
      }
      .store(in: &watching)
  }

  func setMuted(_ muted: Bool) async { await mainSetMuted(muted) }
  func say(context: String, nudge: String) async { await mainSay(context, nudge) }
  func toolResult(id: String, result: String) async { await mainToolResult(id, result) }
  func end() async { await mainEnd() }

  @MainActor private func mainSetMuted(_ muted: Bool) async { try? await conversation?.setMuted(muted) }

  @MainActor private func mainSay(_ context: String, _ nudge: String) async {
    try? await conversation?.updateContext(context)
    try? await conversation?.sendMessage(nudge)
  }

  @MainActor private func mainToolResult(_ id: String, _ result: String) async {
    try? await conversation?.sendToolResult(for: id, result: result)
  }

  @MainActor private func mainEnd() async {
    await conversation?.endConversation()
    conversation = nil
    watching = []
  }
}

/**
 * The call's ring and hang-up on the phone (the founder, 9 October 2026: "i
 * want sounds for when it rings, and when it hangs up like in the mac"): the
 * Mac banner's tones (SimeonCore `CallTones`), played from memory. They play
 * through the speaker whatever the silent switch says, as a call's sounds
 * do; the ring is over before the call's own audio starts.
 */
final class CallTonePlayer: CallTonePlaying, @unchecked Sendable {
  private let lock = NSLock()
  private var ringer: AVAudioPlayer?
  private var ender: AVAudioPlayer?

  #if os(macOS)
  /** The Mac banner's own loudness: a Mac's speakers are louder than a phone's. */
  private static let ringPeak = CallTones.macRingPeak
  private static let hangUpPeak = CallTones.macHangUpPeak
  #else
  private static let ringPeak = CallTones.ringPeak
  private static let hangUpPeak = CallTones.hangUpPeak
  #endif

  func ring(cycles: Int) async {
    let player = Self.player(CallTones.wav(CallTones.ringSamples(cycles: cycles, peak: Self.ringPeak)))
    lock.withLock { ringer?.stop(); ringer = player }
    player?.play()
    try? await Task.sleep(nanoseconds: UInt64(Double(cycles) * CallTones.ringCycleSeconds * 1_000_000_000))
  }

  func stopRinging() {
    let player: AVAudioPlayer? = lock.withLock { let current = ringer; ringer = nil; return current }
    player?.stop()
  }

  func hangUp() {
    let player = Self.player(CallTones.wav(CallTones.hangUpSamples(peak: Self.hangUpPeak)))
    lock.withLock { ender = player }
    player?.play()
  }

  private static func player(_ wav: Data) -> AVAudioPlayer? {
    #if os(iOS)
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default)
    try? session.setActive(true)
    #endif
    let player = try? AVAudioPlayer(data: wav, fileTypeHint: AVFileType.wav.rawValue)
    player?.prepareToPlay()
    return player
  }
}

#if os(macOS)
/**
 * The Mac's `voice-call.log` (`createVoiceCallLog`): a line per step of a
 * call, its time first, appended in the app's folder
 * (`~/Library/Application Support/Simeon`) and echoed to stderr as
 * `[simeon] voice-call`.
 */
final class VoiceCallLog: @unchecked Sendable {
  static let shared = VoiceCallLog()

  private let lock = NSLock()
  private let file: URL
  private let stamp: ISO8601DateFormatter

  private init() {
    let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!.appendingPathComponent("Simeon", isDirectory: true)
    file = folder.appendingPathComponent("voice-call.log")
    stamp = ISO8601DateFormatter()
    stamp.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  }

  func write(_ line: String) {
    let text = line.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    lock.withLock {
      let stamped = Data("\(stamp.string(from: Date())) \(text)\n".utf8)
      try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      if let handle = try? FileHandle(forWritingTo: file) {
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: stamped)
        try? handle.close()
      } else {
        try? stamped.write(to: file)
      }
    }
    FileHandle.standardError.write(Data("[simeon] voice-call \(line)\n".utf8))
  }
}
#endif

/** The person's name for the call's prompt, read by the call off the main thread. */
final class PersonNameBox: @unchecked Sendable {
  private let lock = NSLock()
  private var name: String?
  var value: String? {
    get { lock.withLock { name } }
    set { lock.withLock { name = newValue } }
  }
}
