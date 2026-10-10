import AppKit
import SwiftUI
import WebKit

/**
 * A diagram full screen (`sand-mermaid-viewer`, `ewn`): black at 92% over
 * the window, padded 32; the diagram on its card (the ground, `#181818` on
 * dark, padded 24, 12 round, a deep shadow) at its own size, or smaller to
 * fit the window. Close (20, round, black at 40%) 16 in at the top right;
 * at the foot, 24 up, a pill (black at 50%, padded 4, 4 apart) with Zoom
 * out, Zoom in and Fit to screen (20, glyphs 12, white at 92%). The wheel
 * zooms where the pointer is (a pinch faster), 1.4 a step for the buttons
 * and + and −, from a tenth (or the fit, when smaller) to 8; 0 or F fits;
 * a double click zooms in twice a step, or back to the fit; a drag moves
 * it, kept in view; a click outside it, or Escape, closes. Mermaid draws
 * it in the page, as in the message.
 */
struct DiagramViewer: View {
  let source: String
  let look: Look
  @Environment(Viewers.self) private var viewers
  @State private var page = DiagramPage()

  /** A step of the buttons and of + and − (`Ote`). */
  static let step = 1.4

  var body: some View {
    ZStack {
      Color.black.opacity(0.92)
      DiagramWeb(html: DiagramViewer.html(source, look: look), page: page) { viewers.close() }
    }
    .overlay(alignment: .topTrailing) {
      RoundIcon(symbol: "xmark", label: "Close diagram preview", ground: Color.black.opacity(0.4)) { viewers.close() }
        .padding(16)
    }
    .overlay(alignment: .bottom) {
      HStack(spacing: 4) {
        RoundIcon(symbol: "minus.magnifyingglass", label: "Zoom out") { page.run("zoomBy(\(1 / DiagramViewer.step))") }
        RoundIcon(symbol: "plus.magnifyingglass", label: "Zoom in") { page.run("zoomBy(\(DiagramViewer.step))") }
        RoundIcon(symbol: "arrow.up.left.and.arrow.down.right", label: "Fit to screen") { page.run("fit()") }
      }
      .padding(4)
      .background(Color.black.opacity(0.5), in: Capsule())
      .padding(.bottom, 24)
    }
    .background(ViewerKeys { event in
      if event.keyCode == 53 { viewers.close(); return true }
      switch event.charactersIgnoringModifiers {
      case "+"?, "="?: page.run("zoomBy(\(DiagramViewer.step))"); return true
      case "-"?, "_"?: page.run("zoomBy(\(1 / DiagramViewer.step))"); return true
      case "0"?, "f"?, "F"?: page.run("fit()"); return true
      default: return false
      }
    })
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Diagram preview")
    .accessibilityAddTraits(.isModal)
  }

