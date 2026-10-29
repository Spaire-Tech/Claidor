import AVFoundation
import PhotosUI
import Speech
import SwiftUI
import UniformTypeIdentifiers
import SimeonCore

/** A file waiting in the composer: sent with the message, uploaded to the agent's computer first (`uploadAttachment`), as the Mac does. */
struct ComposerAttachment: Identifiable, Equatable {
  let id = UUID()
  let name: String
  let data: Data
  let preview: UIImage?
}

/** The waiting file above the composer: its picture or its kind, its name, and a cross to drop it. */
struct AttachmentChip: View {
  let file: ComposerAttachment
  let remove: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      Group {
        if let preview = file.preview {
          Image(uiImage: preview).resizable().scaledToFill()
        } else if let art = FileKind.artwork(file.name), let artwork = UIImage(named: art) {
          Image(uiImage: artwork).resizable().scaledToFit()
        } else {
          Image(systemName: FileKind.symbol(file.name)).foregroundStyle(Ink.blue)
        }
      }
      .frame(width: 28, height: 28)
      .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
      Text(file.name).font(.system(size: 13)).foregroundStyle(Ink.primary).lineLimit(1).truncationMode(.middle)
        .frame(maxWidth: 140)
      Button(action: remove) {
        Image(systemName: "xmark.circle.fill").font(.system(size: 15)).foregroundStyle(Ink.tertiary)
          .frame(width: 30, height: 30)
          .contentShape(.circle)
      }
      .buttonStyle(.tactile)
      .accessibilityLabel("Remove \(file.name)")
    }
    .padding(.leading, 6).padding(.trailing, 2).padding(.vertical, 6)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

/** What the + menu asked for: a photo or video from the library, a photo taken now, any file, or a copied picture. */
enum ComposerPick: Equatable {
  case library, camera, files, paste
}

/**
 * The + menu's items (the founder, 29 October 2026, after Messages' own:
 * "ours rn is in the middle, not good"): Photo or Video, Take Photo (when
 * the phone has a camera) and Choose File, in that order, in a menu that
 * opens from the + itself; Paste Picture under them while the clipboard
 * holds one (asking does not read it, so the phone does not ask about
 * pasting until it is chosen). Until that day + opened a dialog in the
 * middle of the screen.
 */
struct ComposerAttachItems: View {
  let pick: (ComposerPick) -> Void

  var body: some View {
    Button("Photo or Video", systemImage: "photo.on.rectangle") { pick(.library) }
    #if os(iOS)
    if UIImagePickerController.isSourceTypeAvailable(.camera) {
      Button("Take Photo", systemImage: "camera") { pick(.camera) }
    }
    #endif
    Button("Choose File", systemImage: "folder") { pick(.files) }
    #if os(iOS)
    // A copied picture, as the Mac's ⌘V puts one in its composer (mac/Simeon/Composer.swift).
    if UIPasteboard.general.hasImages {
      Button("Paste Picture", systemImage: "doc.on.clipboard") { pick(.paste) }
    }
    #endif
  }
}

/** What the + menu asked for, brought in: photos and videos from the library, a photo taken now, any file, or a copied picture. */
struct ComposerPicker: ViewModifier {
  @Binding var request: ComposerPick?
  let picked: ([ComposerAttachment]) -> Void
  @State private var photos = false
  @State private var files = false
  @State private var camera = false
  @State private var selection: [PhotosPickerItem] = []

