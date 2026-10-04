"""Builds the Simeon website (sites/simeonlabs.com/public) from page.html.

The page is written by hand in page.html: the hero runs the app-window demo in
an iframe, scaled from its box's own size so it can never leave it; the team
gallery, the boxes below it, pricing and the questions are plain HTML and CSS.
This script fills in the parts that come from the repository (the app's own
logos, the phone still of the app, the app bundle) and captures the stills the
hero shows while the app loads.

    python3 build.py <demo bundle>

The demo bundle is desktop/dist/demo, made on a Mac with
`npm run package` then `node demo/build-demo.mjs` in desktop/.
"""
import asyncio, glob, hashlib, json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "..", "public")
if len(sys.argv) < 2 or not os.path.isfile(os.path.join(sys.argv[1], "index.html")):
    sys.exit("usage: python3 build.py <demo bundle, e.g. desktop/dist/demo>")
APP = os.path.abspath(sys.argv[1])
shutil.rmtree(OUT, ignore_errors=True)
os.makedirs(f"{OUT}/logos")
shutil.copytree(f"{HERE}/img", f"{OUT}/img")
shutil.copytree(f"{HERE}/faces", f"{OUT}/faces")
shutil.copytree(f"{HERE}/fonts", f"{OUT}/fonts")
for name in ("favicon.svg", "favicon.ico", "apple-touch-icon.png"): shutil.copy(f"{HERE}/favicons/{name}", f"{OUT}/{name}")

# The app's own logos and brand colours (desktop/brand/app-logos).
LOGOS = f"{REPO}/desktop/brand/app-logos"
APPS = {a["key"]: a for a in json.load(open(f"{LOGOS}/apps.json"))}
def logo(key):
    a = APPS[key]
    src = f"{LOGOS}/{a['logo']}"
    name = key + os.path.splitext(a["logo"])[1]
    if a["mono"]:
        svg = open(src).read().replace("<svg ", f'<svg fill="{a["color"]}" ', 1)
        open(f"{OUT}/logos/{name}", "w").write(svg)
    else:
        shutil.copy(src, f"{OUT}/logos/{name}")
    return f"logos/{name}", a["name"], a["color"]
def readable(hex_):
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if lum < 0.45: return hex_
    k = 0.45 / lum
    return "#" + "".join(f"{round(c * k * 255):02x}" for c in (r, g, b))
def chip(key):
    src, name, color = logo(key)
    return f'<span class="sd-app"><span class="sd-app-ico"><img src="{src}" alt=""></span><span style="color:{readable(color)}">{name}</span></span>'

# The apps the agents' cards show, in the app's own logos.
for key in ("notion", "gmail", "google-docs", "stripe", "quickbooks", "xero", "hubspot", "google-sheets", "mailchimp", "canva", "linkedin", "salesforce", "slack", "figma", "linear", "google-drive", "zoom", "google-calendar", "google-slides", "outlook", "instagram", "substack", "tiktok", "greenhouse", "reddit", "dropbox", "shopify"):
    logo(key)
shutil.copy(f"{HERE}/simeon-mark.svg", f"{OUT}/logos/simeon.svg")
for name in re.findall(r'src="(logos/[^"]+)"', open(f"{HERE}/page.html").read()):
    assert os.path.exists(f"{OUT}/{name}") or name == "logos/word.webp", name

shutil.copy(f"{REPO}/desktop/brand/file-icons/word.webp", f"{OUT}/logos/word.webp")
def mface(f, tint=""):
    return f'<img src="faces/{f}.png" alt="" style="{"filter:" + tint if tint else ""}">'
def tag(f, name, color):
    return f'<span class="sd-m-tag" style="color:{color}"><img src="faces/{f}.png" alt="">{name}</span>'
PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
# The phone hero: a still of the app, drawn by the page, telling the demo's opening (desktop/demo/scenario.ts):
# Simeon's launch check. The faces are the app's own, captured from the demo (source/faces/agent-*.png).
# Name colours are the top colour of each agent's palette (desktop/source/shared/voice-call/agent-mark.ts).
rail = "".join(f'<span class="sd-m-av{" sd-m-on" if i == 0 else ""}">{mface("agent-" + f)}</span>' for i, f in enumerate(["simeon"]))
group = '<span class="sd-m-av sd-m-group">' + mface("agent-simeon") + mface("agent-scout") + mface("agent-iris") + '</span>'
rail += group + "".join(f'<span class="sd-m-av">{mface("agent-" + f)}</span>' for f in ["iris", "theo", "scout"])
# The words are the original phone still's, which the founder asked to keep and to show on the
# laptop too (28 September and 3 October 2026); the laptop's demo plays the same thread.
MOBILE_HTML = ('<div class="sd-mob" aria-label="Simeon, the chief of staff, talking with you about a launch">'
  '<div class="sd-m-rail"><span class="sd-m-lights"><i></i><i></i><i></i></span>' + rail
  + '<span class="sd-m-fill"></span><span class="sd-m-new">' + PLUS + '</span><span class="sd-m-me">BF</span></div>'
  '<div class="sd-m-main"><div class="sd-m-head">' + mface("agent-simeon") + '<b>Simeon</b><span class="sd-m-role">Chief of Staff</span></div>'
  '<div class="sd-m-thread"><div class="sd-m-feed">'
  f'<div class="sd-m-in">Thursday is on track: 12 of 15 launch tickets are done in {chip("linear")}, and the review is Thursday at 2 pm.</div>'
  '<div class="sd-m-sys">Messages from ' + tag("agent-scout", "Scout", "#3f7f78") + ' and ' + tag("agent-iris", "Iris", "#69847c") + '</div>'
  '<div class="sd-m-in">' + tag("agent-scout", "Scout", "#3f7f78") + ' pulled three customer quotes and ' + tag("agent-iris", "Iris", "#69847c") + ' closed the last two tickets. The review doc is ready.</div>'
  '<div class="sd-m-file"><img src="logos/word.webp" alt="">Launch review.docx</div>'
  '<div class="sd-m-out">Looks great. Send the agenda to Dana and Marcus, and check in like this every Monday.<span class="sd-m-react">&#128077;</span></div>'
  '<div class="sd-m-sys">Created routine <span class="sd-m-clock">' + CLOCK + '</span><b>Monday launch check</b></div>'
  f'<div class="sd-m-in">Done. The agenda went out from {chip("gmail")}.</div>'
  '</div></div>'
  '<div class="sd-m-compose"><span class="sd-m-plus">' + PLUS + '</span><span class="sd-m-ph">Message Simeon</span><span class="sd-m-mic">' + MIC + '</span></div>'
  '</div></div>')


