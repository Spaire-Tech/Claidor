"""Builds the website's Newsroom (/newsroom), the blog.

The founder, 29 October 2026, after Apple's Newsroom and Apple Stories: "I
want to create a Newsroom page. that will be the blog … build it with
placeholders for now. only surface level". Then, of the first version (a
Latest News part on grey and a Stories part on white): "there's no stories. or
latest news … its just newsroom. retake that stories design … make an effort
with the style, the font size … the colors … if a background changes, change
it gradually".

And of its opening, after a news page whose newest post opens it: "maybe
have the hero like this. instead of newsroom and the description".

So one page, Newsroom, in Apple Stories' layout and the site's own measures.
It opens with the newest post where every page has its headline (the home
page's opening): on the left its date, its headline large on two lines, one
line on it and Read more; on the right its picture, its name set over it in
white. Then the posts down the column: a lead story across it, its words over its
picture; three stories as squares with their words under them, as the home
page's rows of cards; a quoted story, the quote on the site's panel and the
picture beside it, the one fading into the other; three more stories with
their words over their pictures. One white ground, the cards' 28-point
corners, titles in medium and headlines regular, never bold; the labels and
dates in the second grey, no colours of their own. The page ends on the white
footer every page shares (nav.py).

Every post is in POSTS, in the order it is shown within its place; the stand-ins
went on 31 October 2026 (the founder: "remove all the fake post in newroom. i
want only one and it's introducing Simeon"), so the page shows that one post in
its opening and nothing under it until there are more. While any post is a
stand-in (`placeholder`), the page asks search engines not to list it.

A post with `text` has its own page, /newsroom/<slug>, after OpenAI's
"Introducing dots" (the founder's reference, 30 October 2026: "an image for all
titles"): its date and kinds, its headline large and centred, Download for macOS
and Contact Sales, Share along a hairline, then its words in a column, the first
line in bold, each picture a little wider than the words, and the home page's
closing call. The words are a file of their own (source/news/<slug>.md, read by
`article`: a paragraph per block, "## " a section's title, "> " a line set apart,
"![words](file)" a picture from source/img/news/<slug>/, **bold** and [a
link](/address) within a paragraph). The pictures are copied to
public/img/news/ here, so this script runs alone. On a phone the page is laid out
as roomily as Dots' is on one (the founder, 31 October 2026: "Look how spacious
dots is. Ours is too tight. Also add simeon avatar up there. Like dots. No need
to do that in mac"): a post's `face`, a cut-out from its pictures, stands over
its date there, and only there.

It rewrites public/newsroom/ from scratch; build.py calls it after contact.py,
and it runs alone too, needing nothing but Python:

    python3 newsroom.py
"""
import datetime, html, os, re, shutil, sys

import teams
from nav import MAC_DOWNLOAD
from teams import frame
from versioning import version_style

OUT = teams.OUT

# Where each post goes: "hero" (the page's opening), "lead" (across the column, its words over the picture), "tile"
# (a square, its words under it, three to a row), "quote" (its quote beside the picture) or "over" (three to a row,
# the words over the picture). Each but the hero has a `kind` (Customers, Product…) over its title.
POSTS = [
    # The newest post, the page's opening: its headline breaks where it has "\n", and `mark` is its name set
    # over its picture (none: the picture alone, which says it already).
    {"place": "hero", "slug": "introducing-simeon", "title": "Introducing\nSimeon",
     "summary": "A team of AI agents that you hire, talk to, and give work to.",
     "kinds": ["Product", "Company"], "date": "2026-10-30", "url": "/newsroom/introducing-simeon",
     "image": "/img/news/introducing-simeon/hero.webp", "text": "news/introducing-simeon.md", "face": "simeon.webp",
     "alt": "Clay faces of agents around the word Simeon, each with a cursor pointing at it"},
]