  func body(content: Content) -> some View {
    content
      .onChange(of: request) { _, asked in
        guard let asked else { return }
        request = nil
        switch asked {
        case .library: photos = true
        case .camera: camera = true
        case .files: files = true
        case .paste: pastePictures()
        }
      }
      .photosPicker(isPresented: $photos, selection: $selection, maxSelectionCount: 10, matching: .any(of: [.images, .videos]))
      .onChange(of: selection) { _, items in
        guard !items.isEmpty else { return }
        selection = []
        Task {
          var out: [ComposerAttachment] = []
          for (index, item) in items.enumerated() {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let type = item.supportedContentTypes.first
            let ext = type?.preferredFilenameExtension ?? "jpg"
            let image = UIImage(data: data)
            out.append(ComposerAttachment(name: "Photo \(index + 1).\(ext)", data: data, preview: image))
          }
          picked(out)
        }
      }
      .fileImporter(isPresented: $files, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
        guard case .success(let urls) = result else { return }
        var out: [ComposerAttachment] = []
        for url in urls {
          let scoped = url.startAccessingSecurityScopedResource()
          defer { if scoped { url.stopAccessingSecurityScopedResource() } }
          guard let data = try? Data(contentsOf: url) else { continue }
          out.append(ComposerAttachment(name: url.lastPathComponent, data: data, preview: FileKind.images.contains(url.pathExtension.lowercased()) ? UIImage(data: data) : nil))
        }
        picked(out)
      }
      #if os(iOS)
      .fullScreenCover(isPresented: $camera) {
        CameraCapture { image in
          camera = false
          guard let image, let data = image.jpegData(compressionQuality: 0.9) else { return }
          picked([ComposerAttachment(name: "Photo.jpg", data: data, preview: image)])
        }
        .ignoresSafeArea()
      }
      #endif
  }

  /** The clipboard's pictures, as PNG files named as the Mac names a pasted one. */
  private func pastePictures() {
    let images = UIPasteboard.general.images ?? []
    let out = images.enumerated().compactMap { index, image -> ComposerAttachment? in
      guard let data = image.pngData() else { return nil }
      return ComposerAttachment(name: images.count == 1 ? "Pasted image.png" : "Pasted image \(index + 1).png", data: data, preview: image)
    }
    if !out.isEmpty { picked(out) }
  }
}

#if os(iOS)
/** Take Photo: the phone's camera, as Messages opens it; the photo taken comes back, and Cancel brings nothing (nil). */
struct CameraCapture: UIViewControllerRepresentable {
  let done: (UIImage?) -> Void

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let parent: CameraCapture
    init(_ parent: CameraCapture) { self.parent = parent }

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
      parent.done(info[.originalImage] as? UIImage)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
      parent.done(nil)
    }
  }
}
#endif

extension View {
  func composerPicker(request: Binding<ComposerPick?>, picked: @escaping ([ComposerAttachment]) -> Void) -> some View {
    modifier(ComposerPicker(request: request, picked: picked))
  }
}

/**
 * The composer's mic: the phone's own speech recognition, on the device
 * where it can, writing into the message as you speak, after what was
 * already typed (`DictatedText`: a pause or Stop never takes words away);
 * ✓ stops and keeps them, Cancel goes back to what was typed. The voice's
 * level, for the bars that move while it listens (`DictationBar`).
 */
@MainActor
@Observable
final class Dictation {
  private(set) var isListening = false
  var problem: String?
  /** The last levels heard, 0 to 1, oldest first: the bars. */
  private(set) var levels = Array(repeating: Float(0), count: Dictation.kept)
  /** When it started listening: the time beside the bars. */
  private(set) var startedAt: Date?
  /** What the field held when it started: Cancel puts it back. */
  var before: String { text.before }
  @ObservationIgnored private var text = DictatedText()
  @ObservationIgnored private var engine: AVAudioEngine?
  @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
  @ObservationIgnored private var task: SFSpeechRecognitionTask?
  /** Each listening's number: what arrives for an earlier one, after `cancel`, writes nothing. */
  @ObservationIgnored private var listening = 0

  static let kept = 80

