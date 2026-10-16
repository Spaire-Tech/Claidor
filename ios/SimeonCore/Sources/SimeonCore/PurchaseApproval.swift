import Foundation
#if canImport(LocalAuthentication)
import LocalAuthentication
#endif

/**
 * The person's approval of one checkout card, given in Simeon (14 October
 * 2026): Allow, confirmed with Face ID or Touch ID on their own device
 * (the device's passcode when those can't). As Muse does ("that tap is the
 * real yes/no"), the computer hands it to Link as the approval (Link's
 * delegated approval, the host's `linkApprovalDetails`), so Link makes the
 * one-time card without asking again in the Link app. When Link refuses
 * that for Simeon, Link asks in its app as before.
 */
public struct PurchaseApproval: Hashable, Sendable {
  /** What the device confirmed: how, as Link names it ("biometric_face", "biometric_fingerprint"), nil for a passcode or a device with no lock. */
  public struct Confirmed: Hashable, Sendable {
    public let method: String?
    /** "mobile" on the iPhone; nil on the Mac. */
    public let deviceType: String?

    public init(method: String?, deviceType: String?) { self.method = method; self.deviceType = deviceType }
  }

  public let approvedAt: Date
  public let authenticationMethod: String?
  public let deviceType: String?
  /** The person's account on Simeon Labs' server. */
  public let userId: String
  public let userName: String?

  public init(approvedAt: Date, authenticationMethod: String?, deviceType: String?, userId: String, userName: String?) {
    self.approvedAt = approvedAt; self.authenticationMethod = authenticationMethod; self.deviceType = deviceType; self.userId = userId; self.userName = userName
  }

  /** What `answerPurchase` carries (`approval`). */
  public var json: JSON {
    var value: JSON = ["approvedAt": .number(approvedAt.timeIntervalSince1970.rounded()), "userId": .string(userId)]
    if let authenticationMethod { value = value.setting("authenticationMethod", .string(authenticationMethod)) }
    if let deviceType { value = value.setting("deviceType", .string(deviceType)) }
    if let userName, !userName.isEmpty { value = value.setting("userName", .string(userName)) }
    return value
  }

  /** The words under Face ID: "Approve $2.47 at gumroad.com". */
  public static func reason(for card: PurchaseCard) -> String {
    card.flight.map { "Approve \(card.total) for the flight \($0.route)" } ?? "Approve \(card.total) at \(card.domain)"
  }

  #if canImport(LocalAuthentication)
  /**
   * Face ID or Touch ID for one purchase; the device's passcode when the
   * person picks it or biometrics can't; on a device with no lock at all,
   * the tap itself. Nil when the person cancels: nothing is allowed.
   */
  @MainActor
  public static func confirm(reason: String) async -> Confirmed? {
    #if os(iOS)
    let deviceType: String? = "mobile"
    #else
    let deviceType: String? = nil
    #endif
    let biometric = LAContext()
    biometric.localizedFallbackTitle = "Use Passcode"
    if biometric.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) {
      do {
        if try await biometric.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) {
          let method: String? = biometric.biometryType == .faceID ? "biometric_face" : biometric.biometryType == .touchID ? "biometric_fingerprint" : nil
          return Confirmed(method: method, deviceType: deviceType)
        }
        return nil
      } catch let error as LAError where error.code == .userFallback || error.code == .biometryLockout {
        // The passcode, below.
      } catch {
        return nil
      }
    }
    let passcode = LAContext()
    if passcode.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) {
      let confirmed = (try? await passcode.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
      return confirmed ? Confirmed(method: nil, deviceType: deviceType) : nil
    }
    // No lock on this device: the tap is the approval.
    return Confirmed(method: nil, deviceType: deviceType)
  }
  #endif
}