NEWSROOM_CSS = """
/* The Newsroom (newsroom.py): the posts down the column in Apple Stories' layout, in the site's measures (the home
   page's 28-point corners, its rows of three with 20 between, its panel #fafafb). One white ground; where a ground
   meets another (a picture's shade, the quote's panel and its picture) it fades. */
.nw-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* The opening: the newest post, its words on the left beside its picture, the two centred on each other. Its
   headline a size over the pages' (the picture beside it is large), regular as every headline. */
.nw-top{display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);align-items:center;gap:clamp(32px,5*var(--vw,1vw),96px)}
.nw-top .nw-date{margin:0;font-size:var(--t-body)}
.nw-top h2{margin-top:clamp(10px,.9*var(--vw,1vw),16px);font-size:clamp(32px,3*var(--vw,1vw),56px);line-height:1.06;font-weight:var(--w-display);letter-spacing:-.035em}
.nw-sum{margin-top:clamp(14px,1.4*var(--vw,1vw),24px);max-width:24em;font-size:var(--t-lead);line-height:1.4;text-wrap:pretty}
.nw-top .btn{margin-top:clamp(22px,2.2*var(--vw,1vw),36px);height:var(--btn-h);padding:0 calc(var(--btn-pad) - 4px) 0 var(--btn-pad);font-size:var(--btn-font)}
.nw-top .btn svg{width:.75em;height:.75em;margin-left:.1em;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.nw-art{position:relative;display:grid;place-items:center;aspect-ratio:1260/660;overflow:hidden;border-radius:28px;background:var(--soft);container-type:inline-size;color:#fff;text-decoration:none}
.nw-art b{position:relative;z-index:1;padding:0 6cqw;font-size:7.2cqw;line-height:1.05;font-weight:var(--w-display);letter-spacing:-.035em;text-align:center;text-wrap:balance;text-shadow:0 2px 24px rgba(0,0,0,.16)}
a.nw-art:focus-visible{outline:2px solid var(--blue);outline-offset:4px}

.nw-posts{display:flex;flex-direction:column;gap:clamp(40px,4*var(--vw,1vw),72px);margin-top:clamp(56px,5.6*var(--vw,1vw),112px)}
.nw-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.nw-kicker{font-size:var(--t-small);line-height:1.3;font-weight:var(--w-title);letter-spacing:-.005em;color:var(--ink2)}
.nw-date{display:block;margin-top:8px;font-size:var(--t-small);line-height:1.3;color:var(--ink2)}
.nw-img{position:relative;overflow:hidden;background:var(--soft)}
.nw-img img,.nw-over>img,.nw-art>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.7,.2,1)}
a:hover>.nw-img img,a:hover>img{transform:scale(1.025)}
a.nw-over:focus-visible,a.nw-tile:focus-visible,a.nw-quote:focus-visible{outline:2px solid var(--blue);outline-offset:4px}

/* A story over its picture: the shade rises from the foot in even steps, and the words sit on it. */
.nw-over{position:relative;display:block;overflow:hidden;border-radius:28px;background:#2c2c2e;color:#fff;text-decoration:none;isolation:isolate}
.nw-over::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
  background:linear-gradient(to top,rgba(0,0,0,.5) 0%,rgba(0,0,0,.42) 12%,rgba(0,0,0,.32) 24%,rgba(0,0,0,.21) 36%,rgba(0,0,0,.12) 48%,rgba(0,0,0,.05) 60%,rgba(0,0,0,0) 72%)}
.nw-over .nw-text{position:absolute;z-index:2;left:0;right:0;bottom:0;padding:clamp(20px,2.4*var(--vw,1vw),40px);text-shadow:0 1px 14px rgba(0,0,0,.25)}
.nw-over .nw-kicker,.nw-over .nw-date{color:rgba(255,255,255,.74)}
.nw-over.lead{aspect-ratio:1260/700}
.nw-over.lead .nw-kicker,.nw-over.lead .nw-date{font-size:var(--t-body)}
.nw-over.lead h2{margin-top:8px;max-width:17em;font-size:var(--t-display);line-height:1.12;font-weight:var(--w-display);letter-spacing:-.025em;text-wrap:balance}
.nw-over.small{aspect-ratio:4/5}
.nw-over.small h3{margin-top:6px;font-size:var(--t-head);line-height:1.25;font-weight:var(--w-title);letter-spacing:-.015em;text-wrap:balance}

/* A story under its picture, as the home page's cards: a square, the words 22 under it. */
.nw-tile{display:block;color:inherit;text-decoration:none}
.nw-tile .nw-img{aspect-ratio:1;border-radius:28px}
.nw-tile .nw-text{padding:22px 4px 0}
.nw-tile h3{margin-top:6px;font-size:var(--t-head);line-height:1.25;font-weight:var(--w-title);letter-spacing:-.015em;text-wrap:balance}

/* A quoted story: the quote on the panel, the picture beside it, the panel's grey fading into the picture. */
.nw-quote{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);aspect-ratio:1260/620;overflow:hidden;border-radius:28px;background:#fafafb;color:inherit;text-decoration:none}
.nw-quote .nw-text{display:flex;flex-direction:column;padding:clamp(28px,3.4*var(--vw,1vw),60px)}
.nw-quote blockquote{margin-top:auto;max-width:15em;font-size:var(--t-display);line-height:1.15;font-weight:var(--w-display);letter-spacing:-.025em;text-wrap:balance}
.nw-by{margin-top:16px;font-size:var(--t-body);line-height:1.4;color:var(--ink2);white-space:pre-line}
.nw-read{display:inline-flex;align-items:center;align-self:flex-start;height:var(--btn-h);margin-top:auto;padding:0 var(--btn-pad);border-radius:99px;background:rgba(0,0,0,.05);color:var(--ink);font-size:var(--btn-font);transition:background .2s}
a:hover .nw-read{background:rgba(0,0,0,.08)}
.nw-quote .nw-story{margin-top:14px;font-size:var(--t-body);font-weight:var(--w-title)}
.nw-quote .nw-img{background:#fafafb}
.nw-quote .nw-img::before{content:"";position:absolute;z-index:1;top:0;bottom:0;left:0;width:30%;pointer-events:none;
  background:linear-gradient(to right,#fafafb 0%,rgba(250,250,251,.86) 14%,rgba(250,250,251,.62) 30%,rgba(250,250,251,.36) 48%,rgba(250,250,251,.14) 68%,rgba(250,250,251,0) 100%)}

/* Room before the footer. */
.nw-end{height:clamp(32px,3*var(--vw,1vw),60px);margin-top:clamp(64px,6*var(--vw,1vw),120px)}
footer{margin-top:0}

@media (max-width:734px){
  .nw-top{grid-template-columns:1fr;gap:28px}
  .nw-row{grid-template-columns:1fr;gap:28px}
  .nw-art,.nw-over,.nw-tile .nw-img,.nw-quote{border-radius:22px}
  .nw-over.lead{aspect-ratio:4/5.4}
  .nw-tile .nw-img{aspect-ratio:4/3}
  .nw-tile .nw-text{padding-top:16px}
  .nw-quote{grid-template-columns:1fr;aspect-ratio:auto}
  .nw-quote .nw-img{order:-1;aspect-ratio:4/3}
  .nw-quote .nw-img::before{top:auto;right:0;width:auto;height:34%;
    background:linear-gradient(to top,#fafafb 0%,rgba(250,250,251,.86) 14%,rgba(250,250,251,.62) 30%,rgba(250,250,251,.36) 48%,rgba(250,250,251,.14) 68%,rgba(250,250,251,0) 100%)}
  .nw-quote .nw-text{padding:4px 24px 28px}
  .nw-quote blockquote{margin-top:12px}
  .nw-read{margin-top:28px}
}
@media (prefers-reduced-motion:reduce){.nw-img img,.nw-over>img,.nw-art>img{transition:none}}
"""


