import SwiftUI
import WebKit
import SimeonCore

/**
 * An agent's own screen on the cloud computer (the Mac's Computer panel):
 * `ensureForeverBox` for the agent, then its stream through Simeon Labs'
 * proxy, drawn by noVNC (bundled, MPL 2.0, `Computer/NOVNC-LICENSE.txt`)
 * scaled to fit. It only watches until "Take over"; then a tap is a click
 * and a drag moves the mouse. Closing it closes the stream.
 */
struct ComputerSheet: View {
  let agentId: String
  @Environment(AppStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var screen: ScreenState?
  @State private var problem: String?
  @State private var control = false
  @State private var phase = "starting"
  @State private var attempt = 0

  var body: some View {
    VStack(spacing: 14) {
      ZStack {
        Text("Computer").font(.system(size: 17, weight: .semibold)).foregroundStyle(Ink.primary)
        HStack {
          CloseDisc { dismiss() }
          Spacer()
          if screen?.socket != nil {
            Button(control ? "Watch" : "Take over") { control.toggle() }
              .buttonStyle(PillButtonStyle(primary: !control)).fixedSize()
          }
        }
      }
      .padding(.horizontal, 14).padding(.top, 14)
      ZStack {
        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.black)
        if let socket = screen?.socket {
          LiveScreen(socket: socket, viewOnly: !control, phase: $phase)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        if let problem {
          VStack(spacing: 10) {
            Text(problem).font(.system(size: 14)).foregroundStyle(.white.opacity(0.85)).multilineTextAlignment(.center)
            Button("Try again") { self.problem = nil; attempt += 1 }.buttonStyle(PillButtonStyle(primary: false)).fixedSize()
          }
          .padding(24)
        } else if screen?.socket == nil || phase != "connected" {
          VStack(spacing: 10) {
            ProgressView().tint(.white)
            Text(status).font(.system(size: 14)).foregroundStyle(.white.opacity(0.75))
          }
        }
      }
      .aspectRatio(1280.0 / 800.0, contentMode: .fit)
      .padding(.horizontal, 12)
      if control {
        Text("You're in control: tap to click, drag to move.").font(.system(size: 13)).foregroundStyle(Ink.secondary)
      }
      Spacer(minLength: 0)
      Button("I’m done with the computer") { Task { await store.handBackComputer(agentId); dismiss() } }
        .buttonStyle(PillButtonStyle(primary: false))
        .padding(.horizontal, 20).padding(.bottom, 10)
    }
    .background(Ink.ground)
    .presentationDetents([.large])
    .task(id: attempt) { await load() }
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

/** noVNC in a web view, connected to the screen's WebSocket; it tells the sheet when the picture is up. */
struct LiveScreen: UIViewRepresentable {
  let socket: URL
  let viewOnly: Bool
  @Binding var phase: String

  func makeCoordinator() -> Coordinator { Coordinator(phase: $phase) }

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(context.coordinator, name: "simeon")
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.isOpaque = false
    view.backgroundColor = .black
    view.scrollView.isScrollEnabled = false
    view.scrollView.bounces = false
    view.loadHTMLString(Self.page(socket: socket, viewOnly: viewOnly), baseURL: URL(string: "https://app.simeonlabs.com/"))
    context.coordinator.viewOnly = viewOnly
    return view
  }

  func updateUIView(_ view: WKWebView, context: Context) {
    guard context.coordinator.viewOnly != viewOnly else { return }
    context.coordinator.viewOnly = viewOnly
    view.evaluateJavaScript("window.simeonViewOnly(\(viewOnly ? "true" : "false"))")
  }

  static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
    view.evaluateJavaScript("window.simeonClose && window.simeonClose()")
    view.configuration.userContentController.removeScriptMessageHandler(forName: "simeon")
  }

  final class Coordinator: NSObject, WKScriptMessageHandler {
    var phase: Binding<String>
    var viewOnly = true
    init(phase: Binding<String>) { self.phase = phase }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
      guard let body = message.body as? [String: Any], let next = body["phase"] as? String else { return }
      phase.wrappedValue = next
    }
  }

  static let client: String = {
    guard let url = Bundle.main.url(forResource: "novnc-rfb", withExtension: "js"), let text = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    return text
  }()

  static func page(socket: URL, viewOnly: Bool) -> String {
    let address = (try? String(data: JSONSerialization.data(withJSONObject: [socket.absoluteString]), encoding: .utf8)) ?? "[\"\"]"
    return """
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
    <style>html,body{margin:0;height:100%;background:#000;overflow:hidden;-webkit-user-select:none}#screen{position:fixed;inset:0}</style>
    </head><body><div id="screen"></div>
    <script>\(client)</script>
    <script>
    (function(){
      var post=function(m){try{window.webkit.messageHandlers.simeon.postMessage(m)}catch(e){}};
      var address=\(address)[0], rfb=null, closed=false, tries=0;
      function open(){
        if(closed||typeof RFB!=="function"){post({phase:"failed"});return}
        rfb=new RFB(document.getElementById("screen"),address,{shared:true});
        rfb.scaleViewport=true;rfb.resizeSession=false;rfb.viewOnly=\(viewOnly ? "true" : "false");rfb.background="#000";rfb.focusOnClick=false;
        rfb.addEventListener("connect",function(){tries=0;post({phase:"connected"})});
        rfb.addEventListener("disconnect",function(){post({phase:"disconnected"});if(!closed&&tries<20){tries++;setTimeout(open,Math.min(1000*tries,5000))}});
      }
      window.simeonViewOnly=function(v){if(rfb)rfb.viewOnly=v};
      window.simeonClose=function(){closed=true;if(rfb)rfb.disconnect()};
      open();
    })();
    </script></body></html>
    """
  }
}
