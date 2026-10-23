"""Builds the website's Teams pages (/teams and /teams/<pack>) from the starter packs.

A starter pack is a team of five named agents for one kind of business
(server/simeon/desktop/packs.json, which the apps read too). /teams opens with
a headline and photos of people at work, each a team's (img/teams/<id>.jpg,
in the order of LEAD), then lists every pack; /teams/<id> shows one the way the founder's posts show a team: a
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
import hashlib, html, json, os, re, shutil, sys, unicodedata

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
# The teams whose photos open /teams, left to right (source/img/teams/<id>.jpg).
LEAD = ["creators", "founders", "agencies", "coffee-shop", "freelancers"]
# The marketplace's chips: the most common kinds of work, each the teams it shows (a team can be in two).
GROUPS = {
    "local": ("Local business", ["coffee-shop", "salons", "trades"]),
    "startups": ("Startups", ["founders", "sales", "recruiters"]),
    "online": ("Selling online", ["online-stores", "creators"]),
    "solo": ("On your own", ["freelancers", "creators"]),
    "firms": ("Firms and agencies", ["agencies", "law-firms", "accountants"]),
    "property": ("Real estate", ["real-estate", "property"]),
    "personal": ("Personal", ["life"]),
}


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
  --col:min(1840px,calc(100vw - 2 * var(--gutter))); /* the home page's column */
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
.noface{display:grid;place-items:center;font-weight:500;color:var(--ink2);background:#e8e8ed}

/* An app's tile: its own icon with an app icon's corners, else its mark on white, else its first letter. */
.apps{display:flex;align-items:center;flex:none;--as:36px;--ring:var(--soft)}
.app{position:relative;flex:none;display:grid;place-items:center;width:var(--as);height:var(--as);border-radius:calc(var(--as) * .2237);overflow:hidden;background:#fff;box-shadow:0 0 0 2.5px var(--ring)}
.app::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.16);pointer-events:none}
.app+.app{margin-left:calc(var(--as) * -.14)}
.app.icon img{width:100%;height:100%;object-fit:cover}
.app.mark img{width:64%;height:64%;object-fit:contain}
.app.mark i{display:block;width:64%;height:64%;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}
.app.letter{color:#3a3a3c;font-size:calc(var(--as) * .46);font-weight:600;letter-spacing:0;line-height:1}

/* Add to Simeon, on a team's page and in its window on /teams. */
.add{display:flex;flex-direction:column;align-items:center;margin-top:clamp(18px,1.6vw,32px)}
.add .btn{height:clamp(40px,2.5vw,50px);padding:0 clamp(18px,1.3vw,26px);font-size:clamp(15px,.95vw,19px)} /* the home page's buttons */
.add .btn svg{width:1em;height:1em;flex:none;margin-left:-.15em}
.add-note{margin:0}
.add-note[hidden]{display:none}
.add.noapp .add-btn{display:none}
.add .btn .dl{margin:0 -.15em 0 0} /* Download for macOS, its arrow after the words, as on the home page */
footer{margin-top:clamp(80px,8vw,140px);background:var(--soft);padding:20px 0 calc(40px + env(safe-area-inset-bottom,0px));font-size:12px;color:var(--ink2)}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer nav{display:flex;gap:18px}
footer a{color:var(--ink2);text-decoration:none}
footer a:hover{color:var(--ink)}
footer a[aria-current]{color:var(--ink)}
""".replace("%BLUE%", BLUE)