  /** Listens, writing what is heard after `before` (the field's words). */
  func start(after before: String, _ write: @escaping (String) -> Void) {
    guard !isListening else { return }
    problem = nil
    text = DictatedText(before: before)
    Task {
      let speech = await withCheckedContinuation { continuation in SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) } }
      guard speech == .authorized else { problem = String(localized: "Simeon can't use speech recognition. Allow it in Settings."); return }
      guard await AVAudioApplication.requestRecordPermission() else { problem = String(localized: "Simeon can't use the microphone. Allow it in Settings."); return }
      guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else { problem = String(localized: "Dictation isn't available right now."); return }
      do { try begin(recognizer, write) } catch { problem = String(localized: "Dictation didn't start: \(error.localizedDescription)"); stop() }
    }
  }

  struct NoMicrophone: LocalizedError {
    var errorDescription: String? { String(localized: "no microphone is available") }
  }

  private func begin(_ recognizer: SFSpeechRecognizer, _ write: @escaping (String) -> Void) throws {
    Trace.mark("starting dictation")
    #if os(iOS)
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: .duckOthers)
    try session.setActive(true, options: .notifyOthersOnDeactivation)
    #endif
    let engine = AVAudioEngine()
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    let input = engine.inputNode
    // With no microphone input the format is empty, and installing a tap on it would end the app.
    let format = input.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else { throw NoMicrophone() }
    listening += 1
    let mine = listening
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      request.append(buffer)
      let level = Dictation.level(buffer)
      Task { @MainActor in
        guard let self, self.listening == mine, self.isListening else { return }
        self.levels.removeFirst()
        self.levels.append(level)
      }
    }
    engine.prepare()
    try engine.start()
    self.engine = engine
    self.request = request
    levels = Array(repeating: 0, count: Self.kept)
    startedAt = Date()
    isListening = true
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      let heard = result?.bestTranscription.formattedString
      // A stretch ends at a pause: the result is final, or carries the metadata a stretch ends with.
      let ended = result.map { $0.isFinal || $0.speechRecognitionMetadata != nil } ?? false
      let final = result?.isFinal ?? false
      Task { @MainActor in
        guard let self, self.listening == mine else { return }
        if let heard {
          self.text.heard(heard, ended: ended)
          write(self.text.draft)
        }
        if error != nil || final { self.stop() }
      }
    }
  }

  /** A buffer's loudness, 0 (silence, below -50 dB) to 1. */
  nonisolated static func level(_ buffer: AVAudioPCMBuffer) -> Float {
    guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
    let count = Int(buffer.frameLength)
    var sum: Float = 0
    for index in 0..<count { sum += samples[index] * samples[index] }
    let decibels = 20 * log10(max((sum / Float(count)).squareRoot(), 0.000_01))
    return max(0, min(1, (decibels + 50) / 50))
  }

  /** Stopped, and what is still on its way dropped: the message it was writing was sent. (Stop keeps the last words, which come after it.) */
  func cancel() {
    listening += 1
    stop()
  }

  func stop() {
    guard isListening || engine != nil else { return }
    engine?.stop()
    engine?.inputNode.removeTap(onBus: 0)
    request?.endAudio()
    task?.finish()
    engine = nil; request = nil; task = nil
    isListening = false
    startedAt = nil
    #if os(iOS)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    #endif
  }
}

/**
 * Dictation as it listens, under the words in the field (the founder, 25
 * October 2026: "it feels too bland"): the voice's level as bars in our
 * blue, the newest at the right, the time since it started, and ✓ in our
 * blue, which stops and keeps the words.
 */
struct DictationBar: View {
  let dictation: Dictation
  let done: () -> Void

  var body: some View {
    HStack(spacing: 10) {
      DictationLevels(levels: dictation.levels)
        .frame(height: 24)
        .accessibilityHidden(true)
      TimelineView(.periodic(from: .now, by: 1)) { context in
        Text(Chat.callClock(Int(context.date.timeIntervalSince(dictation.startedAt ?? context.date))))
          .font(.system(size: 15, weight: .medium))
          .monospacedDigit()
          .foregroundStyle(Ink.secondary)
      }
      Button(action: done) {
        Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
          .frame(width: 30, height: 30).background(Ink.bubbleMine, in: Circle())
          .frame(width: 36, height: 36).contentShape(.circle)
      }
      .buttonStyle(.tactile)
      .accessibilityLabel("Stop dictation")
    }
  }
}

/** The bars: 3 points wide and 3 apart, a dot in silence, up to the bar's height at full voice; the newest at the right. */
private struct DictationLevels: View {
  let levels: [Float]

  var body: some View {
    Canvas { context, size in
      let step: CGFloat = 6
      let shown = levels.suffix(max(0, Int((size.width + 3) / step)))
      var x = size.width - CGFloat(shown.count) * step + 3
      for level in shown {
        let height = max(3, CGFloat(level) * size.height)
        let bar = CGRect(x: x, y: (size.height - height) / 2, width: 3, height: height)
        context.fill(Path(roundedRect: bar, cornerRadius: 1.5), with: .color(Ink.bubbleMine))
        x += step
      }
    }
  }
}
