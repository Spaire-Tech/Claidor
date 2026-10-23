"""Builds the website's Connectors page (/connectors) from the apps' connector catalogue.

Laid out after the founder's reference (23 October 2026): an opening with famous
apps' icons around a centred headline; "Find an app for your next task", every
connector as a card (its icon, its name, what it does), the most famous first,
with the catalogue's kinds as tabs, a search and Load more; then questions and
answers on connecting, each one what the apps really do (the founder, 23 October
2026: "remove the Connect an app in a few clicks section. only have an faq there
based logically on whats real"); then the home page's closing call (the founder, 23
October 2026: "add a cta in the connectors page"). A card does nothing yet (the
founder: "this will need a lot more of designing").

The connectors are the apps' own list (desktop/source/shared/node/vendor-mcp/
catalog.ts): their names, kinds and lines, the retired places left out. The
icons are the Marketplace's (teams.py's `Assets`), copied to public/connectors/apps/.
It rewrites public/connectors/ from scratch; build.py calls it after teams.py,
and it runs alone too, needing nothing but Python:

    python3 connectors.py
"""
import os, re, shutil, sys, unicodedata

import teams
from teams import CATALOG, Assets, esc, frame
from versioning import version_style

OUT = teams.OUT

# The most famous first, as the reference lists Gmail, Drive and Calendar first; the rest follow in the
# catalogue's own order.
FAMOUS = [
    "gmail", "google-drive", "google-calendar", "outlook", "sharepoint", "microsoft-teams", "slack", "github",
    "canva", "figma", "notion", "zoom", "salesforce", "hubspot", "box", "dropbox", "stripe", "shopify",
    "google-docs", "google-sheets", "google-slides", "microsoft-excel", "onedrive", "linkedin", "quickbooks",
    "asana", "trello", "jira", "confluence", "linear", "airtable", "monday", "clickup", "calendly", "docusign",
    "mailchimp", "zendesk", "intercom", "paypal", "square", "xero", "whatsapp", "instagram", "youtube",
    "facebook", "tiktok", "discord", "google-meet", "google-analytics", "miro", "webflow", "wix", "gitlab",
    "vercel", "pipedrive", "typeform", "reddit", "pinterest", "eventbrite", "uber", "yelp", "google-maps",
]
# The icons in the room right of the opening's headline: (connector, centre across %, centre down %, seconds
# of its slow drift). `side` ones stay off a phone, where the rest line up under the button.
FLOAT = [
    ("canva", 55, 30, 7.0, False), ("slack", 66, 13, 8.5, False), ("github", 80, 27, 9.4, False),
    ("salesforce", 94, 12, 7.6, True), ("gmail", 61, 66, 7.8, False), ("figma", 74, 55, 9.0, True),
    ("hubspot", 89, 50, 7.2, False), ("google-drive", 71, 82, 8.2, False), ("outlook", 86, 78, 8.8, True),
    ("notion", 99, 75, 7.5, True),
]
PAGE = 24


def fold(text):
    """Lower case without accents, as the page folds what is typed."""
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", fold(text)).strip("-")


def catalogue():
    """Every connector in the catalogue (retired places aside), the famous first: id, name, kind, line, soon."""
    text = teams._text(CATALOG)
    groups_block = re.search(r"VENDOR_MCP_GROUP = \{(.*?)\} as const", text, re.S)
    groups = dict(re.findall(r'(\w+): "([^"]+)"', groups_block.group(1))) if groups_block else {}
    found = []
    for m in re.finditer(r'^\s*(?:app\(\{|\{)\s*id: "([^"]+)", name: "([^"]+)", category: G\.(\w+)(.*)$', text, re.M):
        line = re.search(r'description: "((?:[^"\\]|\\.)*)"', m.group(4))
        found.append({"id": m.group(1), "name": m.group(2), "kind": groups.get(m.group(3), m.group(3)),
                      "line": line.group(1).replace('\\"', '"') if line else "", "soon": "comingSoon: true" in m.group(4)})
    if not found or not groups:
        sys.exit(f"connectors.py: no connectors read from {os.path.relpath(CATALOG)}")
    rank = {cid: i for i, cid in enumerate(FAMOUS)}
    found.sort(key=lambda c: (rank.get(c["id"], len(rank)), 0))
    return found, list(groups.values())


SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

