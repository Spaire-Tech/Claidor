import SwiftUI
import UIKit
import SimeonCore

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
  @AppStorage("simeon.theme") private var theme = "system"

  var body: some Scene {
    WindowGroup {
      RootView()
        // The launch: the small butterfly turning around until the app is ready, over everything.
        .overlay { LaunchCover() }
        .environment(session)
        .environment(session.store)
        // One size of type everywhere, the chat's (the founder, 9 October 2026: "i want all to be the size of chat"). The chat
        // is drawn in fixed sizes; rows left to the system (Settings' rows, pickers, menus) grew with the phone's Text Size and
        // stood bigger than it. The phone's setting no longer changes the app; it never changed the chat.
        .dynamicTypeSize(.large)
        // The appearance is set on the windows, and only there. With SwiftUI's preferredColorScheme at the root as well, each
        // sheet was given the style of the moment it opened as its own, so Settings, open while the choice was made, kept the
        // old one until closed (the founder, 9 October 2026, twice). A window's style reaches every sheet it holds at once.
        .onChange(of: session.launch.theme ?? theme, initial: true) { _, name in Self.applyToWindows(name) }
        .task { await session.start() }
        // After the first screen is up, never before it.
        .task { HangWatch.start() }
    }
  }

  /** Every window of the app in the chosen style, and the sheets they hold with them; the type at its one size there too (menus, sheets). */
  @MainActor
  static func applyToWindows(_ name: String) {
    let style: UIUserInterfaceStyle = name == "light" ? .light : name == "dark" ? .dark : .unspecified
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      // Set, never read: reading an override that was never set aborts the app ("Can't return value for trait … that has no override").
      scene.traitOverrides.preferredContentSizeCategory = .large
      for window in scene.windows where window.overrideUserInterfaceStyle != style { window.overrideUserInterfaceStyle = style }
    }
  }

  static func scheme(_ name: String) -> ColorScheme? {
    switch name {
    case "light": return .light
    case "dark": return .dark
    default: return nil
    }
  }
}

