#!/usr/bin/env python3
"""The agents' faces standing on their own (30 October 2026): each face of
the catalogue (Resources/Faces, ios/scripts/make-faces.py) with its
background taken away, for the card that says a new agent joined the team
(the founder: "the avatar simeon chose, but without background").

    python3 ios/scripts/make-face-cutouts.py

Writes `Resources/Faces/Standing/<id>.webp` for every face in `faces.json`:
the figure cut out by rembg's `isnet-general-use` model with alpha matting,
trimmed to the figure (its bottom stays the picture's bottom edge, where the
card stands it), WebP at quality 90 with its transparency. A cut-out already
made is kept, so a face added later is the only one made again; delete a
file to make it anew.

Needs `pip install "rembg[cpu]" pillow` (the model, about 180 MB, is
downloaded on the first run).
"""

import json
import os

from PIL import Image
from rembg import new_session, remove

HERE = os.path.dirname(os.path.abspath(__file__))
FACES = os.path.join(HERE, "..", "SimeonCore", "Sources", "SimeonCore", "Resources", "Faces")
OUT = os.path.join(FACES, "Standing")
QUALITY = 90
# Below this alpha a pixel is the background's haze, not the figure: left out of the trim.
TRIM_ALPHA = 24


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(FACES, "faces.json")) as f:
        faces = json.load(f)["faces"]
    session = None
    for face in faces:
        target = os.path.join(OUT, f"{face['id']}.webp")
        if os.path.exists(target):
            continue
        session = session or new_session("isnet-general-use")
        source = Image.open(os.path.join(FACES, face["file"])).convert("RGB")
        cut = remove(source, session=session, alpha_matting=True)
        alpha = cut.getchannel("A").point(lambda value: 255 if value >= TRIM_ALPHA else 0)
        left, top, right, _ = alpha.getbbox()
        cut.crop((left, top, right, cut.height)).save(target, "WEBP", quality=QUALITY)
        print(f"{face['id']}: {right - left} x {cut.height - top}")


if __name__ == "__main__":
    main()
