"""Step two: is this case actually about the doctrine?

Most search hits are not. A phrase like « express negligence » appears in
string citations, in quotations from other cases, and in appeals disposed
of on entirely different grounds. Screening separates the decisions that
turned on the clause from the ones that merely mentioned the rule.

Three properties, and each exists because of a way this could go wrong:

**The prompt is a file, and its hash is stored with every verdict.** A
model's answer is only reproducible if you know what it was asked. When a
systematic bias turns up in six months, the question is *which prompt
produced these*, and it needs an answer that is not a guess.

**Uncertain is a first-class verdict.** A screener forced to choose
between yes and no will guess, and a guess here silently drops a real case
out of a legal reference. Uncertain costs one human review.

**The model reads an excerpt, not the opinion.** See
:mod:`polar.registry.excerpt`. That is a cost decision and a focus
decision, and it is also a limitation: the screener judges what it was
shown, which is why the prompt tells it so.
"""

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import anthropic
import structlog
from sqlalchemy import select

from polar.config import settings
from polar.kit.db.postgres import AsyncSession
from polar.models import RegistryCandidate, RegistryOpinion
from polar.models.registry import ScreeningVerdict

from .courtlistener import normalise_opinion_type
from .doctrines import get_doctrine
from .excerpt import excerpt_for

log = structlog.get_logger()

PROMPT_PATH = Path(__file__).parent / "prompts" / "screen.md"

#: Cheapest capable model. Screening runs on every candidate, so cost per
#: document is the number that decides whether the corpus can grow.
SCREEN_MODEL = "claude-haiku-4-5-20251001"

#: The verdict tool. Forcing a tool call rather than parsing prose is the
#: difference between a schema and a hope.
VERDICT_TOOL = {
    "name": "record_verdict",
    "description": "Record whether this decision turned on the doctrine.",
    "input_schema": {
        "type": "object",
        "properties": {
            "verdict": {
                "type": "string",
                "enum": ["on_point", "not_on_point", "uncertain"],
                "description": "Whether the decision turned on the doctrine.",
            },
            "reason": {
                "type": "string",
                "description": (
                    "One or two sentences a lawyer can check, quoting the "
                    "excerpt where possible."
                ),
            },
        },
        "required": ["verdict", "reason"],
    },
}


def prompt_template() -> tuple[str, str]:
    """The screening prompt and its SHA-256.

    Read from disk on each call rather than cached: a run that edited the
    prompt halfway and recorded the old hash would be worse than no hash
    at all.
    """
    text = PROMPT_PATH.read_text(encoding="utf-8")
    return text, hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass
class ScreenReport:
    doctrine: str
    considered: int = 0
    on_point: int = 0
    not_on_point: int = 0
    uncertain: int = 0
    skipped_no_text: int = 0
    #: Separate writings, refused before a model was asked. A dissent
    #: decided nothing, and paying to be told so would be silly.
    skipped_separate_opinion: int = 0
    no_windows: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def on_point_rate(self) -> float:
        judged = self.on_point + self.not_on_point + self.uncertain
        return round(self.on_point / judged, 3) if judged else 0.0

    def summary(self) -> str:
        return (
            f"{self.doctrine}: {self.considered} screened | "
            f"{self.on_point} on point, {self.not_on_point} not, "
            f"{self.uncertain} uncertain ({self.on_point_rate:.0%} yield) | "
            f"{self.skipped_separate_opinion} separate writings skipped, "
            f"{self.skipped_no_text} without text | "
            f"{self.input_tokens:,} in / {self.output_tokens:,} out tokens"
        )


async def screen_doctrine(
    session: AsyncSession,
    slug: str,
    *,
    limit: int | None = None,
    rescreen: bool = False,
) -> ScreenReport:
    """Screen every candidate that has text and no verdict yet.

    Resumable and idempotent: the queue is « pending candidates », so a
    run that stops halfway simply finds less to do. ``rescreen`` re-runs
    verdicts that already exist, which is what a prompt change requires.
    """
    doctrine = get_doctrine(slug)
    report = ScreenReport(doctrine=slug)
    template, prompt_sha = prompt_template()

    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("No ANTHROPIC_API_KEY configured; screening cannot run.")
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    statement = (
        select(RegistryCandidate, RegistryOpinion)
        .join(RegistryOpinion, RegistryCandidate.opinion_id == RegistryOpinion.id)
        .where(
            RegistryCandidate.doctrine == slug,
            RegistryOpinion.plain_text.is_not(None),
        )
        .order_by(RegistryOpinion.date_filed.desc().nullslast())
    )
    if not rescreen:
        statement = statement.where(
            RegistryCandidate.verdict == ScreeningVerdict.pending
        )
    if limit:
        statement = statement.limit(limit)

    rows = (await session.execute(statement)).all()

    for candidate, opinion in rows:
        if not opinion.plain_text:
            report.skipped_no_text += 1
            continue

        # A dissent or concurrence decided nothing. Refusing it here is
        # both cheaper and safer than trusting a model to notice.
        if normalise_opinion_type(opinion.opinion_type) in {
            "dissent",
            "concurrence",
            "in-part",
        }:
            candidate.verdict = ScreeningVerdict.not_on_point
            candidate.verdict_reason = (
                f"Separate writing ({opinion.opinion_type}); it decided nothing."
            )
            candidate.verdict_model = "rule"
            candidate.verdict_prompt_sha = prompt_sha
            candidate.screened_at = datetime.now(UTC)
            session.add(candidate)
            report.skipped_separate_opinion += 1
            continue

        piece = excerpt_for(opinion.plain_text, doctrine.queries)
        if piece.windows == 0:
            report.no_windows += 1

        message = template.format(
            doctrine_name=doctrine.name,
            jurisdiction=doctrine.jurisdiction,
            doctrine_rule=doctrine.rule,
            case_name=opinion.case_name,
            court_name=opinion.court_name,
            date_filed=opinion.date_filed or "unknown",
            excerpt=piece.text,
        )

        try:
            response = await client.messages.create(
                model=SCREEN_MODEL,
                max_tokens=500,
                tools=[VERDICT_TOOL],  # type: ignore[list-item]
                tool_choice={"type": "tool", "name": "record_verdict"},
                messages=[{"role": "user", "content": message}],
            )
        except anthropic.AnthropicError as e:
            report.failures.append(f"{opinion.source_id}: {e}")
            log.warning(
                "registry.screen.failed", opinion=opinion.source_id, error=str(e)
            )
            continue

        report.input_tokens += response.usage.input_tokens
        report.output_tokens += response.usage.output_tokens

        answer = next((b.input for b in response.content if b.type == "tool_use"), None)
        if not isinstance(answer, dict) or "verdict" not in answer:
            # A forced tool call that produced no tool call is a broken
            # response, not an uncertain one. Leave the candidate pending
            # so it is retried rather than recorded as judged.
            report.failures.append(f"{opinion.source_id}: no verdict returned")
            continue

        verdict = ScreeningVerdict(answer["verdict"])
        candidate.verdict = verdict
        candidate.verdict_reason = str(answer.get("reason") or "").strip() or None
        candidate.verdict_model = SCREEN_MODEL
        candidate.verdict_prompt_sha = prompt_sha
        candidate.screened_at = datetime.now(UTC)
        session.add(candidate)

        report.considered += 1
        if verdict is ScreeningVerdict.on_point:
            report.on_point += 1
        elif verdict is ScreeningVerdict.not_on_point:
            report.not_on_point += 1
        else:
            report.uncertain += 1

    await session.flush()
    return report
