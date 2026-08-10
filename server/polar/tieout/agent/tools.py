"""What the agent is allowed to do inside a deal.

Six tools, and the shape of them is the argument. An agent that can only
*talk* about a deal produces confident prose about numbers; an agent that
can list the files, run the check, read the findings and walk a figure back
to the cell it came from produces answers a banker can look up. The
difference between those two products is entirely in this file.

**Nothing here computes an answer about a number.** Every figure the agent
can say came out of the engine — the same engine the Check screen shows, on
the same run. The model is not asked whether `$48.9mm` ties; it is told,
and its job is to explain and to decide what to look at next. That is why
an answer here can be trusted at all: **the arithmetic never passes through
the language model.**

**Nothing here writes.** Reading, searching, and re-running the check.
Accepting a correction into a document is a separate surface with separate
guarantees, and mixing it in would mean every prompt could change a deck.

**Everything is scoped to one deal**, loaded once by the caller. A tool
asked about another deal's file says it does not exist, which from inside
this deal is true.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from polar.agent import ToolResult, Toolset
from polar.models import Artifact, Finding

#: How many findings to hand back at once. Past this the useful answer is
#: the count and the shape, not the list — and a model given four hundred
#: findings summarises them badly rather than reading them.
MAX_FINDINGS = 40

#: Named cells matching a search. Same reasoning.
MAX_CELLS = 25


@dataclass(frozen=True)
class Workspace:
    """The one deal this agent may touch, already loaded."""

    dossier_id: UUID
    name: str
    artifacts: tuple[Artifact, ...]
    findings: tuple[Finding, ...]
    coverage: dict[str, Any]

    def artifact(self, artifact_id: str) -> Artifact | None:
        for one in self.artifacts:
            if str(one.id) == str(artifact_id):
                return one
        return None

    def finding(self, finding_id: str) -> Finding | None:
        for one in self.findings:
            if str(one.id) == str(finding_id):
                return one
        return None


def _refuse(summary: str) -> ToolResult:
    return ToolResult(ok=False, summary=summary, data={"error": summary})


def _finding(one: Finding) -> dict[str, Any]:
    """One finding, in the words the screens use for it."""
    return {
        "id": str(one.id),
        "kind": one.kind,
        "severity": "warning" if one.severity == "smell" else "critical",
        "rounding_only": one.one_tick,
        "state": one.state,
        "title": one.title,
        "printed": one.printed,
        "the_model_says": one.expected,
        "where": one.location,
        "detail": one.detail,
    }


def list_files(workspace: Workspace) -> ToolResult:
    """Every document in the deal, and whether it could be read."""
    files = [
        {
            "id": str(one.id),
            "filename": one.filename,
            "kind": one.kind,
            "version": one.version,
            "status": one.status,
            # A file that could not be read is the most useful thing in
            # this list: it is the reason a figure is unchecked.
            "problem": one.error or None,
        }
        for one in workspace.artifacts
    ]
    unreadable = sum(1 for one in files if one["status"] == "failed")
    summary = f"Listed {len(files)} files in {workspace.name}"
    if unreadable:
        summary += f", {unreadable} unreadable"
    return ToolResult(ok=True, summary=summary, data={"files": files})


def coverage(workspace: Workspace) -> ToolResult:
    """What was checked, and — the part that matters — what was not.

    The agent is told this without having to ask, but it can ask again
    after re-running. An answer that says « everything ties » without
    saying how much of the deck was looked at is the failure this whole
    product exists to prevent, and the tool exists so the model has no
    excuse for making it.
    """
    return ToolResult(
        ok=True,
        summary=(
            f"{workspace.coverage.get('reconciled', 0)} figures reconciled, "
            f"{workspace.coverage.get('unlinked', 0)} not checked"
        ),
        data=workspace.coverage,
    )


def list_findings(
    workspace: Workspace,
    severity: str | None = None,
    include_rounding: bool = False,
    filename: str | None = None,
) -> ToolResult:
    """The findings, filtered the way the Check screen filters them."""
    found = list(workspace.findings)
    if not include_rounding:
        # A difference of one unit at the printed precision is almost
        # always a rounding convention. Left out unless asked for, so an
        # answer is not padded with forty of them.
        found = [one for one in found if not one.one_tick]
    if severity == "critical":
        found = [one for one in found if one.severity != "smell"]
    elif severity == "warning":
        found = [one for one in found if one.severity == "smell"]
    if filename:
        wanted = {
            str(one.id)
            for one in workspace.artifacts
            if filename.lower() in one.filename.lower()
        }
        found = [one for one in found if str(one.artifact_id) in wanted]

    shown = found[:MAX_FINDINGS]
    return ToolResult(
        ok=True,
        summary=f"Read {len(shown)} of {len(found)} findings",
        data={
            "total": len(found),
            "showing": len(shown),
            "findings": [_finding(one) for one in shown],
        },
    )


def read_finding(workspace: Workspace, finding_id: str) -> ToolResult:
    """One finding in full, with the cell it was checked against."""
    one = workspace.finding(finding_id)
    if one is None:
        return _refuse("No finding with that id in this deal")
    evidence = one.evidence or {}
    return ToolResult(
        ok=True,
        summary=f"Read the finding on {one.printed}",
        data={
            **_finding(one),
            "context": one.detail,
            "source_cell": evidence.get("source"),
            "source_name": evidence.get("name"),
            "basis": evidence.get("basis"),
            "confidence": evidence.get("confidence"),
            "standard": one.standard,
            "rule": one.rule,
        },
    )


#: Set by the service, which owns the database session. The tools are
#: synchronous by design — the loop runs them in order and a tool that
#: awaited would make the trace's timings meaningless — so anything needing
#: the database is prepared before the loop starts.
TRACE_UNAVAILABLE = "The chain for this finding was not loaded"


def trace_figure(workspace: Workspace, finding_id: str) -> ToolResult:
    """Where a figure came from: the deck, the cell, what feeds the cell.

    The chains are loaded with the workspace rather than fetched here, so
    this is a lookup. See `service.load_workspace`.
    """
    one = workspace.finding(finding_id)
    if one is None:
        return _refuse("No finding with that id in this deal")
    chain = (one.evidence or {}).get("chain")
    if not chain:
        return _refuse(TRACE_UNAVAILABLE)
    return ToolResult(
        ok=True,
        summary=f"Traced {one.printed} back to its source",
        data={"printed": one.printed, "steps": chain},
    )


def find_cell(workspace: Workspace, query: str) -> ToolResult:
    """A named cell in the model, by a few words of its label."""
    text = (query or "").strip().lower()
    if len(text) < 2:
        return _refuse("Give at least two characters to search for")
    hits = [
        cell
        for cell in workspace.coverage.get("cells", [])
        if text in str(cell.get("name", "")).lower()
    ]
    shown = hits[:MAX_CELLS]
    return ToolResult(
        ok=True,
        summary=f"Found {len(hits)} cells matching « {query} »",
        data={"total": len(hits), "cells": shown},
    )


DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list_files",
        "description": (
            "Every document in this deal — models, decks, memos — with its "
            "version and whether it could be read. A file that failed to "
            "read is why figures in it are unchecked."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "coverage",
        "description": (
            "How many printed figures were reconciled against the model and "
            "how many were not, with the reason for each miss. Call this "
            "before saying anything ties: silence is not the same as checked."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_findings",
        "description": (
            "Everything the check raised, newest run. Rounding-only "
            "differences are left out unless you ask for them."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {
                    "type": "string",
                    "enum": ["critical", "warning"],
                    "description": "Omit for both.",
                },
                "include_rounding": {
                    "type": "boolean",
                    "description": (
                        "Differences of one unit at the printed precision. "
                        "Usually a rounding convention, not a wrong number."
                    ),
                },
                "filename": {
                    "type": "string",
                    "description": "Part of a filename, to look at one document.",
                },
            },
        },
    },
    {
        "name": "read_finding",
        "description": (
            "One finding in full: what was printed, what the model returns, "
            "the cell it was checked against and on what basis."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"finding_id": {"type": "string"}},
            "required": ["finding_id"],
        },
    },
    {
        "name": "trace_figure",
        "description": (
            "The whole path behind a figure: the slide or paragraph that "
            "printed it, the cell it came from, and what feeds that cell. "
            "Use this when asked « says who » or « where does that come from »."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"finding_id": {"type": "string"}},
            "required": ["finding_id"],
        },
    },
    {
        "name": "find_cell",
        "description": (
            "A cell in the model by a few words of its label — « adjusted "
            "EBITDA », « WACC ». Use it to answer what the model says about "
            "something, rather than what a deliverable printed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
]

TOOLS = {
    "list_files": list_files,
    "coverage": coverage,
    "list_findings": list_findings,
    "read_finding": read_finding,
    "trace_figure": trace_figure,
    "find_cell": find_cell,
}


def run_tool(workspace: Workspace, name: str, arguments: dict[str, Any]) -> ToolResult:
    """Dispatch, with a refusal rather than an exception for anything odd."""
    tool = TOOLS.get(name)
    if tool is None:
        return _refuse(f"No tool called {name}")
    try:
        return tool(workspace, **arguments)  # type: ignore[operator]
    except TypeError as error:
        # The model passed an argument this tool does not take. A refusal
        # keeps it in the trace and lets the model correct itself; an
        # exception would end the run over a typo.
        return _refuse(f"{name} was called wrongly: {error}")


#: This product's whole vocabulary, in one object the loop can be handed.
TOOLSET = Toolset(
    name="tieout",
    definitions=DEFINITIONS,
    run=run_tool,
    prompt_path=Path(__file__).parent / "prompt.md",
)


__all__ = ["DEFINITIONS", "TOOLSET", "Workspace", "run_tool"]
