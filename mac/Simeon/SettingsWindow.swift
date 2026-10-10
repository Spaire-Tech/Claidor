import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings (`overlay:settings`, J01–J07): over the whole window, not a
 * window of its own, the window dimmed under it. A panel of at most
 * 1000 × 702 (the window less 40 and 94), its pages listed on its left:
 * General, and Usage & Billing once the account's usage is in hand. Each
 * opening starts afresh on the page asked for, at its top. ⌘, opens it on
 * General (again while it is open, nothing); ⌘K and "/" open the page
 * picked; Escape, × or a click on the dim close it.
 */
@MainActor
@Observable
final class SettingsState {
  enum Page: Equatable { case general, usage }

  private(set) var isOpen = false {
    didSet { SettingsState.showing = isOpen }
  }
  var page: Page = .general
  /** Bumped at each opening: the pages are drawn afresh, at their top. */
  private(set) var opening = 0
  /** The page the opening asked for: asking for it again changes nothing (⌘, over Settings, the window's way). */
  @ObservationIgnored private var asked: Page = .general

  /** Settings is over the window: the window's own keys under it wait. */
  static var showing = false

  func open(_ page: Page = .general) {
    if isOpen && page == asked { return }
    asked = page
    self.page = page
    if !isOpen {
      opening += 1
      // Nothing behind keeps the keys (the message field would take Escape and the letters).
      NSApp.keyWindow?.makeFirstResponder(nil)
    }
    isOpen = true
  }

  func close() {
    guard isOpen else { return }
    NSApp.keyWindow?.makeFirstResponder(nil)
    isOpen = false
  }
}

/** The dim and the panel, over the window (under search). */
struct SettingsLayer: View {
  @Environment(SettingsState.self) private var settings
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    if settings.isOpen {
      let look = Look(scheme)
      GeometryReader { box in
        ZStack {
          Color.black.opacity(0.5)
            .contentShape(Rectangle())
            .onTapGesture { settings.close() }
          SettingsPanel(look: look)
            .frame(width: max(0, min(1000, box.size.width - 40)), height: max(0, min(702, box.size.height - 94)))
            .id(settings.opening)
        }
        .frame(width: box.size.width, height: box.size.height)
      }
      .ignoresSafeArea()
      // Usage & Billing gone from the list while it is shown (an enterprise team, the summary gone): back to General.
      .onChange(of: store.usage.showsSection) { _, shows in
        if !shows && settings.page == .usage { settings.page = .general }
      }
    }
  }
}

/** The panel (`Ta`, `xxl`): 14 round, a line at 15%; #F5F5F7 with a deep soft shadow, or the raised ground on dark. */
private struct SettingsPanel: View {
  let look: Look
  @Environment(SettingsState.self) private var settings
  @Environment(AppStore.self) private var store

  var body: some View {
    HStack(spacing: 0) {
      SettingsNav(look: look)
      ZStack(alignment: .topTrailing) {
        VStack(alignment: .leading, spacing: 0) {
          Text(settings.page == .general ? "General" : "Usage & Billing")
            .font(.system(size: 17, weight: .medium))
            .tracking(-0.136)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .frame(height: 24)
            .padding(EdgeInsets(top: 32, leading: 32, bottom: 6, trailing: 32))
            .accessibilityAddTraits(.isHeader)
          ScrollView {
            Group {
              switch settings.page {
              case .general: SettingsGeneralPage(look: look)
              case .usage: SettingsUsagePage(look: look)
              }
            }
            .padding(EdgeInsets(top: 22, leading: 32, bottom: 28, trailing: 32))
            .frame(maxWidth: .infinity, alignment: .topLeading)
          }
          .scrollIndicators(.automatic)
          // A page is drawn afresh, at its top, each time it is shown.
          .id(settings.page)
        }
        SettingsClose(look: look) { settings.close() }
          .padding(.top, 10)
          .padding(.trailing, 10)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(look.settingsPanel))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
    .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(look.dark ? 0 : 0.45), radius: 28, x: 0, y: 30)
    // A click on the panel is the panel's, not the dim's.
    .contentShape(Rectangle())
    .onTapGesture {}
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Simeon settings")
    .accessibilityAddTraits(.isModal)
  }
}

/** The pages (`nav`, "Settings sections"): 198 wide, padded 16 and 12, the current one on white (round 10) or the grey on dark. */
private struct SettingsNav: View {
  let look: Look
  @Environment(SettingsState.self) private var settings
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      SettingsNavEntry(title: "General", systemImage: "gearshape", current: settings.page == .general, look: look) { settings.page = .general }
      if store.usage.showsSection {
        SettingsNavEntry(title: "Usage & Billing", systemImage: "chart.bar", current: settings.page == .usage, look: look) { settings.page = .usage }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 16)
    .padding(.horizontal, 12)
    .frame(width: 198)
    .frame(maxHeight: .infinity)
    .background(look.dark ? look.rowHover : Color.clear)
    .overlay(alignment: .trailing) {
      Rectangle().fill(look.ink.opacity(0.10)).frame(width: 0.5)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Settings sections")
  }
}

