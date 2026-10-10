import AppKit
import Foundation

/**
 * "Move Simeon to the Applications folder?" at launch (Electron main's
 * `move-to-applications-folder.ts`): asked on every launch while the app
 * runs from anywhere else, with no "don't ask again". Move to Applications
 * moves it (a copy from a disk image), reopens it from there and quits; Not
 * Now carries on; a failure says so and carries on.
 *
 * Electron asks only in a packaged build (`app.isPackaged`). Here that is a
 * release build whose Info.plist says `SimeonAskToMoveToApplications`, which
 * only the release script sets (slice 9): while this app is built beside the
 * Electron one, both are "Simeon.app", and a move would put this one in the
 * Electron app's place.
 */
@MainActor
enum MacMoveToApplications {
  /** Once a launch: the window's task runs again when the window is made again. */
  private static var asked = false

  static func askAtLaunch() {
    #if DEBUG
    return
    #else
    guard !asked else { return }
    asked = true
    guard Bundle.main.object(forInfoDictionaryKey: "SimeonAskToMoveToApplications") as? Bool == true else { return }
    let here = Bundle.main.bundleURL.resolvingSymlinksInPath()
    guard !isInApplications(here) else { return }
    let question = NSAlert()
    question.alertStyle = .informational
    question.messageText = "Move Simeon to the Applications folder?"
    question.informativeText = "Simeon runs from the Applications folder. It will reopen after moving."
    question.addButton(withTitle: "Move to Applications")
    question.addButton(withTitle: "Not Now")
    guard question.runModal() == .alertFirstButtonReturn else { return }
    do {
      try move(here)
    } catch {
      let failed = NSAlert()
      failed.alertStyle = .warning
      failed.messageText = "Simeon couldn't move to Applications"
      failed.informativeText = "Move Simeon to the Applications folder manually, then reopen Simeon"
      failed.addButton(withTitle: "OK")
      failed.runModal()
    }
    #endif
  }

  /** In /Applications or ~/Applications, at any depth (`app.isInApplicationsFolder`). */
  static func isInApplications(_ url: URL) -> Bool {
    let folders = FileManager.default.urls(for: .applicationDirectory, in: [.localDomainMask, .userDomainMask])
    let path = url.standardizedFileURL.path
    return folders.contains { path.hasPrefix($0.resolvingSymlinksInPath().standardizedFileURL.path + "/") }
  }

  /**
   * As Electron's move does it: a Simeon already in Applications and running
   * is brought forward and this copy quits; one not running goes to the
   * Trash and this one takes its place, moved (copied when it cannot be, as
   * from a disk image); then it is opened from there and this copy quits.
   */
  private static func move(_ here: URL) throws {
    let files = FileManager.default
    guard let applications = files.urls(for: .applicationDirectory, in: .localDomainMask).first else { throw CocoaError(.fileNoSuchFile) }
    let there = applications.appendingPathComponent(here.lastPathComponent)
    if files.fileExists(atPath: there.path) {
      if let running = NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "").first(where: { $0.bundleURL?.resolvingSymlinksInPath().standardizedFileURL == there.resolvingSymlinksInPath().standardizedFileURL }) {
        running.activate()
        NSApp.terminate(nil)
        return
      }
      try files.trashItem(at: there, resultingItemURL: nil)
    }
    do { try files.moveItem(at: here, to: there) } catch { try files.copyItem(at: here, to: there) }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.createsNewApplicationInstance = true
    NSWorkspace.shared.openApplication(at: there, configuration: configuration) { _, _ in
      Task { @MainActor in NSApp.terminate(nil) }
    }
  }
}
