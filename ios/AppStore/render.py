"""
The App Store screenshots as PNGs, 1320 by 2868 (iPhone 6.9"), from the
canvas's artboards in source/ (the same files as the Design canvas): each
asset address on the canvas (`/_blob/<id>`) is pointed at its file in
assets/ (blobs.json), the fonts at fonts/, and the page photographed at its
exact size. Run: python3 ios/AppStore/render.py [path to Chromium]
"""
import asyncio, json, pathlib, re, sys
from PIL import Image
from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
ORDER = [
    ("Main", "01-teammates"),
    ("Computer", "02-own-computer"),
    ("Chief", "03-chief-of-staff"),
    ("Tools", "04-connect-apps"),
    ("Approve", "05-your-ok"),
    ("Shopping", "06-buys-for-the-team"),
    ("Travel", "07-work-trips"),
    ("Call", "08-call-for-update"),
]
# The canvas's one tweak, the ground behind the phones, at the value the screenshots use.
GROUND = "#F2F2F2"


def local_page(name: str) -> pathlib.Path:
    blobs = json.loads((HERE / "assets/blobs.json").read_text())
    html = (HERE / f"source/{name}.dc.html").read_text()
    html = re.sub(r"/_blob/([0-9a-f]{32})", lambda m: f"../assets/{blobs[m.group(1)]}", html)
    html = html.replace('<script src="./support.js"></script>', '<link rel="stylesheet" href="../fonts/fonts.css">')
    html = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^"]*">', "", html)
    html = html.replace("{{ground}}", GROUND)
    out = HERE / f"build/{name}.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html)
    return out


async def main(chromium: str | None) -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=chromium) if chromium else await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1320, "height": 2868}, device_scale_factor=1)
        for name, slug in ORDER:
            await page.goto(local_page(name).as_uri())
            await page.evaluate("document.fonts.ready")
            await page.wait_for_timeout(400)
            shot = HERE / f"screenshots/{slug}.png"
            await page.screenshot(path=str(shot), full_page=False)
            # Flattened RGB, no alpha channel: App Store Connect refuses screenshots with transparency.
            Image.open(shot).convert("RGB").save(shot, optimize=True)
            print(f"screenshots/{slug}.png")
        await browser.close()


asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
