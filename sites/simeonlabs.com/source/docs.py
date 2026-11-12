"""Simeon's documentation at /docs (2 November 2026, the founder: "do it at
simeonlabs.com/docs ... same design" as the reference docs he sent).

The page is the website's own (teams.frame): the site's bar, footer, font and
sizes (site.css), light only. Inside it, the reference's layout: the groups of
pages on the left under a search, the page in a column of 680 (a line over the
title, the title, Copy for LLM and View as Markdown, the words, sections), and
On this page on the right, whose line darkens as you read. The sizes are the
legal pages' (the founder, 2 November 2026: "the size is too big compared to our
font size", "i dont understand why you invented the nav bar", "no dark mode"):
the title at --t-display, a section at --t-title, the words at --t-body. The
search is the Marketplace's and Connectors' field ("we have a style for the
search bar"); its results drop under it.

An app named in the words wears its logo and its colour, as a message does in
the apps (the founder, the same day: "for every connector you mention use the
logo plus color like we do in the app"): the spellings, keys, colours and
everyday-word apps are GeneratedBrands.swift's, the logos the iPhone's
Brands/<key>, and an everyday word (Link, Shop) is the app only where the words
around it say so (`names_the_app`, Markdown.swift's namesTheApp), never inside
code or a link.

Each page is a Markdown file in source/docs/<slug>.md: a head of title, group,
nav (the sidebar's name, else the title), eyebrow (the line over the title,
else the group) and description, then the words. Besides the usual Markdown it
reads `:::cards`, a list of `- [Title](/link) Description` drawn as cards. The
pages' order and groups are PAGES below. The words are written from what the
apps and the server do (docs/services-*.md), for the people using Simeon, not
its engineers.

    python3 source/docs.py        # writes public/docs/ (build.py runs it too)
"""
import datetime, html, json, os, re, shutil, subprocess

import teams
from versioning import version_style

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
SITE = "https://simeonlabs.com"

# The sidebar: each group and its pages, in order (the slug is the file's name; "overview" is /docs itself).
PAGES = [
    ("Get started", ["overview", "get-started", "use-cases", "iphone"]),
    ("Work with Simeon", ["agents", "messaging", "network", "computer", "connectors", "routines", "credentials"]),
    ("Manage and protect", ["approvals", "billing"]),
    ("Help", ["faq"]),
]


def url(slug):
    return "/docs" if slug == "overview" else f"/docs/{slug}"


def read(slug):
    text = open(f"{HERE}/docs/{slug}.md", encoding="utf-8").read()
    head, body = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S).groups()
    meta = dict(re.match(r"(\w+):\s*(.*)", line).groups() for line in head.splitlines() if line.strip())
    meta.update(slug=slug, body=body.strip(), url=url(slug))
    meta.setdefault("nav", meta["title"])
    meta.setdefault("eyebrow", meta["group"])
    return meta


def updated(slug):
    """The day the page's words last changed, from git (today for a page not yet committed)."""
    try:
        day = subprocess.run(["git", "log", "-1", "--format=%cs", "--", f"{HERE}/docs/{slug}.md"],
                             capture_output=True, text=True, cwd=HERE).stdout.strip()
    except OSError:
        day = ""
    d = datetime.date.fromisoformat(day) if day else datetime.date.today()
    return f"{d:%B} {d.day}, {d.year}"


# --- Apps named in the words, as the apps' messages name them -----------------------------------------

BRANDS = [dict(name=n, key=k, colour=c, mono=m == "true", ordinary=o == "true") for n, k, c, m, o in re.findall(
    r'BrandMention\(name: "([^"]+)", key: "([^"]+)", light: "(#[0-9a-fA-F]{6})", dark: "#[0-9a-fA-F]{6}", mono: (true|false), ordinaryWord: (true|false)\)',
    teams._text(teams.BRANDS))]
BY_NAME = {}
for _b in BRANDS:
    BY_NAME.setdefault(_b["name"], _b)
BRAND_RE = re.compile(r"(?<![\w@/.-])(?:" + "|".join(re.escape(n) for n in sorted(BY_NAME, key=len, reverse=True)) + r")(?![\w-])") if BY_NAME else None

# Markdown.swift's words around an everyday-word app's name (namesTheApp), as the apps read them.
APP_NOUNS = set("account accounts api app apps balance board boards card cards checkout connection connector connectors crm dashboard dashboards "
                "database extension inbox integration integrations login mcp order orders pay payment payments plugin profile project projects "
                "settings store subscription wallet wallets workspace workspaces".split())
APP_CUES = set("connect connected connecting connects from in inside into on onto open opened opening opens reconnect reconnected through "
               "use used uses using via with".split())
