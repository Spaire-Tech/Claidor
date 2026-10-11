"""Builds the legal pages of simeonlabs.com: /privacy and /terms.

Each page is written by hand in legal/<page>.html: a comment at the top with
its title, description, date and opening paragraph, then its sections
(<section id="…"><h2>…</h2>). This script numbers the sections, lists them
in the policy's table of contents and puts it all in legal/template.html (the
home page's bar and footer around a plain reading column, as the founder's
reference legal pages are laid out), writing public/<page>/index.html. build.py calls it
after it rewrites public/; it also runs alone, needing nothing but Python:

    python3 legal.py
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
PAGES = ("privacy", "terms")
# As on the reference pages: the policy opens with its contents in a box that folds; the terms read straight on.
CONTENTS = {"privacy"}
CONTACT = "support@simeonlabs.com"


def page(slug: str, template: str) -> str:
    source = open(f"{HERE}/legal/{slug}.html", encoding="utf-8").read()
    head = re.match(r"\s*<!--(.*?)-->", source, re.S)
    assert head, f"legal/{slug}.html starts with its comment of title, description, date and lede"
    meta = dict(
        (key.strip(), value.strip())
        for key, value in (line.split(":", 1) for line in head.group(1).strip().splitlines() if ":" in line)
    )
    body = source[head.end():]
    sections = re.findall(r'<section id="([^"]+)">\s*<h2>(.*?)</h2>', body, re.S)
    assert sections, f"legal/{slug}.html has no <section id><h2>"
    ids = [one for one, _ in sections]
    assert len(ids) == len(set(ids)), f"legal/{slug}.html repeats a section id"
    for target in re.findall(r'href="#([^"]+)"', body):
        assert target in ids or f'id="{target}"' in body, f"legal/{slug}.html links to #{target}, which it does not have"
    # The sections are numbered in the text itself, so the numbers copy, print and match the contents.
    count = iter(range(1, len(sections) + 1))
    body = re.sub(r'(<section id="[^"]+">\s*<h2>)', lambda m: f"{m.group(1)}{next(count)}. ", body)
    toc = "".join(
        f'<li><a href="#{one}">{number}. {re.sub(r"<[^>]+>", "", title)}</a></li>'
        for number, (one, title) in enumerate(sections, 1)
    )
    filled = {
        "%TITLE%": meta["title"],
        "%DESCRIPTION%": meta["description"],
        "%SLUG%": slug,
        "%UPDATED%": meta["updated"],
        "%LEDE%": meta["lede"],
        "%TOC%": (
            f'\n    <details class="toc" open><summary>Table of Contents</summary><ol>{toc}</ol></details>'
            if slug in CONTENTS
            else ""
        ),
        "%BODY%": body.strip("\n"),
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
