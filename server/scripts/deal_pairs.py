"""Closed-deal pairs: the contract and the model built from it.

**The gap this closes.** `model_corpus.py` fetches regulator models, and
`docs/pierce/closed-deal-ground-truth.md` records what we learned from
them: the documents are written *from* the model, so the cells a document
restates are calculated ones, and the typed cells — thousands of raw
machine inputs — appear in no narrative anywhere. Ninety samples, zero
hits. That corpus can prove the linker stays quiet. It cannot prove the
linker finds anything, because there is nothing there to find.

It also records the first attempt at a real pair — Dumfries & Galloway
Royal Infirmary — and the conclusion drawn from it: that SFT's redaction
regime removes precisely the figures a model holds. **That conclusion was
drawn from one document and it is too strong.** DGRI is an NPD deal from
2015. The hub DBFM agreements redact differently, and they differ from
each other. Of fifteen sampled here, seven state the Annual Service
Payment at Base Date in the clear, in the appendix where the payment
mechanism keeps it, and three of those also state the indexation factor.

Two pairs have been carried end to end by hand, and both hold:

    Levenmouth Academy       PA Sched Part 14 App 1  ASPo £3,741,000
                             model Databook!D39      Unitary Charge 3.741 £m
                             PA Sched Part 14 §2     "indexation factor being 22%"
                             model InpC!F100         Gearing of Unitary
                                                     Charge to Indexation 0.22
    Oban and Campbeltown     PA Sched Part 14 App 1  ASPo £4,912,193
                             model Dashboard!D11     4912193.067781124

Both are the shape the product claims and the regulator corpus could not
supply: a figure a person typed into a model, stated in the document it
was typed from, under different words, at a different scale.

**The answer key nobody had to write.** Several of these models ship the
deal team's own reconciliation sheet — `Gaps`, `DBFM Gaps`, `Credit
Agreement Gaps`, `Gaps List` — mapping a named clause to the model figure
that fills it. Kelso's `Gaps List` is seventy-three rows of
« Schedule 1 → Base Credit Facility Commitment → 21,461,602.52 ».
That is a hand-built document↔cell ground truth, authored at financial
close by the adviser, not by us. Where the document is published it is
directly gradeable; where it is not (the Credit Agreement and the Loan
Note Instrument are never published) it still specifies what a true link
looks like on a real deal.

    uv run python -m scripts.deal_pairs           # fetch what is reachable
    uv run python -m scripts.deal_pairs --list    # just print the pairs

Files land in `scripts/corpus_sft/`, which is git-ignored. SFT's terms
allow personal-use download only: cite and link, never republish.

**Three limitations, stated here rather than discovered later.**

*The models are published as values.* Levenmouth carries 224 formulas
against 428,007 numeric cells; Elgin and Oban carry none at all. Excel's
own typed/calculated distinction is therefore gone, and a run over one of
these files cannot use it as a gate. Treat the input sheets (`InpC`,
`InpM`, `InpSA`, `input*`, `Interface*`, `Databook`) as the typed region
by convention, and say so in any number that gets published. Kelso and
Newbattle are the least stripped at 875 and 616 formulas.

*The agreements are scanned and OCR'd.* There is a text layer and it is
searchable, but it reads « Contract iVIonth », « sample chec!<s »,
« OBLIGATiONS ». Digits survive better than letters, which is the right
way round for us, but a label match against OCR noise is a real failure
mode this corpus will exercise whether we want it to or not.

*The portal's certificate is expired.* `contracts.scottishfuturestrust.org.uk`
serves an expired certificate, so the agreement PDFs behind
`/document/N/download` do not fetch from a checking client — a browser
gets there past a warning. The models are on a plain S3 bucket with a
valid certificate and fetch normally, which is why this script fetches
models and only records agreement URLs. Never work around it by turning
verification off.
"""

import sys
from pathlib import Path
from urllib.parse import unquote

HERE = Path(__file__).parent / "corpus_sft"

S3 = "https://scottisfuturestrust.s3.eu-west-2.amazonaws.com/"
PORTAL = "https://contracts.scottishfuturestrust.org.uk/document/{}/download"

