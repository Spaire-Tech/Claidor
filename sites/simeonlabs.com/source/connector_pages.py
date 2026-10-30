"""A page for each connector (/connectors/<id>): the apps' connector page, in the website's style.

The apps' page (ios/Simeon/ConnectAppsPages.swift and mac/Simeon/PluginsWindow.swift, after ChatGPT's plugin
pages, 29 October 2026): the logo, the name and its maker; three messages a person might send their agent naming
it, on the blue picture (ConnectorHero), the name in its colour with its logo as in a chat; a few lines on it; then
Information. The website's (the founder, 30 October 2026: "Same design, just website style"): the bar, a way back to
every connector, the logo, the name, its maker, its lines and the home page's buttons, the messages beside them on
a computer and under them on a phone; Information across the page; then the home page's closing call.

The words and links are the apps' own (ios/SimeonCore/.../ConnectorPages.swift), read here, so the site never says
more than the apps. The names in the messages are found as the apps find them (`Mentions.find` in Markdown.swift,
its brand part, ported below): the spellings of GeneratedBrands.swift, longest first; an app whose name is an
everyday word (Box, Close, Square…) only where the words around it make it the app. Their logos are the chat's
(the iPhone's Brands/<key>), copied to public/connectors/brands/. connectors.py writes the pages.
"""
import html, os, re, sys, unicodedata

import teams
from teams import BRAND_MARKS, BRANDS, CHEVRON, REPO, esc

PAGES = f"{REPO}/ios/SimeonCore/Sources/SimeonCore/ConnectorPages.swift"
HERO = f"{REPO}/ios/Simeon/Assets.xcassets/ConnectorHero.imageset/connector-hero.jpg"

# Information's words (ConnectorPage.information, .category, .developer, .websiteWord, .privacyWord, .termsWord).
INFORMATION = "Information"
TERMS = ("Category", "Developer", "Website", "Privacy Policy", "Terms of Service")

# A link's arrow, after the address (the apps' arrow.up.right).
OUT_ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 8.5l5-5M4.5 3.5h4v4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'


# The apps' pages

_S = r'"([^"\\]*)"'
_PAGE = re.compile(
    r'^    case "([^"]+)":\n      return page\(' + _S + r", site: " + _S + r", privacy: " + _S + r", terms: " + _S + r","
    r"\s*about: L10n\.text\(" + _S + r"\)," + (r"\s*L10n\.text\(" + _S + r"\),") * 2 + r"\s*L10n\.text\(" + _S + r"\)\)$", re.M)


def pages():
    """Every connector's page, by its id: its maker, its three links, its lines and its three messages. It stops
    when a page in ConnectorPages.swift is not read whole, so none is ever left out unnoticed."""
    text = teams._text(PAGES)
    cases = re.findall(r'^    case "([^"]+)":', text, re.M)
    written = re.search(r"static let written = \[(.*?)\]", text, re.S)
    found = {}
    for m in _PAGE.finditer(text):
        cid, maker, site, privacy, terms, about, *examples = m.groups()
        found[cid] = {"maker": maker, "site": site, "privacy": privacy, "terms": terms, "about": about, "examples": examples}
    listed = re.findall(r'"([^"]+)"', written.group(1)) if written else []
    if not cases or sorted(found) != sorted(cases) or sorted(listed) != sorted(cases):
        missed = sorted(set(cases) - set(found))
        sys.exit(f"connector_pages.py: {os.path.relpath(PAGES)} read {len(found)} of {len(cases)} pages ({len(listed)} written)"
                 + (f"; not read: {', '.join(missed)}" if missed else ""))
    return found


def shown(url):
    """A link's address as Information shows it: the host without "www." (ConnectorPage.shown)."""
    host = re.sub(r"^https?://", "", url).split("/")[0]
    return host[4:] if host.startswith("www.") else host


# The names in a message (Markdown.swift, `Mentions`: `find`, its brand part, and `namesTheApp`)

BRAND_ROWS = [
    {"name": name, "key": key, "light": light, "mono": mono == "true", "ordinary": ordinary == "true"}
    for name, key, light, mono, ordinary in re.findall(
        r'BrandMention\(name: "([^"]+)", key: "([^"]+)", light: "(#[0-9a-fA-F]{6})", dark: "#[0-9a-fA-F]{6}", mono: (true|false), ordinaryWord: (true|false)\)',
        teams._text(BRANDS))
]
BRAND_BY_NAME = {}
for _row in BRAND_ROWS:
    BRAND_BY_NAME.setdefault(_row["name"], _row)