INDEX_CSS = """
/* The opening (23 October 2026, after the founder's reference): a centred headline, its first words in a
   box, the buttons, then photos of people at work in a fan, each one a team's; the middle one in front. */
.lead{padding:clamp(56px,6.4vw,128px) 0 0;text-align:center}
.lead h1{font-family:var(--serif);font-weight:400;font-size:clamp(34px,3.2vw,64px);line-height:1.12;letter-spacing:-.02em} /* the home page's closing title */
.lead h1 .box{display:inline-block;margin-bottom:.14em;padding:.02em .3em .08em;border:1px solid #d2d2d7;border-radius:.24em;background:var(--page);box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 20px -10px rgba(0,0,0,.14)}
.lead .ctas{display:flex;justify-content:center;align-items:center;gap:clamp(18px,1.5vw,28px);flex-wrap:wrap;margin-top:clamp(22px,2vw,36px)}
.lead .btn{height:clamp(40px,2.5vw,50px);padding:0 clamp(18px,1.3vw,26px);font-size:clamp(15px,.95vw,19px)} /* the home page's buttons */
.lead .btn .dl{width:1em;height:1em;margin:0 -.15em 0 0}
.lead .see{font-size:clamp(15px,.95vw,19px);text-decoration:none;color:var(--ink)}
.lead .see::after{content:" \\203A"}
.lead .see:hover{text-decoration:underline}
html{scroll-behavior:smooth;scroll-padding-top:clamp(72px,4.6vw,96px)} /* See all teams lands below the bar */
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
.fan{--w:clamp(160px,21vw,400px);--step:calc(var(--w) * .84);position:relative;height:calc(var(--w) * 1.42 + 84px);margin-top:clamp(36px,3.4vw,64px);overflow:hidden}
.shot{position:absolute;top:calc(var(--w) * .08 + 30px);left:calc(50% - var(--w) / 2 + var(--o) * var(--step));z-index:var(--z);width:var(--w);aspect-ratio:4 / 5;border:6px solid #fff;border-radius:24px;overflow:hidden;background:var(--soft);
  box-shadow:0 0 0 1px rgba(0,0,0,.06),0 14px 34px -12px rgba(0,0,0,.28);transform:translateY(calc(var(--y) + var(--lift,0px))) rotate(var(--r)) scale(var(--s));transition:transform .35s cubic-bezier(.2,.7,.2,1)}
.shot:hover,.shot:focus-visible{--lift:-10px}
.shot img{width:100%;height:100%;object-fit:cover}
.shot::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.26))}
.shot span{position:absolute;inset:0;z-index:1;display:grid;place-items:center;padding:0 12px;color:#fff;font-size:clamp(18px,1.55vw,30px);font-weight:500;letter-spacing:-.02em;text-shadow:0 1px 18px rgba(0,0,0,.4)}
/* The marketplace ("more Apple style", 23 October 2026): a light grey band as on the Apple Store, white chips
   and a white search field on it (no blue ring), and the teams as the Store's white cards, which rise a little
   under the pointer: the faces, the kind of work, the name, what it is for, then five of its apps. */
.market{padding:clamp(96px,8vw,160px) 0 clamp(72px,6vw,120px);background:linear-gradient(180deg,var(--page) 0,var(--soft) clamp(200px,17vw,340px))} /* white fading into the grey */
.list-title{font-family:var(--serif);font-weight:400;font-size:clamp(28px,2.2vw,44px);line-height:1.08;letter-spacing:-.02em} /* the home page's section titles */
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:clamp(18px,1.5vw,28px)}
.chip{flex:none;height:36px;padding:0 16px;border:0;border-radius:99px;background:#fff;color:var(--ink);font:inherit;font-size:14px;letter-spacing:-.01em;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.06);transition:background .2s,color .2s,box-shadow .2s}
.chip:hover{box-shadow:0 0 0 1px rgba(0,0,0,.16)}
.chip[aria-pressed="true"]{background:#1d1d1f;color:#fff;box-shadow:none}
.chip:focus-visible,.none button:focus-visible,.pack:focus-visible{outline:2px solid #1d1d1f;outline-offset:3px}
.find{position:relative;margin-top:clamp(14px,1.2vw,22px)}
.find svg{position:absolute;left:16px;top:50%;width:17px;height:17px;transform:translateY(-50%);color:#86868b;pointer-events:none}
.find input{display:block;width:100%;height:44px;padding:0 16px 0 42px;border:0;border-radius:12px;background:#fff;color:var(--ink);font:inherit;font-size:16px;letter-spacing:-.01em;outline:none;box-shadow:0 0 0 1px rgba(0,0,0,.06);-webkit-appearance:none;appearance:none;transition:box-shadow .2s}
.find input:focus{box-shadow:0 0 0 1px rgba(0,0,0,.22),0 4px 14px rgba(0,0,0,.06)}
.find input::placeholder{color:#86868b;opacity:1}
.find input::-webkit-search-decoration{-webkit-appearance:none}
.find input::-webkit-search-cancel-button{-webkit-appearance:none;width:16px;height:16px;cursor:pointer;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='11' fill='%23b0b0b5'/%3E%3Cpath d='m8 8 8 8m0-8-8 8' stroke='%23fff' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E") center/contain no-repeat}
.none{margin-top:28px;font-size:16px;color:var(--ink2)}
.none button{padding:0;border:0;background:none;font:inherit;color:var(--blue);cursor:pointer}
.packs>li[hidden]{display:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.packs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:clamp(24px,2.2vw,40px) 0 0;padding:0;list-style:none}
.pack{display:flex;flex-direction:column;height:100%;padding:clamp(24px,2vw,36px) clamp(24px,2vw,36px) clamp(20px,1.6vw,28px);border-radius:18px;background:#fff;text-decoration:none;
  box-shadow:2px 4px 12px rgba(0,0,0,.08);transition:box-shadow .3s cubic-bezier(0,0,.5,1),transform .3s cubic-bezier(0,0,.5,1)} /* the Apple Store's cards */
.pack:hover{box-shadow:2px 4px 16px rgba(0,0,0,.16);transform:scale3d(1.01,1.01,1.01)}
.pack .faces{--ring:#fff;--fs:clamp(40px,2.8vw,52px)}
.pack .kind{display:block;margin-top:clamp(18px,1.5vw,26px);font-size:12px;font-weight:500;letter-spacing:.01em;color:#86868b}
.pack h2{margin-top:4px;font-size:clamp(19px,1.3vw,24px);font-weight:500;line-height:1.2;letter-spacing:-.015em;color:var(--ink)}
.pack p{margin-top:8px;flex:1;font-size:clamp(15px,1vw,17px);line-height:1.47;letter-spacing:-.01em;color:var(--ink2)}
.pack .foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:clamp(20px,1.7vw,28px);padding-top:clamp(14px,1.2vw,18px);border-top:1px solid #ececef}
.pack .apps{--as:24px;--ring:#fff}
.pack .apps .plus{margin-left:8px;font-size:13px;letter-spacing:0;color:#86868b}
.pack .open{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#1d1d1f;color:#fff;transition:transform .3s}
.pack .open svg{width:14px;height:14px}
.pack:hover .open{transform:scale(1.08)}
/* A team's window (23 October 2026, after Apple's AppleCare window and the founder's bot page reference): over the dimmed
   page, the team (faces, kind of work, name, what it is for, Add to Simeon), then its agents listed on the
   left and the chosen one's whole card on the right: what it does, the apps it connects, how it works,
   and a line it would say. A click beside it, Escape or the close button closes it. */
html:has(dialog[open]){overflow:hidden}
.sheet{width:min(1040px,calc(100vw - 48px));max-width:none;max-height:calc(100dvh - 48px);margin:auto;padding:0;border:0;border-radius:24px;background:var(--page);color:var(--ink);overflow:hidden;box-shadow:0 30px 80px -20px rgba(0,0,0,.35)}
.sheet::backdrop{background:rgba(0,0,0,.45)}
.sheet[open]{animation:sheet-in .28s cubic-bezier(.2,.7,.2,1)}
.sheet[open]::backdrop{animation:fade-in .28s ease}
@keyframes sheet-in{from{opacity:0;transform:translateY(12px) scale(.98)}}
@keyframes fade-in{from{opacity:0}}
.sheet-in{max-height:calc(100dvh - 48px);overflow:auto;overscroll-behavior:contain;padding:clamp(28px,3.6vw,60px) clamp(24px,3.6vw,60px) clamp(24px,2.6vw,40px)}
.sheet .close{position:absolute;top:16px;right:16px;z-index:2;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:#e8e8ed;color:#1d1d1f;cursor:pointer;transition:background .2s}
.sheet .close:hover{background:#dcdce1}
.sheet .close svg{width:14px;height:14px}
.sheet .close:focus-visible,.who button:focus-visible{outline:2px solid #1d1d1f;outline-offset:2px}
.sheet .faces{--fs:clamp(40px,3vw,52px)}
.sheet .eyebrow{margin-top:clamp(18px,1.6vw,26px);font-size:clamp(14px,1vw,17px);font-weight:500;color:var(--ink)}
.sheet h2{margin-top:6px;font-family:var(--serif);font-weight:400;font-size:clamp(30px,2.6vw,50px);line-height:1.06;letter-spacing:-.02em}
.sheet .intro{margin-top:clamp(12px,1vw,18px);max-width:36em;font-size:clamp(16px,1.1vw,19px);line-height:1.5;letter-spacing:-.01em;color:#424245}
.sheet .acts{display:flex;align-items:center;flex-wrap:wrap;gap:12px 24px;margin-top:clamp(20px,1.8vw,30px)}
.sheet .add{margin-top:0;align-items:flex-start}
.sheet .page{color:var(--blue);text-decoration:none;font-size:clamp(15px,.95vw,18px)}
.sheet .page::after{content:" \\203A"}
.sheet .page:hover{text-decoration:underline}
.crew{display:grid;grid-template-columns:minmax(200px,260px) minmax(0,1fr);gap:clamp(16px,1.6vw,28px);margin-top:clamp(32px,3vw,52px)}
.who{display:flex;flex-direction:column;gap:4px}
.who button{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:0;border-radius:14px;background:none;color:var(--ink);font:inherit;text-align:left;cursor:pointer;transition:background .15s}
.who button:hover{background:#fafafa}
.who button[aria-selected="true"]{background:var(--soft)}
.who img,.who .noface{flex:none;width:36px;height:36px;border-radius:50%;object-fit:cover}
.who b{display:block;font-size:15px;font-weight:500;letter-spacing:-.01em}
.who small{display:block;margin-top:1px;font-size:13px;color:var(--ink2)}
.one{padding:clamp(22px,2.2vw,36px);border-radius:20px;background:var(--soft)}
.one[hidden]{display:none}
.one .who-is{display:flex;align-items:center;gap:16px}
.one .who-is img,.one .who-is .noface{flex:none;width:64px;height:64px;border-radius:18px;object-fit:cover}
.one h3{font-size:clamp(19px,1.35vw,24px);font-weight:500;letter-spacing:-.015em}
.one h3 .nm{color:var(--blue)}
.one h3 .tt{color:var(--ink3)}
.one .sum{margin-top:4px;font-size:clamp(15px,1vw,17px);line-height:1.47;color:#424245}
.one h4{margin-top:clamp(22px,2vw,30px);font-size:13px;font-weight:500;letter-spacing:.01em;color:var(--ink2)}
.conn{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin:10px 0 0;padding:0;list-style:none}
.conn li{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--page);font-size:15px;--as:30px;--ring:var(--page)}
.one .how{margin-top:10px;max-width:42em;font-size:clamp(15px,1vw,17px);line-height:1.6;color:#424245}
.one .q{margin-top:clamp(20px,1.8vw,28px);padding-top:clamp(16px,1.4vw,20px);border-top:1px solid #e3e3e8;font-family:var(--serif);font-size:clamp(18px,1.25vw,23px);line-height:1.32;letter-spacing:-.01em}
.one .q .qm{font-size:2.2em;line-height:0;vertical-align:-.36em;color:var(--blue);opacity:.55}
.sheet .fine{margin-top:clamp(24px,2.2vw,36px);font-size:12px;line-height:1.5;color:var(--ink2)}
@media (max-width:734px){
  .sheet{width:100vw;max-height:92dvh;margin:auto 0 0;border-radius:22px 22px 0 0}
  .sheet-in{max-height:92dvh;padding:28px 20px 24px}
  .crew{grid-template-columns:minmax(0,1fr)}
  .who{flex-direction:row;overflow-x:auto;scrollbar-width:none;margin-inline:-20px;padding:0 20px}
  .who::-webkit-scrollbar{display:none}
  .who button{flex:none;width:auto;padding:8px 14px 8px 8px;border-radius:99px}
}
@media (prefers-reduced-motion:reduce){.sheet[open],.sheet[open]::backdrop{animation:none}}
footer{margin-top:0;padding-top:0}
footer .wrap{padding-top:20px;border-top:1px solid #d2d2d7}
@media (max-width:1068px){.packs{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:734px){.packs{grid-template-columns:1fr;gap:14px}.lead{padding-top:48px}.lead h1{font-size:30px;line-height:1.16}.fan{--w:clamp(150px,44vw,240px)}.shot{border-width:4px;border-radius:18px}
  .chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-inline:calc(-1 * var(--gutter));padding:2px var(--gutter)}.chips::-webkit-scrollbar{display:none}}
@media (prefers-reduced-motion:reduce){.shot{transition:none}}
"""

