"""Probe a machine for B1's prerequisites, and say exactly what is missing.

The recalculator (Track B) needs LibreOffice ≥ 25.8 with Calc and a
python-uno the driver can import. `dev/setup-libreoffice` installs
TDF's bundle into `/opt/libreoffice25.8` (the distro's apt tops out at
24.2 on Ubuntu 24.04); the probe looks there first, then at PATH, and
verifies the *chosen* install: its version, that its Calc actually
loads a spreadsheet, and that an interpreter matched to it imports
uno. Exit 0 means every prerequisite is met; anything else names the
gaps, line by line.

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


def _version_of(binary: str) -> tuple[int, int] | None:
    try:
        out = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=60
        ).stdout
    except Exception:
        return None
    match = re.search(r"LibreOffice (\d+)\.(\d+)", out)
    if match is None:
        return None
    return (int(match.group(1)), int(match.group(2)))


def find_soffice() -> tuple[str | None, tuple[int, int] | None, str]:
    """The best soffice on this machine: newest first, PATH last.

    A distro LibreOffice on PATH shadows a TDF bundle in `/opt`, so
    the opt installs are inspected first and the best version wins.
    """
    candidates = sorted(
        str(p) for p in Path("/opt").glob("libreoffice*/program/soffice")
    )
    on_path = shutil.which("soffice")
    if on_path:
        candidates.append(on_path)
    best: tuple[tuple[int, int], str] | None = None
    for binary in candidates:
        version = _version_of(binary)
        if version is not None and (best is None or version > best[0]):
            best = (version, binary)
    if best is None:
        return None, None, "soffice: none found (checked /opt/libreoffice*, PATH)"
    version, binary = best
    line = f"soffice: LibreOffice {version[0]}.{version[1]} at {binary}"
    if version < REQUIRED:
        return (
            binary,
            version,
            (f"{line} — below the required {REQUIRED[0]}.{REQUIRED[1]}"),
        )
    return binary, version, line


def probe_calc(soffice: str) -> tuple[bool, str]:
    """Prove the chosen install's Calc opens a spreadsheet: convert a CSV."""
    with tempfile.TemporaryDirectory(prefix="recalc-probe-") as tmp:
        seed = Path(tmp) / "probe.csv"
        seed.write_text("a,b\n1,2\n")
        try:
            subprocess.run(
                [
                    soffice,
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


def probe_uno(soffice: str | None) -> tuple[bool, str]:
    """Find an interpreter matched to the chosen install that imports uno.

    The install's own bundled python first — a TDF bundle in `/opt`
    ships one, and only a matched interpreter is trustworthy against
    it. The system python (which a venv's `python3` shadows on PATH,
    so it is named outright) only vouches for a distro LibreOffice.
    """
    candidates: list[str] = []
    if soffice is not None:
        candidates.append(str(Path(soffice).parent / "python"))
    candidates += [str(p) for p in Path("/opt").glob("libreoffice*/program/python")]
    candidates += ["/usr/bin/python3", shutil.which("python3") or "", sys.executable]
    seen: set[str] = set()
    for binary in candidates:
        if not binary or binary in seen:
            continue
        seen.add(binary)
        if _imports_uno(binary):
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
    soffice, version, soffice_line = find_soffice()
    version_ok = version is not None and version >= REQUIRED
    checks = [(version_ok, soffice_line)]
    if soffice is not None:
        checks.append(probe_calc(soffice))
        checks.append(probe_uno(soffice))
    else:
        checks.append((False, "calc: unprovable, no soffice"))
        checks.append(probe_uno(None))
    for ok, line in checks:
        print(("  ok  " if ok else " LACK ") + line)
    if all(ok for ok, _ in checks):
        print("B1's prerequisites are met here. Fidelity is still unproven.")
        return 0
    print("B1 cannot run on this machine yet; the LACK lines say why.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
