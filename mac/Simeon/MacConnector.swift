import AppKit
import AuthenticationServices
import SwiftUI
import SimeonCore

/**
 * Connecting an app, since the Apple design pass (11 October 2026, the
 * founder: "bring the design of the connectors extra step before going to
 * the website but as a iframe"). First the iPhone's consent
 * (`ConnectConsentSheet`, written per app by `ConnectConsent`), here in the
 * window over the dimmed chat; Connect there opens the app's sign-in page
 * inside the app, in Apple's sign-in sheet on the window
 * (ASWebAuthenticationSession), not in the browser. The sheet closes itself
 * once the app is connected, asked every 2 seconds for up to 5 minutes, as
 * the iPhone's `AppConnector` does. Not a plain web view: Google and others
 * refuse their sign-in inside an embedded web view ("disallowed_useragent"),
 * and Apple's sheet is the one they accept (with Chrome as the Mac's
 * browser, macOS may show it in Chrome instead). When the sheet can't open,
 * the page opens in the browser as before.
 */
@MainActor
@Observable
final class MacConnector {
  static let shared = MacConnector()

  /** The consent over the window, and what Connect then does. */
  struct Ask: Identifiable {
    let consent: ConnectConsent
    let go: @MainActor () async -> Void
    var id: String { consent.id }
  }

  private(set) var asking: Ask?
  /** The app whose sign-in sheet is open (its name), or none. */
  private(set) var connecting: String?
  @ObservationIgnored private var session: ASWebAuthenticationSession?
  @ObservationIgnored private var current = UUID()
  private let presenter = MacSignInPresenter()

  /** Whether the consent is over the window: its keys are its own. */
  static var showing: Bool { shared.asking != nil }

  /** The consent for `name` (the catalog's app when there is one), then `go` on Connect. */
  func ask(_ name: String, store: AppStore?, then go: @escaping @MainActor () async -> Void) {
    asking = Ask(consent: ConnectConsent(app: store?.catalogApp(named: name), name: name), go: go)
  }

  func cancel() { asking = nil }

  func confirm() {
    guard let ask = asking else { return }
    asking = nil
    Task { await ask.go() }
  }

  /** A chat card's Add (`connectApp`): the consent, then the app's sign-in in the window, closed once the app is connected. */
  func connect(_ name: String, store: AppStore) {
    ask(name, store: store) { [weak self] in
      guard let self, self.connecting == nil else { return }
      // The card's spinner while the page is asked for.
      self.connecting = name
      guard let url = await store.connectApp(named: name) else {
        self.connecting = nil
        return
      }
      await self.signIn(url, name: name) {
        await store.loadApps()
        return store.isConnected(name)
      }
    }
  }

  /**
   * The sign-in page in Apple's sheet on the window, closed by itself once
   * `done` says so; in the browser when the sheet won't open. A second
   * sign-in takes the first one's place.
   */
  func signIn(_ url: URL, name: String, done: @escaping @MainActor () async -> Bool) async {
    session?.cancel()
    let token = UUID()
    current = token
    connecting = name
    defer {
      if current == token {
        connecting = nil
        session = nil
      }
    }
    let state = SignInSheetState()
    // Closed on the vendor's confirm page: look a little longer. Cancelled: two looks, then the buttons are free again.
    let session = ASWebAuthenticationSession(url: url, callback: .customScheme(SimeonConfig.macURLScheme)) { _, error in
      state.close(confirmed: (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin)
    }
    session.presentationContextProvider = presenter
    // The person's own browser sign-ins (Google's, Apple's) are kept and used.
    session.prefersEphemeralWebBrowserSession = false
    self.session = session
    guard session.start() else {
      NSWorkspace.shared.open(url)
      return
    }
    for _ in 0..<150 {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      guard current == token else { return }
      if await done() {
        session.cancel()
        return
      }
      if !state.keepGoing() { return }
    }
    session.cancel()
  }
}

/** Where the sign-in sheet shows: the app's window. */
final class MacSignInPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      MacServices.shared.mainWindow ?? NSApp.keyWindow ?? NSApp.mainWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
    }
  }
}

/** The sheet and the poll together (the iPhone's `SheetState`): once the sheet closed, ten more looks if it closed on the vendor's confirm page, two if the person closed it. */
final class SignInSheetState: @unchecked Sendable {
  private let lock = NSLock()
  private var open = true
  private var pollsLeft = 0

  func close(confirmed: Bool) {
    lock.withLock {
      open = false
      pollsLeft = confirmed ? 10 : 2
    }
  }

  func keepGoing() -> Bool {
    lock.withLock {
      if open { return true }
      if pollsLeft <= 0 { return false }
      pollsLeft -= 1
      return true
    }
  }
}

// MARK: The consent