PACK_CSS = """
.post{width:min(860px,var(--col));margin-inline:auto}
.back{display:inline-block;margin-top:clamp(28px,3vw,48px);color:var(--ink2);text-decoration:none;font-size:15px}
.back:hover{color:var(--ink)}
.back::before{content:"\\2039  "}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:clamp(28px,4vw,64px) 0 0}
.hero .faces{--fs:clamp(44px,3.2vw,56px)}
.kicker{margin-top:18px;font-size:clamp(14px,.95vw,17px);font-weight:500;color:var(--ink2)}
.hero h1{margin-top:clamp(16px,1.3vw,24px);max-width:14em;font-family:var(--serif);font-weight:400;font-size:clamp(30px,2.2vw,44px);line-height:1.08;letter-spacing:-.02em;text-wrap:balance} /* the home page's headline */
.kicker+h1{margin-top:10px}
.hero .lede{margin-top:clamp(10px,.9vw,16px);max-width:30em;font-size:clamp(16px,1vw,19px);line-height:1.5;letter-spacing:-.01em;color:var(--ink2);text-wrap:balance}

/* The agents: one card each, the face beside what it does on a computer, above it on a phone. */
.team{display:grid;gap:16px;margin:clamp(44px,4vw,80px) 0 0;padding:0;list-style:none}
.agent{display:grid;grid-template-columns:clamp(72px,6vw,104px) minmax(0,1fr);column-gap:clamp(18px,1.8vw,30px);align-items:start;padding:clamp(22px,2.1vw,36px);border-radius:28px;background:var(--soft)}
.agent>.face{grid-row:1 / span 3;width:100%;aspect-ratio:1;height:auto;border-radius:20px;object-fit:cover;background:#e8e8ed}
.agent>.face.noface{display:grid;place-items:center;font-size:32px;font-weight:500;color:var(--ink2)}
.agent .head{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:30px}
.agent .apps{--as:30px}
.agent h2{font-size:clamp(18px,1.2vw,23px);font-weight:500;line-height:1.2;letter-spacing:-.018em}
.agent h2 .nm{color:var(--blue)}
.agent h2 .tt{color:var(--ink3);font-weight:500;white-space:nowrap}
.agent .sum{margin-top:8px;font-size:clamp(15px,1vw,18px);line-height:1.5;letter-spacing:-.01em;color:var(--ink2)}
.agent .q{position:relative;margin-top:clamp(18px,1.6vw,24px);padding:clamp(16px,1.4vw,20px) 0 0;border-top:1px solid #e3e3e8;font-family:var(--serif);font-size:clamp(18px,1.2vw,23px);line-height:1.32;letter-spacing:-.01em;color:var(--ink)}
.agent .q .qm{font-size:2.2em;line-height:0;vertical-align:-.36em;color:var(--blue);opacity:.55}
.agent .q .qm:first-child{margin-right:.06em}
.agent .q .qm:last-child{margin-left:.04em}

.end{display:flex;flex-direction:column;align-items:center;text-align:center;padding:clamp(72px,7vw,120px) 0 0}
.end h2{max-width:14em;font-family:var(--serif);font-weight:400;font-size:clamp(30px,2.2vw,44px);line-height:1.08;letter-spacing:-.02em;text-wrap:balance}
.end .add{margin-top:clamp(22px,2vw,32px)}
.free{margin-top:14px;font-size:14px;color:var(--ink2)}

@media (max-width:734px){.hero h1,.end h2{font-size:28px;line-height:1.12}}
@media (max-width:600px){
  .agent{grid-template-columns:56px minmax(0,1fr);column-gap:14px;padding:20px 20px 22px;border-radius:24px}
  .agent>.face{grid-row:1;width:56px;height:56px;border-radius:50%}
  .agent>.face.noface{font-size:22px}
  .agent .head{min-height:56px;gap:10px}
  .agent .apps{--as:26px}
  .agent .sum,.agent .q{grid-column:1 / -1}
  .agent .sum{margin-top:14px}
}
"""

