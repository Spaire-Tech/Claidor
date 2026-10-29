"""Builds the website's Newsroom (/newsroom), the blog.

The founder, 29 October 2026, after Apple's Newsroom and its Apple Stories: "I
want to create a Newsroom page. that will be the blog. I want it desgined like
this … build it with placeholders for now. only surface level". So the page
only, laid out as Apple's: its own bar under the site's (Newsroom, then Latest
News, Stories and a search that narrows the page as you type); Latest News on
the grey ground, a quick read (its + opens its few lines), two large cards and
then three; then Stories on white, under the mark and "Stories": a lead story
across the column with its title over the picture, a quoted story beside its
picture, two stories as squares with their words under them, and three more
with their words over them. A post's own page is not designed yet: a card is a
link only once its post has a `url`.

Every post is in POSTS, in the order it is shown within its place. While any of
them is a stand-in (`placeholder`), the page asks search engines not to list it.
No bar or footer links to it yet; it is at /newsroom.

It rewrites public/newsroom/ from scratch; build.py calls it after contact.py,
and it runs alone too, needing nothing but Python:

    python3 newsroom.py
"""
import datetime, html, os, shutil

import teams
from teams import frame
from versioning import version_style

OUT = teams.OUT

# A story's category, in its pill's colour (as Apple Stories colours Environment, Developers and Education).
CATEGORIES = {
    "Customers": "#2d7a1f",
    "Product": "#0066cc",
    "Company": "#6e3bbf",
    "Builders": "#b4451a",
}

# Where each post goes: in Latest News, "quick" (a quick read), "large" (two to a row) or "small" (three);
# in Stories, "lead" (across the column, its words over the picture), "quote" (its quote beside the picture),
# "tile" (a square, its words under it) or "over" (three to a row, the words over the picture). A news post
# has a `label` (Update, Press release…), a story a `category` (CATEGORIES). Pictures are the site's own
# (/img/), standing in until each post has its own.
POSTS = [
    {"place": "quick", "label": "Quick read", "title": "Headline of a quick read, a short piece of news",
     "date": "2026-10-26", "image": "/img/wall-blue.jpg",
     "summary": "A quick read opens here: a few lines on what changed, for whom, and where to find it.",
     "placeholder": True},
    {"place": "large", "label": "Update", "title": "Headline of a news post",
     "date": "2026-10-23", "image": "/img/sales.jpg", "placeholder": True},
    {"place": "large", "label": "Press release", "title": "A longer headline for a news post, to see how it wraps in a large card",
     "date": "2026-10-22", "image": "/img/marketing.jpg", "placeholder": True},
    {"place": "small", "label": "Update", "title": "Headline of an update",
     "date": "2026-10-20", "image": "/img/paint-teal.jpg", "placeholder": True},
    {"place": "small", "label": "Product", "title": "Headline of a post about something new in Simeon",
     "date": "2026-10-16", "image": "/img/paint-pastel.jpg", "placeholder": True},
    {"place": "small", "label": "Press release", "title": "Headline of a press release",
     "date": "2026-10-14", "image": "/img/paint-green.jpg", "placeholder": True},
    {"place": "lead", "category": "Customers", "title": "The headline of the lead story, set large over its picture",
     "date": "2026-10-24", "image": "/img/support.jpg", "placeholder": True},
    {"place": "quote", "category": "Builders", "title": "The title of the story the quote comes from",
     "quote": "A line from the person the story is about, quoted large, as they said it.",
     "by": "Their name,\nTheir role and company", "date": "2026-10-21", "image": "/img/ea.jpg", "placeholder": True},
    {"place": "tile", "category": "Product", "title": "Headline of a story about a team and its agents",
     "date": "2026-10-18", "image": "/img/content.jpg", "placeholder": True},
    {"place": "tile", "category": "Company", "title": "Headline of a story, a little longer than the one beside it",
     "date": "2026-10-15", "image": "/img/inbox.jpg", "placeholder": True},
    {"place": "over", "category": "Customers", "title": "Headline of a story, its words over the picture",
     "date": "2026-10-12", "image": "/img/books.jpg", "placeholder": True},
    {"place": "over", "category": "Builders", "title": "Headline of another story, a little longer than the others",
     "date": "2026-10-09", "image": "/img/paint-blue.jpg", "placeholder": True},
    {"place": "over", "category": "Company", "title": "Headline of a third story",
     "date": "2026-10-06", "image": "/img/paint-green.jpg", "placeholder": True},
]

