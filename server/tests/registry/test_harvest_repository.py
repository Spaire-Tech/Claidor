"""Harvesting must be safely repeatable.

A corpus build is not a single run. Queries get added, coverage gets
questioned, a run dies halfway. So the harvest is re-run often, and two
properties have to hold every time:

* the same opinion never becomes two rows
* a re-run never destroys work already done on top of it

The second is the dangerous one. Screening verdicts are expensive — a
model read the case, or a human did — and a harvest that reset them to
``pending`` would quietly discard that, look like it had succeeded, and
cost the money again.
"""

from datetime import date

import pytest

from polar.kit.db.postgres import AsyncSession
from polar.models.registry import ScreeningVerdict
from polar.registry.courtlistener import SearchedOpinion
from polar.registry.repository import RegistryRepository


def _found(source_id: str = "6341726", **overrides) -> SearchedOpinion:
    """One opinion as the search would hand it over."""
    fields = {
        "source_id": source_id,
        "cluster_id": "6469615",
        "opinion_type": "combined-opinion",
        "case_name": "NCH Corporation v. ESI/Employee Solutions, LP",
        "court_id": "txctapp5",
        "court_name": "Texas Court of Appeals, 5th District (Dallas)",
        "date_filed": date(2022, 5, 11),
        "docket_number": "05-21-00466-CV",
        "citations": [],
        "precedential_status": "Published",
        "snippet": "REVERSE and RENDER…",
        "absolute_url": "/opinion/6469615/nch-corporation/",
    }
    fields.update(overrides)
    return SearchedOpinion(**fields)  # type: ignore[arg-type]


@pytest.mark.asyncio
class TestUpsertOpinion:
    async def test_the_first_harvest_creates_the_row(
        self, session: AsyncSession
    ) -> None:
        repository = RegistryRepository.from_session(session)
        row, created = await repository.upsert_opinion(_found())

        assert created
        assert row.source_id == "6341726"
        assert row.court_id == "txctapp5"
        assert row.opinion_type == "combined-opinion"
        assert row.source_url.startswith("https://www.courtlistener.com/opinion/")

    async def test_a_second_harvest_updates_rather_than_duplicates(
        self, session: AsyncSession
    ) -> None:
        repository = RegistryRepository.from_session(session)
        first, created_first = await repository.upsert_opinion(_found())
        second, created_second = await repository.upsert_opinion(
            _found(case_name="NCH Corporation v. ESI (corrected)")
        )

        assert created_first
        assert not created_second
        assert first.id == second.id
        assert second.case_name.endswith("(corrected)")

    async def test_a_re_harvest_never_erases_fetched_opinion_text(
        self, session: AsyncSession
    ) -> None:
        # Harvesting sees metadata only. Fetching full text is the expensive
        # half and needs an API token; writing None over it would silently
        # undo that work and look like success.
        repository = RegistryRepository.from_session(session)
        row, _ = await repository.upsert_opinion(_found())
        row.plain_text = "The indemnity provision at issue reads…"
        row.text_sha256 = "a" * 64
        await session.flush()

        again, created = await repository.upsert_opinion(_found())

        assert not created
        assert again.plain_text == "The indemnity provision at issue reads…"
        assert again.text_sha256 == "a" * 64

    async def test_two_opinions_of_one_case_are_two_rows(
        self, session: AsyncSession
    ) -> None:
        # A case can hold a lead opinion and a dissent. They share a cluster
        # and are different documents; collapsing them would lose the
        # distinction between what was held and what was merely argued.
        repository = RegistryRepository.from_session(session)
        lead, _ = await repository.upsert_opinion(
            _found("111", opinion_type="lead-opinion")
        )
        dissent, _ = await repository.upsert_opinion(
            _found("222", opinion_type="dissent")
        )

        assert lead.id != dissent.id
        assert lead.cluster_id == dissent.cluster_id