ADD_JS = """<script>
// Add to Simeon: the app on this device opens on the pack and adds the team (simeon-ios:// on an iPhone or
// iPad, simeon:// on a Mac). With no app to open (still here 1.5 s later), and from the start on any other
// computer or phone, every Add to Simeon on the page gives way to Download for macOS, the home page's
// button (the founder, 22 October 2026: "the add to simeon must disappear when there's no app").
(() => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mac = !ios && /Macintosh|Mac OS X/.test(ua);
  const noApp = () => {
    for (const box of document.querySelectorAll('.add')) {
      box.classList.add('noapp');
      box.querySelector('.add-note').hidden = false;
    }
  };
  if (!ios && !mac) { noApp(); return; }
  for (const box of document.querySelectorAll('.add')) {
    const btn = box.querySelector('.add-btn');
    const query = 'app/v1/pack/add?id=' + encodeURIComponent(btn.dataset.pack);
    btn.href = (ios ? 'simeon-ios://' : 'simeon://') + query;
    btn.addEventListener('click', () => {
      let left = false;
      const away = () => { left = true; };
      const hide = () => { if (document.visibilityState === 'hidden') left = true; };
      document.addEventListener('visibilitychange', hide);
      addEventListener('pagehide', away); addEventListener('blur', away);
      setTimeout(() => {
        document.removeEventListener('visibilitychange', hide);
        removeEventListener('pagehide', away); removeEventListener('blur', away);
        if (left || document.visibilityState !== 'visible') return;
        noApp();
      }, 1500);
    });
  }
})();
</script>"""

PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
# The home page's download arrow (page.html, `.btn .dl`).
DOWNLOAD = '<svg class="dl" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
MAGNIFIER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

PLUS_SMALL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'
CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'

SHEET_JS = """<script>
// A team's window: its card opens it (a click with a modifier key still opens the team's page), and so does
// /teams#<team>; a click beside it, Escape or the close button closes it. In it, the agents are tabs: a
// click or the arrow keys show one agent's card.
(() => {
  const open = (id) => {
    const d = document.getElementById('team-' + id);
    if (!d || d.open) return;
    d.showModal();
    d.querySelector('.sheet-in').scrollTop = 0;
    history.replaceState(null, '', '#' + id);
  };
  for (const a of document.querySelectorAll('.pack[data-team]')) {
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      open(a.dataset.team);
    });
  }
  for (const d of document.querySelectorAll('dialog.sheet')) {
    d.querySelector('.close').addEventListener('click', () => d.close());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));
    const tabs = [...d.querySelectorAll('[role=tab]')];
    const pick = (t, focus) => {
      for (const x of tabs) {
        const on = x === t;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      }
      if (focus) t.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => pick(t));
      t.addEventListener('keydown', (e) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        pick(tabs[(i + step + tabs.length) % tabs.length], true);
      });
    });
  }
  const fromHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (id && id !== 'all') open(id); };
  addEventListener('hashchange', fromHash);
  fromHash();
})();
</script>"""

