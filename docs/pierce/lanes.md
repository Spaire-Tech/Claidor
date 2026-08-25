# The lanes — five agents, one engine, no collisions

25 August 2026. The division of labour for parallel work, written
before any lane opens. Every agent reads `notes.md` first (the canon:
product = `swens.md`, plan = `swens-plan.md`), then this file. The
lead (the founder's principal session) integrates; the founder
decides. Where this file and `swens-plan.md` disagree, the plan wins;
where anything disagrees with `swens.md`, `swens.md` wins.

## The one hard rule

**Only Sentinel may change what the engine reports.** Every findings
change regenerates `docs/pierce/corpus-golden-master.json`, and that
baseline is a single answer sheet — two hands on it produce
unmergeable, unreviewable diffs. Every other lane treats the engine
as a read-only library. A lane that believes the engine *should* say
something different writes the case in its log and the lead routes it
to Sentinel as a registered round. No exceptions, including
« harmless » ones.

## Who owns what (paths; touching another lane's paths is a defect)

| Lane | Owns | Never touches |
|---|---|---|
| **Sentinel** — engine findings (Track A) | `server/polar/tieout/{audit,structure,analytics,workbook}.py`, `docs/pierce/corpus-golden-master.json`, `server/scripts/{corpus_gate,corpus_au_uk,custodes_*,model_corpus}.py`, new planting harnesses under `server/scripts/planting/`, `server/tests/tieout/test_audit*`, `test_shape*`, `test_structure*` | product code, other lanes' packages |
| **Dynamo** — recalculator (Track B) | new package `server/polar/tieout/recalc/`, `server/tests/tieout/test_recalc*`, `server/scripts/recalc_*` | everything else |
| **Prism** — the Watch (Track C) | new package `server/polar/tieout/watch/`, `server/tests/tieout/test_watch*`, `server/scripts/watch_*` | everything else |
| **Scribe** — the Chain (Track D) | new package `server/polar/tieout/chain/` (incl. its own router file, mounted at integration by the lead), `server/tests/tieout/test_chain*`, `server/scripts/{corpus_documents,corpus_extract_pdfs}*` | everything else |
| **Atelier** — product & delivery (G + H) | `clients/**`, `server/polar/tieout/{endpoints,schemas,service}.py`, `server/scripts/demo_*`, the posture doc | engine modules, other lanes' packages |
| **Lead** (this session) | `swens-plan.md`, `notes.md`, `worklog.md`, this file; merges; cross-lane arbitration | — |

Each lane writes its own running log at `docs/pierce/logs/<name>.md`
— never the shared worklog, which the lead maintains at integration.

## Frozen interfaces (changes only by a lead-approved bump, here)

1. `read_workbook(path) -> Workbook`, `Workbook.cells`
   (`"Sheet!Ref" -> Cell`) and `Cell`'s fields — the reader surface
   every lane stands on. Sentinel may optimize its interior; the
   surface is frozen.
2. `polar.tieout.audit._shape(cell, anchoring=True) -> str` — the
   formula-shape signature Prism aligns on. Its behaviour moves only
   through Sentinel's registered, gate-certified rounds.
3. `audit(book, axes) -> Audit` and `Finding`'s fields. New
   per-finding data travels in the `evidence` dict — that is the
   extension channel; it flows to the product untouched, so Sentinel
   never needs `service.py` and Atelier never needs `audit.py`.
4. The findings JSON the product reads (`FindingRead`) — Atelier's;
   engine-side additions are requested through the lead.
5. New Python dependencies: proposed in the lane's log, approved by
   the lead before install — one `pyproject` owner (the lead) so
   lockfiles never collide.

## Branches and merges

- One branch per lane: `swens/sentinel`, `swens/dynamo`,
  `swens/prism`, `swens/scribe`, `swens/atelier` — all based on
  `claude/pierce-phase-6-writing-mjkaj6`'s tip.
- A lane pushes only to its own branch. **No lane merges itself.**
- Integration is by the lead, one lane at a time, with the full
  golden-master gate and the conftest-free tieout tests run at every
  merge. A lane rebases onto the integrated tip only when the lead
  says the tip moved.

## Discipline every lane carries

- Read `docs/pierce/notes.md` before answering anything of record.
- Registration before results: the harness and the rules are written
  and committed before a number is looked at. Refusals are honest.
- Heavy workbook jobs run alone in the container (a concurrent pair
  OOM-killed a sweep here; the lesson is paid for).
- Corpora are rebuilt with the committed fetchers
  (`scripts.corpus_au_uk`, `scripts.model_corpus`), never committed.
- Plain-language reports to the founder; no model identifiers in any
  pushed artifact.

## Charters and first tasks

**Sentinel** — the checks and the answer sheet. First: the A3
candidates through the loop, in order, starting with totals-row
sibling disagreement (`custodes-mining.md` verdicts) — planted
defects on our corpora first, catch rate and false-positive price
measured, gate at every step. Then A4 (the coverage denominator on
every report). Then A1's next round (the reader's range-expansion
storm — `a1-performance.md` names it). Owns gate questions from
other lanes.

**Dynamo** — the recalculator. First: audit the environment and
write exactly what B1 needs and lacks (LibreOffice ≥ 25.8,
python-uno) in its log for the founder. While blocked: the fidelity
gate's tolerance and denylist logic per `ambre-toolbox.md`, tested
against synthetic stored-vs-computed fixtures; the worker pool
behind an interface with a fake calculator so the real UNO wiring is
one class when the machine exists; B4's planted-defect registrations
(no results without the machine, and none claimed).

**Prism** — the Watch. First: C1, the raw version diff, hand-check
registered against an adjacent ED2 pair (`scripts.corpus_au_uk`
fetches all eleven versions; `corpus_pairs/` holds more). Then C2:
the dynamic-programming alignment on label + formula-shape
signatures per the amended plan — planted-edit harness registered
first, the O(n⁴) cost measured on the biggest file before anything
depends on it.

**Scribe** — the Chain. First: survey what `docling` and
`pdfplumber` need and whether this network serves them (report,
don't fight); D1 citation-grade extraction over the document corpus
— every number with page and highlight box, scans refused in words;
D2 the fact-store contract (fact id → page + box) as a JSON schema
proposed in its log before any database work.

**Atelier** — the product and the door. First: the security posture
doc (H2 — closed-by-default deals, the answers written before they
are asked); the sales demo kit (task #18); the endpoint-level test
for the marked-up model download (document honestly if the container
cannot run the database fixtures); then the version dropdown's
re-scoping, listed in `swens-product-build.md` as undone.
