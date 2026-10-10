import AVFoundation
import AppKit
import SwiftUI
import SimeonCore

/**
 * Dictation (the window's `k9n`, `v9n`): the microphone, asked for once,
 * records (AAC, sent as `audio/mp4`); Stop sends the recording to Simeon's
 * transcription (`audio/transcriptions`) and what was said goes in at the
 * caret, a space before it when the word before runs on. Under half a
 * second is dropped; five minutes stops it. A refusal, a missing
 * microphone or a failed transcription says so over the words in red, in
 * the window's words, until the microphone is tried again.
 */
@MainActor
@Observable
final class Dictation {
  enum Phase: Equatable { case idle, asking, recording, transcribing }

  var phase: Phase = .idle
  /** The red line over the words (`sand-prompt-voice-error`). */
  var error: String?
  /** Seconds recorded, for the chip's timer. */
  var seconds = 0
  /** The chip's five sound bars, 0 to 1, newest last. */
  var levels: [Double] = Array(repeating: 0, count: 5)
  /** What was said, for the field. */
  @ObservationIgnored var onWords: ((String) -> Void)?

  @ObservationIgnored private var recorder: AVAudioRecorder?
  @ObservationIgnored private var file: URL?
  @ObservationIgnored private var started: Date?
  @ObservationIgnored private var ticker: Task<Void, Never>?
  /** Each start, stop and cancel; an answer for an older one is dropped. */
  @ObservationIgnored private var attempt = 0

  /** The window's limits (`h9n`, `p9n`). */
  static let longest: TimeInterval = 300
  static let shortest: TimeInterval = 0.5

  static let denied = "Microphone access denied. Please enable microphone permissions in your system settings."
  static let noMicrophone = "No microphone found. Please connect a microphone and try again."
  static let network = "Network connection failed. Please check your internet connection."
  static let failed = "An error occurred with voice input. Please try again."

  var isListening: Bool { phase == .asking || phase == .recording }

  /** Start voice input: the microphone is asked for (the first time), then recording starts. */
  func start(store: AppStore) {
    guard phase == .idle else { return }
    error = nil
    attempt += 1
    let current = attempt
    phase = .asking
    Task {
      let allowed = await Dictation.permission()
      guard current == attempt, phase == .asking else { return }
      guard allowed else { fail(Dictation.denied); return }
      guard AVCaptureDevice.default(for: .audio) != nil else { fail(Dictation.noMicrophone); return }
      record(store: store)
    }
  }

