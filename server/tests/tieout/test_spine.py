"""The chain, end to end, through the database.

The engine's own tests read files. These read **rows** — the same two
Cascade files, ingested once, then never opened again — because that is
the claim the product makes and it is not the same claim. A checker that
only works while the file is on disk cannot promise a banker that a
confirmed figure stays confirmed, cannot drop the document afterwards, and
cannot re-check a deck at midnight when nobody is holding the upload.

So the numbers below are the numbers ``tests/test_cascade.py`` gets from
the files. If they ever diverge, something was lost on the way into the
tables and the engine's own tests will not notice.
"""

from pathlib import Path

import pytest

from polar.kit.db.postgres import AsyncSession
from polar.models import (
    ArtifactKind,
    ArtifactStatus,
    CheckStatus,
    Dossier,
    DossierMember,
    DossierRole,
    FindingKind,
    FindingState,
    LinkState,
    User,
)
from polar.tieout.repository import TieOutRepository
from polar.tieout.service import tieout
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
CLEAN = CASCADE / "cascade_deck.pptx"
BROKEN = CASCADE / "cascade_deck_broken.pptx"
MODEL = CASCADE / "cascade_model.xlsx"


async def _deal(
    session: AsyncSession, save_fixture: SaveFixture, user: User
) -> Dossier:
    organization = await create_organization(save_fixture)
    deal = Dossier(
        organization_id=organization.id,
        name="Project Cascade",
        client_name="Cascade Industrial Holdings",
        created_by_id=user.id,
    )
    session.add(deal)
    await session.flush()
    session.add(
        DossierMember(dossier_id=deal.id, user_id=user.id, role=DossierRole.lead)
    )
    await session.flush()
    return deal


async def _load(
    session: AsyncSession, deal: Dossier, user: User, deck: Path = CLEAN
) -> None:
    for path, kind in ((MODEL, ArtifactKind.model), (deck, ArtifactKind.deck)):
        await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=kind,
            # The deck always goes in under the same name, so the broken
            # one is a *new version* of the deck already in the deal —
            # which is what a banker actually does.
            filename="cascade_deck.pptx" if kind is ArtifactKind.deck else path.name,
            payload=path.read_bytes(),
            user_id=user.id,
        )


