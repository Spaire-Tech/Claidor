import AppKit
import SwiftUI
import WebKit
import SimeonCore

/**
 * The chat's maths and diagrams, drawn by the libraries the Electron window
 * draws them with: KaTeX (rehype-katex) for maths and Mermaid for a
 * ```` ```mermaid ```` block, both MIT, in `Rendering/`. Each is a small
 * see-through web page in the message, as tall as what it drew.
 */
enum RenderAssets {
  static func text(_ name: String, _ ext: String) -> String {
    guard let url = Bundle.main.url(forResource: name, withExtension: ext), let text = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    return text
  }

  static let mermaid = text("mermaid.min", "js")
  static let katex = text("katex.min", "js")

  /** KaTeX's style with its fonts written in, so the page needs no files beside it. */
  static let katexStyle: String = {
    let css = text("katex.min", "css")
    guard let pattern = try? NSRegularExpression(pattern: #"url\(fonts/([A-Za-z0-9_\-]+)\.woff2\)"#) else { return css }
    let ns = css as NSString
    var out = ""
    var last = 0
    for match in pattern.matches(in: css, range: NSRange(location: 0, length: ns.length)) {
      out += ns.substring(with: NSRange(location: last, length: match.range.location - last))
      let name = ns.substring(with: match.range(at: 1))
      if let url = Bundle.main.url(forResource: name, withExtension: "woff2"), let data = try? Data(contentsOf: url) {
        out += "url(data:font/woff2;base64,\(data.base64EncodedString()))"
      } else {
        out += ns.substring(with: match.range)
      }
      last = match.range.location + match.range.length
    }
    out += ns.substring(from: last)
    return out
  }()

  /** A string as JavaScript reads it. */
  static func quoted(_ text: String) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: [text]), let array = String(data: data, encoding: .utf8) else { return "\"\"" }
    return array + "[0]"
  }

  /** Text as HTML reads it. */
  static func escaped(_ text: String) -> String {
    text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
  }
}

/** What a drawing in a message draws. */
enum Drawing: Hashable {
  /** A ```` ```mermaid ```` block (`sand-mermaid-figure`): the bubble's width, 4 above and below. */
  case diagram(String)
  /** Maths on its own lines (`$$` lines or a ```` ```math ```` fence): KaTeX's display maths, centred. */
  case maths(String)
  /** A paragraph with `$$…$$` in its lines (`Markdown.inlineMath`): its words at the message's size, its maths drawn in place. */
  case mathsInLine(String)
}

extension EnvironmentValues {
  /** The message is still being written: the window draws a diagram only once its message is done. */
  @Entry var messageStreaming = false
}

