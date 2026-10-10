import AppKit
import SwiftUI
import SimeonCore

/**
 * The message field (`sand-chat-input-dock`, padded 0 16 16): a frame 44
 * high and 22 round with a hairline and a soft shadow (`#fcfcfc` and the
 * text at 30%; `#212121` and `#2e2e2e` on dark, no shadow), the words 44
 * in from each side (14 on 20), "Message <name>" at 30% while empty.
 * Attach (a 30-point glass disc, step 2e) at the left and send at the
 * right (28, the window's blue), 8 in from the frame and 8 up from its
 * bottom: the microphone while empty (dictation, step 2e), the arrow once
 * there are words. Return sends, Shift-Return starts a new line, and what
 * is typed is kept per chat (the window's draft). The ground runs from the
 * frame's middle to the window's bottom.
 */
struct Composer: View {
  let agentId: String
  let name: String
  let look: Look
  @Environment(AppStore.self) private var store
  @State private var text = ""
  @State private var fieldHeight: CGFloat = 20

  /** The field grows with its words to ten lines, then scrolls. */
  static let tallest: CGFloat = 200

  var body: some View {
    let shown = min(fieldHeight, Composer.tallest)
    // One line sits in 42 inside the hairline (the window's 44-point frame); more lines add their 20 each.
    let inner = shown <= 20 ? 42 : shown + 24
    let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    ZStack(alignment: .bottom) {
      MessageField(text: $text, height: $fieldHeight, ink: NSColor(look.ink), focusKey: agentId, onSend: send)
        .frame(height: shown)
        .overlay(alignment: .topLeading) {
          if text.isEmpty {
            Text("Message \(name)")
              .font(.system(size: 14))
              .foregroundStyle(look.placeholder)
              .lineLimit(1)
              .cssLineHeight(20, size: 14)
              .allowsHitTesting(false)
          }
        }
        .padding(.horizontal, 45)
        .padding(.bottom, 13)
      HStack(spacing: 0) {
        AttachButton(look: look)
        Spacer(minLength: 0)
        SendButton(empty: empty, look: look, action: send)
      }
      .frame(height: 28)
      .padding(.horizontal, 9)
      .padding(.bottom, 9)
    }
    .frame(maxWidth: .infinity)
    .frame(height: inner + 2)
    .background(look.composer, in: RoundedRectangle(cornerRadius: 22))
    .overlay { RoundedRectangle(cornerRadius: 22).strokeBorder(look.composerEdge, lineWidth: 1) }
    .shadow(color: look.dark ? .clear : .black.opacity(0.05), radius: 3.5, x: 0, y: 2)
    .shadow(color: look.dark ? .clear : .black.opacity(0.03), radius: 1, x: 0, y: 1)
    .padding(.horizontal, 16)
    .padding(.bottom, 16)
    .background(alignment: .bottom) {
      look.ground.frame(height: (inner + 2) / 2 + 16)
    }
    .onAppear { text = store.drafts[agentId] ?? "" }
    .onChange(of: text) { _, next in store.setDraft(next, for: agentId) }
  }

  private func send() {
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !words.isEmpty else { return }
    text = ""
    store.setDraft("", for: agentId)
    Task { await store.send(words, to: agentId) }
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

/** Send (`sand-prompt-send`): 28, the window's blue, white glyph; the microphone while the field is empty. */
private struct SendButton: View {
  let empty: Bool
  let look: Look
  let action: () -> Void

  var body: some View {
    let label = empty ? "Start voice input" : "Send message"
    Button {
      // Dictation is step 2e.
      if !empty { action() }
    } label: {
      Image(systemName: empty ? "mic" : "arrow.up")
        .font(.system(size: 13, weight: empty ? .medium : .semibold))
        .foregroundStyle(Color.white)
        .frame(width: 28, height: 28)
        .background(look.yours, in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .help(label)
    .accessibilityLabel(label)
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

  static let font = NSFont.systemFont(ofSize: 14)

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
      var string = view.string
      if string.isEmpty || string.hasSuffix("\n") { string += " " }
      let box = (string as NSString).boundingRect(
        with: NSSize(width: width, height: CGFloat.greatestFiniteMagnitude),
        options: [.usesLineFragmentOrigin, .usesFontLeading],
        attributes: MessageField.attributes(parent.ink))
      let next = max(20, ceil(box.height))
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