BRAND_PATTERN = re.compile(
    r"(?<![\w@/.-])(?:" + "|".join(re.escape(n) for n in sorted(BRAND_BY_NAME, key=len, reverse=True)) + r")(?![\w-])")

APP_NOUNS = {
    "account", "accounts", "api", "app", "apps", "balance", "board", "boards", "card", "cards", "checkout", "connection", "connector", "connectors",
    "crm", "dashboard", "dashboards", "database", "extension", "inbox", "integration", "integrations", "login", "mcp", "order", "orders", "pay",
    "payment", "payments", "plugin", "profile", "project", "projects", "settings", "store", "subscription", "wallet", "wallets", "workspace", "workspaces",
}
APP_CUES = {
    "connect", "connected", "connecting", "connects", "from", "in", "inside", "into", "on", "onto", "open", "opened", "opening", "opens",
    "reconnect", "reconnected", "through", "use", "used", "uses", "using", "via", "with",
}
APP_CUES_BEFORE_TO = {"back", "connect", "connected", "connecting", "in", "reconnect", "reconnected", "switch", "switched"}
VERB_CUES = {
    "can", "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "don't", "i'd", "i'll", "let's", "may", "might", "must", "please",
    "shall", "should", "shouldn't", "to", "we'd", "we'll", "will", "won't", "would", "wouldn't", "you'd", "you'll",
}
LIST_JOINS = {"", ",", "&", "/", "+", "and", "or", ", and", ", or"}

WORD_GAP = set(" \t*_~\"'“”‘’")
APOSTROPHES = set("'’")
SKIPPED = set("*_\"'“‘([>#-•")
ENDS = set(".!?:…")
NEWLINES = set("\n\u000B\u000C\r\u0085  ")


def _letter(text, i):
    return 0 <= i < len(text) and unicodedata.category(text[i])[0] in "LMN"


def _space(c):
    return c == "\t" or unicodedata.category(c) == "Zs"


def _key(word):
    return word.lower().replace("’", "'")


def starts_sentence(text, at):
    """Whether the word at `at` begins a sentence (`startsSentence`)."""
    i = at - 1
    while i >= 0:
        c = text[i]
        if c in NEWLINES:
            return True
        if not (_space(c) or c in SKIPPED):
            return c in ENDS
        i -= 1
    return True


def word_before(text, at, through=""):
    """The word before `at` and where it starts, over spaces and emphasis only (`word(before:)`)."""
    gap = WORD_GAP | set(through)
    i = at - 1
    while 0 <= i < len(text) and text[i] in gap:
        i -= 1
    end = i + 1
    while i >= 0:
        if _letter(text, i):
            i -= 1
            continue
        if text[i] in APOSTROPHES and i + 1 < end and _letter(text, i - 1):
            i -= 1
            continue
        break
    return (text[i + 1:end], i + 1) if i + 1 < end else None


def word_after(text, end):
    """The word after `end`, past a possessive "'s" (`word(after:)`)."""
    i, possessive = end, False
    if i < len(text) and text[i] in APOSTROPHES and text[i + 1:i + 2] == "s" and not _letter(text, i + 2):
        possessive, i = True, i + 2
    while i < len(text) and text[i] in WORD_GAP:
        i += 1
    start = i
    while i < len(text) and (_letter(text, i) or (text[i] == "-" and _letter(text, i + 1) and i > start)):
        i += 1
    return (text[start:i], possessive) if i > start else None


def names_the_app(text, index, found):
    """Whether the everyday-word app at `index` of the names found is the app here (`namesTheApp`)."""
    start, end = found[index]

    def joined(a, b):
        if a > b:
            return False
        between = "".join(c for c in text[a:b] if c not in "*_~")
        return " ".join(w for w in re.split(r"[ \t]", between) if w).lower() in LIST_JOINS

    listed = (index > 0 and joined(found[index - 1][1], start)) or (index + 1 < len(found) and joined(end, found[index + 1][0]))
    if starts_sentence(text, start):
        return listed
    after = word_after(text, end)
    app_word_after = after is not None and _key(after[0]) in APP_NOUNS
    before = word_before(text, start)
    if before is None:
        return listed or app_word_after
    cue = _key(before[0])
    if cue == "to":
        earlier = word_before(text, before[1])
        if earlier and _key(earlier[0]) in APP_CUES_BEFORE_TO:
            return True
    if cue in APP_CUES:
        return True
    if cue in VERB_CUES:
        return False
    if before[0][:1].isupper() and not starts_sentence(text, before[1]) and not any(s <= before[1] < e for s, e in found):
        return False
    return listed or app_word_after


