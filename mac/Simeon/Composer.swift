import AppKit
import SwiftUI
import SimeonCore

/**
 * The message field (`sand-chat-input-dock`, padded 0 16 16), in the
 * window's two forms (`l9n`, `Zan`). On one line: a frame 44 high and 22
 * round, the words 44 in from each side (14 on 20), Attach at the left and
 * the send controls at the right, 8 in. Stacked, once the words wrap or
 * hold a new line, or a reply is being written: 18 round, the words 12 in
 * across the whole width (up to six lines, 120, then they scroll), with
 * Attach and the send controls on a row under them; it goes back to one
 * line only for short words (under 48 characters) that fit. While empty
 * the send control is the microphone in the window's blue (dictation, step
 * 2e); with words, a grey microphone beside the blue arrow. The frame has
 * a hairline (the text at 30%; `#2e2e2e` on dark) and a soft shadow, and
 * the ground runs from its middle to the window's bottom. Return sends,
 * Shift-Return starts a new line, Escape lets go of a reply, and what is
 * typed is kept per chat (the window's draft). A reply shows its line
 * over the words (`sand-prompt-reply-pill`) and "Reply…" while empty.
 */
struct Composer: View {
  let agentId: String
  let name: String
  /** The open thread: what is sent goes into it. */
  let threadRoot: String?
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control
  @State private var text = ""
  /** The picks in the words ("@Nora" as one piece). */
  @State private var chips: [ComposerChip] = []
  @State private var fieldHeight: CGFloat = 20
  @State private var stacked = false
  @State private var width: CGFloat = 0
  /** The lists over the field (step 2e). */
  @State private var picks = ComposerPicks()
  @State private var handle = FieldHandle()
  /** Voice input (step 2e). */
  @State private var dictation = Dictation()

  /** Each chat's picks while its words wait (the window keeps them in the draft's document). */
  private static var keptChips: [String: (draft: String, chips: [ComposerChip])] = [:]

  /** Six lines of 20 (`nze`), then the words scroll. */
  static let tallest: CGFloat = 120

