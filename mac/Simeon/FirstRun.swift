import AppKit
import SwiftUI
import SimeonCore

/**
 * The first run (the founder, 12 October 2026: "simple onboarding … asked
 * the necessary", as the iPhone's): one screen, "What should Simeon call
 * you?", the name from Google already in the field, and Continue. Simeon is
 * made meanwhile, out of sight (`AppStore.handOff`, from the moment the
 * screen shows); Continue opens the window on his chat, or waits on one
 * line while his computer finishes waking. A failure says why, with Try
 * again (no second Simeon). The Mac asks about notifications as the window
 * opens (MacServices).
 *
 * Until 12 October 2026 it was the Electron window's six scenes (Meet
 * Simeon, the Chief of Staff, the apps, the computer, the name, the
 * hand-off).
 */
struct FirstRunScreen: View {
  @Environment(MacSession.self) private var session
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @Environment(\.colorScheme) private var scheme

  @State private var name = ""
  /** The person typed in the name field, so the suggestion that arrives late does not replace it. */
  @State private var nameTouched = false
  /** Continue was pressed: the window opens as soon as Simeon is made. */
  @State private var leaving = false
  @State private var computerReady = false
  @State private var handOffError: String?
  @State private var made: String??
  @State private var handingOff = false

  var body: some View {
    let look = Look(scheme)
    ZStack {
      look.ground
      if leaving && made == nil {
        HandOffLine(look: look, ready: computerReady, error: handOffError, retry: handOff)
          .transition(.opacity)
      } else {
        NameScreen(look: look, name: $name, touched: $nameTouched, submit: forward)
          .transition(.opacity)
      }
    }
    .overlay(alignment: .top) {
      // The window's 52 points at the top move the window (`--sand-app-region: drag`).
      WindowDragArea().frame(height: 52)
    }
    .ignoresSafeArea()
    .animation(.easeInOut(duration: 0.2), value: leaving)
    .onAppear(perform: handOff)
  }

  /** Continue: the name saved (an empty one is not), then the window once Simeon is made. */
  private func forward() {
    let typed = name
    if !Onboarding.normalizedName(typed).isEmpty { Task { await store.saveName(typed) } }
    leaving = true
    if let made { open(made) }
  }

  /**
   * The hand-off (`Pe`), started as the screen shows: the computer, then
   * Simeon made and his introduction begun, at least 1.5 s; the window opens
   * on his chat once Continue has been pressed. Again with Try again.
   */
  private func handOff() {
    guard !handingOff, made == nil else { return }
    handingOff = true
    handOffError = nil
    // Not the view's own task: leaving the screen must not cancel the making of Simeon.
    Task {
      do {
        let id = try await store.handOff(client: "mac", ready: { computerReady = true })
        made = .some(id)
        if leaving { open(id) }
      } catch {
        handOffError = (error as? GatewayError)?.message ?? error.localizedDescription
      }
      handingOff = false
    }
  }

  private func open(_ id: String?) {
    if let id { window.choose(id, store: store) }
    session.finishFirstRun()
  }
}

/**
 * "What should we call you?": the title (28), one field (300 × 38,
 * corners 10, the words centred at 16), and
 * Continue (288 × 36). The field takes the keys after 0.45 s and offers the
 * name the person chose or Google's first name until they type. Return is
 * Continue; it stays dim until there is a name.
 */
private struct NameScreen: View {
  let look: Look
  @Binding var name: String
  @Binding var touched: Bool
  let submit: () -> Void
  @Environment(AppStore.self) private var store
  @FocusState private var focused: Bool