def esc(text):
    return html.escape(text, quote=True)


def when(post):
    """The post's day, short: Oct 23, 2026."""
    day = datetime.date.fromisoformat(post["date"])
    return f"{day:%b} {day.day}, {day.year}"


def date(post):
    return f'<time class="nw-date" datetime="{post["date"]}">{when(post)}</time>'


def picture(post, lazy=True):
    loading = ' loading="lazy"' if lazy else ""
    return f'<img src="{esc(post["image"])}" alt="{esc(post.get("alt", ""))}"{loading}>'


def opening(post, cls):
    """A post's card opens as a link to its page, or, before it has one, as a plain block."""
    if post.get("url"):
        return f'<a class="{cls}" href="{esc(post["url"])}">', "</a>"
    return f'<div class="{cls}">', "</div>"


def kicker(post):
    return f'<p class="nw-kicker">{esc(post["kind"])}</p>'


CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5"/></svg>'


def hero(post):
    """The newest post, opening the page: its words beside its picture; Read more and the picture lead to it once it has a page."""
    title = esc(post["title"]).replace("\n", "<br>")
    mark = f'<b>{esc(post["mark"])}</b>' if post.get("mark") else ""
    if post.get("url"):
        url = esc(post["url"])
        more = f'<a class="btn" href="{url}">Read more{CHEVRON}</a>'
        art = f'<a class="nw-art" href="{url}" tabindex="-1" aria-hidden="true">{picture(post, lazy=False)}{mark}</a>'
    else:
        more = f'<span class="btn">Read more{CHEVRON}</span>'
        art = f'<div class="nw-art">{picture(post, lazy=False)}{mark}</div>'
    return (f'<div class="nw-top"><div>{date(post)}<h2>{title}</h2><p class="nw-sum">{esc(post["summary"])}</p>{more}</div>'
            f'{art}</div>')