  var body: some View {
    let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let reply = control.reply
    let files = control.staged
    // Something to send (`hasPayload`): words, or files.
    let payload = !empty || !files.isEmpty
    let lines = noticeLines
    let expanded = stacked || reply != nil || !files.isEmpty || !lines.isEmpty
    let shown = min(fieldHeight, Composer.tallest)
    // On one line the frame is 44; stacked, 9 over its blocks (a line 20, the reply 36, the files 60, each with its 6) and 47 under the words for the buttons.
    let blocks: CGFloat = CGFloat(lines.count) * 20 + (reply == nil ? 0 : 36) + (files.isEmpty ? 0 : 60)
    let height: CGFloat = expanded ? 9 + blocks + shown + 47 : 44
    let trailing: CGFloat = payload ? 81 : 45
    ZStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 6) {
        // The order the window stacks them in: a send's error, dictation's, the files', the reply, the files.
        ForEach(lines) { line in
          Text(line.text)
            .font(.system(size: 11))
            .foregroundStyle(line.isError ? look.danger : look.inkTertiary)
            .lineLimit(1)
            .truncationMode(.tail)
            .frame(height: 14)
            .padding(.horizontal, 2)
            .accessibilityAddTraits(.updatesFrequently)
        }
        if let reply {
          ReplyPill(reply: reply, look: look) { control.reply = nil }
        }
        if !files.isEmpty {
          AttachmentStrip(files: files, look: look) { control.unstage($0) }
        }
        field(placeholder: placeholder(reply: reply, hasFiles: !files.isEmpty))
          .frame(height: shown)
      }
      .padding(.top, expanded ? 9 : 11)
      .padding(.leading, expanded ? 13 : 45)
      .padding(.trailing, expanded ? 13 : trailing)
      .frame(maxHeight: .infinity, alignment: .top)
      HStack(spacing: 8) {
        AttachButton(look: look, full: files.count >= AttachmentLimits.maxStaged) { control.chooseFiles() }
        Spacer(minLength: 0)
        switch dictation.phase {
        case .asking, .recording:
          // The recording chip in Send's place (`sand-prompt-voice-chip`).
          RecordingChip(dictation: dictation, look: look) {
            Task { await dictation.stop(store: store) }
          }
        case .transcribing:
          ProgressView()
            .controlSize(.small)
            .frame(width: 28, height: 28)
            .accessibilityLabel("Transcribing voice input…")
        case .idle:
          if payload {
            MicButton(prominent: false, look: look) { dictation.start(store: store) }
            SendButton(look: look, action: send)
          } else {
            MicButton(prominent: true, look: look) { dictation.start(store: store) }
          }
        }
      }
      .frame(height: 30)
      .padding(.horizontal, 9)
      .padding(.bottom, 8)
      .frame(maxHeight: .infinity, alignment: .bottom)
    }
    .frame(maxWidth: .infinity)
    .frame(height: height)
    // The hairline under the frame's content, so an open list over the words is not crossed by it.
    .background { RoundedRectangle(cornerRadius: expanded ? 18 : 22).strokeBorder(look.composerEdge, lineWidth: 1) }
    .background(look.composer, in: RoundedRectangle(cornerRadius: expanded ? 18 : 22))
    .shadow(color: look.dark ? .clear : .black.opacity(0.05), radius: 3.5, x: 0, y: 2)
    .shadow(color: look.dark ? .clear : .black.opacity(0.03), radius: 1, x: 0, y: 1)
    .onGeometryChange(for: CGFloat.self) { proxy in proxy.size.width } action: { value in
      width = value
      relayout(edited: false)
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 16)
    .background(alignment: .bottom) {
      look.ground.frame(height: height / 2 + 16)
    }
    .onAppear {
      text = store.drafts[agentId] ?? ""
      if let kept = Composer.keptChips[agentId], kept.draft == text { chips = kept.chips }
      relayout(edited: true)
      // A message canceled or handed over comes in after the draft, so the draft does not cover it.
      takeBackCanceled()
    }
    .task(id: agentId) { await picks.load(agentId, store: store) }
    .onChange(of: height, initial: true) { _, value in control.composerHeight = value }
    .onChange(of: text) { _, next in
      store.setDraft(next, for: agentId)
      // The picks go with the words as they are now (both are set together as the field changes).
      Composer.keptChips[agentId] = chips.isEmpty ? nil : (next, chips)
      relayout(edited: true)
    }
    .onChange(of: chips) { _, next in
      Composer.keptChips[agentId] = next.isEmpty ? nil : (text, next)
    }
    // A message canceled before it went comes back here when this field is empty (the window's cancel).
    .onChange(of: store.canceledDraft?.id) { _, _ in takeBackCanceled() }
    .onAppear { dictation.onWords = { [handle] words in handle.insertDictation(words) } }
    .onDisappear { dictation.cancel() }
  }

  /** The field's words while empty (`ve`): listening, transcribing, a reply's, files', or the chat's. */
  private func placeholder(reply: ChatControl.Reply?, hasFiles: Bool) -> String {
    switch dictation.phase {
    case .asking, .recording: return "Listening…"
    case .transcribing: return "Transcribing…"
    case .idle: return reply?.placeholder ?? (hasFiles ? "Add a message, or hit send." : "Message \(name)")
    }
  }

  /** A line over the words (`sand-prompt-error-notice`, `…-attachment-notice`): 11 on 14, padded 0 2. */
  struct NoticeLine: Identifiable {
    let text: String
    let isError: Bool
    var id: String { (isError ? "error:" : "files:") + text }
  }

  /** The lines over the words: the store's for this chat (a send refused, six seconds) in red, then the files' (five seconds) at 40%. */
  private var noticeLines: [NoticeLine] {
    var out: [NoticeLine] = []
    if let notice = store.composerNotice, notice.agentId == agentId { out.append(NoticeLine(text: notice.text, isError: true)) }
    if let error = dictation.error { out.append(NoticeLine(text: error, isError: true)) }
    if let line = control.attachNotice { out.append(NoticeLine(text: line, isError: false)) }
    return out
  }

  /**
   * A canceled message back in its composer (`canceledDraft`): its words
   * and picks, its files, and the message it answered, when the field is
   * empty; else it stays gone, as the window keeps what was typed.
   */
  private func takeBackCanceled() {
    guard let draft = store.canceledDraft, draft.scope == AppStore.draftScope(agentId, thread: threadRoot) else { return }
    store.takeCanceledDraft(draft.id)
    guard text.isEmpty, control.staged.isEmpty else { return }
    if let restored = ComposerDocument.draft(from: draft.richText) {
      text = restored.draft
      chips = restored.chips
    } else {
      text = draft.text
      chips = []
    }
    control.staged = draft.files.map { StagedFile(name: $0.name, data: $0.data) }
    if let replyTo = draft.replyTo {
      let entry = (store.transcripts[agentId] ?? []).first { $0.id == replyTo }
      control.reply = ChatControl.Reply(id: replyTo, line: Chat.quoteLine(entry, limit: 72), placeholder: Chat.replyPlaceholder(entry))
    }
    control.focusCount += 1
  }

  private func field(placeholder: String) -> some View {
    MessageField(text: $text, chips: $chips, height: $fieldHeight, ink: NSColor(look.ink), look: look, focusKey: "\(agentId)#\(threadRoot ?? "")#\(control.focusCount)", handle: handle, onSend: send, onEscape: {
      // Escape while listening drops the recording (the chip's own Escape); else it lets go of a reply.
      if dictation.phase != .idle {
        dictation.cancel()
        return true
      }
      guard control.reply != nil else { return false }
      control.reply = nil
      return true
    }, onTrigger: { picks.update($0) }, onListKey: { listKey($0) }, onFiles: { control.stage($0) })
    .overlay(alignment: .topLeading) {
      if text.isEmpty {
        Text(placeholder)
          .font(.system(size: 14))
          .foregroundStyle(look.placeholder)
          .lineLimit(1)
          .cssLineHeight(20, size: 14)
          .allowsHitTesting(false)
      }
    }
    .overlay(alignment: .topLeading) { list }
  }

  /**
   * The open list, 4 over the trigger's line and from its left (kept
   * inside the chat at the right), over the messages.
   */
  @ViewBuilder
  private var list: some View {
    if let request = picks.request {
      let rows = picks.rows(agentId: agentId, store: store)
      let empty = rows.isEmpty ? picks.emptyLine(agentId: agentId, store: store) : nil
      if !rows.isEmpty || empty != nil {
        let listWidth: CGFloat = request.kind == .emoji ? 320 : 360
        // Where the words start: 13 in the stacked form (more lines, a reply, files, a line over the words), 45 on one line.
        let fieldLeft: CGFloat = stacked || control.reply != nil || !control.staged.isEmpty || !noticeLines.isEmpty ? 13 : 45
        let x = max(0, min(request.anchor.minX, width + 16 - fieldLeft - listWidth))
        PickList(kind: request.kind, rows: rows, empty: empty, selected: picks.selected, look: look,
                 hover: { picks.selected = $0 }, choose: { choose($0) })
          .alignmentGuide(.leading) { _ in -x }
          .alignmentGuide(.top) { box in box[.bottom] - (request.anchor.minY - 4) }
      }
    }
  }

  /** A key the field passes while a list is open: true when the list used it. */
  private func listKey(_ key: ListKey) -> Bool {
    guard picks.request != nil else { return false }
    let rows = picks.rows(agentId: agentId, store: store)
    // "#" and ":" with nothing found show nothing: their keys are the field's.
    guard !rows.isEmpty || picks.emptyLine(agentId: agentId, store: store) != nil else { return false }
    switch key {
    case .close:
      picks.dismiss()
      return true
    case .up, .down:
      guard !rows.isEmpty else { return false }
      let step = key == .up ? -1 : 1
      picks.selected = ((picks.selected + step) % rows.count + rows.count) % rows.count
      return true
    case .choose:
      guard !rows.isEmpty else { return false }
      choose(rows[min(max(picks.selected, 0), rows.count - 1)])
      return true
    }
  }

  /** A row picked: a mention, a skill, a pull request or an emoji goes into the words; an action runs. */
  private func choose(_ row: PickRow) {
    guard let request = picks.request else { return }
    switch row {
    case .mention(let mention):
      picks.rememberMention(mention.key)
      switch mention.insert {
      case .mention(let id, let label):
        handle.pick(.mention(id: id, label: label), replacing: request.range)
      case .workflow(let id, let label, let iconId, let iconURL):
        handle.pick(.workflow(id: id, label: label, iconId: iconId, iconURL: iconURL), replacing: request.range)
      }
    case .slash(.skill(let skill)):
      handle.pick(.workflow(id: skill.id, label: skill.name, iconId: skill.iconId, iconURL: skill.iconURL), replacing: request.range)
    case .slash(.action(let action)):
      handle.replace(request.range, with: "")
      run(action)
    case .pull(let pull):
      handle.pick(.pullRequest(number: pull.number, title: pull.title, url: pull.url), replacing: request.range)
    case .emoji(let emoji):
      picks.rememberEmoji(emoji.id)
      handle.replace(request.range, with: emoji.character + " ")
    }
  }

  /**
   * An action from "/": the themes now; the views, panes and Settings
   * they open come with their steps (mac/STEPS.md, 2e).
   */
  private func run(_ action: ComposerLists.Action) {
    switch action.id {
    case "theme:system": MacTheme.set("system")
    case "theme:light": MacTheme.set("light")
    case "theme:dark": MacTheme.set("dark")
    default: break
    }
  }

  /**
   * One line or stacked, as the window decides (`Zan`): stacked for a new
   * line or words that wrap at the one-line width; back to one line, after
   * an edit, only for under 48 characters that fit on it.
   */
  private func relayout(edited: Bool) {
    guard width > 0 else { return }
    let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let compactWidth = width - 45 - (empty ? 45 : 81)
    let newline = text.contains("\n") || text.contains("\r")
    let wraps = MessageField.height(of: text, width: compactWidth) >= 39
    if newline || wraps {
      if !stacked { stacked = true }
      return
    }
    guard stacked, edited else { return }
    if text.isEmpty || (text.count < 48 && MessageField.lineWidth(of: text) <= compactWidth) {
      stacked = false
    }
  }

  private func send() {
    let words = ComposerDocument.prompt(text)
    let files = control.staged.map { (name: $0.name, data: $0.data) }
    guard !words.isEmpty || !files.isEmpty else { return }
    // The editor's document goes with the words when they hold a pick (`richText`).
    let richText = chips.isEmpty ? nil : ComposerDocument.richText(text, chips: chips)
    let answering = control.reply?.id ?? threadRoot
    text = ""
    chips = []
    control.staged = []
    control.reply = nil
    picks.update(nil)
    store.setDraft("", for: agentId)
    let inThread = threadRoot != nil
    Task { await store.send(words, to: agentId, attachments: files, replyTo: answering, inThread: inThread, richText: richText) }
  }
}

