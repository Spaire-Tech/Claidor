"""Ask the five canonical questions of a real model, and print what came back.

The harness for `docs/pierce/g2-chat-protocol.md`, which was registered
and committed before this ran. This file asks; the judging is by hand
against the workbook, and the verdicts go into the protocol's results
section.

Half A only: the tools, driven directly. The agent loop needs a model
key this container does not have, and the protocol says so.

    uv run python -m scripts.g2_questions SUBJECT_A OLD_B NEW_B
"""

import json
import sys
from typing import Any
from uuid import uuid4

from polar.tieout.agent.model_tools import (
    build_workspace,
    inventory,
    locate,
    sources,
    structure,
    trace_back,
    versions,
)
from polar.tieout.audit import audit
from polar.tieout.structure import read_structure
from polar.tieout.watch.delta import delta_of
from polar.tieout.workbook import Workbook, read_workbook

#: How much of a tool's payload to print. Enough to judge, not a wall.
SHOWN = 14


def show(question: str, asked: str, result: Any) -> None:
    print(f"\n{'=' * 72}\n{question}\n  asked: {asked}\n{'-' * 72}")
    print(f"  ok      : {result.ok}")
    print(f"  summary : {result.summary}")
    for key, value in result.data.items():
        if isinstance(value, list):
            print(f"  {key} ({len(value)}):")
            for row in value[:SHOWN]:
                print(f"      {json.dumps(row, default=str)[:300]}")
            if len(value) > SHOWN:
                print(f"      … {len(value) - SHOWN} more")
        else:
            print(f"  {key}: {str(value)[:600]}")


def workspace_for(
    book: Workbook,
    filename: str,
    *,
    versions_list: list[dict[str, Any]] | None = None,
    diff: dict[str, Any] | None = None,
    delta: Any = None,
) -> Any:
    return build_workspace(
        dossier_id=uuid4(),
        name="G2 bench",
        filename=filename,
        version=len(versions_list or [{}]),
        book=book,
        axes=read_structure(book).axes if hasattr(read_structure(book), "axes") else {},
        versions_list=versions_list or [{"version": 1, "when": "", "by": ""}],
        diff=diff,
        # No confirmed links exist for these files: the Chain has never
        # been run against them. `sources` must say so rather than
        # returning an empty list, which is exactly what Q3 tests.
        sources_map=None,
        sources_read=0,
        delta=delta,
    )


def main() -> None:
    subject_a, old_b, new_b = sys.argv[1], sys.argv[2], sys.argv[3]

    print(f"# Subject A: {subject_a.split('/')[-1]}")
    book_a = read_workbook(subject_a)
    space_a = workspace_for(book_a, subject_a.split("/")[-1])
    print(f"  {len(book_a.cells)} named cells, {len(book_a.sheets)} sheets")
    print(f"  calculation: {book_a.calculation}")

    show("SETUP — what the model is", "structure()", structure(space_a))

    # --- Q2: what feeds equity IRR -------------------------------------
    found = locate(space_a, "equity IRR")
    show("Q2 step 1 — locate the metric", "locate('equity IRR')", found)
    if not found.ok:
        for alternative in ("IRR", "equity return", "blended IRR"):
            found = locate(space_a, alternative)
            show(f"Q2 step 1b — substitution", f"locate({alternative!r})", found)
            if found.ok:
                break
    if found.ok:
        ref = found.data["rows"][0]["ref"]
        show("Q2 — what feeds it", f"trace_back({ref!r})", trace_back(space_a, ref))

    # --- Q3: where is this number from ---------------------------------
    typed = inventory(space_a, "typed inputs")
    show("Q3 step 1 — a typed input to ask about", "inventory('typed inputs')", typed)
    if typed.ok and typed.data.get("rows"):
        ref = typed.data["rows"][0]["ref"]
        show("Q3 — where is it from", f"sources({ref!r})", sources(space_a, ref))
    show("Q3b — sources with no ref", "sources('')", sources(space_a, ""))

    # --- Q4: hardcodes above materiality -------------------------------
    show("Q4 — hardcodes", "inventory('hardcodes')", inventory(space_a, "hardcodes"))

    # --- Subject B: the version questions ------------------------------
    print(f"\n\n# Subject B: {old_b.split('/')[-1]} -> {new_b.split('/')[-1]}")
    book_old = read_workbook(old_b)
    book_new = read_workbook(new_b)
    print(f"  old {len(book_old.cells)} cells / new {len(book_new.cells)} cells")

    old_audit = audit(book_old)
    new_audit = audit(book_new)
    print(f"  audits: {len(old_audit.findings)} -> {len(new_audit.findings)} findings")

    def report() -> Any:
        return delta_of(
            book_old,
            book_new,
            old_name=old_b.split("/")[-1],
            new_name=new_b.split("/")[-1],
            old_findings=list(old_audit.findings),
            new_findings=list(new_audit.findings),
        )

    space_b = workspace_for(
        book_new,
        new_b.split("/")[-1],
        versions_list=[
            {"version": 1, "when": "2023-10", "by": "uploaded"},
            {"version": 2, "when": "2023-11", "by": "uploaded"},
        ],
        delta=report,
    )

    # --- Q5: what changed ----------------------------------------------
    show("Q5 — what changed", "versions()", versions(space_b))

    # --- Q1: why did the headline metric fall between versions ---------
    for candidate in ("DSCR", "debt service cover", "cover ratio", "allowed return"):
        found_b = locate(space_b, candidate)
        show("Q1 step 1 — locate the metric", f"locate({candidate!r})", found_b)
        if found_b.ok:
            ref = found_b.data["rows"][0]["ref"]
            show("Q1 — what feeds it", f"trace_back({ref!r})", trace_back(space_b, ref))
            break


if __name__ == "__main__":
    main()
