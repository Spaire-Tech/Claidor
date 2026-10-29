import AppKit
import SwiftUI
import SimeonCore

/**
 * Simeon in the menu bar, as ChatGPT and Muse are (29 October 2026, the
 * founder: "how do we get this thing up there in the mac like chat gpt and
 * muse"): its mark (`MenuBarMark`, a template, so macOS draws it in the menu
 * bar's own ink), and a Mac menu: Open Simeon, New Agent (New chat while
 * group chats are on, as ⌘N), the agents most recently at work, a dot on
 * those with something unread, then Quit Simeon. An agent opens its chat in
 * the window, made again when it was closed (`MacServices.open`).
 */
struct MenuBarMenu: View {
  let session: MacSession
  let newChat: NewChatState

  /** How many agents the menu lists. */
  static let agentsShown = 8

  var body: some View {
    let signedIn = session.phase == .signedIn
    Button("Open Simeon") { MacServices.shared.open(agent: nil) }
    if signedIn {
      Button(Features.groupChats ? String(localized: "New chat") : String(localized: "New Agent")) {
        MacServices.shared.open(agent: nil)
        newChat.start()
      }
      let agents = Self.listed(session.store.agents)
      if !agents.isEmpty {
        Divider()
        ForEach(agents) { agent in
          Button { MacServices.shared.open(agent: agent.id) } label: {
            if agent.hasUnread || agent.unreadCount > 0 {
              Label(agent.name, systemImage: "circle.fill")
            } else {
              Text(verbatim: agent.name)
            }
          }
        }
      }
    }
    Divider()
    Button("Quit Simeon") { NSApp.terminate(nil) }
      .keyboardShortcut("q")
  }

  /** The agents in the sidebar's order (`sortRoster`: newest activity first), hidden ones aside. */
  static func listed(_ agents: [Agent]) -> [Agent] {
    Array(agents.filter { !$0.isHidden }.prefix(agentsShown))
  }
}