/**
 * Attach file (`sand-prompt-attach`): a 30-point glass disc with a plus,
 * the Mac's open panel for several files; off once six wait.
 */
private struct AttachButton: View {
  let look: Look
  let full: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "plus")
        .font(.system(size: 15, weight: .regular))
        .foregroundStyle(look.dark ? Color.white.opacity(0.86) : Color.black.opacity(0.78))
        .frame(width: 30, height: 30)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .glassEffect(.regular, in: .circle)
    .disabled(full)
    .opacity(full ? 0.4 : 1)
    .help("Attach file")
    .accessibilityLabel("Attach file")
  }
}

/** Send (`sand-prompt-send`): 28, the window's blue, the white arrow. */
private struct SendButton: View {
  let look: Look
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "arrow.up")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Color.white)
        .frame(width: 28, height: 28)
        .background(look.yours, in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .help("Send message")
    .accessibilityLabel("Send message")
  }
}

/**
 * Start voice input (`sand-prompt-mic`): while the field is empty, 28 in the
 * window's blue with a white microphone; with words, a grey one (at 60%)
 * beside Send.
 */
private struct MicButton: View {
  let prominent: Bool
  let look: Look
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "mic")
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(prominent ? Color.white : look.inkSecondary)
        .frame(width: 28, height: 28)
        .background(prominent ? look.yours : Color.clear, in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .help("Start voice input")
    .accessibilityLabel("Start voice input")
  }
}