MOBILE_CSS = """/* The phone hero: a still of the app window filling the hero box. */
.sd-mob{display:none}
@media (max-width:599.98px){
  .stagebox{aspect-ratio:3/5!important}
  .sd-frame{display:none!important}
  .sd-mob{position:absolute;inset:0;display:flex;container-type:inline-size;background:#fbfbfa;border-radius:inherit;overflow:hidden;
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter",system-ui,sans-serif;color:#1d1d1f;-webkit-font-smoothing:antialiased;
    -webkit-user-select:none;user-select:none}
  .sd-m-rail{flex:none;width:21cqw;display:flex;flex-direction:column;align-items:center;gap:2.6cqw;padding:4.4cqw 0 4cqw;background:#f4f4f3;border-right:1px solid rgba(0,0,0,.07)}
  .sd-m-lights{display:flex;gap:1.6cqw;margin-bottom:2.4cqw}
  .sd-m-lights i{width:2.9cqw;height:2.9cqw;border-radius:50%;background:#ff5f57}
  .sd-m-lights i:nth-child(2){background:#febc2e}.sd-m-lights i:nth-child(3){background:#28c840}
  .sd-m-av{position:relative;display:grid;place-items:center;width:15cqw;height:12.4cqw;border-radius:3cqw}
  .sd-m-av img{width:11cqw;height:11cqw;object-fit:contain}
  .sd-m-on{background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.05)}
  .sd-m-group img{position:absolute;width:6.6cqw;height:6.6cqw}
  .sd-m-group img:nth-child(1){top:1.2cqw;left:4.2cqw}.sd-m-group img:nth-child(2){bottom:1.4cqw;left:1.6cqw}.sd-m-group img:nth-child(3){bottom:1.4cqw;right:1.6cqw}
  .sd-m-fill{flex:1}
  .sd-m-new{width:6cqw;height:6cqw;color:#6e6e73}
  .sd-m-new svg,.sd-m-plus svg,.sd-m-mic svg,.sd-m-clock svg{display:block;width:100%;height:100%}
  .sd-m-me{display:grid;place-items:center;width:9cqw;height:9cqw;border-radius:50%;background:#ececea;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);font-size:3.2cqw;color:#555;letter-spacing:.02em}
  .sd-m-main{flex:1;min-width:0;display:flex;flex-direction:column}
  .sd-m-head{display:flex;align-items:center;gap:2cqw;padding:4.2cqw 4cqw 3.4cqw;border-bottom:1px solid rgba(0,0,0,.06);font-size:4.2cqw}
  .sd-m-head img{width:7.4cqw;height:7.4cqw;object-fit:contain}
  .sd-m-head b{font-weight:500}
  .sd-m-role{font-size:3.3cqw;color:#255a93}
  .sd-m-thread{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:0 3.6cqw;
    -webkit-mask-image:linear-gradient(#0000 0,#000 9cqw);mask-image:linear-gradient(#0000 0,#000 9cqw)}
  .sd-m-feed{display:flex;flex-direction:column;gap:2.2cqw;padding:3cqw 0 2cqw}
  .sd-m-in,.sd-m-out{position:relative;max-width:88%;padding:2.6cqw 3.6cqw;border-radius:4.8cqw;font-size:3.9cqw;line-height:1.42}
  /* The agent speaks on the Messages grey, as in the app (AGENT_SHEET_CSS in router-renderer-patch.mjs). */
  .sd-m-in{align-self:flex-start;background:#e9e9eb;box-shadow:0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
  .sd-m-out{align-self:flex-end;background:#255a93;color:#fff;margin:1.6cqw 0 2.4cqw;
    box-shadow:inset 0 .5px 0 rgba(255,255,255,.28),0 0 0 .5px rgba(20,45,90,.18),0 1px 2px rgba(20,45,90,.08)}
  .sd-m-react{position:absolute;right:-1.4cqw;bottom:-3.6cqw;display:grid;place-items:center;width:7cqw;height:7cqw;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18);font-size:3.6cqw;line-height:1}
  .sd-m-sys{align-self:center;display:flex;align-items:center;flex-wrap:wrap;justify-content:center;gap:1.2cqw;margin:1.4cqw 0;font-size:3.3cqw;color:#8e8e93}
  .sd-m-sys b{font-weight:500;color:#1d1d1f}
  .sd-m-clock{width:4cqw;height:4cqw;color:#3a3a3c}
  .sd-m-tag{display:inline-flex;align-items:center;gap:.8cqw;font-weight:500;vertical-align:middle;position:relative;top:-.1em}
  .sd-m-tag img{width:4.4cqw;height:4.4cqw;object-fit:contain}
  .sd-m-in .sd-app{font-size:.96em}
  .sd-m-file{align-self:flex-start;display:flex;align-items:center;gap:2.4cqw;padding:2.4cqw 4cqw 2.4cqw 2.6cqw;border-radius:3.6cqw;background:#e9e9eb;font-size:3.7cqw;
    box-shadow:0 0 0 .5px rgba(20,30,60,.07),0 1px 2px rgba(20,30,60,.04)}
  .sd-m-file img{width:7cqw;height:7cqw;object-fit:contain}
  .sd-m-compose{display:flex;align-items:center;gap:2.4cqw;margin:1cqw 3.6cqw 4cqw;padding:1.8cqw 1.8cqw 1.8cqw 2cqw;border-radius:99px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.09),0 2px 8px -4px rgba(0,0,0,.1)}
  .sd-m-plus{width:7cqw;height:7cqw;padding:1.3cqw;border-radius:50%;background:#f1f1f0;color:#6e6e73;box-sizing:border-box}
  .sd-m-ph{flex:1;font-size:3.8cqw;color:#a1a1a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sd-m-mic{width:8cqw;height:8cqw;padding:1.9cqw;border-radius:50%;background:#255a93;color:#fff;box-sizing:border-box}
}
.sd-app{display:inline-flex;align-items:center;gap:.32em;white-space:nowrap;font-weight:500;margin-inline:.08em;vertical-align:middle;position:relative;top:-.07em;line-height:1}
.sd-app-ico{flex:none;display:grid;place-items:center;width:1.3em;height:1.3em;border-radius:.34em;background:#fff;box-shadow:0 0 0 .5px rgba(0,0,0,.14)}
.sd-app-ico img{width:72%;height:72%;object-fit:contain}
"""

