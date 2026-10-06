"""Content versions on the page's own images (6 October 2026).

The faces, logos, images and the hero's posters keep their file names from
build to build, and the site serves them for four hours without asking again
(and Cloudflare in front of it), so a redrawn face showed the old one: the
founder saw clouds after the agents became butterflies. Each reference on the
page now carries `?v=` and the first eight hex digits of the file's sha256, so
a changed file is a new address and an unchanged one keeps its cache. The app
bundle needs none: it lives under a folder named after its content.
"""
import hashlib, os, re

ASSET = re.compile(r"(?<![\w/.:-])((?:faces|logos|img)/[\w.%-]+\.(?:png|jpe?g|webp|svg|gif)|app-poster-[\w-]+\.jpg)(?:\?v=[0-9a-f]{8})?(?![\w.%-])")


def version_assets(html, root):
    """Returns `html` with every reference to a file under `root` versioned by its content."""
    cache = {}

    def stamp(match):
        path = match.group(1)
        if path not in cache:
            full = os.path.join(root, path)
            cache[path] = hashlib.sha256(open(full, "rb").read()).hexdigest()[:8] if os.path.isfile(full) else None
        return path if cache[path] is None else f"{path}?v={cache[path]}"

    return ASSET.sub(stamp, html)


if __name__ == "__main__":
    import sys
    page = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "index.html")
    html = open(page, encoding="utf-8").read()
    open(page, "w", encoding="utf-8").write(version_assets(html, os.path.dirname(os.path.abspath(page))))
