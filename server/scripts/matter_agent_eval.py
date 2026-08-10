"""Graded eval for the matter agent — does it use its tools, and does it lie.

    CLAIDOR_ENV=development uv run python -m scripts.matter_agent_eval

The loop's unit tests drive a scripted model and prove the plumbing: every
call lands in the trace, the budget is honoured, a failure invents no
answer. None of that says whether Claude *uses* four tools sensibly on a
real bundle, which is the only question that matters for the product.

So this runs three prompts against the real API over the same four
documents `matter_eval.py` uses, plus one deliberately unreadable file, and
scores what can be scored deterministically.

## What is checked

**tools_used** — did it call anything at all. An agent that answers a
question about a bundle it never opened is the failure mode this whole
design exists to prevent, and it is invisible without the trace.

**opened_with_list** — `list_documents` first. Anything else means it
guessed at what the matter contains.

**used_the_checker** — for the prompt about defined terms, did it call
`check_document` rather than judge by eye. The check is arithmetic and the
agent's eye is not, and the prompt says so.

**quotes_are_real** — every span the answer presents as a quotation, in a
markdown blockquote or backticks, must appear either in a document or in
what a tool said back. Deterministic: the words are there or they are not.

Straight double quotes are deliberately not counted, and that is the
correction rather than a shortcut. The first version matched `"..."` and
reported eleven invented quotes in a single answer. Every one was an
artefact of the measurement: a straight quote mark serves for quotation,
for nested quotation and for plain emphasis, so the regex paired the
closing mark of one span with the opening mark of the next and produced
fragments that were in no document because they were never quotations.
The second thing it had wrong was the corpus — an answer quoting the
checker's own note is quoting something real that appears in no document.

Both are worth stating because the first run "found" thirteen inventions
and there were none. A measurement that produces a number nobody checks is
worse than no measurement.

**admits_the_scan** — the matter contains one file with no extractable
text. An answer that says « no indemnity in this matter » rather than
« none in the files I could read » is overclaiming, and the difference is
the whole product.

The answers themselves are printed for reading. An eval that graded prose
automatically would be grading a second model's opinion, which is not
evidence.
"""

import asyncio
import json
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

HERE = Path(__file__).parent
DATA = HERE / "matter_eval_data"
RUNS = DATA / "agent_runs"

DOCUMENTS = [
    ("Master Services Agreement", "msa.txt"),
    ("Letter of Intent", "loi.txt"),
    ("Side Letter", "side_letter.txt"),
    ("Board Minutes", "board_minutes.txt"),
]

PROMPTS: list[dict[str, Any]] = [
    {
        "name": "the cap",
        "prompt": (
            "What is the cap on the Supplier's liability in this matter, and "
            "do the documents agree about it?"
        ),
        "expect_check": False,
        # Both figures should appear: the answer is that they disagree.
        "must_mention": ["1,800,000", "2,500,000"],
    },
    {
        "name": "defined terms",
        "prompt": (
            "Are the defined terms in the Master Services Agreement used "
            "consistently? Use the document checker rather than judging by eye."
        ),
        "expect_check": True,
        "must_mention": [],
    },
    {
        "name": "the scan",
        "prompt": "Is there an indemnity anywhere in this matter?",
        "expect_check": False,
        "must_mention": [],
        # The answer must be qualified: one file could not be read.
        "expect_qualification": True,
    },
]

