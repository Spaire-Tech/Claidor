"""Reading a source document, and grounding the model in it.

The chain's last hop. Everything else in this suite asks whether two
documents the deal team produced agree with each other; this asks the
question underneath all of them — the model says revenue was 228.9, *says
who* — and the answer is a page in a PDF somebody else wrote.

The fixtures are built from the model at build time
(`scripts/cascade/build_source_fixture.py`), so a figure that disagrees
here disagrees because the accounts were restated and not because somebody
mistyped a test.
"""

from decimal import Decimal
from pathlib import Path

import pytest
from httpx import AsyncClient

from polar.kit.db.postgres import AsyncSession
from polar.models import (
    ArtifactKind,
    CheckKind,
    Dossier,
    DossierMember,
    DossierRole,
    FindingKind,
    User,
)
from polar.tieout.figures import figures_in
from polar.tieout.ingest import Unreadable, kind_for, read_artifact
from polar.tieout.provenance import inputs_from_workbook
from polar.tieout.repository import TieOutRepository
from polar.tieout.service import tieout
from polar.tieout.source import NotAPdf, read_pages, read_source, read_source_bytes
from polar.tieout.workbook import read_workbook
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
ACCOUNTS = CASCADE / "cascade_accounts.pdf"
RESTATED = CASCADE / "cascade_accounts_restated.pdf"
MODEL = CASCADE / "cascade_model.xlsx"
DECK = CASCADE / "cascade_deck.pptx"


# --- reading -------------------------------------------------------------


@pytest.fixture(scope="module")
def figures() -> list:
    return read_source(str(ACCOUNTS)).figures


def test_every_figure_knows_its_page(figures: list) -> None:
    """« p.42 » is what makes a grounded figure checkable by a person."""
    assert figures
    assert all(one.slide >= 1 for one in figures)
    assert {one.location for one in figures} == {"page 2", "page 3"}


def test_a_figure_is_named_by_the_words_in_front_of_it(figures: list) -> None:
    named = {one.printed: one.label for one in figures}
    assert "Revenue" in named["$228.9m"]
    assert "Total debt" in named["$96.4m"]


def test_a_calendar_year_is_read_as_the_period_it_is(figures: list) -> None:
    """Accounts say « the year ended 31 December 2025 »; a model says
    « FY2025A ». Without the translation the three revenue notes fit three
    revenue cells equally well and all three are refused as ambiguous —
    the right answer to the wrong question."""
    revenue = {one.printed: one.label for one in figures if "Revenue" in one.label}
    assert "FY2023A" in revenue["$182.4m"]
    assert "FY2025A" in revenue["$228.9m"]


def test_a_cost_in_brackets_is_not_a_negative_claim(figures: list) -> None:
    cost = next(one for one in figures if "Cost of goods sold" in one.label)
    assert cost.parenthesised
    assert cost.printed == "(141.5)"


def test_a_wrapped_sentence_is_put_back_together() -> None:
    """A line break in a PDF is where the type ran out of room.

    Read line by line, the figure below is named « general and
    administrative expenses… » and the words that identify it are on the
    line above.
    """
    found = read_pages(
        [
            "OPERATING EXPENSES\n"
            "Selling, general and administrative expenses for the year\n"
            "ended 31 December 2025 were (32.9).\n"
        ]
    ).figures
    assert len(found) == 1
    # Read line by line this would be « ended 31 December 2025 were », which
    # names nothing and links to nothing. « Selling, » itself is dropped by
    # the clause rule in `prose` — a figure's name never reaches back across
    # a comma — and that rule is the deck's false-positive guard, shared
    # here deliberately rather than relaxed for a document that looks safer.
    assert "administrative expenses" in found[0].label
    assert found[0].context.startswith("Selling")


def test_a_heading_is_not_swept_into_the_line_below() -> None:
    """The join is narrow on purpose: a heading starts with a capital."""
    found = read_pages(["BORROWINGS\nTotal debt was $96.4m.\n"]).figures
    assert found[0].label.startswith("Total debt")
    assert found[0].section == "BORROWINGS"


def test_a_scan_says_it_is_a_scan() -> None:
    """An empty extraction that quietly becomes an empty document is how a
    set of accounts ends up « containing no figures »."""
    from fpdf import FPDF

    blank = FPDF()
    blank.add_page()
    with pytest.raises(NotAPdf, match="no text layer"):
        read_source_bytes(bytes(blank.output()))


def test_something_that_is_not_a_pdf_is_refused() -> None:
    with pytest.raises(NotAPdf):
        read_source_bytes(b"this is not a PDF at all")


