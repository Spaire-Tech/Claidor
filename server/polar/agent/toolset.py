"""What an agent can do, as one object the loop can be handed.

The loop is the same loop whether it is reconciling a deck against a model
or reading a contract: call the model, run what it asks for, put the
results back, stop when it stops asking. What differs between the two
products is *what the agent can reach* — and a difference of that kind
belongs in a value passed in, not in a second copy of the control flow.

A toolset is three things that have to agree with each other and are
therefore kept together:

- the **definitions** the model is shown,
- the **runner** that executes what it picks, and
- the **prompt** that explains when to pick what.

Splitting them across three modules is how a tool gets added to the schema
and never mentioned in the prompt, or renamed in one place and not the
other.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ToolResult:
    """What a tool did, in a form the model, the trace and a test all read."""

    ok: bool
    #: One line for the trace: « Read Project_Atlas_SPA.docx ».
    summary: str
    #: The payload the model receives.
    data: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Toolset:
    """One agent's whole vocabulary."""

    #: For the trace and the logs — « tieout », « dossier ».
    name: str
    definitions: list[dict[str, Any]]
    #: `(workspace, tool_name, arguments) -> ToolResult`. The workspace is
    #: whatever *that* product's tools need and the loop never inspects it.
    run: Callable[[Any, str, dict[str, Any]], ToolResult]
    #: Where the system prompt lives. A file rather than a string, because
    #: a prompt is prose and prose belongs in a file somebody can read
    #: without a syntax highlighter.
    prompt_path: Path

    def prompt(self) -> str:
        return self.prompt_path.read_text(encoding="utf-8")


__all__ = ["ToolResult", "Toolset"]
