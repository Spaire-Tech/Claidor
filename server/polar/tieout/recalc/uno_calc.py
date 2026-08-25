"""`UnoCalculator` — the one class the machine needed (B1, real).

The `Calculator` interface was built blind against a fake; this is
the adapter that fills it in now that `dev/setup-libreoffice` puts
LibreOffice ≥ 25.8 in `/opt`. Per instance: one headless soffice
process on its own named pipe with its own user profile (soffice
instances sharing a profile silently talk to one process — the pool's
recycling would be theatre), and one driver process
(`uno_driver.py`) running under the **bundled** interpreter, because
that is the only Python whose `uno` matches the install. The venv
never imports uno; it speaks JSON lines over the driver's pipes.

The pool's lifecycle maps directly: `start` brings the pair up,
`recalculate` is one document at a time, `stop` tears the pair down;
the pool recycles instances every N documents because soffice leaks.
"""

import json
import math
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path

from .gate import CalcSettings, read_calc_settings
from .pool import CalculatorError, RecalcResult

#: The version floor, same as the probe's: below it, XLOOKUP/LET
#: models fail for engine reasons and every number would be a lie.
REQUIRED = (25, 8)

DRIVER = Path(__file__).parent / "uno_driver.py"


def find_install(required: tuple[int, int] = REQUIRED) -> Path | None:
    """The newest adequate LibreOffice `program/` directory, or None.

    `/opt/libreoffice*` (TDF bundles, where `dev/setup-libreoffice`
    puts 25.8) first; a PATH soffice is considered too, so a machine
    with an adequate distro build also qualifies.
    """
    candidates = [p.parent for p in Path("/opt").glob("libreoffice*/program/soffice")]
    on_path = shutil.which("soffice")
    if on_path:
        candidates.append(Path(on_path).resolve().parent)
    best: tuple[tuple[int, int], Path] | None = None
    for program in candidates:
        version = _version_of(program / "soffice")
        if version is not None and (best is None or version > best[0]):
            best = (version, program)
    if best is None or best[0] < required:
        return None
    return best[1]


def _version_of(soffice: Path) -> tuple[int, int] | None:
    try:
        out = subprocess.run(
            [str(soffice), "--version"], capture_output=True, text=True, timeout=60
        ).stdout
    except Exception:
        return None
    match = re.search(r"LibreOffice (\d+)\.(\d+)", out)
    return (int(match.group(1)), int(match.group(2))) if match else None


class UnoCalculator:
    """One soffice + one driver, one document at a time.

    `document_timeout` bounds a single `calculateAll` round trip; the
    corpus's regulator models are 100k+ cells and this box is the
    shared noisy class, so the default is generous. A timeout kills
    the pair and raises — the pool replaces the calculator and
    retries the document once, per its registered discipline.
    """

    def __init__(
        self,
        program: Path | None = None,
        *,
        startup_timeout: float = 90.0,
        document_timeout: float = 1800.0,
    ) -> None:
        resolved = program or find_install()
        if resolved is None:
            raise CalculatorError(
                "no LibreOffice >= "
                f"{REQUIRED[0]}.{REQUIRED[1]} on this machine — "
                "run dev/setup-libreoffice (see docs/pierce/logs/dynamo.md)"
            )
        self.program = resolved
        version = _version_of(resolved / "soffice") or REQUIRED
        self.engine = f"LibreOffice {version[0]}.{version[1]} (UNO, {resolved})"
        self.startup_timeout = startup_timeout
        self.document_timeout = document_timeout
        self._soffice: subprocess.Popen[bytes] | None = None
        self._driver: subprocess.Popen[str] | None = None
        self._lines: queue.Queue[str | None] = queue.Queue()
        self._profile: str | None = None
        self._request_id = 0

    def start(self) -> None:
        self._profile = tempfile.mkdtemp(prefix="recalc-uno-")
        pipe = f"claidor-recalc-{os.getpid()}-{uuid.uuid4().hex[:12]}"
        self._soffice = subprocess.Popen(
            [
                str(self.program / "soffice"),
                "--headless",
                "--invisible",
                "--norestore",
                "--nologo",
                "--nolockcheck",
                f"--accept=pipe,name={pipe};urp;",
                f"-env:UserInstallation=file://{self._profile}",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self._driver = subprocess.Popen(
            [str(self.program / "python"), str(DRIVER), "--pipe", pipe],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        threading.Thread(target=self._pump, daemon=True).start()
        greeting = self._read(self.startup_timeout)
        if greeting is None or not greeting.get("ready"):
            detail = (greeting or {}).get("fatal", "driver produced no greeting")
            self.stop()
            raise CalculatorError(f"UNO bridge failed to come up: {detail}")

    def recalculate(self, path: str, *, store_to: str | None = None) -> RecalcResult:
        if self._driver is None or self._driver.stdin is None:
            raise CalculatorError("calculator not started")
        settings = _settings_dict(read_calc_settings(path))
        self._request_id += 1
        request = {
            "id": self._request_id,
            "path": str(Path(path).absolute()),
            "calc": settings,
        }
        if store_to is not None:
            request["store_to"] = str(Path(store_to).absolute())
        try:
            self._driver.stdin.write(json.dumps(request) + "\n")
            self._driver.stdin.flush()
        except OSError as error:
            raise CalculatorError(f"driver pipe broken: {error}") from error
        response = self._read(self.document_timeout)
        if response is None:
            raise CalculatorError(
                f"no answer for {path} within {self.document_timeout:.0f}s"
            )
        if response.get("error"):
            raise CalculatorError(str(response["error"]).strip().splitlines()[-1])
        raw = response.get("values")
        if not isinstance(raw, dict):
            raise CalculatorError(f"malformed driver response for {path}")
        values = {str(ref): _jsonsafe(value) for ref, value in raw.items()}
        return RecalcResult(values=values, engine=self.engine)

    def stop(self) -> None:
        if self._driver is not None:
            try:
                if self._driver.stdin is not None:
                    self._driver.stdin.write('{"exit": true}\n')
                    self._driver.stdin.flush()
                self._driver.wait(timeout=5)
            except Exception:
                self._driver.kill()
        if self._soffice is not None:
            try:
                self._soffice.terminate()
                self._soffice.wait(timeout=5)
            except Exception:
                self._soffice.kill()
        self._driver = None
        self._soffice = None
        if self._profile:
            shutil.rmtree(self._profile, ignore_errors=True)
            self._profile = None

    @property
    def alive(self) -> bool:
        return (
            self._driver is not None
            and self._driver.poll() is None
            and self._soffice is not None
            and self._soffice.poll() is None
        )

    def _pump(self) -> None:
        driver = self._driver
        if driver is None or driver.stdout is None:
            return
        for line in driver.stdout:
            self._lines.put(line)
        self._lines.put(None)

    def _read(self, timeout: float) -> dict[str, object] | None:
        try:
            line = self._lines.get(timeout=timeout)
        except queue.Empty:
            return None
        if line is None:
            return None
        try:
            parsed = json.loads(line)
        except ValueError:
            return None
        return parsed if isinstance(parsed, dict) else None


def _settings_dict(settings: CalcSettings) -> dict[str, object]:
    return {
        "iterative": settings.iterative,
        "count": settings.iterate_count,
        "delta": settings.iterate_delta,
    }


def _jsonsafe(value: object) -> float | str | None:
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return value if not isinstance(value, bool) else str(value)
    if isinstance(value, (int, float)):
        number = float(value)
        return number if math.isfinite(number) else f"#NONFINITE:{number!r}"
    return str(value)