def mentions(text):
    """The apps a message names: (start, end, brand), in order, as the apps mark them."""
    found = [(m.start(), m.end(), BRAND_BY_NAME[m.group(0)]) for m in BRAND_PATTERN.finditer(text)]
    spans = [(s, e) for s, e, _ in found]
    return [(s, e, b) for i, (s, e, b) in enumerate(found) if not b["ordinary"] or names_the_app(text, i, spans)]


# The page

PAGE_CSS = """
/* A connector's page (connector_pages.py): the apps' page in the site's style. On a computer the head, its lines
   and the buttons on the left, the messages on the blue picture beside them; on a phone one under the other. */
.conn-page{padding:28px 0 0}
.conn-page .back{display:inline-flex;align-items:center;gap:4px;margin:0 0 clamp(28px,2.6*var(--vw,1vw),48px) -2px;font-size:var(--t-body);color:var(--ink2);text-decoration:none}
.conn-page .back:hover{color:var(--ink)}
.conn-page .back svg{width:16px;height:16px}
.conn-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:clamp(40px,4.4*var(--vw,1vw),88px);align-items:stretch}
.conn-head .app{--as:clamp(64px,5*var(--vw,1vw),96px);--ring:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.04),0 10px 28px -14px rgba(0,0,0,.25)}
.conn-head h1{margin-top:clamp(18px,1.6*var(--vw,1vw),28px);font-size:var(--t-display);line-height:1.1;font-weight:var(--w-display);letter-spacing:-.025em}
.conn-head .by{margin-top:6px;font-size:var(--t-lead);letter-spacing:-.01em;color:var(--ink2)}
.conn-head .soon{display:inline-block;margin-left:10px;padding:3px 10px;border-radius:99px;background:#f2f2f2;font-size:var(--t-small);letter-spacing:0;color:#86868b;vertical-align:.12em}
.conn-head .about{margin-top:clamp(16px,1.4*var(--vw,1vw),24px);max-width:34em;font-size:var(--t-lead);line-height:1.47;letter-spacing:-.01em;color:#515154}
.conn-head .ctas{display:flex;gap:clamp(10px,.7*var(--vw,1vw),14px);flex-wrap:wrap;margin-top:clamp(22px,2*var(--vw,1vw),36px)}
.conn-head .btn{height:var(--btn-h);padding:0 var(--btn-pad);font-size:var(--btn-font)}
.conn-head .btn.go{display:none}
/* The messages: the apps' card, each message on a light pill, the app's name in its colour with its logo. */
.says{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:12px;min-height:clamp(320px,26*var(--vw,1vw),460px);margin:0;padding:clamp(24px,2.6*var(--vw,1vw),48px);list-style:none;border-radius:clamp(22px,1.8*var(--vw,1vw),30px);background:#4d86c0 center/cover no-repeat}
.says li{max-width:32em;padding:12px 22px;border-radius:22px;background:rgba(255,255,255,.82);font-size:var(--t-body);line-height:1.4;letter-spacing:-.01em;text-align:center;color:var(--ink)}
.named{font-weight:500;white-space:nowrap}
.named i{display:inline-block;width:1.05em;height:1.05em;margin:0 .26em 0 .04em;vertical-align:-.18em;background:center/contain no-repeat}
.named i.mono{background:currentColor;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}
/* Information: each line's word over its answer, across the page; a phone's as the apps' rows. */
.info{margin-top:clamp(56px,5*var(--vw,1vw),96px)}
.info h2{font-size:var(--t-title);font-weight:var(--w-display);line-height:1.2;letter-spacing:-.02em}
.info dl{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));margin:clamp(16px,1.4*var(--vw,1vw),24px) 0 0;border-top:1px solid #e8e8ed}
.info dl>div{min-width:0;padding:18px 24px 18px 0}
.info dt{font-size:var(--t-small);color:#86868b}
.info dd{margin:4px 0 0;font-size:var(--t-body);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.info dd a{color:var(--blue);text-decoration:none}
.info dd a:hover{text-decoration:underline}
.info dd svg{display:inline-block;width:.7em;height:.7em;margin-left:3px;vertical-align:.05em}
footer{margin-top:0} /* the closing call above leaves the room, as on the Marketplace */
@media (max-width:1068px){
  .conn-top{grid-template-columns:minmax(0,1fr);gap:36px}
  .info dl{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:734px){
  .conn-page{padding-top:20px}
  .conn-head .ctas .btn{display:none}
  .conn-head .btn.go{display:inline-flex} /* a phone: Download for iOS, as the home page's opening */
  .says{min-height:0;align-items:stretch;padding:18px}
  .says li{max-width:none;padding:16px 18px;text-align:left}
  .info dl{grid-template-columns:minmax(0,1fr)}
  .info dl>div{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:14px 0;border-bottom:1px solid #e8e8ed}
  .info dt{flex:none;font-size:var(--t-body);color:var(--ink)}
  .info dd{margin:0;min-width:0;text-align:right;color:var(--ink2)}
}
"""


