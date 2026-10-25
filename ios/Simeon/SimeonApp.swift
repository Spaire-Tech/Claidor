import SwiftUI
import UserNotifications
#if os(iOS)
import UIKit
#endif
import SimeonCore

#if os(iOS)
/**
 * Simeon on the iPhone, native: the phone screens the founder designed on
 * 8 October 2026 (the list, a chat, the + menu and its sheets, the agent's
 * page, search, Settings, the call), drawn with Apple's own parts so they
 * get Apple's glass, sheets, menus and gestures. ios/README.md.
 */
@main
struct SimeonApp: App {
  /** Apple's push token and taps on notifications reach the app through UIKit's delegate (Notifications.swift). */
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @State private var session = SessionController()

  var body: some Scene {
    WindowGroup {
      RootView()
        // The launch: the SimeonLabs logo lighting up until the app is ready, over everything.
        .overlay { LaunchCover() }
        // Light, Dark or the phone's: read here, inside the environment, not by the app itself, so a choice does not run the
        // app's own body again.
        .modifier(AppearanceOnWindows())
        .environment(session)
        .environment(session.store)
        // One size of type everywhere, the chat's (the founder, 9 October 2026: "i want all to be the size of chat"). The chat
        // is drawn in fixed sizes; rows left to the system (Settings' rows, pickers, menus) grew with the phone's Text Size and
        // stood bigger than it. The phone's setting no longer changes the app; it never changed the chat.
        .dynamicTypeSize(.large)
        .task { await session.start() }
        // The website's Add to Simeon (`simeon-ios://app/v1/pack/add?id=`): the pack's sheet once the list is up (StarterPackSheet.swift).
        .onOpenURL { url in
          if let id = StarterPack.linked(url, scheme: AppPlatform.urlScheme) { Notifications.shared.openPack = id }
        }
        // After the first screen is up, never before it.
        .task { HangWatch.start() }
    }
  }

  /**
   * Every window of the app in the chosen style, and the sheets they hold with them; the type at its one size there too
   * (menus, sheets). The windows and their root views on the app's ground: the system's black showed behind the list as a
   * sheet pushed it back, and between screens as they changed (the founder, 11 October 2026).
   */
  @MainActor
  static func applyToWindows(_ name: String, fading: Bool = false) {
    let style: UIUserInterfaceStyle = name == "light" ? .light : name == "dark" ? .dark : .unspecified
    // Named for the hang watch: a freeze from here on says it began with the switch.
    Trace.mark("switching the appearance to \(name)")
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      // Set, never read: reading an override that was never set aborts the app ("Can't return value for trait … that has no override").
      // Once per scene: set again on every change of appearance, it made every word in the app be laid out again with the
      // colours, and the switch lagged badly (the founder, 11 October 2026).
      if sizedScenes.insert(ObjectIdentifier(scene)).inserted { scene.traitOverrides.preferredContentSizeCategory = .large }
      for window in scene.windows where isOurs(window) {
        if window.overrideUserInterfaceStyle != style {
          // The old look laid over the new and faded out, as the system's own switch does: the whole app drawn again in the
          // new colours shows at once, not in pieces as it comes. It lets every touch through.
          let cover = fading && !window.isHidden ? window.snapshotView(afterScreenUpdates: false) : nil
          if let cover {
            cover.isUserInteractionEnabled = false
            window.addSubview(cover)
          }
          window.overrideUserInterfaceStyle = style
          if let cover {
            UIView.animate(withDuration: 0.3, delay: 0.05, options: [.curveEaseOut, .allowUserInteraction]) { cover.alpha = 0 } completion: { _ in
              cover.removeFromSuperview()
            }
          }
        }
        if window.backgroundColor != Ink.groundUIColor { window.backgroundColor = Ink.groundUIColor }
        if let root = window.rootViewController?.view, root.backgroundColor != Ink.groundUIColor { root.backgroundColor = Ink.groundUIColor }
      }
    }
  }

  /** The app's own windows: not the keyboard's, which the system keeps in the app's scene and lays out again for any change. */
  private static func isOurs(_ window: UIWindow) -> Bool {
    let kind = NSStringFromClass(type(of: window))
    return !kind.contains("Keyboard") && !kind.contains("TextEffects")
  }

  /** The scenes whose type size is already set. */
  @MainActor private static var sizedScenes = Set<ObjectIdentifier>()

  static func scheme(_ name: String) -> ColorScheme? {
    switch name {
    case "light": return .light
    case "dark": return .dark
    default: return nil
    }
  }
}

