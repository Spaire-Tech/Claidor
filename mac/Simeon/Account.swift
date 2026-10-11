import AppKit
import Observation
import SwiftUI
import SimeonCore

/**
 * The account (step 10, L01–L04): the menu on the initials at the sidebar's
 * foot (`Xln`: Weekly usage ›, Settings, About, Log out), the usage submenu
 * (`Qln`), About over the window (`AVn`; Simeon › About Simeon opens it too)
 * and the sign-out question (`qon`) Settings' Sign Out shares.
 */
@MainActor
@Observable
final class AccountState {
  private(set) var aboutOpen = false {
    didSet { AccountState.aboutShowing = aboutOpen }
  }

  /** About is over the window: the window's keys and gestures under it wait. */
  static var aboutShowing = false

  func openAbout() {
    guard !aboutOpen else { return }
    // Nothing behind keeps the keys (the message field would take the letters).
    NSApp.keyWindow?.makeFirstResponder(nil)
    aboutOpen = true
  }

  func closeAbout() {
    guard aboutOpen else { return }
    aboutOpen = false
  }
}

@MainActor
enum AccountActions {
  /**
   * The sign-out question (`qon`), the menu's Log out and Settings' Sign Out
   * alike: "Sign out?", Cancel (Escape) and Sign out (Return). Sign out
   * forgets the sign-in and the window goes back to it.
   */
  static func askToSignOut(session: MacSession, settings: SettingsState) {
    let alert = NSAlert()
    alert.messageText = AccountMenu.signOutTitle
    alert.informativeText = AccountMenu.signOutLine
    alert.addButton(withTitle: AccountMenu.signOutConfirm)
    alert.addButton(withTitle: AccountMenu.signOutCancel).keyEquivalent = "\u{1b}"
    SidebarActions.present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      settings.close()
      Task { await session.signOut() }
    }
  }

  /**
   * Settings' Delete Account (not in the Electron window: Apple asks every
   * app that makes accounts to delete them from inside it). The question
   * says what goes, Cancel on Escape; Delete Account closes Settings once
   * the server has done it, or says why it could not over the window.
   */
  static func askToDeleteAccount(session: MacSession, settings: SettingsState, deleting: @escaping @MainActor (Bool) -> Void) {
    let alert = NSAlert()
    alert.alertStyle = .critical
    alert.messageText = AccountMenu.deleteTitle
    alert.informativeText = AccountMenu.deleteLine
    let delete = alert.addButton(withTitle: AccountMenu.deleteAccount)
    delete.hasDestructiveAction = true
    alert.addButton(withTitle: AccountMenu.signOutCancel).keyEquivalent = "\u{1b}"
    SidebarActions.present(alert) { response in
      guard response == .alertFirstButtonReturn else { return }
      deleting(true)
      Task { @MainActor in
        let problem = await session.deleteAccount()
        deleting(false)
        guard let problem else {
          settings.close()
          return
        }
        let refused = NSAlert()
        refused.messageText = AccountMenu.deleteRefused
        refused.informativeText = problem
        refused.addButton(withTitle: "OK")
        SidebarActions.present(refused) { _ in }
      }
    }
  }

  /**
   * The account menu, Apple's, its foot 4 above the initials and its left
   * edge on theirs (`top-start`, offset 4), at least 228 wide. Weekly usage
   * shows once the usage is in hand; opening reads it again when the last
   * reading is 30 seconds old, and a reading landing while the menu is open
   * puts the row in (or takes it out after a failure), as the window's does.
   */
  static func openMenu(above frame: CGRect, store: AppStore, session: MacSession, settings: SettingsState, account: AccountState) {
    let menu = NSMenu(title: AccountMenu.title)
    menu.autoenablesItems = false
    menu.minimumWidth = 228
    let weekly = NSMenuItem(title: AccountMenu.weeklyUsage, action: nil, keyEquivalent: "")
    weekly.image = symbol("gauge.with.needle")
    var shown: AccountMenu.Reading?
    func show(_ reading: AccountMenu.Reading?) {
      guard let reading else {
        shown = nil
        if weekly.menu != nil { menu.removeItem(weekly) }
        return
      }
      // The same reading again leaves the submenu alone (it may be open under the pointer).
      if reading == shown, weekly.menu != nil { return }
      shown = reading
      weekly.badge = NSMenuItemBadge(string: reading.percent)
      weekly.submenu = usageMenu(reading)
      if weekly.menu == nil { menu.insertItem(weekly, at: 0) }
    }
    show(AccountMenu.reading(store.usage, readAt: store.usageReadAt))

    let settingsItem = BlockMenuItem(AccountMenu.settings) { settings.open(.general) }
    settingsItem.image = symbol("gearshape")
    menu.addItem(settingsItem)
    let aboutItem = BlockMenuItem(AccountMenu.about) { account.openAbout() }
    aboutItem.image = symbol("info.circle")
    menu.addItem(aboutItem)
    menu.addItem(.separator())
    let logOut = BlockMenuItem(AccountMenu.logOut) { askToSignOut(session: session, settings: settings) }
    logOut.image = symbol("rectangle.portrait.and.arrow.right")
    menu.addItem(logOut)

    // The menu runs its own loop until it closes; the reading lands in it meanwhile (also one already on its way, as at sign-in).
    Task { @MainActor in
      await store.loadUsage()
      while store.usage.isLoading {
        await withCheckedContinuation { (landed: CheckedContinuation<Void, Never>) in
          withObservationTracking { _ = store.usage } onChange: { landed.resume() }
        }
      }
      show(AccountMenu.reading(store.usage, readAt: store.usageReadAt))
    }
    guard let window = NSApp.keyWindow ?? NSApp.mainWindow, let view = window.contentView else { return }
    let top = NSPoint(x: frame.minX, y: frame.maxY + 4 + menu.size.height)
    menu.popUp(positioning: nil, at: view.convert(top, from: nil), in: view)
  }

  /**
   * Weekly usage's submenu: the share and when it resets, the on-demand
   * spend when it is metered (rows that do nothing, `bze`), then Change
   * limit, which opens the web app in the browser.
   */
  private static func usageMenu(_ reading: AccountMenu.Reading) -> NSMenu {
    let menu = NSMenu(title: AccountMenu.weeklyUsage)
    menu.autoenablesItems = false
    menu.minimumWidth = 228
    menu.showsStateColumn = false
    menu.addItem(figure(title: AccountMenu.weeklyUsage, subtitle: reading.reset, value: reading.percent))
    menu.addItem(.separator())
    if let spend = reading.spend {
      menu.addItem(figure(title: AccountMenu.onDemand, subtitle: AccountMenu.spendThisCycle, value: spend))
      menu.addItem(.separator())
    }
    menu.addItem(BlockMenuItem(AccountMenu.changeLimit) { NSWorkspace.shared.open(AccountMenu.changeLimitURL) })
    return menu
  }

  /** A figure's row (46 high, 30 without its second line): not a choice, so it takes no highlight and no keys. */
  private static func figure(title: String, subtitle: String?, value: String) -> NSMenuItem {
    let item = NSMenuItem(title: "\(title), \(value)", action: nil, keyEquivalent: "")
    let host = NSHostingView(rootView: UsageFigureRow(title: title, subtitle: subtitle, value: value))
    // Its own size, not SwiftUI's: 46 high (30 without the line), as wide as the menu.
    host.sizingOptions = []
    host.frame = NSRect(x: 0, y: 0, width: 228, height: subtitle == nil ? 30 : 46)
    host.autoresizingMask = [.width]
    item.view = host
    item.isEnabled = false
    return item
  }

  private static func symbol(_ name: String) -> NSImage? {
    NSImage(systemSymbolName: name, accessibilityDescription: nil)
  }
}