MARKET_JS = """<script>
// The marketplace: a chip shows its kind of work (All, or the chosen chip again, shows every team), and the
// search keeps the teams whose name, job, agents or apps hold every word typed. Without this script the
// chips and the search stay hidden and every team shows.
(() => {
  const tools = document.querySelector('.tools'), input = document.getElementById('team-search');
  const chips = [...tools.querySelectorAll('.chip')], cards = [...document.querySelectorAll('.packs > li')];
  const none = document.querySelector('.none'), said = document.querySelector('.sr');
  const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  let group = 'all';
  const choose = (g) => { group = g; for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.group === g)); };
  const show = () => {
    const words = fold(input.value).split(/\\s+/).filter(Boolean);
    let shown = 0;
    for (const li of cards) {
      const fits = (group === 'all' || li.dataset.groups.split(' ').includes(group)) && words.every((w) => li.dataset.q.includes(w));
      li.hidden = !fits;
      if (fits) shown++;
    }
    none.hidden = shown > 0;
    said.textContent = shown === 1 ? '1 team' : shown + ' teams';
  };
  for (const c of chips) c.addEventListener('click', () => { choose(c.dataset.group === group ? 'all' : c.dataset.group); show(); });
  input.addEventListener('input', show);
  none.querySelector('button').addEventListener('click', () => { input.value = ''; choose('all'); show(); input.focus(); });
  tools.hidden = false;
  if (input.value) show();
})();
</script>"""


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


