"""The bar at the top and the footer at the foot of every page of the website.

The bar (the founder, 30 October 2026, with another site's for reference: "this
style for the nav bar"): the wordmark, then Products, Solutions, Resources,
Connectors and Pricing beside it; Contact Sales and Download on the right.
Products and Solutions show their arrow but open nothing yet ("a drop down but
that don't work until i figure out"); Resources opens Marketplace and Newsroom,
on a hover or a tap, with no script. On a phone a menu button takes their place
and drops them over the whole page, the two buttons under them. The menu is a
<details>, so it opens and closes with no script.

The footer (the same day, the reference's): the mark, four columns of links
(Product, Company, Legal, Get started), then the wordmark, the copyright and the
site's language along its foot.

teams.py (Marketplace and a team's page, Connectors, Pricing, Contact, the
Newsroom), legal.py and build.py (the home page's %BAR% and %FOOTER%) write both
from here. Their styles are site.css's.
"""

MAC_DOWNLOAD = "https://api.simeonlabs.com/desktop/download/mac"
TRY_FREE = "https://app.simeonlabs.com/billing?plan=standard"
LOG_IN = "https://app.simeonlabs.com/login"

# A small arrow after a menu's name, drawn in the words' colour.
ARROW = '<svg class="arrow" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

# Resources' pages: their key (a page passes it as `current`), address and name.
RESOURCES = (
    ("marketplace", "/marketplace", "Marketplace"),
    ("newsroom", "/newsroom", "Newsroom"),
)

# The pages after the menus.
LINKS = (
    ("connectors", "/connectors", "Connectors"),
    ("pricing", "/pricing", "Pricing"),
)


def _mark(key, current):
    return ' aria-current="page"' if key and key == current else ""


def _links(pages, current):
    return "".join(f'<a href="{href}"{_mark(key, current)}>{name}</a>' for key, href, name in pages)


def _soon(name):
    """A menu not made yet: its name and arrow, opening nothing."""
    return f'<button class="drop" type="button" aria-disabled="true">{name}{ARROW}</button>'


def bar(current=""):
    """The bar; `current` is the page's key (RESOURCES, LINKS, "contact"), or "" on another page."""
    resources = f"""<div class="drops"><button class="drop" type="button" aria-haspopup="true">Resources{ARROW}</button><div class="drop-panel">{_links(RESOURCES, current)}</div></div>"""
    phone_resources = f"""<details class="menu-group"><summary>Resources{ARROW}</summary><div>{_links(RESOURCES, current)}</div></details>"""
    buttons = f'<a class="btn soft" href="/contact"{_mark("contact", current)}>Contact Sales</a><a class="btn" href="{MAC_DOWNLOAD}">Download</a>'
    return f"""<header class="bar">
  <div class="wrap">
    <a class="wordmark" href="/" aria-label="SimeonLabs home"></a>
    <nav class="bar-links" aria-label="Pages">{_soon("Products")}{_soon("Solutions")}{resources}{_links(LINKS, current)}</nav>
    <div class="acts">{buttons}</div>
    <details class="menu">
      <summary aria-label="Menu"><i></i><i></i></summary>
      <div class="menu-in"><nav aria-label="Pages">{_soon("Products")}{_soon("Solutions")}{phone_resources}{_links(LINKS, current)}</nav><div class="menu-acts">{buttons}</div></div>
    </details>
  </div>
</header>"""


# The footer's columns: a title and its links (key, address, name).
COLUMNS = (
    ("Product", (
        ("marketplace", "/marketplace", "Marketplace"),
        ("connectors", "/connectors", "Connectors"),
        ("pricing", "/pricing", "Pricing"),
        ("", MAC_DOWNLOAD, "Download for Mac"),
    )),
    ("Company", (
        ("newsroom", "/newsroom", "Newsroom"),
        ("contact", "/contact", "Contact"),
    )),
    ("Legal", (
        ("privacy", "/privacy", "Privacy policy"),
        ("terms", "/terms", "Terms of service"),
    )),
    ("Get started", (
        ("", TRY_FREE, "Try it free"),
        ("", LOG_IN, "Log in"),
    )),
)

# A globe before the site's language.
GLOBE = '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.1"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c1.9 1.8 2.9 4 2.9 6.5S9.9 12.7 8 14.5M8 1.5C6.1 3.3 5.1 5.5 5.1 8s1 4.7 2.9 6.5"/></g></svg>'


def footer(current=""):
    """The footer; `current` marks the link to the page being read (`privacy`, `terms`, and the bar's keys)."""
    columns = "".join(
        f'<div class="foot-col"><h2>{title}</h2>{_links(links, current)}</div>' for title, links in COLUMNS
    )
    return f"""<footer class="site-foot">
  <div class="wrap">
    <div class="foot-top">
      <a class="foot-mark" href="/" aria-label="SimeonLabs home"></a>
      <nav class="foot-cols" aria-label="Site">{columns}</nav>
    </div>
    <div class="foot-base">
      <a class="foot-word" href="/" aria-label="SimeonLabs"></a>
      <span class="foot-copy">© 2026 Spaire, Inc.</span>
      <span class="foot-lang">{GLOBE}English</span>
    </div>
  </div>
</footer>"""
