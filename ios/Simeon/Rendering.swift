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
  /** The page for `kind`, in the chat's ink (`ink`, a CSS colour), telling the app its height (`size`). */
  static func html(_ kind: RenderKind, dark: Bool, ink: String, full: Bool = false) -> String {
    let report = "function size(){var h=Math.ceil(document.getElementById('d').getBoundingClientRect().height);try{window.webkit.messageHandlers.size.postMessage(h)}catch(e){}}function failed(){try{window.webkit.messageHandlers.failed.postMessage(1)}catch(e){}}"
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
          mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'\(dark ? "dark" : "default")',fontFamily:'-apple-system,system-ui,sans-serif'});
          var r=await mermaid.render('simeon-diagram',\(RenderAssets.quoted(source)));
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
      <script>\(report)
      try{katex.render(\(RenderAssets.quoted(tex)),document.getElementById('d'),{displayMode:\(display ? "true" : "false"),throwOnError:false,output:'html'})}
      catch(e){document.getElementById('d').textContent=\(RenderAssets.quoted(tex))}
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
      <script>\(report)
      document.querySelectorAll('.m').forEach(function(el){try{katex.render(el.getAttribute('data-tex'),el,{displayMode:false,throwOnError:false,output:'html'})}catch(e){el.textContent=el.getAttribute('data-tex')}});
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

  var body: some View {
    let page = RenderPage.html(kind, dark: scheme == .dark, ink: scheme == .dark ? "#fcfcfc" : "#1d1d1f")
    RenderWebView(html: page, height: $height, interactive: false, onFail: onFail)
      .frame(height: max(height, 18))
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(.rect)
      .onTapGesture { if isDiagram { showsFull = true } }
      .accessibilityLabel(isDiagram ? "Diagram" : "Maths")
      .accessibilityAddTraits(isDiagram ? .isButton : [])
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
 * The diagram's preview (the window's "Diagram preview"): Zoom Out, Zoom
 * In and Fit to Screen, and their keys (− or _, + or =, 0 or F), from a
 * tenth to eight times, each step 1.4 times; Done to close.
 */
struct RenderedFull: View {
  let kind: RenderKind
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dismiss) private var dismiss
  @State private var height: CGFloat = 0
  @State private var zoom: CGFloat = 1

  static let zoomRange: ClosedRange<CGFloat> = 0.1...8
  static let zoomStep: CGFloat = 1.4

  var body: some View {
    NavigationStack {
      RenderWebView(html: RenderPage.html(kind, dark: scheme == .dark, ink: scheme == .dark ? "#fcfcfc" : "#1d1d1f", full: true), height: $height, interactive: true, zoom: zoom)
        .background(Ink.ground)
        .navigationTitle("Diagram preview")
        .inlineBarTitle()
        .toolbar {
          ToolbarItem(placement: .leadingBar) {
            ControlGroup {
              Button { step(1 / Self.zoomStep) } label: { Label("Zoom Out", systemImage: "minus.magnifyingglass") }
                .keyboardShortcut("-", modifiers: [])
                .disabled(zoom <= Self.zoomRange.lowerBound)
              Button { zoom = 1 } label: { Label("Fit to Screen", systemImage: "arrow.up.left.and.down.right.magnifyingglass") }
                .keyboardShortcut("0", modifiers: [])
              Button { step(Self.zoomStep) } label: { Label("Zoom In", systemImage: "plus.magnifyingglass") }
                .keyboardShortcut("+", modifiers: [])
                .disabled(zoom >= Self.zoomRange.upperBound)
            }
          }
          ToolbarItem(placement: .trailingBar) { Button("Done") { dismiss() } }
        }
        // The other keys the window takes: "=" for in, "_" for out, "f" to fit.
        .background {
          Group {
            Button("") { step(Self.zoomStep) }.keyboardShortcut("=", modifiers: [])
            Button("") { step(1 / Self.zoomStep) }.keyboardShortcut("_", modifiers: [])
            Button("") { zoom = 1 }.keyboardShortcut("f", modifiers: [])
          }
          .opacity(0)
          .accessibilityHidden(true)
        }
    }
  }

  private func step(_ factor: CGFloat) {
    zoom = min(max(zoom * factor, Self.zoomRange.lowerBound), Self.zoomRange.upperBound)
  }
}

/** The web page itself: transparent, its height reported; scrolling and zoom only when full size. */
struct RenderWebView {
  let html: String
  @Binding var height: CGFloat
  let interactive: Bool
  /** The page's zoom (`pageZoom`), for the diagram's preview. */
  var zoom: CGFloat = 1
  var onFail: () -> Void = {}

  func makeCoordinator() -> Coordinator { Coordinator(height: $height, onFail: onFail) }

  final class Coordinator: NSObject, WKScriptMessageHandler {
    var height: Binding<CGFloat>
    var onFail: () -> Void
    var loaded = ""
    init(height: Binding<CGFloat>, onFail: @escaping () -> Void) { self.height = height; self.onFail = onFail }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
      if message.name == "failed" { onFail(); return }
      guard let value = message.body as? Double ?? (message.body as? Int).map(Double.init), value > 0 else { return }
      let next = CGFloat(value)
      if abs(next - height.wrappedValue) >= 1 { height.wrappedValue = next }
    }
  }

  fileprivate func makeView(_ coordinator: Coordinator) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(coordinator, name: "size")
    configuration.userContentController.add(coordinator, name: "failed")
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