FIT = """<script>
(() => {
  const stage = document.querySelector('.sd-stage'), frame = stage.querySelector('.sd-frame');
  const bar = frame.querySelector('.sd-bar'), dots = frame.querySelector('.sd-dots'), title = frame.querySelector('.sd-title');
  const screen = frame.querySelector('.sd-screen'), win = frame.querySelector('.sd-window');
  const px = (el, props) => { for (const k in props) el.style[k] = typeof props[k] === 'number' ? props[k] + 'px' : props[k]; };
  const fit = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    const phone = w < 560;
    // The window's left and right edges are the page's column, the same edge as the logo and the
    // headline (the founder, 3 October 2026: "the writing and the demo, aligned"). Room is left
    // under it for the shadow only.
    const side = phone ? Math.round(w * 0.03) : 0, top = phone ? Math.round(h * 0.03) : 0, bottom = Math.round(h * (phone ? 0.03 : 0.04));
    const fw = w - 2 * side, fh = h - top - bottom;
    // Zoom: the app is laid out 1150 px wide in the laptop scene (its card is wide and short), 880 on
    // other computers and tablets, 440 on a phone, then scaled to the window.
    // The app is laid out at a real Mac window's width (1200) and scaled to the box; a phone gets 440.
    const s = fw / (phone ? 440 : 1200);
    // No title bar of its own: like a Mac app with a hidden title bar, the lights sit on the sidebar.
    const barH = 0;
    px(frame, { left: side, top, width: fw, height: fh, borderRadius: Math.round(14 * Math.min(1.3, s)) });
    px(bar, { height: barH, fontSize: Math.max(11, 13 * Math.min(1.1, s)) });
    px(dots, { left: 18 * Math.min(1.2, s), top: 18 * Math.min(1.2, s), gap: 8 * Math.min(1.2, s) });
    for (const i of dots.children) px(i, { width: 12 * Math.min(1.2, s), height: 12 * Math.min(1.2, s) });
    const sh = fh - barH - 2;
    px(screen, { width: fw - 2, height: sh });
    px(win, { width: (fw - 2) / s, height: sh / s, transform: 'scale(' + s + ')' });
    frame.classList.add('sd-ready');
  };
  new ResizeObserver(fit).observe(stage);
  fit();
  // The still of the app shows at once; the live app takes over, unseen, once it has drawn its sidebar.
  const iframe = win.querySelector('iframe');
  const t0 = performance.now();
  const reveal = () => { win.classList.add('sd-live'); setTimeout(() => win.classList.add('sd-settled'), 500); };
  const poll = () => {
    let doc = null; try { doc = iframe.contentDocument; } catch {}
    const ready = doc && doc.querySelector('.sand-agents-sidebar');
    if (ready) { (doc.fonts ? Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 1200))]) : Promise.resolve()).then(() => requestAnimationFrame(() => requestAnimationFrame(reveal))); return; }
    if (performance.now() - t0 > 20000) return reveal();
    setTimeout(poll, 60);
  };
  // Phones show the still (.sd-mob) and never load the app; wider screens load it as soon as they are wider.
  const wide = matchMedia('(min-width:600px)');
  const load = () => { if (wide.matches && !iframe.getAttribute('src')) { iframe.setAttribute('src', iframe.dataset.src); poll(); } };
  wide.addEventListener('change', load); load();
  // The app redraws its agents' faces every frame, on this page's own thread. Nothing of it may
  // cost a frame of scrolling: its frame loop is paused while the page scrolls, while the window
  // is not showing (the laptop scene's painting, or the hero scrolled past), and resumes at rest.
  let offscreen = false, thaw = null;
  const freeze = (on) => { try { iframe.contentWindow.__sdFreeze && iframe.contentWindow.__sdFreeze(on); } catch {} };
  const hidden = () => offscreen || (window.sdWindowHidden ? window.sdWindowHidden() : false);
  window.sdSettleApp = () => { if (!thaw) freeze(hidden()); };
  new IntersectionObserver(([e]) => { offscreen = !e.isIntersecting; sdSettleApp(); }).observe(stage);
  addEventListener('scroll', () => { freeze(true); clearTimeout(thaw); thaw = setTimeout(() => { thaw = null; freeze(hidden()); }, 180); }, { passive: true });
  iframe.addEventListener('load', () => sdSettleApp());
  // The window takes no pointer, so a wheel or a finger over it always scrolls the page on the
  // browser's own thread. A click on it is handed to the part of the app under the pointer
  // (pointer and mouse events, then the click), and the cursor shows what is clickable there.
  const appPoint = (e) => {
    let doc = null; try { doc = iframe.contentDocument; } catch {}
    if (!doc || !win.classList.contains('sd-live')) return null;
    const r = iframe.getBoundingClientRect(), k = r.width / iframe.offsetWidth || 1;
    const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
    if (x < 0 || y < 0 || x > iframe.offsetWidth || y > iframe.offsetHeight) return null;
    const el = doc.elementFromPoint(x, y);
    return el ? { doc, el, x, y } : null;
  };
  const send = (p, type) => {
    const view = p.doc.defaultView, Kind = type.startsWith('pointer') ? view.PointerEvent : view.MouseEvent;
    p.el.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, composed: true, view, clientX: p.x, clientY: p.y, screenX: p.x, screenY: p.y,
      button: 0, buttons: type.endsWith('down') ? 1 : 0, detail: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  };
  let pressed = null, hovering = 0;
  screen.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = appPoint(e); if (!p) return;
    pressed = p; send(p, 'pointerdown'); send(p, 'mousedown');
  });
  screen.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !pressed) return;
    const p = appPoint(e) || pressed;
    send(p, 'pointerup'); send(p, 'mouseup');
    if (pressed.el === p.el || pressed.el.contains(p.el)) send(pressed, 'click');
    pressed = null;
  });
  screen.addEventListener('pointermove', (e) => {
    if (hovering) return;
    hovering = requestAnimationFrame(() => {
      hovering = 0;
      const p = appPoint(e);
      screen.style.cursor = p && p.doc.defaultView.getComputedStyle(p.el).cursor === 'pointer' ? 'pointer' : '';
    });
  });
  // Off the laptop scene the demo plays at once; in it, HERO_JS lets it go when the window rises.
  window.sdReleaseDemo = () => {
    if (!iframe.hasAttribute('data-hold')) return;
    iframe.removeAttribute('data-hold');
    try { iframe.contentWindow.__simeonStart && iframe.contentWindow.__simeonStart(); } catch {}
  };
  if (!document.documentElement.classList.contains('sd-scrolly')) sdReleaseDemo();
})();
</script>"""