struct RootView: View {
  @Environment(SessionController.self) private var session
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    phaseView
      // A chat left open behind a locked phone is not being read (AppStore.isForeground).
      .onChange(of: scenePhase) { _, phase in session.store.isForeground = phase == .active }
  }

  @ViewBuilder
  private var phaseView: some View {
    switch session.phase {
    case .starting:
      // Under the launch cover.
      Ink.ground.ignoresSafeArea()
    case .signedOut, .signingIn:
      // One screen for both, so the pressed button keeps its spinner while the sheet is open.
      SignInScreen()
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
    }
  }
}

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
  static let terms = URL(string: "https://www.simeonlabs.com/legal/terms-of-service")!
  static let privacy = URL(string: "https://www.simeonlabs.com/legal/privacy-policy")!

  /** What the screen says above the buttons: a sign-in that went wrong, or, once the account is in, that the app is getting ready (the founder, 9 October 2026: the line that said so was missed, and the wait looked like a hang). */
  private var message: String? {
    if session.finishing { return "Signing you in…" }
    if case .signedOut(let message) = session.phase { return message }
    return nil
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 24)
      VStack(spacing: 28) {
        Image("SignIn/Mark").resizable().scaledToFit().frame(width: 46, height: 46)
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
  }

  private func start(_ provider: SignIn.Provider) {
    Task { await session.signIn(with: provider) }
  }

  /** "By continuing, you agree to our Terms & Privacy Policy.", the two names links in the ink, semibold, not underlined (the dotted line ran through the letters on the phone; the founder: "makes no sense"). */
  static var legal: AttributedString {
    func link(_ words: String, _ url: URL) -> AttributedString {
      var text = AttributedString(words)
      text.link = url
      text.font = Font.system(size: 13, weight: .semibold)
      return text
    }
    return AttributedString("By continuing, you agree to our ") + link("Terms", terms) + AttributedString(" & ") + link("Privacy Policy", privacy) + AttributedString(".")
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

/**
 * The launch, as apps open (the founder's references, 9 October 2026): on
 * the app's own ground (the system's launch screen is the same colour, so
 * there is no flash), Simeon's butterfly small in the middle, turning
 * around, until the app is ready (signed in with its agents, or at the
 * sign-in); at least one turn, never more than three seconds; then it fades.
 * It shows on every start, and again on coming back after a quarter of an
 * hour away.
 */
struct LaunchCover: View {
  @Environment(SessionController.self) private var session
  @Environment(AppStore.self) private var store
  @Environment(\.scenePhase) private var scenePhase
  @State private var showing = true
  @State private var since = Date()
  @State private var leftAt: Date?

  /** Only read while it shows, so the roster's changes do not redraw it afterwards. */
  private var ready: Bool {
    switch session.phase {
    case .starting: return false
    case .signedIn: return !store.agents.isEmpty || session.firstRun == .needed
    default: return true
    }
  }

  var body: some View {
    let waiting = showing && ready
    ZStack {
      if showing {
        Ink.ground
          .ignoresSafeArea()
          .overlay { LaunchMark().frame(width: 64, height: 64) }
          .transition(.opacity)
      }
    }
    .allowsHitTesting(showing)
    .task(id: waiting) {
      guard showing else { return }
      let shown = Date().timeIntervalSince(since)
      let wait = ready ? max(0, 0.9 - shown) : max(0, 3 - shown)
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

/** Simeon's butterfly turning around its own axis, the turn the Mac's makes while it works, with its light trails, again each time it comes to rest. */
struct LaunchMark: View {
  @State private var engine = MarkEngine()
  @State private var trails = LightTrails()

  var body: some View {
    MarkCanvas(palette: .named("blue"), engine: engine, trails: trails, state: .idle)
    .task {
      engine.turnNow()
      while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 250_000_000)
        if !engine.isTurning { engine.turnNow() }
      }
    }
    .accessibilityHidden(true)
  }
}

// MARK: - The first run

/**
 * The first run on the phone, in Apple's design: the Mac's flow (Meet
 * Simeon, the Chief of Staff, the apps, the computer, the name, then the
 * hand-off that makes Simeon), its scenes and its motion, with the phone's
 * Continue at the bottom and Back under it. Simeon travels from step to
 * step as on the Mac; each step's words and scene come in over 0.2 s and
 * go in 0.1 s. Only a new account sees it (SessionController.firstRun).
 */
struct OnboardingFlow: View {
  @Environment(SessionController.self) private var session
  @Environment(AppStore.self) private var store
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var step: OnboardingStep = .meet
  /** Meet's four beats on the Mac's 35 ms clock: Simeon unseen and large; fading in, growing; turning; settled with the words. */
  @State private var meetBeat = 0
  @State private var heroShown = false
  @State private var turn = 0.0
  /** The computer's beats, 0.9 s apart (-1: Simeon waits, thinking). */
  @State private var demoBeat = -1
  @State private var name = ""
  @State private var nameTouched = false
  @FocusState private var nameFocused: Bool

  var body: some View {
    GeometryReader { proxy in
      let layout = OnboardingLayout(size: proxy.size)
      ZStack(alignment: .top) {
        stepView(layout)
          .id(step)
          .transition(.asymmetric(insertion: .opacity.animation(.easeOut(duration: 0.2)), removal: .opacity.animation(.easeIn(duration: 0.1))))
        hero(layout)
        footer
      }
      .frame(width: proxy.size.width, height: proxy.size.height)
    }
    .background(Ink.ground.ignoresSafeArea())
    // The keyboard rises over the scene, as the Mac's window keeps its size while a field has the focus; the name is sent with Return.
    .ignoresSafeArea(.keyboard)
    .task(id: step) { await runClock() }
    .onChange(of: store.agents.isEmpty) { _, empty in
      // Agents turned up (a computer that was still waking): the account was not new after all.
      if !empty && step != .handOff { session.finishOnboarding(opening: nil) }
    }
  }

  @ViewBuilder
  private func stepView(_ layout: OnboardingLayout) -> some View {
    switch step {
    case .meet:
      OnboardingTitle(text: OnboardingStep.meet.title, layout: layout, bottom: -134)
        .opacity(meetBeat >= 3 ? 1 : 0)
        .offset(y: meetBeat >= 3 ? 0 : 6)
        .animation(OnboardingMotion.arrive(0.8), value: meetBeat >= 3)
    case .chiefOfStaff:
      ChiefOfStaffStep(layout: layout)
    case .connect:
      ConnectStep(layout: layout)
    case .computer:
      ZStack(alignment: .top) {
        let k = Onboarding.screenScale(width: Double(layout.width))
        OnboardingTitle(text: OnboardingStep.computer.title, layout: layout, bottom: -(150 * k + 28))
        ComputerDemo(beat: demoBeat)
          .scaleEffect(CGFloat(k) * layout.fit)
          .position(layout.point(0, 0))
      }
    case .name:
      NameStep(layout: layout, name: $name, touched: $nameTouched, focused: $nameFocused, submit: next)
    case .handOff:
      HandOffStep()
    }
  }

  // MARK: Simeon

  private struct Place: Equatable {
    enum Motion { case none, standard, slow, bounce, exit }
    var x: Double, y: Double, scale: Double, opacity: Double
    var state: MarkState
    var motion: Motion

    var animation: Animation? {
      switch motion {
      case .none: return nil
      case .standard: return OnboardingMotion.standard
      case .slow: return OnboardingMotion.slow
      case .bounce: return OnboardingMotion.bounce
      case .exit: return OnboardingMotion.exit
      }
    }
  }

  /** Where Simeon is on each step (the window's `QBn` placements, the patch's seats). */
  private func heroPlace(_ layout: OnboardingLayout) -> Place {
    switch step {
    case .meet:
      if meetBeat < 1 { return Place(x: 0, y: Onboarding.heroY, scale: 1.6, opacity: 1, state: .idle, motion: .none) }
      if meetBeat < 3 { return Place(x: 0, y: Onboarding.heroY, scale: 2.3, opacity: 1, state: .idle, motion: .slow) }
      return Place(x: 0, y: Onboarding.heroY, scale: 1, opacity: 1, state: .idle, motion: .standard)
    case .chiefOfStaff:
      return Place(x: 0, y: Onboarding.heroY, scale: 1, opacity: 1, state: .idle, motion: .standard)
    case .connect:
      return Place(x: 0, y: Onboarding.connectY, scale: 1.3, opacity: 1, state: .idle, motion: .standard)
    case .computer:
      let cursor = Onboarding.cursorPlace(beat: demoBeat, width: Double(layout.width))
      return Place(x: cursor.x, y: cursor.y, scale: cursor.scale, opacity: 1, state: demoBeat < 0 ? .thinking : .working, motion: .slow)
    case .name, .handOff:
      return Place(x: 0, y: 0, scale: 0.55, opacity: 0, state: .idle, motion: .exit)
    }
  }

  /** Simeon, drawn at his largest (2.3 times the Mac's 80 pt) and scaled down, so he stays sharp at every size. */
  private func hero(_ layout: OnboardingLayout) -> some View {
    let place = heroPlace(layout)
    let largest: CGFloat = 80 * 2.3
    return ButterflyView(palette: .named("blue"), motion: place.state)
      .frame(width: largest, height: largest)
      .rotation3DEffect(.degrees(step == .meet ? turn : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.35)
      .opacity(step == .meet && !heroShown ? 0 : 1)
      .scaleEffect(CGFloat(place.scale / 2.3) * layout.fit)
      .opacity(place.opacity)
      .position(layout.point(place.x, place.y))
      .animation(place.animation, value: place)
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }

  // MARK: Continue and Back

  private var footer: some View {
    let waiting = step == .meet && meetBeat < 3
    return VStack(spacing: 8) {
      Button(action: next) {
        Text("Continue").font(.system(size: 17, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 50)
      }
      .buttonStyle(.glassProminent)
      Button(action: back) {
        Text("Back").font(.system(size: 17)).frame(maxWidth: .infinity).frame(height: 44).contentShape(.rect)
      }
      .buttonStyle(.plain)
      .foregroundStyle(Ink.link)
      .opacity(step.hasBack ? 1 : 0)
      .disabled(!step.hasBack)
    }
    .frame(maxWidth: 420)
    .padding(.horizontal, 24)
    .padding(.bottom, 8)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    .opacity(step == .handOff || waiting ? 0 : 1)
    .offset(y: waiting ? 6 : 0)
    .animation(OnboardingMotion.arrive(0.8), value: waiting)
    .allowsHitTesting(step != .handOff && !waiting)
  }

  private func next() {
    guard let following = step.next else { return }
    if step == .name {
      nameFocused = false
      // Saved as the Mac's name step saves it, without waiting; empty is allowed (asked again later).
      let typed = name
      Task { await store.saveName(typed) }
    }
    withAnimation(.easeOut(duration: 0.2)) { step = following }
  }

  private func back() {
    guard let previous = step.previous else { return }
    nameFocused = false
    withAnimation(.easeOut(duration: 0.2)) { step = previous }
  }

  /** Each step's clock, started again whenever the step shows. People who reduce motion get the finished picture. */
  private func runClock() async {
    func wait(_ ms: UInt64) async -> Bool {
      try? await Task.sleep(nanoseconds: ms * 1_000_000)
      return !Task.isCancelled
    }
    switch step {
    case .meet:
      turn = 0
      if reduceMotion { heroShown = true; meetBeat = 3; return }
      meetBeat = 0; heroShown = false
      withAnimation(.timingCurve(0.4, 0, 0.2, 1, duration: 1.2)) { heroShown = true }
      guard await wait(35) else { return }
      meetBeat = 1
      guard await wait(525) else { return }
      meetBeat = 2
      withAnimation(.timingCurve(0.65, 0, 0.35, 1, duration: 1.4)) { turn = 360 }
      guard await wait(1_400) else { return }
      meetBeat = 3
    case .computer:
      if reduceMotion { demoBeat = Onboarding.computerFrames.count - 1; return }
      demoBeat = -1
      for beat in 0..<Onboarding.computerFrames.count {
        guard await wait(900) else { return }
        demoBeat = beat
      }
    case .name:
      if !nameTouched, name.isEmpty, let suggested = session.suggestedName { name = suggested }
      guard await wait(450) else { return }
      nameFocused = true
    default:
      break
    }
  }
}

/** The Mac's motion for the first run (`scene.ts`'s springs, its exit, and the words' arrival curve). */
enum OnboardingMotion {
  static let standard = Animation.interpolatingSpring(mass: 1, stiffness: 175, damping: 26)
  static let slow = Animation.interpolatingSpring(mass: 1, stiffness: 100, damping: 20)
  static let bounce = Animation.interpolatingSpring(mass: 1, stiffness: 175, damping: 18.5)
  static let exit = Animation.timingCurve(0.4, 0, 1, 1, duration: 0.3)
  static func arrive(_ duration: Double) -> Animation { .timingCurve(0.16, 1, 0.3, 1, duration: duration) }
}

/**
 * Where the first run's scene sits on this screen: the Mac's stage centre,
 * placed so the tallest step (330 pt above it, 140 below) fits between the
 * top and the buttons; scaled down evenly only on a screen too short for it.
 */
struct OnboardingLayout {
  let width: CGFloat
  let height: CGFloat
  let originY: CGFloat
  let fit: CGFloat
  static let above: CGFloat = 330, below: CGFloat = 140, buttons: CGFloat = 110

  init(size: CGSize) {
    width = size.width; height = size.height
    let top: CGFloat = 12
    let room = max(size.height - Self.buttons - 12 - top, 1)
    fit = min(1, room / (Self.above + Self.below))
    originY = top + (room - (Self.above + Self.below) * fit) / 2 + Self.above * fit
  }

  /** A point of the Mac's stage (from its centre) on this screen. */
  func point(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: width / 2 + CGFloat(x) * fit, y: originY + CGFloat(y) * fit) }
}

/** A step's title, held by its last line `bottom` pt above the stage's centre so a second line grows upwards (the Mac's phone layout); its size follows the width, 22 to 28 pt. */
struct OnboardingTitle: View {
  let text: String
  let layout: OnboardingLayout
  let bottom: Double

  var body: some View {
    Text(text)
      .font(.system(size: min(28, max(22, layout.width * 0.071)), weight: .bold))
      .multilineTextAlignment(.center)
      .foregroundStyle(Ink.primary)
      .fixedSize(horizontal: false, vertical: true)
      .padding(.horizontal, 24)
      .frame(maxWidth: .infinity)
      .frame(height: max(0, layout.point(0, bottom).y), alignment: .bottom)
      .accessibilityAddTraits(.isHeader)
  }
}

/**
 * "Simeon is your personal Chief of Staff": six agents, each faint until a
 * blue curve drawn from Simeon's side reaches it (0.9 s each, 0.18 s apart
 * from 0.7 s), then brightening (0.8 s); one line of copy under the title.
 */
struct ChiefOfStaffStep: View {
  let layout: OnboardingLayout
  @State private var drawn = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  private static let line = Color.dynamic(light: "#0a84ff8c", dark: "#64aaffa6")

  var body: some View {
    let crew = Onboarding.crew(width: Double(layout.width))
    ZStack(alignment: .top) {
      OnboardingTitle(text: OnboardingStep.chiefOfStaff.title, layout: layout, bottom: -262)
      Text(Onboarding.cooCopy)
        .font(.system(size: 15))
        .foregroundStyle(Ink.secondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
        .position(layout.point(0, -236))
        .opacity(drawn ? 1 : 0)
        .offset(y: drawn ? 0 : 4)
        .animation(OnboardingMotion.arrive(0.9).delay(0.35), value: drawn)
      ForEach(Array(crew.enumerated()), id: \.element.id) { index, seat in
        CrewCurve(seat: seat, layout: layout)
          .trim(from: 0, to: drawn ? 1 : 0)
          .stroke(Self.line, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
          .animation(.timingCurve(0.4, 0, 0.2, 1, duration: 0.9).delay(Onboarding.lineDelay(index)), value: drawn)
        VStack(spacing: 8) {
          ButterflyView(palette: .named(seat.colour), motion: .idle).frame(width: 56, height: 56)
          Text(seat.label).font(.system(size: 12)).foregroundStyle(Ink.secondary).fixedSize()
        }
        .opacity(drawn ? 1 : 0.28)
        .scaleEffect(drawn ? 1 : 0.92)
        .animation(OnboardingMotion.arrive(0.8).delay(Onboarding.lineDelay(index) + 0.52), value: drawn)
        .position(layout.point(seat.x, seat.y))
      }
    }
    .accessibilityElement(children: .combine)
    .onAppear {
      if reduceMotion {
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) { drawn = true }
      } else {
        drawn = true
      }
    }
  }
}

/** The curve from Simeon's side to one agent (`cooLine`), on the screen. */
struct CrewCurve: Shape {
  let seat: Onboarding.Seat
  let layout: OnboardingLayout

  func path(in rect: CGRect) -> Path {
    let c = Onboarding.curve(to: seat)
    let at = { (p: (x: Double, y: Double)) in layout.point(p.x, Onboarding.heroY + p.y) }
    var path = Path()
    path.move(to: at(c.start))
    path.addCurve(to: at(c.end), control1: at(c.control1), control2: at(c.control2))
    return path
  }
}

/**
 * "Your agents connect to the apps you already use" (simeonlabs.com's
 * connector scene): the apps slide behind a glass tile one place every
 * 1.6 s, the one behind the glass swelling so the tile takes its colour,
 * the far ones blurring and thinning, the row fading out at both ends;
 * Simeon sits on the tile.
 */
struct ConnectStep: View {
  let layout: OnboardingLayout
  @State private var start = Date()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let tile = CGFloat(Onboarding.connectTile)
    ZStack(alignment: .top) {
      OnboardingTitle(text: OnboardingStep.connect.title, layout: layout, bottom: -160)
      ZStack {
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: reduceMotion)) { context in
          let elapsed = reduceMotion ? 0 : context.date.timeIntervalSince(start)
          ZStack {
            ForEach(Array(Onboarding.connectApps.enumerated()), id: \.element) { index, app in
              let orb = Onboarding.orb(index, count: Onboarding.connectApps.count, elapsed: elapsed, width: Double(layout.width))
              ConnectLogo(app: app)
                .frame(width: CGFloat(orb.size), height: CGFloat(orb.size))
                .blur(radius: CGFloat(orb.blur))
                .opacity(orb.opacity)
                .position(x: layout.width / 2 + CGFloat(orb.x), y: 130)
            }
          }
          .frame(width: layout.width, height: 260)
        }
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.18), .init(color: .black, location: 0.82), .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing))
        Color.clear
          .frame(width: tile, height: tile)
          .glassEffect(.regular, in: .rect(cornerRadius: tile * 0.235, style: .continuous))
          .shadow(color: Color(red: 30 / 255, green: 40 / 255, blue: 60 / 255).opacity(0.3), radius: 16, y: 14)
      }
      .frame(width: layout.width, height: 260)
      .scaleEffect(layout.fit)
      .position(layout.point(0, Onboarding.connectY))
      .accessibilityHidden(true)
    }
    .onAppear { start = Date() }
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

