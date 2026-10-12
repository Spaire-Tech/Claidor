#!/usr/bin/env python3
"""The agents' faces (12 October 2026): the founder's clay characters, made
into the pictures both apps ship (ios/SimeonCore/Sources/SimeonCore/Resources/Faces).

    python3 ios/scripts/make-faces.py <folder of originals>

Each original is named `<number>-<woman|man>.<jpg|png|webp>`, or
`<number>-simeon.<ext>` for Simeon's own face (a man's). It becomes
`clay-<number>.webp` (`clay-simeon.webp`): the centre square, 512 px, WebP at
quality 82. `faces.json` lists each face's id, gender, file and version: the
first 16 hex characters of the file's SHA-256, which is the `avatarVersion`
the host reports for an agent wearing it (desktop/source/host/agents/agent-avatar.ts),
so the apps know a face by it.

A face already made is never made again: another WebP encoder writes other
bytes, the version would change, and agents already wearing the face would
no longer be known to wear it. Only new numbers are added.

Needs Pillow with WebP (`python3 -c "from PIL import features; print(features.check('webp'))"`).
"""

import hashlib
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "SimeonCore", "Sources", "SimeonCore", "Resources", "Faces")
SIZE = 512
QUALITY = 82
NAMED = re.compile(r"^(\d+)-(woman|man|simeon)\.(jpe?g|png|webp)$", re.IGNORECASE)


def version(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]


def main(src: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, "faces.json")
    faces = []
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            faces = json.load(f)["faces"]
    known = {face["id"] for face in faces}
    for name in sorted(os.listdir(src)):
        match = NAMED.match(name)
        if not match:
            print(f"skipped {name}: not <number>-<woman|man|simeon>.<ext>")
            continue
        number, kind = match.group(1), match.group(2).lower()
        face_id = "clay-simeon" if kind == "simeon" else f"clay-{int(number):02d}"
        if face_id in known:
            continue
        image = Image.open(os.path.join(src, name)).convert("RGB")
        side = min(image.size)
        left, top = (image.width - side) // 2, (image.height - side) // 2
        image = image.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
        file = f"{face_id}.webp"
        path = os.path.join(OUT, file)
        image.save(path, "WEBP", quality=QUALITY, method=6)
        faces.append({
            "id": face_id,
            "gender": "female" if kind == "woman" else "male",
            "file": file,
            "version": version(path),
        })
        known.add(face_id)
    # Simeon's face last; the others in their numbers' order (the editor's order).
    faces.sort(key=lambda face: (face["id"] == "clay-simeon", face["id"]))
    with open(manifest_path, "w") as f:
        json.dump({"faces": faces}, f, indent=1)
        f.write("\n")
    total = sum(os.path.getsize(os.path.join(OUT, face["file"])) for face in faces)
    women = sum(1 for face in faces if face["gender"] == "female")
    print(f"{len(faces)} faces ({women} women), {total // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