NEWSROOM_CSS = """
/* The Newsroom (newsroom.py), as Apple's: its own bar, Latest News on the grey ground, Stories on white. Words
   at the site's weights, never bold: titles medium, the headings regular. */
.nw [hidden]{display:none!important}
.nw-col{width:min(1000px,var(--col));margin-inline:auto}
.nw-wide{width:min(1320px,var(--col));margin-inline:auto}
.nw-bar .nw-col{display:flex;align-items:center;justify-content:space-between;gap:16px;height:56px}
.nw-name{font-size:21px;font-weight:var(--w-title);letter-spacing:-.02em;color:var(--ink);text-decoration:none}
.nw-links{display:flex;align-items:center;gap:clamp(16px,1.6*var(--vw,1vw),28px);font-size:var(--t-small)}
.nw-links>a{color:var(--ink2);text-decoration:none}
.nw-links>a:hover{color:var(--ink)}
.nw-search{display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:99px;background:#e8e8ed;color:var(--ink2);cursor:text}
.nw-search svg{flex:none;width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}
.nw-search input{width:120px;padding:0;border:0;background:none;color:var(--ink);font:inherit;font-size:13px;letter-spacing:-.01em;outline:none;-webkit-appearance:none;appearance:none}
.nw-search input::placeholder{color:var(--ink2);opacity:1}
.nw-search input::-webkit-search-cancel-button{display:none}
.nw-search:focus-within{box-shadow:0 0 0 2px var(--blue)}
.nw-none{padding:clamp(48px,5*var(--vw,1vw),96px) 0;text-align:center;font-size:var(--t-lead);color:var(--ink2)}

.nw-latest{background:var(--soft);padding:clamp(28px,2.6*var(--vw,1vw),52px) 0 clamp(56px,5*var(--vw,1vw),100px)}
.nw-h{font-size:var(--t-display);line-height:1.1;font-weight:var(--w-display);letter-spacing:-.025em;margin-bottom:clamp(20px,1.6*var(--vw,1vw),32px)}
.nw-quick{position:relative;display:flex;align-items:center;gap:clamp(20px,3.4*var(--vw,1vw),60px);padding:clamp(24px,2.8*var(--vw,1vw),52px) clamp(72px,6*var(--vw,1vw),110px) clamp(24px,2.8*var(--vw,1vw),52px) clamp(24px,2.8*var(--vw,1vw),52px);border-radius:28px;background:#fff}
.nw-quick .nw-img{flex:none;width:clamp(88px,8.4*var(--vw,1vw),150px);aspect-ratio:1;border-radius:22%;overflow:hidden;background:var(--soft)}
.nw-kicker{display:flex;align-items:center;gap:5px;font-size:var(--t-small);font-weight:var(--w-title);letter-spacing:.03em;text-transform:uppercase;color:var(--ink2)}
.nw-kicker svg{width:12px;height:12px;fill:currentColor}
.nw-quick h3{margin-top:8px;max-width:22em;font-size:var(--t-title);line-height:1.2;font-weight:var(--w-title);letter-spacing:-.02em}
.nw-ago{display:flex;align-items:center;gap:6px;margin-top:12px;font-size:var(--t-body);color:var(--ink2)}
.nw-ago svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
.nw-more{margin-top:14px;max-width:36em;font-size:var(--t-body);line-height:1.5}
.nw-plus{position:absolute;right:clamp(16px,1.6*var(--vw,1vw),28px);bottom:clamp(16px,1.6*var(--vw,1vw),28px);display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:var(--soft);color:var(--ink);cursor:pointer;transition:transform .25s ease,background .2s}
.nw-plus:hover{background:#e8e8ed}
.nw-plus svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.nw-plus[aria-expanded="true"]{transform:rotate(45deg)}
.nw-grid{display:grid;gap:clamp(16px,1.8*var(--vw,1vw),36px);margin-top:clamp(16px,1.8*var(--vw,1vw),36px)}
.nw-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.nw-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.nw-img{background:#e8e8ed}
.nw-img img{width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
a:hover>.nw-img img,a:hover>img{transform:scale(1.03)}
.nw-card{display:flex;flex-direction:column;border-radius:28px;overflow:hidden;background:#fff;color:inherit;text-decoration:none}
.nw-card .nw-img{aspect-ratio:16/9;overflow:hidden}
.nw-card .nw-text{flex:1;display:flex;flex-direction:column;padding:clamp(20px,2*var(--vw,1vw),32px)}
.nw-label{font-size:var(--t-small);font-weight:var(--w-title);letter-spacing:.03em;text-transform:uppercase;color:var(--ink2)}
.nw-card h3{margin-top:8px;font-size:var(--t-head);line-height:1.25;font-weight:var(--w-title);letter-spacing:-.015em}
.two .nw-card h3{font-size:clamp(19px,1.35*var(--vw,1vw),26px);line-height:1.2}
.nw-date{display:block;margin-top:auto;padding-top:clamp(14px,1.4*var(--vw,1vw),26px);font-size:var(--t-body);color:var(--ink2)}

.nw-stories{padding-top:clamp(64px,6*var(--vw,1vw),120px)}
.nw-stories-head{text-align:center;margin-bottom:clamp(36px,4*var(--vw,1vw),80px)}
.nw-big{display:inline-flex;align-items:center;gap:.1em;font-size:clamp(44px,4.4*var(--vw,1vw),88px);line-height:1;font-weight:var(--w-title);letter-spacing:-.035em}
.nw-big i{display:block;width:.9em;height:.9em;background:var(--ink);-webkit-mask:url(/logos/simeon.svg) center/133% no-repeat;mask:url(/logos/simeon.svg) center/133% no-repeat}
.nw-stories-head p{max-width:24em;margin:16px auto 0;font-size:var(--t-lead);line-height:1.4;text-wrap:balance}
.nw-pill{display:inline-block;align-self:flex-start;padding:3px 9px;border-radius:99px;background:var(--c,var(--ink));color:#fff;font-size:12px;line-height:1.35;font-weight:var(--w-title);letter-spacing:.04em;text-transform:uppercase}
.nw-over{position:relative;display:block;overflow:hidden;border-radius:clamp(22px,2*var(--vw,1vw),36px);background:#2a2a2c;color:#fff;text-decoration:none}
.nw-over>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
.nw-over::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.74),rgba(0,0,0,.3) 42%,rgba(0,0,0,0) 68%);pointer-events:none}
.nw-over .nw-text{position:absolute;left:0;right:0;bottom:0;z-index:1;display:flex;flex-direction:column;padding:clamp(20px,3*var(--vw,1vw),52px)}
.nw-over h3{margin-top:12px;max-width:20em;font-size:clamp(24px,2.6*var(--vw,1vw),48px);line-height:1.12;font-weight:var(--w-title);letter-spacing:-.025em;text-wrap:pretty}
.nw-over .nw-date{margin:0;padding-top:12px;color:rgba(255,255,255,.86)}
.nw-over.lead{aspect-ratio:16/8}
.nw-over.small{aspect-ratio:4/5}
.nw-over.small .nw-text{padding:clamp(18px,2*var(--vw,1vw),32px)}
.nw-over.small h3{font-size:clamp(19px,1.4*var(--vw,1vw),26px);line-height:1.2;letter-spacing:-.015em}
.nw-quote{display:grid;grid-template-columns:1fr 1fr;aspect-ratio:16/10;margin-top:clamp(24px,2.4*var(--vw,1vw),48px);overflow:hidden;border-radius:clamp(22px,2*var(--vw,1vw),36px);background:var(--soft);color:inherit;text-decoration:none}
.nw-quote .nw-text{display:flex;flex-direction:column;padding:clamp(28px,4*var(--vw,1vw),68px)}
.nw-quote blockquote{margin-top:auto;max-width:15em;font-size:clamp(24px,2.3*var(--vw,1vw),42px);line-height:1.14;font-weight:var(--w-title);letter-spacing:-.025em;text-wrap:pretty}
.nw-by{margin-top:16px;font-size:var(--t-body);line-height:1.35;white-space:pre-line}
.nw-read{display:inline-flex;align-items:center;align-self:flex-start;height:40px;margin-top:auto;padding:0 20px;border-radius:99px;background:#e8e8ed;font-size:var(--t-body)}
.nw-quote .nw-story{margin-top:16px;font-size:var(--t-body);font-weight:var(--w-title)}
.nw-quote .nw-img{overflow:hidden}
.nw-tile{display:flex;flex-direction:column;color:inherit;text-decoration:none}
.nw-tile .nw-img{aspect-ratio:1;overflow:hidden;border-radius:28px}
.nw-tile .nw-text{display:flex;flex-direction:column;padding:18px clamp(12px,1.2*var(--vw,1vw),22px) 0}
.nw-tile h3{margin-top:10px;font-size:clamp(19px,1.35*var(--vw,1vw),26px);line-height:1.2;font-weight:var(--w-title);letter-spacing:-.015em}
.nw-tile .nw-date{padding-top:10px}
.nw-stories .nw-grid.two{margin-top:clamp(56px,5*var(--vw,1vw),100px)}
.nw-stories .nw-grid.three{margin-top:clamp(56px,5*var(--vw,1vw),100px)}

@media (max-width:860px){.nw-grid.three{grid-template-columns:1fr 1fr}}
@media (max-width:734px){
  .nw-links>a{display:none}
  .nw-search{height:34px}
  .nw-search input{width:140px;font-size:16px} /* 16: an iPhone does not zoom into it; the room the hidden links leave */
  .nw-quick{align-items:flex-start;padding:20px 20px 76px}
  .nw-grid.two,.nw-grid.three{grid-template-columns:1fr}
  .nw-over.lead{aspect-ratio:4/5}
  .nw-quote{grid-template-columns:1fr;aspect-ratio:auto}
  .nw-quote .nw-img{order:-1;aspect-ratio:4/3}
  .nw-quote blockquote{margin-top:24px}
  .nw-read{margin-top:28px}
}
@media (prefers-reduced-motion:reduce){.nw-img img,.nw-over>img,.nw-plus{transition:none}}
"""