CONN_CSS = """
/* The opening: the home page's (its styles come from page.html), the headline and the buttons on the left;
   famous apps' icons drifting in the room on its right. On a phone they line up on the left, under the button. */
.open{position:relative;min-height:clamp(380px,31*var(--vw,1vw),600px);overflow:hidden}
.open .wrap{position:relative;z-index:1}
.float{position:absolute;left:var(--x);top:var(--y);transform:translate(-50%,-50%);animation:drift var(--t) ease-in-out infinite alternate}
.float .app{--as:clamp(52px,4.8*var(--vw,1vw),92px);--ring:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 18px 40px -16px rgba(0,0,0,.22)}
@keyframes drift{from{translate:0 -7px}to{translate:0 7px}}

/* Find an app: the title and the search, the kinds as words (the chosen one black), the apps as cards. */
.find{padding:clamp(48px,5*var(--vw,1vw),100px) 0 0}
.find-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px 40px}
.find-head h2{max-width:var(--title-max);font-weight:var(--w-display);font-size:var(--t-display);line-height:1.1;letter-spacing:-.025em;text-wrap:pretty} /* the home page's section titles: the headline's size */
.search{position:relative;flex:1;max-width:620px;min-width:min(100%,280px)}
.search input{display:block;width:100%;height:48px;padding:0 50px 0 22px;border:1px solid #e3e3e8;border-radius:99px;background:var(--page);color:var(--ink);font:inherit;font-size:var(--t-field);letter-spacing:-.01em;outline:none;-webkit-appearance:none;appearance:none;transition:border-color .2s,box-shadow .2s}
.search input:focus{border-color:#c7c7cc;box-shadow:0 4px 14px rgba(0,0,0,.05)} /* no blue ring */
.search input::placeholder{color:#86868b;opacity:1}
.search input::-webkit-search-decoration,.search input::-webkit-search-cancel-button{-webkit-appearance:none}
.search svg{position:absolute;right:20px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:#1d1d1f;pointer-events:none}
.kinds{display:flex;gap:clamp(20px,2*var(--vw,1vw),34px);margin-top:clamp(24px,2.4*var(--vw,1vw),40px);overflow-x:auto;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 56px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 56px),transparent)}
.kinds::-webkit-scrollbar{display:none}
.kinds button{flex:none;padding:6px 0;border:0;background:none;color:#86868b;font:inherit;font-size:var(--t-body);letter-spacing:-.01em;white-space:nowrap;cursor:pointer;transition:color .15s}
.kinds button:hover,.kinds button[aria-pressed="true"]{color:var(--ink)}
.kinds button:last-child{margin-right:56px}
.kinds button:focus-visible,.more-apps:focus-visible,.step:focus-visible{outline:2px solid #1d1d1f;outline-offset:3px;border-radius:6px}
.list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:clamp(28px,2.8*var(--vw,1vw),52px) 0 0;padding:0;list-style:none}
.list li{display:flex;align-items:center;gap:18px;min-width:0;padding:16px 18px;border-radius:24px;background:#f9f9fa}
.list li[hidden]{display:none}
.list .app{--as:60px;--ring:transparent}
.list .tx{min-width:0}
.list b{display:block;font-size:var(--t-head);font-weight:var(--w-title);letter-spacing:-.015em}
.list b small{margin-left:8px;font-size:var(--t-tiny);font-weight:var(--w-title);letter-spacing:0;color:#86868b}
.list .tx>span{display:block;margin-top:3px;font-size:var(--t-body);letter-spacing:-.01em;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.more-wrap{display:flex;justify-content:center;margin-top:clamp(36px,3.6*var(--vw,1vw),60px)}
.more-wrap[hidden],.none-apps[hidden]{display:none}
.more-apps{height:var(--btn-h);padding:0 26px;border:0;font:inherit;font-size:var(--btn-font);cursor:pointer}
.none-apps{margin-top:28px;font-size:var(--t-body);color:var(--ink2)}
.said{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}


@media (max-width:1068px){.list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:734px){
  .find-head h2{max-width:none;text-wrap:wrap} /* a phone keeps its titles as they were */
  .open{min-height:0;overflow:visible} /* the icons' shadows are not cut */
  .floats{display:flex;flex-wrap:wrap;gap:12px;width:var(--col);margin:40px auto 0} /* on the left, under the button */
  .float{position:static;transform:none}
  .float.side{display:none}
  .float .app{--as:44px}
  .list{grid-template-columns:minmax(0,1fr);gap:12px}
}
@media (prefers-reduced-motion:reduce){.float{animation:none}}
"""

LIST_JS = """<script>
// Find an app: a kind shows its apps (All, every app), the search keeps the apps whose name, kind or line
// hold every word typed, and Load more shows the next %PAGE%. A card does nothing yet.
(() => {
  const tools = document.querySelector('.find-tools'), input = document.getElementById('app-search');
  const kinds = [...document.querySelectorAll('.kinds button')], items = [...document.querySelectorAll('.list > li')];
  const more = document.querySelector('.more-wrap'), none = document.querySelector('.none-apps'), said = document.querySelector('.said');
  const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  const PAGE = %PAGE%;
  let kind = 'all', shown = PAGE;
  const show = () => {
    const words = fold(input.value).split(/\\s+/).filter(Boolean);
    const fits = items.filter((li) => (kind === 'all' || li.dataset.kind === kind) && words.every((w) => li.dataset.q.includes(w)));
    for (const li of items) li.hidden = true;
    fits.slice(0, shown).forEach((li) => { li.hidden = false; });
    more.hidden = fits.length <= shown;
    none.hidden = fits.length > 0;
    said.textContent = fits.length === 1 ? '1 app' : fits.length + ' apps';
  };
  for (const k of kinds) k.addEventListener('click', () => {
    kind = k.dataset.kind; shown = PAGE;
    for (const x of kinds) x.setAttribute('aria-pressed', String(x === k));
    show();
  });
  input.addEventListener('input', () => { shown = PAGE; show(); });
  more.querySelector('button').addEventListener('click', () => { shown += PAGE; show(); });
  tools.hidden = false;
  show();
})();
</script>"""