class Logos:
    """The chat's logos a page's messages use (the iPhone's Brands/<key>), copied once into public/connectors/brands/."""

    def __init__(self, assets):
        self.assets = assets
        self.urls = {}

    def url(self, key):
        if key not in self.urls:
            src = teams._picture(f"{BRAND_MARKS}/{key}.imageset")
            safe = re.sub(r"[^a-z0-9-]", "", key.lower())
            self.urls[key] = self.assets._copy(src, "brands", safe + os.path.splitext(src)[1].lower()) if src and safe else None
        return self.urls[key]


def message(text, logos):
    """A message, each app it names in its colour (medium) after its logo, as in a chat."""
    out, at = [], 0
    for start, end, brand in mentions(text):
        url = logos.url(brand["key"])
        logo = ""
        if url:
            logo = (f'<i class="mono" style="--m:url({url})" aria-hidden="true"></i>' if brand["mono"]
                    else f'<i style="background-image:url({url})" aria-hidden="true"></i>')
        out.append(html.escape(text[at:start], quote=False))
        out.append(f'<span class="named" style="color:{brand["light"]}">{logo}{html.escape(text[start:end], quote=False)}</span>')
        at = end
    out.append(html.escape(text[at:], quote=False))
    return "".join(out)


def information(app, page):
    """Category, Developer, then the maker's website, privacy policy and terms, each its host in blue."""
    rows = [(TERMS[0], esc(app["kind"])), (TERMS[1], esc(page["maker"]))]
    for term, url in zip(TERMS[2:], (page["site"], page["privacy"], page["terms"])):
        rows.append((term, f'<a href="{html.escape(url)}" rel="noopener" title="{html.escape(url)}">{html.escape(shown(url))}{OUT_ARROW}</a>'))
    cells = "".join(f"<div><dt>{term}</dt><dd>{value}</dd></div>" for term, value in rows)
    return f"""<section class="info" aria-labelledby="info-title">
    <h2 id="info-title">{INFORMATION}</h2>
    <dl>{cells}</dl>
  </section>"""


def body(app, page, assets, logos, hero_url, ctas, close):
    cid = app["id"]
    soon = '<span class="soon">Coming soon</span>' if app["soon"] else ""
    says = "".join(f"<li>{message(text, logos)}</li>" for text in page["examples"])
    return f"""<section class="conn-page" aria-labelledby="{cid}-title"><div class="wrap">
  <a class="back" href="/connectors#apps">{CHEVRON}All connectors</a>
  <div class="conn-top">
    <div class="conn-head">
      {assets.tile(cid)}
      <h1 id="{cid}-title">{esc(app["name"])}</h1>
      <p class="by">By {esc(page["maker"])}{soon}</p>
      <p class="about">{esc(page["about"])}</p>
      {ctas}
    </div>
    <ul class="says" style="background-image:url({hero_url})" aria-label="What you can ask">{says}</ul>
  </div>
  {information(app, page)}
</div></section>

{close}"""