private struct SettingsNavEntry: View {
  let title: String
  let systemImage: String
  let current: Bool
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 9) {
        Image(systemName: systemImage)
          .font(.system(size: 13))
          .frame(width: 15, height: 15)
        Text(title)
          .font(.system(size: 13))
          .lineLimit(1)
      }
      .foregroundStyle(look.ink)
      .padding(.vertical, 7)
      .padding(.horizontal, 9)
      .frame(width: 173, alignment: .leading)
      .background(background)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityAddTraits(current ? [.isSelected] : [])
  }

  @ViewBuilder
  private var background: some View {
    if current {
      if look.dark {
        RoundedRectangle(cornerRadius: 8, style: .continuous).fill(look.fillHover)
      } else {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(Color.white)
          .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.07), radius: 0.5)
          .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(0.04), radius: 1, x: 0, y: 1)
      }
    } else {
      RoundedRectangle(cornerRadius: 8, style: .continuous).fill(hovering ? look.rowHover : .clear)
    }
  }
}

/** Close (32, round): × at 40%, darker on a faint fill under the pointer. */
private struct SettingsClose: View {
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "xmark")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(hovering ? look.inkSecondary : look.inkTertiary)
        .frame(width: 32, height: 32)
        .background(Circle().fill(hovering ? look.ink.opacity(0.11) : .clear))
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .accessibilityLabel("Close")
  }
}

// MARK: - The pages' parts

/** A section (`h3` and its card, 8 apart): the heading 12/16 in grey, 8 in from the card. */
struct SettingsSection<Content: View>: View {
  let title: String
  let look: Look
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.system(size: 12))
        .foregroundStyle(look.inkSecondary)
        .padding(.leading, 8)
        .padding(.trailing, 4)
        .accessibilityAddTraits(.isHeader)
      SettingsCard(look: look) { content() }
    }
  }
}

/** A card: round 14; white with a hairline shadow, or the grey on dark. */
struct SettingsCard<Content: View>: View {
  let look: Look
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 0) { content() }
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .fill(look.settingsCard)
          .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(look.dark ? 0 : 0.07), radius: 0.5)
          .shadow(color: Color(red: 20 / 255, green: 30 / 255, blue: 60 / 255).opacity(look.dark ? 0 : 0.04), radius: 1, x: 0, y: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

/** A row (`JWe`): its label and hint (13/18) on the left, its control on the right, 20 apart, padded 12 and 14; a hairline above it when divided, inset 12. */
struct SettingsRow<Control: View>: View {
  let label: String
  var hints: [String] = []
  var divided = false
  let look: Look
  @ViewBuilder let control: () -> Control

  var body: some View {
    HStack(spacing: 20) {
      VStack(alignment: .leading, spacing: 0) {
        Text(label)
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .truncationMode(.tail)
          .frame(minHeight: 18)
        ForEach(hints, id: \.self) { hint in
          Text(hint)
            .font(.system(size: 13))
            .lineSpacing(LineBox.extra(size: 13, lineHeight: 18))
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      control()
        .fixedSize()
    }
    .padding(.vertical, 12)
    .padding(.horizontal, 14)
    .frame(minHeight: 52)
    .overlay(alignment: .top) {
      if divided { SettingsHairline(look: look) }
    }
  }
}

/** The 0.5 line between rows, inset 12 on both sides. */
struct SettingsHairline: View {
  let look: Look

  var body: some View {
    Rectangle().fill(look.ink.opacity(0.15)).frame(height: 0.5).padding(.horizontal, 12)
  }
}

/**
 * A select (`$in`, filled, lg): 28 high, round 8, the grey with a 5% line,
 * its words (13/18) and a chevron; the Mac's menu of its choices, the
 * current one ticked and over it, as the Mac's pop-up buttons open. Waits
 * while its change is on its way.
 */
struct SettingsSelect<Value: Hashable>: View {
  let label: String
  let options: [(value: Value, label: String)]
  var disabled: Set<Value> = []
  let value: Value
  var pending = false
  var minWidth: CGFloat = 200
  /** The trigger's words when they are not the choice's own (Timezone's "Auto-detect (…)"). */
  var shown: String? = nil
  let look: Look
  /** Its own menu (Timezone's, with the time in each zone); else the choices. */
  var menu: ((CGRect) -> Void)? = nil
  let pick: (Value) -> Void
  @State private var spot = WindowSpot()
  @State private var hovering = false

  var body: some View {
    Button {
      if let menu { menu(spot.frame); return }
      RoutineMenus.choose(options, disabled: disabled, current: value, under: spot.frame, minWidth: minWidth, overSelected: true) { picked in
        if picked != value { pick(picked) }
      }
    } label: {
      HStack(spacing: 4) {
        Text(shown ?? options.first { $0.value == value }?.label ?? "")
          .font(.system(size: 13))
          .tracking(-0.08)
          .foregroundStyle(look.ink)
          .lineLimit(1)
        Image(systemName: "chevron.down")
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 10, height: 10)
      }
      .padding(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 5))
      .frame(height: 28)
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(hovering ? look.fillHover : look.rowHover))
      .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(0.05), lineWidth: 1))
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(pending)
    .onHover { hovering = $0 }
    .background(WindowSpotReader(spot: spot))
    .accessibilityLabel(label)
    .accessibilityValue(shown ?? options.first { $0.value == value }?.label ?? "")
  }
}