/**
 * The words being written: Apple's own text view, 14 on 20, growing a line
 * at a time. Return sends; Shift-Return (and Option-Return, as in every Mac
 * text view) starts a new line; a word still being composed (Japanese,
 * Chinese) takes its Return first. It takes the keys when its chat opens.
 * A pick from a list ("@", "/", "#") sits in the words as one piece (the
 * window's editor node), which Delete takes whole; what is pasted comes in
 * as plain words. While a list is open its keys go to it: ↑ and ↓ choose,
 * Return and Tab pick, Escape puts it away.
 */
struct MessageField: NSViewRepresentable {
  /** The words as sent, a pick as its words ("@Nora"). */
  @Binding var text: String
  /** The picks in `text`. */
  @Binding var chips: [ComposerChip]
  @Binding var height: CGFloat
  let ink: NSColor
  let look: Look
  let focusKey: String
  let handle: FieldHandle
  let onSend: () -> Void
  /** Escape: true when it was used (a reply let go). */
  var onEscape: () -> Bool = { false }
  /** The list a trigger before the caret opens, or none. */
  var onTrigger: (PickRequest?) -> Void = { _ in }
  /** A key while a list is open: true when the list used it. */
  var onListKey: (ListKey) -> Bool = { _ in false }
  /** Files pasted or dropped on the words (the window stages them, `onStageFiles`). */
  var onFiles: ([IncomingFile]) -> Void = { _ in }
  @Environment(AppStore.self) private var store

