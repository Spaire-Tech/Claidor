"""Writes the website's sitemap (public/sitemap.xml) and robots.txt, for Google Search Console (the founder, 10 November
2026: "a sitemap of the website so i can give it to google search console").

Every page the site serves is a folder's index.html under public/. Each one is listed at the address it names as its
own (`<link rel="canonical">`), or by its folder when it names none (the home page). Left out: a page that sends the
reader on (a refresh, or a canonical address that is another page's: /teams, /network, the earlier /legal/
addresses), a page that asks not to be indexed, and the app the home page plays (/app). Each address carries the date
its page last changed in git, when git can say. robots.txt lets every crawler in and names the sitemap.

It reads only what is already in public/, so build.py runs it last; it runs alone too:

    python3 sitemap.py
"""
import os, re, subprocess
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
# The address the site answers on: simeonlabs.com sends every request to www.simeonlabs.com (a 308, measured on
# 10 November 2026), so the sitemap lists the www addresses Google lands on. The pages' canonical tags still name
# simeonlabs.com; a page whose canonical is its own folder is listed under this host.
SITE = "https://www.simeonlabs.com"
NAMED = "https://simeonlabs.com"   # the host the pages' canonical tags use
SKIP = ("app",)   # the app the home page plays, not a page to find

CANONICAL = re.compile(r'<link rel="canonical" href="([^"]+)"')
AWAY = re.compile(r'http-equiv="refresh"|<meta name="robots" content="[^"]*noindex', re.I)


def changed(path):
    """The day the file last changed in git (YYYY-MM-DD), or None."""
    try:
        day = subprocess.run(["git", "log", "-1", "--format=%cs", "--", path], cwd=HERE, capture_output=True, text=True, timeout=20).stdout.strip()
        return day or None
    except (OSError, subprocess.SubprocessError):
        return None


def pages(out=OUT):
    """(address, last change) for every page to list, the home page first, then by address."""
    found = {}
    for folder, dirs, files in os.walk(out):
        rel = os.path.relpath(folder, out).replace(os.sep, "/")
        rel = "" if rel == "." else rel
        if rel.split("/")[0] in SKIP:
            dirs[:] = []
            continue
        if "index.html" not in files:
            continue
        file = os.path.join(folder, "index.html")
        text = open(file, encoding="utf-8").read()
        if AWAY.search(text):
            continue
        own = f"{NAMED}/{rel}" if rel else f"{NAMED}/"
        named = CANONICAL.search(text)
        if named and named.group(1).rstrip("/") != own.rstrip("/"):
            continue   # it names another page as the one to index
        found[f"{SITE}/{rel}" if rel else f"{SITE}/"] = changed(file)
    return sorted(found.items(), key=lambda item: (item[0] != f"{SITE}/", item[0]))


def build(out=OUT):
    listed = pages(out)
    rows = []
    for url, day in listed:
        stamp = f"<lastmod>{day}</lastmod>" if day else ""
        rows.append(f"  <url><loc>{escape(url)}</loc>{stamp}</url>")
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n"
    open(os.path.join(out, "sitemap.xml"), "w", encoding="utf-8").write(xml)
    open(os.path.join(out, "robots.txt"), "w", encoding="utf-8").write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
    print(f"sitemap written to {os.path.abspath(os.path.join(out, 'sitemap.xml'))}: {len(listed)} page(s)")


if __name__ == "__main__":
    build()