def lead(post):
    start, end = opening(post, "nw-over lead")
    return f'{start}{picture(post, lazy=False)}<div class="nw-text">{kicker(post)}<h2>{esc(post["title"])}</h2>{date(post)}</div>{end}'


def tile(post):
    start, end = opening(post, "nw-tile")
    return f'{start}<div class="nw-img">{picture(post)}</div><div class="nw-text">{kicker(post)}<h3>{esc(post["title"])}</h3>{date(post)}</div>{end}'


def quote(post):
    start, end = opening(post, "nw-quote")
    return (f'{start}<div class="nw-text">{kicker(post)}<blockquote>“{esc(post["quote"])}”</blockquote>'
            f'<p class="nw-by">{esc(post["by"])}</p><span class="nw-read">Read story</span><p class="nw-story">{esc(post["title"])}</p></div>'
            f'<div class="nw-img">{picture(post)}</div>{end}')


def over(post):
    start, end = opening(post, "nw-over small")
    return f'{start}{picture(post)}<div class="nw-text">{kicker(post)}<h3>{esc(post["title"])}</h3>{date(post)}</div>{end}'


def placed(place):
    return [post for post in POSTS if post["place"] == place]


def row(items):
    return f'<div class="nw-row">{"".join(items)}</div>' if items else ""


def page():
    blocks = ["".join(lead(post) for post in placed("lead")),
              row([tile(post) for post in placed("tile")]),
              "".join(quote(post) for post in placed("quote")),
              row([over(post) for post in placed("over")])]
    posts = "\n    ".join(block for block in blocks if block)
    opening = "".join(hero(post) for post in placed("hero"))
    body = f"""<section class="hero" aria-labelledby="newsroom">
  <div class="wrap">
    <h1 class="nw-sr" id="newsroom">Newsroom</h1>
    {opening}
    {f'<div class="nw-posts">{chr(10)}    {posts}{chr(10)}    </div>' if posts else ""}
  </div>
</section>
<div class="nw-end" aria-hidden="true"></div>"""
    hero_css, _ = teams.home_hero()
    # Stand-ins are not for search engines; the page is listed once every post on it is real.
    head = '\n<meta name="robots" content="noindex">' if any(post.get("placeholder") for post in POSTS) else ""
    return frame("Newsroom", "News from SimeonLabs, and the people putting their agents to work.",
                 "/newsroom", body, hero_css + NEWSROOM_CSS, head=head, current="newsroom")