  static let font = NSFont.systemFont(ofSize: 14)

  /** The words' height at a width: 20 a line. */
  static func height(of text: String, width: CGFloat) -> CGFloat {
    guard width > 1 else { return 20 }
    var string = text
    if string.isEmpty || string.hasSuffix("\n") { string += " " }
    let box = (string as NSString).boundingRect(
      with: NSSize(width: width, height: CGFloat.greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      attributes: attributes(.textColor),
      context: nil)
    return max(20, ceil(box.height))
  }

  /** The words' width on one line. */
  static func lineWidth(of text: String) -> CGFloat {
    ceil((text as NSString).size(withAttributes: [.font: font]).width)
  }

  static func attributes(_ ink: NSColor) -> [NSAttributedString.Key: Any] {
    let style = NSMutableParagraphStyle()
    style.minimumLineHeight = 20
    style.maximumLineHeight = 20
    // The line's spare room split above and below the words, as CSS does.
    let spare = 20 - (font.ascender - font.descender + font.leading)
    return [.font: font, .paragraphStyle: style, .foregroundColor: ink, .baselineOffset: spare / 4]
  }

  /** A pick as one character of the text: its chip's picture. */
  @MainActor
  static func chipString(_ node: ComposerChip.Node, look: Look, store: AppStore, attributes: [NSAttributedString.Key: Any]) -> NSAttributedString {
    let piece = NSMutableAttributedString(attributedString: NSAttributedString(attachment: ChipAttachment(node: node, image: ChipLabel.image(node, look: look, store: store))))
    var kept = attributes
    kept[.baselineOffset] = nil
    piece.addAttributes(kept, range: NSRange(location: 0, length: piece.length))
    return piece
  }

  /** The draft and its picks as the field's text. */
  @MainActor
  static func attributed(_ draft: String, chips: [ComposerChip], ink: NSColor, look: Look, store: AppStore) -> NSAttributedString {
    let attributes = MessageField.attributes(ink)
    let out = NSMutableAttributedString()
    let chars = Array(draft)
    var cursor = 0
    for chip in chips.sorted(by: { $0.start < $1.start }) where chip.start >= cursor && chip.end <= chars.count && String(chars[chip.start..<chip.end]) == chip.text {
      out.append(NSAttributedString(string: String(chars[cursor..<chip.start]), attributes: attributes))
      out.append(chipString(chip.node, look: look, store: store, attributes: attributes))
      cursor = chip.end
    }
    out.append(NSAttributedString(string: String(chars[cursor...]), attributes: attributes))
    return out
  }

  /** The field's text as the draft (a pick as its words) and its picks. */
  static func document(_ storage: NSAttributedString) -> (draft: String, chips: [ComposerChip]) {
    var draft = ""
    var count = 0
    var chips: [ComposerChip] = []
    let string = storage.string as NSString
    storage.enumerateAttribute(.attachment, in: NSRange(location: 0, length: storage.length)) { value, range, _ in
      if let chip = value as? ChipAttachment {
        for _ in 0..<range.length {
          chips.append(ComposerChip(start: count, node: chip.node))
          draft += chip.node.text
          count += chip.node.text.count
        }
      } else {
        let words = string.substring(with: range).replacingOccurrences(of: "\u{FFFC}", with: "")
        draft += words
        count += words.count
      }
    }
    return (draft, chips)
  }

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeNSView(context: Context) -> NSScrollView {
    let scroll = NSScrollView()
    scroll.drawsBackground = false
    scroll.borderType = .noBorder
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    scroll.hasHorizontalScroller = false
    // TextKit 1: the lists find the trigger's place through its layout manager.
    let view = FieldTextView(usingTextLayoutManager: false)
    view.delegate = context.coordinator
    view.drawsBackground = false
    // Rich, for the picks; what is pasted comes in plain (`paste`).
    view.isRichText = true
    view.importsGraphics = false
    view.allowsImageEditing = false
    view.allowsUndo = true
    view.isAutomaticQuoteSubstitutionEnabled = false
    view.isAutomaticDashSubstitutionEnabled = false
    view.isAutomaticTextReplacementEnabled = false
    view.textContainerInset = .zero
    view.textContainer?.lineFragmentPadding = 0
    view.textContainer?.widthTracksTextView = true
    view.textContainer?.containerSize = NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude)
    view.isVerticallyResizable = true
    view.isHorizontallyResizable = false
    view.autoresizingMask = [.width]
    view.minSize = NSSize(width: 0, height: 20)
    view.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
    let attributes = MessageField.attributes(ink)
    view.typingAttributes = attributes
    view.defaultParagraphStyle = attributes[.paragraphStyle] as? NSParagraphStyle
    view.textStorage?.setAttributedString(MessageField.attributed(text, chips: chips, ink: ink, look: look, store: store))
    view.onResize = { [weak coordinator = context.coordinator, weak view] in
      guard let coordinator, let view else { return }
      coordinator.measure(view)
    }
    view.wantsFocus = true
    view.onFiles = { [weak coordinator = context.coordinator] files in coordinator?.parent.onFiles(files) }
    scroll.documentView = view
    let coordinator = context.coordinator
    coordinator.focusedKey = focusKey
    coordinator.shown = (text, chips)
    coordinator.dark = look.dark
    handle.view = view
    handle.store = store
    handle.look = look
    handle.ink = ink
    return scroll
  }

