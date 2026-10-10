import AppKit
import SwiftUI
import SimeonCore

/**
 * The full emoji picker (More emoji, `Choose an emoji`): 294 by 320 on the
 * raised ground. Its head (padded 4) holds the search (the glass 14 at
 * 40%, "Search emoji" 13, in a 32-high row padded 0 4 0 8), a hairline
 * (10%) under it; then every category from Smileys & emotion to Flags,
 * each titled (12 on 16, at 60%, 8 above and 6 below) over its emoji, 8 to
 * a row in 32-point cells (the emoji 20, 6 round, grey under the pointer
 * and for the person's own reactions), 2 apart, 12 in from each side.
 * Typed words show "Results", or "No emoji found". A pick reacts and
 * closes; Return picks the first result.
 */
struct EmojiPicker: View {
  let look: Look
  let mine: Set<String>
  let pick: (String) -> Void
  @State private var query = ""
  @FocusState private var searching: Bool

  private static let columns = Array(repeating: GridItem(.fixed(32), spacing: 2), count: 8)

  var body: some View {
    let typed = !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let found = typed ? EmojiCatalog.search(query) : []
    VStack(spacing: 0) {
      HStack(spacing: 4) {
        Image(systemName: "magnifyingglass")
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(look.inkTertiary)
          .frame(width: 14, height: 14)
        TextField("Search emoji", text: $query)
          .textFieldStyle(.plain)
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .focused($searching)
          .onSubmit { if let first = found.first { pick(first.character) } }
          .accessibilityLabel("Search emoji")
      }
      .padding(.leading, 8)
      .padding(.trailing, 4)
      .frame(height: 32)
      .padding(4)
      Rectangle().fill(look.ink.opacity(0.1)).frame(height: 1)
      ScrollView {
        LazyVStack(alignment: .leading, spacing: 2) {
          if typed {
            if found.isEmpty {
              Text("No emoji found")
                .font(.system(size: 12))
                .foregroundStyle(look.inkSecondary)
                .padding(.top, 8)
            } else {
              section("Results", found)
            }
          } else {
            ForEach(EmojiCatalog.categories) { category in
              section(category.label, category.emojis)
            }
          }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
      }
    }
    .frame(width: 294, height: 320)
    .background(look.elevated)
    .defaultFocus($searching, true)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Choose an emoji")
  }

  private func section(_ title: String, _ emojis: [Emoji]) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title)
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
        .frame(height: 16)
        .padding(.top, 8)
        .padding(.bottom, 6)
      LazyVGrid(columns: EmojiPicker.columns, alignment: .leading, spacing: 2) {
        ForEach(emojis) { emoji in
          EmojiCell(emoji: emoji, mine: mine.contains(emoji.character), look: look) { pick(emoji.character) }
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(title)
  }
}

private struct EmojiCell: View {
  let emoji: Emoji
  let mine: Bool
  let look: Look
  let action: () -> Void
  @State private var hovered = false

  var body: some View {
    Button(action: action) {
      Text(emoji.character)
        .font(.system(size: 20))
        .frame(width: 32, height: 32)
        .background(hovered || mine ? look.rowHover : .clear, in: RoundedRectangle(cornerRadius: 6))
        .contentShape(RoundedRectangle(cornerRadius: 6))
    }
    .buttonStyle(.plain)
    .onHover { hovered = $0 }
    .help(emoji.name)
    .accessibilityLabel("React with \(emoji.name)")
  }
}

/**
 * The picker where More emoji was chosen, in a Mac popover (it closes on a
 * click outside or Escape); the message's hover bar stays while it is open.
 */
@MainActor
enum EmojiPopover {
  static func show(look: Look, mine: Set<String>, holding id: String, control: ChatControl, pick: @escaping (String) -> Void) {
    guard let window = NSApp.keyWindow, let content = window.contentView else { return }
    let popover = NSPopover()
    popover.behavior = .transient
    popover.animates = true
    let closer = Closer(control: control, id: id)
    popover.delegate = closer
    popover.contentViewController = NSHostingController(rootView: EmojiPicker(look: look, mine: mine) { [weak popover] emoji in
      pick(emoji)
      popover?.performClose(nil)
    })
    popover.contentSize = NSSize(width: 294, height: 320)
    // The delegate lives as long as the popover.
    objc_setAssociatedObject(popover, &MessageMenu.Handler.key, closer, .OBJC_ASSOCIATION_RETAIN)
    let point = content.convert(window.mouseLocationOutsideOfEventStream, from: nil)
    control.menuFor = id
    popover.show(relativeTo: NSRect(x: point.x, y: point.y, width: 1, height: 1), of: content, preferredEdge: .minY)
  }

  @MainActor
  final class Closer: NSObject, NSPopoverDelegate {
    let control: ChatControl
    let id: String

    init(control: ChatControl, id: String) {
      self.control = control
      self.id = id
    }

    /** Shown: the hover bar is held (the reactions menu let it go as it closed), and the search takes the keys. */
    func popoverDidShow(_ notification: Notification) {
      control.menuFor = id
      (notification.object as? NSPopover)?.contentViewController?.view.window?.makeKey()
    }

    func popoverDidClose(_ notification: Notification) {
      if control.menuFor == id { control.menuFor = nil }
    }
  }
}
