import AppKit
import AVFoundation
import SwiftUI
import UniformTypeIdentifiers
import SimeonCore

/**
 * The avatar editor (`c3n`, reference I04): what the pencil on the pane's
 * avatar opens. Its state lives here so the window's keys can reach it
 * (Escape closes it; ⌘V pastes a picture into Upload). Closing it during
 * Generate still saves the picture when it arrives, cropped in its middle.
 */
@MainActor
@Observable
final class AvatarEditorModel {
  enum Tab: Equatable { case agent, generate, upload }

  /** A picture being cropped: drawn down to 1024 at most, its crop, and the line under the stage for a file or a paste. */
  struct Candidate {
    let image: CGImage
    var crop: AvatarCrop
    let fileLine: String?
  }

  let agentId: String
  let isGroup: Bool
  var tab: Tab
  var prompt = ""
  var candidate: Candidate?
  var generating = false
  var saving = false
  var committing = false
  var error: String?
  /** A colour picked for an agent with a picture: shown on the big avatar until Set avatar or Cancel. */
  var staged: String?
  var dragOver = false
  /** Bumped by every tab switch and Restart: a picture generated before it is thrown away. */
  private var generation = 0
  /** Closed while generating: the picture is saved when it arrives. */
  private(set) var closed = false

  init(agentId: String, isGroup: Bool) {
    self.agentId = agentId
    self.isGroup = isGroup
    tab = isGroup ? .upload : .agent
  }

  /** A tab (`X`): the picture, staged colours, the generating and the error go; the prompt stays. */
  func choose(_ next: Tab) {
    guard next != tab else { return }
    tab = next
    generation += 1
    candidate = nil
    staged = nil
    generating = false
    error = nil
  }

  func closeNow() {
    closed = true
    staged = nil
  }

  // MARK: Colours

  /** A swatch: saved at once (`commitCharacter`); for an agent with a picture, only shown until Set avatar. */
  func pick(_ colour: String, store: AppStore) {
    let hasPicture = store.agent(agentId)?.avatarDataURL?.isEmpty == false
    if hasPicture {
      staged = colour
      return
    }
    guard !committing else { return }
    committing = true
    error = nil
    Task {
      do { try await store.setCharacter(agentId, colour: colour) } catch { self.error = AvatarEditorModel.words(error) }
      committing = false
    }
  }

  /** Set avatar for a staged colour: the colour saved, then the picture taken away, then the editor closes. */
  func setStaged(store: AppStore, close: @escaping () -> Void) {
    guard let staged, !saving else { return }
    saving = true
    error = nil
    Task {
      do {
        try await store.setCharacter(agentId, colour: staged)
        try await store.setAvatarImage(agentId, png: nil)
        saving = false
        close()
      } catch {
        self.error = AvatarEditorModel.words(error)
        saving = false
      }
    }
  }

  /** Reset: the picture taken away ("Reset to the Agent"), else the stored colour ("Reset character to default"). */
  func reset(store: AppStore) {
    error = nil
    staged = nil
    let hasPicture = store.agent(agentId)?.avatarDataURL?.isEmpty == false
    if hasPicture {
      saving = true
      Task {
        do { try await store.setAvatarImage(agentId, png: nil) } catch { self.error = AvatarEditorModel.words(error) }
        saving = false
      }
    } else {
      committing = true
      Task {
        do { try await store.setCharacter(agentId, colour: "") } catch { self.error = AvatarEditorModel.words(error) }
        committing = false
      }
    }
  }

  // MARK: Pictures

  /** A file from Browse files or a drop: read, checked, drawn down, cropped in its middle. */
  func take(file url: URL, fromDrop: Bool) {
    error = nil
    let bytes = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    if fromDrop, let problem = AvatarCrop.sizeProblem(bytes: bytes) {
      error = problem
      return
    }
    guard let data = try? Data(contentsOf: url) else {
      error = AvatarEditorWords.unreadable
      return
    }
    guard let image = NSImage(data: data) else {
      error = fromDrop ? AvatarEditorWords.unloadable : AvatarEditorWords.notAnImage
      return
    }
    take(image: image, name: url.lastPathComponent)
  }

