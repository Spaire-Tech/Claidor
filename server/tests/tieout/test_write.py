"""Writing a correction into the real Cascade files, and reading it back.

Every test here writes a document and then puts the result through the
*reader* — the same reader ingest uses — rather than asserting about XML.
A correction is only worth anything if the thing that reads a deck sees it,
and a test that checks the bytes can pass while the slide still shows the
old number.

The refusals matter as much as the writes. `CannotWrite` is the difference
between a tool that corrects a deck and a tool that corrupts one, and every
case below that expects it is a case where a search-and-replace would have
cheerfully written something.
"""

import zipfile
from io import BytesIO
from pathlib import Path

import pytest
from pptx import Presentation

from polar.redline.ooxml import Package
from polar.tieout.deck import read_deck
from polar.tieout.memo import read_memo_text
from polar.tieout.write import (
    CannotWrite,
    Edit,
    replacement_for,
    write_deck,
    write_memo,
)

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
DECK = CASCADE / "cascade_deck.pptx"
MEMO = CASCADE / "cascade_memo.docx"


@pytest.fixture(scope="module")
def deck() -> bytes:
    return DECK.read_bytes()


@pytest.fixture(scope="module")
def memo() -> bytes:
    return MEMO.read_bytes()


def figures_of(payload: bytes) -> list:
    """Read a written deck the way ingest reads an uploaded one."""
    with BytesIO(payload) as buffer:
        buffer.seek(0)
        path = CASCADE / ".written.pptx"
        path.write_bytes(payload)
        try:
            return read_deck(str(path)).figures
        finally:
            path.unlink(missing_ok=True)


def find(figures: list, slide: int, printed: str) -> object | None:
    return next(
        (one for one in figures if one.slide == slide and one.printed == printed),
        None,
    )


def anchor_of(figures: list, slide: int, printed: str, context: str = "") -> dict:
    for figure in figures:
        if figure.slide == slide and figure.printed == printed:
            if not context or context in figure.context:
                return figure.anchor
    raise AssertionError(f"no {printed} on slide {slide}")


# --- text ----------------------------------------------------------------


def test_a_figure_in_a_text_box_is_replaced_and_reads_back(deck: bytes) -> None:
    original = read_deck(str(DECK)).figures
    written = write_deck(
        deck,
        [
            Edit(
                page=2,
                anchor=anchor_of(original, 2, "$228.9mm"),
                before="$228.9mm",
                after="$230.4mm",
            )
        ],
    )

    figures = figures_of(written)
    assert find(figures, 2, "$228.9mm") is None
    corrected = find(figures, 2, "$230.4mm")
    assert corrected is not None
    #: The label has to survive: a correction that changes what the figure
    #: is *called* has changed the deck's meaning, not its arithmetic.
    assert corrected.label == "FY2025A revenue"


def test_two_figures_on_one_line_are_both_written(deck: bytes) -> None:
    """« Adjusted EBITDA of $48.9mm … reflects $7.7mm of add-backs ».

    The second offset is measured against the line as it was read, so the
    two edits have to be applied back to front or the first one moves the
    second. Both are checked, so getting it wrong raises rather than
    writing in the wrong place — which is why this test asserts on the
    result and not on the order.
    """
    original = read_deck(str(DECK)).figures
    line = "Adjusted EBITDA of"
    written = write_deck(
        deck,
        [
            Edit(
                page=2,
                anchor=anchor_of(original, 2, "$48.9mm", line),
                before="$48.9mm",
                after="$50.1mm",
            ),
            Edit(
                page=2,
                anchor=anchor_of(original, 2, "$7.7mm", "add-backs"),
                before="$7.7mm",
                after="$8.9mm",
            ),
        ],
    )

    figures = figures_of(written)
    contexts = [one.context for one in figures if one.slide == 2]
    assert any("$50.1mm" in one and "$8.9mm" in one for one in contexts)


def test_a_figure_split_across_two_runs_keeps_the_rest_of_the_line(
    deck: bytes,
) -> None:
    """The case `writing-pptx.md` says will appear the first time we write.

    `python-pptx` flattens runs on the way out, so a figure stored as
    `$48.` and `9mm` has looked like one piece of text for the whole life
    of this project. Here it is split on purpose, and the write has to
    land on it anyway and leave the words around it alone.
    """
    split = _split_run(deck, slide=2, shape_id=23, at="$48.9mm", after=4)
    original = read_deck(str(DECK)).figures

    written = write_deck(
        split,
        [
            Edit(
                page=2,
                anchor=anchor_of(original, 2, "$48.9mm", "Adjusted EBITDA of"),
                before="$48.9mm",
                after="$50.1mm",
            )
        ],
    )

    figures = figures_of(written)
    corrected = find(figures, 2, "$50.1mm")
    assert corrected is not None
    assert "reflects $7.7mm of add-backs" in corrected.context
    assert corrected.label == "Process considerations Adjusted EBITDA of"


