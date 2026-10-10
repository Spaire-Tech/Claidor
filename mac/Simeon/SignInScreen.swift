import SwiftUI
import SimeonCore

/**
 * The Electron window's sign-in (`sand-onboarding__landing`, reference A01
 * and A02) and its "Setting up Simeon's computer" (A03), measured at
 * 1040 × 760: the butterfly (64) and "Simeon" in Suravaram (68) side by
 * side 18 apart, the line under them 48 lower (22, at most 336 wide), the
 * button 39 below that; the whole block centred and moved 40 down.
 */
struct SignInScreen: View {
  @Environment(MacSession.self) private var session
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let look = Look(scheme)
    ZStack {
      look.ground
      switch session.phase {
      case .starting, .settingUp, .signedIn:
        SettingUp(look: look)
      case .signedOut, .waitingForBrowser:
        Landing(look: look)
          .offset(y: 40)
      }
    }
    .ignoresSafeArea()
  }
}

/** The butterfly and "Simeon", the line under them, and Sign in or its wait. */
private struct Landing: View {
  let look: Look
  @Environment(MacSession.self) private var session

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 18) {
        ButterflyMark(palette: AgentPalette.named("blue"), size: 64)
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
          .font(.system(size: 14))
          .foregroundStyle(look.link)
        Text("·")
          .font(.system(size: 13))
          .foregroundStyle(look.inkTertiary)
        Button("Cancel") { session.cancelSignIn() }
          .buttonStyle(.borderless)
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
          let phase = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2) / 2
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
