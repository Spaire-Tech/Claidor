"""The bar at the top and the footer at the foot of every page of the website.

The bar (the founder, 30 October 2026, with another site's for reference: "this
style for the nav bar"; its menus 14 November 2026): the wordmark, then Product,
Solutions, Connectors, Resources and Pricing beside it; Contact Sales and
Download on the right (Download fetches the Mac app, and on a Windows PC opens
the Microsoft Store's listing: `OS_MARK`). Product opens four pages of the
documentation; Solutions the Marketplace's teams in three groups, each with a
drawn icon; Connectors six groups of well-known apps, each with its icon,
and every connector; Resources Docs, the Newsroom and AI Models. Each opens on a
hover or a tap, with no script. On a phone a menu button takes their place and
drops them over the whole page, the two buttons under them; each menu opens
under its name there. The menu is a <details>, so it opens and closes with no
script.

The footer (the same day, the reference's): the mark, four columns of links
(Product, Company, Legal, Get started), then the wordmark, the copyright and the
site's language along its foot.

teams.py (Marketplace and a team's page, Connectors, Pricing, Contact, the
Newsroom), legal.py and build.py (the home page's %BAR% and %FOOTER%) write both
from here. Their styles are site.css's.
"""
import functools, json, os

MAC_DOWNLOAD = "https://api.simeonlabs.com/desktop/download/mac"
# Simeon for Windows is in the Microsoft Store (13 November 2026): the Store installs and updates it, so the
# site sends a Windows PC to its listing there, never to an installer of our own.
WINDOWS_STORE = "https://apps.microsoft.com/detail/9P588HGXP209"
TRY_FREE = "https://app.simeonlabs.com/billing?plan=standard"
LOG_IN = "https://app.simeonlabs.com/login"

# A small arrow after a menu's name, drawn in the words' colour.
ARROW = '<svg class="arrow" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

# Product: what an agent is and has, each a page of the documentation.
PRODUCT = (
    ("", "/docs/agents", "Agents"),
    ("", "/docs/computer", "The agent’s computer"),
    ("", "/docs/routines", "Routines"),
    ("", "/docs/approvals", "Approvals"),
)

# Resources' pages: their key (a page passes it as `current`), address and name.
RESOURCES = (
    ("docs", "/docs", "Docs"),
    ("newsroom", "/newsroom", "Newsroom"),
    ("models", "/models", "AI Models"),
)

# The pages after the menus.
LINKS = (
    ("pricing", "/pricing", "Pricing"),
)

# Connectors (the founder, 14 November 2026, with another site's integrations menu for reference: "like this
# without the purple icon. but i do want the connector logo next to it"): six of the catalogue's groups, four
# well-known apps in each, each with its icon (the Marketplace's, public/connectors/apps/), then every connector.
CONNECTOR_GROUPS = (
    ("Sales & Customers", (("hubspot", "HubSpot"), ("salesforce", "Salesforce"), ("pipedrive", "Pipedrive"), ("intercom", "Intercom"))),
    ("Mail & Meetings", (("gmail", "Gmail"), ("outlook", "Outlook"), ("google-calendar", "Google Calendar"), ("zoom", "Zoom"))),
    ("Files & Docs", (("notion", "Notion"), ("google-drive", "Google Drive"), ("dropbox", "Dropbox"), ("google-docs", "Google Docs"))),
    ("Marketing & Growth", (("mailchimp", "Mailchimp"), ("meta-ads", "Meta Ads"), ("google-ads", "Google Ads"), ("youtube", "YouTube"))),
    ("Finance & Money", (("quickbooks", "QuickBooks"), ("xero", "Xero"), ("stripe", "Stripe"), ("paypal", "PayPal"))),
    ("Social & Chat", (("slack", "Slack"), ("whatsapp", "WhatsApp"), ("instagram", "Instagram"), ("linkedin", "LinkedIn"))),
)