#: Each pair is (project, model filename on S3, agreement document id, note).
#: `note` records what the agreement states in the clear — the thing that
#: makes the pair worth fetching at all. Verified by reading the agreement
#: text, not by assuming the redaction regime is uniform.
PAIRS: list[tuple[str, str, int, str]] = [
    (
        "Levenmouth Academy",
        "Levenmouth+Academy+Financial+Model.xlsm",
        50,
        "ASPo £3,741,000 and indexation factor 22%, both carried to the "
        "model by hand and confirmed. Ships a `Gaps` sheet citing the "
        "Project Agreement, the Facilities Agreement and the Loan Note "
        "Instrument clause by clause. Start here.",
    ),
    (
        "Oban and Campbeltown High Schools",
        "Oban+and+Campbeltown+High+Schools+Financial+Model.xlsm",
        58,
        "ASPo £4,912,193, confirmed against Dashboard!D11 to the penny. "
        "The `Model Log` sheet carries four prior versions with the ASP "
        "moving between them — a drift fixture as well as a link one.",
    ),
    (
        "Baldragon Academy",
        "Baldragon+Academy+Financial+Model.xlsm",
        15,
        "ASPo £2,578,000 and indexation factor 20%. Not yet carried "
        "through by hand.",
    ),
    (
        "Our Lady & St Patrick's High School",
        "Our+Lady+and+St+Patricks+Primary+School+Financial+Model.xlsb",
        60,
        "ASPo £2,335,500 and indexation factor 17.39%. NOTE the model is "
        "filed under « Primary School » and the agreement under « High "
        "School » — confirm they are one deal before grading anything on "
        "it. `.xlsb`, so openpyxl will not open it.",
    ),
    (
        "Anderson High School",
        "Anderson+High+School+Financial+Model.xlsm",
        7,
        "ASPo £3,682,174. Indexation factor redacted.",
    ),
    (
        "South of the City Academy",
        "South+of+the+City+Academy+Financial+Model.xlsm",
        66,
        "ASPo £3,739,195. Indexation factor redacted.",
    ),
    (
        "Bertha Park High School",
        "Copy+of+Bertha+Park++-+28+September+FINAL.HC.xlsm",
        20,
        "Indexation factor 25%. ASPo redacted.",
    ),
    (
        "Forfar Community Campus",
        "Forfar+Community+Campus+Financial+Model.xlsm",
        27,
        "Indexation factor 19%. ASPo redacted.",
    ),
    (
        "Kelso High School",
        "Kelso+High+School+Financial+Model.xlsm",
        45,
        "The agreement is redacted down to the Completion Date, so this is "
        "not a grading pair. Fetched for its three reconciliation sheets — "
        "`Credit Agreement Gaps`, `DBFM Gaps`, `Gaps List` — which name "
        "the clause behind each figure, margin of 3.349% included.",
    ),
    (
        "Newbattle Centre",
        "Newbattle+Centre+Financial+Model.xlsm",
        76,
        "Same three reconciliation sheets as Kelso, and the least stripped "
        "model in the set after it. Agreement not yet sampled.",
    ),
]

#: Agreements published on the S3 bucket rather than behind the portal,
#: so they fetch from a client that checks certificates. None of them
#: pairs with a published model — recorded because « the certificate
#: stopped us » and « it is not there » are different sentences.
AGREEMENTS_ON_S3: list[tuple[str, str]] = [
    ("Angus and Hub East Central", "Angus+and+Hub+East+Central+Project+Agreement+Redacted+Final.pdf"),
    ("Inverurie Community Campus", "Inverurie+Community+Campus+-+DBFM+Agreement_Redacted.pdf"),
    ("Jedburgh Intergenerational Campus", "Jedburgh+DBFM+Project+Agreement+Redacted+Final.pdf"),
    ("South Queensferry High School", "South+Queensferry+High+School+DBFM+Project+Agreement+Redacted+Final.pdf"),
    ("Stobhill Greenock Clydebank", "Stobhill+Greenock+Clydebank+Project+Agreement+Redacted+Final.pdf"),
]


def fetch(name: str, url: str) -> tuple[bool, str]:
    import urllib.error
    import urllib.request

    target = HERE / name
    if target.exists():
        return True, f"already here, {target.stat().st_size:,} bytes"

    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; Pierce corpus)"}
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = response.read()
    except (urllib.error.URLError, OSError, TimeoutError) as problem:
        return False, str(problem)[:90]

    # An S3 access-denied page is XML and an error page is HTML; either
    # one saved under an `.xlsm` name fails four steps later with a
    # confusing message. Refuse it here instead.
    if not payload.startswith((b"PK", b"\xd0\xcf\x11\xe0", b"%PDF")):
        return False, f"not a workbook or PDF — got {payload[:40]!r}"

    target.write_bytes(payload)
    return True, f"{len(payload):,} bytes"


def main() -> int:
    if "--list" in sys.argv:
        for project, model, doc_id, why in PAIRS:
            print(f"\n{project}")
            print(f"  model     {unquote(S3 + model)}")
            print(f"  agreement {PORTAL.format(doc_id)}")
            print(f"  {why}")
        print("\nAgreements on S3, no published model:")
        for project, pdf in AGREEMENTS_ON_S3:
            print(f"  {project}\n    {unquote(S3 + pdf)}")
        return 0

    HERE.mkdir(parents=True, exist_ok=True)
    got = 0
    for project, model, doc_id, _ in PAIRS:
        filename = unquote(model).replace(" ", "_")
        ok, detail = fetch(filename, S3 + model)
        print(f"[{' ok ' if ok else 'fail'}] {project}\n        {detail}")
        print(f"        agreement (browser only): {PORTAL.format(doc_id)}")
        got += ok

    for project, pdf in AGREEMENTS_ON_S3:
        filename = unquote(pdf).replace(" ", "_")
        ok, detail = fetch(filename, S3 + pdf)
        print(f"[{' ok ' if ok else 'fail'}] {project} (agreement only)\n        {detail}")
        got += ok

    total = len(PAIRS) + len(AGREEMENTS_ON_S3)
    print(f"\n{got} of {total} in {HERE}")
    print("Ground truth and caveats: docs/pierce/deal-pair-corpus.md")
    return 0 if got else 1


if __name__ == "__main__":
    raise SystemExit(main())
