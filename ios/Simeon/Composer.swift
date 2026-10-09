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
      .buttonStyle(.plain)
      .accessibilityLabel("Remove \(file.name)")
    }
    .padding(.leading, 6).padding(.trailing, 2).padding(.vertical, 6)
    .background(Ink.bubbleTheirs, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

/** The + : a photo from the library, or any file, into the composer. */
struct ComposerPicker: ViewModifier {
  @Binding var isPresented: Bool
  let picked: ([ComposerAttachment]) -> Void
  @State private var photos = false
  @State private var files = false
  @State private var selection: [PhotosPickerItem] = []

  func body(content: Content) -> some View {
    content
      #if os(iOS)
      .confirmationDialog("Attach", isPresented: $isPresented) {
        Button("Photo Library") { photos = true }
        Button("Files") { files = true }
      }
      #else
      // On the Mac + opens the file chooser at once, as the Mac's window does (its sidebar reaches Photos too).
      .onChange(of: isPresented) { _, asked in
        guard asked else { return }
        isPresented = false
        files = true
      }
      #endif
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
  }
}

extension View {
  func composerPicker(isPresented: Binding<Bool>, picked: @escaping ([ComposerAttachment]) -> Void) -> some View {
    modifier(ComposerPicker(isPresented: isPresented, picked: picked))
  }
}

/**
 * The composer's mic: the phone's own speech recognition, on the device
 * where it can, writing into the message as you speak; tap again to stop.
 */
@MainActor
@Observable
final class Dictation {
  private(set) var isListening = false
  var problem: String?
  @ObservationIgnored private var engine: AVAudioEngine?
  @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
  @ObservationIgnored private var task: SFSpeechRecognitionTask?

  func start(_ write: @escaping (String) -> Void) {
    guard !isListening else { return }
    problem = nil
    Task {
      let speech = await withCheckedContinuation { continuation in SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) } }
      guard speech == .authorized else { problem = "Simeon can't use speech recognition. Allow it in Settings."; return }
      guard await AVAudioApplication.requestRecordPermission() else { problem = "Simeon can't use the microphone. Allow it in Settings."; return }
      guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else { problem = "Dictation isn't available right now."; return }
      do { try begin(recognizer, write) } catch { problem = "Dictation didn't start: \(error.localizedDescription)"; stop() }
    }
  }

  struct NoMicrophone: LocalizedError {
    var errorDescription: String? { "no microphone is available" }
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
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
    engine.prepare()
    try engine.start()
    self.engine = engine
    self.request = request
    isListening = true
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      let text = result?.bestTranscription.formattedString
      let final = result?.isFinal ?? false
      Task { @MainActor in
        if let text { write(text) }
        if error != nil || final { self?.stop() }
      }
    }
  }

  func stop() {
    guard isListening || engine != nil else { return }
    engine?.stop()
    engine?.inputNode.removeTap(onBus: 0)
    request?.endAudio()
    task?.finish()
    engine = nil; request = nil; task = nil
    isListening = false
    #if os(iOS)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    #endif
  }
}