NEWSROOM_JS = """<script>
// The newsroom's search narrows the page to the posts whose words have what is typed; a quick read's + opens its
// few lines; a date within the week reads as Today, Yesterday or so many days ago.
(() => {
  const input = document.querySelector('.nw-search input'), none = document.querySelector('.nw-none');
  const posts = [...document.querySelectorAll('[data-post]')], groups = [...document.querySelectorAll('[data-group]')];
  input.addEventListener('input', () => {
    const words = input.value.trim().toLowerCase();
    let found = 0;
    for (const post of posts) {
      const hit = !words || post.textContent.toLowerCase().includes(words);
      post.hidden = !hit;
      if (hit) found++;
    }
    for (const group of groups) group.hidden = !!words && !group.querySelector('[data-post]:not([hidden])');
    none.hidden = !words || found > 0;
    if (!none.hidden) none.textContent = 'No results for \\u201c' + input.value.trim() + '\\u201d.';
  });
  for (const plus of document.querySelectorAll('.nw-plus')) {
    plus.addEventListener('click', () => {
      const open = plus.getAttribute('aria-expanded') !== 'true';
      plus.setAttribute('aria-expanded', String(open));
      plus.setAttribute('aria-label', open ? 'Close' : 'Read more');
      document.getElementById(plus.getAttribute('aria-controls')).hidden = !open;
    });
  }
  for (const time of document.querySelectorAll('time[data-ago]')) {
    const [y, m, d] = time.dateTime.split('-').map(Number), now = new Date();
    const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 86400000);
    if (days >= 0 && days < 7) time.textContent = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days + ' days ago';
  }
})();
</script>"""