def opening(assets, ctas):
    floats = "".join(
        f'<span class="float{" side" if side else ""}" style="--x:{x}%;--y:{y}%;--t:{t}s" aria-hidden="true">{assets.tile(cid)}</span>'
        for cid, x, y, t, side in FLOAT)
    return f"""<section class="hero open" aria-label="Connectors">
  <div class="wrap">
    <h1>Connect your favorite tools to your agents</h1>
    {ctas}
  </div>
  <div class="floats">{floats}</div>
</section>"""


def finder(apps, kinds, assets):
    cards = []
    for c in apps:
        soon = " <small>Coming soon</small>" if c["soon"] else ""
        q = esc(fold(" ".join((c["name"], c["kind"], c["line"]))))
        cards.append(f'<li data-kind="{slug(c["kind"])}" data-q="{q}">{assets.tile(c["id"])}'
                     f'<span class="tx"><b>{esc(c["name"])}{soon}</b><span title="{esc(c["line"])}">{esc(c["line"])}</span></span></li>')
    tabs = '<button type="button" data-kind="all" aria-pressed="true">All</button>' + "".join(
        f'<button type="button" data-kind="{slug(k)}" aria-pressed="false">{esc(k)}</button>' for k in kinds)
    return f"""<section class="find" id="apps" aria-labelledby="apps-title">
  <div class="wrap">
    <div class="find-head">
      <h2 id="apps-title">Find an app for your next task</h2>
      <div class="search find-tools" role="search" hidden><input type="search" id="app-search" placeholder="Search apps" aria-label="Search the apps" autocomplete="off" spellcheck="false">{SEARCH}</div>
    </div>
    <div class="kinds find-tools" role="group" aria-label="Kinds of app" hidden>{tabs}</div>
    <p class="said" aria-live="polite"></p>
    <ul class="list">
{chr(10).join(cards)}
    </ul>
    <p class="none-apps" hidden>No app matches that yet.</p>
    <div class="more-wrap" hidden><button class="btn more-apps" type="button">Load more</button></div>
  </div>
</section>"""




# Questions on connecting an app, each one what the apps do today (ConnectConsent.swift, the sign-in sheet;
# docs/services-agents.md, 7): how to connect, what agents reach, staying in charge, where it goes, Coming soon.
CONN_QA = [
    ("How do I connect an app?", "In Simeon on your Mac or iPhone, open Connect apps and choose the app, or say yes when an agent asks for one in the chat. You sign in once, and Simeon never sees your password. A few apps ask for a key from your account with them instead."),
    ("What can my agents do in an app?", "What your account there allows: your email in Gmail, your deals in HubSpot or your books in QuickBooks, for example. Before you sign in, Simeon shows what your agents will be able to read and use."),
    ("Will they act without asking me?", "Auto-review asks for your OK before steps it judges risky, and you can turn off any of an app's tools, or remove the app, in Settings › Connect apps. Agents can still get things wrong, so look over their work, especially at first."),
    ("Where does my information go?", "What your agents read in an app becomes part of your chats with them and is sent to the AI models that do the work. The app's own terms and privacy policy apply to what it shares with Simeon."),
    ("Does connecting apps cost extra?", "No. Connecting apps is part of every plan, the free month included. Some apps need an account of a certain kind, such as WhatsApp Business or an Instagram business or creator account."),
    ("What does Coming soon mean?", "The app can't be connected yet: its maker hasn't opened it to apps like Simeon, or Simeon is still setting up its sign-in with them. It changes to Connect once it can, with nothing for you to do."),
    ("What if my app isn't listed?", "Your agents can still use it on the web, in the browser on their own computer, once you sign in there by taking over. To ask for an app, write to support@simeonlabs.com."),
]


def build(out=OUT):
    teams.copy_site_css(out)
    apps, kinds = catalogue()
    root = os.path.join(out, "connectors")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    assets = Assets(root, "/connectors")
    hero_css, ctas = teams.home_hero()
    _, close, home_css = teams.from_home()
    body = opening(assets, ctas) + "\n" + finder(apps, kinds, assets) + "\n" + teams.questions(CONN_QA) + "\n" + close
    page = frame("Connectors", f"Connect Gmail, Slack, Notion and {len(apps) - 3} more apps to your Simeon agents.", "/connectors",
                 body, hero_css + CONN_CSS + home_css, current="connectors", script=LIST_JS.replace("%PAGE%", str(PAGE)))
    open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page, out))
    letters = sorted(k for k, how in assets.drawn.items() if how == "letter")
    print(f"connectors page written to {os.path.abspath(root)}: {len(apps)} app(s)")
    if letters:
        print("  apps drawn as a letter (no logo yet):", ", ".join(letters))


if __name__ == "__main__":
    build()
