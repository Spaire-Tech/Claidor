import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings (`overlay:settings`): over the whole window, not a window of its
 * own, the window dimmed under it. A panel of at most 1000 × 702 (the window
 * less 40 and 94), its pages listed on its left as the iPhone's Settings
 * lists them (the founder, 21 October 2026: "match the iphone in design"):
 * the account first, its face, name and email, then General, Usage &
 * Billing once the account's usage is in hand, Wallet, Permissions,
 * Computer (the agents' computer and this Mac), Updates (a dot while one is
 * waiting) and About. Each opening starts afresh on the page asked for, at
 * its top. ⌘, opens it on General (again while it is open, nothing); ⌘K and
 * "/" open the page picked; Escape, × or a click on the dim close it.
 */
@MainActor
@Observable
final class SettingsState {
  enum Page: Equatable, CaseIterable {
    case account, general, usage, wallet, permissions, computer, updates, about

    var title: String {
      switch self {
      case .account: String(localized: "Account")
      case .general: String(localized: "General")
      case .usage: String(localized: "Usage & Billing")
      case .wallet: String(localized: "Wallet")
      case .permissions: String(localized: "Permissions")
      case .computer: String(localized: "Computer")
      case .updates: String(localized: "Updates")
      case .about: String(localized: "About Simeon")
      }
    }

    var symbol: String {
      switch self {
      case .account: "person.crop.circle"
      case .general: "gearshape"
      case .usage: "chart.bar"
      case .wallet: "wallet.bifold"
      case .permissions: "checkmark.shield"
      case .computer: "desktopcomputer"
      case .updates: "arrow.down.circle"
      case .about: "info.circle"
      }
    }
  }

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
  /** Plugins, which takes the same place over the window: opening Settings closes it (set by the app). */
  @ObservationIgnored weak var plugins: PluginsState?

