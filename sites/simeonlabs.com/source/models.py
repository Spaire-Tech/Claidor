"""Builds the website's AI models pages (/models, and /models/<id> for each), after the Connectors pages.

The founder, 10 November 2026: "we need pages like the connectors and explain each how to connect them. following
the connectors style as well. and well designing it to separate keys and subs", in few words, none obvious.

/models is the Connectors page's layout (connectors.py): the opening with the providers' marks drifting beside its
headline; Subscriptions (ChatGPT, Claude, Grok: a plan the person already pays for) and API keys (every provider the
server takes a key for) as two lists of cards; questions; the home page's closing call. Each provider's page is a
connector's page (connector_pages.py): the mark, the name, its kind, one line, the home page's buttons, and the steps
to connect it on the blue picture where a connector's page has its messages; then Information.

Nothing here is written twice: the key providers, their key pages, the details they need and their models are the
server's (server/simeon/desktop/key_providers.py), the plans' models too (own_models.py), read here; the steps are
the apps' own words (Settings › AI Models: mac/Simeon/SettingsModels.swift, ConnectConsent.swift). The logos are
the providers' own, full, as the apps draw them (Providers/<id>, from LobeHub's icons: MIT, NOTICE), as
img/provider-<id>.png (the founder, 10 November 2026: "use the real logo. no white background"). The lists' heads
are the site's sections': the title on the left, its line on the right. It rewrites public/models/ from scratch; build.py calls it
after connectors.py, and it runs alone too, needing nothing but Python:

    python3 models.py
"""
import ast, html, os, re, shutil, sys

import connector_pages
import connectors
import teams
from teams import CHEVRON, REPO, esc, frame
from versioning import version_style

OUT = teams.OUT
KEYS = f"{REPO}/server/simeon/desktop/key_providers.py"
PLANS = f"{REPO}/server/simeon/desktop/own_models.py"
MARKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")

# The subscriptions, as the apps list them under Subscriptions: the plans each takes (the apps' words: the keys'
# hints and Grok's barred plan), its maker's site, and how it signs in (a code shown, or Claude's own page).
SUBS = (
    {"id": "chatgpt", "name": "ChatGPT", "plans": "ChatGPT Plus or Pro", "site": "https://chatgpt.com", "mark": "chatgpt",
     "models": "CHATGPT_MODELS", "sign_in": "code"},
    {"id": "claude", "name": "Claude", "plans": "Claude Pro or Max", "site": "https://claude.ai", "mark": "claude",
     "models": "CLAUDE_MODELS", "sign_in": "claude"},
    {"id": "grok", "name": "Grok", "plans": "SuperGrok or X Premium+", "site": "https://grok.com", "mark": "grok",
     "models": "GROK_MODELS", "sign_in": "code"},
)
# A key provider's plan, where it has one: its line points there (the apps' hint, "Claude Pro or Max? Connect Claude
# under Subscriptions.").
PLAN_OF = {"anthropic": "claude", "openai": "chatgpt", "xai": "grok"}
# A key provider whose logo is another's (img/provider-<id>.png); none today.
MARK_OF = {}
# The marks drifting beside the opening's headline: (mark, across %, down %, seconds); `side` ones stay off a phone.
FLOAT = [
    ("claude", 56, 28, 7.0, False), ("chatgpt", 67, 12, 8.5, False), ("google", 81, 26, 9.4, False),
    ("mistral", 95, 13, 7.6, True), ("deepseek", 61, 66, 7.8, False), ("grok", 75, 54, 9.0, True),
    ("huggingface", 90, 49, 7.2, False), ("qwen", 72, 82, 8.2, False), ("moonshot", 87, 78, 8.8, True),
    ("meta", 99, 74, 7.5, True),
]
# The details a provider needs besides its key, as the apps name them (AIModels.keyFieldName).
FIELD_NAMES = {"endpoint": "endpoint", "deployments": "deployments' names, separated by commas", "account_id": "account ID",
               "region": "region"}
# Their names in Information (AIModels.keyFieldName).
FIELD_TITLES = {"endpoint": "Endpoint", "deployments": "Deployments", "account_id": "Account ID", "region": "Region"}


# The server's providers and plans

def _calls(tree, name):
    """The calls to `name` in an expression, in order."""
    return [n for n in ast.walk(tree) if isinstance(n, ast.Call) and getattr(n.func, "id", None) == name]


