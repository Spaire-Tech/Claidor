import AudioToolbox
import Foundation

/**
 * The phone's own sounds at the moments Apple's apps make them (the founder,
 * 7 November 2026, with recordings of each: "the face id for the payment,
 * the clicks and the message sent then received"):
 *
 * - a purchase allowed with Face ID: Apple Pay's and the App Store's chime;
 * - a button that acts (a card's Allow, Deny, Connect, Save, the call's
 *   discs): the keyboard's click;
 * - a message sent: Messages' "sent"; an agent's message coming into the
 *   chat on screen: Messages' "received".
 *
 * Each is the phone's own sound, played by iOS (`AudioServicesPlaySystemSound`):
 * nothing is copied into the app. They are system sounds, so the ring/silent
 * switch silences them, as it does Messages', and they never play over a
 * call. The two from Messages and the click are iOS's numbered sounds (1004,
 * 1003, 1104); the chime is read from iOS's own sounds folder, and where a
 * phone has no such file nothing plays.
 */
enum Sounds {
  /** While a call is starting or on: no sound over its voice (`CallHaptics` keeps it). */
  @MainActor static var inCall = false

  /** A purchase allowed with Face ID (or the passcode). */
  @MainActor static func paid() {
    guard let chime = paymentChime else { return }
    play(chime)
  }

  /** A button that acts. */
  @MainActor static func click() { play(1104) }

  /** A message of the person's own gone out. */
  @MainActor static func sent() { play(1004) }

  /** An agent's message come into the chat on screen. */
  @MainActor static func received() { play(1003) }

  @MainActor private static func play(_ sound: SystemSoundID) {
    guard !inCall else { return }
    AudioServicesPlaySystemSound(sound)
  }

  /** Apple Pay's success chime, made a system sound once; nil where the phone has none. */
  @MainActor private static let paymentChime: SystemSoundID? = {
    let url = URL(fileURLWithPath: "/System/Library/Audio/UISounds/payment_success.caf")
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    var id: SystemSoundID = 0
    return AudioServicesCreateSystemSoundID(url as CFURL, &id) == kAudioServicesNoError ? id : nil
  }()
}
