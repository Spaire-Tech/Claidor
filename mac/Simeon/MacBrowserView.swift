import AppKit
import SwiftUI
import SimeonCore

/**
 * The Computer tab with this Mac's browser (step 4b of
 * docs/app-browser/README.md, as the web app's BrowserView.tsx): this
 * Mac's browser while the agent has tabs here and no computer-use helper
 * is on Simeon's computer's screen, else the computer as before. The grey
 * line says where, once the server's switch is on for the person.
 */
struct ComputerTab: View {
  let agent: Agent
  let look: Look
  @Environment(AppStore.self) private var store
  private var browser: MacBrowserHelper { .shared }

  var body: some View {
    let shown = browser.shown?.agentId == agent.id ? browser.shown : nil
    let here = MacBrowserHelper.showsHere(shown, helpers: store.computerHelpers(agent.id).count)
    VStack(alignment: .leading, spacing: 8) {
      if browser.enabled {
        WhereLine(onMac: here, look: look)
      }
      if here, let shown {
        BrowserPreview(agent: agent, shown: shown, look: look)
      } else {
        ComputerPreview(agent: agent, look: look)
      }
    }
    .watchesBrowser(agent.id)
  }
}

/** "On this Mac" or "On Simeon's computer", grey, at the top of the Computer tab. */
struct WhereLine: View {
  let onMac: Bool
  let look: Look

  var body: some View {
    Text(onMac ? String(localized: "On this Mac") : String(localized: "On Simeon's computer"))
      .font(.system(size: 12))
      .cssLineHeight(16, size: 12)
      .foregroundStyle(look.inkTertiary)
      .lineLimit(1)
  }
}

private struct WatchesBrowser: ViewModifier {
  let agentId: String
  @State private var token: Int?

  func body(content: Content) -> some View {
    content
      .onAppear { token = MacBrowserHelper.shared.want(agentId) }
      .onDisappear { if let token { MacBrowserHelper.shared.unwant(token) }; token = nil }
      .onChange(of: agentId) { _, now in
        if let token { MacBrowserHelper.shared.unwant(token) }
        token = MacBrowserHelper.shared.want(now)
      }
  }
}

extension View {
  /** While this shows, the agent's browser here is watched (its state and pictures come). */
  func watchesBrowser(_ agentId: String) -> some View { modifier(WatchesBrowser(agentId: agentId)) }
}

/** The take-over answered (I'm done, Skip): the agent's tab here given back first, so its next step doesn't wait, then the agent told. */
@MainActor
func handBack(_ store: AppStore, _ agentId: String, skip: Bool = false) {
  Task {
    if MacBrowserHelper.shared.running { await MacBrowserHelper.shared.control(agentId, person: false) }
    await store.handBackComputer(agentId, skip: skip)
  }
}

/** The agent's tab as last drawn, the page's 1280 × 800. */
private struct BrowserPicture: View {
  var body: some View {
    if let picture = MacBrowserHelper.shared.picture {
      Image(nsImage: picture)
        .resizable()
        .interpolation(.high)
        .aspectRatio(contentMode: .fit)
    } else {
      Color.clear
    }
  }
}

/** The agent's face as its pointer: its picture in a white rim, gliding to where it last pointed. */
private struct FacePointer: View {
  let agent: Agent
  let pointer: AgentPointer?

