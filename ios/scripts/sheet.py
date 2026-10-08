"""The screenshots as two small contact sheets (light, dark), printed into
the build's log as base64 between markers, so a reader of the log (the
GitHub connector, which cannot download artifacts) sees the screens too.
The full-size PNGs are the run's artifact.

    python3 ios/scripts/sheet.py <screens folder>
"""
import base64
import glob
import io
import os
import re
import sys

from PIL import Image

WIDTH = 170
COLUMNS = 6


def order(path):
    match = re.search(r"-(\d+)-", os.path.basename(path))
    return int(match.group(1)) if match else 0


def main(folder):
    for theme in ("light", "dark"):
        files = sorted(glob.glob(os.path.join(folder, f"{theme}-*.png")), key=order)
        if not files:
            continue
        shots = []
        for path in files:
            image = Image.open(path).convert("RGB")
            height = round(image.height * WIDTH / image.width)
            shots.append(image.resize((WIDTH, height), Image.LANCZOS))
        height = max(shot.height for shot in shots)
        rows = (len(shots) + COLUMNS - 1) // COLUMNS
        sheet = Image.new("RGB", (COLUMNS * WIDTH + (COLUMNS - 1) * 4, rows * height + (rows - 1) * 4), (128, 128, 128))
        for index, shot in enumerate(shots):
            sheet.paste(shot, ((index % COLUMNS) * (WIDTH + 4), (index // COLUMNS) * (height + 4)))
        buffer = io.BytesIO()
        sheet.save(buffer, "JPEG", quality=58, optimize=True)
        encoded = base64.b64encode(buffer.getvalue()).decode()
        print(f"SIMEON-SHEET-BEGIN {theme} {len(files)} screens {sheet.width}x{sheet.height}")
        for start in range(0, len(encoded), 1000):
            print(encoded[start:start + 1000])
        print(f"SIMEON-SHEET-END {theme}")


if __name__ == "__main__":
    main(sys.argv[1])