  func updateNSView(_ scroll: NSScrollView, context: Context) {
    let coordinator = context.coordinator
    coordinator.parent = self
    guard let view = scroll.documentView as? FieldTextView else { return }
    handle.view = view
    handle.store = store
    handle.look = look
    handle.ink = ink
    let attributes = MessageField.attributes(ink)
    let shown = coordinator.shown
    let themeChanged = coordinator.dark != look.dark
    if themeChanged || shown.draft != text || shown.chips != chips {
      // Words set from outside (a draft brought back, a message sent), or the theme's colours for the picks.
      let fromOutside = shown.draft != text || shown.chips != chips
      let selection = view.selectedRange()
      coordinator.rebuilding = true
      view.typingAttributes = attributes
      view.textStorage?.setAttributedString(MessageField.attributed(text, chips: chips, ink: ink, look: look, store: store))
      let length = (view.string as NSString).length
      // A draft brought back into an empty field puts the caret at its end.
      view.setSelectedRange(NSRange(location: shown.draft.isEmpty ? length : min(selection.location, length), length: 0))
      coordinator.rebuilding = false
      // Undo would replay typing on words that are gone.
      if fromOutside { coordinator.undo.removeAllActions() }
      coordinator.shown = (text, chips)
      coordinator.dark = look.dark
      coordinator.measure(view)
      // Not while SwiftUI lays the window out.
      DispatchQueue.main.async { [weak view, weak coordinator] in
        guard let view, let coordinator else { return }
        coordinator.report(view)
      }
    } else if (view.typingAttributes[.foregroundColor] as? NSColor) != ink {
      view.typingAttributes = attributes
    }
    if coordinator.focusedKey != focusKey {
      coordinator.focusedKey = focusKey
      DispatchQueue.main.async { view.window?.makeFirstResponder(view) }
    }
  }

