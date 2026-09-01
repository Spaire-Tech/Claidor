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
    #: Prose appended after `prompt_path`, for the parts of a voice that
    #: are the same wherever the product speaks. Kept separate rather
    #: than pasted into each prompt file so that changing how Swens
    #: talks is one edit, not four — and so a toolset that has its own
    #: reasons to sound different simply leaves it unset.
    voice_path: Path | None = None
    #: More prose, appended in order after the voice. Where a product
    #: has house rules that are not about *this* toolset — how it
    #: writes rather than what it can reach — they belong here rather
    #: than pasted into the toolset's own file, so one edit changes
    #: every place they apply.
    also: tuple[Path, ...] = ()

    def prompt(self, known: str = "") -> str:
        """The system prompt: the toolset's own, the voice, then facts.

        **The voice comes last of the prose on purpose.** It is the
        founder's own words about how Swens talks, and a later
        instruction wins over an earlier one — so where a toolset's
        prose and the voice disagree, the voice is what the model reads
        most recently.

        `known` is what has already been established about the subject
        — the model's resolved picture. It goes after everything,
        because it is not an instruction competing with the others: it
        is the ground the instructions are applied to, and the last
        thing read before the question.

        It is also **the same bytes on every turn of a conversation**,
        which is what keeps the whole prompt cacheable.
        """
        text = self.prompt_path.read_text(encoding="utf-8")
        if self.voice_path is not None:
            text += "\n\n---\n\n" + self.voice_path.read_text(encoding="utf-8")
        for extra in self.also:
            text += "\n\n---\n\n" + extra.read_text(encoding="utf-8")
        if known:
            text += "\n\n---\n\n" + known
        return text


__all__ = ["ToolResult", "Toolset"]