CUES_BEFORE_TO = set("back connect connected connecting in reconnect reconnected switch switched".split())
VERB_CUES = set("can can't cannot could couldn't did didn't do don't i'd i'll let's may might must please shall should shouldn't to we'd "
                "we'll will won't would wouldn't you'd you'll".split())
LIST_JOINS = {"", ",", "&", "/", "+", "and", "or", ", and", ", or"}
GAP = " \t*_~\"'“”‘’"


def _starts_sentence(text, at):
    i = at - 1
    while i >= 0:
        c = text[i]
        if c == "\n":
            return True
        if c not in " \t*_\"'“‘([>#-•":
            return c in ".!?:…"
        i -= 1
    return True


def _word_before(text, at):
    i = at
    while i > 0 and text[i - 1] in GAP:
        i -= 1
    j = i
    while j > 0 and (text[j - 1].isalnum() or text[j - 1] in "'’"):
        j -= 1
    return (text[j:i], j) if j < i else None


def _word_after(text, at):
    i = at
    while i < len(text) and text[i] in GAP:
        i += 1
    j = i
    while j < len(text) and (text[j].isalnum() or text[j] in "'’"):
        j += 1
    return text[i:j] if j > i else None


def _key(word):
    return word.lower().replace("’", "'")


def names_the_app(text, index, found):
    """Whether the everyday-word app's name found[index] is the app in its sentence (Markdown.swift's namesTheApp)."""
    start, end = found[index]

    def joined(a, b):
        if a > b:
            return False
        between = "".join(c for c in text[a:b] if c not in "*_~")
        return " ".join(between.split()).lower() in LIST_JOINS

    listed = (index > 0 and joined(found[index - 1][1], start)) or (index + 1 < len(found) and joined(end, found[index + 1][0]))
    if _starts_sentence(text, start):
        return listed
    after = _word_after(text, end)
    app_word_after = bool(after) and _key(after) in APP_NOUNS
    before = _word_before(text, start)
    if not before:
        return listed or app_word_after
    cue = _key(before[0])
    if cue == "to":
        earlier = _word_before(text, before[1])
        if earlier and _key(earlier[0]) in CUES_BEFORE_TO:
            return True
    if cue in APP_CUES:
        return True
    if cue in VERB_CUES:
        return False
    if before[0][:1].isupper() and not _starts_sentence(text, before[1]) and not any(s <= before[1] < e for s, e in found):
        return False
    return listed or app_word_after


class Logos:
    """Copies the logos the docs name into public/docs/brands/ and draws a name with its logo and colour."""

    def __init__(self, root):
        self.root = root
        self.urls = {}

    def url(self, key):
        if key not in self.urls:
            src = teams._picture(f"{teams.BRAND_MARKS}/{key}.imageset")
            if src:
                os.makedirs(f"{self.root}/brands", exist_ok=True)
                name = key + os.path.splitext(src)[1].lower()
                shutil.copy(src, f"{self.root}/brands/{name}")
                self.urls[key] = f"/docs/brands/{name}?v={teams._version(src)}"
            else:
                self.urls[key] = None
        return self.urls[key]

    def mention(self, brand, name):
        logo, colour = self.url(brand["key"]), brand["colour"]
        if not logo:
            mark = ""
        elif brand["mono"]:
            mark = f'<i class="logo" style="--m:url({logo});background:{colour}" aria-hidden="true"></i>'
        else:
            mark = f'<img class="logo" src="{logo}" alt="" aria-hidden="true">'
        return f'<span class="brand" style="color:{colour}">{mark}{html.escape(name, quote=False)}</span>'


LOGOS = None  # set by build()


def mark_brands(text):
    """`text` with each app's name outside code and links swapped for a placeholder, and the placeholders' HTML."""
    if not BRAND_RE or not LOGOS:
        return text, []
    shut = [m.span() for m in re.finditer(r"`[^`]+`|\[[^\]]+\]\([^)\s]+\)", text)]
    found = [m for m in BRAND_RE.finditer(text) if not any(a <= m.start() < b for a, b in shut)]
    spans = [m.span() for m in found]
    # An everyday word in bold on its own ("- **Link** (by Stripe)") is the docs naming the app.
    alone = lambda m: text[max(0, m.start() - 2):m.start()] == "**" and text[m.end():m.end() + 2] == "**"
    keep = [(m, BY_NAME[m.group(0)]) for i, m in enumerate(found) if not BY_NAME[m.group(0)]["ordinary"] or alone(m) or names_the_app(text, i, spans)]
    out, made, i = [], [], 0
    for m, brand in keep:
        out.append(text[i:m.start()])
        out.append(f"{len(made)}")
        made.append(LOGOS.mention(brand, m.group(0)))
        i = m.end()
    out.append(text[i:])
    return "".join(out), made


