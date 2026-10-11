import SwiftUI
import WebKit
import SimeonCore

/**
 * The chat's diagrams and maths, drawn as the Mac's window draws them:
 * Mermaid for a ```mermaid block, KaTeX for maths (both MIT, in
 * `Rendering/`, fetched by `ios/scripts/make-renderers.sh`). Each is a
 * small web page in the bubble, sized to what it drew, in the chat's
 * colours; a diagram opens in its preview with a click, to zoom.
 */
enum RenderAssets {
  static func text(_ name: String, _ ext: String) -> String {
    guard let url = Bundle.main.url(forResource: name, withExtension: ext), let text = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    return text
  }

  static let mermaid = text("mermaid.min", "js")
  static let katex = text("katex.min", "js")

  /** KaTeX's style with its fonts written in (data: addresses), so a page needs no files beside it. */
  static let katexStyle: String = {
    let css = text("katex.min", "css")
    guard let pattern = try? NSRegularExpression(pattern: #"url\(fonts/([A-Za-z0-9_\-]+)\.woff2\)"#) else { return css }
    var out = ""
    var last = css.startIndex
    for match in pattern.matches(in: css, range: NSRange(css.startIndex..., in: css)) {
      guard let whole = Range(match.range, in: css), let name = Range(match.range(at: 1), in: css) else { continue }
      out += css[last..<whole.lowerBound]
      if let url = Bundle.main.url(forResource: String(css[name]), withExtension: "woff2"), let data = try? Data(contentsOf: url) {
        out += "url(data:font/woff2;base64,\(data.base64EncodedString()))"
      } else {
        out += css[whole]
      }
      last = whole.upperBound
    }
    out += css[last...]
    return out
  }()

  /** A string as JavaScript reads it. */
  static func quoted(_ text: String) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: [text]), let array = String(data: data, encoding: .utf8) else { return "\"\"" }
    return array + "[0]"
  }
}

/** What a rendered block draws. */
enum RenderKind: Hashable {
  case mermaid(String)
  /** TeX: on its own lines (between `$$` lines, or a ```math fence) when `display`, else within a line. */
  case math(String, display: Bool)
  /** A paragraph with `$$…$$` maths within its lines (Markdown.inlineMath): its words as text, its maths drawn. */
  case mathText(String)
}

extension EnvironmentValues {
  /** The message is still being written: a diagram waits for its end (the window draws Mermaid only once a message is done). */
  @Entry var messageStreaming = false
}