def test_a_figure_that_has_moved_is_refused(deck: bytes) -> None:
    original = read_deck(str(DECK)).figures
    with pytest.raises(CannotWrite) as refused:
        write_deck(
            deck,
            [
                Edit(
                    page=2,
                    anchor=anchor_of(original, 2, "$228.9mm"),
                    before="$999.9mm",
                    after="$230.4mm",
                )
            ],
        )
    #: Every failure says what a person can do about it.
    assert "$228.9mm" in str(refused.value)
    assert "Upload the deck again" in str(refused.value)


def test_a_slide_that_is_not_there_is_refused(deck: bytes) -> None:
    with pytest.raises(CannotWrite, match="no slide 99"):
        write_deck(
            deck,
            [
                Edit(
                    page=99,
                    anchor={
                        "kind": "text",
                        "shape_id": 6,
                        "paragraph": 0,
                        "start": 0,
                        "end": 8,
                    },
                    before="$228.9mm",
                    after="$230.4mm",
                )
            ],
        )


def test_a_shape_that_is_gone_is_refused(deck: bytes) -> None:
    with pytest.raises(CannotWrite, match="no longer on slide 2"):
        write_deck(
            deck,
            [
                Edit(
                    page=2,
                    anchor={
                        "kind": "text",
                        "shape_id": 9999,
                        "shape_name": "Nothing",
                        "paragraph": 0,
                        "start": 0,
                        "end": 8,
                    },
                    before="$228.9mm",
                    after="$230.4mm",
                )
            ],
        )


def test_nothing_is_written_when_one_edit_of_several_cannot_be(deck: bytes) -> None:
    """All or nothing. A deck where three of four corrections landed is a
    deck nobody can describe."""
    original = read_deck(str(DECK)).figures
    with pytest.raises(CannotWrite):
        write_deck(
            deck,
            [
                Edit(
                    page=2,
                    anchor=anchor_of(original, 2, "$228.9mm"),
                    before="$228.9mm",
                    after="$230.4mm",
                ),
                Edit(
                    page=2,
                    anchor=anchor_of(original, 2, "21.4%"),
                    before="99.9%",
                    after="21.6%",
                ),
            ],
        )
    # The file on disk is untouched, which is the point of raising before
    # returning bytes rather than fixing up afterwards.
    assert find(read_deck(str(DECK)).figures, 2, "$228.9mm") is not None


# --- tables --------------------------------------------------------------


def test_a_table_cell_is_replaced(deck: bytes) -> None:
    original = read_deck(str(DECK)).figures
    cell = next(one for one in original if one.anchor.get("kind") == "table")

    written = write_deck(
        deck,
        [
            Edit(
                page=cell.slide,
                anchor=cell.anchor,
                before=cell.printed,
                after="1,234.5",
            )
        ],
    )

    figures = figures_of(written)
    moved = find(figures, cell.slide, "1,234.5")
    assert moved is not None
    assert moved.anchor["row"] == cell.anchor["row"]
    assert moved.anchor["column"] == cell.anchor["column"]
    assert moved.label == cell.label


# --- charts --------------------------------------------------------------


def test_a_chart_point_is_written_to_the_cache_and_the_workbook(
    deck: bytes,
) -> None:
    """The whole of the second hard problem, in one assertion each.

    43.0 on the FY2024A adjusted EBITDA series is the value the Cascade
    chart carries and the model does not — it says 39.6. Correcting it has
    to change what PowerPoint draws *and* what opens under « Edit data »,
    or the file disagrees with itself the moment anyone looks.
    """
    original = read_deck(str(DECK)).figures
    written = write_deck(
        deck,
        [
            Edit(
                page=3,
                anchor=anchor_of(original, 3, "43.0"),
                before="43.0",
                after="39.6",
            )
        ],
    )

    # The cache: what the slide draws, and what the reader reads.
    figures = figures_of(written)
    assert find(figures, 3, "43.0") is None
    corrected = find(figures, 3, "39.6")
    assert corrected is not None
    assert corrected.label == "Adjusted EBITDA FY2024A"

    # The embedded workbook: what opens when somebody clicks « Edit data ».
    assert _embedded_values(written, "Adjusted EBITDA") == ["37.8", "39.6", "48.9"]


def test_a_chart_series_that_is_gone_is_refused(deck: bytes) -> None:
    with pytest.raises(CannotWrite, match="no longer has a series"):
        write_deck(
            deck,
            [
                Edit(
                    page=3,
                    anchor={
                        "kind": "chart",
                        "shape_id": 4,
                        # Slide 3's chart and its table both call themselves
                        # shape 4, so the name is what tells them apart.
                        "shape_name": "Chart 0",
                        "series": "Nothing anybody plotted",
                        "point": 1,
                    },
                    before="43.0",
                    after="39.6",
                )
            ],
        )


