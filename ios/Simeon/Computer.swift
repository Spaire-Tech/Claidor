import SwiftUI
#if os(iOS)
import UIKit
#endif
import WebKit
import SimeonCore

#if os(iOS)
/**
 * An agent's own screen on the cloud computer (the Mac's Computer panel):
 * `ensureForeverBox` for the agent, then its stream through Simeon Labs'
 * proxy, drawn by noVNC (bundled, MPL 2.0, `Computer/NOVNC-LICENSE.txt`)
 * scaled to fit. Laid out as the founder's reference lays out its own (the
 * screenshot, 9 October 2026): what is happening at the top ("You're in
 * control") with Done at its right, the screen across the phone's whole
 * width, and at the foot Skip step (while the agent waits on the person)
 * beside one capsule of the clipboard, the keyboard and the hand. The hand
 * takes over and gives back: taken over, a tap is a click and a drag moves
 * the mouse. The keyboard types into the computer and the clipboard pastes
 * from the phone or copies to it; either takes over. The sheet is always
 * dark, as a screen's surround is. The computer's own screen stays 1280 by
 * 800: the agents click by that size (`host/box/box-monitor-layout.ts`).
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
    let name = store.agent(agentId)?.name ?? "The agent"
    let live = screen?.socket != nil && phase == "connected"
    VStack(spacing: 0) {
      // The top: what is happening, and Done (the hand back, as "I'm done" was).
      ZStack {
        VStack(spacing: 2) {
          Text(control ? "You're in control" : "\(name)'s computer")
            .font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
          Text(note ?? (control ? "Tap to click, drag to move" : live ? "Tap the hand to take over" : "Watching"))
            .font(.system(size: 15)).foregroundStyle(.white.opacity(0.55))
            .contentTransition(.opacity)
        }
        .lineLimit(1)
        .padding(.horizontal, 60)
        .animation(.easeOut(duration: 0.2), value: note)
        HStack {
          Spacer(minLength: 0)
          Button { Task { await store.handBackComputer(agentId); dismiss() } } label: {
            Image(systemName: "checkmark").font(.system(size: 19, weight: .semibold)).foregroundStyle(.white)
              .frame(width: 48, height: 48)
          }
          .buttonStyle(GlassDisc())
          .accessibilityLabel("I'm done with the computer")
        }
      }
      .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 16)
      .background(Color(white: 0.11))
      Spacer(minLength: 12)
      ZStack {
        Color.black
        if let socket = screen?.socket {
          LiveScreen(socket: socket, viewOnly: !control, phase: $phase, link: link)
        }
        if let problem {
          VStack(spacing: 10) {
            Text(problem).font(.system(size: 14)).foregroundStyle(.white.opacity(0.85)).multilineTextAlignment(.center)
            Button("Try again") { self.problem = nil; attempt += 1 }.buttonStyle(PillButtonStyle(primary: false)).fixedSize()
          }
          .padding(24)
        } else if !live {
          VStack(spacing: 10) {
            ProgressView().tint(.white)
            Text(status).font(.system(size: 14)).foregroundStyle(.white.opacity(0.75))
          }
        }
      }
      .aspectRatio(1280.0 / 800.0, contentMode: .fit)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(.white.opacity(0.08), lineWidth: 0.5))
      Spacer(minLength: 12)
      controls(live: live)
        .padding(.bottom, 10)
    }
    .background(Color.black)
    .environment(\.colorScheme, .dark)
    .presentationDetents([.large])
    .presentationBackground(.black)
    .task(id: attempt) { await load() }
  }

  /** Skip step while the agent waits on the person; the clipboard, the keyboard and the hand. */
  private func controls(live: Bool) -> some View {
    HStack(spacing: 12) {
      if waitingOnPerson {
        Button { Task { await store.handBackComputer(agentId, skip: true); dismiss() } } label: {
          Text("Skip step").font(.system(size: 17, weight: .medium)).foregroundStyle(.white)
            .padding(.horizontal, 26).frame(height: 54)
            .background(Color(white: 0.17), in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
      }
      HStack(spacing: 0) {
        Menu {
          Button { pasteFromPhone() } label: { Label("Paste from Phone", systemImage: "doc.on.clipboard") }
          Button { copyToPhone() } label: { Label("Copy to Phone", systemImage: "doc.on.doc") }
        } label: {
          Image(systemName: "doc.on.clipboard").font(.system(size: 19, weight: .medium)).foregroundStyle(.white)
            .frame(width: 58, height: 54).contentShape(.rect)
        }
        .accessibilityLabel("Clipboard")
        Button { control = true; typing.toggle() } label: {
          Image(systemName: typing ? "keyboard.chevron.compact.down" : "keyboard").font(.system(size: 19, weight: .medium)).foregroundStyle(.white)
            .frame(width: 58, height: 54).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(typing ? "Hide keyboard" : "Keyboard")
        Button {
          control.toggle()
          if !control { typing = false }
        } label: {
          Image(systemName: control ? "hand.point.up.left.fill" : "hand.point.up.left").font(.system(size: 19, weight: .medium))
            .foregroundStyle(control ? Color.black : Color.white)
            .frame(width: 44, height: 44)
            .background(Color.white.opacity(control ? 1 : 0), in: Circle())
            .frame(width: 58, height: 54).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(control ? "Give control back" : "Take over")
      }
      .padding(.horizontal, 6)
      .background(Color(white: 0.17), in: Capsule())
      .disabled(!live)
      .opacity(live ? 1 : 0.45)
      // The keyboard itself: what is typed goes to the computer, key by key.
      .background { KeyCatcher(isActive: $typing, type: { link.type($0) }, delete: { link.key(0xff08) }).frame(width: 0, height: 0) }
    }
    .animation(.easeOut(duration: 0.15), value: control)
  }

  /** The agent has handed the computer over and waits ("Your turn on the computer" not yet answered). */
  private var waitingOnPerson: Bool {
    store.rows(for: agentId).contains { row in
      if case .request(_, .computer(_, _, let resolution)) = row { return resolution == nil }
      return false
    }
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
  var events: ScreenEvents? = nil

  func makeCoordinator() -> Coordinator { Coordinator(phase: $phase, link: link, events: events) }

  func makeUIView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(context.coordinator, name: "simeon")
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.isOpaque = false
    view.backgroundColor = .black
    view.scrollView.isScrollEnabled = false
    view.scrollView.bounces = false
    view.navigationDelegate = context.coordinator
    context.coordinator.load(view, page: Self.page(socket: socket, viewOnly: viewOnly))
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
}
#else
/**
 * The same page in AppKit's web view (the Mac app). Watched (the pane's
 * preview, the helpers' strip) it takes no click; interactive (the
 * computer's window) a click gives it the keys, ⌘A ⌘C ⌘V ⌘X ⌘Z reach the
 * computer as Ctrl, and the arrows also switch between helpers' screens.
 */
struct LiveScreen: NSViewRepresentable {
  let socket: URL
  let viewOnly: Bool
  @Binding var phase: String
  var link: ScreenLink? = nil
  var events: ScreenEvents? = nil
  /** The computer's window, where the person uses it (`sandInteractive=1`). */
  var interactive = false

  func makeCoordinator() -> Coordinator { Coordinator(phase: $phase, link: link, events: events) }

  func makeNSView(context: Context) -> ScreenWebView {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(context.coordinator, name: "simeon")
    let view = ScreenWebView(frame: .zero, configuration: configuration)
    view.passive = viewOnly
    view.events = events
    view.setValue(false, forKey: "drawsBackground")
    view.underPageBackgroundColor = .black
    // The screen's page is never zoomed (`setVisualZoomLevelLimits(1, 1)`).
    view.allowsMagnification = false
    view.navigationDelegate = context.coordinator
    events?.log("attach webview box=\(socket.host ?? "") interactive=\(interactive)")
    context.coordinator.load(view, page: Self.page(socket: socket, viewOnly: viewOnly, focusOnClick: true, interactive: interactive))
    context.coordinator.viewOnly = viewOnly
    link?.view = view
    events?.view = view
    return view
  }

  func updateNSView(_ view: ScreenWebView, context: Context) {
    view.passive = viewOnly
    guard context.coordinator.viewOnly != viewOnly else { return }
    context.coordinator.viewOnly = viewOnly
    view.evaluateJavaScript("window.simeonViewOnly(\(viewOnly ? "true" : "false"))")
  }

  static func dismantleNSView(_ view: ScreenWebView, coordinator: Coordinator) {
    view.evaluateJavaScript("window.simeonClose && window.simeonClose()")
    view.configuration.userContentController.removeScriptMessageHandler(forName: "simeon")
  }

  /** A screen only watched takes no click: the click goes to what holds it (the agent's page opens the computer's window). */
  final class ScreenWebView: WKWebView {
    var passive = false
    weak var events: ScreenEvents?
    override func hitTest(_ point: NSPoint) -> NSView? { passive ? nil : super.hitTest(point) }
    /** A click on the screen sends this Mac's clipboard first (`mousedown`, capture). */
    override func mouseDown(with event: NSEvent) {
      events?.pointerDown()
      super.mouseDown(with: event)
    }
  }
}
#endif

/**
 * What a screen's page tells the view holding it: a line for the stream's
 * log, an arrow pressed in it, the computer's clipboard, a click. And what
 * the view sends back: this Mac's clipboard. Each callback is optional.
 */
@MainActor
final class ScreenEvents {
  weak var view: WKWebView?
  var onLog: (String) -> Void = { _ in }
  var onHostKey: (String) -> Void = { _ in }
  var onClipboard: (String) -> Void = { _ in }
  var onPointerDown: () -> Void = {}

  func log(_ line: String) { onLog(line) }
  func pointerDown() { onPointerDown() }

  /** This Mac's text onto the computer's clipboard, as noVNC pastes it (`rfb.clipboardPasteFrom`); no key is pressed. */
  func paste(_ text: String) {
    view?.evaluateJavaScript("window.simeonClipboardIn && window.simeonClipboardIn(\(ScreenLink.quoted(text)))")
  }
}

extension LiveScreen {
  final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var phase: Binding<String>
    let link: ScreenLink?
    let events: ScreenEvents?
    var viewOnly = true
    /** The page, to load again after a crash. */
    private var page = ""
    /** A crashed page loads again, until it has crashed more than three times a minute apart (`sbn`, `rbn`). */
    private var crashes = ScreenCrashes()
    init(phase: Binding<String>, link: ScreenLink?, events: ScreenEvents?) { self.phase = phase; self.link = link; self.events = events }

    func load(_ view: WKWebView, page: String) {
      self.page = page
      view.loadHTMLString(page, baseURL: URL(string: "https://app.simeonlabs.com/"))
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
      guard let body = message.body as? [String: Any] else { return }
      if let text = body["clipboard"] as? String {
        link?.clipboard = text
        MainActor.assumeIsolated { events?.onClipboard(text) }
      }
      if let next = body["phase"] as? String { phase.wrappedValue = next }
      if let line = body["log"] as? String { MainActor.assumeIsolated { events?.log("guest console[\(body["level"] as? String ?? "info")] " + line) } }
      if let key = body["hostKey"] as? String { MainActor.assumeIsolated { events?.onHostKey(key) } }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      MainActor.assumeIsolated { events?.log("guest loaded url=about:screen") }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      let error = error as NSError
      MainActor.assumeIsolated { events?.log("guest load FAILED code=\(error.code) (\(error.localizedDescription)) url=about:screen mainFrame=true") }
    }

    /** The page's process died: loaded again, or "Screen preview unavailable" after too many (`render-process-gone`). */
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
      MainActor.assumeIsolated { events?.log("guest renderer gone reason=crashed") }
      if crashes.crashed() {
        phase.wrappedValue = "starting"
        load(webView, page: page)
      } else {
        phase.wrappedValue = "unavailable"
      }
    }
  }

  static let client: String = {
    guard let url = Bundle.main.url(forResource: "novnc-rfb", withExtension: "js"), let text = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    return text
  }()

  /**
   * `focusOnClick`: the Mac's screen takes the keyboard when clicked; the
   * phone types through its own keyboard (KeyCatcher). `interactive`: the
   * Mac's computer window, with ⌘ keys sent as Ctrl and the arrows told to
   * the window (`preload-vnc.ts`). Every page reports its state in the
   * lines the window's log reads (`[SimeonScreen] state=…`).
   */
  static func page(socket: URL, viewOnly: Bool, focusOnClick: Bool = false, interactive: Bool = false) -> String {
    let address = (try? String(data: JSONSerialization.data(withJSONObject: [socket.absoluteString]), encoding: .utf8)) ?? "[\"\"]"
    return """
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
    <style>html,body{margin:0;height:100%;background:#000;overflow:hidden;-webkit-user-select:none}#screen{position:fixed;inset:0}</style>
    </head><body><div id="screen"></div>
    <script>
    window.addEventListener("error",function(e){try{window.webkit.messageHandlers.simeon.postMessage({log:"[SimeonScreen] page error: "+e.message+" at "+(e.filename||"")+":"+(e.lineno||0),level:"info"})}catch(_){}});
    window.addEventListener("unhandledrejection",function(e){try{window.webkit.messageHandlers.simeon.postMessage({log:"[SimeonScreen] page error: "+String(e.reason),level:"info"})}catch(_){}});
    </script>
    <script>\(client)</script>
    <script>
    (function(){
      var post=function(m){try{window.webkit.messageHandlers.simeon.postMessage(m)}catch(e){}};
      var state=function(s,status,dialog){post({log:"[SimeonScreen] state="+s+" status=\\""+status+"\\" dialog="+(dialog||"none")})};
      var address=\(address)[0], rfb=null, closed=false, tries=0, everConnected=false;
      function open(){
        if(closed)return;
        if(typeof RFB!=="function"){post({phase:"failed"});post({log:"[SimeonScreen] noVNC did not start after 5000ms; root class=\\"\\" scripts=0"});return}
        state("connecting","Connecting");
        rfb=new RFB(document.getElementById("screen"),address,{shared:true});
        rfb.scaleViewport=true;rfb.resizeSession=false;rfb.viewOnly=\(viewOnly ? "true" : "false");rfb.background="#000";rfb.focusOnClick=\(focusOnClick ? "true" : "false");
        rfb.addEventListener("connect",function(){tries=0;everConnected=true;post({phase:"connected"});state("connected","Connected")});
        rfb.addEventListener("clipboard",function(e){post({clipboard:(e.detail&&e.detail.text)||""})});
        rfb.addEventListener("credentialsrequired",function(){state("connecting","","noVNC_credentials_dlg")});
        rfb.addEventListener("disconnect",function(e){
          var clean=e&&e.detail&&e.detail.clean;
          state("disconnected",!everConnected?"Failed to connect to server":clean?"Disconnected":"Something went wrong, connection is closed");
          post({phase:"disconnected"});if(!closed&&tries<20){tries++;setTimeout(open,Math.min(1000*tries,5000))}
        });
      }
      window.simeonViewOnly=function(v){if(rfb)rfb.viewOnly=v};
      // This Mac's clipboard onto the computer's, as noVNC pastes it: no key pressed (`buildHostClipboardPasteScript`).
      window.simeonClipboardIn=function(t){if(rfb&&t)rfb.clipboardPasteFrom(t)};
      if(\(interactive ? "true" : "false")){
        // ⌘A ⌘C ⌘V ⌘X ⌘Z (with ⇧ or not), by the key's place, sent as Ctrl after letting go of ⌘, ⌥ and the Super keys (`buildVncMacKeyMappingScript`).
        var SHORTCUTS={KeyA:0x61,KeyC:0x63,KeyV:0x76,KeyX:0x78,KeyZ:0x7a};
        var HELD=[[0xffe7,"MetaLeft"],[0xffe8,"MetaRight"],[0xffe9,"AltLeft"],[0xffea,"AltRight"],[0xffeb,"SuperLeft"],[0xffec,"SuperRight"]];
        document.addEventListener("keydown",function(e){
          if(!e.metaKey||!(e.code in SHORTCUTS)||!rfb||!rfb.sendKey)return;
          e.preventDefault();e.stopImmediatePropagation();
          for(var i=0;i<HELD.length;i++){try{rfb.sendKey(HELD[i][0],HELD[i][1],false)}catch(_){}}
          rfb.sendKey(0xffe3,"ControlLeft",true);
          if(e.shiftKey)rfb.sendKey(0xffe1,"ShiftLeft",true);
          rfb.sendKey(SHORTCUTS[e.code],e.code,true);rfb.sendKey(SHORTCUTS[e.code],e.code,false);
          if(e.shiftKey)rfb.sendKey(0xffe1,"ShiftLeft",false);
          rfb.sendKey(0xffe3,"ControlLeft",false);
        },true);
        // The arrows are told to the window too, which switches between helpers' screens; they still reach the computer (`installVncHostKeyForwarder`).
        document.addEventListener("keydown",function(e){
          if(e.key==="ArrowUp"||e.key==="ArrowDown"||e.key==="ArrowLeft"||e.key==="ArrowRight")post({hostKey:e.key});
        },true);
      }
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

#if os(iOS)
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
#endif