/** A figure in the usage submenu: its title (13) over its line (12, the lighter grey), its value (13) at the right. */
private struct UsageFigureRow: View {
  let title: String
  let subtitle: String?
  let value: String
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 0) {
        Text(title)
          .font(.system(size: 13))
          .tracking(-0.08)
          .foregroundStyle(look.ink)
          .lineLimit(1)
          .frame(height: 18)
        if let subtitle {
          Text(subtitle)
            .font(.system(size: 12))
            .foregroundStyle(look.inkTertiary)
            .lineLimit(1)
            .frame(height: 16)
        }
      }
      Spacer(minLength: 8)
      Text(value)
        .font(.system(size: 13))
        .foregroundStyle(look.ink)
        .lineLimit(1)
        .fixedSize()
    }
    .padding(.horizontal, 14)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .combine)
  }
}

// MARK: - About

/**
 * About over the whole window (`AVn`): the window darkened (#141414 at 50%,
 * 70% on dark), a 360-wide card, round 14 with a line at 15%; the app's
 * icon (64), "Simeon", the version, the copyright, Copy version info. ×,
 * Escape or a click on the dark close it. No motion. Over the sign-in too,
 * since Simeon › About Simeon is always there.
 */
struct AboutLayer: View {
  @Environment(AccountState.self) private var account
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    if account.aboutOpen {
      let look = Look(scheme)
      ZStack {
        Color(hex: 0x141414).opacity(look.dark ? 0.698 : 0.5)
          .contentShape(Rectangle())
          .onTapGesture { account.closeAbout() }
        AboutCard(look: look) { account.closeAbout() }
      }
      .ignoresSafeArea()
      .background(AboutKeys { account.closeAbout() })
    }
  }
}

