import AVFoundation
import PhotosUI
import SwiftUI
import UIKit
import SimeonCore

/**
 * The pencil (the Mac's avatar editor, mac/Simeon/AvatarEditor.swift `c3n`):
 * three tabs, as the Mac has them. Agent: the twelve colours as
 * butterflies (saved at once; for an agent with a picture only shown until
 * Set avatar, beside Cancel) and, when calls are on, the Voice dropdown with
 * a play button for the chosen voice's sample (`__simeonVoicePicker`, names
 * only). Generate: "Describe your avatar…", Generate, then the crop.
 * Upload: a photo, then the crop. The crop drags and pinches as Apple's own
 * photo crop, with the Mac's zoom (−, a slider from 1 to 5, +), Restart and
 * Set avatar. Under it, the Mac's Reset: "Reset to the Agent" takes a
 * picture away, "Reset character to default" puts the colour back. A group
 * starts on Upload and has no Agent tab.
 */
struct AvatarEditor: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var model: AvatarEditing
  @State private var photo: PhotosPickerItem? = nil
  @FocusState private var describing: Bool
  @State private var voices: [AppStore.VoiceChoice] = []
  @State private var sample: AVPlayer? = nil
  @State private var playing: String? = nil
  /** Half the screen to start; all of it once there is a picture to crop. */
  @State private var detent = PresentationDetent.medium

  init(agentId: String, isGroup: Bool) {
    self.agentId = agentId
    _model = State(initialValue: AvatarEditing(agentId: agentId, isGroup: isGroup))
  }

  var body: some View {
    NavigationStack {
      if let agent = store.agent(agentId) {
        let hasPicture = agent.avatarDataURL?.isEmpty == false
        ScrollView {
          VStack(spacing: 20) {
            if model.candidate == nil {
              preview(agent).frame(width: 110, height: 110)
            }
            Picker("Avatar source", selection: Binding(get: { model.tab }, set: { model.choose($0) })) {
              ForEach(agent.isGroup ? [AvatarEditing.Tab.generate, .upload] : AvatarEditing.Tab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            switch model.tab {
            case .agent: character(agent, hasPicture: hasPicture)
            case .generate: generate()
            case .upload: upload()
            }
            if let error = model.error {
              Text(error)
                .font(.system(size: 14))
                .foregroundStyle(Ink.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            }
            if model.candidate == nil, let reset = AvatarEditorWords.reset(hasPicture: hasPicture, onAgentTab: model.tab == .agent, colour: agent.colour) {
              Button(reset) { model.reset(store: store) }
                .buttonStyle(PillButtonStyle(primary: false))
                .disabled(hasPicture ? model.saving : model.committing)
            }
          }
          .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Ink.ground)
        .navigationTitle("Avatar")
        .inlineBarTitle()
        .toolbar { ToolbarItem(placement: .trailingBar) { Button("Done") { dismiss() } } }
        // The picker shows once the agent's voice is settled: its own while listed, else one given by its name now (AgentVoices).
        .task {
          guard !agent.isGroup else { return }
          let list = await store.voices()
          _ = await store.ensureVoice(agent.id)
          voices = list
        }
        .onChange(of: photo) { _, item in
          guard let item else { return }
          Task {
            let data = try? await item.loadTransferable(type: Data.self)
            photo = nil
            model.take(photo: data)
          }
        }
      }
    }
    .presentationDetents([.medium, .large], selection: $detent)
    .presentationBackground(Ink.ground)
    .onChange(of: model.candidate != nil) { _, cropping in if cropping { detent = .large } }
    .onDisappear {
      sample?.pause(); sample = nil; playing = nil
      // Closed while a picture is drawn: it is saved when it comes, cut in its middle.
      model.closeNow()
    }
  }

  /** The avatar as it will be: a colour picked and not yet set, else the picture, the butterfly or the group's members. */
  @ViewBuilder
  private func preview(_ agent: Agent) -> some View {
    if let staged = model.staged {
      ButterflyView(palette: AgentPalette.named(staged), style: .still)
    } else if let picture = AgentAvatar.image(agent.avatarDataURL) {
      Image(uiImage: picture).resizable().scaledToFill().clipShape(Circle())
    } else {
      AgentAvatar(agent: agent, members: store.members(of: agent))
    }
  }

  // MARK: Agent

  /** The Agent tab: the colours (the chosen one ringed), then the voice; with a picture, Cancel and Set avatar for a colour picked. */
  @ViewBuilder
  private func character(_ agent: Agent, hasPicture: Bool) -> some View {
    let chosen = AvatarEditorWords.chosenColour(agent, staged: model.staged)
    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 14) {
      ForEach(AgentPalette.all, id: \.id) { palette in
        Button { model.pick(palette.id, store: store) } label: {
          ButterflyView(palette: palette, style: .still)
            .frame(width: 40, height: 40)
            .padding(4)
            .overlay(Circle().stroke(chosen == palette.id ? Ink.blue : .clear, lineWidth: 2))
            .contentShape(.circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(palette.label) character color")
        .accessibilityAddTraits(chosen == palette.id ? .isSelected : [])
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Character color")
    if !voices.isEmpty {
      let current = AgentVoices.kept(agent.voiceId, listed: voices) ?? AppStore.defaultVoiceId
      let voice = voices.first { $0.id == current } ?? voices.first
      VStack(alignment: .leading, spacing: 6) {
        Text("Voice").font(.system(size: 12, weight: .semibold)).foregroundStyle(Ink.secondary).padding(.horizontal, 2)
        HStack(spacing: 8) {
          Picker("Voice", selection: Binding(get: { voice?.id ?? current }, set: { id in Task { await store.setVoice(agent.id, id) } })) {
            ForEach(voices) { Text($0.name).tag($0.id) }
          }
          .pickerStyle(.menu)
          .tint(Ink.primary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 4)
          .frame(height: 30)
          .background(Ink.control, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
          Button { play(voice) } label: {
            Image(systemName: playing != nil && playing == voice?.id ? "pause.fill" : "play.fill")
              .font(.system(size: 12))
              .foregroundStyle(Ink.primary)
              .frame(width: 30, height: 30)
              .background(Ink.pill, in: Circle())
              .contentShape(.circle)
          }
          .buttonStyle(.plain)
          .disabled(voice?.sample == nil)
          .opacity(voice?.sample == nil ? 0.4 : 1)
          .accessibilityLabel(playing == voice?.id ? "Stop \(voice?.name ?? "")" : "Play \(voice?.name ?? "")")
        }
      }
    }
    if hasPicture {
      HStack(spacing: 10) {
        Button("Cancel") { dismiss() }
          .buttonStyle(PillButtonStyle(primary: false))
          .disabled(model.saving)
        Button(model.saving ? "Saving\u{2026}" : "Set avatar") { model.setStaged(store: store) { dismiss() } }
          .buttonStyle(PillButtonStyle(primary: true))
          .disabled(model.staged == nil || model.saving)
      }
    }
  }

  /** The chosen voice's sample, or stop it. */
  private func play(_ voice: AppStore.VoiceChoice?) {
    sample?.pause()
    guard let voice, let url = voice.sample, playing != voice.id else { sample = nil; playing = nil; return }
    try? AVAudioSession.sharedInstance().setCategory(.playback)
    let player = AVPlayer(url: url)
    sample = player
    playing = voice.id
    player.play()
  }

  // MARK: Generate

  /** The Generate tab: a description and Generate; while it draws, the words on one line, a grey disc pulsing and "Generating…"; then the crop. */
  @ViewBuilder
  private func generate() -> some View {
    if model.candidate != nil {
      CropView(model: model) { dismiss() }
    } else if model.generating {
      Text(model.prompt.split(whereSeparator: \.isWhitespace).joined(separator: " "))
        .font(.system(size: 15))
        .foregroundStyle(Ink.primary)
        .lineLimit(1)
        .truncationMode(.tail)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background(Ink.control, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Ink.edge, lineWidth: 1))
      PulsingDisc().accessibilityLabel("Generating avatar")
      Button("Generating\u{2026}") {}
        .buttonStyle(PillButtonStyle(primary: false))
        .disabled(true)
    } else {
      TextField("Describe your avatar\u{2026}", text: Binding(get: { model.prompt }, set: { model.prompt = $0 }), axis: .vertical)
        .lineLimit(3...6)
        .font(.system(size: 15))
        .focused($describing)
        .padding(12)
        // The whole box takes the tap, not only the lines of text inside its padding.
        .background { RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Ink.control).onTapGesture { describing = true } }
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Ink.edge, lineWidth: 1).allowsHitTesting(false))
        .accessibilityLabel("Describe your avatar")
      Button("Generate") {
        describing = false
        model.generate(store: store)
      }
      .buttonStyle(PillButtonStyle(primary: true))
      .disabled(model.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }
  }

  // MARK: Upload

  /** The Upload tab: a photo from the library, then the crop. */
  @ViewBuilder
  private func upload() -> some View {
    if model.candidate != nil {
      CropView(model: model) { dismiss() }
    } else {
      PhotosPicker(selection: $photo, matching: .images) {
        Label("Choose a photo", systemImage: "photo").frame(maxWidth: .infinity)
      }
      .buttonStyle(PillButtonStyle(primary: false))
    }
  }
}

/** A grey disc breathing while the picture is drawn (still with Reduce Motion). */
private struct PulsingDisc: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var pulse = false

  var body: some View {
    Circle()
      .fill(Ink.bubbleTheirs)
      .frame(width: 110, height: 110)
      .opacity(pulse ? 0.55 : 1)
      .animation(reduceMotion ? nil : .easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: pulse)
      .padding(.vertical, 8)
      .onAppear { pulse = true }
  }
}

// MARK: - The editor's state

/**
 * What the avatar editor holds (the Mac's `AvatarEditorModel`): the tab,
 * the description, a picture being cropped, a colour picked for an agent
 * with a picture, what is on its way and the error. Closed while a picture
 * is drawn, the picture is saved when it arrives, cut in its middle; a tab
 * changed meanwhile throws it away.
 */
@MainActor
@Observable
final class AvatarEditing {
  enum Tab: String, CaseIterable, Identifiable {
    case agent = "Agent", generate = "Generate", upload = "Upload"
    var id: String { rawValue }
  }

  /** A picture being cropped: drawn down to 1024 at most (one pixel a point), and its crop. */
  struct Candidate {
    let image: UIImage
    var crop: AvatarCrop
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
  /** A colour picked for an agent with a picture: shown on the avatar until Set avatar or Cancel. */
  var staged: String?
  /** Bumped by every tab change and Restart: a picture drawn before it is thrown away. */
  private var generation = 0
  /** Closed while drawing: the picture is saved when it arrives. */
  private var closed = false

  init(agentId: String, isGroup: Bool) {
    self.agentId = agentId
    self.isGroup = isGroup
    tab = isGroup ? .upload : .agent
  }

  /** A tab (`X`): the picture, the staged colour, the drawing and the error go; the description stays. */
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

  /** A colour: saved at once (`commitCharacter`); for an agent with a picture, only shown until Set avatar. */
  func pick(_ colour: String, store: AppStore) {
    Haptics.select()
    if store.agent(agentId)?.avatarDataURL?.isEmpty == false {
      staged = colour
      return
    }
    guard !committing else { return }
    committing = true
    error = nil
    Task {
      do { try await store.setCharacter(agentId, colour: colour) } catch {
        self.error = Self.words(error)
        Haptics.warning()
      }
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
        Haptics.success()
        close()
      } catch {
        self.error = Self.words(error)
        saving = false
        Haptics.warning()
      }
    }
  }

  /** Reset: the picture taken away ("Reset to the Agent"), else the stored colour ("Reset character to default"). */
  func reset(store: AppStore) {
    error = nil
    staged = nil
    if store.agent(agentId)?.avatarDataURL?.isEmpty == false {
      saving = true
      Task {
        do {
          try await store.setAvatarImage(agentId, png: nil)
          Haptics.success()
        } catch {
          self.error = Self.words(error)
          Haptics.warning()
        }
        saving = false
      }
    } else {
      committing = true
      Task {
        do {
          try await store.setCharacter(agentId, colour: "")
          Haptics.success()
        } catch {
          self.error = Self.words(error)
          Haptics.warning()
        }
        committing = false
      }
    }
  }

  // MARK: Pictures

  /** A photo from the library: read, drawn down, cropped in its middle. */
  func take(photo data: Data?) {
    error = nil
    guard let data, let image = UIImage(data: data), let fitted = Self.fitted(image) else {
      error = AvatarEditorWords.unloadable
      return
    }
    candidate = Candidate(image: fitted, crop: AvatarCrop(width: Double(fitted.size.width), height: Double(fitted.size.height)))
  }

  /**
   * Generate (`l3n`): the picture asked for (`drawPicture`; one turned down
   * is said in plain words, `AppStore.drawingRefusal`); closed meanwhile,
   * saved at once in its middle; another tab meanwhile, thrown away.
   */
  func generate(store: AppStore) {
    let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty, !generating else { return }
    generating = true
    error = nil
    let ticket = generation
    Task {
      let bytes = await store.drawPicture(text)
      guard ticket == generation else { return }
      generating = false
      guard let bytes else {
        Haptics.warning()
        return
      }
      guard let image = UIImage(data: bytes), let fitted = Self.fitted(image) else {
        error = AvatarEditorWords.generationEmpty
        return
      }
      let candidate = Candidate(image: fitted, crop: AvatarCrop(width: Double(fitted.size.width), height: Double(fitted.size.height)))
      if closed {
        if let png = Self.export(candidate) { try? await store.setAvatarImage(agentId, png: png) }
      } else {
        self.candidate = candidate
      }
    }
  }

  /** Restart: back to the photo or the description (its words kept). */
  func restart() {
    generation += 1
    candidate = nil
    error = nil
  }

  /** Set avatar: the crop as a 256-pixel PNG (`jUe`), saved, then the editor closes. */
  func setPicture(store: AppStore, close: @escaping () -> Void) {
    guard let candidate, !saving else { return }
    guard let png = Self.export(candidate) else {
      error = AvatarEditorWords.exportFailed
      return
    }
    saving = true
    error = nil
    Task {
      do {
        try await store.setAvatarImage(agentId, png: png)
        saving = false
        Haptics.success()
        close()
      } catch {
        self.error = Self.words(error)
        saving = false
        Haptics.warning()
      }
    }
  }

  // MARK: Drawing

  /** The picture drawn down to 1024 on its longest side (`Amt`, `BUe`), upright, one pixel a point. */
  static func fitted(_ image: UIImage) -> UIImage? {
    let width = image.size.width * image.scale, height = image.size.height * image.scale
    guard width > 0, height > 0 else { return nil }
    let size = AvatarCrop.fitted(width: Double(width), height: Double(height))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let side = CGSize(width: size.width, height: size.height)
    return UIGraphicsImageRenderer(size: side, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: side))
    }
  }

  /** The crop as a 256 × 256 PNG (`nR`). */
  static func export(_ candidate: Candidate) -> Data? {
    let side = CGFloat(AvatarCrop.output)
    let rect = candidate.crop.rect
    guard rect.width > 0 else { return nil }
    let k = side / CGFloat(rect.width)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = false
    return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).pngData { _ in
      candidate.image.draw(in: CGRect(x: -CGFloat(rect.x) * k, y: -CGFloat(rect.y) * k, width: CGFloat(candidate.crop.width) * k, height: CGFloat(candidate.crop.height) * k))
    }
  }

  /** The host's words, without the bridge's own (`h$n`). */
  static func words(_ error: Error) -> String {
    (error as? GatewayError)?.message ?? error.localizedDescription
  }
}

