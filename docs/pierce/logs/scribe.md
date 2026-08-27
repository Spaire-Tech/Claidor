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
different line** — and **four of the twenty recorded part-A truths were
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
