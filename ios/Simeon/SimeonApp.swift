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
        .preferredColorScheme(Self.scheme(session.launch.theme ?? theme))
        .task { await session.start() }
        // After the first screen is up, never before it.
        .task { HangWatch.start() }
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

  var body: some View {
    switch session.phase {
    case .starting:
      // Under the launch cover.
      Ink.ground.ignoresSafeArea()
    case .signedOut(let message):
      PlainScreen(title: "Simeon", line: "Your agents, on your phone.", note: message, action: ("Sign in", { Task { await session.signIn() } }))
    case .signingIn:
      PlainScreen(title: "Simeon", line: "Finish signing in on the page that opened.", busy: true)
    case .signedIn:
      HomeView(opening: session.launch.screen)
    }
  }
}

/** The app's own screens, one shape: the butterfly, a line or two, a button (the Expo shell's `PlainScreen`). */
struct PlainScreen: View {
  let title: String
  var line: String? = nil
  var note: String? = nil
  var busy = false
  var action: (String, () -> Void)? = nil

  var body: some View {
    VStack(spacing: 0) {
      Spacer()
      ButterflyView(palette: .named("blue"), motion: .idle).frame(width: 96, height: 96).padding(.bottom, 20)
      Text(title).font(.largeTitle.weight(.semibold)).foregroundStyle(Ink.primary)
      if let line {
        Text(line).font(.title3).foregroundStyle(Ink.secondary).multilineTextAlignment(.center).padding(.top, 10)
      }
      if let note {
        Text(note).font(.body).foregroundStyle(Ink.primary).multilineTextAlignment(.center).padding(.top, 16)
      }
      Spacer()
      if busy { ProgressView().padding(.bottom, 24) }
      if let action {
        Button(action: action.1) {
          Text(action.0).font(.headline).frame(maxWidth: .infinity).frame(height: 44)
        }
        .buttonStyle(.glassProminent)
        .padding(.bottom, 12)
      }
    }
    .padding(.horizontal, 28)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Ink.ground)
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
    case .signedIn: return !store.agents.isEmpty
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

/** Simeon's butterfly turning around its own axis, the turn the Mac's makes while it works, again each time it comes to rest. */
struct LaunchMark: View {
  @State private var engine = MarkEngine()
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 60)) { context in
      Canvas { graphics, size in
        let frame = engine.frame(at: context.date.timeIntervalSinceReferenceDate, state: .idle, sizePoints: size.width)
        MarkDrawing.draw(&graphics, in: CGRect(origin: .zero, size: size), palette: .named("blue"), dark: scheme == .dark, style: .live, frame: frame)
      }
    }
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
