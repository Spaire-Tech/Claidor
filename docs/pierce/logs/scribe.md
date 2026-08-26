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
