"""Builds the website's Teams pages (/teams and /teams/<pack>) from the starter packs.

A starter pack is a team of five named agents for one kind of business
(server/simeon/desktop/packs.json, which the apps read too). /teams lists
every pack; /teams/<id> shows one the way the founder's posts show a team: a
big serif headline, "Add to Simeon", then each agent as a card (its clay face,
its name in the apps' blue and its job in grey, what it does, the apps it works
in, and a line it would say), and "Add to Simeon" again at the end. The button
opens the app on the device (simeon-ios:// on an iPhone or iPad, simeon:// on a
Mac) at app/v1/pack/add?id=<id>, and the app adds the team.

The faces are the apps' own catalogue (ios/SimeonCore/.../Resources/Faces).
An app's logo is found the way the iPhone app finds a connector's tile
(`ConnectorTile` in ios/Simeon/Cards.swift): its own app icon first
(ios/Simeon/AppIcons.xcassets/AppIcons/<id>, by its id or the name the apps
give it in ConnectorIcons.swift), else its mark on a white tile (the iPhone's
Connectors/<id>, the Mac window's desktop/brand/app-logos, the chat's
Brands/<id>), else its first letter on a tile, so an app added to a pack before
its logo never shows a broken picture. The script prints which apps drew a
letter.

It rewrites public/teams/ from scratch. build.py calls it after it rewrites
public/; it also runs alone, needing nothing but Python:

    python3 teams.py
"""
import hashlib, html, json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(HERE, "..", "public")
PACKS = os.path.join(HERE, "..", "..", "..", "server", "simeon", "desktop", "packs.json")

FACES = f"{REPO}/ios/SimeonCore/Sources/SimeonCore/Resources/Faces"
APP_ICONS = f"{REPO}/ios/Simeon/AppIcons.xcassets/AppIcons"
CONNECTOR_MARKS = f"{REPO}/ios/Simeon/Assets.xcassets/Connectors"
BRAND_MARKS = f"{REPO}/ios/Simeon/Assets.xcassets/Brands"
MAC_LOGOS = f"{REPO}/desktop/brand/app-logos"
CATALOG = f"{REPO}/desktop/source/shared/node/vendor-mcp/catalog.ts"
ICON_NAMES = f"{REPO}/ios/SimeonCore/Sources/SimeonCore/GeneratedAppIcons.swift"
ICON_ALIASES = f"{REPO}/ios/SimeonCore/Sources/SimeonCore/ConnectorIcons.swift"
BRANDS = f"{REPO}/ios/SimeonCore/Sources/SimeonCore/GeneratedBrands.swift"
MENTIONS = f"{REPO}/ios/scripts/connector-mentions.json"

SITE = "https://simeonlabs.com"
MAC_DOWNLOAD = "https://api.simeonlabs.com/desktop/download/mac"
BLUE = "#255a93"
WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"}
PICTURES = (".png", ".jpg", ".jpeg", ".webp", ".svg")


def _text(path):
    try:
        return open(path, encoding="utf-8").read()
    except OSError:
        return ""