/** The card: padded 32 above and 16 around, 12 between its lines; the button's bar 12 above it and 32 under. */
private struct AboutCard: View {
  let look: Look
  let close: () -> Void

  private var version: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
  }

  var body: some View {
    VStack(spacing: 0) {
      VStack(spacing: 12) {
        Image(nsImage: NSApp.applicationIconImage)
          .resizable()
          .interpolation(.high)
          .frame(width: 64, height: 64)
          .accessibilityHidden(true)
        VStack(spacing: 2) {
          Text(AboutSimeon.name)
            .font(.system(size: 22, weight: .semibold))
            .tracking(-0.264)
            .foregroundStyle(look.ink)
            .frame(height: 28)
            .accessibilityAddTraits(.isHeader)
          if !version.isEmpty {
            Text(AboutSimeon.versionLine(version))
              .font(.system(size: 12))
              .foregroundStyle(look.inkSecondary)
              .frame(height: 16)
          }
        }
        Text(AboutSimeon.copyright)
          .font(.system(size: 11))
          .tracking(0.07)
          .foregroundStyle(look.inkTertiary)
          .frame(height: 14)
      }
      .padding(EdgeInsets(top: 32, leading: 16, bottom: 16, trailing: 16))
      CopyVersionButton(info: AboutSimeon.versionInfo(version: version), disabled: version.isEmpty, look: look)
        .padding(EdgeInsets(top: 12, leading: 16, bottom: 32, trailing: 12))
    }
    .frame(width: 360)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(look.elevated))
    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.ink.opacity(0.15), lineWidth: 1))
    .overlay(alignment: .topTrailing) {
      SettingsClose(look: look, action: close)
        .padding(.top, 11)
        .padding(.trailing, 11)
    }
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    // A click on the card is the card's, not the dark's.
    .contentShape(Rectangle())
    .onTapGesture {}
    .accessibilityElement(children: .contain)
    .accessibilityLabel(AboutSimeon.name)
    .accessibilityAddTraits(.isModal)
  }
}

/** Copy version info (secondary, 32 high, round 8): the three lines on the clipboard, "Copied" for 1.2 s. */
private struct CopyVersionButton: View {
  let info: String
  let disabled: Bool
  let look: Look
  @State private var copied = false
  @State private var copies = 0
  @State private var hovering = false

  var body: some View {
    Button {
      NSPasteboard.general.clearContents()
      guard NSPasteboard.general.setString(info, forType: .string) else { return }
      copied = true
      copies += 1
      let this = copies
      Task {
        try? await Task.sleep(nanoseconds: UInt64(AboutSimeon.copiedSeconds * 1_000_000_000))
        if copies == this { copied = false }
      }
    } label: {
      Text(copied ? AboutSimeon.copied : AboutSimeon.copy)
        .font(.system(size: 14))
        .foregroundStyle(disabled ? look.ink.opacity(0.3) : look.ink)
        .lineLimit(1)
        .padding(.horizontal, 10)
        .frame(height: 32)
        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(fill))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(look.ink.opacity(disabled ? 0.045 : 0.15), lineWidth: 0.5))
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    .buttonStyle(.hand)
    .disabled(disabled)
    .onHover { hovering = $0 }
  }

  private var fill: Color {
    if disabled { return Color(red: 119 / 255, green: 119 / 255, blue: 119 / 255).opacity(look.dark ? 0.14 : 0.063) }
    return hovering ? look.fillHover : look.rowHover
  }
}

/** Escape closes About, whatever is under it (Settings, Plugins stay); Return goes to nothing behind it (Sign in, Try again). */
private struct AboutKeys: NSViewRepresentable {
  let close: () -> Void

  func makeNSView(context: Context) -> WatchView {
    let view = WatchView()
    view.close = close
    return view
  }

  func updateNSView(_ view: WatchView, context: Context) {
    view.close = close
  }

  final class WatchView: NSView {
    var close: (() -> Void)?
    nonisolated(unsafe) private var monitor: Any?

    override func viewDidMoveToWindow() {
      super.viewDidMoveToWindow()
      stop()
      guard window != nil else { return }
      monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
        let took = MainActor.assumeIsolated { () -> Bool in
          guard let self, event.window === self.window else { return false }
          let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
          guard mods.isEmpty else { return false }
          switch event.keyCode {
          case 53:
            self.close?()
            return true
          case 36, 76:
            return true
          default:
            return false
          }
        }
        return took ? nil : event
      }
    }

    private func stop() {
      if let monitor { NSEvent.removeMonitor(monitor) }
      monitor = nil
    }

    deinit {
      if let monitor { NSEvent.removeMonitor(monitor) }
    }
  }
}
