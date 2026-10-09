import AppKit
import AVFoundation
import SwiftUI
import UniformTypeIdentifiers
import SimeonCore

/**
 * The avatar editor (`c3n`), 294 wide, as a sheet over the pane (the
 * window's panel under the avatar; a popover would close for the file
 * chooser or a drag from Finder):
 * Agent · Generate · Upload (a group has no Agent tab and starts on Upload),
 * and Reset at the right. Agent: the twelve colours, saved as picked (staged
 * behind Set avatar while the agent has a picture), and the Voice. Generate:
 * a description, ⌘Return or Generate, then the crop. Upload: drop, paste or
 * Browse files, then the crop: a 96-point circle to drag, zoom 1 to 5,
 * Restart or Set avatar (a 256-pixel PNG). Errors in one red line.
 */
struct MacAvatarEditor: View {
  let agentId: String
  let close: () -> Void
  @Environment(AppStore.self) private var store
  @State private var tab: Tab = .agent
  @State private var staged: String?
  @State private var candidate: Candidate?
  @State private var prompt = ""
  @State private var generating = false
  /** Bumped on a tab change: a picture still being drawn for the tab left is dropped. */
  @State private var generation = 0
  @State private var problem: String?
  @State private var saving = false
  @State private var dropping = false
  @State private var life = EditorLife()
  @State private var pasteMonitor: Any?

  enum Tab: String, Hashable { case agent = "Agent", generate = "Generate", upload = "Upload" }

  /** A picture to crop: drawn down to 1024 at most, its name when it came from a file. */
  struct Candidate {
    let image: CGImage
    let fileName: String?
    var crop: AvatarCrop
  }

  /** Whether the editor is still open, for a picture that comes back after it closed. */
  final class EditorLife { var open = true }

