"""Simeon's documentation at /docs (2 November 2026, the founder: "do it at
simeonlabs.com/docs ... same design" as the reference docs he sent).

Laid out as that reference, measured in a browser that day: a bar of 80 points (the wordmark; the site's pages in the
middle; a theme switch, the search and a black Download on the right), the
groups of pages on the left (13 points), the page in a column of 672 (a line
over the title, the title at 48, Copy for LLM and View as Markdown, the words
at 14 on 24, sections at 30 and 24), and On this page on the right, whose line
darkens as you read. The quote's bar and the code are the site's blue where
the reference's are orange; the type is Inter where theirs is their own.

Each page is a Markdown file in source/docs/<slug>.md: a head of title, group,
nav (the sidebar's name, else the title), eyebrow (the line over the title,
else the group) and description, then the words. Besides the usual Markdown it
reads `:::cards`, a list of `- [Title](/link) Description` drawn as the
reference's cream cards. The pages' order and groups are PAGES below. The
words are written from what the apps and the server do (docs/services-*.md),
for the people using Simeon, not its engineers.

    python3 source/docs.py        # writes public/docs/ (build.py runs it too)
"""
import datetime, html, json, os, re, subprocess

from nav import MAC_DOWNLOAD, LOG_IN

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
SITE = "https://simeonlabs.com"