  /** ⌘V in the editor (`u3n`): the clipboard's first picture into Upload; with none, Upload all the same. */
  func paste() {
    if tab != .upload { choose(.upload) }
    let board = NSPasteboard.general
    if let url = (board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL])?.first,
       let image = NSImage(contentsOf: url) {
      take(image: image, name: url.lastPathComponent)
    } else if let image = NSImage(pasteboard: board) {
      take(image: image, name: AvatarEditorWords.pastedName)
    }
  }

  private func take(image: NSImage, name: String?) {
    guard let fitted = AvatarEditorModel.fitted(image) else {
      error = AvatarEditorWords.unloadable
      return
    }
    let line = name.map { "\($0) · \(fitted.width)×\(fitted.height)" }
    candidate = Candidate(image: fitted, crop: AvatarCrop(width: Double(fitted.width), height: Double(fitted.height)), fileLine: line)
  }

  /** Generate (`l3n`): the picture asked for; closed meanwhile, saved at once in its middle; another tab meanwhile, thrown away. */
  func generate(store: AppStore) {
    let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !generating else { return }
    generating = true
    error = nil
    let ticket = generation
    Task {
      do {
        let bytes = try await store.generateAvatarImage(text)
        guard ticket == generation else { return }
        generating = false
        guard let image = NSImage(data: bytes), let fitted = AvatarEditorModel.fitted(image) else {
          error = "Image generation returned no picture."
          return
        }
        let candidate = Candidate(image: fitted, crop: AvatarCrop(width: Double(fitted.width), height: Double(fitted.height)), fileLine: nil)
        if closed {
          if let png = AvatarEditorModel.export(candidate) { try? await store.setAvatarImage(agentId, png: png) }
        } else {
          self.candidate = candidate
        }
      } catch {
        guard ticket == generation else { return }
        generating = false
        self.error = AvatarEditorModel.words(error)
      }
    }
  }

  /** Restart: back to the drop zone or the prompt (its words kept). */
  func restart() {
    generation += 1
    candidate = nil
    error = nil
  }

  /** Set avatar: the crop as a 256-pixel PNG (`jUe`), saved, then the editor closes. */
  func setPicture(store: AppStore, close: @escaping () -> Void) {
    guard let candidate, !saving else { return }
    guard let png = AvatarEditorModel.export(candidate) else {
      error = AvatarEditorWords.exportFailed
      return
    }
    saving = true
    error = nil
    Task {
      do {
        try await store.setAvatarImage(agentId, png: png)
        saving = false
        close()
      } catch {
        self.error = AvatarEditorModel.words(error)
        saving = false
      }
    }
  }

  // MARK: Drawing

  /** The picture drawn down to 1024 on its longest side (`Amt`, `BUe`). */
  static func fitted(_ image: NSImage) -> CGImage? {
    var proposed = CGRect(origin: .zero, size: image.size)
    guard let source = image.cgImage(forProposedRect: &proposed, context: nil, hints: nil) else { return nil }
    let size = AvatarCrop.fitted(width: Double(source.width), height: Double(source.height))
    guard size.width != source.width || size.height != source.height else { return source }
    guard let context = CGContext(data: nil, width: size.width, height: size.height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.interpolationQuality = .high
    context.draw(source, in: CGRect(x: 0, y: 0, width: size.width, height: size.height))
    return context.makeImage()
  }

  /** The crop as a 256 × 256 PNG (`nR`). */
  static func export(_ candidate: Candidate) -> Data? {
    let side = AvatarCrop.output
    let rect = candidate.crop.rect
    guard let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.interpolationQuality = .high
    let k = Double(side) / rect.width
    let w = Double(candidate.image.width), h = Double(candidate.image.height)
    // Core Graphics counts up from the bottom: the crop's top-left (x, y) from the top.
    context.draw(candidate.image, in: CGRect(x: -rect.x * k, y: -(h - rect.y - rect.height) * k, width: w * k, height: h * k))
    guard let made = context.makeImage() else { return nil }
    return NSBitmapImageRep(cgImage: made).representation(using: .png, properties: [:])
  }

  /** The host's words, without Electron's "Error invoking remote method" (`h$n`). */
  static func words(_ error: Error) -> String {
    (error as? GatewayError)?.message ?? error.localizedDescription
  }
}

