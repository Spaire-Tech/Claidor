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
  /** The loopback listener of the open sign-in, for the vendors that only send it back there. */
  @ObservationIgnored private var catcher: LoopbackCatcher?
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

  /**
   * A chat card's Connect (`Connecting`; Add until 13 October 2026): the
   * consent, then the app added and its sign-in opened in the window in one
   * go, closed once the app is connected. A sign-in the person cancels takes
   * the app it added back out, the card's spinner held until that is done.
   */
  func connect(_ name: String, store: AppStore) {
    ask(name, store: store) { [weak self] in
      guard let self, self.connecting == nil else { return }
      // The card's spinner while the page is asked for.
      self.connecting = name
      guard let start = await store.beginConnect(named: name) else {
        self.connecting = nil
        return
      }
      let end = await self.signIn(start.url, name: name, store: store) {
        await store.loadApps()
        return store.isConnected(name)
      }
      if Connecting.undoes(end, start: start) {
        self.connecting = name
        await store.undoConnect(start, name: name)
        if self.connecting == name { self.connecting = nil }
      }
    }
  }

  /** Add Another Account (an app Simeon Labs' server serves, `AppAccounts`): one more account's sign-in in the sheet, closed once the server lists it. */
  func addAccount(_ toolkit: String, name: String, store: AppStore) {
    guard connecting == nil else { return }
    connecting = name
    Task { [weak self] in
      await store.loadAppAccounts(toolkit)
      let before = Set(store.appAccounts[toolkit]?.accounts.map(\.id) ?? [])
      guard let url = await store.anotherAccountURL(toolkit, name: name) else {
        if self?.connecting == name { self?.connecting = nil }
        return
      }
      await self?.signIn(url, name: name, store: store) {
        await store.loadAppAccounts(toolkit)
        return store.appAccounts[toolkit]?.accounts.contains { !before.contains($0.id) } == true
      }
    }
  }

  /**
   * The sign-in page in Apple's sheet on the window, closed by itself once
   * `done` says so; in the browser when the sheet won't open. A second
   * sign-in takes the first one's place. A vendor that only sends sign-ins
   * back to `localhost:8787` (Canva, Square, Vercel, Dropbox) lands on this
   * Mac's own loopback while the sheet is open (`LoopbackSignIn`); with the
   * Electron app open and listening there, it says so instead. How it ended
   * (`SignInEnd`): a Connect takes back the app it added only when the person
   * cancelled.
   */
  @discardableResult
  func signIn(_ url: URL, name: String, store: AppStore?, done: @escaping @MainActor () async -> Bool) async -> SignInEnd {
    // The sign-in's last page sends the person back to this app (the browser's too, when the sheet won't open).
    let url = Connecting.returning(url, to: SimeonConfig.macURLScheme)
    session?.cancel()
    // The replaced sign-in's listener lets go of the address now, not when its wait next wakes.
    catcher?.stop()
    catcher = nil
    let token = UUID()
    current = token
    connecting = name
    defer {
      if current == token {
        catcher?.stop()
        catcher = nil
        connecting = nil
        session = nil
      }
    }
    if let store, let signInState = LoopbackSignIn.state(returningHere: url) {
      guard let listening = await LoopbackCatcher.start(state: signInState, finish: "\(SimeonConfig.macURLScheme)://connected") else {
        store.problem = LoopbackSignIn.busyMessage(name)
        return .cancelled
      }
      guard current == token else { listening.stop(); return .replaced }
      catcher = listening
      Task { @MainActor in
        if let answer = await listening.answer() {
          listening.stop()
          await store.finishLoopbackSignIn(answer, name: name)
        }
      }
    }
    // A sign-in that returns through Simeon Labs' server comes back to this
    // app, which finishes it on its own computer: never the web page, which
    // used whichever account the browser held (`AppReturnSignIn`).
    if let store, let returning = AppReturnSignIn.state(returningViaServer: url) {
      await store.sendSignInBack(state: returning, scheme: SimeonConfig.macURLScheme)
      guard current == token else { return .replaced }
    }
    let state = SignInSheetState()
    // Closed on the vendor's confirm page, or back on our address: look a little longer. Cancelled, or back saying it didn't work: two looks, then the buttons are free again.
    let session = ASWebAuthenticationSession(url: url, callback: .customScheme(SimeonConfig.macURLScheme)) { callback, error in
      if let answer = AppReturnSignIn.answer(callback) {
        if let store { Task { @MainActor in await store.finishLoopbackSignIn(answer, name: name) } }
        state.close(confirmed: answer.error == nil)
        return
      }
      state.close(confirmed: (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin && !Connecting.failed(callback))
    }
    session.presentationContextProvider = presenter
    // The person's own browser sign-ins (Google's, Apple's) are kept and used.
    session.prefersEphemeralWebBrowserSession = false
    self.session = session
    guard session.start() else {
      NSWorkspace.shared.open(url)
      // In the browser, it may finish there: never taken back. A loopback sign-in still comes back to this Mac: keep listening while it is done.
      guard catcher != nil else { return .unconfirmed }
      for _ in 0..<150 {
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        guard current == token else { return .replaced }
        if await done() { return .connected }
      }
      return .unconfirmed
    }
    for _ in 0..<150 {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      guard current == token else { return .replaced }
      if await done() {
        session.cancel()
        return .connected
      }
      if !state.keepGoing() { return state.ending }
    }
    session.cancel()
    return .unconfirmed
  }
}

