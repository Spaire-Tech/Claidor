"""Scoring a document against the firm's own positions.

The checks so far ask whether a document is *coherent* — does this term
have a meaning, does this clause exist, does this sum add up. A playbook
asks something different: is this document *acceptable to us*.

That needs a model, because « the liability cap is 12 months' fees rather
than the 24 we want » is a reading, not arithmetic. So it inherits the
discipline from :mod:`polar.redline.judgement` and adds to it:

**Every finding quotes the document.** Verified against the text before it
is shown, exactly as a contradiction is. A playbook finding that quotes a
clause the document does not contain is the same failure in a more
expensive suit.

**Every finding also names the rule it fails.** The rule is ours — it came
out of our own database — so it is checked by identity rather than by
matching text. A finding attributed to a rule that is not in the playbook
is dropped.

The second gate is the one that makes the panel readable. A lawyer looking
at « Limitation of liability — below our floor » wants two things on
screen: what the document says, and what we said we wanted. Both are now
verbatim rather than paraphrased.

**A rule with only a preferred position still works.** Most fields are
optional by design, so the prompt describes what the firm has actually
written down and asks about nothing else. A playbook half-filled is the
normal case, not a degraded one.
"""

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

import anthropic
import structlog

from polar.config import settings
from polar.models.playbook import Playbook, PlaybookRule
from polar.models.playbook import Severity as RuleSeverity

from .judgement import CHUNK, OVERLAP, chunks, locate_quote
from .terms import Certainty, Defect, Finding, Severity, _finding, _Occurrences

log = structlog.get_logger()

PROMPT_PATH = Path(__file__).parent / "prompts" / "playbook.md"

PLAYBOOK_MODEL = "claude-haiku-4-5-20251001"

#: How a rule's severity maps onto the panel's buckets. A walk-away breach
#: is critical whatever the rule says, because it is not a negotiating
#: position — it is a refusal.
SEVERITY_OF: dict[RuleSeverity, Severity] = {
    RuleSeverity.critical: Severity.critical,
    RuleSeverity.warning: Severity.warning,
    RuleSeverity.to_review: Severity.to_review,
}

DEVIATIONS_TOOL = {
    "name": "record_deviations",
    "description": (
        "Record where the document departs from the playbook. Return an "
        "empty list when it does not."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "deviations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "clause": {
                            "type": "string",
                            "description": (
                                "The playbook clause this fails, copied "
                                "exactly from the list given."
                            ),
                        },
                        "quote": {
                            "type": "string",
                            "description": (
                                "The document's own words, copied character "
                                "for character from the extract."
                            ),
                        },
                        "note": {
                            "type": "string",
                            "description": (
                                "One or two sentences: what the document "
                                "says and how it departs from the position."
                            ),
                        },
                        "beyond_walk_away": {
                            "type": "boolean",
                            "description": (
                                "True only when the document is past the "
                                "walk-away line, where one is stated."
                            ),
                        },
                    },
                    "required": ["clause", "quote", "note"],
                },
            }
        },
        "required": ["deviations"],
    },
}


@dataclass
class PlaybookReport:
    playbook: str
    rules: int = 0
    chunks: int = 0
    proposed: int = 0
    #: Dropped because the quoted words are not in the document.
    unquotable: int = 0
    #: Dropped because the named clause is not in the playbook — a rule
    #: the model invented rather than one we wrote.
    unknown_clause: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def kept(self) -> int:
        return self.proposed - self.unquotable - self.unknown_clause

    def summary(self) -> str:
        return (
            f"{self.playbook}: {self.rules} rules, {self.chunks} chunks | "
            f"{self.proposed} proposed, {self.kept} kept ({self.unquotable} "
            f"unquotable, {self.unknown_clause} unknown clause) | "
            f"{self.input_tokens:,} in / {self.output_tokens:,} out"
        )


def prompt_template() -> tuple[str, str]:
    text = PROMPT_PATH.read_text(encoding="utf-8")
    return text, hashlib.sha256(text.encode("utf-8")).hexdigest()