/**
 * The appearance on the windows, and only there. With SwiftUI's
 * preferredColorScheme at the root as well, each sheet was given the style
 * of the moment it opened as its own, so Settings, open while the choice was
 * made, kept the old one until closed (the founder, 9 October 2026, twice).
 * A window's style reaches every sheet it holds at once. At launch at once;
 * a choice made later once the menu it was made in has closed (its fade is
 * a quarter of a second): applied while the menu was still going, the
 * whole app's redraw ran into it (the founder, 11 October 2026: "to go to
 * light mode i literally have to quit the app, cause it froze").
 */
private struct AppearanceOnWindows: ViewModifier {
  @Environment(SessionController.self) private var session
  @AppStorage("simeon.theme") private var theme = "system"

  func body(content: Content) -> some View {
    content.onChange(of: session.launch.theme ?? theme, initial: true) { old, name in
      if old == name { SimeonApp.applyToWindows(name); return }
      Task { @MainActor in
        try? await Task.sleep(nanoseconds: 350_000_000)
        // Changed again meanwhile: the later choice applies itself.
        guard (session.launch.theme ?? theme) == name else { return }
        SimeonApp.applyToWindows(name, fading: true)
      }
    }
  }
}

struct RootView: View {
  @Environment(SessionController.self) private var session
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    phaseView
      .background(ground)
      // A chat left open behind a locked phone is not being read (AppStore.isForeground).
      .onChange(of: scenePhase) { _, phase in
        session.store.isForeground = phase == .active
        AppLock.shared.scenePhase(phase)
      }
  }

  /** Under every screen, so a fade between two (the first run and the list) never shows the system's black. */
  private var ground: some View { Ink.ground.ignoresSafeArea() }

  @ViewBuilder
  private var phaseView: some View {
    switch session.phase {
    case .starting:
      // Under the launch cover.
      Ink.ground.ignoresSafeArea()
    case .signedOut, .signingIn:
      // One screen for both, so the pressed button keeps its spinner while the sheet is open; once the account is in,
      // "Setting up Simeon's computer" until the app is ready, as on the Mac.
      ZStack {
        if session.finishing && session.phase == .signingIn {
          SettingUpScreen().transition(.opacity)
        } else {
          SignInScreen().transition(.opacity)
        }
      }
      .animation(.easeInOut(duration: 0.3), value: session.finishing && session.phase == .signingIn)
    case .signedIn:
      // A new account's first run, then the list (Simeon's chat open on top when he was just made).
      ZStack {
        if session.firstRun == .needed {
          OnboardingFlow().transition(.opacity)
        } else {
          HomeView(opening: session.launch.screen).transition(.opacity)
        }
      }
      .animation(.easeInOut(duration: 0.35), value: session.firstRun == .needed)
      // Simeon still being made once the first run is over, or his making failed.
      .overlay { HandOffNotice() }
      // Refused before the computer was ever reached (`mzn`): the access cover over the first run and the list (ComputerStates.swift).
      .overlay { AccessCoverLayer() }
    }
  }
}
#endif

/**
 * Signing in, in the design of the founder's reference (9 October 2026,
 * ChatGPT's: "above is our logo, simeon real logo, below SimeonLabs - with
 * our logo name font (see website) - then continue with apple - and below
 * google - with the privacy below"). simeonlabs.com's own mark and wordmark
 * (Assets SignIn/, made from the site's files by
 * ios/scripts/make-sign-in-assets.mjs) in the middle of the space above the
 * buttons; Continue with Apple and Continue with Google in the app's own
 * buttons (`SignInButton`), on the app's ground; the Terms and the Privacy
 * Policy under them. While the sheet is open the screen stays: the pressed
 * button shows a spinner.
 */
struct SignInScreen: View {
  @Environment(SessionController.self) private var session

  /** The addresses the Mac's window and the web app link (they answer 404 until the pages are written). */
  static let terms = URL(string: "https://www.simeonlabs.com/terms")!
  static let privacy = URL(string: "https://www.simeonlabs.com/privacy")!