// MARK: - The popover

/**
 * The editor (`c3n`): 294 wide (the page's width when narrower), 6 under
 * the avatar and centred on it, over the page; round 16, the raised ground,
 * a hairline edge and a soft shadow; no arrow. Its head: the tabs (Agent,
 * Generate, Upload; a group has no Agent) and Reset; its body padded 12,
 * 240 high at the least, the error under it. A click outside it, or
 * Escape, closes it.
 */
struct AvatarEditorPopover: View {
  let agent: Agent
  let model: AvatarEditorModel
  let width: CGFloat
  let look: Look
  let close: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
    VStack(spacing: 0) {
      header
      Rectangle().fill(look.ink.opacity(0.10)).frame(height: 0.5)
      VStack(spacing: 12) {
        switch model.tab {
        case .agent: AgentTab(agent: agent, model: model, look: look, close: close)
        case .generate: GenerateTab(model: model, look: look, close: close)
        case .upload: UploadTab(model: model, look: look, close: close)
        }
        if let error = model.error {
          Text(error)
            .font(.system(size: 12))
            .lineSpacing(LineBox.extra(size: 12, lineHeight: 16))
            .foregroundStyle(look.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .padding(12)
      .frame(minHeight: 240, alignment: .top)
    }
    .frame(width: width)
    .background(shape.fill(look.elevated))
    .overlay(shape.strokeBorder(look.ink.opacity(0.10), lineWidth: 0.5))
    .clipShape(shape)
    .shadow(color: Color(red: 20 / 255, green: 20 / 255, blue: 20 / 255).opacity(0.09), radius: 12, x: 0, y: 8)
    .shadow(color: Color(red: 20 / 255, green: 20 / 255, blue: 20 / 255).opacity(0.09), radius: 1.5, x: 0, y: 1)
  }

  /** The tabs (26 high, round 8, 13/18; the chosen one on the grey) and Reset (22 high) at the right, 8 apart, padded 8. */
  private var header: some View {
    let hasPicture = agent.avatarDataURL?.isEmpty == false
    let reset: String? = hasPicture ? "Reset to the Agent" : (model.tab == .agent && agent.colour != nil ? "Reset character to default" : nil)
    return HStack(spacing: 8) {
      HStack(spacing: 2) {
        if !agent.isGroup { EditorTabButton(title: "Agent", chosen: model.tab == .agent, look: look) { model.choose(.agent) } }
        EditorTabButton(title: "Generate", chosen: model.tab == .generate, look: look) { model.choose(.generate) }
        EditorTabButton(title: "Upload", chosen: model.tab == .upload, look: look) { model.choose(.upload) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let reset {
        EditorResetButton(look: look) { model.reset(store: store) }
          .disabled(hasPicture ? model.saving : model.committing)
          .accessibilityLabel(reset)
      }
    }
    .padding(8)
  }
}

private struct EditorTabButton: View {
  let title: String
  let chosen: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13))
        .foregroundStyle(chosen ? look.ink : look.inkSecondary)
        .padding(.horizontal, 8)
        .frame(height: 26)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(chosen || hovering ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityAddTraits(chosen ? [.isSelected] : [])
  }
}

/** Reset (ghost, 22 high, round 8): the grey words, darker on the grey under the pointer. */
private struct EditorResetButton: View {
  let look: Look
  let action: () -> Void
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text("Reset")
        .font(.system(size: 13))
        .foregroundStyle(hovering ? look.ink : look.inkSecondary)
        .padding(.horizontal, 8)
        .frame(height: 22)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(hovering ? look.rowHover.opacity(0.86) : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .opacity(enabled ? 1 : 0.56)
    .onHover { inside in withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.14)) { hovering = inside } }
  }
}