def test_ingest_knows_what_a_pdf_is_for() -> None:
    assert kind_for("audited_accounts.pdf") is ArtifactKind.source
    read = read_artifact(ACCOUNTS.read_bytes(), ACCOUNTS.name, ArtifactKind.source)
    assert read.counts["figures"] == len(read.figures)
    assert read.counts["pages_with_figures"] == 2


def test_a_deck_uploaded_as_a_source_is_refused_in_words() -> None:
    with pytest.raises(Unreadable, match="has to be one of"):
        read_artifact(DECK.read_bytes(), DECK.name, ArtifactKind.source)


# --- grounding -----------------------------------------------------------


def test_only_typed_inputs_are_offered_as_an_origin() -> None:
    """A computed cell agreeing with the accounts is arithmetic working,
    not provenance. Grounding one would put the loosest match in this
    product against its largest set of candidates."""
    book = read_workbook(str(MODEL))
    inputs = inputs_from_workbook(book)
    assert inputs
    assert all(book.get(one.ref).formula is None for one in inputs)
    assert len(inputs) < len(book.cells)


def test_the_accounts_ground_the_model_and_agree() -> None:
    from polar.tieout.check import compare
    from polar.tieout.link import link

    book = read_workbook(str(MODEL))
    links, _ = link(read_source(str(ACCOUNTS)).figures, inputs_from_workbook(book))
    grounded = {one.figure.printed: one.output.ref for one in links}

    assert grounded["$228.9m"] == "Model!D6"
    assert grounded["$96.4m"] == "Assumptions!B24"
    contradictions, agreed = compare(links)
    assert len(agreed) == len(links)
    assert contradictions == []


def test_restated_accounts_contradict_the_model() -> None:
    """What actually happens: the auditors restate a figure in the signed
    set and the model, built against the draft, never catches up."""
    from polar.tieout.check import compare
    from polar.tieout.link import link

    book = read_workbook(str(MODEL))
    links, _ = link(read_source(str(RESTATED)).figures, inputs_from_workbook(book))
    contradictions, _ = compare(links)

    against = {one.ref: (one.printed, one.expected) for one in contradictions}
    assert against["Model!D9"] == ("(139.2)", "141.5")
    assert against["Assumptions!B24"] == ("$94.1m", "$96.4m")


# --- through the product -------------------------------------------------


async def _deal_with(
    session: AsyncSession,
    save_fixture: SaveFixture,
    owner: User,
    accounts: Path,
) -> Dossier:
    organization = await create_organization(save_fixture)
    deal = Dossier(
        organization_id=organization.id,
        name="Project Cascade",
        client_name="Cascade Industrial Holdings",
        created_by_id=owner.id,
    )
    session.add(deal)
    await session.flush()
    session.add(
        DossierMember(dossier_id=deal.id, user_id=owner.id, role=DossierRole.lead)
    )
    await session.flush()

    for path, kind in (
        (MODEL, ArtifactKind.model),
        (DECK, ArtifactKind.deck),
        (accounts, ArtifactKind.source),
    ):
        await tieout.ingest(
            session,
            dossier_id=deal.id,
            kind=kind,
            filename=path.name,
            payload=path.read_bytes(),
            user_id=owner.id,
        )
    await session.flush()
    return deal