def _json(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# What the repository knows about each app: its name, its colour, whether its mark is one colour.
NAMES, COLOURS, MONO = {}, {}, {}
for key, name in re.findall(r'\bid:\s*"([^"]+)",\s*name:\s*"([^"]+)"', _text(CATALOG)):
    NAMES.setdefault(key, name)
for key, name in re.findall(r'\(\s*"([^"]+)",\s*"([^"]+)"\s*\)', _text(ICON_NAMES)):
    NAMES.setdefault(key, name)
for name, key, light, mono in re.findall(r'BrandMention\(name: "([^"]+)", key: "([^"]+)", light: "(#[0-9a-fA-F]{6})", dark: "#[0-9a-fA-F]{6}", mono: (true|false)', _text(BRANDS)):
    if _slug(name) == key:
        NAMES.setdefault(key, name)
    COLOURS.setdefault(key, light)
    MONO.setdefault(key, mono == "true")
for app in _json(MENTIONS, {}).get("apps", []) + _json(f"{MAC_LOGOS}/apps.json", []):
    if app.get("key") and app.get("name"):
        NAMES.setdefault(app["key"], app["name"])
        if app.get("color"):
            COLOURS.setdefault(app["key"], app["color"])
        MONO.setdefault(app["key"], bool(app.get("mono")))
MAC = {app["key"]: app for app in _json(f"{MAC_LOGOS}/apps.json", []) if app.get("key") and app.get("logo")}
_aliases = re.search(r"static let aliases: \[String: String\] = \[(.*?)\n\s*\]", _text(ICON_ALIASES), re.S)
ALIASES = dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', _aliases.group(1))) if _aliases else {}


def app_name(key):
    if key in NAMES:
        return NAMES[key]
    return key if key[:1].isdigit() else " ".join(word.capitalize() for word in key.split("-"))


def _picture(imageset):
    """The picture an asset catalogue's image set holds (its Contents.json, else its first picture), or None."""
    if not os.path.isdir(imageset):
        return None
    named = [image.get("filename") for image in _json(f"{imageset}/Contents.json", {}).get("images", []) if image.get("filename")]
    for name in named + sorted(os.listdir(imageset)):
        if name and name.lower().endswith(PICTURES) and os.path.isfile(f"{imageset}/{name}"):
            return f"{imageset}/{name}"
    return None


def _version(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()[:8]


def _readable(hex_):
    """A brand colour dark enough for a white letter (build.py's `readable`, a touch darker)."""
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if lum < 0.4:
        return hex_
    k = 0.4 / lum
    return "#" + "".join(f"{round(c * k * 255):02x}" for c in (r, g, b))


class Assets:
    """Copies the faces and app logos the pages use into public/teams/ and says how each app was drawn."""

    def __init__(self, root):
        self.root = root
        self.tiles = {}
        self.faces = {f["id"]: f["file"] for f in _json(f"{FACES}/faces.json", {}).get("faces", []) if f.get("id") and f.get("file")}
        self.drawn = {}

    def _copy(self, src, folder, name):
        os.makedirs(f"{self.root}/{folder}", exist_ok=True)
        shutil.copy(src, f"{self.root}/{folder}/{name}")
        return f"/teams/{folder}/{name}?v={_version(src)}"

    def face(self, face_id):
        """The face's address, or None when the catalogue has no such face."""
        file = self.faces.get(face_id, f"{face_id}.webp")
        src = f"{FACES}/{file}"
        if not re.fullmatch(r"[\w.-]+", file) or not os.path.isfile(src):
            return None
        return self._copy(src, "faces", file)

    def tile(self, key):
        """The app's tile, small and round-cornered, as the apps draw a connector."""
        if key in self.tiles:
            return self.tiles[key]
        name = html.escape(app_name(key))
        safe = re.sub(r"[^a-z0-9-]", "", key.lower()) or "app"
        made = None
        # Its own app icon, the logo filling the tile (AppIcons/<id>, or the id the apps' name for it points at).
        for icon_key in (key, ALIASES.get(key), ALIASES.get(app_name(key).lower())):
            src = icon_key and _picture(f"{APP_ICONS}/{icon_key}.imageset")
            if src:
                url = self._copy(src, "apps", safe + os.path.splitext(src)[1].lower())
                made, how = f'<span class="app icon" title="{name}"><img src="{url}" alt="" width="64" height="64" loading="lazy"></span>', "app icon"
                break
        # Else its mark on a white tile: the iPhone's, the Mac window's, then the chat's (tinted when it is one colour).
        if not made:
            src = _picture(f"{CONNECTOR_MARKS}/{key}.imageset")
            if src:
                url = self._copy(src, "apps", safe + os.path.splitext(src)[1].lower())
                made, how = f'<span class="app mark" title="{name}"><img src="{url}" alt="" loading="lazy"></span>', "mark"
        if not made and key in MAC and os.path.isfile(f"{MAC_LOGOS}/{MAC[key]['logo']}"):
            src, app = f"{MAC_LOGOS}/{MAC[key]['logo']}", MAC[key]
            ext = os.path.splitext(src)[1].lower()
            if app.get("mono") and ext == ".svg" and app.get("color"):
                os.makedirs(f"{self.root}/apps", exist_ok=True)
                svg = open(src, encoding="utf-8").read().replace("<svg ", f'<svg fill="{app["color"]}" ', 1)
                open(f"{self.root}/apps/{safe}.svg", "w", encoding="utf-8").write(svg)
                url = f"/teams/apps/{safe}.svg?v={_version(f'{self.root}/apps/{safe}.svg')}"
            else:
                url = self._copy(src, "apps", safe + ext)
            made, how = f'<span class="app mark" title="{name}"><img src="{url}" alt="" loading="lazy"></span>', "mark"
        if not made:
            src = _picture(f"{BRAND_MARKS}/{key}.imageset")
            if src:
                url = self._copy(src, "apps", safe + os.path.splitext(src)[1].lower())
                if MONO.get(key):
                    made = f'<span class="app mark" title="{name}"><i style="--m:url({url});background:{COLOURS.get(key, "#1d1d1f")}"></i></span>'
                else:
                    made = f'<span class="app mark" title="{name}"><img src="{url}" alt="" loading="lazy"></span>'
                how = "mark"
        # Else its first letter, on its colour when the repository knows it.
        if not made:
            letter = html.escape((app_name(key).strip()[:1] or "?").upper())
            colour = COLOURS.get(key)
            style = f' style="background:{_readable(colour)};color:#fff"' if colour else ""
            made, how = f'<span class="app letter" title="{name}"{style}>{letter}</span>', "letter"
        self.tiles[key] = made
        self.drawn[key] = how
        return made


def esc(text):
    """Escaped for HTML, with the apostrophes inside words made typographic, as the site writes them."""
    return html.escape(re.sub(r"(?<=\w)'(?=\w)", "’", str(text).strip()))


def check(packs):
    """Every pack complete and its id fit for an address, or the problems found."""
    problems, seen = [], set()
    for n, pack in enumerate(packs):
        where = f"packs[{n}] ({pack.get('id', '?')})" if isinstance(pack, dict) else f"packs[{n}]"
        if not isinstance(pack, dict):
            problems.append(f"{where}: not an object"); continue
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", str(pack.get("id", ""))):
            problems.append(f"{where}: id must be lowercase letters, digits and hyphens")
        elif pack["id"] in seen or pack["id"] in ("faces", "apps"):
            problems.append(f"{where}: id is taken")
        seen.add(pack.get("id"))
        for field in ("title", "summary"):
            if not str(pack.get(field, "")).strip():
                problems.append(f"{where}: no {field}")
        agents = pack.get("agents")
        if not isinstance(agents, list) or not agents:
            problems.append(f"{where}: no agents"); continue
        for i, agent in enumerate(agents):
            if not isinstance(agent, dict):
                problems.append(f"{where} agent {i}: not an object"); continue
            for field in ("name", "title", "face", "summary", "quote"):
                if not str(agent.get(field, "")).strip():
                    problems.append(f"{where} agent {i} ({agent.get('name', '?')}): no {field}")
            if not isinstance(agent.get("apps"), list) or not all(isinstance(a, str) and a for a in agent["apps"]):
                problems.append(f"{where} agent {i} ({agent.get('name', '?')}): apps must be a list of connector ids")
    return problems


CSS = """
:root{
  --page:#fff; --soft:#f5f5f7; --ink:#1d1d1f; --ink2:#6e6e73; --ink3:#86868b; --line:#e5e5ea; --blue:%BLUE%;
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif;
  --serif:"Newsreader",Georgia,"Times New Roman",serif;
  --gutter:max(20px,4.6vw);
  --col:min(1260px,calc(100vw - 2 * var(--gutter)));
  color-scheme:light;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--page);color:var(--ink);font-family:var(--font);font-size:17px;line-height:1.47;letter-spacing:-.022em;-webkit-font-smoothing:antialiased;overflow-x:clip}
h1,h2,h3,p,ul,blockquote{margin:0}
img{display:block;max-width:100%}
a{color:inherit}
.wrap{width:var(--col);margin-inline:auto}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;border-radius:99px;background:#000;color:#fff;font-weight:400;letter-spacing:-.01em;white-space:nowrap;text-decoration:none;transition:background .2s}
.btn:hover{background:#2b2b2d}
.btn:focus-visible,a:focus-visible{outline:2px solid var(--blue);outline-offset:3px}

/* The bar, as on the home page; the name goes home. */
.bar{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.82);-webkit-backdrop-filter:saturate(1.8) blur(20px);backdrop-filter:saturate(1.8) blur(20px);padding-top:env(safe-area-inset-top,0px)}
.bar .wrap{display:flex;justify-content:space-between;align-items:center;height:clamp(52px,3.8vw,76px)}
.bar .wordmark{--wm:clamp(118px,10.8vw,217px);display:block;width:var(--wm);margin-left:calc(var(--wm) * -85 / 1585);background:var(--ink);-webkit-mask:url(/img/wordmark-labs.png) center/contain no-repeat;mask:url(/img/wordmark-labs.png) center/contain no-repeat;aspect-ratio:1585/460}
.bar .acts{display:flex;align-items:center;gap:clamp(14px,1.2vw,22px);font-size:clamp(14px,1vw,20px)}
.bar .acts>a:not(.btn){text-decoration:none;color:var(--ink2)}
.bar .acts>a:not(.btn):hover,.bar .acts>a[aria-current]{color:var(--ink)}
.bar .btn{height:clamp(28px,1.9vw,38px);padding:0 clamp(12px,.8vw,16px);font-size:clamp(14px,1vw,20px)}

/* Faces in a row, each over the last, ringed in the ground they sit on. */
.faces{display:flex;--fs:48px;--ring:var(--page)}
.faces img,.faces .noface{width:var(--fs);height:var(--fs);border-radius:50%;object-fit:cover;flex:none;box-shadow:0 0 0 3px var(--ring);background:var(--soft)}
.faces>*+*{margin-left:calc(var(--fs) * -.26)}
.noface{display:grid;place-items:center;font-weight:600;color:var(--ink2);background:#e8e8ed}

/* An app's tile: its own icon with an app icon's corners, else its mark on white, else its first letter. */
.apps{display:flex;align-items:center;flex:none;--as:36px;--ring:var(--soft)}
.app{position:relative;flex:none;display:grid;place-items:center;width:var(--as);height:var(--as);border-radius:calc(var(--as) * .2237);overflow:hidden;background:#fff;box-shadow:0 0 0 2.5px var(--ring)}
.app::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.16);pointer-events:none}
.app+.app{margin-left:calc(var(--as) * -.14)}
.app.icon img{width:100%;height:100%;object-fit:cover}
.app.mark img{width:64%;height:64%;object-fit:contain}
.app.mark i{display:block;width:64%;height:64%;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}
.app.letter{color:#3a3a3c;font-size:calc(var(--as) * .46);font-weight:600;letter-spacing:0;line-height:1}

footer{margin-top:clamp(80px,8vw,140px);background:var(--soft);padding:20px 0 calc(40px + env(safe-area-inset-bottom,0px));font-size:12px;color:var(--ink2)}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer nav{display:flex;gap:18px}
footer a{color:var(--ink2);text-decoration:none}
footer a:hover{color:var(--ink)}
footer a[aria-current]{color:var(--ink)}
""".replace("%BLUE%", BLUE)

INDEX_CSS = """
.top{padding:clamp(56px,7vw,130px) 0 0}
.top h1{font-family:var(--serif);font-weight:400;font-size:clamp(40px,4.4vw,72px);line-height:1.02;letter-spacing:-.025em}
.top p{margin-top:clamp(14px,1.2vw,22px);max-width:34em;font-size:clamp(17px,1.25vw,22px);line-height:1.4;letter-spacing:-.015em;color:var(--ink2)}
.packs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin:clamp(40px,4vw,72px) 0 0;padding:0;list-style:none}
.pack{display:flex;flex-direction:column;height:100%;padding:clamp(26px,2.2vw,36px);border-radius:28px;background:var(--soft);text-decoration:none;transition:background .2s}
.pack:hover{background:#efeff2}
.pack .faces{--ring:var(--soft);--fs:clamp(46px,3.4vw,56px)}
.pack:hover .faces{--ring:#efeff2}
.pack h2{margin-top:clamp(22px,2vw,32px);font-size:clamp(21px,1.5vw,26px);font-weight:600;line-height:1.18;letter-spacing:-.022em}
.pack p{margin-top:10px;flex:1;font-size:clamp(16px,1.05vw,18px);line-height:1.45;color:var(--ink2)}
.pack .more{margin-top:20px;color:var(--blue);font-size:clamp(16px,1.05vw,18px)}
.pack .more::after{content:" \\203A"}
@media (max-width:1068px){.packs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:734px){.packs{grid-template-columns:1fr;gap:14px}.pack{border-radius:24px}.top{padding-top:44px}}
"""

PACK_CSS = """
.post{width:min(860px,var(--col));margin-inline:auto}
.back{display:inline-block;margin-top:clamp(28px,3vw,48px);color:var(--ink2);text-decoration:none;font-size:15px}
.back:hover{color:var(--ink)}
.back::before{content:"\\2039  "}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:clamp(28px,4vw,64px) 0 0}
.hero .faces{--fs:clamp(52px,4.4vw,64px)}
.kicker{margin-top:22px;font-size:clamp(15px,1.05vw,18px);font-weight:500;color:var(--ink2)}
.hero h1{margin-top:clamp(18px,1.6vw,26px);max-width:14em;font-family:var(--serif);font-weight:400;font-size:clamp(38px,4.4vw,68px);line-height:1.03;letter-spacing:-.025em;text-wrap:balance}
.kicker+h1{margin-top:10px}
.hero .lede{margin-top:clamp(16px,1.4vw,24px);max-width:30em;font-size:clamp(17px,1.25vw,21px);line-height:1.42;letter-spacing:-.015em;color:var(--ink2);text-wrap:balance}
.add{display:flex;flex-direction:column;align-items:center;margin-top:clamp(26px,2.4vw,38px)}
.add .btn{height:clamp(46px,3vw,54px);padding:0 clamp(22px,1.6vw,30px);font-size:clamp(16px,1.1vw,19px)}
.add .btn svg{width:1em;height:1em;flex:none;margin-left:-.15em}
.add-note{margin-top:12px}
.add-note[hidden]{display:none}
.add .btn .dl{margin:0 -.15em 0 0} /* Download for macOS, its arrow after the words, as on the home page */

/* The agents: one card each, the face beside what it does on a computer, above it on a phone. */
.team{display:grid;gap:18px;margin:clamp(56px,6vw,96px) 0 0;padding:0;list-style:none}
.agent{display:grid;grid-template-columns:clamp(96px,10vw,132px) minmax(0,1fr);column-gap:clamp(22px,2.4vw,34px);align-items:start;padding:clamp(24px,2.6vw,38px);border-radius:28px;background:var(--soft)}
.agent>.face{grid-row:1 / span 3;width:100%;aspect-ratio:1;height:auto;border-radius:24px;object-fit:cover;background:#e8e8ed}
.agent>.face.noface{display:grid;place-items:center;font-size:40px;font-weight:600;color:var(--ink2)}
.agent .head{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:34px}
.agent h2{font-size:clamp(21px,1.6vw,26px);font-weight:600;line-height:1.2;letter-spacing:-.022em}
.agent h2 .nm{color:var(--blue)}
.agent h2 .tt{color:var(--ink3);font-weight:500;white-space:nowrap}
.agent .sum{margin-top:10px;font-size:clamp(16px,1.08vw,18px);line-height:1.5;color:var(--ink2)}
.agent .q{position:relative;margin-top:clamp(18px,1.6vw,24px);padding:clamp(16px,1.4vw,20px) 0 0;border-top:1px solid #e3e3e8;font-family:var(--serif);font-size:clamp(21px,1.55vw,26px);line-height:1.3;letter-spacing:-.01em;color:var(--ink)}
.agent .q .qm{font-size:2.2em;line-height:0;vertical-align:-.36em;color:var(--blue);opacity:.55}
.agent .q .qm:first-child{margin-right:.06em}
.agent .q .qm:last-child{margin-left:.04em}

.end{display:flex;flex-direction:column;align-items:center;text-align:center;padding:clamp(72px,7vw,120px) 0 0}
.end h2{max-width:14em;font-family:var(--serif);font-weight:400;font-size:clamp(30px,3vw,48px);line-height:1.06;letter-spacing:-.02em;text-wrap:balance}
.end .add{margin-top:clamp(22px,2vw,32px)}
.free{margin-top:16px;font-size:15px;color:var(--ink2)}

@media (max-width:600px){
  .agent{grid-template-columns:56px minmax(0,1fr);column-gap:14px;padding:20px 20px 22px;border-radius:24px}
  .agent>.face{grid-row:1;width:56px;height:56px;border-radius:50%}
  .agent>.face.noface{font-size:22px}
  .agent .head{min-height:56px;gap:10px}
  .agent .apps{--as:30px}
  .agent .sum,.agent .q{grid-column:1 / -1}
  .agent .sum{margin-top:14px}
}
"""

ADD_JS = """<script>
// Add to Simeon: the app on this device opens on the pack and adds the team (simeon-ios:// on an iPhone or
// iPad, simeon:// on a Mac). Still here 1.5 s later, or on any other computer or phone, the page shows
// Download for macOS under it, the home page's button (the founder, 22 October 2026).
(() => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mac = !ios && /Macintosh|Mac OS X/.test(ua);
  for (const box of document.querySelectorAll('.add')) {
    const btn = box.querySelector('.add-btn'), note = box.querySelector('.add-note');
    const query = 'app/v1/pack/add?id=' + encodeURIComponent(btn.dataset.pack);
    if (ios) btn.href = 'simeon-ios://' + query;
    else if (mac) btn.href = 'simeon://' + query;
    btn.addEventListener('click', (e) => {
      if (!ios && !mac) { e.preventDefault(); note.hidden = false; return; }
      let left = false;
      const away = () => { left = true; };
      const hide = () => { if (document.visibilityState === 'hidden') left = true; };
      document.addEventListener('visibilitychange', hide);
      addEventListener('pagehide', away); addEventListener('blur', away);
      setTimeout(() => {
        document.removeEventListener('visibilitychange', hide);
        removeEventListener('pagehide', away); removeEventListener('blur', away);
        if (left || document.visibilityState !== 'visible') return;
        note.hidden = false;
      }, 1500);
    });
  }
})();
</script>"""

PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
# The home page's download arrow (page.html, `.btn .dl`).
DOWNLOAD = '<svg class="dl" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def frame(title, description, path, body, css, current=False, script=""):
    url = f"{SITE}{path}"
    teams_current = ' aria-current="page"' if current else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} | SimeonLabs</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{title} | SimeonLabs">
<meta property="og:description" content="{description}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400&display=swap">
<style>
/* The Teams pages (/teams, /teams/<pack>): the home page's bar, type and colours (source/page.html) around
   the starter packs. Light only, every colour set here. Made by teams.py from server/simeon/desktop/packs.json. */{CSS}{css}</style>
</head>
<body>

<header class="bar">
  <div class="wrap">
    <a class="wordmark" href="/" aria-label="SimeonLabs home"></a>
    <div class="acts"><a href="/teams"{teams_current}>Teams</a><a class="btn" href="{MAC_DOWNLOAD}">Download</a></div>
  </div>
</header>

<main>
{body}
</main>

<footer><div class="wrap"><span>Copyright © 2026 Spaire, Inc. All rights reserved.</span><nav><a href="/teams"{teams_current}>Teams</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:support@simeonlabs.com">Contact</a></nav></div></footer>
{script}
</body>
</html>
"""


def faces_row(pack, assets):
    out = []
    for agent in pack["agents"]:
        url = assets.face(agent["face"])
        if url:
            out.append(f'<img src="{url}" alt="" width="128" height="128">')
        else:
            out.append(f'<span class="noface">{esc(agent["name"][:1].upper())}</span>')
    return '<div class="faces" aria-hidden="true">' + "".join(out) + "</div>"


def and_list(words):
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


def add_button(pack):
    pid = pack["id"]
    return (f'<div class="add"><a class="btn add-btn" href="simeon://app/v1/pack/add?id={pid}" data-pack="{pid}">{PLUS}Add to Simeon</a>'
            f'<p class="add-note" hidden aria-live="polite"><a class="btn" href="{MAC_DOWNLOAD}">Download for macOS{DOWNLOAD}</a></p></div>')


def pack_page(pack, assets):
    title = esc(pack["title"])
    headline = esc(pack.get("headline") or pack["title"])
    count = len(pack["agents"])
    cards = []
    for agent in pack["agents"]:
        url = assets.face(agent["face"])
        face = (f'<img class="face" src="{url}" alt="" width="264" height="264" loading="lazy">' if url
                else f'<span class="face noface" aria-hidden="true">{esc(agent["name"][:1].upper())}</span>')
        apps = [a for a in agent["apps"] if a]
        names = [esc(app_name(a)) for a in apps]
        tiles = "".join(assets.tile(a) for a in apps)
        quote = esc(str(agent["quote"]).strip().strip('"“”'))
        cards.append(
            f'<li class="agent">{face}'
            f'<div class="head"><h2><span class="nm">{esc(agent["name"])}</span> <span class="tt">{esc(agent["title"])}</span></h2>'
            + (f'<span class="apps" role="img" aria-label="Works in {and_list(names)}">{tiles}</span>' if apps else "")
            + f'</div><p class="sum">{esc(agent["summary"])}</p>'
            f'<blockquote class="q"><span class="qm" aria-hidden="true">“</span>{quote}<span class="qm" aria-hidden="true">”</span></blockquote></li>')
    kicker = f'<p class="kicker">{title}</p>' if headline != title else ""
    body = f"""<div class="post">
<a class="back" href="/teams">All teams</a>
<section class="hero" aria-label="{title}">
  {faces_row(pack, assets)}
  {kicker}<h1>{headline}</h1>
  <p class="lede">{esc(pack["summary"])}</p>
  {add_button(pack)}
</section>

<ul class="team" aria-label="The agents">
{chr(10).join(cards)}
</ul>

<section class="end" aria-label="Add the team">
  <h2>Add the {WORDS.get(count, str(count))} of them to Simeon.</h2>
  {add_button(pack)}
  <p class="free">Free. The agents ask before they send, post or pay.</p>
</section>
</div>"""
    return frame(title, esc(pack["summary"]), f"/teams/{pack['id']}", body, PACK_CSS, script=ADD_JS)


def index_page(packs, assets):
    cards = "\n".join(
        f'<li><a class="pack" href="/teams/{p["id"]}">{faces_row(p, assets)}<h2>{esc(p["title"])}</h2>'
        f'<p>{esc(p["summary"])}</p><span class="more">Meet the team</span></a></li>'
        for p in packs)
    body = f"""<div class="wrap">
<section class="top" aria-label="Teams">
  <h1>Teams</h1>
  <p>A team of five agents for your kind of business, ready to add to Simeon.</p>
</section>
<ul class="packs">
{cards}
</ul>
</div>"""
    return frame("Teams", "Starter teams of five agents for one kind of business, ready to add to Simeon.", "/teams", body, INDEX_CSS, current=True)


def build(out=OUT):
    data = _json(PACKS, None)
    if not isinstance(data, dict) or not isinstance(data.get("packs"), list):
        sys.exit(f"teams.py: {os.path.relpath(PACKS)} is missing or not a {{\"packs\": [...]}} file")
    packs = data["packs"]
    problems = check(packs)
    if problems:
        sys.exit("teams.py: packs.json is not complete:\n  " + "\n  ".join(problems))
    root = os.path.join(out, "teams")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    assets = Assets(root)
    for pack in packs:
        os.makedirs(f"{root}/{pack['id']}")
        open(f"{root}/{pack['id']}/index.html", "w", encoding="utf-8").write(pack_page(pack, assets))
    open(f"{root}/index.html", "w", encoding="utf-8").write(index_page(packs, assets))
    letters = sorted(k for k, how in assets.drawn.items() if how == "letter")
    marks = sorted(k for k, how in assets.drawn.items() if how == "mark")
    print(f"teams pages written to {os.path.abspath(root)}: {len(packs)} pack(s)")
    if marks:
        print("  apps drawn from their mark (no app icon yet):", ", ".join(marks))
    if letters:
        print("  apps drawn as a letter (no logo yet):", ", ".join(letters))


if __name__ == "__main__":
    build()
