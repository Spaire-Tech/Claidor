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
  @State private var fieldHeight: CGFloat = 20
  @State private var stacked = false
  @State private var width: CGFloat = 0

  /** Six lines of 20 (`nze`), then the words scroll. */
  static let tallest: CGFloat = 120

  var body: some View {
    let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let reply = control.reply
    let expanded = stacked || reply != nil
    let shown = min(fieldHeight, Composer.tallest)
    // On one line the frame is 44; stacked, 9 over the words, the reply's 36, and 47 under them for the buttons.
    let height = expanded ? 9 + (reply == nil ? 0 : 36) + shown + 47 : 44
    let trailing: CGFloat = empty ? 45 : 81
    ZStack(alignment: .top) {
      VStack(alignment: .leading, spacing: 6) {
        if let reply {
          ReplyPill(reply: reply, look: look) { control.reply = nil }
        }
        field(placeholder: reply?.placeholder ?? "Message \(name)")
          .frame(height: shown)
      }
      .padding(.top, expanded ? 9 : 11)
      .padding(.leading, expanded ? 13 : 45)
      .padding(.trailing, expanded ? 13 : trailing)
      .frame(maxHeight: .infinity, alignment: .top)
      HStack(spacing: 8) {
        AttachButton(look: look)
        Spacer(minLength: 0)
        if !empty {
          MicButton(prominent: false, look: look)
        }
        if empty {
          MicButton(prominent: true, look: look)
        } else {
          SendButton(look: look, action: send)
        }
      }
      .frame(height: 30)
      .padding(.horizontal, 9)
      .padding(.bottom, 8)
      .frame(maxHeight: .infinity, alignment: .bottom)
    }
    .frame(maxWidth: .infinity)
    .frame(height: height)
    .background(look.composer, in: RoundedRectangle(cornerRadius: expanded ? 18 : 22))
    .overlay { RoundedRectangle(cornerRadius: expanded ? 18 : 22).strokeBorder(look.composerEdge, lineWidth: 1) }
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
      relayout(edited: true)
    }
    .onChange(of: height, initial: true) { _, value in control.composerHeight = value }
    .onChange(of: text) { _, next in
      store.setDraft(next, for: agentId)
      relayout(edited: true)
    }
  }

  private func field(placeholder: String) -> some View {
    MessageField(text: $text, height: $fieldHeight, ink: NSColor(look.ink), focusKey: "\(agentId)#\(threadRoot ?? "")#\(control.focusCount)", onSend: send, onEscape: {
      guard control.reply != nil else { return false }
      control.reply = nil
      return true
    })
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
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !words.isEmpty else { return }
    let answering = control.reply?.id ?? threadRoot
    text = ""
    control.reply = nil
    store.setDraft("", for: agentId)
    let inThread = threadRoot != nil
    Task { await store.send(words, to: agentId, replyTo: answering, inThread: inThread) }
  }
}

/** Attach file (`sand-prompt-attach`): a 30-point glass disc with a plus. Choosing files is step 2e. */
private struct AttachButton: View {
  let look: Look

  var body: some View {
    Button {} label: {
      Image(systemName: "plus")
        .font(.system(size: 15, weight: .regular))
        .foregroundStyle(look.dark ? Color.white.opacity(0.86) : Color.black.opacity(0.78))
        .frame(width: 30, height: 30)
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .glassEffect(.regular, in: .circle)
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
 * beside Send. Dictation itself is step 2e.
 */
private struct MicButton: View {
  let prominent: Bool
  let look: Look

  var body: some View {
    Button {} label: {
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
 * The words being written: Apple's own text view, plain text, 14 on 20,
 * growing a line at a time. Return sends; Shift-Return (and Option-Return,
 * as in every Mac text view) starts a new line; a word still being
 * composed (Japanese, Chinese) takes its Return first. It takes the keys
 * when its chat opens.
 */
struct MessageField: NSViewRepresentable {
  @Binding var text: String
  @Binding var height: CGFloat
  let ink: NSColor
  let focusKey: String
  let onSend: () -> Void
  /** Escape: true when it was used (a reply let go). */
  var onEscape: () -> Bool = { false }

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

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeNSView(context: Context) -> NSScrollView {
    let scroll = NSScrollView()
    scroll.drawsBackground = false
    scroll.borderType = .noBorder
    scroll.hasVerticalScroller = true
    scroll.autohidesScrollers = true
    scroll.hasHorizontalScroller = false
    let view = FieldTextView(frame: .zero)
    view.delegate = context.coordinator
    view.drawsBackground = false
    view.isRichText = false
    view.importsGraphics = false
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
    view.string = text
    view.onResize = { [weak coordinator = context.coordinator, weak view] in
      guard let coordinator, let view else { return }
      coordinator.measure(view)
    }
    view.wantsFocus = true
    scroll.documentView = view
    context.coordinator.focusedKey = focusKey
    return scroll
  }

  func updateNSView(_ scroll: NSScrollView, context: Context) {
    let coordinator = context.coordinator
    coordinator.parent = self
    guard let view = scroll.documentView as? FieldTextView else { return }
    let attributes = MessageField.attributes(ink)
    if (view.typingAttributes[.foregroundColor] as? NSColor) != ink {
      view.typingAttributes = attributes
      view.textStorage?.addAttribute(.foregroundColor, value: ink, range: NSRange(location: 0, length: view.textStorage?.length ?? 0))
    }
    if view.string != text {
      view.string = text
      view.textStorage?.setAttributes(attributes, range: NSRange(location: 0, length: view.textStorage?.length ?? 0))
      coordinator.measure(view)
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

    init(_ parent: MessageField) { self.parent = parent }

    func textDidChange(_ notification: Notification) {
      guard let view = notification.object as? NSTextView else { return }
      parent.text = view.string
      measure(view)
    }

    func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
      if selector == #selector(NSResponder.cancelOperation(_:)), !textView.hasMarkedText() {
        return parent.onEscape()
      }
      guard selector == #selector(NSResponder.insertNewline(_:)), !textView.hasMarkedText() else { return false }
      if NSApp.currentEvent?.modifierFlags.contains(.shift) == true {
        textView.insertNewlineIgnoringFieldEditor(nil)
        return true
      }
      parent.onSend()
      return true
    }

    /** The words' height at the field's width: 20 a line. */
    func measure(_ view: NSTextView) {
      let width = view.bounds.width
      guard width > 1 else { return }
      let next = MessageField.height(of: view.string, width: width)
      guard abs(parent.height - next) > 0.5 else { return }
      // Not while SwiftUI lays the window out.
      DispatchQueue.main.async { [weak self] in
        guard let self, abs(self.parent.height - next) > 0.5 else { return }
        self.parent.height = next
      }
    }
  }
}

/** The field's text view: says when its width changes, and takes the keys once it is in a window. */
final class FieldTextView: NSTextView {
  var onResize: (() -> Void)?
  var wantsFocus = false

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
