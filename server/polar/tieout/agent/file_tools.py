"""What the agent may reach when all it has is one checked file.

The Check-a-file chat. The one-off check kept its answer — counts and
findings, never the file — and this is that answer as a toolset: small on
purpose, because the honest scope of the conversation is « this file,
as it was checked » and nothing else.

The boundary is the feature. A question about the deal, the model's
history, or what the team decided has a real answer somewhere — on a
deal page, with a deal's tools — and the prompt tells the agent to say
so rather than reach. An agent that answers deal questions from one
file's result would be guessing in exactly the way this product exists
to prevent.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from polar.agent import ToolResult, Toolset


@dataclass(frozen=True)
class FileRoom:
    """One stored one-off check — everything this agent may know."""

    filename: str
    kind: str
    #: The deal it was checked against, by name, or empty for solo.
    against: str
    counts: dict[str, Any]
    #: The stored result: `disagreements`, `drifts`, `defects`, `models`.
    result: dict[str, Any]


def file_summary(room: FileRoom) -> ToolResult:
    """What was read and what was compared, in the tally's own numbers."""
    data = {
        "filename": room.filename,
        "kind": room.kind,
        "checked_against": room.against or "nothing — the file on its own",
        "counts": room.counts,
        "compared_with_models": [
            one.get("filename") for one in room.result.get("models", [])
        ],
    }
    return ToolResult(
        ok=True,
        summary=f"Summarised the check of {room.filename}",
        data=data,
    )


def list_findings(room: FileRoom) -> ToolResult:
    """Everything the check found, in its three shapes.

    Whole rather than paged: a one-off check is one file, and its
    findings fit in a hand.
    """
    data = {
        "the_file_disagrees_with_itself": room.result.get("disagreements", []),
        "the_file_disagrees_with_the_model": room.result.get("drifts", []),
        "the_models_own_defects": room.result.get("defects", []),
    }
    total = sum(len(found) for found in data.values())
    return ToolResult(
        ok=True,
        summary=f"Listed {total} findings from the check",
        data=data,
    )


DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "file_summary",
        "description": (
            "What this check read and compared: the file, its kind, what "
            "it was checked against, and the tally's counts. Call this "
            "before saying anything about coverage — what was not read is "
            "part of the answer."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_findings",
        "description": (
            "Everything the check found, with both sides of each: the "
            "file against itself, the file against the model it was "
            "checked against, and — for a workbook — its own audit "
            "defects. Every figure you state must come from here."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]

TOOLS = {
    "file_summary": file_summary,
    "list_findings": list_findings,
}


def run_tool(room: FileRoom, name: str, arguments: dict[str, Any]) -> ToolResult:
    tool = TOOLS.get(name)
    if tool is None:
        return ToolResult(
            ok=False,
            summary=f"No tool called {name}",
            data={"error": f"No tool called {name}"},
        )
    try:
        return tool(room, **arguments)
    except TypeError as error:
        return ToolResult(
            ok=False,
            summary=f"{name} was called wrongly: {error}",
            data={"error": str(error)},
        )


FILE_TOOLSET = Toolset(
    name="tieout-file",
    definitions=DEFINITIONS,
    run=run_tool,
    prompt_path=Path(__file__).parent / "prompt_file.md",
)


__all__ = ["DEFINITIONS", "FILE_TOOLSET", "FileRoom", "run_tool"]