  /** What the screen says above the buttons: a sign-in that went wrong. While Apple's or Google's sheet is open, the pressed button's spinner says it alone (the founder, 12 October 2026: "if the google icon is already loading, we dont need the text"); once the account is in, `SettingUpScreen` takes the screen. */
  private var message: String? {
    if case .signedOut(let message) = session.phase { return message }
    return nil
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 24)
      VStack(spacing: 28) {
        // The logo lighting up, then in its true colour (`LogoShimmer`), each time the screen comes.
        LogoShimmer().frame(width: 46, height: 46)
        Image("SignIn/Wordmark").resizable().scaledToFit().frame(height: 25)
      }
      .foregroundStyle(Ink.primary)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("SimeonLabs")
      .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 24)
      if let message {
        Text(message)
          .font(.system(size: 15))
          .foregroundStyle(Ink.secondary)
          .multilineTextAlignment(.center)
          .padding(.bottom, 18)
      }
      // No `.disabled` while a sign-in runs: it would grey the pressed button's spinner; a second press does nothing (`signIn(with:)`).
      VStack(spacing: 12) {
        SignInButton(provider: .apple, busy: session.signingInWith == .apple) { start(.apple) }
        SignInButton(provider: .google, busy: session.signingInWith == .google) { start(.google) }
        // The founder's ChatGPT reference (19 October 2026): an email, then a code or a password (EmailSignInSheet).
        EmailSignInButton(busy: session.signingInWithEmail) { showsEmail = true }
      }
      .frame(maxWidth: 420)
      Text(Self.legal)
        .font(.system(size: 13))
        .foregroundStyle(Ink.secondary)
        .tint(Ink.primary)
        .multilineTextAlignment(.center)
        .padding(.top, 28)
        .padding(.bottom, 14)
    }
    // The first run's margins (its Continue and Back).
    .padding(.horizontal, 24)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground)
    .sheet(isPresented: $showsEmail, onDismiss: {
      // Apple's sheet or Google's page once this one has gone: presented while it closes, they don't show.
      if let provider = pendingProvider {
        pendingProvider = nil
        start(provider)
      }
    }) {
      EmailSignInSheet(
        provider: { provider in
          pendingProvider = provider
          showsEmail = false
        },
        signedIn: { pair in
          showsEmail = false
          Task { await session.signIn(with: pair) }
        }
      )
      .presentationBackground(Ink.ground)
    }
  }

  @State private var showsEmail = false
  /** Continue with Google or Apple pressed in Log in or sign up: started when its sheet has closed. */
  @State private var pendingProvider: SignIn.Provider?

  private func start(_ provider: SignIn.Provider) {
    Task { await session.signIn(with: provider) }
  }

  /** "By continuing, you agree to our Terms & Privacy Policy.", the two names links in the ink, semibold, not underlined (the dotted line ran through the letters on the phone; the founder: "makes no sense"). */
  static var legal: AttributedString {
    // One sentence to translate, its two links written in Markdown (20 October 2026, docs/localization.md).
    let sentence = String(localized: "By continuing, you agree to our [Terms](\(terms.absoluteString)) & [Privacy Policy](\(privacy.absoluteString)).")
    var text = (try? AttributedString(markdown: sentence)) ?? AttributedString(sentence)
    let links = text.runs.filter { $0.link != nil }.map(\.range)
    for range in links { text[range].font = Font.system(size: 13, weight: .semibold) }
    return text
  }
}

/**
 * One of the sign-in screen's two buttons, in the app's own glass buttons
 * (the founder, 9 October 2026: "use our existing iphone design"): Apple's
 * black on light and white on dark ("the apple button make it white/black.
 * not blue", as Apple asks of its own), Google's in the plain glass. The logos are sized to the words as
 * in the reference (measured on it: Apple's about 1.35 times the capitals'
 * height, Google's "G" about 1.2 times, 8 to 9 points before the words): 16
 * and 15 points beside 17-point type, whose capitals are 12, 8 points apart.
 * Log in or sign up is the third (`EmailSignInButton`), in Google's glass.
 */
struct SignInButton: View {
  let provider: SignIn.Provider
  let busy: Bool
  let action: () -> Void

