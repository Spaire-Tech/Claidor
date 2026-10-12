#!/usr/bin/env python3
# The iPhone app icon from the Mac app icon (12 October 2026), so the two
# match: the Mac tile's background and its pure-black mark, full bleed and
# without alpha (iOS rounds the corners itself). Needs Pillow.
#
#   python3 ios/scripts/make-icon-from-mac.py \
#     mac/Simeon/Assets.xcassets/MacIcon.appiconset/icon_512x512@2x.png \
#     ios/Simeon/Assets.xcassets/AppIcon.appiconset/icon.png
import sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
mac = Image.open(src).convert("RGBA")
W, H = mac.size
p = mac.load()
# The opaque tile.
left = next(x for x in range(W) if p[x, H // 2][3] == 255)
right = max(x for x in range(W) if p[x, H // 2][3] == 255)
top = next(y for y in range(H) if p[W // 2, y][3] == 255)
bottom = max(y for y in range(H) if p[W // 2, y][3] == 255)
# Inside its two-pixel edge line (where the tile meets its shadow).
left, top, right, bottom = left + 2, top + 2, right - 2, bottom - 2
size = right - left + 1
assert bottom - top + 1 == size, (left, right, top, bottom)

def dark(c):
    return sum(c[:3]) / 3 < 230

# The background of each row: the opaque, mark-free pixels of the row, averaged.
rows = []
for y in range(top, bottom + 1):
    xs = [x for x in range(left, right + 1) if p[x, y][3] == 255]
    # Away from the mark: the outer 12% each side, else (above and below the mark) the whole row.
    margin = [x for x in xs if x < left + size * 0.12 or x > right - size * 0.12]
    sample = [p[x, y] for x in (margin or xs) if not dark(p[x, y])]
    if not sample:
        sample = [p[x, y] for x in xs]
    rows.append(tuple(sum(c[i] for c in sample) / len(sample) for i in range(3)))

# The mark's box (its dark pixels), a few pixels wider for its soft edge;
# nothing outside it counts, so the tile's own rounded edge never does.
dark_xs = [x for y in range(top, bottom + 1) for x in range(left, right + 1) if p[x, y][3] == 255 and sum(p[x, y][:3]) / 3 < 100]
dark_ys = [y for y in range(top, bottom + 1) for x in range(left, right + 1) if p[x, y][3] == 255 and sum(p[x, y][:3]) / 3 < 100]
box = (min(dark_xs) - 6, min(dark_ys) - 6, max(dark_xs) + 6, max(dark_ys) + 6)

# The mark's coverage: black over the row's background, so coverage = 1 - value / background.
mask = Image.new("L", (size, size), 0)
m = mask.load()
for j, y in enumerate(range(top, bottom + 1)):
    bg = sum(rows[j]) / 3
    for i, x in enumerate(range(left, right + 1)):
        r, g, b, a = p[x, y]
        if a < 255 or not (box[0] <= x <= box[2] and box[1] <= y <= box[3]):
            continue
        v = (r + g + b) / 3
        cover = max(0.0, min(1.0, 1 - v / bg)) if bg > 0 else 0.0
        m[i, j] = round(cover * 255)

N = 1024
mask = mask.resize((N, N), Image.LANCZOS)
# Background rows resampled to N, each row's colour across the full width.
bgimg = Image.new("RGB", (1, size))
bp = bgimg.load()
for j, c in enumerate(rows):
    bp[0, j] = tuple(round(v) for v in c)
bgimg = bgimg.resize((1, N), Image.BILINEAR).resize((N, N), Image.NEAREST)
black = Image.new("RGB", (N, N), (0, 0, 0))
icon = Image.composite(black, bgimg, mask)
icon.save(out, optimize=True)
print("tile", left, top, right, bottom, "size", size, "bg top", rows[0], "bottom", rows[-1])