/** A pill button (md 32 high, padded 12, 14/20; sm 24 high, padded 8, 12/16): secondary (the grey), tertiary (none), primary (the ink) or accent (the blue). */
struct SettingsButton: View {
  enum Kind { case secondary, tertiary, primary, accent }
  let title: String
  var kind: Kind = .secondary
  var small = false
  var disabled = false
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.system(size: small ? 12 : 14))
        .foregroundStyle(ink)
        .lineLimit(1)
        .padding(.horizontal, small ? 8 : 12)
        .frame(height: small ? 24 : 32)
        .background(Capsule().fill(fill))
        .overlay(Capsule().strokeBorder(kind == .secondary ? look.ink.opacity(0.05) : .clear, lineWidth: 0.5))
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .disabled(disabled)
    .onHover { hovering = $0 }
  }

  private var ink: Color {
    switch kind {
    case .secondary, .tertiary: return disabled ? look.ink.opacity(0.3) : look.ink
    case .primary: return disabled ? look.ink.opacity(0.3) : look.onPrimary
    case .accent: return disabled ? look.link.opacity(0.3) : Color(hex: 0xfcfcfc)
    }
  }

  private var fill: Color {
    switch kind {
    case .secondary: return hovering && !disabled ? look.fillHover : look.rowHover
    case .tertiary: return hovering && !disabled ? look.rowHover : .clear
    case .primary: return disabled ? look.ink.opacity(0.15) : (hovering ? look.primaryFillHover : look.primaryFill)
    case .accent: return disabled ? look.unread.opacity(0.3) : (hovering ? look.link : look.unread)
    }
  }
}

/**
 * A question with a pending state, the Mac's alert as a sheet: the
 * confirming button reads `pendingTitle` while its call goes and neither
 * button can be pressed; a refusal keeps the alert open with its words.
 */
@MainActor
enum PendingAlert {
  static func ask(title: String, message: String, confirm: String, cancel: String, destructive: Bool, pendingTitle: String,
                  action: @escaping () async -> String?) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = title
    alert.informativeText = message
    let yes = alert.addButton(withTitle: confirm)
    yes.hasDestructiveAction = destructive
    let no = alert.addButton(withTitle: cancel)
    no.keyEquivalent = "\u{1b}"
    let handler = Handler(alert: alert, message: message, confirmTitle: confirm, pendingTitle: pendingTitle, action: action)
    yes.target = handler
    yes.action = #selector(Handler.confirm(_:))
    objc_setAssociatedObject(alert, &Handler.key, handler, .OBJC_ASSOCIATION_RETAIN)
    SidebarActions.present(alert) { _ in }
  }

  final class Handler: NSObject {
    nonisolated(unsafe) static var key = 0
    weak var alert: NSAlert?
    let message: String
    let confirmTitle: String
    let pendingTitle: String
    let action: () async -> String?

    init(alert: NSAlert, message: String, confirmTitle: String, pendingTitle: String, action: @escaping () async -> String?) {
      self.alert = alert
      self.message = message
      self.confirmTitle = confirmTitle
      self.pendingTitle = pendingTitle
      self.action = action
    }

    @MainActor @objc func confirm(_ sender: Any?) {
      guard let alert, alert.buttons.count == 2 else { return }
      let yes = alert.buttons[0], no = alert.buttons[1]
      yes.title = pendingTitle
      yes.isEnabled = false
      no.isEnabled = false
      Task { @MainActor in
        if let failure = await action() {
          yes.title = confirmTitle
          yes.isEnabled = true
          no.isEnabled = true
          alert.informativeText = message.isEmpty ? failure : "\(message)\n\n\(failure)"
          alert.layout()
        } else if let parent = alert.window.sheetParent {
          parent.endSheet(alert.window, returnCode: .alertFirstButtonReturn)
        } else {
          NSApp.abortModal()
        }
      }
    }
  }
}

// MARK: - Colours

extension Look {
  /** The panel: #F5F5F7, or the raised ground on dark. */
  var settingsPanel: Color { dark ? elevated : Color(hex: 0xf5f5f7) }
  /** A card: white, or the grey (`fill-neutral-subtle`) on dark. */
  var settingsCard: Color { dark ? rowHover : .white }
  /** The rules' table and the draft field on dark (`fill-elevated`). */
  var fillElevated: Color { dark ? Color(hex: 0x2f2f2f) : Color(hex: 0xfcfcfc) }
}