@pytest.mark.asyncio
class TestTheCrosscheck:
    @pytest.mark.auth
    async def test_a_deal_with_no_source_says_so_rather_than_failing(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        organization = await create_organization(save_fixture)
        deal = Dossier(
            organization_id=organization.id,
            name="Project Calder",
            created_by_id=user.id,
        )
        session.add(deal)
        await session.flush()
        session.add(
            DossierMember(dossier_id=deal.id, user_id=user.id, role=DossierRole.lead)
        )
        await session.flush()

        run = await tieout.run_crosscheck(session, dossier_id=deal.id, user_id=user.id)
        assert run.error is not None
        # A state of the deal, in words, with what a source document is.
        assert "no model" in run.error or "no source document" in run.error

    @pytest.mark.auth
    async def test_the_restated_accounts_produce_contradictions(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _deal_with(session, save_fixture, user, RESTATED)

        run = await tieout.run_crosscheck(session, dossier_id=deal.id, user_id=user.id)
        await session.flush()

        assert run.summary["grounded"] == 8
        assert run.summary["contradicting"] == 2

        found = (
            await client.get(
                f"/v1/tieout/deals/{deal.id}/findings",
                params={"kind": "contradiction"},
            )
        ).json()
        assert len(found) == 2
        # The finding is on the *source*, because page 2 of the accounts is
        # where a reader has to go to settle it.
        assert all(one["where"]["filename"].endswith(".pdf") for one in found)
        assert {one["printed"] for one in found} == {"(139.2)", "$94.1m"}

    @pytest.mark.auth
    async def test_the_crosscheck_does_not_undo_the_tie_out(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """Both checkers propose links into one table, and the second to
        run must not delete the first's — a defect that would look like a
        flaky linker for a week."""
        deal = await _deal_with(session, save_fixture, user, ACCOUNTS)
        await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)
        await session.flush()
        repository = TieOutRepository.from_session(session)
        from_deck = len(await repository.links_of(deal.id))
        assert from_deck > 0

        await tieout.run_crosscheck(session, dossier_id=deal.id, user_id=user.id)
        await session.flush()

        after = await repository.links_of(deal.id)
        assert len(after) == from_deck + 8

    @pytest.mark.auth
    async def test_a_cells_chain_reaches_the_page_it_came_from(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """The whole of phase 7 in one assertion.

        « Where did Model!D6 come from » stopped at « somebody typed it ».
        It now ends at the document and the page — « cascade_accounts.pdf ·
        page 2 » — which is the step the design draws and the first answer
        this product has ever given that leaves the deal's own arithmetic.
        """
        deal = await _deal_with(session, save_fixture, user, ACCOUNTS)
        await tieout.run_crosscheck(session, dossier_id=deal.id, user_id=user.id)
        await session.flush()
        repository = TieOutRepository.from_session(session)
        model = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.model
        )

        steps = (
            await client.get(
                f"/v1/tieout/artifacts/{model.id}/chain", params={"ref": "Model!D6"}
            )
        ).json()

        last = steps[-1]
        assert last["kind"] == "source"
        assert last["label"] == "cascade_accounts.pdf · page 2"
        assert last["printed"] == "$228.9m"
        # Nobody has confirmed it, and the step says so rather than
        # presenting a proposal as provenance.
        assert "proposed" in last["note"]

    @pytest.mark.auth
    async def test_a_contradiction_carries_the_chain_it_disagrees_with(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _deal_with(session, save_fixture, user, RESTATED)
        await tieout.run_crosscheck(session, dossier_id=deal.id, user_id=user.id)
        await session.flush()

        repository = TieOutRepository.from_session(session)
        finding = next(
            one
            for one in await repository.findings_of(
                deal.id, kind=FindingKind.contradiction
            )
            if one.printed == "$94.1m"
        )
        chain = (await client.get(f"/v1/tieout/findings/{finding.id}/chain")).json()

        assert chain["steps"][0]["ref"] == "Assumptions!B24"
        assert chain["steps"][0]["value"] == "96.4"
        # The model's side of the disagreement, ending at the page the
        # other side is printed on.
        assert chain["steps"][-1]["kind"] == "source"
        assert "page 2" in chain["steps"][-1]["label"]

    @pytest.mark.auth
    async def test_a_cell_nobody_grounded_ends_where_it_always_did(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        """No source step is better than a guessed one. Provenance is the
        one claim a banker would repeat to a client without checking."""
        deal = await _deal_with(session, save_fixture, user, ACCOUNTS)
        await tieout.run_crosscheck(session, dossier_id=deal.id, user_id=user.id)
        await session.flush()
        repository = TieOutRepository.from_session(session)
        model = next(
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.model
        )

        steps = (
            await client.get(
                f"/v1/tieout/artifacts/{model.id}/chain",
                params={"ref": "Assumptions!B19"},
            )
        ).json()

        assert steps[0]["ref"] == "Assumptions!B19"
        assert [one for one in steps if one["kind"] == "source"] == []

    @pytest.mark.auth
    async def test_the_check_route_runs_all_three(
        self,
        client: AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        deal = await _deal_with(session, save_fixture, user, ACCOUNTS)

        response = await client.post(f"/v1/tieout/deals/{deal.id}/check")

        assert response.status_code == 200
        assert {one["kind"] for one in response.json()} == {
            CheckKind.tieout.value,
            CheckKind.audit.value,
            CheckKind.crosscheck.value,
        }


def test_the_fixture_is_built_from_the_model_it_grounds() -> None:
    """A fixture with hand-copied numbers measures the transcription.

    Every figure in the clean accounts is the model's own value, so this
    passing means the two files are still in step — and failing means the
    fixture needs rebuilding, not that the checker is wrong.
    """
    book = read_workbook(str(MODEL))
    for figure in read_source(str(ACCOUNTS)).figures:
        if "Revenue" not in figure.label:
            continue
        assert figure.value in {
            abs(cell.value) for cell in book.cells.values() if cell.value is not None
        }, f"{figure.printed} is not a value in the model"
    assert read_workbook(str(MODEL)).get("Model!D6").value == Decimal("228.9")


# --- what a real annual report does to this reader ----------------------
#
# Every case below is a line taken from Shell plc's Annual Report and
# Accounts 2025 — 461 pages, downloaded from shell.com, written by nobody
# here. The first run of this reader over it produced 8,387 figures, 0
# rejected, and 63% of them named by debris. The Cascade fixture, which I
# generated, produces 8 clean ones. The tests were never going to catch it.


class TestAScaleLetterIsNotTheNextWord:
    def test_a_contents_page_is_not_eighteen_million(self) -> None:
        """« 18 More value » parsed as eighteen million: the number
        *fabricated*, not merely misnamed. 191 of them in one report, and
        the same failure as « 60-70 minutes » becoming $70m."""
        for line in ("18 More value", "25 Market overview", "52 Marketing"):
            assert figures_in(line) == [], line

    def test_a_unit_is_not_a_scale(self) -> None:
        """« 12 m3 per day » is cubic metres. A digit disqualifies a scale
        letter exactly as a letter does."""
        assert figures_in("12 m3 per day") == []
        assert figures_in("a 3 m2 site") == []

    def test_the_spelled_out_scales_are_read(self) -> None:
        """Bounding the suffix would otherwise have *lost* « $1.5 billion »,
        which an annual report writes far more often than « $1.5bn »."""
        assert [
            (one.printed, one.value) for one in figures_in("profit of $1.5 billion")
        ] == [("$1.5 billion", Decimal("1500.0"))]
        assert figures_in("revenue of 18 million")[0].value == Decimal("18")
        assert figures_in("costs of 250 thousand")[0].value == Decimal("0.250")

    def test_bn_with_a_full_stop_is_still_billions(self) -> None:
        """`bn.` was in the pattern and never in the scale table, so
        « $1.5bn. » had always read as 1.5 — a factor of a thousand,
        pre-existing, found while fixing something else."""
        assert figures_in("$1.5bn. of debt")[0].value == Decimal("1500.0")


class TestABracketBelongsToTheFigureThatOpenedIt:
    def test_a_footnote_bracket_is_not_part_of_the_number(self) -> None:
        """« $16.5) [A] » printed a value the document does not contain.
        291 of them in one report."""
        found = figures_in("net income $16.5) [A]")
        assert [one.printed for one in found] == ["$16.5"]
        assert found[0].parenthesised is False

    def test_a_real_negative_keeps_both_brackets(self) -> None:
        found = figures_in("total debt of (96.4)")
        assert found[0].printed == "(96.4)"
        assert found[0].parenthesised is True


class TestAFigureWithNoWordsInFrontOfIt:
    def test_only_the_columns_with_nothing_in_front_of_them(self) -> None:
        """A statement row keeps its first figure and loses the rest.

        « Future cash inflows 27,361 105,021 53,210 13,059 » names one
        number — the line item is in front of it — and the other three
        have only the previous number in front of them. Those can never
        link, because there is nothing to match on, so they are counted
        and dropped while the named one survives.

        Which is the right shape: the row is not thrown away, it is read
        as the one claim it can actually be read as.
        """
        extraction = read_pages(["Future cash inflows 27,361 105,021 53,210 13,059"])
        assert [one.printed for one in extraction.figures] == ["27,361"]
        assert extraction.figures[0].label == "Future cash inflows"
        assert extraction.rejected == 3

    def test_a_one_word_label_is_enough(self) -> None:
        """« Revenue » names a line item. The rule is a real word, not
        several — being stricter would cost the figures this reader is for."""
        found = read_pages(["Revenue of $228.9m in the year"]).figures
        assert [one.printed for one in found] == ["$228.9m"]


class TestTheSameSentenceTwice:
    def test_a_non_breaking_space_does_not_make_a_second_claim(self) -> None:
        """A real report carries a visible text layer and an accessibility
        one. Read as written, one claim became two figures."""
        page = (
            "Adjusted earnings were $18.1 billion\n"
            "Adjusted\xa0earnings\xa0were\xa0$18.1\xa0billion"
        )
        assert len(read_pages([page]).figures) == 1