// MARK: - The crop

/**
 * The crop (Upload and Generate; the Mac's `CropView`): the picture under a
 * circle, the part outside it dimmed, as Apple's own photo crop: a finger
 * drags it, two pinch it; "Drag to reposition"; the zoom (−, a slider from
 * 1 to 5, +; a step is 0.5); then Restart and Set avatar. The circle is the
 * Mac's 96-point stage drawn larger: the same crop, saved as a 256-pixel PNG.
 */
private struct CropView: View {
  let model: AvatarEditing
  let close: () -> Void
  @Environment(AppStore.self) private var store
  /** The last drag and pinch seen: both move the crop by their change, so one finger and two can work together. */
  @State private var lastDrag: CGSize? = nil
  @State private var lastPinch: CGFloat? = nil

  private static let circle: CGFloat = 240
  private static let stageWidth: CGFloat = 320
  private static let stageHeight: CGFloat = 280
  /** Points on the phone's circle per point of the Mac's stage. */
  private static let k = circle / CGFloat(AvatarCrop.stage)

  var body: some View {
    if let candidate = model.candidate {
      VStack(spacing: 14) {
        stage(candidate)
        Text("Drag to reposition").font(.system(size: 13)).foregroundStyle(Ink.tertiary)
        HStack(spacing: 6) {
          zoomButton("minus", label: "Zoom out", by: -AvatarCrop.zoomStep)
          Slider(value: Binding(get: { model.candidate?.crop.zoom ?? AvatarCrop.minZoom }, set: { value in
            guard let crop = model.candidate?.crop else { return }
            model.candidate?.crop = crop.zoomed(to: value)
          }), in: AvatarCrop.minZoom...AvatarCrop.maxZoom)
          .tint(Ink.blue)
          .accessibilityLabel("Zoom")
          zoomButton("plus", label: "Zoom in", by: AvatarCrop.zoomStep)
        }
        HStack(spacing: 10) {
          Button("Restart") { model.restart() }
            .buttonStyle(PillButtonStyle(primary: false))
          Button(model.saving ? "Saving\u{2026}" : "Set avatar") { model.setPicture(store: store, close: close) }
            .buttonStyle(PillButtonStyle(primary: true))
        }
        .disabled(model.saving)
      }
      .frame(maxWidth: .infinity)
    }
  }