async def posters(app_path):
    """Stills of the app's first screen, shown the moment the page opens while the live app loads.
    One per window shape FIT lays out: computer (880 wide), a narrow tablet (880, tall) and a phone (440)."""
    import functools, http.server, threading
    from playwright.async_api import async_playwright
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=OUT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    exe = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))[-1]
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=exe, args=["--no-sandbox"])
            # "held" is the laptop scene's still: the app before its story starts, as the page holds it
            # until the window is up (demo-gate.js reads the iframe's data-hold through frameElement).
            for name, w, h in (("wide", 1200, 700), ("tall", 880, 1110)):
                pg = await b.new_page(viewport={"width": w, "height": h}, device_scale_factor=2)
                if name == "held":
                    await pg.add_init_script("Object.defineProperty(window, 'frameElement', { get: () => ({ hasAttribute: () => true, removeAttribute() {} }) })")
                await pg.goto(f"http://127.0.0.1:{srv.server_port}/{app_path}/index.html")
                # The same moment the page reveals the live app: its sidebar drawn and its fonts in.
                await pg.wait_for_selector(".sand-agents-sidebar", state="attached")
                await pg.evaluate("document.fonts.ready")
                await pg.screenshot(path=f"{OUT}/app-poster-{name}.jpg", type="jpeg", quality=82)
                await pg.close()
            await b.close()
    finally:
        srv.shutdown()