# A post's own page (`post_page`): the words in a column of 680, each picture a little wider (1140 at most).
POST_CSS = """
/* A post's page (newsroom.py, after OpenAI's "Introducing dots"): its date and kinds, its headline large and centred,
   the two buttons, Share on a hairline, then the words in a column, the pictures wider than the words. */
.np{padding:clamp(48px,6*var(--vw,1vw),112px) 0 0}
.np-head{text-align:center}
.np-meta{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 18px;margin:0;font-size:var(--t-body);color:var(--ink2)}
.np-meta time{color:var(--ink)}
.np-head h1{margin-top:clamp(14px,1.3*var(--vw,1vw),24px);font-size:clamp(40px,4.4*var(--vw,1vw),80px);line-height:1.05;font-weight:var(--w-display);letter-spacing:-.035em;text-wrap:balance}
.np-ctas{display:flex;justify-content:center;flex-wrap:wrap;gap:clamp(10px,.7*var(--vw,1vw),14px);margin-top:clamp(22px,2*var(--vw,1vw),36px)}
.np-ctas .btn{height:var(--btn-h);padding:0 var(--btn-pad);font-size:var(--btn-font)}
.np-body{margin-top:clamp(48px,5*var(--vw,1vw),96px)}
.np-body>*{max-width:680px;margin-left:auto;margin-right:auto}
.np-bar{display:flex;justify-content:flex-end;padding-top:14px;border-top:1px solid #e8e8ed}
.np-share{display:inline-flex;align-items:center;gap:7px;padding:4px 2px;border:0;background:none;font:inherit;font-size:var(--t-body);color:var(--ink);cursor:pointer}
.np-share svg{width:17px;height:17px}
.np-share:focus-visible{outline:2px solid var(--blue);outline-offset:3px;border-radius:6px}
.np-body p{margin-top:1.15em;font-size:clamp(17px,1.15*var(--vw,1vw),19px);line-height:1.6;letter-spacing:-.012em;text-wrap:pretty}
.np-body p.np-lead{margin-top:clamp(36px,3.4*var(--vw,1vw),60px)}
.np-body p b{font-weight:600}
.np-body a{color:var(--blue);text-decoration:none}
.np-body a:hover{text-decoration:underline}
.np-body h2{margin-top:clamp(64px,6*var(--vw,1vw),112px);font-size:clamp(26px,2.1*var(--vw,1vw),36px);line-height:1.15;font-weight:var(--w-display);letter-spacing:-.025em;text-wrap:balance}
.np-body h2+p{margin-top:clamp(18px,1.6*var(--vw,1vw),28px)}
.np-body blockquote{margin-top:1.3em;font-size:clamp(22px,1.8*var(--vw,1vw),30px);line-height:1.3;font-weight:var(--w-display);letter-spacing:-.02em;text-wrap:balance}
.np-body figure{max-width:1140px;margin-top:clamp(40px,4*var(--vw,1vw),72px);margin-bottom:clamp(40px,4*var(--vw,1vw),72px)}
.np-body figure img{display:block;width:100%;height:auto;border-radius:clamp(18px,1.8*var(--vw,1vw),28px)}
.np-body figure+figure{margin-top:clamp(16px,1.6*var(--vw,1vw),28px)}
.np-end{height:clamp(24px,2.4*var(--vw,1vw),48px)}
footer{margin-top:0}
/* The post's face, over its date, on a phone only; its foot fades into the page, as the cut-out stops at the waist. */
.np-face{display:none}
/* A phone: Dots' room, read off its page on an iPhone (the face 36 above the date, the headline smaller and 28 under it,
   the buttons 30 under that, 72 to the hairline, 56 from Share to the first line). */
@media (max-width:734px){
  .np-face{display:block;width:auto;height:136px;margin:0 auto 36px;-webkit-mask-image:linear-gradient(180deg,#000 64%,transparent 98%);mask-image:linear-gradient(180deg,#000 64%,transparent 98%)}
  .np-head h1{margin-top:28px;font-size:36px}
  .np-ctas{margin-top:30px;gap:8px}
  .np-ctas .btn{padding:0 14px} /* side by side, as Dots' are, from a 375-wide phone up */
  .np-body{margin-top:72px}
  .np-body p.np-lead{margin-top:56px}
}
"""

SHARE_ICON = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M8.6 11.4a3.4 3.4 0 0 0 4.8 0l2.6-2.6a3.4 3.4 0 0 0-4.8-4.8l-1.2 1.2"/><path d="M11.4 8.6a3.4 3.4 0 0 0-4.8 0L4 11.2a3.4 3.4 0 0 0 4.8 4.8l1.2-1.2"/></svg>'

SHARE_JS = """<script>
// Share: the phone's own sheet where there is one, else the address copied, "Link copied" for two seconds.
(() => {
  const button = document.querySelector('.np-share');
  if (!button) return;
  const label = button.querySelector('span');
  button.addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    if (navigator.share && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share({ title: document.title, url }); } catch (_) {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      label.textContent = 'Link copied';
      setTimeout(() => { label.textContent = 'Share'; }, 2000);
    } catch (_) {}
  });
})();
</script>"""


def _webp_size(path):
    """A WebP picture's width and height, read from its header (lossy, lossless or extended), or None."""
    data = open(path, "rb").read(30)
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    kind = data[12:16]
    if kind == b"VP8X":
        return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
    if kind == b"VP8 ":
        return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
    if kind == b"VP8L":
        bits = int.from_bytes(data[21:25], "little")
        return 1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)
    return None