  private func stage(_ candidate: AvatarEditing.Candidate) -> some View {
    let place = candidate.crop.placement
    let origin = CGPoint(x: (Self.stageWidth - Self.circle) / 2, y: (Self.stageHeight - Self.circle) / 2)
    let ring = CGRect(origin: origin, size: CGSize(width: Self.circle, height: Self.circle))
    return ZStack(alignment: .topLeading) {
      Ink.bubbleTheirs
      Image(uiImage: candidate.image)
        .resizable()
        .interpolation(.high)
        .frame(width: CGFloat(place.width) * Self.k, height: CGFloat(place.height) * Self.k)
        .offset(x: origin.x + CGFloat(place.x) * Self.k, y: origin.y + CGFloat(place.y) * Self.k)
      // What is not kept, dimmed around the circle.
      CropShade(ring: ring)
        .fill(Color.black.opacity(0.5), style: FillStyle(eoFill: true))
        .allowsHitTesting(false)
      Circle()
        .strokeBorder(Color.white.opacity(0.85), lineWidth: 1)
        .frame(width: Self.circle, height: Self.circle)
        .offset(x: origin.x, y: origin.y)
        .allowsHitTesting(false)
    }
    .frame(width: Self.stageWidth, height: Self.stageHeight, alignment: .topLeading)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .contentShape(.rect)
    .gesture(
      DragGesture(minimumDistance: 0)
        .onChanged { value in
          let last = lastDrag ?? .zero
          lastDrag = value.translation
          guard let crop = model.candidate?.crop else { return }
          model.candidate?.crop = crop.panned(dx: Double((value.translation.width - last.width) / Self.k), dy: Double((value.translation.height - last.height) / Self.k))
        }
        .onEnded { _ in lastDrag = nil }
    )
    .simultaneousGesture(
      MagnifyGesture()
        .onChanged { value in
          let last = lastPinch ?? 1
          lastPinch = value.magnification
          guard let crop = model.candidate?.crop, last > 0 else { return }
          model.candidate?.crop = crop.zoomed(to: crop.zoom * Double(value.magnification / last))
        }
        .onEnded { _ in lastPinch = nil }
    )
    .accessibilityElement()
    .accessibilityLabel("Drag to reposition")
  }

  private func zoomButton(_ symbol: String, label: String, by step: Double) -> some View {
    Button {
      guard let crop = model.candidate?.crop else { return }
      model.candidate?.crop = crop.zoomed(to: crop.zoom + step)
    } label: {
      Image(systemName: symbol)
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(Ink.secondary)
        .frame(width: 36, height: 36)
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label)
  }
}

/** The stage with the circle cut out of it: filled even-odd, it covers only what is outside the circle. */
private struct CropShade: Shape {
  let ring: CGRect

  func path(in rect: CGRect) -> Path {
    var path = Path(rect)
    path.addEllipse(in: ring)
    return path
  }
}
