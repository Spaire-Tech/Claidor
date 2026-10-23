"""Builds the website's Connectors page (/connectors) from the apps' connector catalogue.

Laid out after the founder's reference (23 October 2026): an opening with famous
apps' icons around a centred headline; "Find an app for your next task", every
connector as a card (its icon, its name, what it does), the most famous first,
with the catalogue's kinds as tabs, a search and Load more; then "Connect an app
in a few clicks", three steps beside the Mac app drawn at each one. A card does
nothing yet (the founder: "this will need a lot more of designing").

The connectors are the apps' own list (desktop/source/shared/node/vendor-mcp/
catalog.ts): their names, kinds and lines, the retired places left out. The
icons are the Teams pages' (teams.py's `Assets`), copied to public/connectors/apps/.
It rewrites public/connectors/ from scratch; build.py calls it after teams.py,
and it runs alone too, needing nothing but Python:

    python3 connectors.py
"""
import os, re, shutil, sys, unicodedata

import teams
from teams import CATALOG, Assets, esc, frame

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
# The icons around the opening's headline, where the reference has its own: (connector, centre across %,
# centre down %, seconds of its slow drift). `side` ones sit beside the words and stay off a phone.
FLOAT = [
    ("canva", 32, 13, 7.0, False), ("slack", 11, 24, 8.5, False), ("notion", -1, 41, 7.5, True),
    ("figma", 10, 59, 9.0, True), ("gmail", 20, 82, 7.8, False), ("google-drive", 40, 89, 8.2, False),
    ("hubspot", 70, 85, 7.2, False), ("outlook", 89, 57, 8.8, True), ("salesforce", 98, 33, 7.6, True),
    ("zoom", 98, 70, 8.4, True), ("github", 82, 17, 9.4, False),
]
# The Mac app drawn beside the steps: the home page's agents in its sidebar.
AGENTS = [("clay-simeon", "Simeon", "Chief of Staff"), ("clay-30", "Theo", "Bookkeeping"),
          ("clay-01", "Iris", "Customer support"), ("clay-05", "Scout", "Customer research")]
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


DOWN = '<svg class="dl" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14m-6-6 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