  static func permission() async -> Bool {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized: return true
    case .notDetermined: return await AVCaptureDevice.requestAccess(for: .audio)
    default: return false
    }
  }

  private func record(store: AppStore) {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("simeon-dictation-\(UUID().uuidString).m4a")
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: 44_100,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
    ]
    guard let recorder = try? AVAudioRecorder(url: url, settings: settings) else { fail(Dictation.failed); return }
    recorder.isMeteringEnabled = true
    guard recorder.record() else { fail(Dictation.noMicrophone); return }
    self.recorder = recorder
    file = url
    started = Date()
    seconds = 0
    phase = .recording
    let current = attempt
    ticker = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(60))
        guard let self, current == self.attempt, self.phase == .recording, let recorder = self.recorder, let started = self.started else { return }
        recorder.updateMeters()
        // The level in decibels, -50 and below silent, 0 full.
        let level = max(0, min(1, (Double(recorder.averagePower(forChannel: 0)) + 50) / 50))
        self.levels = Array(self.levels.dropFirst()) + [level]
        let elapsed = Date().timeIntervalSince(started)
        if Int(elapsed) != self.seconds { self.seconds = Int(elapsed) }
        if elapsed >= Dictation.longest {
          await self.stop(store: store)
          return
        }
      }
    }
  }

  /** Stop dictation: the recording goes to be transcribed; what was said goes to the field. */
  func stop(store: AppStore) async {
    if phase == .asking {
      attempt += 1
      phase = .idle
      return
    }
    guard phase == .recording, let recorder, let started else { return }
    ticker?.cancel()
    ticker = nil
    recorder.stop()
    self.recorder = nil
    let length = Date().timeIntervalSince(started)
    guard length >= Dictation.shortest, let file, let data = try? Data(contentsOf: file), !data.isEmpty else {
      cleanUp()
      phase = .idle
      return
    }
    phase = .transcribing
    let current = attempt
    do {
      let words = try await store.transcribe(data, mimeType: "audio/mp4")
      guard current == attempt, phase == .transcribing else { return }
      cleanUp()
      phase = .idle
      if !words.isEmpty { onWords?(words) }
    } catch {
      guard current == attempt else { return }
      cleanUp()
      phase = .idle
      self.error = Dictation.message(for: error)
    }
  }

  /** Escape, or the chat closing: nothing is sent. */
  func cancel() {
    attempt += 1
    ticker?.cancel()
    ticker = nil
    recorder?.stop()
    recorder = nil
    cleanUp()
    phase = .idle
  }

  private func fail(_ message: String) {
    cleanUp()
    phase = .idle
    error = message
  }

  private func cleanUp() {
    if let file { try? FileManager.default.removeItem(at: file) }
    file = nil
    started = nil
    levels = Array(repeating: 0, count: 5)
  }

  /** The window's line for a failed transcription (`ATe`): the network's, or any other. */
  static func message(for error: Error) -> String {
    if let url = error as? URLError {
      switch url.code {
      case .notConnectedToInternet, .timedOut, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
        return network
      default:
        break
      }
    }
    return failed
  }
}

/**
 * The recording chip in place of Send (`sand-recording-chip`): 28 high,
 * padded 4 10, round, on the grey wash (darker under the pointer), 6
 * apart: Stop (a 10-point square, 2 round, in the text colour), the time
 * (14 on 22, tabular, "0:07"), and five sound bars (2 wide, 2 apart, 18 by
 * 13, at 60%). It stops dictation; Escape in the field cancels it.
 */
struct RecordingChip: View {
  let seconds: Int
  let levels: [Double]
  let look: Look
  let stop: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: stop) {
      HStack(spacing: 6) {
        RoundedRectangle(cornerRadius: 2)
          .fill(look.ink)
          .frame(width: 10, height: 10)
        Text(verbatim: "\(seconds / 60):" + String(format: "%02d", seconds % 60))
          .font(.system(size: 14))
          .monospacedDigit()
          .tracking(-0.15)
          .foregroundStyle(look.ink)
        HStack(spacing: 2) {
          ForEach(Array(levels.enumerated()), id: \.offset) { _, level in
            Capsule()
              .fill(look.inkSecondary)
              .frame(width: 2, height: max(3, 13 * level))
          }
        }
        .frame(width: 18, height: 13)
      }
      .padding(.vertical, 4)
      .padding(.horizontal, 10)
      .frame(height: 28)
      .background(Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255).opacity(hovered ? (look.dark ? 0.32 : 0.17) : (look.dark ? 0.173 : 0.09)), in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .focusable(false)
    .onHover { hovered = $0 }
    .help("Stop dictation")
    .accessibilityLabel("Stop dictation")
  }
}

extension FieldHandle {
  /** What was said, at the caret, a space before it when the word before runs on (`d9n`); the field takes the keys. */
  func insertDictation(_ words: String) {
    guard let view else { return }
    let string = view.string as NSString
    let range = view.selectedRange()
    var text = words
    if range.location > 0, range.location <= string.length {
      let before = string.substring(with: NSRange(location: range.location - 1, length: 1))
      if before.rangeOfCharacter(from: .whitespacesAndNewlines) == nil, words.first?.isWhitespace == false { text = " " + words }
    }
    view.insertText(NSAttributedString(string: text, attributes: MessageField.attributes(ink)), replacementRange: range)
    view.window?.makeFirstResponder(view)
  }
}