/** The popover's full-width buttons (30 high, round 10): the dark one (Set avatar, Generate) and the grey one (Cancel, Restart, Browse files). */
private struct EditorButton: View {
  let title: String
  let primary: Bool
  let look: Look
  var fullWidth = true
  let action: () -> Void
  @Environment(\.isEnabled) private var enabled
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: 13))
        .foregroundStyle(primary ? look.ground : look.ink)
        .padding(.horizontal, 13)
        .frame(maxWidth: fullWidth ? .infinity : nil)
        .frame(height: 30)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(fill))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .opacity(enabled ? 1 : 0.56)
    .onHover { hovering = $0 }
  }

  private var fill: Color {
    if primary { return hovering && enabled ? look.inkSecondary : look.ink }
    let grey = Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255)
    return hovering && enabled ? grey.opacity(look.dark ? 0.32 : 0.17) : look.rowHover.opacity(0.82)
  }
}

// MARK: - Agent

/**
 * Agent: the twelve colours, six a row (32-point cells, the 24-point swatch
 * in each, 8 apart), the chosen one ringed; then Voice. For an agent with a
 * picture a colour is only shown on the avatar until Set avatar, beside
 * Cancel.
 */
private struct AgentTab: View {
  let agent: Agent
  let model: AvatarEditorModel
  let look: Look
  let close: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    let hasPicture = agent.avatarDataURL?.isEmpty == false
    let current = hasPicture ? model.staged : (agent.colour.flatMap { id in AgentPalette.all.contains { $0.id == id } ? id : nil } ?? AgentPalette.defaultColour(forAgentId: agent.id))
    VStack(spacing: 12) {
      ColourGrid(chosen: current, look: look) { model.pick($0, store: store) }
      VoicePicker(agent: agent, look: look)
        .padding(.top, 6)
      if hasPicture {
        HStack(spacing: 8) {
          EditorButton(title: "Cancel", primary: false, look: look, action: close)
            .disabled(model.saving)
          EditorButton(title: model.saving ? "Saving…" : "Set avatar", primary: true, look: look) {
            model.setStaged(store: store, close: close)
          }
          .disabled(model.staged == nil || model.saving)
        }
      }
    }
  }
}

private struct ColourGrid: View {
  let chosen: String?
  let look: Look
  let pick: (String) -> Void

  var body: some View {
    let rows = stride(from: 0, to: AgentPalette.all.count, by: 6).map { Array(AgentPalette.all[$0..<min($0 + 6, AgentPalette.all.count)]) }
    VStack(spacing: 8) {
      ForEach(rows.indices, id: \.self) { row in
        HStack(spacing: 8) {
          ForEach(rows[row], id: \.id) { palette in
            ColourCell(palette: palette, chosen: palette.id == chosen, look: look) { pick(palette.id) }
          }
        }
      }
    }
    .padding(.vertical, 8)
    .padding(.horizontal, 12)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Character color")
  }
}

/** A colour: a 32-point cell, its swatch (24, the palette from the top right to the bottom left) ringed 3 then 1 when chosen; a faint ring under the pointer. */
private struct ColourCell: View {
  let palette: AgentPalette
  let chosen: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      ZStack {
        Circle().strokeBorder(hovering && !chosen ? look.ink.opacity(0.15) : .clear, lineWidth: 1)
        if chosen {
          Circle().strokeBorder(look.ink.opacity(0.20), lineWidth: 1)
          Circle().fill(look.elevated).padding(1)
        }
        Circle()
          .fill(LinearGradient(stops: [
            .init(color: Color(palette.top), location: 0),
            .init(color: Color(palette.mid), location: 0.55),
            .init(color: Color(palette.bottom), location: 1),
          ], startPoint: .topTrailing, endPoint: .bottomLeading))
          .frame(width: 24, height: 24)
      }
      .frame(width: 32, height: 32)
      .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .help(palette.label)
    .accessibilityLabel("\(palette.label) character color")
    .accessibilityAddTraits(chosen ? [.isSelected] : [])
  }
}