@pytest.mark.asyncio
class TestIngestion:
    async def test_a_file_becomes_rows(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)

        repository = TieOutRepository.from_session(session)
        artifacts = await repository.current_artifacts(deal.id)
        assert len(artifacts) == 2
        assert all(one.status is ArtifactStatus.ready for one in artifacts)

        model = next(one for one in artifacts if one.kind is ArtifactKind.model)
        deck = next(one for one in artifacts if one.kind is ArtifactKind.deck)

        cells = await repository.cells_of(model.id)
        figures = await repository.figures_of(deck.id)
        assert len(cells) == model.counts["cells"]
        assert len(figures) == deck.counts["figures"]
        # The model publishes an Outputs tab, and it rides on the artifact
        # because it cannot be rebuilt from the cells: its own columns are
        # text, and only numeric cells are stored.
        assert model.outputs

    async def test_an_unreadable_file_is_kept_with_a_reason(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """« this one did not work, and here is what to do about it ».

        Impossible to show if the row is thrown away, which is why a
        failure is a state and not an exception.
        """
        deal = await _deal(session, save_fixture, user)
        artifact = await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=ArtifactKind.model,
            filename="broken.xlsx",
            payload=b"this is not a workbook",
            user_id=user.id,
        )
        assert artifact.status is ArtifactStatus.failed
        assert artifact.error
        # Actionable, not « extraction failed ».
        assert "Excel" in artifact.error

    async def test_the_same_name_makes_a_version_not_a_second_document(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await _load(session, deal, user, deck=BROKEN)

        repository = TieOutRepository.from_session(session)
        current = await repository.current_artifacts(deal.id)
        assert len(current) == 2
        deck = next(one for one in current if one.kind is ArtifactKind.deck)
        assert deck.version == 2

        # And a check reads the new version, not the old one.
        every = await repository.list_artifacts(deal.id)
        decks = [one for one in every if one.kind is ArtifactKind.deck]
        assert len(decks) == 2
        assert len({one.lineage_id for one in decks}) == 1


@pytest.mark.asyncio
class TestChecking:
    async def test_the_clean_deck_from_rows_alone(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """The number the whole product rests on, reached without a file.

        103 reconciled, 95 agreeing, 8 drifting — identical to what the
        offline library gets from the same two files. The eight are real
        and were found in the deck the fixture calls clean.

        Was 102 and 94 until an unmarked year stopped being treated as a
        different period from a marked one. Slide 4's « ERP implementation
        of FY2025 programme cost » is `Model!D21`, *FY2025A EBITDA
        adjustments ERP implementation costs*, and both say 2.8; the match
        was refused for saying `FY2025` rather than `FY2025A`. One figure,
        and it was a real miss rather than a new guess — see
        `link._same_period`.

        And 103/95 until a parameter echoed at the same value under the
        same name on two sheets stopped being read as ambiguous (see
        `link._timeless`) — the deck's `11.8%` growth figure now reaches
        `Model!E7`, which the DCF sheet restates at the same value, and
        the memo gains its twin figures the same way. Every gained link
        agrees; the drift set is unchanged.

        And 106/98 until the fraction gate learned that a plain figure
        which *is* a fraction may claim fraction-sized cells: the 0.0
        legal settlement, the chart's 0.2 margin points, and Arbor's
        1.43x multiple under the 1.5 ceiling — each hand-verified. Every
        gained link agrees; the drift set is unchanged again.
        """
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)

        run = await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)
        assert run.status is CheckStatus.done
        assert run.summary["reconciled"] == 113
        assert run.summary["agreeing"] == 105
        assert run.summary["drifting"] == 8
        # What was *not* checked is part of the answer, and it is counted
        # with the reasons rather than quietly dropped.
        assert run.summary["unlinked"] > 0
        assert run.summary["reasons"]

    async def test_the_broken_deck_adds_findings_and_keeps_the_old_ones(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        await _load(session, deal, user, deck=BROKEN)
        run = await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)
        assert run.summary["drifting"] == 14

        repository = TieOutRepository.from_session(session)
        findings = await repository.findings_of(deal.id)
        assert len(findings) == 14
        assert all(one.kind is FindingKind.drift for one in findings)
        # Every finding names a figure, a slide and what the model says.
        assert all(one.printed and one.expected and one.location for one in findings)

    async def test_a_deal_with_no_model_says_so(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """A state of the deal, not an error to raise at anybody."""
        deal = await _deal(session, save_fixture, user)
        await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=ArtifactKind.deck,
            filename="cascade_deck.pptx",
            payload=CLEAN.read_bytes(),
            user_id=user.id,
        )
        run = await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)
        assert run.status is CheckStatus.failed
        assert run.error is not None
        assert "no model" in run.error

    async def test_the_audit_reads_the_stored_cells(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        run = await tieout.run_audit(session, dossier_id=deal.id, user_id=user.id)
        assert run.status is CheckStatus.done
        assert run.summary["cells"] == 313
        # Errors and smells are counted apart, and never added together.
        assert "errors" in run.summary
        assert "smells" in run.summary

    async def test_the_statement_checks_run_with_the_audit(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """The analytical layer lands in the same findings table.

        A model whose own check row fires — the shape found in real
        issued close files — must come back from an ordinary audit run
        as a finding with the rule key, the headline figure, and the
        run's tally saying one check row was read and none were clean.
        """
        import io

        from openpyxl import Workbook as XlsxWorkbook

        book = XlsxWorkbook()
        sheet = book.active
        assert sheet is not None
        sheet.title = "Checks"
        sheet["A1"] = "Check: cash ties to balance sheet"
        for at, value in enumerate((0, 0, 0, 0, 42.5), start=2):
            sheet.cell(row=1, column=at, value=value)
        payload = io.BytesIO()
        book.save(payload)

        deal = await _deal(session, save_fixture, user)
        await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=ArtifactKind.model,
            filename="close_model.xlsx",
            payload=payload.getvalue(),
            user_id=user.id,
        )
        run = await tieout.run_audit(session, dossier_id=deal.id, user_id=user.id)
        assert run.status is CheckStatus.done

        repository = TieOutRepository.from_session(session)
        fired = [
            one
            for one in await repository.findings_of(deal.id)
            if one.rule == "model-own-check"
        ]
        assert fired, "the fired check row must land as a finding"
        assert fired[0].evidence["figure"] == "42.5"
        assert "built to read zero" in fired[0].evidence["figure_unit"]
        assert run.summary["tallies"]["model-own-check"] == {
            "total": 1,
            "clean": 0,
        }


@pytest.mark.asyncio
class TestWhatAPersonDecides:
    async def test_a_dismissal_survives_a_new_version_of_the_deck(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """The fastest way to lose a user is a finding they killed coming back.

        Matched on the document's *lineage*, so re-uploading the deck does
        not resurrect it — which is the case that would otherwise slip
        through, since every row is new on every run.
        """
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        repository = TieOutRepository.from_session(session)
        findings = await repository.findings_of(deal.id)
        victim = findings[0]
        fingerprint = victim.fingerprint
        await repository.set_finding_state(
            victim, state=FindingState.dismissed, user_id=user.id
        )

        await _load(session, deal, user, deck=BROKEN)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        again = await repository.findings_of(deal.id)
        same = [one for one in again if one.fingerprint == fingerprint]
        assert same, "the finding should still be found"
        assert same[0].state is FindingState.dismissed

    async def test_an_acceptance_survives_a_recheck_with_its_note(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """The founder accepted findings with notes, pressed « Fix the
        cell » — which re-checks — and refreshed to find every ruling
        gone. Two lies at once: the old replace recreated every row and
        let only *dismissals* back through, and the accept path threw
        the note away at the moment the screen promised to keep it. A
        ruling is the same row across runs — same id, same clock, same
        state, same reason."""
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_audit(session, dossier_id=deal.id, user_id=user.id)

        repository = TieOutRepository.from_session(session)
        audited = [
            one
            for one in await repository.findings_of(deal.id)
            if one.kind is FindingKind.audit
        ]
        assert audited, "the cascade model must yield at least one audit finding"
        victim = audited[0]
        identity, born = victim.id, victim.created_at
        await repository.set_finding_state(
            victim,
            state=FindingState.accepted,
            user_id=user.id,
            note="known and priced in",
        )

        await tieout.run_audit(session, dossier_id=deal.id, user_id=user.id)
        again = [
            one for one in await repository.findings_of(deal.id) if one.id == identity
        ]
        assert again, "the finding must keep its identity across runs"
        assert again[0].state is FindingState.accepted
        assert again[0].note == "known and priced in"
        assert again[0].created_at == born

    async def test_a_confirmation_is_never_proposed_over(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """Confirming is the moment a guess becomes data.

        From then on the pair is decided: a re-run must not replace it,
        undo it, or offer it again.
        """
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        repository = TieOutRepository.from_session(session)
        link = (await repository.links_of(deal.id))[0]
        pair = (link.figure_id, link.cell_id)
        await repository.decide_link(link, state=LinkState.confirmed, user_id=user.id)

        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)
        links = await repository.links_of(deal.id)
        matching = [one for one in links if (one.figure_id, one.cell_id) == pair]
        assert len(matching) == 1
        assert matching[0].state is LinkState.confirmed
        assert matching[0].confirmed_by_id == user.id

    async def test_a_rejection_is_never_resurrected(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        repository = TieOutRepository.from_session(session)
        link = (await repository.links_of(deal.id))[0]
        pair = (link.figure_id, link.cell_id)
        await repository.decide_link(link, state=LinkState.rejected, user_id=user.id)

        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)
        links = await repository.links_of(deal.id)
        matching = [one for one in links if (one.figure_id, one.cell_id) == pair]
        assert len(matching) == 1
        assert matching[0].state is LinkState.rejected


@pytest.mark.asyncio
class TestWhatTheScreensAsk:
    async def test_coverage_is_the_run_that_produced_it(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        # Before anything is checked, coverage is honestly zero rather
        # than absent: nothing has been looked at.
        empty = await tieout.coverage_of(session, dossier_id=deal.id)
        assert empty["reconciled"] == 0

        await _load(session, deal, user)
        run = await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)
        coverage = await tieout.coverage_of(session, dossier_id=deal.id)
        assert coverage["reconciled"] == run.summary["reconciled"]
        assert coverage["unlinked"] == run.summary["unlinked"]

    async def test_the_figure_map_accounts_for_every_figure(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """Including — especially — the ones nothing was done with."""
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        repository = TieOutRepository.from_session(session)
        deck = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.deck
        )
        slides = await tieout.figure_map(
            session, dossier_id=deal.id, artifact_id=deck.id
        )
        shown = [figure for _, figures in slides for figure in figures]
        assert len(shown) == deck.counts["figures"]

        unlinked = [one for one in shown if one["state"] == "unlinked"]
        assert unlinked
        # An unchecked figure without a reason is a silent miss, which is
        # the one thing this screen exists to prevent.
        assert all(one["reason"] for one in unlinked)

    async def test_the_chain_reads_as_one_sentence(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        repository = TieOutRepository.from_session(session)
        finding = (await repository.findings_of(deal.id))[0]
        chain = await tieout.chain_of_finding(session, finding=finding)

        assert chain["steps"][0]["kind"] == "figure"
        assert chain["steps"][0]["printed"] == finding.printed
        # It reaches the model, not just the slide.
        assert any(step["kind"] in {"cell", "input"} for step in chain["steps"])
        assert chain["summary"]

    async def test_alternatives_offer_the_runners_up(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        """« Or did you mean this one » — the third action on the queue."""
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        repository = TieOutRepository.from_session(session)
        link = (await repository.links_of(deal.id))[0]
        alternatives = await tieout.alternatives_for(
            session, dossier_id=deal.id, figure_id=link.figure_id
        )
        assert alternatives
        assert all(0 < one["confidence"] <= 1 for one in alternatives)

    async def test_the_diff_says_what_moved_and_what_went_stale(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)

        repository = TieOutRepository.from_session(session)
        model = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.model
        )
        # A first version has nothing behind it, which is not an error.
        assert (
            await tieout.model_diff(session, dossier_id=deal.id, artifact_id=model.id)
            is None
        )

        await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=ArtifactKind.model,
            filename=MODEL.name,
            payload=MODEL.read_bytes(),
            user_id=user.id,
        )
        second = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.model
        )
        diff = await tieout.model_diff(
            session, dossier_id=deal.id, artifact_id=second.id
        )
        assert diff is not None
        assert diff["from_version"] == 1
        assert diff["to_version"] == 2
        # The same file uploaded twice moved nothing.
        assert diff["changed"] == []

    async def test_findings_are_counted_by_state_not_summed(
        self, session: AsyncSession, save_fixture: SaveFixture, user: User
    ) -> None:
        deal = await _deal(session, save_fixture, user)
        await _load(session, deal, user)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)

        repository = TieOutRepository.from_session(session)
        counts = await repository.count_findings(deal.id)
        assert counts["open"] == 8
        assert counts["dismissed"] == 0

        finding = (await repository.findings_of(deal.id))[0]
        await repository.set_finding_state(
            finding, state=FindingState.dismissed, user_id=user.id
        )
        counts = await repository.count_findings(deal.id)
        assert counts["open"] == 7
        assert counts["dismissed"] == 1


class TestGroundingCandidates:
    def test_a_column_that_counts_its_own_rows_is_not_a_source_figure(self) -> None:
        """Found on the first real pair the grounding leg ever saw.

        An NHS lookup sheet counts `1, 2, 3 …` down column A and names the
        staff group in column B, so `A10` is *called* « Support to clinical
        staff » and *holds* the number ten. « 13,686 FTE are Support to
        clinical staff » matched it, and the difference was then reported as
        the document contradicting the model.
        """
        import io

        import openpyxl

        from polar.tieout.provenance import _counting_columns, inputs_from_workbook
        from polar.tieout.workbook import read_workbook

        book = openpyxl.Workbook()
        sheet = book.active
        sheet.title = "Controls"
        groups = [
            "Total",
            "All HCHS doctors",
            "Consultants",
            "Doctors in training",
            "Support to clinical staff",
            "NHS infrastructure support",
        ]
        for index, name in enumerate(groups, start=1):
            sheet.cell(index, 1).value = index
            sheet.cell(index, 2).value = name
            sheet.cell(index, 3).value = 1000 * index

        payload = io.BytesIO()
        book.save(payload)
        path = "/tmp/claude-0/_counting.xlsx"
        with open(path, "wb") as handle:
            handle.write(payload.getvalue())

        read = read_workbook(path)
        assert ("Controls", 1) in _counting_columns(read)
        refs = {one.ref for one in inputs_from_workbook(read)}
        assert not any(ref.startswith("Controls!A") for ref in refs)
        # The data column beside it is untouched.
        assert any(ref.startswith("Controls!C") for ref in refs)

    def test_a_column_of_years_is_not_an_index(self) -> None:
        """Years ascend by one too. Suppressing them would take a model's
        period headers out of the grounding set, so both tests a counting
        column has to pass are about position: the value is the row it sits
        on, or the values start at one."""
        import io

        import openpyxl

        from polar.tieout.provenance import _counting_columns
        from polar.tieout.workbook import read_workbook

        book = openpyxl.Workbook()
        sheet = book.active
        sheet.title = "Model"
        for index, year in enumerate([2021, 2022, 2023, 2024, 2025, 2026], start=1):
            sheet.cell(index, 1).value = f"Row {index}"
            sheet.cell(index, 2).value = year

        payload = io.BytesIO()
        book.save(payload)
        path = "/tmp/claude-0/_years.xlsx"
        with open(path, "wb") as handle:
            handle.write(payload.getvalue())

        assert _counting_columns(read_workbook(path)) == set()