enum DrawingPage {
  /**
   * How the window draws TeX (rehype-katex after its `JYt` pass): an "_"
   * inside \text{…} escaped when only that makes it draw; strict first,
   * then forgiving; else the source in red with the error as its tooltip.
   */
  static let katexDraw = #"""
  var EY=/\\(emph|text|textbf|textit|textmd|textnormal|textrm|textsf|texttt|textup)([ \t\r\n]*)\{([^{}]*)\}/g,CY=/\$|\\[()]|\\verb|%/;
  function IY(n){var e="",t=0;for(var s of n){if(s==="\\"){e+=s;t+=1;continue}s==="_"&&t%2===0?e+="\\_":e+=s;t=0}return e}
  function AY(n){return n.replace(EY,function(e,t,s,r){return CY.test(r)?e:"\\"+t+s+"{"+IY(r)+"}"})}
  function ok(n,d){try{katex.renderToString(n,{displayMode:d,throwOnError:true});return true}catch(e){return false}}
  function fix(n,d){var t=AY(n);return t===n||ok(n,d)||!ok(t,d)?n:t}
  function draw(el,tex,d){tex=fix(tex,d);try{katex.render(tex,el,{displayMode:d,throwOnError:true})}catch(first){try{katex.render(tex,el,{displayMode:d,strict:'ignore',throwOnError:false})}catch(e){el.innerHTML='';var s=document.createElement('span');s.className='katex-error';s.style.color='#cc0000';s.title=String(e);s.textContent=tex;el.appendChild(s)}}}
  """#

  /** The page for `drawing` in the message's ink (a CSS colour), telling the app its height. */
  static func html(_ drawing: Drawing, dark: Bool, ink: String) -> String {
    let report = "function size(){var r=document.getElementById('d').getBoundingClientRect();try{window.webkit.messageHandlers.size.postMessage(Math.ceil(r.height))}catch(e){}}function failed(){try{window.webkit.messageHandlers.failed.postMessage(1)}catch(e){}}"
    let head = """
    <!doctype html><html><head><meta charset="utf-8">
    <style>html,body{margin:0;padding:0;background:transparent;color:\(ink);font:14px/20px -apple-system,system-ui,sans-serif;letter-spacing:-0.042px;overflow:hidden}
    #d{display:block}.katex-display{margin:0}
    """
    switch drawing {
    case .diagram(let source):
      return head + """
      #d{padding:4px 0}#d svg{display:block;width:100%;height:auto}</style></head><body><div id="d"></div>
      <script>\(RenderAssets.mermaid)</script>
      <script>\(report)
      (async function(){
        try{
          mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'\(dark ? "dark" : "default")',fontFamily:'inherit'});
          var code=\(RenderAssets.quoted(source));
          if(await mermaid.parse(code,{suppressErrors:true})===false){failed();return}
          var r=await mermaid.render('sand-mermaid-1',code);
          document.getElementById('d').innerHTML=r.svg;
        }catch(e){failed();return}
        size();
        new ResizeObserver(size).observe(document.getElementById('d'));
      })();
      </script></body></html>
      """
    case .maths(let tex):
      return head + """
      \(RenderAssets.katexStyle)</style></head><body><div id="d"></div>
      <script>\(RenderAssets.katex)</script>
      <script>\(report)\(katexDraw)
      draw(document.getElementById('d'),\(RenderAssets.quoted(tex)),true);
      if(document.fonts&&document.fonts.ready){document.fonts.ready.then(size)}
      size();
      new ResizeObserver(size).observe(document.getElementById('d'));
      </script></body></html>
      """
    case .mathsInLine(let paragraph):
      let parts = (Markdown.inlineMath(paragraph) ?? [(false, paragraph)]).map { part in
        part.math ? "<span class=\"m\" data-tex=\"\(RenderAssets.escaped(part.text))\"></span>" : RenderAssets.escaped(part.text).replacingOccurrences(of: "\n", with: "<br>")
      }.joined()
      return head + """
      \(RenderAssets.katexStyle)#d{white-space:normal}</style></head><body><div id="d">\(parts)</div>
      <script>\(RenderAssets.katex)</script>
      <script>\(report)\(katexDraw)
      document.querySelectorAll('.m').forEach(function(el){draw(el,el.getAttribute('data-tex'),false)});
      if(document.fonts&&document.fonts.ready){document.fonts.ready.then(size)}
      size();
      new ResizeObserver(size).observe(document.getElementById('d'));
      </script></body></html>
      """
    }
  }
}

/**
 * A drawing in a message: its page as tall as what it drew. A diagram waits
 * for its message to finish, showing its source until then, and so does
 * one Mermaid cannot read. A drawn diagram opens full screen when clicked
 * ("Open diagram full screen", the zoom-in pointer over it).
 */
struct DrawingView: View {
  let drawing: Drawing
  let look: Look
  @Environment(\.messageStreaming) private var streaming
  @Environment(Viewers.self) private var viewers
  @State private var height: CGFloat = 20
  @State private var failed = false

  var body: some View {
    if case .diagram(let source) = drawing, streaming || failed {
      CodeBlock(language: "mermaid", text: source, look: look)
    } else {
      DrawingWeb(html: DrawingPage.html(drawing, dark: look.dark, ink: look.dark ? "#fcfcfc" : "#1d1d1f"), height: $height, failed: $failed)
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .overlay {
          if case .diagram(let source) = drawing {
            // Over the page, so the click is the app's and the wheel still reaches the chat.
            Color.clear
              .contentShape(RoundedRectangle(cornerRadius: 6))
              .onTapGesture { viewers.shown = .diagram(source) }
              .pointerStyle(.zoomIn)
              .accessibilityElement()
              .accessibilityAddTraits(.isButton)
              .accessibilityLabel("Open diagram full screen")
          }
        }
    }
  }
}

/** The web view a drawing is drawn in: see-through, never scrolling itself (the chat scrolls past it). */
private struct DrawingWeb: NSViewRepresentable {
  let html: String
  @Binding var height: CGFloat
  @Binding var failed: Bool

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeNSView(context: Context) -> PassThroughWebView {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(context.coordinator, name: "size")
    configuration.userContentController.add(context.coordinator, name: "failed")
    let web = PassThroughWebView(frame: .zero, configuration: configuration)
    web.setValue(false, forKey: "drawsBackground")
    web.loadHTMLString(html, baseURL: nil)
    context.coordinator.loaded = html
    return web
  }

  func updateNSView(_ web: PassThroughWebView, context: Context) {
    context.coordinator.parent = self
    guard context.coordinator.loaded != html else { return }
    context.coordinator.loaded = html
    web.loadHTMLString(html, baseURL: nil)
  }

  static func dismantleNSView(_ web: PassThroughWebView, coordinator: Coordinator) {
    web.configuration.userContentController.removeAllScriptMessageHandlers()
  }

  @MainActor
  final class Coordinator: NSObject, WKScriptMessageHandler {
    var parent: DrawingWeb
    var loaded = ""

    init(_ parent: DrawingWeb) { self.parent = parent }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
      switch message.name {
      case "size":
        guard let value = (message.body as? NSNumber)?.doubleValue, value > 0 else { return }
        let next = CGFloat(value)
        if abs(parent.height - next) > 0.5 { parent.height = next }
      case "failed":
        parent.failed = true
      default:
        break
      }
    }
  }
}

/** The web view, handing the scroll wheel to the chat around it. */
final class PassThroughWebView: WKWebView {
  override func scrollWheel(with event: NSEvent) {
    nextResponder?.scrollWheel(with: event)
  }
}