/**
 * Voice (`__simeonVoicePicker`): "Voice" (12/16, semibold, grey), then the
 * Mac's pop-up of the voices by name and a 30-point round play button that
 * plays the voice's sample (stops it when it plays). Hidden while the
 * voices load and when calls are off. A pick is saved at once; refused, it
 * goes back and says "Couldn’t save the voice."
 */
private struct VoicePicker: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var voices: [AppStore.VoiceChoice] = []
  @State private var chosen: String?
  @State private var note: String?
  @State private var player = SamplePlayer()

  var body: some View {
    Group {
      if !voices.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          Text("Voice")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(look.inkSecondary)
            .padding(.horizontal, 2)
          if let note {
            Text(note)
              .font(.system(size: 12))
              .foregroundStyle(look.inkSecondary)
              .padding(.horizontal, 2)
          }
          HStack(spacing: 8) {
            Picker("Voice", selection: Binding(get: { chosen ?? "" }, set: { pick($0) })) {
              ForEach(voices) { voice in Text(voice.name).tag(voice.id) }
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity)
            playButton
          }
        }
      }
    }
    .task(id: agent.id) { await load() }
    .onDisappear { player.stop() }
  }

  private var playButton: some View {
    let voice = voices.first { $0.id == chosen }
    let sample = voice?.sample.flatMap { $0.scheme == "https" ? $0 : nil }
    let playing = player.playing != nil && player.playing == voice?.id
    return Button {
      guard let voice, let sample else { return }
      if playing { player.stop() } else { player.play(sample, id: voice.id) }
    } label: {
      Image(systemName: playing ? "stop.fill" : "play.fill")
        .font(.system(size: 10))
        .foregroundStyle(look.ink)
        .frame(width: 30, height: 30)
        .background(Circle().fill(Color(red: 120 / 255, green: 120 / 255, blue: 128 / 255).opacity(look.dark ? 0.24 : 0.12)))
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .disabled(sample == nil)
    .opacity(sample == nil ? 0.4 : 1)
    .accessibilityLabel(voice.map { playing ? "Stop \($0.name)" : "Play \($0.name)" } ?? "Play")
  }

  private func load() async {
    let list = await store.voices()
    guard !list.isEmpty else { voices = []; return }
    let own = await store.ensureVoice(agent.id) ?? AppStore.defaultVoiceId
    voices = list
    chosen = list.contains { $0.id == own } ? own : list.first?.id
  }

  private func pick(_ id: String) {
    guard id != chosen else { return }
    let was = chosen
    chosen = id
    note = nil
    let agentId = agent.id
    Task {
      do { try await store.setAgentVoice(agentId, id) } catch {
        chosen = was
        note = AvatarEditorWords.voiceNotSaved
      }
    }
  }
}

/** Plays a voice's sample, one at a time. */
@MainActor
@Observable
final class SamplePlayer {
  private(set) var playing: String?
  @ObservationIgnored private var player: AVPlayer?
  @ObservationIgnored private var ended: NSObjectProtocol?

  func play(_ url: URL, id: String) {
    stop()
    let item = AVPlayerItem(url: url)
    let player = AVPlayer(playerItem: item)
    self.player = player
    playing = id
    ended = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.stop() }
    }
    player.play()
  }

  func stop() {
    player?.pause()
    player = nil
    playing = nil
    if let ended { NotificationCenter.default.removeObserver(ended) }
    ended = nil
  }
}

// MARK: - Generate

/**
 * Generate: a 150-point field ("Describe your avatar…", 14/22, round 10)
 * and Generate under it (⌘Return in the field too). While it draws: the
 * words on one line, a grey disc pulsing, and "Generating…". Then the crop.
 */
private struct GenerateTab: View {
  let model: AvatarEditorModel
  let look: Look
  let close: () -> Void
  @Environment(AppStore.self) private var store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var pulse = false

