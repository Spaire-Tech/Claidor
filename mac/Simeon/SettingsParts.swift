import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings' parts at a Mac's proportions and the app's own type (the
 * founder, 21 October 2026, with a desktop app's Settings for reference:
 * "the proportions are off… you're behaving it like a phone", then "I NEVER
 * USED BOLD… we need consistency for everything to be the same size"):
 * each group's name (`PanelType.section`) in line with its card; the card a
 * step off the ground, 16 round; its rows at least 56 high, padded 18 and
 * 14 (`SettingsRowSize`), their words (`PanelType.row`) over a line
 * (`PanelType.detail`), the lines between them inset 18 at both ends; a
 * note under the card. At the row's end: Apple's switch in the blue, a menu
 * reading "value ⌄", an action in the link blue ("Add", "Upgrade", "Check
 * Now"), a chevron or ↗.
 */
enum PanelType {
  /** A panel's title and a page's name: 17, medium, as the app's titles (never bold). */
  static let title = Font.system(size: 17, weight: .medium)
  /** A group's or a section's name: 13, medium. */
  static let section = Font.system(size: 13, weight: .medium)
  /** A row's words, its value, its action: 13. */
  static let row = Font.system(size: 13)
  /** The line under a row's words, a group's note, an app's line: 12. */
  static let detail = Font.system(size: 12)
}

/**
 * The room in a card (the founder, 22 October 2026, with another app's
 * Settings beside ours: "the boxes (not texts) are bigger"): 18 in from
 * its sides, 14 above and below the words, at least 56 a row, 16 round.
 * The words keep their sizes (`PanelType`).
 */
enum SettingsRowSize {
  static let inset: CGFloat = 18
  static let vertical: CGFloat = 14
  static let minHeight: CGFloat = 56
  static let radius: CGFloat = 16
}

extension Look {
  /** A settings page's ground: white, or #141414 on dark. */
  var groupedGround: Color { dark ? Color(hex: 0x141414) : .white }
  /** A group's card: #f4f4f4, or #262626 on dark (a step off the ground, as the reference's cards). */
  var groupedRow: Color { dark ? Color(hex: 0x262626) : Color(hex: 0xf4f4f4) }
  /** A row under the pointer: a step further. */
  var groupedRowHover: Color { dark ? Color(hex: 0x2f2f2f) : Color(hex: 0xebebeb) }
  /** The switches' blue (`Ink.blue`). */
  var settingsBlue: Color { dark ? Color(hex: 0x2f6db0) : Color(hex: 0x255a93) }
  /** An action in words ("Add", "Upgrade"): the reference's link blue. */
  var settingsAction: Color { dark ? Color(hex: 0x4c9bff) : Color(hex: 0x0a6cdf) }
  /** Done, in words (`Ink.success`): Connected, Up to date. */
  var settingsGreen: Color { dark ? Color(hex: 0x38d591) : Color(hex: 0x009957) }
}

/** A group: its name (13 medium, grey) over its card, in line with it; its note (12, grey) under it. */
struct SettingsGroup<Content: View>: View {
  var title: String? = nil
  var footer: String? = nil
  var footerTint: Color? = nil
  let look: Look
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let title {
        Text(title)
          .font(PanelType.section)
          .foregroundStyle(look.inkSecondary)
          .accessibilityAddTraits(.isHeader)
      }
      VStack(alignment: .leading, spacing: 0) { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: SettingsRowSize.radius, style: .continuous).fill(look.groupedRow))
        .clipShape(RoundedRectangle(cornerRadius: SettingsRowSize.radius, style: .continuous))
      if let footer, !footer.isEmpty {
        Text(footer)
          .font(PanelType.detail)
          .foregroundStyle(footerTint ?? look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, 8)
      }
    }
  }
}

/** The line between two rows: inset 18 at both ends. */
struct SettingsDivider: View {
  let look: Look

  var body: some View {
    Rectangle().fill(look.ink.opacity(0.1)).frame(height: 0.5).padding(.horizontal, SettingsRowSize.inset)
  }
}