# --- Markdown, the little this documentation needs -------------------------------------------------

def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", text).lower()).strip("-")


def inline(text, top=True):
    made = []
    if top:
        text, made = mark_brands(text)
    out, i = [], 0
    for m in re.finditer(r"`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*", text):
        out.append(html.escape(text[i:m.start()], quote=False))
        code, label, href, bold, em = m.groups()
        if code is not None:
            out.append(f"<code>{html.escape(code)}</code>")
        elif label is not None:
            ext = href.startswith("http") and "simeonlabs.com" not in href
            out.append(f'<a href="{html.escape(href)}"{" target=_blank rel=noopener" if ext else ""}>{inline(label, False)}</a>')
        elif bold is not None:
            out.append(f"<strong>{inline(bold, False)}</strong>")
        else:
            out.append(f"<em>{inline(em, False)}</em>")
        i = m.end()
    out.append(html.escape(text[i:], quote=False))
    done = "".join(out)
    return re.sub("(\\d+)", lambda m: made[int(m.group(1))], done) if made else done


ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def shot_size(src):
    """A picture's size in CSS pixels (the files are taken at twice that), or None."""
    try:
        from PIL import Image
        w, h = Image.open(os.path.join(HERE, "docs", src)).size
        return w // 2, h // 2
    except Exception:
        return None


def render(md):
    """The page's HTML and its headings, [(level, id, text)]."""
    lines, out, heads, i = md.splitlines(), [], [], 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
        elif line.startswith("## ") or line.startswith("### "):
            level = 2 if line.startswith("## ") else 3
            text = line[level + 1:].strip()
            hid = slugify(text)
            heads.append((level, hid, text))
            out.append(f'<h{level} id="{hid}">{inline(text)}</h{level}>')
            i += 1
        elif line.startswith("```"):
            # A block of code or a line to type (the Simeon Network's terminal lines), with Copy.
            code, i = [], i + 1
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            i += 1
            text = "\n".join(code)
            out.append(f'<div class="code"><pre><code>{html.escape(text)}</code></pre>'
                       f'<button type="button" class="copy-code" aria-label="Copy">{ICON["copy"]}<span>Copy</span></button></div>')
        elif re.match(r"!\[[^\]]*\]\([^)]+\)(\{[^}]*\})?\s*$", line.strip()):
            # A picture of the app (12 November 2026, the founder: "stripe level of documentation, with details, pictures"):
            # ![what it shows](img/<file> "caption"), the file in source/docs/img, framed on the site's grey
            m = re.match(r'!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\{([^}]*)\})?', line.strip())
            alt, src, cap = m.group(1), m.group(2), m.group(3)
            opts = dict(kv.split("=", 1) for kv in (m.group(4) or "").split() if "=" in kv)
            size = shot_size(src)
            dims = f' width="{size[0]}" height="{size[1]}"' if size else ""
            # The window on a panel in the colour of the agent it shows (the founder, 12 November 2026: "apple like
            # ... for the background color use whatever agent background color"): the window's own corner at `edge`
            # (tl, tr, t, bl, br, b, or c for the whole window), running off the panel's other sides
            colour, edge = opts.get("c", "#89acbc"), ("right" if opts.get("edge") == "right" else "left")
            style = f'--c:{colour};--w:{opts.get("w", "100")}%;aspect-ratio:{opts.get("ar", "16/10")}'
            out.append(f'<figure class="shot"><div class="pane" style="{style}"><img class="e-{edge}" src="/docs/{html.escape(src)}" alt="{html.escape(alt)}"{dims} loading="lazy" decoding="async"></div>'
                       + (f"<figcaption>{inline(cap)}</figcaption>" if cap else "") + "</figure>")
            i += 1
        elif re.match(r":::(note|tip|warning)\s*$", line.strip()):
            # A note, a tip or a warning, set apart from the words
            kind, body, i = line.strip()[3:], [], i + 1
            while i < len(lines) and lines[i].strip() != ":::":
                body.append(lines[i].strip())
                i += 1
            i += 1
            label = {"note": "Note", "tip": "Tip", "warning": "Important"}[kind]
            paras = [x for x in "\n".join(body).split("\n\n") if x.strip()]
            out.append(f'<div class="callout {kind}"><b>{label}</b>' + "".join(f"<p>{inline(' '.join(x.split()))}</p>" for x in paras) + "</div>")
        elif line.strip() == ":::cards":
            cards, i = [], i + 1
            while i < len(lines) and lines[i].strip() != ":::":
                m = re.match(r"-\s*\[([^\]]+)\]\(([^)]+)\)\s*(.*)", lines[i].strip())
                if m:
                    t, h, d = m.groups()
                    cards.append(f'<a class="card" href="{h}"><span><h3>{inline(t, False)}</h3><p>{inline(d, False)}</p></span><span class="go">Explore {ARROW}</span></a>')
                i += 1
            out.append(f'<div class="cards">{"".join(cards)}</div>')
            i += 1
        elif line.startswith(">"):
            quote = []
            while i < len(lines) and lines[i].startswith(">"):
                quote.append(lines[i][1:].strip())
                i += 1
            out.append(f"<blockquote><p>{inline(' '.join(quote))}</p></blockquote>")
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            head, body = rows[0], [r for r in rows[1:] if not all(re.fullmatch(r":?-+:?", c) for c in r)]
            out.append('<div class="table"><table><thead><tr>' + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
                       + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</tbody></table></div>")
        elif re.match(r"(-|\d+\.)\s", line):
            ordered = bool(re.match(r"\d+\.", line))
            first = int(re.match(r"(\d+)\.", line).group(1)) if ordered else 1   # steps carry on after a picture or an example
            items = []
            while i < len(lines) and re.match(r"(-|\d+\.)\s", lines[i]):
                items.append(re.sub(r"^(-|\d+\.)\s+", "", lines[i]))
                i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}" + (f' start="{first}"' if first != 1 else "") + ">" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(#{2,3} |>|\||:::|```|-\s|\d+\.\s|!\[)", lines[i]):
                para.append(lines[i].strip())
                i += 1
            out.append(f"<p>{inline(' '.join(para))}</p>")
    return "\n".join(out), heads