  var body: some View {
    @Bindable var model = model
    VStack(spacing: 12) {
      if model.candidate != nil {
        CropView(model: model, look: look, close: close)
      } else if model.generating {
        Text(model.prompt.split(whereSeparator: \.isWhitespace).joined(separator: " "))
          .font(.system(size: 14))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
          .padding(.horizontal, 10)
          .frame(maxWidth: .infinity, minHeight: 36, maxHeight: 36, alignment: .leading)
          .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(look.ground))
          .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
        Circle()
          .fill(look.rowHover)
          .frame(width: 96, height: 96)
          .opacity(pulse ? 0.55 : 1)
          .animation(reduceMotion ? nil : .easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: pulse)
          .padding(.vertical, 16)
          .onAppear { pulse = true }
          .accessibilityLabel("Generating avatar")
        EditorButton(title: "Generating…", primary: false, look: look) {}
          .disabled(true)
      } else {
        ZStack(alignment: .topLeading) {
          TextEditor(text: $model.prompt)
            .font(.system(size: 14))
            .scrollContentBackground(.hidden)
            .foregroundStyle(look.ink)
            .padding(.horizontal, 5)
            .padding(.vertical, 8)
            .onKeyPress(.return, phases: .down) { press in
              guard press.modifiers.contains(.command) || press.modifiers.contains(.control) else { return .ignored }
              model.generate(store: store)
              return .handled
            }
          if model.prompt.isEmpty {
            Text("Describe your avatar…")
              .font(.system(size: 14))
              .foregroundStyle(look.inkTertiary)
              .padding(.horizontal, 10)
              .padding(.vertical, 8)
              .allowsHitTesting(false)
          }
        }
        .frame(maxWidth: .infinity, minHeight: 150)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(look.ground))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
        .accessibilityLabel("Describe your avatar")
        EditorButton(title: "Generate", primary: true, look: look) { model.generate(store: store) }
          .disabled(model.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }
  }
}

// MARK: - Upload

/**
 * Upload: a dashed drop zone ("Drag, drop, or paste an image", "or",
 * Browse files), blue while a file is over it; the Mac's open panel for
 * Browse files; then the crop.
 */
private struct UploadTab: View {
  let model: AvatarEditorModel
  let look: Look
  let close: () -> Void

  var body: some View {
    if model.candidate != nil {
      CropView(model: model, look: look, close: close)
    } else {
      VStack(spacing: 8) {
        Text(AvatarEditorWords.dropZone)
          .font(.system(size: 14))
          .tracking(-0.15)
          .foregroundStyle(look.inkSecondary)
        Text("or")
          .font(.system(size: 14))
          .tracking(-0.15)
          .foregroundStyle(look.inkTertiary)
        EditorButton(title: AvatarEditorWords.browse, primary: false, look: look, fullWidth: false) { browse() }
      }
      .multilineTextAlignment(.center)
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, minHeight: 190)
      .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(model.dragOver ? look.rowHover : .clear))
      .overlay(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .strokeBorder(model.dragOver ? look.link : look.ink.opacity(0.15), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
      )
      .onDrop(of: [.fileURL], isTargeted: Binding(get: { model.dragOver }, set: { model.dragOver = $0 })) { providers in
        guard let provider = providers.first else { return false }
        _ = provider.loadObject(ofClass: URL.self) { url, _ in
          guard let url else { return }
          DispatchQueue.main.async { MainActor.assumeIsolated { model.take(file: url, fromDrop: true) } }
        }
        return true
      }
    }
  }

  /** Browse files (`pickAvatarFile`): "Choose an avatar image", one picture. */
  private func browse() {
    let panel = NSOpenPanel()
    panel.title = AvatarEditorWords.pickerTitle
    panel.allowsMultipleSelection = false
    panel.canChooseDirectories = false
    panel.allowedContentTypes = AvatarEditorWords.pickerTypes.compactMap { UTType(filenameExtension: $0) }
    guard panel.runModal() == .OK, let url = panel.url else { return }
    model.take(file: url, fromDrop: false)
  }
}

// MARK: - The crop

