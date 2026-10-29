import SwiftUI
import SimeonCore

/**
 * The sign-in (the founder, 29 October 2026, after a reference: "simple"):
 * the SimeonLabs logo lighting up as on the iPhone (`LogoShimmer`), "Sign
 * in to Simeon", and two buttons, Sign in and Sign up, each opening the
 * browser (Sign up at the web app's sign-up page). Measured from the
 * reference: the logo 36, the title 30 and 24 under it, the buttons 340
 * wide and 48 high, 36 under the title and 12 apart. Then "Setting up
 * Simeon's computer" (A03).
 */
struct SignInScreen: View {
  @Environment(MacSession.self) private var session
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    ZStack {
      look.ground
      switch session.phase {
      case .starting, .settingUp, .firstRun, .signedIn:
        SettingUp(look: look)
      case .signedOut, .waitingForBrowser:
        Landing(look: look)
      }
    }
    .ignoresSafeArea()
  }
}

/** The logo, the title, and the two buttons or their wait. */
private struct Landing: View {
  let look: Look
  @Environment(MacSession.self) private var session

  var body: some View {
    VStack(spacing: 0) {
      LogoShimmer(look: look)
        .frame(width: 36, height: 36)
      Text("Sign in to Simeon")
        .font(.system(size: 30))
        .foregroundStyle(look.ink)
        .fixedSize()
        .padding(.top, 24)
      VStack(spacing: 12) {
        if session.phase == .waitingForBrowser {
          Waiting(look: look)
        } else {
          Button("Sign in") { session.signIn() }
            .buttonStyle(SignInPill(filled: true, look: look))
            .keyboardShortcut(.defaultAction)
          Button("Sign up") { session.signIn(signUp: true) }
            .buttonStyle(SignInPill(filled: false, look: look))
          if case .signedOut(let message?) = session.phase {
            Text(message)
              .font(.system(size: 14))
              .foregroundStyle(look.inkSecondary)
              .multilineTextAlignment(.center)
              .fixedSize(horizontal: false, vertical: true)
              .padding(.top, 2)
          }
        }
      }
      // The same height in every state, so the logo and the title stay put.
      .frame(height: 170, alignment: .top)
      .padding(.top, 36)
    }
    .frame(width: 340)
  }
}

/** A button of the two: a capsule the width of the column, 48 high, filled with the ink (Sign in) or outlined (Sign up). */
private struct SignInPill: ButtonStyle {
  let filled: Bool
  let look: Look

  func makeBody(configuration: Configuration) -> some View {
    Pill(label: configuration.label, pressed: configuration.isPressed, filled: filled, look: look)
  }

  private struct Pill<Label: View>: View {
    let label: Label
    let pressed: Bool
    let filled: Bool
    let look: Look
    @State private var hovering = false

    var body: some View {
      label
        .font(.system(size: 16, weight: .medium))
        .foregroundStyle(filled ? look.ground : look.ink)
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .background(Capsule().fill(filled ? look.ink : look.ink.opacity(hovering ? 0.04 : 0)))
        .overlay {
          if !filled { Capsule().strokeBorder(look.ink.opacity(0.12), lineWidth: 1) }
        }
        .opacity(pressed ? 0.7 : filled && hovering ? 0.88 : 1)
        .contentShape(Capsule())
        .onHover { hovering = $0 }
        .handCursor()
        .animation(.easeOut(duration: 0.12), value: hovering)
    }
  }
}

/** "Continue in your browser", with Reopen link · Cancel (A02). */
private struct Waiting: View {
  let look: Look
  @Environment(MacSession.self) private var session

  var body: some View {
    VStack(spacing: 14) {
      HStack(spacing: 8) {
        ProgressView()
          .controlSize(.small)
        Text("Continue in your browser")
          .font(.system(size: 14))
          .foregroundStyle(look.inkSecondary)
      }
      .frame(height: 20)
      HStack(spacing: 8) {
        Button("Reopen link") { session.reopenLink() }
          .buttonStyle(.borderless)
          .handCursor()
          .font(.system(size: 14))
          .foregroundStyle(look.link)
        Text("·")
          .font(.system(size: 13))
          .foregroundStyle(look.inkTertiary)
        Button("Cancel") { session.cancelSignIn() }
          .buttonStyle(.borderless)
          .handCursor()
          .font(.system(size: 14))
          .foregroundStyle(look.ink)
          .keyboardShortcut(.cancelAction)
      }
      .frame(height: 32)
    }
  }
}

/**
 * "Setting up Simeon's computer" (`sand-loading`): 17, medium, its light
 * sweeping across, the words at 40% with the sweep at full strength.
 */
struct SettingUp: View {
  let look: Look

  var body: some View {
    ShimmerText(words: Text("Setting up Simeon's computer").font(.system(size: 17, weight: .medium)).tracking(-0.136), look: look)
      .accessibilityLabel("Setting up Simeon's computer")
  }
}

/**
 * Words with the window's light sweeping across them (`sand-shimmer-text`):
 * the words at 40%, the sweep at full strength, every 2 seconds. "Setting
 * up Simeon's computer", and an agent's "Typing…" in its chat.
 */
struct ShimmerText: View {
  let words: Text
  let look: Look

  var body: some View {
    words
      .foregroundStyle(look.inkTertiary)
      .overlay {
        TimelineView(.animation) { timeline in
          // 2.2 s a sweep, eased in and out (`sand-shimmer-text`, measured).
          let t = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2.2) / 2.2
          let phase = t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
          GeometryReader { box in
            // The window's gradient (base to 25%, light at 60%, base from 75%), twice the words' width, moved from right to left (`background-position` 200% to -200%).
            LinearGradient(stops: [
              .init(color: .clear, location: 0),
              .init(color: .clear, location: 0.25),
              .init(color: look.ink, location: 0.6),
              .init(color: .clear, location: 0.75),
              .init(color: .clear, location: 1),
            ], startPoint: .leading, endPoint: .trailing)
            .frame(width: box.size.width * 2, height: box.size.height)
            .offset(x: box.size.width * (1 - 3 * phase))
          }
          .mask { words }
        }
      }
  }
}

/**
 * The SimeonLabs logo lighting up (`LogoLightUp` in the core: the
 * founder's video of 11 October 2026, measured frame by frame), the
 * iPhone's launch and sign-in drawn the same: it fades in to 40% of the
 * ink, a band of the full ink crosses it on the diagonal twice, then it
 * comes to its true colour by 2.85 s and stays. With Reduce Motion, the
 * logo at once.
 */
struct LogoShimmer: View {
  let look: Look
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var start = Date()
  @State private var done = false

  var body: some View {
    Group {
      if done || reduceMotion {
        mark.foregroundStyle(look.ink)
      } else {
        TimelineView(.animation) { context in
          mark.foregroundStyle(gradient(at: context.date.timeIntervalSince(start)))
        }
      }
    }
    .task {
      start = Date()
      try? await Task.sleep(nanoseconds: UInt64(LogoLightUp.duration * 1_000_000_000))
      done = true
    }
    .accessibilityHidden(true)
  }

  private var mark: some View {
    Image("SignIn/Mark").resizable().renderingMode(.template).interpolation(.high).scaledToFit()
  }

  /** The ink along the diagonal at `t`, from the top left corner to the bottom right. */
  private func gradient(at t: TimeInterval) -> LinearGradient {
    let stops = LogoLightUp.places.map { Gradient.Stop(color: look.ink.opacity(LogoLightUp.ink(at: $0, time: t)), location: $0) }
    return LinearGradient(stops: stops, startPoint: .topLeading, endPoint: .bottomTrailing)
  }
}
