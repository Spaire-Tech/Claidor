import SwiftUI
import SimeonCore

/**
 * Log in or sign up with an email, as the founder's ChatGPT reference has it
 * (19 October 2026): a sheet with the close at the top right, the SimeonLabs
 * mark, a title and a line under it, then
 *
 * 1. "Log in or sign up": Email, Continue (a code is sent at once), OR, and
 *    Continue with Google and with Apple (the sign-in screen's own);
 * 2. "Check your inbox": the code sent to the email (the keyboard offers it
 *    from Mail), Continue, Resend email, OR, Continue with password;
 * 3. "Enter your password": the account's password, Continue, and Use a
 *    code instead.
 *
 * A new email becomes an account at its code (`EmailSignIn`). A password is
 * set while signed in (Settings › Account › Password), so a forgotten one is
 * a code away. Back at the top left returns a step. The pair goes to
 * `signedIn`, which closes the sheet and enters the app.
 */
struct EmailSignInSheet: View {
  let provider: (SignIn.Provider) -> Void
  let signedIn: (TokenPair) -> Void

  private enum Step { case email, code, password }
  private enum Field { case email, code, password }

  @Environment(SessionController.self) private var session
  @Environment(\.dismiss) private var dismiss
  @State private var step = Step.email
  @State private var email = ""
  @State private var code = ""
  @State private var password = ""
  @State private var busy = false
  /** The sentence under the field: what went wrong, or that a new code went. */
  @State private var note: String?
  @State private var noteIsError = false
  @FocusState private var focus: Field?

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        Image("SignIn/Mark").resizable().renderingMode(.template).scaledToFit()
          .frame(width: 40, height: 40)
          .foregroundStyle(Ink.primary)
          .accessibilityHidden(true)
          .padding(.top, 72)
        Text(title)
          .font(.system(size: 26))
          .foregroundStyle(Ink.primary)
          .multilineTextAlignment(.center)
          .padding(.top, 22)
        Text(subtitle)
          .font(.system(size: 17))
          .foregroundStyle(Ink.secondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 10)
        content.padding(.top, 34)
      }
      .padding(.horizontal, 24)
      .frame(maxWidth: 460)
      .frame(maxWidth: .infinity)
    }
    .scrollBounceBehavior(.basedOnSize)
    .background(Ink.ground)
    .overlay(alignment: .topTrailing) {
      CornerButton(symbol: "xmark", label: String(localized: "Close")) { dismiss() }
    }
    .overlay(alignment: .topLeading) {
      if step != .email {
        CornerButton(symbol: "chevron.left", label: String(localized: "Back")) { back() }
      }
    }
    .animation(.snappy, value: step)
    .onAppear { focus = .email }
  }

  private var title: String {
    switch step {
    case .email: return String(localized: "Log in or sign up")
    case .code: return String(localized: "Check your inbox")
    case .password: return String(localized: "Enter your password")
    }
  }

  private var subtitle: String {
    switch step {
    case .email: return String(localized: "Your agents and their computers, on your iPhone and your Mac.")
    case .code: return String(localized: "Enter the verification code we just sent to \(email.trimmingCharacters(in: .whitespaces)).")
    case .password: return email.trimmingCharacters(in: .whitespaces)
    }
  }

  @ViewBuilder
  private var content: some View {
    VStack(spacing: 0) {
      switch step {
      case .email:
        TextField("Email", text: $email)
          .textContentType(.emailAddress)
          .keyboardType(.emailAddress)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          .submitLabel(.continue)
          .focused($focus, equals: .email)
          .onSubmit(sendCode)
          .modifier(SignInField())
      case .code:
        TextField("Code", text: $code)
          .textContentType(.oneTimeCode)
          .keyboardType(.asciiCapable)
          .textInputAutocapitalization(.characters)
          .autocorrectionDisabled()
          .submitLabel(.continue)
          .focused($focus, equals: .code)
          .onSubmit(verify)
          .modifier(SignInField())
      case .password:
        SecureField("Password", text: $password)
          .textContentType(.password)
          .submitLabel(.continue)
          .focused($focus, equals: .password)
          .onSubmit(signInWithPassword)
          .modifier(SignInField())
      }
      if let note {
        Text(note)
          .font(.system(size: 14))
          .foregroundStyle(noteIsError ? Ink.danger : Ink.secondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.top, 12)
      }
      Button(action: primary) {
        Group {
          if busy {
            ProgressView().tint(Ink.ground)
          } else {
            Text("Continue").font(.system(size: 17, weight: .medium))
          }
        }
        .foregroundStyle(Ink.ground)
        .frame(maxWidth: .infinity)
        .frame(height: 56)
        .background(Ink.primary, in: Capsule())
        .contentShape(Capsule())
      }
      .buttonStyle(.tactile)
      .disabled(busy || !canContinue)
      .opacity(canContinue ? 1 : 0.4)
      .padding(.top, 20)
      switch step {
      case .email:
        OrLine().padding(.vertical, 26)
        VStack(spacing: 12) {
          OutlineButton(label: String(localized: "Continue with Google"), image: "SignIn/Google", imageSize: 18) { provider(.google) }
          OutlineButton(label: String(localized: "Continue with Apple"), image: "SignIn/Apple", imageSize: 20, template: true) { provider(.apple) }
        }
      case .code:
        Button("Resend email", action: resend)
          .font(.system(size: 17, weight: .medium))
          .foregroundStyle(Ink.primary)
          .frame(height: 48)
          .padding(.top, 14)
          .disabled(busy)
        OrLine().padding(.vertical, 22)
        OutlineButton(label: String(localized: "Continue with password")) { go(.password) }
      case .password:
        Button("Use a code instead") { go(.code) }
          .font(.system(size: 17, weight: .medium))
          .foregroundStyle(Ink.primary)
          .frame(height: 48)
          .padding(.top, 14)
      }
    }
    .padding(.bottom, 32)
  }

  private var canContinue: Bool {
    switch step {
    case .email: return EmailSignIn.looksLikeEmail(email)
    case .code: return code.filter { !$0.isWhitespace }.count >= 6
    case .password: return !password.isEmpty
    }
  }

  private func primary() {
    switch step {
    case .email: sendCode()
    case .code: verify()
    case .password: signInWithPassword()
    }
  }

  private func go(_ next: Step) {
    note = nil
    step = next
    switch next {
    case .email: focus = .email
    case .code: focus = .code
    case .password: focus = .password
    }
  }

  private func back() {
    switch step {
    case .email: dismiss()
    case .code:
      code = ""
      go(.email)
    case .password: go(.code)
    }
  }

  private func say(_ words: String?, error: Bool) {
    note = words
    noteIsError = error
    if error { Haptics.warning() }
  }

  /** Continue on the email: a code to it, and the code step. */
  private func sendCode() {
    guard EmailSignIn.looksLikeEmail(email), !busy else {
      if !busy { say(EmailSignIn.badEmail, error: true) }
      return
    }
    busy = true
    Task {
      let sent = await session.emailCode(email)
      busy = false
      switch sent {
      case .sent:
        code = ""
        go(.code)
      case .refused(let words):
        say(words, error: true)
      }
    }
  }

  private func resend() {
    guard !busy else { return }
    busy = true
    Task {
      let sent = await session.emailCode(email)
      busy = false
      switch sent {
      case .sent: say(String(localized: "We sent a new code to \(email.trimmingCharacters(in: .whitespaces))."), error: false)
      case .refused(let words): say(words, error: true)
      }
    }
  }

  private func verify() {
    guard canContinue, !busy else { return }
    busy = true
    Task {
      let outcome = await session.emailVerify(email, code: code)
      finish(outcome)
    }
  }

  private func signInWithPassword() {
    guard canContinue, !busy else { return }
    busy = true
    Task {
      let outcome = await session.emailPassword(email, password: password)
      finish(outcome)
    }
  }

  private func finish(_ outcome: EmailSignIn.Outcome) {
    busy = false
    switch outcome {
    case .tokens(let pair):
      Haptics.success()
      signedIn(pair)
    case .refused(let words), .failed(let words):
      say(words, error: true)
    }
  }
}