  func open(_ page: Page = .general) {
    // One overlay at a time (the window's overlay slot): Plugins gives way.
    plugins?.close()
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

  /** Connectors (the iPhone's Connect apps row, and Wallet's apps): Settings gives way to the Plugins panel, on an app's page when one is named. */
  func openConnectors(plugin: String? = nil) {
    guard let plugins else { return }
    close()
    if let plugin { plugins.open(.plugin(plugin)) } else { plugins.open() }
  }
}

/**
 * Settings or Plugins over the window (the window's one overlay slot), About
 * over everything, or the computer and its dialogs (step 13): the window's
 * keys and gestures under them wait (a sideways swipe, a right-click, the
 * wheel over a chart or a picture).
 */
enum WindowOverlay {
  @MainActor static var showing: Bool {
    SettingsState.showing || PluginsState.showing || AccountState.aboutShowing || WindowState.computerShowing || ComputerDialog.showing
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

/** The panel: the iPhone's grouped ground, round 14, a line at 15%, a deep soft shadow on light. The page's groups at most 620 wide, centred. */
private struct SettingsPanel: View {
  let look: Look
  @Environment(SettingsState.self) private var settings

  var body: some View {
    HStack(spacing: 0) {
      SettingsNav(look: look)
      ZStack(alignment: .topTrailing) {
        VStack(alignment: .leading, spacing: 0) {
          Text(settings.page.title)
            .font(.system(size: 17, weight: .semibold))
            .tracking(-0.2)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .frame(height: 24)
            .padding(EdgeInsets(top: 28, leading: 32, bottom: 4, trailing: 32))
            .accessibilityAddTraits(.isHeader)
          ScrollView {
            Group {
              switch settings.page {
              case .account: SettingsAccountPage(look: look)
              case .general: SettingsGeneralPage(look: look)
              case .usage: SettingsUsagePage(look: look)
              case .wallet: SettingsWalletPage(look: look)
              case .permissions: SettingsPermissionsPage(look: look)
              case .computer: SettingsComputerPage(look: look)
              case .updates: SettingsUpdatesPage(look: look)
              case .about: SettingsAboutPage(look: look)
              }
            }
            .frame(maxWidth: 620)
            .padding(EdgeInsets(top: 18, leading: 32, bottom: 32, trailing: 32))
            .frame(maxWidth: .infinity)
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
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(look.groupedGround))
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

/**
 * The pages ("Settings sections"), 220 wide: the account at the top (its
 * face, name and email, as the iPhone's Settings and the Mac's System
 * Settings open), then the rest; the current one on the iPhone's row grey.
 */
private struct SettingsNav: View {
  let look: Look
  @Environment(SettingsState.self) private var settings
  @Environment(AppStore.self) private var store
  @State private var updates = MacUpdates.shared

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      SettingsNavAccount(current: settings.page == .account, look: look) { settings.page = .account }
        .padding(.bottom, 10)
      ForEach(pages, id: \.self) { page in
        SettingsNavEntry(page: page, current: settings.page == page, dot: page == .updates && updates.found != nil, look: look) { settings.page = page }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 16)
    .padding(.horizontal, 12)
    .frame(width: 220)
    .frame(maxHeight: .infinity)
    .overlay(alignment: .trailing) {
      Rectangle().fill(look.ink.opacity(0.08)).frame(width: 0.5)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Settings sections")
  }

  private var pages: [SettingsState.Page] {
    SettingsState.Page.allCases.filter { page in
      switch page {
      case .account: false
      // Usage & Billing, as the iPhone lists it: not for an enterprise team.
      case .usage: store.usage.summary == nil || store.usage.showsSection
      default: true
      }
    }
  }
}

/** The account's row: its face (34), its name over its email. */
private struct SettingsNavAccount: View {
  let current: Bool
  let look: Look
  let action: () -> Void
  @Environment(AppStore.self) private var store
  @State private var hovering = false

  var body: some View {
    let account = store.account
    let display = AccountDisplay(displayName: account?.name, email: account?.email)
    Button(action: action) {
      HStack(spacing: 10) {
        SettingsAccountFace(size: 34, look: look)
        VStack(alignment: .leading, spacing: 1) {
          Text(display.title)
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(look.ink)
            .lineLimit(1)
          if let mail = display.secondary {
            Text(mail)
              .font(.system(size: 11))
              .foregroundStyle(look.inkSecondary)
              .lineLimit(1)
              .truncationMode(.middle)
          }
        }
        Spacer(minLength: 0)
      }
      .padding(.vertical, 7)
      .padding(.horizontal, 8)
      .frame(width: 196, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(current ? look.groupedRow : (hovering ? look.rowHover : .clear)))
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityLabel("Account, \(display.title)")
    .accessibilityAddTraits(current ? [.isSelected] : [])
  }
}

private struct SettingsNavEntry: View {
  let page: SettingsState.Page
  let current: Bool
  var dot = false
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 9) {
        Image(systemName: page.symbol)
          .font(.system(size: 13))
          .foregroundStyle(look.inkSecondary)
          .frame(width: 18, height: 15)
        Text(page.title)
          .font(.system(size: 13))
          .foregroundStyle(look.ink)
          .lineLimit(1)
        Spacer(minLength: 0)
        if dot {
          Circle().fill(look.unread).frame(width: 7, height: 7)
            .accessibilityLabel("Update available")
        }
      }
      .padding(.vertical, 7)
      .padding(.horizontal, 9)
      .frame(width: 196, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(current ? look.groupedRow : (hovering ? look.rowHover : .clear)))
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityAddTraits(current ? [.isSelected] : [])
  }
}

/** Close (32, round): × at 40%, darker on a faint fill under the pointer (About's too). */
struct SettingsClose: View {
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
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityLabel("Close")
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
  /** Settings' and Connectors' panel: the iPhone's grouped ground (white, or #141414 on dark; 21 October 2026, it was #F5F5F7). */
  var settingsPanel: Color { groupedGround }
}
