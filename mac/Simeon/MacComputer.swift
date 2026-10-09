import AppKit
import SwiftUI
import SimeonCore

/**
 * An agent's computer in a window of its own (the Electron window's
 * full-size computer, `computer/shell/view.tsx`): its screen live, scaled to
 * the window (the computer's own screen stays 1280 by 800, the size the
 * agents click by); Take Over to use it with this Mac's mouse and keyboard
 * (a click gives the screen the keys); Skip Step while the agent waits on the
 * person; I'm Done hands it back and closes the window. Closing the window
 * closes the stream.
 */
struct MacComputerWindow: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.dismissWindow) private var dismissWindow
  @State private var screen: ScreenState?
  @State private var phase = "starting"
  @State private var control = false
  @State private var problem: String?
  @State private var attempt = 0
  @State private var link = ScreenLink()

  var body: some View {
    let name = store.agent(agentId)?.name ?? "The agent"
    let live = screen?.socket != nil && phase == "connected"
    ZStack {
      Color.black
      if let socket = screen?.socket {
        LiveScreen(socket: socket, viewOnly: !control, phase: $phase, link: link)
          .aspectRatio(1280.0 / 800.0, contentMode: .fit)
      }
      if let problem {
        VStack(spacing: 10) {
          Text(problem).font(.system(size: 13)).foregroundStyle(.white.opacity(0.85)).multilineTextAlignment(.center)
          Button("Try Again") { self.problem = nil; attempt += 1 }
        }
        .padding(24)
      } else if !live {
        VStack(spacing: 10) {
          ProgressView().tint(.white)
          Text(status).font(.system(size: 13)).foregroundStyle(.white.opacity(0.75))
        }
      }
    }
    .environment(\.colorScheme, .dark)
    .navigationTitle("\(name)'s Computer")
    .navigationSubtitle(control ? "You're in control" : live ? "Watching" : "")
    .toolbar {
      ToolbarItemGroup(placement: .primaryAction) {
        if waitingOnPerson {
          Button("Skip Step") { Task { await store.handBackComputer(agentId, skip: true); close() } }
            .help("Skip what \(name) asked you to do")
        }
        Toggle(isOn: $control) { Label("Take Over", systemImage: control ? "hand.point.up.left.fill" : "hand.point.up.left") }
          .disabled(!live)
          .help(control ? "Give control back" : "Use the computer with your mouse and keyboard")
        Button { Task { await store.handBackComputer(agentId); close() } } label: { Label("I'm Done", systemImage: "checkmark") }
          .help("Hand the computer back to \(name)")
      }
    }
    .frame(minWidth: 640, minHeight: 440)
    .task(id: attempt) { await load() }
  }

  /** The agent has handed the computer over and waits ("Your turn on the computer" not yet answered). */
  private var waitingOnPerson: Bool {
    store.rows(for: agentId).contains { row in
      if case .request(_, .computer(_, _, let resolution)) = row { return resolution == nil }
      return false
    }
  }

  private var status: String {
    if screen == nil { return "Starting the computer…" }
    if screen?.socket == nil {
      if screen?.state == "demo" { return "The demo has no computer." }
      if let percent = screen?.percent, percent > 0 { return "Starting the computer… \(percent)%" }
      return "Starting the computer…"
    }
    return phase == "disconnected" ? "Reconnecting…" : "Connecting…"
  }

  private func close() { dismissWindow(id: "computer", value: agentId) }

  private func load() async {
    for _ in 0..<60 {
      do {
        let next = try await store.screen(agentId)
        screen = next
        if next.socket != nil || next.state == "demo" { return }
      } catch {
        problem = "The computer didn't answer: \(error.localizedDescription)"
        return
      }
      try? await Task.sleep(nanoseconds: 3_000_000_000)
    }
    problem = "The computer is taking too long to start."
  }
}
