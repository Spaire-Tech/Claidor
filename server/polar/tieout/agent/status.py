"""The run, as the person watches it happen.

The founder's design draws a run as one live step at a time — an
activity in 16px, a line under it saying what is being done *right now*
against a green ring, and the thing it produced in a card that starts
as a skeleton and fills in when there is a name for it. This module is
what turns a real tool call into that.

Two rules hold it together, and both are about not inventing.

**The line names the real object.** The founder's own words: « one short
status line per step, present tense, three to six words, naming the real
object. Good: "Reading the debt schedule" / "Comparing v12 with v8".
Bad: "Analyzing your data" / "Thinking hard" ». So the sub-line is built
from the arguments the assistant actually passed — the query it
searched for, the ref it walked, the sheet it listed — and never from a
template with nothing in it.

**The assistant's own line wins.** When it wrote one before calling the
tool, that is the line: it is the thing the prompt asks it for and it
knows what it is doing better than a lookup table does. The derived
phrase is the fallback for a turn where it called the tool without a
word, so the screen is never blank while work is happening.

Nothing here is evidence. The trace keeps the tool's own `summary`, and
that is what a person opens to check the answer; this is the sentence
that tells them the machine is not stuck.
"""

from dataclasses import dataclass
from typing import Any

from polar.agent import Step

#: What each tool is *doing*, as the design's step title reads it — the
#: activity, not the object. « Reading the workbook » stays put while
#: three sub-lines pass beneath it, which is exactly the design's shape.
TITLES: dict[str, str] = {
    "locate": "Reading the workbook",
    "trace_back": "Tracing the number back",
    "trace_forward": "Following what it feeds",
    "inventory": "Reading the workbook",
    "structure": "Mapping the workbook",
    "versions": "Comparing versions",
    "sources": "Checking the source documents",
    "ask_the_person": "Asking you",
}

#: Which file kind the step is working on, so the screen draws the right
#: icon. Only `sources` leaves the workbook.
KINDS: dict[str, str] = {"sources": "source"}

#: `inventory`'s three kinds, in the words the founder would use rather
#: than the argument's own.
INVENTORY_WORDS: dict[str, str] = {
    "typed": "the typed inputs",
    "hardcodes": "the buried numbers",
    "external-links": "the links out",
}


def _text(arguments: dict[str, Any], key: str) -> str:
    value = arguments.get(key)
    return str(value).strip() if value else ""


def derived_line(tool: str, arguments: dict[str, Any]) -> str:
    """The status line built from what the assistant actually asked for.

    The fallback, used when the assistant called a tool without saying
    anything. Every branch here names the real object — the ref, the
    query, the sheet — because a line that says « Reading the model »
    on every step of every run tells a person nothing they did not
    already know.
    """
    if tool == "locate":
        query = _text(arguments, "query")
        return f"Looking for « {query} »" if query else "Looking through the labels"
    if tool == "trace_back":
        ref = _text(arguments, "ref")
        return f"Walking back from {ref}" if ref else "Walking back through the inputs"
    if tool == "trace_forward":
        ref = _text(arguments, "ref")
        return f"Following {ref} downstream" if ref else "Following what reads it"
    if tool == "inventory":
        what = INVENTORY_WORDS.get(_text(arguments, "kind"), "the cells")
        sheet = _text(arguments, "sheet")
        return f"Listing {what} on {sheet}" if sheet else f"Listing {what}"
    if tool == "structure":
        return "Reading the sheet layout"
    if tool == "versions":
        return "Comparing with the version before"
    if tool == "sources":
        ref = _text(arguments, "ref")
        return f"Checking where {ref} came from" if ref else "Checking what is sourced"
    if tool == "ask_the_person":
        return "Waiting on your answer"
    return f"Running {tool}"


@dataclass
class Stage:
    """One step of a run, in the shape the design's screen draws."""

    ordinal: int
    tool: str
    ok: bool
    #: `model` or `source` — which file icon sits beside the step.
    kind: str
    #: The activity: « Reading the workbook ».
    title: str
    #: What is being done right now, naming the real object.
    sub: str
    #: The tool's own line. The trace keeps this; the screen shows it
    #: once the step is finished, because by then « walked back from
    #: Debt!F44 (6 direct inputs) » is the more useful sentence.
    summary: str
    #: What the step produced, named — the card under the step. Empty
    #: while there is nothing honest to put in it, and the design draws
    #: a skeleton there rather than a guess.
    art: str
    #: This step is finished. Every step this module makes is: it is
    #: built *after* the tool ran. The field exists because the screen's
    #: live step is the one still running, and it needs to say which.
    done: bool = True


def stage(step: Step, *, model: str = "", version: int | None = None) -> Stage:
    """One finished tool call, as the run screen shows it.

    `model` and `version` name the workbook the assistant is reading, so
    the produced-thing card can carry « Northbank Bid Model v22 » rather
    than a filename the person would have to recognise from memory. They
    are the workspace's own, never guessed: called without them the card
    stays empty and the design draws its skeleton, which is the honest
    shape of « something happened and I have no name for it ».
    """
    named = f"{model} v{version}" if model and version is not None else model
    art = named
    if step.tool == "sources":
        #: A source step's product is the document it found, when it
        #: found one — that is the whole point of the tool, and naming
        #: the workbook there would be answering a different question.
        document = step.data.get("document") if step.ok else None
        art = str(document) if document else ""
    if step.tool == "ask_the_person" or not step.ok:
        art = ""
    return Stage(
        ordinal=step.ordinal,
        tool=step.tool,
        ok=step.ok,
        kind=KINDS.get(step.tool, "model"),
        title=TITLES.get(step.tool, "Working"),
        sub=step.said.strip() or derived_line(step.tool, step.arguments),
        summary=step.summary,
        art=art,
    )


__all__ = ["INVENTORY_WORDS", "KINDS", "TITLES", "Stage", "derived_line", "stage"]
