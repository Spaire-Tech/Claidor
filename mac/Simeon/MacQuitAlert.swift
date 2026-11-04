import AppKit
import SimeonCore

/**
 * Quitting while an agent works in this Mac's browser (decision 3 of
 * docs/app-browser/README.md, the web app's QuitAlert.tsx): "Theo is still
 * working in the browser", with Move to Simeon's Computer (the default:
 * Simeon quits and the engine moves the task to the computer), Stop (its
 * task stopped, then Simeon quits) and Cancel. Asked only about agents
 * that are running and have tabs here.
 */
final class SimeonAppDelegate: NSObject, NSApplicationDelegate {
  private var asking = false

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    let browser = MacBrowserHelper.shared
    guard browser.running, !asking else { return asking ? .terminateCancel : .terminateNow }
    asking = true
    Task { @MainActor in
      let browsing = await browser.browsing()
      let busy = (browser.store?.agents ?? []).filter { browsing.contains($0.id) && $0.isRunning }
      guard !busy.isEmpty else { return self.answer(true) }
      NSApp.activate(ignoringOtherApps: true)
      switch Self.ask(names: busy.map { $0.name.isEmpty ? String(localized: "This agent") : $0.name }) {
      case .alertFirstButtonReturn:
        self.answer(true)
      case .alertSecondButtonReturn:
        if let store = browser.store {
          for agent in busy { _ = await store.stopAgentTask(agent.id) }
        }
        self.answer(true)
      default:
        self.answer(false)
      }
    }
    return .terminateLater
  }

  @MainActor
  private func answer(_ quit: Bool) {
    asking = false
    NSApp.reply(toApplicationShouldTerminate: quit)
  }

  @MainActor
  static func ask(names: [String]) -> NSApplication.ModalResponse {
    let list = ListFormatter.localizedString(byJoining: names)
    let alert = NSAlert()
    alert.messageText = names.count == 1
      ? String(localized: "\(list) is still working in the browser")
      : String(localized: "\(list) are still working in the browser")
    alert.informativeText = String(localized: "The pages on this Mac close when you quit Simeon.")
    alert.addButton(withTitle: String(localized: "Move to Simeon's Computer"))
    alert.addButton(withTitle: String(localized: "Stop"))
    alert.addButton(withTitle: String(localized: "Cancel")).keyEquivalent = "\u{1b}"
    return alert.runModal()
  }
}