enum RenderPage {
  /**
   * How the window draws TeX (rehype-katex after its `JYt` pass): an "_"
   * inside \\text{…} escaped when only that makes it draw; strict first,
   * then forgiving; else the source in red (#cc0000) with the error as its
   * tooltip.
   */
  static let katexDraw = #"""
  var EY=/\\(emph|text|textbf|textit|textmd|textnormal|textrm|textsf|texttt|textup)([ \t\r\n]*)\{([^{}]*)\}/g,CY=/\$|\\[()]|\\verb|%/;
  function IY(n){var e="",t=0;for(var s of n){if(s==="\\"){e+=s;t+=1;continue}s==="_"&&t%2===0?e+="\\_":e+=s;t=0}return e}
  function AY(n){return n.replace(EY,function(e,t,s,r){return CY.test(r)?e:"\\"+t+s+"{"+IY(r)+"}"})}
  function ok(n,d){try{katex.renderToString(n,{displayMode:d,throwOnError:true});return true}catch(e){return false}}
  function fix(n,d){var t=AY(n);return t===n||ok(n,d)||!ok(t,d)?n:t}
  function draw(el,tex,d){tex=fix(tex,d);try{katex.render(tex,el,{displayMode:d,throwOnError:true})}catch(first){try{katex.render(tex,el,{displayMode:d,strict:'ignore',throwOnError:false})}catch(e){el.innerHTML='';var s=document.createElement('span');s.className='katex-error';s.style.color='#cc0000';s.title=String(e);s.textContent=tex;el.appendChild(s)}}}
  """#

  /** The page for `kind`, in the chat's ink (`ink`, a CSS colour), telling the app its height (`size`) and, full size, the drawing's own size (`natural`). */
  static func html(_ kind: RenderKind, dark: Bool, ink: String, full: Bool = false) -> String {
    let report = "function size(){var r=document.getElementById('d').getBoundingClientRect();try{window.webkit.messageHandlers.size.postMessage(Math.ceil(r.height))}catch(e){}try{window.webkit.messageHandlers.natural.postMessage([Math.ceil(r.width),Math.ceil(r.height)])}catch(e){}}function failed(){try{window.webkit.messageHandlers.failed.postMessage(1)}catch(e){}}"
    let head = """
    <!doctype html><html><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1\(full ? "" : ",maximum-scale=1,user-scalable=no")">
    <style>html,body{margin:0;padding:0;background:transparent;color:\(ink);font:15px -apple-system,system-ui,sans-serif;-webkit-text-size-adjust:100%}
    #d{display:inline-block;max-width:100%}\(full ? "#d{padding:24px}" : "")
    #d svg{max-width:100%;height:auto}.katex{font-size:1.1em}.err{opacity:.6;font-size:13px}</style>
    """
    switch kind {
    case .mermaid(let source):
      return head + """
      </head><body><div id="d"></div>
      <script>\(RenderAssets.mermaid)</script>
      <script>\(report)
      (async function(){
        try{
          mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'\(dark ? "dark" : "default")',fontFamily:'inherit'});
          var code=\(RenderAssets.quoted(source));
          if(await mermaid.parse(code,{suppressErrors:true})===false){failed();return}
          var r=await mermaid.render('simeon-diagram',code);
          document.getElementById('d').innerHTML=r.svg;
        }catch(e){failed();return}
        size();
      })();
      </script></body></html>
      """
    case .math(let tex, let display):
      return head + """
      <style>\(RenderAssets.katexStyle)</style></head><body><div id="d"></div>
      <script>\(RenderAssets.katex)</script>
      <script>\(report)\(katexDraw)
      draw(document.getElementById('d'),\(RenderAssets.quoted(tex)),\(display ? "true" : "false"));
      if(document.fonts&&document.fonts.ready){document.fonts.ready.then(size)}else{size()}
      size();
      </script></body></html>
      """
    case .mathText(let paragraph):
      // The words as text and each `$$…$$` drawn by KaTeX in its place, at the message's size and line.
      let parts = (Markdown.inlineMath(paragraph) ?? [(false, paragraph)]).map { part in
        part.math ? "<span class=\"m\" data-tex=\"\(escaped(part.text))\"></span>" : escaped(part.text).replacingOccurrences(of: "\n", with: "<br>")
      }.joined()
      return head + """
      <style>\(RenderAssets.katexStyle)#d{display:block;font-size:\(Int(MessageType.size))px;line-height:\(Int(MessageType.lineHeight))px;white-space:normal}.katex{font-size:1.05em}</style></head><body><div id="d">\(parts)</div>
      <script>\(RenderAssets.katex)</script>
      <script>\(report)\(katexDraw)
      document.querySelectorAll('.m').forEach(function(el){draw(el,el.getAttribute('data-tex'),false)});
      if(document.fonts&&document.fonts.ready){document.fonts.ready.then(size)}else{size()}
      size();
      </script></body></html>
      """
    }
  }

  /** Text as HTML reads it. */
  static func escaped(_ text: String) -> String {
    text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
  }
}

/** A diagram or maths in a message: the page sized to what it drew; a diagram opens in its preview. */
struct RenderedBlock: View {
  let kind: RenderKind
  /** Mermaid could not read it: the caller shows why, with the code. */
  var onFail: () -> Void = {}
  @Environment(\.colorScheme) private var scheme
  @State private var height: CGFloat = 24
  @State private var showsFull = false

  private var isDiagram: Bool { if case .mermaid = kind { return true }; return false }

  /** What VoiceOver reads: "Diagram", the TeX, or the paragraph with its TeX in place. */
  private var accessibleText: String {
    switch kind {
    case .mermaid: return "Diagram"
    case .math(let tex, _): return "Maths: \(tex)"
    case .mathText(let text): return text.replacingOccurrences(of: "$$", with: " ")
    }
  }

  var body: some View {
    let page = RenderPage.html(kind, dark: scheme == .dark, ink: scheme == .dark ? "#fcfcfc" : "#1d1d1f")
    RenderWebView(html: page, height: $height, interactive: false, onFail: onFail)
      .frame(height: max(height, 18))
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(.rect)
      .onTapGesture { if isDiagram { showsFull = true } }
      .accessibilityLabel(isDiagram ? "Open diagram full screen" : accessibleText)
      .accessibilityAddTraits(isDiagram ? .isButton : [])
      .overlay(alignment: .topTrailing) {
        if isDiagram {
          // The window's own button for it too.
          Button { showsFull = true } label: { Image(systemName: "arrow.up.left.and.arrow.down.right").font(.system(size: 11, weight: .semibold)) }
            .buttonStyle(.borderless)
            .padding(4)
            .accessibilityLabel("Open diagram full screen")
        }
      }
      .sheet(isPresented: $showsFull) {
        RenderedFull(kind: kind)
          .macSheetSize(width: 860, height: 640)
      }
  }
}

/**
 * A ```mermaid block: the diagram once the message is written (the code
 * while it streams), and when Mermaid cannot read it, the window's
 * "Couldn't render this diagram." over the code.
 */
struct MermaidBlock: View {
  let source: String
  @Environment(\.messageStreaming) private var streaming
  @State private var failed = false

  var body: some View {
    if streaming {
      CodeBlockView(text: source)
    } else if failed {
      VStack(alignment: .leading, spacing: 6) {
        Label("Couldn't render this diagram.", systemImage: "exclamationmark.triangle")
          .font(.system(size: 12)).foregroundStyle(Ink.secondary)
        CodeBlockView(text: source)
      }
    } else {
      RenderedBlock(kind: .mermaid(source)) { failed = true }
    }
  }
}

/**
 * The diagram's preview (the window's "Diagram preview", with no title on
 * screen): Zoom out, Zoom in and Fit to screen, and their keys (− or _, +
 * or =, 0 or F); it opens fitted (never past its own size), zooms by 1.4
 * from the smaller of a tenth and the fit to eight times; a double click
 * fits it when zoomed in, else zooms in twice over; Close diagram preview
 * or Esc closes it.
 */
struct RenderedFull: View {
  let kind: RenderKind
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dismiss) private var dismiss
  @State private var height: CGFloat = 0
  @State private var natural: CGSize = .zero
  @State private var room: CGSize = .zero
  @State private var zoom: CGFloat = 1
  @State private var fitted = false

  static let maxZoom: CGFloat = 8
  static let zoomStep: CGFloat = 1.4

  /** The scale that shows it whole, never past its own size (`l1t`). */
  private var fit: CGFloat {
    guard natural.width > 0, natural.height > 0, room.width > 0, room.height > 0 else { return 1 }
    return min(1, room.width / natural.width, room.height / natural.height)
  }

  private var minZoom: CGFloat { min(0.1, fit) }

  var body: some View {
    NavigationStack {
      GeometryReader { proxy in
        RenderWebView(html: RenderPage.html(kind, dark: scheme == .dark, ink: scheme == .dark ? "#fcfcfc" : "#1d1d1f", full: true), height: $height, natural: $natural, interactive: true, zoom: zoom)
          .onAppear { room = proxy.size }
          .onChange(of: proxy.size) { _, size in room = size }
      }
      .background(Ink.ground)
      .onTapGesture(count: 2) { zoom > fit + 0.001 ? (zoom = fit) : step(Self.zoomStep * Self.zoomStep) }
      .onChange(of: natural) { _, _ in if !fitted && natural.width > 0 { fitted = true; zoom = fit } }
      .accessibilityLabel("Diagram preview")
      .toolbar {
        ToolbarItem(placement: .leadingBar) {
          ControlGroup {
            Button { step(1 / Self.zoomStep) } label: { Label("Zoom out", systemImage: "minus.magnifyingglass") }
              .keyboardShortcut("-", modifiers: [])
              .disabled(zoom <= minZoom + 0.0001)
            Button { step(Self.zoomStep) } label: { Label("Zoom in", systemImage: "plus.magnifyingglass") }
              .keyboardShortcut("+", modifiers: [])
              .disabled(zoom >= Self.maxZoom)
            Button { zoom = fit } label: { Label("Fit to screen", systemImage: "arrow.down.right.and.arrow.up.left") }
              .keyboardShortcut("0", modifiers: [])
          }
        }
        ToolbarItem(placement: .trailingBar) {
          Button { dismiss() } label: { Image(systemName: "xmark") }
            .keyboardShortcut(.cancelAction)
            .accessibilityLabel("Close diagram preview")
        }
      }
      // The other keys the window takes: "=" for in, "_" for out, "f" or "F" to fit.
      .background {
        Group {
          Button("") { step(Self.zoomStep) }.keyboardShortcut("=", modifiers: [])
          Button("") { step(1 / Self.zoomStep) }.keyboardShortcut("_", modifiers: [])
          Button("") { zoom = fit }.keyboardShortcut("f", modifiers: [])
          Button("") { zoom = fit }.keyboardShortcut("f", modifiers: .shift)
        }
        .opacity(0)
        .accessibilityHidden(true)
      }
    }
  }

  private func step(_ factor: CGFloat) {
    zoom = min(max(zoom * factor, minZoom), Self.maxZoom)
  }
}

/** The web page itself: transparent, its height reported; scrolling and zoom only when full size. */
struct RenderWebView {
  let html: String
  @Binding var height: CGFloat
  /** The drawing's own size, for the preview's fit. */
  var natural: Binding<CGSize> = .constant(.zero)
  let interactive: Bool
  /** The page's zoom (`pageZoom`), for the diagram's preview. */
  var zoom: CGFloat = 1
  var onFail: () -> Void = {}

  func makeCoordinator() -> Coordinator { Coordinator(height: $height, natural: natural, onFail: onFail) }

  final class Coordinator: NSObject, WKScriptMessageHandler {
    var height: Binding<CGFloat>
    var natural: Binding<CGSize>
    var onFail: () -> Void
    var loaded = ""
    init(height: Binding<CGFloat>, natural: Binding<CGSize>, onFail: @escaping () -> Void) { self.height = height; self.natural = natural; self.onFail = onFail }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
      if message.name == "failed" { onFail(); return }
      if message.name == "natural" {
        if let pair = message.body as? [Any], pair.count == 2, let w = (pair[0] as? NSNumber)?.doubleValue, let h = (pair[1] as? NSNumber)?.doubleValue {
          let size = CGSize(width: w, height: h)
          if natural.wrappedValue != size { natural.wrappedValue = size }
        }
        return
      }
      guard let value = message.body as? Double ?? (message.body as? Int).map(Double.init), value > 0 else { return }
      let next = CGFloat(value)
      if abs(next - height.wrappedValue) >= 1 { height.wrappedValue = next }
    }
  }

  fileprivate func makeView(_ coordinator: Coordinator) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(coordinator, name: "size")
    configuration.userContentController.add(coordinator, name: "failed")
    configuration.userContentController.add(coordinator, name: "natural")
    let view = WKWebView(frame: .zero, configuration: configuration)
    #if os(iOS)
    view.isOpaque = false
    view.backgroundColor = .clear
    view.scrollView.backgroundColor = .clear
    view.scrollView.isScrollEnabled = interactive
    view.scrollView.bounces = interactive
    #else
    view.setValue(false, forKey: "drawsBackground")
    view.allowsMagnification = interactive
    #endif
    load(view, coordinator)
    return view
  }

  fileprivate func load(_ view: WKWebView, _ coordinator: Coordinator) {
    coordinator.onFail = onFail
    if abs(view.pageZoom - zoom) > 0.001 { view.pageZoom = zoom }
    guard coordinator.loaded != html else { return }
    coordinator.loaded = html
    view.loadHTMLString(html, baseURL: nil)
  }

  fileprivate static func dismantle(_ view: WKWebView) {
    view.configuration.userContentController.removeScriptMessageHandler(forName: "size")
    view.configuration.userContentController.removeScriptMessageHandler(forName: "failed")
    view.configuration.userContentController.removeScriptMessageHandler(forName: "natural")
  }
}

#if os(iOS)
extension RenderWebView: UIViewRepresentable {
  func makeUIView(context: Context) -> WKWebView { makeView(context.coordinator) }
  func updateUIView(_ view: WKWebView, context: Context) { load(view, context.coordinator) }
  static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) { dismantle(view) }
}
#else
extension RenderWebView: NSViewRepresentable {
  func makeNSView(context: Context) -> WKWebView { makeView(context.coordinator) }
  func updateNSView(_ view: WKWebView, context: Context) { load(view, context.coordinator) }
  static func dismantleNSView(_ view: WKWebView, coordinator: Coordinator) { dismantle(view) }
}
#endif