SEARCH_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6.8" cy="6.8" r="4.8"/><path d="m10.4 10.4 3.8 3.8"/></svg>'
BOLT_ICON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7 .8 2.2 7h3.2l-.6 4.2L9.8 5H6.6z"/></svg>'
CLOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.3"/><path d="M8 4.6V8l2.2 1.6"/></svg>'
PLUS_ICON = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12"/></svg>'


def esc(text):
    return html.escape(text, quote=True)


def when(post):
    """The post's day as Apple writes it: October 23, 2026."""
    day = datetime.date.fromisoformat(post["date"])
    return f"{day:%B} {day.day}, {day.year}"


def date(post, ago=False):
    mark = " data-ago" if ago else ""
    return f'<time class="nw-date" datetime="{post["date"]}"{mark}>{when(post)}</time>'


def picture(post, lazy=True):
    loading = ' loading="lazy"' if lazy else ""
    return f'<img src="{esc(post["image"])}" alt="{esc(post.get("alt", ""))}"{loading}>'


def opening(post, cls):
    """A post's card opens as a link to its page, or, before it has one, as a plain block."""
    if post.get("url"):
        return f'<a class="{cls}" href="{esc(post["url"])}" data-post>', "</a>"
    return f'<div class="{cls}" data-post>', "</div>"


def pill(post):
    colour = CATEGORIES.get(post["category"], "#1d1d1f")
    return f'<span class="nw-pill" style="--c:{colour}">{esc(post["category"])}</span>'