def _text(node):
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


def key_providers():
    """Every key provider, in the server's order: id, name, key page, available, fields, models."""
    tree = ast.parse(teams._text(KEYS))
    table = next((n.value for n in tree.body if isinstance(n, ast.AnnAssign) and getattr(n.target, "id", "") == "PROVIDERS"), None)
    found = []
    for call in (table.elts if isinstance(table, ast.Tuple) else []):
        args = [_text(a) for a in call.args]
        kw = {k.arg: k.value for k in call.keywords}
        fields = []
        if "fields" in kw:
            for f in _calls(kw["fields"], "KeyField"):
                default = next((_text(k.value) for k in f.keywords if k.arg == "default"), None)
                fields.append({"key": _text(f.args[0]), "placeholder": _text(f.args[1]), "default": default})
        models = [_text(m.args[1]) for m in _calls(kw["known"], "KnownModel")] if "known" in kw else []
        available = not (isinstance(kw.get("available"), ast.Constant) and kw["available"].value is False)
        found.append({"id": args[0], "name": args[1], "page": args[4], "available": available, "fields": fields, "models": models})
    if len(found) < 20 or not all(p["id"] and p["name"] and p["page"] for p in found):
        sys.exit(f"models.py: {len(found)} key providers read whole from {os.path.relpath(KEYS)}")
    return found


def plan_models():
    """Each plan's models, best first, by its list's name in own_models.py (CHATGPT_MODELS…)."""
    tree = ast.parse(teams._text(PLANS))
    out = {}
    for n in tree.body:
        if isinstance(n, ast.AnnAssign) and getattr(n.target, "id", "").endswith("_MODELS"):
            out[n.target.id] = [_text(c.args[2]) for c in _calls(n.value, "OwnModel")]
    for sub in SUBS:
        if not out.get(sub["models"]):
            sys.exit(f"models.py: no models read for {sub['name']} ({sub['models']}) from {os.path.relpath(PLANS)}")
    return out


# The pieces

def mark(key):
    """A provider's own logo, full, as the apps draw it under Settings › AI Models (Providers/<id>)."""
    src = f"{MARKS}/provider-{key}.png"
    if not os.path.isfile(src):
        sys.exit(f"models.py: no logo img/provider-{key}.png")
    return f'<span class="app icon"><img src="/img/provider-{key}.png?v={teams._version(src)}" alt="" loading="lazy"></span>'


def link(url):
    return f'<a href="{html.escape(url)}" rel="noopener">{html.escape(connector_pages.shown(url))}{connector_pages.OUT_ARROW}</a>'


def models_line(models, more=3):
    """A list of models, the first few named, the rest counted."""
    if not models:
        return "The models on your account"
    shown = ", ".join(models[:more])
    return shown + (f" and {len(models) - more} more" if len(models) > more else "")


def card(href, tile, name, line, soon=False):
    tag = " <small>Coming soon</small>" if soon else ""
    return (f'<li><a href="{href}">{tile}<span class="tx"><b>{esc(name)}{tag}</b>'
            f'<span title="{esc(line)}">{esc(line)}</span></span></a></li>')


# /models

PAGE_CSS = """
/* Two lists, as Find an app's: each with its title and one line; the plans' three cards, then the keys'. */
.kind{padding:clamp(56px,5.6*var(--vw,1vw),110px) 0 0}
.kind .list{margin-top:clamp(28px,2.8*var(--vw,1vw),52px)}
"""


def opening(ctas):
    floats = "".join(f'<span class="float{" side" if side else ""}" style="--x:{x}%;--y:{y}%;--t:{t}s" aria-hidden="true">{mark(key)}</span>'
                     for key, x, y, t, side in FLOAT)
    return f"""<section class="hero open" aria-label="AI models">
  <div class="wrap">
    <h1>Connect your own AI models to your agents</h1>
    {ctas}
  </div>
  <div class="floats">{floats}</div>
</section>"""


