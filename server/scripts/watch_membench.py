"""The aligner memory round's instrument — where do the bytes live?

Registered in `docs/pierce/logs/prism.md` (« Aligner memory
round »). Synthesizes grids in the shape that OOM-killed V3 on the
lead's container (tall data sheets, ~60 columns, half the rows
labelled, 5% of rows edited so the identity shortcut cannot flatter
the number) and measures `align_lines` peak RSS in a child process,
one point per child so peaks never share an address space.

    uv run python -m scripts.watch_membench sweep OUT.json
    uv run python -m scripts.watch_membench one R        (child)
"""

import json
import resource
import subprocess
import sys
import time
from pathlib import Path

from polar.tieout.watch import Line, align_lines

COLUMNS = 60
EDIT_EVERY = 20  # 5% of rows carry one altered signature


def synthetic(rows: int, *, edited: bool) -> list[Line]:
    lines = []
    for index in range(2, rows + 2):
        label = f"line {index}" if index % 2 == 0 else ""
        signatures = [
            f"R[{-(index % 7) - 1:+d}]C[{-(column % 5):+d}]*#"
            for column in range(1, COLUMNS + 1)
        ]
        if edited and index % EDIT_EVERY == 0:
            signatures[COLUMNS // 2] = "SUM(R[-3]C[+0]:R[-1]C[+0])"
        lines.append(Line(index, label, tuple(enumerate(signatures, start=1))))
    return lines


def one(rows: int) -> None:
    old = synthetic(rows, edited=False)
    new = synthetic(rows, edited=True)
    started = time.monotonic()
    result = align_lines(old, new)
    seconds = time.monotonic() - started
    print(
        json.dumps(
            {
                "rows": rows,
                "matched": len(result.matched),
                "seconds": round(seconds, 1),
                "peak_rss_mb": round(
                    resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
                ),
            }
        )
    )


def sweep(out_path: str) -> None:
    points = []
    for rows in (2_000, 5_000, 10_000):
        child = subprocess.run(
            [sys.executable, "-m", "scripts.watch_membench", "one", str(rows)],
            capture_output=True,
            text=True,
            check=True,
        )
        point = json.loads(child.stdout.strip().splitlines()[-1])
        points.append(point)
        print(json.dumps(point))
    Path(out_path).write_text(json.dumps(points, indent=1))


def profile(rows: int) -> None:
    """The timing round's instrument: cProfile over one alignment of
    the registered synthetic shape, top functions by cumulative time —
    the split between similarity's miss path, real LCS work, and the
    DP loop's own bookkeeping."""
    import cProfile
    import pstats

    old = synthetic(rows, edited=False)
    new = synthetic(rows, edited=True)
    profiler = cProfile.Profile()
    profiler.enable()
    align_lines(old, new)
    profiler.disable()
    stats = pstats.Stats(profiler)
    stats.sort_stats("cumulative")
    stats.print_stats(12)


if __name__ == "__main__":
    if sys.argv[1] == "one":
        one(int(sys.argv[2]))
    elif sys.argv[1] == "profile":
        profile(int(sys.argv[2]))
    else:
        sweep(sys.argv[2] if sys.argv[1] == "sweep" else sys.argv[1])