/** A row: its symbol (when it has one), its words (13) over a line (12, grey), its control at the end; a line above it when it follows another. */
struct SettingsLine<Trailing: View>: View {
  let label: String
  var detail: String? = nil
  var divided = false
  var labelTint: Color? = nil
  /** A symbol before the words (the reference's Accessibility and Screen Recording rows). */
  var symbol: String? = nil
  let look: Look
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 12) {
      if let symbol {
        Image(systemName: symbol)
          .font(.system(size: 14))
          .foregroundStyle(look.ink)
          .frame(width: 20)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(PanelType.row)
          .foregroundStyle(labelTint ?? look.ink)
          .fixedSize(horizontal: false, vertical: true)
        if let detail, !detail.isEmpty {
          Text(detail)
            .font(PanelType.detail)
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      trailing()
        .fixedSize()
    }
    .padding(.horizontal, SettingsRowSize.inset)
    .padding(.vertical, SettingsRowSize.vertical)
    .frame(minHeight: SettingsRowSize.minHeight)
    .overlay(alignment: .top) {
      if divided { SettingsDivider(look: look) }
    }
  }
}

/** A switch: Apple's own, in the blue; greyed while its change is on its way. */
struct SettingsSwitch: View {
  let label: String
  var detail: String? = nil
  var divided = false
  var symbol: String? = nil
  let isOn: Binding<Bool>
  var disabled = false
  let look: Look

  var body: some View {
    SettingsLine(label: label, detail: detail, divided: divided, symbol: symbol, look: look) {
      Toggle(label, isOn: isOn)
        .toggleStyle(.switch)
        .labelsHidden()
        .tint(look.settingsBlue)
        .disabled(disabled)
        .handCursor()
    }
  }
}

/**
 * A menu (the reference's "Ask every time ⌄"): the choice in grey with a
 * chevron at the row's end; Apple's menu of the choices, the current one
 * ticked. A choice above a ceiling is listed greyed. Waits while its change
 * is on its way.
 */
struct SettingsMenu<Value: Hashable>: View {
  let label: String
  var detail: String? = nil
  var divided = false
  let options: [(value: Value, label: String)]
  var disabled: Set<Value> = []
  let value: Value
  /** The words shown when they are not the choice's own. */
  var shown: String? = nil
  var pending = false
  let look: Look
  let pick: (Value) -> Void

  var body: some View {
    SettingsLine(label: label, detail: detail, divided: divided, look: look) {
      Menu {
        ForEach(Array(options.enumerated()), id: \.offset) { _, option in
          Toggle(option.label, isOn: Binding(get: { option.value == value }, set: { _ in if option.value != value { pick(option.value) } }))
            .disabled(disabled.contains(option.value))
        }
      } label: {
        SettingsMenuLabel(text: shown ?? current, look: look)
      }
      .menuStyle(.button)
      .buttonStyle(.borderless)
      .menuIndicator(.hidden)
      .fixedSize()
      .disabled(pending)
      .handCursor()
      .accessibilityLabel(label)
      .accessibilityValue(shown ?? current)
    }
  }

  private var current: String { options.first { $0.value == value }?.label ?? "" }
}

/** A menu's face: the choice (13, grey) and a chevron down. */
struct SettingsMenuLabel: View {
  let text: String
  let look: Look

  var body: some View {
    HStack(spacing: 6) {
      Text(text)
        .font(PanelType.row)
        .foregroundStyle(look.inkSecondary)
        .lineLimit(1)
      Image(systemName: "chevron.down")
        .font(.system(size: 9, weight: .medium))
        .foregroundStyle(look.inkTertiary)
    }
    .contentShape(Rectangle())
  }
}

