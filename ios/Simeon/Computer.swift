import SwiftUI
import UIKit
import WebKit
import SimeonCore

/**
 * An agent's own screen on the cloud computer (the Mac's Computer panel):
 * `ensureForeverBox` for the agent, then its stream through Simeon Labs'
 * proxy, drawn by noVNC (bundled, MPL 2.0, `Computer/NOVNC-LICENSE.txt`)
 * scaled to fit. It only watches until "Take over"; then a tap is a click
 * and a drag moves the mouse. Under the screen, as the founder's reference
 * has them: the clipboard at the left (Paste from Phone, Copy to Phone) and
 * the keyboard at the right, typing into the computer; either takes over.
 * Closing it closes the stream.
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
  @State private var link = ScreenLink()
  @State private var typing = false
  @State private var note: String?

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
          LiveScreen(socket: socket, viewOnly: !control, phase: $phase, link: link)
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
      if let note {
        Text(note).font(.system(size: 13)).foregroundStyle(Ink.secondary)
      } else if control {
        Text("You're in control: tap to click, drag to move.").font(.system(size: 13)).foregroundStyle(Ink.secondary)
      }
      Spacer(minLength: 0)
      if screen?.socket != nil && phase == "connected" {
        HStack {
          Menu {
            Button { pasteFromPhone() } label: { Label("Paste from Phone", systemImage: "doc.on.clipboard") }
            Button { copyToPhone() } label: { Label("Copy to Phone", systemImage: "doc.on.doc") }
          } label: {
            Image(systemName: "doc.on.clipboard").font(.system(size: 18, weight: .medium)).foregroundStyle(Ink.primary)
              .frame(width: 48, height: 48).contentShape(.circle)
          }
          .glassEffect(.regular.interactive(), in: .circle)
          .accessibilityLabel("Clipboard")
          Spacer()
          Button { control = true; typing.toggle() } label: {
            Image(systemName: typing ? "keyboard.chevron.compact.down" : "keyboard").font(.system(size: 18, weight: .medium)).foregroundStyle(Ink.primary)
              .frame(width: 48, height: 48).contentShape(.circle)
          }
          .buttonStyle(.plain)
          .glassEffect(.regular.interactive(), in: .circle)
          .accessibilityLabel(typing ? "Hide keyboard" : "Keyboard")
        }
        .padding(.horizontal, 16)
        // The keyboard itself: what is typed goes to the computer, key by key.
        .background { KeyCatcher(isActive: $typing, type: { link.type($0) }, delete: { link.key(0xff08) }).frame(width: 0, height: 0) }
      }
      Button("I’m done with the computer") { Task { await store.handBackComputer(agentId); dismiss() } }
        .buttonStyle(PillButtonStyle(primary: false))
        .padding(.horizontal, 20).padding(.bottom, 10)
    }
    .background(Ink.ground)
    .presentationDetents([.large])
    .task(id: attempt) { await load() }
  }

  /** The phone's clipboard onto the computer's, pasted where its cursor is. */
  private func pasteFromPhone() {
    guard let text = UIPasteboard.general.string, !text.isEmpty else { show("Your phone's clipboard is empty."); return }
    control = true
    link.paste(text)
    show("Pasted from your phone.")
  }

  /** What is selected on the computer, copied, onto the phone's clipboard. */
  private func copyToPhone() {
    control = true
    link.copy()
    Task {
      try? await Task.sleep(nanoseconds: 600_000_000)
      if link.clipboard.isEmpty { show("Nothing was copied on the computer."); return }
      UIPasteboard.general.string = link.clipboard
      show("Copied to your phone.")
    }
  }

  private func show(_ text: String) {
    note = text
    Task {
      try? await Task.sleep(nanoseconds: 2_000_000_000)
      if note == text { note = nil }
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
  /** The sheet's hold on the page (keys, the clipboard); none where the screen is only watched (the agent's page). */
  var link: ScreenLink? = nil

  func makeCoordinator() -> Coordinator { Coordinator(phase: $phase, link: link) }

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
    link?.view = view
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
    let link: ScreenLink?
    var viewOnly = true
    init(phase: Binding<String>, link: ScreenLink?) { self.phase = phase; self.link = link }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
      guard let body = message.body as? [String: Any] else { return }
      if let text = body["clipboard"] as? String { link?.clipboard = text }
      if let next = body["phase"] as? String { phase.wrappedValue = next }
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
        rfb.addEventListener("clipboard",function(e){post({clipboard:(e.detail&&e.detail.text)||""})});
        rfb.addEventListener("disconnect",function(){post({phase:"disconnected"});if(!closed&&tries<20){tries++;setTimeout(open,Math.min(1000*tries,5000))}});
      }
      window.simeonViewOnly=function(v){if(rfb)rfb.viewOnly=v};
      // The phone's keyboard and clipboard (they take over: the computer takes keys only from one in control).
      var CTRL=0xffe3;
      function key(k,code,down){if(rfb){rfb.viewOnly=false;rfb.sendKey(k,code||null,down)}}
      window.simeonType=function(s){for(var ch of s){var c=ch.codePointAt(0);key(c===10?0xff0d:c<0x100?c:0x01000000+c)}};
      window.simeonKey=function(k){key(k)};
      window.simeonPaste=function(t){if(!rfb)return;rfb.viewOnly=false;rfb.clipboardPasteFrom(t);key(CTRL,"ControlLeft",true);key(0x76,"KeyV");key(CTRL,"ControlLeft",false)};
      window.simeonCopy=function(){key(CTRL,"ControlLeft",true);key(0x63,"KeyC");key(CTRL,"ControlLeft",false)};
      window.simeonClose=function(){closed=true;if(rfb)rfb.disconnect()};
      open();
    })();
    </script></body></html>
    """
  }
}

/** The sheet's hold on the screen's page: keys, the clipboard both ways. */
@MainActor
final class ScreenLink {
  weak var view: WKWebView?
  /** The computer's clipboard, as it last said it. */
  var clipboard = ""

  func type(_ text: String) { run("window.simeonType(\(Self.quoted(text)))") }
  func key(_ keysym: Int) { run("window.simeonKey(\(keysym))") }
  func paste(_ text: String) { run("window.simeonPaste(\(Self.quoted(text)))") }
  func copy() { run("window.simeonCopy()") }

  private func run(_ script: String) { view?.evaluateJavaScript(script) }

  /** A string as JavaScript reads it. */
  static func quoted(_ text: String) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: [text]), let array = String(data: data, encoding: .utf8) else { return "\"\"" }
    return array + "[0]"
  }
}

/**
 * The phone's keyboard for the computer: a view no one sees that takes the
 * keyboard while `isActive`, and hands each letter (and return) and each
 * delete to the screen.
 */
struct KeyCatcher: UIViewRepresentable {
  @Binding var isActive: Bool
  let type: (String) -> Void
  let delete: () -> Void

  func makeUIView(context: Context) -> Catcher {
    let view = Catcher()
    view.onType = type
    view.onDelete = delete
    view.onEnd = { isActive = false }
    return view
  }

  func updateUIView(_ view: Catcher, context: Context) {
    view.onType = type
    view.onDelete = delete
    if isActive && !view.isFirstResponder { DispatchQueue.main.async { view.becomeFirstResponder() } }
    if !isActive && view.isFirstResponder { DispatchQueue.main.async { view.resignFirstResponder() } }
  }

  final class Catcher: UIView, UIKeyInput {
    var onType: (String) -> Void = { _ in }
    var onDelete: () -> Void = {}
    var onEnd: () -> Void = {}

    override var canBecomeFirstResponder: Bool { true }
    var hasText: Bool { true }
    func insertText(_ text: String) { onType(text) }
    func deleteBackward() { onDelete() }

    // Typed as it is: no corrections, no capitals added, no smart quotes.
    var autocorrectionType: UITextAutocorrectionType = .no
    var autocapitalizationType: UITextAutocapitalizationType = .none
    var smartQuotesType: UITextSmartQuotesType = .no
    var smartDashesType: UITextSmartDashesType = .no
    var spellCheckingType: UITextSpellCheckingType = .no

    @discardableResult
    override func resignFirstResponder() -> Bool {
      let resigned = super.resignFirstResponder()
      if resigned { onEnd() }
      return resigned
    }
  }
}