# Solutions (the same day: "for solutions we do the same, but there we put marketplace. only that marketplace is
# separated with creators founders etc."): the Marketplace's teams in three groups, each with its icon
# (SOLUTION_ICONS), then the whole Marketplace.
SOLUTION_GROUPS = (
    ("Your business", ("coffee-shop", "online-stores", "salons", "trades")),
    ("Professional services", ("law-firms", "accountants", "agencies", "real-estate", "property")),
    ("Your role", ("founders", "freelancers", "creators", "sales", "recruiters", "life")),
)
# Each team's icon in the Solutions menu (the founder, 14 November 2026, two of another site's for reference: "can we
# use something else. kinda like stripe"): flat overlapping shapes in three colours, drawn on a 24-point square.
B, P, T = "#3b4cf0", "#9a6dff", "#3fdcd4"   # blue, purple, teal
SOLUTION_ICONS = {
    "coffee-shop": f'<rect x="3.5" y="9" width="12.5" height="12" rx="2.6" fill="{B}"/><path d="M16 11.2h1.6a3 3 0 0 1 0 6H16" fill="none" stroke="{P}" stroke-width="2.3"/><rect x="6.6" y="2.5" width="2.2" height="5" rx="1.1" fill="{T}"/><rect x="10.8" y="2.5" width="2.2" height="5" rx="1.1" fill="{T}"/>',
    "online-stores": f'<path d="M4.5 8h15l-1.1 12.2A2 2 0 0 1 16.4 22H7.6a2 2 0 0 1-2-1.8z" fill="{B}"/><path d="M8.8 9.5V7a3.2 3.2 0 0 1 6.4 0v2.5" fill="none" stroke="{T}" stroke-width="2.1" stroke-linecap="round"/><circle cx="12" cy="15.2" r="2.7" fill="{P}"/>',
    "salons": f'<path d="M8.6 15.4 19 3.5M15.4 15.4 5 3.5" stroke="{B}" stroke-width="2.4" stroke-linecap="round"/><circle cx="7" cy="18.2" r="3.2" fill="{P}"/><circle cx="17" cy="18.2" r="3.2" fill="{T}"/>',
    "trades": f'<rect x="10" y="8" width="4" height="14" rx="2" fill="{B}"/><rect x="3.5" y="2.5" width="17" height="6.5" rx="2.2" fill="{P}"/><rect x="15" y="2.5" width="5.5" height="6.5" rx="2.2" fill="{T}"/>',
    "law-firms": f'<rect x="11" y="3.5" width="2" height="16" rx="1" fill="{B}"/><rect x="3.5" y="5.6" width="17" height="2.2" rx="1.1" fill="{B}"/><path d="M2 12.5a3.7 3.7 0 0 0 7.4 0z" fill="{T}"/><path d="M14.6 12.5a3.7 3.7 0 0 0 7.4 0z" fill="{P}"/><rect x="6.5" y="19" width="11" height="2.6" rx="1.3" fill="{B}"/>',
    "accountants": f'<rect x="4.5" y="2" width="15" height="20" rx="3" fill="{B}"/><rect x="7" y="4.6" width="10" height="4.4" rx="1.2" fill="{T}"/><circle cx="8.6" cy="12.6" r="1.3" fill="{P}"/><circle cx="12" cy="12.6" r="1.3" fill="{P}"/><circle cx="15.4" cy="12.6" r="1.3" fill="{P}"/><circle cx="8.6" cy="16.6" r="1.3" fill="{P}"/><circle cx="12" cy="16.6" r="1.3" fill="{P}"/><rect x="14.1" y="15.3" width="2.6" height="4.6" rx="1.3" fill="{T}"/>',
    "agencies": f'<path d="M12 13.2 2.5 17.6 12 22l9.5-4.4z" fill="{T}"/><path d="M12 8.1 2.5 12.5 12 16.9l9.5-4.4z" fill="{P}"/><path d="M12 3 2.5 7.4 12 11.8l9.5-4.4z" fill="{B}"/>',
    "real-estate": f'<path d="M4.5 11 12 4.6l7.5 6.4v9.3a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z" fill="{B}"/><path d="M2.3 11.6 12 3.3l9.7 8.3" fill="none" stroke="{P}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="10" y="14.2" width="4" height="7.6" rx="1" fill="{T}"/>',
    "property": f'<circle cx="7.8" cy="12" r="5.3" fill="{P}"/><circle cx="7.8" cy="12" r="1.9" fill="#fff"/><rect x="11.5" y="10.8" width="10.5" height="2.4" rx="1.2" fill="{B}"/><rect x="16.4" y="12.4" width="2.3" height="4.6" rx="1.1" fill="{T}"/><rect x="19.7" y="12.4" width="2.3" height="3.4" rx="1.1" fill="{T}"/>',
    "founders": f'<path d="M12 2c3.6 2.5 5.2 6.4 5.2 10.6V17H6.8v-4.4C6.8 8.4 8.4 4.5 12 2z" fill="{B}"/><path d="M6.8 12.6 3.6 16.4V19l3.2-1.6zM17.2 12.6l3.2 3.8V19l-3.2-1.6z" fill="{P}"/><circle cx="12" cy="9.8" r="2.1" fill="{T}"/><path d="M9.8 18.2h4.4L12 22.3z" fill="{T}"/>',
    "freelancers": f'<rect x="4" y="3.5" width="16" height="12.2" rx="2" fill="{B}"/><rect x="6.5" y="6" width="7.5" height="4.5" rx="1.1" fill="{T}"/><path d="M1.8 17.5h20.4l-1.3 2.5a1.5 1.5 0 0 1-1.3.8H4.4a1.5 1.5 0 0 1-1.3-.8z" fill="{P}"/>',
    "creators": f'<rect x="2" y="5.5" width="14" height="13" rx="3.2" fill="{B}"/><path d="M16.5 10.4 22 7v10l-5.5-3.4z" fill="{P}"/><circle cx="9" cy="12" r="2.9" fill="{T}"/>',
    "sales": f'<rect x="3" y="14" width="4.2" height="7.5" rx="1.3" fill="{P}"/><rect x="9.9" y="10.2" width="4.2" height="11.3" rx="1.3" fill="{B}"/><rect x="16.8" y="6.6" width="4.2" height="14.9" rx="1.3" fill="{B}"/><path d="M3 10.4 8.6 5.6l3.1 2.6L18.8 2.3" fill="none" stroke="{T}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
    "recruiters": f'<circle cx="8.8" cy="7" r="3.7" fill="{B}"/><path d="M2 20c0-3.8 3-6.8 6.8-6.8s6.8 3 6.8 6.8v1.5H2z" fill="{B}"/><circle cx="16.5" cy="14.4" r="3.9" fill="{T}"/><circle cx="16.5" cy="14.4" r="3.9" fill="none" stroke="{P}" stroke-width="2"/><path d="m19.4 17.4 2.6 2.6" stroke="{P}" stroke-width="2.5" stroke-linecap="round"/>',
    "life": f'<rect x="3" y="4.5" width="18" height="17.5" rx="3" fill="{B}"/><path d="M3 7.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2.7H3z" fill="{P}"/><rect x="7" y="2" width="2.4" height="5.2" rx="1.2" fill="{T}"/><rect x="14.6" y="2" width="2.4" height="5.2" rx="1.2" fill="{T}"/><path d="m8 15.8 2.7 2.6L16.2 13" fill="none" stroke="{T}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
}
PACKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "server", "simeon", "desktop", "packs.json")