def plain(md):
    """The words alone, for the search."""
    md = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", md)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md)
    t = re.sub(r"[*`>#|]|:::\w*", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# --- The page ----------------------------------------------------------------------------------------

ICON = {
    "copy": '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3H5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    "md": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.8h5.2L12.5 5v8.4a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V2.6a.8.8 0 0 1 .8-.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 8.5h5M5.5 11h3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    "talk": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2c3.3 0 5.8 2.2 5.8 5s-2.5 5-5.8 5c-.6 0-1.2-.1-1.8-.2L3 13.4l.7-2.6C2.7 9.9 2.2 8.6 2.2 7.2c0-2.8 2.5-5 5.8-5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    "list": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
}

CSS = r"""
/* The documentation (docs.py): the site's bar, footer, type and sizes around the reference's three columns. Light only. */
.docs{--bar:clamp(52px,3.8*var(--vw,1vw),76px);width:var(--col);margin-inline:auto;display:grid;grid-template-columns:clamp(220px,15*var(--vw,1vw),280px) minmax(0,1fr) clamp(190px,13*var(--vw,1vw),250px);gap:clamp(32px,3*var(--vw,1vw),64px);padding-bottom:clamp(64px,6*var(--vw,1vw),120px)}
html{scroll-padding-top:calc(clamp(52px,3.8*var(--vw,1vw),76px) + 24px)}

/* The left: the search, then the groups of pages */
.docs .side{position:sticky;z-index:5;top:var(--bar);align-self:start;padding-top:clamp(20px,2*var(--vw,1vw),36px)}
/* the pages scroll on their own under the search, so the search's results are never cut */
.pages{max-height:calc(100*var(--vh,1vh) - var(--bar) - 120px);overflow-y:auto;padding-bottom:40px;scrollbar-width:none}
.pages::-webkit-scrollbar{display:none}
/* The Marketplace's and Connectors' search field (teams.py's .find), a touch smaller in the column */
.docs .find{position:relative;margin:0 0 28px}
.docs .find>svg{position:absolute;right:16px;top:22px;width:16px;height:16px;transform:translateY(-50%);color:#1d1d1f;pointer-events:none}
.docs .find input{display:block;width:100%;height:44px;padding:0 44px 0 18px;border:1px solid #e3e3e8;border-radius:99px;background:#fff;color:var(--ink);font:inherit;font-size:15px;letter-spacing:-.01em;outline:none;-webkit-appearance:none;appearance:none;transition:border-color .2s,box-shadow .2s}
.docs .find input:focus{border-color:#c7c7cc;box-shadow:0 4px 14px rgba(0,0,0,.05)}
.docs .find input::placeholder{color:#86868b;opacity:1}
.docs .find input::-webkit-search-decoration,.docs .find input::-webkit-search-cancel-button{-webkit-appearance:none}
.hits{position:absolute;z-index:40;top:calc(100% + 8px);left:0;width:min(460px,calc(100*var(--vw,1vw) - 32px));max-height:min(420px,60*var(--vh,1vh));overflow-y:auto;padding:8px;border-radius:16px;background:var(--page);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 14px 36px rgba(20,30,60,.12)}
.hits[hidden]{display:none}
.hit{display:block;padding:10px 12px;border-radius:10px;text-decoration:none}
.hit.sel,.hit:hover{background:var(--soft)}
.hit b{display:block;font-size:14px;font-weight:var(--w-title);letter-spacing:-.01em}
.hit small{display:block;margin-top:2px;font-size:var(--t-tiny);line-height:1.5;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hit em{font-style:normal;color:var(--ink);font-weight:var(--w-title)}
.hits .nothing{padding:20px 12px;text-align:center;font-size:14px;color:var(--ink2)}
.pages>summary{display:none}
.group+.group{margin-top:24px}
.group-name{display:block;padding:5px 10px;font-size:var(--t-small);font-weight:var(--w-title);color:var(--ink)}
.group a{display:block;padding:6px 10px;border-radius:10px;font-size:14px;line-height:1.45;letter-spacing:-.01em;text-decoration:none;color:var(--ink2);transition:color .15s,background .15s}
.group a:hover{color:var(--ink);background:var(--soft)}
.group a[aria-current]{color:var(--ink);background:var(--soft)}

/* The page */
.docs .page{min-width:0;width:100%;max-width:680px;margin-inline:auto;padding-top:clamp(24px,2.4*var(--vw,1vw),44px)}
.eyebrow{font-size:var(--t-small);color:var(--ink2)}
.docs h1{margin-top:6px;font-size:var(--t-display);font-weight:var(--w-display);line-height:1.15;letter-spacing:-.025em;text-wrap:balance}
.page-acts{display:flex;align-items:center;gap:16px;margin:16px 0 32px}
.page-acts button,.page-acts a{display:inline-flex;align-items:center;gap:7px;padding:0;border:0;background:none;cursor:pointer;font:inherit;font-size:var(--t-tiny);font-weight:var(--w-title);letter-spacing:0;color:var(--ink2);text-decoration:none;transition:color .15s}
.page-acts button:hover,.page-acts a:hover{color:var(--ink)}
.page-acts svg,.toc-more svg{width:15px;height:15px;flex:none}
.page-acts i{width:1px;height:14px;background:var(--line)}
.words{font-size:var(--t-body);line-height:1.65;letter-spacing:-.01em}
.words p,.words ul,.words ol{margin:0 0 20px}
.words h2{margin:56px 0 16px;font-size:var(--t-title);font-weight:var(--w-display);line-height:1.3;letter-spacing:-.02em}
.words h3{margin:36px 0 12px;font-size:var(--t-head);font-weight:var(--w-title);line-height:1.35;letter-spacing:-.015em}
.words a{text-decoration:underline dotted;text-decoration-thickness:1px;text-underline-offset:3.5px}
.words a:hover{text-decoration-style:solid}
.words strong{font-weight:var(--w-title)}
.words ul,.words ol{padding-left:22px}
.words li{padding-left:4px;margin:0 0 8px}
.words ul li::marker{color:var(--ink3)}
.words ol li::marker{color:var(--ink2)}
.words blockquote{margin:0 0 24px;padding:0 0 0 16px;border-left:3px solid var(--blue);color:var(--ink)}
.words blockquote p{margin:0}
.words code{padding:1px 5px;border-radius:5px;background:var(--soft);font:500 .85em/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--blue)}
.words .code{position:relative;margin:0 0 24px;border-radius:12px;background:var(--soft)}
.words .code pre{margin:0;padding:14px 96px 14px 16px;overflow-x:auto;white-space:pre}
.words .code pre code{padding:0;background:none;border-radius:0;font:500 13.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink)}
.words .copy-code{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:8px;background:#fff;color:var(--ink2);font:500 var(--t-small)/1 inherit;cursor:pointer;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.words .copy-code svg{width:14px;height:14px}
.words .copy-code:hover{color:var(--ink)}
.words .table{margin:0 0 24px;overflow-x:auto}
.words .shot{margin:12px 0 32px}
.words .shot .pane{position:relative;overflow:hidden;border-radius:24px;max-width:100%;background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--c) 62%,#fff) 0%,color-mix(in srgb,var(--c) 26%,#fff) 55%,color-mix(in srgb,var(--c) 10%,#fff) 100%)}
.words .shot .pane>img{position:absolute;display:block;width:var(--w);max-width:none;height:auto;filter:drop-shadow(0 18px 34px rgba(20,30,60,.2)) drop-shadow(0 2px 6px rgba(20,30,60,.08))}
/* the window in from the left or from the right, running off the other side and the bottom, as the founder's reference docs do
   (the founder, 12 November 2026: "either left or right. but not ... middle") */
.words .shot .pane>.e-left{left:7%;top:12%}.words .shot .pane>.e-right{right:7%;top:12%}
.words .shot figcaption{margin-top:12px;font-size:var(--t-small);line-height:1.5;color:var(--ink2);text-align:center}
.words .callout{margin:0 0 24px;padding:16px 20px;border-radius:14px;background:var(--soft)}
.words .callout b{display:block;margin-bottom:4px;font-size:var(--t-small);font-weight:var(--w-title);color:var(--ink)}
.words .callout p{margin:0;font-size:var(--t-small);line-height:1.6;color:var(--ink2)}
.words .callout p+p{margin-top:8px}
.words .callout.tip b{color:var(--blue)}
.words .callout.warning{background:#fff6ec}.words .callout.warning b{color:#b4530a}
.words table{width:100%;border-collapse:collapse;font-size:var(--t-body)}
.words th{white-space:nowrap;padding:10px 16px 10px 0;text-align:left;font-weight:var(--w-title);border-bottom:1px solid var(--line)}
.words td{padding:12px 16px 12px 0;vertical-align:top;border-bottom:1px solid var(--line)}
/* An app's name, as a message in the apps names it: its logo (1.05 em, .04 em before and .26 em after, .18 em under the line) and its colour at 500 */
.brand{font-weight:var(--w-title);white-space:nowrap}
.brand .logo{display:inline-block;width:1.05em;height:1.05em;margin:0 .26em 0 .04em;vertical-align:-.18em;object-fit:contain}
.brand i.logo{-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:8px 0 0}
.card{display:flex;flex-direction:column;justify-content:space-between;gap:20px;padding:26px;border-radius:18px;background:var(--soft);text-decoration:none!important;transition:background .2s}
.card:hover{background:#ededf0}
.card h3{margin:0;font-size:var(--t-head);line-height:1.35;font-weight:var(--w-title);letter-spacing:-.015em}
.card p{margin:6px 0 0;font-size:15px;line-height:1.55;color:var(--ink2)}
.card .go{display:inline-flex;align-items:center;gap:6px;font-size:var(--t-small);color:var(--ink2)}
.card .go svg{width:13px;height:13px;transition:transform .2s}
.card:hover .go svg{transform:translateX(2px)}
.updated{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);font-size:var(--t-small);color:var(--ink2)}

/* On this page */
.toc{position:sticky;top:var(--bar);align-self:start;max-height:calc(100*var(--vh,1vh) - var(--bar));overflow-y:auto;padding:clamp(24px,2.4*var(--vw,1vw),44px) 0 40px;scrollbar-width:none}
.toc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:var(--t-small);font-weight:var(--w-title)}
.toc-head svg{width:16px;height:16px;color:var(--ink3)}
.toc a.t{display:block;padding:2px 0;font-size:var(--t-small);line-height:1.45;text-decoration:none;color:var(--ink3);transition:color .1s}
.toc a.t+a.t{margin-top:6px}
.toc a.t.l3{padding-left:12px}
.toc a.t:hover,.toc a.t.on{color:var(--ink)}
.toc-more{margin-top:16px;padding-top:16px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.toc-more a,.toc-more button{display:flex;align-items:center;gap:9px;padding:0;border:0;background:none;cursor:pointer;font:inherit;font-size:var(--t-small);color:var(--ink2);text-decoration:none}
.toc-more a:hover,.toc-more button:hover{color:var(--ink)}
.toast{position:fixed;left:50%;bottom:28px;z-index:60;transform:translate(-50%,12px);padding:10px 16px;border-radius:99px;background:#1d1d1f;color:#fff;font-size:var(--t-small);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.toast.on{opacity:1;transform:translate(-50%,0)}

@media (max-width:1200px){.docs{grid-template-columns:clamp(220px,22*var(--vw,1vw),260px) minmax(0,1fr)}.toc{display:none}}
/* A phone: the search, then the pages behind a button of the same shape, then the page */
@media (max-width:899px){
  .docs{display:block}
  .docs .side{position:static;padding:20px 0 0}
  .pages{max-height:none;overflow:visible;padding-bottom:0}
  .docs .find{margin-bottom:10px}
  .docs .find input{height:48px;padding:0 50px 0 22px;font-size:var(--t-field)}
  .docs .find>svg{right:20px;top:24px;width:18px;height:18px}
  .pages>summary{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 20px 0 22px;border:1px solid #e3e3e8;border-radius:99px;font-size:var(--t-field);letter-spacing:-.01em;list-style:none;cursor:pointer}
  .pages>summary::-webkit-details-marker{display:none}
  .pages>summary svg{width:12px;height:12px;transition:transform .2s}
  .pages[open]>summary svg{transform:rotate(180deg)}
  .pages[open]>summary{margin-bottom:16px}
  .group a{font-size:var(--t-body);padding:8px 10px}
  .docs .page{padding-top:28px}
  .cards{grid-template-columns:1fr}
}
"""

JS = r"""<script>
(function(){
  // A phone: the pages start closed behind their button
  var pages = document.querySelector('.pages');
  if (pages && matchMedia('(max-width:899px)').matches) pages.open = false;
  // Copy for LLM: the page's Markdown, with its title
  var toast = document.querySelector('.toast');
  function say(t){ toast.textContent = t; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(function(){ toast.classList.remove('on'); }, 1600); }
  document.querySelectorAll('[data-copy]').forEach(function(b){
    b.addEventListener('click', function(){
      var md = document.getElementById('md').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject()).then(function(){ say('Copied for LLM'); }, function(){ say('Could not copy'); });
    });
  });
  // A block of code: its Copy copies its lines
  document.querySelectorAll('.copy-code').forEach(function(b){
    b.addEventListener('click', function(){
      var code = b.parentNode.querySelector('code').textContent, label = b.querySelector('span');
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function(){
        label.textContent = 'Copied'; clearTimeout(b.t); b.t = setTimeout(function(){ label.textContent = 'Copy'; }, 1600);
      }, function(){ say('Could not copy'); });
    });
  });
  // On this page: the line for the section you're reading darkens
  var links = [].slice.call(document.querySelectorAll('.toc a.t'));
  var heads = links.map(function(a){ return document.getElementById(a.hash.slice(1)); });
  function spy(){
    var on = 0;
    heads.forEach(function(h, i){ if (h && h.getBoundingClientRect().top < 160) on = i; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) on = heads.length - 1;
    links.forEach(function(a, i){ a.classList.toggle('on', i === on && scrollY > 40); });
  }
  if (links.length) { addEventListener('scroll', spy, { passive: true }); spy(); }
  // The search: every page's sections (search.json), dropped under the field as you type
  var input = document.getElementById('docs-search'), hits = document.querySelector('.hits'), index = null, sel = 0;
  function load(){ if (!index) fetch('/docs/search.json').then(function(r){ return r.json(); }).then(function(d){ index = d; draw(); }); }
  function esc(s){ return s.replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function draw(){
    var q = input.value.trim().toLowerCase();
    if (!q) { hits.hidden = true; return; }
    hits.hidden = false;
    if (!index) { hits.innerHTML = '<div class="nothing">Loading…</div>'; return; }
    var words = q.split(/\s+/), out = [];
    index.forEach(function(s){
      var hay = (s.page + ' ' + s.head + ' ' + s.text).toLowerCase();
      if (!words.every(function(w){ return hay.indexOf(w) >= 0; })) return;
      var score = words.reduce(function(n, w){ return n + ((s.page + ' ' + s.head).toLowerCase().indexOf(w) >= 0 ? 3 : 1); }, 0);
      var at = s.text.toLowerCase().indexOf(words[0]), snip = s.text.slice(Math.max(0, at - 40), at + 110);
      out.push({ s: s, score: score, snip: (at > 40 ? '…' : '') + snip });
    });
    out.sort(function(a, b){ return b.score - a.score; });
    out = out.slice(0, 10); sel = 0;
    if (!out.length) { hits.innerHTML = '<div class="nothing">No results for “' + esc(input.value) + '”</div>'; return; }
    hits.innerHTML = out.map(function(o, i){
      var snip = esc(o.snip);
      words.forEach(function(w){ snip = snip.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<em>$1</em>'); });
      return '<a class="hit' + (i ? '' : ' sel') + '" href="' + o.s.url + '"><b>' + esc(o.s.page) + (o.s.head ? ' › ' + esc(o.s.head) : '') + '</b><small>' + snip + '</small></a>';
    }).join('');
  }
  input.addEventListener('focus', function(){ load(); draw(); });
  input.addEventListener('input', draw);
  input.addEventListener('keydown', function(e){
    var all = hits.querySelectorAll('.hit');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!all.length) return;
      all[sel].classList.remove('sel'); sel = (sel + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length; all[sel].classList.add('sel'); all[sel].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && all[sel]) location.href = all[sel].href;
    else if (e.key === 'Escape') { input.value = ''; draw(); input.blur(); }
  });
  document.addEventListener('click', function(e){ if (!e.target.closest('.find')) hits.hidden = true; });
  addEventListener('keydown', function(e){
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); }
  });
})();
</script>"""

CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def sidebar(pages, current):
    groups = []
    for group, slugs in PAGES:
        links = "".join(f'<a href="{pages[s]["url"]}"{" aria-current=page" if s == current else ""}>{html.escape(pages[s]["nav"])}</a>' for s in slugs)
        groups.append(f'<div class="group"><span class="group-name">{html.escape(group)}</span>{links}</div>')
    search = (f'<div class="find" role="search"><input type="search" id="docs-search" placeholder="Search the docs" aria-label="Search the docs" '
              f'autocomplete="off" spellcheck="false">{teams.MAGNIFIER}<div class="hits" hidden></div></div>')
    return (f'{search}<details class="pages" open><summary>{html.escape(pages[current]["nav"])}{CHEVRON}</summary>'
            f'{"".join(groups)}</details>')


def toc(heads):
    if not heads:
        return ""
    items = "".join(f'<a class="t l{lv}" href="#{hid}">{html.escape(re.sub(r"[*`]", "", text))}</a>' for lv, hid, text in heads)
    return (f'<div class="toc-head">On this page{ICON["list"]}</div>{items}'
            f'<div class="toc-more"><button type="button" data-copy>{ICON["copy"]}Copy for LLM</button><a href="/contact">{ICON["talk"]}Share feedback</a></div>')


def page(p, pages):
    words, heads = render(p["body"])
    title = "Docs" if p["slug"] == "overview" else f"Docs | {html.escape(p['title'])}"
    md_url = (p["url"] if p["slug"] != "overview" else "/docs/overview") + ".md"
    md = f"# {p['title']}\n\n{p['body']}\n"
    body = f"""<div class="docs">
  <nav class="side" aria-label="Documentation">{sidebar(pages, p['slug'])}</nav>
  <article class="page">
    <p class="eyebrow">{html.escape(p['eyebrow'])}</p>
    <h1>{html.escape(p['title'])}</h1>
    <div class="page-acts"><button type="button" data-copy>{ICON['copy']}Copy for LLM</button><i></i><a href="{md_url}">{ICON['md']}View as Markdown</a></div>
    <div class="words">
{words}
    </div>
    <p class="updated">Last updated: {updated(p['slug'])}</p>
  </article>
  <aside class="toc">{toc(heads)}</aside>
</div>
<div class="toast" role="status"></div>
<script type="text/markdown" id="md">{html.escape(md)}</script>"""
    head = f'\n<link rel="alternate" type="text/markdown" href="{md_url}">'
    return teams.frame(title, html.escape(p["description"]), p["url"], body, CSS, current="docs", script=JS, head=head)


def search_index(pages):
    out = []
    for group, slugs in PAGES:
        for s in slugs:
            p = pages[s]
            parts = re.split(r"^(#{2,3} .*)$", p["body"], flags=re.M)
            out.append({"page": p["title"], "head": "", "url": p["url"], "text": plain(parts[0])[:600]})
            for i in range(1, len(parts), 2):
                head = parts[i].lstrip("#").strip()
                out.append({"page": p["title"], "head": head, "url": f'{p["url"]}#{slugify(head)}', "text": plain(parts[i + 1])[:600]})
    return out


def build(out=OUT):
    global LOGOS
    teams.copy_site_css(out)
    pages = {s: read(s) for _, slugs in PAGES for s in slugs}
    root = os.path.join(out, "docs")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    LOGOS = Logos(root)
    if os.path.isdir(os.path.join(HERE, "docs", "img")):
        shutil.copytree(os.path.join(HERE, "docs", "img"), os.path.join(root, "img"))
    for s, p in pages.items():
        folder = root if s == "overview" else os.path.join(root, s)
        os.makedirs(folder, exist_ok=True)
        open(os.path.join(folder, "index.html"), "w", encoding="utf-8").write(version_style(page(p, pages), out))
        # View as Markdown: the page's words as written, at /docs/<slug>.md
        open(os.path.join(root, f"{s}.md"), "w", encoding="utf-8").write(f"# {p['title']}\n\n{p['body']}\n")
    json.dump(search_index(pages), open(os.path.join(root, "search.json"), "w", encoding="utf-8"), ensure_ascii=False)
    named = sorted(k for k, u in LOGOS.urls.items() if u)
    print(f"docs written to {root}: {len(pages)} page(s); apps named with their logo: {', '.join(named)}")


if __name__ == "__main__":
    build()