  var body: some View {
    if provider == .apple {
      // The ink as the glass's tint and the ground for the words: black with white words on light, the reverse on dark.
      Button(action: action) { label(ink: Ink.ground) }
        .buttonStyle(.glassProminent)
        .tint(Ink.primary)
    } else {
      Button(action: action) { label(ink: Ink.primary) }
        .buttonStyle(.glass)
    }
  }

  private func label(ink: Color) -> some View {
    HStack(spacing: 8) {
      if busy {
        ProgressView().tint(ink).frame(width: 16, height: 16)
      } else if provider == .apple {
        Image("SignIn/Apple").resizable().scaledToFit().frame(height: 16).offset(y: -1)
      } else {
        Image("SignIn/Google").resizable().scaledToFit().frame(width: 15, height: 15)
      }
      Text(provider == .apple ? "Continue with Apple" : "Continue with Google")
        .font(.system(size: 17, weight: .semibold))
    }
    .foregroundStyle(ink)
    .frame(maxWidth: .infinity)
    .frame(height: 50)
  }
}

/** Log in or sign up, under Google's, in the same glass with no logo; the spinner while its sign-in enters the app. */
struct EmailSignInButton: View {
  let busy: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Group {
        if busy {
          ProgressView().tint(Ink.primary).frame(width: 16, height: 16)
        } else {
          Text("Log in or sign up").font(.system(size: 17, weight: .semibold))
        }
      }
      .foregroundStyle(Ink.primary)
      .frame(maxWidth: .infinity)
      .frame(height: 50)
    }
    .buttonStyle(.glass)
  }
}

/**
 * "Setting up Simeon's computer" between a sign-in and the app (the founder,
 * 19 October 2026: "instead of having the thing load in the sign in page,
 * have setting up computer like in mac. with the light thing animation"):
 * the Mac's words (`SettingUp`, mac/Simeon/SignInScreen.swift), 17 medium,
 * the light sweeping across them (`ShimmerText`), in the middle of the
 * app's ground. It shows while the account loads after Apple, Google or
 * Log in or sign up gave it (`SessionController.finishing`).
 */
struct SettingUpScreen: View {
  static let words = String(localized: "Setting up Simeon\u{2019}s computer")

  var body: some View {
    ShimmerText(text: Self.words, font: .system(size: 17, weight: .medium))
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Ink.ground)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Self.words)
  }
}

/**
 * The launch, as apps open (the founder's references, 9 October 2026): on
 * the app's own ground (the system's launch screen is the same colour, so
 * there is no flash), the SimeonLabs logo lighting up in the middle
 * (`LogoShimmer`, the founder, 11 October 2026: in place of Simeon's
 * picture), until the app is ready (signed in with its agents): the logo
 * plays to its true colour first, and the cover never stays more than four
 * seconds; then it fades. Signed out, it goes at once: the sign-in screen
 * plays the logo itself. It shows on every start, and again on coming back
 * after a quarter of an hour away.
 */
struct LaunchCover: View {
  @Environment(SessionController.self) private var session
  @Environment(AppStore.self) private var store
  @Environment(\.scenePhase) private var scenePhase
  @State private var showing = true
  @State private var since = Date()
  @State private var leftAt: Date?

  /** At the sign-in, whose own logo plays. */
  private var signedOut: Bool {
    switch session.phase {
    case .signedOut, .signingIn: return true
    default: return false
    }
  }

  /** Only read while it shows, so the roster's changes do not redraw it afterwards. */
  private var ready: Bool {
    switch session.phase {
    case .starting: return false
    case .signedIn: return store.hasAgents || session.firstRun == .needed
    default: return true
    }
  }

  var body: some View {
    let waiting = showing && ready
    ZStack {
      if showing {
        Ink.ground
          .ignoresSafeArea()
          .overlay { LogoShimmer().frame(width: 64, height: 64) }
          .transition(.opacity)
      }
    }
    .allowsHitTesting(showing)
    .task(id: waiting) {
      guard showing else { return }
      let shown = Date().timeIntervalSince(since)
      let wait = signedOut ? 0 : ready ? max(0, LogoShimmer.duration - shown) : max(0, 4 - shown)
      try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
      guard !Task.isCancelled else { return }
      withAnimation(.easeOut(duration: 0.35)) { showing = false }
    }
    .onChange(of: scenePhase) { _, phase in
      if phase == .background { leftAt = Date() }
      guard phase == .active, let left = leftAt else { return }
      leftAt = nil
      if Date().timeIntervalSince(left) > 15 * 60 {
        since = Date()
        showing = true
      }
    }
  }
}