# Which computer is reading. A Windows PC gets `on-windows` on <html> before the bar is drawn (the script stands just
# before it, on every page), and site.css then shows each `.btn.for-win` (Download for Windows) in the place of
# its `.btn.for-mac` neighbour, at any width; every other reader keeps the page as it was. The other computer's
# download stays in the footer for both.
OS_MARK = '<script>if(/Windows NT/.test(navigator.userAgent))document.documentElement.classList.add("on-windows")</script>'


def downloads(arrow="", cls="btn"):
    """Download for macOS and, beside it, Download for Windows (the Microsoft Store's listing), the one a
    Windows PC shows in its place. `arrow` is the mark after the words (teams.DOWNLOAD), if the page draws one."""
    return (f'<a class="{cls} for-mac" href="{MAC_DOWNLOAD}">Download for macOS{arrow}</a>'
            f'<a class="{cls} for-win" href="{WINDOWS_STORE}">Download for Windows{arrow}</a>')


def _mark(key, current):
    return ' aria-current="page"' if key and key == current else ""


def _links(pages, current):
    return "".join(f'<a href="{href}"{_mark(key, current)}>{name}</a>' for key, href, name in pages)


@functools.lru_cache(maxsize=None)
def _teams():
    """The Marketplace's teams by id: their name in the menu (\"Coffee Shops\")."""
    data = json.load(open(PACKS))
    packs = data if isinstance(data, list) else data["packs"]
    return {p["id"]: p["title"].removeprefix("Simeon for ") for p in packs}


@functools.lru_cache(maxsize=None)
def _connector_count():
    """The connectors one can add today, rounded down to ten (\"220+\")."""
    import connectors  # here, not at the top: connectors.py imports this module through teams.py
    found, _ = connectors.catalogue()
    return len([c for c in found if not c["soon"]]) // 10 * 10