  @MainActor
  final class Coordinator: NSObject, NSTextViewDelegate {
    var parent: MessageField
    var focusedKey: String?
    /** The draft and picks the field shows, so words set from outside are told from typing. */
    var shown: (draft: String, chips: [ComposerChip]) = ("", [])
    var dark = false
    /** The words are being set from outside: the selection's change is not the person's. */
    var rebuilding = false
    /** The field's own undo, cleared when its words are set from outside. */
    let undo = UndoManager()

    init(_ parent: MessageField) { self.parent = parent }

    func undoManager(for view: NSTextView) -> UndoManager? { undo }

    func textDidChange(_ notification: Notification) {
      guard let view = notification.object as? NSTextView, let storage = view.textStorage else { return }
      let document = MessageField.document(storage)
      shown = document
      parent.text = document.draft
      parent.chips = document.chips
      measure(view)
      report(view)
    }

    func textViewDidChangeSelection(_ notification: Notification) {
      guard !rebuilding, let view = notification.object as? NSTextView else { return }
      report(view)
    }

    func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
      guard !textView.hasMarkedText() else { return false }
      // An open list takes its keys first.
      let key: ListKey? = switch selector {
      case #selector(NSResponder.moveUp(_:)): .up
      case #selector(NSResponder.moveDown(_:)): .down
      case #selector(NSResponder.insertTab(_:)): .choose
      case #selector(NSResponder.insertNewline(_:)): NSApp.currentEvent?.modifierFlags.contains(.shift) == true ? nil : .choose
      case #selector(NSResponder.cancelOperation(_:)): .close
      default: nil
      }
      if let key, parent.onListKey(key) { return true }
      if selector == #selector(NSResponder.cancelOperation(_:)) {
        return parent.onEscape()
      }
      guard selector == #selector(NSResponder.insertNewline(_:)) else { return false }
      if NSApp.currentEvent?.modifierFlags.contains(.shift) == true {
        textView.insertNewlineIgnoringFieldEditor(nil)
        return true
      }
      parent.onSend()
      return true
    }

    /**
     * The list the words before the caret open (`cAe`): "@", "/" or "#" at
     * the start, after a space or "(", in the words after the last pick;
     * else ":" and two letters for emoji. None while a word is being
     * composed or words are chosen.
     */
    func report(_ view: NSTextView) {
      let selection = view.selectedRange()
      guard !view.hasMarkedText(), selection.length == 0 else { parent.onTrigger(nil); return }
      let string = view.string as NSString
      let caret = min(selection.location, string.length)
      let before = string.substring(to: caret)
      let lastPick = (before as NSString).range(of: "\u{FFFC}", options: .backwards)
      let pickEnd = lastPick.location == NSNotFound ? 0 : lastPick.location + 1
      let chipEnd = (before as NSString).substring(to: pickEnd).count
      for (character, kind) in [(Character("@"), PickRequest.Kind.mention), ("/", .slash), ("#", .pull)] {
        guard let found = ComposerLists.trigger(character, in: before, after: chipEnd) else { continue }
        let at = (String(before.prefix(found.at)) as NSString).length
        parent.onTrigger(PickRequest(kind: kind, query: found.query, range: NSRange(location: at, length: caret - at), anchor: anchor(at, in: view)))
        return
      }
      let tail = (before as NSString).substring(from: pickEnd)
      if let query = EmojiCatalog.query(tail) {
        let colon = (before as NSString).range(of: ":", options: .backwards).location
        if colon != NSNotFound {
          parent.onTrigger(PickRequest(kind: .emoji, query: query, range: NSRange(location: colon, length: caret - colon), anchor: anchor(colon, in: view)))
          return
        }
      }
      parent.onTrigger(nil)
    }

    /** The trigger's line in the field, from the field's top left. */
    func anchor(_ location: Int, in view: NSTextView) -> CGRect {
      guard let manager = view.layoutManager, let container = view.textContainer, location < (view.string as NSString).length else { return .zero }
      manager.ensureLayout(for: container)
      let glyph = manager.glyphIndexForCharacter(at: location)
      let line = manager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil)
      let mark = manager.boundingRect(forGlyphRange: NSRange(location: glyph, length: 1), in: container)
      let scrolled = view.enclosingScrollView?.contentView.bounds.origin.y ?? 0
      return CGRect(x: mark.minX, y: line.minY - scrolled, width: mark.width, height: line.height)
    }

    /** The words' height at the field's width: 20 a line. */
    func measure(_ view: NSTextView) {
      let width = view.bounds.width
      guard width > 1, let manager = view.layoutManager, let container = view.textContainer else { return }
      manager.ensureLayout(for: container)
      let next = max(20, ceil(manager.usedRect(for: container).height))
      guard abs(parent.height - next) > 0.5 else { return }
      // Not while SwiftUI lays the window out.
      DispatchQueue.main.async { [weak self] in
        guard let self, abs(self.parent.height - next) > 0.5 else { return }
        self.parent.height = next
      }
    }
  }
}