  var body: some View {
    let ready = !Onboarding.normalizedName(name).isEmpty
    VStack(spacing: 0) {
      Image("SignIn/Mark").resizable().renderingMode(.template).scaledToFit().frame(width: 40, height: 40)
        .foregroundStyle(look.ink)
        .accessibilityHidden(true)
      Text(OnboardingStep.name.title)
        .font(.system(size: 28))
        .tracking(-0.56)
        .foregroundStyle(look.ink)
        .multilineTextAlignment(.center)
        .padding(.top, 24)
        .accessibilityAddTraits(.isHeader)
      field
        .padding(.top, 36)
      FlowButton(label: "Continue", look: look, action: { if ready { submit() } })
        .opacity(ready ? 1 : 0.45)
        .padding(.top, 32)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .task {
      try? await Task.sleep(nanoseconds: 450_000_000)
      focused = true
    }
    .task {
      if let suggested = await store.namePrompt(), !touched { name = suggested }
    }
  }

  private var field: some View {
    let shape = RoundedRectangle(cornerRadius: 10, style: .circular)
    let typed = Binding<String>(get: { name }, set: { touched = true; name = String($0.prefix(60)) })
    return TextField("", text: typed, prompt: Text(Onboarding.nameLabel).foregroundStyle(look.namePlaceholder))
      .textFieldStyle(.plain)
      .font(.system(size: 16))
      .tracking(-0.16)
      .multilineTextAlignment(.center)
      .foregroundStyle(look.ink)
      .autocorrectionDisabled()
      .focused($focused)
      .focusEffectDisabled()
      .onSubmit { if !Onboarding.normalizedName(name).isEmpty { submit() } }
      .padding(.horizontal, 14)
      .frame(width: 300, height: 38)
      .background(shape.fill(look.nameField))
      .overlay(shape.strokeBorder(focused ? look.nameFocusEdge : look.nameEdge, lineWidth: 1))
      // Focused, the window's 3-point blue ring (its `box-shadow` takes the place of the field's own soft shadow).
      .background {
        RoundedRectangle(cornerRadius: 13, style: .circular)
          .fill(focused ? look.nameFocusRing : .clear)
          .padding(-3)
      }
      .shadow(color: focused ? .clear : look.nameShadow, radius: 1, x: 0, y: 1)
      .animation(.linear(duration: 0.2), value: focused)
      .accessibilityLabel(Onboarding.nameLabel)
  }
}

/** Continue (near black, near white on dark), a 288 × 36 pill, its colour easing over 0.12 s under the pointer. */
private struct FlowButton: View {
  let label: String
  let look: Look
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: 14))
        .foregroundStyle(look.flowNextLabel)
        .frame(width: 288, height: 36)
        .background(Capsule().fill(hovering ? look.flowNextHover : look.flowNext))
        .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .onHover { inside in
      withAnimation(.easeOut(duration: 0.12)) { hovering = inside }
    }
  }
}

/**
 * Continue pressed before Simeon is made: one line on the centre in the
 * window's moving light (17) from the newest status of the computer,
 * "Getting your team ready…" once it answers. A failure: "Simeon couldn’t
 * finish setting up", why in red (13), and Try again (16, the window's
 * blue), 22 apart.
 */
private struct HandOffLine: View {
  let look: Look
  let ready: Bool
  let error: String?
  let retry: () -> Void
  @Environment(AppStore.self) private var store

  var body: some View {
    VStack(spacing: 22) {
      if let error {
        Text(Onboarding.failed)
          .font(.system(size: 17))
          .tracking(-0.136)
          .foregroundStyle(look.ink)
          .multilineTextAlignment(.center)
        Text(error)
          .font(.system(size: 13))
          .lineSpacing(LineBox.extra(size: 13, lineHeight: 18))
          .foregroundStyle(look.danger)
          .multilineTextAlignment(.center)
        Button("Try again", action: retry)
          .buttonStyle(.hand)
          .font(.system(size: 16))
          .foregroundStyle(look.link)
          .keyboardShortcut(.defaultAction)
      } else {
        TimelineView(.periodic(from: .now, by: 0.5)) { _ in
          let status = store.latestComputerStatus
          let line = Onboarding.handOffLine(ready: ready, percent: status?.pullPercent.map { Int($0.rounded()) }, sleeping: status?.state == "hibernated")
          ShimmerText(words: Text(line).font(.system(size: 17)).tracking(-0.136), look: look)
            .accessibilityLabel(line)
        }
      }
    }
    .frame(width: 305)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

extension Look {
  /** Continue: near black, near white on dark; under the pointer `#2f2f2f` (`#d5d5d5`). Its words the ground's colour (the text's on dark). */
  var flowNext: Color { dark ? Color(hex: 0xfafafa) : Color(hex: 0x070707) }
  var flowNextHover: Color { dark ? Color(hex: 0xd5d5d5) : Color(hex: 0x2f2f2f) }
  var flowNextLabel: Color { dark ? Color(hex: 0x141414) : Color(hex: 0xfcfcfc) }
  /** The name field: white (`#1c1c1e` on dark), a faint edge, blue with a ring when it has the keys. */
  var nameField: Color { dark ? Color(hex: 0x1c1c1e) : .white }
  var nameEdge: Color { dark ? Color(red: 235 / 255, green: 235 / 255, blue: 245 / 255).opacity(0.16) : Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.16) }
  var nameFocusEdge: Color { Color(red: 10 / 255, green: 132 / 255, blue: 1).opacity(dark ? 0.7 : 0.55) }
  var nameFocusRing: Color { Color(red: 10 / 255, green: 132 / 255, blue: 1).opacity(dark ? 0.28 : 0.14) }
  var nameShadow: Color { Color.black.opacity(dark ? 0.3 : 0.04) }
  var namePlaceholder: Color { dark ? Color(red: 235 / 255, green: 235 / 255, blue: 245 / 255).opacity(0.3) : Color(red: 60 / 255, green: 60 / 255, blue: 67 / 255).opacity(0.3) }
}