/**
 * Stripe's own page for a plan bought on the web (14 October 2026, the
 * founder: Update card "takes me to the sign in page of simeon. not good"),
 * the iPhone's `BillingPage`: asked for with the app's sign-in
 * (`AppStore.billingPortal`) and shown in Apple's sign-in sheet on the
 * window, not the web's billing page. The page ends on the app's own link
 * (`/desktop/billing/back`), which closes the sheet; after a failed payment
 * the plan is then charged on the card just saved, and the plan and the
 * access read again, so Send comes back. The browser when the sheet can't
 * open (the plan is read again when the window comes forward).
 */
@MainActor
final class MacBillingPage {
  static let shared = MacBillingPage()
  private var session: ASWebAuthenticationSession?
  private let presenter = MacSignInPresenter()

  /** Opens the page; nil when it opened, else why not. */
  func open(flow: String?, tier: String?, store: AppStore) async -> String? {
    guard session == nil else { return nil }
    let paymentFailed = store.usage.summary?.paymentFailed == true
    let answer = await store.billingPortal(flow: flow, tier: tier, back: SimeonConfig.macURLScheme)
    guard let url = answer.url else { return answer.message ?? String(localized: "Couldn’t open billing. Try again.") }
    let finished = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
      let once = BillingSheetEnd(continuation)
      let sheet = ASWebAuthenticationSession(url: url, callback: .customScheme(SimeonConfig.macURLScheme)) { callback, _ in
        once.end(callback != nil)
      }
      sheet.presentationContextProvider = presenter
      sheet.prefersEphemeralWebBrowserSession = false
      session = sheet
      if !sheet.start() {
        NSWorkspace.shared.open(url)
        once.end(false)
      }
    }
    session = nil
    await store.settleAfterCardPage(paymentFailed: paymentFailed && finished)
    return nil
  }
}

