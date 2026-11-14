"""The bar at the top and the footer at the foot of every page of the website.

The bar (the founder, 30 October 2026, with another site's for reference: "this
style for the nav bar"; its menus 14 November 2026): the wordmark, then Product,
Solutions, Connectors, Resources and Pricing beside it; Contact Sales and
Download on the right (Download fetches the Mac app, and on a Windows PC opens
the Microsoft Store's listing: `OS_MARK`). Product opens four pages of the
documentation; Solutions the Marketplace's teams in three groups, each with its
first agent's face; Connectors six groups of well-known apps, each with its icon,
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
# separated with creators founders etc."): the Marketplace's teams in three groups, each with its first agent's
# face, then the whole Marketplace.
SOLUTION_GROUPS = (
    ("Your business", ("coffee-shop", "online-stores", "salons", "trades")),
    ("Professional services", ("law-firms", "accountants", "agencies", "real-estate", "property")),
    ("Your role", ("founders", "freelancers", "creators", "sales", "recruiters", "life")),
)
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
    """The Marketplace's teams by id: their name in the menu (\"Coffee Shops\") and their first agent's face."""
    data = json.load(open(PACKS))
    packs = data if isinstance(data, list) else data["packs"]
    return {p["id"]: (p["title"].removeprefix("Simeon for "), p["agents"][0]["face"]) for p in packs}


@functools.lru_cache(maxsize=None)
def _connector_count():
    """The connectors one can add today, rounded down to ten (\"220+\")."""
    import connectors  # here, not at the top: connectors.py imports this module through teams.py
    found, _ = connectors.catalogue()
    return len([c for c in found if not c["soon"]]) // 10 * 10


def _item(href, icon, name, current_href="", face=False):
    mark = ' aria-current="page"' if href == current_href else ""
    cls = ' class="face"' if face else ""
    return f'<a class="mg-i" href="{href}"{mark}><img{cls} src="{icon}" alt="" loading="lazy">{name}</a>'


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
        + "".join(_item(f"/marketplace/{tid}", f"/faces/{teams[tid][1]}.webp", teams[tid][0], current, face=True) for tid in ids)
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
