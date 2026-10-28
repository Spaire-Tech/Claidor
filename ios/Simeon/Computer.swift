import SwiftUI
#if os(iOS)
import UIKit
#endif
import WebKit
import SimeonCore

#if os(iOS)
/**
 * An agent's own computer on the phone (the Mac's Computer panel):
 * `ensureForeverBox` for the agent, then its stream through Simeon Labs'
 * proxy, drawn by noVNC (bundled, MPL 2.0, `Computer/NOVNC-LICENSE.txt`),
 * fitted to the phone and pinched up to four times larger (`ZoomScreen`,
 * ComputerZoom.swift). What is happening at the top with the way out at its
 * right (the checkmark hands the computer back while the person is in
 * control), and at the foot one big blue Take control, with Stop task while
 * the agent works. The founder, after an Apple sign-in on the earlier
 * layout, with the hand among three icons: "that hand icon should be the
 * main thing, not an option." Taking control while the agent works stops
 * it; handing back resumes it. It opens in control while the agent waits on
 * the person. In control a tap is a click, and the phone's keyboard is up
 * all along (the founder, 26 October 2026: "doesnt matter where i tap, it
 * doesnt work … have the keyboard always up"), the picture above it; a tap
 * on a field the computer can name sets the keyboard's kind (`typingFocus`).
 * The clipboard, at the top left facing the checkmark, pastes from the
 * phone or copies to it; Skip step, while the agent waits on the person,
 * sits under the title. The sheet is always
 * dark, as a screen's surround is. The computer's own screen stays 1280 by
 * 800: the agents click by that size (`host/box/box-monitor-layout.ts`).
 * Closing it closes the stream. While helpers work on the computer, the one
 * shown is named under the screen and the others are listed under it
 * (`HelperStrip`, ComputerPreview.swift); a helper's screen is a new
 * connection, as on the Mac. (A view of the agent's browser tab alone was
 * tried the same day and taken out: the founder, "it doesn't do anything".)
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
  /** The helper's screen asked for (`ComputerHelper.focused`: else the first). */
  @State private var helper: String?
  /** The computer's status and helpers are read while the sheet shows (`watchComputer`). */
  @State private var watching = false
  @State private var stopping = false
  /** The kind of field the last tap focused: the keyboard comes up to match it. */
  @State private var field: TypingField = .text
  /** Which tap the focus was last asked for: an answer for an earlier tap is not acted on. */
  @State private var focusAsked = 0
  /** Handing the computer back: the keyboard goes and stays down while the sheet closes. */
  @State private var leaving = false

  var body: some View {
    computer
      .background(Color.black)
      .environment(\.colorScheme, .dark)
      .presentationDetents([.large])
      .presentationBackground(.black)
      .onAppear {
        guard !watching else { return }
        watching = true
        store.watchComputer(agentId)
      }
      .onDisappear {
        guard watching else { return }
        watching = false
        store.unwatchComputer(agentId)
      }
  }

  /**
   * The whole computer, drawn by noVNC and zoomable (`ZoomScreen`); its
   * connection opens only while it shows. What is happening at the top with
   * the way out at its right, the screen across the space between, and at
   * the foot one big blue Take control
   * (with Stop task while the agent works), or, in control, Skip step
   * (while the agent waits on the person) and the clipboard and keyboard.
   */
  @ViewBuilder
  private var computer: some View {
    let name = store.agent(agentId)?.name ?? String(localized: "The agent")
    let live = screen?.socket != nil && phase == "connected"
    let helpers = store.computerHelpers(agentId)
    let focused = ComputerHelper.focused(helpers, asked: helper)
    let shownHelper = helpers.first { $0.subagentId == focused }
    VStack(spacing: 0) {
      ZStack {
        VStack(spacing: 2) {
          Text(control ? "You're in control" : "\(name)'s computer")
            .font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
          Text(note ?? (control ? String(localized: "Tap to click · pinch to zoom") : live ? String(localized: "Pinch to zoom") : String(localized: "Watching")))
            .font(.system(size: 15)).foregroundStyle(.white.opacity(0.55))
            .contentTransition(.opacity)
        }
        .lineLimit(1)
        .padding(.horizontal, 64)
        .animation(.easeOut(duration: 0.2), value: note)
        HStack {
          if control {
            // The clipboard, facing the checkmark: the keyboard is up below, all along.
            Menu {
              Button { pasteFromPhone() } label: { Label("Paste from Phone", systemImage: "doc.on.clipboard") }
              Button { copyToPhone() } label: { Label("Copy to Phone", systemImage: "doc.on.doc") }
            } label: {
              Image(systemName: "doc.on.clipboard").font(.system(size: 18, weight: .medium)).foregroundStyle(.white)
                .frame(width: 48, height: 48)
                .contentShape(.circle)
                .glassEffect(.regular, in: .circle)
            }
            .disabled(!live)
            .opacity(live ? 1 : 0.4)
            .accessibilityLabel("Clipboard")
          }
          Spacer(minLength: 0)
          if control {
            Button { leave(); Haptics.success(); Task { await store.handBackComputer(agentId); dismiss() } } label: {
              Image(systemName: "checkmark").font(.system(size: 19, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 48, height: 48)
            }
            .buttonStyle(GlassDisc())
            .accessibilityLabel("I'm done, hand it back")
          } else {
            Button { dismiss() } label: {
              Image(systemName: "xmark").font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 48, height: 48)
            }
            .buttonStyle(GlassDisc())
            .accessibilityLabel("Close")
          }
        }
      }
      .padding(.horizontal, 16).padding(.top, 22).padding(.bottom, 12)
      .background(Color(white: 0.11))
      if control && waitingOnPerson {
        // Skip step, under the title: the foot of the sheet is the keyboard's.
        Button { leave(); Haptics.tap(); Task { await store.handBackComputer(agentId, skip: true); dismiss() } } label: {
          Text("Skip step").font(.system(size: 15, weight: .medium)).foregroundStyle(.white)
            .padding(.horizontal, 18).frame(height: 36)
            .background(Color(white: 0.2), in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .padding(.bottom, 12)
        .background(Color(white: 0.11))
      }
      // In control the keyboard has the foot of the sheet: the helpers are listed under the header instead.
      if control { helperLines(shownHelper, helpers: helpers, focused: focused) }
      ZStack {
        Color.black
        if let socket = screen?.socket {
          ZoomScreen(socket: socket, control: control, phase: $phase, link: link) { focusAfterTap() }
            // A helper's screen is a new connection (`{stageKey}:{url}`).
            .id("\(focused ?? "setup"):\(socket.absoluteString)")
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
          .allowsHitTesting(false)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .clipped()
      .padding(.top, 8)
      if !control { helperLines(shownHelper, helpers: helpers, focused: focused) }
      controls(live: live)
        .padding(.top, 12)
        .padding(.bottom, 10)
    }
    // The screen keeps its size when the keyboard comes up (a new size would undo the zoom); the picture moves above it instead.
    .ignoresSafeArea(.keyboard)
    // The keyboard itself: what is typed goes to the computer, key by key.
    // Return may send a form and move the focus: the computer is asked again.
    .background {
      KeyCatcher(isActive: $typing, field: field, type: { text in
        link.type(text)
        if text == "\n" { focusAfterTap() }
      }, delete: { link.key(0xff08) })
      .frame(width: 0, height: 0)
    }
    // In control the sheet stays until the checkmark hands the computer back.
    .interactiveDismissDisabled(control)
    .task(id: attempt) { await load() }
    // In control the keyboard is up all along: it comes up with control, and again if something else took it a moment.
    .onChange(of: control, initial: true) { _, now in typing = now }
    .onChange(of: typing) { _, up in
      guard !up, control, !leaving else { return }
      Task {
        try? await Task.sleep(nanoseconds: 300_000_000)
        if control && !leaving { typing = true }
      }
    }
    // In control: the computer's Chrome is made ready to see the taps, so the first one's field is known too.
    .task(id: control) { if control { await store.prepareTypingFocus(agentId) } }
    // The agent waits on the person: the computer opens theirs to use.
    .onAppear { if waitingOnPerson { control = true } }
    .onChange(of: waitingOnPerson) { _, waiting in if waiting { control = true } }
    // Another helper's screen: its picture is on its way again.
    .onChange(of: focused) { _, _ in phase = "starting" }
  }

  /** The helper whose screen is shown, named, and the others to switch to. */
  @ViewBuilder
  private func helperLines(_ shown: ComputerHelper?, helpers: [ComputerHelper], focused: String?) -> some View {
    if let shown {
      Text(shown.title)
        .font(.system(size: 13)).foregroundStyle(.white.opacity(0.6))
        .lineLimit(1).truncationMode(.tail)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }
    if helpers.count > 1 {
      HelperStrip(helpers: helpers.filter { $0.subagentId != focused }) { pick in helper = pick }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }
  }

  /** Watching: Stop task (while the agent works) and Take control. In control: nothing, the keyboard is there. */
  @ViewBuilder
  private func controls(live: Bool) -> some View {
    if control {
      // The keyboard's place: the clipboard and Skip step are at the top.
      EmptyView()
    } else {
      HStack(spacing: 12) {
        if store.agent(agentId)?.isRunning == true {
          StopTaskButton(busy: stopping) { stopTask() }
        }
        TakeControlButton(enabled: live) { takeControl() }
      }
      .padding(.horizontal, 16)
    }
  }

  /** Take control: the computer is the person's at once; a working agent is stopped meanwhile (handing back resumes it). */
  private func takeControl() {
    Haptics.press()
    control = true
    Task {
      if await store.takeComputerControl(agentId) { show(String(localized: "\(store.agent(agentId)?.name ?? "The agent") is paused while you're in control.")) }
    }
  }

  private func stopTask() {
    Haptics.press()
    stopping = true
    Task {
      let stopped = await store.stopAgentTask(agentId)
      stopping = false
      show(stopped ? String(localized: "Stopped.") : String(localized: "Nothing was running."))
    }
  }

  /**
   * After a click in control (or Return), the computer says what has the
   * keyboard's focus (`typingFocus`): a field it can name sets the
   * keyboard's kind (an email's @, a password's plain letters); anything
   * else, the ordinary keyboard. The keyboard itself stays up (26 October
   * 2026: the answer did not come wherever the founder tapped). Only the
   * last tap's answer counts.
   */
  private func focusAfterTap() {
    focusAsked += 1
    let asked = focusAsked
    Task {
      guard let focused = await store.typingFocus(agentId), asked == focusAsked, control else { return }
      field = focused.takesTyping ? focused : .text
    }
  }

  /** The computer handed back: the keyboard down for good. */
  private func leave() {
    leaving = true
    typing = false
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
    guard let text = UIPasteboard.general.string, !text.isEmpty else { Haptics.warning(); show(String(localized: "Your phone's clipboard is empty.")); return }
    control = true
    Haptics.tap()
    link.paste(text)
    show(String(localized: "Pasted from your phone."))
  }

  /** What is selected on the computer, copied, onto the phone's clipboard. */
  private func copyToPhone() {
    control = true
    link.copy()
    Task {
      try? await Task.sleep(nanoseconds: 600_000_000)
      if link.clipboard.isEmpty { show(String(localized: "Nothing was copied on the computer.")); return }
      UIPasteboard.general.string = link.clipboard
      Haptics.tap()
      show(String(localized: "Copied to your phone."))
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
    if screen == nil { return String(localized: "Starting the computer…") }
    if screen?.socket == nil {
      if screen?.state == "demo" { return String(localized: "The demo has no computer.") }
      if let percent = screen?.percent, percent > 0 { return String(localized: "Starting the computer… \(percent)%") }
      return String(localized: "Starting the computer…")
    }
    return phase == "disconnected" ? String(localized: "Reconnecting…") : String(localized: "Connecting…")
  }

  private func load() async {
    for _ in 0..<60 {
      do {
        let next = try await store.screen(agentId)
        screen = next
        if next.socket != nil || next.state == "demo" { return }
      } catch {
        problem = PlainWords.problem(String(localized: "The computer didn't answer: \(error.localizedDescription)"))
        return
      }
      try? await Task.sleep(nanoseconds: 3_000_000_000)
    }
    problem = String(localized: "The computer is taking too long to start.")
  }
}

/** The blue Take control: the main button under the agent's computer. */
struct TakeControlButton: View {
  let enabled: Bool
  let action: () -> Void

  /** iOS's own blue (systemBlue in the dark): the one thing to press. */
  static let blue = Color(red: 0.039, green: 0.518, blue: 1.0)

  var body: some View {
    Button(action: action) {
      Label("Take control", systemImage: "hand.point.up.left.fill")
        .font(.system(size: 18, weight: .semibold)).foregroundStyle(.white)
        .frame(maxWidth: .infinity).frame(height: 56)
        .background(Self.blue, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .disabled(!enabled)
    .opacity(enabled ? 1 : 0.5)
  }
}

/** Stop task, beside Take control while the agent works: the agent and its helpers stop. */
struct StopTaskButton: View {
  let busy: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text("Stop task").font(.system(size: 17, weight: .medium)).foregroundStyle(.white)
        .padding(.horizontal, 24).frame(height: 56)
        .background(Color(white: 0.17), in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .disabled(busy)
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
        events?.onClipboard(text)
      }
      if let next = body["phase"] as? String { phase.wrappedValue = next }
      if let line = body["log"] as? String { events?.log("guest console[\(body["level"] as? String ?? "info")] " + line) }
      if let key = body["hostKey"] as? String { events?.onHostKey(key) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      events?.log("guest loaded url=about:screen")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      let error = error as NSError
      events?.log("guest load FAILED code=\(error.code) (\(error.localizedDescription)) url=about:screen mainFrame=true")
    }

    /** The page's process died: loaded again, or "Screen preview unavailable" after too many (`render-process-gone`). */
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
      events?.log("guest renderer gone reason=crashed")
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
      // The phone's own gestures as the computer's mouse (`ZoomScreen`): the events noVNC reads from a desktop browser, at the page's points.
      function canvas(){return rfb?document.querySelector("#screen canvas"):null}
      function mouse(type,x,y,buttons){var c=canvas();if(c)c.dispatchEvent(new MouseEvent(type,{clientX:x,clientY:y,button:0,buttons:buttons,bubbles:true,cancelable:true,view:window}))}
      window.simeonClick=function(x,y){mouse("mousemove",x,y,0);mouse("mousedown",x,y,1);mouse("mouseup",x,y,0)};
      window.simeonPointer=function(kind,x,y){mouse(kind==="down"?"mousedown":kind==="up"?"mouseup":"mousemove",x,y,kind==="up"?0:1)};
      // One wheel event per 50 pixels: noVNC turns the wheel once per event at most (measured against this bundle).
      window.simeonWheel=function(x,y,dx,dy){var c=canvas();if(!c)return;function turn(ax,ay){c.dispatchEvent(new WheelEvent("wheel",{clientX:x,clientY:y,deltaX:ax,deltaY:ay,deltaMode:0,bubbles:true,cancelable:true,view:window}))}
        for(var i=Math.round(Math.abs(dy)/50);i>0;i--)turn(0,dy>0?50:-50);for(var j=Math.round(Math.abs(dx)/50);j>0;j--)turn(dx>0?50:-50,0)};
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
  /** A click where the person tapped, in the page's points (the phone's whole computer, `ZoomScreen`). */
  func click(at point: CGPoint) { run("window.simeonClick && window.simeonClick(\(Self.number(point.x)),\(Self.number(point.y)))") }
  /** The button held ("down"), moved with ("move") and let go ("up"). */
  func pointer(_ kind: String, at point: CGPoint) { run("window.simeonPointer && window.simeonPointer(\(Self.quoted(kind)),\(Self.number(point.x)),\(Self.number(point.y)))") }
  /** The mouse wheel at a point, in the computer's pixels: a positive `dy` scrolls the page down. */
  func wheel(at point: CGPoint, dx: CGFloat, dy: CGFloat) {
    run("window.simeonWheel && window.simeonWheel(\(Self.number(point.x)),\(Self.number(point.y)),\(Self.number(dx)),\(Self.number(dy)))")
  }

  private func run(_ script: String) { view?.evaluateJavaScript(script) }

  private static func number(_ value: CGFloat) -> String { String(format: "%.1f", Double(value)) }

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
 * delete to the screen. Nothing above it: the row of esc, tab and arrows
 * (26 October 2026) said nothing to the founder and is gone (28 October).
 */
struct KeyCatcher: UIViewRepresentable {
  @Binding var isActive: Bool
  /** The kind of field it types into: the keyboard matches it (an email's @, numbers). */
  var field: TypingField = .text
  let type: (String) -> Void
  let delete: () -> Void

  /** The phone's keyboard for a field. Numbers and phone numbers keep a Return key (the phone pad has none), to send the form. */
  static func keyboard(for field: TypingField) -> UIKeyboardType {
    switch field {
    case .email: return .emailAddress
    case .url: return .URL
    case .search: return .webSearch
    case .number, .tel: return .numbersAndPunctuation
    case .password: return .asciiCapable
    case .text, .none: return .default
    }
  }

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
    let keyboard = Self.keyboard(for: field)
    if view.keyboardType != keyboard {
      view.keyboardType = keyboard
      // Already up: it changes to the new kind in place.
      if view.isFirstResponder { view.reloadInputViews() }
    }
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

    var keyboardType: UIKeyboardType = .default
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