def describe(rules: list[PlaybookRule]) -> str:
    """The playbook as the model is shown it.

    Only fields the firm actually filled in appear. A rule carrying just a
    preferred position is described in one line, and the model is asked
    about nothing it was not told.
    """
    lines: list[str] = []
    for rule in rules:
        lines.append(f"### {rule.clause}")
        lines.append(f"- **Preferred**: {rule.preferred}")
        if rule.acceptable:
            lines.append(f"- **Acceptable**: {rule.acceptable}")
        if rule.fallback:
            lines.append(f"- **Fallback**: {rule.fallback}")
        if rule.walk_away:
            lines.append(f"- **Walk away if**: {rule.walk_away}")
        if rule.rationale:
            lines.append(f"- **Why**: {rule.rationale}")
        lines.append("")
    return "\n".join(lines).strip()


def verify(
    text: str,
    proposed: list[dict[str, object]],
    rules: dict[str, PlaybookRule],
    report: PlaybookReport,
) -> list[Finding]:
    """Keep the deviations the document and the playbook both support."""
    located = _Occurrences(text)
    kept: list[Finding] = []
    seen: set[tuple[str, int]] = set()

    for item in proposed:
        clause = str(item.get("clause") or "").strip()
        rule = rules.get(clause.lower())
        if rule is None:
            report.unknown_clause += 1
            log.debug("redline.playbook.unknown_clause", clause=clause)
            continue

        quote = item.get("quote")
        span = locate_quote(text, quote) if isinstance(quote, str) else None
        if span is None:
            report.unquotable += 1
            log.debug("redline.playbook.unquotable", clause=clause)
            continue

        note = str(item.get("note") or "").strip()
        if not note:
            report.unquotable += 1
            continue

        # The same clause found twice through overlapping windows is one
        # deviation.
        key = (rule.clause, span[0])
        if key in seen:
            continue
        seen.add(key)

        beyond = bool(item.get("beyond_walk_away")) and bool(rule.walk_away)
        severity = Severity.critical if beyond else SEVERITY_OF[rule.severity]

        detail = f"{rule.clause}: {note} Our position: {rule.preferred}"
        if beyond:
            detail = (
                f"{rule.clause}: past the walk-away line — {rule.walk_away}. {note}"
            )
        if rule.approval.value != "none":
            detail = f"{detail} Sign-off needed: {rule.approval.value}."

        kept.append(
            _finding(
                text,
                located,
                defect=Defect.playbook_deviation,
                term=rule.clause,
                start=span[0],
                end=span[1],
                certainty=Certainty.suggested,
                note=detail,
                severity=severity,
            )
        )

    kept.sort(key=lambda finding: finding.start)
    return kept


async def review_against(
    text: str,
    playbook: Playbook,
    rules: list[PlaybookRule],
    *,
    model: str = PLAYBOOK_MODEL,
) -> tuple[list[Finding], PlaybookReport]:
    """Where the document departs from the firm's positions."""
    report = PlaybookReport(playbook=playbook.name, rules=len(rules))
    if not text.strip() or not rules:
        return [], report

    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("No ANTHROPIC_API_KEY configured; review cannot run.")

    template, _ = prompt_template()
    described = describe(rules)
    by_clause = {rule.clause.lower(): rule for rule in rules}
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    proposed: list[dict[str, object]] = []
    for offset, window in chunks(text):
        report.chunks += 1
        try:
            response = await client.messages.create(  # type: ignore[call-overload]
                model=model,
                max_tokens=2000,
                tools=[DEVIATIONS_TOOL],
                tool_choice={"type": "tool", "name": "record_deviations"},
                messages=[
                    {
                        "role": "user",
                        "content": template.format(
                            contract_type=playbook.contract_type,
                            side=playbook.side or "not stated",
                            playbook=described,
                            extract=window,
                        ),
                    }
                ],
            )
        except anthropic.AnthropicError as error:
            report.failures.append(f"chunk at {offset}: {error}")
            log.warning("redline.playbook.failed", offset=offset, error=str(error))
            continue

        report.input_tokens += response.usage.input_tokens
        report.output_tokens += response.usage.output_tokens

        answer = next((b.input for b in response.content if b.type == "tool_use"), None)
        if isinstance(answer, dict):
            found = answer.get("deviations")
            if isinstance(found, list):
                proposed.extend(item for item in found if isinstance(item, dict))

    report.proposed = len(proposed)
    findings = verify(text, proposed, by_clause, report)
    log.info("redline.playbook.done", summary=report.summary())
    return findings, report


__all__ = [
    "CHUNK",
    "OVERLAP",
    "PlaybookReport",
    "describe",
    "review_against",
    "verify",
]
