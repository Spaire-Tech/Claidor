"""The checks that need judgement, and the code that keeps them honest.

Everything in :mod:`polar.redline.terms` and :mod:`polar.redline.structure`
is arithmetic on the text: a clause exists or it does not. Two defects are
not like that.

- **A contradiction.** Clause 5 gives thirty days' notice and clause 12
  gives sixty. Finding it needs reading, not matching.
- **A miscalculation.** A purchase price of USD 5,000,000 payable as
  2,000,000 at closing and 2,500,000 on the earn-out date does not add up.

A model can find both. A model can also invent both, and a lawyer reading
an invented contradiction in their own draft loses an hour and then stops
using the tool. So nothing a model says is shown to anybody until code has
checked it:

**Every quote must be in the document, verbatim.** The model returns the
exact words it is talking about; if those words are not in the text, the
finding is dropped. This is what makes a fabricated clause impossible to
surface, and the drop is counted rather than hidden, so the rate is
visible.

**Every sum is recomputed.** For a miscalculation the model returns the
component figures and the total the document states. Python adds them up.
If they balance, the model was wrong and the finding goes. The model
proposes the relationship; the arithmetic is never taken on trust.

What survives is labelled ``suggested`` — distinct from ``certain`` and
``probable`` — because a verified quote proves the words are real, not
that the reading of them is right. Keeping the two apart is the whole
design: a reader who learns the mechanical findings are always right will
give the judgement ones the attention they need.
"""

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

import anthropic
import structlog

from polar.config import settings

from .terms import Certainty, Defect, Finding, _finding, _Occurrences

log = structlog.get_logger()

PROMPT_PATH = Path(__file__).parent / "prompts" / "judgement.md"

#: Cheapest capable model. This runs over every chunk of every document, so
#: cost per chunk decides whether the check can run at all.
JUDGEMENT_MODEL = "claude-haiku-4-5-20251001"

#: Characters per request. Large enough that a contradiction between two
#: clauses of the same article falls inside one window; small enough that a
#: 186-page agreement is tens of requests rather than one impossible one.
CHUNK = 12_000

#: Overlap between windows, so a contradiction spanning a boundary is seen
#: whole at least once.
OVERLAP = 2_000

#: A quote shorter than this cannot be located unambiguously and is not
#: worth showing.
MIN_QUOTE = 12

FINDINGS_TOOL = {
    "name": "record_findings",
    "description": (
        "Record contradictions and miscalculations found in the extract. "
        "Return an empty list when there are none."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {
                            "type": "string",
                            "enum": ["contradiction", "miscalculation"],
                        },
                        "quotes": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 1,
                            "maxItems": 2,
                            "description": (
                                "The exact words from the extract, copied "
                                "character for character. A contradiction "
                                "needs both passages."
                            ),
                        },
                        "note": {
                            "type": "string",
                            "description": (
                                "One or two sentences a lawyer can check "
                                "against the quotes."
                            ),
                        },
                        "components": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": (
                                "For a miscalculation: the figures that "
                                "should add up. Omit otherwise."
                            ),
                        },
                        "stated_total": {
                            "type": "number",
                            "description": (
                                "For a miscalculation: the total the "
                                "document states. Omit otherwise."
                            ),
                        },
                    },
                    "required": ["kind", "quotes", "note"],
                },
            }
        },
        "required": ["findings"],
    },
}


@dataclass
class JudgementReport:
    """What the pass cost and how much of it survived checking."""

    chunks: int = 0
    proposed: int = 0
    #: Dropped because the quoted words are not in the document. This is
    #: the fabrication rate, and it is reported rather than swallowed.
    unquotable: int = 0
    #: Dropped because the figures balanced after all.
    arithmetic_wrong: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def kept(self) -> int:
        return self.proposed - self.unquotable - self.arithmetic_wrong

    def summary(self) -> str:
        return (
            f"{self.chunks} chunks | {self.proposed} proposed, {self.kept} kept "
            f"({self.unquotable} unquotable, {self.arithmetic_wrong} arithmetic "
            f"wrong) | {self.input_tokens:,} in / {self.output_tokens:,} out"
        )


def prompt_template() -> tuple[str, str]:
    """The prompt and its SHA-256.

    Read on each call. A run that edited the prompt halfway and reported
    the old hash would be worse than reporting none.
    """
    text = PROMPT_PATH.read_text(encoding="utf-8")
    return text, hashlib.sha256(text.encode("utf-8")).hexdigest()


def chunks(text: str) -> list[tuple[int, str]]:
    """Overlapping windows, each with its offset in the original text.

    The offset is what lets a finding keep a span into the document the
    caller submitted rather than into a copy of part of it.
    """
    if not text:
        return []
    if len(text) <= CHUNK:
        return [(0, text)]

    windows: list[tuple[int, str]] = []
    start = 0
    while start < len(text):
        windows.append((start, text[start : start + CHUNK]))
        if start + CHUNK >= len(text):
            break
        start += CHUNK - OVERLAP
    return windows