/**
 * "They have their own computer and work just like you": the Mac's little
 * screen (441 by 300, its wallpaper and two windows), Simeon as the cursor
 * pressing a tile, another, closing the window and pressing the other's
 * button, a beat every 0.9 s.
 */
struct ComputerDemo: View {
  let beat: Int

  var body: some View {
    let pressed = Onboarding.computerFrame(beat).pressed
    ZStack(alignment: .topLeading) {
      Color(red: 0x24 / 255, green: 0x2a / 255, blue: 0x36 / 255)
      Image("ComputerStep").resizable().scaledToFill().frame(width: 441, height: 300).clipped()
      DemoWindow(shown: beat >= 0 && beat < 6, x: 29.6, y: 32.4, width: 300, height: 183.9, closePressed: pressed == "a-close") {
        DemoTile(x: 13.8, y: 89.8, width: 272.4, height: 102.3)
        DemoTile(x: 13.8, y: 33.2, width: 59.4, height: 44.2)
        DemoTile(x: 82.9, y: 33.2, width: 59.4, height: 44.2, pressed: pressed == "a-tile-2")
        DemoTile(x: 153.5, y: 33.2, width: 59.4, height: 44.2)
        DemoTile(x: 224, y: 33.2, width: 59.4, height: 44.2, pressed: pressed == "a-tile-4")
      }
      DemoWindow(shown: beat >= 3, x: 125, y: 73.9, width: 262.7, height: 183.9, closePressed: false) {
        DemoTile(x: 82.9, y: 38.7, width: 179.7, height: 145.2)
        DemoTile(x: 6.9, y: 38.6, width: 69, height: 145.5)
        DemoTile(x: 100.9, y: 56.7, width: 16.6, height: 16.6, fill: .black.opacity(0.1))
        DemoTile(x: 100.9, y: 89.9, width: 16.6, height: 16.6, fill: .black.opacity(0.1))
        DemoTile(x: 131.3, y: 62.2, width: 89.9, height: 6.9, fill: .black.opacity(0.1))
        DemoTile(x: 131.3, y: 87.1, width: 89.9, height: 6.9, fill: .black.opacity(0.1))
        DemoTile(x: 131.3, y: 102.3, width: 58.1, height: 6.9, fill: .black.opacity(0.1))
        DemoTile(x: 96.8, y: 125.8, width: 152.1, height: 44.2, fill: Color(red: 4 / 255, green: 4 / 255, blue: 4 / 255).opacity(0.12), pressed: pressed == "b-button")
      }
    }
    .frame(width: 441, height: 300)
    .clipShape(RoundedRectangle(cornerRadius: 16.59, style: .continuous))
    .accessibilityHidden(true)
  }
}