#: Words that qualify an answer to the whole matter. Any one of them is
#: enough — the point is that the answer does not claim to cover files it
#: could not open.
QUALIFIERS = [
    "could not",
    "cannot",
    "not machine-readable",
    "unreadable",
    "scan",
    "no text",
    "unable to read",
    "not readable",
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
    # The file the machine cannot read. Every prompt about the matter as a
    # whole has to survive its presence.
    documents.append(
        DossierDocument(
            id=uuid4(),
            dossier_id=uuid4(),
            file_id=uuid4(),
            uploaded_by_id=uuid4(),
            title="Disclosure Letter (scanned)",
            piece_number=5,
            extracted_text=None,
        )
    )
    return documents


#: Markdown blockquote lines and backtick spans. Deliberately NOT straight
#: double quotes.
#:
#: The first version of this matched `"..."` and reported eleven invented
#: quotes in one answer. Every one was an artefact: a straight quote mark
#: is used for real quotation, for nested quotation, and for ordinary
#: emphasis, so the regex paired the *closing* mark of one span with the
#: *opening* mark of the next and produced fragments that were in no
#: document because they were never quotations at all.
#:
#: Blockquotes and backticks are unambiguous — they have distinct open and
#: close, or a distinct line prefix — so what comes out is what the model
#: actually presented as the document's words.
BLOCKQUOTE = re.compile(r"^\s*>\s?(.+)$", re.MULTILINE)
BACKTICKED = re.compile(r"`([^`\n]{25,400})`")


def unreal_quotes(answer: str, corpus: str) -> list[str]:
    """Quoted spans in the answer that came from nowhere it could have read.

    The corpus here is the documents *and* the tool results, because the
    tools speak too: an answer quoting the checker's own note — « "Agreement"
    is capitalised as a defined term but no definition appears » — is
    quoting something real that is in no document. Counting that as
    invention was the second thing wrong with the first version of this.

    Whitespace-normalised on both sides: a model reproducing a passage will
    not reproduce the line break in the middle of it, and counting that as
    invention would be scoring the formatter rather than the model.
    """
    flat = re.sub(r"\s+", " ", corpus)
    bad = []
    for quote in BLOCKQUOTE.findall(answer) + BACKTICKED.findall(answer):
        cleaned = re.sub(r"\s+", " ", quote).strip().strip('"“”«»')
        if len(cleaned) < 25:
            continue
        if cleaned not in flat:
            bad.append(cleaned)
    return bad


def _tool_text(workspace: Any, outcome: Any) -> list[str]:
    """Re-run the deterministic tools to recover what they told the model.

    The trace stores a one-line summary, not the payload. For quote
    checking we need the payload — specifically the checker's notes, which
    an answer may legitimately quote. Re-running is cheap and exact: these
    tools are pure functions of the workspace.
    """
    from polar.dossier.agent.tools import check_document, list_documents

    text = [json.dumps(list_documents(workspace).data, default=str)]
    for document in workspace.documents:
        if document.extracted_text:
            text.append(
                json.dumps(check_document(workspace, str(document.id)).data, default=str)
            )
    return text


async def main() -> int:
    from polar.config import settings
    from polar.dossier.agent.loop import run
    from polar.dossier.agent.service import build_client
    from polar.dossier.agent.tools import Workspace

    if not settings.ANTHROPIC_API_KEY:
        print("No ANTHROPIC_API_KEY. Nothing to evaluate.", file=sys.stderr)
        return 2

    documents = load_documents()
    workspace = Workspace(dossier_id=uuid4(), documents=tuple(documents))
    client = build_client()

    results = []
    failures = 0

    for case in PROMPTS:
        outcome = await run(client, workspace, case["prompt"])

        # The documents, plus everything the tools said back. The checker's
        # own notes are quotable material that appears in no document.
        corpus = "\n".join(
            [d.extracted_text or "" for d in documents]
            + [step.summary for step in outcome.steps]
            + _tool_text(workspace, outcome)
        )
        tools = [step.tool for step in outcome.steps]
        checks = {
            "completed": outcome.complete,
            "tools_used": len(tools) > 0,
            "opened_with_list": bool(tools) and tools[0] == "list_documents",
            "used_the_checker": ("check_document" in tools)
            if case["expect_check"]
            else None,
            "quotes_are_real": not unreal_quotes(outcome.answer, corpus),
            "mentions": all(
                needle in outcome.answer for needle in case["must_mention"]
            ),
            "admits_the_scan": (
                any(q in outcome.answer.lower() for q in QUALIFIERS)
                if case.get("expect_qualification")
                else None
            ),
        }
        bad = [name for name, value in checks.items() if value is False]
        if bad:
            failures += 1

        print()
        print("=" * 72)
        print(f"{case['name'].upper()}  —  {case['prompt']}")
        print("=" * 72)
        print(outcome.trace())
        print()
        print(outcome.answer)
        print()
        for name, value in checks.items():
            if value is None:
                continue
            print(f"  {'OK ' if value else 'NO '} {name}")
        invented = unreal_quotes(outcome.answer, corpus)
        if invented:
            print("\n  QUOTES IN NO DOCUMENT:")
            for quote in invented:
                print(f"    « {quote[:120]} »")

        results.append(
            {
                "name": case["name"],
                "prompt": case["prompt"],
                "tools": tools,
                "stopped": outcome.stopped,
                "checks": {k: v for k, v in checks.items() if v is not None},
                "invented_quotes": invented,
                "answer": outcome.answer,
                "input_tokens": outcome.input_tokens,
                "output_tokens": outcome.output_tokens,
            }
        )

    print()
    print("=" * 72)
    print(f"{len(PROMPTS) - failures}/{len(PROMPTS)} prompts clean")
    print("=" * 72)

    RUNS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y-%m-%dT%H-%M-%SZ")
    (RUNS / f"{stamp}.json").write_text(
        json.dumps({"when": stamp, "results": results}, indent=2), encoding="utf-8"
    )
    print(f"Archived to {RUNS / f'{stamp}.json'}")

    return 0 if failures == 0 else 1


if __name__ == "__main__":
    os.environ.setdefault("CLAIDOR_ENV", "development")
    raise SystemExit(asyncio.run(main()))