@pytest.mark.asyncio
class TestEnsureCandidate:
    async def test_a_candidate_is_recorded_for_what_was_considered(
        self, session: AsyncSession
    ) -> None:
        # Written before anything has read the case, so the set considered
        # is recoverable later. « What did you look at and reject? » is the
        # question the whole ledger exists to answer.
        repository = RegistryRepository.from_session(session)
        row, _ = await repository.upsert_opinion(_found())

        created = await repository.ensure_candidate(
            opinion_id=row.id,
            doctrine="tx-express-negligence",
            query='"express negligence"',
            snippet="…",
        )

        assert created
        assert await repository.count_candidates("tx-express-negligence") == {
            "pending": 1
        }

    async def test_re_harvesting_does_not_reset_a_screening_verdict(
        self, session: AsyncSession
    ) -> None:
        # The expensive property. A model or a human decided this; a second
        # harvest must leave the decision alone.
        from sqlalchemy import select

        from polar.models import RegistryCandidate

        repository = RegistryRepository.from_session(session)
        row, _ = await repository.upsert_opinion(_found())
        await repository.ensure_candidate(
            opinion_id=row.id,
            doctrine="tx-express-negligence",
            query='"express negligence"',
            snippet=None,
        )

        candidate = (
            await session.execute(
                select(RegistryCandidate).where(RegistryCandidate.opinion_id == row.id)
            )
        ).scalar_one()
        candidate.verdict = ScreeningVerdict.on_point
        candidate.verdict_reason = "Turns on the conspicuousness of the indemnity."
        await session.flush()

        created_again = await repository.ensure_candidate(
            opinion_id=row.id,
            doctrine="tx-express-negligence",
            query='"fair notice" "conspicuous" indemnity',
            snippet=None,
        )

        assert not created_again
        await session.refresh(candidate)
        assert candidate.verdict == ScreeningVerdict.on_point
        assert candidate.verdict_reason.startswith("Turns on")

    async def test_one_opinion_can_be_a_candidate_for_several_doctrines(
        self, session: AsyncSession
    ) -> None:
        # A judgment disposing of several clauses is on point for one
        # doctrine and noise for another, so relevance is per-doctrine.
        repository = RegistryRepository.from_session(session)
        row, _ = await repository.upsert_opinion(_found())

        assert await repository.ensure_candidate(
            opinion_id=row.id, doctrine="tx-express-negligence", query="a", snippet=None
        )
        assert await repository.ensure_candidate(
            opinion_id=row.id, doctrine="ucc-2-316-conspicuous", query="b", snippet=None
        )

        assert await repository.count_candidates("tx-express-negligence") == {
            "pending": 1
        }
        assert await repository.count_candidates("ucc-2-316-conspicuous") == {
            "pending": 1
        }


@pytest.mark.asyncio
class TestAwaitingText:
    async def test_opinions_without_text_are_the_fetch_queue(
        self, session: AsyncSession
    ) -> None:
        repository = RegistryRepository.from_session(session)
        without, _ = await repository.upsert_opinion(_found("1"))
        with_text, _ = await repository.upsert_opinion(_found("2"))
        with_text.plain_text = "…"
        await session.flush()
        for row in (without, with_text):
            await repository.ensure_candidate(
                opinion_id=row.id,
                doctrine="tx-express-negligence",
                query="q",
                snippet=None,
            )

        queue = await repository.list_awaiting_text("tx-express-negligence")

        assert [r.source_id for r in queue] == ["1"]

    async def test_another_doctrines_queue_is_not_returned(
        self, session: AsyncSession
    ) -> None:
        repository = RegistryRepository.from_session(session)
        row, _ = await repository.upsert_opinion(_found("1"))
        await repository.ensure_candidate(
            opinion_id=row.id, doctrine="other-doctrine", query="q", snippet=None
        )

        assert await repository.list_awaiting_text("tx-express-negligence") == []
