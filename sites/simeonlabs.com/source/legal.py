"""Builds the legal pages of simeonlabs.com: /privacy and /terms.

Each page is written by hand in legal/<page>.html: a comment at the top with
its title, description, dates and opening line, then the short version (an
<aside class="short">) and its sections (<section id="…"><h2>…</h2>). This
script puts them in legal/template.html, the home page's bar, column and
footer, and writes public/<page>/index.html with the contents listed beside
the text. build.py calls it after it rewrites public/; it also runs alone,
needing nothing but Python:

    python3 legal.py
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
PAGES = ("privacy", "terms")
OTHER = {
    "privacy": '<a href="/terms">Read the Terms of Service</a>',
    "terms": '<a href="/privacy">Read the Privacy Policy</a>',
}
CONTACT = "support@simeonlabs.com"


def page(slug: str, template: str) -> str:
    source = open(f"{HERE}/legal/{slug}.html", encoding="utf-8").read()
    head = re.match(r"\s*<!--(.*?)-->", source, re.S)
    assert head, f"legal/{slug}.html starts with its comment of title, description, dates and lede"
    meta = dict(
        (key.strip(), value.strip())
        for key, value in (line.split(":", 1) for line in head.group(1).strip().splitlines() if ":" in line)
    )
    rest = source[head.end():]
    short = re.search(r"<aside class=\"short\".*?</aside>", rest, re.S)
    body = (rest[: short.start()] + rest[short.end():]) if short else rest
    sections = re.findall(r'<section id="([^"]+)">\s*<h2>(.*?)</h2>', body, re.S)
    assert sections, f"legal/{slug}.html has no <section id><h2>"
    ids = [one for one, _ in sections]
    assert len(ids) == len(set(ids)), f"legal/{slug}.html repeats a section id"
    for target in re.findall(r'href="#([^"]+)"', body):
        assert target in ids or f'id="{target}"' in body, f"legal/{slug}.html links to #{target}, which it does not have"
    toc = "".join(f'<li><a href="#{one}">{re.sub(r"<[^>]+>", "", title)}</a></li>' for one, title in sections)
    filled = {
        "%TITLE%": meta["title"],
        "%DESCRIPTION%": meta["description"],
        "%SLUG%": slug,
        "%EFFECTIVE%": meta["effective"],
        "%UPDATED%": meta["updated"],
        "%LEDE%": meta["lede"],
        "%SHORT%": ("    " + short.group(0).strip() + "\n") if short else "",
        "%TOC%": toc,
        "%BODY%": body.strip("\n"),
        "%OTHER%": OTHER[slug],
        "%CONTACT%": CONTACT,
        "%PRIVACY_CURRENT%": ' aria-current="page"' if slug == "privacy" else "",
        "%TERMS_CURRENT%": ' aria-current="page"' if slug == "terms" else "",
    }
    html = template
    for key, value in filled.items():
        html = html.replace(key, value)
    left = re.findall(r"%[A-Z_]+%", html)
    assert not left, f"{slug}: {left} not filled"
    return html


# Where the apps already point (ios/Simeon/Settings.swift, the sign-in page, the Mac's window):
# a page that sends the reader on, so those links work without a new app.
FORWARDS = {"legal/privacy-policy": "/privacy", "legal/terms-of-service": "/terms"}


def forward(target: str) -> str:
    return (
        '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        f'<meta http-equiv="refresh" content="0; url={target}"><link rel="canonical" href="https://simeonlabs.com{target}">'
        f'<meta name="robots" content="noindex"><title>Moved</title></head>'
        f'<body><p>This page is now at <a href="{target}">simeonlabs.com{target}</a>.</p></body></html>\n'
    )


def build(out: str = OUT) -> None:
    template = open(f"{HERE}/legal/template.html", encoding="utf-8").read()
    for slug in PAGES:
        os.makedirs(f"{out}/{slug}", exist_ok=True)
        open(f"{out}/{slug}/index.html", "w", encoding="utf-8").write(page(slug, template))
    for path, target in FORWARDS.items():
        os.makedirs(f"{out}/{path}", exist_ok=True)
        open(f"{out}/{path}/index.html", "w", encoding="utf-8").write(forward(target))
    print("legal pages written to", os.path.abspath(out))


if __name__ == "__main__":
    build()