/**
 * The field's text view: says when its width changes, takes the keys once
 * it is in a window, and pastes plain words; files and pictures pasted or
 * dropped on it go to the files waiting to go.
 */
final class FieldTextView: NSTextView {
  var onResize: (() -> Void)?
  var wantsFocus = false
  var onFiles: (([IncomingFile]) -> Void)?

  /** Plain words only, pasted or dropped (files are taken before this, in `paste` and the drag). */
  override var readablePasteboardTypes: [NSPasteboard.PasteboardType] { [.string] }

  override func paste(_ sender: Any?) {
    if let files = FieldTextView.files(on: NSPasteboard.general), !files.isEmpty {
      onFiles?(files)
      return
    }
    pasteAsPlainText(sender)
  }

  /** Files a pasteboard holds: paths, else a picture's bytes (as "image.png"). */
  static func files(on board: NSPasteboard) -> [IncomingFile]? {
    if let urls = board.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty {
      return urls.map(IncomingFile.url)
    }
    // Office and iWork put a picture of copied words beside them: the words win. A screenshot has no words.
    if let words = board.string(forType: .string), !words.isEmpty { return nil }
    if let png = board.data(forType: .png) { return [.data(name: "image.png", data: png)] }
    if let tiff = board.data(forType: .tiff), let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) {
      return [.data(name: "image.png", data: png)]
    }
    return nil
  }

  override var acceptableDragTypes: [NSPasteboard.PasteboardType] {
    super.acceptableDragTypes.contains(.fileURL) ? super.acceptableDragTypes : super.acceptableDragTypes + [.fileURL]
  }

  private static func holdsFiles(_ sender: any NSDraggingInfo) -> Bool {
    sender.draggingPasteboard.canReadObject(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true])
  }

  override func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
    FieldTextView.holdsFiles(sender) ? .copy : super.draggingEntered(sender)
  }

  override func draggingUpdated(_ sender: any NSDraggingInfo) -> NSDragOperation {
    FieldTextView.holdsFiles(sender) ? .copy : super.draggingUpdated(sender)
  }

  override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
    if let urls = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL], !urls.isEmpty {
      onFiles?(urls.map(IncomingFile.url))
      return true
    }
    return super.performDragOperation(sender)
  }

  override func setFrameSize(_ newSize: NSSize) {
    let changed = abs(newSize.width - frame.width) > 0.5
    super.setFrameSize(newSize)
    if changed { onResize?() }
  }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    guard wantsFocus, let window else { return }
    wantsFocus = false
    DispatchQueue.main.async { [weak self, weak window] in
      guard let self, let window else { return }
      window.makeFirstResponder(self)
    }
  }
}