def fan(packs, assets):
    """The opening's photos, left to right, each a link to its team: the middle one larger and in front, the
    ones beside it tilted in, the outer ones tilted out (source/img/teams/<pack>.jpg; a missing one is left out)."""
    by_id = {p["id"]: p for p in packs}
    shots = [(by_id[pid], f"{HERE}/img/teams/{pid}.jpg") for pid in LEAD if pid in by_id and os.path.isfile(f"{HERE}/img/teams/{pid}.jpg")]
    out = []
    for i, (pack, src) in enumerate(shots):
        o = i - (len(shots) - 1) / 2
        side = -1 if o < 0 else 1
        if o == 0:
            r, y, s, z = 0, 0, 1.12, 5
        elif abs(o) <= 1:
            r, y, s, z = -side * 2.5, 34, 1, 4
        else:
            r, y, s, z = side * 5, 20, 1, 3
        url = assets._copy(src, "photos", f"{pack['id']}.jpg")
        name = re.sub(r"^Simeon for ", "", pack["title"])
        out.append(f'<a class="shot" href="/teams/{pack["id"]}" style="--o:{o:g};--r:{r:g}deg;--y:{y}px;--s:{s:g};--z:{z}" aria-label="{esc(pack["title"])}">'
                   f'<img src="{url}" alt="" width="736" height="920"><span aria-hidden="true">{esc(name)}</span></a>')
    return f'<div class="fan">{"".join(out)}</div>' if out else ""


def search_words(pack):
    """What the marketplace's search looks through for a team: its name and folder, what it is for, and each
    agent's name, job and apps; lower case, without accents (the page folds what is typed the same way)."""
    agents = pack["agents"]
    words = [pack["title"], pack.get("folder", ""), pack["summary"]]
    words += [a["name"] for a in agents] + [a["title"] for a in agents]
    words += [app_name(app) for a in agents for app in a["apps"] if app]
    text = unicodedata.normalize("NFD", " ".join(words).lower())
    return esc("".join(c for c in text if not unicodedata.combining(c)))


def some_apps(pack, assets):
    """A card's apps: each agent's first app (five tiles), then how many more the team works in."""
    first = list(dict.fromkeys(a["apps"][0] for a in pack["agents"] if a["apps"]))
    every = {app for a in pack["agents"] for app in a["apps"] if app}
    more = len(every) - len(first)
    names = [esc(app_name(a)) for a in first]
    label = f"Works in {', '.join(names)}" + (f" and {more} more apps" if more else "")
    return (f'<span class="apps" role="img" aria-label="{label}">' + "".join(assets.tile(a) for a in first)
            + (f'<span class="plus">+{more}</span>' if more else "") + "</span>")