def test_a_chart_point_that_has_moved_is_refused(deck: bytes) -> None:
    original = read_deck(str(DECK)).figures
    with pytest.raises(CannotWrite, match="now reads"):
        write_deck(
            deck,
            [
                Edit(
                    page=3,
                    anchor=anchor_of(original, 3, "43.0"),
                    before="41.1",
                    after="39.6",
                )
            ],
        )


# --- the memo ------------------------------------------------------------


def test_a_memo_figure_becomes_a_tracked_change(memo: bytes) -> None:
    reading = Package.open(memo).read()
    original = read_memo_text(reading.text).figures
    figure = next(one for one in original if one.printed == "$228.9mm")

    written = write_memo(
        memo,
        [
            Edit(
                page=0,
                anchor=figure.anchor,
                before="$228.9mm",
                after="$230.4mm",
            )
        ],
    )

    document = Package.open(written).document
    assert b"<w:ins " in document
    assert b"<w:del " in document
    assert b"$230.4mm" in document

    # Word shows both sides until somebody accepts or rejects. The reader
    # reads `w:t` and not `w:delText`, so it sees the document as it will
    # read once the change is taken — which is the right reading for a
    # checker: the claim the memo is about to make. The old figure is still
    # in the file, and rejecting it in Word puts it back.
    text = Package.open(written).read().text
    assert "$230.4mm" in text
    assert "$228.9mm" not in text


def test_a_memo_figure_that_has_changed_is_refused(memo: bytes) -> None:
    reading = Package.open(memo).read()
    figure = next(
        one for one in read_memo_text(reading.text).figures if one.printed == "$228.9mm"
    )
    with pytest.raises(CannotWrite, match="Upload it again"):
        write_memo(
            memo,
            [Edit(page=0, anchor=figure.anchor, before="$111.1mm", after="$230.4mm")],
        )


# --- what to write -------------------------------------------------------


def test_a_parenthesised_figure_keeps_its_parentheses() -> None:
    """« Less: total debt (96.4) » against a model holding +96.4.

    The comparison takes both sides in absolute value, because parentheses
    in a bridge mean « subtracted here » rather than « negative ». So the
    expected string arrives without them, and writing it as it stands would
    turn a subtraction into an addition.
    """
    assert replacement_for("(96.4)", "94.1") == "(94.1)"
    assert replacement_for("(96.4)", "(94.1)") == "(94.1)"
    assert replacement_for("$48.9mm", "$41.2mm") == "$41.2mm"


# --- helpers -------------------------------------------------------------


def _split_run(
    payload: bytes, *, slide: int, shape_id: int, at: str, after: int
) -> bytes:
    """The same deck with one figure broken across two runs.

    Exactly what a spell-check boundary or a three-versions-ago edit does,
    and what no file we have ever read has done.
    """
    presentation = Presentation(BytesIO(payload))
    shape = next(
        one for one in presentation.slides[slide - 1].shapes if one.shape_id == shape_id
    )
    for paragraph in shape.text_frame.paragraphs:
        for run in paragraph.runs:
            index = run.text.find(at)
            if index < 0:
                continue
            head = run.text[: index + after]
            tail = run.text[index + after :]
            run.text = head
            copy = paragraph.add_run()
            copy.text = tail
            # `add_run` appends at the end of the paragraph; the split has
            # to sit immediately after the run it came out of.
            run._r.addnext(copy._r)
            buffer = BytesIO()
            presentation.save(buffer)
            return buffer.getvalue()
    raise AssertionError(f"no run holding {at}")


def _embedded_values(payload: bytes, series: str) -> list[str]:
    """The column of the chart's own workbook that holds a series.

    Read out of the `.xlsx` inside the `.pptx` by hand, because the point
    of the test is that the two halves agree and reading both through the
    same library would not show it.
    """
    with zipfile.ZipFile(BytesIO(payload)) as package:
        name = next(
            one for one in package.namelist() if one.startswith("ppt/embeddings/")
        )
        with zipfile.ZipFile(BytesIO(package.read(name))) as workbook:
            sheet = workbook.read("xl/worksheets/sheet1.xml").decode()
            strings = workbook.read("xl/sharedStrings.xml").decode()

    import re

    shared = re.findall(r"<t[^>]*>(.*?)</t>", strings)
    column = None
    for found in re.finditer(r'<c r="([A-Z]+)1" t="s"><v>(\d+)</v></c>', sheet):
        if shared[int(found.group(2))] == series:
            column = found.group(1)
    assert column, f"no column headed {series}"
    return re.findall(
        rf'<c r="{column}\d+"><v>(.*?)</v></c>',
        sheet,
    )