async def main():
    page = open(f"{HERE}/page.html", encoding="utf-8").read()
    app_idx = open(f"{APP}/index.html").read()
    js = re.search(r'src="\./assets/(index-[^"]+\.js)"', app_idx).group(1)
    css = re.search(r'href="\./assets/(index-[^"]+\.css)"', app_idx).group(1)
    for key, value in (("%MOBILE_CSS%", MOBILE_CSS), ("%MOBILE_HTML%", MOBILE_HTML), ("%FIT%", FIT),
                       ("%APP_JS%", js), ("%APP_CSS%", css)):
        assert page.count(key) == 1, key
        page = page.replace(key, value)
    open(f"{OUT}/index.html", "w", encoding="utf-8").write(page)
    shutil.copytree(APP, f"{OUT}/app")
    guard = open(f"{HERE}/scroll-guard.js").read()
    open(f"{OUT}/app/scroll-guard.js", "w").write(guard)
    idx = open(f"{OUT}/app/index.html").read()
    idx = idx.replace('<script src="./demo-bridge.js"></script>', '<script src="./scroll-guard.js"></script>\n    <script src="./demo-bridge.js"></script>\n    <script src="./demo-gate.js"></script>', 1)
    shutil.copy(f"{HERE}/demo-gate.js", f"{OUT}/app/demo-gate.js")
    assert "scroll-guard.js" in idx
    # The sidebar is solid in the page, not glass over a desktop.
    before = 'body::before{content:"";position:fixed;inset:0;z-index:-1;background:linear-gradient(160deg,#e4e4e7,#d4d4d8)}'
    assert before in idx
    idx = idx.replace(before, before + 'html body .sand-agents-sidebar{background-color:var(--cursor-bg-chrome)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}')
    open(f"{OUT}/app/index.html", "w").write(idx)
    # The app lives under a folder named after its content (app/<digest>/), so a changed window is a
    # new address: its files keep the same names from build to build (the patch rewrites them after
    # Vite hashed them), and vercel.json keeps them a year, so a fixed path would serve an old app.
    digest = hashlib.sha256()
    for root, dirs, files in sorted(os.walk(f"{OUT}/app")):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            digest.update(os.path.relpath(full, f"{OUT}/app").encode()); digest.update(open(full, "rb").read())
    app_path = f"app/{digest.hexdigest()[:12]}"
    os.rename(f"{OUT}/app", f"{OUT}/app-staged"); os.makedirs(f"{OUT}/app"); os.rename(f"{OUT}/app-staged", f"{OUT}/{app_path}")
    home = open(f"{OUT}/index.html", encoding="utf-8").read()
    assert home.count("%APP%") == 3
    open(f"{OUT}/index.html", "w", encoding="utf-8").write(home.replace("%APP%", app_path))
    await posters(app_path)
    print("site written to", os.path.abspath(OUT))

asyncio.run(main())