def quick(post, index):
    more = f"nw-more-{index}"
    return f"""<article class="nw-quick" data-post>
      <div class="nw-img">{picture(post, lazy=False)}</div>
      <div>
        <p class="nw-kicker">{BOLT_ICON}{esc(post["label"])}</p>
        <h3>{esc(post["title"])}</h3>
        <p class="nw-ago">{CLOCK_ICON}<time datetime="{post["date"]}" data-ago>{when(post)}</time></p>
        <p class="nw-more" id="{more}" hidden>{esc(post["summary"])}</p>
      </div>
      <button class="nw-plus" type="button" aria-expanded="false" aria-controls="{more}" aria-label="Read more">{PLUS_ICON}</button>
    </article>"""


def card(post):
    start, end = opening(post, "nw-card")
    return f"""{start}<div class="nw-img">{picture(post)}</div><div class="nw-text"><p class="nw-label">{esc(post["label"])}</p><h3>{esc(post["title"])}</h3>{date(post)}</div>{end}"""


def over(post, size):
    start, end = opening(post, f"nw-over {size}")
    return f"""{start}{picture(post, lazy=size != "lead")}<div class="nw-text">{pill(post)}<h3>{esc(post["title"])}</h3>{date(post)}</div>{end}"""


def quote(post):
    start, end = opening(post, "nw-quote")
    read = "Read story"
    return f"""{start}<div class="nw-text">{pill(post)}<blockquote>“{esc(post["quote"])}”</blockquote><p class="nw-by">{esc(post["by"])}</p><span class="nw-read">{read}</span><p class="nw-story">{esc(post["title"])}</p></div><div class="nw-img">{picture(post)}</div>{end}"""


def tile(post):
    start, end = opening(post, "nw-tile")
    return f"""{start}<div class="nw-img">{picture(post)}</div><div class="nw-text">{pill(post)}<h3>{esc(post["title"])}</h3>{date(post)}</div>{end}"""


def placed(place):
    return [post for post in POSTS if post["place"] == place]


def grid(cls, items):
    return f'<div class="nw-grid {cls}">{"".join(items)}</div>' if items else ""


def page():
    quicks = "".join(quick(post, index) for index, post in enumerate(placed("quick")))
    latest = f"""<section class="nw-latest" id="latest" aria-labelledby="latest-title" data-group>
  <div class="nw-col">
    <h2 class="nw-h" id="latest-title">Latest News</h2>
    {quicks}
    {grid("two", [card(post) for post in placed("large")])}
    {grid("three", [card(post) for post in placed("small")])}
  </div>
</section>"""
    leads = "".join(over(post, "lead") for post in placed("lead"))
    quotes = "".join(quote(post) for post in placed("quote"))
    stories = f"""<section class="nw-stories" id="stories" aria-labelledby="stories-title" data-group>
  <div class="nw-col nw-stories-head">
    <h2 class="nw-big" id="stories-title"><i aria-hidden="true"></i>Stories</h2>
    <p>The people and teams putting their agents to work, and what they make of it.</p>
  </div>
  <div class="nw-wide">{leads}{quotes}</div>
  <div class="nw-col">{grid("two", [tile(post) for post in placed("tile")])}</div>
  <div class="nw-wide">{grid("three", [over(post, "small") for post in placed("over")])}</div>
</section>"""
    body = f"""<div class="nw">
<nav class="nw-bar" aria-label="Newsroom">
  <div class="nw-col">
    <a class="nw-name" href="/newsroom">Newsroom</a>
    <div class="nw-links">
      <a href="#latest">Latest News</a>
      <a href="#stories">Stories</a>
      <label class="nw-search">{SEARCH_ICON}<input type="search" placeholder="Search Newsroom" aria-label="Search Newsroom" autocomplete="off" enterkeyhint="search"></label>
    </div>
  </div>
</nav>
{latest}
{stories}
<p class="nw-none nw-col" role="status" hidden></p>
</div>"""
    # Stand-ins are not for search engines; the page is listed once every post on it is real.
    head = '\n<meta name="robots" content="noindex">' if any(post.get("placeholder") for post in POSTS) else ""
    return frame("Newsroom", "News and stories from SimeonLabs: what's new in Simeon, and the people putting their agents to work.",
                 "/newsroom", body, NEWSROOM_CSS, script=NEWSROOM_JS, head=head)


def build(out=OUT):
    teams.copy_site_css(out)
    root = os.path.join(out, "newsroom")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page(), out))
    print(f"newsroom written to {os.path.abspath(root)}")


if __name__ == "__main__":
    build()