CONN_CSS = """
/* The opening: famous apps' icons drifting around a centred headline, as in the founder's reference. */
.open{position:relative;height:clamp(600px,50vw,960px);overflow:hidden}
.open .words{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 var(--gutter);text-align:center}
.open .eyebrow{font-size:clamp(15px,1vw,18px);font-weight:500;color:var(--ink)}
.open h1{margin-top:14px;max-width:13em;font-family:var(--serif);font-weight:400;font-size:clamp(34px,3.2vw,64px);line-height:1.08;letter-spacing:-.02em;text-wrap:balance} /* the home page's closing title */
.open p{margin-top:16px;max-width:27em;font-size:clamp(16px,1.1vw,20px);line-height:1.5;letter-spacing:-.01em;color:#424245;text-wrap:balance}
.open .ctas{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin-top:clamp(22px,2vw,34px)}
.open .btn{height:clamp(40px,2.5vw,50px);padding:0 clamp(18px,1.3vw,26px);font-size:clamp(15px,.95vw,19px)} /* the home page's buttons */
.open .btn .dl{width:1em;height:1em;margin:0 -.15em 0 .4em;flex:none}
.btn.ghost{background:#f2f2f2;color:#000}
.btn.ghost:hover{background:#e8e8e8}
.float{position:absolute;left:var(--x);top:var(--y);transform:translate(-50%,-50%);animation:drift var(--t) ease-in-out infinite alternate}
.float .app{--as:clamp(64px,6.6vw,124px);--ring:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.05),0 18px 40px -16px rgba(0,0,0,.22)}
@keyframes drift{from{translate:0 -7px}to{translate:0 7px}}

/* Find an app: the title and the search, the kinds as words (the chosen one black), the apps as cards. */
.find{padding:clamp(48px,5vw,100px) 0 0}
.find-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px 40px}
.find-head h2{font-family:var(--serif);font-weight:400;font-size:clamp(28px,2.2vw,44px);line-height:1.08;letter-spacing:-.02em} /* the home page's section titles */
.search{position:relative;flex:1;max-width:620px;min-width:min(100%,280px)}
.search input{display:block;width:100%;height:48px;padding:0 50px 0 22px;border:1px solid #e3e3e8;border-radius:99px;background:var(--page);color:var(--ink);font:inherit;font-size:16px;letter-spacing:-.01em;outline:none;-webkit-appearance:none;appearance:none;transition:border-color .2s,box-shadow .2s}
.search input:focus{border-color:#c7c7cc;box-shadow:0 4px 14px rgba(0,0,0,.05)} /* no blue ring */
.search input::placeholder{color:#86868b;opacity:1}
.search input::-webkit-search-decoration,.search input::-webkit-search-cancel-button{-webkit-appearance:none}
.search svg{position:absolute;right:20px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:#1d1d1f;pointer-events:none}
.kinds{display:flex;gap:clamp(20px,2vw,34px);margin-top:clamp(24px,2.4vw,40px);overflow-x:auto;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 56px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 56px),transparent)}
.kinds::-webkit-scrollbar{display:none}
.kinds button{flex:none;padding:6px 0;border:0;background:none;color:#86868b;font:inherit;font-size:clamp(16px,1.1vw,20px);letter-spacing:-.01em;white-space:nowrap;cursor:pointer;transition:color .15s}
.kinds button:hover,.kinds button[aria-pressed="true"]{color:var(--ink)}
.kinds button:last-child{margin-right:56px}
.kinds button:focus-visible,.more-apps:focus-visible,.step:focus-visible{outline:2px solid #1d1d1f;outline-offset:3px;border-radius:6px}
.list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:clamp(28px,2.8vw,52px) 0 0;padding:0;list-style:none}
.list li{display:flex;align-items:center;gap:18px;min-width:0;padding:16px 18px;border-radius:24px;background:#f9f9fa}
.list li[hidden]{display:none}
.list .app{--as:60px;--ring:transparent}
.list .tx{min-width:0}
.list b{display:block;font-size:clamp(17px,1.15vw,21px);font-weight:500;letter-spacing:-.015em}
.list b small{margin-left:8px;font-size:12px;font-weight:500;letter-spacing:0;color:#86868b}
.list .tx>span{display:block;margin-top:3px;font-size:clamp(14px,.95vw,17px);letter-spacing:-.01em;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.more-wrap{display:flex;justify-content:center;margin-top:clamp(36px,3.6vw,60px)}
.more-wrap[hidden],.none-apps[hidden]{display:none}
.more-apps{height:46px;padding:0 26px;border:0;font:inherit;font-size:15px;cursor:pointer}
.none-apps{margin-top:28px;font-size:16px;color:var(--ink2)}
.said{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Connect an app in a few clicks: three steps, the chosen one black with a line filling under it, beside the
   Mac app at that step (a painting behind it, as on the home page's cards). */
.how{padding:clamp(110px,10vw,190px) 0 clamp(90px,8vw,150px)}
.how h2{text-align:center;font-family:var(--serif);font-weight:400;font-size:clamp(34px,3.2vw,64px);line-height:1.08;letter-spacing:-.02em}
.how-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(32px,5vw,96px);align-items:center;margin-top:clamp(40px,4vw,72px)}
.steps{margin:0;padding:0;list-style:none}
.step{position:relative;display:block;width:100%;padding:26px 0 24px;border:0;border-bottom:1px solid #e5e5ea;background:none;color:var(--ink2);font:inherit;text-align:left;cursor:pointer}
.step .n{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#aeaeb2;color:#fff;font-size:14px;transition:background .3s}
.step b{display:block;margin-top:14px;font-size:clamp(18px,1.3vw,23px);font-weight:500;letter-spacing:-.015em;transition:color .3s}
.step .d{display:block;margin-top:8px;max-width:32em;font-size:clamp(15px,1vw,18px);line-height:1.5;letter-spacing:-.01em}
.step[aria-current="step"] .n{background:#1d1d1f}
.step[aria-current="step"] b{color:var(--ink)}
.step[aria-current="step"] .d{color:#424245}
.step .fill{position:absolute;left:0;right:0;bottom:-1px;height:2px;overflow:hidden}
.step .fill i{display:block;width:0;height:100%;background:#1d1d1f}
.step[aria-current="step"] .fill i{animation:fill 6s linear forwards}
.how.paused .step .fill i{animation-play-state:paused}
@keyframes fill{to{width:100%}}
.scene{position:relative;aspect-ratio:760 / 640;max-width:100%;border-radius:28px;overflow:hidden;background:#c9dcf0 url(/img/paint-blue.jpg) center/cover;container-type:inline-size}
.win{position:absolute;left:10%;top:8%;width:104%;height:100%;display:grid;grid-template-columns:32cqw minmax(0,1fr);border-radius:2.4cqw;background:#fff;box-shadow:0 2cqw 6cqw -2cqw rgba(0,0,0,.4);overflow:hidden;font-size:2cqw;letter-spacing:-.01em;color:#1d1d1f}
.win .side{display:flex;flex-direction:column;gap:.6cqw;padding:2.4cqw 1.8cqw;background:#f5f5f7;border-right:.12cqw solid #e5e5ea}
.win .lights{display:flex;gap:.9cqw;margin:0 0 2.2cqw .6cqw}
.win .lights i{width:1.5cqw;height:1.5cqw;border-radius:50%;background:#ff5f57}
.win .lights i+i{background:#febc2e}
.win .lights i+i+i{background:#28c840}
.win .ag{display:flex;align-items:center;gap:1.4cqw;padding:1.1cqw 1.2cqw;border-radius:1.6cqw;transition:background .4s}
.win .ag img{width:4.4cqw;height:4.4cqw;border-radius:50%;object-fit:cover}
.win .ag b{display:block;font-size:1.9cqw;font-weight:500}
.win .ag small{display:block;font-size:1.5cqw;color:#86868b}
.win .apps-row{display:flex;align-items:center;gap:1cqw;margin-top:auto;margin-bottom:9cqw;padding:1.2cqw;border-radius:1.6cqw;font-size:1.7cqw;color:#255a93;transition:background .4s}
.win .apps-row .app{--as:2.4cqw;--ring:#f5f5f7}
.win .main{position:relative;overflow:hidden}
.win .v1{padding:4cqw 4.4cqw}
.win h3{font-size:4.2cqw;font-weight:500;letter-spacing:-.02em}
.win .v1>p{margin-top:.8cqw;font-size:1.9cqw;color:#6e6e73}
.win .field{display:flex;align-items:center;gap:1.2cqw;height:5cqw;margin-top:2.6cqw;padding:0 1.6cqw;border:.15cqw solid #e5e5ea;border-radius:1.6cqw;font-size:1.8cqw;color:#86868b}
.win .field svg{width:2cqw;height:2cqw}
.win .label{margin-top:3.4cqw;font-size:1.9cqw;font-weight:500}
.win .row{display:flex;align-items:center;gap:1.8cqw;padding:1.6cqw 0;border-bottom:.12cqw solid #f0f0f2}
.win .row .app{--as:5.4cqw;--ring:transparent}
.win .row b{display:block;font-size:2cqw;font-weight:500}
.win .row small{display:block;margin-top:.2cqw;font-size:1.6cqw;color:#86868b}
.win .row .plus{display:grid;place-items:center;flex:none;width:3.6cqw;height:3.6cqw;margin-left:auto;margin-right:6cqw;border-radius:50%;background:#f2f2f4;transition:background .4s,color .4s}
.win .row .plus svg{width:1.8cqw;height:1.8cqw}
.win .v2,.win .v3{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .45s,visibility .45s}
.win .v2{display:grid;place-items:center;padding-right:14cqw;background:rgba(0,0,0,.28)}
.win .card{width:34cqw;padding:3.2cqw;border-radius:2.4cqw;background:#fff;box-shadow:0 2cqw 5cqw -1.6cqw rgba(0,0,0,.4)}
.win .card .app{--as:6cqw;--ring:transparent}
.win .card h4{margin-top:1.8cqw;font-size:2.6cqw;font-weight:500;letter-spacing:-.02em}
.win .card ul{margin:1.6cqw 0 0;padding:0;list-style:none;display:grid;gap:1cqw;font-size:1.7cqw;color:#424245}
.win .card li{display:flex;gap:1cqw;align-items:flex-start}
.win .card li svg{flex:none;width:1.9cqw;height:1.9cqw;margin-top:.1cqw;color:#1d1d1f}
.win .card .go{display:flex;gap:1.2cqw;margin-top:2.6cqw}
.win .card .go span{display:grid;place-items:center;height:4.4cqw;padding:0 2.4cqw;border-radius:99px;background:#f2f2f4;font-size:1.7cqw}
.win .card .go span+span{background:#1d1d1f;color:#fff}
.win .v3{display:flex;flex-direction:column;padding:3.4cqw 4.4cqw 3.4cqw 4.4cqw;background:#fff}
.win .who{display:flex;align-items:center;gap:1.4cqw;padding-bottom:2.2cqw;border-bottom:.12cqw solid #f0f0f2}
.win .who img{width:4.6cqw;height:4.6cqw;border-radius:50%;object-fit:cover}
.win .who b{display:block;font-size:2cqw;font-weight:500}
.win .who small{display:block;font-size:1.6cqw;color:#86868b}
.win .msg{max-width:62%;margin-top:2.4cqw;padding:1.6cqw 2.2cqw;border-radius:2.6cqw;font-size:1.85cqw;line-height:1.4}
.win .msg.me{align-self:flex-end;margin-right:15cqw;background:#255a93;color:#fff}
.win .msg.it{align-self:flex-start;background:#e9e9eb}
.win .chip{display:inline-flex;align-items:center;gap:.6cqw;padding:.1cqw .8cqw .1cqw .3cqw;border-radius:99px;background:#fff;vertical-align:-.3cqw;font-weight:500}
.win .chip .app{--as:2.2cqw;--ring:transparent}
.win .ask{display:flex;align-items:center;gap:1.2cqw;align-self:flex-start;margin-top:1.8cqw;padding:1.4cqw 1.6cqw 1.4cqw 2.2cqw;border:.15cqw solid #e5e5ea;border-radius:2.4cqw;font-size:1.8cqw}
.win .ask span{display:grid;place-items:center;height:3.8cqw;padding:0 2cqw;border-radius:99px;background:#f2f2f4;font-size:1.6cqw}
.win .ask span:last-child{background:#1d1d1f;color:#fff}
.scene[data-step="0"] .apps-row,.scene[data-step="1"] .apps-row{background:#e8e8ed}
.scene[data-step="0"] .row:first-of-type .plus{background:#1d1d1f;color:#fff}
.scene[data-step="1"] .v2,.scene[data-step="2"] .v3{opacity:1;visibility:visible}
.scene[data-step="2"] .ag.on{background:#e8e8ed}

@media (max-width:1068px){.list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:734px){
  .open{height:640px}
  .float.side{display:none}
  .float .app{--as:58px}
  .list{grid-template-columns:minmax(0,1fr);gap:12px}
  .how-grid{grid-template-columns:minmax(0,1fr)}
  .scene{order:-1} /* the app above the steps, so a tap shows its step */
}
@media (prefers-reduced-motion:reduce){.float{animation:none}.step .fill i{animation:none!important}.win .v2,.win .v3,.win .ag,.win .apps-row{transition:none}}
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

STEPS_JS = """<script>
// The steps: each shows the Mac app at that step and hands on to the next when its line has filled (6 s,
// paused while the section is out of sight); a click shows a step at once.
(() => {
  const how = document.querySelector('.how'), scene = how.querySelector('.scene'), steps = [...how.querySelectorAll('.step')];
  const pick = (i) => { steps.forEach((s, j) => s.setAttribute('aria-current', j === i ? 'step' : 'false')); scene.dataset.step = String(i); };
  steps.forEach((s, i) => {
    s.addEventListener('click', () => pick(i));
    s.querySelector('.fill i').addEventListener('animationend', () => pick((i + 1) % steps.length));
  });
  new IntersectionObserver(([e]) => how.classList.toggle('paused', !e.isIntersecting)).observe(how);
})();
</script>"""


def opening(assets):
    floats = "".join(
        f'<span class="float{" side" if side else ""}" style="--x:{x}%;--y:{y}%;--t:{t}s" aria-hidden="true">{assets.tile(cid)}</span>'
        for cid, x, y, t, side in FLOAT)
    return f"""<section class="open" aria-label="Connectors">
  {floats}
  <div class="words">
    <p class="eyebrow">Simeon Connectors</p>
    <h1>Connect your favorite tools to your agents</h1>
    <p>Connect the apps you already use, and your agents do the work right inside them.</p>
    <div class="ctas"><a class="btn" href="#apps">Explore connectors{DOWN}</a><a class="btn ghost" href="/#app">Request a demo</a></div>
  </div>
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