/** One of the little screen's windows: it opens from 86 % (0.42 s) and closes back to it (0.26 s). */
struct DemoWindow<Content: View>: View {
  let shown: Bool
  let x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat
  let closePressed: Bool
  @ViewBuilder let content: Content

  var body: some View {
    ZStack(alignment: .topLeading) {
      Color(red: 0xf2 / 255, green: 0xf2 / 255, blue: 0xf4 / 255)
      content
      Rectangle().fill(Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x14 / 255).opacity(0.1)).frame(width: width, height: 0.75).offset(y: 25)
      HStack(spacing: 4.6) {
        Circle().fill(Color(red: 1, green: 0x5f / 255, blue: 0x57 / 255)).frame(width: 7.3, height: 7.3).scaleEffect(closePressed ? 0.72 : 1)
        Circle().fill(Color(red: 0xfe / 255, green: 0xbc / 255, blue: 0x2e / 255)).frame(width: 7.3, height: 7.3)
        Circle().fill(Color(red: 0x28 / 255, green: 0xc8 / 255, blue: 0x40 / 255)).frame(width: 7.3, height: 7.3)
      }
      .animation(.easeInOut(duration: 0.15), value: closePressed)
      .offset(x: 8.9, y: 8.5)
    }
    .frame(width: width, height: height)
    .clipShape(RoundedRectangle(cornerRadius: 8.3, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: 8.3, style: .continuous).stroke(Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x14 / 255).opacity(0.1), lineWidth: 0.75))
    .shadow(color: .black.opacity(0.12), radius: 15, y: 12)
    .shadow(color: .black.opacity(0.05), radius: 5, y: 4.5)
    .opacity(shown ? 1 : 0)
    .scaleEffect(shown ? 1 : 0.86)
    .animation(shown ? .timingCurve(0.1, 0.9, 0.2, 1, duration: 0.42) : .timingCurve(0.2, 0, 0, 1, duration: 0.26), value: shown)
    .offset(x: x, y: y)
  }
}

