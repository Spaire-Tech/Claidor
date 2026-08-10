"""Graded eval for the cross-document check — recall, and what it invents.

    CLAIDOR_ENV=development uv run python -m scripts.matter_eval

Strictly separate from pytest, for the same reason `librarian_eval.py` is:
whether the checks are *useful* and whether the code is *correct* are
different numbers and are never reported together. Everything under
`tests/` runs against a scripted model and proves the plumbing. This runs
against a real one and is the only thing that says anything about the
answers.

## The bundle

Four documents in one transaction, in `matter_eval_data/`. I wrote them, so
the ground truth is known rather than judged:

**Three real conflicts, planted.**

| | |
|---|---|
| Liability cap | MSA says USD 1,800,000; LOI says USD 2,500,000 |
| Notice period | MSA says thirty days; Side Letter says sixty |
| Governing law | MSA says England and Wales; Side Letter says New York |

**Four distractors, planted, which must not be reported.**

- The completion date, stated *identically* in the MSA and the LOI.
- The fee, USD 40,000,000, stated identically in the MSA and the minutes.
- The forty-five day payment term, which appears once and so has nothing to
  disagree with.
- Two figures about different things — the USD 40M fee and the USD 1.8M cap
  — which a check that pattern-matched on « two numbers » would pair.

The notice-period conflict is deliberately the hard one. The Side Letter
says « notwithstanding clause 10.1, and for the Pilot Period only », which
is an explicit narrowing rather than a contradiction. A strict reading says
it is not a conflict at all; a practical one says a lawyer wants to see it.
It is scored as **either answer being acceptable** and reported separately,
because grading a judgement call as a failure teaches the wrong thing.

## What is scored

**recall** — planted conflicts found, out of three.

**extras** — everything else reported. Not scored automatically: I read
them. An extra is not necessarily wrong, and an eval that auto-marks
unexpected findings as errors would train the check to be timid, which for
this product is the wrong direction to be wrong in.

**gate_drops** — how many of the model's proposals the code threw out, and
why. A check whose gates never fire is a check whose gates are not working.
"""

import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

HERE = Path(__file__).parent
DATA = HERE / "matter_eval_data"
RUNS = DATA / "runs"

#: What must be found. A conflict counts as found when a reported pair
#: quotes both of these, in either order — matched on the text of the
#: quotes rather than on the model's own wording of the subject, which it
#: is free to phrase however it likes.
PLANTED: list[dict[str, Any]] = [
    {
        "name": "liability cap",
        "left": "1,800,000",
        "right": "2,500,000",
        "hard": False,
    },
    {
        "name": "governing law",
        "left": "England and Wales",
        "right": "New York",
        "hard": False,
    },
    {
        "name": "notice period",
        "left": "thirty (30) days",
        "right": "sixty (60) days",
        # Explicitly narrowed by "notwithstanding ... for the Pilot Period
        # only". Either answer is defensible; reported, never failed.
        "hard": True,
    },
]

DOCUMENTS = [
    ("Master Services Agreement", "msa.txt"),
    ("Letter of Intent", "loi.txt"),
    ("Side Letter", "side_letter.txt"),
    ("Board Minutes", "board_minutes.txt"),
]


def load_documents() -> list[Any]:
    from polar.models.dossier import DossierDocument

    documents = []
    for index, (title, filename) in enumerate(DOCUMENTS):
        documents.append(
            DossierDocument(
                id=uuid4(),
                dossier_id=uuid4(),
                file_id=uuid4(),
                uploaded_by_id=uuid4(),
                title=title,
                piece_number=index + 1,
                extracted_text=(DATA / filename).read_text(encoding="utf-8"),
            )
        )
    return documents


def matches(group: Any, planted: dict[str, Any]) -> bool:
    """Does this reported group quote both sides of a planted conflict?"""
    quotes = " ".join(position.quote for position in group.positions)
    return planted["left"] in quotes and planted["right"] in quotes


async def main() -> int:
    from polar.config import settings
    from polar.dossier.crosscheck import cross_check
    from polar.dossier.agent.service import build_client

    if not settings.ANTHROPIC_API_KEY:
        print("No ANTHROPIC_API_KEY. Nothing to evaluate.", file=sys.stderr)
        return 2

    documents = load_documents()
    conflicts, report = await cross_check(build_client(), documents)

    found: list[str] = []
    missed: list[str] = []
    matched_indices: set[int] = set()

    for planted in PLANTED:
        hit = next(
            (
                index
                for index, conflict in enumerate(conflicts)
                if matches(conflict, planted)
            ),
            None,
        )
        if hit is None:
            missed.append(planted["name"])
        else:
            found.append(planted["name"])
            matched_indices.add(hit)

    extras = [
        conflicts[index]
        for index in range(len(conflicts))
        if index not in matched_indices
    ]

    required = [p for p in PLANTED if not p["hard"]]
    required_found = [p["name"] for p in required if p["name"] in found]

    print()
    print("=" * 72)
    print("CROSS-DOCUMENT CHECK — graded run")
    print("=" * 72)
    print(report.summary())
    print()
    print(f"recall (required)  {len(required_found)}/{len(required)}  {required_found}")
    print(f"judgement call     {'found' if 'notice period' in found else 'not found'}"
          "  (notice period — narrowed by the Side Letter; either is defensible)")
    if missed:
        print(f"MISSED             {missed}")
    print(f"extras             {len(extras)}")
    print()

    if extras:
        print("-" * 72)
        print("EXTRAS — read these; an unexpected finding is not automatically wrong")
        print("-" * 72)
        for group in extras:
            print(f"\n  {group.subject}  ({group.pairs} pair(s) merged)")
            print(f"  {group.note}")
            for position in group.positions:
                print(f"    {position.document_title}: « {position.quote} »")
        print()

    print("-" * 72)
    print("GATES — a check whose gates never fire is a check not being checked")
    print("-" * 72)
    print(f"  proposed        {report.proposed}")
    print(f"  unquotable      {report.unquotable}")
    print(f"  invented        {report.invented}")
    print(f"  same document   {report.same_document}")
    print(f"  kept (pairs)    {report.kept}")
    print(f"  merged into     {len(conflicts)} finding(s)")
    if report.failures:
        print(f"  failures        {report.failures}")
    print()

    RUNS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H-%M-%SZ")
    (RUNS / f"{stamp}.json").write_text(
        json.dumps(
            {
                "when": stamp,
                "required_found": required_found,
                "missed": missed,
                "hard_found": "notice period" in found,
                "extras": [
                    {
                        "subject": group.subject,
                        "note": group.note,
                        "positions": [
                            {
                                "document": position.document_title,
                                "quote": position.quote,
                            }
                            for position in group.positions
                        ],
                    }
                    for group in extras
                ],
                "report": {
                    "documents_read": report.documents_read,
                    "commitments": report.commitments,
                    "proposed": report.proposed,
                    "kept": report.kept,
                    "unquotable": report.unquotable,
                    "invented": report.invented,
                    "same_document": report.same_document,
                    "input_tokens": report.input_tokens,
                    "output_tokens": report.output_tokens,
                },
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Archived to {RUNS / f'{stamp}.json'}")

    # A missed *required* conflict is a real failure; the judgement call is
    # not, and extras are for reading rather than failing on.
    return 0 if len(required_found) == len(required) else 1


if __name__ == "__main__":
    os.environ.setdefault("CLAIDOR_ENV", "development")
    raise SystemExit(asyncio.run(main()))
