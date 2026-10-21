import Foundation
import Observation
import Sparkle

/**
 * Updates (12 October 2026): Sparkle (MIT) reads the feed in the Info.plist
 * (`SUFeedURL`, the server's `/desktop/download/mac/appcast.xml`), once a
 * day and from Simeon › Check for Updates…, and installs a release only
 * when its EdDSA signature matches the key in the Info.plist
 * (`SUPublicEDKey`). `mac/scripts/release.sh` builds the release with that
 * key and writes the feed. A build without a key (Debug, `build.sh`, a hand
 * build) never updates itself.
 *
 * Settings › Updates (21 October 2026) shows what Sparkle knows: a release
 * found (`found`, with a dot beside Updates in Settings' list), a check under
 * way, nothing newer, when it last looked, and its two switches. The page
 * asks the feed quietly (`lookQuietly`, no window); Update Now is Sparkle's
 * own check, which shows the release and installs it.
 */
@MainActor
@Observable
final class MacUpdates: NSObject, SPUUpdaterDelegate {
  static let shared = MacUpdates()

  @ObservationIgnored private var controller: SPUStandardUpdaterController?

  /** The version of a release Sparkle found that this Mac doesn't have yet. */
  private(set) var found: String?
  /** A quiet check is under way. */
  private(set) var checking = false
  /** The last check found nothing newer. */
  private(set) var upToDate = false
  /** When Sparkle last asked the feed. */
  private(set) var lastChecked: Date?
  /** Sparkle's switches, mirrored so the page redraws as they change. */
  private var checksAutomatically = false
  private var downloadsAutomatically = false

  private override init() {
    super.init()
    let key = (Bundle.main.object(forInfoDictionaryKey: "SUPublicEDKey") as? String ?? "").trimmingCharacters(in: .whitespaces)
    guard !key.isEmpty else { return }
    let controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: nil)
    self.controller = controller
    lastChecked = controller.updater.lastUpdateCheckDate
    checksAutomatically = controller.updater.automaticallyChecksForUpdates
    downloadsAutomatically = controller.updater.automaticallyDownloadsUpdates
  }

  /** Whether this build updates itself (it was released with a key). */
  var available: Bool { controller != nil }

  /** At launch: Sparkle starts with the first use, and checks on its own schedule from then on. */
  func start() {
    _ = controller
  }

  /** Simeon › Check for Updates… and Update Now: Sparkle's own window says what it found and installs it. */
  func checkForUpdates() {
    controller?.checkForUpdates(nil)
  }

  /** Asks the feed with no window (`checkForUpdateInformation`): the page and the dot learn of a release. */
  func lookQuietly() {
    guard let updater = controller?.updater, updater.canCheckForUpdates, !checking else { return }
    checking = true
    updater.checkForUpdateInformation()
  }

  var automaticallyChecks: Bool {
    get { checksAutomatically }
    set {
      controller?.updater.automaticallyChecksForUpdates = newValue
      checksAutomatically = newValue
    }
  }

  var automaticallyDownloads: Bool {
    get { downloadsAutomatically }
    set {
      controller?.updater.automaticallyDownloadsUpdates = newValue
      downloadsAutomatically = newValue
    }
  }

  // MARK: SPUUpdaterDelegate (Sparkle calls these on the main thread)

  nonisolated func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
    let version = item.displayVersionString
    Task { @MainActor in
      self.found = version
      self.upToDate = false
      self.checking = false
      self.lastChecked = Date()
    }
  }

  nonisolated func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
    Task { @MainActor in
      self.found = nil
      self.upToDate = true
      self.checking = false
      self.lastChecked = Date()
    }
  }

  nonisolated func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: (any Error)?) {
    Task { @MainActor in self.checking = false }
  }
}