  /**
   * The page: the diagram drawn by Mermaid as in the message, then the
   * window's own zoom and pan (`ewn`'s `l1t`, `c1t`, `EAe`, `dve`, `Q7n`):
   * it fits the whole window less nothing, at most its own size.
   */
  static func html(_ source: String, look: Look) -> String {
    let canvas = look.dark ? "#181818" : "#fcfcfc"
    let ink = look.dark ? "#fcfcfc" : "#141414"
    return """
    <!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;overflow:hidden;background:transparent;color:\(ink);font:16px -apple-system,system-ui,sans-serif;-webkit-user-select:none;user-select:none}
    #v{position:fixed;inset:0;padding:32px;box-sizing:border-box;display:flex;align-items:center;justify-content:center}
    #c{display:flex;transform-origin:center center;will-change:transform}
    #k{padding:24px;background:\(canvas);border-radius:12px;box-shadow:0 32px 80px rgba(0,0,0,.55);display:flex}
    #k svg{display:block;max-width:none}
    #v.pan{cursor:grab}#v.drag{cursor:grabbing}
    </style></head><body><div id="v"><div id="c"><div id="k"></div></div></div>
    <script>\(RenderAssets.mermaid)</script>
    <script>
    var V=document.getElementById('v'),C=document.getElementById('c'),K=document.getElementById('k');
    var state=null,content={width:0,height:0},area={width:0,height:0},drag=null,moved=false;
    function post(n){try{window.webkit.messageHandlers[n].postMessage(1)}catch(e){}}
    function clamp(v,lo,hi){return hi<lo?lo:Math.min(hi,Math.max(lo,v))}
    function fitScale(){if(content.width<=0||content.height<=0||area.width<=0||area.height<=0)return 1;var t=Math.min(area.width/content.width,area.height/content.height);return !isFinite(t)||t<=0?.1:Math.min(t,1)}
    function okScale(s){var lo=Math.min(.1,fitScale());return isFinite(s)?clamp(s,lo,8):lo}
    function settle(st){var s=okScale(st.scale),rx=Math.max(0,(content.width*s-area.width)/2),ry=Math.max(0,(content.height*s-area.height)/2);return{scale:s,x:clamp(st.x,-rx,rx),y:clamp(st.y,-ry,ry)}}
    function now(){return state||{scale:fitScale(),x:0,y:0}}
    function zoomAt(next,p){var st=now(),s=okScale(next);if(s===st.scale)return;var o=1-s/st.scale;state=settle({scale:s,x:st.x+(p.x-area.width/2-st.x)*o,y:st.y+(p.y-area.height/2-st.y)*o});show()}
    function show(){var st=now();C.style.transform='translate('+st.x+'px,'+st.y+'px) scale('+st.scale+')';var big=content.width*st.scale>area.width+1||content.height*st.scale>area.height+1;V.className=drag&&moved?'drag':big?'pan':''}
    function measure(){area={width:V.clientWidth,height:V.clientHeight};content={width:K.offsetWidth,height:K.offsetHeight};if(state)state=settle(state);show()}
    window.zoomBy=function(f){zoomAt(now().scale*f,{x:area.width/2,y:area.height/2})};
    window.fit=function(){state=null;show()};
    V.addEventListener('wheel',function(e){e.preventDefault();var r=V.getBoundingClientRect(),m=e.deltaMode===1?16:e.deltaMode===2?100:1,f=Math.exp(-e.deltaY*m*((e.ctrlKey||e.metaKey)?.01:.002));zoomAt(now().scale*f,{x:e.clientX-r.left,y:e.clientY-r.top})},{passive:false});
    C.addEventListener('dblclick',function(e){var st=now();if(st.scale>fitScale()){state=null;show();return}var r=V.getBoundingClientRect();zoomAt(st.scale*1.96,{x:e.clientX-r.left,y:e.clientY-r.top})});
    V.addEventListener('pointerdown',function(e){if(e.button!==0)return;var st=now();drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:st.x,oy:st.y};moved=false});
    V.addEventListener('pointermove',function(e){if(!drag||drag.id!==e.pointerId)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!moved&&Math.hypot(dx,dy)>4){moved=true;V.setPointerCapture(e.pointerId)}if(moved){state=settle({scale:now().scale,x:drag.ox+dx,y:drag.oy+dy});show()}});
    function release(e){if(!drag||drag.id!==e.pointerId)return;if(V.hasPointerCapture(e.pointerId))V.releasePointerCapture(e.pointerId);drag=null;show()}
    V.addEventListener('pointerup',release);V.addEventListener('pointercancel',release);
    V.addEventListener('click',function(e){if(!moved&&e.target===V)post('close');moved=false});
    window.addEventListener('resize',measure);
    (async function(){
      try{
        mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'\(look.dark ? "dark" : "default")',fontFamily:'inherit'});
        var r=await mermaid.render('sand-mermaid-viewer-1',\(RenderAssets.quoted(source)));
        K.innerHTML=r.svg;
        var svg=K.querySelector('svg');
        if(svg&&svg.viewBox&&svg.viewBox.baseVal&&svg.viewBox.baseVal.width>0){svg.setAttribute('width',svg.viewBox.baseVal.width);svg.setAttribute('height',svg.viewBox.baseVal.height);svg.style.maxWidth='none'}
      }catch(e){K.textContent=\(RenderAssets.quoted(source));K.style.whiteSpace='pre';K.style.font='12px ui-monospace,monospace'}
      measure();
    })();
    </script></body></html>
    """
  }
}

/** The diagram's page, for the buttons and keys to reach. */
@MainActor
final class DiagramPage {
  weak var web: WKWebView?

  func run(_ script: String) {
    web?.evaluateJavaScript(script, completionHandler: nil)
  }
}

/** A round 20-point control over the dark (`ui-icon-button`): its glyph 12, white at 92%. */
private struct RoundIcon: View {
  let symbol: String
  let label: String
  var ground: Color = .clear
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(Color.white.opacity(0.92))
        .frame(width: 20, height: 20)
        .background(ground, in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .help(label)
    .accessibilityLabel(label)
  }
}

/** The diagram's page in a see-through web view that takes the pointer (unlike a message's drawing). */
private struct DiagramWeb: NSViewRepresentable {
  let html: String
  let page: DiagramPage
  let close: () -> Void

  func makeCoordinator() -> Coordinator { Coordinator(close: close) }

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(context.coordinator, name: "close")
    let web = WKWebView(frame: .zero, configuration: configuration)
    web.setValue(false, forKey: "drawsBackground")
    web.loadHTMLString(html, baseURL: nil)
    context.coordinator.loaded = html
    page.web = web
    return web
  }

  func updateNSView(_ web: WKWebView, context: Context) {
    context.coordinator.close = close
    page.web = web
    guard context.coordinator.loaded != html else { return }
    context.coordinator.loaded = html
    web.loadHTMLString(html, baseURL: nil)
  }

  static func dismantleNSView(_ web: WKWebView, coordinator: Coordinator) {
    web.configuration.userContentController.removeAllScriptMessageHandlers()
  }

  @MainActor
  final class Coordinator: NSObject, WKScriptMessageHandler {
    var close: () -> Void
    var loaded = ""

    init(close: @escaping () -> Void) { self.close = close }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
      if message.name == "close" { close() }
    }
  }
}