def lists(keys):
    subs = "".join(card(f"/models/{s['id']}/", mark(s["mark"]), s["name"], s["plans"]) for s in SUBS)
    rows = "".join(card(f"/models/{p['id']}/", mark(MARK_OF.get(p["id"], p["id"])), p["name"],
                        models_line(p["models"]) if p["available"] else "Can't be connected yet", not p["available"])
                   for p in keys)
    return f"""<section class="kind" id="subscriptions" aria-labelledby="subs-title">
  <div class="wrap">
    <div class="trust-top"><h2 id="subs-title">Subscriptions</h2><p>Use a plan you already pay for.</p></div>
    <ul class="list">{subs}</ul>
  </div>
</section>
<section class="kind" id="keys" aria-labelledby="keys-title">
  <div class="wrap">
    <div class="trust-top"><h2 id="keys-title">API keys</h2><p>Each provider bills the calls on your key.</p></div>
    <ul class="list">{rows}</ul>
  </div>
</section>"""


# Questions, each answered from what the apps do (ConnectConsent.swift's plan and key pages, SettingsModels.swift).
QA = [
    ("Subscription or API key?", "A subscription is a monthly plan you already have, such as ChatGPT Plus. Your agents use it within its limits. An API key is billed by its provider for each call, at its own prices."),
    ("Where do I connect one?", "In Simeon, open Settings › AI Models. Plans are under Subscriptions, keys under API keys."),
    ("How do I choose the model?", "In the message field. You can go back to Simeon's models anytime."),
    ("What happens when my plan runs out?", "Your agents use Simeon's models until it resets."),
    ("What still uses my Simeon credits?", "Voice calls, dictation and video."),
    ("Where is my key kept?", "Encrypted on Simeon's server, and sent only to its provider. Your agents never see it."),
    ("How do I disconnect?", "In Settings › AI Models. Your agents stop using that account, and you can connect it again anytime."),
    ("What does Coming soon mean?", "GitHub Copilot and Meta can't be connected yet."),
]


# /models/<id>

GUIDE_CSS = """
/* The models available, where a connector's page has its messages: on the site's grey, a row each. */
.avail{align-self:stretch;display:flex;flex-direction:column;justify-content:center;min-height:clamp(260px,22*var(--vw,1vw),400px);padding:clamp(24px,2.6*var(--vw,1vw),48px);border-radius:clamp(22px,1.8*var(--vw,1vw),30px);background:var(--soft)}
.avail h2{font-size:var(--t-small);font-weight:var(--w-title);letter-spacing:0;color:#86868b}
.avail ul{margin:12px 0 0;padding:0;list-style:none}
.avail li{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #e3e3e8;font-size:var(--t-head);letter-spacing:-.015em}
.avail li:first-child{border-top:0}
.avail li img{width:24px;height:24px;border-radius:6px}
.avail p{margin-top:12px;font-size:var(--t-body);letter-spacing:-.01em;color:var(--ink2)}
.conn-head .note{margin-top:12px;max-width:34em;font-size:var(--t-body);letter-spacing:-.01em;color:var(--ink2)}
.conn-head .note a,.guide a{color:var(--blue);text-decoration:none}
.conn-head .note a:hover,.guide a:hover{text-decoration:underline}
/* How to connect: the site's section head (the title left, what you need right), then its two parts side by side. */
.guide{margin-top:clamp(56px,5*var(--vw,1vw),96px)}
.g-parts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:clamp(28px,2.8*var(--vw,1vw),48px)}
.g-part{padding:clamp(24px,2.6*var(--vw,1vw),44px);border-radius:28px;background:#fafafb}
.g-part h3{display:flex;align-items:center;gap:12px;font-size:var(--t-head);font-weight:var(--w-title);letter-spacing:-.015em}
.g-part h3 i{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--ink);color:#fff;font-size:14px;font-style:normal;font-weight:600;letter-spacing:0}
.g-part ol{margin:20px 0 0;padding:0;list-style:none;counter-reset:s}
.g-part li{position:relative;padding:12px 0 12px 34px;border-top:1px solid #ececf0;font-size:var(--t-body);line-height:1.45;letter-spacing:-.01em;counter-increment:s}
.g-part li:first-child{border-top:0}
.g-part li::before{content:counter(s) ".";position:absolute;left:2px;top:12px;color:#86868b;font-variant-numeric:tabular-nums}
.g-part .extra{margin-top:14px;font-size:var(--t-small);line-height:1.45;color:var(--ink2)}
.g-part .open-page{display:inline-flex;align-items:center;gap:4px;margin-top:18px;font-size:var(--t-body)}
.g-part .open-page svg{width:.7em;height:.7em}
.info dd.wrap-dd{white-space:normal}
@media (max-width:860px){.g-parts{grid-template-columns:minmax(0,1fr);gap:14px}}
"""
OPEN = "In Simeon, open Settings › AI Models."
# Each one's guide to getting its key or plan, researched on the provider's own pages (model_guides.json: what the
# person needs first, the steps, anything else the key needs, the sources read and when).
GUIDES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_guides.json")