/** A field of the sheet: 56 high, 16 round, the ground with an edge, the words at 17. */
private struct SignInField: ViewModifier {
  func body(content: Content) -> some View {
    content
      .font(.system(size: 17))
      .foregroundStyle(Ink.primary)
      .padding(.horizontal, 18)
      .frame(height: 56)
      .background(Ink.ground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Ink.edge, lineWidth: 1))
  }
}

/** "OR" between two hairlines. */
private struct OrLine: View {
  var body: some View {
    HStack(spacing: 18) {
      Rectangle().fill(Ink.hairline).frame(height: 1)
      Text("OR").font(.system(size: 13, weight: .medium)).foregroundStyle(Ink.primary)
      Rectangle().fill(Ink.hairline).frame(height: 1)
    }
    .accessibilityHidden(true)
  }
}

/** The sheet's outlined capsule: an optional logo, the words, 52 high. */
private struct OutlineButton: View {
  let label: String
  var image: String? = nil
  var imageSize: CGFloat = 18
  /** The logo drawn in the ink (Apple's), not in its own colours (Google's). */
  var template = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        if let image {
          Image(image).resizable().renderingMode(template ? .template : .original).scaledToFit()
            .frame(width: imageSize, height: imageSize)
        }
        Text(label).font(.system(size: 17, weight: .medium))
      }
      .foregroundStyle(Ink.primary)
      .frame(maxWidth: .infinity)
      .frame(height: 52)
      .overlay(Capsule().stroke(Ink.edge, lineWidth: 1))
      .contentShape(Capsule())
    }
    .buttonStyle(.tactile)
  }
}

/** The close and back in the sheet's top corners, in a glass circle. */
private struct CornerButton: View {
  let symbol: String
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol).font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
        .frame(width: 44, height: 44)
        .contentShape(Circle())
    }
    .buttonStyle(.tactile)
    .glassEffect(.regular, in: .circle)
    .padding(16)
    .accessibilityLabel(label)
  }
}