# The sidebar: each group and its pages, in order (the slug is the file's name; "overview" is /docs itself).
PAGES = [
    ("Get started", ["overview", "get-started", "use-cases", "iphone"]),
    ("Work with Simeon", ["agents", "messaging", "computer", "connectors", "routines", "credentials"]),
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


# --- Markdown, the little this documentation needs -------------------------------------------------

def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", text).lower()).strip("-")


def inline(text):
    out, i = [], 0
    for m in re.finditer(r"`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*", text):
        out.append(html.escape(text[i:m.start()], quote=False))
        code, label, href, bold, em = m.groups()
        if code is not None:
            out.append(f"<code>{html.escape(code)}</code>")
        elif label is not None:
            ext = href.startswith("http") and "simeonlabs.com" not in href
            out.append(f'<a href="{html.escape(href)}"{" target=_blank rel=noopener" if ext else ""}>{inline(label)}</a>')
        elif bold is not None:
            out.append(f"<strong>{inline(bold)}</strong>")
        else:
            out.append(f"<em>{inline(em)}</em>")
        i = m.end()
    out.append(html.escape(text[i:], quote=False))
    return "".join(out)


ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'


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
            out.append(f'<h{level} id="{hid}"><a class="anchor" href="#{hid}">{inline(text)}</a></h{level}>')
            i += 1
        elif line.strip() == ":::cards":
            cards, i = [], i + 1
            while i < len(lines) and lines[i].strip() != ":::":
                m = re.match(r"-\s*\[([^\]]+)\]\(([^)]+)\)\s*(.*)", lines[i].strip())
                if m:
                    t, h, d = m.groups()
                    cards.append(f'<a class="card" href="{h}"><span><h3>{inline(t)}</h3><p>{inline(d)}</p></span><span class="go">Explore {ARROW}</span></a>')
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
            items = []
            while i < len(lines) and re.match(r"(-|\d+\.)\s", lines[i]):
                items.append(re.sub(r"^(-|\d+\.)\s+", "", lines[i]))
                i += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
        else:
            para = []
            while i < len(lines) and lines[i].strip() and not re.match(r"(#{2,3} |>|\||:::|-\s|\d+\.\s)", lines[i]):
                para.append(lines[i].strip())
                i += 1
            out.append(f"<p>{inline(' '.join(para))}</p>")
    return "\n".join(out), heads


def plain(md):
    """The words alone, for the search."""
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", md)
    t = re.sub(r"[*`>#|]|:::\w*", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# --- The page ----------------------------------------------------------------------------------------

ICON = {
    "copy": '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8a1.3 1.3 0 0 0-1.3 1.3v5.4a1.3 1.3 0 0 0 1.3 1.3H5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    "md": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.8h5.2L12.5 5v8.4a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V2.6a.8.8 0 0 1 .8-.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 8.5h5M5.5 11h3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    "talk": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2c3.3 0 5.8 2.2 5.8 5s-2.5 5-5.8 5c-.6 0-1.2-.1-1.8-.2L3 13.4l.7-2.6C2.7 9.9 2.2 8.6 2.2 7.2c0-2.8 2.5-5 5.8-5z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    "list": '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    "search": '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m10.4 10.4 3.4 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    "moon": '<svg class="i-moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    "sun": '<svg class="i-sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    "menu": '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7h14M3 13h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    "close": '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    "chev": '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

# The bar's pages, as the reference's bar carries its products'.
TABS = [("Docs", "/docs"), ("Marketplace", "/marketplace"), ("Connectors", "/connectors"), ("Pricing", "/pricing"), ("Newsroom", "/newsroom")]

CSS = r"""
:root{--bg:#fff;--fg:#0a0a0a;--muted:rgba(10,10,10,.6);--faint:rgba(10,10,10,.38);--line:rgba(10,10,10,.1);--pill:rgba(10,10,10,.15);
  --card:#f9f8f6;--card-hover:#f2f0ec;--hover:rgba(10,10,10,.05);--accent:#255a93;--btn:#0a0a0a;--btn-fg:#f9f8f6;--code:rgba(10,10,10,.05);--shade:rgba(0,0,0,.28)}
html[data-theme=dark]{--bg:#0a0a0a;--fg:#f4f4f2;--muted:rgba(244,244,242,.6);--faint:rgba(244,244,242,.38);--line:rgba(244,244,242,.12);--pill:rgba(244,244,242,.18);
  --card:#161616;--card-hover:#1e1e1e;--hover:rgba(244,244,242,.07);--accent:#6fa3dc;--btn:#f4f4f2;--btn-fg:#0a0a0a;--code:rgba(244,244,242,.08);--shade:rgba(0,0,0,.6);color-scheme:dark}
*{box-sizing:border-box}
html{scroll-padding-top:104px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:400 16px/24px Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased}
a{color:inherit}
button{font:inherit;color:inherit}
svg{display:block}

/* The bar */
.top{position:sticky;top:0;z-index:30;height:80px;display:flex;align-items:center;gap:16px;padding:0 24px;background:var(--bg)}
.logo{flex:none;display:block;width:132px;height:38px;background:var(--fg);-webkit-mask:url(/img/wordmark-labs.png) left center/contain no-repeat;mask:url(/img/wordmark-labs.png) left center/contain no-repeat}
.tabs{position:absolute;left:50%;transform:translateX(-50%);display:flex;gap:2px}
.tabs a{padding:6px 12px;border-radius:6px;font-size:14px;line-height:20px;font-weight:500;text-decoration:none;color:var(--muted);transition:color .15s}
.tabs a:hover,.tabs a.on{color:var(--fg)}
.right{margin-left:auto;display:flex;align-items:center;gap:8px}
.icon-btn{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:none;cursor:pointer;color:var(--fg)}
.icon-btn:hover{background:var(--hover)}
.icon-btn svg{width:18px;height:18px}
html[data-theme=dark] .i-moon,html:not([data-theme=dark]) .i-sun{display:none}
.search{display:flex;align-items:center;gap:8px;width:208px;height:36px;padding:0 12px 0 16px;border:1px solid var(--pill);border-radius:999px;background:none;cursor:pointer;font-size:14px;font-weight:500;line-height:20px;color:var(--muted)}
.search svg{width:16px;height:16px;flex:none;color:var(--fg)}
.search span{flex:1;text-align:left;color:var(--fg)}
.search kbd{font:500 12px/1 Inter,system-ui,sans-serif;letter-spacing:.06em;color:var(--faint)}
.cta{position:relative;display:flex;height:36px;border-radius:999px;background:var(--btn);color:var(--btn-fg)}
.cta>a{display:flex;align-items:center;padding:8px 14px 8px 18px;font-size:14px;line-height:20px;font-weight:500;text-decoration:none}
.cta>button{display:grid;place-items:center;width:34px;padding:0;border:0;border-left:1px solid color-mix(in srgb,var(--btn-fg) 22%,transparent);border-radius:0 999px 999px 0;background:none;color:inherit;cursor:pointer}
.cta>button svg{width:12px;height:12px}
.cta-menu{position:absolute;right:0;top:44px;min-width:200px;padding:6px;border-radius:14px;background:var(--bg);color:var(--fg);box-shadow:0 0 0 1px var(--line),0 16px 40px -12px rgba(0,0,0,.25);display:none}
.cta.open .cta-menu{display:block}
.cta-menu a{display:block;padding:8px 12px;border-radius:9px;font-size:14px;line-height:20px;text-decoration:none}
.cta-menu a:hover{background:var(--hover)}
.phone-only{display:none}

/* The three columns */
.shell{display:grid;grid-template-columns:288px minmax(0,1fr) 288px;max-width:1440px;margin:0 auto}
.side{position:sticky;top:80px;align-self:start;height:calc(100vh - 80px);overflow-y:auto;padding:16px 16px 48px;scrollbar-width:none}
.side::-webkit-scrollbar{display:none}
.group+.group{margin-top:28px}
.group-name{display:block;padding:6px 8px;font-size:13px;line-height:19.5px;font-weight:500;color:var(--fg)}
.side a{display:block;padding:6px 8px;border-radius:10px;font-size:13px;line-height:20px;font-weight:500;text-decoration:none;color:var(--muted);transition:color .15s,background .15s}
.side a:hover{color:var(--fg);background:var(--hover)}
.side a.on{color:var(--fg)}

main{min-width:0;padding:16px 0 96px}
.page{max-width:672px;margin-left:max(24px,calc(50% - 304px));margin-right:24px}
.eyebrow{margin:0;font-size:14px;line-height:24px;color:var(--fg)}
h1{margin:4px 0 0;font-size:48px;line-height:1.1;font-weight:500;letter-spacing:-.01em}
.acts{display:flex;align-items:center;gap:16px;margin:16px 0 28px}
.acts button,.acts a{display:inline-flex;align-items:center;gap:7px;padding:0;border:0;background:none;cursor:pointer;font-size:12px;line-height:16px;font-weight:600;color:var(--muted);text-decoration:none;transition:color .15s}
.acts button:hover,.acts a:hover{color:var(--fg)}
.acts svg{width:15px;height:15px}
.acts i{width:1px;height:16px;background:var(--line)}
.body{font-size:14px;line-height:24px}
.body p{margin:0 0 20px}
.body h2{margin:64px 0 18px;font-size:30px;line-height:1.25;font-weight:500;letter-spacing:-.01em}
.body h3{margin:36px 0 12px;font-size:24px;line-height:1.375;font-weight:500;letter-spacing:-.01em}
.body h2 .anchor,.body h3 .anchor{text-decoration:none}
.body a{font-weight:500;text-decoration:underline dotted;text-decoration-thickness:1px;text-underline-offset:3.5px}
.body a:hover{text-decoration-style:solid}
.body strong{font-weight:600}
.body ul,.body ol{margin:0 0 20px;padding-left:22px}
.body li{padding-left:6px;margin:0 0 8px}
.body ul li::marker{color:var(--faint)}
.body ol li::marker{color:var(--muted);font-weight:500}
.body blockquote{margin:0 0 24px;padding:0 0 0 16px;border-left:4px solid var(--accent);font-style:italic;color:var(--muted)}
.body blockquote p{margin:0}
.body code{padding:1px 5px;border-radius:5px;background:var(--code);font:500 12.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent)}
.table{margin:0 0 24px;overflow-x:auto}
.body table{width:100%;border-collapse:collapse;font-size:14px}
.body th{padding:10px 16px 10px 0;text-align:left;font-weight:500;border-bottom:1px solid var(--line)}
.body td{padding:12px 16px 12px 0;vertical-align:top;border-bottom:1px solid var(--line)}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:8px 0 0}
.card{display:flex;flex-direction:column;justify-content:space-between;gap:20px;padding:28px;border-radius:16px;background:var(--card);text-decoration:none!important;font-weight:400!important;transition:background .2s}
.card:hover{background:var(--card-hover)}
.card h3{margin:0;font-size:20px;line-height:28px;font-weight:500;letter-spacing:-.01em}
.card p{margin:8px 0 0;font-size:14px;line-height:24px}
.card .go{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:var(--muted)}
.card .go svg{width:13px;height:13px;transition:transform .2s}
.card:hover .go svg{transform:translateX(2px)}
.foot{margin-top:72px;padding-top:24px;border-top:1px solid var(--line);font-size:14px;line-height:20px;color:var(--muted)}

/* On this page */
.toc{position:sticky;top:80px;align-self:start;max-height:calc(100vh - 80px);overflow-y:auto;padding:16px 32px 48px 16px;scrollbar-width:none}
.toc-head{display:flex;align-items:center;justify-content:space-between;font-size:13px;line-height:20px;font-weight:500;margin-bottom:12px}
.toc-head svg{width:16px;height:16px;color:var(--muted)}
.toc a.t{display:block;padding:2px 0;font-size:12px;line-height:18px;text-decoration:none;color:var(--muted);transition:color .1s}
.toc a.t+a.t{margin-top:6px}
.toc a.t.l3{padding-left:12px}
.toc a.t:hover,.toc a.t.on{color:var(--fg)}
.toc-more{margin-top:16px;padding-top:16px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.toc-more a,.toc-more button{display:flex;align-items:center;gap:9px;padding:0;border:0;background:none;cursor:pointer;font-size:13px;line-height:20px;font-weight:500;color:var(--muted);text-decoration:none}
.toc-more a:hover,.toc-more button:hover{color:var(--fg)}
.toc-more svg{width:15px;height:15px}

/* Search */
.find{position:fixed;inset:0;z-index:50;display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;background:var(--shade)}
.find.open{display:flex}
.find-box{width:min(640px,100%);max-height:70vh;display:flex;flex-direction:column;border-radius:18px;background:var(--bg);box-shadow:0 0 0 1px var(--line),0 30px 80px -20px rgba(0,0,0,.4);overflow:hidden}
.find-in{display:flex;align-items:center;gap:10px;padding:0 16px;border-bottom:1px solid var(--line)}
.find-in svg{width:18px;height:18px;color:var(--muted);flex:none}
.find-in input::-webkit-search-cancel-button{display:none}
.find-in input{flex:1;height:56px;border:0;outline:0;background:none;font:400 16px Inter,system-ui,sans-serif;color:var(--fg)}
.find-in kbd{font:500 11px Inter,system-ui,sans-serif;padding:3px 6px;border-radius:6px;box-shadow:0 0 0 1px var(--line);color:var(--muted)}
.hits{overflow-y:auto;padding:8px}
.hit{display:block;padding:10px 12px;border-radius:10px;text-decoration:none}
.hit.sel,.hit:hover{background:var(--hover)}
.hit b{display:block;font-size:14px;font-weight:500}
.hit small{display:block;margin-top:2px;font-size:12px;line-height:18px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hit em{font-style:normal;color:var(--fg);font-weight:500}
.none{padding:28px 12px;text-align:center;font-size:14px;color:var(--muted)}
.toast{position:fixed;left:50%;bottom:28px;z-index:60;transform:translate(-50%,12px);padding:10px 16px;border-radius:999px;background:var(--btn);color:var(--btn-fg);font-size:13px;font-weight:500;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.toast.on{opacity:1;transform:translate(-50%,0)}

@media (max-width:1200px){.shell{grid-template-columns:260px minmax(0,1fr)}.toc{display:none}.page{margin:0 auto;padding:0 40px}}
@media (max-width:900px){
  .top{height:72px;padding:0 20px}
  .tabs,.search,.cta,.theme{display:none}
  .phone-only{display:grid}
  .shell{display:block}
  .side{position:fixed;inset:72px 0 0 0;z-index:25;align-self:auto;height:auto;padding:12px 20px 48px;background:var(--bg);display:none}
  body.menu .side{display:block}
  body.menu{overflow:hidden}
  main{padding:20px 0 72px}
  .page{padding:0 24px}
  .eyebrow{font-size:16px}
  h1{font-size:40px}
  .body{font-size:16px;line-height:26px}
  .body h2{font-size:26px;margin-top:52px}
  .body h3{font-size:21px}
  .cards{grid-template-columns:1fr}
  .side a,.group-name{font-size:15px;padding:8px 8px}
  .phone-extra{display:block!important;margin-top:28px}
}
.phone-extra{display:none}
"""

JS = r"""
(function(){
  var root = document.documentElement, body = document.body;
  // the theme: the person's choice, else the system's
  var theme = document.querySelector('.theme');
  if (theme) theme.addEventListener('click', function(){
    var dark = root.dataset.theme !== 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('docs-theme', root.dataset.theme); } catch (e) {}
  });
  // Download's menu
  var cta = document.querySelector('.cta');
  if (cta) {
    cta.querySelector('button').addEventListener('click', function(e){ e.stopPropagation(); cta.classList.toggle('open'); });
    document.addEventListener('click', function(){ cta.classList.remove('open'); });
  }
  // the phone's menu
  var menu = document.querySelector('.menu-btn');
  if (menu) menu.addEventListener('click', function(){ body.classList.toggle('menu'); menu.setAttribute('aria-expanded', body.classList.contains('menu')); });
  // Copy for LLM: the page's Markdown, with its title
  var toast = document.querySelector('.toast');
  function say(t){ toast.textContent = t; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(function(){ toast.classList.remove('on'); }, 1600); }
  document.querySelectorAll('[data-copy]').forEach(function(b){
    b.addEventListener('click', function(){
      var md = document.getElementById('md').textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject()).then(function(){ say('Copied for LLM'); }, function(){ say('Could not copy'); });
    });
  });
  // On this page: the line for the section you're reading darkens
  var links = [].slice.call(document.querySelectorAll('.toc a.t'));
  var heads = links.map(function(a){ return document.getElementById(a.hash.slice(1)); });
  function spy(){
    var on = 0;
    heads.forEach(function(h, i){ if (h && h.getBoundingClientRect().top < 140) on = i; });
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) on = heads.length - 1;
    links.forEach(function(a, i){ a.classList.toggle('on', i === on && scrollY > 40); });
  }
  if (links.length) { addEventListener('scroll', spy, { passive: true }); spy(); }
  // Search: every page's sections, from search.json
  var find = document.querySelector('.find'), input = find.querySelector('input'), hits = find.querySelector('.hits'), index = null, sel = 0;
  function open(){ find.classList.add('open'); input.value = ''; input.focus(); draw();
    if (!index) fetch('/docs/search.json').then(function(r){ return r.json(); }).then(function(d){ index = d; draw(); }); }
  function close(){ find.classList.remove('open'); }
  function esc(s){ return s.replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function draw(){
    var q = input.value.trim().toLowerCase();
    if (!index) { hits.innerHTML = '<div class="none">Loading…</div>'; return; }
    var words = q.split(/\s+/).filter(Boolean), out = [];
    index.forEach(function(s){
      var hay = (s.page + ' ' + s.head + ' ' + s.text).toLowerCase();
      if (!words.every(function(w){ return hay.indexOf(w) >= 0; })) return;
      var score = words.reduce(function(n, w){ return n + ((s.page + ' ' + s.head).toLowerCase().indexOf(w) >= 0 ? 3 : 1); }, 0);
      var at = words.length ? s.text.toLowerCase().indexOf(words[0]) : 0, snip = s.text.slice(Math.max(0, at - 40), at + 110);
      out.push({ s: s, score: score, snip: (at > 40 ? '…' : '') + snip });
    });
    out.sort(function(a, b){ return b.score - a.score; });
    out = out.slice(0, q ? 12 : 8); sel = 0;
    if (!out.length) { hits.innerHTML = '<div class="none">No results for “' + esc(input.value) + '”</div>'; return; }
    hits.innerHTML = out.map(function(o, i){
      var snip = esc(o.snip);
      words.forEach(function(w){ snip = snip.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<em>$1</em>'); });
      return '<a class="hit' + (i ? '' : ' sel') + '" href="' + o.s.url + '"><b>' + esc(o.s.page) + (o.s.head ? ' › ' + esc(o.s.head) : '') + '</b><small>' + snip + '</small></a>';
    }).join('');
  }
  input.addEventListener('input', draw);
  input.addEventListener('keydown', function(e){
    var all = hits.querySelectorAll('.hit');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!all.length) return;
      all[sel].classList.remove('sel'); sel = (sel + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length; all[sel].classList.add('sel'); all[sel].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && all[sel]) location.href = all[sel].href;
  });
  find.addEventListener('click', function(e){ if (e.target === find) close(); });
  document.querySelectorAll('[data-find]').forEach(function(b){ b.addEventListener('click', open); });
  addEventListener('keydown', function(e){
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); find.classList.contains('open') ? close() : open(); }
    else if (e.key === 'Escape') { close(); body.classList.remove('menu'); }
  });
  var kbd = document.querySelector('.search kbd');
  if (kbd && !/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) kbd.textContent = 'Ctrl+K';
})();
"""


def sidebar(pages, current):
    out = []
    for group, slugs in PAGES:
        links = "".join(f'<a href="{pages[s]["url"]}"{" class=on aria-current=page" if s == current else ""}>{html.escape(pages[s]["nav"])}</a>' for s in slugs)
        out.append(f'<div class="group"><span class="group-name">{html.escape(group)}</span>{links}</div>')
    extra = "".join(f'<a href="{h}">{t}</a>' for t, h in TABS[1:]) + f'<a href="{MAC_DOWNLOAD}">Download for macOS</a>'
    return "".join(out) + f'<div class="group phone-extra"><span class="group-name">SimeonLabs</span>{extra}</div>'


def toc(heads):
    if not heads:
        return ""
    items = "".join(f'<a class="t l{lv}" href="#{hid}">{html.escape(re.sub(r"[*`]", "", text))}</a>' for lv, hid, text in heads)
    return (f'<div class="toc-head">On this page{ICON["list"]}</div>{items}'
            f'<div class="toc-more"><button type="button" data-copy>{ICON["copy"]}Copy for LLM</button><a href="/contact">{ICON["talk"]}Share feedback</a></div>')


def page(p, pages):
    body, heads = render(p["body"])
    title = p["title"] if p["slug"] != "overview" else "Overview"
    tabs = "".join(f'<a href="{h}"{" class=on" if t == "Docs" else ""}>{t}</a>' for t, h in TABS)
    md = f"# {p['title']}\n\n{p['body']}\n"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)} | Simeon Docs</title>
<meta name="description" content="{html.escape(p['description'])}">
<link rel="canonical" href="{SITE}{p['url']}">
<meta property="og:type" content="article">
<meta property="og:url" content="{SITE}{p['url']}">
<meta property="og:title" content="{html.escape(title)} | Simeon Docs">
<meta property="og:description" content="{html.escape(p['description'])}">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="text/markdown" href="{p['url'] if p['slug'] != 'overview' else '/docs/overview'}.md">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..600&display=swap">
<script>try{{var t=localStorage.getItem('docs-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}}catch(e){{}}</script>
<style>{CSS}</style>
</head>
<body>
<header class="top">
  <a class="logo" href="/" aria-label="SimeonLabs"></a>
  <nav class="tabs" aria-label="SimeonLabs">{tabs}</nav>
  <div class="right">
    <button class="icon-btn theme" type="button" aria-label="Switch theme">{ICON['moon']}{ICON['sun']}</button>
    <button class="search" type="button" data-find>{ICON['search']}<span>Search</span><kbd>⌘K</kbd></button>
    <div class="cta"><a href="{MAC_DOWNLOAD}">Download</a><button type="button" aria-label="More">{ICON['chev']}</button>
      <div class="cta-menu"><a href="{MAC_DOWNLOAD}">Download for macOS</a><a href="{LOG_IN}">Log in</a><a href="/contact">Contact sales</a></div></div>
    <button class="icon-btn phone-only" type="button" data-find aria-label="Search">{ICON['search']}</button>
    <button class="icon-btn phone-only menu-btn" type="button" aria-label="Menu" aria-expanded="false">{ICON['menu']}</button>
  </div>
</header>
<div class="shell">
  <nav class="side" aria-label="Documentation">{sidebar(pages, p['slug'])}</nav>
  <main>
    <article class="page">
      <p class="eyebrow">{html.escape(p['eyebrow'])}</p>
      <h1>{html.escape(p['title'])}</h1>
      <div class="acts"><button type="button" data-copy>{ICON['copy']}Copy for LLM</button><i></i><a href="{p['url'] if p['slug'] != 'overview' else '/docs/overview'}.md">{ICON['md']}View as Markdown</a></div>
      <div class="body">
{body}
      </div>
      <p class="foot">Last updated: {updated(p['slug'])}</p>
    </article>
  </main>
  <aside class="toc">{toc(heads)}</aside>
</div>
<div class="find" role="dialog" aria-label="Search the docs"><div class="find-box"><label class="find-in">{ICON['search']}<input type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></label><div class="hits"></div></div></div>
<div class="toast" role="status"></div>
<script type="text/markdown" id="md">{html.escape(md)}</script>
<script>{JS}</script>
</body>
</html>
"""


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
    pages = {s: read(s) for _, slugs in PAGES for s in slugs}
    root = os.path.join(out, "docs")
    os.makedirs(root, exist_ok=True)
    for s, p in pages.items():
        folder = root if s == "overview" else os.path.join(root, s)
        os.makedirs(folder, exist_ok=True)
        open(os.path.join(folder, "index.html"), "w", encoding="utf-8").write(page(p, pages))
        # View as Markdown: the page's words as written, at /docs/<slug>.md
        open(os.path.join(root, f"{s}.md"), "w", encoding="utf-8").write(f"# {p['title']}\n\n{p['body']}\n")
    json.dump(search_index(pages), open(os.path.join(root, "search.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"docs written to {root}: {len(pages)} page(s)")


if __name__ == "__main__":
    build()