def steps(assets):
    face = lambda f: f'<img src="/faces/{f}.webp" alt="" width="96" height="96">'
    agents = "".join(f'<div class="ag{" on" if name == "Iris" else ""}">{face(f)}<span><b>{name}</b><small>{job}</small></span></div>'
                     for f, name, job in AGENTS)
    rows = "".join(f'<div class="row">{assets.tile(cid)}<span><b>{name}</b><small>{line}</small></span><span class="plus">{PLUS}</span></div>'
                   for cid, name, line in (("gmail", "Gmail", "Search, read and draft email"), ("slack", "Slack", "Read and send messages"),
                                           ("google-calendar", "Google Calendar", "Find time and book meetings"), ("notion", "Notion", "Read and write pages")))
    told = [("Find an app", "Browse the apps your agents can work in, or search for one by name."),
            ("Connect it", "See what the agents can do there, then sign in once, on the app's own page."),
            ("Put it to work", "Ask an agent in plain words. It works in the app and asks before it sends, posts or pays.")]
    items = "".join(f'<li><button class="step" type="button" aria-current="{"step" if i == 0 else "false"}"><span class="n">{i + 1}</span>'
                    f'<b>{esc(t)}</b><span class="d">{esc(d)}</span><span class="fill"><i></i></span></button></li>' for i, (t, d) in enumerate(told))
    gmail = assets.tile("gmail")
    return f"""<section class="how" aria-labelledby="how-title">
  <div class="wrap">
    <h2 id="how-title">Connect an app in a few clicks</h2>
    <div class="how-grid">
      <ol class="steps">{items}</ol>
      <div class="scene" data-step="0" aria-hidden="true">
        <div class="win">
          <div class="side"><div class="lights"><i></i><i></i><i></i></div>{agents}<div class="apps-row">{"".join(assets.tile(a) for a in ("gmail", "slack", "notion"))}Connect apps</div></div>
          <div class="main">
            <div class="v1"><h3>Connectors</h3><p>Your agents work in the apps you connect.</p><div class="field">{SEARCH}Search apps</div><p class="label">Popular</p>{rows}</div>
            <div class="v2"><div class="card">{gmail}<h4>Connect Gmail</h4><ul><li>{CHECK}Search and read your email</li><li>{CHECK}Draft replies for you to check</li><li>{CHECK}Send only when you say so</li></ul><div class="go"><span>Not now</span><span>Continue</span></div></div></div>
            <div class="v3"><div class="who">{face("clay-01")}<span><b>Iris</b><small>Customer support</small></span></div>
              <p class="msg me">Answer this morning's customer emails.</p>
              <p class="msg it">Done. Four replies are drafted in <span class="chip">{gmail}Gmail</span></p>
              <div class="ask">Send the four replies?<span>Not now</span><span>Allow</span></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>"""


def build(out=OUT):
    apps, kinds = catalogue()
    root = os.path.join(out, "connectors")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    assets = Assets(root, "/connectors")
    body = opening(assets) + "\n" + finder(apps, kinds, assets) + "\n" + steps(assets)
    page = frame("Connectors", f"Connect Gmail, Slack, Notion and {len(apps) - 3} more apps to your Simeon agents.", "/connectors",
                 body, CONN_CSS, current="connectors", script=LIST_JS.replace("%PAGE%", str(PAGE)) + STEPS_JS)
    open(f"{root}/index.html", "w", encoding="utf-8").write(page)
    letters = sorted(k for k, how in assets.drawn.items() if how == "letter")
    print(f"connectors page written to {os.path.abspath(root)}: {len(apps)} app(s)")
    if letters:
        print("  apps drawn as a letter (no logo yet):", ", ".join(letters))


if __name__ == "__main__":
    build()
