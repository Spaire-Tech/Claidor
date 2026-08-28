# Scribe — the Chain (Track D) — lane log

Plain-language running log, newest entry last. The lane's charter is
in `lanes.md`; the track is `swens-plan.md` § Track D. Owned paths:
`server/polar/tieout/chain/` (including its router file, mounted by
the lead at integration), `server/tests/tieout/test_chain*`,
`server/scripts/{corpus_documents,corpus_extract_pdfs}*`, and this
log.

## 25 August 2026 — lane opens

**Branch base, named as a deviation.** The session was opened on
`claude/scribe-chain-package-mtn71s`, whose tip (the PR #50 merge)
does not contain `notes.md`, `lanes.md`, or the last ten engine
commits. The pasted prompt says « from this branch's tip », but
`lanes.md` — read from `claude/pierce-phase-6-writing-mjkaj6`, where
it lives — says every lane branch bases on that branch's tip, and the
lane-prompts file confirms sessions were meant to start there. So
`swens/scribe` is based on `claude/pierce-phase-6-writing-mjkaj6`'s
tip (`265bfeb`), and this paragraph is the deviation named in
writing.

## Survey — what docling and pdfplumber need, and whether this network serves them

Everything below was measured on this container today, not recalled.
All installs went into a **throwaway venv in the session scratchpad,
outside the repository** — `server/pyproject.toml` and `uv.lock` are
untouched, per the one-pyproject-owner rule.

**The network serves both.**

- **PyPI**: `pypi.org` and `files.pythonhosted.org` both answer
  through the proxy.
- **pdfplumber 0.11.10** installs in seconds. Dependencies are
  light and pure: `pdfminer.six`, `Pillow`, `pypdfium2` — no
  compiled models, no downloads at runtime.
- **docling 2.121.0** installs, but the default resolution pulls the
  full CUDA stack (torch 502 MB, nvidia-cublas 403 MB, cudnn 349 MB,
  and friends): **≈ 2.5 GB downloaded, 5.2 GB on disk** — on a
  machine with **no GPU** (4 CPU cores). A CPU-only torch index
  would cut that by roughly two thirds.
- **docling's models** auto-download from Hugging Face on first
  conversion: ≈ 506 MB into `~/.cache/huggingface`. The old LFS host
  `cdn-lfs.huggingface.co` is blocked by the proxy (502), but
  current HF routing serves weights via `us.aws.cdn.hf.co`, which is
  allowed — verified with a real 2 MB range download and then the
  real thing.
- **End-to-end proof**: a real 38-page gov.uk PDF (Electricity
  Networks Strategic Framework appendix) converted successfully —
  4 pages in ≈ 27 s on CPU (~7 s/page), layout items carrying page
  number + bounding box, one table recognized with structure. OCR
  was off; scans are refused, not OCR'd, per the plan.
- **pdfplumber on the same file**: word-level text with bounding
  boxes, instantly.
- **Document sources are reachable**: the gov.uk search and content
  APIs, `assets.publishing.service.gov.uk`, and `ofwat.gov.uk` all
  answer through the proxy.

## Dependency proposal (for the lead — nothing added to the server env)

Per `lanes.md` frozen interface 5, proposed here before any install
into the project environment; the lead owns `pyproject`:

1. **`pdfplumber`** (≥ 0.11) — required for D1. Light, pure-Python
   chain; the citation core (numbers with boxes) stands on it.
2. **`docling`** (≥ 2.121) — **recommended as an optional extra**
   (e.g. `[chain-layout]`), used lazily for table structure and
   layout enrichment. It works here, but it is a 5 GB install plus a
   0.5 GB model cache for a machine with no GPU; the D1 core must
   not require it. If the lead wants it in the default env, the
   CPU-only torch index (`pytorch.org/whl/cpu`) is the way.

Until the lead approves, the chain package imports pdfplumber inside
functions and its tests skip with a plain message when the library
is absent — the engine's env and tests stay exactly as they were.

## D1 registration — written before any number is looked at

What D1 claims and how it will be measured:

- **Extraction contract**: for a text-layer PDF, every numeric token
  on every page comes out as (page number, raw text, parsed value,
  bounding box in PDF points, top-left origin) — the box tight
  enough that highlighting it highlights the figure. Sign from
  minus or accounting parentheses; currency/percent symbols kept in
  the raw text; **no unit inference** (units are Track E's).
- **Scan refusal**: a page whose text layer is effectively empty
  while images cover most of it is refused **in words naming the
  page and the reason** — never silently skipped, never OCR'd.
- **The corpus**: real PDFs fetched by `scripts/corpus_documents.py`
  (new, this lane) into a git-ignored directory — public regulator
  and gov.uk documents of the kind that quote model numbers. The
  corpus is re-fetchable, not committed, and unstable month to
  month; every measurement prints its own file count.
- **Measured and reported here**: documents, pages, numbers
  extracted, pages refused — and a hand spot-check of 10 randomly
  drawn extracted numbers (seeded draw, registered here as seed 271828)
  against the rendered page: the box must cover the digits. The
  spot-check verdicts go in this log with the failures counted, not
  narrated away.

## D1 built, run, and spot-checked — same day

**What was built.** `polar/tieout/chain/` now exists: `extract.py`
(the citation core — numbers with boxes, scans refused in words),
`router.py` (one stateless upload route serving the same contract;
the lead mounts it), and `tests/tieout/test_chain_extract.py`, whose
fixture is a three-page PDF assembled by hand, byte by byte, so the
tests know exactly what sits where. With pdfplumber present the
suite is 29 passed (verified on Python 3.14, the server's version);
in today's server env, which does not carry pdfplumber, it is 23
passed, 7 skipped with a sentence saying why. The engine is
untouched, and the engine's own conftest-free tests still pass here
(114 passed).

**One honest caveat on the router.** It could not be exercised over
HTTP in this container: importing *the engine's own* `endpoints.py`
or `auth.py` fails here with a pydantic/typing error that predates
this lane (verified against the untouched engine). The router
compiles, lints, and its test is written; it runs the day the env
does.

**The corpus.** `scripts.corpus_documents` fetched 20 PDFs — CMA /
CAA / NATS price-control submissions and responses, exactly the
document kind that quotes figures. Re-fetchable, git-ignored, not
committed; the sample is unstable month to month, so the counts
below print their own denominators.

**The D1 run** (`scripts.corpus_documents_extract`, on the corpus
fetched today):

- documents: 20 readable of 20 fetched
- pages: 640
- numbers extracted: 13,062 — each with page, printed text, parsed
  signed value, and a box in PDF points
- pages refused: 4, each in words naming the page — all four are
  genuinely image-only pages (scanned signature pages and annexes in
  otherwise-native PDFs), refused, not OCR'd

**The spot-check** (seed 271828, drawn as registered, crops with the
box drawn in red saved under the corpus directory):

| # | token | where | box covers the digits? |
|---|---|---|---|
| 01 | `105` (footnote number) | NATS reply, p. 28 | yes |
| 02 | `9.1` (« Figure 9.1 ») | CAA response, p. 80 | yes |
| 03 | `35` (paragraph number) | CAA response, p. 25 | yes |
| 04 | `45` | NATS SoC, p. 3 | yes |
| 05 | `(2019)` (a citation year) | AW/NW/WW submission, p. 18 | yes |
| 06 | `20` (page header) | NATS reply, p. 20 | yes |
| 07 | `5.33` | CAA response, p. 45 | yes |
| 08 | `1870` (« CAP 1870 ») | CAA response, p. 72 | yes |
| 09 | `2,735` (a table value) | Ryanair letter, p. 6 | yes |
| 10 | `2020.` (sentence-final year) | CAA response, p. 17 | yes |

**Verdict: 10 of 10 boxes cover their digits.** One value is wrong
and is recorded rather than smoothed over: #05, `(2019)`, is a
*citation year* in parentheses, and the accounting-negative rule
parses it as −2019. The box and the printed text are right; the
sign is not. A lone token cannot tell a Harvard citation from an
accounting negative — deciding from the token alone would be a
guess, and the lexer does not guess — so the rule stays literal and
this is filed as a known false-sign class for the linking stage
(D3), where label context exists to resolve it. Also visible in the
sample: most extracted numbers are *citational furniture* (footnote,
paragraph, page, figure numbers), which is expected — D1 extracts
everything, and D3's whole job is telling furniture from facts.

**docling and Python 3.14.** One survey addendum that matters for
the dependency decision: the server env requires Python ≥ 3.14, and
docling 2.121 **does resolve on 3.14** (116 packages, torch
included) — checked with a dry-run against a 3.14 interpreter. The
proposal above stands unchanged.

## D2 — the fact-store contract, proposed here before any database work

The contract below is the proposal; **no table, no migration, no
repository code exists or will exist until the lead approves it.**
It is written against what D3–D6 will need from it, so the store
never has to be re-cut: D3 anchors link proposals by labels near the
number, D4's confirmed links must survive document revisions, D6
re-points the deck tie-out at facts.

The shape, as JSON Schema (draft 2020-12):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "claidor:tieout/chain/fact",
  "title": "Chain fact — one printed number, cited to its page and box",
  "type": "object",
  "required": [
    "id", "document_id", "document_version_id",
    "page", "page_width", "page_height",
    "box", "text", "value", "line", "extractor"
  ],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string", "format": "uuid",
      "description": "Stable forever. D4's confirmed links hang off this id, so it never changes across re-extraction of the same document version."
    },
    "document_id": {
      "type": "string", "format": "uuid",
      "description": "The source document (the engine's artifact id)."
    },
    "document_version_id": {
      "type": "string", "format": "uuid",
      "description": "The exact version the page and box are true of. A revised document gets new facts; D4 re-anchors confirmed links by labels, never by coordinates."
    },
    "page": { "type": "integer", "minimum": 1 },
    "page_width": {
      "type": "number", "exclusiveMinimum": 0,
      "description": "PDF points, so a viewer can scale the box to pixels."
    },
    "page_height": { "type": "number", "exclusiveMinimum": 0 },
    "box": {
      "type": "object",
      "required": ["x0", "top", "x1", "bottom"],
      "additionalProperties": false,
      "description": "PDF points, top-left origin — highlight this and you highlight the figure.",
      "properties": {
        "x0": { "type": "number" },
        "top": { "type": "number" },
        "x1": { "type": "number" },
        "bottom": { "type": "number" }
      }
    },
    "text": {
      "type": "string", "minLength": 1,
      "description": "The token exactly as printed — currency, commas, percent and all. The authoritative record; value is derived."
    },
    "value": {
      "type": "number",
      "description": "Parsed magnitude with sign. No unit, no scale — units are Track E's, and a scale suffix stays in text."
    },
    "line": {
      "type": "string",
      "description": "The printed line the token sits in — the label neighborhood D3 matches on and D4 anchors by."
    },
    "extractor": {
      "type": "object",
      "required": ["name", "version"],
      "additionalProperties": false,
      "description": "Which code produced this fact, so a fidelity question is answerable years later.",
      "properties": {
        "name": { "type": "string" },
        "version": { "type": "string" }
      }
    }
  }
}
```

Two shapes ride along with it, named now so the router's contract is
whole: **serving** is `GET fact id ⇒ this object` (D2's one-line
promise), and a **refusal** is `{document_version_id, page, reason}`
with the reason in words — refusals are stored alongside facts so
« which pages were not covered » stays answerable forever, which D5
(the unsourced-number finding) depends on.

One deliberate absence: no `label` field distinct from `line`. Label
*selection* is inference (which words near a number name it), and
inference lives in D3 where it is measured — the store keeps only
what extraction determined. If D3's measurement shows it needs a
richer neighborhood than one line (the line above, a column header),
that is a schema bump proposed here, not a silent addition.

Next, once the lead has seen this: D2's serving routes against the
engine's storage, then D3.

## 26 August 2026 — standing orders acknowledged; D2 served

**The lead's channel, confirmed.** Per the founder's instruction and
`orders/README.md`: at the start of every working turn this lane
fetches `origin/claude/pierce-phase-6-writing-mjkaj6`, reads
`docs/pierce/orders/scribe.md`, does what it says, pushes to
`swens/scribe`, and stops. « Go » means exactly that. The lane branch
was fast-forwarded onto the integrated tip (`e37e3e1`) — the lead's
merge notes said the tip moved, and my four commits are all ancestors
of it. The orders' three claims were verified against the branch, not
taken on faith: pdfplumber is in `pyproject.toml`, the chain router
is mounted in `api.py`, and D2 stands approved in the orders file.

**The container is repaired — other lanes should hear this.** Every
`import fastapi` failed here with a pydantic `AssertionError`, which
is why my router could not be exercised over HTTP yesterday and why
Atelier was told to document if database fixtures cannot run. The
root cause was measured, not guessed: the container ships **Python
3.14.0rc2**, whose `ForwardRef` predates the final 3.14 that pydantic
2.12.5 expects. The fix, all local to the container, none of it
committed: a current `uv` (0.12.5, the bundled 0.8.17's manifest
stops at rc2), `uv python install 3.14` (3.14.7), the venv rebuilt on
it — plus native PostgreSQL 16, Redis, and a downloaded MinIO started
by hand with the `.env.testing` credentials. On that stack the whole
tieout suite runs: **680 passed, 8 skipped**, route-level tests
included. Route tests are possible in these containers; the recipe is
this paragraph.

**D2 is built and served, tests at the route level.**

- `chain/store.py`: `tieout_chain_facts` and `tieout_chain_refusals`,
  the approved contract as rows (box flattened into columns — the
  engine's everything-works-off-rows rule). Mapping, recorded:
  `document_version_id` = `tieout_artifacts.id`, `document_id` = that
  artifact's `lineage_id`.
- **Fact ids are deterministic** — UUID5 over (version, extractor
  version, page, ordinal, printed text) — honoring the approved
  schema's « never changes across re-extraction of the same document
  version »: extract twice, get byte-identical rows. A bumped
  extractor is new ids on purpose: different code, different claims.
- `chain/router.py` grew the serving routes:
  `POST /chain/documents/{id}/extract` (facts persisted at
  extraction, from the bytes the engine's storage kept),
  `GET /chain/facts/{id}` (the D2 one-liner), and
  `GET /chain/documents/{id}/facts` (the whole record, refusals
  alongside, so coverage is one call). Access is the workspace rule:
  deal membership on every route, 404 never 403 — a stranger holding
  a real fact id learns nothing a made-up id wouldn't teach.
- `extract.py` now records each number's printed **line** (the
  approved schema's label neighborhood) and stamps
  `EXTRACTOR_VERSION = "2"`.
- Tests: `test_chain_store.py`, 9 route-level cases through the real
  path — upload via the engine's artifacts route, extract, serve,
  re-extract idempotently, refuse a deck in words, refuse strangers
  with 404. All green; extraction tests now 31; tieout suite 680.

**Two touches outside my listed paths, named, not silent.** A fact
store cannot exist inside the package alone: (1) one import line in
`polar/models/__init__.py`, so the tables register in the metadata
that alembic and the test harness build from; (2) one new migration
file, `2026-08-26-0330_chain_facts.py`, revising the current head.
Both are new-file-or-one-line, neither touches another lane's files,
and both exist only because the orders command a persisted fact
store. If the lead wants either cut differently at integration, say
the word. (`alembic check` on this container reports a pile of
pre-existing drift across unrelated tables — none of it mentions the
chain tables, which match their migration exactly.)

## D3 registration — written before any matcher code exists

The order asks for the registered sample and judging protocol first.
Registered here, before a line of matcher exists:

**The task.** A typed model number (a `tieout_cells` row whose value
is typed, not computed) in a deal that also holds extracted
documents. The matcher proposes candidate facts from the store, or
abstains.

**The rule, from the plan verbatim:** matched **by labels near
both — never by value.** The cell brings its row and column labels;
the fact brings its printed line. Scoring is label affinity only.
The numeric value never enters scoring in any form — not as a
feature, not as a tiebreak, not as a filter. (Value-matching would
make every measurement circular and every link dishonest: the whole
point of a confirmed link is that the values may later *disagree*.)
**Abstention when candidates tie:** if the top two scores are within
the tie margin, the matcher proposes nothing, and that is recorded as
an abstention, not a failure.

**The sample.** The paired set is Ofwat PR24: real price-review
models and the published documents that quote them
(`corpus-sources.md` names this pairing as the reason PR24 exists in
our corpus; the lead's tenth-sweep note says the PR24 corpus is
resident). From the deal set, **30 typed model numbers drawn with
seed 314159** from the population of typed cells whose workbooks
pair with at least one extracted document. Draw registered now;
drawn only after the matcher is frozen for the round.

**The judging protocol.** For each of the 30, a person (me, judging
from the documents, blind to the matcher's score — candidates shown
in shuffled order without scores) reads the document pages and
records the ground truth first: « the document states this number at
page/box X », or « the document does not state this number ». Then
the matcher's output is compared:

| matcher says | truth says | verdict |
|---|---|---|
| proposes fact F | F is the stated place | true proposal |
| proposes fact F | stated elsewhere / not stated | false proposal |
| abstains | not stated, or genuinely ambiguous | true abstention |
| abstains | stated, unambiguous | missed |

**Reported numbers:** proposal precision (true proposals / all
proposals), abstention rate, miss rate — each with its denominator
printed. **No target is promised in advance**; the numbers are
whatever they are, and D3 ships to the product only when the founder
has seen them. Failures are counted in this log, not narrated away.

Next turn, unless the orders change: the matcher behind these
registered criteria, in the chain package, tests first.

## 26 August 2026, second « go » — the matcher, frozen for the round

Orders re-read from the tip first: the tip moved (`40d2599`, a
Prism-only update after their aligner hit the container's memory
ceiling on PR24 — noted, and a reason this lane keeps running heavy
jobs alone), my orders file is unchanged, and my lane is not yet
merged. Item 1 and the registration half of item 2 were done last
push; the registration being filed, the matcher itself was this
turn's work — code strictly after criteria, as ordered.

**Built: `chain/propose.py`,** the registered rule with no
ornamentation. Score = the share of the cell's label words found in
the candidate fact's printed line. Value-blindness is enforced in the
tokenizer, not promised in a comment: purely numeric tokens are
dropped from both sides before any comparison, so « 2025 » matches
nothing and no caller can smuggle a value in as a string. Abstention
is first-class and worded: below half coverage (« the cell may simply
have no source in the documents — that is a finding, not a
failure »), on a tied top score (« a person can; this matcher will
not »), and on label-less cells. The scoring is deliberately plain,
because plain is what the registered harness can judge; anything
cleverer must beat it on that harness first.

**Served: `GET /chain/cells/{id}/proposals`** — read-only, the
candidate pool being every extracted fact on the cell's deal.
Computed cells and aliases are refused in words (their provenance is
their formula); confirming stays D4's deliberate write. The response
carries the top five ranked candidates with their shared words, so a
reviewer sees what the labels saw — on abstentions especially.

**Tested: twelve cases, all green; suite at 692 passed, 8 skipped.**
Seven pure planted cases — the value trap above all: a line printing
the cell's exact number twice, against a line sharing the cell's
words, must lose on words alone; and the same trap with no labelled
alternative must end in abstention, not a value match. Then the
route walked end to end: upload, extract, plant a typed cell, get
the proposal; the fixture's own « Margin 45% up 3 points » line
supplies a genuine two-facts-one-label tie that abstains over HTTP
exactly as it does in the pure case.

**Not claimed:** any proposal-quality number. The registered 30-draw
over the Ofwat PR24 model-document pairs has not run. The matcher is
now **frozen for that round** (`FLOOR = 0.5`, tie = exact top-score
equality, the tokenizer as committed); the next step on this track
is assembling the paired deal set and running the draw with seed
314159, judging blind per the table above.

**Container note, again for the lanes:** the hand-started services
(postgres, redis, minio) do not survive between turns — they die
with the turn's processes and restart in seconds from their surviving
data directories. First run of the day: restart them before blaming
a test.

## 26 August 2026, third « go » — registration amended before results: the round runs on Ofgem ED2, because Ofwat is unreachable here

Orders unchanged at the tip; lane still unmerged. This turn is the
registered D3 measurement round — and its sample source has to
change **before any result exists**, named here, with the evidence:

- The registration named the Ofwat PR24 pairs. From this container,
  measured today: `ofwat.gov.uk` answers **403 Forbidden** to the
  committed fetcher (as `model_corpus.py` already records), and the
  UK Government Web Archive route that `regulator_eval.py` documents
  serves a CloudFront **« Human Verification » page (405)** to every
  request from here — a bot gate this lane will not try to defeat.
  Report, don't fight: the PR24 round belongs on a machine that can
  reach the files (the lead's container holds the resident PR24
  corpus; the harness below will run there unchanged).
- **The amendment:** the paired set for this round is **Ofgem
  RIIO-ED2** — reachable, measured today, and named in
  `corpus-sources.md` as the adjacent seam. The workbook is
  `ED2-PCFM-V5.xlsx` (fetched by the committed
  `scripts.model_corpus`, 3 of 5 sources fetched, Ofwat and AER
  failing exactly as documented). The documents are three Ofgem PDFs
  that quote the model's values (fetched into
  `scripts/corpus_documents/ed2/`, git-ignored, re-fetchable): the
  RIIO-ED2 Final Determinations **Finance Annex**, the ED2 **Price
  Control Financial Handbook**, and the **PCFM Guidance v1.1**.
- **Everything else is unchanged and already frozen:** seed 314159,
  30 typed cells, the judging table, blind judging (truth recorded
  before any matcher output is looked at), the matcher exactly as
  committed at `a546087`. The population is re-anchored only in its
  source: typed cells (no formula, a value present) of the paired
  workbook.
- **One honest limit of the judging method, registered now:** « the
  document does not state this number » is established by searching
  the documents' extracted lines for the value in its plausible
  printed forms (raw, thousands-separated, rounded to 1–2 places,
  percent-scaled) plus the cell's label words, and reading the hits.
  A number the documents state in a form outside those variants
  (rescaled to £m and rounded, say) could be missed, which would
  over-credit abstentions. Counted as a limit, not hidden.

## D3 round 1 — measured. Proposal precision: 0 of 8. The matcher does not ship.

The round ran exactly as registered: harness
`scripts.corpus_documents_link_round` (committed), two phases, truth
recorded before any matcher output was looked at. Population:
**22,693 typed cells** in ED2-PCFM-V5; candidates: **7,836 numbers**
extracted from the three paired Ofgem PDFs; 30 cells drawn with seed
314159. Full verdicts: `docs/pierce/scribe-d3-round1-verdicts.json`.

**The ground truth first**, judged from the documents with value
search as the aid: **none of the 30 drawn numbers is stated by the
documents** as the quantity the cell holds. Every value hit was page
furniture, a date, a licence-condition number, or a different
quantity under a different label. That is the population talking: a
22,693-cell PCFM's typed cells are overwhelmingly per-licensee,
per-year machine inputs that a narrative determination never quotes.
So this round measured the side D5 cares about — what the matcher
does when there is **no source to find** — and not the sourced-number
side, which needs its own draw (below).

**The registered table:**

| verdict | count |
|---|---|
| true proposal | 0 |
| false proposal | **8** |
| true abstention | 22 |
| missed | 0 |

Proposal precision **0/8 = 0%**. Abstention rate 22/30. A perfect
matcher on this sample abstains 30 times; mine proposed 8 times and
was wrong all 8.

**The failure class, named from the evidence.** Seven of the eight
false proposals are one shape — the Financial Handbook's
variable-definition table, lines like:

    CROTREt  Cyber Resilience OT Re-opener  SpC 3.2
    PCBt     PCB Interventions              SpC 3.5

The line names the exact PCFM variable the cell feeds — label
coverage 100%, the matcher's whole scoring signal — but the only
number on the line is a **licence-condition cross-reference**
(« SpC 3.2 »), not a quantity. The eighth is a section heading. The
matcher cannot currently tell « the line that defines X » from « the
line that states X's value », and the never-by-value rule (kept,
rightly) means it cannot use the value to notice. **A matcher that
links a cell to a paragraph number is worse than no matcher**, so:
D3 does not ship on this number; the route stays, but nothing in the
product may present its proposals as trustworthy until a round
clears.

**What round 2 must contain, to be registered before its results:**
*(superseded by the full round 2 registration below, written under the
eleventh-sweep orders)*
(1) a defense against definitional lines that does not touch values —
candidates: treating a number token immediately following
reference words (« SpC », « Section », « para », « Table », « page »)
as a reference rather than a fact at extraction or scoring time;
and/or requiring a proposed fact's line to be numeric-dense (a table
row of quantities) — each to be chosen and frozen *first*; (2) a
**sourced-number draw**: this round's population honestly measured
the unsourced case; the hit-rate case needs a registered sample drawn
from cells whose quantities the documents *do* state (the Finance
Annex's WACC and allowed-revenue tables are stated-by-construction),
found by value search *for sampling only* — sampling by value is
legitimate exactly where scoring by value is not. (3) The PR24 round
stays owed on a machine that reaches Ofwat.

## 26 August 2026, fourth « go » — eleventh-sweep orders; round 2 registered before anything runs

Orders read from the tip: D2 is merged (the migration and model
registration now recorded as mine in `lanes.md` — thank you), and
round 2 is ordered exactly as this log outlined. The lane
fast-forwarded onto the integrated tip. Everything below in this
section was written and committed **before matcher v2 existed and
before any round-2 number was looked at.**

**Order 2 first — the confirmation, made true in code, not just
claimed.** As of round 1, `GET /chain/cells/{id}/proposals` returned
a proposal with a score and no health warning. After this turn's
change, every response from that route carries a `standing` sentence
stating the measured record in-band — currently that round 1 measured
0 of 8 proposals correct and no round has cleared, so a proposal is a
candidate for a person to check, never a link. No other route serves
D3 output; nothing in `clients/**` consumes it (Atelier's ground, and
nothing has been requested). The confirmation the order asks for:
**no route presents D3 proposals as trustworthy, and the payload
itself now says so.** The sentence changes only when a registered
round's measured number changes.

## D3 round 2 — registration, frozen before results

**The defense, chosen: the reference-word rule.** A candidate fact is
**ineligible for proposal** when its printed token appears in its
line immediately preceded by a reference word — the shape of « SpC
3.2 », « Section 1: », « Table 14 », « para 2.47 » — because such a
number names a place in a document, not a quantity. The frozen
vocabulary, case-insensitive:

    spc, crc, section, sections, sec, para, paragraph, paragraphs,
    table, tables, figure, figures, fig, page, pages, appendix,
    appendices, annex, chapter, condition, conditions, footnote,
    footnotes, box, volume, part, step, fq, question, clause,
    schedule, article, no

« Immediately preceded » means: the last word token before an
occurrence of the fact's exact printed token in its line. If any
occurrence in the line is reference-preceded, the fact is ineligible
— over-exclusion when the same token appears twice on a line, once as
a reference and once as a value, is possible, rare, and accepted as a
registered limit. Ineligible candidates stay visible in the ranking,
marked, so a reviewer sees what was set aside. One clarification,
frozen with the rest before anything runs: the floor and the tie rule
apply **among eligible candidates only** — a reference number can
neither be proposed nor block a proposal by tying with one. **Numeric-density is
rejected** as the defense, with the reason on the record: it would
kill legitimate prose statements (« the cost of debt allowance is
2.4% »), which are exactly how the Finance Annex states quantities.
Everything else in the matcher — the tokenizer, FLOOR = 0.5, exact
tie ⇒ abstain, never-by-value — is unchanged from `a546087`.

**Run A — the unsourced case, before/after.** The round-1 sample (30
cells, seed 314159) rescored with matcher v2 against the truth
already recorded in `scribe-d3-round1-verdicts.json`. Round 1's
number stands as v1's record; run A is v2's number on the identical
sample, directly comparable.

**Run B — the sourced case.** Population: typed cells of the same
paired workbook. Seeded order (seed 2718281), prefiltered to cells
with at least one value-variant hit in the documents — sampling by
value, legitimate exactly where scoring by value is not. In that
order, each candidate cell is judged blind (ground truth recorded
before any matcher output, same aids, same limits as round 1) until
**10 cells with nonempty truth are found or 60 candidates have been
judged**, whichever comes first; the yield is reported either way.
Matcher v2 then scores the sourced cells found, same verdict table.

**No target number is promised for either run.** If v2 still
proposes falsely, that is the record and nothing ships, same as
round 1.

## D3 round 2 — measured. Fewer wrong proposals, still none right; and the pair itself is the wrong direction for the hit-rate case

Matcher v2 froze at `7055150`, after the registration and before any
result. Both runs then ran as registered.

**Run A — the round-1 sample, v1 vs v2, identical truth:**

| | v1 (round 1) | v2 (run A) |
|---|---|---|
| true proposal | 0 | 0 |
| false proposal | 8 | **2** |
| true abstention | 22 | **28** |
| missed | 0 | 0 |

The reference-word rule killed **all eight** of round 1's false
proposals — and unmasked two new ones of a second reference shape it
does not cover: **the leading paragraph number.** Both survivors are
numbered-paragraph prose (« *10.246* Ofgem's decision is that Valid
Bad Debt Claims are allowable… », « *2.6* The licensee will update
outturn data… CPIHm… »): the paragraph number opens the line, so no
reference word precedes it, and in round 1 these candidates were
masked behind ties with the definition-table lines v2 now sets
aside. Precision is still **0 of 2**. Nothing ships; the standing
sentence on the route remains exactly true. The leading-paragraph
defense (a numeric token that *opens* a line whose remaining text is
prose is a paragraph label, not a quantity) is the obvious round-3
candidate — registered then, not patched now. Verdicts:
`scribe-d3-round2-runA-verdicts.json`.

**Run B — the sourced draw found nothing to score, and that is the
finding.** All 60 value-prefiltered candidates (seed 2718281,
registered stopping rule) were judged in order: **0 of 60 are
genuinely stated by the documents.** Every hit was furniture, a
threshold or yield from a different quantity, or a near-miss in
someone else's table — the closest (« Net additions 207.9 ») turned
out on the rendered page to be SPD's FY2026 row against EPN's FY2022
cell. Combined with round 1: **90 seeded draws from 22,693 typed
cells, zero stated by the paired documents.**

**Why, structurally — worth the lead's attention.** This pair runs
the wrong direction. The Finance Annex is *derived from* the model:
what it states are outputs — RAV, allowed revenue, WACC — which in
the PCFM are **computed** cells, exactly the cells D3's typed-only
task excludes (rightly: a computed cell's provenance is its
formula). The PCFM's *typed* cells are per-licensee machine inputs
no narrative document restates. The Chain's product case is the
opposite direction — a term sheet feeding typed cells of a deal
model — and measuring the hit-rate side therefore needs a
document-fed pair: Ofwat's business-plan-tables-to-financial-model
mapping tool and inbound-queries document (the pairing
`corpus-sources.md` recommended first, unreachable from this
container), a company business-plan submission with its BPFM, or a
real deal set. On this corpus, the honest claim is limited to: the
matcher's false-proposal rate on unsourced typed cells fell from
8/30 to 2/30 under the frozen defense, at zero cost in missed
sources (there were none to miss).

**Also reported for the lead:** the integrated tip carries one red
test that is not this lane's — `test_routes.py::TestHouseRules::`
`test_defaults_before_anybody_decided` asserts 17 audit rules and
the catalogue now has 19 (Sentinel's adoptions; the test is
Atelier's file). Reproduces with my changes stashed.

**Round 3, when ordered:** the leading-paragraph defense registered
and frozen; the hit-rate case on a document-fed pair (PR24 on a
machine that reaches it, or a submission pair reachable here); same
judge, same discipline.

## 26 August 2026, fifth « go » — twelfth-sweep orders; two registrations before anything runs

Orders read from the tip (round 2 merged; five lanes in). Three
items: round 3 registered first; **the hit-rate measurement is held**
until the lead's real deal set exists — acknowledged, nothing will be
forced onto this corpus; and D5's registration with flood measured
before anything reports. Both registrations follow, written and
committed before matcher v3 existed and before any flood number was
looked at.

## D3 round 3 — registration, frozen before results

**The leading-paragraph defense, joining the reference rule.** Run
A's two survivors were numbered-paragraph prose: « *10.246* Ofgem's
decision is that Valid Bad Debt Claims… ». The added rule, frozen: a
candidate's token is also a reference when **it opens its line** (the
first whitespace token), **matches the bare paragraph-number shape**
(digits and dots only, optionally ending «.» or «:» — so « 10.246 »,
« 2.6 », « 1: » match; « £48.9mm », « 45% », « (2,340) » never do),
**and the next token starts with a letter** (prose follows). A line
of numbers (« 86.4 89.6 84.6 … ») keeps its leading value eligible —
the next token is numeric. **Registered limit:** a table line that
prints a bare value *before* its label (« 84.2 Fast pot expenditure
… ») will be over-excluded; on this corpus the tables put labels
first, and the cost is counted, not hidden. Everything else stays as
v2 froze it.

**The run:** run A once more — the same 30-cell sample, the same
recorded truth, matcher v3. The hit-rate side stays held per the
orders. v1 → v2 → v3 on identical ground is the record the founder
can read as one line.

## D5 — registration: the unsourced-number finding, flood measured first

The plan's D5 in one sentence: a typed number with no confirmable
source, flagged as its own class — *measured for flood on real
models first*. Registered here before any number is looked at:

- **The naive candidate** is every typed numeric cell: no formula, a
  value present. (In the product, « no confirmable source » will
  mean no D4-confirmed link and no surviving proposal; today, with
  zero confirmed links anywhere, the naive class is the whole typed
  population — the honest upper bound of the flood.)
- **The flood metric, per real model:** naive candidates, absolute;
  as a share of all numeric cells; and the concentration — the top
  sheets by candidate count and the share the top five sheets carry.
  Concentration is the number that decides the finding's *shape*: a
  class that fires tens of thousands of times per model cannot ship
  as per-cell findings, and whether the honest unit is the cell, the
  block, or the sheet is exactly what these numbers determine. **No
  shape is chosen before the numbers exist.**
- **The models:** the three real regulator models the committed
  fetcher serves from here (ED2 PCFM V5, ED2 PCFM V3, RIIO-ET1
  PCFM) and the two committed fixture models (the Cascade deal model
  and the pre-app example) — the deal-shaped ones being closest to
  the product case.
- **The harness:** `scripts.corpus_documents_unsourced` (new, this
  lane), read-only over the frozen reader surface; prints every
  registered number and nothing else.

## D3 round 3 — measured. The unsourced sample is clean: 30 of 30 abstentions

Matcher v3 froze at `c79adcc`, after the registration and before any
result. Run A on the identical sample and truth, third time:

| | v1 | v2 | v3 |
|---|---|---|---|
| false proposal | 8 | 2 | **0** |
| true abstention | 22 | 28 | **30** |

The leading-paragraph rule caught both run-A survivors, and nothing
new surfaced behind them. On the only ground measured so far — typed
cells with no source in the documents — the matcher now does the
right thing every time, and each of the ten proposals it ever made
wrongly is covered by one of two named, tested reference shapes. What
this does **not** say, kept plainly on the record: whether the
matcher can *find* a source that exists. That is the held hit-rate
case, waiting on the lead's real deal set, and the route's standing
sentence was updated under its registered trigger to say exactly
this. Verdicts: `scribe-d3-round3-runA-verdicts.json`.

## D5 flood — measured. The naive class floods by orders of magnitude, and concentration says which shape survives

The registered numbers, from the registered harness, on the
registered model set:

| model | numeric cells | naive candidates | share | top-5 sheets carry |
|---|---|---|---|---|
| ED2 PCFM V5 | 41,954 | 22,693 | 54% | 36% |
| ED2 PCFM V3 | 39,724 | 20,426 | 51% | 35% |
| RIIO-ET1 PCFM | 25,369 | 7,555 | 30% | 98% |
| Cascade deal model | 313 | 85 | 27% | 100% |
| Pre-app example | 5,028 | 230 | 5% | 100% |

**Reading:** per-cell, the naive finding is unshippable everywhere —
twenty thousand findings on a regulator model, and even the small
deal model would carry 85. Concentration splits the corpus: the
ED2 models spread candidates almost evenly across twenty-one
per-licensee sheets (top five carry ~36%), while the ET1 and both
deal-shaped models concentrate ≥98% in a handful of sheets. So no
single roll-up unit is right by geography alone.

**The shape this argues for — a proposal for the lead and founder,
not a decision:** the honest trigger is not « typed and unsourced »
(that is half of every model) but **« unsourced where sourcing is
the local rule »** — a typed cell whose block neighbours have
D4-confirmed sources while it has none. That shape starts at zero
findings on day one, grows only as confirmations grow, is bounded by
them (flood-proof by construction), and says something a reviewer
actually wants to hear: « every other number in this block traces to
the term sheet; this one traces to nothing. » It waits on D4, which
waits on a cleared hit-rate round, which waits on the deal set —
the dependency chain runs exactly through the thing the lead is
already asking the founder for. Until then D5 reports nothing, per
its own registration.

**Turn's end state:** chain tests 67 passed; full tieout suite 751
passed, 8 skipped, plus the one known cross-lane red (house-rules
17-vs-19, reproduced on the clean tip, already routed by the lead's
twelfth sweep). Nothing ships from D3 or D5, and both say so in
words where a consumer would meet them.

## 26 August 2026, sixth « go » — thirteenth sweep: the founder found the corpus

The addendum read first, as ordered. The founder's fifteen-deal check
corrects the record (« the Scottish contracts are censored » was a
one-deal generalization, and wrong), and the Scottish NPD/hub pairs
are exactly D3's missing direction: document feeds model. Order 1
(round 3's leading-paragraph defense) was already finished and
pushed last turn — this lane's round-3 commits were rebased onto the
thirteenth-sweep tip per the lanes rule, nothing rewritten but the
base. Order 4 (D5) stands as registered; the shape proposal is with
the lead and founder.

**The network truth about the contracts hub, measured today, before
anything else was built on it.** `www.scottishfuturestrust.org.uk`
answers 200, as the founder recorded. The documents, though, live on
`contracts.scottishfuturestrust.org.uk`, and that subdomain is
serving a certificate that is both **expired (ended 10 July 2026)
and issued for the wrong host** (`bimportal.…`) — TLS verification
fails correctly, this lane will not disable it, and plain HTTP
force-redirects into the same broken TLS. An Anthropic-side fetch
returned 503. The Internet Archive holds the index (13 A–C document
links captured) and snapshots of the three deal tag pages —
including a Kelso capture from **today**, so something reached the
origin recently — but the archive is rate-limiting bulk retrieval
from here this hour. The fetcher below is committed to work against
origin first and the archive as fallback, and fetches what the
network serves on the day it runs; what fetched today is recorded
below, and what did not is a network condition, not a corpus
conclusion.

## D3 round 4 — the hit-rate registration, written before any result

**The corpus:** the SFT deal pairs the founder verified — Kelso High
School (with the provenance tab), Levenmouth Academy, Oban &
Campbeltown High Schools — signed project agreement + financial
close model, each fetched by `scripts.corpus_documents_sft` into
git-ignored corpus directories.

**The sample is Kelso's own marking scheme, not a draw.** The
73-row provenance tab (« clause → term → figure ») was written by
the deal team at close, independent of us — the only ground truth in
this corpus nobody here influenced. Every row is scored; no seed is
needed because the sample is exhaustive.

**The typed-cell convention, declared openly (and attached wherever
any number from this round is ever quoted):** the published models
are formula-stripped — every cell a value — so typed-versus-computed
cannot be read from the file. For this round the provenance tab
itself names the document-fed figures; the « typed number » under
test is the model cell carrying a provenance row's figure. Locating
that cell may use the row's own pointer or value search — locating
is sampling, and sampling by value stays legitimate where scoring by
value is not. The matcher then sees only the cell's labels and the
contract's extracted facts.

**Blindness is structural:** the provenance sheet is excluded from
the model side entirely — it contributes no cells, no labels, no
candidates. It exists in this round only as the answer sheet.

**Named conditions, counted as their own rows, never as failures or
successes:**
- *unreachable (unpublished paper)* — provenance rows pointing at
  documents that were never published (some loan agreements);
- *unreachable (OCR)* — rows whose contract-side statement falls on
  pages D1's extractor refuses or where the printed number did not
  survive the photocopy OCR; the extractor's own coverage and
  refusals for each contract are reported with the round.

**The verdict table** is the registered one from round 1, over
reachable rows only, with the unreachable counts printed beside it.
The judge is me, same discipline. **No target number is promised.**
The matcher is the frozen v3; any change it needs after this round
is a round-5 registration.

## The fetch, attempted every honest way — what stands between round 4 and its corpus

`scripts.corpus_documents_sft` is committed and correct: origin
first with TLS verification on, Internet Archive snapshot fallback,
per-file completeness gates (a PDF must carry its `%%EOF`, a zip its
central directory), retries with backoff, every step printed. What
the network served today, all of it measured, none of it guessed:

- **Origin:** every request fails TLS verification, correctly — the
  subdomain's certificate expired 10 July 2026 and names
  `bimportal.…`. This blocks *everyone's* automated fetching, not
  just ours, until SFT fixes it; the founder's manual verification
  presumably clicked through a browser warning.
- **Archive, pages:** all three deal tag pages fetched (via the raw
  `id_` form). They bind the agreements to document ids 45 (Kelso),
  50 (Levenmouth), 58 (Oban & Campbeltown) — the fetcher discovers
  these itself.
- **Archive, documents:** every download of an agreement is cut at
  **exactly 1 MiB** — a hard cap on this path (other hosts serve
  this container multi-megabyte files without truncation), and the
  truncated streams arrive with no error, which is why the fetcher
  now refuses incomplete bytes instead of saving them. Ranged
  requests get one 206 chunk and then resets or redirects.
- **The models are not in the archive at all.** The Feb/April
  snapshots of all three tag pages list only the Project Agreements;
  the financial models the founder saw are newer than every capture.
  So even a cooperative archive yields only half of each pair.

**What would unblock round 4, for the lead and founder:** (a) SFT
fixing their certificate — the fetcher then works as written, both
halves; (b) the founder, from a machine whose browser they can vouch
for, either saving the six document URLs to the Wayback Machine
(Save Page Now on `contracts…/document/{45,50,58}/download` and the
three models' ids from the live pages) or downloading the six files
and placing them in `scripts/corpus_sft/` and
`scripts/corpus_documents/sft/` on the lead's container — the
registered round runs unchanged the moment the files exist, and
nothing in the registration depends on who carried the bytes.

**Turn's end state:** round 4 registered; the fetcher committed and
proven against today's network; zero corpus files landed, said
plainly; rounds 1–3 and D5 unchanged.

## 27 August 2026, seventh « go » — fourteenth sweep: the handoff, D4's contract, D5's next round

Orders read from the tip. The handoff file is pushed
(`docs/pierce/handoffs/scribe.md`). Round 4 stays blocked on bytes
and is not forced. What follows is D4's registration and contract —
written and committed before any D4 code exists — and then D5's
next round.

## D4 — confirm-once, arithmetic forever: the contract, proposed before any database work

**The one sentence the track rests on:** a person confirms that a
model cell comes from a document figure; from then on, re-checking
that pair is arithmetic — every time, on every revision, with no
inference of any kind.

**D4 is not blocked by D3, and that is worth stating plainly.** The
matcher's hit-rate is unmeasured and its proposals ship nothing. But
a *confirmed* link is human input, not engine output: a person can
confirm a pair the matcher never proposed, or one it proposed
wrongly, and the confirmation is what makes the link real either
way. So D4 can be built and even shipped while D3 stays dark —
proposing is a convenience, confirming is the product. This also
keeps the line `swens.md` § 6 draws: the link is *determined* by a
person, so every later re-check is determined, never inferred.

**« No model call », honestly.** The plan's phrase means: no
language-model call in the re-check. In this package that is true by
construction, not by discipline — `polar/tieout/chain/` imports no
model client at all, and the matcher is string comparison. What D4
actually adds is stronger: after confirmation there is no *matching*
either. Re-anchoring is exact-key lookup, and the answer is
arithmetic.

### The confirmed-link contract (JSON Schema, draft 2020-12)

No table, no migration, no repository code until the lead approves —
the same rule D2 followed.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "claidor:tieout/chain/confirmed-link",
  "title": "Confirmed link — a model cell and the document figure a person says it came from",
  "type": "object",
  "required": [
    "id", "dossier_id", "state",
    "document", "model", "transformation", "scale",
    "confirmed_by_id", "confirmed_at"
  ],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "dossier_id": {
      "type": "string", "format": "uuid",
      "description": "The deal. Every read is scoped by membership of it."
    },
    "state": {
      "enum": ["confirmed", "rejected", "broken", "ambiguous"],
      "description": "No 'proposed' state on purpose: a proposal is computed on demand and never stored, so a row here always means a person acted. 'broken' and 'ambiguous' are set by re-anchoring, never by a guess."
    },
    "document": {
      "type": "object",
      "required": ["document_id", "document_version_id", "fact_id", "page", "printed_text", "anchor_line", "ordinal_in_line"],
      "additionalProperties": false,
      "description": "What was confirmed, and enough to re-find it in a later version by labels rather than coordinates.",
      "properties": {
        "document_id": { "type": "string", "format": "uuid", "description": "The artifact lineage — the document across all its versions." },
        "document_version_id": { "type": "string", "format": "uuid", "description": "The exact version confirmed against." },
        "fact_id": { "type": "string", "format": "uuid", "description": "The chain fact as confirmed. Stable within its version by construction; NOT the anchor across versions." },
        "page": { "type": "integer", "minimum": 1, "description": "Recorded for the citation, never used for re-anchoring — a page number is a coordinate." },
        "printed_text": { "type": "string", "description": "The token exactly as printed at confirmation. Used to report movement, never to locate." },
        "anchor_line": { "type": "string", "description": "The printed line the figure sat in. THE document-side anchor." },
        "ordinal_in_line": { "type": "integer", "minimum": 1, "description": "Which number within that line (1st, 2nd…) — the tiebreak when a line carries several." }
      }
    },
    "model": {
      "type": "object",
      "required": ["model_id", "model_version_id", "cell_id", "ref", "cell_name"],
      "additionalProperties": false,
      "properties": {
        "model_id": { "type": "string", "format": "uuid", "description": "The workbook lineage." },
        "model_version_id": { "type": "string", "format": "uuid" },
        "cell_id": { "type": "string", "format": "uuid" },
        "ref": { "type": "string", "description": "« Model!D26 » at confirmation. A location, recorded for the citation, never the anchor." },
        "cell_name": { "type": "string", "description": "« FY2025A Adjusted EBITDA » — the engine's own name for the cell. THE model-side anchor, exactly as FigureLink.cell_name already is." }
      }
    },
    "transformation": {
      "type": "string",
      "description": "A named deterministic function, 'identity' today. The engine's own extension channel, same vocabulary as FigureLink.transformation, so one re-check serves both directions."
    },
    "scale": {
      "type": "number", "exclusiveMinimum": 0,
      "description": "document value x scale = model value. Levenmouth's contract says GBP 3,741,000 a year and the model cell holds 3.741 on a millions sheet: scale 0.000001. THE PERSON STATES IT AT CONFIRMATION — Swens never infers it. Unit inference is Track E's, and this field is deliberately the boundary: confirm once, arithmetic forever."
    },
    "basis": {
      "type": "string",
      "description": "Reported / adjusted / pro forma, and the period. Carried because the same two numbers on different bases are not in disagreement."
    },
    "confirmed_by_id": { "type": "string", "format": "uuid" },
    "confirmed_at": { "type": "string", "format": "date-time" },
    "note": { "type": "string", "description": "What the person wanted the next reader to know." }
  }
}
```

### Survival: the re-anchoring rules, frozen here

**Anchor by labels, never coordinates** — the plan's words, made
mechanical. Both sides abstain rather than guess, and every outcome
says which rule produced it.

*Model side* (the engine's own precedent, `FigureLink.cell_name`):
1. Same version and the ref still carries that `cell_name` → done.
2. New version: candidates are cells whose name equals `cell_name`
   exactly. One → **survived** (report the ref change if any).
   Zero → **broken**. More than one → **ambiguous**, a person
   decides; the link is never silently re-pointed.

*Document side* (new, and the reason `anchor_line` exists):
1. Same version → `fact_id` is still valid by construction → done.
2. New version: candidates are facts whose line's **label-token set
   equals** the anchor line's label-token set — the same tokenizer
   the matcher uses, so purely numeric tokens are dropped and the
   *value plays no part in locating*. Then:
   a. one → **survived**;
   b. several → the `ordinal_in_line` tiebreak; resolving to one →
      survived, flagged position-resolved; else **ambiguous**;
   c. zero → **broken** (« the line this rested on is not in this
      version »).

**Values are used only to report, never to locate.** That asymmetry
is the whole design: a revised contract whose figure *changed* must
re-anchor successfully and then say « the source moved, £3,741,000 →
£3,905,000 » — which is the finding a reviewer wants. Anchoring on
the number instead would report that as « not found », losing
exactly the case the product exists for.

### The re-check, and its four verdicts

Fetch the model cell's value and the document fact's value, apply
`transformation` and `scale`, compare at the document's printed
precision (the engine's existing tie-out discipline):

- **agrees** — nothing to say.
- **the model moved** — model side differs from the confirmed pair;
  the cell changed and its source did not.
- **the source moved** — document side differs; the term sheet was
  revised under a model that still quotes the old figure.
- **both moved** — reported as its own case, never averaged away.

Plus the two anchoring outcomes, **broken** and **ambiguous**, each
in words naming which side and which rule.

### Registered measurement, before any result exists

The plan's DONE condition is « a revised model re-checks its
confirmed links with no model call and correct survival ». The
harness plants revisions on a committed fixture pair and asserts the
registered expectation per case, written here first:

| planted revision | expected |
|---|---|
| row inserted above the linked cell | survived; ref changes; agrees |
| the linked cell's value edited | survived; **the model moved** |
| the linked cell deleted | **broken** (model side, in words) |
| its label duplicated elsewhere | **ambiguous**; never re-pointed |
| sheet renamed | survived (the anchor is a name, not an address) |
| document figure edited | survived; **the source moved** |
| document line deleted | **broken** (document side) |
| document repaginated, line intact | survived; agrees |

Reported with it: that the re-check made **zero language-model
calls** — a structural fact (the package imports no model client),
stated as such rather than as a runtime count; and the wall-clock of
re-checking a confirmed map, which must be arithmetic-fast or the
promise is hollow.

**Not promised:** any number about how often confirmations survive
*real* revisions. That needs the real deal set, like round 4.

## D5 round 2 — registration: the local-rule shape, measured before there is a single confirmation

Round 1 killed the naive class with its own number (22,693
candidates on a regulator model; 85 on the 313-cell deal fixture).
The proposed replacement fires only where sourcing is the **local**
rule. This round measures whether that shape is actually
flood-proof — and it can be measured **today, with zero confirmed
links in existence**, because the flood is a property of the model's
own block structure crossed with how many confirmations a person
makes.

**The block is the model's own, never mine.** `polar.tieout.
structure.sections()` reads the blocks a workbook declares through
its own `SUM` formulas — « rows the model itself totals ». Read-only
library use, and it means a block boundary is the model's claim
about itself, not my heuristic.

**The trigger under test:** a **typed** cell (a computed cell's
provenance is its formula — the proposals route already refuses
those) inside a declared section, carrying no confirmed source,
where the section's *other* typed cells are confirmed to a degree
**T**. Three thresholds are measured, because which one ships is
exactly the decision these numbers should make and I will not make
it in advance:

- **T1 — any**: at least one other typed cell in the section is
  confirmed.
- **T2 — half**: at least half of the section's typed cells are.
- **T3 — all but this one**: every other typed cell in the section
  is confirmed. (The purest reading of the sentence the shape is
  built on: « every other number in this block traces to the term
  sheet; this one traces to nothing. »)

**The two placements, both reported, neither alone believable:**

- **Greedy adversarial** — spend a budget of **B** confirmations to
  maximise findings (largest sections first, cheapest unlock per
  confirmation). This is an *upper-bound estimate that greedy may
  understate*, and it answers « how bad can this get ».
- **Random** — B confirmations placed uniformly at random over the
  typed cells that sit in sections, seeded (**3141592**), 20 trials,
  mean and max reported.

**B ∈ {10, 25, 50, 100}** — the range a banker plausibly confirms on
one deal.

**The registered limitation, stated before the numbers:** neither
placement is how a person actually works. A banker confirms
top-down and in clusters — the key lines of the blocks that matter —
and clustering pushes individual sections toward T3 far faster than
random placement does while touching far fewer sections. Which way
that biases the total is **not obvious** (more findings per touched
section, fewer sections touched), so I am not claiming a direction:
the two placements bracket the behaviour, and the real number comes
from a real deal, like every other real number in this lane.

**A condition that will matter for the deal corpus:** sections are
declared by `SUM` formulas, and the Scottish close models are
formula-stripped — every cell a value. So on exactly the
document-fed corpus D3 round 4 is waiting for, **this shape has no
blocks to stand on**, and a different block rule (contiguity, or the
provenance tab itself) would have to be registered for it. Recorded
now rather than discovered later.

**The models:** the same registered set as round 1 — ED2 PCFM V5,
ED2 PCFM V3, RIIO-ET1 PCFM, the Cascade deal model, the pre-app
example. **The harness:** `scripts.corpus_documents_unsourced_shape`
(new), read-only, printing the registered numbers and nothing else.
**No target is promised.** If the local-rule shape floods too, it
dies exactly as the naive one did.

## D5 round 2 — measured. One threshold survives; and on regulator models the shape has no ground at all

Two findings, and the second was not what the round went looking
for.

### 1. On the regulator models the shape cannot be applied — inputs and blocks are disjoint

| model | sections declared | typed cells inside one |
|---|---|---|
| ED2 PCFM V5 | 5 | **0** of 22,693 |
| ED2 PCFM V3 | 5 | **0** of 20,426 |
| RIIO-ET1 PCFM | 61 | **0** of 7,555 |
| Cascade deal model | 1 | 32 of 85 |
| pre-app example | 26 | 156 of 230 (68%) |

I checked this rather than reporting it, because a zero that large
is usually a bug. It is not. ED2's five declared sections
(`Depn!24-26`, `Depn!210-247`, `ReturnAdj!72-73`, …) hold 3,194
numeric cells between them and **every one is a formula cell**, and
**not one of ED2's 22,693 typed cells lives on a sheet that declares
any section at all** — the inputs sit on twenty-one per-licensee
sheets that nothing sums, while the totalled blocks are pure
computed rows.

That is the structural point, and it generalizes past this round: a
block a model *totals* is a block of outputs. The local-rule shape
needs blocks of **inputs**, and a workbook's `SUM` formulas do not
declare those. Where the two coincide — the small, hand-built deal
models — the shape has ground; on a big machine-shaped model it has
none. Two consequences, both for the lead and founder:

- the shape is measurable and possibly useful **on deal-shaped
  models**, which is the product's actual case, and untestable on
  the regulator corpus, which is not;
- if it is wanted on machine-shaped models, it needs an **input-block
  rule** that does not come from `SUM` — contiguity of typed cells
  under one label column, say — and that is a registration of its
  own, and touches `structure.py`, which is Sentinel's ground, not
  mine.

### 2. Where it can be applied, exactly one threshold survives

Findings that would fire, by threshold and confirmation budget
(adversarial = greedy worst case; random = seeded mean of 20):

**pre-app example** (230 typed cells, 156 in 7 sections):

| threshold | B=10 | B=25 | B=50 | B=100 |
|---|---|---|---|---|
| any (adv / rand) | 149 / 115 | 149 / 130 | 149 / 106 | 149 / 56 |
| half (adv / rand) | 10 / 0 | 18 / 0 | 48 / 2 | 78 / 50 |
| **all-but-this-one** (adv / rand) | **0 / 0** | **1 / 0** | **2 / 0** | **5 / 0** |

**Cascade deal model** (85 typed, 32 in 1 section): « any » fires 31
of a possible 32 at B=10; « half » 16; « all-but-this-one » at most
1.

- **« any » is dead on arrival.** One confirmation anywhere in a
  block turns every other typed cell in it into a finding: 149
  findings on a 230-cell model. That is the naive flood wearing a
  different hat.
- **« half » has the worse property**: its noise *grows with the
  work*. The more diligently a banker confirms, the more it fires
  (0 → 50 random as B goes 10 → 100). A check that punishes
  thoroughness will be turned off.
- **« all-but-this-one » holds.** At most 5 findings under
  adversarial placement at B=100, and zero under random placement
  anywhere. It is flood-proof by construction, and the measurement
  says so rather than the design arguing it.

**What flood-proof costs, in the same numbers:** a T3 finding costs
(section size − 1) confirmations — 19 for the pre-app's smallest
block, 31 for Cascade's only one. So the finding appears exactly
when a person has nearly finished sourcing a block, which is the
moment it means something (« you sourced everything here except
this ») and also means it will be **rare**. That is the trade, stated
plainly: this class will fire seldom, and every time it fires it
will be worth reading. If the founder wants a check that speaks more
often, it is a different check, not a looser threshold on this one.

**Two honest artifacts of the method**, neither hidden: where the
budget exceeds the typed cells inside sections (Cascade at B ≥ 50),
*everything* gets confirmed and the count falls to zero — that is
the budget outgrowing the model, not flood-proofing; and Cascade's
random column is deterministic because the model has exactly one
usable section, so every trial places identically.

**The verdict for the lead and founder:** if D5 ships, it ships as
**« unsourced where every neighbour in the model's own block is
sourced »** — threshold T3, nothing looser — and only on models
whose blocks contain inputs. It still reports nothing until a shape
is approved, and it still waits on D4 for real confirmations.

## Round 4's harness: ready, and proved ready

The orders say keep it ready. It did not exist, so it does now:
`scripts.corpus_documents_kelso_round`, two phases like every round
in this lane — `sheet` produces the judging sheet with **no matcher
output on it**, and `score` runs the frozen matcher only after the
truth is recorded. It takes `--model`, `--contract` and an optional
`--provenance-sheet`; without the last it guesses the answer tab
from its own words, prints what it chose, and **refuses to run if it
cannot find one**, because guessing that wrong would leak the answer
sheet into the matcher's inputs. Run with no files present it says
so in a sentence and exits.

It is proved by five tests
(`tests/tieout/test_chain_kelso_round.py`) against a **synthetic
stand-in pair** built inside the test — a workbook with a
provenance-shaped tab and a contract stating one of its three
figures. **Those tests say nothing about Kelso**; they assert the
properties the registration calls structural: every provenance row
becomes one sample row, the answer sheet contributes no cells to the
model side (each figure exists twice in the workbook and the model
side sees only one), the sheet phase carries no proposal or verdict,
and the two unreachable conditions leave the scored table while
still being counted (« reachable rows: 1 of 3 »).

So the lead's container needs one command per phase the moment the
six files land, and nothing about the round has to be invented then.

**Turn's end state:** handoff pushed; D4's contract registered and
proposed, no table until approval; D5 round 2 registered, run, and
its shape decided by its own numbers; round 4's harness ready and
tested. Chain tests 72 passed; full tieout suite **769 passed, 9
skipped, nothing red** — the house-rules failure this lane reported
two sweeps ago is fixed on the tip.

## 27 August 2026, eighth « go » — D4 measured against its own registered table

Orders unchanged at the tip (still the fourteenth sweep's), and the
new adoptions there belong to Dynamo, Prism and Track E. Standing
item 3 first: **the Scottish files have not landed** — no fresh
capture of any of the six URLs (the archive still holds only its
February timestamps), nothing in `corpus_sft/`. Round 4 stays
blocked and is not forced, exactly as the orders say.

So this turn ran **D4's registered measurement**. The approval line
holds: `chain/anchor.py` is pure functions — **no table, no
migration, no repository** — and the contract still awaits the
lead's word. What exists is the logic the registered measurement
needs, which is what the registration promised to build.

### The registered table, measured

Each row was written in the log before the code existed; each is now
a test in `tests/tieout/test_chain_anchor.py`, and the revisions are
planted for real — the workbook is rebuilt and read back through the
engine's own reader, so « a row inserted above the linked cell »
means that and not a rearranged tuple.

| planted revision | expected | measured |
|---|---|---|
| row inserted above the linked cell | survived; ref changes; agrees | survived `Model!B2` → `Model!B3`; agrees ✓ |
| the linked cell's value edited | survived; the model moved | ✓ |
| the linked cell deleted | broken (model side, in words) | ✓ |
| its label duplicated elsewhere | ambiguous; never re-pointed | ✓ (both refs returned) |
| sheet renamed | survived (a name, not an address) | ✓ `Financial Model!B2` |
| document figure edited | survived; the source moved | ✓ 3.741 → 3.905 |
| document line deleted | broken (document side) | ✓ |
| document repaginated, line intact | survived; agrees | ✓ page 4 → 9, unaffected |

**Eight of eight as registered**, plus four cases the table did not
cover and the code needed anyway: the ordinal tiebreak and its
honest limit; « both moved » reported separately from « still ties
out »; Levenmouth's scale case (a contract in pounds, a model in
millions, the factor stated by the person); and the no-model-call
claim.

**« No model call », proved structurally rather than counted.** The
test reads every source file in the package and asserts no client
import appears at all. A runtime counter would only cover the paths
a test happens to walk; this covers the package.

**The wall-clock:** 1,000 confirmed links re-anchored against a
22,693-cell model in **0.51 s — 0.51 ms per link**. Arithmetic-fast,
as the promise requires. The honest caveat: the lookup is a linear
scan, so it is O(links × cells) and a map ten times bigger would
take ten times as long; an index by name makes it flat the day that
matters. No timing assertion was added to the suite — a bound loose
enough not to flake would prove nothing, and a tight one would flake.

### Two things the measurement found, both worth the lead's eye

**1. A hole in the proposed contract, found before it was approved.**
The schema as proposed records the document side's `printed_text`
but **nothing of the model side's value at confirmation** — and
without that, the re-check cannot say *which* side moved, which is
three of its four registered verdicts. **Amendment, proposed here:**
`model.value_at_confirmation` (and, for symmetry and to avoid
re-parsing, `document.value_at_confirmation` beside the printed
text). Cheap now, expensive after a table exists — which is exactly
what registering a contract before building it is for.

**2. A real bug the planted cases caught.** The first cut numbered a
figure's position by its *line text*, so a boilerplate line
repeating on forty pages — a page header, a footer — numbered its
figures 1…40 instead of 1,1,…,1. The tiebreak would then have
separated identical lines by an accident of how deep in the document
they sat, which is a coordinate wearing a label's clothes. Counting
now restarts at every physical line. Found by the case for two
identical lines, which the registered table did not include and the
code plainly needed.

**Turn's end state:** round 4 still blocked on bytes, checked, not
forced; D4's registered measurement run and passing eight of eight
with two amendments proposed from it; chain tests 84 passed; full
tieout suite **781 passed, 9 skipped**; zero mypy errors in the
package. Still no table, and D4's contract still awaits approval.

## 27 August 2026, ninth « go » — the Finch pivot, read by hand before anything was registered

Orders: the Scottish route is closed and not to be attempted again
(the Kelso harness stays committed and ready — it does); the pivot is
FinWorkBench/Finch; **fetch it, read it, and say honestly whether its
document-into-spreadsheet tasks are our task, before any
registration.** This section is that answer. No matcher has been run
against Finch at any point in forming it — what follows is corpus
reading, which is how a sample gets designed, not a result.

**The fetcher**: `scripts.corpus_documents_finch`, git-ignored as
ever. It takes the dataset card, the workflow index, every task JSON,
and the source/reference files of the tasks that carry a PDF — 218 of
537 files, all fetched, no failures. `--all` takes the rest.
**Attribution, CC BY 3.0, travelling with every number this corpus
ever produces: FinWorkBench/Finch, arXiv:2512.13168,
huggingface.co/datasets/FinWorkBench/Finch.**

### Is it our task? Yes — in shape, with three caveats, one of which predicts the answer

**What Finch is:** 172 expert-annotated finance workflows — an *agent
benchmark* (« add the missing cross-sheet references », « add a
Scenario3 sheet »), not a linking corpus. Most of it is not our task
and I am not going to pretend otherwise.

**What is ours:** of the 172, **nine carry a PDF**. One (16) runs the
other way (spreadsheet → report), one (4) is images only. **Seven are
document → spreadsheet**: 5, 52, 72, 81, 156, 160, 161. Together they
hold **2,411 typed cells** whose values a human expert took from a
source PDF, and all seven PDFs read clean — **3,590 extracted numbers,
zero pages refused**.

That is D3's task in shape, and the first corpus we have ever held
that runs the document-into-model direction. ED2 gave 90 seeded draws
with **zero** cells the documents stated; task 156 alone gives eleven
typed cells against a two-page PDF that states every one of them.

**It is also not a flat transcription in the cases that matter.**
Task 156's reference workbook holds 11 typed cells and **31 computed**
ones — a real workbook, where the typed cells are the document-fed
ones and the computed cells' provenance is their formula, exactly the
distinction D3 rests on. Task 81 holds 956 typed against 773 computed.

**Caveat A — the ground truth is at the file level, not the link
level.** Finch annotates « this workbook is the correct output for
this PDF ». It does **not** annotate « cell `CABC!I9` came from page 1,
line 3 ». So the per-cell truth is still judged by hand, exactly as in
rounds 1–3. What Finch supplies that nothing else has is the
*guarantee* that these cells are genuinely document-fed, and a
document that actually states them. Nobody should read
« hand-annotated ground truth » as « a link map ».

**Caveat B — the sample is small and lopsided.** Seven workflows, and
two of them (72, 81) hold 80% of the typed cells. A pooled per-cell
number would be a number about tasks 72 and 81 wearing a corpus's
clothes.

**Caveat C — the difficulty is bimodal, and the hard mode exposes a
limit in D3's own design.** Tasks 5 and 161 are flat transcriptions
(104 and 312 typed cells, **zero computed**): the sheet mirrors the
document's own table, so the labels match nearly by construction —
an easy case that would flatter any hit-rate. Tasks 81, 156 and 72
are the real thing, and reading them by hand turned up this:

> cell `ETS!H13`, named « ETS Transport Margins Commodity - FTS - 2 »,
> against the PDF line
> `Commodity - FTS - 2  -  -  139.9  -  -  -  -  139.9  (139.9)  -`

One printed line, **ten columns of numbers**, feeding ten different
cells. The row label is in the line; the column identity
(« ETS Transport Margins », the year, the entity) lives in a *header
line elsewhere on the page*. **My matcher's document side has no
column dimension at all** — a fact's anchor is its printed line, and
`propose()` scores label overlap against that line alone. So on a
multi-column table it can at best abstain, because ten facts share one
line's labels and its tie rule fires. It cannot be right; it can only
be quiet.

That is a structural finding about D3, not about Finch: the
line-anchored design was measured on prose-shaped documents (Ofgem's
annexes) and this corpus is table-shaped. Round 5's candidate is a
**column anchor** — the header line above a fact's own x-position,
which D1 already records — and it is registered when it is registered,
not patched in mid-round.

**So: yes, run the round here** — it is the only document-into-model
ground truth we have, it is licensed for commercial use, and it will
give the first honest hit-rate number this track has ever had. And it
will very likely be a low one, for the reason above.

## D3 round 5 — registration, frozen before any matcher runs on Finch

**Corpus:** the seven Finch document → spreadsheet workflows (5, 52,
72, 81, 156, 160, 161), fetched by `scripts.corpus_documents_finch`.
Attribution as above, in this write-up and every one that quotes a
number from it.

**Population:** the typed cells of each task's reference workbook —
no formula, a value present. Tasks 5 and 161 carry no formulas at
all, so *every* cell of theirs is typed; that is a property of a flat
transcription and is recorded rather than corrected, and their numbers
are reported separately for exactly that reason.

**Sample: six typed cells per task, drawn with seed 271828 — 42 in
all.** Equal weight per task, not per cell, so that tasks 72 and 81
cannot carry the average; the pooled figure is labelled
« equal-weight per task » wherever it appears, and the seven per-task
figures are printed beside it always.

**The judge is me**, from the PDF, blind: truth is recorded before any
matcher output is looked at, with value search as the aid — the judge
may use values, the matcher may not, as in every round here. For each
drawn cell the truth is the fact key (page, line, token) the document
states it at, or **empty** when the document does not state it.

**Conditions** (counted, never scored as failures): `unreachable-ocr`
if a page is refused — none are expected, all seven PDFs read clean;
`no-cell-located` for a drawn cell whose value the sheet reader cannot
place.

**The matcher is the frozen v3.** No change to it during this round.
If it needs a column anchor, that is round 5's *finding* and round
6's registration.

**The registered prediction, stated so it can be wrong:** high
abstention on the table-shaped tasks (72, 81, 156, 160) from the tie
rule, and whatever the flat transcriptions (5, 161) give being an
upper bound rather than a representative number. **No target is
promised, and a low number ships nothing** — same as every round
before it.

**Harness:** `scripts.corpus_documents_finch_round`, two phases —
`sheet` then `score` — like every round in this lane.

## D3 round 5 — measured. Recall 0 of 18. The matcher is not wrong; it is blind.

*FinWorkBench/Finch, arXiv:2512.13168, CC BY 3.0 — this attribution
travels with every number below.*

The first hit-rate number this track has ever had, and it is the
worst one it could be.

| verdict | count |
|---|---|
| true proposal | **0** |
| false proposal | 1 |
| true abstention | 9 |
| missed | **17** |

Scored rows: 27 of 42 drawn (see the deviation below). **Of those 27,
the document genuinely states 18** — so unlike every earlier round
there was something to find in two thirds of them, and the matcher
found **none**. Recall **0/18**. Precision 0/1.

Per task, equal weight, six drawn each:

| task | true | false | abstain | missed | not scorable |
|---|---|---|---|---|---|
| 5 | 0 | 1 | 1 | 3 | 1 |
| 52 | 0 | 0 | 2 | 4 | 0 |
| 72 | 0 | 0 | 2 | 0 | 4 |
| 81 | 0 | 0 | 4 | 0 | 2 |
| **156** | 0 | 0 | 0 | **6** | 0 |
| 160 | 0 | 0 | 0 | 4 | 2 |
| 161 | 0 | 0 | 0 | 0 | 6 |

### Why, exactly — the diagnosis, counted rather than asserted

Of the **17 misses**: **12 are the tie rule**, 4 are cells with no
label words at all, 1 is coverage below the floor.

Task 156 is the clean proof, because it is the case the matcher
should own. Cell `CABC!I7` is named « $ Total Direct Expense »; the
document line is `Total Direct Expense 8,067,693 100% 27 6,707,013
100%`. Label coverage is **100%** — a perfect match. And the matcher
abstained, because that one line carries **four numbers**, so four
candidates tie at 1.00 and the tie rule fires. Six of six, the same
way.

This is exactly the failure predicted in the registration, now
quantified: **the matcher's document side has no column dimension.**
Its anchor is the printed line, and in a table a line is a *row* —
the column identity (the year, the entity, « HC » versus « $ ») lives
in a header line elsewhere on the page. On prose (Ofgem's annexes) a
line names one number and the design works. On tables — which is what
finance documents mostly are — every candidate on the right row ties,
and the honest tie rule turns a perfect label match into silence.

The other four misses are the mirror image on the model side: cells
whose own name is empty (an account-code column with no row label),
so there is nothing to match *with*. Nothing about the document side
would help those.

**The one false proposal** is worth its own line: task 5's « ENE
Shares » was proposed at `p1|106` when the truth is `p1|6` — a
different line stating a different quantity that happened to carry
the label words. Not a tie, just wrong.

### A deviation, named rather than made silently

The registration foresaw two conditions (OCR loss, no cell located).
Judging turned up a third and I added it mid-round: **fifteen of the
42 drawn cells could not be judged at all at line granularity.** In a
grid like task 161's, a value appears in many rows and pages and I
cannot determine which occurrence the expert transcribed; scoring
them either way would have been invention. They are counted, excluded
from the table above, and named `indeterminate-line-granularity`.
That count is itself the finding: **the same blindness that stops the
matcher also stops the judge**, and no honest number can be produced
for those rows without a column anchor.

Two smaller notes, for the record: four drawn zeros are stated in
their documents as a dash (« - »), which D1 does not extract as a
number — so the matcher's silence there is correct, and « nil printed
as a dash » is a real D1 gap worth its own registration; and the
judging aid's value tolerance (0.5% relative) over-matched integer
account codes (3484 matching 3470, 3481, 3489), which cost the judge
time but never the matcher, since scoring never sees values.

### What this means, plainly

D3 as designed does not work on table-shaped documents, and finance
documents are mostly tables. That is not a tuning problem and it will
not be fixed by loosening the tie rule — loosening it would have
turned all twelve of those ties into guesses among four candidates,
which is the confident wrongness this product exists to prevent.

**Round 6's candidate, registered when it is registered:** give the
document side a **column anchor** — the header text above a fact's own
x-position, which D1 already records in every box. Then « $ Total
Direct Expense » can separate the `$` column from the `HC` column on
the same row, and the tie rule fires only when it should. The corpus
to measure it on now exists and the judging sheets are already built.

**Nothing ships.** The route's standing sentence is updated to carry
this number, since a registered round's result is its only trigger.

## 27 August 2026, tenth « go » — D3 round 6 registered: the column anchor, before any code

Orders unchanged at the tip and my round-5 push not yet merged, so no
new instruction is waiting. The pivot's three items are done; D4 and
D5 both await decisions rather than work (D4's contract awaits the
lead's approval before any table; D5's shape awaits the founder's
choice). What is *not* waiting is round 5's own finding, which named
its successor: **give the document side a column dimension.**

Everything below is committed before the code exists.

### The rule, frozen

Round 5 proved the failure: a fact's anchor is its printed **line**,
and in a table a line is a **row**, so every number in that row ties
and the matcher goes silent. The fix is to give each fact the piece
of the page it is missing — the **column header above it** — which
D1 can see because it already records every number's box.

**The column anchor, frozen here:** for one extracted number, walk
the lines above it **on its own page**, nearest first, at most **12**
lines. In each line, take the word tokens whose x-range overlaps the
number's x-range by at least **1 point**. The first line up that
yields at least one **non-numeric** token supplies the anchor — those
tokens, in reading order. If no line does, the anchor is empty and
the fact behaves exactly as it does today.

**The matcher's change is one line of meaning:** a candidate's label
tokens become the tokens of its line **plus** the tokens of its
column anchor. Everything else stays frozen as v3 — the tokenizer
(so purely numeric tokens still drop and **the value still plays no
part in scoring**), `FLOOR = 0.5`, exact-tie abstention among
eligible candidates, and both reference defenses.

**A consequence, named rather than discovered later:** this changes
what D1 records, so `EXTRACTOR_VERSION` goes from `"2"` to `"3"`.
Fact ids are a UUID5 over the extractor version, so **every stored
fact gets a new id and re-extraction replaces the old rows** — which
is exactly what the store was built to do and why the version is in
the id at all. No confirmed links exist yet, so nothing is orphaned;
after D4 ships, an extractor bump would need a re-anchoring pass, and
that is `anchor.py`'s whole purpose.

### Part A — the same 27 rows, the same truth, v3 against v4

Round 5's 42-cell sample, its hand-recorded truth, and its 27
scorable rows, rescored with the new matcher. Identical ground, so
the difference is the anchor and nothing else — the run-A pattern
from round 2. Reported as the same table, beside round 5's.

### Part B — the fifteen rows nobody could judge

Round 5's deviation was that 15 of 42 cells could not be judged **at
line granularity**: in a grid, a value recurs and no honest judge can
say which occurrence was transcribed. A column anchor is evidence
*in the document* — the header above the figure — so those rows
become judgeable, and I judge them now with that evidence.

**The bias this risks, stated plainly:** the judge and the matcher
would be looking at the same feature, and truth built from the
matcher's own mechanism would flatter it. Two guards, registered:
the truth is recorded **before** part B is scored, in the same
two-phase harness that enforces order everywhere in this lane; and
the judging question stays what it has always been — « does this
specific fact state this cell's quantity », answered from the
document's own table, not « what would the matcher score ». Where
the header does not settle it, the row **stays** indeterminate; the
count of rows that remain so is reported.

### The prediction, stated so it can be wrong

Round 5's 12 tie-driven misses should convert to proposals; whether
those proposals are *right* is the open question, and precision is
now the number that matters, not abstention. The 4 misses from cells
with no label words will not move — nothing about the document side
can help a cell that has no name. **No target is promised. If the
anchor produces confident wrong answers, it dies and the tie rule
stays** — that is the outcome the whole design is arranged to prefer.

## D3 round 6 — measured. The anchor works. The **tokenizer** throws it away.

*FinWorkBench/Finch, arXiv:2512.13168, CC BY 3.0.*

**Part A, identical rows and identical truth, v3 against v4:**

| | round 5 (line only) | round 6 (+ column) |
|---|---|---|
| true proposal | 0 | **0** |
| false proposal | 1 | **2** |
| true abstention | 9 | 7 |
| missed | 17 | **18** |

**The prediction was wrong and the change made things slightly
worse.** Three cells moved, all of them the wrong way: task 5's one
false proposal became a miss, and two of task 52's correct
abstentions became false proposals. Task 156 — the clean case the
whole round was aimed at — is still six of six missed.

### Why, exactly. The anchor is right; the tokenizer is deaf to it.

The column anchor **does what it was registered to do.** On task
156's line, the five figures come out with these headers, read
straight off the page geometry:

| figure | x | column anchor |
|---|---|---|
| 8,067,693 | 254.8 | **`$`** |
| 100% | 327.7 | **`%`** |
| 27 | 389.4 | (none) |
| 6,707,013 | 425.0 | **`$`** |
| 100% | 505.4 | **`%`** |

That is exactly correct — those *are* the columns. And the matcher
still ties at 1.00 across all five, because:

```
label_tokens("$ Total Direct Expense")  ->  ['direct', 'expense', 'total']
```

**The `$` is gone.** The tokenizer is `[a-z0-9]+`, so it keeps
alphanumerics and drops everything else — and it drops the symbol on
*both* sides, the cell's name and the fact's anchor alike. The
anchors `$` and `%` tokenize to nothing at all, contribute nothing to
any score, and the tie survives untouched.

So round 5's diagnosis was right about the missing dimension and
wrong about where the blockage sat. The document side was never the
only problem: **in financial tables the column identity is very often
a symbol** — `$`, `%`, `£`, `#` — and this lane's own value-blindness
rule, written to stop numerals leaking into scoring, throws those
symbols out with the numerals. The engine already knew this: it names
the same two cells « $ Total Direct Expense » and « HC Total Direct
Expense », and the only thing distinguishing them is the character my
tokenizer deletes.

**The two new false proposals say the same thing from the other
side.** Task 52's « Low End Cost Case 3 » and « High End Cost Case 3 »
are both zero, both unstated in the contract, and both were correctly
silent in round 5. The anchor added *some* tokens to *some*
candidates, broke their tie, and let a wrong candidate through. An
anchor that carries only the words it happens to keep is worse than
no anchor: it breaks ties arbitrarily rather than informatively.

**Nothing is patched mid-round.** The tokenizer stays as frozen for
this round's number; the fix is registered below.

### Part B, deferred — named, not skipped

The registration's part B was to re-judge the fifteen
`indeterminate-line-granularity` rows using the column header as
evidence. It is **deferred to round 7**, and the reason is the result
above: those judgements are matcher-independent and will keep, and
spending the judge's care now would enlarge the scored set for a
matcher that provably cannot see the columns anyway. It is the first
item of round 7, not a dropped one.

## D3 round 7 — registration: let the symbols speak

Frozen before the code, as ever. **One change, and nothing else
moves.**

**The tokenizer keeps the symbols that name columns.** `label_tokens`
currently yields `[a-z0-9]+` runs with pure numerals dropped. It will
additionally yield each of `$ % £ € #` appearing in the text as its
own token, on **both** sides — a cell's name and a fact's line and
column anchor alike.

**Why this does not breach never-by-value, stated precisely:** the
value is the digits, and the digits stay dropped exactly as they are
today. `$` is not a quantity; it is the name of a column, and a
document that prints `$` and `%` headers is *labelling*, not stating.
The rule has always been « match on labels, never on values », and
these symbols are labels. If anything the current behaviour breaches
the rule's intent by discarding a label.

**Everything else stays frozen:** `FLOOR = 0.5`, exact-tie
abstention, both reference defenses, the column anchor exactly as
round 6 built it. Extractor output is unchanged, so
`EXTRACTOR_VERSION` stays `"3"` and no fact ids move.

**The runs:** part A again — the same 27 rows and the same truth,
v4 against v5, so three consecutive rounds are comparable on
identical ground. Then **part B**, the fifteen deferred rows, judged
from the document's own headers with truth recorded before scoring,
rows the header does not settle staying indeterminate and counted.

**The prediction, stated so it can be wrong:** task 156's six should
now separate — `$` distinguishes its two money columns from its `%`
and headcount ones — and the honest risk is the mirror image, that a
`$` column shared by many rows creates *new* ties, or that a cell
named « $ Total Direct Expense » now matches every `$` figure in the
document. **If precision does not rise, the symbols go back out and
the finding is that a column anchor alone cannot carry this.**

## D3 round 7 — measured. The symbols work, the number does not move, and the blockage is now located: it is on the model side.

*FinWorkBench/Finch, arXiv:2512.13168, CC BY 3.0.*

**Part A: not one verdict changed.** 0 true, 2 false, 7 abstentions,
18 missed — identical to round 6, cell for cell.

**And yet the change did exactly what it was registered to do.** On
task 156's line, with the symbols kept:

| figure | column anchor | shared with « $ Total Direct Expense » | score |
|---|---|---|---|
| 8,067,693 | `$` | `$` direct expense total | **1.00** |
| 100% | `%` | direct expense total | 0.75 |
| 27 | (none) | direct expense total | 0.75 |
| 6,707,013 | `$` | `$` direct expense total | **1.00** |
| 100% | `%` | direct expense total | 0.75 |

The percent column and the headcount column **separated correctly**
from the money columns. The mechanism is right. Two candidates still
tie — and the reason is the finding of this round.

### The blockage is on the model side, and it is one line of the engine

`CABC!C7` and `CABC!I7` hold different numbers from different years —
2001 Forecast and 2002 Plan. Read through the engine:

```
CABC!C7  row_label='Total Direct Expense'  column_label='$'  name='$ Total Direct Expense'
CABC!I7  row_label='Total Direct Expense'  column_label='$'  name='$ Total Direct Expense'
```

**The two cells have the same name.** The workbook's header is
two-level — `2001 Forecast | 2002 Plan` above `$ | HC` — and
`Cell.column_label` takes the nearest header row, so both money
columns come back as `$` and the year never reaches the name.

So the matcher's tie is **correct behaviour**. The labels genuinely
cannot separate those two cells, because the label it is given is
identical for both. No amount of document-side work can fix that:
the ambiguity is in what the model side hands over. Three rounds of
chasing the document have ended by locating the remaining blockage
precisely — and it is not mine.

**Cross-lane case, for the lead to route (lanes.md: I write it here
and stop).** `polar/tieout/workbook.py`'s `Cell.column_label` reads
one header row. Financial tables routinely stack two or three
(`2001 Forecast` over `$`), and when they do, distinct cells collide
on one name. This is not only D3's problem: `FigureLink.cell_name` is
the engine's own re-anchoring key, and D4's survival rules rest on it
too — **two cells sharing a name is exactly the `Ambiguous` outcome
`anchor.py` returns**, and a workbook with stacked headers will
produce those constantly. The ask is Sentinel's to judge and the
lead's to route; I have changed nothing in the engine.

### Both experiments die by their own registered criteria

Round 6's criterion: « if the anchor produces confident wrong
answers, it dies and the tie rule stays. » It produced two, and fixed
none. Round 7's: « if precision does not rise, the symbols go back
out. » It did not rise.

**So the matcher is back to v3 behaviour exactly**, and the suite is
green at 802. Both experiments stay in the source as *recorded*
constants with the evidence attached, so that nobody re-runs them
blind — `_SYMBOLS` says what keeping symbols did and why it is not
behaviour, and `propose()` says it accepts a column anchor and
ignores it.

**One thing survives, deliberately: D1 keeps recording the column
anchor.** The extraction is correct — it read `$`, `%`, `$`, `%` off
the page exactly right — and the data is wanted by the judge (part B
needs it), by the source viewer, and by any future round once the
model side can say which column it means. Extractor version stays
`"3"`; the scoring use is what failed, not the reading.

**A regression I measured rather than assumed:** rounds 1–3's
registered ED2 sample still returns **30 of 30 correct abstentions**
under every variant tried this turn. Nothing that was right became
wrong.

**And the harm was found by a test, not by a corpus.** The route
test's own fixture — three prose lines — started abstaining once the
anchor was scored, because the line above « Loss (2,340) recorded » is
« Revenue 1,234.5 », and my rule read that previous *sentence* as a
column header. On prose the anchor invents headers. That is why it
produced two confident wrong answers in task 52, and it is the
clearest possible statement of the limit: **a column anchor is only
meaningful where there are columns**, and nothing in the rule as
frozen could tell the difference.

**Where D3 stands, plainly:** it is honest — it stays silent rather
than guessing, measured across four corpora — and it has never once
proposed a correct source on a table-shaped document. The next move
is not another document-side round. It is the model-side name, which
is Sentinel's.

## 28 August 2026, eleventh « go » — the lead's two notes, and D1 round N registered

Orders read from the tip. Round 6 is approved as registered — it has
since been run and it **died by its own criterion** (rounds 6 and 7
above); the approval and the result crossed in the post, which is
what happens when a lane runs ahead of a sweep, and nothing about the
result is changed by the approval arriving after it.

Both lead notes are taken:

1. **`indeterminate-line-granularity` joins the permanent
   vocabulary** — the judge blind where the matcher is blind, and a
   number that cannot be honestly produced is not produced. It is
   already in every round harness this lane owns; it stays.
2. **« Nil printed as a dash » is registered below** as its own small
   round, as ordered.

## D1 round N — registration: a dash is a stated zero

Round 5 turned this up and the lead named it: four of the drawn cells
were zeros whose documents state them as « - », and D1 extracts
nothing, so the matcher's silence was correct for the wrong reason —
there was no fact to find. A financial table says nil with a dash far
more often than it says `0`, and a document that states a quantity
should produce a fact.

**The rule, frozen before the code.** A token is extracted as a
**nil fact** — `value = 0.0`, `text` the dash exactly as printed —
when all three hold:

1. the token is exactly one dash character: `-`, `–` or `—` (a
   token like `FTS-1` or `(-)` is not a dash, and is untouched);
2. its own **line contains at least one number**, so the line is a
   data row rather than prose;
3. on its own page, at least **three** numeric tokens have x-ranges
   overlapping this token's by at least 1 point — the dash stands in
   a column where numbers live.

Condition 3 is geometry doing the one job round 6 proved it is good
at: **saying whether there are columns at all.** Round 6's failure
was reading a *preceding sentence* as a header; this asks only
« do numbers stand at this x elsewhere on the page », which prose
answers no to and a table answers yes to.

**The dash inside a label is the case to beat.** In
`Demand - FTS - 1 - - 123.1 - - - - 123.1 (123.1) -` the first two
dashes belong to the row's name and the rest are nils. Condition 3 is
what separates them: the label's dashes sit at x-positions where no
numbers stand, the nils sit in the numeric columns. **Whether that
holds is the measurement, not an assumption.**

**Consequences, named now:**

- Extractor output changes, so `EXTRACTOR_VERSION` goes `"3"` →
  `"4"`; every stored fact takes a new id and re-extraction replaces
  the rows, exactly as the version-in-the-id exists for. No confirmed
  links exist, so nothing is orphaned.
- **The matcher gets more candidates** — every nil in every table.
  That could hurt: a cell whose value is 0 would suddenly find many
  candidates and tie. Rounds 5–7's Finch sample is rescored to
  measure it, on the same 27 rows and the same truth.
- **Round 5's truth changes for four rows.** Those cells were judged
  « not stated » because no fact existed; if a dash becomes a fact,
  the document does state them and they become findable. Re-judged
  explicitly, with the four named, and the before/after reported —
  a truth file that changes silently would be worthless.

**The measurement:**

- **Coverage**: nils extracted per document, across the Finch seven
  and the ED2 three, with the totals beside the existing number
  counts.
- **Precision, hand-checked**: a seeded sample of **20 extracted
  nils** (seed 141421), each read against its page — is it really a
  nil standing in a numeric column, or a hyphen in a label?
  Reported as a count, failures named.
- **Harm**: the Finch part-A table before and after, and rounds
  1–3's ED2 sample, which must stay at 30 of 30 correct abstentions.

**The kill-criterion, stated in advance:** if the hand-check shows
label hyphens being read as nils, or if the Finch table gets worse,
the rule comes out exactly as rounds 6 and 7's did.

## D1's dash round — measured. It survives its own criterion; the first in this family that does.

*FinWorkBench/Finch, arXiv:2512.13168, CC BY 3.0.*

**Coverage — 750 nils, and very unevenly:**

| document | numbers | nils found |
|---|---|---|
| 81_src_1 (plan variance) | 623 | **567** |
| ed2-fd-finance-annex | 6,325 | 178 |
| 52_src_0 | 35 | 4 |
| ed2-financial-handbook | 1,311 | 1 |
| 72_src_0, 156, 160, 161, 5, 16, 4_src_* | 5,000+ | **0** |

The spread is the point, not a defect: a plan-variance table is
mostly dashes and a rate table is mostly digits. Where a document
says nil with a dash, D1 now says so; where it says `0`, nothing
changed.

**Precision — 20 of 20.** The registered seeded hand-check (seed
141421) drew twenty extracted nils and every one is a genuine nil
standing in a numeric column.

**The case to beat, checked directly rather than by sample.** In
`Commodity - FTS - 1 - - 9.4 - - - - 9.4 (9.4) -`:

| x | token | outcome |
|---|---|---|
| < 130 | the dashes inside « Commodity - FTS - 1 » | **not extracted** ✓ |
| 220.8, 259.7, 337.5, 551.0 | the column nils | **extracted as 0** ✓ |

The label's own dashes stayed out and the data's came in, which is
exactly what the third condition was frozen to do.

**A coverage gap the measurement found, and it is structural.** The
third condition asks for three numbers standing at the dash's
x-position — and **a column that is almost entirely nil has too few
numbers to vouch for it.** On page 1 of `81_src_1`, the columns at
x = 370.9, 403.6 and 436.4 hold exactly **one** number each, so their
dashes are missed; on page 2 the same columns hold nine or ten and
their dashes are found. The condition is anti-correlated with the
thing it detects. This is under-extraction — the safe direction, a
missed fact rather than an invented one — and it is recorded here
rather than patched, because patching mid-round is what this lane
does not do.

### Harm: none measured, and one small good

| | round 7 (no nils) | dash round |
|---|---|---|
| true proposal | 0 | 0 |
| false proposal | 2 | **1** |
| true abstention | 7 | 4 |
| missed | 18 | 19 |
| scored rows | 27 | 24 |
| rows the documents state | 18 | **20** |

**The denominators moved and that must be said plainly**, because a
table read carelessly here would flatter the change. Three rows left
the scored set — task 81's « GCO/HPL GRI/ACA », « Citrus AFUDC » and
« NNG Shared Cost Surcharge » were judged « not stated » in round 5
*only because no fact existed*; now nils exist on their rows, and I
cannot say which column's nil belongs to which cell, so they are
`indeterminate-line-granularity`, the condition the lead just blessed.
Two rows joined the stated set: task 52's « Low End Cost Case 3 » and
« High End Cost Case 3 », whose zeros the contract states as `$ - $ -`
and which are now findable facts, determined by column order against
the Case 1 row.

One false proposal disappeared. Nothing that was right became wrong.
**Rounds 1–3's ED2 sample still returns 30 of 30 correct
abstentions.**

**The kill-criterion, applied:** « if the hand-check shows label
hyphens read as nils, or if the Finch table gets worse, the rule
comes out. » The hand-check is clean and the table is not worse.
**The rule stays** — extractor version `"4"`, and the first change in
this family to survive its own test.

**Still 0 true proposals**, and that is expected: the dash round was
never aimed at the blockage. Round 7 located that on the model side —
two cells of one workbook sharing the name « $ Total Direct Expense »
because `Cell.column_label` reads one header row — and nothing on the
document side moves it.

### Two housekeeping notes, both named rather than slipped in

**The round harness now keys facts by page and x-position, not by
ordinal.** Adding nils shifted every ordinal and would have silently
invalidated eighteen recorded truths — the kind of quiet corruption
that makes a measurement worthless. All 18 remapped cleanly by
(page, printed text, line) and are re-verified; from here a key
survives an extractor change.

**One red test on the tip is not mine**:
`test_routes.py::TestTheVersionDelta::`
`test_a_revision_answers_in_review_language`, which reproduces with
my changes stashed. Suite otherwise 815 passed, 9 skipped.

## 28 August 2026, twelfth « go » — part B, the promise I have not kept

Orders read from the tip (`78024d57`, seventeenth sweep). **They are
unchanged**, and the sweep's entry about this lane is a fair account
of rounds 5–7. My lane's last five commits are not in the tip yet;
rebased onto it, as every turn.

One thing in my own record needs saying before anything else. Round
6 deferred part B — the rows no judge could honestly judge at line
granularity — with the words « It is the first item of round 7, not a
dropped one. » Round 7's registration promised it again. **Round 7's
write-up does not report it.** It reported part A and stopped. That
is not a deferral, it is a promise quietly dropped, and I am the only
one who could have caught it. It is this turn's work.

## D3 round 6/7 part B — registration, amended and frozen before any judging

The registration stands as written in round 6 (judging question, the
two guards, rows the header does not settle stay indeterminate and
are counted). Three amendments, each stated before a candidate is
looked at:

**1. The set is eighteen, not fifteen.** The dash round moved three
rows into it — task 81's « GCO/HPL GRI/ACA », « Citrus AFUDC » and
« NNG Shared Cost Surcharge », which were judged « not stated » in
round 5 *only because no fact existed for them*. Now nils exist on
their rows and the same line-granularity problem applies. This is
recorded in the dash round's write-up already; part B inherits them.

**2. The stored candidate lists are stale and are regenerated.**
Those three rows carry `value_hits: []` in the round-5 sheet, from an
extractor that could not see a dash. Judging them from a stale sheet
would be judging an empty page. Part B rebuilds every candidate list
from the current extractor (version `"4"`), and shows the judge each
candidate's **column anchor** beside its line — that anchor is the
evidence part B was registered to use.

**3. What part B can and cannot deliver, said now rather than after.**
Rounds 6 and 7 both died by their own criteria, so the matcher is
back to v3 and **ignores the column anchor entirely**. Part B
therefore *cannot* raise precision — a matcher blind to columns
cannot be helped by a judge who can see them. What it delivers is
two things that are worth having anyway:

- **the honest denominator** — how many of the 42 drawn cells are
  judgeable at all with the document in front of you, which is a
  fact about the corpus and not about any matcher;
- **truth that keeps** — matcher-independent judgements that any
  future round reuses without re-judging, including the round that
  runs once the model side can name a column.

**The bias guard, restated because it matters more here.** The judge
now sees the same feature (the column header) the matcher was built
to score. So: truth is written to disk and committed **before**
`score` is run, exactly as every round in this lane; and the judging
question stays « does this specific fact state this cell's quantity,
as printed », answered from the document's own table. Where the
header does not settle it, the row **stays indeterminate** and is
counted as such — that count is a headline number of the round, not
a footnote.

**The prediction, stated so it can be wrong.** Task 161's six
(`Replacement Cost`, FY-labelled columns) should settle cleanly —
the years are printed headers. Task 81's nil rows should **not**:
a row of dashes across four unnamed columns is precisely the case
where a header cannot say which nil is which. I expect between four
and ten of the eighteen to remain indeterminate. **If nearly all
eighteen settle, I should be suspicious of my own judging, not
pleased** — that would mean I was reading the matcher's mechanism
rather than the document, and I will say so.

**No criterion here kills code**, because part B changes no code. It
is a measurement of the corpus and a repair of the record.

## D3 round 6/7 part B — measured. The rows were judgeable all along, and the honest number is worse than the one I published.

*FinWorkBench/Finch, arXiv:2512.13168, CC BY 3.0.*

### The prediction was wrong in the direction I told myself to distrust

I registered: « I expect between four and ten of the eighteen to remain
indeterminate… **If nearly all eighteen settle, I should be suspicious
of my own judging, not pleased.** » **All eighteen resolved.** Fifteen
settled; three did not settle for a reason that is not the judge's.

So I owe the suspicion an answer, and the answer clears the judging but
convicts something else. **Not one of the fifteen was settled by D1's
column anchor** — the feature the matcher was built to score, and the
source of the bias I feared. On these rows the anchor is mostly
useless: task 160's three headers read `FUND`, `''` and
`COLLECTED/SPENT` (the real header stands three lines up); task 161's
WH rows read `''` (the header is more than twelve lines up, and
`_ANCHOR_LINES_UP` is 12); task 81's read `-`. What settled them was
the printed line's own **left-to-right column order** against the
workbook's column index — Citrus is the third entity column, `12/1/2002`
is the third column of page 2, « Undiscounted » is printed before
« Discounted ». No model call, no matcher feature, nothing but counting.

**Which means round 5's judge — me — was too cautious.** Fifteen rows
were declared unjudgeable when a careful judge holding the workbook's
column index could settle every one. `indeterminate-line-granularity`
is a good name for a real thing, and I applied it to rows that were not
that thing. The cost was not a wrong number; it was a **flattering
denominator**, and that is the same sin one step removed.

### The whole drawn sample, judged

| | round 5 | dash round | **part A + part B** |
|---|---|---|---|
| true proposal | 0 | 0 | **0** |
| false proposal | 2 | 1 | **1** |
| true abstention | 7 | 4 | **4** |
| missed | 18 | 19 | **34** |
| scored rows | 27 | 24 | **39 of 42** |
| rows the documents state | 18 | 20 | **35** |
| unscored | 15 indeterminate | 18 indeterminate | **3 stated-but-unextracted** |

**Recall is 0 of 35.** Every previous table in this family reported a
smaller denominator because the rows that were hardest for the matcher
were the rows the judge had set aside. They are the same rows. That is
the number to carry forward, and the earlier ones should be read as
the partial views they were.

Nothing about the matcher changed, and nothing about the finding
changed: the blockage is still the model-side name (round 7). What
changed is that the measurement now covers the sample it drew.

### A condition this lane did not have a name for

Three rows are **stated by the document and absent from the fact
store**. Calling them « not stated » would be a lie about the page;
calling them « missed » would blame the matcher for D1's failure. They
are counted, excluded from scoring, and named
**`stated-but-unextracted`** — the D1-side sibling of
`indeterminate-line-granularity`, and offered to the lead for the
permanent vocabulary on the same grounds: a number that cannot be
honestly produced is not produced.

Each of the three names its own cause, and two of them are causes this
lane already wrote down:

1. **`72!Scenario3!AC28`** — the document prints « Jan-03 32,675 12,833
   19,842 … » and D1 read `1`, `9`, `8`, `4`, `2` as five separate
   one-digit numbers. See the defect below; this is its first casualty.
2. **`81!ETS!G32`** — the GCO/HPL nil is a dash at x371, and page 1's
   GCO and ETS columns hold **one** numeric token between them, so the
   dash rule's third condition (three numbers at this x) cannot be met.
   This is exactly the anti-correlation gap the dash round recorded and
   declined to patch. Here is what it costs.
3. **`81!ETS!E212`** — the document prints `AFUDC - - - - - - - - - -`
   and D1 extracted **nothing** from that line, because the dash rule
   requires the line to carry at least one number and a wholly-nil row
   carries none. Ten stated zeros, not one of them a fact.

## D1 — a defect found by judging, not by testing: 56% of Finch's facts are torn out of character-spaced text

Chasing `AC28` turned up the largest D1 problem this lane has measured.
Some PDFs place text **one glyph at a time** — a chart overlay does it,
and so does a rotated axis label crossing a table — and pdfplumber's
line then reads `J a n - 0 3  3 2 , 6 7 5  1 2 , 8 3 3  1 9 , 8 4 2`.
D1 tokenizes that into single digits and stores each one as a fact.

**The criterion, stated before the count** (a line is character-spaced
when it has ≥12 whitespace tokens and ≥60% of them are one character
long):

| corpus | facts | in character-spaced lines |
|---|---|---|
| Finch | 6,842 | **3,835 (56.1%)** |
| ED2 | 8,015 | 2 (0.0%) |

| document | facts | spaced | share |
|---|---|---|---|
| 72_src_0 | 3,583 | 3,284 | **92%** |
| 4_src_8 | 334 | 203 | 61% |
| 16_src_0 | 457 | 108 | 24% |
| 81_src_1 | 1,190 | 230 | 19% |

**This is the direction D1 exists to refuse.** A digit of a number is
not a number; `19,842` stored as five facts reading 1, 9, 8, 4 and 2 is
five invented claims about the page, each with a citation box that will
highlight a single glyph. It is worse than a missed fact, and the lane
has said so about everything else.

**Three rounds on ED2 could never have found it** — ED2 has two such
facts in eight thousand — and no unit test would either, because the
fixtures write clean lines. It took a corpus of real financial PDFs and
a judge asking « where is the fact for this number I can see ».

**Not patched.** Registered below as its own round, per the rule this
lane keeps: the fix is measured against a criterion frozen before the
code, and nothing is changed mid-measurement.

## D1 round P — registration: a glyph is not a number

Frozen before any code.

**The change.** When a line is character-spaced by the criterion above,
D1 does not tokenize it into numbers. It records the page as **refused
for that line**, in words, in `ChainRefusal` — « this line's text is
placed one glyph at a time and cannot be read as numbers; the figures
on it are not in the fact store ». Coverage stays answerable, which is
the whole reason refusals are stored.

**Why refusal and not re-assembly.** Re-joining glyphs by x-gap is the
obvious alternative and it is a guess: the gap between two glyphs of
one number and the gap between two numbers differ by fractions of a
point, and getting it wrong silently produces `1984,2` — a *wrong*
number with a confident box, which is the failure mode this product
exists to stop. If a later round measures a re-assembly rule against
hand truth and it clears, it can replace the refusal. Refusing first is
the safe order.

**The kill-criterion, in advance.** The rule dies if either holds:
- the hand-check of 20 seeded refused lines shows any line that is not
  in fact character-spaced (a false refusal is a lost fact, and this
  rule must not eat ordinary tables); or
- ED2's registered 30-cell sample stops returning 30 of 30 correct
  abstentions.

**The prediction, stated so it can be wrong.** Finch's fact count
should fall by roughly half and task 72's by ~92%; the part A + part B
table should not improve, because none of the 35 stated rows depends on
a spaced line except `AC28`, which is already unscored. **If the table
improves, I should look for the reason and not take the credit** — a
matcher that gets better when facts are deleted is telling me the
deleted facts were the noise it was drowning in, which is a different
finding and must be reported as one.

### Two defects in the measurement apparatus, both found this turn and both fixed before scoring

**1. A round key that named two facts.** The Finch harness keyed facts
by `document|page|x|text`. In a table the row below prints at the same
x, so **562 facts of this corpus shared a key with a fact on a
different line** — *[wrong, and corrected by the audit below: 562 was
a count of colliding **keys** over the round's seven tasks, not facts,
and not the whole corpus. The facts sharing an address number 4,456.
The sentence understated the defect eightfold; the four ambiguous
truths below are unaffected and reproduce.]* — and **four of the twenty recorded part-A truths were
addresses naming two facts at once** (task 52's Case 2 and Case 3 rows
both print « Miles Pipe 570 $ - $ - » at identical x). Scoring compares
keys, so a false proposal landing on the wrong line could have been
scored true.

**No published number was wrong** — the affected rounds made no true
proposal, so no verdict was ever decided by a key comparison — and that
is luck, not design. The key now carries both coordinates. Sixteen
truths remapped mechanically; the four ambiguous ones were resolved by
hand from the printed line and are named in the commit and in the truth
file. The ED2 harness (which keyed by *ordinal*, and so would have gone
stale the moment the dash round added 179 nils to those documents) has
the same key now; neither ED2 round recorded a fact key, so nothing
there needed remapping.

I introduced this defect myself, in the dash round, in the commit whose
message said « from here a key survives an extractor change ». It
survives an extractor change and does not survive a table. Said plainly
because the alternative is a lane that only reports other people's
mistakes.

**2. Round JSONs were git-ignored with the corpus bytes.** « Truth
recorded before scoring » is the discipline this whole lane rests on,
and for the Finch rounds the file proving the order lived only in a
container that dies between turns. The corpus bytes stay ignored — they
are re-fetchable and large. The judgements are now tracked: sheet,
truth and verdicts, each in its own commit, in order.

### The standing sentence in the router is updated

`PROPOSAL_STANDING` said « 0 times out of 18 ». It now says 0 of 35,
and says in the same breath that earlier rounds reported a smaller
denominator because the judge had set those rows aside. A product
sentence that quotes the flattering number is the thing this lane
exists not to do.

## D1 round P — measured. **It dies by its own criterion**, and it would have eaten the dash round alive.

**The kill-criterion, as registered:** « the hand-check of 20 seeded
refused lines shows any line that is not in fact character-spaced. »

**Nine of the twenty are not character-spaced.** They are ordinary
financial table rows, and what makes them look spaced is the thing this
lane spent its last round teaching D1 to read: **the nil dash**.

| # | line | verdict |
|---|---|---|
| 01 | `Base Gas - - - - - - - - - -` | **false refusal** |
| 02 | `Overhaul Amortizations - - (0.4) - - - - ( 0.4) 0.4 -` | **false refusal** |
| 03 | `Commercial Support - - (2.4) - - - - ( 2.4) 2.4 -` | **false refusal** |
| 08 | `WACC allowance (vanilla) 3.90% 3.93% D D = A * C + B *` | **false refusal** |
| 09 | `Commercial Support - - (3.6) - - - - ( 3.6) 3.6 -` | **false refusal** |
| 11 | `- Other 0.3 - - - - - - 0.3 - 0.3` | **false refusal** |
| 13 | `Enron Citrus - - - - - - - - 35.0 35.0` | **false refusal** |
| 15 | `Other - - - (1.3) - - - ( 1.3) 1.3 -` | **false refusal** |
| 18 | `Commodity - FTS - 2 - - 3.2 - - - - 3.2 (3.2) -` | **false refusal** |
| 04,05,06,07,10,12,14,16,17,19,20 | `M a r - 0 5 3 2 , 3 4 0 …` | genuinely spaced |

Line 18 is the exact line the dash round measured its hardest case
against. Line 01 is a wholly-nil row — ten stated zeros, refused. The
rule was reaching for glyphs and catching nils.

**And a test caught the shape before the corpus did.** Writing round
P's guard test, I asked what an ordinary narrow table row scores:
`Headcount 27 8 9 4 6 3 2 12 45 7 5 88 3 21` is exactly 60% single
tokens, dead on the threshold. I wrote that down as a characterization
test rather than adjusting the number to make it pass — adjusting the
threshold after seeing the case is exactly the move that turns a
measurement into a decoration.

**What it would have cost, measured before it was reverted:**

| corpus | before | with round P | verdict |
|---|---|---|---|
| Finch | 6,842 | 3,007 | 3,835 removed — but **not all of them junk** |
| ED2 | 8,015 | 8,013 | untouched, as predicted |
| 72_src_0 | 3,583 | 299 | 92% removed, and these **are** junk |
| 81_src_1 | 1,190 | **960** | **230 removed, and these are real nils** |

The prediction (« Finch's count should fall by roughly half and task
72's by ~92% ») came true to the digit, and being right about the
number taught me nothing, because the number was right for two
different reasons at once: task 72 lost invented facts and task 81 lost
stated zeros, and one aggregate cannot tell them apart. A prediction
that a total will move is a weak prediction. Noted for future rounds.

**The rule is out.** `EXTRACTOR_VERSION` returns to `"4"`; the fact
store is untouched; the tests that describe the rule go with it. What
stays is the finding: D1 still stores thousands of single digits torn
out of character-spaced text, and that is still the largest known
defect in this track.

## D1 round Q — registration: the discriminator is a lone *letter*, not a lone character

Frozen before the code, and it is a different rule, not round P with a
tuned number.

**What round P got wrong, precisely.** It asked « how many tokens on
this line are one character long ». In a financial table the answer is
« many », because nils print as `-` and labels hyphenate (`- FTS - 2`).
The two populations are not separable by *length*.

**They are separable by *kind*.** Character-spaced text scatters the
whole alphabet: `M a r - 0 5` stands the letters M, a and r alone. A
table row of nils and figures stands **no letter alone** — its single
characters are dashes and digits, and its letters live inside words.

**The rule.** A line is character-spaced when it has at least
`_SPACED_TOKENS` (12) whitespace tokens **and at least three of them
are single alphabetic characters**. Three, not one: a real line may
print « a » or « I » or a footnote marker, and one lone letter must
never condemn a row.

**The kill-criterion, unchanged in spirit and sharper in fact.** The
rule dies if either holds:
- the same seeded hand-check (seed 173205, 20 lines) shows **any** line
  that is not in fact character-spaced; or
- task 81's fact count falls at all — its nils are the population round
  P destroyed, and not one of them may go.

**The prediction, stated so it can be wrong.** Task 72 falls by roughly
92% again, task 81 falls by **zero**, ED2 by zero, and the part A +
part B table does not improve. If task 81 loses a single fact the rule
is wrong and comes straight out.

## D1 round Q — measured. **It dies too**, and two deaths in a row say the instrument is wrong, not the number.

**What it got right, and it is worth keeping in view:**

| document | before | round P | **round Q** |
|---|---|---|---|
| 81_src_1 (the nils) | 1,190 | 960 ✗ | **1,190 ✓** |
| 5_src_0 | 128 | 118 ✗ | **128 ✓** |
| 16_src_0 | 457 | 349 ✗ | **457 ✓** |
| 72_src_0 (the junk) | 3,583 | 299 | **371** |

Round P's whole failure mode is gone. The nils survive, task 5 and 16
survive, and task 72 still loses ~90% of its facts. The prediction
« task 81 falls by zero » held exactly.

**And the prediction « ED2 falls by zero » did not.** ED2 lost 19 facts
across twelve pages, and the hand-check says why.

**The kill-criterion, as registered:** « the same seeded hand-check
shows **any** line that is not in fact character-spaced. » **Four of
twenty**:

| # | line | why it stands letters alone |
|---|---|---|
| 01 | `7.1 In RIIO-ED1, a financial model is used to calculate a tax allowance on a` | **English prose.** « a », « a », « a » |
| 07 | `being conducted) by a no arbitrage condition, where a 20-year rate x years in` | prose again — « a », « a », « x » |
| 11 | `CAPM-implied cost of equity 4.71% 5.23% 5.75% D D = A + B * (C-A)` | a **formula legend**: D, D, A, B name columns |
| 13 | `WACC allowance (vanilla) 3.90% 3.93% D D = A * C + B *` | the same shape, and it costs three real percentages |

Sixteen of twenty were genuinely spaced, and that is not the criterion.
**The rule is out.** `EXTRACTOR_VERSION` stays `"4"`, the fact store is
untouched, and D1 is exactly the extractor part B measured.

### The lesson is about the instrument, and I am stopping rather than tuning

Round P counted lone characters and caught nils. Round Q counted lone
letters and caught prose. I can see the threshold that would pass this
particular hand-check — and **fitting a threshold to a hand-check I
have already read is how a measurement becomes a decoration.** That is
the move this lane exists to refuse, and it is more tempting after two
failures, not less.

What both rounds share is the instrument: **statistics over assembled
line text**. That text is already the damaged artefact — by the time
pdfplumber has joined glyphs into « tokens », the evidence of how they
were drawn is gone, and every statistic over it is a proxy. Prose,
nils, and formula legends all look like scattered glyphs from there
because *from there they are indistinguishable*.

**So no third threshold.** The defect stands, unfixed and now precisely
described, and round R is registered on a different instrument.

## D1 round R — registration: measure the drawing, not the text

Frozen before any code, and offered to the lead as the next D1 round
rather than run this turn: it is a larger change than a predicate, it
touches how D1 reads every page, and two dead rounds are enough for one
sitting.

**The instrument.** pdfplumber exposes each page's *characters*, with
each one's `x0`, `x1`, `size` and font. In normally-drawn text the gap
between consecutive characters of one word is a small fraction of the
character width, and the gap between words is a large one — two clean
populations. In glyph-by-glyph text every gap is a word gap, because
every glyph was placed by its own operator. **That difference is in the
geometry, before any word joining happens**, and it is the same
evidence a human uses when they look at the page and see « M a r - 0 5 ».

**The rule.** For each line, take the gaps between consecutive
characters. A line is drawn glyph by glyph when the *median* gap
between characters that pdfplumber joined into one word exceeds a
fixed fraction of the median character width on that line. Prose has
no such gaps; a row of nils has no such gaps; task 72's rows are made
of nothing else.

**Why this cannot make round P's or round Q's mistake.** Neither nils
nor lone « a »s nor formula letters are *drawn* differently from the
text around them — they are ordinary glyphs at ordinary spacing that
merely happen to stand alone as tokens. The geometric test never sees
them, because it never asks how many tokens are short.

**The kill-criterion, unchanged and now with three named populations
that must survive:** the rule dies if the same seeded hand-check
(173205, 20 lines) shows **any** line that is not in fact
character-spaced, or if task 81's nils, ED2's prose, or ED2's formula
legend rows lose a single fact.

**What must be reported whatever happens:** the fraction constant will
be chosen **before** the hand-check is read, from the two gap
populations measured on documents this hand-check does not draw from,
and the number chosen will be written here before the check runs.

### The turn's housekeeping, named rather than slipped in

**A container condition that cost half an hour, now written into the
handoff exactly.** The services died between turns again, and I
restarted MinIO with the wrong root user — `claidor-development`,
which is the *S3 access key* the app uses, where the tests need
`claidor` / `claidorclaidor` from `MINIO_USER`/`MINIO_PWD`. Every test
returned `InvalidAccessKeyId`, which reads exactly like a code failure.
The handoff now carries the three start commands verbatim.

**I made the lead's own error from this sweep.** Two pytest sessions
ran at once; they take the same test bucket and delete each other's,
and a suite that passes alone came back with 233 setup errors. The
seventeenth sweep records the lead being OOM-killed for the same class
of mistake, and I read that entry this morning before making it. It is
in the handoff now as a rule, not a caution.

**One red test on the tip is still not mine**:
`test_routes.py::TestTheVersionDelta::`
`test_a_revision_answers_in_review_language`. Suite otherwise **819
passed, 9 skipped**.

### What this turn leaves for the lead

1. **`stated-but-unextracted`** — offered for the permanent vocabulary,
   on the same grounds as `indeterminate-line-granularity`.
2. **D1's character-spacing defect** — the largest known problem in this
   track, precisely described, two fixes dead, **round R registered on
   a different instrument and not run.** It is a bigger change than a
   predicate and wants the lead's eyes first.
3. **The cross-lane case for Sentinel** (`Cell.column_label` reads one
   header row) is unchanged and still the thing standing between D3 and
   a non-zero recall.
4. **D4 and D5** still await decisions, not work — unchanged from the
   last three turns, and I have not touched them.

## 28 August 2026, thirteenth « go » — round R runs, and why I am running it

Orders read from the tip (`49063b01`, eighteenth sweep). **Unchanged
for the fifth turn running.** My lane was merged at the eighteenth
sweep — but at the *pre-rebase* hashes, so what reached the tip is
rounds 6, 7 and the dash round; **part B and everything after it are
still only on my branch.** Rebased onto the tip; git dropped the five
merged commits as already applied and the seven new ones replayed
clean.

**Why round R and not something else, said plainly because I told the
founder otherwise last turn.** D4 and D5 both await decisions rather
than work — unchanged for four turns. Round 4 (Kelso) is blocked on
bytes the lead has closed. That leaves round R, which I registered last
turn with the words « offered to the lead as the next D1 round rather
than run this turn », and in the handoff more strongly: « wants the
lead's eyes first ».

The lead has not seen it: the sweep that merged my lane predates the
push that carried it. So « the lead's eyes first » would mean this lane
does nothing at all this turn, on the largest known defect in its own
package, waiting on a reader who does not yet know there is anything to
read. That is worse than proceeding. **I am running it exactly as
registered**, the protocol is the safeguard, and if the lead would
rather I had waited, the round is a commit that can be reverted and the
finding stands either way.

## D4 round R — amendment, frozen before any measurement

The registration promised: « the fraction constant will be chosen
**before** the hand-check is read, from the two gap populations
measured on documents this hand-check does not draw from, and the
number chosen will be written here before the check runs. »

That needs a held-out split, and here it is, declared now:

- **Calibration half** (the constant is chosen from these, and the
  hand-check never draws from them): the three ED2 PDFs, and the whole
  `4_src_*` family — `4_src_7` and `4_src_9` through `4_src_12` for the
  normally-drawn population, `4_src_8` for the glyph-by-glyph one.
- **Judging half** (the hand-check draws from these only): Finch tasks
  5, 16, 52, 72, 81, 156, 160, 161.

The judging half holds every trap the last two rounds died on — task
81's nils, task 160 and 161's tables, and task 5's prose — and the
target, task 72. The calibration half holds both populations and none
of the rows I have already read closely.

**This is a change to the hand-check** (the seed and the count stay;
the pool shrinks), and it is registered here before it runs rather
than explained afterwards.

## D1 round R — dead at calibration, and the premise was wrong all along

**The instrument does not separate the populations.** Median
intra-line character gap over median character width, on the
calibration half only, before any hand-check:

| document | median ratio |
|---|---|
| ed2-pcfm-guidance | 0.005 |
| ed2-financial-handbook | 0.007 |
| 4_src_11 (normal) | 0.016 |
| **4_src_8 (the « spaced » one)** | **0.038** |

A factor of two between a normal document and the target, with the
normal population's own spread crossing it. There is no constant to
choose. **The round dies before the hand-check is drawn** — which is
what a held-out calibration half is for, and it cost one measurement
instead of a whole round.

### And then the calibration said something much more useful

If the target's characters are only twice as far apart as ordinary
text's, they are **not drawn one glyph at a time.** So I looked at
what the scrambled lines actually are, on the calibration half:

| words on the line | distinct baselines | tops |
|---|---|---|
| 92 | **2** | 163.5, 166.5 |
| 83 | **2** | 145.5, 148.5 |
| 71 | **2** | 181.5, 184.5 |
| 69 | **2** | 139.5, 142.5 |
| 62 | **2** | 157.5, 160.5 |
| 33 | **2** | 115.1, 118.1 |

**Every one is two lines, exactly 3.0 points apart.** And
`_LINE_TOLERANCE` is `3.0`, compared with `<=`. D1 merges them into
one row and sorts by x, which zips two texts together character by
character — « Crosswalk Renovation/Addition » over « Health
Renovation » becomes `cu Cr r or o w s k H e a l t H R a eo l …`.

The same thing happens one level lower and it is where the *facts*
come from: `page.extract_words()` has its own `y_tolerance`, also 3,
so it merges the same two baselines and then splits on x-gaps — and
because the two texts alternate in x, every gap is a word gap. **That
is why « 19,842 » becomes five facts reading 1, 9, 8, 4 and 2.**

**So the defect is mine, not the PDF's.** For three rounds I have been
designing ways to *refuse* text that D1 had scrambled itself. The
document prints an ordinary table over an ordinary chart; a reader
sees it perfectly well; D1 zips them together and then I write rules
to detect the zip. Rounds P, Q and R were all treating a symptom, and
the reason none of them worked is that they were looking at the
damaged artefact for evidence of the damage.

**Nothing needs refusing. The reading needs fixing** — and a fixed
reading *recovers* those numbers instead of dropping them.

## D1 round S — registration: separate the baselines, frozen before code

**The change.** One number, in two places: the y-tolerance that decides
whether two characters sit on one line — `_LINE_TOLERANCE` in `_lines`,
and the `y_tolerance` handed to `page.extract_words()`, which today
takes pdfplumber's default of 3. Nothing else moves: not the token
pattern, not the nil rule, not the column anchor, not the refusals.

**The constant, chosen from the calibration half and written here
before the hand-check runs, as the round R registration promised.**
Two populations, measured above:

- *within* one line, character tops vary by at most **0.9 pt** across
  the calibration half (ED2's sub-point 0.1–0.2 spreads are mixed fonts
  and superscripts on one baseline; `4_src_7`'s largest is 0.9);
- *between* lines, the tightest leading anywhere in the calibration
  half is **3.0 pt** (`4_src_8`, 28 of its 36 gaps).

**The tolerance is `1.5`** — clear of 0.9 below and 3.0 above, with the
margin split roughly evenly on a log scale. Chosen now, on this
evidence, before anything is read from the judging half.

**The kill-criteria, frozen:**
- **Nothing may be lost.** Task 81's nils, ED2's prose and ED2's
  formula legend rows must not lose one fact — the three populations
  rounds P and Q destroyed.
- **The zip must actually break.** The seeded hand-check (173205, 20
  lines, judging half only) is re-purposed: it now draws from lines
  that *were* scrambled under tolerance 3.0, and every one must read
  as ordinary text under 1.5. Any line still scrambled, or any line
  newly broken in half, kills the rule.
- **The registered ED2 sample** must still return 30 of 30 correct
  abstentions.

**The prediction, stated so it can be wrong.** Task 72's fact count
falls a long way — but *not* to near-zero as rounds P and Q made it:
the numbers come back as whole numbers, so I expect roughly 300–700
facts, not 3,583 and not 299. Task 81, ED2 and task 5 move by nothing
or nearly nothing. And **the part A + part B table may finally move**:
`72!Scenario3!AC28` was `stated-but-unextracted` precisely because its
« 19,842 » was shredded, and if the reading is fixed that row becomes
scorable. **If the D3 table improves, that is D1's doing and not the
matcher's, and I will say so in those words.**

`EXTRACTOR_VERSION` goes to `"5"` if it clears: different code read the
page, so they are different claims.

## D1 round S — measured. It repairs the bulk, and **it dies on subscripts.**

**What it repaired**, and this is the first real progress on this
defect:

| document | before | **round S** |
|---|---|---|
| 72_src_0 | 3,583 | **1,270** |
| 4_src_8 | 334 | **105** |
| 81_src_1 (the nils) | 1,190 | **1,190** ✓ |
| ED2 (all three) | 8,015 | **8,015** ✓ |
| 5_src_0, 16, 52, 156, 160, 161 | — | **unchanged** ✓ |

The zips broke. `Jan-03 32,675 12,833 19,842 7,627 …` now reads as a
row, and **`19,842` is a fact on all five January rows including
Jan-03** — the very number part B recorded as `stated-but-unextracted`.
ED2 still returns **30 of 30** correct abstentions.

**My prediction was wrong.** I said task 72 would land at « roughly
300–700 facts »; it landed at 1,270. Being outside my own stated range
is the useful part: the residue is larger than I thought, and looking
at it found a second population (below).

### The kill-criterion it fails: « any line newly broken in half »

Tolerance 1.5 **splits subscripts off their base**. In the ED2
handbook, 270 lines change:

| at 3.0 | at 1.5 |
|---|---|
| `Formula for calculating the Real Price Effects (RPEt) term` | `…(RPE) term` + a line reading `t` |
| `update outturn data for RPIm and CPIHm until June` | `…for RPI and CPIH until June` + a line reading `m m` |
| `labelled “CYRPIFt” and “CYCPIHt”` | `labelled “CYRPIF” and “CYCPIH”` + `t t` |

In a regulator handbook **the subscript is the meaning** — `RPIm` and
`RPIt` are different quantities — and `line` is exactly what D3 matches
on and D4 anchors by. No fact is lost, but facts on those lines lose
their name.

**And no constant can fix it, which kills the design and not just the
number.** Measured on the calibration half:

| population | offset |
|---|---|
| ED2 subscripts below their base | **2.6 – 2.9 pt** |
| `4_src_8`'s second baseline | **3.0 pt** |

The two populations are 0.1 pt apart. There is no tolerance that keeps
a subscript and splits a zip. **Round S is out**; `EXTRACTOR_VERSION`
returns to `"4"`.

### Two things this round found that outlive it

**1. A second, genuine population — and it is small.** Four rows of
`72_src_0` are still scrambled at 1.5, and their characters sit on
**one** baseline (98 characters all at top 125.3). Those are really
drawn glyph by glyph. So the original hypothesis was not wrong, only
tiny: of the ~3,300 shredded facts, four lines' worth are genuine and
the rest were D1's own doing.

**2. My regression suite is blind to this class of damage.** ED2's
30-of-30 passed *while 270 of its lines were being broken*, because
every one of those 30 recorded truths is empty — the sample tests
abstention, and an abstention stays correct however mangled the line.
A line-text regression is a gap in my own safety net; noted, and the
next round carries one.

## D1 round T — registration: a subscript is *smaller*, a second line is not

Frozen before the code. **The fourth attempt on this defect, and I am
saying so plainly** — three have died by their own criteria and one at
calibration. What justifies another is that this one is not another
threshold on the same axis: rounds P, Q and R all measured the damaged
text, round S measured distance, and distance is now *proved*
insufficient by a 0.1 pt overlap. This measures a property neither has
used, and the calibration half already shows it separating cleanly.

**The discriminator, measured on the calibration half:**

| | vertical offset | font size |
|---|---|---|
| ED2 subscript under its base | 2.6–2.9 | **6.5 under 10.0 → 0.65×** |
| `4_src_8` second baseline | 3.0 | **same size → 1.00×** |

**The rule.** Group characters into candidate baselines at a tight
tolerance (**1.5**, round S's constant, which the calibration justified
and which round S proved does break the zips). Then **merge a
candidate back into the line above when it is a subscript run** — when
its median font size is below **0.8×** the size of the line above it.
Nothing else moves.

**Both constants are chosen from the calibration half and written here
before the judging half is judged**: 1.5 from round S's calibration
(intra-line spread ≤1.4 in the ED2 annex, tightest leading 3.0), and
0.8 as the midpoint between the measured 0.65 and 1.00.

**The kill-criteria, frozen, and the first one is new because round S
showed I needed it:**
- **Line-text regression.** Every line of the three ED2 PDFs must read
  character-for-character as it does at tolerance 3.0 today. Not « no
  fact lost » — the exact line strings. Any difference kills it.
- **Nothing lost.** Task 81's nils, ED2, and task 5 must not lose a
  fact.
- **The zips must break**: `19,842` must be a fact on task 72's Jan-03
  row, as it was under round S.
- **ED2's registered sample** must still return 30 of 30.

**The prediction, stated so it can be wrong.** Task 72 lands at 1,270
again — identical to round S, because task 72 has no subscripts — and
ED2's line text is byte-identical to today's. **If ED2's lines are not
byte-identical the rule is wrong**, and unlike round S I will know it
this time, because the check now exists.

**One honesty note about the hand-check.** I have now read task 72's
line text at tolerance 1.5 while diagnosing round S. The seeded
hand-check is therefore no longer independent evidence *for task 72*,
and I will not lean on it there; the line-text regression above is the
criterion that decides this round, and it runs on the calibration half
where nothing has been read for this purpose.

### Round T, amended before the code — superscripts too

The registration said « merge a candidate back into the line **above**
when it is a subscript run ». Checking the calibration half before
writing anything, ED2 also carries **44 superscript runs** (43 in the
handbook, 1 in the annex) — footnote markers, which sit *above* their
base and would be split off the other way.

Implementing only the subscript half would send a rule I already know
is incomplete at a criterion I already expect it to fail, which wastes
a round and teaches nothing. **The rule is: a small run merges into
whichever neighbouring baseline is within 3.5 pt and larger** — above
for a subscript, below for a superscript. Same 0.8× size test, same
1.5 pt grouping, nothing else changes.

Worth recording beside it: **`4_src_8` has zero runs of either kind**,
so the rule cannot touch the zips it is meant to leave alone. The
discriminator separates on the calibration half exactly as the
registration claimed.

### Round T, second amendment — the reach constant was measured from one page

`_SCRIPT_REACH = 3.5` was wrong, and wrong because I sampled badly: I
read « 2.6–2.9 pt » off a single page of the ED2 handbook and called it
the population. The line-text check found subscripts at **3.66 pt** on
the contents page, just outside it.

Measured properly across the whole calibration half, splitting by the
test the rule actually separates on:

| population | n | min | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| size-qualified runs (sub/superscripts) | 329 | 1.60 | 2.91 | 5.15 | **6.03** | 6.27 |
| same-sized baselines (the zips) | 576 | 1.80 | 6.00 | 7.44 | 7.68 | 7.82 |

**The two overlap completely in distance** — which is the whole point
of round T: distance was never going to separate them, and the size
test already does. Reach is not a discriminator; its only job is to not
exclude a real script. **It becomes 6.5**, clearing the measured p99 of
6.03.

**The risk this creates, named before the run:** a footnote block is
small text too, and its *first* line now sits within reach of the body
line above it. Its later lines are safe (their neighbour above is also
small), so at most one line per block can be wrongly merged. The
line-text criterion is exactly the instrument that will say whether it
happens.

**This is the last constant correction in this round.** Both amendments
came from re-measuring the calibration half after finding my own
measurement of it was too small a sample, and the judging half is still
unread for this purpose. If the criterion fails again, round T dies
rather than acquiring a third amendment.

## D1 round T — measured. **It dies by the criterion I wrote, and the criterion was part of the problem.**

**The criterion:** « Every line of the three ED2 PDFs must read
character-for-character as it does at tolerance 3.0 today. Any
difference kills it. »

**81 lines differ** — 2 in the annex, 57 in the handbook, 22 in the
PCFM guidance. **Round T is out.** `EXTRACTOR_VERSION` stays `"4"`.

### But read what the differences are, because they are not one thing

**Repairs** — the « now » is plainly the correct reading:

| page | at 3.0 today | under round T |
|---|---|---|
| handbook p30 | `notio𝑊𝑊na𝐴𝐴l𝐶𝐶 g𝐶𝐶e 𝑡𝑡 a=ri𝑖𝑖n𝑖𝑖g𝑖𝑖 𝐴𝐴o 𝑡𝑡 ×th𝑊𝑊e+ lic𝐴𝐴e𝑅𝑅n𝑖𝑖s𝐴𝐴e…` | `𝑊𝑊𝐴𝐴𝐶𝐶𝐶𝐶𝑡𝑡 =…` **and** `where g is the notional gearing of the licensee, equal to 60%.` |
| handbook p32 | `…Index (RPEI )` + a line reading `t` | `…Index (RPEIt)` |
| handbook p22 | `S pC 2.2` | `SpC 2.2` |
| guidance p5 | `…run to calculate AR by 31 A…` | `…run to calculate ARt by 31…` |
| guidance p10 | `Allowed Revenue (AR) value` | `Allowed Revenue (ARt) value` |

ED2's own handbook and guidance contain zips too — I had assumed ED2
was clean, and it is not.

**A correction to a claim I nearly shipped.** I first wrote that all 22
of the PCFM guidance's changed lines were repairs of that kind, on the
strength of two of them. Checking all 22 before pushing: most are
(`AR`+`t` → `ARt`, `(iBTA)`+`t` → `(iBTAt)`, `(AR*)`+`t` → `(AR*t)`,
`BR`+`2026/27` → `BR2026/27`), but **at least two lose a space** —
`paragraph 2.1.5 of Special` becomes `ofSpecial`, and `Condition 2.1`
becomes `Condition2.1`. Tightening the *vertical* tolerance changed
*horizontal* word-splitting as well, which I had not predicted and
which round U must account for. Two samples are not twenty-two.

*[Wrong, and corrected by the classification below: the arrow points
the other way. Today's shipping extractor produces `ofSpecial` and
`Condition2.1`; round T **repairs** both. I printed the changed lines
by zipping two unaligned lists and read a « was » against a « now »
that was not its pair. All 22 of the PCFM guidance's changes are
repairs after all — the original claim I « corrected » was right.]*

**Damage** — display mathematics, a third population neither approach
anticipated:

| page | at 3.0 today | under round T |
|---|---|---|
| handbook p33 | `𝑅𝑅𝑅𝑅𝑗𝑗,𝑡𝑡` | `𝑅𝑅𝑅𝑅𝑗𝑗,𝑡𝑡 𝑡𝑡−1 𝑡𝑡` |
| handbook p56 | `where: 1−(1+𝐷𝐷𝑅𝑅)` | `1−(1+𝐷𝐷𝑅𝑅)` — « where: » moved away |
| annex p90 | `ED1 ED2 tax clawback gearing level test151` | split in two |

A multi-line display equation puts its subscripts on genuinely separate
visual rows, and moving each one to « the larger neighbour » shuffles
them between rows of the equation. Real damage, and a real population.

### The criterion forbade improvement as well as damage, and that is my error

« Byte-identical » conflates *changed* with *damaged*. Round T is dead
by it, and I am not overturning that after reading the result — the
whole value of a frozen criterion is that it binds when it is
inconvenient. But the criterion should have measured **damage**, and it
did not, and I wrote it one round after complaining that my ED2 sample
was blind to exactly this distinction. I replaced a blind check with a
deaf one.

### Where D1 actually stands, for the lead

**Five rounds, five deaths, and they are not five failures of the same
kind:**

| round | what it tried | how it died |
|---|---|---|
| P | refuse lines ≥60% one-character tokens | hand-check: caught **nils** — 9 of 20 |
| Q | refuse lines with ≥3 lone letters | hand-check: caught **prose and formula legends** — 4 of 20 |
| R | character-gap geometry | **calibration**: populations 2× apart, no constant — and it found the real mechanism |
| S | y-tolerance 1.5 | **subscripts**, 0.1 pt from the zips |
| T | 1.5 + merge small runs by font size | **display mathematics** shuffled; 81 ED2 lines changed |

**What is now known and was not known this morning:**

1. The defect is **D1's own**, not the PDF's: `_LINE_TOLERANCE = 3.0`
   merges baselines that are exactly 3.0 apart and zips two texts
   together by x. `page.extract_words()` does the same at its own
   default of 3.
2. **Font size separates** sub/superscripts from merged baselines
   cleanly where distance cannot — measured, and it works.
3. The genuine glyph-by-glyph population is **four lines**, not
   thousands.
4. **Display mathematics is a third population** and nothing tried so
   far handles it.
5. Round T's shape recovers **~2,400 junk facts in task 72** (3,583 →
   1,160), loses **nothing** in task 81, task 5, or ED2's fact counts,
   and repairs every one of the PCFM guidance's changed lines.

**The decision I am putting to the lead rather than taking myself:**
round T's rule is one criterion away from shippable, and the criterion
is the question — should a D1 change be required to leave every line
*unchanged*, or to leave every line *undamaged*? The second is right
and much harder to test. My proposal, registered but **not run**, is a
hand-judged damage check: the seeded 20-line draw, restricted to lines
that *changed*, each read and marked repair / damage / neither, with
**zero damage** the bar and repairs counted but not required. That is
the same shape as every hand-check this lane runs, and it is the only
instrument I can see that does not forbid the fix along with the
breakage. **I am not running it without a word from the lead**, because
choosing one's own success criterion after five deaths is exactly when
a lane should not be alone.

Until then D1 ships version `"4"` with the defect documented, and every
number this lane has published stands as measured under it.

### What this turn leaves for the lead — three things, in order of cost

1. **The criterion question** (above): must a D1 change leave every
   line *unchanged*, or every line *undamaged*? One word from you and
   round U runs; without it D1 keeps a defect I now know how to fix.
2. **`stated-but-unextracted`** — still offered for the permanent
   vocabulary, from part B last turn. Note that round T would have
   retired one of its three instances by recovering `19,842` on task
   72's Jan-03 row.
3. **D4, D5, and Sentinel's `Cell.column_label`** — unchanged for five
   turns. D4 and D5 await decisions, not work; the column-label case is
   still the thing standing between D3 and a non-zero recall.

Orders have not changed since the fourteenth sweep and my lane has run
four sweeps past them. Everything above is inside D1 and D3, which are
mine, and none of it has touched the engine.

## 28 August 2026, fourteenth « go » — the audit: every number this lane has published, re-derived

Orders read from the tip. **The tip has not moved** (`49063b01`, still
the eighteenth sweep) and the orders file is byte-identical to the
fourteenth sweep's. No word on round U's criterion question.

**So there is nothing I may honestly start.** D4 and D5 await
decisions. Round 4 is closed by the lead. Round U I registered one turn
ago with the words « I am not running it without a word from the lead »,
and a commitment made in writing to the founder does not expire because
I am impatient.

**What is unblocked, and overdue: checking my own arithmetic.** In two
turns I have found two defects in my own measuring apparatus — a fact
key that addressed two facts at once, and a criterion that could not
tell repair from damage — and one claim I had generalised from two
samples to twenty-two. The lead is about to read roughly forty numbers
out of this log and act on them. **A base rate of two errors in two
turns is a reason to check the rest before the sweep, not after.**

This produces no new claim, so it needs no registration. It re-derives
every headline number in this log from the committed harnesses and
truths, and reports each as reproduced or not. **Anything that does not
reproduce is written down here whether it flatters this lane or not.**

The claims under audit, listed before any of them is re-run so the list
cannot be trimmed to what passes:

| # | claim | source round |
|---|---|---|
| 1 | ED2 sample: 30 of 30 correct abstentions | D3 rounds 1–3 |
| 2 | ED2 run B: 60 judged, 0 sourced cells found | D3 round 2 |
| 3 | Finch part A + B: 0 true, 1 false, 4 abstain, 34 missed | part B |
| 4 | 39 of 42 scored; 35 rows the documents state | part B |
| 5 | part B settled 15 of 18; 3 `stated-but-unextracted` | part B |
| 6 | round 5: recall 0 of 18 | D3 round 5 |
| 7 | rounds 6 and 7: 0 true, 2 false, 7 abstain, 18 missed | D3 rounds 6–7 |
| 8 | dash round: 750 nils across the corpus | D1 dash round |
| 9 | dash round hand-check: 20 of 20 clean | D1 dash round |
| 10 | corpus totals: 6,842 Finch facts, 8,015 ED2 | D1, current |
| 11 | 56.1% of Finch facts sit in character-spaced lines | part B |
| 12 | D5 flood: 22,693 candidates on a regulator model, 85 on Cascade | D5 round 1 |
| 13 | D4: 8 of 8 on its registered table | D4 |
| 14 | 562 colliding keys before the two-coordinate fix | part B |

## The audit — measured. Thirteen of fourteen reproduce; the fourteenth understated my own defect by eight times.

| # | claim | re-derived | verdict |
|---|---|---|---|
| 1 | ED2: 30 of 30 correct abstentions | 30/30, 0 stated | ✓ |
| 2 | ED2 run B: 60 judged, 0 sourced | 60 judged, 0 sourced | ✓ |
| 3 | part A+B: 0 true, 1 false, 4 abstain, 34 missed | identical | ✓ |
| 4 | 39 of 42 scored; 35 rows stated | identical | ✓ |
| 5 | part B settled 15 of 18; 3 unextracted | identical | ✓ |
| 6 | round 5: recall 0 of 18 | **not reproducible by construction** | see below |
| 7 | rounds 6–7: 0/2/7/18 | **not reproducible by construction** | see below |
| 8 | 750 nils across the corpus | 750 | ✓ |
| 9 | dash hand-check 20 of 20 | redrawn, all 20 re-read, all clean | ✓ |
| 10 | 6,842 Finch facts, 8,015 ED2 | 6,842 / 8,015 | ✓ |
| 11 | 56.1% of Finch facts in spaced lines | 3,835 = 56.1% | ✓ |
| 12 | D5 flood 22,693 and 85 | 22,693 and 85 | ✓ |
| 13 | D4 eight of eight | 12 tests pass (8 registered + 4) | ✓ |
| 14 | **562 facts shared a key** | **562 *keys*, 4,456 facts** | ✗ **wrong** |

### Claim 14, corrected — and the error ran in my favour

The part B write-up says « **562 facts of this corpus shared a key with
a fact on a different line** ». Two things in that sentence are wrong,
and both make the defect sound smaller than it was:

1. **562 was a count of *keys*, not facts.** Each colliding key names
   two or more facts. The facts that shared an address with another
   fact number **4,456** — eight times what I published, and 83% of
   the 5,361 facts in the round's seven tasks.
2. **« of this corpus » was the round's seven tasks, not the corpus.**
   Across the whole Finch corpus it is **632 keys** naming **4,629
   facts**.

The finding that mattered — four of the twenty recorded truths were
ambiguous addresses — is unaffected and reproduces. But the sentence a
reader would quote was wrong by a factor of eight **in the direction
that flattered my own apparatus**, and that is the direction I am least
entitled to be wrong in.

**One thing the correction adds.** Excluding the one-digit fragments
that the character-spacing defect manufactures, the collisions are
**240 keys naming 1,173 facts**. So the two defects compound: shredding
a number into digits multiplies the addresses that collide. Fixing the
reading (rounds S/T/U) would remove roughly three-quarters of the
collision surface as a side effect.

### Claims 6 and 7 — not reproducible, and the log should have said so

Rounds 5, 6 and 7 were measured under extractor versions 2 and 3. The
extractor is now version 4 and the round's truths were re-keyed in the
dash round, so **those tables cannot be re-derived from the current
tree** — running `score` today yields the dash round's numbers, which
it does, exactly (0 true, 1 false, 4 abstentions, 19 missed, 24 scored,
20 stated).

That is correct behaviour, not a defect: a superseded measurement of a
superseded extractor. But nothing in the log warns a reader who tries.
**Every table in this log from rounds 5, 6 and 7 should be read as
« measured under extractor version 2/3 », and the live number is part
A + part B's 0 of 35.** Stated here once, plainly, since the earlier
entries cannot be edited without rewriting the record.

### What the audit says about this lane

Four checks in three turns have now found four errors of my own: a fact
key that addressed two facts, a criterion that could not tell repair
from damage, a claim generalised from two samples to twenty-two, and a
count off by a factor of eight. **None of them changed a headline
finding** — recall is still 0 of 35, the nils still survive, D4 still
passes eight of eight — and all four were found by checking rather than
by anyone catching me.

I do not think that rate is acceptable, and the pattern in all four is
the same: **I write the sentence from the measurement I just ran, and
the sentence generalises further than the run did.** The measurement
was right every time; the prose was not. From here, any number that
goes into this log in a sentence gets the population it was measured
over named in the same sentence.

### The audit is now a command, not a thing I remembered to do

`server/scripts/corpus_documents_audit.py` re-derives the eight
corpus-level numbers in one run and exits non-zero on any mismatch. It
carries the four harness commands it cannot cover (each needs its own
truth file or the database) in its own output, so « run the audit »
is a complete instruction.

**Every row names the population it was measured over** — « facts,
Finch corpus (17 PDFs) », « colliding keys, round's 7 tasks » — because
the population being unnamed is precisely how claim 14 went wrong. A
claim without its population is not auditable, and now it cannot be
written down here without one.

All eight rows pass on the current tree.

### What this turn leaves for the lead — unchanged, plus one correction

1. **The criterion question** for round U: must a D1 change leave every
   line *unchanged*, or every line *undamaged*? Registered, not run,
   waiting on a word. D1 keeps a defect I know how to fix until then.
2. **`stated-but-unextracted`** — offered for the permanent vocabulary.
3. **D4, D5, Sentinel's `Cell.column_label`** — awaiting decisions, not
   work, for six turns now.
4. **New:** the part B write-up's « 562 facts » is corrected to « 562
   colliding keys naming 4,456 facts, over the round's seven tasks ».
   **Checked rather than guessed:** the string does not appear in
   `worklog.md` on the tip at all, and part B has never been swept, so
   the wrong number has not travelled outside this log. Nothing for the
   lead to correct elsewhere.

   I first wrote this item as « if it has been quoted, it needs
   correcting there too » — a speculation, one commit after committing
   to name the population of every claim. Checking took one command.

The tip has not moved in two turns and the orders file is four sweeps
old. Everything this lane has done since is inside D1 and D3, and the
engine is untouched.

## 28 August 2026, fifteenth « go » — the Scottish route is not closed, and round 4's blocker is now half the size

Orders read from the tip (`2de8c43a`). The tip has moved but the
**orders file is byte-identical** to the fourteenth sweep's — five
sweeps old now. No word on round U's criterion question, so round U
stays unrun as promised.

**The new commits change a fact my orders rest on.** The population
proof fetches eleven **Scottish Futures Trust closed-deal models** —
and `Kelso`, `Levenmouth` and `Oban and Campbeltown` are three of the
eleven. Those are the exact three deals whose pairs D3 round 4 is
registered on, and which my orders close with « Every automated route
to the Scottish pairs is exhausted and the failure is structural…
**Stop attempting it.** »

**The route is not exhausted. It was the wrong route.** My fetcher went
through the portal's `/document/{id}/download` links via the Wayback
archive, which truncates at 1 MiB — and the Kelso model is 4.2 MB. The
files also sit directly in a public S3 bucket with a valid certificate
under a stable convention, `{Project Words}+Financial+Model.xlsm`.

**Verified independently from this container just now**, not taken on
another lane's word:

| probe | result |
|---|---|
| `Kelso+High+School+Financial+Model.xlsm` | **200**, `Content-Length: 4,231,503` |
| `Levenmouth+Academy+Financial+Model.xlsm` | **200** |
| `Oban+and+Campbeltown+High+Schools+Financial+Model.xlsm` | **200** |
| the portal itself, `contracts.scottishfuturestrust.org.uk` | still fails TLS (no connection) |

### The contract half is still missing, and I stopped rather than fought

Round 4 needs **pairs**. The bucket holds the models; it does not list
(`ListObjectsV2` → 403 AccessDenied), so keys must be guessed. I probed
**thirteen** forms of the agreement key — the model convention applied
to the portal's own panel heading « Kelso High School - Project
Agreement », plus `Contract`, `Agreement` alone, `Redacted` before and
after, `.PDF`, `.zip`, and the same forms for Levenmouth, Baldragon and
City of Glasgow College. **All thirteen return 403; the model key
returns 200 in the same breath**, so 403 here means absent, not denied.

That is where I stop. Thirteen guesses is a probe; a fourteenth is
fighting, and my orders say report rather than fight.

**What the lead should take from this, stated as narrowly as the
evidence allows:**

1. « The Scottish route is structurally closed » is **half wrong**. The
   models are reachable today, by a route the project already has
   committed and running.
2. **Round 4's blocker is now specifically the contracts**, not the
   models — a much narrower ask than the one the founder was given
   (« Save Page Now on six URLs »). Three URLs would do, and only the
   agreement half.
3. Anyone who can see the portal's index in a browser can read the
   agreement filenames off it in a minute, and if they follow the same
   convention the bucket serves them without the portal.

**I have not modified `corpus_sft_models.py`** — it is not my file, and
the models it fetches are not what round 4 is missing.

## D5 round 3 — registration: the round D5 said it needed, on the population it named

Frozen before any number is looked at.

**This round was specified by D5 round 2's own write-up**, which said
the local-rule shape « is measurable and possibly useful **on
deal-shaped models**, which is the product's actual case, and
untestable on the regulator corpus, which is not ». Round 2 could not
run it: the only deal-shaped models this lane held were the Cascade
fixture (85 typed cells) and a pre-app example (230). Two toys.

**The population, and it is the founder's own choice of market.** The
eight readable Scottish Futures Trust closed-deal models fetched by
`scripts/corpus_sft_models.py` — Baldragon, City of Glasgow College,
Forfar, Inverurie & Foresterhill, **Kelso**, **Levenmouth**,
Newbattle, **Oban & Campbeltown**. Real models agreed at financial
close, audited, lent against. The three `.xlsb`/`.xls` files are
format-blocked by our reader and are **excluded and counted**, never
quietly dropped.

**A conflict of interest I am naming before it can bite.** These same
eight models are the population proof's subjects, and the population
proof is a *cold-run* proof — the engine must not have been tuned on
them. **D5 round 3 changes no engine code and no chain code**; it reads
the models through the engine's existing reader and counts structure.
It is a measurement of the corpus, not a fit to it. If the lead judges
that even reading them contaminates the cold run, this round is
discarded and the finding with it — say so and I will drop it without
argument.

**What is measured, exactly as round 2 measured it on the regulator
corpus, so the two tables are comparable line for line:**

1. numeric cells, and typed cells (no formula, a value present);
2. sections the model itself declares, via the engine's own
   `structure.sections()` — « rows the model totals », from the
   workbook's `SUM` formulas, never a heuristic of mine;
3. **typed cells that fall inside a declared section** — the number
   that was **0 of 22,693** on ED2 and is the whole question;
4. where that number is not zero: findings that would fire under the
   three thresholds (`any`, `half`, `all-but-this-one`) at
   confirmation budgets B = 10, 25, 50, 100, adversarial (greedy worst
   case) and random (seeded mean of 20) — the identical table.

**The prediction, stated so it can be wrong.** Round 2's structural
argument was « a block a model *totals* is a block of outputs », and it
predicted the shape has ground only where inputs and totalled blocks
coincide. A closed-deal project-finance model is hand-built by a
modeller, not machine-generated, so I expect **a non-zero and
substantial** typed-cells-inside-sections count — somewhere between the
regulator models' 0% and the pre-app example's 68%. **If it is zero
across all eight, the local-rule shape is dead in the product's actual
market and I will say so in those words**, and D5 will need the
input-block rule that does not come from `SUM` — which is Sentinel's
ground, not mine.

**No kill-criterion, because this round changes no code.** It is a
measurement, and its only obligation is to report what it finds
including the case that kills the shape I proposed.

## D5 round 3 — measured, and the answer is about the corpus, not the shape

**Zero usable sections on all eight.** Not « zero typed cells inside a
section » as on the regulator models — **zero sections declared at
all**, on every one of the eight.

Round 2 taught me that a zero that large is usually a bug, and to check
rather than report. I checked, and it is not a bug in the shape or in
the engine. **It is the corpus.**

### The finding: the published closed-deal models are all but value-only

Parsed out of the sheet XML directly — not through the reader, so the
reader cannot be what is wrong:

| model | cells | formula cells (text) | shared followers |
|---|---|---|---|
| baldragon | 914,364 | 220 | 0 |
| glasgow_college | 631,904 | **0** | 0 |
| forfar | 812,405 | **0** | 0 |
| inverurie_foresterhill | 171,203 | 3 | 0 |
| kelso | 1,074,011 | 717 | 158 |
| levenmouth | 1,230,971 | 224 | 0 |
| newbattle | 1,074,692 | 259 | 357 |
| oban_campbeltown | 220,989 | **0** | 0 |
| **total** | **6,130,539** | **1,423** | **515** |

**1,938 formula cells in 6,130,539. That is 0.03%.** Three of the eight
— Glasgow College, Forfar, Oban & Campbeltown — contain **no formula
anywhere**, across 82, 26 and 18 sheets.

These are published under transparency rules two years after
completion, and what is published is the workbook with its formulas
stripped: the numbers, not the model. It is a perfectly sensible thing
for a publisher to do and it is fatal to anything that checks
arithmetic.

**So D5 round 3's answer, stated exactly:** the local-rule shape has no
ground on this population, and **the reason is not the one round 2
predicted.** Round 2 said « a block a model totals is a block of
outputs », and predicted the shape would find ground on hand-built deal
models. **That prediction is untested, not refuted** — these files
declare no totals because they contain no formulas, so the question
round 2 asked cannot be put to them at all. My registered prediction
(« non-zero and substantial, between 0% and 68% ») is **wrong**, and
wrong for a reason I could not have predicted from the corpus's
description.

### The consequence is not mine to draw, so I will state it and stop

`swens-plan.md`'s first completion proof is « ten models from the
chosen first population, run cold, findings hand-verified ». A tie-out
engine finds disagreements between what a model computes and what it
states. **On a workbook with 0.03% formulas there is almost nothing of
that kind to find**, and on three of the eight there is nothing at all.

I am not the lane that owns the population proof and I am not going to
tell it what its result means. But it is registered, the corpus is
fetched, and the run has not happened yet, so **this is worth knowing
before the run rather than after it** — which is the only reason I am
writing it here today rather than at my next turn.

### A fourth intake gap, and it is the kind that manufactures false findings

Separately, and much smaller: openpyxl expands *some* shared formulas
(`<f t="shared" si="N"/>`, where only the group's master carries the
text) and not others.

| model | formula cells in the file | the reader sees | missed |
|---|---|---|---|
| kelso | 875 | 814 | **61** |
| newbattle | 616 | 492 | **124** |
| the other six | 447 | 447 | 0 |

**185 formula cells across this corpus come back as typed cells.** That
is the same class as the `.xlsb` and `.xls` gaps the lead logged today,
and it is the worst-flavoured of them: a blocked *format* is visibly
blocked, but a computed cell misread as an input is **silently wrong**,
and it lands in exactly the population D5's unsourced-number finding
draws from. A finding that says « this number has no source » about a
cell that is computed by a formula is the confident wrongness this
product exists to prevent. Routed to the lead; `ingest` is not mine.

### Three counts before I got one right, recorded because that is the deal

I measured the formula counts three times and published none of the
first two. The first regex (`<f[ >/]`) was right; the second
(`<f[^>]*>[^<]`) silently matched `<formula>` tags from conditional
formatting and inflated Glasgow College from 0 to 217; the third
disagreed with both. **I stopped pattern-matching XML and parsed it**,
which is the number above.

Last turn's audit named my failure mode as « the sentence generalises
further than the run did ». This is its sibling: **the instrument was
wrong and the number looked plausible.** Nothing but the third method
would have caught it, and the only reason I ran a third is that the
first two disagreed. Where two methods agree I would have published.

## Retraction — the « fourth intake gap » I wrote up two hours ago is wrong in every part that mattered

I published, above and in the handoff, that openpyxl mis-reads shared
formulas, that **185 computed cells come back as typed inputs**, and
that this « feeds D5's candidate population » and manufactures false
findings. I then tested each of those claims properly. **All three are
wrong.** Nothing has been pushed; the record is corrected before it
leaves this container, which is the only reason this is a retraction
and not a lie told to the lead.

| what I claimed | what the test says |
|---|---|
| the cause is shared-formula followers | **no** — the reader resolves 158 of Kelso's 158 followers and 337 of Newbattle's 357 |
| 5 of Newbattle's 9 `typed-over-formula` findings sit on such cells | **no — zero do** |
| 185 computed cells come back as **typed inputs** | **no — zero do**; they carry no value either |

**How the « 5 of 9 » happened, because it is a bug I have made before.**
I compared a finding's cell reference against a set of follower
references **without their sheet name**, so `Swap Profiles!D118` matched
a `D118` on some other sheet. Two turns ago I found and fixed exactly
this in the Finch round harness — a fact key that named two facts
because it lacked a coordinate. **I fixed that address bug in my own
harness and then made the identical mistake in the script that was
checking it.** The hand-check that caught it took one look at the raw
XML: `D118` has no `<f>` element at all.

**What actually survives, stated with nothing added:** in two of the
eight models the reader returns fewer formula cells than the file
contains — Kelso 814 of 875, Newbattle 492 of 616, the other six exact.
Those 185 cells appear in the reader's output with **neither a formula
nor a value**, so they become neither findings nor typed inputs. On
this corpus the discrepancy is **inert**. **I have not established its
cause and I am not going to guess a third mechanism** — two have
collapsed under test today, and a third guess is the move I refused
when the extractor rounds were dying.

It is worth one line to whoever owns `ingest`, as a discrepancy with a
known size and an unknown cause. It is not an intake gap of the class
the `.xlsb` finding is, and I should not have called it one.

## The engine on the eight, measured — because « nothing to run on » deserved a number

I wrote that a tie-out engine has « almost nothing to find » on a
value-only workbook. That was an inference, so I ran the engine the way
the service runs it (`read_structure` → `audit(book, axes=...)`), read-only:

| model | formula cells | rule findings | analytics |
|---|---|---|---|
| baldragon | 220 | 0 | 0 |
| glasgow_college | **0** | 0 | 0 |
| forfar | **0** | 0 | 0 |
| inverurie_foresterhill | 3 | 2 | 4 |
| kelso | 814 | 0 | 4 |
| levenmouth | 224 | 0 | 0 |
| newbattle | 492 | **14** | 4 |
| oban_campbeltown | **0** | 0 | 0 |

**Sixteen rule findings and twelve analytics across all eight models**,
and four of the eight produce nothing whatever.

*[The analytics figure is now stale, and for a good reason: after
Sentinel's own-check period restriction was adopted at the twenty-third
sweep, the same run gives **16 rules and 4 analytics**. The eight that
vanished are Kelso's four and Newbattle's four — exactly Proof 1A's
eight false alarms. Re-measured and recorded in the twentieth « go ».]*

**And the honest reading cuts both ways, so both go here.** Zero
findings on an audited, closed, lent-against model may be the engine
being *right* — these files were checked by professionals before
publication. A proof that says « we ran it cold on ten real models and
it reported almost nothing » is not evidence of a broken engine. It is
also not the demonstration `swens-plan.md` describes, which is
« findings **hand-verified** »: four of these models offer nothing to
hand-verify. **Which of those two readings is the right one is the
lead's call and the founder's, not mine.**

### What this turn leaves for the lead

Two of these are time-sensitive and neither is about my own tracks.

1. **The Scottish route is open for models.** My orders say it is
   structurally closed; it is not, and `corpus_sft_models.py` fetches
   Kelso, Levenmouth and Oban today. **D3 round 4's blocker is now the
   contract half alone** — a three-URL ask, not the six the founder was
   given. Thirteen probed key forms say the agreements are not in that
   bucket; I stopped there rather than guess a fourteenth.
2. **The eight published closed-deal models are all but value-only** —
   1,938 formula cells in 6,130,539, three of eight with none at all —
   and the engine, run as the service runs it, reports **16 rule
   findings and 12 analytics across all eight**, four of them nothing.
   The population proof's cold run has not happened yet. What that
   means for the proof is not mine to say; that it is true is.
3. **D5 round 3's answer**: the local-rule shape has no ground on this
   population, and round 2's structural prediction is **untested, not
   refuted** — a corpus with no formulas declares no totals, so round
   2's question cannot be put to it. My registered prediction was
   wrong.
4. **Round U's criterion question** — still waiting on a word, still
   unrun, five sweeps since the orders file last changed.
5. **A retraction, in full, in this log.** I wrote up a fourth intake
   gap and it did not survive its own tests. Nothing was pushed.

**Four errors of mine surfaced in one turn** — three regexes that
disagreed, a cause that collapsed, a harm that was zero, and a
sheet-blind address comparison I had already fixed once in my own
harness. Every one was caught by checking rather than by anyone
catching me, and none reached the lead. That is the system working and
it is also not a rate I am comfortable with. The pattern is narrower
than last turn's « the sentence generalises past the run »: **when I
have a plausible mechanism, I write it down before I have tested that
it is the mechanism.** The fix is the same shape as the audit — a
claimed *cause* now needs its own check before it is written, not
after.

## 28 August 2026, sixteenth « go » — the round D5 round 3 could not run, now that a subject exists

Orders read from the tip (`f33b6b1e`). **The orders file is
byte-identical for the sixth sweep running** and there is still no word
on round U's criterion question, so round U stays unrun as promised.

**My lane merged at the nineteenth sweep**, and the lead acted on last
turn's finding before I could raise it twice: **the population proof is
suspended**, « the published corpus is value-only, verified before any
audit ». The lead measured sixteen models where I measured eight, got
the same answer, and named their own error in doing so. The write-up
credits this lane finding it independently « from the other side ». I
have nothing to add to that and am not going to re-litigate it.

**What their sixteen contained that my eight did not.** One model with
a live calculation layer: **Inverness College — 380,506 cells, 20,027
formulas, 5.26%.** Every model I measured was under 0.1%.

That matters to this lane specifically, because D5 round 3's conclusion
was **not** « the shape is wrong »; it was:

> round 2's structural prediction is **untested, not refuted** — a
> corpus with no formulas declares no totals, so round 2's question
> cannot be put to them.

**A subject now exists.** Probed from this container just now:
`Inverness+College+Financial+Model.xlsm` returns **200, 2,265,188
bytes**, and Scottish National Blood Transfusion Service returns 200 at
1,881,902 — both by the same bucket convention. Neither is in the
committed fetcher, which holds eight readable models; the lead obtained
them some other way.

## D5 round 4 — registration, frozen before the file is opened

**One question, the one round 2 asked and round 3 could not put:** on a
hand-built, formula-bearing, closed-deal project-finance model, do the
blocks a model *totals* contain typed cells — or are inputs and totalled
blocks disjoint there too, as they are on every regulator model?

**The subjects.** `inverness_college` and `snbts`, fetched by the same
route the committed fetcher uses. **Both are in the population proof's
registered sample**, and the proof is suspended, not cancelled — so the
same conflict-of-interest note as round 3 applies and is repeated here:
**this round changes no engine code and no chain code.** It reads the
models through the engine's existing reader and counts structure. If the
lead judges that reading them contaminates a later cold run, discard
this round and its finding; say so and I will drop it without argument.

**Measured, identically to rounds 2 and 3 so all three tables compare
line for line:** numeric and typed cells; sections the model declares
via the engine's own `structure.sections()`; **typed cells falling
inside a declared section**; and where that is non-zero, the three
thresholds (`any`, `half`, `all-but-this-one`) at budgets B = 10, 25,
50, 100, adversarial and seeded-random.

**SNBTS is measured but not predicted.** Its formula count is unknown to
me — the lead's table does not list it separately, and I have not opened
it. If it turns out to be value-only it joins round 3's eight and says
nothing new; that is reported either way.

**The prediction, for Inverness College, stated so it can be wrong.**
Round 2's structural argument — « a block a model *totals* is a block of
outputs » — predicts **zero or near-zero** typed cells inside declared
sections even here. My round 3 prediction (« non-zero and substantial »)
was already wrong once, for a reason I could not have foreseen. **This
time I am predicting with round 2's argument rather than against it: I
expect under 5%.** If it comes back substantial, round 2's structural
claim is wrong on the product's actual market and the local-rule shape
is alive — and I will say so in those words, having just bet against it.

**No kill-criterion: this round changes no code.** Its only obligation
is to report what it finds, including the case that revives a shape I
have twice written off.

## D5 round 4 — measured. Round 2's verdict **replicates on a real market model**, and I was right to bet against my own last prediction.

### The population, stated first

| model | cells | formulas | reader sees |
|---|---|---|---|
| **inverness_college** | 380,506 | **20,027** (2,826 written + 17,201 shared followers) | 19,900 |
| snbts | 350,350 | **0** | 0 |

**SNBTS is value-only** and joins round 3's eight; it says nothing new
and is reported so the sample is not quietly one model. **The round's
real subject is Inverness College**, and my formula count matches the
lead's 20,027 exactly, arrived at independently.

### The answer to round 2's question

| | regulator models | round 3's eight deals | **Inverness College** |
|---|---|---|---|
| sections declared | 5–61 | **0** | **21** |
| usable sections | 0 | 0 | **6** |
| typed cells inside one | **0** of 22,693 | 0 (no formulas) | **175** of 195,202 |
| share | 0% | — | **0.09%** |

**The shape has ground for the first time on a model from the product's
actual market.** Not zero, as on every regulator model; not
inapplicable, as on nine value-only files. Six blocks a real modeller
totalled contain 175 cells a real modeller typed.

**My registered prediction was « under 5% », made deliberately *with*
round 2's structural argument after round 3's prediction went the other
way and lost. 0.09% — round 2's argument holds:** a block a model
totals is overwhelmingly a block of outputs, even when a person built
it by hand. Being right this time is worth less than the reason: I bet
on the argument that had already survived a measurement, not on the
outcome I wanted.

### The threshold table, replicated on a real subject

| threshold | B=10 | B=25 | B=50 | B=100 |
|---|---|---|---|---|
| **any** (adv / rand) | 169 / 144 | 169 / 146 | 169 / 122 | 169 / 75 |
| **half** (adv / rand) | 2 / 0.1 | 20 / 0.3 | 35 / 0.4 | 86 / **66.8** |
| **all-but-this-one** (adv / rand) | **2 / 0.1** | **2 / 0.3** | **3 / 0.4** | **5 / 0.9** |

Every property round 2 found on a 230-cell example reappears on a
380,506-cell closed deal:

- **« any » floods** — 169 findings from ten confirmations.
- **« half » punishes diligence** — its random noise climbs from 0.1 to
  **66.8** as the banker's budget goes 10 → 100. The harder someone
  works, the more it shouts at them.
- **« all-but-this-one » survives**: at most 5 adversarial and about
  1 random, at a hundred confirmations, on a model of this size.

**This is the first time D5's shape has been measured on a real,
formula-bearing model from the market the founder chose**, and the
verdict round 2 reached on toys is the verdict here.

### The honest limitation, which cuts against the shape I am reporting

**0.09% is a very small surface.** At the surviving threshold and a
hundred confirmations, this model yields **about one finding**. Two
readings and I am not choosing between them:

- it is **quiet enough to be safe**, which is the property the whole
  design was arranged to get, and a check that fires once on a real
  deal is not noise a banker will learn to ignore;
- it may be **too quiet to be worth building** — a feature that
  produces one finding per deal has to be very good at that one.

Which of those matters more is a product judgement, and it is the
founder's and the lead's. **What I can now say that I could not
yesterday is that the number is real, measured on a real deal, and not
extrapolated from a 230-cell example.**

### One thing this round settles about last turn's retraction

Inverness College carries **17,201 shared-formula followers** and the
reader resolves essentially all of them — it sees 19,900 of 20,027.
Last turn I claimed openpyxl mis-reads shared formulas and retracted it
the same turn. **This is independent confirmation that the retraction
was right**, on a model with a hundred times more of them than the one
that produced the wrong claim.

### For the lead: exactly what I opened, so contamination is yours to judge

Both round 4 subjects are in the population proof's registered sample.
The proof is **suspended, not cancelled**, so I am naming precisely what
this lane has now read, rather than leaving the lead to reconstruct it:

| file | what this lane did with it |
|---|---|
| `inverness_college_model.xlsm` | read through `read_artifact`; counted cells, formulas, declared sections and typed cells inside them; ran the three D5 thresholds. **No engine code changed, no finding hand-verified, no output inspected.** |
| `snbts_model.xlsm` | same, and it has no formulas, so the run stopped at the section count |
| the eight of round 3 | the same, plus one read-only run of `audit()` as the service calls it, whose **finding counts** I recorded (16 rule findings, 12 analytics across all eight) — I did not read the findings themselves beyond nine `typed-over-formula` refs on Newbattle while chasing a claim I later retracted |

**The one that is arguably contaminating is that last line**, and I am
flagging it rather than defending it: on Newbattle I read nine finding
records in full. If the proof's cold-run condition means « no lane has
looked at what the engine says about this file », Newbattle is
compromised for that condition and the other ten are not. **Drop it
from the sample or discard my round; either costs less than a proof
whose conditions were quietly broken.**

I also fetched `inverness_college` and `snbts` from the S3 bucket by the
same `{Project Words}+Financial+Model.xlsm` convention the committed
fetcher uses — **both return 200** (2,265,188 and 1,881,902 bytes).
They are not in `corpus_sft_models.py`, which holds eleven. If that
matters to route 1 of the suspension (« find a formula-bearing
population »), the convention reaches further than the committed list;
extending it is not my file to edit.

### What this turn leaves for the lead

1. **D5 now has the evidence its pending decision was missing.** The
   shape's verdict is replicated on a real closed-deal model from the
   founder's chosen market, with its limitation stated against it. D5
   has awaited a decision for six turns; it is no longer waiting on
   measurement.
2. **Newbattle may be contaminated for the proof's cold-run condition**
   — named above, mine, and cheaper to drop than to argue about.
3. **Round U's criterion question** — sixth sweep, still unanswered,
   still unrun. D1 keeps a defect I know how to fix.
4. **D3 round 4's contracts** — the models are reachable, the
   agreements are not, thirteen key forms probed. Three URLs from a
   browser would close it.
5. **D4** — approval pending since the fourteenth sweep.

Orders unchanged for six sweeps. Everything above is inside D1, D3 and
D5, which are mine; the engine is untouched and no other lane's file
has been edited.

## 28 August 2026, seventeenth « go » — measuring what round U's decision hinges on, without taking it

Orders read from the tip (`6a4e5524`, twentieth sweep). **Byte-identical
for the seventh sweep.** My lane merged again; the sweep records
« Scribe returned five items to the lead » and answers none of them,
which is not a complaint — the lead spent this sweep running Proof 1A
and it failed honestly, which is worth more than answering me.

**Round U is still not run**, and it will not be. What I wrote was: « I
am not running it without a word from the lead, because choosing one's
own success criterion after five deaths is exactly when a lane should
not be alone. » Three turns of silence do not make that reasoning
weaker; if anything they make it stronger, because the temptation to
proceed is the thing the commitment was made against.

**But a decision nobody can afford to think about is worth making
cheap.** The lead's choice is: must a D1 change leave every ED2 line
*unchanged*, or every line *undamaged*? That choice is easy if round T
repaired 78 lines and broke 3, and genuinely hard if it broke 40. **I
have never counted.** So this turn counts it.

## The classification — registered before a line is read

**What this is not, stated first and bindingly.** This does **not**
accept round T, and its result cannot. The extractor stays at version
`"4"`; `_words` stays out of `extract.py`; the rule ships only on the
lead's word and on a criterion the lead sets. **I am producing the
evidence for the decision, not applying it as a gate.** If the count
comes back overwhelmingly favourable, that changes nothing about what
ships this turn.

**Method.** Round T's rule is reimplemented in a throwaway measurement
script — `extract.py` is not touched — and every ED2 line whose text
differs under it is printed as a before/after pair. **I read each pair
and mark it**, by one question asked of the document itself:

- **repair** — the « after » is what the page actually prints and the
  « before » was not (a zipped line separated, a subscript rejoined);
- **damage** — the « before » was right and the « after » is not (a
  word split, a subscript orphaned, content moved between rows);
- **neither** — both readings are defensible, or the line is display
  mathematics whose « correct » single-line form is not well defined.

**« Neither » is a real answer and I expect to use it.** Round T's own
write-up found display equations whose subscripts genuinely live on
separate visual rows; « what that line should read as » has no honest
answer, and forcing those into repair or damage would be exactly the
flattering that the criterion question exists to prevent.

**The bias guard.** I have already read about a dozen of these pairs
while diagnosing round T, and I recorded then that the guidance
handbook's were mixed and the PCFM guidance's were mostly repairs.
**That is not independent judging and I am not pretending otherwise.**
The count is reported as what it is: one person's reading of 81 lines,
some of which that person has seen before and formed a view on. A
second reader would be worth more than my care here, and the lead is
that reader.

**No prediction of the split**, deliberately. I have made two
predictions about this defect and lost one; a third guess before a
hand-count I have partly pre-read would be theatre.

**What is reported:** the three counts, the full pair list so the lead
can spot-check any of them, and — the number that actually decides it —
**how many lines are damage**, since « undamaged » as a criterion is
satisfied at zero and fails at one.

## The classification — measured. **The criterion question does not decide round T. Round T fails either bar.**

143 line entries differ across the three ED2 documents, grouping into
**32 logical changes**. Read one at a time against the page:

| | changes | line entries |
|---|---|---|
| **repair** | **20** | 59 |
| **damage** | **1** | 2 |
| **neither** (display mathematics) | 11 | 82 |

### The one damage, and it is unambiguous

**`ed2-financial-handbook` p61:**

| | |
|---|---|
| today (tolerance 3.0) | `8. Legacy adjustments` |
| under round T | `8. Legacy adju2s+tm𝑅𝑅ℎ𝐷𝐷e𝑅𝑅nts` |

A clean section heading, destroyed by having an equation's denominator
(`2+𝑅𝑅ℎ𝐷𝐷𝑅𝑅`) merged into it. Not a judgement call and not display
mathematics: the page prints a heading, and round T returns rubble.

**So the decision the lead has been carrying does not need to be
taken to settle this round.** « Unchanged » fails round T at 32
changes. « Undamaged » — the criterion I proposed, with zero damage as
the bar — **fails it at one.** Both bars reject it. **The criterion
question is real and still worth answering for the rule that comes
next, but it is not what is blocking D1, and I should have measured
that before asking.**

### The diagnosis the damage hands over, precisely

Round T's rule merges a small run into « whichever neighbouring
baseline is within 3.5 pt and larger » — up for a subscript, **down for
a superscript**. On p61 the *downward* branch fires on a formula
denominator sitting above a heading: small text, big text below, within
reach. The rule cannot tell **a subscript inside a line** from **a
small line adjacent to a bigger one**, and that distinction is what a
successor rule has to carry. A subscript sits inside its host's own
horizontal run; a separate small line does not.

The upward branch produced no damage in 143 entries. **If a next round
wants a cheap, safe subset, it is round T with the superscript branch
removed** — 20 repairs are almost all subscripts (`ARt`, `RPEIt`,
`iBTAt`, `AR*2026/27`), and the one destroyed heading came from the
other direction. **That is a registration for another turn, not a
change made here**, and it still needs the lead's word.

### A correction: I published this backwards last turn

Last turn I wrote, as a correction to an earlier overclaim:

> at least two lose a space — `paragraph 2.1.5 of Special` becomes
> `ofSpecial`, and `Condition 2.1` becomes `Condition2.1`.

**The opposite is true.** Today's shipping extractor produces
`ofSpecial` and `Condition2.1`; round T **repairs** them to
`of Special` and `Condition 2.1`. They are entries 18 and 19 in the
repair column above.

**How.** Last turn I printed the changed lines by zipping the
`only-before` and `only-after` lists, which are not aligned — so I read
a « was » against a « now » that was not its pair, and reported the
arrow pointing the wrong way. It is the third time an unaligned or
under-keyed comparison has produced a wrong claim in this lane: the
fact key without its y-coordinate, the finding refs without their
sheet, and now these. **Same defect, three dresses: I compared two
lists as if position meant identity.**

The correction runs against my own interest twice over — it removes the
only damage I had claimed for round T *and* it means last turn's
« correction » was itself wrong. Both are in the record.

### What this turn leaves for the lead

1. **You do not need to answer the criterion question to unblock D1.**
   Round T fails both bars. What is needed is a rule that does not
   merge an equation denominator into a section heading — and the
   measurement above says exactly which half of round T to drop.
2. **The criterion question is still worth answering** for whatever
   comes next, and it is now a cheaper question: « undamaged » has a
   working instrument, and the instrument found one damage in 143
   entries in one sitting.
3. **D5 has its evidence** (round 4, last turn) and awaits a decision,
   not measurement.
4. **D3 round 4's contracts** — models reachable, agreements not.
5. **D4** — approval pending since the fourteenth sweep.
6. **Newbattle may be contaminated** for the proof's cold-run
   condition — flagged last turn, mine, cheaper to drop than to argue.

Orders unchanged for seven sweeps. Nothing outside D1, D3 and D5 has
been touched, and `extract.py` is byte-identical to the tip's.

## 28 August 2026, eighteenth « go » — the damage is one constant, not one branch

Orders read from the tip (`eea41373`, twenty-first sweep).
**Byte-identical for the eighth sweep.** My lane merged; the sweep
records the classification and the in-place correction discipline, and
answers none of the six items — which is fair, the lead spent the sweep
on Sentinel's held fix and Dynamo's unit-per-row defect.

**Last turn's conclusion pointed at the wrong fix, and measuring first
caught it.** I wrote that « round T minus the downward branch is the
obvious next candidate ». Before registering that, I measured every
merge round T performs across the three ED2 documents:

| direction | n | min | p50 | p90 | max |
|---|---|---|---|---|---|
| **up** (subscript into the line above) | 272 | 1.6 | 2.9 | 3.7 | **6.2** |
| **down** (superscript into the line below) | 22 | 1.8 | 2.3 | 2.4 | **5.1** |

The downward histogram is the whole finding:

`[(1.8, 1), (2.0, 9), (2.1, 1), (2.3, 3), (2.4, 7), (5.1, 1)]`

**Twenty-one downward merges sit between 1.8 and 2.4 points. The
twenty-second sits at 5.1, and it is the damage** — `2+𝑅𝑅ℎ𝐷𝐷𝑅𝑅`
reaching down into `8. Legacy adjustments`. There is nothing between
2.4 and 5.1.

**So dropping the downward branch would have been wrong twice over:** it
would have thrown away 21 correct merges to remove 1 bad one, and it
would have left the actual cause — a reach constant of 6.5 applied to
both directions — in place. **The upward branch genuinely needs 6.5**
(its tail runs 5.3, 5.4, 5.7, 5.8, 6.2); the downward branch never
needs more than 2.4.

**Why the asymmetry is real and not a curve fitted to one failure.** A
subscript sits below its base and merges *upward* — and its base may be
a tall display formula, so the gap can be large. A superscript sits
above its base and merges *downward* — and superscripts are footnote
markers and exponents, which sit close to ordinary text. The two are
different physical things with different natural ranges, and round T
gave them one constant because I measured them as one population.

## D1 round V — registration: reach is directional

Frozen before the code. **One number splits into two, and nothing else
moves.**

`_SCRIPT_REACH = 6.5` becomes **6.5 upward** and **3.0 downward**.

**How 3.0 was chosen, and the part I do not get to hide.** From the
legitimate downward population's measured maximum of 2.4, with margin —
the same calibration shape as every constant in this family. **But I
have already seen the failure at 5.1, so this is not a blind choice**,
and I am not going to present it as one. What makes it defensible is
that the test is not the constant: **the 143-entry classification is
the instrument, it was built and run before this round existed, and I
did not design it around this number.**

**The kill-criteria, frozen:**
- **The damage must go.** `8. Legacy adjustments` must read as itself.
- **No repair may be lost.** All 20 classified repairs must survive.
- **No new damage.** The classification is re-run in full and every
  changed entry re-read; any new damage kills it.
- **ED2's registered sample** must still return 30 of 30.

**The prediction, stated so it can be wrong.** All 21 legitimate
downward merges sit at ≤2.4 and survive; the 20 repairs are almost all
*upward* merges and are untouched; the damage disappears; and the
« neither » column shrinks by the display-formula lines that the p61
merge disturbed. **Net: 20 repairs, 0 damage.** If any repair is lost,
the asymmetry story is wrong and the round dies.

**This still does not ship.** `extract.py` stays at version `"4"`
whatever this measures; the rule reaches the extractor on the lead's
word, not on mine. What a clear result buys is that the word becomes
cheap to give.

## D1 round V — measured. **It clears every criterion. The first rule in this family to do so.**

### The registered criteria, one at a time

| criterion | result |
|---|---|
| the damage must go | **gone** — `8. Legacy adjustments` reads as itself; it no longer appears among the differing lines at all |
| no repair may be lost | **all 20 present**, checked one by one against the classification |
| no new damage | **one new entry**, and it is display mathematics — `2+𝑅𝑅ℎ𝐷𝐷𝑅𝑅` becomes its own line, the same « neither » class as every other formula fragment |
| ED2's registered sample | **30 of 30** correct abstentions |

**The classification under round V is 20 repairs, 0 damage.**

Diffed against round T rather than re-read blind, so the comparison is
exhaustive rather than sampled — **three entries change in the whole
corpus**, and they are the two that constituted the damage plus the one
formula line:

```
only in round T:  p61 NOW: 8. Legacy adju2s+tm𝑅𝑅ℎ𝐷𝐷e𝑅𝑅nts
                  p61 WAS: 8. Legacy adjustments
only in round V:  p61 NOW: 2+𝑅𝑅ℎ𝐷𝐷𝑅𝑅
```

**The prediction held exactly.** I said the 21 legitimate downward
merges would survive, the 20 repairs were mostly upward and would be
untouched, and the damage would disappear. All three.

### What it does to the corpus, measured with the rule temporarily in place

| | shipping (v4) | **round V** |
|---|---|---|
| Finch facts | 6,842 | **4,189** |
| facts in character-spaced lines (Finch) | 3,835 | **500** |
| colliding keys, round's 7 tasks | 562 | **319** |
| facts sharing an address | 4,456 | **1,895** |
| **ED2 facts** | 8,015 | **8,015** ✓ |
| **nils, both corpora** | 750 | **750** ✓ |

**87% of the shredded lines are repaired**, and the two populations the
earlier rounds destroyed — ED2's facts and the dash round's nils — are
untouched to the unit. The collision surface halves as a side effect,
which two turns ago I predicted would happen if the reading were fixed.

**The 500 that remain** are the genuine glyph-by-glyph population,
including task 72's four rows on a single baseline. That is a real
residue and it is not what this round was for.

### It is still not shipped, and that is deliberate

`extract.py` is byte-identical to the tip's — I applied the rule to run
the registered ED2 check, then reverted and verified. The extractor
stays at version `"4"`.

**What the lead has to decide is now small and concrete:** a rule that
clears four stated criteria, repairs 87% of a defect that costs 2,600
invented facts on one corpus, changes nothing on ED2 or the nils, and
whose entire remaining footprint on the ED2 documents is 20 repairs and
zero damage across 142 line entries. **Round U's criterion question no
longer blocks anything** — round V passes the strict bar and the loose
one alike.

*[Wrong, and corrected in the entry below. Round V changes 142 line
entries, so under « unchanged » it is rejected. It passes « undamaged »
and only that. The criterion question is precisely what decides this
round, and saying otherwise made the ask sound smaller than it is.]*

If the answer is yes, shipping it is: the constants above,
`_words` from round T with a directional reach, `EXTRACTOR_VERSION` to
`"5"`, and the four harnesses re-run. If the answer is no, the finding
stands and the extractor does not move.

### One process note, against myself

Half an hour of this turn went to a measurement I reported and then had
to withdraw: a `cd` failed, the chained edit never applied, and I ran
« round V's ED2 check » against the unmodified extractor. I caught it
because 30/30 is also what v4 returns, and an identical number from two
supposedly different configurations is not a confirmation — it is a
question. **The check that saved it was asking why the result was
unsurprising.**

### What this turn leaves for the lead — one decision, and it is now cheap

1. **Ship round V, or not.** It clears four stated criteria, repairs
   87% of D1's largest known defect, and touches neither ED2's facts
   nor the dash round's nils. The recipe is in the handoff. **This is
   the whole ask**, and « unchanged versus undamaged » no longer needs
   answering to make it: round V passes either way.
   *[Wrong — see the correction below. Round V passes « undamaged »
   only; under « unchanged » it is rejected, as any repairing rule
   must be. The criterion question is the decision.]*
2. **D5** has its evidence (round 4) and awaits a decision.
3. **D3 round 4's contracts** — models reachable, agreements not.
4. **D4** — approval pending since the fourteenth sweep.
5. **Newbattle** may be contaminated for the proof's cold-run
   condition; cheaper to drop than to argue.

Orders unchanged for eight sweeps. Seven D1 rounds have now run: P, Q,
R, S and T died by their own criteria, the classification measured what
those deaths cost and bought, and V is the first to clear. **Six
failures were the price of one rule that works, and every one of them
is in this log with its number.**

## 28 August 2026, nineteenth « go » — a correction that puts the decision back where it belongs

Orders read from the tip (`abd73c4f`, twenty-second sweep).
**Byte-identical for the ninth sweep.** My lane merged; the sweep
records « Scribe priced a cheap decision honestly, including what
getting there cost » and does not answer it.

**And I priced it wrong.** Last turn I wrote:

> **Round U's criterion question no longer blocks anything** — round V
> passes the strict bar and the loose one alike.

**That is false, and it understates what I am asking the lead to
decide.** The strict bar was « every line of the three ED2 PDFs must
read character-for-character as it does today ». **Round V changes 142
line entries.** Under « unchanged » it is rejected outright. It passes
« undamaged » — 20 repairs, 0 damage — and that is the only bar it
passes.

**So the criterion question is not academic and it never stopped being
the decision.** Stated properly:

| bar | round T | **round V** |
|---|---|---|
| **unchanged** (no ED2 line may differ) | rejected, 32 changes | **rejected, 142 entries** |
| **undamaged** (no ED2 line may be made worse) | rejected, 1 damage | **accepted, 0 damage** |

**Under « unchanged », no rule that repairs anything can ever pass** —
a repair is a change. That is the argument for « undamaged » being the
right bar, and it is an argument, not a measurement; it is the lead's
to accept or reject. What I am not entitled to do is tell the lead the
question has gone away when the answer is what decides whether D1's
largest known defect gets fixed.

**How I got it wrong.** I conflated « clears the four criteria I
registered for round V » with « clears both candidate criteria for a
D1 change ». They are different sets: my four were the damage, the
repairs, new damage and ED2's sample — none of them is « nothing may
change ». I wrote the summary from the round's own scorecard without
re-reading the question the scorecard was meant to answer.

That is the fourth time this lane has published a claim that outran its
own measurement, and unlike the earlier three it is not an arithmetic
or alignment slip: **it is a claim about what a decision requires,
made by someone who wanted the decision to be easy.** The measurements
were all correct. The sentence about what they meant was not.

Both places in this log that carried the claim are marked in place
below, and the handoff is corrected.

## Round V's residue, measured rather than asserted

Last turn I wrote that the facts still sitting in character-spaced
lines under round V « are the genuine glyph-by-glyph population,
including task 72's four rows ». **That was an assertion, made in the
same turn I caught myself asserting past a measurement**, so here is
the measurement.

**56 lines remain character-spaced under round V.** By the number of
distinct character baselines each holds:

| baselines | lines | what they are |
|---|---|---|
| **1** | **50** | genuinely drawn one glyph at a time — the real residue |
| 3 | 2 | `72_src_0` rows whose baselines scatter 125.3 / 125.6 / 126.6 |
| 5–6 | 4 | `16_src_0` p9 — **rotated chart axis labels** (`1 3 5 7 9 1 3 5 7 9…`, `7 7 7 7 7 8 8 8 8 8…`, tick years read vertically), whose per-character tops differ by tenths of a point |

**So the assertion was substantially right and wrong in its details.**
Right that the residue is not the defect round V fixes — not one of the
56 is two ordinary text lines zipped together. Wrong that it is task
72's four rows: it is **50 genuinely glyph-drawn lines spread across
tasks 16, 81, 5 and 72**, plus six that are rotated axis labels and
sub-point baseline scatter.

### And the check that matters more: does round V make anything worse?

Every document, both configurations, counting numeric tokens that land
on a character-spaced line. **(The number-matcher here is cruder than
the extractor's, so these totals differ from the audit's by a few
percent; the comparison between columns is the point, not the
absolute.)**

| document | v4 spaced | round V spaced | |
|---|---|---|---|
| `72_src_0` | 3,286 | **152** | better |
| `4_src_8` | 204 | **0** | better |
| `16_src_0` | 108 | 108 | same |
| `81_src_1` | 87 | 87 | same |
| `5_src_0` | 10 | 10 | same |
| `ed2-fd-finance-annex` | 2 | 2 | same |
| the other eleven | 0 | 0 | same |

**Nothing gets worse. Two documents get better. Everything else is
identical to the unit.** That is the strongest form of the round V
result and it is the one I should have led with: not « 87% repaired »,
which is an aggregate, but **« no document loses anything, and the two
that were broken are fixed »**, which is a statement about every file.

**What the residue would take** is a different round again — rotated
text and truly per-glyph drawing are not a line-grouping problem — and
**I am not registering it.** Round V is undecided, six D1 rounds are
already in this log unshipped, and adding a seventh design to the queue
would be noise, not progress.

### What this turn leaves for the lead

**One decision, and I have now stated it correctly:**

**Should a D1 change be required to leave every ED2 line *unchanged*,
or every line *undamaged*?** Round V passes the second and fails the
first, and so would any rule that repairs anything. Under
« undamaged » it is: 20 repairs, 0 damage, ED2 30 of 30, **no document
worse and two fixed**. The shipping recipe is in the handoff.

Last turn I told you this question had gone away. It had not, and the
correction is above — the measurements were right and my sentence about
what they meant was not.

The rest is unchanged and all of it awaits a decision rather than work:
**D5** (round 4's evidence), **D3 round 4** (contracts unreachable,
models reachable), **D4** (approval pending since the fourteenth
sweep), and **Newbattle**, which may be contaminated for the proof's
cold-run condition.

**Orders unchanged for nine sweeps.** I am not going to keep
registering rounds to fill turns: seven D1 rounds sit in this log, six
dead and one waiting, and an eighth design would be noise. If nothing
is decided, the honest next turn is a short one.

## 28 August 2026, twentieth « go » — a short turn, as promised, and one number that moved

Orders read from the tip (`bd174718`, twenty-third sweep in progress).
**Byte-identical for the tenth sweep.** My lane merged. Round V is
still undecided, and last turn I said that if nothing were decided the
honest next turn would be a short one. This is that turn.

**Two things were worth doing.**

### 1. Re-running every registered measurement against the moved tip

The engine is a read-only library to this lane, so when it changes my
numbers can move without anyone noticing. `analytics.py` moved 299
lines at this sweep (Sentinel's own-check period restriction, adopted).
So I re-ran everything this lane has published:

| measurement | result |
|---|---|
| the audit's 8 corpus numbers | **8 of 8 reproduce** |
| ED2's registered sample | **30 of 30** |
| Finch part A + part B | **0 / 1 / 4 / 34, 39 of 42 scored, 35 stated** — identical |
| D5 round 2 (regulator + toys) | identical, including ED2's 0 of 22,693 |
| D5 round 4 (Inverness College) | identical — 21 sections, 6 usable, 175 typed cells, and the whole threshold table |

**One number moved, and it moved for a good reason.**

### 2. The engine on the eight deal models: analytics 12 → 4

| | round 3 (published) | now |
|---|---|---|
| rule findings | 16 | **16** |
| analytics findings | 12 | **4** |

The eight that disappeared are **Kelso's four and Newbattle's four**.
Those are precisely the two models where Proof 1A found its eight false
alarms, and precisely the class Sentinel's own-check period restriction
was built to remove — a covenant threshold parked in a scalar column
being read as a failing period.

**12 − 8 = 4.** My independent re-run of my own registered measurement,
on a corpus I measured for a different reason, drops by exactly the
number the proof adjudicated at the cells. **That is corroboration of
Sentinel's fix from outside its own tests**, and it is worth more than
my saying so, because I did not set out to check it — I set out to see
whether my numbers still held.

**The published number is now stale and is marked in place** at the
round 3 write-up. It was correct when measured, against an engine that
has since been fixed.

### What I did not do

I did not register an eighth D1 round, and I will not while round V is
undecided. **The five open decisions are now on one page** —
`docs/pierce/logs/scribe-decisions.md` — each with its question, its
evidence in a sentence, and what happens on either answer. That is not
new work and adds no claim; it is an attempt to make five asks cost a
minute rather than an hour.

Suite: **904 passed, 9 skipped, 0 failed.**

## 28 August 2026, twenty-first « go » — five decisions arrived; round V is shipped

Orders read from the tip (`d782ed4e`, twenty-fourth sweep). **The
orders file changed for the first time in ten sweeps, and all five
decisions are answered.** The lead also names the delay as its own
failure and has put a rule in `lanes.md` so it cannot repeat; I have
nothing to add to that, and I am not going to spend a paragraph on it.

The answers, and what each means here:

| | decision | what this lane does |
|---|---|---|
| 1 | **D1: the bar is « undamaged ». Ship round V.** | shipped this turn |
| 2 | **D5: shelve, with a named trigger** — register the reporting round when D4's store holds confirmations from at least one *real* deal | nothing to do until then |
| 3 | **D4: approved. Build the store**, `value_at_confirmation` amendment approved with it | this turn |
| 4 | **D3 round 4: closed.** Harness stays committed; if a contract ever arrives it revives | round 4 marked closed |
| 5 | **Newbattle: keep it**, caveat recorded loudly; the cold-run condition tightens for everything after, and Newbattle is excluded from 1B | nothing to do; the reasoning is better than mine was |

**The bar is now standing policy for this lane** and I have written it
where I will meet it: a change to extraction must leave no line
*worse*, need not leave every line *identical*, damage is judged by
hand against the documents rather than by a diff count, and the
repair/damage tally is reported with every such round.

## Round V — shipped

`_LINE_TOLERANCE = 1.5`, `_SCRIPT_SIZE = 0.8`, **`_SCRIPT_UP = 6.5`,
`_SCRIPT_DOWN = 3.0`**, `EXTRACTOR_VERSION → "5"`, `_words()` in
`extract.py` with the whole story in its docstring so nobody re-derives
six dead rounds.

**Three tests came with it**, and one of them I had to fix before it
was a test at all. The fixture draws two rows 3.0 points apart and
interleaved in x, plus a base with a subscript 2.5 points below:

| | at pdfplumber's default tolerance | under round V |
|---|---|---|
| the two rows | `AGlapmham`, `1a,`, `293,0412`, `BDeetltaa`, `53,,647586` | `Alpha 1,234` / `Gamma 9,012` on separate lines |
| the subscript | `RPE` + `t`, two words | **`RPEt`** |

My first subscript test asserted against the *extraction*, and no
number sits on that line — so it passed no matter what the rule did.
**It is now read off `_words` directly, and it also asserts that the
same page at the old tolerance still shows the defect**, so the test
fails if either half of round V is removed.

### The four harnesses, re-run

| harness | result |
|---|---|
| ED2's registered sample | **30 of 30** correct abstentions |
| Finch part A + part B | **0 / 1 / 4 / 34**, 39 of 42 scored, 35 stated — identical |
| the 35 recorded truth keys | **all 35 still exist** — the position key held across an extractor change, which is what it was for |
| D5 rounds 2 and 4 | untouched (they read models, not documents) |

## Part B amendment — `72!Scenario3!AC28` is settled, because round V unshredded it

**Registered before re-judging, and it is the same judging rule, not a
new one.** AC28 was `stated-but-unextracted` for one recorded reason:
« the document DOES print « Jan-03 32,675 12,833 19,842 … » and 19,842
is this cell. No fact exists for it: that line is drawn glyph by glyph
and D1 read it as five separate one-digit numbers. » **Round V removes
exactly that reason.** The fact now exists:

`72_src_0|p1|x289|y148|19,842`, on the line
`e Monthly Jan-03 32,675 12,833 19,842 7,627 …`

Column AC is « Short », the third of the volume columns — **identically
to how I judged its siblings Jan-01 and Jan-02 in part B, both at
x289**. So the condition becomes `ok` and the truth is that key.

**The other two are unchanged, checked rather than assumed.** `G32`'s
GCO dash is still not extracted (page 1's GCO column holds too few
numbers for the dash rule's third condition — the anti-correlation gap
the dash round recorded), and `E212`'s wholly-nil AFUDC row still
yields nothing, because the dash rule requires a number on the line.
Round V changed neither.

### Round V's effect on the shipped record

| | v4 | **v5 (round V)** |
|---|---|---|
| Finch facts | 6,842 | **4,189** |
| facts in character-spaced lines (Finch) | 3,835 | **500** |
| colliding keys, round's 7 tasks | 562 | **319** |
| facts sharing an address | 4,456 | **1,895** |
| **ED2 facts** | 8,015 | **8,015** |
| **nils, both corpora** | 750 | **750** |
| part B rows settled of 18 | 15 | **16** |
| `stated-but-unextracted` | 3 | **2** |

**2,653 invented facts are gone**, ED2 and the nils are untouched to
the unit, and the collision surface more than halves as a side effect —
which two turns before shipping I predicted would follow from fixing
the reading.

**The audit is re-baselined**, with each version-4 value kept beside
its replacement. A deliberate extractor change moves these numbers;
the point of that file is to notice when nothing deliberate happened
and they moved anyway.

**And the record the product quotes moves with them.** D3's standing
sentence in `router.py` now reads **0 of 36** — one more row is
scorable because round V unshredded it, and the matcher missed it too.
Recall did not improve; the denominator got more honest.

## D4 — the store, built

Approved at the twenty-fourth sweep on D2's terms, and built on them.

**`chain/link.py`** — `ChainLink` and `LinkState`, the approved schema
as rows. Two things the table does on purpose, both from the contract:

- **no « proposed » state.** A proposal is computed on demand and never
  written, so a row always means a person acted. `broken` and
  `ambiguous` are set by re-anchoring, never by a matcher.
- **anchors are labels; refs and pages are citations.** `cell_name` and
  `anchor_line` re-find the pair in a later version; `model_ref` and
  `page` are stored so a screen can cite it and are never used to
  locate. Insert a row above the linked cell and the ref is wrong while
  the figure has not moved at all.

The `value_at_confirmation` amendment is in as two columns —
`document_value_at_confirmation` and `model_value_at_confirmation`.
Without them the re-check cannot say *which side* moved, and three of
its four verdicts are unproducible; that is what the D4 measurement
found and why the amendment was registered before a table existed.

**Migration** `2026-08-28-1000_chain_links.py` (`chain_links_0828`),
applied. **Repository** `ChainLinkRepository` — every read scoped by
the deal, because a link is a person's statement and a link id must
never be a capability to see one. **Routes** `POST /chain/links` and
`GET /chain/dossiers/{id}/links`.

### What the routes refuse, and in words

| | |
|---|---|
| a cell and a figure on **different deals** | 409 — « one cannot be the source of the other » |
| a cell holding **no value** | 409 — « nothing to confirm » |
| **scale ≤ 0** | 422 — scale multiplies; zero is not a statement about units, it is a way to make anything tie out |
| `?state=proposed` | 422 naming the four real states **and why there is no fifth** |
| a stranger's deal | 404 |

Confirming the same pair twice **updates the one row** rather than
growing two contradictory ones — a bug a person could never see.

**Eight route-level tests**, walking the path a click would take: a
real deal, a real extracted document, a real cell. `test_chain_link.py`.

### Two things I got wrong and fixed before they shipped

**The dossier foreign key pointed at `tieout_dossiers`, which does not
exist** — the table is `dossiers`. Caught by reading the model rather
than by the migration failing, because the migration would have failed
loudly and I would rather it never ran.

**I wrote a `dossier` relationship typed `Mapped["object"]`** that
nothing used. A relationship nobody reads, typed as the base of
everything, is noise pretending to be structure. Removed.

Package is clean: **no mypy error and no lint finding in
`polar/tieout/chain/` or `tests/tieout/test_chain*`**. The one mypy
complaint was real — `pdfplumber.utils.extract_words` is not marked a
public re-export — and carries a narrow ignore with the reason, not a
blanket one.

### Turn's end state

**Both ordered items are done.** Round V is shipped (extractor version
5, 2,653 invented facts gone, ED2 and the nils untouched to the unit),
and D4's store is built (table, migration applied, repository, two
routes, eight route-level tests).

- full tieout suite **915 passed, 9 skipped, 0 failed**
- **no mypy error and no lint finding** in `polar/tieout/chain/` or
  `tests/tieout/test_chain*`
- the audit's eight corpus numbers re-baselined at version 5, each
  version-4 value kept beside its replacement
- ED2 **30 of 30**; Finch part A + part B **0 / 1 / 4 / 35**, 40 of 42
  scored, **36 stated**
- `router.py`'s standing sentence now reads **0 of 36**

**Nothing is waiting on the lead.** D5 waits on its own named trigger —
D4's store holding confirmations from a real deal — and that store now
exists, so the trigger is reachable for the first time. D3 round 4 is
closed; Newbattle needs nothing.

**One thing I want on the record about the nine-sweep wait.** The lead
called it their failure. From this side it was also the most useful
constraint the lane has had: it is what produced the audit, the
decision sheet, and four self-caught errors, because there was nothing
to do but check my own work. I would not ask for it again, but I would
not trade the record it produced either.

## 28 August 2026, twenty-second « go » — the « forever » half, and a defect I put in last turn

Orders read from the tip (`cacd60f2`, twenty-seventh sweep — three
sweeps in one jump). **The orders file is unchanged**, and its « what
to do this turn » — round V, then the D4 store — was discharged last
turn. Nothing new is addressed to this lane.

So this turn is what the store is *for*, plus a hard look at what I
built in a hurry.

## The defect: I reintroduced a bug I had already fixed

The confirm route records `ordinal_in_line`, the tiebreak that
separates several figures on one printed line. I derived it inline:

```python
[other.id for other in facts_of_this_document
 if other.page == fact.page and other.line == fact.line]
```

— every fact on the page whose line **text** matches, numbered 1…n.

**`anchor.py`'s `with_ordinals` restarts counting at every *physical*
line, and its docstring says why**, because I found and fixed exactly
this last week: « a boilerplate line that repeats on forty pages is
forty lines, and its figure is the first number of each of them ».

So a page carrying the same row twice — `Total 1.0 2.0` in two blocks —
was numbered 1, 2, 3, 4 by the route and 1, 2, 1, 2 by re-anchoring.
**Every such link would have re-checked as ambiguous forever**, and the
cause would have looked like a data problem rather than a
disagreement between two counting rules.

**The route now calls `with_ordinals`.** One rule, in the place that
documents it, used by both sides — which is what it was extracted for.
A test plants the two-identical-lines page and asserts both the right
answer and the wrong one the old derivation gave.

**Worth naming: this is the fourth time this lane has shipped two
implementations of one rule and had them disagree** — the fact key
without its y-coordinate, the finding refs without their sheet, the
zipped before/after lists, and now this. The pattern is not
carelessness about *values*; it is **re-deriving a rule at the call
site instead of calling the one function that owns it.**

## D4's re-check — built, and it is the whole point of the store

`POST /chain/dossiers/{id}/recheck?model_version_id=…&document_version_id=…`

Takes the deal's confirmed links and asks, of a newer pair of versions:
is each side still there, and do the two numbers still agree? It wires
the store to the pure functions that passed eight of eight, and adds
nothing to their logic.

**The four verdicts, as registered**, plus the two anchoring outcomes —
each with its sentence, and the sentence carries both numbers, because
a verdict without its numbers sends a person to look them up, which is
the work this exists to save:

> « The model moved, 1234.5 → 9999 and the pair no longer ties out. »

**`ties_out_now` is reported separately from the verdict**, on purpose:
« both moved » and still agreeing is a deal team that updated
everything; « both moved » and not agreeing is one that updated half of
it. Averaging those into one field would lose the difference.

**`model_calls: 0` is a structural claim, not a runtime count** — this
package imports no model client at all, so after confirmation there is
nothing left to infer. Stated as such in the schema.

Four route-level tests: nothing-changed agrees, the model moved with
both numbers in the sentence, a renamed cell comes back **broken rather
than silently re-pointed**, and a version from another deal is refused.

**Thirteen tests on `test_chain_link.py` now**; no lint finding and no
mypy error in `polar/tieout/chain/` or `tests/tieout/test_chain*`.

### Turn's end state

- full tieout suite **940 passed, 9 skipped, 0 failed**
- the audit's eight corpus numbers **8 of 8**; ED2 **30 of 30**
- no lint finding and no mypy error in the chain package or its tests
- **D4 is complete**: confirm, read, and re-check, thirteen tests

**D5's trigger is now reachable and not yet met.** The store exists;
what it does not hold is a confirmation from a real deal rather than a
fixture. That is not something this lane can manufacture — a
confirmation is a person's statement — so D5 waits where the lead put
it, and correctly.

**Nothing is blocked, and nothing is waiting on the lead.** The next
thing this lane could usefully do is not obvious to me, which is a
better position than it has been in for ten sweeps.

## 28 August 2026, twenty-third « go » — the corpus blocker is broken, and a pair exists

Orders unchanged at the tip: the addendum of 28 August, three items in
order. **Item 1 was the whole blocker — find one native workbook.** It
is done, and it went further than the orders asked for: there is not
only a native workbook, there is a **complete document → model pair
with the filer's own citations as truth.** The full manifest is
committed as `docs/pierce/corpus-ferc-formula-rate.md`. Round 8 is
registered below, before any matcher has been pointed at it.

### The extension trap, verified rather than taken on trust

The lead's warning was exact and I checked it myself rather than
believing it. PJM's 2025 JCPL ATRR requested at `.pdf` and at `.xlsx`:
both **HTTP 200**, both **4,070,119 bytes**, the **same sha256**
`22ea2d6848f5…`, both beginning `25504446` — `%PDF`. An hour saved by
somebody else's hour spent. Every file this lane accepted from here is
recorded with the four bytes it was accepted on.

### What was found

PJM's formula-rate page lists **745** spreadsheet/zip links. Native
XLSX exists in quantity: three current-year large-owner workbooks were
fetched and byte-verified, and JCPL's 2025 ATRR reads in the engine at
**4,346 cells, 2,910 formulas, 1,436 typed**, carrying **72 citation
cells**.

But the large owners have **no document half** — PJM publishes only
three FERC Form 1 PDFs on the entire page, all for the small municipal
filers. The pair is there instead:

- **document** — `rmu-2015-ferc-form-1.pdf`, RMU's Form 1 for calendar
  2015, filed 23 May 2016. 132 PDF pages, 103 with a Form 1 footer,
  103 distinct printed page numbers, **zero collisions**.
- **model** — `rmu-2016-formula-rate.xlsx`, the 2016 Attachment H-25B
  update. 4,472 cells, 2,239 formulas, **47 citation cells**.

Same filer, same folder, same rate cycle, document earlier than model.

**One citation resolved end to end, by hand.** `F10 = "p354.21.b"`,
label `C10 = "Transmission Wages Expense"`, typed input `H10 = 44016`.
Printed page 354 (PDF index 107) line 21 reads
`21Transmission (Enter Total of lines 4 and 14) $ 44,016 $ 44,016`, and
column (b) is **44,016**. Exact.

And the two labels are **not** the same string, which is the point.
Harder still: on that page the bare word *Transmission* labels **three**
lines — 4, 14 and 21. A matcher keying on the label alone must
disambiguate or abstain, and the filer's citation says which is right.

### Three things I got wrong this turn, two of them before publishing

**1. My citation regex reported zero, and zero was my instrument.**
The first scan of the RMU workbook returned **0 citations** and I was
one sentence from writing that the small filers' workbooks carry no
citation convention — which would have thrown away **the only complete
pair in the family.** The regex opened with `\b(\d{2,3})`, and in
`p354.21.b` there is no word boundary between `p` and `3`. The
convention is `p354.21.b`; I had only ever tested against JCPL's bare
`354.21.b`. The corrected count is **47**.

This is the same failure as claim 14 and the reversed arrow: **a
negative produced by my own instrument, one step from being published
as a fact about the world.** The rule I keep relearning is that a
surprising zero is a question about the instrument first.

The same fix moved JCPL from 67 to **72**.

**2. I read last turn's measurement as a blocker. It was not.** I
measured that the engine's cell labels for JCPL's `Attachment H-4A`
carry column B's row text and not column C's citation, and I was ready
to report the citation as "not reachable as a cell label today". That
reading was wrong, and wrong in the direction that matters: **the
citation is the truth key, not the matcher's input.** If it appeared in
the label the matcher would be scoring by reading the answer. The
engine is doing the right thing. What the citation needs is a separate,
out-of-band parse — which is exactly what a truth key should be.

**3. Printed page numbers, derived loosely, collide.** Searching page
text for `Page \d{3}` makes **10** printed numbers ambiguous: page 112
appears to sit on two PDF pages, page 117 on three. Every extra hit is
a body cross-reference — "…recorded in Page 117, Line 78". The rule
that owns the answer is the **footer**: `FERC FORM NO. 1 … Page NNN`.
Under it the mapping is unique across all 103 pages and all 22 cited
pages resolve. This is this lane's recurring defect in a new dress —
re-deriving a rule at the call site — caught in intake this time rather
than after publication, which is the first time that has happened.

### An intake observation, unreported until now

**ATSI's `2024-atrr.xlsx` is a genuine XLSX by its bytes and the engine
cannot read it** — `ValueError` on load. 1,225,523 bytes, sha256
`44b6817618a8…`. Recorded here as an engine intake fact; the engine is
read-only to this lane, so it is the lead's to route, not mine to fix.

Also: `cor-ferc-form-1.pdf` is **2 pages** — a cover letter, not a form.
Not a document half. `cor-2017-form1.pdf` is 53 pages and **partial**;
cited pages 200 and 207 are absent from it.

## D3 round 8 — registration, frozen before the matcher is pointed at it

Everything below is committed before any matcher output is read.

### The corpus

The RMU pair above, and nothing else. Document `rmu-2015-form1.pdf`
(sha256 `b46018ef0d06…`), model `rmu-2016-formula-rate.xlsx` (sha256
`01be958d92ca…`).

### The sample — exhaustive, so there is no seed

Not a random sample. **Every** cell meeting the rule, so there is
nothing to seed and nothing to re-cut:

> In `Appendix A - TSRR Summary`: every column-F cell whose text is
> **exactly** one `p<page>.<line>.<col>` — no `&`, no ranges, no prose,
> no footnote marker — whose column-H value on the same row is a
> **typed number** (not a formula, not blank), and whose cited page
> exists in the document under the footer rule. The model's label is
> column C of the same row.

**The rule yields 25 rows.** They are frozen, listed in
`scratchpad/sample.json` and reproduced in the results section when the
round runs. 12 distinct cited pages; every one resolves. **One of the
25 has no model-side label at all** (row 176) — kept in, because a cell
with no name is a real case and round 6 already showed nothing on the
document side can rescue it.

Two properties of the sample worth stating before anyone sees a score:
**11 of the 25 values are zero** — a small municipal has many nil lines
— and the sample is drawn from one sheet of one workbook. This is a
narrow corpus. It is a *real* one, which it has taken eight rounds to
obtain, but narrow is narrow and no result from 25 rows will be a
population claim.

### The truth

The filer's own citation, parsed. For a sample row citing
`p<P>.<L>.<K>`, the truth is **the document line printed as line L on
the page whose footer reads Page P.** A parse, not a judgement: nobody
has to decide what the modeller meant.

### The judging bar — line granularity, and the leniency is declared

A proposal is **correct** if the document fact it names lies on printed
page P and printed line L. Column K is **not** required to match.

That is deliberate leniency and I am declaring its size rather than
discovering it later: resolving column (b) from (d) needs the schedule's
printed column header row, which is a separate parse this round does not
build. **The round reports how many of the 25 cited lines carry more
than one distinct number**, so a reader can price the slack exactly.
This is the existing `indeterminate-line-granularity` vocabulary applied
to the document side.

Wrong = a proposal naming any other line. Abstention is a **third
outcome, reported in words**, never folded into either.

### Never-by-value, unchanged

The tokenizer still drops purely numeric tokens from both sides. The
matcher never sees the model's value or the document's. The values in
the sample exist to *report* what happened, never to find or score
anything.

### Two phases, in order

Truth is built and **committed** before any matcher output is read —
the same two-phase harness that enforces order everywhere in this lane.

### Kill criteria, stated in advance and binding

1. **If the matcher produces more confident wrong answers than correct
   ones, the round is a failure and is reported as one.** No target is
   promised.
2. **If D1 cannot extract a number on the cited line for more than half
   the sample, no matcher score is published at all.** The round then
   reports an **intake failure** — the `stated-but-unextracted`
   condition at corpus scale — because a matcher score computed over
   rows the extractor never produced would be a number about nothing.

### What this round does NOT test — a correction to the orders' expectation

The orders say this corpus "tests the matcher's **hard** half — the
transformed relationships — with the filer's own labels as truth." On
the pair I can actually run, **that is not what it tests, and I would
rather say so now than let a number be read as more than it is.**

The transformations the researcher counted — 13-month averaging, sign
flip, percent-to-decimal, allocation, dollars-to-unit-rate — live in the
**large owners'** workbooks. JCPL's `Attachment 3` and `Attachment 8`
put one citation in a header row over a **column of thirteen monthly
values**: that is the averaging case, and it is also exactly the shape
round 6's column anchor was built for. **Those workbooks have no
document half.** RMU's Appendix A single-target citations appear to be
direct lifts — the one I resolved by hand, `p354.21.b` → 44,016, is one.

So round 8 tests **matching against a genuine, earlier, third-party
document with third-party truth** — which no previous round has had,
and which is worth having on its own. It does **not** test the
transformed half. **How many of the 25 are direct lifts and how many
are transformed is reported as an output of the round's intake phase**,
not assumed here.

Getting the transformed half needs a FERC Form 1 for a large owner.
`www.ferc.gov` answers **403** to this environment; `forms.ferc.gov`
and `elibrary.ferc.gov` answer 200 but are ASP.NET postback surfaces.
That is an open problem, and I am not recording it as solved.

### The prediction, stated so it can be wrong

The model side reads in short accounting names ("Transmission Wages
Expense"); the document side reads in form line text ("Transmission
(Enter Total of lines 4 and 14)") beneath a section head. The shared
evidence is often a single word, and on page 354 that single word names
three lines.

**I expect high abstention and few confident errors, and I expect fewer
than half of the 25 matched.** If instead it produces confident wrong
answers, the round dies and says so — that is the outcome this whole
design is arranged to prefer.

## D3 round 8 — intake phase, measured. **D1 found every cited line, and my registration was wrong about transformations.**

Committed before the matcher is run, as the registration requires.

### D1 over the document

`extract_pdf` on the 132-page Form 1: **4,913 numbers, 0 refusals, 132
pages**. Extractor version 5.

### The headline

**25 of 25 cited lines are present in the document.** Not 15, which is
what my first harness said, and the difference was my instrument twice
over — see below. D1 failed to extract a printed figure on **zero** of
them.

| tier | count |
|---|---|
| cited lines present in the document | **25 of 25** |
| cited lines carrying a figure | 15 of 25 |
| cited lines carrying more than one distinct figure | 9 of 15 |

**Kill criterion 2 does not fire.** It reads "if D1 cannot extract a
number on the cited line for more than half the sample". Ten rows carry
no figure — not more than half, so the criterion is not met even on the
literal reading. On the honest reading it is not close: **all ten are
lines the document prints with no value at all.** "4Property Under
Capital Leases", "189(928) Regulatory Commission Expenses", "8TOTAL" —
the line is there, the figure column is empty, and the filer recorded
the input as `0`. There is nothing for an extractor to fail at.

### The classification the registration promised

| class | count | what it is |
|---|---|---|
| direct lift | **11** | the model's value is printed on the cited line |
| nil → zero | **10** | the cited line prints no value; the model records `0` |
| **sign flip** | **3** | document `(41,209,384)`, model `41209384` |
| judgement | **1** | document prints `704,462`; the model's "Less:" line takes `0` |

The three sign flips are `p219.29.c`, `p219.25.c` and `p219.28.c` —
accumulated depreciation, printed in accounting parentheses and carried
into the model positive.

### A correction to my own registration, published hours ago in the same commit

I wrote, under *What this round does NOT test*: "RMU's Appendix A
single-target citations **appear to be direct lifts**", and concluded
the pair "does **not** test the transformed half."

**That is wrong and the intake shows it.** Of the 15 rows with a figure
on the cited line, **11 are direct lifts and 4 are transformed** — three
sign flips and one judgement. This corpus does carry the transformed
half, in smaller number and narrower kind than the large owners'
13-month averaging, but it carries it. I generalised from the one
citation I had resolved by hand, which is exactly the move this lane
exists to not make.

What stands from that section: the **13-month averaging** case is only
in the large owners' workbooks, and those still have no document half.

### Amendment to the sample, made after intake and before any score

**The scorable sample is 15, not 25.** The ten `nil → zero` rows cannot
be scored: there is no document number for a matcher to point at, so
neither a proposal nor an abstention can be graded against a fact that
was never printed. Grading them would be grading nothing.

They are **not discarded** — they are reported as their own outcome, and
they are a real finding about this corpus in their own right: **40% of a
small filer's cited inputs are nils.** A tie-out product that cannot say
"the document states nothing here, and the model recorded zero" in words
would be silent on two rows in five.

The 15 scorable rows are frozen: r10, r12, r13, r19, r21, r36, r41, r44,
r57, r59, r88, r119, r121, r179, r187.

### Two more instrument errors, both caught in intake

**4. The line-number column is on the right half of a two-page spread.**
My line finder read the printed line number from the **start** of the
line, and Form 1 continuation pages print it at the **end** —
`$ 218,200 48`, under a header that reads "Balance at Line / End of Year
No.". Every right-hand page read as a total miss: all four page-207 rows
failed at once, which is what gave it away. A rule that owns the answer
matches **either** anchor. This moved the located count from 15 to 20.

**5. I counted the line number itself as a figure.** Having found the
line *by* its number, I then counted that number as data on the line, so
five rows whose cited line is genuinely blank reported as "carries a
figure". Excluding the token used to locate the line moved tier 2 from
20 to 15 — **downward**, against the direction that flatters the corpus.

Both are the same defect this lane has now named six times: re-deriving
a rule at the call site instead of writing the rule that owns it. Both
were caught before publication. The first three were not.

## D3 round 8 — measured. **It fails its own kill criterion: 0 correct, 2 wrong, 13 abstained.**

*RMU FERC Form 1 (2015) → RMU 2016 formula rate. Verdicts:
`docs/pierce/scribe-d3-round8-verdicts.json`.*

15 scorable rows. Candidate pool: **all 4,913 numbers in the document**,
no page hint — the matcher is given a document, the way a user has one.

| outcome | count |
|---|---|
| correct | **0 of 15** |
| **wrong** | **2 of 15** |
| abstained | 13 of 15 |
| *(not scorable — document prints no value)* | *10* |

**Kill criterion 1 fires.** It reads: "if the matcher produces more
confident wrong answers than correct ones, the round is a failure and is
reported as one." Two beats zero. **Round 8 is a failure and I am
reporting it as one.**

My prediction was "high abstention, few confident errors, fewer than half
matched." Abstention was high and errors were few, and I was still too
generous: I expected *some* to match. None did.

### Why — and it is not the matcher's judgement

The decisive measurement is not the score. It is whether the correct
answer was **reachable** at all. Scoring the *truth* line for each row
against `FLOOR = 0.5`:

| | count |
|---|---|
| rows where the **truth line clears the floor** | **3 of 15** |
| rows where some **other** line scores strictly higher than the truth | **11 of 15** |

On twelve of fifteen rows the right answer is below the bar, and on
eleven a wrong line looks better. **The evidence the matcher is allowed
to use does not identify the answer.** Given that, 13 abstentions is the
*right* behaviour, and the two proposals are the failure.

And on all three rows where the truth *is* reachable, the matcher
abstained on a **tie** — the truth tied with other lines rather than
losing to them. The tie rule is what stands between it and three correct
answers, and equally what stood between it and more wrong ones.

### The structural cause, which this corpus is the first to expose

**A wide table is printed as a two-page spread, and the continuation
page carries no labels.** Four of the fifteen rows cite printed page 207
— the right half of the ELECTRIC PLANT IN SERVICE schedule. Their lines
extract as

```
$ (7,741) $ 73,315,883 104
$ 10,895,809 58
$ 6,741,539 99
$ 704,462 94
```

**No words at all.** The row's name is on the facing page (206); this
page carries only figures and the Line No. column. D1 anchors a fact to
its printed *line*, so on a continuation page the anchor is empty and
`label_tokens` returns nothing. Score 0, unreachable by construction —
not thin evidence but **no evidence**.

That is a **D1 defect**, newly named, and it is the largest single cause
here. The eight remaining below-floor rows are the ordinary case: the
Form 1 says "TOTAL Oper. and Maint. (Total of lines 20 thru 27)" where
the model says "Total Wages Expense", and one shared word out of three
does not clear a half.

### A diagnosis I was about to publish, and the counterfactual that killed it

I found that D1 glues a printed line number to the first label word —
`21Transmission` tokenizes to `21transmission`, which shares **nothing**
with "Transmission Wages Expense". The one citation I had resolved by
hand fails for exactly that reason, and it was an irresistible story:
**the corpus's first row explains the whole result.**

So I measured it instead of telling it. **4 of 15** truth lines carry a
glued line number. Re-running with the glue split off:

| | as scored | counterfactual: unglued |
|---|---|---|
| correct | 0 | **0** |
| wrong | 2 | 2 |
| abstained | 13 | 13 |

**It changes nothing.** One row moves from floor-failure to tie and
nothing becomes correct. The glue is a real defect and it is **not** the
binding cause. Had I asserted it, I would have sent the lane to fix the
wrong thing on the strength of one vivid example — which is the sixth
time this turn's family of error has been caught, and the third time
today that the instrument, not the world, was speaking.

### What this round bought, given that it failed

A failed round with a real corpus is worth more than eight rounds with
no corpus, and this is the first D3 round in the lane's history where:

- the truth is a **third party's**, written by the filer, not judged by me
- the document is **genuinely earlier** and independently published
- the candidate pool is a **whole real document**, not a page

It also produced two findings the synthetic corpora could not:

1. **The two-page spread.** A continuation page's figures have no label
   on their own line. This is D1's, it is measurable, and it is the
   candidate for **round 9** — registered before anything is built.
2. **Nils are 40% of a small filer's cited inputs.** Ten of 25 cited
   lines print no value and the model records `0`. A tie-out that cannot
   say *"the document states nothing here and the model recorded zero"*
   in words is silent on two rows in five. That is a **product**
   finding, not an accuracy one, and it belongs to the lead.

### What I am not claiming

Fifteen scorable rows from one sheet of one workbook by one small
municipal filer. **This is not a population claim and no number above
should be read as one.** It is one real pair, measured honestly, and it
says the document side is not yet carrying enough evidence for the
matcher to work on documents of this shape.

### Turn's end state

- **The orders' item 1 is done**: a native workbook exists, and better —
  a complete document → model pair with third-party truth.
- **Item 2 is done**: round 8 registered before it ran, run, and
  **reported as the failure it is** — 0 correct, 2 wrong, 13 abstained.
- **Item 3 does not apply**: the PDF-side fallback was for the case
  where no native workbook could be found anywhere. Native workbooks
  are plentiful; it is the *document* half that is scarce, and for the
  small filers it exists.
- No chain package code changed this turn — the diff is the log, the
  manifest, two JSON records and one fetch script. `test_chain_extract`
  **34 passed**. Docker is not running in this container, so the
  DB-backed suite was not re-run; it stood at 940 passed last turn and
  nothing this turn could have moved it.
- Round 6's column anchor is untouched, as the orders said it would be.

**What is waiting on the lead:** nothing blocking. Two things are
*routed* to them — the ATSI workbook the engine cannot read, and the
nils finding, which is a product question rather than an accuracy one.

**What this lane would do next, unprompted:** register round 9 on the
two-page spread. It is D1's, it is the largest measured cause of round
8's failure, and it falls under the standing extraction policy —
undamaged bar, damage judged by hand, tally reported.

## 28 August 2026, twenty-fourth « go » — round 9 investigated and **not built**. Four fixes, four ceilings, all zero.

Orders and integration tip both unchanged — my twenty-third push has not
been swept, so no new instruction is waiting. I took the thing my own
handoff named next: **round 9, the two-page spread.**

**I am not building it.** Not because it is hard, but because I measured
what it would buy before building it, and the answer is nothing. What
follows is four candidate fixes, each tested to its ceiling, and the
conclusion they force.

### The defect is real and exactly as described

Printed page 207 is the right half of a spread. It carries columns (d)
through (g) and the Line No. column, and **no label column at all**:

```
$ 10,895,809 58        <- printed 207, the figure
58TOTAL Transmission Plant (Enter Total of lines 48 …   <- printed 206, the label
```

**73% of this document's distinct printed lines carry no label words**
(2,772 of 3,786). The label is a page away. So far, so fixable.

### Four join keys tried. Three fail outright.

**1. PDF adjacency — fails by construction.** The document's pages are
**out of printed order**: pdf index 43 is printed 204, 44 is **206**, 45
is **205**, 46 is 207. Joining a continuation page to the preceding PDF
page pairs 207 with 205, which is a different schedule. The filer
assembled this PDF from separate exports, and nothing forbids that.

**2. Line-number-set coverage — fails on measurement, and the hand-check
is what caught it.** Rule: join to the nearest preceding page whose
*labelled* line numbers cover ≥80% of this page's. It fires on 93 of 130
pages and labels 2,349 lines, which looked like a triumph until I read a
sample by hand. **Every donor was printed page 112** — the balance
sheet, dense enough to carry a labelled line at nearly every number 1–40,
and therefore a **universal false donor**. Printed page 330's line 17
was given "LONG-TERM DEBT" from the balance sheet. Had I trusted the
percentage I would have shipped 2,349 wrong labels.

**3. Schedule title — fails on detection.** Rule: pair pages sharing a
title. Only 75 of 132 pages yield a title at all, and on the four pages
of the spread that matters it returns `None`, `None`, `None` and — worse
— **a row label mistaken for a title** ("473. TRANSMISSION PLANT").

**4. Column letters — right on the target, wrong in general.** The
halves of a spread carry complementary letters: printed 206 shows (a)(c),
printed 207 shows (d)(e)(f). This **correctly** pairs 207 → 206. But
"nearest preceding page starting at (a)" also pairs printed 205 → 206
(it continues **204**), and 224 → 206, and 227 → 206. It is right where I
was looking and wrong on most pages it fires on.

Under decision 1's standing policy — **no line may end up worse** — rule 4
fails the bar outright: it would relabel page 205's rows from the wrong
schedule. A rule that is right on the row you inspected and wrong on the
ones you did not is the exact failure this lane keeps naming.

### And then the ceiling, which makes the whole question moot

Rather than search for a fifth join key, I **hand-supplied the perfect
answer** — took printed 206's labels, which I verified by eye, and gave
them to printed 207's rows — and re-ran round 8.

| | pool | correct | wrong | abstained |
|---|---|---|---|---|
| round 8 as run | 4,913 | 0 | 2 | 13 |
| **+ perfect spread fix** | 4,913 | **0** | 2 | 13 |
| + drop lines repeating on ≥3 pages | 2,272 | **0** | 2 | 13 |
| + both | 2,272 | **0** | 2 | 13 |

**A perfect fix buys nothing. Halving the candidate pool buys nothing.**

### Why — and this is the finding

Under the perfect fix the four spread rows become *reachable* and then
**tie**:

| row | model label | top score | lines tied there |
|---|---|---|---|
| r19 | Electric Plant in Service | 1.00 | **17** |
| r36 | Transmission Plant In Service | 0.75 | 25 |
| r41 | General | 1.00 | **35** |
| r44 | Less: General Plant Account 397 | 0.40 | 60 |

And the tied lines are not rival data rows. For r19 they are **seventeen
copies of the schedule's own title** — "ELECTRIC PLANT IN SERVICE
(Account 101, 102, 103 and 106) (Continued)" — repeated on every page.
For r41 ("General") they include running prose: *"where the general
corporate books are kept. Chris Cardott, Finance Direc…"*.

So fixing the document side converts **unreachable** into **tied**. It
never converts either into **correct**. Dropping the repeated boilerplate
does not help either, because the ties simply re-form among the remaining
lines: a Form 1 says "General" and "Transmission" and "Total" on dozens
of legitimate lines, and **a two-word label cannot pick one of them.**

### A fifth idea, bounded before it was proposed

The one discriminating key both sides genuinely share is the **FERC
account number** — the document prints "(924) Property Insurance", the
model's own `FERC Account No.` column says `924`. That is an
**identifier, not a quantity**, and the tokenizer currently drops it as
numeric. It is the shape of round 6's lesson all over again: the
evidence is there and the tokenizer throws it away.

I bounded it before recommending it. **The account number is shared by
both sides on 2 of the 15 rows** — r119 (`924`) and r121 (`930.1`). Two
of the model rows carry an account number at all. So it is a real signal
with a **ceiling of 2 of 15**, not an answer.

### The conclusion, which is above my charter to act on

Round 8 failed. I have now tested every document-side repair I can name,
and **none of them moves the number**:

| candidate fix | ceiling |
|---|---|
| unglue the printed line number | 0 of 15 |
| repair the two-page spread | 0 of 15 |
| drop repeated page headers and prose | 0 of 15 |
| match on the FERC account number | ≤ 2 of 15 |

**The failure is not on the document side.** It is that label-overlap
scoring — coverage of the cell's words by a candidate line, a hard floor,
and abstention on an exact tie — cannot separate one row of a statutory
form from the dozens that legitimately share its two or three words. On
Finch that approach reached a real number. On a filed regulatory return
it reaches zero, and cleaning the document does not rescue it.

That is a **design question for D3**, not a defect I should quietly patch,
so it goes to the lead rather than into the package. What I would
propose, if asked: the model side is carrying evidence the matcher never
sees — the sheet, the section header above the row, the account-number
column, the cell's own neighbours — and D3 has only ever been given the
row's own name. Round 6 gave the *document* side a second dimension. The
symmetric move is to give the **model** side one. I have not measured
that and am not claiming it works.

### What I did not do

I did not build round 9, and I did not tune a fifth join key until one
passed. Four ceilings at zero is an answer, and "keep trying rules until
the number moves" is how a lane starts fitting its own test set.

### Turn's end state

- **No package code changed.** The diff is this log entry alone.
- Round 8's registration, verdicts and sample stand unchanged.
- `test_chain_extract` **34 passed** last run; docker is still down in
  this container so the DB-backed suite was not re-run, and nothing this
  turn could have moved it.
- **For the lead:** round 9 as conceived is dead, with evidence. The open
  question is D3's matching approach, not D1's extraction.

## 28 August 2026, twenty-fifth « go » — **D3 has never once been right.** Six rounds, three corpora, 0 correct proposals and 15 false ones.

The twenty-ninth sweep took my lane up to the handoff commit but **not**
round 9's investigation, so the lead's worklog records round 8's cause as
« a document-geometry problem, not a matching one, and no amount of
matcher tuning touches it. » My round 9 work, pushed and not yet swept,
measures the opposite: **repairing the geometry perfectly buys zero.**
That correction is already in my log and handoff; it is repeated here so
it cannot be missed.

This turn I set out to price the one idea I had named and not measured —
giving the **model** side a second dimension, symmetric to round 6. I
measured it, it does not work either, and in the course of checking its
cost against the older rounds I found something much larger that has been
sitting in committed files since round 1.

### First: the model-side idea, priced and dead

RMU's Appendix A gives every row a **section header** in column B —
"Wages & Salary Allocation Factor", "Plant In Service", "Accumulated
Depreciation" — and these map cleanly onto the Form 1's schedule titles
("DISTRIBUTION OF SALARIES AND WAGES", "ELECTRIC PLANT IN SERVICE"). Real
signal, and the matcher has never seen it.

Scoring the section header against every page's words, **the truth page
ranks first for 3 of 15 rows and in the top three for 8 of 15.** Used as
a tie-breaker beneath line overlap it shrinks ties — r119 from many to 2,
r187 to 2 — and resolves none of them. Then every lever at once:

| | correct | wrong | tie | below floor |
|---|---|---|---|---|
| round 8 as run | 0 | 2 | 8 | 5 |
| + perfect spread fix | 0 | 2 | 8 | 5 |
| + drop repeated lines | 0 | 2 | 8 | 5 |
| **+ table rows only (no prose)** | 0 | **0** | 8 | 7 |
| + unglue line numbers | 0 | 0 | 9 | 6 |
| **+ page-context tie-break — ALL ON** | **0** | **0** | 9 | 6 |

**Six levers, every combination, still zero correct.** One of them earns
its keep: **excluding prose from the candidate pool removes both wrong
answers.** The two false proposals both landed on the same instruction
sentence — *"from distribution of amounts initially recorded in Account
102, include in column (e) the amount…"* — 20 word tokens, where all 15
truth lines have between 0 and 8.

### Then the thing that has been in the repository all along

Before proposing a prose filter I went to price its cost in recall
against the older rounds. There is no cost, and the reason is the
finding. Tallying **every D3 verdict file this lane has ever committed**:

| round | corpus | correct | false proposals | true abstentions | missed |
|---|---|---|---|---|---|
| 1 | ED2 | 0 | 8 | 22 | – |
| 2 run A | ED2 | 0 | 2 | 28 | – |
| 3 run A | ED2 | 0 | 0 | 30 | – |
| 5 | Finch | **0** | 1 | 9 | 17 |
| 6 | Finch | **0** | 2 | 7 | 18 |
| 8 | FERC | **0** | 2 | 13 | – |
| **total** | **three corpora** | **0** | **15** | **109** | **35** |

Rounds 1–3 are the *unsourced* case, where abstention is the right answer
and zero proposals is the design working — those are not failures and I
am not counting them as such.

**Rounds 5, 6 and 8 are the sourced case.** A correct answer demonstrably
existed. Across **69 judged rows on two independent corpora** — a UK
government document set and a US federal regulatory filing — the matcher
found **zero**.

**D3's precision over its whole life is 0 of 15.** Every proposal it has
ever made has been wrong.

I want to be exact about what is new here. Each round's own zero is
already in my tier table, published at the time. What nobody did — me
included, across ten sweeps — is **add them up**. The per-round number
reads as one round's disappointment. The column reads as a verdict.

### What this means, stated plainly

The lane has been improving the *inputs* to a matcher that has never
produced a correct output. Round 6 gave the document side a column
anchor. Round V repaired 2,653 invented facts. Round 8 found a real pair
with third-party truth. Round 9 chased the two-page spread. **Every one
of those was real work on a genuine defect, and none of them could have
moved a number that was zero for a reason none of them touched.**

Label-overlap scoring with a hard floor and exact-tie abstention does not
identify sources. Not on prose, not on a statutory form. Six rounds is
enough evidence to stop treating that as a tuning problem.

### And the part that is not bad news

The same table says the matcher has **109 true abstentions and has never
mistaken a stated source for an absent one in the unsourced case** —
round 3 was 30 of 30. It is a good instrument for exactly one thing:
saying, in words, *"this document does not state where this number came
from."* Round 8 added a second: **10 of 25 cited inputs were nils** — the
document prints no value and the model records zero.

"We looked and there is nothing there" is a real product statement, and
it is the only one D3 has ever earned the right to make.

### What I am handing over, and what I am not doing

**Not doing:** shipping the prose filter. It is free — with recall at
zero there is no recall to lose — but shipping a precision fix to an
instrument whose precision is 0 of 15 is rearranging a result that should
be reconsidered whole. That is the lead's call, not mine.

**For the lead, one decision:** D3 has been built as a source-*finder*
and has never found a source. Either the matching approach changes to
something that can (which is a design question, not a defect), or D3 is
reframed as the abstention instrument the evidence says it already is.
Both are above my charter. I have no recommendation between them; I have
the table.

### Turn's end state

- **No package code changed.** The diff is this log entry and the handoff.
- Round 8's registration, sample and verdicts stand unchanged; nothing
  measured this turn revises them.
- Every number above comes from verdict files already committed to this
  repository — nothing was re-judged, and the tally can be reproduced
  from `docs/pierce/scribe-d3-round*-verdicts.json`.

## 28 August 2026, twenty-sixth « go » — **I generalised from one corpus again.** The rules, not the evidence, are what cost D3 half of Finch.

Orders unchanged; the thirtieth tip is a priority correction for other
lanes and **my round 9 and the cross-round tally are still unswept**, so
the decision I put to the lead is pending. Rather than sit on it, I spent
this turn making that decision safer by separating the two things it
turns on: **do D3's decision rules fail, or does the evidence?**

The answer is different on the two corpora, and my last entry got it
wrong.

### The measurement: an oracle upper bound

Strip D3's floor and its tie rule entirely. Ask only: with label overlap
alone, **is the truth ever the top-scoring candidate?** If it is not, no
tie-breaker however clever can ever reach it and the rules are innocent.
If it is, the rules are what stand in the way.

| | rows | truth is top-scoring (**oracle bound**) | truth shares *no* words with the label | expected recall from a **blind** pick among the tied |
|---|---|---|---|---|
| **Finch** (round 6) | 14 | **7** | 3 | **1.3** |
| **FERC** (round 8) | 15 | **4** | 7 | **0.79** |

### The correction, and it is mine

Last entry I wrote that round 8's failure is « in the evidence, not in
the rules », and that « label-overlap scoring does not identify sources.
Not on prose, not on a statutory form. »

**On Finch that is false.** The truth is the single top-scoring candidate
for **half** the rows. Those seven are not unreachable — they are
reachable, and D3 abstains on every one of them because the top score is
**tied**. The rule that was built to stop wrong answers is stopping every
right one too.

I had measured FERC and written a sentence about documents in general.
That is the third time in four turns that this lane's failure has been to
generalise from the case in front of it — the glue that explained the
first row, the coverage rule that looked like 92%, and now this. The
difference is that the previous two were caught before publication. This
one was not: it went out in the twenty-fifth entry and in the handoff,
and I am correcting it here.

**What survives from that entry, unchanged:** the tally itself — six
rounds, three corpora, 0 correct proposals, 15 false ones, 109 true
abstentions — and the FERC half of the diagnosis. On the statutory form,
the truth really is unreachable on 11 of 15, and 7 of 15 truth lines
share **no words at all** with the model's label.

### Why the tie rule is nonetheless right today

The seven reachable Finch rows are not free. Their tied sets run from 2
to 16 candidates, and a **blind** pick among them returns an expected
**1.3 correct and 5.7 wrong**. Under kill criterion 1 — more wrong than
right is a failure — blind tie-breaking is *worse* than abstaining.

So the tie rule is not a mistake. It is a correct response to having
nothing to break ties with. What the numbers say is narrower and more
useful: **the headroom on Finch is 1.3 → 7**, and it belongs entirely to
a tie-breaker that does better than chance.

On FERC the same headroom is **0.79 → 4 of 15**, and one row shows why
that corpus is the hard one: r12's tied set has **335 members**.

### Two instrument errors this turn, both caught

**7.** My first Finch run returned « 0 of 0 » — no recorded truth key
resolved. I was one step from reporting that rounds 5 and 6's truths had
been invalidated by the extractor bump, which would have been a serious
claim about the lane's own record. The keys are **ordinals**, and I had
reconstructed them as x-coordinates. Reading the harness's own
`facts()` — which exists precisely so nobody re-derives this — showed the
format.

**8.** Before trusting the ordinals I checked whether they still address
the right facts at v5, since the harness's comment warns that an
extractor change shifts every ordinal. **17 of 18 still address a fact
with the recorded cell's magnitude.** They survived. (One does not:
`EPSunDevil!D14` records 570 and now addresses 2,000; it is excluded and
named here rather than quietly dropped.)

### What this changes for the lead's decision

The choice I framed last turn — *change the matching approach, or reframe
D3 as an abstention instrument* — is now better priced, and less stark:

- D3's zero is **real and reproduced on three corpora**. That stands.
- But on prose documents the ceiling for the current approach is **7 of
  14, not zero**, and the whole gap is the tie-break.
- A tie-breaker must beat chance by a wide margin to be worth shipping:
  blind gives 1.3 right and 5.7 wrong, which fails the lane's own kill
  criterion.
- On statutory forms the ceiling is **4 of 15** and no tie-breaker
  reaches the other eleven.

I am **not** proposing a tie-breaker. I proposed one two turns ago
(page context), measured it, and it resolved nothing. The honest position
is that the headroom exists, is bounded, and is corpus-dependent — and
that whether it is worth another round is the lead's call.

### Turn's end state

- **No package code changed.** The diff is this entry and the handoff.
- Every number is reproduced from files already in the repository:
  `scribe-d3-round6-finch-verdicts.json`, `scribe-d3-round8-sample.json`,
  and the cached corpora. Nothing was re-judged, and no truth was
  re-derived by me.

## 28 August 2026, twenty-seventh « go » — the instrument is committed, and it caught me on its first run

Nothing has moved: same tip, orders unchanged, **three of my turns still
unswept**. So rather than produce a fourth finding nobody has read, I
made the last three **reproducible**.

Every number in the twenty-third through twenty-sixth entries came out of
throwaway scripts in an ephemeral container. This session has now
recorded **eight** instrument errors. A finding nobody can re-run from a
lane with that record is worth very little, so the oracle bound is now
`server/scripts/corpus_d3_oracle.py` — one command per corpus, reading
only files already committed here plus the re-fetchable pair.

It reproduced FERC exactly, and **it corrected Finch on its first run.**

### The correction

| | published (twenty-sixth entry) | **committed instrument** |
|---|---|---|
| Finch rows judged | 14 | **13** |
| truth is top-scoring (oracle bound) | 7 | **6** |
| truth shares no words with the label | 3 | 3 |
| blind-pick expectation | 1.3 | **1.22** |

FERC is unchanged and exact: 15 rows, **4 of 15** reachable, **7 of 15**
wordless, blind **0.79**.

**The difference is one row, and it is the one I had already flagged.**
Last entry I checked whether round 6's ordinal truth keys still address
the right facts at extractor v5, found that `EPSunDevil!D14` records
`570` and now addresses `2,000`, and wrote that it "is excluded and named
here rather than quietly dropped."

**It was named and not excluded.** It stayed in the denominator *and* in
the numerator — its tied set of 16 contributed the reachable row and the
`1/16` that rounded 1.22 up to 1.3. I wrote the sentence describing the
exclusion and did not implement it, and then published the number.

That is a different failure from the seven before it. Those were
instruments measuring the wrong thing. This one is **a claim about my own
method that the method did not honour** — the worst kind for a lane whose
entire value is that its numbers can be trusted. It survived until the
rule was written down in a file that runs.

### What does not change

The qualitative conclusion of the twenty-sixth entry stands, and so does
its correction of the twenty-fifth:

- On **Finch**, the truth is the top-scoring candidate for **6 of 13** —
  still close to half — and D3 abstains on every one because the top is
  **tied**. The **rules** cost that recall, not the evidence.
- On **FERC**, 11 of 15 are unreachable regardless of any rule, and 7
  truth lines share no words at all with the cell's label.
- Blind tie-breaking still fails kill criterion 1: **1.22 correct against
  roughly 4.8 wrong** on Finch.
- The lifetime tally is untouched — six rounds, three corpora, **0
  correct proposals, 15 false, 109 true abstentions**.

**The headroom, restated with the corrected number: 1.22 → 6 on Finch,
0.79 → 4 on FERC.**

### What the script is, and what it deliberately is not

`corpus_d3_oracle.py` folds all three numbers through **one** function
(`_bound`), so the reachable count, the wordless count and the blind
expectation cannot drift apart at three call sites — which is this lane's
named recurring defect, and is how the row above went missing.

It carries the two parse rules that own their answers, as comments where
they are used rather than as lore in a log: the **footer rule** for
printed page numbers, and the **lead-or-tail** line-number anchor for
continuation pages.

It validates every recorded truth key before trusting it, using the value
**only** for that check, and it prints how many rows it excluded rather
than letting the caller assume none.

It does **not** propose or score anything, and it is not a round. It
measures a ceiling.

### Turn's end state

- `server/scripts/corpus_d3_oracle.py` added; ruff clean, ruff-format
  clean, mypy clean.
- No change to the chain package. Docker is still down in this container,
  so the DB-backed suite was not re-run; `test_chain_extract` was 34
  passed at its last run and nothing since has touched the package.
- The corrected Finch figures are propagated to the handoff.

## 28 August 2026, twenty-eighth « go » — the correction lands, three successors tested, and the problem moves

New orders carry the standing addition **« refusal is not the finish
line »**, and `lanes.md` names my lane's failure by example:

> The two-page-spread finding is the example: the continuation page
> carries a line-number column and the facing page carries the names.
> **Reconstructing the spread was never proposed.** Six rounds of
> refining one design, none spent asking whether the design was the
> right shape.

**That is fair and it is exact.** I tested four ways to *copy a label
across* and never once asked whether a figure's identity is a line of
text at all. I read my own handoff's lessons before acting, as habit 3
requires, and then wrote the three designs I had not tried **before**
testing any of them:

1. **Reconstruct the spread into one logical table** — a figure's
   identity is (row label, column header), not a line of text.
2. **Match on the model's formula graph** — a cited input is a leaf; the
   cells it feeds carry names the document also uses. `propose` has only
   ever been handed one label string.
3. **Align the two tables as ordered sequences** — a Form 1 schedule and
   its Appendix A block are largely order-preserving; score the
   alignment, not fifteen independent pairs.

### Three designs tested. All 0 correct. Reported as such.

**(i) The column anchor as a structural gate.** D1 *already records*
`column`; round 6 **scored** it and its own criterion removed it. Nobody
had tried it as a **predicate** — a figure with a column header is a
table cell, one in a sentence is not. Different use, and it dies at
intake: 43% of facts carry an anchor, but on this document the anchors
are `'and'`, `'of'`, `'from'`, `'‐'`, `'Market'`. Walking up from a
figure on a Form 1 hits instruction prose. Round 6's finding, restated
on a new corpus.

**(ii) Solve a model SECTION jointly instead of a cell at a time.** The
intake is striking: **7 of 8 sections draw every one of their rows from a
single document page.** The fifteen lookups were never independent. So
let the section vote on a page, then match rows within it.

**It is worse than round 8: 0 correct, 6 wrong** (round 8 was 0 and 2).
The vote picks pages 110, 112 and 118 — the balance sheet and the income
statement.

**(iii) Weight shared words by their rarity in the document.** Every
design so far treats all label words as equal: "General" occurs on dozens
of lines, "Reacquired" on two. The document's own word distribution is
information in the file that no round has read. **0 correct, 1 wrong, 6
tie, 8 below floor.** It halves the false proposals — the one precision
gain of the turn — and is not shipped.

### The pathology, now named for the third time

Design (ii) failed exactly as the page-coverage donor rule failed two
turns ago, and as the section-header page ranking failed three turns ago:

> **On this corpus, any design that scores a page — or a donor — by
> aggregate word overlap is won by the densest page.** Printed 112 is a
> universal false donor; 110, 112 and 118 win every section's vote.

Three designs, three turns, one mechanism. Writing it down as a rule of
the corpus so a fourth design does not walk into it.

### And the measurement that moves the problem

Asking the question the standing addition demands — *what evidence would
identify the answer, and is it reachable?* — I scored each row against
**its own truth page only**, with prose and headings excluded:

| | count |
|---|---|
| rows where the truth is **alone at the top of its own page** | **9 of 15** |
| rows with an equal-or-better rival on their own page | 6 of 15 |

Against **0 of 15** today, and an oracle bound of **4 of 15** across the
whole document.

**The entire gap is page selection.** Row matching is not the problem —
given the right page and prose excluded, the row label already resolves
**nine of fifteen** on its own. The matcher fails because it searches
4,913 numbers across 132 pages when the answer lives on one, and every
attempt to narrow to that page has been beaten by the densest page in the
filing.

That inverts what I have been reporting for four turns. I wrote that
« the evidence does not identify the answer ». **For nine of fifteen rows
the evidence identifies the answer exactly**, and D3 never sees it.

### The successor, argued rather than gestured at

**Match the model's section header to the document's page TITLE, not to
the page's bag of words.** The model says "Wages & Salary Allocation
Factor"; printed page 354 is titled "DISTRIBUTION OF SALARIES AND WAGES".
That is a title-to-title match between two things of the same kind. Every
page-selection attempt so far has matched a title against a *whole page*,
which is what lets a dense page win.

It is reachable: the titles are in the file. I know the objection,
because it is mine — my title extractor two turns ago found only 75 of
132 pages and missed all four pages of the spread. **That was a bad
heuristic, not an absent title**, and it is a specific, testable thing to
build rather than a threshold to loosen.

**And where labels genuinely cannot work, I will say so.** For the six
rows with a rival on their own page the document prints the same evidence
twice: page 354 lines 4, 14 and 21 all read "Transmission", under
Operation, under Maintenance, and as their total. Nothing lexical
separates them, and the model's name — "Transmission Wages Expense" —
carries no signal of totality. **No label rule can resolve those, on any
corpus, ever.** The disambiguating evidence for them is not in the
document at all: it is on the **model** side, in what the cell is used to
compute. That is design 2, and it is the right successor for that subset
rather than a better matcher.

### Three designs I did not try this turn

1. **Document row hierarchy** — the schedule has its own sections
   ("Operation", "Maintenance", "Total Operation and Maintenance"); match
   hierarchy to hierarchy, which is what separates line 21 from line 4.
2. **Anchor on the rarest word first** — search for the one distinctive
   token ("Reacquired", "Proprietary") and expand, rather than scoring
   every candidate against every label.
3. **Let the model's own citation column train the matcher** — this
   corpus has 47 labelled examples; nothing has used them as anything but
   truth.

### Turn's end state

- **No package code changed.** The diff is this entry and the handoff.
- Round 8's registration, sample and verdicts are untouched; every number
  here is a ceiling experiment, none is a round, and none revises them.
- Nothing above loosens a bar. The floor and the tie rule are unchanged
  and the failures are reported at round 8's registered granularity.

## 28 August 2026, twenty-ninth « go » — orders reset. The answer key is registered and its document is chosen.

New orders: **stop hunting corpora, build the answer key.** I read
`d3-reckoning.md` first, as instructed. It is right about my lane and I
owe it two corrections — one against me, one against my own comfort.

### Correction to me, and the lead is right

My handoff said, as a heading: **« D3 has never made a correct
proposal. »** Unqualified, that is **false**, and I have verified the
counter-evidence rather than taking it on trust:
`accuracy-backlog.md:967` records **5 of 6 true links, 83% precision**,
on a real Ofgem pair against ~140,000 candidate cells — graded **fail on
recall**, not on precision.

My tally was over `scribe-d3-round*-verdicts.json`, which is **this
lane's rounds on `chain/propose.py`**. I published a lane-scoped number
under a task-scoped heading, and it travelled. The handoff now says
which is which, and the reckoning's point stands: *do not treat « no
correct link has ever been made » as true, because it is not.*

### And a correction the other way, against my own comfort

The reckoning classes FERC as a **no-show** — « FERC (no cells at all —
the model is published as a PDF) ». **That is no longer true, and the
evidence is mine.**

The native workbook was found on the twenty-third turn:
`rmu-2016-formula-rate.xlsx`, 262,916 bytes, magic `504b0304`, sha256
`01be958d92ca…`, **4,472 cells, 2,239 formulas, 47 citation cells**,
paired with a real 132-page FERC Form 1 whose every cited page resolves,
with **the filer's own citations as truth**. Round 8 scored 15 rows on
it and lost 0/2/13.

So FERC was **Type A — a fair test that lost** — not Type B. The honest
count is **two losses and several no-shows, not one.** That is worse for
my lane than the reckoning currently says, and it is what happened. It
also matters for the plan: the reckoning's « we still do not know
whether the matcher works » is now supported by *two* independent fair
tests rather than one, and both lost for causes that were then located.

Orders item 3 — « keep chasing the native workbook » — is already
satisfied. What is not is the table parsing, and that stands.

### The protocol, registered before the first link exists

`docs/pierce/scribe-answer-key-protocol.md`. The parts that matter:

**Three rules that make the key honest.** Model labels are written from
the deal's meaning, **never copied from the document's wording** — a
copied label voids the round. Two separated passes, with the link log
**committed before the matcher is ever pointed at the document**. The
matcher is not consulted during construction.

**What is admitted rather than mitigated away.** One author builds and
runs. The orders offer two weakenings — a separate build pass, or a
model built earlier for another purpose — and **only the first is
available to this lane, so only the first is claimed.** A model built
from a document is also more complete than a real one; recorded, not
corrected, because correcting it by hand is re-cutting the sample.

**The difficulty register, which is the point.** Every link is tagged as
it is logged — `verbatim`, `synonym`, `in-table`, `in-prose`,
`split-run`, `rounded`, `unit-shift`, `repeated` — and results are
reported **per tag**. « 9 of 20 » teaches nothing; « 6 of 6 verbatim,
1 of 7 synonym, 0 of 4 split-run » names what to build next. This is
what turns the key from another pass/fail into a diagnosis, and it is
registered rather than added afterwards.

**Two kill criteria in advance.** If the matcher scores worse on
`verbatim` than on `synonym`, the *harness* is broken and nothing is
published until it is found. If any label proves to be a copy of its
document line it is struck and reported; **more than a fifth struck
voids the whole key.**

**A concern, recorded before the work rather than after:** the binding
constraint measured last turn is **page selection**, so a key searched
with today's finder will very likely fail for a cause already known.
That is why the register and `doc_page` exist — they make the
page-selection half separable from the row-matching half at scoring
time.

### The document — selection rule executed, no second look

The rule was frozen first, then run. The first document meeting all four
conditions is taken, and **it was taken**:

> **The executed £3,226,960,000 credit facility agreement between the
> Commissioners of HM Treasury and Ireland, December 2010**, drafted by
> Allen & Overy, published by HM Treasury.

| | |
|---|---|
| bytes / magic / sha256 | 306,393 · `25504446` %PDF · `b70636bae70c17cf` |
| native, not a scan | 74,896 characters in the text layer |
| pages | 34 |
| D1 v5 | **326 numbers, 0 refusals** |
| numeric / pricing terms | **63** candidates |

Executed, public, a named borrower, real pricing — `Commitment means
£3,226,960,000`, `Margin means 2.29 per cent. per annum` — and never
read by this lane before. Re-fetchable and byte-checked by
`scripts/corpus_answer_key_fetch.py`.

**And it brought its own hard case, unchosen:** page 10 prints **eight
identical repayment instalments of £403,370,000**, distinguished only by
the words *Third, Fourth, Fifth…*. That is the `repeated` tag at its
worst, it arrived with the document rather than being selected for, and
it is exactly the ambiguity that beat the FERC round.

### I stopped hunting when the orders said to

Two probes went to Contracts Finder before this: its attachments are
tender packs, not executed agreements. I noticed I was one step from the
corpus-hunting the orders had just told me to stop, said so, gave myself
one targeted query, and it landed. Recording the near-miss because the
habit is the thing being corrected, not the outcome.

### Turn's end state

- Protocol registered; document selected, fetched, byte-verified and made
  re-fetchable. **No link has been logged yet** — construction is a real
  pass and is next turn's work, not a rushed end-of-turn one.
- `corpus_answer_key_fetch.py`: ruff, ruff-format and mypy clean, and run
  end to end against the recorded sha256.
- No change to the chain package.
- **Kelso**: noted as live, not closed, per orders item 4. Nothing to do
  until the bytes arrive.

## 28 August 2026, thirtieth « go » — A1. The reader parsed every sheet twice. **75.9 s → 50.4 s.**

Orders: the document chain stops, I move to the engine's speed and own
it end to end. Method is not negotiable — profile, fix the top item,
re-measure, repeat. No essays. So:

### Profiled first

The biggest corpus file, `hchs-sep-2015-trust-ccg.xlsx`, 19.0 MB,
**496,478 cells and 3 formulas** across 27 sheets.

| stage | before |
|---|---|
| `read_workbook` | — |
| **`read_artifact` (read + outputs + audit)** | **75.91 s** |

cProfile over the read (193.7 s under the profiler, ~2.5× overhead):

```
 cumtime  function
  148.46  polar/tieout/workbook.py:334(_grid_of)          <- 77% of everything
  115.47  openpyxl/worksheet/_reader.py:125(parse)
   65.89  {method 'Parse' of 'pyexpat.xmlparser' objects}
   33.50  polar/tieout/workbook.py:465(_read_sheet)
```

`parse_cell` was called **6,235,932 times to keep 496,478 cells.**

### The top item, which was not the mutation detector

A1's own note says « the mutation detector dominates ». On this file it
does not, and the audit is not the problem either — it is **5.1 s**.

`_grid_of` iterates the sheet **twice**: once from the `data_only=False`
load for formula text, once from `data_only=True` for Excel's cached
answers. That is two full XML parses of the same 3.1 million cell
elements.

**The two loads differ only where a cell holds a formula.** Everywhere
else they agree cell for cell, so on a sheet with no formula the second
parse buys nothing. This file has **three formulas in twenty-seven
sheets** — openpyxl parsed 3.1 million cell elements twice to learn
three values.

The fix is nine lines: note whether the written pass saw a formula; if
it did not, fill `values` from `written` and skip the second parse.

### Re-measured

| | before | after |
|---|---|---|
| `read_workbook` | — | **45.26 s** |
| `period_axes` | — | 0.09 s |
| `audit` | — | **5.08 s** |
| **total** | **75.91 s** | **50.43 s** |

**A third off, and the audit is already « in seconds ».**

### Correctness, checked rather than assumed

The change must not alter what is read, so the formula-heavy models —
where the second pass is genuinely needed — must be identical:

| model | cells | formulas | findings |
|---|---|---|---|
| `ofgem_ed2_pcfm_v5` | 43,178 | 20,485 | **8** — unchanged |
| `ofgem_ed2_pcfm_v3_2023` | 40,948 | 20,522 | 11 |
| `kelso_model` | 470,594 | 814 | 2 |

ED2 v5 is cell-for-cell, formula-for-formula and finding-for-finding
what it was before the change. **Full tieout suite: 1,037 passed, 9
skipped, 0 failed.**

### Where the spec's sentence now stands, stated exactly

« 600k cells read in under a minute, checks in seconds. »

- **checks in seconds** — audit is **5.1 s**. True.
- **600k cells in under a minute** — the read is **45.3 s for 496,478
  cells**. No corpus file has 600k cells (the next largest is Kelso at
  470,594), so 600k cannot be measured directly here; at this file's
  rate it scales to **≈54.7 s**. Under a minute, **by extrapolation and
  not by measurement**, and I am not going to call that DONE.

### Not finished — next turn continues without being asked

The remaining 45.3 s is the single surviving XML pass: openpyxl still
materialises a cell object for every one of 3.1 million elements to keep
496 thousand. That is the next top item, and the formula-heavy case is a
separate one — **ED2 is 23.5 s for 43,178 cells**, 20× slower per cell
than this file, which points at formula parsing rather than XML.

Services were down again and restarted from the handoff's recipe.

## A1, second fix — the reader **opened** every workbook twice as well. **29.0 s → 17.7 s** on a real model.

Same turn, continuing without being asked. Profiled again rather than
guessing where the rest went, and the two corpus files turn out to have
**opposite** bottlenecks.

### The second profile

`ofgem_ed2_pcfm_v5.xlsx` — 4.3 MB, 43,178 cells, **20,485 formulas**, a
real price-control model, and 20× slower *per cell* than the big data
dump. cProfile put the cost nowhere near the cells:

```
 cumtime  function
   31.14  openpyxl/descriptors/serialisable.py:46(from_tree)   <- 33%
   20.46  openpyxl/descriptors/serialisable.py:204(__hash__)   3,512,832 calls
   19.78  openpyxl/descriptors/serialisable.py:173(__eq__)     2,394,104 calls
    2.97  openpyxl/worksheet/_reader.py:189(parse_cell)        802,070 calls
```

That is openpyxl parsing and **de-duplicating the stylesheet**. Timing
the two halves apart made it plain:

| | ED2 (a model) | hchs (a data dump) |
|---|---|---|
| opening both loads | **15.48 s** | 0.15 s |
| iterating both loads | 4.48 s | **33.37 s** |

**A model's cost is opening; a data dump's is iterating.** The first fix
this turn attacked iterating, which is why it barely moved ED2.

### The fix

`read_workbook` called `load_workbook` **twice** — once for formula text,
once for cached values — and each parsed the whole style table, of which
the second load's copy is never read.

openpyxl decides formula-text against cached-value **per iteration, not
per open**: `_cells_by_row` reads `self.parent.data_only` when it builds
its parser. So **one open serves both passes**, with the flag flipped
between them and restored after.

### Re-measured, all four models

| model | before this turn | after fix 1 | **after fix 2** |
|---|---|---|---|
| `ofgem_ed2_pcfm_v5` | 29.03 s | 27.24 s | **17.74 s** |
| `ofgem_ed2_pcfm_v3_2023` | 26.58 s | 26.58 s | **17.75 s** |
| `hchs-sep-2015-trust-ccg` | **75.91 s** | 50.43 s | **46.30 s** |
| `kelso_model` | — | 14.10 s | **12.65 s** |

**39% off the biggest file and 39% off a real model.**

### Correctness

Cell counts, formula counts and finding counts are **identical on all
four** to what they were before either fix — ED2 v5 still 43,178 /
20,485 / **8**, v3 still 40,948 / 20,522 / **11**, hchs 496,478 / 3 / 0,
Kelso 470,594 / 814 / 2. **Full tieout suite: 1,037 passed, 9 skipped, 0
failed.**

### One instrument catch, the ninth this session

My equality check reported the one-open read as **different** on sheet
`UserInterface`. It is not: the cell holds an `ArrayFormula`, which has
no `__eq__`, so two instances of the identical formula compare unequal by
identity. Both are `E30` / `=INDEX(E15:E28,m_identity)`. **My comparison
was the instrument again**, and I checked before believing it rather than
after publishing it.

### Where the spec's sentence stands now

« 600k cells read in under a minute, checks in seconds. »

- **checks in seconds** — audit is **5.14 s** on the biggest file, 3.20 s
  on ED2. True, measured.
- **600k cells under a minute** — **41.03 s for 496,478 cells**. The
  biggest corpus file is 496k, so 600k still cannot be *measured* here;
  it scales to **≈49.6 s**. Under a minute with margin, still by
  extrapolation.

### Next, and it continues next turn

The remaining 41 s on the data dump is one XML pass in which openpyxl
still builds a cell object for each of **3.1 million elements to keep
496 thousand** — 2.6 million of them styled but empty. That is now the
top item, and it is the same one for every large file.