def _item(href, icon, name, current_href=""):
    """A menu's item: its icon (an image's address, or a drawing's shapes), then its name."""
    mark = ' aria-current="page"' if href == current_href else ""
    mark_up = (f'<svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>' if icon.startswith("<")
               else f'<img src="{icon}" alt="" loading="lazy">')
    return f'<a class="mg-i" href="{href}"{mark}>{mark_up}{name}</a>'


def _connectors_menu(current):
    groups = "".join(
        f'<div class="mg-g"><p class="mg-h">{title}</p>'
        + "".join(_item(f"/connectors/{cid}", f"/connectors/apps/{cid}.png", name) for cid, name in apps)
        + "</div>"
        for title, apps in CONNECTOR_GROUPS
    )
    more = f'<a class="mg-more" href="/connectors"{_mark("connectors", current)}>See all {_connector_count()}+ connectors <span aria-hidden="true">→</span></a>'
    return groups, more


def _solutions_menu(current):
    teams = _teams()
    groups = "".join(
        f'<div class="mg-g"><p class="mg-h">{title}</p>'
        + "".join(_item(f"/marketplace/{tid}", SOLUTION_ICONS[tid], teams[tid], current) for tid in ids)
        + "</div>"
        for title, ids in SOLUTION_GROUPS
    )
    more = f'<a class="mg-more" href="/marketplace"{_mark("marketplace", current)}>See the whole Marketplace <span aria-hidden="true">→</span></a>'
    return groups, more


def _menu(name, panel, cls=""):
    """A menu on the bar: its name and arrow, its panel on a hover or a tap (no script)."""
    return f'<div class="drops"><button class="drop" type="button" aria-haspopup="true">{name}{ARROW}</button><div class="drop-panel{cls}">{panel}</div></div>'


def _phone_menu(name, panel, cls=""):
    """The same menu in the phone's menu: a <details> that opens under its name."""
    return f'<details class="menu-group{cls}"><summary>{name}{ARROW}</summary><div>{panel}</div></details>'


def bar(current=""):
    """The bar; `current` is the page's key (RESOURCES, LINKS, "connectors", "marketplace", "contact"), or a
    team's address (\"/marketplace/founders\"), or "" on another page."""
    solutions, solutions_more = _solutions_menu(current)
    connectors, connectors_more = _connectors_menu(current)
    menus = (
        ("Product", _links(PRODUCT, current), ""),
        ("Solutions", f'<div class="mg-cols">{solutions}</div>{solutions_more}', " mega"),
        ("Connectors", f'<div class="mg-cols">{connectors}</div>{connectors_more}', " mega"),
        ("Resources", _links(RESOURCES, current), ""),
    )
    desk = "".join(_menu(name, panel, cls) for name, panel, cls in menus)
    phone = "".join(_phone_menu(name, panel, cls) for name, panel, cls in menus)
    buttons = f'<a class="btn soft" href="/contact"{_mark("contact", current)}>Contact Sales</a><a class="btn for-mac" href="{MAC_DOWNLOAD}">Download</a><a class="btn for-win" href="{WINDOWS_STORE}">Download</a>'
    return f"""{OS_MARK}
<header class="bar">
  <div class="wrap">
    <a class="wordmark" href="/" aria-label="SimeonLabs home"></a>
    <nav class="bar-links" aria-label="Pages">{desk}{_links(LINKS, current)}</nav>
    <div class="acts">{buttons}</div>
    <details class="menu">
      <summary aria-label="Menu"><i></i><i></i></summary>
      <div class="menu-in"><nav aria-label="Pages">{phone}{_links(LINKS, current)}</nav><div class="menu-acts">{buttons}</div></div>
    </details>
  </div>
</header>"""


# The footer's columns: a title and its links (key, address, name).
COLUMNS = (
    ("Product", (
        ("marketplace", "/marketplace", "Marketplace"),
        ("connectors", "/connectors", "Connectors"),
        ("models", "/models", "Models"),
        ("pricing", "/pricing", "Pricing"),
        ("", MAC_DOWNLOAD, "Download for Mac"),
        ("", WINDOWS_STORE, "Download for Windows"),
    )),
    ("Company", (
        ("newsroom", "/newsroom", "Newsroom"),
        ("docs", "/docs", "Docs"),
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