def guides():
    import json
    return json.load(open(GUIDES, encoding="utf-8"))["guides"] if os.path.isfile(GUIDES) else {}


def sub_steps(sub):
    name = esc(sub["name"])
    steps = [OPEN, f"Under Subscriptions, choose Connect next to {name}."]
    if sub["sign_in"] == "claude":
        steps += ["Open Claude's page and approve.", "Paste the code Claude shows."]
    else:
        steps += [f"Copy the code Simeon shows. Open {name}'s page, enter it and approve."]
    return steps + [f"Choose a {name} model in the message field."]


def key_steps(p):
    name = esc(p["name"])
    paste = f"Under API keys, choose Connect next to {name} and paste the key."
    details = [f["key"] for f in p["fields"]]
    if details:
        said = [("your " + FIELD_NAMES.get(k, k)) for k in details]
        region = next((f["default"] for f in p["fields"] if f["key"] == "region" and f["default"]), None)
        if region:
            said = [x + f" ({region} unless yours differs)" if x == "your region" else x for x in said]
        paste += " Then enter " + " and ".join(said) + "."
    return [OPEN, paste, f"Simeon checks the key with {name}. Its models then appear in the message field."]


def information(rows):
    cells = "".join(f'<div><dt>{term}</dt><dd{" class=" + chr(34) + "wrap-dd" + chr(34) if wrap else ""}>{value}</dd></div>'
                    for term, value, wrap in rows)
    return f"""<section class="info" aria-labelledby="info-title">
    <h2 id="info-title">Information</h2>
    <dl>{cells}</dl>
  </section>"""


def available(models, logo, soon=False):
    """The models it gives, on the site's grey."""
    if soon:
        rows, said = "", "<p>Coming soon to Settings › AI Models.</p>"
    elif models:
        rows, said = "<ul>" + "".join(f"<li>{logo}{esc(m)}</li>" for m in models) + "</ul>", ""
    else:
        rows, said = "", "<p>The models on your account. Simeon reads them when you connect your key.</p>"
    return f'<div class="avail"><h2>Models</h2>{rows}{said}</div>'


def guide(name, need, first_title, first_steps, extra, page, simeon_steps):
    """How to connect: getting the key (or the plan) at the provider, then connecting it in Simeon."""
    first = "".join(f"<li>{x}</li>" for x in first_steps)
    second = "".join(f"<li>{x}</li>" for x in simeon_steps)
    extra_html = f'<p class="extra">{extra}</p>' if extra else ""
    open_page = (f'<a class="open-page" href="{html.escape(page)}" rel="noopener">Open {esc(name)}\'s page'
                 f'{connector_pages.OUT_ARROW}</a>') if page else ""
    need_html = f"<p>{need}</p>" if need else ""
    return f"""<section class="guide" aria-labelledby="guide-title">
    <div class="trust-top"><h2 id="guide-title">How to connect {esc(name)}</h2>{need_html}</div>
    <div class="g-parts">
      <div class="g-part"><h3><i>1</i>{first_title}</h3><ol>{first}</ol>{extra_html}{open_page}</div>
      <div class="g-part"><h3><i>2</i>Connect it in Simeon</h3><ol>{second}</ol></div>
    </div>
  </section>"""


def page_body(pid, tile, name, by, about, note, side, how, info, ctas, close):
    return f"""<section class="conn-page" aria-labelledby="{pid}-title"><div class="wrap">
  <a class="back" href="/models">{CHEVRON}All models</a>
  <div class="conn-top">
    <div class="conn-head">
      {tile}
      <h1 id="{pid}-title">{esc(name)}</h1>
      <p class="by">{by}</p>
      <p class="about">{about}</p>
      {note}
      {ctas}
    </div>
    {side}
  </div>
  {how}
</div></section>

{close}"""


def small_logo(key):
    src = f"{MARKS}/provider-{key}.png"
    return f'<img src="/img/provider-{key}.png?v={teams._version(src)}" alt="">'


