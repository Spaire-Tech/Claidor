"""Raw BIFF record census of a legacy .xls — the independent witness.

Counts FORMULA (0x0006) and the value record types by walking the
workbook stream directly, so neither our reader nor xlrd's cell
model is in the loop.
"""
import struct
import sys

import olefile

WANT = {0x0006: "FORMULA", 0x0203: "NUMBER", 0x027E: "RK", 0x00BD: "MULRK",
        0x00FD: "LABELSST", 0x0204: "LABEL", 0x0201: "BLANK", 0x00BE: "MULBLANK",
        0x0205: "BOOLERR", 0x0006 | 0x400: "FORMULA(alt)"}

path = sys.argv[1]
ole = olefile.OleFileIO(path)
stream = "Workbook" if ole.exists("Workbook") else "Book"
data = ole.openstream(stream).read()
ole.close()

counts: dict = {}
pos = 0
n = len(data)
while pos + 4 <= n:
    code, size = struct.unpack("<HH", data[pos:pos + 4])
    pos += 4
    if pos + size > n:
        break
    if code in WANT:
        counts[WANT[code]] = counts.get(WANT[code], 0) + 1
    pos += size
print(path.split("/")[-1], f"({stream} stream, {n:,} bytes)")
for k in sorted(counts, key=lambda k: -counts[k]):
    print(f"  {counts[k]:>8}  {k}")