def _inline(text):
    """A paragraph's words as the site writes them: typographic quotes and apostrophes, **bold**, [a link](/address)."""
    text = html.escape(text, quote=False)
    text = re.sub(r"(?<=\w)'(?=\w)", "\u2019", text)
    text = re.sub(r"(^|[\s(])'", "\\1\u2018", text).replace("'", "\u2019")
    text = re.sub(r'"([^"]*)"', "\u201c\\1\u201d", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    return re.sub(r"\[([^\]]+)\]\((/[^)\s]*|https://[^)\s]+)\)", r'<a href="\2">\1</a>', text)


def article(post):
    """The post's words and pictures (source/news/<slug>.md), as HTML; the first paragraph is its lead."""
    blocks = [b.strip() for b in teams._text(os.path.join(teams.HERE, post["text"])).split("\n\n") if b.strip()]
    if not blocks:
        sys.exit(f"newsroom.py: {post['text']} has no words")
    out, lead = [], True
    for block in blocks:
        figure = re.fullmatch(r"!\[([^\]]*)\]\(([\w.-]+)\)", block)
        if figure:
            alt, file = figure.groups()
            src = os.path.join(teams.HERE, "img", "news", post["slug"], file)
            size = _webp_size(src) if os.path.isfile(src) else None
            if not size:
                sys.exit(f"newsroom.py: {post['text']} shows {file}, not found in source/img/news/{post['slug']}/")
            lazy = ' loading="lazy"' if len(out) >= 3 else ""
            out.append(f'<figure><img src="/img/news/{post["slug"]}/{file}?v={teams._version(src)}" alt="{esc(alt)}" '
                       f'width="{size[0] // 2}" height="{size[1] // 2}"{lazy}></figure>')
        elif block.startswith("## "):
            out.append(f"<h2>{_inline(block[3:])}</h2>")
        elif block.startswith("> "):
            out.append(f"<blockquote>{_inline(block[2:])}</blockquote>")
        else:
            cls = ' class="np-lead"' if lead else ""
            out.append(f'<p{cls}>{_inline(" ".join(block.split()))}</p>')
            lead = False
    return "\n    ".join(out)


def post_page(post):
    """/newsroom/<slug>: the post itself."""
    headline = post["title"].replace("\n", " ")
    kinds = "".join(f"<span>{esc(kind)}</span>" for kind in post.get("kinds", []))
    day = datetime.date.fromisoformat(post["date"])
    _, close, home_css = teams.from_home()
    ctas = (f'<a class="btn" href="{MAC_DOWNLOAD}">Download for macOS{teams.DOWNLOAD}</a>'
            '<a class="btn ghost" href="/contact">Contact Sales</a>')
    face = ""
    if post.get("face"):
        src = os.path.join(teams.HERE, "img", "news", post["slug"], post["face"])
        size = _webp_size(src) if os.path.isfile(src) else None
        if not size:
            sys.exit(f"newsroom.py: {post['slug']}'s face {post['face']} is not in source/img/news/{post['slug']}/")
        face = (f'<img class="np-face" src="/img/news/{post["slug"]}/{post["face"]}?v={teams._version(src)}" alt="" '
                f'width="{size[0]}" height="{size[1]}">\n      ')
    body = f"""<article class="np" aria-labelledby="post-title">
  <div class="wrap">
    <header class="np-head">
      {face}<p class="np-meta"><time datetime="{post["date"]}">{day:%B} {day.day}, {day.year}</time>{kinds}</p>
      <h1 id="post-title">{esc(headline)}</h1>
      <div class="np-ctas">{ctas}</div>
    </header>
    <div class="np-body">
    <div class="np-bar"><button class="np-share" type="button">{SHARE_ICON}<span>Share</span></button></div>
    {article(post)}
    </div>
  </div>
</article>
<div class="np-end" aria-hidden="true"></div>
{close}"""
    image = f'\n<meta property="og:image" content="{teams.SITE}{post["image"]}">'
    return frame(headline, esc(post["summary"]), post["url"], body, home_css + POST_CSS, head=image,
                 current="newsroom", script=SHARE_JS)


def build(out=OUT):
    teams.copy_site_css(out)
    root = os.path.join(out, "newsroom")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page(), out))
    # Each post with words of its own: its page, and its pictures (build.py copies source/img too).
    pictures = os.path.join(teams.HERE, "img", "news")
    if os.path.isdir(pictures):
        shutil.rmtree(os.path.join(out, "img", "news"), ignore_errors=True)
        shutil.copytree(pictures, os.path.join(out, "img", "news"))
    for post in POSTS:
        if post.get("text"):
            os.makedirs(f"{root}/{post['slug']}")
            open(f"{root}/{post['slug']}/index.html", "w", encoding="utf-8").write(version_style(post_page(post), out))
    print(f"newsroom written to {os.path.abspath(root)}")


if __name__ == "__main__":
    build()