def build(out=OUT):
    teams.copy_site_css(out)
    keys, plans = key_providers(), plan_models()
    root = os.path.join(out, "models")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    hero_css, ctas = teams.home_hero()
    _, close, home_css = teams.from_home()
    body = opening(ctas) + "\n" + lists(keys) + "\n" + teams.questions(QA) + "\n" + close
    page = frame("AI models", f"Connect your ChatGPT, Claude or Grok plan, or an API key from {len(keys)} providers, to your Simeon agents.",
                 "/models", body, hero_css + connectors.CONN_CSS + PAGE_CSS + home_css, current="models")
    open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page, out))
    css = home_css + connector_pages.PAGE_CSS + PAGE_CSS + GUIDE_CSS
    told = guides()
    ids = [s["id"] for s in SUBS] + [p["id"] for p in keys]
    taken = {i for i in ids if ids.count(i) > 1 or i == "img"}
    if taken:
        sys.exit(f"models.py: an id is used twice or is a folder's name: {', '.join(sorted(taken))}")

    def write(pid, title, about, body_html):
        made = frame(title, esc(about), f"/models/{pid}", body_html, css, current="models")
        os.makedirs(f"{root}/{pid}")
        open(f"{root}/{pid}/index.html", "w", encoding="utf-8").write(version_style(made, out))

    for s in SUBS:
        models = plans[s["models"]]
        about = f"Your agents work on your {s['name']} plan instead of your Simeon credits."
        note = ('<p class="note">Claude Code, Anthropic\'s own app, signs in on your agents\' computer. Simeon never holds your Claude sign-in.</p>'
                if s["sign_in"] == "claude" else "")
        info = [("Type", "Subscription", False), ("Plans", esc(s["plans"]), False), ("Models", esc(", ".join(models)), True),
                ("Billing", f"Your {esc(s['name'])} plan", False), ("Website", link(s["site"]), False)]
        g = told.get(s["id"], {})
        how = guide(s["name"], esc(g.get("need") or f"{s['plans']}."), "Get the plan", [esc(x) for x in g.get("steps", [])] or
                    [f"Subscribe to {esc(s['plans'])}."], None, s["site"], sub_steps(s))
        write(s["id"], s["name"], about, page_body(s["id"], mark(s["mark"]), s["name"], f"Subscription · {esc(s['plans'])}", esc(about), note,
                                                   available(models, small_logo(s["mark"])), how, info, ctas, close))
    for p in keys:
        name = p["name"]
        g = told.get(p["id"], {})
        if p["available"]:
            about = f"Your agents use {name}'s models with your key. {name} bills each call at its own prices."
            how = guide(name, esc(g.get("need") or ""), "Get your API key", [esc(x) for x in g.get("steps", [])] or
                        [f"Create a key on {esc(name)}'s page and copy it."], esc(g["extra"]) if g.get("extra") else None, p["page"], key_steps(p))
        else:
            about = f"{name} can't be connected yet."
            how = ""
        plan = next((s for s in SUBS if s["id"] == PLAN_OF.get(p["id"])), None)
        note = (f'<p class="note">Have {esc(plan["plans"])}? <a href="/models/{plan["id"]}/">Connect {esc(plan["name"])}</a> instead.</p>'
                if plan else "")
        info = ([("Type", "API key", False), ("Models", esc(", ".join(p["models"]) or "The models on your account"), True),
                 ("Billing", f"{esc(name)}, per call", False), ("Key page", link(p["page"]), False)] if p["available"]
                else [("Type", "API key", False), ("Key page", link(p["page"]), False)])
        if p["fields"]:
            info.append(("Also needs", esc(", ".join(FIELD_TITLES.get(f["key"], f["key"]) for f in p["fields"])), False))
        by = "API key" + (' <span class="soon">Coming soon</span>' if not p["available"] else "")
        key = MARK_OF.get(p["id"], p["id"])
        write(p["id"], name, about, page_body(p["id"], mark(key), name, by, esc(about), note, available(p["models"], small_logo(key), not p["available"]),
                                              how, info, ctas, close))
    print(f"models pages written to {os.path.abspath(root)}: {len(SUBS)} subscription(s), {len(keys)} key provider(s)")


if __name__ == "__main__":
    build()