  var body: some View {
    GeometryReader { geo in
      if let pointer {
        let place = pointer.place(width: geo.size.width, height: geo.size.height)
        AgentPicture(image: AvatarPictures.image(for: agent), size: 22)
          .padding(2)
          .background(Circle().fill(.white))
          .shadow(color: .black.opacity(0.35), radius: 2, y: 1)
          .scaleEffect(pointer.type == "click" ? 0.85 : 1)
          .position(x: place.x + 13, y: place.y + 13)
          .animation(.timingCurve(0.19, 1, 0.22, 1, duration: 0.5), value: place.x)
          .animation(.timingCurve(0.19, 1, 0.22, 1, duration: 0.5), value: place.y)
      }
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/** The site of the tab with its lock, "Not Secure" before a page that didn't come over https, "New Tab" for a tab with no page. */
struct SiteLine: View {
  let tab: MacBrowserHelper.Tab?
  let ink: Color
  let grey: Color

  var body: some View {
    let url = tab.flatMap { URL(string: $0.url) }
    let site = url?.host.map { $0.hasPrefix("www.") ? String($0.dropFirst(4)) : $0 } ?? ""
    HStack(spacing: 4) {
      if site.isEmpty {
        Text("New Tab").foregroundStyle(grey)
      } else {
        if url?.scheme == "https" {
          Image(systemName: "lock.fill").font(.system(size: 10)).foregroundStyle(grey)
        } else {
          Text("Not Secure").foregroundStyle(grey)
        }
        Text(verbatim: site).foregroundStyle(ink).lineLimit(1).truncationMode(.middle)
      }
    }
    .font(.system(size: 12))
    .help(tab?.url ?? "")
  }
}

/**
 * The Computer tab while the agent's tabs are on this Mac: the frame (the
 * pane's width, 16:10) with the picture, the agent's face where it points
 * and "Open" on hover, a spinner until the first picture, and the site
 * with its lock under it.
 */
private struct BrowserPreview: View {
  let agent: Agent
  let shown: MacBrowserHelper.Shown
  let look: Look
  @Environment(AppStore.self) private var store
  @Environment(WindowState.self) private var window
  @State private var hovering = false

  var body: some View {
    let name = agent.name.isEmpty ? String(localized: "This agent") : agent.name
    let drawn = MacBrowserHelper.shared.picture != nil
    VStack(spacing: 10) {
      if let handoff = store.computer.status(agent.id)?.handoff {
        ComputerAttention(agentId: agent.id, name: name, instruction: handoff.instruction, look: look)
      }
      ZStack {
        BrowserPicture()
        if !shown.person { FacePointer(agent: agent, pointer: shown.pointer) }
        Button { window.openBrowser(agent.id) } label: {
          ZStack {
            Color.clear.contentShape(Rectangle())
            HStack(spacing: 6) {
              Image(systemName: "arrow.up.left.and.arrow.down.right").font(.system(size: 11, weight: .medium))
              Text("Open").font(.system(size: 12))
            }
            .foregroundStyle(Color(hex: 0xfcfcfc))
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(look.fileScrim, in: Capsule())
            .opacity(hovering ? 1 : 0)
            .animation(.easeOut(duration: 0.12), value: hovering)
          }
        }
        .buttonStyle(.hand)
        .onHover { hovering = $0 }
        .accessibilityLabel(Text("Open"))
        if !drawn { ScreenSpinner(color: look.ink, size: 20).allowsHitTesting(false) }
      }
      .frame(maxWidth: .infinity)
      .aspectRatio(ComputerScreen.width / ComputerScreen.height, contentMode: .fit)
      .background(look.paneFill)
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(look.paneHairline, lineWidth: 1))
      .accessibilityElement(children: .contain)
      .accessibilityLabel(Text("\(name)'s browser"))
      SiteLine(tab: shown.currentTab, ink: look.inkSecondary, grey: look.inkTertiary)
        .frame(maxWidth: .infinity)
    }
  }
}

// MARK: - The full view

/** The full view of the agent's browser over the window, while one is open. */
struct BrowserLayer: View {
  @Environment(WindowState.self) private var window

  var body: some View {
    if let agentId = window.browser {
      BrowserFullView(agentId: agentId)
        .id(agentId)
    }
  }
}

/**
 * The agent's browser over the whole window, like a small Safari: the
 * agent's tabs as pills, Back, Forward and Reload, the site with its lock,
 * Take Control in blue (Give Back while the person has it), and the page.
 * While the person has control the page takes their pointer, wheel and
 * keys; closing the view gives it back.
 */
private struct BrowserFullView: View {
  let agentId: String
  @Environment(WindowState.self) private var window
  @Environment(AppStore.self) private var store
  @Environment(\.colorScheme) private var scheme
  @State private var fullScreen = false

  private let white = Color(hex: 0xfcfcfc)

  var body: some View {
    let look = Look(scheme)
    let browser = MacBrowserHelper.shared
    let shown = browser.shown?.agentId == agentId ? browser.shown : nil
    let person = shown?.person ?? false
    let agent = store.agent(agentId)
    let name = agent.flatMap { $0.name.isEmpty ? nil : $0.name } ?? String(localized: "This agent")
    VStack(spacing: 0) {
      ComputerTopBar(fullScreen: fullScreen, look: look) { window.closeBrowser() }
      VStack(spacing: 8) {
        if let handoff = store.computer.status(agentId)?.handoff {
          HandoffBanner(agentId: agentId, name: name, instruction: handoff.instruction)
        }
        bar(shown: shown, person: person)
        GeometryReader { geo in
          let fitted = Self.fit(geo.size)
          ZStack {
            BrowserPicture()
            if person {
              BrowserInputSurface(agentId: agentId, pageSize: browser.pictureSize, cursor: shown?.cursor ?? "default")
            } else if let agent {
              FacePointer(agent: agent, pointer: shown?.pointer)
            }
          }
          .frame(width: fitted.width, height: fitted.height)
          .background(look.ground)
          .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
          .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(person ? look.link : white.opacity(0.102), lineWidth: person ? 2 : 0.5))
          .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
      }
      .padding(8)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(Color(hex: 0x141414).opacity(0.95))
    .contentShape(Rectangle())
    .ignoresSafeArea()
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text("\(name)'s browser"))
    .accessibilityAddTraits(.isModal)
    .watchesBrowser(agentId)
    .onAppear { fullScreen = NSApp.keyWindow?.styleMask.contains(.fullScreen) ?? false }
  }

  /** The largest 16:10 that fits. */
  static func fit(_ size: CGSize) -> CGSize {
    let ratio = ComputerScreen.width / ComputerScreen.height
    let width = min(size.width, size.height * ratio)
    return CGSize(width: max(0, width), height: max(0, width / ratio))
  }

  @ViewBuilder
  private func bar(shown: MacBrowserHelper.Shown?, person: Bool) -> some View {
    let browser = MacBrowserHelper.shared
    let tab = shown?.currentTab
    HStack(spacing: 6) {
      // Back, Forward and Reload are the person's only while they have control.
      barButton("chevron.left", label: String(localized: "Back"), enabled: person && (shown?.canGoBack ?? false)) { browser.bar(agentId, "back") }
      barButton("chevron.right", label: String(localized: "Forward"), enabled: person && (shown?.canGoForward ?? false)) { browser.bar(agentId, "forward") }
      if tab?.loading == true {
        barButton("xmark", label: String(localized: "Stop"), enabled: person) { browser.bar(agentId, "stop") }
      } else {
        barButton("arrow.clockwise", label: String(localized: "Reload"), enabled: person) { browser.bar(agentId, "reload") }
      }
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 4) {
          ForEach(shown?.tabs ?? [], id: \.id) { one in
            TabPill(tab: one, current: one.id == tab?.id, enabled: person) { browser.bar(agentId, "select", tabId: one.id) }
          }
        }
      }
      .frame(maxWidth: 520)
      Spacer(minLength: 8)
      SiteLine(tab: tab, ink: white.opacity(0.85), grey: white.opacity(0.5))
      Spacer(minLength: 8)
      Button {
        Task { await browser.control(agentId, person: !person) }
      } label: {
        Text(person ? String(localized: "Give back") : String(localized: "Take control"))
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(person ? white : .white)
          .padding(.horizontal, 10)
          .frame(height: 26)
          .background(person ? Color.white.opacity(0.14) : Color(hex: 0x0a84ff), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
          .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
      }
      .buttonStyle(.hand)
      .disabled((shown?.tabs ?? []).isEmpty)
    }
    .frame(height: 30)
  }

  private func barButton(_ symbol: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(white.opacity(enabled ? 0.9 : 0.3))
        .frame(width: 26, height: 26)
        .contentShape(Rectangle())
    }
    .buttonStyle(.hand)
    .disabled(!enabled)
    .help(label)
    .accessibilityLabel(Text(label))
  }
}

