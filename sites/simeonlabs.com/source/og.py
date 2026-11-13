"""The picture each page shows when its link is shared (Open Graph and X's large card), the founder, 13 November
2026: "a meta hero for pages. for the main page use this design. give me all the pages. no need to put connectors and
ai model /<id>".

The design is the founder's: an impressionist painting of a pond seen from above (img/og-pond.jpg, made on Higgsfield
for SimeonLabs, 13 November 2026), darker behind the words, and the SimeonLabs wordmark in white. The home page has the
wordmark alone, large; every other page its own name in white (Inter at 500, never bold), the wordmark small above it,
and for a documentation page "Docs" over its name. 1200 x 630, JPEG, written to public/og/<page>.jpg.

Every page the sitemap lists gets one, except a connector's or an AI model's own page (/connectors/<id>, /models/<id>:
they keep the plain card) and a page that already names its own picture (a Newsroom post shows its story's). The page's
og:image, its size, and X's summary_large_image card are written into its head, replacing what was there.

It reads what is already in public/, so it runs after the pages are written (build.py runs it before the sitemap); it
runs alone too, after any page generator:

    python3 og.py
"""
import html as entities, os, re
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFilter, ImageFont

import sitemap

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public")
W, H = 1200, 630
SITE = sitemap.SITE   # the www host: simeonlabs.com answers with a redirect, which some link previews do not follow
PAINTING = os.path.join(HERE, "img", "og-pond.jpg")
WORDMARK = os.path.join(HERE, "img", "wordmark-labs.png")
FONT = os.path.join(HERE, "fonts", "Inter-500.woff2")
SHADE = (4, 24, 18)   # the painting's own deep green, laid over the middle

TITLE = re.compile(r'<meta property="og:title" content="([^"]*)"')
OWN = re.compile(r'<meta property="og:image"')


def _white_wordmark():
    wm = Image.open(WORDMARK).convert("RGBA")
    wm = wm.crop(wm.split()[3].getbbox())
    white = Image.new("RGBA", wm.size, (255, 255, 255, 255))
    white.putalpha(wm.split()[3])
    return white


def _ground():
    p = Image.open(PAINTING).convert("RGB")
    s = max(W / p.width, H / p.height)
    p = p.resize((round(p.width * s), round(p.height * s)), Image.LANCZOS)
    x, y = (p.width - W) // 2, (p.height - H) // 2
    return p.crop((x, y, x + W, y + H))


def _darken(img, box, depth=0.8):
    """A soft oval of the painting's deep green behind `box` (x0, y0, x1, y1), deepest at its middle."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse((x0 - w * 0.1, y0 - h * 0.55, x1 + w * 0.1, y1 + h * 0.55), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(10, int(h * 0.45))))
    peak = mask.getextrema()[1] or 1
    mask = mask.point(lambda v: int(min(255, v * 255 / peak) * depth))
    return Image.composite(Image.new("RGB", img.size, SHADE), img, mask)


def _lines(draw, text, font, width):
    """The words broken into lines no wider than `width`."""
    words, lines = text.split(), [""]
    for word in words:
        test = (lines[-1] + " " + word).strip()
        if draw.textlength(test, font=font) <= width or not lines[-1]:
            lines[-1] = test
        else:
            lines.append(word)
    return lines


def picture(title=None, eyebrow=None):
    """The page's picture: the wordmark alone (the home page), or the page's name under a small wordmark."""
    ground, white = _ground(), _white_wordmark()
    if title is None:
        tw = int(W * 0.5)
        th = round(tw * white.height / white.width)
        x, y = (W - tw) // 2, (H - th) // 2
        out = _darken(ground, (x, y, x + tw, y + th)).convert("RGBA")
        out.alpha_composite(white.resize((tw, th), Image.LANCZOS), (x, y))
        return out.convert("RGB")
    draw = ImageDraw.Draw(ground)
    size = 76
    while True:
        font = ImageFont.truetype(FONT, size)
        lines = _lines(draw, title, font, W * 0.78)
        if len(lines) <= 2 or size <= 52:
            break
        size -= 4
    lead = round(size * 1.12)
    small = ImageFont.truetype(FONT, 30)
    mh = 34
    mw = round(mh * white.width / white.height)
    gap, egap = 30, 14
    block = mh + gap + (30 + egap if eyebrow else 0) + lead * len(lines)
    top = (H - block) // 2
    widest = max(draw.textlength(line, font=font) for line in lines)
    out = _darken(ground, ((W - widest) / 2, top, (W + widest) / 2, top + block), depth=0.78).convert("RGBA")
    out.alpha_composite(white.resize((mw, mh), Image.LANCZOS), ((W - mw) // 2, top))
    d = ImageDraw.Draw(out)
    y = top + mh + gap
    if eyebrow:
        d.text((W / 2, y), eyebrow, font=small, fill=(255, 255, 255, 200), anchor="ma")
        y += 30 + egap
    for line in lines:
        d.text((W / 2, y), line, font=font, fill=(255, 255, 255, 255), anchor="ma")
        y += lead
    return out.convert("RGB")


def _set_meta(html, prop, value, attr="property"):
    tag = f'<meta {attr}="{prop}" content="{value}">'
    found = re.search(rf'<meta {attr}="{re.escape(prop)}" content="[^"]*">', html)
    if found:
        return html[: found.start()] + tag + html[found.end():]
    # after the share tags already written, so they stay in the order they were set
    anchors = list(re.finditer(r'<meta (?:property="og:[^"]*"|name="twitter:[^"]*") content="[^"]*">', html))
    anchor = anchors[-1] if anchors else re.search(r"<title>[^<]*</title>", html)
    return html[: anchor.end()] + "\n" + tag + html[anchor.end():]


def build(out=OUT):
    folder = os.path.join(out, "og")
    os.makedirs(folder, exist_ok=True)
    made = []
    for url, _ in sitemap.pages(out):
        parts = [p for p in urlparse(url).path.split("/") if p]
        if len(parts) >= 2 and parts[0] in ("connectors", "models"):
            continue
        file = os.path.join(out, *parts, "index.html")
        html = open(file, encoding="utf-8").read()
        if OWN.search(html) and 'content="' + SITE + '/og/' not in html:
            continue   # a page that names its own picture keeps it
        name = "-".join(parts) or "home"
        if parts:
            found = TITLE.search(html)
            words = entities.unescape(found.group(1) if found else parts[-1]).replace("'", "’").split(" | ")
            words = [w for w in words if w != "SimeonLabs"] or [parts[-1]]
            eyebrow = words[0] if len(words) > 1 else None
            img = picture(words[-1], eyebrow)
        else:
            img = picture()
        img.save(os.path.join(folder, f"{name}.jpg"), quality=86, optimize=True, progressive=True)
        image = f"{SITE}/og/{name}.jpg"
        html = _set_meta(html, "og:image", image)
        html = _set_meta(html, "og:image:width", str(W))
        html = _set_meta(html, "og:image:height", str(H))
        html = _set_meta(html, "twitter:card", "summary_large_image", attr="name")
        html = _set_meta(html, "twitter:image", image, attr="name")
        open(file, "w", encoding="utf-8").write(html)
        made.append(name)
    print(f"share pictures written to {os.path.abspath(folder)}: {len(made)}")
    return made


if __name__ == "__main__":
    build()