/** A tile of a window: white, grey when pressed (and a little smaller), 0.15 s. */
struct DemoTile: View {
  let x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat
  var fill: Color = .white
  var pressed = false

  var body: some View {
    RoundedRectangle(cornerRadius: 5.5, style: .continuous)
      .fill(pressed ? Color.black.opacity(0.18) : fill)
      .frame(width: width, height: height)
      .scaleEffect(pressed ? 0.96 : 1)
      .animation(.easeInOut(duration: 0.15), value: pressed)
      .offset(x: x, y: y)
  }
}

/**
 * "How should Simeon & Co call you?": three agents bounce in over one white
 * field, the name the server suggests already in it unless the person typed;
 * Return (or Continue) saves it and goes on. Empty is allowed: the app asks
 * again later.
 */
struct NameStep: View {
  let layout: OnboardingLayout
  @Binding var name: String
  @Binding var touched: Bool
  var focused: FocusState<Bool>.Binding
  let submit: () -> Void
  @State private var arrived = false
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    ZStack(alignment: .top) {
      OnboardingTitle(text: OnboardingStep.name.title, layout: layout, bottom: -150)
      ForEach(Onboarding.nameSeats(width: Double(layout.width)), id: \.id) { seat in
        ButterflyView(palette: .named(seat.colour), motion: .idle)
          .frame(width: CGFloat(80 * seat.scale), height: CGFloat(80 * seat.scale))
          .scaleEffect(arrived ? layout.fit : 0.4)
          .opacity(arrived ? 1 : 0)
          .animation(OnboardingMotion.bounce, value: arrived)
          .position(layout.point(seat.x, seat.y))
          .accessibilityHidden(true)
      }
      TextField(Onboarding.namePlaceholder, text: $name)
        .font(.system(size: 17))
        .multilineTextAlignment(.center)
        .textContentType(.givenName)
        .textInputAutocapitalization(.words)
        .autocorrectionDisabled()
        .submitLabel(.continue)
        .onSubmit(submit)
        .focused(focused)
        .tint(Color(red: 10 / 255, green: 132 / 255, blue: 1))
        .padding(.horizontal, 14)
        .frame(width: min(300, layout.width - 48), height: 44)
        .background(scheme == .dark ? Color(red: 0x1c / 255, green: 0x1c / 255, blue: 0x1e / 255) : .white, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(focused.wrappedValue ? Color(red: 10 / 255, green: 132 / 255, blue: 1).opacity(0.55) : Ink.primary.opacity(0.16), lineWidth: 1))
        .shadow(color: .black.opacity(scheme == .dark ? 0.3 : 0.04), radius: 1, y: 1)
        .onChange(of: name) { _, typed in
          touched = true
          if typed.count > 60 { name = String(typed.prefix(60)) }
        }
        .position(layout.point(0, 4))
      Text(Onboarding.nameNote)
        .font(.system(size: 13))
        .foregroundStyle(Ink.secondary)
        .multilineTextAlignment(.center)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
        .position(layout.point(0, 50))
    }
    .onAppear { arrived = true }
  }
}

