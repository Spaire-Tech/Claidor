import AppKit
import SwiftUI
import SimeonCore

/**
 * The message field (`sand-chat-input-dock`, padded 0 16 16), since the
 * Apple design pass (11 October 2026, the founder: "design the composer
 * like the iphone") in the iPhone's form (`ChatComposer`): Attach as a
 * 40-point glass disc at the left, then the field in Liquid Glass, 20
 * round, 40 high on one line and growing a line at a time (14 on 20, the
 * words 16 in and 10 over and under; six lines, 120, then they scroll).
 * At the field's right, 2 in: the grey microphone while there is nothing
 * to send (dictation, step 2e), the blue send once there is; the recording
 * chip while listening. Over the field, 6 apart and lined up with it: a
 * send's error, dictation's and the files' lines, the files, then the
 * message being answered on its own glass. Nothing opaque behind it: the
 * messages fade into the window's ground under it as they scroll (the
 * iPhone's soft edge). Return sends, Shift-Return starts a new line,
 * Escape lets go of a reply, and what is typed is kept per chat (the
 * window's draft), "Reply…" while empty under a reply.
 */
struct Composer: View {
  let agentId: String
  let name: String
  /** The open thread: what is sent goes into it. */
  let threadRoot: String?
  let look: Look
  /** Whether the field takes the keys when it appears (not under the new chat's To: line, step 5). */
  var takesKeys = true
  /** The new chat's field (step 5): what is sent goes to the people on the To: line instead; false keeps the words. */
  var onSubmit: ((String, [StagedFile]) -> Bool)? = nil
  @Environment(AppStore.self) private var store
  @Environment(ChatControl.self) private var control
  @Environment(NewChatState.self) private var newChat
  @Environment(PaneState.self) private var pane
  @Environment(WindowState.self) private var window
  @Environment(SettingsState.self) private var settings
  @Environment(PluginsState.self) private var plugins
  @Environment(SidebarLayout.self) private var layout
  @State private var text = ""
  /** The picks in the words ("@Nora" as one piece). */
  @State private var chips: [ComposerChip] = []
  @State private var fieldHeight: CGFloat = 20
  /** The composer's width and height, measured: the lists keep inside the chat, and the messages end over it. */
  @State private var width: CGFloat = 0
  @State private var height: CGFloat = 40
  /** The lists over the field (step 2e). */
  @State private var picks = ComposerPicks()
  @State private var handle = FieldHandle()
  /** Voice input (step 2e). */
  @State private var dictation = Dictation()
  /** The height of what stands over the field: the access notice (step 13) and the Allow card (step 14). */
  @State private var noticeHeight: CGFloat = 0
  /** The near-the-limit lines closed (`ApproachingClosed`), kept between launches. */
  @AppStorage(ApproachingClosed.key) private var approachingClosed = ""

  private var overField: Bool {
    store.access.notice != nil || creditsLine != nil || (agentId != NewChatState.draftKey && store.localAsks[agentId] != nil)
  }

  /** Each chat's picks while its words wait (the window keeps them in the draft's document). */
  private static var keptChips: [String: (draft: String, chips: [ComposerChip])] = [:]

  /** Six lines of 20 (`nze`), then the words scroll. */
  static let tallest: CGFloat = 120
  /** Attach's disc and the gap after it: the field starts this far in. */
  static let fieldInset: CGFloat = 48
  /** The words' place in the field: 16 in, 10 down. */
  static let wordsInset = CGSize(width: 16, height: 10)

