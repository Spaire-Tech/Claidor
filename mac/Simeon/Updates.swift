import Foundation
import Sparkle

/**
 * Updates (12 October 2026): Sparkle (MIT) reads the feed in the Info.plist
 * (`SUFeedURL`, the server's `/desktop/download/mac/appcast.xml`), once a
 * day and from Simeon › Check for Updates…, and installs a release only
 * when its EdDSA signature matches the key in the Info.plist
 * (`SUPublicEDKey`). `mac/scripts/release.sh` builds the release with that
 * key and writes the feed. A build without a key (Debug, `build.sh`, a hand
 * build) never updates itself.
 */
@MainActor
final class MacUpdates {
  static let shared = MacUpdates()

  private let controller: SPUStandardUpdaterController?

  private init() {
    let key = (Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String ?? "").trimmingCharacters(in: .whitespaces)
    controller = key.isEmpty ? nil : SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)
  }

  /** Whether this build updates itself (it was released with a key). */
  var available: Bool { controller != nil }

  /** At launch: Sparkle starts with the first use, and checks on its own schedule from then on. */
  func start() {
    _ = controller
  }

  /** Simeon › Check for Updates…: Sparkle's own window says what it found. */
  func checkForUpdates() {
    controller?.checkForUpdates(nil)
  }
}
