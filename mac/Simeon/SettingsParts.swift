import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings' parts as the iPhone draws them (ios/Simeon/Settings.swift, the
 * founder, 21 October 2026: "match the iphone in design… the buttons,
 * toggles"): the page on the app's ground, its rows in groups of the grey a
 * step off it (round 12), the group's title over it and its note under it;
 * Apple's own switch in the chat's blue, a menu that reads "value ⌃⌄", a row
 * that opens something with its chevron, and a row that is a button in blue
 * or red words. At the Mac's sizes (13 for the iPhone's 17).
 */
extension Look {
  /** A settings page's ground, the iPhone's (`Ink.groupedGround`): white, or #141414 on dark. */
  var groupedGround: Color { dark ? Color(hex: 0x141414) : .white }
  /** A group's rows (`Ink.groupedRow`): #f4f4f4, or #1c1c1c on dark. */
  var groupedRow: Color { dark ? Color(hex: 0x1c1c1c) : Color(hex: 0xf4f4f4) }
  /** A row under the pointer: a step darker than the group. */
  var groupedRowHover: Color { dark ? Color(hex: 0x262626) : Color(hex: 0xebebeb) }
  /** The switches' blue and the primary button's (`Ink.blue`). */
  var settingsBlue: Color { dark ? Color(hex: 0x2f6db0) : Color(hex: 0x255a93) }
  /** Done, in words (`Ink.success`): Connected, Up to date. */
  var settingsGreen: Color { dark ? Color(hex: 0x38d591) : Color(hex: 0x009957) }
}

/** A group: its title (12, grey) over its rows on the grey, round 12, and its note (12, grey) under them. */
struct SettingsGroup<Content: View>: View {
  var title: String? = nil
  var footer: String? = nil
  var footerTint: Color? = nil
  let look: Look
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if let title {
        Text(title)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(look.inkSecondary)
          .padding(.horizontal, 14)
          .accessibilityAddTraits(.isHeader)
      }
      VStack(alignment: .leading, spacing: 0) { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(look.groupedRow))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      if let footer, !footer.isEmpty {
        Text(footer)
          .font(.system(size: 12))
          .foregroundStyle(footerTint ?? look.inkSecondary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, 14)
      }
    }
  }
}

/** The line between two rows: inset 14 from the leading edge to the end, as the iPhone's separators. */
struct SettingsDivider: View {
  let look: Look

  var body: some View {
    Rectangle().fill(look.ink.opacity(0.1)).frame(height: 0.5).padding(.leading, 14)
  }
}

/** A row: its label (13) and a line under it (12, grey) on the left, its control on the right; a line above it when it follows another. */
struct SettingsLine<Trailing: View>: View {
  let label: String
  var detail: String? = nil
  var divided = false
  var labelTint: Color? = nil
  let look: Look
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(.system(size: 13))
          .foregroundStyle(labelTint ?? look.ink)
          .fixedSize(horizontal: false, vertical: true)
        if let detail, !detail.isEmpty {
          Text(detail)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      trailing()
        .fixedSize()
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .frame(minHeight: 40)
    .overlay(alignment: .top) {
      if divided { SettingsDivider(look: look) }
    }
  }
}

/** A switch (`Toggle`, the iPhone's): Apple's own, in the chat's blue; greyed while its change is on its way. */
struct SettingsSwitch: View {
  let label: String
  var detail: String? = nil
  var divided = false
  let isOn: Binding<Bool>
  var disabled = false
  let look: Look

  var body: some View {
    SettingsLine(label: label, detail: detail, divided: divided, look: look) {
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
 * A menu (the iPhone's `Picker` in `.menu` style): the choice in grey with
 * ⌃⌄ at the row's end; Apple's menu of the choices, the current one ticked.
 * A choice above a ceiling is listed greyed. Waits while its change is on
 * its way.
 */
struct SettingsMenu<Value: Hashable>: View {
  let label: String
  var detail: String? = nil
  var divided = false
  let options: [(value: Value, label: String)]
  var disabled: Set<Value> = []
  let value: Value
  /** The words shown when they are not the choice's own (Time Zone's "Automatic (…)"). */
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
        HStack(spacing: 5) {
          Text(shown ?? current)
            .font(.system(size: 13))
            .foregroundStyle(look.inkSecondary)
            .lineLimit(1)
          Image(systemName: "chevron.up.chevron.down")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(look.inkTertiary)
        }
        .contentShape(Rectangle())
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

/** A row that opens something: its label, its value in grey, and the chevron (or ↗ for a page on the web); a step darker under the pointer. */
struct SettingsLinkRow: View {
  let label: String
  var value: String? = nil
  var detail: String? = nil
  var divided = false
  var external = false
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      SettingsLine(label: label, detail: detail, divided: divided, look: look) {
        HStack(spacing: 6) {
          if let value, !value.isEmpty {
            Text(value)
              .font(.system(size: 13))
              .foregroundStyle(look.inkSecondary)
              .lineLimit(1)
          }
          Image(systemName: external ? "arrow.up.right" : "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(look.inkTertiary)
        }
      }
      .background(hovering ? look.groupedRowHover : Color.clear)
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
  }
}

/** A row that is a button (the iPhone's Sign Out, Add Rule, Retry): its words in the link blue, or red for one that takes something away; a spinner while it goes. */
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
          .font(.system(size: 13))
          .foregroundStyle((destructive ? look.danger : look.link).opacity(disabled ? 0.4 : 1))
        Spacer(minLength: 8)
        if busy { ProgressView().controlSize(.small) }
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 10)
      .frame(minHeight: 40)
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

/** The iPhone's pill (`PillButtonStyle`): the chat's blue with white words, or the quiet grey; 28 high on the Mac. */
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
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(primary ? Color.white : look.ink)
        .lineLimit(1)
        .padding(.horizontal, 14)
        .frame(height: 28)
        .background(Capsule().fill(primary ? look.settingsBlue : (hovering ? look.fillHover : look.rowHover)))
        .opacity(disabled ? 0.45 : (hovering && primary ? 0.9 : 1))
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .disabled(disabled)
    .onHover { hovering = $0 }
  }
}

/** A page's head on its own (Account's face and name, About's mark): centred over the groups, on the ground. */
struct SettingsHead<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(spacing: 10) { content() }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 6)
  }
}

/** The account's picture, else its letters on the grey disc (the iPhone's `AccountFace`). */
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