/** A row that opens something: its words, its value in grey, and the chevron (or ↗ for a page on the web, or a symbol of its own: Report an issue's bug); a step darker under the pointer. */
struct SettingsLinkRow: View {
  let label: String
  var value: String? = nil
  var detail: String? = nil
  var divided = false
  var external = false
  var symbol: String? = nil
  /** At the row's end in place of the chevron, 14 in grey. */
  var trailingSymbol: String? = nil
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      SettingsLine(label: label, detail: detail, divided: divided, symbol: symbol, look: look) {
        HStack(spacing: 6) {
          if let value, !value.isEmpty {
            Text(value)
              .font(PanelType.row)
              .foregroundStyle(look.inkSecondary)
              .lineLimit(1)
          }
          if let trailingSymbol {
            Image(systemName: trailingSymbol)
              .font(.system(size: 14))
              .foregroundStyle(look.inkSecondary)
          } else {
            Image(systemName: external ? "arrow.up.right" : "chevron.right")
              .font(.system(size: 10, weight: .medium))
              .foregroundStyle(look.inkTertiary)
          }
        }
      }
      .background(hovering ? look.groupedRowHover : Color.clear)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}

/** A row that is an action (the reference's "Upgrade", "Add app"): its words in the link blue, or red for one that takes something away; a spinner while it goes. */
struct SettingsActionRow: View {
  let title: String
  var destructive = false
  var divided = false
  var busy = false
  var disabled = false
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Text(title)
          .font(PanelType.row)
          .foregroundStyle((destructive ? look.danger : look.settingsAction).opacity(disabled ? 0.4 : 1))
        Spacer(minLength: 8)
        if busy { ProgressView().controlSize(.small) }
      }
      .padding(.horizontal, SettingsRowSize.inset)
      .padding(.vertical, SettingsRowSize.vertical)
      .frame(minHeight: SettingsRowSize.minHeight)
      .background(hovering && !disabled ? look.groupedRowHover : Color.clear)
      .overlay(alignment: .top) {
        if divided { SettingsDivider(look: look) }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .disabled(disabled || busy)
    .onHover { hovering = $0 }
  }
}

/** An action at a row's end, in words (the reference's "Add", "Open System Settings"): the link blue, greyed while it can't be pressed. */
struct SettingsPill: View {
  let title: String
  var primary = false
  var disabled = false
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(PanelType.row)
        .foregroundStyle(disabled ? look.inkTertiary : look.settingsAction.opacity(hovering ? 0.8 : 1))
        .lineLimit(1)
        .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .disabled(disabled)
    .onHover { hovering = $0 }
  }
}

/** A choice of a few, each its symbol (the reference's Mode: the sun, the moon, the screen), in a grey capsule; the chosen one on a lighter disc. */
struct SettingsSymbolPicker<Value: Hashable>: View {
  let options: [(value: Value, symbol: String, label: String)]
  let value: Value
  let look: Look
  let pick: (Value) -> Void

  var body: some View {
    HStack(spacing: 2) {
      ForEach(Array(options.enumerated()), id: \.offset) { _, option in
        let chosen = option.value == value
        Button { if !chosen { pick(option.value) } } label: {
          Image(systemName: option.symbol)
            .font(.system(size: 13))
            .foregroundStyle(chosen ? look.ink : look.inkSecondary)
            .frame(width: 34, height: 28)
            .background(Capsule().fill(chosen ? (look.dark ? Color.white.opacity(0.14) : Color.white) : .clear))
            .shadow(color: .black.opacity(chosen && !look.dark ? 0.1 : 0), radius: 1.5, x: 0, y: 1)
            .contentShape(Capsule())
        }
        .buttonStyle(.hand)
        .help(option.label)
        .accessibilityLabel(option.label)
        .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
      }
    }
    .padding(2)
    .background(Capsule().fill(look.ink.opacity(look.dark ? 0.08 : 0.06)))
  }
}

/** The account's picture, else its letters on the grey disc. */
struct SettingsAccountFace: View {
  let size: CGFloat
  let look: Look
  @Environment(AppStore.self) private var store

  var body: some View {
    let account = store.account
    ZStack {
      Circle().fill(look.rowHover)
      Text(account?.initials ?? "?")
        .font(.system(size: size * 0.38, weight: .medium))
        .foregroundStyle(look.inkSecondary)
      if let url = account?.pictureURL {
        AsyncImage(url: url) { phase in
          if let image = phase.image { image.resizable().aspectRatio(contentMode: .fill) } else { Color.clear }
        }
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(Circle().strokeBorder(look.ink.opacity(0.05), lineWidth: 1))
    .accessibilityHidden(true)
  }
}