  var body: some View {
    let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let reply = control.reply
    let files = control.staged
    // Something to send (`hasPayload`): words, or files.
    let payload = !empty || !files.isEmpty
    let lines = noticeLines
    VStack(alignment: .leading, spacing: 6) {
      // Over the field and lined up with it, in the iPhone's order: the lines, the files, the message being answered.
      ForEach(lines) { line in
        Text(line.text)
          .font(.system(size: 11))
          .foregroundStyle(line.isError ? look.danger : look.inkTertiary)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(height: 14)
          .padding(.leading, Composer.fieldInset + Composer.wordsInset.width)
          .accessibilityAddTraits(.updatesFrequently)
      }
      if !files.isEmpty {
        AttachmentStrip(files: files, look: look) { control.unstage($0) }
          .padding(.leading, Composer.fieldInset)
      }
      if let reply {
        ReplyPill(reply: reply, look: look) { control.reply = nil }
          .padding(.leading, Composer.fieldInset)
      }
      HStack(alignment: .bottom, spacing: 8) {
        AttachButton(look: look, full: files.count >= AttachmentLimits.maxStaged) { control.chooseFiles() }
        fieldBox(payload: payload, placeholder: placeholder(reply: reply, hasFiles: !files.isEmpty))
      }
      // The open list hangs from the words, over the messages (outside the field's glass).
      .overlay(alignment: .topLeading) { list }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .animation(.spring(response: 0.3, dampingFraction: 0.9), value: reply?.id)
    .animation(.spring(response: 0.3, dampingFraction: 0.9), value: files.count)
    .onGeometryChange(for: CGSize.self) { proxy in proxy.size } action: { size in
      width = size.width
      height = size.height
    }
    // Over the field and as wide, 8 apart: whether this account may use Simeon (`Qvn`, step 13; sending waits under
    // it), then the agent's first waiting ask to use this Mac (`BLn`, step 14; an agent's chat only).
    .above(gap: 8) {
      let notice = store.access.notice
      let credits = notice == nil ? creditsLine : nil
      let ask = agentId == NewChatState.draftKey ? nil : store.localAsks[agentId]
      if notice != nil || credits != nil || ask != nil {
        VStack(spacing: 8) {
          if let notice { AccessNotice(words: notice, look: look) }
          if let credits {
            AccessNotice(words: credits.words, look: look, action: { settings.open(.usage) }, close: credits.key == nil ? nil : { closeApproaching(credits.key) })
          }
          if let ask { LocalAskDock(ask: ask, agentId: agentId, look: look).id(ask.entryId) }
        }
        .fixedSize(horizontal: false, vertical: true)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { noticeHeight = $0 }
      }
    }
    .padding(.horizontal, 16)
    .padding(.bottom, 16)
    .background(alignment: .bottom) { softEdge }
    .onAppear {
      text = store.drafts[agentId] ?? ""
      if let kept = Composer.keptChips[agentId], kept.draft == text { chips = kept.chips }
      // A message canceled or handed over comes in after the draft, so the draft does not cover it.
      takeBackCanceled()
    }
    .task(id: agentId) {
      // The new chat's own field has no agent's skills to read.
      if agentId != NewChatState.draftKey { await picks.load(agentId, store: store) }
    }
    // The usage read as a chat opens and as each answer ends (at most every 30 s), so the credits' line shows in time.
    .task(id: agentId) { await store.loadUsage() }
    .onChange(of: store.agent(agentId)?.isRunningTurn ?? false) { was, now in
      if was && !now { Task { await store.loadUsage() } }
    }
    // The messages end over the field and what stands over it.
    .onChange(of: height + (overField ? noticeHeight + 8 : 0), initial: true) { _, value in control.composerHeight = value }
    .onChange(of: text) { _, next in
      store.setDraft(next, for: agentId)
      // The picks go with the words as they are now (both are set together as the field changes).
      Composer.keptChips[agentId] = chips.isEmpty ? nil : (next, chips)
    }
    .onChange(of: chips) { _, next in
      Composer.keptChips[agentId] = next.isEmpty ? nil : (text, next)
    }
    // A message canceled before it went comes back here when this field is empty (the window's cancel).
    .onChange(of: store.canceledDraft?.id) { _, _ in takeBackCanceled() }
    .onAppear { dictation.onWords = { [handle] words in handle.insertDictation(words) } }
    .onDisappear { dictation.cancel() }
  }

  /** The iPhone's soft edge: the messages fade into the ground under the field, its glass over them. */
  private var softEdge: some View {
    let stops: [Gradient.Stop] = [
      Gradient.Stop(color: look.ground.opacity(0), location: 0),
      Gradient.Stop(color: look.ground.opacity(0.85), location: 0.6),
      Gradient.Stop(color: look.ground, location: 1),
    ]
    return LinearGradient(stops: stops, startPoint: .top, endPoint: .bottom)
      .frame(height: min(height, 160) + 28)
      .allowsHitTesting(false)
  }

  /** The field's words while empty (`ve`): listening, transcribing, a reply's, files', or the chat's. */
  private func placeholder(reply: ChatControl.Reply?, hasFiles: Bool) -> String {
    switch dictation.phase {
    case .asking, .recording: return "Listening…"
    case .transcribing: return "Transcribing…"
    case .idle: return reply?.placeholder ?? (hasFiles ? "Add a message, or hit send." : "Message \(name)")
    }
  }

  /**
   * The credits' line over the field (13 October 2026, as the iPhone's,
   * not red): spent, with Upgrade; else near the limit (80%, then 95%),
   * which the person can close until the next step. The key is set for the
   * line that closes.
   */
  private var creditsLine: (words: SandAccess.Words, key: String?)? {
    let outOfCredits = store.trayList.shown(for: agentId).contains(where: PhoneUpgrade.isOutOfCredits)
    if let words = PhoneUpgrade.banner(access: store.access, usage: store.usage.summary, outOfCredits: outOfCredits) { return (words, nil) }
    if let near = PhoneUpgrade.approaching(access: store.access, usage: store.usage.summary), !ApproachingClosed.contains(near.key, in: approachingClosed) {
      return (near.words, near.key)
    }
    return nil
  }

  /** The near-the-limit line closed until the next step. */
  private func closeApproaching(_ key: String?) {
    guard let key else { return }
    withAnimation(.easeOut(duration: 0.15)) { approachingClosed = ApproachingClosed.adding(key, to: approachingClosed) }
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

  /**
   * The field in glass, 20 round (the iPhone's): the words, and at the
   * right the recording chip, the spinner while transcribing, the grey
   * microphone, or the blue send. A click on the glass beside the words
   * gives them the keys, as in Messages.
   */
  private func fieldBox(payload: Bool, placeholder: String) -> some View {
    let shown = min(fieldHeight, Composer.tallest)
    let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)
    return HStack(alignment: .bottom, spacing: 4) {
      field(placeholder: placeholder)
        .frame(height: shown)
        .padding(.leading, Composer.wordsInset.width)
        .padding(.vertical, Composer.wordsInset.height)
        .frame(maxWidth: .infinity, alignment: .leading)
      fieldButton(payload: payload)
        .padding(.trailing, 2)
        .padding(.bottom, 2)
    }
    .frame(minHeight: 40)
    .background {
      Color.clear
        .contentShape(shape)
        .onTapGesture { handle.focus() }
        .pointerStyle(.horizontalText)
    }
    .liquidGlass(in: shape)
  }

  /** The control at the field's right (`sand-prompt-send`, `…-mic`, `…-voice-chip`). */
  @ViewBuilder
  private func fieldButton(payload: Bool) -> some View {
    Group {
      switch dictation.phase {
      case .asking, .recording:
        // The recording chip in Send's place (`sand-prompt-voice-chip`).
        RecordingChip(dictation: dictation, look: look) {
          Task { await dictation.stop(store: store) }
        }
        .padding(.trailing, 2)
        .frame(height: 36)
      case .transcribing:
        ProgressView()
          .controlSize(.small)
          .frame(width: 36, height: 36)
          .accessibilityLabel("Transcribing voice input…")
      case .idle:
        if payload {
          SendButton(look: look, paused: store.isSendingPaused, action: send)
            .transition(.scale(scale: 0.6).combined(with: .opacity))
        } else {
          MicButton(look: look) { dictation.start(store: store) }
            .transition(.scale(scale: 0.6).combined(with: .opacity))
        }
      }
    }
    .animation(.easeOut(duration: 0.2), value: payload)
  }

  private func field(placeholder: String) -> some View {
    MessageField(text: $text, chips: $chips, height: $fieldHeight, ink: NSColor(look.ink), look: look, focusKey: "\(agentId)#\(threadRoot ?? "")#\(control.focusCount)", handle: handle, onSend: send, onEscape: {
      // Escape while listening drops the recording (the chip's own Escape); else it lets go of a reply.
      if dictation.phase != .idle {
        dictation.cancel()
        return true
      }
      guard control.reply != nil else {
        // Nothing of its own to let go: Escape closes the new chat this field is in (`zDn`).
        if newChat.isOpen {
          newChat.close()
          return true
        }
        // Then the agent's pane, when it shows (`CDn`).
        if pane.isVisible {
          pane.close(layout: layout)
          return true
        }
        return false
      }
      control.reply = nil
      return true
    }, onTrigger: { next in
      let wasSlash = picks.request?.kind == .slash
      picks.update(next)
      // "/" opening reads its gates again (the computer may have been waking when the chat opened).
      if next?.kind == .slash, !wasSlash, agentId != NewChatState.draftKey {
        Task { await picks.readGates(agentId, store: store) }
      }
    }, onListKey: { listKey($0) }, onFiles: { control.stage($0) }, focusOnAppear: takesKeys)
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
   * inside the chat at the right), over the messages. Hung from the field's
   * row: the words start 64 in (Attach, its gap, the field's 16) and 10 down.
   */
  @ViewBuilder
  private var list: some View {
    if let request = picks.request {
      let rows = picks.rows(agentId: agentId, store: store)
      let empty = rows.isEmpty ? picks.emptyLine(agentId: agentId, store: store) : nil
      if !rows.isEmpty || empty != nil {
        let listWidth: CGFloat = request.kind == .emoji ? 320 : 360
        let wordsLeft = Composer.fieldInset + Composer.wordsInset.width
        let x = max(0, min(request.anchor.minX, width + 16 - wordsLeft - listWidth))
        // Hung by its bottom-left corner from a zero-size point 4 over the trigger's line (no custom alignment guide).
        Color.clear
          .frame(width: 0, height: 0)
          .overlay(alignment: .bottomLeading) {
            PickList(kind: request.kind, rows: rows, empty: empty, selected: picks.selected, look: look,
                     hover: { picks.selected = $0 }, choose: { choose($0) })
              .fixedSize()
          }
          .offset(x: wordsLeft + x, y: Composer.wordsInset.height + request.anchor.minY - 4)
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
   * An action from "/": the themes, the org chart (in the chat's place),
   * Chat Settings (the agent's pane on Profile), Members (on Computer),
   * Channels (its page in the pane), Settings and Plugins.
   */
  private func run(_ action: ComposerLists.Action) {
    switch action.id {
    case "org-chart", "view:org-chart": window.orgChart = true
    case "computer-update": window.computerAsk = .update
    case "info:channels": pane.open(.channels, layout: layout)
    case "info:settings": pane.open(.profile, layout: layout)
    case "info:members": pane.open(.computer, layout: layout)
    case "settings:general": settings.open(.general)
    case "settings:usage": settings.open(.usage)
    case "overlay:plugins": plugins.open()
    case "theme:system": MacTheme.set("system")
    case "theme:light": MacTheme.set("light")
    case "theme:dark": MacTheme.set("dark")
    default: break
    }
  }

  /** The new chat's words and picks moved to the chat they were meant for (the window's `setDraft` on that chat). */
  static func handOver(from: String, to: String, store: AppStore) {
    // Only words go over a chat's own draft; files alone leave it as it is.
    guard let words = store.drafts[from], !words.isEmpty else { return }
    store.setDraft(words, for: to)
    keptChips[to] = keptChips[from]
    keptChips[from] = nil
    store.setDraft("", for: from)
  }

  private func send() {
    // While the computer is rebuilt or this account has no Simeon, Send is off and Return keeps the words (decision 3; the window
    // empties the field under the access notice and sends nothing).
    guard !store.isSendingPaused else { return }
    let words = ComposerDocument.prompt(text)
    let files = control.staged.map { (name: $0.name, data: $0.data) }
    guard !words.isEmpty || !files.isEmpty else { return }
    if let onSubmit {
      // The new chat's field: the line's people get it, or nothing goes and the words stay.
      guard onSubmit(words, control.staged) else { return }
      text = ""
      chips = []
      control.staged = []
      picks.update(nil)
      store.setDraft("", for: agentId)
      return
    }
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
    // Sent from the chat shown under the To: line: the new chat closes on it.
    if newChat.isOpen, newChat.recipients.count == 1, newChat.recipients.first?.agentId == agentId { newChat.close() }
  }
}

/**
 * Attach file (`sand-prompt-attach`): the iPhone's 40-point glass disc with
 * a plus beside the field, the Mac's open panel for several files; off
 * once six wait.
 */
private struct AttachButton: View {
  let look: Look
  let full: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "plus")
        .font(.system(size: 18, weight: .regular))
        .foregroundStyle(look.dark ? Color.white.opacity(0.86) : Color.black.opacity(0.78))
        .frame(width: 40, height: 40)
        .contentShape(Circle())
    }
    .buttonStyle(.hand)
    .liquidGlass(in: .circle, interactive: true)
    .disabled(full)
    .opacity(full ? 0.4 : 1)
    .help("Attach file")
    .accessibilityLabel("Attach file")
  }
}

/** Send (`sand-prompt-send`): the iPhone's 30-point circle in the window's blue, the white arrow bold, in a 36 target; faded and off while sending waits (step 13). */
private struct SendButton: View {
  let look: Look
  var paused = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "arrow.up")
        .font(.system(size: 14, weight: .bold))
        .foregroundStyle(Color.white)
        .frame(width: 30, height: 30)
        .background(look.yours, in: Circle())
        .frame(width: 36, height: 36)
        .contentShape(Circle())
    }
    .buttonStyle(.hand)
    .disabled(paused)
    .opacity(paused ? 0.4 : 1)
    .help("Send message")
    .accessibilityLabel("Send message")
  }
}

/** Start voice input (`sand-prompt-mic`): the iPhone's grey microphone inside the field while there is nothing to send, in a 36 target. */
private struct MicButton: View {
  let look: Look
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: "mic")
        .font(.system(size: 16, weight: .regular))
        .foregroundStyle(look.inkSecondary)
        .frame(width: 36, height: 36)
        .contentShape(Circle())
    }
    .buttonStyle(.hand)
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
  /** Whether the field takes the keys when it appears (not under the new chat's To: line, which has them). */
  var focusOnAppear = true
  @Environment(AppStore.self) private var store

  static let font = NSFont.systemFont(ofSize: 14)

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
    view.wantsFocus = focusOnAppear
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
