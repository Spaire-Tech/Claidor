"""Builds the website's Newsroom (/newsroom), the blog.

The founder, 29 October 2026, after Apple's Newsroom and Apple Stories: "I
want to create a Newsroom page. that will be the blog … build it with
placeholders for now. only surface level". Then, of the first version (a
Latest News part on grey and a Stories part on white): "there's no stories. or
latest news … its just newsroom. retake that stories design … make an effort
with the style, the font size … the colors … if a background changes, change
it gradually".

So one page, Newsroom, in Apple Stories' layout and the site's own measures:
the headline and its line where every page has them (the home page's opening);
then the posts down the column: a lead story across it, its words over its
picture; three stories as squares with their words under them, as the home
page's rows of cards; a quoted story, the quote on the site's panel and the
picture beside it, the one fading into the other; three more stories with
their words over their pictures. One white ground, the cards' 28-point
corners, titles in medium and headlines regular, never bold; the labels and
dates in the second grey, no colours of their own. The page's end fades into
the footer's grey.

A post's own page is not designed yet: a card is a link only once its post has
a `url`. Every post is in POSTS, in the order it is shown within its place.
While any of them is a stand-in (`placeholder`), the page asks search engines
not to list it. No bar or footer links to it yet; it is at /newsroom.

It rewrites public/newsroom/ from scratch; build.py calls it after contact.py,
and it runs alone too, needing nothing but Python:

    python3 newsroom.py
"""
import datetime, html, os, shutil

import teams
from teams import frame
from versioning import version_style

OUT = teams.OUT

# Where each post goes: "lead" (across the column, its words over the picture), "tile" (a square, its words
# under it, three to a row), "quote" (its quote beside the picture) or "over" (three to a row, the words over the
# picture). Each has a `kind` (Customers, Product…) over its title. The pictures are the site's own (/img/),
# standing in until each post has its own.
POSTS = [
    {"place": "lead", "kind": "Customers", "title": "The headline of the lead story, set over its picture",
     "date": "2026-10-24", "image": "/img/support.jpg", "placeholder": True},
    {"place": "tile", "kind": "Product", "title": "Headline of a story about a team and its agents",
     "date": "2026-10-22", "image": "/img/content.jpg", "placeholder": True},
    {"place": "tile", "kind": "Company", "title": "Headline of a story, a little longer than the ones beside it",
     "date": "2026-10-20", "image": "/img/inbox.jpg", "placeholder": True},
    {"place": "tile", "kind": "Customers", "title": "Headline of a third story",
     "date": "2026-10-18", "image": "/img/books.jpg", "placeholder": True},
    {"place": "quote", "kind": "Builders", "title": "The title of the story the quote comes from",
     "quote": "A line from the person the story is about, quoted as they said it.",
     "by": "Their name\nTheir role and company", "date": "2026-10-15", "image": "/img/ea.jpg", "placeholder": True},
    {"place": "over", "kind": "Product", "title": "Headline of a story, its words over the picture",
     "date": "2026-10-12", "image": "/img/sales.jpg", "placeholder": True},
    {"place": "over", "kind": "Builders", "title": "Headline of another story, a little longer than the others",
     "date": "2026-10-09", "image": "/img/marketing.jpg", "placeholder": True},
    {"place": "over", "kind": "Company", "title": "Headline of one more story",
     "date": "2026-10-06", "image": "/img/paint-teal.jpg", "placeholder": True},
]

NEWSROOM_CSS = """
/* The Newsroom (newsroom.py): the posts down the column in Apple Stories' layout, in the site's measures (the home
   page's 28-point corners, its rows of three with 20 between, its panel #fafafb). One white ground; where a ground
   meets another (a picture's shade, the quote's panel and its picture, the page's end and the footer) it fades. */
.nw-lead{max-width:34em;margin-top:clamp(14px,1.2*var(--vw,1vw),22px);font-size:var(--t-lead);line-height:1.45;color:var(--ink2);text-wrap:pretty}
.nw-posts{display:flex;flex-direction:column;gap:clamp(40px,4*var(--vw,1vw),72px);margin-top:clamp(40px,4*var(--vw,1vw),80px)}
.nw-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.nw-kicker{font-size:var(--t-small);line-height:1.3;font-weight:var(--w-title);letter-spacing:-.005em;color:var(--ink2)}
.nw-date{display:block;margin-top:8px;font-size:var(--t-small);line-height:1.3;color:var(--ink2)}
.nw-img{position:relative;overflow:hidden;background:var(--soft)}
.nw-img img,.nw-over>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.7,.2,1)}
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

/* The page's end fades into the footer's grey. */
.nw-end{height:clamp(96px,9*var(--vw,1vw),180px);margin-top:clamp(64px,6*var(--vw,1vw),120px);
  background:linear-gradient(to bottom,var(--page) 0%,#fcfcfd 25%,#f9f9fa 50%,#f7f7f9 75%,var(--soft) 100%)}
footer{margin-top:0}

@media (max-width:734px){
  .nw-row{grid-template-columns:1fr;gap:28px}
  .nw-over,.nw-tile .nw-img,.nw-quote{border-radius:22px}
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
@media (prefers-reduced-motion:reduce){.nw-img img,.nw-over>img{transition:none}}
"""


def esc(text):
    return html.escape(text, quote=True)


def when(post):
    """The post's day as Apple writes it: October 23, 2026."""
    day = datetime.date.fromisoformat(post["date"])
    return f"{day:%B} {day.day}, {day.year}"


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
    body = f"""<section class="hero" aria-label="Newsroom">
  <div class="wrap">
    <h1>Newsroom</h1>
    <p class="nw-lead">News from SimeonLabs, and the people putting their agents to work.</p>
    <div class="nw-posts">
    {posts}
    </div>
  </div>
</section>
<div class="nw-end" aria-hidden="true"></div>"""
    hero_css, _ = teams.home_hero()
    # Stand-ins are not for search engines; the page is listed once every post on it is real.
    head = '\n<meta name="robots" content="noindex">' if any(post.get("placeholder") for post in POSTS) else ""
    return frame("Newsroom", "News from SimeonLabs, and the people putting their agents to work.",
                 "/newsroom", body, hero_css + NEWSROOM_CSS, head=head)


def build(out=OUT):
    teams.copy_site_css(out)
    root = os.path.join(out, "newsroom")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page(), out))
    print(f"newsroom written to {os.path.abspath(root)}")


if __name__ == "__main__":
    build()