def _normalise(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def locate_quote(text: str, quote: str) -> tuple[int, int] | None:
    """Where a quote sits in the document, or ``None`` if it is not there.

    Matched on whitespace-normalised text, because a model reproducing a
    passage will not reproduce a line break in the middle of it, and
    rejecting a real quote over a newline would throw away good findings.
    """
    wanted = _normalise(quote)
    if len(wanted) < MIN_QUOTE:
        return None

    # Walk the original text building a normalised copy alongside a map
    # back to real offsets, so a match in normalised space becomes a span
    # in the text the caller submitted.
    positions: list[int] = []
    flattened: list[str] = []
    previous_space = True
    for index, character in enumerate(text):
        if character.isspace():
            if previous_space:
                continue
            flattened.append(" ")
            positions.append(index)
            previous_space = True
        else:
            flattened.append(character)
            positions.append(index)
            previous_space = False

    haystack = "".join(flattened)
    at = haystack.find(wanted)
    if at == -1:
        return None
    end_index = at + len(wanted) - 1
    return positions[at], positions[end_index] + 1


def _balances(components: list[float], stated: float) -> bool:
    """Whether the figures actually add up.

    Rounded to the cent: a contract quoting 1,666,666.67 three times
    against 5,000,000 is not a miscalculation.
    """
    return abs(round(sum(components), 2) - round(stated, 2)) < 0.01


def verify(
    text: str,
    proposed: list[dict[str, object]],
    report: JudgementReport,
) -> list[Finding]:
    """Keep only the findings the document supports.

    Two gates, and both are code:

    - the quoted words must be in the document
    - a claimed miscalculation must actually not add up
    """
    located = _Occurrences(text)
    kept: list[Finding] = []

    for item in proposed:
        raw_quotes = item.get("quotes")
        quotes = (
            [q for q in raw_quotes if isinstance(q, str)]
            if isinstance(raw_quotes, list)
            else []
        )
        found = [locate_quote(text, quote) for quote in quotes]
        spans = [span for span in found if span is not None]
        if not quotes or len(spans) != len(quotes):
            report.unquotable += 1
            # Name the quote that actually failed. Logging the first one
            # regardless sent me hunting a bug in the locator when the
            # locator was right and the *second* quote was the invented
            # one — a diagnostic that points at the wrong thing costs more
            # than no diagnostic.
            log.debug(
                "redline.judgement.unquotable",
                missing=[
                    q for q, span in zip(quotes, found, strict=False) if span is None
                ],
            )
            continue

        kind = item.get("kind")
        note = str(item.get("note") or "").strip()
        if not note:
            report.unquotable += 1
            continue

        if kind == "miscalculation":
            raw_components = item.get("components")
            components = (
                [
                    float(value)
                    for value in raw_components
                    if isinstance(value, int | float)
                ]
                if isinstance(raw_components, list)
                else []
            )
            stated = item.get("stated_total")
            if not components or not isinstance(stated, int | float):
                # A miscalculation with no figures cannot be checked, and
                # an unchecked arithmetic claim is exactly the kind of
                # thing this module exists to refuse.
                report.arithmetic_wrong += 1
                continue
            if _balances(components, float(stated)):
                report.arithmetic_wrong += 1
                log.debug("redline.judgement.balanced", components=components)
                continue
            note = (
                f"{note} The figures given sum to "
                f"{sum(components):,.2f} against a stated {stated:,.2f}."
            )
            defect = Defect.miscalculation
        else:
            defect = Defect.contradiction
            if len(spans) > 1:
                note = f"{note} The other passage is at character {spans[1][0]}."

        start, end = spans[0]
        kept.append(
            _finding(
                text,
                located,
                defect=defect,
                term=_normalise(text[start:end])[:60],
                start=start,
                end=end,
                certainty=Certainty.suggested,
                note=note,
            )
        )

    return kept


async def review_judgement(
    text: str, *, model: str = JUDGEMENT_MODEL
) -> tuple[list[Finding], JudgementReport]:
    """Contradictions and miscalculations, verified before they are shown."""
    report = JudgementReport()
    if not text.strip():
        return [], report

    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("No ANTHROPIC_API_KEY configured; judgement cannot run.")

    template, _ = prompt_template()
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    proposed: list[dict[str, object]] = []
    for offset, window in chunks(text):
        report.chunks += 1
        try:
            # The SDK's parameter types are TypedDicts that a plain
            # literal cannot satisfy without restating them; the shape is
            # checked by the API itself and by the tests.
            response = await client.messages.create(  # type: ignore[call-overload]
                model=model,
                max_tokens=2000,
                tools=[FINDINGS_TOOL],
                tool_choice={"type": "tool", "name": "record_findings"},
                messages=[{"role": "user", "content": template.format(extract=window)}],
            )
        except anthropic.AnthropicError as error:
            report.failures.append(f"chunk at {offset}: {error}")
            log.warning("redline.judgement.failed", offset=offset, error=str(error))
            continue

        report.input_tokens += response.usage.input_tokens
        report.output_tokens += response.usage.output_tokens

        answer = next((b.input for b in response.content if b.type == "tool_use"), None)
        if isinstance(answer, dict):
            reported = answer.get("findings")
            if isinstance(reported, list):
                proposed.extend(item for item in reported if isinstance(item, dict))

    report.proposed = len(proposed)
    findings = verify(text, proposed, report)

    # The same contradiction seen through two overlapping windows is one
    # contradiction.
    seen: set[tuple[int, int]] = set()
    unique: list[Finding] = []
    for finding in sorted(findings, key=lambda f: (f.start, f.defect)):
        key = (finding.start, finding.end)
        if key in seen:
            continue
        seen.add(key)
        unique.append(finding)

    log.info("redline.judgement.done", summary=report.summary())
    return unique, report
