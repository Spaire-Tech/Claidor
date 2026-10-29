import AppKit
import SwiftUI
import SimeonCore

/**
 * Settings (`overlay:settings`): over the whole window, not a window of its
 * own, the window dimmed under it. A panel of at most 960 × 720 (the
 * window less 48 and 64; Connectors' size), laid out as a Mac app's Settings
 * (the founder, 21 October 2026, with a desktop app's for reference: "the
 * proportions are off… you're behaving it like a phone"), in the app's own
 * type (`PanelType`; "I NEVER USED BOLD"): its pages listed on its left,
 * each with its symbol, the current one on a grey ground, Log out at the
 * foot; the page's name at the top of the rest, its groups under it across
 * the page, from its left. General, Usage & Billing
 * once the account's usage is in hand, Wallet, Credentials Store (28
 * October 2026), Permissions, Computer (the
 * agents' computer and this Mac), Updates (a dot while one is waiting),
 * Help & support (22 October 2026) and Legal; the account is General's
 * first row, its page under General with Back. Nothing here that the window
 * has elsewhere: Connect apps and About are the sidebar's. Each opening
 * starts afresh on the page asked for, at its top. ⌘, opens it on General
 * (again while it is open, nothing); ⌘K and "/" open the page picked;
 * Escape, × or a click on the dim close it.
 */
@MainActor
@Observable
final class SettingsState {
  enum Page: Equatable, CaseIterable {
    case general, usage, wallet, credentials, permissions, computer, updates, help, legal, account

    var title: String {
      switch self {
      case .general: String(localized: "General")
      case .usage: String(localized: "Usage & Billing")
      case .wallet: String(localized: "Wallet")
      case .credentials: String(localized: "Credentials Store")
      case .permissions: String(localized: "Permissions")
      case .computer: String(localized: "Computer")
      case .updates: String(localized: "Updates")
      case .help: String(localized: "Help & support")
      case .legal: String(localized: "Legal")
      case .account: String(localized: "Account")
      }
    }

    var symbol: String {
      switch self {
      case .general: "gearshape"
      case .usage: "chart.bar"
      case .wallet: "wallet.bifold"
      case .credentials: "key"
      case .permissions: "hand.raised"
      case .computer: "desktopcomputer"
      case .updates: "arrow.down.circle"
      case .help: "questionmark.circle"
      case .legal: "checkmark.shield"
      case .account: "person.crop.circle"
      }
    }

    /** The page it sits under, with Back to it: the account under General (its first row). */
    var parent: Page? { self == .account ? .general : nil }
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

  /** Connectors (Wallet's apps): Settings gives way to the Plugins panel, on an app's page when one is named. */
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
            .frame(width: max(0, min(960, box.size.width - 48)), height: max(0, min(720, box.size.height - 64)))
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

/** The panel: the grouped ground, round 14, a line at 15%, a deep soft shadow on light; the list of pages, then the page's name and its groups across the rest. */
private struct SettingsPanel: View {
  let look: Look
  @Environment(SettingsState.self) private var settings

  var body: some View {
    HStack(spacing: 0) {
      SettingsNav(look: look)
      VStack(alignment: .leading, spacing: 0) {
        // The page's name and × (Back before it on the account's page), as Connectors' head.
        HStack(spacing: 10) {
          if let parent = settings.page.parent {
            GlassDiscButton(symbol: "chevron.left", help: String(localized: "Back")) { settings.page = parent }
          }
          Text(settings.page.title)
            .font(PanelType.title)
            .foregroundStyle(look.ink)
            .lineLimit(1)
            .accessibilityAddTraits(.isHeader)
          Spacer(minLength: 12)
          SettingsClose(look: look) { settings.close() }
        }
        .frame(height: 32)
        .padding(EdgeInsets(top: 18, leading: 28, bottom: 0, trailing: 18))
        ScrollView {
          Group {
            switch settings.page {
            case .general: SettingsGeneralPage(look: look)
            case .usage: SettingsUsagePage(look: look)
            case .wallet: SettingsWalletPage(look: look)
            case .credentials: SettingsCredentialsPage(look: look)
            case .permissions: SettingsPermissionsPage(look: look)
            case .computer: SettingsComputerPage(look: look)
            case .updates: SettingsUpdatesPage(look: look)
            case .help: SettingsHelpPage(look: look)
            case .legal: SettingsLegalPage(look: look)
            case .account: SettingsAccountPage(look: look)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(EdgeInsets(top: 16, leading: 28, bottom: 32, trailing: 28))
        }
        .scrollIndicators(.automatic)
        // A page is drawn afresh, at its top, each time it is shown.
        .id(settings.page)
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
 * The pages ("Settings sections"), 210 wide, as the reference lists them:
 * each its symbol (14) and its name (13), 32 high, the current one (or the
 * one it sits under) on a grey ground, 8 round; Log out at the foot, asked
 * first as the account menu's.
 */
private struct SettingsNav: View {
  let look: Look
  @Environment(SettingsState.self) private var settings
  @Environment(AppStore.self) private var store
  @Environment(MacSession.self) private var session
  @State private var updates = MacUpdates.shared

  var body: some View {
    let current = settings.page.parent ?? settings.page
    VStack(alignment: .leading, spacing: 2) {
      ForEach(pages, id: \.self) { page in
        SettingsNavEntry(title: page.title, symbol: page.symbol, current: current == page, dot: page == .updates && updates.found != nil, look: look) { settings.page = page }
      }
      Spacer(minLength: 0)
      SettingsNavEntry(title: AccountMenu.logOut, symbol: "rectangle.portrait.and.arrow.right", current: false, look: look) {
        AccountActions.askToSignOut(session: session, settings: settings)
      }
    }
    .padding(EdgeInsets(top: 18, leading: 10, bottom: 14, trailing: 10))
    .frame(width: 210)
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

private struct SettingsNavEntry: View {
  let title: String
  let symbol: String
  let current: Bool
  var dot = false
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: symbol)
          .font(.system(size: 14))
          .foregroundStyle(look.ink)
          .frame(width: 20)
        Text(title)
          .font(PanelType.row)
          .foregroundStyle(look.ink)
          .lineLimit(1)
        Spacer(minLength: 0)
        if dot {
          Circle().fill(look.unread).frame(width: 7, height: 7)
            .accessibilityLabel("Update available")
        }
      }
      .padding(.horizontal, 10)
      .frame(height: 32)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(current ? look.groupedRow : (hovering ? look.groupedRow.opacity(0.6) : .clear)))
      .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .onHover { hovering = $0 }
    .accessibilityAddTraits(current ? [.isSelected] : [])
  }
}

/** Close (About's too): the window's round glass button (`GlassDiscButton`, 21 October 2026: one button for the app's panels). */
struct SettingsClose: View {
  let look: Look
  var size: CGFloat = 32
  let action: () -> Void

  var body: some View {
    GlassDiscButton(symbol: "xmark", help: String(localized: "Close"), size: size, action: action)
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
