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

  init() { HangWatch.start() }

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(session)
        .environment(session.store)
        .preferredColorScheme(Self.scheme(session.launch.theme ?? theme))
        .task { await session.start() }
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
 * The chat draws its own top (the phone design's back disc, butterfly and
 * name), so the system's bar is hidden there; this keeps the edge swipe
 * that goes back, which hiding the bar would otherwise switch off. Set
 * from inside the chat while it shows (it used to replace every navigation
 * controller's own setup), and never during a push or pop already under
 * way, where UIKit can stop taking touches.
 */
struct BackSwipe: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> Keeper { Keeper() }
  func updateUIViewController(_ keeper: Keeper, context: Context) {}

  final class Keeper: UIViewController, UIGestureRecognizerDelegate {
    /** The swipe's own delegate, handed back when the chat goes: left with none, a swipe on the list could start a "back" to nowhere and hang. */
    private weak var systemDelegate: UIGestureRecognizerDelegate?
    private weak var navigation: UINavigationController?

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      guard let navigation = navigationController, let swipe = navigation.interactivePopGestureRecognizer else { return }
      self.navigation = navigation
      if swipe.delegate !== self { systemDelegate = swipe.delegate }
      swipe.isEnabled = true
      swipe.delegate = self
    }

    override func viewDidDisappear(_ animated: Bool) {
      super.viewDidDisappear(animated)
      if let swipe = navigation?.interactivePopGestureRecognizer, swipe.delegate === self { swipe.delegate = systemDelegate }
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
      guard let navigation = navigationController else { return false }
      return navigation.viewControllers.count > 1 && navigation.transitionCoordinator == nil
    }
  }
}
