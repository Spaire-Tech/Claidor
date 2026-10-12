import AuthenticationServices
#if os(iOS)
import UIKit
#endif

/**
 * Apple's own Sign in with Apple sheet (12 October 2026): Face ID and the
 * person's Apple ID, with the name and e-mail asked for. It answers with
 * Apple's credential (the identity token, the authorization code and, the
 * first time, the name), which `AppleSignIn` sends to Simeon Labs' server,
 * or with Apple's error (`.canceled` when the person closed it). Needs the
 * app's Sign in with Apple entitlement (`Simeon.entitlements`).
 */
final class AppleSignInSheet: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private var continuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>?
  private var controller: ASAuthorizationController?

  /** The sheet, with this sign-in's nonce hashed as Apple wants it (`AppleSignIn.Nonce.hashed`). */
  @MainActor
  func run(hashedNonce: String) async throws -> ASAuthorizationAppleIDCredential {
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = [.fullName, .email]
    request.nonce = hashedNonce
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    self.controller = controller
    return try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      controller.performRequests()
    }
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
      finish(.success(credential))
    } else {
      finish(.failure(ASAuthorizationError(.failed)))
    }
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    finish(.failure(error))
  }

  /** Over the app's window, as the other sign-in sheet (`SheetPresenter`). */
  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    #if os(iOS)
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    if let window = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.flatMap(\.windows).first { return window }
    return UIWindow(windowScene: scenes[0])
    #else
    return NSApp.keyWindow ?? NSApp.mainWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
    #endif
  }

  /** Once: Apple calls one of the two, but never let a continuation resume twice. */
  private func finish(_ result: Result<ASAuthorizationAppleIDCredential, Error>) {
    guard let continuation else { return }
    self.continuation = nil
    controller = nil
    continuation.resume(with: result)
  }
}