/**
 * The hand-off: one line under the Mac's moving light while the computer
 * answers and Simeon is made ("Setting up your Simeon…", then "Getting
 * your team ready…"), shown at least 1.5 s; then his chat opens. If it
 * fails, why, and Try Again (which does not make a second Simeon).
 */
struct HandOffStep: View {
  @Environment(SessionController.self) private var session
  @Environment(AppStore.self) private var store
  @State private var ready = false
  @State private var failure: String?
  @State private var attempt = 0

  var body: some View {
    VStack(spacing: 12) {
      if let failure {
        Text(Onboarding.failed).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
        Text(failure).font(.system(size: 13)).foregroundStyle(Ink.danger).multilineTextAlignment(.center)
        Button("Try Again") { self.failure = nil; attempt += 1 }
          .buttonStyle(.glass)
          .padding(.top, 8)
      } else {
        ShimmerText(text: Onboarding.handOffLine(ready: ready), font: .system(size: 17, weight: .medium))
      }
    }
    .padding(.horizontal, 32)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task(id: attempt) {
      do {
        let id = try await store.handOff(ready: { ready = true })
        session.finishOnboarding(opening: id)
      } catch {
        let unreachable = GatewayError.neverArrived(error) || error is URLError
        failure = unreachable ? Onboarding.unreachable : error.localizedDescription
      }
    }
  }
}
