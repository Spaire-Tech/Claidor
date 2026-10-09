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
    let _ = Trace.tally("RootView drawn")
    switch session.phase {
    case .starting:
      PlainScreen(title: "Simeon", busy: true)
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
 * The chat draws its own top (the back disc, the butterfly and name, the
 * call), so the system's bar is hidden there; hidden, the bar's own edge
 * swipe back refuses to start. Every navigation stack takes the swipe on
 * itself: it starts whenever there is a screen to go back to and no push
 * or pop is already under way (a swipe started mid-transition can leave
 * UIKit no longer taking touches). Swiping from the left edge goes back,
 * the screen following the finger, as in Messages.
 */
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
  override open func viewDidLoad() {
    super.viewDidLoad()
    interactivePopGestureRecognizer?.delegate = self
  }

  public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    viewControllers.count > 1 && transitionCoordinator == nil
  }
}