/**
 * The SimeonLabs logo lighting up (`LogoLightUp` in the core: the
 * founder's video of 11 October 2026, measured frame by frame): it fades in
 * to 40% of the ink, a band of the full ink crosses it on the diagonal
 * twice, then it comes to its true colour by 2.85 s and stays. Black on
 * light, white on dark. With Reduce Motion, the logo at once. The Mac's
 * sign-in draws the same (mac/Simeon/SignInScreen.swift).
 */
struct LogoShimmer: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var start = Date()
  @State private var done = false

  static let duration = LogoLightUp.duration

  var body: some View {
    Group {
      if done || reduceMotion {
        mark.foregroundStyle(Ink.primary)
      } else {
        TimelineView(.animation) { context in
          mark.foregroundStyle(Self.gradient(at: context.date.timeIntervalSince(start)))
        }
      }
    }
    .task {
      start = Date()
      try? await Task.sleep(nanoseconds: UInt64(Self.duration * 1_000_000_000))
      done = true
    }
    .accessibilityHidden(true)
  }

  private var mark: some View {
    Image("SignIn/Mark").resizable().renderingMode(.template).scaledToFit()
  }

  /** The ink along the diagonal at `t`, from the top left corner to the bottom right. */
  static func gradient(at t: TimeInterval) -> LinearGradient {
    let stops = LogoLightUp.places.map { Gradient.Stop(color: Ink.primary.opacity(LogoLightUp.ink(at: $0, time: t)), location: $0) }
    return LinearGradient(stops: stops, startPoint: .topLeading, endPoint: .bottomTrailing)
  }
}

// MARK: - The first run

/**
 * The first run (the founder, 12 October 2026: "simple onboarding … asked
 * the necessary. no bloated screen", ChatGPT's): the person's name, Face
 * ID where the phone has it, then notifications with their switch, one
 * screen each. Simeon is made meanwhile, out of sight (`beginHandOff`); his chat
 * opens once the first run is over. Only a new account sees it
 * (SessionController.firstRun).
 */