/** One of the agent's tabs: the site's icon (a globe until it loads) and its title. */
private struct TabPill: View {
  let tab: MacBrowserHelper.Tab
  let current: Bool
  let enabled: Bool
  let choose: () -> Void

  var body: some View {
    Button(action: choose) {
      HStack(spacing: 5) {
        Image(systemName: tab.loading ? "circle.dotted" : "globe").font(.system(size: 10))
        Text(verbatim: tab.title.isEmpty ? (URL(string: tab.url)?.host ?? tab.url) : tab.title)
          .font(.system(size: 12))
          .lineLimit(1)
          .truncationMode(.tail)
      }
      .foregroundStyle(Color(hex: 0xfcfcfc).opacity(current ? 0.95 : 0.6))
      .padding(.horizontal, 8)
      .frame(maxWidth: 180, minHeight: 24)
      .background(Color.white.opacity(current ? 0.14 : 0.05), in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.hand)
    .disabled(!enabled || current)
    .help(tab.url)
  }
}

// MARK: - The person's input

/** Over the page while the person has control: their pointer, wheel and keys, in the page's own pixels. */
private struct BrowserInputSurface: NSViewRepresentable {
  let agentId: String
  let pageSize: CGSize
  let cursor: String

  func makeNSView(context: Context) -> BrowserInputView {
    let view = BrowserInputView()
    view.agentId = agentId
    view.pageSize = pageSize
    DispatchQueue.main.async { view.window?.makeFirstResponder(view) }
    return view
  }