/** The consent over the whole window, the chat dimmed behind it (as Deep Links and About sit). */
struct ConnectConsentLayer: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let connector = MacConnector.shared
    ZStack {
      if let ask = connector.asking {
        let look = Look(scheme)
        Color(hex: 0x141414).opacity(look.dark ? 0.698 : 0.5)
          .contentShape(Rectangle())
          .onTapGesture { connector.cancel() }
          .transition(.opacity)
        ConnectConsentDialog(consent: ask.consent, look: look, connect: { connector.confirm() }, cancel: { connector.cancel() })
          .id(ask.id)
          .transition(.scale(scale: 0.96).combined(with: .opacity))
      }
    }
    .animation(.easeOut(duration: 0.18), value: connector.asking?.id)
    .ignoresSafeArea()
  }
}

/**
 * The iPhone's consent (`ConnectConsentSheet`) on the Mac: the app's logo
 * (56) and name (20, semibold), what it does; three points with their
 * symbols in the window's blue (what the agents reach in it, that the person
 * stays in charge, that agents can get things wrong); a hairline; the small
 * print (who handles the sign-in, where the information goes, the app's own
 * terms, and for some apps one more thing). Connect in Apple's prominent
 * glass, in the blue, and Cancel under it. 440 wide, 22 round, scrolling
 * when the window is short. Return connects, Escape cancels.
 */
private struct ConnectConsentDialog: View {
  let consent: ConnectConsent
  let look: Look
  let connect: () -> Void
  let cancel: () -> Void

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
    // As tall as it needs; when the window is too short for it, the words scroll over the buttons.
    ViewThatFits(in: .vertical) {
      VStack(spacing: 0) {
        content
        buttons
      }
      VStack(spacing: 0) {
        ScrollView { content }
        buttons
      }
    }
    .frame(width: 440)
    .background(look.elevated, in: shape)
    .clipShape(shape)
    .overlay(shape.strokeBorder(look.ink.opacity(0.1), lineWidth: 1))
    .shadow(color: .black.opacity(look.dark ? 0.5 : 0.22), radius: 30, x: 0, y: 12)
    .frame(maxHeight: 640)
    .padding(.vertical, 40)
    .background(ViewerKeys(aboveLocks: true) { event in
      let mods = event.modifierFlags.intersection([.command, .shift, .option, .control])
      guard mods.isEmpty else { return false }
      switch event.keyCode {
      case 53: cancel()
      case 36, 76: connect()
      default: return false
      }
      return true
    })
    // What is typed waits: the field under it lets go of the keys.
    .onAppear { MacServices.shared.mainWindow?.makeFirstResponder(nil) }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Connect \(consent.title)")
    .accessibilityAddTraits(.isModal)
  }

  private var content: some View {
    VStack(spacing: 0) {
      AppLogoTile(name: consent.title, look: look, side: 56)
        .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
        .padding(.top, 28)
        .accessibilityHidden(true)
      Text(consent.title)
        .font(.system(size: 20, weight: .semibold))
        .foregroundStyle(look.ink)
        .padding(.top, 14)
        .accessibilityAddTraits(.isHeader)
      if !consent.summary.isEmpty {
        Text(consent.summary)
          .font(.system(size: 14))
          .foregroundStyle(look.inkSecondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 6)
          .padding(.horizontal, 32)
      }
      VStack(alignment: .leading, spacing: 18) {
        ForEach(Array(consent.points.enumerated()), id: \.offset) { _, point in
          HStack(alignment: .top, spacing: 14) {
            Image(systemName: point.symbol)
              .font(.system(size: 18, weight: .regular))
              .foregroundStyle(look.yours)
              .frame(width: 26)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
              Text(point.title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(look.ink)
              Text(point.body)
                .font(.system(size: 13))
                .foregroundStyle(look.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          .accessibilityElement(children: .combine)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 28)
      .padding(.top, 24)
      Rectangle()
        .fill(look.ink.opacity(0.1))
        .frame(height: 0.5)
        .padding(.top, 22)
      VStack(alignment: .leading, spacing: 10) {
        ForEach(consent.smallPrint + (consent.note.map { [$0] } ?? []), id: \.self) { line in
          Text(line)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 28)
      .padding(.vertical, 16)
    }
  }

  private var buttons: some View {
    VStack(spacing: 2) {
      Button(action: connect) {
        Text("Connect")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(Color.white)
          .frame(maxWidth: .infinity)
          .frame(height: 32)
      }
      .buttonStyle(.glassProminent)
      .controlSize(.large)
      .tint(look.yours)
      .handCursor()
      Button(action: cancel) {
        Text("Cancel")
          .font(.system(size: 14))
          .foregroundStyle(look.ink)
          .frame(maxWidth: .infinity)
          .frame(height: 32)
          .contentShape(Rectangle())
      }
      .buttonStyle(.hand)
    }
    .padding(.horizontal, 28)
    .padding(.top, 8)
    .padding(.bottom, 14)
  }
}
