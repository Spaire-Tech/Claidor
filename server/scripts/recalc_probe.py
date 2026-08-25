"""Probe a machine for B1's prerequisites, and say exactly what is missing.

The recalculator (Track B) needs LibreOffice ≥ 25.8 with Calc and a
python-uno the driver can import. This container has none of that —
`docs/pierce/logs/dynamo.md` records the audit — so the probe exists
to make that audit repeatable: run it on any machine and it prints,
line by line, what B1 has and lacks there. Exit 0 means every
prerequisite is met; anything else names the gaps.

    cd server && uv run python -m scripts.recalc_probe

The probe proves *presence*, not fidelity: a clean exit says the
machine can be wired, not that a single file recalculates faithfully.
The fidelity report only ever comes from the gate itself.
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REQUIRED = (25, 8)


def probe_soffice() -> tuple[bool, str]:
    binary = shutil.which("soffice")
    if binary is None:
        return False, "soffice: not on PATH"
    try:
        out = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=60
        ).stdout.strip()
    except Exception as error:
        return False, f"soffice: found but `--version` failed ({error})"
    match = re.search(r"LibreOffice (\d+)\.(\d+)", out)
    if match is None:
        return False, f"soffice: unrecognized version line « {out} »"
    version = (int(match.group(1)), int(match.group(2)))
    line = f"soffice: LibreOffice {match.group(1)}.{match.group(2)} at {binary}"
    if version < REQUIRED:
        return False, f"{line} — below the required {REQUIRED[0]}.{REQUIRED[1]}"
    return True, line


def probe_calc() -> tuple[bool, str]:
    """Prove Calc opens a spreadsheet at all: convert a two-cell CSV."""
    if shutil.which("soffice") is None:
        return False, "calc: unprovable, no soffice"
    with tempfile.TemporaryDirectory(prefix="recalc-probe-") as tmp:
        seed = Path(tmp) / "probe.csv"
        seed.write_text("a,b\n1,2\n")
        try:
            subprocess.run(
                [
                    "soffice",
                    "--headless",
                    "--convert-to",
                    "xlsx",
                    "--outdir",
                    tmp,
                    str(seed),
                ],
                capture_output=True,
                timeout=120,
            )
        except Exception as error:
            return False, f"calc: conversion attempt failed to run ({error})"
        if (Path(tmp) / "probe.xlsx").exists():
            return True, "calc: opens and writes spreadsheets"
        return False, "calc: soffice cannot load a spreadsheet (Calc not installed?)"


def probe_uno() -> tuple[bool, str]:
    """Find an interpreter that imports uno.

    Ours first, then the system python (a venv's `python3` shadows it
    on PATH, so it is named outright), then the pythons LibreOffice
    builds bundle. Any hit is enough: the driver runs out-of-process
    under whichever interpreter matches the installed LibreOffice.
    """
    if _imports_uno(sys.executable):
        return True, f"uno: importable by this interpreter ({sys.executable})"
    candidates = [shutil.which("python3"), shutil.which("python"), "/usr/bin/python3"]
    candidates += [str(p) for p in Path("/opt").glob("libreoffice*/program/python")]
    candidates.append("/usr/lib/libreoffice/program/python")
    for binary in candidates:
        if binary and binary != sys.executable and _imports_uno(binary):
            return (
                True,
                f"uno: importable by {binary} — the driver runs there, "
                "out-of-process (see the lane log)",
            )
    return False, "uno: no interpreter on this machine imports it"


def _imports_uno(interpreter: str) -> bool:
    try:
        return (
            subprocess.run(
                [interpreter, "-c", "import uno"],
                capture_output=True,
                timeout=30,
            ).returncode
            == 0
        )
    except Exception:
        return False


def main() -> int:
    checks = [probe_soffice(), probe_calc(), probe_uno()]
    for ok, line in checks:
        print(("  ok  " if ok else " LACK ") + line)
    if all(ok for ok, _ in checks):
        print("B1's prerequisites are met here. Fidelity is still unproven.")
        return 0
    print("B1 cannot run on this machine yet; the LACK lines say why.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
