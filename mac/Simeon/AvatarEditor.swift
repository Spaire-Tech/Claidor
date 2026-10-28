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
 * For a new agent (the New Agent sheet, as the iPhone's) it changes an
 * `AgentDraft` instead, and nothing reaches the computer until Create.
 */
@MainActor
@Observable
final class AvatarEditorModel {
  enum Tab: Equatable { case faces, generate, upload }

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
  var error: String?
  /** The gender Faces shows, once the person picks one; until then the agent's face's. */
  var gender: String?
  var dragOver = false
  /** Bumped by every tab switch and Restart: a picture generated before it is thrown away. */
  private var generation = 0
  /** Closed while generating: the picture is saved when it arrives. */
  private(set) var closed = false
  /** A new agent's look (the New Agent sheet): what the editor changes when there is no agent yet. */
  var draft: AgentDraft?

  init(agentId: String, isGroup: Bool) {
    self.agentId = agentId
    self.isGroup = isGroup
    tab = isGroup ? .upload : .faces
  }

  init(draft: AgentDraft) {
    agentId = ""
    isGroup = false
    tab = .faces
    self.draft = draft
  }

  /** The agent as the editor draws it: the draft wearing its face or picture, else the agent. */
  func shown(_ agent: Agent?, store: AppStore) -> Agent {
    draft?.agent(agents: store.agents) ?? agent ?? Agent(id: agentId, name: "")
  }

  /** A tab (`X`): the picture, the generating and the error go; the prompt stays. */
  func choose(_ next: Tab) {
    guard next != tab else { return }
    tab = next
    generation += 1
    candidate = nil
    generating = false
    error = nil
  }

  func closeNow() {
    closed = true
  }

  /** Opened again (the New Agent sheet keeps its editor): a picture generated from now shows in it. */
  func reopen() {
    closed = false
  }

  // MARK: Faces

  /** A face put on at once (`AppStore.wearFace`: the picture, the face kept, a voice of its gender when it changes). */
  func wear(_ face: AgentFace, store: AppStore) {
    if draft != nil { return changeDraft(store) { $0.wear(face, agents: store.agents, voices: $1) } }
    let agentId = agentId
    run { try await store.wearFace(agentId, face) }
  }

  /** Shuffle: the next face of `gender` no other agent wears. */
  func shuffle(gender: String, store: AppStore) {
    if draft != nil { return changeDraft(store) { $0.shuffle(gender: gender, agents: store.agents, voices: $1) } }
    let agentId = agentId
    run { _ = try await store.shuffleFace(agentId, gender: gender) }
  }

  /** Reset face: back to the face the agent was given. */
  func reset(store: AppStore) {
    gender = nil
    if draft != nil { return changeDraft(store) { $0.reset(agents: store.agents, voices: $1) } }
    let agentId = agentId
    run { _ = try await store.resetFace(agentId) }
  }

  /** The draft changed with the voices listed (a face of the other gender brings a voice of its own). */
  private func changeDraft(_ store: AppStore, _ edit: @escaping @MainActor (inout AgentDraft, [AppStore.VoiceChoice]) -> Void) {
    Task {
      let voices = await store.voices()
      guard var next = draft else { return }
      edit(&next, voices)
      draft = next
    }
  }

  private func run(_ change: @escaping @MainActor () async throws -> Void) {
    guard !saving else { return }
    saving = true
    error = nil
    Task {
      do { try await change() } catch { self.error = AvatarEditorModel.words(error) }
      saving = false
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
          error = String(localized: "Image generation returned no picture.")
          return
        }
        let candidate = Candidate(image: fitted, crop: AvatarCrop(width: Double(fitted.width), height: Double(fitted.height)), fileLine: nil)
        if closed {
          if let png = AvatarEditorModel.export(candidate) {
            if draft != nil { draft?.setPicture(png) } else { try? await store.setAvatarImage(agentId, png: png) }
          }
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
    if draft != nil {
      draft?.setPicture(png)
      self.candidate = nil
      close()
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
    PlainWords.problem((error as? GatewayError)?.message ?? error.localizedDescription, fallback: String(localized: "Couldn’t change the avatar. Try again in a little while."))
  }
}

// MARK: - The popover

/**
 * The editor (`c3n`): 294 wide (the page's width when narrower), 6 under
 * the avatar and centred on it, over the page; round 16, the raised ground,
 * a hairline edge and a soft shadow; no arrow. Its head: the tabs (Faces,
 * Generate, Upload; a group has no Faces) and Reset; its body padded 12,
 * 240 high at the least, the error under it. A click outside it, or
 * Escape, closes it.
 */
struct AvatarEditorPopover: View {
  let agent: Agent
  let model: AvatarEditorModel
  let width: CGFloat
  let look: Look
  /** Its own card, edge and shadow: off inside the Mac's popover (the New Agent sheet), which draws its own. */
  var chrome = true
  let close: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
    let card = chrome
    VStack(spacing: 0) {
      header
      Rectangle().fill(look.ink.opacity(0.10)).frame(height: 0.5)
      VStack(spacing: 12) {
        switch model.tab {
        case .faces: FacesTab(agent: model.shown(agent, store: store), model: model, look: look)
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
    .background(shape.fill(card ? look.elevated : .clear))
    .overlay(shape.strokeBorder(look.ink.opacity(card ? 0.10 : 0), lineWidth: 0.5))
    .clipShape(shape)
    .shadow(color: Color(red: 20 / 255, green: 20 / 255, blue: 20 / 255).opacity(card ? 0.09 : 0), radius: 12, x: 0, y: 8)
    .shadow(color: Color(red: 20 / 255, green: 20 / 255, blue: 20 / 255).opacity(card ? 0.09 : 0), radius: 1.5, x: 0, y: 1)
  }

  /** The tabs (26 high, round 8, 13/18; the chosen one on the grey) and Reset (22 high) at the right, 8 apart, padded 8. */
  private var header: some View {
    let reset = model.draft.map { AvatarEditorWords.reset(draft: $0) } ?? AvatarEditorWords.reset(agent)
    return HStack(spacing: 8) {
      HStack(spacing: 2) {
        if !agent.isGroup { EditorTabButton(title: AvatarEditorWords.faces, chosen: model.tab == .faces, look: look) { model.choose(.faces) } }
        EditorTabButton(title: AvatarEditorWords.generate, chosen: model.tab == .generate, look: look) { model.choose(.generate) }
        EditorTabButton(title: AvatarEditorWords.upload, chosen: model.tab == .upload, look: look) { model.choose(.upload) }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let reset {
        EditorResetButton(look: look) { model.reset(store: store) }
          .disabled(model.saving)
          .help(reset)
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
    .buttonStyle(.hand)
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
    .buttonStyle(.hand)
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
    .buttonStyle(.hand)
    .opacity(enabled ? 1 : 0.56)
    .onHover { hovering = $0 }
  }

  private var fill: Color {
    if primary { return hovering && enabled ? look.inkSecondary : look.ink }
    let grey = Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255)
    return hovering && enabled ? grey.opacity(look.dark ? 0.32 : 0.17) : look.rowHover.opacity(0.82)
  }
}

// MARK: - Faces

/**
 * Faces (the founder, 12 October 2026: the clay characters, no colours):
 * Woman and Man with Shuffle beside them (the next face of that gender no
 * other agent wears); the gender's faces, five a row (44-point cells, 8
 * apart), the one worn ringed, each put on at a click (a face of the other
 * gender than the voice's brings a voice of its gender with it); then Voice.
 */
private struct FacesTab: View {
  let agent: Agent
  let model: AvatarEditorModel
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let gender = model.gender ?? AvatarEditorWords.gender(agent)
    let worn = AgentFaces.worn(agent)
    let isChief = Agent.chiefOfStaff(in: store.agents)?.id == agent.id
    // The Chief of Staff can always go back to Simeon's own face; no one else is offered it.
    let simeon: [AgentFace] = isChief && gender == AgentFaces.simeon?.gender ? AgentFaces.simeon.map { [$0] } ?? [] : []
    let faces = simeon + AgentFaces.pool.filter { $0.gender == gender }
    let rows = stride(from: 0, to: faces.count, by: 5).map { Array(faces[$0..<min($0 + 5, faces.count)]) }
    VStack(spacing: 12) {
      HStack(spacing: 8) {
        HStack(spacing: 2) {
          EditorTabButton(title: AvatarEditorWords.woman, chosen: gender == "female", look: look) { model.gender = "female" }
          EditorTabButton(title: AvatarEditorWords.man, chosen: gender == "male", look: look) { model.gender = "male" }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        EditorButton(title: AvatarEditorWords.shuffle, primary: false, look: look, fullWidth: false) { model.shuffle(gender: gender, store: store) }
          .disabled(model.saving)
      }
      VStack(spacing: 8) {
        ForEach(rows.indices, id: \.self) { row in
          HStack(spacing: 8) {
            ForEach(rows[row]) { face in
              FaceCell(face: face, chosen: face == worn, look: look) { model.wear(face, store: store) }
                .disabled(model.saving)
            }
          }
        }
      }
      .frame(maxWidth: .infinity)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Faces")
      VoicePicker(agent: agent, editor: model, look: look)
        .padding(.top, 6)
    }
  }
}

/** A face: a 44-point cell, the face in its circle (40), ringed when worn; a faint ring under the pointer. */
private struct FaceCell: View {
  let face: AgentFace
  let chosen: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      ZStack {
        Circle().strokeBorder(chosen ? look.ink.opacity(0.55) : hovering ? look.ink.opacity(0.15) : .clear, lineWidth: chosen ? 2 : 1)
        AgentPicture(image: AvatarPictures.image(face), size: 36)
      }
      .frame(width: 44, height: 44)
      .contentShape(Circle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityLabel(face.gender == "female" ? "A woman's face" : "A man's face")
    .accessibilityAddTraits(chosen ? [.isSelected] : [])
  }
}

/**
 * Voice (`__simeonVoicePicker`): "Voice" (12/16, semibold, grey), then the
 * voice's field across the row (VoiceMenu) and a 30-point play button in
 * the same grey that plays the voice's sample (stops it when it plays). A small spinner while
 * the voices load; hidden when there are none (calls off). A pick is saved
 * at once; refused, it goes back and says "Couldn’t save the voice."
 *
 * Until 12 October 2026 the voices were asked for from a `Group` that was
 * empty until they came, and SwiftUI starts no task on an empty group: the
 * picker never showed on the Mac (the founder: "we dont see the voice
 * picker like in iphone").
 */
private struct VoicePicker: View {
  let agent: Agent
  /** The editor, for a new agent's draft: its voice is the draft's, and a pick changes only the draft. */
  var editor: AvatarEditorModel? = nil
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var voices: [AppStore.VoiceChoice] = []
  @State private var loaded = false
  @State private var chosen: String?
  @State private var note: String?
  @State private var player = SamplePlayer()

  /** The voice shown: a new agent's follows its face until one is picked (`AgentDraft.voice`). */
  private var current: String? {
    if let draft = editor?.draft, !voices.isEmpty { return draft.voice(agents: store.agents, voices: voices) ?? chosen }
    return chosen
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if !loaded || !voices.isEmpty {
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
        if voices.isEmpty {
          ProgressView()
            .controlSize(.small)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: 30)
            .accessibilityLabel("Loading voices")
        } else {
          HStack(spacing: 8) {
            VoiceMenu(voices: voices, chosen: current, look: look, pick: pick)
            playButton
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .task(id: agent.id) {
      await load()
      loaded = true
    }
    .onDisappear { player.stop() }
  }

  private var playButton: some View {
    let voice = voices.first { $0.id == current }
    let sample = voice?.sample.flatMap { $0.scheme == "https" ? $0 : nil }
    let playing = player.playing != nil && player.playing == voice?.id
    return Button {
      guard let voice, let sample else { return }
      if playing { player.stop() } else { player.play(sample, id: voice.id) }
    } label: {
      Image(systemName: playing ? "stop.fill" : "play.fill")
        .font(.system(size: 11))
        .foregroundStyle(look.ink)
        .frame(width: 30, height: 30)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(look.rowHover.opacity(0.82)))
        .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .disabled(sample == nil)
    .opacity(sample == nil ? 0.4 : 1)
    .accessibilityLabel(voice.map { playing ? String(localized: "Stop \($0.name)") : String(localized: "Play \($0.name)") } ?? String(localized: "Play"))
  }

  /** The list as soon as it comes, on the agent's voice while it is listed; then the voice settled for it (one given by its name when it has none). */
  private func load() async {
    let list = await store.voices()
    guard !list.isEmpty else { voices = []; return }
    if let draft = editor?.draft {
      chosen = draft.voice(agents: store.agents, voices: list) ?? list.first?.id
      voices = list
      return
    }
    let kept = AgentVoices.kept(agent.voiceId, listed: list) ?? AppStore.defaultVoiceId
    chosen = list.contains { $0.id == kept } ? kept : list.first?.id
    voices = list
    let own = await store.ensureVoice(agent.id) ?? AppStore.defaultVoiceId
    if list.contains(where: { $0.id == own }) { chosen = own }
  }

  private func pick(_ id: String) {
    if let editor, editor.draft != nil {
      editor.draft?.pickVoice(id)
      chosen = id
      return
    }
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

/**
 * The voice's field (the founder, 12 October 2026: the system pop-up sat
 * small in the middle of the row, out of proportion with Shuffle and the
 * play button): the whole row's width, 30 high, round 10, in the grey of the
 * popover's other buttons (darker under the pointer), the chosen voice's
 * name at the left and the up-down chevrons at the right. A click opens the
 * voices, the chosen one ticked.
 */
private struct VoiceMenu: View {
  let voices: [AppStore.VoiceChoice]
  let chosen: String?
  let look: Look
  let pick: (String) -> Void
  @State private var hovering = false

  var body: some View {
    let name = voices.first { $0.id == chosen }?.name ?? ""
    let grey = Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255)
    Menu {
      // The voices with the Mac's own tick on the chosen one.
      Picker("Voice", selection: Binding(get: { chosen ?? "" }, set: { pick($0) })) {
        ForEach(voices) { voice in Text(voice.name).tag(voice.id) }
      }
      .pickerStyle(.inline)
      .labelsHidden()
    } label: {
      HStack(spacing: 6) {
        Text(name)
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .lineLimit(1)
        Spacer(minLength: 4)
        Image(systemName: "chevron.up.chevron.down")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
      }
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity)
      .frame(height: 30)
      .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(hovering ? grey.opacity(look.dark ? 0.32 : 0.17) : look.rowHover.opacity(0.82)))
      .contentShape(Rectangle())
    }
    .menuStyle(.button)
    .buttonStyle(.plain)
    .menuIndicator(.hidden)
    .fixedSize(horizontal: false, vertical: true)
    .frame(maxWidth: .infinity)
    .handCursor()
    .onHover { hovering = $0 }
    .accessibilityLabel("Voice, \(name)")
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
        EditorButton(title: String(localized: "Generating…"), primary: false, look: look) {}
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
        EditorButton(title: String(localized: "Generate"), primary: true, look: look) { model.generate(store: store) }
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
    // A sheet on the window, as the Electron app's (`showOpenDialog(mainWindow)`, step 14).
    let model = model
    guard let window = MacServices.shared.mainWindow ?? NSApp.keyWindow else {
      guard panel.runModal() == .OK, let url = panel.url else { return }
      model.take(file: url, fromDrop: false)
      return
    }
    panel.beginSheetModal(for: window) { response in
      guard response == .OK, let url = panel.url else { return }
      MainActor.assumeIsolated { model.take(file: url, fromDrop: false) }
    }
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
  /** The open hand is showing: it goes if the crop goes under the pointer. */
  @State private var handShown = false

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
          zoomButton("minus", label: String(localized: "Zoom out"), by: -AvatarCrop.zoomStep, candidate: candidate)
          Slider(value: Binding(get: { candidate.crop.zoom }, set: { value in model.candidate?.crop = candidate.crop.zoomed(to: value) }), in: AvatarCrop.minZoom...AvatarCrop.maxZoom)
            .controlSize(.small)
            .accessibilityLabel("Zoom")
          zoomButton("plus", label: String(localized: "Zoom in"), by: AvatarCrop.zoomStep, candidate: candidate)
        }
        .foregroundStyle(look.inkSecondary)
        HStack(spacing: 8) {
          EditorButton(title: String(localized: "Restart"), primary: false, look: look) { model.restart() }
          EditorButton(title: model.saving ? String(localized: "Saving…") : String(localized: "Set avatar"), primary: true, look: look) {
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
    .onHover { inside in
      guard inside != handShown else { return }
      handShown = inside
      if inside { NSCursor.openHand.push() } else { NSCursor.pop() }
    }
    .onDisappear {
      if handShown { NSCursor.pop() }
      handShown = false
    }
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
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}