struct OnboardingFlow: View {
  @Environment(SessionController.self) private var session
  @Environment(AppStore.self) private var store
  @State private var steps: [OnboardingStep] = [.name]
  @State private var step: OnboardingStep = .name
  @State private var name = ""
  @State private var nameTouched = false
  @State private var enablingFaceID = false
  @State private var notificationsOn = true
  @State private var notificationsRefused = false
  @State private var askingNotifications = false
  @FocusState private var nameFocused: Bool
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    ZStack {
      switch step {
      case .name: nameScreen
      case .faceID: faceIDScreen
      case .notifications: notificationsScreen
      }
    }
    .id(step)
    .transition(.opacity)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground.ignoresSafeArea())
    .task {
      session.beginHandOff()
      steps = OnboardingStep.steps(faceID: AppLock.available, notifications: true)
      // The switch starts on, unless the phone's own Settings refused Simeon (turning it on then opens them).
      notificationsRefused = await Notifications.refused()
      notificationsOn = Notifications.isOn && !notificationsRefused
    }
  }

  // MARK: The three screens

  /** The question at the top: an icon, the title, a line under it. */
  private func header(_ step: OnboardingStep, @ViewBuilder icon: () -> some View) -> some View {
    VStack(spacing: 18) {
      icon()
      // At 22, as the sign-in sheet's titles (the founder, 25 October 2026, with ChatGPT's as the reference).
      Text(step.title(unlockingWith: AppLock.name))
        .font(.system(size: 22, weight: .regular))
        .foregroundStyle(Ink.primary)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
      if let detail = step.detail {
        Text(detail)
          .font(.system(size: 16))
          .foregroundStyle(Ink.secondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, -6)
      }
    }
    .padding(.horizontal, 28)
    .padding(.top, 72)
  }

  /** "What should we call you?": one field, the name from Apple or Google already in it; the agreement and Continue under it. */
  private var nameScreen: some View {
    let typed = Onboarding.normalizedName(name)
    return VStack(spacing: 0) {
      header(.name) {
        Image("SignIn/Mark").resizable().renderingMode(.template).scaledToFit().frame(width: 34, height: 34)
          .foregroundStyle(Ink.primary)
          .accessibilityHidden(true)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(Onboarding.nameLabel).font(.system(size: 13)).foregroundStyle(Ink.secondary)
        TextField("", text: $name)
          .font(.system(size: 18))
          .foregroundStyle(Ink.primary)
          .textContentType(.name)
          .textInputAutocapitalization(.words)
          .autocorrectionDisabled()
          .submitLabel(.continue)
          .focused($nameFocused)
          .onSubmit { if !typed.isEmpty { leaveName() } }
          .onChange(of: name) { _, value in
            nameTouched = true
            if value.count > 60 { name = String(value.prefix(60)) }
          }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(nameFocused ? Ink.primary.opacity(0.45) : Ink.primary.opacity(0.18), lineWidth: 1))
      .contentShape(.rect)
      .onTapGesture { nameFocused = true }
      .padding(.top, 40)
      Text(Self.agreement)
        .font(.system(size: 15))
        .foregroundStyle(Ink.secondary)
        .tint(Ink.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 14)
      continueButton(enabled: !typed.isEmpty, action: leaveName)
        .padding(.top, 24)
      Spacer()
    }
    .frame(maxWidth: 460)
    .padding(.horizontal, 24)
    .task {
      if !nameTouched, name.isEmpty, let suggested = session.suggestedName { name = suggested; nameTouched = false }
      try? await Task.sleep(nanoseconds: 400_000_000)
      if !store.accessCoverShown { nameFocused = true }
    }
    .onChange(of: session.suggestedName) { _, suggested in
      // The profile answered after the screen came: its name, unless the person typed.
      if !nameTouched, name.isEmpty, let suggested { name = suggested; nameTouched = false }
    }
    // The plans cover over the first run (no plan, the free month not started): no keyboard over it; the name's once it lifts.
    .onChange(of: store.accessCoverShown) { _, shown in
      if shown { nameFocused = false } else { nameFocused = true }
    }
  }

  /**
   * Under the name, as ChatGPT's first-run screen has it (the founder, 25
   * October 2026): "By tapping “Continue”, you agree to our Terms and have
   * read our Privacy Policy.", the two names links, underlined, in the grey.
   */
  static var agreement: AttributedString {
    let sentence = String(localized: "By tapping “Continue”, you agree to our [Terms](\(Legal.terms.absoluteString)) and have read our [Privacy Policy](\(Legal.privacy.absoluteString)).")
    var text = (try? AttributedString(markdown: sentence)) ?? AttributedString(sentence)
    for range in text.runs.filter({ $0.link != nil }).map(\.range) { text[range].underlineStyle = Text.LineStyle.single }
    return text
  }

  /** "Unlock Simeon with Face ID": Continue turns it on (iOS asks once whether Simeon may use it), Skip leaves it off. */
  private var faceIDScreen: some View {
    VStack(spacing: 0) {
      header(.faceID) {
        Image(systemName: AppLock.biometry == .touchID ? "touchid" : "faceid")
          .font(.system(size: 44, weight: .light))
          .foregroundStyle(Ink.primary)
          .accessibilityHidden(true)
      }
      Spacer()
      continueButton(enabled: !enablingFaceID) {
        enablingFaceID = true
        Task {
          _ = await AppLock.shared.enable()
          enablingFaceID = false
          advance()
        }
      }
      Button(action: advance) {
        Text("Skip").font(.system(size: 17, weight: .medium)).frame(maxWidth: .infinity).frame(height: 48).contentShape(.rect)
      }
      .buttonStyle(.tactile)
      .foregroundStyle(Ink.primary)
      .padding(.top, 6)
      .padding(.bottom, 8)
    }
    .frame(maxWidth: 460)
    .padding(.horizontal, 24)
  }

  /**
   * "Allow notifications", with a switch in a card (the
   * founder, 12 October 2026: "the notification thing. toggle", as the
   * reference's Data Sharing card has it), on to start with. Continue with
   * it on brings Apple's prompt (when the phone has not asked yet) and
   * registers this phone; off, Settings' Notifications is off too.
   */
  private var notificationsScreen: some View {
    VStack(spacing: 0) {
      header(.notifications) {
        // A plain bell drawn as Face ID's glyph (the founder, 25 October 2026: "a simple icon. like face id icon").
        Image(systemName: "bell")
          .font(.system(size: 44, weight: .light))
          .foregroundStyle(Ink.primary)
          .accessibilityHidden(true)
      }
      Toggle(isOn: notificationsSwitch) {
        VStack(alignment: .leading, spacing: 6) {
          Text(Onboarding.notificationsSwitch).font(.system(size: 17)).foregroundStyle(Ink.primary)
          Text(Onboarding.notificationsSwitchLine).font(.system(size: 15)).foregroundStyle(Ink.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .tint(Ink.blue)
      .padding(.horizontal, 20)
      .padding(.vertical, 18)
      .background(Ink.groupedRow, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
      .padding(.top, 40)
      Spacer()
      continueButton(enabled: !askingNotifications) {
        askingNotifications = true
        Task {
          UserDefaults.standard.set(notificationsOn, forKey: Notifications.key)
          if notificationsOn { await session.askForNotificationsNow() }
          askingNotifications = false
          advance()
        }
      }
      .padding(.bottom, 8)
    }
    .frame(maxWidth: 460)
    .padding(.horizontal, 24)
    // Back from the phone's Settings, where Simeon may have just been allowed: the switch on.
    .onChange(of: scenePhase) { _, phase in
      guard phase == .active else { return }
      Task {
        let refused = await Notifications.refused()
        if notificationsRefused && !refused { notificationsOn = true }
        notificationsRefused = refused
      }
    }
  }

  /** On while the phone's Settings allow it; turned on after they refused, it opens them (as Settings' switch does). */
  private var notificationsSwitch: Binding<Bool> {
    Binding(
      get: { notificationsOn },
      set: { on in
        if on && notificationsRefused {
          if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
          return
        }
        notificationsOn = on
      }
    )
  }

  private func continueButton(enabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Text("Continue").font(.system(size: 17, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 52)
    }
    .buttonStyle(.glassProminent)
    .tint(Ink.primary)
    .foregroundStyle(Ink.ground)
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.45)
  }

  // MARK: Moving on

  private func leaveName() {
    nameFocused = false
    let typed = name
    if !Onboarding.normalizedName(typed).isEmpty { session.nameNeeded = false }
    Task { await store.saveName(typed) }
    advance()
  }

  /** The next screen of this phone's steps, or the list. */
  private func advance() {
    guard let index = steps.firstIndex(of: step), index + 1 < steps.count else {
      withAnimation(.easeInOut(duration: 0.3)) { session.finishOnboarding() }
      return
    }
    withAnimation(.easeOut(duration: 0.2)) { step = steps[index + 1] }
  }
}

/**
 * Over the list once the first run is over, while Simeon is still being
 * made (a computer that is slow to wake): one line; if making him failed,
 * why and Try Again (no second Simeon).
 */
struct HandOffNotice: View {
  @Environment(SessionController.self) private var session
  @Environment(AppStore.self) private var store

  var body: some View {
    Group {
      switch session.handOff {
      case .running where session.firstRun == .done && !store.hasAgents:
        ShimmerText(text: Onboarding.gettingReady, font: .system(size: 15, weight: .medium))
          .padding(.horizontal, 18)
          .frame(height: 44)
          .glassEffect(.regular, in: .capsule)
      case .failed(let why) where session.firstRun == .done:
        HStack(spacing: 12) {
          VStack(alignment: .leading, spacing: 2) {
            Text(Onboarding.failed).font(.system(size: 14, weight: .semibold)).foregroundStyle(Ink.primary)
            Text(why).font(.system(size: 12)).foregroundStyle(Ink.secondary).lineLimit(2)
          }
          Button("Try Again") { session.beginHandOff() }
            .buttonStyle(.glass)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .glassEffect(.regular, in: .rect(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 16)
      default:
        EmptyView()
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .padding(.bottom, 28)
    .animation(.easeInOut(duration: 0.25), value: session.handOff)
  }
}

/** A connected app's logo from the app's images (`Connectors/<slug>`). */
struct ConnectLogo: View {
  let app: String
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    if let image = UIImage(named: "Connectors/\(app)") {
      Image(uiImage: image.resolved(scheme)).resizable().interpolation(.high).scaledToFit()
    } else {
      Color.clear
    }
  }
}