  func updateNSView(_ view: BrowserInputView, context: Context) {
    view.agentId = agentId
    view.pageSize = pageSize
    view.cursorName = cursor
  }
}

final class BrowserInputView: NSView {
  var agentId = ""
  var pageSize = CGSize(width: 1280, height: 800)
  var cursorName = "default" { didSet { if cursorName != oldValue { window?.invalidateCursorRects(for: self) } } }
  private var tracking: NSTrackingArea?
  private var pressed = 0

  override var isFlipped: Bool { true }
  override var acceptsFirstResponder: Bool { true }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let tracking { removeTrackingArea(tracking) }
    let area = NSTrackingArea(rect: bounds, options: [.mouseMoved, .activeInKeyWindow, .inVisibleRect, .cursorUpdate], owner: self)
    addTrackingArea(area)
    tracking = area
  }

  override func resetCursorRects() {
    let cursor: NSCursor
    switch cursorName {
    case "pointer": cursor = .pointingHand
    case "text": cursor = .iBeam
    case "crosshair": cursor = .crosshair
    case "not-allowed": cursor = .operationNotAllowed
    case "grab": cursor = .openHand
    case "grabbing": cursor = .closedHand
    default: cursor = .arrow
    }
    addCursorRect(bounds, cursor: cursor)
  }

  private func send(_ input: [String: Any]) { MacBrowserHelper.shared.input(agentId, input) }

  private func place(_ event: NSEvent) -> (Double, Double) {
    let point = convert(event.locationInWindow, from: nil)
    let width = max(bounds.width, 1)
    let height = max(bounds.height, 1)
    let x = min(max(0, point.x / width * pageSize.width), pageSize.width)
    let y = min(max(0, point.y / height * pageSize.height), pageSize.height)
    return (Double(x), Double(y))
  }

  /** DevTools' modifiers: Alt 1, Ctrl 2, Meta 4, Shift 8. */
  static func modifiers(_ flags: NSEvent.ModifierFlags) -> Int {
    (flags.contains(.option) ? 1 : 0) | (flags.contains(.control) ? 2 : 0) | (flags.contains(.command) ? 4 : 0) | (flags.contains(.shift) ? 8 : 0)
  }

  private func mouse(_ event: NSEvent, _ type: String, button: String) {
    let (x, y) = place(event)
    let buttons = button == "left" ? 1 : button == "right" ? 2 : button == "middle" ? 4 : pressed
    send(["kind": "mouse", "type": type, "x": x, "y": y, "button": button, "buttons": type == "mouseReleased" ? 0 : buttons,
          "clickCount": type == "mouseMoved" ? 0 : min(3, max(1, event.clickCount)), "modifiers": Self.modifiers(event.modifierFlags)])
  }

  override func mouseDown(with event: NSEvent) { window?.makeFirstResponder(self); pressed = 1; mouse(event, "mousePressed", button: "left") }
  override func mouseUp(with event: NSEvent) { pressed = 0; mouse(event, "mouseReleased", button: "left") }
  override func rightMouseDown(with event: NSEvent) { pressed = 2; mouse(event, "mousePressed", button: "right") }
  override func rightMouseUp(with event: NSEvent) { pressed = 0; mouse(event, "mouseReleased", button: "right") }
  override func otherMouseDown(with event: NSEvent) { pressed = 4; mouse(event, "mousePressed", button: "middle") }
  override func otherMouseUp(with event: NSEvent) { pressed = 0; mouse(event, "mouseReleased", button: "middle") }
  override func mouseMoved(with event: NSEvent) { mouse(event, "mouseMoved", button: "none") }
  override func mouseDragged(with event: NSEvent) { mouse(event, "mouseMoved", button: "left") }
  override func rightMouseDragged(with event: NSEvent) { mouse(event, "mouseMoved", button: "right") }

