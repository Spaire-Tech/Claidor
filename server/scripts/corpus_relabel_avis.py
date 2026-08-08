"""Relabel decisions the parser now recognises as avis consultatifs.

Usage: ``uv run python -m scripts.corpus_relabel_avis [--apply]``

Juricaf files the CCJA's advisory opinions among its arrêts, and four of
them entered the corpus under judgment-shaped references ("01/2006/",
"003/2015"). They were therefore eligible to appear inside an authority
line — « ligne jurisprudentielle constante · N décisions » — while having
decided no case at all.

Reloading cannot fix this on its own: the parser now returns a different
number for the same source file ("Avis 001/2006"), so the loader would
add a second row and leave the mislabelled one in place. This walks the
raw files, matches each newly-recognised avis to the row it created (by
URN first, then by the old number and date), and corrects the row.

Dry run by default: it prints what it would change and touches nothing.
"""

import asyncio
import pathlib
import sys
from datetime import date

import structlog
from sqlalchemy import or_, select

from polar.corpus.juricaf import parse_juricaf_decision_html
from polar.corpus.sources import read_corpus_text
from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import CourtDecision, DecisionKind
from polar.postgres import create_async_engine

log = structlog.get_logger()

DECISIONS_DIR = (
    pathlib.Path(__file__).parent.parent.parent / "corpus" / "raw" / "decisions"
)


def _old_number(path: pathlib.Path) -> str | None:
    """The judgment-shaped number Juricaf filed the avis under.

    ``…-20061017-012006`` → ``01/2006``; ``…-20151105-0032015`` →
    ``003/2015``; ``…-20150617-001`` → ``001``.
    """
    tail = path.stem.rsplit("-", 1)[-1]
    if not tail.isdigit():
        return None
    if len(tail) > 4:
        return f"{tail[:-4]}/{tail[-4:]}"
    return tail


async def main() -> None:
    apply = "--apply" in sys.argv
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    changed = 0
    async with sessionmaker() as session:
        for path in sorted(DECISIONS_DIR.glob("*.html")):
            parsed = parse_juricaf_decision_html(read_corpus_text(path))
            if parsed.kind != "avis" or not parsed.number or not parsed.decided_on:
                continue

            row = None
            if parsed.urn_lex:
                row = (
                    await session.execute(
                        select(CourtDecision).where(
                            CourtDecision.urn_lex == parsed.urn_lex
                        )
                    )
                ).scalar_one_or_none()
            if row is None:
                candidates = [parsed.number]
                old = _old_number(path)
                if old:
                    # Both paddings: the corpus holds "01/2006" and "003/2015".
                    candidates.append(old)
                    number, _, year = old.partition("/")
                    if year:
                        candidates.append(f"{int(number):03d}/{year}")
                        candidates.append(f"{int(number)}/{year}")
                row = (
                    (
                        await session.execute(
                            select(CourtDecision).where(
                                CourtDecision.decided_on == date.fromisoformat(parsed.decided_on),
                                or_(*[CourtDecision.number == c for c in candidates]),
                            )
                        )
                    )
                    .scalars()
                    .first()
                )

            if row is None:
                log.info("avis.absent", number=parsed.number, file=path.name)
                continue
            if row.kind == DecisionKind.avis and row.number == parsed.number:
                continue

            log.info(
                "avis.relabel",
                was=f"{row.kind} {row.number}",
                now=f"avis {parsed.number}",
                decided_on=str(row.decided_on),
            )
            changed += 1
            if apply:
                row.kind = DecisionKind.avis
                row.number = parsed.number
                session.add(row)

        if apply:
            await session.commit()
        log.info("avis.relabel.done", changed=changed, applied=apply, dry_run=not apply)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
