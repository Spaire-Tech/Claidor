# Dynamo — lane log (Track B, the recalculator)

Branch `swens/dynamo`, based on `claude/pierce-phase-6-writing-mjkaj6`
at `265bfeb`. This lane owns `server/polar/tieout/recalc/`,
`server/tests/tieout/test_recalc*`, `server/scripts/recalc_*`, and this
file — nothing else. The engine is a read-only library here.

## 25 August 2026 — the environment audit (first task, for the founder)

Every claim below was measured in this container today, with the
command that produced it. This is the container's state, not a promise
about any other machine.

### What B1 needs (per `ambre-toolbox.md` §2 and `swens-plan.md` B1)

1. **LibreOffice ≥ 25.8** (hard floor 25.2; 24.8 is where XLOOKUP,
   LET, FILTER and the array stack arrived — a model using any of
   them cannot recalculate on anything older), **with the Calc
   component**, headless.
2. **python-uno** matched to that LibreOffice, so a driver can open
   the UNO socket, push the file's own `calcPr` iteration settings,
   and call `calculateAll()` — the CLI convert path does not reliably
   recalc, so the socket path is not optional.
3. Room for a pool of long-lived soffice workers, one document per
   process, recycled every N files.

### What this container has

- **LibreOffice 24.2.7.2** (`soffice --version`) — below the floor,
  and **without Calc**: only `libreoffice-{core,common,style-colibre,
  uiconfig-common}` are installed (`dpkg -l`). Proof it cannot open a
  spreadsheet at all: `soffice --headless --convert-to xlsx` on a
  two-cell CSV fails with « Error: source file could not be loaded ».
- **python3-uno 24.2.7** for the *system* Python (3.11.15):
  `import uno` succeeds there.
- The project venv runs **Python 3.14.0rc2** (`requires-python
  >=3.14.0`), and `import uno` fails there. It always will:
  python-uno is not on PyPI — it ships with a LibreOffice build,
  compiled against one interpreter. The venv will never import uno
  directly, whatever gets installed.
- Resources: 4 CPUs, 15 GB RAM, ~30 GB free disk. Enough for a small
  worker pool; the standing rule that heavy workbook jobs run alone
  still applies.

### What it lacks, and the observed remedies (founder's decision — nothing installed)

- **Calc.** `apt-get install -s libreoffice-calc` resolves cleanly to
  4:24.2.7 and the Ubuntu archive answers (HTTP 200) — one command
  away, but it lands on **24.2**, below the floor: no XLOOKUP, no
  LET, so any modern model would fail its recalc for engine reasons,
  not model reasons. Good enough only for smoke-testing the wiring.
- **25.8 itself.** Ubuntu 24.04's archive tops out at 24.2.7 — no apt
  path to 25.x. `download.documentfoundation.org` is reachable from
  here (HTTP 200), so installing TDF's own 25.8 deb bundle into
  `/opt/libreoffice25.8` is feasible in principle; TDF builds bundle
  their own Python with uno, which sidesteps the distro python3-uno
  version lock. Not attempted: the lane rules route new dependencies
  through the log for approval first, and this container is
  ephemeral — the install that matters is on the machine B1 will
  actually live on.

### What the audit decides about the architecture

Because the venv can never import uno, the UNO client is
**out-of-process by construction**: a small driver script executed
under the LibreOffice-matched interpreter (system python3 today, the
TDF-bundled python under 25.8), speaking to the venv over
stdin/stdout. So the recalc package is built behind a `Calculator`
interface now, with a fake calculator for tests; when the machine
exists, the real UNO wiring is one adapter class plus one driver
script, and nothing above the interface changes.

### While blocked on the machine (charter work, no machine results)

- The fidelity gate's tolerance and denylist logic per
  `ambre-toolbox.md`, tested against synthetic stored-vs-computed
  fixtures.
- The worker pool behind the `Calculator` interface with a fake
  calculator.
- B4's planted-defect registrations — written and committed before
  any result is looked at.

**No fidelity number, match rate, or catch rate in this log is a
machine result until a LibreOffice ≥ 25.8 with Calc has actually run.
None exists yet.**
