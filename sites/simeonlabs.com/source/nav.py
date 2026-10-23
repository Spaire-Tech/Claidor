"""The bar at the top of every page of the website (the founder, 23 October 2026).

The wordmark on the left goes home. On the right are Marketplace, Connectors and
Pricing, then Download. On a phone a menu button takes their place: it drops the
three links over the whole page, with Download under them. The menu is a
<details>, so it opens and closes with no script. Its styles are site.css's.

teams.py (Marketplace and a team's page), connectors.py, pricing.py and legal.py
write the bar from here, and build.py puts it in the home page (page.html's
%BAR%).
"""

MAC_DOWNLOAD = "https://api.simeonlabs.com/desktop/download/mac"

# Each page in the bar: its key (a page passes it as `current`), its address and its name.
LINKS = (
    ("marketplace", "/marketplace", "Marketplace"),
    ("connectors", "/connectors", "Connectors"),
    ("pricing", "/pricing", "Pricing"),
)


def links(current=""):
    """The pages' links, the one for the page being read marked as current."""
    out = []
    for key, href, name in LINKS:
        mark = ' aria-current="page"' if key == current else ""
        out.append(f'<a href="{href}"{mark}>{name}</a>')
    return "".join(out)


def bar(current=""):
    """The bar; `current` is the page's key in LINKS, or "" on a page that is not one of them."""
    return f"""<header class="bar">
  <div class="wrap">
    <a class="wordmark" href="/" aria-label="SimeonLabs home"></a>
    <nav class="acts" aria-label="Pages">{links(current)}<a class="btn" href="{MAC_DOWNLOAD}">Download</a></nav>
    <details class="menu">
      <summary aria-label="Menu"><i></i><i></i></summary>
      <div class="menu-in"><nav aria-label="Pages">{links(current)}</nav><a class="btn" href="{MAC_DOWNLOAD}">Download</a></div>
    </details>
  </div>
</header>"""