/**
 * The crop (`Upload` and `Generate`): the picture in a 96-point circle that
 * drags it, the file's name and size and "Drag to reposition", the zoom
 * (−, the Mac's slider from 1 to 5, +; a step is 0.5), then Restart and Set
 * avatar.
 */
private struct CropView: View {
  let model: AvatarEditorModel
  let look: Look
  let close: () -> Void
  @Environment(AppStore.self) private var store
  @State private var dragStart: AvatarCrop?

  var body: some View {
    if let candidate = model.candidate {
      VStack(spacing: 8) {
        stage(candidate)
        VStack(spacing: 2) {
          if let line = candidate.fileLine {
            Text(line).foregroundStyle(look.inkSecondary).lineLimit(1).truncationMode(.middle)
          }
          Text("Drag to reposition").foregroundStyle(look.inkTertiary)
        }
        .font(.system(size: 13))
        HStack(spacing: 8) {
          zoomButton("minus", label: "Zoom out", by: -AvatarCrop.zoomStep, candidate: candidate)
          Slider(value: Binding(get: { candidate.crop.zoom }, set: { value in model.candidate?.crop = candidate.crop.zoomed(to: value) }), in: AvatarCrop.minZoom...AvatarCrop.maxZoom)
            .controlSize(.small)
            .accessibilityLabel("Zoom")
          zoomButton("plus", label: "Zoom in", by: AvatarCrop.zoomStep, candidate: candidate)
        }
        .foregroundStyle(look.inkSecondary)
        HStack(spacing: 8) {
          EditorButton(title: "Restart", primary: false, look: look) { model.restart() }
          EditorButton(title: model.saving ? "Saving…" : "Set avatar", primary: true, look: look) {
            model.setPicture(store: store, close: close)
          }
        }
        .disabled(model.saving)
      }
      .frame(maxWidth: .infinity)
    }
  }

  private func stage(_ candidate: AvatarEditorModel.Candidate) -> some View {
    let place = candidate.crop.placement
    return ZStack(alignment: .topLeading) {
      look.rowHover
      Image(decorative: candidate.image, scale: 1)
        .resizable()
        .interpolation(.high)
        .frame(width: place.width, height: place.height)
        .offset(x: place.x, y: place.y)
    }
    .frame(width: AvatarCrop.stage, height: AvatarCrop.stage, alignment: .topLeading)
    .clipShape(Circle())
    .overlay(Circle().strokeBorder(look.ink.opacity(0.05), lineWidth: 0.5))
    .contentShape(Circle())
    .gesture(
      DragGesture(minimumDistance: 0)
        .onChanged { value in
          let start = dragStart ?? candidate.crop
          if dragStart == nil { dragStart = start }
          model.candidate?.crop = start.panned(dx: value.translation.width, dy: value.translation.height)
        }
        .onEnded { _ in dragStart = nil }
    )
    .onHover { inside in if inside { NSCursor.openHand.push() } else { NSCursor.pop() } }
    .accessibilityLabel("Drag to reposition")
  }

  private func zoomButton(_ symbol: String, label: String, by step: Double, candidate: AvatarEditorModel.Candidate) -> some View {
    ZoomStepButton(symbol: symbol, look: look) {
      model.candidate?.crop = candidate.crop.zoomed(to: candidate.crop.zoom + step)
    }
    .accessibilityLabel(label)
  }
}

private struct ZoomStepButton: View {
  let symbol: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 12))
        .frame(width: 20, height: 20)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(hovering ? look.rowHover : .clear))
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

// MARK: - Pictures on the avatar

/** An agent's uploaded picture (`avatarDataUrl`), read once per picture. */
@MainActor
enum AvatarPictures {
  private static var cache: [String: NSImage] = [:]

  static func image(_ dataURL: String?) -> NSImage? {
    guard let dataURL, !dataURL.isEmpty else { return nil }
    if let image = cache[dataURL] { return image }
    guard let comma = dataURL.firstIndex(of: ","), let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
          let image = NSImage(data: data) else { return nil }
    if cache.count > 64 { cache.removeAll() }
    cache[dataURL] = image
    return image
  }
}