  var body: some View {
    if let agent = store.agent(agentId) {
      VStack(spacing: 14) {
        HStack {
          Spacer()
          // A sheet on the Mac (the file chooser and a drag from Finder would close a popover), so it has its own ✕.
          Button { close() } label: { Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)) }
            .buttonStyle(.borderless)
            .keyboardShortcut(.cancelAction)
            .accessibilityLabel("Close")
        }
        HStack(spacing: 8) {
          Picker("Avatar source", selection: Binding(get: { tab }, set: { switchTab($0) })) {
            if !agent.isGroup { Text("Agent").tag(Tab.agent) }
            Text("Generate").tag(Tab.generate)
            Text("Upload").tag(Tab.upload)
          }
          .pickerStyle(.segmented)
          .labelsHidden()
          resetButton(agent)
        }
        Group {
          switch tab {
          case .agent: character(agent)
          case .generate: candidate == nil ? AnyView(generate) : AnyView(cropView)
          case .upload: candidate == nil ? AnyView(dropZone) : AnyView(cropView)
          }
        }
        .frame(minHeight: 240, alignment: .top)
        if let problem {
          Text(problem).font(.system(size: 12)).foregroundStyle(Ink.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .padding(16)
      .frame(width: 294)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Avatar editor")
      .onAppear {
        if agent.isGroup { tab = .upload }
        watchPaste()
      }
      .onDisappear {
        life.open = false
        if let pasteMonitor { NSEvent.removeMonitor(pasteMonitor) }
        pasteMonitor = nil
      }
      // Esc closes the editor, not the pane under it.
      .onExitCommand { close() }
    }
  }

  /** Another tab drops the picture, the staged colour, a drawing under way and the error; the description stays. */
  private func switchTab(_ next: Tab) {
    guard next != tab else { return }
    tab = next
    candidate = nil; staged = nil; generating = false; problem = nil
    generation += 1
  }

  // MARK: Reset

  @ViewBuilder
  private func resetButton(_ agent: Agent) -> some View {
    if agent.avatarDataURL != nil {
      Button("Reset") { run { try await store.setAvatarImage(agent.id, png: nil) } }
        .buttonStyle(.borderless).controlSize(.small)
        .accessibilityLabel("Reset to the Agent")
    } else if tab == .agent && agent.colour != nil {
      // The window sends this one unguarded: a failure says nothing.
      Button("Reset") { Task { try? await store.setCharacter(agent.id, colour: "") } }
        .buttonStyle(.borderless).controlSize(.small)
        .accessibilityLabel("Reset character to default")
    }
  }

  // MARK: Agent

  @ViewBuilder
  private func character(_ agent: Agent) -> some View {
    let hasPicture = agent.avatarDataURL != nil
    let chosen = hasPicture ? staged : (staged ?? agent.palette.id)
    VStack(spacing: 14) {
      ChipFlow(spacing: 8) {
        ForEach(AgentPalette.all, id: \.id) { palette in
          Button { pick(palette.id, agent: agent) } label: {
            Circle()
              .fill(LinearGradient(stops: [.init(color: Color(palette.top), location: 0), .init(color: Color(palette.mid), location: 0.55), .init(color: Color(palette.bottom), location: 1)], startPoint: .top, endPoint: .bottom))
              .frame(width: 24, height: 24)
              .padding(2)
              .overlay(Circle().stroke(chosen == palette.id ? Ink.primary : .clear, lineWidth: 1).padding(-1))
              .frame(width: 32, height: 32)
              .contentShape(.circle)
          }
          .buttonStyle(.plain)
          .help(palette.label)
          .accessibilityLabel("\(palette.label) character color")
          .accessibilityAddTraits(chosen == palette.id ? .isSelected : [])
        }
      }
      if hasPicture {
        HStack {
          Button("Cancel") { close() }
          Spacer()
          Button(saving ? "Saving\u{2026}" : "Set avatar") {
            guard let colour = staged else { return }
            run {
              try await store.setCharacter(agent.id, colour: colour)
              try await store.setAvatarImage(agent.id, png: nil)
              close()
            }
          }
          .buttonStyle(.borderedProminent)
          .disabled(staged == nil || saving)
        }
      }
      if !agent.isGroup { MacVoicePicker(agentId: agent.id) }
    }
  }

  /** A colour: saved at once, or staged while the agent has a picture. */
  private func pick(_ colour: String, agent: Agent) {
    if agent.avatarDataURL != nil { staged = colour; return }
    staged = colour
    run { try await store.setCharacter(agent.id, colour: colour) }
  }

  // MARK: Generate

  private var generate: some View {
    VStack(spacing: 10) {
      if generating {
        Text(prompt.split(whereSeparator: \.isWhitespace).joined(separator: " "))
          .font(.system(size: 13)).foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityLabel("Describe your avatar")
        ProgressView().controlSize(.small).accessibilityLabel("Generating avatar")
        Button("Generating\u{2026}") {}.disabled(true)
      } else {
        TextField("Describe your avatar\u{2026}", text: $prompt, axis: .vertical)
          .lineLimit(3...6)
          .textFieldStyle(.roundedBorder)
          .accessibilityLabel("Describe your avatar")
          .onKeyPress(.return, phases: .down) { press in
            guard press.modifiers.contains(.command) else { return .ignored }
            draw()
            return .handled
          }
        Button("Generate") { draw() }
          .buttonStyle(.borderedProminent)
          .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
    }
  }

  /** A picture drawn from the description; if the editor has closed meanwhile, it is saved anyway, centred. */
  private func draw() {
    let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !generating else { return }
    generating = true
    problem = nil
    let token = generation
    let life = life
    Task {
      do {
        let bytes = try await store.generateAvatarImage(text)
        guard let image = Self.normalized(bytes) else { throw AvatarProblem(AvatarEditorWords.unloadable) }
        if !life.open {
          let crop = AvatarCrop(width: Double(image.width), height: Double(image.height))
          if let png = Self.export(image, crop: crop) { try? await store.setAvatarImage(agentId, png: png) }
          return
        }
        guard token == generation else { return }
        candidate = Candidate(image: image, fileName: nil, crop: AvatarCrop(width: Double(image.width), height: Double(image.height)))
      } catch {
        if token == generation && life.open { problem = error.localizedDescription }
      }
      if token == generation { generating = false }
    }
  }

  // MARK: Upload

  private var dropZone: some View {
    VStack(spacing: 8) {
      Text(AvatarEditorWords.dropZone).font(.system(size: 13))
      Text("or").font(.system(size: 12)).foregroundStyle(.secondary)
      Button(AvatarEditorWords.browse) { browse() }
    }
    .frame(maxWidth: .infinity, minHeight: 180)
    .background(dropping ? Color.accentColor.opacity(0.12) : Ink.pill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(dropping ? Color.accentColor : Ink.edge, style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
    // The first file dropped, whatever it is: one that is not a picture fails as it is read.
    .dropDestination(for: URL.self) { urls, _ in
      guard let url = urls.first else { return false }
      take(url)
      return true
    } isTargeted: { dropping = $0 }
  }

  private func browse() {
    let panel = NSOpenPanel()
    panel.title = AvatarEditorWords.pickerTitle
    panel.allowedContentTypes = AvatarEditorWords.pickerTypes.compactMap { UTType(filenameExtension: $0) }
    panel.allowsMultipleSelection = false
    guard panel.runModal() == .OK, let url = panel.url else { return }
    guard let data = try? Data(contentsOf: url), let image = Self.normalized(data) else { problem = AvatarEditorWords.notAnImage; return }
    candidate = Candidate(image: image, fileName: url.lastPathComponent, crop: AvatarCrop(width: Double(image.width), height: Double(image.height)))
    problem = nil
  }

  private func take(_ url: URL) {
    let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
    switchTab(.upload)
    if let tooBig = AvatarCrop.sizeProblem(bytes: size) { problem = tooBig; return }
    guard let data = try? Data(contentsOf: url) else { problem = AvatarEditorWords.unreadable; return }
    guard let image = Self.normalized(data) else { problem = AvatarEditorWords.unloadable; return }
    candidate = Candidate(image: image, fileName: url.lastPathComponent, crop: AvatarCrop(width: Double(image.width), height: Double(image.height)))
    problem = nil
  }

  /**
   * ⌘V in the editor, outside its text field: the clipboard's first picture
   * goes to Upload ("Pasted image" when it has no name); with none, Upload
   * opens and nothing else happens.
   */
  private func watchPaste() {
    guard pasteMonitor == nil else { return }
    pasteMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
      guard event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command, event.charactersIgnoringModifiers == "v",
            !(event.window?.firstResponder is NSTextView), event.window?.isKeyWindow == true,
            store.agent(agentId) != nil else { return event }
      let board = NSPasteboard.general
      switchTab(.upload)
      if let url = (board.readObjects(forClasses: [NSURL.self], options: [.urlReadingContentsConformToTypes: [UTType.image.identifier]]) as? [URL])?.first {
        take(url)
      } else if let picture = board.readObjects(forClasses: [NSImage.self], options: nil)?.first as? NSImage, let png = picture.pngData() {
        if let tooBig = AvatarCrop.sizeProblem(bytes: png.count) { problem = tooBig; return nil }
        if let image = Self.normalized(png) {
          candidate = Candidate(image: image, fileName: AvatarEditorWords.pastedName, crop: AvatarCrop(width: Double(image.width), height: Double(image.height)))
          problem = nil
        }
      }
      return nil
    }
  }

  // MARK: The crop

  @ViewBuilder
  private var cropView: some View {
    if let candidate {
      VStack(spacing: 10) {
        let place = candidate.crop.placement
        ZStack(alignment: .topLeading) {
          Color.dynamic(light: "#ececf0", dark: "#2c2c2e")
          Image(decorative: candidate.image, scale: 1)
            .resizable()
            .frame(width: place.width, height: place.height)
            .offset(x: place.x, y: place.y)
        }
        .frame(width: AvatarCrop.stage, height: AvatarCrop.stage, alignment: .topLeading)
        .clipShape(Circle())
        .overlay(Circle().stroke(Ink.hairline, lineWidth: 0.5))
        .contentShape(.circle)
        .gesture(DragGesture(minimumDistance: 0).onChanged { value in pan(value) }.onEnded { _ in lastDrag = nil })
        .onHover { inside in if inside { NSCursor.openHand.push() } else { NSCursor.pop() } }
        .accessibilityLabel("Drag to reposition")
        .accessibilityAddTraits(.isImage)
        VStack(spacing: 2) {
          if let name = candidate.fileName {
            Text("\(name) \u{00B7} \(candidate.image.width)\u{00D7}\(candidate.image.height)").font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
          }
          Text("Drag to reposition").font(.system(size: 12)).foregroundStyle(.tertiary)
        }
        HStack(spacing: 8) {
          Button { zoom(candidate.crop.zoom - AvatarCrop.zoomStep) } label: { Image(systemName: "minus") }
            .buttonStyle(.borderless).accessibilityLabel("Zoom out")
          Slider(value: Binding(get: { candidate.crop.zoom }, set: { zoom($0) }), in: AvatarCrop.minZoom...AvatarCrop.maxZoom)
            .accessibilityLabel("Zoom")
          Button { zoom(candidate.crop.zoom + AvatarCrop.zoomStep) } label: { Image(systemName: "plus") }
            .buttonStyle(.borderless).accessibilityLabel("Zoom in")
        }
        HStack(spacing: 8) {
          Button("Restart") { self.candidate = nil; problem = nil }
            .frame(maxWidth: .infinity)
          Button(saving ? "Saving\u{2026}" : "Set avatar") { save(candidate) }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity)
        }
        .disabled(saving)
      }
    }
  }

  @State private var lastDrag: CGSize?

  private func pan(_ value: DragGesture.Value) {
    guard var current = candidate else { return }
    let previous = lastDrag ?? .zero
    let dx = value.translation.width - previous.width, dy = value.translation.height - previous.height
    lastDrag = value.translation
    current.crop = current.crop.panned(dx: dx, dy: dy)
    candidate = current
  }

  private func zoom(_ value: Double) {
    guard var current = candidate else { return }
    current.crop = current.crop.zoomed(to: value)
    candidate = current
  }

  private func save(_ candidate: Candidate) {
    guard let png = Self.export(candidate.image, crop: candidate.crop) else { problem = AvatarEditorWords.exportFailed; return }
    run {
      try await store.setAvatarImage(agentId, png: png)
      close()
    }
  }

  /** One save: "Saving…", its error in the red line. */
  private func run(_ work: @escaping @MainActor () async throws -> Void) {
    saving = true
    problem = nil
    Task {
      do { try await work() } catch { problem = error.localizedDescription }
      saving = false
    }
  }

  // MARK: Pictures

  /** A picture's pixels, drawn down so its longest side is 1024 at most (`Amt`). */
  static func normalized(_ data: Data) -> CGImage? {
    guard let source = NSImage(data: data), let pixels = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
    let fitted = AvatarCrop.fitted(width: Double(pixels.width), height: Double(pixels.height))
    guard fitted.width != pixels.width || fitted.height != pixels.height else { return pixels }
    guard let context = CGContext(data: nil, width: fitted.width, height: fitted.height, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.interpolationQuality = .high
    context.draw(pixels, in: CGRect(x: 0, y: 0, width: fitted.width, height: fitted.height))
    return context.makeImage()
  }

  /** The crop drawn into 256 × 256 and saved as PNG (`jUe`). */
  static func export(_ image: CGImage, crop: AvatarCrop) -> Data? {
    let side = AvatarCrop.output
    let rect = crop.rect
    guard let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    context.interpolationQuality = .high
    // The whole picture placed so the crop fills the square (Core Graphics counts up from the bottom).
    let k = Double(side) / rect.width
    let drawn = CGRect(x: -rect.x * k, y: -(Double(image.height) - rect.y - rect.height) * k, width: Double(image.width) * k, height: Double(image.height) * k)
    context.draw(image, in: drawn)
    guard let made = context.makeImage() else { return nil }
    return NSBitmapImageRep(cgImage: made).representation(using: .png, properties: [:])
  }
}

private struct AvatarProblem: LocalizedError {
  let words: String
  init(_ words: String) { self.words = words }
  var errorDescription: String? { words }
}

/**
 * The Voice under the colours (`__simeonVoicePicker`): the voices' names in a
 * menu and a round play button for the chosen one's sample; nothing while it
 * loads, with none, or with calls off.
 */
struct MacVoicePicker: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @State private var voices: [AppStore.VoiceChoice] = []
  @State private var chosen: String?
  @State private var failed = false
  @State private var player: AVPlayer?
  @State private var playing: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if !voices.isEmpty {
        HStack(spacing: 8) {
          Text("Voice").font(.system(size: 13))
          Picker("Voice", selection: Binding(get: { chosen ?? voices.first?.id ?? "" }, set: { choose($0) })) {
            ForEach(voices) { Text($0.name).tag($0.id) }
          }
          .labelsHidden()
          .controlSize(.small)
          let selected = voices.first { $0.id == (chosen ?? voices.first?.id) }
          Button { play(selected) } label: {
            Image(systemName: playing != nil && playing == selected?.id ? "stop.fill" : "play.fill").font(.system(size: 11))
              .frame(width: 30, height: 30)
              .background(Ink.pill, in: Circle())
          }
          .buttonStyle(.plain)
          .disabled(selected?.sample == nil)
          .accessibilityLabel(selected == nil ? "Play" : (playing == selected?.id ? "Stop \(selected?.name ?? "")" : "Play \(selected?.name ?? "")"))
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Voice")
      }
      if failed {
        Text(AvatarEditorWords.voiceNotSaved).font(.system(size: 12)).foregroundStyle(Ink.danger)
      }
    }
    .task {
      guard store.canCall else { return }
      let list = await store.voices()
      let kept = await store.ensureVoice(agentId)
      chosen = AgentVoices.kept(kept ?? store.agent(agentId)?.voiceId, listed: list) ?? list.first?.id
      voices = list
    }
    .onDisappear { player?.pause(); player = nil; playing = nil }
  }

  private func choose(_ id: String) {
    let was = chosen
    chosen = id
    failed = false
    Task {
      do { try await store.setAgentVoice(agentId, id) } catch {
        chosen = was
        failed = true
      }
    }
  }

  private func play(_ voice: AppStore.VoiceChoice?) {
    player?.pause()
    guard let voice, let url = voice.sample, playing != voice.id else { player = nil; playing = nil; return }
    let next = AVPlayer(url: url)
    player = next
    playing = voice.id
    next.play()
  }
}