  override func scrollWheel(with event: NSEvent) {
    let (x, y) = place(event)
    // Points of a trackpad are the page's pixels near enough; a wheel's lines are three of its lines.
    let scale = event.hasPreciseScrollingDeltas ? 1.0 : 40.0
    send(["kind": "wheel", "x": x, "y": y, "deltaX": -Double(event.scrollingDeltaX) * scale, "deltaY": -Double(event.scrollingDeltaY) * scale,
          "modifiers": Self.modifiers(event.modifierFlags)])
  }

  /** ⌘C, X, V, A, Z and ⇧⌘Z are the tab's own editing, with this Mac's clipboard; other ⌘ keys stay the app's. */
  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    guard window?.firstResponder === self, event.type == .keyDown else { return super.performKeyEquivalent(with: event) }
    let flags = event.modifierFlags.intersection([.command, .shift, .option, .control])
    let letter = event.charactersIgnoringModifiers?.lowercased() ?? ""
    let command: String?
    switch (letter, flags) {
    case ("c", [.command]): command = "copy"
    case ("x", [.command]): command = "cut"
    case ("v", [.command]): command = "paste"
    case ("a", [.command]): command = "selectAll"
    case ("z", [.command]): command = "undo"
    case ("z", [.command, .shift]): command = "redo"
    default: command = nil
    }
    guard let command else { return super.performKeyEquivalent(with: event) }
    send(["kind": "edit", "command": command])
    return true
  }

  override func keyDown(with event: NSEvent) { key(event, "keyDown") }
  override func keyUp(with event: NSEvent) { key(event, "keyUp") }

  private func key(_ event: NSEvent, _ type: String) {
    let named = Self.named[event.keyCode]
    let plain = event.charactersIgnoringModifiers ?? ""
    let typed = event.characters ?? ""
    var key = named?.key ?? typed
    var code = named?.code ?? ""
    var keyCode = named?.vk ?? 0
    if named == nil, let first = plain.uppercased().unicodeScalars.first, plain.count == 1 {
      if CharacterSet.uppercaseLetters.contains(first), first.isASCII { code = "Key\(Character(first))"; keyCode = Int(first.value) }
      if CharacterSet.decimalDigits.contains(first), first.isASCII { code = "Digit\(Character(first))"; keyCode = Int(first.value) }
    }
    if key.isEmpty { key = plain }
    var input: [String: Any] = ["kind": "key", "type": type, "key": key, "code": code, "keyCode": keyCode, "modifiers": Self.modifiers(event.modifierFlags)]
    // The character it types: printable, without ⌘ or ⌃.
    let flags = event.modifierFlags
    if type == "keyDown", !flags.contains(.command), !flags.contains(.control) {
      if let named { if let text = named.text { input["text"] = text } } else if !typed.isEmpty, typed.unicodeScalars.allSatisfy({ $0.value >= 0x20 && !(0xF700...0xF8FF).contains($0.value) }) { input["text"] = typed }
    }
    send(input)
  }

  private struct Named { let key: String; let code: String; let vk: Int; let text: String? }
  private static let named: [UInt16: Named] = [
    36: Named(key: "Enter", code: "Enter", vk: 13, text: "\r"), 76: Named(key: "Enter", code: "NumpadEnter", vk: 13, text: "\r"),
    48: Named(key: "Tab", code: "Tab", vk: 9, text: nil), 49: Named(key: " ", code: "Space", vk: 32, text: " "),
    51: Named(key: "Backspace", code: "Backspace", vk: 8, text: nil), 53: Named(key: "Escape", code: "Escape", vk: 27, text: nil),
    117: Named(key: "Delete", code: "Delete", vk: 46, text: nil), 115: Named(key: "Home", code: "Home", vk: 36, text: nil),
    119: Named(key: "End", code: "End", vk: 35, text: nil), 116: Named(key: "PageUp", code: "PageUp", vk: 33, text: nil),
    121: Named(key: "PageDown", code: "PageDown", vk: 34, text: nil), 123: Named(key: "ArrowLeft", code: "ArrowLeft", vk: 37, text: nil),
    124: Named(key: "ArrowRight", code: "ArrowRight", vk: 39, text: nil), 125: Named(key: "ArrowDown", code: "ArrowDown", vk: 40, text: nil),
    126: Named(key: "ArrowUp", code: "ArrowUp", vk: 38, text: nil),
  ]
}