def team_sheet(pack, assets, kind):
    """A team's window on /teams: the team, then its agents (a list on the left as in the founder's reference, the chosen
    one's whole card on the right). It opens over the page from the team's card; without the script the
    card goes to the team's page instead."""
    pid = pack["id"]
    tabs, cards = [], []
    for i, agent in enumerate(pack["agents"]):
        url = assets.face(agent["face"])
        face = (f'<img src="{url}" alt="" width="128" height="128" loading="lazy">' if url
                else f'<span class="noface">{esc(agent["name"][:1].upper())}</span>')
        on = i == 0
        tabs.append(f'<button type="button" role="tab" id="{pid}-tab-{i}" aria-controls="{pid}-agent-{i}" aria-selected="{str(on).lower()}" tabindex="{0 if on else -1}">'
                    f'{face}<span><b>{esc(agent["name"])}</b><small>{esc(agent["title"])}</small></span></button>')
        apps = [a for a in agent["apps"] if a]
        conn = "".join(f'<li>{assets.tile(a)}<span>{esc(app_name(a))}</span></li>' for a in apps)
        quote = esc(str(agent["quote"]).strip().strip('"“”'))
        cards.append(
            f'<section class="one" role="tabpanel" id="{pid}-agent-{i}" aria-labelledby="{pid}-tab-{i}"{"" if on else " hidden"}>'
            f'<div class="who-is">{face}<div><h3><span class="nm">{esc(agent["name"])}</span> <span class="tt">{esc(agent["title"])}</span></h3>'
            f'<p class="sum">{esc(agent["summary"])}</p></div></div>'
            + (f'<h4>Apps it connects</h4><ul class="conn">{conn}</ul>' if apps else "")
            + f'<h4>How it works</h4><p class="how">{esc(agent["description"])}</p>'
            f'<blockquote class="q"><span class="qm" aria-hidden="true">“</span>{quote}<span class="qm" aria-hidden="true">”</span></blockquote></section>')
    return f"""<dialog class="sheet" id="team-{pid}" aria-labelledby="{pid}-title">
<button class="close" type="button" aria-label="Close">{CROSS}</button>
<div class="sheet-in">
  {faces_row(pack, assets)}
  {f'<p class="eyebrow">{esc(kind)}</p>' if kind else ""}
  <h2 id="{pid}-title">{esc(pack["title"])}</h2>
  <p class="intro">{esc(pack["summary"])}</p>
  <div class="acts">{add_button(pack)}<a class="page" href="/teams/{pid}">See the team's page</a></div>
  <div class="crew">
    <div class="who" role="tablist" aria-label="The agents" aria-orientation="vertical">{"".join(tabs)}</div>
    <div>{"".join(cards)}</div>
  </div>
  <p class="fine">Free. They go in a “{esc(pack.get("folder") or pack["title"])}” folder in your sidebar; each one says hello in its own chat and asks to connect its apps, and asks before it sends, posts or pays. You can change anything later.</p>
</div>
</dialog>"""


def index_page(packs, assets):
    groups = {pid: [slug for slug, (_, ids) in GROUPS.items() if pid in ids] for pid in (p["id"] for p in packs)}
    cards = "\n".join(
        f'<li data-groups="{" ".join(groups[p["id"]])}" data-q="{search_words(p)}"><a class="pack" href="/teams/{p["id"]}" data-team="{p["id"]}">{faces_row(p, assets)}'
        + (f'<span class="kind">{esc(GROUPS[groups[p["id"]][0]][0])}</span>' if groups[p["id"]] else "")
        + f'<h2>{esc(p["title"])}</h2><p>{esc(p["summary"])}</p>'
        f'<span class="foot">{some_apps(p, assets)}<span class="open" aria-hidden="true">{PLUS_SMALL}</span></span></a></li>'
        for p in packs)
    chips = '<button class="chip" type="button" data-group="all" aria-pressed="true">All</button>' + "".join(
        f'<button class="chip" type="button" data-group="{slug}" aria-pressed="false">{esc(label)}</button>' for slug, (label, _) in GROUPS.items())
    body = f"""<section class="lead" aria-label="Teams">
  <div class="wrap">
    <h1><span class="box">A team of agents</span><br>for your kind of work</h1>
    <div class="ctas"><a class="btn" href="{MAC_DOWNLOAD}">Download for macOS{DOWNLOAD}</a><a class="see" href="#all">See all teams</a></div>
  </div>
  {fan(packs, assets)}
</section>
<section class="market" aria-labelledby="all"><div class="wrap">
<h2 class="list-title" id="all">Marketplace</h2>
<div class="tools" hidden>
  <div class="chips" role="group" aria-label="Kinds of work">{chips}</div>
  <div class="find" role="search">{MAGNIFIER}<input type="search" id="team-search" placeholder="Search by team, job or app" aria-label="Search the teams" autocomplete="off" spellcheck="false"></div>
</div>
<p class="sr" aria-live="polite"></p>
<ul class="packs">
{cards}
</ul>
<p class="none" hidden>No team matches that yet. <button type="button">Show every team</button></p>
</div></section>
{chr(10).join(team_sheet(p, assets, GROUPS[groups[p["id"]][0]][0] if groups[p["id"]] else "") for p in packs)}"""
    return frame("Teams", "Starter teams of five agents for one kind of business, ready to add to Simeon.", "/teams", body, INDEX_CSS, current=True, script=MARKET_JS + SHEET_JS + ADD_JS)


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