/** The billing sheet's end, said once: whether it came back on the app's link. */
private final class BillingSheetEnd: @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<Bool, Never>?

  init(_ continuation: CheckedContinuation<Bool, Never>) { self.continuation = continuation }

  func end(_ finished: Bool) {
    lock.withLock { () -> CheckedContinuation<Bool, Never>? in defer { continuation = nil }; return continuation }?.resume(returning: finished)
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
  private var confirmed = false

  func close(confirmed: Bool) {
    lock.withLock {
      open = false
      pollsLeft = confirmed ? 10 : 2
      self.confirmed = confirmed
    }
  }

  /** How a sheet that closed before the app was connected ended: the person's Cancel, or closed on the vendor's page (it may still finish). */
  var ending: SignInEnd {
    lock.withLock { confirmed ? SignInEnd.unconfirmed : SignInEnd.cancelled }
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
 * The consent on the Mac, as Muse's (the founder, 13 October 2026: "its
 * wider than ours. ours is too thin, therefore we need to scroll down to
 * see all"): 600 wide, so it all shows at once; × at the top left; the
 * app's logo (64) and name (22, semibold), what it does; three points with
 * their symbols in the window's blue (what the agents reach in it, that the
 * person stays in charge, that agents can get things wrong); a hairline; the
 * small print (who handles the sign-in, where the information goes, the
 * app's own terms, and for some apps one more thing); Connect across the
 * foot in Apple's prominent glass, in the blue. It scrolls only in a window
 * too short for it. Return connects; Escape, × or a click beside it cancels.
 */
private struct ConnectConsentDialog: View {
  let consent: ConnectConsent
  let look: Look
  let connect: () -> Void
  let cancel: () -> Void

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
    // As tall as it needs; only a window too short for it scrolls the words over the button.
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
    .frame(width: 600)
    .overlay(alignment: .topLeading) { close }
    .background(look.elevated, in: shape)
    .clipShape(shape)
    .overlay(shape.strokeBorder(look.panelEdge(0.1), lineWidth: 1))
    .shadow(color: .black.opacity(look.dark ? 0.5 : 0.22), radius: 30, x: 0, y: 12)
    .padding(.vertical, 32)
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

  /** ×, at the top left as Muse's: the window's round glass button (`GlassDiscButton`, 21 October 2026). */
  private var close: some View {
    GlassDiscButton(symbol: "xmark", help: String(localized: "Cancel"), size: 32, action: cancel)
      .padding(16)
  }

  private var content: some View {
    VStack(spacing: 0) {
      AppLogoTile(name: consent.title, look: look, side: 64)
        .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
        .padding(.top, 36)
        .accessibilityHidden(true)
      Text(consent.title)
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(look.ink)
        .padding(.top, 16)
        .accessibilityAddTraits(.isHeader)
      if !consent.summary.isEmpty {
        Text(consent.summary)
          .font(.system(size: 14))
          .foregroundStyle(look.inkSecondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 6)
          .padding(.horizontal, 64)
      }
      VStack(alignment: .leading, spacing: 18) {
        ForEach(Array(consent.points.enumerated()), id: \.offset) { _, point in
          HStack(alignment: .top, spacing: 16) {
            Image(systemName: point.symbol)
              .font(.system(size: 19, weight: .regular))
              .foregroundStyle(look.yours)
              .frame(width: 28)
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
      .padding(.horizontal, 48)
      .padding(.top, 26)
      Rectangle()
        .fill(look.ink.opacity(0.1))
        .frame(height: 0.5)
        .padding(.horizontal, 48)
        .padding(.top, 22)
      VStack(alignment: .leading, spacing: 8) {
        ForEach(consent.smallPrint + (consent.note.map { [$0] } ?? []), id: \.self) { line in
          Text(line)
            .font(.system(size: 12))
            .foregroundStyle(look.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 48)
      .padding(.top, 14)
      .padding(.bottom, 8)
    }
  }

  private var buttons: some View {
    Button(action: connect) {
      Text("Connect")
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(Color.white)
        .frame(maxWidth: .infinity)
        .frame(height: 36)
    }
    .prominentGlassButton()
    .controlSize(.large)
    .tint(look.yours)
    .handCursor()
    .padding(.horizontal, 48)
    .padding(.top, 16)
    .padding(.bottom, 28)
  }
}
