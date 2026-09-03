# Native calculators behind the gate — IronCalc and Formualizer (2 September 2026)

The founder asked for the best open engine that parses a workbook
into a graph, executes the maths natively, and lets a broken number
be traced back to its cause. This is the record of what was found,
what was measured before anything was wired, and what was wired.

## The field

| Candidate | Language, licence | Graph and tracing | Verdict |
| --- | --- | --- | --- |
| Formualizer 0.8.4 | Rust, MIT or Apache; Python and WASM bindings | Precedents, dependents, a trace graph in both directions with depth and budget limits, an evaluation plan with layers, cycle telemetry, iterative settings, a changelog | **Adopted, behind the gate** |
| IronCalc 0.8.3 | Rust, MIT or Apache; Python bindings | None. Issue #849 « use dependency DAG » is open for 1.0 | **Adopted, behind the gate** |
| LibreOffice 25.8 | C++, MPL | None | Kept: the fallback for big files and the referee |
| HyperFormula 3.3 | TypeScript, GPLv3 or paid | Immediate precedents and dependents only; no dynamic arrays; 423 functions | No: licence, speed |
| Univer engine-formula | TypeScript, Apache | Internal, UI-oriented | No for a backend |
| EPPlus 8.7 | C#, Polyform non-commercial or paid | Internal chain; cycles throw or go empty | No |
| Aspose.Cells | .NET/Java/Python, paid (about US$1.2k–3.6k per developer) | Precedents and dependents in calculation | Paid escape hatch |
| Werkbook | Go, MIT, 16 stars, 198 functions | Internal | Too young |
| OpenXLSX-NX | C++, BSD, 120 functions | Single-formula evaluation, no workbook graph | No |
| formulas, xlcalcmodel | Python | Graph, slow | No |
| DataArt CalculationEngine | Java, Apache | Had an execution graph | Archived 2019 |

## Measured before wiring, on the founder's model (6,014 formula cells)

| Engine | Load + full recalculation | Cells matching Excel's stored values |
| --- | --- | --- |
| IronCalc | 0.09 s + 0.013 s | 5,991; the other 23 differ by floating-point dust (about 1e-7 on balance-check cells that Excel stored as 0) |
| Formualizer | 0.02 s + 0.29 s | 4,866; six legacy array formulas (`=TRANSPOSE(E20:X20)` entered over a block the old way) came back `#SPILL!` and 1,135 cells inherited the error |
| LibreOffice | 5.8 s + 20.8 s | 4,701 of 4,703 compared (the two are the same dust) |

Formualizer's own precedent trace located the six root cells; that
is the tracing the founder asked for, working on the first try.

On the 17 MB RIIO-3 business plan model: Formualizer loaded it and
refused to evaluate (spill conflict); IronCalc did not finish loading
within 25 minutes and was killed. LibreOffice handles it in minutes.

## What was wired

`polar/tieout/recalc/native.py`. Both engines implement the pool's
`Calculator` contract and run behind `gate_file`, which compares
every formula cell against what Excel itself saved. `native_recalc`
tries IronCalc, then Formualizer; the first whose numbers pass the
gate is believed for that file; otherwise LibreOffice runs as
before. Each engine runs in its own forked process, killed at 120 s.
Files above 8 MB skip the native engines entirely. Every attempt,
believed or not, is written on the artifact's recalculation mark
under `attempts`, so a mark that says « IronCalc » can be checked
against the attempt that earned it.

## What this changes for a customer

Speed, on models under the size limit: a recalculation that took
twenty seconds takes a fraction of one. It finds no new mistakes:
the rules that find mistakes are ours and did not change. It adds no
new trust: the gate is the reason any engine is believed, and it was
already there.

## Open, named

* ~~The gate's tolerance fails the founder's model on all three
  engines over 1e-7 dust.~~ **Decided by the founder, 2 September:
  « ignore the specks ».** The speck rule (`SPECK_RELATIVE = 1e-13`
  in `gate.py`) lifts the floor for near-zero cells in proportion to
  the largest number in the file. On a model in the billions that
  forgives differences under about a thousandth and still fails a
  penny. Re-measured after the change: the real path on the
  founder's model now believes IronCalc (see below).
* Formualizer's legacy array-formula defect is worth reporting
  upstream; the project is active.
* Neither Rust engine is ready for the biggest models. The size
  guard says so rather than waiting to find out.
