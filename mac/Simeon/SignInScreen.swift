import SwiftUI
import SimeonCore

/**
 * The Electron window's sign-in (`sand-onboarding__landing`, reference A01
 * and A02) and its "Setting up Simeon's computer" (A03), measured at
 * 1040 × 760: the logo and "Simeon" in Suravaram (68) side by side 14
 * apart, the logo 46, about the height of the word's capitals (the founder,
 * 21 October 2026: at 64 "the logo is way too big for the simeon text"),
 * the line under them 48 lower (22, at most 336 wide), the
 * button 39 below that; the whole block centred and moved 40 down. In the
 * butterfly's place, the SimeonLabs logo lighting up, as on the iPhone (the
 * founder, 11 October 2026: `LogoShimmer`).
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
          .offset(y: 40)
      }
    }
    .ignoresSafeArea()
  }
}

/** The logo and "Simeon", the line under them, and Sign in or its wait. */
private struct Landing: View {
  let look: Look
  @Environment(MacSession.self) private var session

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 14) {
        LogoShimmer(look: look)
          .frame(width: 46, height: 46)
        Text("Simeon")
          .font(.custom(Faces.wordmark, size: 68))
          .foregroundStyle(look.ink)
          .fixedSize()
      }
      .frame(height: 64)
      Text("Your personal team of agents for whatever needs doing.")
        .font(.system(size: 22))
        .foregroundStyle(look.ink)
        .multilineTextAlignment(.center)
        .frame(maxWidth: 336)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 48)
      VStack(spacing: 0) {
        if session.phase == .waitingForBrowser {
          Waiting(look: look)
        } else {
          SignInButton(look: look)
          if case .signedOut(let message?) = session.phase {
            Text(message)
              .font(.system(size: 14))
              .foregroundStyle(look.inkSecondary)
              .multilineTextAlignment(.center)
              .frame(maxWidth: 336)
              .padding(.top, 14)
          }
        }
      }
      .frame(height: 96, alignment: .top)
      .padding(.top, 39)
    }
    .frame(width: 336)
  }
}

/** Sign in →: Apple's prominent button, near black, as the window's. */
private struct SignInButton: View {
  let look: Look
  @Environment(MacSession.self) private var session

  var body: some View {
    Button {
      session.signIn()
    } label: {
      HStack(spacing: 5) {
        Text("Sign in")
          .font(.system(size: 18))
        Image(systemName: "arrow.right")
          .font(.system(size: 12, weight: .semibold))
      }
      .foregroundStyle(look.signInLabel)
      .padding(.horizontal, 12)
      .frame(height: 28)
    }
    .buttonStyle(.borderedProminent)
    .handCursor()
    .buttonBorderShape(.capsule)
    .controlSize(.large)
    .tint(look.signInButton)
    .keyboardShortcut(.defaultAction)
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
